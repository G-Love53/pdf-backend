import crypto from "crypto";
import { GUARD_DEFAULT_EL_LIMITS } from "../config/guardRegistry.js";

function submissionForm(submission) {
  const raw = submission?.raw_submission_json || {};
  return raw && typeof raw === "object" ? raw : {};
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (v >= 1_000_000) return `$${v / 1_000_000}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

export function formatGuardElLimits(el = GUARD_DEFAULT_EL_LIMITS) {
  const a = formatMoney(el.perAccident);
  const e = formatMoney(el.perEmployee);
  const p = formatMoney(el.perPolicy);
  if (!a || !e || !p) return null;
  return `${a} / ${e} / ${p}`;
}

/**
 * Connect / COI-friendly coverage_data for a bound GUARD WC policy.
 */
export function buildGuardCoverageData({
  session = {},
  parsed = {},
  submission = {},
}) {
  const form = submissionForm(submission);
  const premium = Number(
    session.premium ?? parsed.fullTermAmt ?? form.guard_premium ?? 0,
  );
  const guardPolicyNumber = parsed.policyNumber || session.policyNumber || null;
  const effective = new Date().toISOString().slice(0, 10);
  const expirationDate = new Date(`${effective}T12:00:00Z`);
  expirationDate.setUTCFullYear(expirationDate.getUTCFullYear() + 1);
  const expiration = expirationDate.toISOString().slice(0, 10);
  const el = GUARD_DEFAULT_EL_LIMITS;
  const workersCompLimit = formatGuardElLimits(el);

  return {
    bind_source: "guard",
    policy_type: "WC",
    carrier_name: "GUARD",
    guard_policy_number: guardPolicyNumber,
    annual_premium: Number.isFinite(premium) ? premium : 0,
    effective_date: effective,
    expiration_date: expiration,
    workers_comp_limit: workersCompLimit,
    employers_liability: el,
    legal_entity: session.legalEntityCd || null,
    owner_on_wc: session.ownerIncluded === true,
    rating_classification_cd: session.ratingClassificationCd || null,
    policy_status_cd: parsed.policyStatusCd || session.policyStatusCd || null,
    msg_status_cd: parsed.msgStatusCd || session.msgStatusCd || null,
    clickwrap: session.clickwrap || null,
    payment_method: "guard_direct_bill",
  };
}

function chunkTextByWords(text, wordsPerChunk = 220) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  return chunks;
}

function buildGuardChatIndexText(coverageData, segment) {
  const lines = [
    `Workers' Comp policy (${segment || "commercial"}) bound with GUARD.`,
    `Policy number: ${coverageData.guard_policy_number || "—"}.`,
    `Employers liability limits: ${coverageData.workers_comp_limit || "see declarations"}.`,
    `Annual premium: $${coverageData.annual_premium ?? "—"}.`,
    "Payment is billed directly by GUARD (CID is not merchant of record for WC).",
    "File WC claims through GUARD; Connect stores claim intake for your records.",
  ];
  return lines.join("\n");
}

/** Minimal chat index so Am I Covered? can use WC policy context before dec PDF arrives. */
export async function indexGuardCoverageForChat(
  client,
  { policyId, clientId, submissionId, segment, coverageData },
) {
  if (!policyId || !coverageData) return { indexed: 0 };

  const existing = await client.query(
    `
      SELECT COUNT(*)::int AS n
      FROM policy_document_chunks
      WHERE policy_id = $1::uuid AND index_status = 'indexed'
    `,
    [policyId],
  );
  if (existing.rows[0]?.n > 0) return { indexed: 0, skipped: true };

  const text = buildGuardChatIndexText(coverageData, segment);
  const chunks = chunkTextByWords(text);
  if (!chunks.length) return { indexed: 0 };

  const sha256 = crypto.createHash("sha256").update(text).digest("hex");
  const storagePath = `guard/chat-index/${policyId}.txt`;

  const docRes = await client.query(
    `
      INSERT INTO documents (
        client_id, submission_id, policy_id, document_type, document_role,
        storage_provider, storage_path, mime_type, sha256_hash, is_original, created_by
      )
      VALUES ($1, $2, $3::uuid, 'json', 'coverage_summary_generated', 'r2', $4, 'text/plain', $5, FALSE, 'system')
      RETURNING document_id
    `,
    [clientId, submissionId, policyId, storagePath, sha256],
  );
  const documentId = docRes.rows[0].document_id;

  for (let i = 0; i < chunks.length; i += 1) {
    await client.query(
      `
        INSERT INTO policy_document_chunks (
          policy_id, document_id, document_role, chunk_index, content,
          source_storage_path, source_sha256, index_status
        )
        VALUES ($1::uuid, $2::uuid, 'coverage_summary_generated', $3, $4, $5, $6, 'indexed')
        ON CONFLICT (document_id, chunk_index)
        DO UPDATE SET
          content = EXCLUDED.content,
          index_status = EXCLUDED.index_status,
          updated_at = NOW()
      `,
      [policyId, documentId, i, chunks[i], storagePath, sha256],
    );
  }

  return { indexed: chunks.length };
}
