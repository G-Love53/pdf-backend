import crypto from "crypto";
import {
  buildCoterieCoverageData,
  indexCoterieCoverageForChat,
} from "./coterieCoverageData.js";
import { getPool } from "../db.js";
import { uploadBuffer } from "./r2Service.js";
import { createPolicy } from "./policyService.js";
import {
  sendBindConfirmationEmail,
  sendWelcomeEmail,
} from "./bindEmailService.js";
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
 * Create minimal S4–S6 spine rows for Coterie instant bind (no carrier email / BoldSign).
 */
async function ensureCoteriePipelineRows(client, {
  submission,
  clientRow,
  quoteSummary,
  bindResult,
}) {
  const reviewed = buildCoterieCoverageData({
    quoteSummary,
    submission,
    bindResult,
  });
  const segment = normalizeSegment(submission.segment);
  const coterieQuoteId = quoteSummary.quoteId;

  const existingQuote = await client.query(
    `
      SELECT q.quote_id, br.id AS bind_request_id
      FROM quotes q
      LEFT JOIN bind_requests br ON br.quote_id = q.quote_id
      WHERE q.submission_id = $1
        AND q.carrier_quote_ref = $2
      LIMIT 1
    `,
    [submission.submission_id, coterieQuoteId],
  );

  if (existingQuote.rows.length > 0) {
    return existingQuote.rows[0];
  }

  const snapshotJson = JSON.stringify({
    coterie: quoteSummary.raw || quoteSummary,
    bind: bindResult?.result || null,
  });
  const sha = crypto.createHash("sha256").update(snapshotJson).digest("hex");
  const storagePath = `coterie/${segment}/${submission.submission_public_id}/${coterieQuoteId}-quote.json`;

  await uploadBuffer(storagePath, Buffer.from(snapshotJson, "utf8"), "application/json", {
    segment,
    type: "coterie_quote_snapshot",
  });

  const docRes = await client.query(
    `
      INSERT INTO documents (
        client_id, submission_id, document_type, document_role,
        storage_provider, storage_path, mime_type, sha256_hash, is_original, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 'system')
      RETURNING document_id
    `,
    [
      clientRow.client_id,
      submission.submission_id,
      DocumentType.JSON,
      DocumentRole.CARRIER_QUOTE_ORIGINAL,
      StorageProvider.R2,
      storagePath,
      "application/json",
      sha,
    ],
  );
  const sourceDocumentId = docRes.rows[0].document_id;

  const quoteRes = await client.query(
    `
      INSERT INTO quotes (
        submission_id, carrier_name, segment, status, premium,
        effective_date, expiration_date, carrier_quote_ref, packet_ready
      )
      VALUES ($1, $2, $3::segment_type, 'accepted', $4, $5::date, $6::date, $7, TRUE)
      RETURNING quote_id
    `,
    [
      submission.submission_id,
      reviewed.carrier_name,
      segment,
      reviewed.annual_premium,
      reviewed.effective_date,
      reviewed.expiration_date,
      coterieQuoteId,
    ],
  );
  const quoteId = quoteRes.rows[0].quote_id;

  const extractionRes = await client.query(
    `
      INSERT INTO quote_extractions (
        quote_id, source_document_id, model_name, raw_extraction_json,
        reviewed_json, review_status, reviewed_by, reviewed_at, is_active
      )
      VALUES ($1, $2, 'coterie-api', $3, $4, 'approved', 'system', NOW(), TRUE)
      RETURNING quote_extraction_id
    `,
    [quoteId, sourceDocumentId, snapshotJson, reviewed],
  );
  const extractionId = extractionRes.rows[0].quote_extraction_id;

  const packetDocRes = await client.query(
    `
      INSERT INTO documents (
        client_id, submission_id, quote_id, document_type, document_role,
        storage_provider, storage_path, mime_type, sha256_hash, is_original, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, 'system')
      RETURNING document_id
    `,
    [
      clientRow.client_id,
      submission.submission_id,
      quoteId,
      DocumentType.JSON,
      DocumentRole.QUOTE_PACKET_SENT,
      StorageProvider.R2,
      storagePath,
      "application/json",
      sha,
    ],
  );
  const packetDocumentId = packetDocRes.rows[0].document_id;

  const packetRes = await client.query(
    `
      INSERT INTO quote_packets (
        quote_id, extraction_id, packet_document_id, status, created_by, sent_at
      )
      VALUES ($1, $2, $3, 'approved', 'system', NOW())
      RETURNING packet_id
    `,
    [quoteId, extractionId, packetDocumentId],
  );
  const packetId = packetRes.rows[0].packet_id;

  const signerEmail = clientRow.primary_email;
  const signerName =
    [clientRow.first_name, clientRow.last_name].filter(Boolean).join(" ") ||
    "Insured";

  const bindRes = await client.query(
    `
      INSERT INTO bind_requests (
        quote_id, packet_id, hellosign_request_id,
        signer_name, signer_email, payment_method, status,
        initiated_by, initiated_at, signed_at
      )
      VALUES ($1, $2, $3, $4, $5, 'annual', 'signed', NULL, NOW(), NOW())
      RETURNING id
    `,
    [quoteId, packetId, coterieQuoteId, signerName, signerEmail],
  );

  return {
    quote_id: quoteId,
    bind_request_id: bindRes.rows[0].id,
    extraction_id: extractionId,
    reviewed_json: reviewed,
  };
}

/**
 * Finalize Coterie bind → policy + emails + submission bound.
 */
export async function finalizeCoterieBind({
  submissionPublicId,
  quoteSummary,
  bindResult,
}) {
  const pool = getPool();
  if (!pool) throw new Error("Database not configured");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const subRes = await client.query(
      `
        SELECT s.*, c.client_id, c.primary_email, c.first_name, c.last_name, c.primary_phone
        FROM submissions s
        JOIN clients c ON c.client_id = s.client_id
        WHERE s.submission_public_id = $1
        FOR UPDATE
      `,
      [submissionPublicId],
    );
    if (!subRes.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, error: "SUBMISSION_NOT_FOUND" };
    }
    const submission = subRes.rows[0];
    const clientRow = {
      client_id: submission.client_id,
      primary_email: submission.primary_email,
      first_name: submission.first_name,
      last_name: submission.last_name,
      contact_name: [submission.first_name, submission.last_name]
        .filter(Boolean)
        .join(" "),
    };

    const pipeline = await ensureCoteriePipelineRows(client, {
      submission,
      clientRow,
      quoteSummary,
      bindResult,
    });

    const quoteRes = await client.query(
      `SELECT * FROM quotes WHERE quote_id = $1`,
      [pipeline.quote_id],
    );
    const bindRes = await client.query(
      `SELECT * FROM bind_requests WHERE id = $1`,
      [pipeline.bind_request_id],
    );
    const extraction = { reviewed_json: pipeline.reviewed_json };

    const policy = await createPolicy({
      client: clientRow,
      submission,
      quote: quoteRes.rows[0],
      bindRequest: bindRes.rows[0],
      extraction,
      txClient: client,
    });

    await indexCoterieCoverageForChat(client, {
      policyId: policy.id,
      clientId: clientRow.client_id,
      submissionId: submission.submission_id,
      segment: normalizeSegment(submission.segment),
      coverageData: policy.coverage_data || reviewed,
    });

    await client.query(
      `
        UPDATE submissions
        SET status = $2
        WHERE submission_id = $1
      `,
      [submission.submission_id, SubmissionStatus.BOUND],
    );

    await client.query(
      `
        UPDATE quotes SET status = 'accepted', updated_at = NOW() WHERE quote_id = $1
      `,
      [pipeline.quote_id],
    );

    await client.query(
      `
        INSERT INTO timeline_events (
          client_id, submission_id, quote_id,
          event_type, event_label, event_payload_json, created_by
        )
        VALUES ($1, $2, $3, 'coterie.policy.bound', 'Coterie policy bound', $4, 'system')
      `,
      [
        clientRow.client_id,
        submission.submission_id,
        pipeline.quote_id,
        {
          submission_public_id: submissionPublicId,
          coterie_quote_id: quoteSummary.quoteId,
          policy_id: policy.id,
          policy_number: policy.policy_number,
          premium: policy.annual_premium,
        },
      ],
    );

    await client.query("COMMIT");

    const segment = normalizeSegment(submission.segment);
    const connectBase = (
      process.env.CID_APP_URL || "https://app.cid.famous.ai"
    ).replace(/\/$/, "");
    const connectUrl = `${connectBase}/?email=${encodeURIComponent(clientRow.primary_email)}`;

    try {
      await sendBindConfirmationEmail({
        client: clientRow,
        policy,
        segment,
      });
      await sendWelcomeEmail({
        client: clientRow,
        policy,
        cidAppUrl: connectUrl,
        segment,
      });
    } catch (mailErr) {
      console.error("[coterie finalize] email error:", mailErr.message || mailErr);
    }

    return {
      ok: true,
      policy,
      connect_url: connectUrl,
      quote_id: pipeline.quote_id,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
