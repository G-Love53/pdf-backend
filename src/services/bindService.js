import { getPool } from "../db.js";
import { documentDownloadPath, getObjectStream, uploadBuffer } from "./r2Service.js";
import {
  createEmbeddedSignatureRequest,
} from "./boldsignService.js";
import { tryFinalizeBoldSignFromDocumentId } from "./boldsignBindCompletion.js";
import { normalizeSegment } from "../utils/rss.js";
import { parseOptionalUuid } from "../utils/uuid.js";

async function bufferFromStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function getPoolOrThrow() {
  const pool = getPool();
  if (!pool) throw new Error("Postgres not configured");
  return pool;
}

export async function listReadyToBind({ segment }) {
  const pool = getPoolOrThrow();

  const params = [];
  // - 'sent': packet emailed to client, bind not started yet.
  // - 'approved': initiateBind() sets this when bind starts; quote must stay visible until signed
  //   (otherwise Bind Queue looks empty right after "Send for E‑Signature").
  const where = [
    "qe.review_status = 'approved'",
    `(qp.status = 'sent' OR (qp.status = 'approved' AND EXISTS (
      SELECT 1 FROM bind_requests br2
      WHERE br2.quote_id = q.quote_id AND br2.status = 'awaiting_signature'
    )))`,
  ];
  if (segment) {
    params.push(segment);
    where.push(`q.segment = $${params.length}`);
  }

  const sql = `
    SELECT
      q.quote_id AS quote_id,
      s.submission_public_id,
      COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
      c.primary_email AS client_email,
      c.primary_phone AS client_phone,
      q.segment,
      q.carrier_name,
      qe.reviewed_json->>'policy_type' AS policy_type,
      NULLIF(
        regexp_replace(qe.reviewed_json->>'annual_premium', '[^0-9.]', '', 'g'),
        ''
      )::numeric AS annual_premium,
      (NULLIF(qe.reviewed_json->>'effective_date', ''))::date AS effective_date,
      (NULLIF(qe.reviewed_json->>'expiration_date', ''))::date AS expiration_date,
      qp.sent_at AS packet_sent_at,
      qp.packet_id AS packet_id,
      EXTRACT(DAY FROM (NOW() - qp.sent_at))::int AS days_since_sent,
      br.id AS bind_request_id
    FROM quote_packets qp
    JOIN quotes q ON q.quote_id = qp.quote_id
    JOIN quote_extractions qe ON qe.quote_extraction_id = qp.extraction_id
    JOIN submissions s ON s.submission_id = q.submission_id
    JOIN clients c ON c.client_id = s.client_id
    LEFT JOIN businesses b ON b.business_id = s.business_id
    LEFT JOIN bind_requests br
      ON br.quote_id = q.quote_id
     AND br.status = 'awaiting_signature'
    WHERE ${where.join(" AND ")}
    ORDER BY qp.sent_at DESC
  `;

  const { rows } = await pool.query(sql, params);
  return {
    items: rows.map((r) => ({
      quote_id: r.quote_id,
      submission_public_id: r.submission_public_id,
      client_name: r.client_name,
      client_email: r.client_email,
      client_phone: r.client_phone,
      segment: normalizeSegment(r.segment),
      carrier_name: r.carrier_name,
      policy_type: r.policy_type,
      annual_premium: Number(r.annual_premium || 0),
      effective_date: r.effective_date,
      packet_sent_at: r.packet_sent_at,
      packet_id: r.packet_id,
      days_since_sent: r.days_since_sent,
      bind_request_id: r.bind_request_id,
    })),
    count: rows.length,
  };
}

/** Throttle BoldSign property polls per quote (operator UI polls every ~5s). */
const boldsignSyncThrottle = new Map();
const BOLDSIGN_SYNC_MIN_MS = Number(
  process.env.BOLDSIGN_BIND_DETAILS_SYNC_MIN_MS || 5000,
);

export async function getBindDetails(quoteId, options = {}) {
  const { syncBoldSign = true } = options;
  const pool = getPoolOrThrow();

  const sql = `
    SELECT
      q.quote_id AS quote_id,
      s.submission_public_id,
      s.segment,
      s.submission_id,
      c.client_id,
      COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS business_name,
      CONCAT_WS(' ', c.first_name, c.last_name) AS contact_name,
      c.primary_email,
      c.primary_phone,
      qp.packet_id AS packet_id,
      qp.sent_at AS packet_sent_at,
      qp.status AS packet_status,
      COALESCE(qe.reviewed_json->>'carrier_name', q.carrier_name) AS carrier_name,
      qe.reviewed_json->>'policy_type' AS policy_type,
      NULLIF(
        regexp_replace(qe.reviewed_json->>'annual_premium', '[^0-9.]', '', 'g'),
        ''
      )::numeric AS annual_premium,
      (NULLIF(qe.reviewed_json->>'effective_date', ''))::date AS effective_date,
      (NULLIF(qe.reviewed_json->>'expiration_date', ''))::date AS expiration_date
      ,
      br.id AS bind_request_id,
      br.status AS bind_request_status,
      br.hellosign_request_id AS bind_provider_document_id,
      br.document_id AS signed_document_id,
      d.storage_path AS signed_document_storage_path
    FROM quotes q
    JOIN submissions s ON s.submission_id = q.submission_id
    JOIN clients c ON c.client_id = s.client_id
    LEFT JOIN businesses b ON b.business_id = s.business_id
    JOIN quote_packets qp ON qp.quote_id = q.quote_id AND qp.status IN ('sent', 'approved')
    JOIN quote_extractions qe ON qe.quote_extraction_id = qp.extraction_id
    LEFT JOIN LATERAL (
      SELECT *
      FROM bind_requests br
      WHERE br.quote_id = q.quote_id
      ORDER BY br.initiated_at DESC
      LIMIT 1
    ) br ON true
    LEFT JOIN documents d ON d.document_id = br.document_id
    WHERE q.quote_id = $1
  `;

  const { rows } = await pool.query(sql, [quoteId]);
  if (!rows.length) return null;
  const row = rows[0];

  // RSS: same code path for every segment — when BoldSign webhooks don’t fire (e.g. app-level
  // webhook + API-key send), poll document status and finalize while the operator page polls.
  if (
    syncBoldSign &&
    row.bind_request_status === "awaiting_signature" &&
    row.bind_provider_document_id
  ) {
    const now = Date.now();
    const last = boldsignSyncThrottle.get(quoteId);
    const allowSync =
      last === undefined || now - last >= BOLDSIGN_SYNC_MIN_MS;
    if (allowSync) {
      boldsignSyncThrottle.set(quoteId, now);
      try {
        const syncResult = await tryFinalizeBoldSignFromDocumentId(
          String(row.bind_provider_document_id),
          { source: "bind_details_poll" },
        );
        if (
          syncResult.outcome === "completed" ||
          syncResult.outcome === "already_signed"
        ) {
          return getBindDetails(quoteId, { syncBoldSign: false });
        }
      } catch (err) {
        console.warn("[bindService] BoldSign bind-details sync failed:", err.message || err);
      }
    }
  }

  return {
    quote_id: row.quote_id,
    submission_public_id: row.submission_public_id,
    submission_id: row.submission_id,
    segment: normalizeSegment(row.segment),
    client: {
      id: row.client_id,
      business_name: row.business_name,
      contact_name: row.contact_name || null,
      email: row.primary_email,
      phone: row.primary_phone,
      address: null,
    },
    quote: {
      carrier_name: row.carrier_name,
      policy_type: row.policy_type,
      annual_premium: Number(row.annual_premium || 0),
      effective_date: row.effective_date,
      expiration_date: row.expiration_date,
    },
    packet: {
      id: row.packet_id,
      sent_at: row.packet_sent_at,
      status: row.packet_status || "sent",
    },
    bind_request: row.bind_request_id
      ? {
          id: row.bind_request_id,
          status: row.bind_request_status,
          /** BoldSign document id (stored in hellosign_request_id). */
          provider_document_id: row.bind_provider_document_id || null,
          signed_document_url: row.signed_document_id
            ? documentDownloadPath(row.signed_document_id)
            : null,
        }
      : null,
  };
}

export async function initiateBind({
  quoteId,
  agentId,
  paymentMethod,
  effectiveDateOverride,
  agentNotes,
  signerName,
  signerEmail,
}) {
  const pool = getPoolOrThrow();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const quoteDetail = await getBindDetails(quoteId, { syncBoldSign: false });
    if (!quoteDetail) {
      throw new Error("Quote not found");
    }
    if (!quoteDetail.packet?.id) {
      throw new Error("Quote does not have a sent packet");
    }

    // RSS: sign the actual carrier quote PDF (not a generic bind confirmation).
    // This ensures the signing box appears on the quote document where the carrier expects it.
    let carrierQuoteStoragePath = null;
    const directDocRes = await client.query(
      `
        SELECT d.storage_path
        FROM documents d
        WHERE d.document_role = 'carrier_quote_original'
          AND d.document_type = 'pdf'
          AND d.quote_id = $1
        ORDER BY d.created_at DESC
        LIMIT 1
      `,
      [quoteId],
    );
    carrierQuoteStoragePath = directDocRes.rows[0]?.storage_path || null;

    if (!carrierQuoteStoragePath) {
      const timelineRes = await client.query(
        `
          SELECT event_payload_json
          FROM timeline_events
          WHERE quote_id = $1
            AND event_type = 'quote.received'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [quoteId],
      );

      const payload = timelineRes.rows[0]?.event_payload_json || null;
      const documentIds = Array.isArray(payload?.document_ids) ? payload.document_ids : [];

      if (documentIds.length > 0) {
        const docRes = await client.query(
          `
            SELECT d.storage_path
            FROM documents d
            WHERE d.document_id = ANY($1::uuid[])
              AND d.document_role = 'carrier_quote_original'
              AND d.document_type = 'pdf'
            ORDER BY d.created_at DESC
            LIMIT 1
          `,
          [documentIds],
        );
        carrierQuoteStoragePath = docRes.rows[0]?.storage_path || null;
      }
    }

    if (!carrierQuoteStoragePath) {
      throw new Error("carrier_quote_pdf_not_found_for_bind");
    }

    const carrierQuoteStream = await getObjectStream(carrierQuoteStoragePath);
    const pdfBuffer = await bufferFromStream(carrierQuoteStream);

    const seg = normalizeSegment(quoteDetail.segment);
    const r2Key = `binds/${seg}/${quoteDetail.submission_public_id}/${quoteDetail.quote.carrier_name}-quote-bind.pdf`;
    // Save for audit/troubleshooting; the signed doc will be stored separately by the webhook completion.
    await uploadBuffer(r2Key, pdfBuffer, "application/pdf", {
      segment: seg,
      type: "bind_confirmation",
    });

    const boldsignReq = await createEmbeddedSignatureRequest({
      pdfBuffer,
      signerName,
      signerEmail,
      metadata: {
        // CID-controlled identity: this is the value you later map back from webhooks.
        cid_id: quoteDetail.submission_public_id,
        submission_public_id: quoteDetail.submission_public_id,
        quote_id: quoteId,
        segment: seg,
        carrier_name: quoteDetail.quote.carrier_name,
      },
      subject: `Signed Quote — ${quoteDetail.quote.policy_type} with ${quoteDetail.quote.carrier_name}`,
    });

    const agentUuid = parseOptionalUuid(agentId);

    const insertRes = await client.query(
      `
        INSERT INTO bind_requests (
          quote_id, packet_id, document_id,
          hellosign_request_id, signer_name, signer_email,
          payment_method, status, initiated_by, initiated_at,
          agent_notes
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, 'awaiting_signature', $8, NOW(),
          $9
        )
        RETURNING *
      `,
      [
        quoteId,
        quoteDetail.packet.id,
        null, // bind doc is attached after signature webhook completes
        boldsignReq.documentId,
        signerName,
        signerEmail,
        paymentMethod || "annual",
        agentUuid,
        agentNotes || null,
      ],
    );

    await client.query(
      "UPDATE quote_packets SET status = 'approved' WHERE packet_id = $1",
      [quoteDetail.packet.id],
    );

    await client.query(
      `
        INSERT INTO timeline_events (
          submission_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      [
        quoteDetail.submission_id,
        "bind.initiated",
        "Bind flow initiated",
        {
          quote_id: quoteId,
          bind_request_id: insertRes.rows[0].id,
          segment: seg,
        },
        agentUuid ?? "system",
      ],
    );

    await client.query("COMMIT");

    return {
      bindRequest: insertRes.rows[0],
      boldsign: {
        documentId: boldsignReq.documentId,
        sendUrl: boldsignReq.sendUrl,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function resendBind({ quoteId, agentId }) {
  const pool = getPoolOrThrow();

  const { rows: quoteRows } = await pool.query(
    `SELECT submission_id FROM quotes WHERE quote_id = $1`,
    [quoteId],
  );
  const submissionId = quoteRows[0]?.submission_id || null;

  const { rows } = await pool.query(
    `
      SELECT * FROM bind_requests
      WHERE quote_id = $1 AND status = 'awaiting_signature'
      ORDER BY initiated_at DESC
      LIMIT 1
    `,
    [quoteId],
  );
  const bind = rows[0];
  if (!bind) {
    throw new Error("No pending bind_request to resend");
  }

  // Recreate the embedded request URL (provider can treat send URLs as one-time/short-lived).
  // We update the existing bind_requests row to keep your workflow single-source.
  const quoteDetail = await getBindDetails(quoteId, { syncBoldSign: false });
  if (!quoteDetail?.packet?.id) throw new Error("Quote does not have a sent packet");

  // RSS: sign the same carrier quote PDF as the original bind request.
  let carrierQuoteStoragePath = null;
  const directDocRes = await pool.query(
    `
      SELECT d.storage_path
      FROM documents d
      WHERE d.document_role = 'carrier_quote_original'
        AND d.document_type = 'pdf'
        AND d.quote_id = $1
      ORDER BY d.created_at DESC
      LIMIT 1
    `,
    [quoteId],
  );
  carrierQuoteStoragePath = directDocRes.rows[0]?.storage_path || null;

  if (!carrierQuoteStoragePath) {
    const timelineRes = await pool.query(
      `
        SELECT event_payload_json
        FROM timeline_events
        WHERE quote_id = $1
          AND event_type = 'quote.received'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [quoteId],
    );
    const payload = timelineRes.rows[0]?.event_payload_json || null;
    const documentIds = Array.isArray(payload?.document_ids) ? payload.document_ids : [];
    if (documentIds.length > 0) {
      const docRes = await pool.query(
        `
          SELECT d.storage_path
          FROM documents d
          WHERE d.document_id = ANY($1::uuid[])
            AND d.document_role = 'carrier_quote_original'
            AND d.document_type = 'pdf'
          ORDER BY d.created_at DESC
          LIMIT 1
        `,
        [documentIds],
      );
      carrierQuoteStoragePath = docRes.rows[0]?.storage_path || null;
    }
  }

  if (!carrierQuoteStoragePath) {
    throw new Error("carrier_quote_pdf_not_found_for_resend_bind");
  }

  const carrierQuoteStream = await getObjectStream(carrierQuoteStoragePath);
  const pdfBuffer = await bufferFromStream(carrierQuoteStream);

  const agentUuid = parseOptionalUuid(agentId);

  const boldsignReq = await createEmbeddedSignatureRequest({
    pdfBuffer,
    signerName: bind.signer_name,
    signerEmail: bind.signer_email,
    metadata: {
      cid_id: quoteDetail.submission_public_id,
      submission_public_id: quoteDetail.submission_public_id,
      quote_id: quoteId,
      segment: quoteDetail.segment,
      carrier_name: quoteDetail.quote?.carrier_name || null,
    },
    subject: `Signed Quote — ${quoteDetail.quote.policy_type} with ${quoteDetail.quote.carrier_name}`,
  });

  await pool.query(
    `
      UPDATE bind_requests
      SET hellosign_request_id = $1, updated_at = NOW()
      WHERE id = $2
    `,
    [boldsignReq.documentId, bind.id],
  );

  await pool.query(
    `
      INSERT INTO timeline_events (submission_id, event_type, event_label, event_payload_json, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      submissionId,
      "bind.resent",
      "Bind signature request resent",
      { bind_request_id: bind.id, segment: normalizeSegment(quoteDetail.segment) },
      agentUuid ?? "system",
    ],
  );
}

export async function cancelBind({ quoteId, agentId, reason }) {
  const pool = getPoolOrThrow();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: quoteRows } = await client.query(
      `SELECT submission_id FROM quotes WHERE quote_id = $1`,
      [quoteId],
    );
    const submissionId = quoteRows[0]?.submission_id || null;

    const { rows } = await client.query(
      `
        SELECT * FROM bind_requests
        WHERE quote_id = $1 AND status = 'awaiting_signature'
        ORDER BY initiated_at DESC
        LIMIT 1
      `,
      [quoteId],
    );
    const bind = rows[0];
    if (!bind) {
      throw new Error("No pending bind_request to cancel");
    }

    const agentUuid = parseOptionalUuid(agentId);

    // Local cancellation: provider cancellation/revocation can be added once BoldSign revoke/cancel endpoints
    // are wired. Webhook handling must also respect bind_requests.status to avoid duplicate binds.
    // We keep this behavior consistent with idempotent post-sign processing.

    await client.query(
      `
        UPDATE bind_requests
        SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1
        WHERE id = $2
      `,
      [reason || null, bind.id],
    );

    await client.query(
      "UPDATE quote_packets SET status = 'sent' WHERE packet_id = $1",
      [bind.packet_id],
    );

    await client.query(
      `
        INSERT INTO timeline_events (submission_id, event_type, event_label, event_payload_json, created_by)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        submissionId,
        "bind.cancelled",
        "Bind request cancelled",
        { bind_request_id: bind.id, reason: reason || null },
        agentUuid ?? "system",
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

