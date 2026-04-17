/**
 * Shared BoldSign "document completed" workflow: download PDF, R2, policy, emails.
 * Used by POST /api/webhooks/boldsign (Completed) and GET /operator redirect fallback
 * when webhooks are delayed or not delivered.
 */
import crypto from "crypto";
import { getPool } from "../db.js";
import {
  downloadSignedDocument as downloadBoldSignDocument,
  getDocumentProperties,
  isBoldSignDocumentReadyForDownload,
} from "./boldsignService.js";
import { uploadBuffer } from "./r2Service.js";
import { createPolicy } from "./policyService.js";
import {
  bindSignedAttachmentFilename,
  sendBindConfirmationEmail,
  sendWelcomeEmail,
} from "./bindEmailService.js";
import { notifyBarBindSigned } from "./agentNotificationService.js";
import {
  DocumentRole,
  DocumentType,
  PacketStatus,
  QuoteStatus,
  StorageProvider,
  SubmissionStatus,
} from "../constants/postgresEnums.js";
import { normalizeSegment } from "../utils/rss.js";

/**
 * @param {string} docId - BoldSign documentId (stored in bind_requests.hellosign_request_id)
 * @param {{ eventId?: string|null, payload?: unknown, source?: string }} [meta]
 * @returns {Promise<{ outcome: 'completed'|'already_signed'|'missing'|'cancelled', quoteId?: string }>}
 */
export async function processBoldSignDocumentCompleted(docId, meta = {}) {
  const { eventId = null, payload = null, source = "webhook" } = meta;
  const pool = getPool();
  if (!pool) {
    throw new Error("boldsignBindCompletion: database not configured");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
        SELECT
          br.*,
          q.*,
          qe.reviewed_json AS reviewed_json,
          s.submission_id,
          s.submission_public_id,
          s.segment,
          s.client_id,
          c.primary_email,
          c.first_name,
          c.last_name,
          c.primary_phone,
          qe.quote_extraction_id AS quote_extraction_id,
          qp.packet_document_id,
          qe.reviewed_json->>'carrier_name' AS extracted_carrier_name
        FROM bind_requests br
        JOIN quotes q ON q.quote_id = br.quote_id
        JOIN submissions s ON s.submission_id = q.submission_id
        JOIN clients c ON c.client_id = s.client_id
        JOIN quote_packets qp ON qp.packet_id = br.packet_id
        JOIN quote_extractions qe ON qe.quote_extraction_id = qp.extraction_id
        WHERE br.hellosign_request_id = $1
        FOR UPDATE
      `,
      [docId],
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      return { outcome: "missing" };
    }

    const row = rows[0];

    if (row.status === "cancelled") {
      await client.query("ROLLBACK");
      return { outcome: "cancelled", quoteId: row.quote_id };
    }

    if (row.status === "signed") {
      await client.query("COMMIT");
      return { outcome: "already_signed", quoteId: row.quote_id };
    }

    const segment = normalizeSegment(row.segment);

    const signedBuffer = await downloadBoldSignDocument(docId);
    const sha256 = crypto.createHash("sha256").update(signedBuffer).digest("hex");

    const carrierName =
      row.reviewed_json?.carrier_name ||
      row.carrier_name ||
      row.extracted_carrier_name ||
      "carrier";
    const submissionPublicId = row.submission_public_id;

    const r2Key = `binds/${segment}/${submissionPublicId}/${carrierName}-quote-signed.pdf`;

    await uploadBuffer(r2Key, signedBuffer, "application/pdf", {
      segment,
      type: DocumentRole.SIGNED_BIND_DOCS,
    });

    const docRes = await client.query(
      `
        INSERT INTO documents (
          client_id,
          submission_id,
          quote_id,
          policy_id,
          document_type,
          document_role,
          storage_provider,
          storage_path,
          mime_type,
          sha256_hash,
          is_original,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          NULL,
          $4,
          $5,
          $6,
          $7,
          'application/pdf',
          $8,
          FALSE,
          'system'
        )
        RETURNING document_id
      `,
      [
        row.client_id,
        row.submission_id,
        row.quote_id,
        DocumentType.PDF,
        DocumentRole.SIGNED_BIND_DOCS,
        StorageProvider.R2,
        r2Key,
        sha256,
      ],
    );

    const signedDocumentId = docRes.rows[0].document_id;

    const brRes = await client.query(
      `
        UPDATE bind_requests
        SET status = 'signed',
            document_id = COALESCE(document_id, $2),
            signed_at = COALESCE(signed_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [row.id, signedDocumentId],
    );

    const bindRequest = brRes.rows[0];

    const policy = await createPolicy({
      client: {
        client_id: row.client_id,
        primary_email: row.primary_email,
        first_name: row.first_name,
        last_name: row.last_name,
      },
      submission: {
        submission_id: row.submission_id,
        submission_public_id: row.submission_public_id,
        segment,
      },
      quote: {
        carrier_name: row.carrier_name,
        quote_id: row.quote_id,
      },
      bindRequest,
      extraction: { reviewed_json: row.reviewed_json },
      txClient: client,
      // policies.bound_by is UUID (agent who bound). Webhook/redirect finalize has no agent id here;
      // createPolicy falls back to bind_requests.initiated_by or NULL.
    });

    // Document row is inserted before policy exists; link signed PDF so Connect GET /policies/:id/documents works.
    await client.query(
      `UPDATE documents SET policy_id = $1::uuid WHERE document_id = $2::uuid`,
      [policy.id, signedDocumentId],
    );

    await client.query(
      `
        UPDATE quote_packets
        SET status = $2
        WHERE quote_id = $1
      `,
      [row.quote_id, PacketStatus.APPROVED],
    );

    await client.query(
      `
        UPDATE quotes
        SET status = $2, updated_at = NOW()
        WHERE quote_id = $1
      `,
      [row.quote_id, QuoteStatus.ACCEPTED],
    );

    await client.query(
      `
        UPDATE submissions
        SET status = $2
        WHERE submission_id = $1
      `,
      [row.submission_id, SubmissionStatus.BOUND],
    );

    await client.query(
      `
        INSERT INTO timeline_events (
          submission_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        row.submission_id,
        "bind.signed",
        "Bind confirmation signed",
        {
          event_id: eventId,
          payload,
          source,
        },
        "system",
      ],
    );

    await client.query("COMMIT");

    const signedPdfFilename = bindSignedAttachmentFilename(carrierName);

    const clientObj = {
      primary_email: row.primary_email,
      first_name: row.first_name,
      last_name: row.last_name,
    };

    await sendBindConfirmationEmail({
      client: clientObj,
      policy,
      segment,
      signedPdfBuffer: signedBuffer,
      signedPdfFilename,
    });

    await sendWelcomeEmail({
      client: clientObj,
      policy,
      cidAppUrl: process.env.CID_APP_URL,
      segment,
    });

    await notifyBarBindSigned({
      submissionId: row.submission_id,
      signedPdfBuffer: signedBuffer,
      signedPdfFilename,
    });

    return { outcome: "completed", quoteId: row.quote_id };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Poll BoldSign for document completion, then run the same finalize path as webhooks.
 * Does not finalize unless API reports a terminal "completed" state (avoids partial sign).
 */
export async function tryFinalizeBoldSignFromDocumentId(docId, meta = {}) {
  let props;
  try {
    props = await getDocumentProperties(docId);
  } catch (err) {
    console.warn("[boldsignBindCompletion] getDocumentProperties failed", {
      documentId: String(docId).slice(0, 8) + "…",
      message: err.message || err,
    });
    return { outcome: "not_ready", reason: "properties_unavailable" };
  }

  if (!isBoldSignDocumentReadyForDownload(props)) {
    const status =
      props && typeof props === "object"
        ? props.status ?? props.Status ?? null
        : null;
    return { outcome: "not_ready", status: status ?? null };
  }

  return processBoldSignDocumentCompleted(docId, meta);
}
