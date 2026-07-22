import crypto from "crypto";
import { getPool } from "../db.js";
import { uploadBuffer } from "./r2Service.js";
import {
  DocumentRole,
  DocumentType,
  StorageProvider,
} from "../constants/postgresEnums.js";
import {
  getCoterieSecretKey,
  getPolicyDocLinks,
  normalizeCoterieDocLinks,
} from "./coterieService.js";
import { indexCoterieCoverageForChat } from "./coterieCoverageData.js";

const DOC_RETRY_MS = Number(process.env.COTERIE_DOC_RETRY_MS || 15000);

function safeFilename(name) {
  return (
    String(name || "coterie-policy.pdf")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .slice(0, 120) || "coterie-policy.pdf"
  );
}

function inferDocumentRole(name, url) {
  const blob = `${name || ""} ${url || ""}`.toLowerCase();
  if (/\bdec(laration)?s?\b/.test(blob)) {
    return DocumentRole.DECLARATIONS_ORIGINAL;
  }
  if (/\bendorsement/.test(blob)) {
    return DocumentRole.ENDORSEMENT;
  }
  return DocumentRole.POLICY_ORIGINAL;
}

function extractPolicyWebhookFields(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  return {
    policyId: body.PolicyId || body.policyId || null,
    policyNumber: body.PolicyNumber || body.policyNumber || null,
    docsGenerated: body.DocsGenerated === true,
    status: body.Status || body.status || null,
    modifiedOn: body.ModifiedOn || body.modifiedOn || null,
  };
}

async function findPolicyForWebhook(client, { partnerLeadId, policyNumber, policyId }) {
  if (partnerLeadId) {
    const bySubmission = await client.query(
      `
        SELECT p.*, s.submission_public_id, s.client_id
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        WHERE s.submission_public_id = $1
        ORDER BY p.bound_at DESC NULLS LAST, p.created_at DESC
        LIMIT 1
      `,
      [partnerLeadId],
    );
    if (bySubmission.rows.length) return bySubmission.rows[0];
  }

  if (policyNumber) {
    const byCarrierNum = await client.query(
      `
        SELECT p.*, s.submission_public_id, s.client_id
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        WHERE p.coverage_data->>'carrier_policy_number' = $1
           OR p.policy_number = $1
        ORDER BY p.bound_at DESC NULLS LAST
        LIMIT 1
      `,
      [policyNumber],
    );
    if (byCarrierNum.rows.length) return byCarrierNum.rows[0];
  }

  if (policyId) {
    const byCoterieId = await client.query(
      `
        SELECT p.*, s.submission_public_id, s.client_id
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        WHERE p.coverage_data->>'coterie_policy_id' = $1
        ORDER BY p.bound_at DESC NULLS LAST
        LIMIT 1
      `,
      [policyId],
    );
    if (byCoterieId.rows.length) return byCoterieId.rows[0];
  }

  return null;
}

async function webhookAlreadyProcessed(client, policyId, dedupeKey) {
  if (!dedupeKey) return false;
  const res = await client.query(
    `
      SELECT 1
      FROM timeline_events
      WHERE event_type = 'coterie.policy.docs_ingested'
        AND (event_payload_json->>'policy_id')::uuid = $1::uuid
        AND event_payload_json->>'dedupe_key' = $2
      LIMIT 1
    `,
    [policyId, dedupeKey],
  );
  return res.rows.length > 0;
}

async function fetchCoterieDocBuffer(url) {
  const secretKey = getCoterieSecretKey();
  const headers = secretKey ? { Authorization: `token ${secretKey}` } : {};
  let res = await fetch(url, { headers });
  if (!res.ok && secretKey) {
    res = await fetch(url);
  }
  if (!res.ok) {
    throw new Error(`Coterie doc download failed (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    throw new Error("Coterie doc download empty");
  }
  return buf;
}

async function ingestDocLinks(client, policy, policyNumber, docLinks) {
  const segment = String(policy.segment || "bar").toLowerCase();
  const submissionPublicId = policy.submission_public_id;
  let ingested = 0;

  for (const link of docLinks) {
    const url = link.url;
    if (!url) continue;

    const filename = safeFilename(link.name);
    let pdfBuffer;
    try {
      pdfBuffer = await fetchCoterieDocBuffer(url);
    } catch (err) {
      console.warn("[coterie doc ingest] download failed", {
        policyNumber,
        url,
        message: err.message,
      });
      continue;
    }

    const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const existing = await client.query(
      `
        SELECT document_id
        FROM documents
        WHERE policy_id = $1::uuid AND sha256_hash = $2
        LIMIT 1
      `,
      [policy.id, sha256],
    );
    if (existing.rows.length) continue;

    const storagePath = `coterie/${segment}/${submissionPublicId}/${policyNumber}/${filename}`;
    const documentRole = inferDocumentRole(filename, url);

    await uploadBuffer(storagePath, pdfBuffer, "application/pdf", {
      segment,
      type: documentRole,
      carrier_policy_number: policyNumber,
    });

    await client.query(
      `
        INSERT INTO documents (
          client_id, submission_id, quote_id, policy_id,
          document_type, document_role, storage_provider,
          storage_path, mime_type, sha256_hash, is_original, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 'system')
      `,
      [
        policy.client_id,
        policy.submission_id,
        policy.quote_id || null,
        policy.id,
        DocumentType.PDF,
        documentRole,
        StorageProvider.R2,
        storagePath,
        "application/pdf",
        sha256,
      ],
    );
    ingested += 1;
  }

  return ingested;
}

async function mergePolicyCoverageFromWebhook(client, policy, payload, fields) {
  const cov =
    policy.coverage_data && typeof policy.coverage_data === "object"
      ? { ...policy.coverage_data }
      : {};

  if (fields.policyId) cov.coterie_policy_id = fields.policyId;
  if (fields.policyNumber) cov.carrier_policy_number = fields.policyNumber;
  if (fields.status) cov.coterie_policy_status = fields.status;
  cov.coterie_webhook_last = {
    PolicyId: fields.policyId,
    PolicyNumber: fields.policyNumber,
    DocsGenerated: fields.docsGenerated,
    Status: fields.status,
    ModifiedOn: fields.modifiedOn,
    receivedAt: new Date().toISOString(),
  };

  if (payload?.Premium != null && !cov.annual_premium) {
    cov.annual_premium = Number(payload.Premium) || cov.annual_premium;
  }

  const hasDocs = await client.query(
    `
      SELECT 1 FROM documents
      WHERE policy_id = $1::uuid
        AND document_role IN ('policy_original', 'declarations_original')
      LIMIT 1
    `,
    [policy.id],
  );

  cov.summary_note = hasDocs.rows.length
    ? "Coverage from ConnectQuote bindable quote; policy PDFs in Connect vault."
    : cov.summary_note;

  await client.query(
    `
      UPDATE policies
      SET coverage_data = $2::jsonb, updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [policy.id, cov],
  );

  return cov;
}

async function syncCoteriePolicyWebhookMetadata({
  partnerLeadId,
  payload,
  fields,
}) {
  const pool = getPool();
  if (!pool) return { ok: false };

  const client = await pool.connect();
  try {
    const policy = await findPolicyForWebhook(client, {
      partnerLeadId,
      policyNumber: fields.policyNumber,
      policyId: fields.policyId,
    });
    if (!policy) return { ok: true, missing: true };

    await mergePolicyCoverageFromWebhook(client, policy, payload, fields);
    return { ok: true, policy_id: policy.id };
  } finally {
    client.release();
  }
}

/**
 * Coterie policy webhook — doc notification + status sync (bind already finalized at checkout).
 */
export async function processCoteriePolicyWebhook(payload, meta = {}) {
  const pool = getPool();
  if (!pool) {
    console.warn("[coterie webhook] no DB pool — skipping");
    return { ok: false, reason: "no_db" };
  }

  const fields = extractPolicyWebhookFields(payload);
  const partnerLeadId =
    meta.partnerLeadId ||
    payload?.ExternalId ||
    payload?.externalId ||
    null;

  console.log("[coterie webhook] policy event", {
    partnerLeadId,
    policyId: fields.policyId,
    policyNumber: fields.policyNumber,
    docsGenerated: fields.docsGenerated,
    status: fields.status,
    eventId: meta.eventId,
  });

  if (!partnerLeadId && !fields.policyNumber && !fields.policyId) {
    return { ok: true, ignored: true, reason: "no_correlation" };
  }

  if (!fields.docsGenerated) {
    if (partnerLeadId || fields.policyNumber || fields.policyId) {
      await syncCoteriePolicyWebhookMetadata({
        partnerLeadId,
        payload,
        fields,
        meta,
      });
    }
    if (!meta.isRetry && fields.policyNumber) {
      scheduleCoterieDocIngestRetry(payload, {
        ...meta,
        partnerLeadId,
        isRetry: true,
      });
    }
    return {
      ok: true,
      acknowledged: true,
      docsGenerated: false,
      retryScheduled: !meta.isRetry && !!fields.policyNumber,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const policy = await findPolicyForWebhook(client, {
      partnerLeadId,
      policyNumber: fields.policyNumber,
      policyId: fields.policyId,
    });

    if (!policy) {
      await client.query("ROLLBACK");
      console.warn("[coterie webhook] policy not found", {
        partnerLeadId,
        policyNumber: fields.policyNumber,
      });
      if (!meta.isRetry && (partnerLeadId || fields.policyNumber)) {
        scheduleCoterieDocIngestRetry(payload, {
          ...meta,
          partnerLeadId,
          isRetry: true,
        });
      }
      return {
        ok: true,
        missing: true,
        reason: "policy_not_found",
        retryScheduled: !meta.isRetry,
      };
    }

    const dedupeKey =
      fields.modifiedOn ||
      fields.policyId ||
      meta.eventId ||
      fields.policyNumber ||
      null;

    if (await webhookAlreadyProcessed(client, policy.id, dedupeKey)) {
      await client.query("COMMIT");
      return { ok: true, duplicate: true };
    }

    const policyNumber = fields.policyNumber || policy.coverage_data?.carrier_policy_number;
    if (!policyNumber) {
      await client.query("ROLLBACK");
      return { ok: true, missing: true, reason: "policy_number_missing" };
    }

    const linksResponse = await getPolicyDocLinks(policyNumber);
    const docLinks = normalizeCoterieDocLinks(linksResponse);
    if (!docLinks.length) {
      await client.query("ROLLBACK");
      console.warn("[coterie webhook] no doc links returned", { policyNumber });
      return { ok: true, missing: true, reason: "no_doc_links" };
    }

    const ingested = await ingestDocLinks(client, policy, policyNumber, docLinks);
    const coverageData = await mergePolicyCoverageFromWebhook(
      client,
      policy,
      payload,
      fields,
    );

    await client.query(
      `
        INSERT INTO timeline_events (
          client_id, submission_id, quote_id,
          event_type, event_label, event_payload_json, created_by
        )
        VALUES ($1, $2, $3, 'coterie.policy.docs_ingested', 'Coterie policy documents ingested', $4, 'system')
      `,
      [
        policy.client_id,
        policy.submission_id,
        policy.quote_id || null,
        {
          policy_id: policy.id,
          submission_public_id: policy.submission_public_id,
          carrier_policy_number: policyNumber,
          coterie_policy_id: fields.policyId,
          documents_ingested: ingested,
          dedupe_key: dedupeKey,
          event_id: meta.eventId || null,
        },
      ],
    );

    await client.query("COMMIT");

    try {
      const indexClient = await pool.connect();
      try {
        await indexCoterieCoverageForChat(indexClient, {
          policyId: policy.id,
          clientId: policy.client_id,
          submissionId: policy.submission_id,
          segment: String(policy.segment || "bar").toLowerCase(),
          coverageData,
        });
      } finally {
        indexClient.release();
      }
    } catch (indexErr) {
      console.warn(
        "[coterie webhook] chat index refresh failed:",
        indexErr.message || indexErr,
      );
    }

    return { ok: true, ingested, policy_id: policy.id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function scheduleCoterieDocIngestRetry(payload, meta = {}) {
  const timer = setTimeout(() => {
    processCoteriePolicyWebhook(payload, meta).catch((err) => {
      console.error("[coterie webhook] doc retry failed:", err.message || err);
    });
  }, DOC_RETRY_MS);
  if (typeof timer.unref === "function") timer.unref();
}
