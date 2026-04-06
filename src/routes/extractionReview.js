import express from "express";
import { getPool } from "../db.js";
import { documentDownloadPath } from "../services/r2Service.js";
import { runExtractionForWorkItem, confirmExtractionForWorkItem, skipWorkItem } from "../services/extractionService.js";
import { orderByPrimaryCarrierPdf } from "../utils/carrierPdfPrimaryOrder.js";

const router = express.Router();
const pool = getPool();

function mapQueueRowToResponse(row) {
  return {
    work_queue_item_id: row.work_queue_item_id,
    quote_id: row.quote_id,
    submission_public_id: row.submission_public_id,
    client_name: row.client_name,
    segment: row.segment,
    carrier_name: row.carrier_name,
    carrier_email_from: row.carrier_email_from,
    email_received_at: row.email_received_at,
    pdf_r2_key: row.pdf_r2_key,
    match_confidence: row.match_confidence_label,
    extracted_data: row.extracted_data || null,
    created_at: row.created_at,
  };
}

router.get("/api/queue/extraction-review", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { segment, sort } = req.query || {};
  const sortDirection = sort === "newest_first" ? "DESC" : "ASC";

  try {
    const params = [];
    let whereSegment = "";

    if (segment) {
      params.push(segment);
      whereSegment = `AND s.segment = $${params.length}::segment_type`;
    }

    const sql = `
      SELECT
        wqi.work_queue_item_id,
        wqi.created_at,
        q.quote_id,
        q.match_confidence,
        CASE
          WHEN q.match_confidence >= 0.95 THEN 'exact'
          WHEN q.match_confidence >= 0.7 THEN 'fuzzy'
          ELSE 'no_match'
        END AS match_confidence_label,
        q_ex.reviewed_json AS extracted_data,
        s.submission_public_id,
        s.segment,
        COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
        cm.carrier_name,
        cm.from_email AS carrier_email_from,
        cm.received_at AS email_received_at,
        d.storage_path AS pdf_r2_key
      FROM work_queue_items wqi
      JOIN quotes q
        ON wqi.related_entity_type = 'quote'
       AND wqi.related_entity_id = q.quote_id
      JOIN submissions s
        ON q.submission_id = s.submission_id
      LEFT JOIN businesses b
        ON s.business_id = b.business_id
      LEFT JOIN clients c
        ON s.client_id = c.client_id
      LEFT JOIN carrier_messages cm
        ON q.carrier_message_id = cm.carrier_message_id
      LEFT JOIN documents d
        ON d.quote_id = q.quote_id
       AND d.document_role = 'carrier_quote_original'
       AND d.document_type = 'pdf'
      LEFT JOIN LATERAL (
        SELECT reviewed_json
        FROM quote_extractions qe
        WHERE qe.quote_id = q.quote_id
          AND qe.is_active = TRUE
        ORDER BY qe.created_at DESC
        LIMIT 1
      ) AS q_ex ON TRUE
      WHERE wqi.queue_type = 'extraction_review'
        AND wqi.status = 'open'
        ${whereSegment}
      ORDER BY wqi.created_at ${sortDirection};
    `;

    const result = await pool.query(sql, params);
    const items = result.rows.map(mapQueueRowToResponse);

    res.json({
      items,
      count: items.length,
    });
  } catch (err) {
    console.error("[extractionReview] list error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/api/queue/extraction-review/:workQueueItemId", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { workQueueItemId } = req.params;

  try {
    const mainRes = await pool.query(
      `
        SELECT
          wqi.work_queue_item_id,
          wqi.created_at,
          q.quote_id,
          s.submission_id,
          s.submission_public_id,
          s.segment,
          s.raw_submission_json,
          c.client_id,
          c.first_name,
          c.last_name,
          c.primary_email,
          c.primary_phone,
          cm.carrier_message_id,
          cm.from_email,
          cm.subject,
          cm.received_at,
          cm.body_text,
          q.match_confidence,
          CASE
            WHEN q.match_confidence >= 0.95 THEN 'exact'
            WHEN q.match_confidence >= 0.7 THEN 'fuzzy'
            ELSE 'no_match'
          END AS match_confidence_label,
          d.document_id,
          d.storage_path AS pdf_r2_key,
          q_ex.reviewed_json AS extracted_data,
          q_ex.overall_confidence
        FROM work_queue_items wqi
        JOIN quotes q
          ON wqi.related_entity_type = 'quote'
         AND wqi.related_entity_id = q.quote_id
        JOIN submissions s
          ON q.submission_id = s.submission_id
        LEFT JOIN clients c
          ON s.client_id = c.client_id
        LEFT JOIN carrier_messages cm
          ON q.carrier_message_id = cm.carrier_message_id
        LEFT JOIN documents d
          ON d.quote_id = q.quote_id
         AND d.document_role = 'carrier_quote_original'
         AND d.document_type = 'pdf'
        LEFT JOIN LATERAL (
          SELECT quote_extraction_id,
                 reviewed_json,
                 overall_confidence
          FROM quote_extractions qe
          WHERE qe.quote_id = q.quote_id
            AND qe.is_active = TRUE
          ORDER BY qe.created_at DESC
          LIMIT 1
        ) AS q_ex ON TRUE
        WHERE wqi.work_queue_item_id = $1
          AND wqi.queue_type = 'extraction_review'
      `,
      [workQueueItemId],
    );

    if (mainRes.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    const row = mainRes.rows[0];

    const timelineRes = await pool.query(
      `
        SELECT event_type, event_label, created_at, event_payload_json
        FROM timeline_events
        WHERE submission_id = $1
        ORDER BY created_at ASC
      `,
      [row.submission_id],
    );

    let pdfSignedUrl = row.document_id
      ? documentDownloadPath(row.document_id)
      : null;

    if (!pdfSignedUrl && row.pdf_r2_key) {
      const docIdRes = await pool.query(
        `
          SELECT document_id
          FROM documents
          WHERE storage_path = $1
          LIMIT 1
        `,
        [row.pdf_r2_key],
      );
      if (docIdRes.rows[0]?.document_id) {
        pdfSignedUrl = documentDownloadPath(docIdRes.rows[0].document_id);
      }
    }

    // Fallback: some carrier ingests have documents.quote_id still NULL, so the main
    // JOIN can't find d.storage_path. In that case, try to read the document_ids
    // from the most recent timeline_events.quote.received payload and then resolve
    // storage_path from documents by document_id.
    if (!pdfSignedUrl && row.quote_id) {
      const quoteTimelineRes = await pool.query(
        `
          SELECT event_payload_json
          FROM timeline_events
          WHERE quote_id = $1
            AND event_type = 'quote.received'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [row.quote_id],
      );

      const payload = quoteTimelineRes.rows[0]?.event_payload_json || null;
      const documentIds = Array.isArray(payload?.document_ids)
        ? payload.document_ids
        : [];

      if (documentIds.length > 0) {
        const docRes = await pool.query(
          `
            SELECT document_id
            FROM documents d
            WHERE d.document_id = ANY($1::uuid[])
              AND d.document_role = 'carrier_quote_original'
              AND d.document_type = 'pdf'
            ${orderByPrimaryCarrierPdf("d")}
            LIMIT 1
          `,
          [documentIds],
        );

        const docId = docRes.rows[0]?.document_id || null;
        if (docId) {
          pdfSignedUrl = documentDownloadPath(docId);
        }
      }
    }

    const response = {
      work_queue_item_id: row.work_queue_item_id,
      quote_id: row.quote_id,
      submission_public_id: row.submission_public_id,
      segment: row.segment,
      client: {
        id: row.client_id,
        business_name: null,
        contact_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
        email: row.primary_email,
        phone: row.primary_phone,
      },
      submission: {
        id: row.submission_id,
        submission_public_id: row.submission_public_id,
        submitted_at: null,
        form_data: row.raw_submission_json || {},
      },
      carrier_message: {
        id: row.carrier_message_id,
        from_email: row.from_email,
        subject: row.subject,
        received_at: row.received_at,
        body_preview: row.body_text ? String(row.body_text).slice(0, 240) : "",
      },
      pdf_signed_url: pdfSignedUrl,
      match_confidence: row.match_confidence_label,
      extracted_data: row.extracted_data || null,
      confidence_scores: row.overall_confidence
        ? { overall: Number(row.overall_confidence) }
        : {},
      timeline: timelineRes.rows.map((t) => ({
        event: t.event_type,
        at: t.created_at,
        label: t.event_label,
        payload: t.event_payload_json,
      })),
    };

    res.json(response);
  } catch (err) {
    console.error("[extractionReview] detail error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/api/queue/extraction-review/:workQueueItemId/extract", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { workQueueItemId } = req.params;

  try {
    const result = await runExtractionForWorkItem(workQueueItemId);
    res.json(result);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[extractionReview] extract error:", msg);
    res.status(500).json({
      error: "internal_error",
      message: msg,
    });
  }
});

router.post("/api/queue/extraction-review/:workQueueItemId/confirm", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { workQueueItemId } = req.params;
  const { extracted_data, agent_id } = req.body || {};

  if (!extracted_data || !agent_id) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    const result = await confirmExtractionForWorkItem(workQueueItemId, {
      extractedData: extracted_data,
      agentId: agent_id,
    });
    res.json(result);
  } catch (err) {
    console.error("[extractionReview] confirm error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/api/queue/extraction-review/:workQueueItemId/skip", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { workQueueItemId } = req.params;
  const { reason, agent_id } = req.body || {};

  if (!reason || !agent_id) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    await skipWorkItem(workQueueItemId, { reason, agentId: agent_id });
    res.json({ success: true });
  } catch (err) {
    console.error("[extractionReview] skip error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;

