import { getPool } from "../db.js";
import { generateDocument } from "../generators/index.js";
import { uploadBuffer } from "./r2Service.js";
import {
  createSignatureRequest,
  resendSignatureRequest,
  cancelSignatureRequest,
} from "./hellosignService.js";
import { createPolicy } from "./policyService.js";

const BIND_TEMPLATES = {
  bar: "bar/bind-confirmation",
  roofer: "roofer/bind-confirmation",
  plumber: "plumber/bind-confirmation",
  hvac: "hvac/bind-confirmation",
};

function getPoolOrThrow() {
  const pool = getPool();
  if (!pool) throw new Error("Postgres not configured");
  return pool;
}

export async function listReadyToBind({ segment }) {
  const pool = getPoolOrThrow();

  const params = [];
  let where = "qp.status = 'sent'";
  if (segment) {
    params.push(segment);
    where += ` AND q.segment = $${params.length}`;
  }

  const sql = `
    SELECT
      q.id AS quote_id,
      s.submission_public_id,
      c.business_name,
      c.primary_email AS client_email,
      c.primary_phone AS client_phone,
      q.segment,
      q.carrier_name,
      q.policy_type,
      q.annual_premium,
      q.effective_date,
      qp.sent_at AS packet_sent_at,
      qp.id AS packet_id,
      EXTRACT(DAY FROM (NOW() - qp.sent_at))::int AS days_since_sent,
      br.id AS bind_request_id
    FROM quote_packets qp
    JOIN quotes q ON q.id = qp.quote_id
    JOIN submissions s ON s.submission_id = q.submission_id
    JOIN clients c ON c.client_id = s.client_id
    LEFT JOIN bind_requests br ON br.quote_id = q.id
    WHERE ${where}
    ORDER BY qp.sent_at DESC
  `;

  const { rows } = await pool.query(sql, params);
  return {
    items: rows.map((r) => ({
      quote_id: r.quote_id,
      submission_public_id: r.submission_public_id,
      client_name: r.business_name,
      client_email: r.client_email,
      client_phone: r.client_phone,
      segment: r.segment,
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

export async function getBindDetails(quoteId) {
  const pool = getPoolOrThrow();

  const sql = `
    SELECT
      q.*,
      s.submission_public_id,
      s.segment,
      s.submission_id,
      c.client_id,
      c.business_name,
      c.primary_email,
      c.primary_phone,
      c.mailing_address,
      qp.id AS packet_id,
      qp.sent_at AS packet_sent_at
    FROM quotes q
    JOIN submissions s ON s.submission_id = q.submission_id
    JOIN clients c ON c.client_id = s.client_id
    LEFT JOIN quote_packets qp ON qp.quote_id = q.id AND qp.status = 'sent'
    WHERE q.id = $1
  `;

  const { rows } = await pool.query(sql, [quoteId]);
  if (!rows.length) return null;
  const row = rows[0];

  return {
    quote_id: row.id,
    submission_public_id: row.submission_public_id,
    segment: row.segment,
    client: {
      id: row.client_id,
      business_name: row.business_name,
      contact_name: row.contact_name || null,
      email: row.primary_email,
      phone: row.primary_phone,
      address: row.mailing_address,
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
      status: "sent",
    },
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

    const quoteDetail = await getBindDetails(quoteId);
    if (!quoteDetail) {
      throw new Error("Quote not found");
    }
    if (!quoteDetail.packet?.id) {
      throw new Error("Quote does not have a sent packet");
    }

    const tmplKey = BIND_TEMPLATES[quoteDetail.segment] || BIND_TEMPLATES.bar;

    const doc = await generateDocument(tmplKey, {
      client: quoteDetail.client,
      quote: {
        ...quoteDetail.quote,
        effective_date:
          effectiveDateOverride || quoteDetail.quote.effective_date,
      },
      payment_method: paymentMethod || "annual",
      submission_public_id: quoteDetail.submission_public_id,
      segment: quoteDetail.segment,
    });

    const pdfBuffer = doc.buffer;

    const r2Key = `binds/${quoteDetail.segment}/${quoteDetail.submission_public_id}/${quoteDetail.quote.carrier_name}-bind-confirmation.pdf`;
    await uploadBuffer(r2Key, pdfBuffer, "application/pdf", {
      segment: quoteDetail.segment,
      type: "bind_confirmation",
    });

    const hsReq = await createSignatureRequest({
      pdfBuffer,
      signerName,
      signerEmail,
      metadata: {
        quote_id: quoteId,
        submission_public_id: quoteDetail.submission_public_id,
        segment: quoteDetail.segment,
      },
      subject: `Bind Confirmation — ${quoteDetail.quote.policy_type} with ${quoteDetail.quote.carrier_name}`,
    });

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
        docRecord.id,
        hsReq.signatureRequestId || hsReq.signature_request_id,
        signerName,
        signerEmail,
        paymentMethod || "annual",
        agentId || null,
        agentNotes || null,
      ],
    );

    await client.query(
      "UPDATE quote_packets SET status = 'accepted' WHERE id = $1",
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
        },
        agentId || "system",
      ],
    );

    await client.query("COMMIT");

    return {
      bindRequest: insertRes.rows[0],
      hellosign: hsReq,
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

  await resendSignatureRequest(bind.hellosign_request_id, bind.signer_email);

  await pool.query(
    `
      INSERT INTO timeline_events (submission_id, event_type, event_label, event_payload_json, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      bind.submission_id,
      "bind.resent",
      "Bind signature request resent",
      { bind_request_id: bind.id },
      agentId || "system",
    ],
  );
}

export async function cancelBind({ quoteId, agentId, reason }) {
  const pool = getPoolOrThrow();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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

    await cancelSignatureRequest(bind.hellosign_request_id);

    await client.query(
      `
        UPDATE bind_requests
        SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1
        WHERE id = $2
      `,
      [reason || null, bind.id],
    );

    await client.query(
      "UPDATE quote_packets SET status = 'sent' WHERE id = $1",
      [bind.packet_id],
    );

    await client.query(
      `
        INSERT INTO timeline_events (submission_id, event_type, event_label, event_payload_json, created_by)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        bind.submission_id,
        "bind.cancelled",
        "Bind request cancelled",
        { bind_request_id: bind.id, reason: reason || null },
        agentId || "system",
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

