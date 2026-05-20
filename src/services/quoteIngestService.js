import crypto from "crypto";
import { getPool } from "../db.js";
import { uploadBuffer } from "./r2Service.js";
import { notifyBarCarrierQuoteReceived } from "./agentNotificationService.js";
import {
  DocumentRole,
  DocumentType,
  QueueType,
  StorageProvider,
  SubmissionStatus,
} from "../constants/postgresEnums.js";

const pool = getPool();
const AUTO_MATCH_CONFIDENCE = 0.95;

function safeFilename(name) {
  return (
    String(name || "carrier-quote.pdf")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .slice(0, 120) || "carrier-quote.pdf"
  );
}

export function decodePdfBase64(fileBase64) {
  const m = String(fileBase64 || "").match(/^data:application\/pdf;base64,(.+)$/i);
  const b64 = m ? m[1] : String(fileBase64 || "").trim();
  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(b64, "base64");
  } catch {
    throw new Error("invalid_file_base64");
  }
  if (!pdfBuffer || pdfBuffer.length < 32) {
    throw new Error("empty_or_invalid_pdf");
  }
  return pdfBuffer;
}

async function createWorkQueueItemIfMissingOpen(client, data) {
  const exists = await client.query(
    `
      SELECT 1
      FROM work_queue_items
      WHERE queue_type = $1::queue_type
        AND related_entity_type = $2
        AND related_entity_id = $3
        AND status = 'open'
      LIMIT 1
    `,
    [data.queue_type, data.related_entity_type, data.related_entity_id],
  );
  if (exists.rows.length > 0) return null;

  const res = await client.query(
    `
      INSERT INTO work_queue_items (
        queue_type, related_entity_type, related_entity_id,
        priority, reason_code, reason_detail, status
      )
      VALUES ($1::queue_type, $2, $3, $4, $5, $6, 'open')
      RETURNING work_queue_item_id
    `,
    [
      data.queue_type,
      data.related_entity_type,
      data.related_entity_id,
      data.priority,
      data.reason_code,
      data.reason_detail,
    ],
  );
  return res.rows[0].work_queue_item_id;
}

async function loadSubmissionForIngest(client, submissionPublicId) {
  const subRes = await client.query(
    `
      SELECT
        s.submission_id,
        s.submission_public_id,
        s.client_id,
        s.segment::text AS segment,
        s.status::text AS status,
        COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
      FROM submissions s
      JOIN clients c ON c.client_id = s.client_id
      LEFT JOIN businesses b ON b.business_id = s.business_id
      WHERE s.submission_public_id = $1
        AND s.status NOT IN ('closed_lost', 'rejected')
      LIMIT 1
    `,
    [submissionPublicId],
  );
  if (!subRes.rows.length) return null;
  return subRes.rows[0];
}

async function assertNoExistingQuote(client, submissionId) {
  const existing = await client.query(
    `SELECT quote_id FROM quotes WHERE submission_id = $1 LIMIT 1`,
    [submissionId],
  );
  if (existing.rows.length > 0) {
    throw new Error("submission_already_has_quote");
  }
}

async function storeCarrierQuotePdf(client, {
  pdfBuffer,
  filename,
  segment,
  storageKeyPart,
  clientId,
  submissionId,
  quoteId,
}) {
  const sha256Hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const dup = await client.query(
    `SELECT document_id FROM documents WHERE sha256_hash = $1 LIMIT 1`,
    [sha256Hash],
  );
  if (dup.rows.length > 0) {
    return dup.rows[0].document_id;
  }

  const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const storagePath = `incoming/${segment}/${datePath}/${storageKeyPart}/${safeFilename(filename)}`;

  await uploadBuffer(storagePath, pdfBuffer, "application/pdf", {
    segment,
    original_filename: safeFilename(filename),
  });

  const docRes = await client.query(
    `
      INSERT INTO documents (
        client_id, submission_id, quote_id, policy_id,
        document_type, document_role, storage_provider, storage_path,
        mime_type, sha256_hash, is_original, created_by
      )
      VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'application/pdf', $8, TRUE, 'operator')
      RETURNING document_id
    `,
    [
      clientId,
      submissionId,
      quoteId,
      DocumentType.PDF,
      DocumentRole.CARRIER_QUOTE_ORIGINAL,
      StorageProvider.R2,
      storagePath,
      sha256Hash,
    ],
  );
  return docRes.rows[0].document_id;
}

async function finalizeQuoteIngest(client, {
  submission,
  carrierMessageId,
  carrierName,
  documentIds,
  reasonCode,
  reasonDetail,
  createdBy = "operator",
}) {
  const quoteRes = await client.query(
    `
      INSERT INTO quotes (
        submission_id, carrier_message_id, carrier_name, segment,
        status, match_confidence, match_status, match_method, match_details_json
      )
      VALUES ($1, $2, $3, $4::segment_type, 'matched', $5, 'manually_matched', 'operator_manual', $6)
      RETURNING quote_id
    `,
    [
      submission.submission_id,
      carrierMessageId,
      carrierName || "Unknown carrier",
      submission.segment,
      AUTO_MATCH_CONFIDENCE,
      JSON.stringify({ source: reasonCode }),
    ],
  );
  const quoteId = quoteRes.rows[0].quote_id;

  if (documentIds.length > 0) {
    await client.query(
      `
        UPDATE documents
        SET
          client_id = COALESCE(client_id, $2::uuid),
          submission_id = COALESCE(submission_id, $3::uuid),
          quote_id = $4::uuid
        WHERE document_id = ANY($1::uuid[])
      `,
      [documentIds, submission.client_id, submission.submission_id, quoteId],
    );
  }

  await client.query(
    `
      UPDATE carrier_messages
      SET submission_id = $1
      WHERE carrier_message_id = $2
    `,
    [submission.submission_id, carrierMessageId],
  );

  const workQueueItemId = await createWorkQueueItemIfMissingOpen(client, {
    queue_type: QueueType.EXTRACTION_REVIEW,
    related_entity_type: "quote",
    related_entity_id: quoteId,
    priority: 3,
    reason_code: reasonCode,
    reason_detail: reasonDetail,
  });

  await client.query(
    `
      INSERT INTO timeline_events (
        client_id, submission_id, quote_id, policy_id,
        event_type, event_label, event_payload_json, created_by
      )
      VALUES ($1, $2, $3, NULL, 'quote.received', $4, $5, $6)
    `,
    [
      submission.client_id,
      submission.submission_id,
      quoteId,
      `Quote received from ${carrierName || "carrier"} (manual ingest)`,
      JSON.stringify({
        carrier_message_id: carrierMessageId,
        document_ids: documentIds,
        match_confidence: AUTO_MATCH_CONFIDENCE,
        match_status: "manually_matched",
        source: reasonCode,
      }),
      createdBy,
    ],
  );

  await client.query(
    `
      UPDATE submissions
      SET status = $2::submission_status
      WHERE submission_id = $1
    `,
    [submission.submission_id, SubmissionStatus.QUOTE_RECEIVED],
  );

  return { quoteId, workQueueItemId };
}

/**
 * Operator manual upload: submission already exists, no quote row yet.
 */
export async function addManualCarrierQuote({
  submissionPublicId,
  carrierName,
  filename,
  fileBase64,
  note,
}) {
  if (!pool) throw new Error("database_not_configured");

  const sid = String(submissionPublicId || "").trim().toUpperCase();
  if (!sid || !fileBase64) {
    throw new Error("missing_required_fields");
  }

  const pdfBuffer = decodePdfBase64(fileBase64);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const submission = await loadSubmissionForIngest(client, sid);
    if (!submission) {
      throw new Error("submission_not_found");
    }
    await assertNoExistingQuote(client, submission.submission_id);

    const carrierMessageRes = await client.query(
      `
        INSERT INTO carrier_messages (
          submission_id, segment, direction, carrier_name,
          from_email, to_email, subject, body_text, received_at
        )
        VALUES ($1, $2::segment_type, 'inbound', $3, 'operator@manual', NULL, $4, $5, NOW())
        RETURNING carrier_message_id
      `,
      [
        submission.submission_id,
        submission.segment,
        carrierName || "Unknown carrier",
        `Manual carrier quote — ${sid}`,
        note || "Operator manual carrier quote upload",
      ],
    );
    const carrierMessageId = carrierMessageRes.rows[0].carrier_message_id;

    const documentId = await storeCarrierQuotePdf(client, {
      pdfBuffer,
      filename,
      segment: submission.segment,
      storageKeyPart: `manual-${submission.submission_id}`,
      clientId: submission.client_id,
      submissionId: submission.submission_id,
      quoteId: null,
    });

    const { quoteId, workQueueItemId } = await finalizeQuoteIngest(client, {
      submission,
      carrierMessageId,
      carrierName,
      documentIds: documentId ? [documentId] : [],
      reasonCode: "manual_carrier_quote_upload",
      reasonDetail: note || `Manual carrier quote upload for ${sid}`,
    });

    await client.query("COMMIT");

    try {
      await notifyBarCarrierQuoteReceived({ quoteId });
    } catch (err) {
      console.error("[quoteIngestService] notifyBarCarrierQuoteReceived:", err.message || err);
    }

    return {
      success: true,
      submission_public_id: sid,
      quote_id: quoteId,
      work_queue_item_id: workQueueItemId,
      document_id: documentId,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function documentsForCarrierMessage(client, carrierMessageId) {
  const { rows } = await client.query(
    `
      SELECT document_id
      FROM documents
      WHERE document_role = 'carrier_quote_original'
        AND storage_path LIKE '%' || $1::text || '%'
      ORDER BY created_at ASC
    `,
    [carrierMessageId],
  );
  return rows.map((r) => r.document_id);
}

/**
 * Link a poller soft-ingest item (quote_needs_cid) to a submission and open S4.
 */
export async function linkQuoteNeedsCidToSubmission({
  workQueueItemId,
  submissionPublicId,
}) {
  if (!pool) throw new Error("database_not_configured");

  const wqiId = String(workQueueItemId || "").trim();
  const sid = String(submissionPublicId || "").trim().toUpperCase();
  if (!wqiId || !sid) {
    throw new Error("missing_required_fields");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const wqiRes = await client.query(
      `
        SELECT
          wqi.work_queue_item_id,
          wqi.status,
          cm.carrier_message_id,
          cm.segment::text AS segment,
          cm.carrier_name,
          cm.subject
        FROM work_queue_items wqi
        JOIN carrier_messages cm
          ON wqi.related_entity_type = 'carrier_message'
         AND wqi.related_entity_id = cm.carrier_message_id
        WHERE wqi.work_queue_item_id = $1
          AND wqi.queue_type = 'quote_needs_cid'::queue_type
        LIMIT 1
      `,
      [wqiId],
    );
    if (!wqiRes.rows.length) {
      throw new Error("work_queue_item_not_found");
    }
    const wqi = wqiRes.rows[0];
    if (wqi.status !== "open") {
      throw new Error("work_queue_item_not_open");
    }

    const submission = await loadSubmissionForIngest(client, sid);
    if (!submission) {
      throw new Error("submission_not_found");
    }
    if (submission.segment !== wqi.segment) {
      throw new Error("segment_mismatch");
    }
    await assertNoExistingQuote(client, submission.submission_id);

    const documentIds = await documentsForCarrierMessage(client, wqi.carrier_message_id);

    const { quoteId, workQueueItemId: extractionWqiId } = await finalizeQuoteIngest(client, {
      submission,
      carrierMessageId: wqi.carrier_message_id,
      carrierName: wqi.carrier_name,
      documentIds,
      reasonCode: "quote_needs_cid_linked",
      reasonDetail: `Linked poller ingest to ${sid} (subject: ${wqi.subject || "n/a"})`,
    });

    await client.query(
      `
        UPDATE work_queue_items
        SET status = 'resolved',
            resolved_at = NOW(),
            resolved_by = 'operator'
        WHERE work_queue_item_id = $1
          AND status = 'open'
      `,
      [wqiId],
    );

    await client.query("COMMIT");

    try {
      await notifyBarCarrierQuoteReceived({ quoteId });
    } catch (err) {
      console.error("[quoteIngestService] notifyBarCarrierQuoteReceived:", err.message || err);
    }

    return {
      success: true,
      submission_public_id: sid,
      quote_id: quoteId,
      work_queue_item_id: extractionWqiId,
      resolved_work_queue_item_id: wqiId,
      document_ids: documentIds,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
