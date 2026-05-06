import express from "express";
import { getPool } from "../db.js";
import {
  buildPacket,
  buildPacketData,
  loadPacketData,
  persistPacket,
} from "../services/packetService.js";
import {
  buildPacketEmailHtml,
  defaultPacketEmailSubject,
  sendPacketEmail,
} from "../services/packetEmailService.js";
import { generateLetter } from "../services/aiLetterService.js";
import { getObjectStream } from "../services/r2Service.js";
import { notifyBarPacketSent } from "../services/agentNotificationService.js";
import { PacketStatus } from "../constants/postgresEnums.js";

const router = express.Router();
const pool = getPool();

function isLikelyEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

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
        LEFT JOIN LATERAL (
          SELECT packet_id, status, sent_at
          FROM quote_packets qp
          WHERE qp.quote_id = q.quote_id
          ORDER BY qp.created_at DESC
          LIMIT 1
        ) qp ON TRUE
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

/** Latest packet row for operator UI (SENT badge, etc.) */
router.get("/api/quotes/:quoteId/packet-meta", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }
  const { quoteId } = req.params;
  try {
    const r = await pool.query(
      `
        SELECT status::text AS status, sent_at
        FROM quote_packets
        WHERE quote_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [quoteId],
    );
    const row = r.rows[0];
    res.json({
      status: row?.status || null,
      sent_at: row?.sent_at ? new Date(row.sent_at).toISOString() : null,
    });
  } catch (err) {
    console.error("[packetBuilder] packet-meta error:", err.message || err);
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

/** HTML body (and default subject) for the client email — same template as send, without PDF work. */
router.post("/api/quotes/:quoteId/packet/email-preview", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const { quoteId } = req.params;
  const body_override = req.body?.body_override ?? null;

  try {
    const { quote, extraction, submission, client } =
      await loadPacketData(quoteId);
    if (!extraction || extraction.review_status !== "approved") {
      return res.status(400).json({ error: "no_approved_extraction" });
    }
    const data = buildPacketData({ quote, extraction, submission, client });
    try {
      data.sales_letter_text = await generateLetter(
        submission.segment,
        extraction.reviewed_json || {},
        {
          business_name: data.business_name || null,
          contact_name: data.contact_name || null,
          email: data.client_email || null,
        },
        {
          quoteCreatedAt: quote.quote_created_at || null,
          packetGeneratedAt: new Date().toISOString(),
        },
      );
    } catch (letterErr) {
      // Keep preview functional even if letter generation fails.
      console.warn(
        "[packetBuilder] email-preview letter generation fallback:",
        letterErr?.message || letterErr,
      );
    }
    const { html } = buildPacketEmailHtml({
      segment: submission.segment,
      packetData: data,
      bodyOverride: body_override,
    });
    const subject_default = defaultPacketEmailSubject(data);
    res.json({ html, subject_default });
  } catch (err) {
    console.error("[packetBuilder] email-preview error:", err.message || err);
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
      email_subject || defaultPacketEmailSubject(data);

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
  const {
    agent_id,
    recipient_email,
    cc_emails = [],
    persist_email_as_truth = true,
  } = req.body || {};

  if (!agent_id || !recipient_email) {
    return res.status(400).json({ error: "missing_required_fields" });
  }
  if (!isLikelyEmail(recipient_email)) {
    return res.status(400).json({ error: "invalid_recipient_email" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const packetRes = await client.query(
      `
        SELECT qp.packet_id,
               qp.extraction_id,
               qp.packet_document_id,
               d.storage_path,
               q.quote_id,
               s.submission_id,
               s.submission_public_id,
               s.segment,
               s.client_id,
               c.primary_email AS existing_client_email
        FROM quote_packets qp
        JOIN documents d
          ON d.document_id = qp.packet_document_id
        JOIN quotes q
          ON q.quote_id = qp.quote_id
        JOIN submissions s
          ON q.submission_id = s.submission_id
        JOIN clients c
          ON c.client_id = s.client_id
        WHERE qp.quote_id = $1
        ORDER BY qp.created_at DESC
        LIMIT 1
      `,
      [quoteId],
    );

    if (packetRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "packet_not_found" });
    }

    const row = packetRes.rows[0];

    let pdfBuffer;
    let packetDataForEmail = {
      client_name: "",
      policy_type: "",
      carrier_name: "",
    };
    try {
      const stream = await getObjectStream(row.storage_path);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      pdfBuffer = Buffer.concat(chunks);
    } catch (streamErr) {
      // Fallback path: rebuild packet when stored blob cannot be read.
      // This keeps resend operational for older/migrated packet rows.
      console.warn(
        "[packetBuilder] resend stream fetch failed, rebuilding packet:",
        streamErr?.message || streamErr,
      );
      const { combinedPdf, data } = await buildPacket(quoteId);
      pdfBuffer = combinedPdf;
      packetDataForEmail = data || packetDataForEmail;
    }

    // When the PDF came from R2, we still need full packet metadata for the email body
    // (submission_public_id, premium, Issue Policy /bind/initiate link → quote_id).
    if (packetDataForEmail && !packetDataForEmail.quote_id) {
      try {
        const loaded = await loadPacketData(quoteId);
        packetDataForEmail = buildPacketData({
          quote: loaded.quote,
          extraction: loaded.extraction,
          submission: loaded.submission,
          client: loaded.client,
        });
        try {
          packetDataForEmail.sales_letter_text = await generateLetter(
            loaded.submission.segment,
            loaded.extraction?.reviewed_json || {},
            {
              business_name: packetDataForEmail.business_name || null,
              contact_name: packetDataForEmail.contact_name || null,
              email: packetDataForEmail.client_email || null,
            },
            {
              quoteCreatedAt: loaded.quote?.quote_created_at || null,
              packetGeneratedAt: new Date().toISOString(),
            },
          );
        } catch (letterErr) {
          console.warn(
            "[packetBuilder] resend letter generation fallback:",
            letterErr?.message || letterErr,
          );
        }
      } catch (metaErr) {
        console.warn(
          "[packetBuilder] resend: could not load packet metadata for email:",
          metaErr?.message || metaErr,
        );
      }
    }

    await sendPacketEmail({
      segment: row.segment,
      to: recipient_email,
      cc: cc_emails,
      subject: "Your insurance quote packet (resend)",
      bodyOverride: null,
      packetData: packetDataForEmail,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: `${row.submission_public_id || "packet"}.pdf`,
    });

    const resendPacketRes = await client.query(
      `
        INSERT INTO quote_packets (
          quote_id,
          extraction_id,
          packet_document_id,
          status,
          created_by,
          sent_at,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, NOW(), NOW()
        )
        RETURNING packet_id
      `,
      [row.quote_id, row.extraction_id, row.packet_document_id, PacketStatus.SENT, agent_id],
    );
    const resendPacketId = resendPacketRes.rows[0]?.packet_id || row.packet_id;

    const shouldPersistTruth = persist_email_as_truth !== false;
    let emailTruthUpdated = false;
    if (shouldPersistTruth) {
      await client.query(
        `
          UPDATE clients
          SET primary_email = $2,
              updated_at = NOW()
          WHERE client_id = $1
            AND lower(primary_email) <> lower($2)
        `,
        [row.client_id, recipient_email],
      );

      await client.query(
        `
          UPDATE submissions
          SET raw_submission_json = jsonb_set(
            jsonb_set(
              COALESCE(raw_submission_json, '{}'::jsonb),
              '{contact_email}',
              to_jsonb($2::text),
              true
            ),
            '{email}',
            to_jsonb($2::text),
            true
          )
          WHERE submission_id = $1
        `,
        [row.submission_id, recipient_email],
      );

      await client.query(
        `
          UPDATE bind_requests
          SET signer_email = $2,
              updated_at = NOW()
          WHERE quote_id IN (
            SELECT quote_id FROM quotes WHERE submission_id = $1
          )
            AND status = 'awaiting_signature'
            AND lower(signer_email) <> lower($2)
        `,
        [row.submission_id, recipient_email],
      );

      emailTruthUpdated =
        String(row.existing_client_email || "").toLowerCase() !==
        String(recipient_email).toLowerCase();
    }

    // Authoritative resend: any other "sent" packet for the same submission becomes superseded.
    await client.query(
      `
        UPDATE quote_packets
        SET status = $1
        WHERE status = $2
          AND packet_id <> $3
          AND quote_id IN (
            SELECT quote_id FROM quotes WHERE submission_id = $4
          )
      `,
      [PacketStatus.SUPERSEDED, PacketStatus.SENT, resendPacketId, row.submission_id],
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
        SELECT
          s.submission_id,
          q.quote_id,
          'packet.resent',
          'Packet resent to client',
          $2,
          $3
        FROM quotes q
        JOIN submissions s ON q.submission_id = s.submission_id
        WHERE q.quote_id = $1
      `,
      [
        quoteId,
        {
          packet_id: resendPacketId,
          supersedes_packet_id: row.packet_id,
          recipients: [recipient_email, ...cc_emails],
          tracking_id: row.submission_public_id,
          persist_email_as_truth: shouldPersistTruth,
          email_truth_updated: emailTruthUpdated,
          previous_client_email: row.existing_client_email || null,
          updated_client_email: shouldPersistTruth ? recipient_email : null,
        },
        agent_id,
      ],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      packet_id: resendPacketId,
      superseded_packet_id: row.packet_id,
      tracking_id: row.submission_public_id,
      persist_email_as_truth: shouldPersistTruth,
      email_truth_updated: emailTruthUpdated,
      message: `Packet resent to ${recipient_email}`,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("[packetBuilder] resend error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export default router;

