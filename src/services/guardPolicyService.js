import crypto from "crypto";
import { getPool } from "../db.js";
import {
  buildGuardCoverageData,
  indexGuardCoverageForChat,
} from "./guardCoverageData.js";
import { createPolicy } from "./policyService.js";
import {
  DocumentRole,
  DocumentType,
  StorageProvider,
} from "../constants/postgresEnums.js";
import { normalizeSegment } from "../utils/rss.js";
import { uploadBuffer } from "./r2Service.js";

/**
 * Minimal S4–S6 spine rows for GUARD WC instant bind (no BoldSign / packet PDF).
 */
async function ensureGuardPipelineRows(client, {
  submission,
  clientRow,
  guardPolicyNumber,
  reviewed,
  clickwrapName,
}) {
  const segment = normalizeSegment(submission.segment);
  const carrierRef = `guard:${guardPolicyNumber}`;

  const existingQuote = await client.query(
    `
      SELECT q.quote_id, br.id AS bind_request_id
      FROM quotes q
      LEFT JOIN bind_requests br ON br.quote_id = q.quote_id
      WHERE q.submission_id = $1
        AND q.carrier_quote_ref = $2
      LIMIT 1
    `,
    [submission.submission_id, carrierRef],
  );

  if (existingQuote.rows.length > 0) {
    return {
      quote_id: existingQuote.rows[0].quote_id,
      bind_request_id: existingQuote.rows[0].bind_request_id,
      reviewed_json: reviewed,
    };
  }

  const snapshotJson = JSON.stringify({
    guard: reviewed,
    bound_at: new Date().toISOString(),
  });
  const sha = crypto.createHash("sha256").update(snapshotJson).digest("hex");
  const storagePath = `guard/${segment}/${submission.submission_public_id}/${guardPolicyNumber}-wc.json`;

  await uploadBuffer(storagePath, Buffer.from(snapshotJson, "utf8"), "application/json", {
    segment,
    type: "guard_wc_quote_snapshot",
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
      carrierRef,
    ],
  );
  const quoteId = quoteRes.rows[0].quote_id;

  const extractionRes = await client.query(
    `
      INSERT INTO quote_extractions (
        quote_id, source_document_id, model_name, raw_extraction_json,
        reviewed_json, review_status, reviewed_by, reviewed_at, is_active
      )
      VALUES ($1, $2, 'guard-api', $3, $4, 'approved', 'system', NOW(), TRUE)
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
    clickwrapName ||
    [clientRow.first_name, clientRow.last_name].filter(Boolean).join(" ") ||
    "Insured";

  const bindRes = await client.query(
    `
      INSERT INTO bind_requests (
        quote_id, packet_id, hellosign_request_id,
        signer_name, signer_email, payment_method, status,
        initiated_by, initiated_at, signed_at
      )
      VALUES ($1, $2, $3, $4, $5, 'guard_direct_bill', 'signed', NULL, NOW(), NOW())
      RETURNING id
    `,
    [quoteId, packetId, guardPolicyNumber, signerName, signerEmail],
  );

  return {
    quote_id: quoteId,
    bind_request_id: bindRes.rows[0].id,
    reviewed_json: reviewed,
  };
}

/**
 * GUARD BND success → policies row for Connect (`GET /api/connect/policies`).
 */
export async function finalizeGuardBind({
  submissionPublicId,
  session,
  parsed,
  clickwrapName,
}) {
  const pool = getPool();
  if (!pool) throw new Error("Database not configured");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const subRes = await client.query(
      `
        SELECT s.*, c.client_id, c.primary_email, c.first_name, c.last_name
        FROM submissions s
        LEFT JOIN clients c ON c.client_id = s.client_id
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
    if (!submission.client_id) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "CLIENT_REQUIRED",
        message:
          "Submission has no client — complete BOP/GL bind (or create client) before WC appears in Connect.",
      };
    }

    const guardPolicyNumber = parsed?.policyNumber || session?.policyNumber;
    if (!guardPolicyNumber) {
      await client.query("ROLLBACK");
      return { ok: false, error: "GUARD_POLICY_NUMBER_MISSING" };
    }

    const clientRow = {
      client_id: submission.client_id,
      primary_email: submission.primary_email,
      first_name: submission.first_name,
      last_name: submission.last_name,
    };

    const reviewed = buildGuardCoverageData({ session, parsed, submission });

    const pipeline = await ensureGuardPipelineRows(client, {
      submission,
      clientRow,
      guardPolicyNumber,
      reviewed,
      clickwrapName,
    });

    const quoteRes = await client.query(
      `SELECT * FROM quotes WHERE quote_id = $1`,
      [pipeline.quote_id],
    );
    const bindRes = await client.query(
      `SELECT * FROM bind_requests WHERE id = $1`,
      [pipeline.bind_request_id],
    );

    const policy = await createPolicy({
      client: clientRow,
      submission,
      quote: {
        ...quoteRes.rows[0],
        carrier_name: reviewed.carrier_name,
        policy_type: reviewed.policy_type,
        annual_premium: reviewed.annual_premium,
        effective_date: reviewed.effective_date,
        expiration_date: reviewed.expiration_date,
      },
      bindRequest: bindRes.rows[0],
      extraction: { reviewed_json: pipeline.reviewed_json },
      txClient: client,
      policyNumberOverride: guardPolicyNumber,
    });

    await indexGuardCoverageForChat(client, {
      policyId: policy.id,
      clientId: clientRow.client_id,
      submissionId: submission.submission_id,
      segment: normalizeSegment(submission.segment),
      coverageData: policy.coverage_data || reviewed,
    });

    await client.query(
      `
        INSERT INTO timeline_events (
          submission_id, quote_id, event_type, event_label, event_payload_json, created_by
        )
        VALUES ($1, $2, 'guard.policy.created', 'GUARD WC policy in Connect', $3, 'system')
      `,
      [
        submission.submission_id,
        pipeline.quote_id,
        {
          policy_id: policy.id,
          policy_number: policy.policy_number,
          guard_policy_number: guardPolicyNumber,
        },
      ],
    );

    await client.query("COMMIT");

    console.log("[guardPolicyService] Connect policy ready", {
      policy_id: policy.id,
      policy_number: policy.policy_number,
      submission_public_id: submissionPublicId,
    });

    return {
      ok: true,
      policy_id: policy.id,
      policy_number: policy.policy_number,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
