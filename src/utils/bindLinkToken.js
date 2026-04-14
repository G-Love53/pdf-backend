import crypto from "crypto";

function getSecret() {
  return String(process.env.BIND_LINK_HMAC_SECRET || "").trim();
}

function payloadString({ quoteId, submissionPublicId, exp }) {
  return `${String(quoteId || "").trim()}|${String(submissionPublicId || "").trim()}|${String(exp || "").trim()}`;
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Build signed bind-link query params.
 * @param {{ quoteId: string, submissionPublicId: string, ttlSeconds?: number }} input
 */
export function createSignedBindLinkParams(input) {
  const secret = getSecret();
  if (!secret) return null;
  const ttl = Number(input?.ttlSeconds || process.env.BIND_LINK_TTL_SECONDS || 7 * 24 * 60 * 60);
  const exp = Math.floor(Date.now() / 1000) + (Number.isFinite(ttl) && ttl > 0 ? ttl : 7 * 24 * 60 * 60);
  const payload = payloadString({
    quoteId: input?.quoteId,
    submissionPublicId: input?.submissionPublicId,
    exp,
  });
  const token = sign(payload, secret);
  return { t: token, exp: String(exp) };
}

/**
 * Verify signed bind-link query params.
 * @param {{ quoteId: string, submissionPublicId: string, token?: string|null, exp?: string|number|null }} input
 */
export function verifySignedBindLinkParams(input) {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "secret_not_configured" };
  const token = String(input?.token || "").trim();
  const expRaw = String(input?.exp || "").trim();
  if (!token || !expRaw) return { ok: false, reason: "missing_token_or_exp" };
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= 0) return { ok: false, reason: "invalid_exp" };
  const now = Math.floor(Date.now() / 1000);
  if (now > exp) return { ok: false, reason: "expired" };

  const payload = payloadString({
    quoteId: input?.quoteId,
    submissionPublicId: input?.submissionPublicId,
    exp,
  });
  const expected = sign(payload, secret);
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    return ok ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_mismatch" };
  }
}

