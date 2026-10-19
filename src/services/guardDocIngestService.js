import crypto from "crypto";
import { getPool } from "../db.js";
import { deleteObject, uploadBuffer } from "./r2Service.js";
import {
  DocumentRole,
  DocumentType,
  StorageProvider,
} from "../constants/postgresEnums.js";

/**
 * GUARD document webhook → R2 + documents row (same catalog Coterie uses).
 *
 * Am I Covered already answers from coverage_data indexed at bind. Stored PDF
 * text for policy_original and declarations_original is picked up by the
 * existing policy indexer once policy_id is set. No second chat pipeline.
 */

const PENDING_ROOT = "guard/pending/";

export function guardDocumentRoleFromFileName(fileName) {
  const name = String(fileName || "").toLowerCase();
  if (/(^|[^a-z])proposal([^a-z]|$)/.test(name)) {
    return DocumentRole.CARRIER_QUOTE_ORIGINAL;
  }
  if (
    /(^|[^a-z])declarations?([^a-z]|$)/.test(name) ||
    /(^|[^a-z])decs?([^a-z]|$)/.test(name)
  ) {
    return DocumentRole.DECLARATIONS_ORIGINAL;
  }
  return DocumentRole.POLICY_ORIGINAL;
}

export function safeGuardPolicyNumber(policyNumber) {
  const safe = String(policyNumber || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 40);
  return safe || null;
}

export function safeGuardFileName(fileName) {
  return (
    String(fileName || "guard-policy.pdf")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .slice(0, 120) || "guard-policy.pdf"
  );
}

export function decodeGuardFileContent(fileContent) {
  if (fileContent == null) return { buffer: null, error: "missing_file" };
  if (typeof fileContent !== "string") {
    return { buffer: null, error: "invalid_base64" };
  }
  const trimmed = fileContent.trim();
  if (!trimmed) return { buffer: null, error: "missing_file" };
  const b64 = trimmed.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { buffer: null, error: "invalid_base64" };
  }
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) return { buffer: null, error: "missing_file" };
  return { buffer, error: null };
}

export function guardDocSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function likePrefix(prefix) {
  return `${String(prefix).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function pendingGuardDocLike(policyNumber) {
  const safe = safeGuardPolicyNumber(policyNumber);
  if (!safe) return null;
  return likePrefix(`${PENDING_ROOT}${safe}/`);
}

export function guardDocStoragePath({ policy, policyNumber, fileName, sha256 }) {
  const safeNum = safeGuardPolicyNumber(policyNumber);
  const filename = `${String(sha256 || "").slice(0, 12)}-${safeGuardFileName(fileName)}`;
  if (!policy) return `${PENDING_ROOT}${safeNum}/${filename}`;
  const segment =
    String(policy.segment || "wc")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") || "wc";
  const submission =
    String(policy.submission_public_id || "nosub")
      .replace(/[^A-Za-z0-9._-]/g, "")
      .slice(0, 80) || "nosub";
  return `guard/${segment}/${submission}/${safeNum}/${filename}`;
}

function publicResult(fields) {
  const out = {
    received: Boolean(fields.received),
    saved: Boolean(fields.saved),
    pending: Boolean(fields.pending),
    duplicate: Boolean(fields.duplicate),
    policy_id: fields.policy_id || null,
    document_id: fields.document_id || null,
    document_role: fields.document_role || null,
  };
  if (fields.error) out.error = fields.error;
  return out;
}

async function findGuardPolicy(client, policyNumber) {
  const res = await client.query(
    `
      SELECT
        p.id,
        p.policy_number,
        p.client_id,
        p.submission_id,
        p.quote_id,
        p.segment,
        s.submission_public_id
      FROM policies p
      LEFT JOIN submissions s ON s.submission_id = p.submission_id
      WHERE p.policy_number = $1
         OR p.coverage_data->>'guard_policy_number' = $1
      ORDER BY p.bound_at DESC NULLS LAST, p.created_at DESC
      LIMIT 1
    `,
    [policyNumber],
  );
  return res.rows[0] || null;
}

async function findGuardDocByContent(client, policyNumber, sha256) {
  const like = pendingGuardDocLike(policyNumber);
  const res = await client.query(
    `
      SELECT d.document_id, d.policy_id, d.document_role::text AS document_role
      FROM documents d
      LEFT JOIN policies p ON p.id = d.policy_id
      WHERE d.sha256_hash = $1
        AND (
          d.storage_path LIKE $2 ESCAPE '\\'
          OR p.policy_number = $3
          OR p.coverage_data->>'guard_policy_number' = $3
        )
      LIMIT 1
    `,
    [sha256, like, policyNumber],
  );
  return res.rows[0] || null;
}

export async function attachPendingGuardDocs(
  client,
  { policyId, policyNumber, clientId, submissionId, quoteId },
) {
  const like = pendingGuardDocLike(policyNumber);
  if (!policyId || !like) return [];
  const res = await client.query(
    `
      UPDATE documents
      SET
        policy_id = $1::uuid,
        client_id = COALESCE(client_id, $2::uuid),
        submission_id = COALESCE(submission_id, $3::uuid),
        quote_id = COALESCE(quote_id, $4::uuid)
      WHERE policy_id IS NULL
        AND storage_path LIKE $5 ESCAPE '\\'
      RETURNING document_id
    `,
    [policyId, clientId || null, submissionId || null, quoteId || null, like],
  );
  return res.rows.map((row) => row.document_id);
}

async function attachIfPolicy(client, policy, policyNumber) {
  if (!policy?.id) return false;
  await client.query("SAVEPOINT guard_doc_attach");
  try {
    const attached = await attachPendingGuardDocs(client, {
      policyId: policy.id,
      policyNumber,
      clientId: policy.client_id,
      submissionId: policy.submission_id,
      quoteId: policy.quote_id,
    });
    await client.query("RELEASE SAVEPOINT guard_doc_attach");
    if (attached.length) {
      console.log("[guard webhook] attached pending docs", {
        policyNumber,
        count: attached.length,
      });
    }
    return true;
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT guard_doc_attach").catch(() => {});
    console.error("[guard webhook] pending attach failed", {
      policyNumber,
      message: err?.message || String(err),
    });
    return false;
  }
}

export async function processGuardDocWebhook(payload, deps = {}) {
  const upload = deps.uploadBuffer || uploadBuffer;
  const removeObject = deps.deleteObject || deleteObject;
  const poolFactory = deps.getPool || getPool;

  try {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return publicResult({ received: false, error: "invalid_payload" });
    }

    const policyNumber = String(payload.policyNumber || "").trim();
    const fileName = payload.fileName || null;
    if (!policyNumber) {
      return publicResult({ received: false, error: "missing_policy_number" });
    }

    const documentRole = guardDocumentRoleFromFileName(fileName);
    const safeNum = safeGuardPolicyNumber(policyNumber);
    if (!safeNum) {
      console.error("[guard webhook] save failed", {
        policyNumber,
        fileName,
        message: "invalid_policy_number",
      });
      return publicResult({
        received: true,
        document_role: documentRole,
        error: "invalid_policy_number",
      });
    }

    const decoded = decodeGuardFileContent(payload.fileContent);
    if (!decoded.buffer) {
      return publicResult({
        received: true,
        document_role: documentRole,
        error: decoded.error || "missing_file",
      });
    }

    const sha256 = guardDocSha256(decoded.buffer);
    const declaredSize = Number(payload.fileSize);
    if (Number.isFinite(declaredSize) && declaredSize !== decoded.buffer.length) {
      console.warn("[guard webhook] file size mismatch", {
        policyNumber,
        fileName,
        declaredSize,
        decodedBytes: decoded.buffer.length,
      });
    }

    const pool = poolFactory();
    if (!pool) {
      console.error("[guard webhook] save failed", {
        policyNumber,
        fileName,
        message: "database_not_configured",
      });
      return publicResult({
        received: true,
        document_role: documentRole,
        error: "database_not_configured",
      });
    }

    const client = await pool.connect();
    let storagePath = null;
    let uploaded = false;
    try {
      await client.query("BEGIN");
      let policy = await findGuardPolicy(client, policyNumber);
      const existing = await findGuardDocByContent(client, policyNumber, sha256);
      if (existing) {
        let linked = Boolean(existing.policy_id);
        if (policy && !linked) {
          linked = await attachIfPolicy(client, policy, policyNumber);
        } else if (policy) {
          await attachIfPolicy(client, policy, policyNumber);
          linked = true;
        }
        await client.query("COMMIT");
        return publicResult({
          received: true,
          saved: false,
          pending: !linked,
          duplicate: true,
          policy_id: linked ? existing.policy_id || policy?.id || null : null,
          document_id: existing.document_id,
          document_role: existing.document_role || documentRole,
        });
      }

      policy = (await findGuardPolicy(client, policyNumber)) || policy;
      const insertedWithPolicy = Boolean(policy?.id);
      storagePath = guardDocStoragePath({
        policy,
        policyNumber,
        fileName,
        sha256,
      });

      await upload(storagePath, decoded.buffer, "application/pdf", {
        segment: policy ? String(policy.segment || "wc") : "pending",
        type: documentRole,
        carrier_policy_number: safeNum,
      });
      uploaded = true;

      const inserted = await client.query(
        `
          INSERT INTO documents (
            client_id, submission_id, quote_id, policy_id,
            document_type, document_role, storage_provider,
            storage_path, mime_type, sha256_hash, is_original, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 'system')
          RETURNING document_id
        `,
        [
          policy?.client_id || null,
          policy?.submission_id || null,
          policy?.quote_id || null,
          policy?.id || null,
          DocumentType.PDF,
          documentRole,
          StorageProvider.R2,
          storagePath,
          "application/pdf",
          sha256,
        ],
      );
      const documentId = inserted.rows[0]?.document_id || null;

      if (!policy) policy = await findGuardPolicy(client, policyNumber);
      let linked = insertedWithPolicy;
      if (policy && !insertedWithPolicy) {
        linked = await attachIfPolicy(client, policy, policyNumber);
      } else if (policy) {
        await attachIfPolicy(client, policy, policyNumber);
        linked = true;
      }

      await client.query("COMMIT");

      console.log("[guard webhook] stored", {
        policyNumber,
        fileName,
        documentRole,
        pending: !linked,
        bytes: decoded.buffer.length,
        sha256Prefix: sha256.slice(0, 12),
      });

      return publicResult({
        received: true,
        saved: true,
        pending: !linked,
        duplicate: false,
        policy_id: linked ? policy?.id || null : null,
        document_id: documentId,
        document_role: documentRole,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (uploaded && storagePath) {
        await removeObject(storagePath).catch((removeErr) => {
          console.error("[guard webhook] r2 cleanup failed", {
            policyNumber,
            fileName,
            message: removeErr?.message || String(removeErr),
          });
        });
      }
      console.error("[guard webhook] save failed", {
        policyNumber,
        fileName,
        message: err?.message || String(err),
      });
      return publicResult({
        received: true,
        document_role: documentRole,
        error: "save_failed",
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[guard webhook] save failed", {
      policyNumber: payload && typeof payload === "object" ? payload.policyNumber || null : null,
      fileName: payload && typeof payload === "object" ? payload.fileName || null : null,
      message: err?.message || String(err),
    });
    return publicResult({
      received: Boolean(payload && typeof payload === "object" && payload.policyNumber),
      error: "save_failed",
    });
  }
}
