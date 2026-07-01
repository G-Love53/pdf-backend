/** Roles that count as an uploaded policy / dec page for Am I Covered chat. */
export const UPLOADED_POLICY_DOCUMENT_ROLES = [
  "policy_original",
  "declarations_original",
  "endorsement",
  "signed_bind_docs",
];

/** Shown when coverage questions arrive before policy PDF is in the app. */
export const POLICY_DOCUMENTS_PENDING_REPLY =
  "We don't have your policy documents in the app yet — we expect them soon. Once they're uploaded, I can answer detailed questions about your limits and coverages.";

const META_QUESTION =
  /\b(coi|certificate of insurance|report a claim|file a claim|how do i (get|request)|claims phone|claims number|what is cid|install app|add to home)\b/i;

/**
 * Am I Covered chat — coverage/dec questions need uploaded policy documents.
 * Meta / process questions (claims, COI) may still use carrier knowledge.
 */
export function isPolicyDocumentQuestion(message) {
  const m = String(message || "").trim();
  if (!m) return false;
  if (META_QUESTION.test(m)) return false;
  return true;
}

export function policyDocumentsPendingReply(isFirstTurn = false) {
  if (!isFirstTurn) return POLICY_DOCUMENTS_PENDING_REPLY;
  return `${POLICY_DOCUMENTS_PENDING_REPLY}\n\nCoverage answers are based on your policy documents when they are available.`;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} policyId
 */
export async function policyHasUploadedDocuments(pool, policyId) {
  if (!pool || !policyId) return false;
  try {
    const { rows } = await pool.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM policy_document_chunks pdc
          JOIN documents d ON d.document_id = pdc.document_id
          WHERE pdc.policy_id = $1::uuid
            AND pdc.index_status = 'indexed'
            AND d.document_role::text = ANY($2::text[])
            AND COALESCE(length(trim(pdc.content)), 0) > 0
        ) AS ok
      `,
      [policyId, UPLOADED_POLICY_DOCUMENT_ROLES],
    );
    return rows[0]?.ok === true;
  } catch (e) {
    console.warn("[connectChatPolicyDocs] upload check failed:", e?.message || e);
    return false;
  }
}
