import cron from "node-cron";
import pdfParse from "pdf-parse";
import { getPool } from "../db.js";
import { getObjectStream } from "../services/r2Service.js";

const INDEXABLE_ROLES = ["policy_original", "declarations_original", "endorsement"];
const MIN_EXTRACTED_TEXT_CHARS = Number(
  process.env.POLICY_INDEXER_MIN_TEXT_CHARS || 180,
);
const DEFAULT_LIMIT = Number(process.env.POLICY_INDEXER_BATCH_SIZE || 25);

function documentPriorityForRole(role) {
  const v = String(role || "").toLowerCase().trim();
  if (v === "endorsement") return 1;
  return 2;
}

function chunkTextByWords(text, options = {}) {
  const perChunk = Math.max(100, Number(options.perChunk) || 500);
  const overlap = Math.max(0, Number(options.overlap) || 50);
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(words.length, start + perChunk);
    const content = words.slice(start, end).join(" ").trim();
    if (content) chunks.push(content);
    if (end >= words.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;
  if (typeof stream.transformToByteArray === "function") {
    const arr = await stream.transformToByteArray();
    return Buffer.from(arr);
  }
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function upsertStatusPlaceholder(client, row, status, reasonText = "") {
  await client.query(
    `
      DELETE FROM policy_document_chunks
      WHERE document_id = $1::uuid
    `,
    [row.document_id],
  );

  await client.query(
    `
      INSERT INTO policy_document_chunks (
        policy_id,
        document_id,
        document_role,
        chunk_index,
        content,
        source_storage_path,
        source_sha256,
        document_priority,
        index_status
      )
      VALUES ($1::uuid, $2::uuid, $3, 0, $4, $5, $6, $7, $8)
      ON CONFLICT (document_id, chunk_index)
      DO UPDATE SET
        policy_id = EXCLUDED.policy_id,
        document_role = EXCLUDED.document_role,
        content = EXCLUDED.content,
        source_storage_path = EXCLUDED.source_storage_path,
        source_sha256 = EXCLUDED.source_sha256,
        document_priority = EXCLUDED.document_priority,
        index_status = EXCLUDED.index_status,
        updated_at = NOW()
    `,
    [
      row.policy_id,
      row.document_id,
      row.document_role,
      reasonText ? reasonText.slice(0, 500) : "",
      row.storage_path || null,
      row.sha256_hash || null,
      documentPriorityForRole(row.document_role),
      status,
    ],
  );
}

async function upsertChunks(client, row, chunks) {
  await client.query(
    `
      DELETE FROM policy_document_chunks
      WHERE document_id = $1::uuid
    `,
    [row.document_id],
  );

  for (let i = 0; i < chunks.length; i += 1) {
    const content = chunks[i];
    await client.query(
      `
        INSERT INTO policy_document_chunks (
          policy_id,
          document_id,
          document_role,
          chunk_index,
          content,
          source_storage_path,
          source_sha256,
          document_priority,
          index_status
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, 'indexed')
        ON CONFLICT (document_id, chunk_index)
        DO UPDATE SET
          policy_id = EXCLUDED.policy_id,
          document_role = EXCLUDED.document_role,
          content = EXCLUDED.content,
          source_storage_path = EXCLUDED.source_storage_path,
          source_sha256 = EXCLUDED.source_sha256,
          document_priority = EXCLUDED.document_priority,
          index_status = EXCLUDED.index_status,
          updated_at = NOW()
      `,
      [
        row.policy_id,
        row.document_id,
        row.document_role,
        i,
        content,
        row.storage_path || null,
        row.sha256_hash || null,
        documentPriorityForRole(row.document_role),
      ],
    );
  }
}

async function fetchCandidateDocuments(pool, { backfill = false, limit = DEFAULT_LIMIT } = {}) {
  if (backfill) {
    const { rows } = await pool.query(
      `
        SELECT
          d.document_id,
          d.policy_id,
          d.document_role::text AS document_role,
          d.storage_path,
          d.sha256_hash,
          d.created_at
        FROM documents d
        WHERE d.policy_id IS NOT NULL
          AND d.storage_path IS NOT NULL
          AND d.document_role::text = ANY($1::text[])
        ORDER BY d.created_at ASC
        LIMIT $2
      `,
      [INDEXABLE_ROLES, limit],
    );
    return rows;
  }

  const { rows } = await pool.query(
    `
      SELECT
        d.document_id,
        d.policy_id,
        d.document_role::text AS document_role,
        d.storage_path,
        d.sha256_hash,
        d.created_at
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT
          MAX(pdc.source_sha256) AS indexed_sha,
          BOOL_OR(pdc.index_status = 'indexed') AS has_indexed
        FROM policy_document_chunks pdc
        WHERE pdc.document_id = d.document_id
      ) idx ON TRUE
      WHERE d.policy_id IS NOT NULL
        AND d.storage_path IS NOT NULL
        AND d.document_role::text = ANY($1::text[])
        AND (
          idx.indexed_sha IS DISTINCT FROM d.sha256_hash
          OR COALESCE(idx.has_indexed, FALSE) = FALSE
        )
      ORDER BY d.created_at ASC
      LIMIT $2
    `,
    [INDEXABLE_ROLES, limit],
  );
  return rows;
}

export async function runPolicyIndexer(options = {}) {
  const backfill = options.backfill === true;
  const pool = getPool();
  if (!pool) {
    console.warn("[policyIndexer] DB not configured; skipping.");
    return;
  }

  const limit = Math.max(1, Number(options.limit) || DEFAULT_LIMIT);
  const docs = await fetchCandidateDocuments(pool, { backfill, limit });
  if (!docs.length) {
    console.log("[policyIndexer] no candidate documents found.");
    return;
  }

  let indexed = 0;
  let failed = 0;
  let scanned = 0;
  let totalChunks = 0;

  for (const row of docs) {
    scanned += 1;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let pdfBuffer;
      try {
        const stream = await getObjectStream(row.storage_path);
        pdfBuffer = await streamToBuffer(stream);
      } catch (err) {
        await upsertStatusPlaceholder(
          client,
          row,
          "download_failed",
          `download_failed: ${String(err?.message || err)}`,
        );
        await client.query("COMMIT");
        failed += 1;
        continue;
      }

      let extractedText = "";
      try {
        const parsed = await pdfParse(pdfBuffer);
        extractedText = String(parsed?.text || "").replace(/\s+/g, " ").trim();
      } catch (err) {
        await upsertStatusPlaceholder(
          client,
          row,
          "parse_failed",
          `parse_failed: ${String(err?.message || err)}`,
        );
        await client.query("COMMIT");
        failed += 1;
        continue;
      }

      if (!extractedText) {
        await upsertStatusPlaceholder(client, row, "empty_text", "No text extracted from PDF");
        await client.query("COMMIT");
        failed += 1;
        continue;
      }

      if (extractedText.length < MIN_EXTRACTED_TEXT_CHARS) {
        await upsertStatusPlaceholder(
          client,
          row,
          "needs_ocr",
          `Extracted text below threshold (${extractedText.length})`,
        );
        await client.query("COMMIT");
        failed += 1;
        continue;
      }

      const chunks = chunkTextByWords(extractedText, {
        perChunk: Number(process.env.POLICY_INDEXER_CHUNK_WORDS || 500),
        overlap: Number(process.env.POLICY_INDEXER_CHUNK_OVERLAP_WORDS || 50),
      });

      if (!chunks.length) {
        await upsertStatusPlaceholder(client, row, "empty_text", "Chunking produced no content");
        await client.query("COMMIT");
        failed += 1;
        continue;
      }

      await upsertChunks(client, row, chunks);
      await client.query("COMMIT");
      indexed += 1;
      totalChunks += chunks.length;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      failed += 1;
      console.error("[policyIndexer] document failed", {
        documentId: row.document_id,
        error: err?.message || err,
      });
    } finally {
      client.release();
    }
  }

  const avgChunks = indexed > 0 ? (totalChunks / indexed).toFixed(2) : "0.00";
  console.log("[policyIndexer] run complete", {
    scanned,
    indexed,
    failed,
    avgChunksPerIndexedDoc: Number(avgChunks),
  });
}

export function startPolicyIndexer() {
  if (process.env.ENABLE_POLICY_INDEXER !== "true") {
    console.log("[policyIndexer] ENABLE_POLICY_INDEXER!=true; indexer not started.");
    return;
  }

  const schedule = process.env.POLICY_INDEXER_CRON || "*/5 * * * *";
  cron.schedule(schedule, async () => {
    try {
      await runPolicyIndexer();
    } catch (err) {
      console.error("[policyIndexer] scheduled run error:", err?.message || err);
    }
  });

  console.log(`[policyIndexer] scheduled with cron "${schedule}"`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const backfill = process.argv.includes("--backfill");
  const limitArgIdx = process.argv.indexOf("--limit");
  const limit =
    limitArgIdx > -1 && process.argv[limitArgIdx + 1]
      ? Number(process.argv[limitArgIdx + 1])
      : undefined;
  runPolicyIndexer({ backfill, limit })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[policyIndexer] fatal:", err);
      process.exit(1);
    });
}
