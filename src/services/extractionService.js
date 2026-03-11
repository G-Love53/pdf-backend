import { getPool } from "../db.js";
import { getObjectStream } from "./r2Service.js";
import buildBarExtractionPrompt from "../prompts/extraction/bar.js";

const pool = getPool();

async function bufferFromStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function resolvePromptBuilder(segment) {
  const seg = String(segment || "bar").toLowerCase();
  if (seg === "bar") return buildBarExtractionPrompt;
  return buildBarExtractionPrompt;
}

async function callClaude(promptConfig) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(promptConfig),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const textPart = (data.content || []).find((c) => c.type === "text");
  if (!textPart || !textPart.text) {
    throw new Error("Claude response missing text content");
  }

  let parsed;
  try {
    parsed = JSON.parse(textPart.text);
  } catch (err) {
    throw new Error("Failed to parse Claude JSON response");
  }

  return parsed;
}

export async function runExtractionForWorkItem(workQueueItemId) {
  if (!pool) {
    throw new Error("database_not_configured");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookup = await client.query(
      `
        SELECT
          wqi.work_queue_item_id,
          q.quote_id,
          q.segment,
          d.document_id,
          d.storage_path
        FROM work_queue_items wqi
        JOIN quotes q
          ON wqi.related_entity_type = 'quote'
         AND wqi.related_entity_id = q.quote_id
        JOIN documents d
          ON d.quote_id = q.quote_id
         AND d.document_role = 'carrier_quote_original'
         AND d.document_type = 'pdf'
        WHERE wqi.work_queue_item_id = $1
          AND wqi.queue_type = 'extraction_review'
      `,
      [workQueueItemId],
    );

    if (lookup.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("work_queue_item_not_found");
    }

    const row = lookup.rows[0];

    const stream = await getObjectStream(row.storage_path);
    const buffer = await bufferFromStream(stream);
    const pdfBase64 = buffer.toString("base64");

    const buildPrompt = resolvePromptBuilder(row.segment);
    const promptConfig = buildPrompt(pdfBase64);
    const aiResult = await callClaude(promptConfig);

    const extractedData = aiResult.extracted_data || {};
    const confidenceScores = aiResult.confidence_scores || {};

    const overallConfidence =
      typeof confidenceScores.annual_premium === "number"
        ? confidenceScores.annual_premium
        : null;

    const insertRes = await client.query(
      `
        INSERT INTO quote_extractions (
          quote_id,
          source_document_id,
          model_name,
          model_version,
          raw_extraction_json,
          normalized_json,
          overall_confidence,
          review_status,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', TRUE)
        RETURNING quote_extraction_id
      `,
      [
        row.quote_id,
        row.document_id,
        promptConfig.model,
        null,
        aiResult,
        extractedData,
        overallConfidence,
      ],
    );

    const extractionId = insertRes.rows[0].quote_extraction_id;

    await client.query(
      `
        UPDATE quotes
        SET extraction_confidence = $2,
            updated_at = NOW()
        WHERE quote_id = $1
      `,
      [row.quote_id, overallConfidence],
    );

    await client.query("COMMIT");

    return {
      extracted_data: extractedData,
      confidence_scores: confidenceScores,
      quote_extraction_id: extractionId,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmExtractionForWorkItem(workQueueItemId, { extractedData, agentId }) {
  if (!pool) {
    throw new Error("database_not_configured");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookup = await client.query(
      `
        SELECT
          wqi.work_queue_item_id,
          q.quote_id,
          q.submission_id
        FROM work_queue_items wqi
        JOIN quotes q
          ON wqi.related_entity_type = 'quote'
         AND wqi.related_entity_id = q.quote_id
        WHERE wqi.work_queue_item_id = $1
          AND wqi.queue_type = 'extraction_review'
      `,
      [workQueueItemId],
    );

    if (lookup.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("work_queue_item_not_found");
    }

    const row = lookup.rows[0];

    const activeRes = await client.query(
      `
        SELECT quote_extraction_id
        FROM quote_extractions
        WHERE quote_id = $1
          AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [row.quote_id],
    );

    let extractionId = activeRes.rows[0]?.quote_extraction_id || null;

    if (!extractionId) {
      const stub = await client.query(
        `
          INSERT INTO quote_extractions (
            quote_id,
            source_document_id,
            model_name,
            model_version,
            raw_extraction_json,
            normalized_json,
            overall_confidence,
            review_status,
            is_active
          )
          VALUES ($1, NULL, 'manual', NULL, $2, $3, NULL, 'pending', TRUE)
          RETURNING quote_extraction_id
        `,
        [row.quote_id, extractedData, extractedData],
      );
      extractionId = stub.rows[0].quote_extraction_id;
    }

    await client.query(
      `
        UPDATE quote_extractions
        SET reviewed_json = $2,
            review_status = 'approved',
            reviewed_by = $3,
            reviewed_at = NOW(),
            is_active = TRUE
        WHERE quote_extraction_id = $1
      `,
      [extractionId, extractedData, agentId],
    );

    await client.query(
      `
        UPDATE quotes
        SET status = 'needs_review',
            packet_ready = FALSE,
            updated_at = NOW()
        WHERE quote_id = $1
      `,
      [row.quote_id],
    );

    await client.query(
      `
        UPDATE work_queue_items
        SET status = 'resolved',
            resolved_at = NOW(),
            resolved_by = $2
        WHERE work_queue_item_id = $1
      `,
      [workQueueItemId, agentId],
    );

    await client.query(
      `
        INSERT INTO work_queue_items (
          queue_type,
          related_entity_type,
          related_entity_id,
          priority,
          reason_code,
          reason_detail,
          status
        )
        VALUES (
          'packet_review',
          'quote',
          $1,
          3,
          'packet_build_required',
          'Quote extraction reviewed and approved. Ready for packet build.',
          'open'
        )
        RETURNING work_queue_item_id
      `,
      [row.quote_id],
    );

    await client.query(
      `
        INSERT INTO timeline_events (
          submission_id,
          quote_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        row.submission_id,
        row.quote_id,
        "extraction.reviewed",
        "Extraction reviewed and approved by agent",
        { agent_id: agentId },
        "agent",
      ],
    );

    await client.query("COMMIT");

    return {
      success: true,
      quote_id: row.quote_id,
      message: "Extraction confirmed. Packet build queued.",
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function skipWorkItem(workQueueItemId, { reason, agentId }) {
  if (!pool) {
    throw new Error("database_not_configured");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookup = await client.query(
      `
        SELECT
          wqi.work_queue_item_id,
          q.quote_id,
          q.submission_id
        FROM work_queue_items wqi
        JOIN quotes q
          ON wqi.related_entity_type = 'quote'
         AND wqi.related_entity_id = q.quote_id
        WHERE wqi.work_queue_item_id = $1
          AND wqi.queue_type = 'extraction_review'
      `,
      [workQueueItemId],
    );

    if (lookup.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("work_queue_item_not_found");
    }

    const row = lookup.rows[0];

    await client.query(
      `
        UPDATE work_queue_items
        SET status = 'dismissed',
            reason_detail = $2,
            resolved_at = NOW(),
            resolved_by = $3
        WHERE work_queue_item_id = $1
      `,
      [workQueueItemId, reason, agentId],
    );

    await client.query(
      `
        UPDATE quotes
        SET status = 'declined',
            updated_at = NOW()
        WHERE quote_id = $1
      `,
      [row.quote_id],
    );

    await client.query(
      `
        INSERT INTO timeline_events (
          submission_id,
          quote_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        row.submission_id,
        row.quote_id,
        "extraction.skipped",
        "Extraction review skipped / flagged by agent",
        { reason, agent_id: agentId },
        "agent",
      ],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

