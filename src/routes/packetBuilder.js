import express from "express";
import { getPool } from "../db.js";
import { buildPacket, persistPacket } from "../services/packetService.js";
import { sendPacketEmail } from "../services/packetEmailService.js";
import { getObjectStream } from "../services/r2Service.js";
import { notifyBarPacketSent } from "../services/agentNotificationService.js";

const router = express.Router();
const pool = getPool();

router.get("/api/quotes/ready-for-packet", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { segment, submission_id } = req.query || {};

  try {
    const params = [];
    let where = `
      qe.is_active = TRUE
      AND qe.review_status = 'approved'
      AND (q.status = 'needs_review' OR q.status = 'sent')
    `;

    if (segment) {
      params.push(segment);
      where += ` AND s.segment = $${params.length}::segment_type`;
    }

    if (submission_id) {
      params.push(submission_id);
      where += ` AND s.submission_id = $${params.length}`;
    }

    const result = await pool.query(
      `
        SELECT
          q.quote_id,
          q.status AS quote_status,
          s.submission_id,
          s.submission_public_id,
          s.segment,
          c.first_name,
          c.last_name,
          c.primary_email AS client_email,
          qe.quote_extraction_id,
          qe.reviewed_json,
          qe.reviewed_at,
          qp.packet_id AS existing_packet_id,
          qp.status AS existing_packet_status,
          qp.sent_at AS existing_packet_sent_at
        FROM quotes q
        JOIN quote_extractions qe
          ON qe.quote_id = q.quote_id
         AND qe.is_active = TRUE
         AND qe.review_status = 'approved'
        JOIN submissions s
          ON q.submission_id = s.submission_id
        JOIN clients c
          ON s.client_id = c.client_id
        LEFT JOIN quote_packets qp
          ON qp.quote_id = q.quote_id
        WHERE ${where}
        ORDER BY s.submission_public_id,
          (
            NULLIF(
              regexp_replace(qe.reviewed_json->>'annual_premium', '[^0-9.]', '', 'g'),
              ''
            )::numeric
          ) NULLS LAST
      `,
      params,
    );

    const items = result.rows.map((row) => {
      const reviewed = row.reviewed_json || {};
      const clientName =
        reviewed.insured_name ||
        reviewed.business_name ||
        `${row.first_name || ""} ${row.last_name || ""}`.trim();

      return {
        quote_id: row.quote_id,
        submission_public_id: row.submission_public_id,
        client_name: clientName || null,
        client_email: row.client_email,
        segment: row.segment,
        carrier_name: reviewed.carrier_name || null,
        policy_type: reviewed.policy_type || null,
        annual_premium: reviewed.annual_premium ?? null,
        effective_date: reviewed.effective_date || null,
        extraction_id: row.quote_extraction_id,
        reviewed_at: row.reviewed_at,
        existing_packet_status: row.existing_packet_status,
      };
    });

    res.json({ items, count: items.length });
  } catch (err) {
    console.error("[packetBuilder] list error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/api/quotes/:quoteId/packet/preview", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { quoteId } = req.params;

  try {
    const { combinedPdf, data, quote, extraction, submission, client } =
      await buildPacket(quoteId);

    const base64 = combinedPdf.toString("base64");

    try {
      await pool.query(
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
          submission.submission_id,
          quote.quote_id,
          "packet.previewed",
          "Packet preview generated",
          {
            quote_id: quote.quote_id,
            extraction_id: extraction.quote_extraction_id,
          },
          "agent",
        ],
      );
    } catch (te) {
      console.error(
        "[packetBuilder] preview timeline insert failed (preview still returned):",
        te?.message || te,
      );
    }

    res.json({
      preview_base64: base64,
      metadata: {
        carrier_name: data.carrier_name,
        policy_type: data.policy_type,
        annual_premium: data.annual_premium,
        effective_date: data.effective_date,
        expiration_date: data.expiration_date,
        segment: submission.segment,
        client_name:
          data.client_name ||
          `${client.first_name || ""} ${client.last_name || ""}`.trim(),
        client_email: client.primary_email,
      },
    });
  } catch (err) {
    console.error("[packetBuilder] preview error:", err.message || err);
    if (err.message === "No approved extraction. Complete S4 review first.") {
      return res.status(400).json({ error: "no_approved_extraction" });
    }
    if (err.message === "packet_source_not_found") {
      return res.status(404).json({ error: "packet_source_not_found" });
    }
    res.status(500).json({
      error: "internal_error",
      message: err.message || String(err),
    });
  }
});

router.post("/api/quotes/:quoteId/packet/finalize", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { quoteId } = req.params;
  const {
    agent_id,
    recipient_email,
    cc_emails = [],
    email_subject,
    email_body_override,
  } = req.body || {};

  if (!agent_id || !recipient_email) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    const {
      combinedPdf,
      salesLetterPdf,
      data,
      quote,
      extraction,
      submission,
      client,
    } = await buildPacket(quoteId);

    const persistResult = await persistPacket({
      quoteId,
      agentId: agent_id,
      combinedPdf,
      salesLetterPdf,
      packetData: data,
      quote,
      extraction,
      submission,
      client,
    });

    const subject =
      email_subject ||
      `Your ${data.policy_type || ""} Insurance Quote — ${data.carrier_name || ""}`;

    await sendPacketEmail({
      segment: submission.segment,
      to: recipient_email,
      cc: cc_emails,
      subject,
      bodyOverride: email_body_override,
      packetData: data,
      attachmentBuffer: combinedPdf,
      attachmentFilename: `${submission.submission_public_id || "packet"}.pdf`,
    });

    try {
      await notifyBarPacketSent({ packetId: persistResult.packetId });
    } catch (err) {
      console.error(
        "[packetBuilder] notifyBarPacketSent error:",
        err.message || err,
      );
    }

    res.json({
      success: true,
      packet_id: persistResult.packetId,
      document_ids: [
        persistResult.packetDocumentId,
        persistResult.salesDocumentId,
      ],
      sent_to: recipient_email,
      cc: cc_emails,
      message: "Packet sent successfully.",
    });
  } catch (err) {
    console.error("[packetBuilder] finalize error:", err.message || err);
    if (err.message === "packet_already_sent") {
      return res.status(400).json({ error: "packet_already_sent" });
    }
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/api/quotes/:quoteId/packet/resend", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { quoteId } = req.params;
  const { agent_id, recipient_email, cc_emails = [] } = req.body || {};

  if (!agent_id || !recipient_email) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    const packetRes = await pool.query(
      `
        SELECT qp.packet_id,
               d.storage_path,
               s.submission_public_id,
               s.segment
        FROM quote_packets qp
        JOIN documents d
          ON d.document_id = qp.packet_document_id
        JOIN quotes q
          ON q.quote_id = qp.quote_id
        JOIN submissions s
          ON q.submission_id = s.submission_id
        WHERE qp.quote_id = $1
        ORDER BY qp.created_at DESC
        LIMIT 1
      `,
      [quoteId],
    );

    if (packetRes.rows.length === 0) {
      return res.status(404).json({ error: "packet_not_found" });
    }

    const row = packetRes.rows[0];

    const stream = await getObjectStream(row.storage_path);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    await sendPacketEmail({
      segment: row.segment,
      to: recipient_email,
      cc: cc_emails,
      subject: "Your insurance quote packet (resend)",
      bodyOverride: null,
      packetData: {
        client_name: "",
        policy_type: "",
        carrier_name: "",
      },
      attachmentBuffer: pdfBuffer,
      attachmentFilename: `${row.submission_public_id || "packet"}.pdf`,
    });

    await pool.query(
      `
        INSERT INTO timeline_events (
          submission_id,
          quote_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        )
        SELECT
          s.submission_id,
          q.quote_id,
          'packet.resent',
          'Packet resent to client',
          $3,
          $4
        FROM quotes q
        JOIN submissions s ON q.submission_id = s.submission_id
        WHERE q.quote_id = $1
      `,
      [
        quoteId,
        null,
        { packet_id: row.packet_id, recipients: [recipient_email, ...cc_emails] },
        agent_id,
      ],
    );

    res.json({
      success: true,
      packet_id: row.packet_id,
      message: `Packet resent to ${recipient_email}`,
    });
  } catch (err) {
    console.error("[packetBuilder] resend error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;

