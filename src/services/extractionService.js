import { getPool } from "../db.js";
import { getObjectStream } from "./r2Service.js";
import buildBarExtractionPrompt from "../prompts/extraction/bar.js";
import buildRooferExtractionPrompt from "../prompts/extraction/roofer.js";
import buildPlumberExtractionPrompt from "../prompts/extraction/plumber.js";
import buildHvacExtractionPrompt from "../prompts/extraction/hvac.js";

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
  if (seg === "roofer") return buildRooferExtractionPrompt;
  if (seg === "plumber") return buildPlumberExtractionPrompt;
  if (seg === "hvac") return buildHvacExtractionPrompt;
  return buildBarExtractionPrompt;
}

async function callClaude(promptConfig) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const fallbackModels = (process.env.ANTHROPIC_MODEL_FALLBACKS
    ? String(process.env.ANTHROPIC_MODEL_FALLBACKS)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [
        // Only include models that support document (PDF base64) inputs.
        // If a particular model isn't available for your account, we'll try the next one.
        "claude-3-5-sonnet-20240620",
        "claude-3-opus-20240229",
      ]
  ).map((m) => String(m));

  const candidates = [
    promptConfig.model,
    ...fallbackModels.filter((m) => m && m !== promptConfig.model),
  ];

  let lastErr = null;
  for (const modelId of candidates) {
    const payload = { ...promptConfig, model: modelId };

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();

        // If model is missing/unavailable, try the next candidate.
        // Anthropic returns 404 "model not found" for unavailable/unauthorized model IDs.
        if (resp.status === 404 && /not_found_error/i.test(text) && /model/i.test(text)) {
          lastErr = new Error(`Claude model not available (${modelId}): ${resp.status} ${text}`);
          continue;
        }

        // Some models don't support PDF/document inputs and return a 400.
        // If we hit that, try the next fallback model.
        if (resp.status === 400 && /does not support pdf input/i.test(text)) {
          lastErr = new Error(
            `Claude model does not support PDF input (${modelId}): ${resp.status} ${text}`,
          );
          continue;
        }

        // Any other failure: surface immediately.
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
    } catch (err) {
      lastErr = err;
      break;
    }
  }

  throw lastErr || new Error("Claude API call failed");
}

export async function runExtractionForWorkItem(workQueueItemId) {
  if (!pool) {
    throw new Error("database_not_configured");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Primary lookup: documents linked to the quote via documents.quote_id
    let lookup = await client.query(
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

    // Fallback: some existing ingests have documents rows with quote_id still NULL.
    // We can still extract by reading document_ids from timeline_events.quote.received payload.
    if (lookup.rows.length === 0) {
      const base = await client.query(
        `
          SELECT
            wqi.work_queue_item_id,
            q.quote_id,
            q.segment
          FROM work_queue_items wqi
          JOIN quotes q
            ON wqi.related_entity_type = 'quote'
           AND wqi.related_entity_id = q.quote_id
          WHERE wqi.work_queue_item_id = $1
            AND wqi.queue_type = 'extraction_review'
        `,
        [workQueueItemId],
      );

      if (base.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new Error("work_queue_item_not_found");
      }

      const baseRow = base.rows[0];

      const timeline = await client.query(
        `
          SELECT event_payload_json
          FROM timeline_events
          WHERE quote_id = $1
            AND event_type = 'quote.received'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [baseRow.quote_id],
      );

      const payload = timeline.rows[0]?.event_payload_json || null;
      const documentIds = payload?.document_ids || [];

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        await client.query("ROLLBACK");
        throw new Error(
          "work_queue_item_no_linked_documents (no document_ids in timeline_events)",
        );
      }

      const docRowRes = await client.query(
        `
          SELECT
            d.document_id,
            d.storage_path
          FROM documents d
          WHERE d.document_id = ANY($1::uuid[])
            AND d.document_role = 'carrier_quote_original'
            AND d.document_type = 'pdf'
          ORDER BY d.created_at DESC
          LIMIT 1
        `,
        [documentIds],
      );

      if (docRowRes.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new Error(
          "work_queue_item_no_matching_documents (document_ids found but no pdf carrier_quote_original)",
        );
      }

      lookup = {
        rows: [
          {
            work_queue_item_id: baseRow.work_queue_item_id,
            quote_id: baseRow.quote_id,
            segment: baseRow.segment,
            document_id: docRowRes.rows[0].document_id,
            storage_path: docRowRes.rows[0].storage_path,
          },
        ],
      };
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

