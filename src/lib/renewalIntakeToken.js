import crypto from "crypto";

/** Default 4h so users can open the link after a coffee break; cap 10d. Override with RENEWAL_INTAKE_TOKEN_TTL_SEC (seconds). */
export function getRenewalIntakeTokenTtlSec() {
  const raw = process.env.RENEWAL_INTAKE_TOKEN_TTL_SEC;
  const n = raw != null ? parseInt(String(raw).trim(), 10) : NaN;
  if (Number.isFinite(n) && n >= 300 && n <= 864000) return n;
  return 4 * 60 * 60;
}

export function getRenewalIntakeTokenSecret() {
  const raw = String(process.env.RENEWAL_INTAKE_TOKEN_SECRET || process.env.CONNECT_RENEWAL_TOKEN_SECRET || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
  return raw;
}

/** Public segment intake roots (Netlify); renewal_token query is appended by mint. */
export function segmentIntakeBaseUrl(segment) {
  const m = {
    bar: "https://www.barinsurancedirect.com/",
    plumber: "https://www.plumberinsurancedirect.com/",
    roofer: "https://roofingcontractorinsurancedirect.com/",
    hvac: "https://hvacinsurancedirect.com/",
    fitness: "https://www.fitnessinsurancedirect.com/",
  };
  const k = String(segment || "bar").toLowerCase();
  return m[k] || m.bar;
}

export function mintRenewalIntakeToken({ policyId, clientId, segment }) {
  const secret = getRenewalIntakeTokenSecret();
  if (!secret) {
    throw new Error("RENEWAL_INTAKE_TOKEN_SECRET (or CONNECT_RENEWAL_TOKEN_SECRET) is not set");
  }
  const ttl = getRenewalIntakeTokenTtlSec();
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const body = JSON.stringify({
    policyId: String(policyId),
    clientId: String(clientId),
    segment: String(segment || "bar").toLowerCase(),
    exp,
  });
  const payload = Buffer.from(body, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, expiresInSec: ttl };
}

/**
 * Normalize token from query string (trim, strip accidental whitespace/newlines from copy-paste).
 * @param {string} raw
 */
export function normalizeRenewalToken(raw) {
  if (raw == null) return "";
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s).trim().replace(/\s+/g, "");
}

/**
 * @returns {{ policyId: string, clientId: string, segment: string, exp: number } | null}
 */
export function verifyRenewalIntakeToken(token) {
  const r = verifyRenewalIntakeTokenResult(token);
  return r.ok ? r.claims : null;
}

/**
 * @returns {{ ok: true, claims: object } | { ok: false, reason: 'missing_secret'|'malformed'|'bad_signature'|'expired'|'bad_payload' }}
 */
export function verifyRenewalIntakeTokenResult(token) {
  const secret = getRenewalIntakeTokenSecret();
  if (!secret) return { ok: false, reason: "missing_secret" };
  const clean = normalizeRenewalToken(token);
  if (!clean) return { ok: false, reason: "malformed" };

  const dot = clean.indexOf(".");
  if (dot < 0) return { ok: false, reason: "malformed" };
  const payload = clean.slice(0, dot);
  const sig = clean.slice(dot + 1);
  if (!payload || !sig) return { ok: false, reason: "malformed" };

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let json;
  try {
    json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (!json.policyId || !json.clientId || !json.exp) return { ok: false, reason: "bad_payload" };
  if (json.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, claims: json };
}
