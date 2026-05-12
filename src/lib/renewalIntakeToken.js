import crypto from "crypto";

const DEFAULT_TTL_SEC = 15 * 60;

export function getRenewalIntakeTokenSecret() {
  return String(process.env.RENEWAL_INTAKE_TOKEN_SECRET || process.env.CONNECT_RENEWAL_TOKEN_SECRET || "").trim();
}

/** Public segment intake roots (Netlify); renewal_token query is appended by mint. */
export function segmentIntakeBaseUrl(segment) {
  const m = {
    bar: "https://www.barinsurancedirect.com/",
    plumber: "https://www.plumberinsurancedirect.com/",
    roofer: "https://roofingcontractorinsurancedirect.com/",
    hvac: "https://www.hvacinsurancedirect.com/",
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
  const exp = Math.floor(Date.now() / 1000) + DEFAULT_TTL_SEC;
  const body = JSON.stringify({
    policyId: String(policyId),
    clientId: String(clientId),
    segment: String(segment || "bar").toLowerCase(),
    exp,
  });
  const payload = Buffer.from(body, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, expiresInSec: DEFAULT_TTL_SEC };
}

/**
 * @returns {{ policyId: string, clientId: string, segment: string, exp: number } | null}
 */
export function verifyRenewalIntakeToken(token) {
  const secret = getRenewalIntakeTokenSecret();
  if (!secret || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!json.policyId || !json.clientId || !json.exp) return null;
    if (json.exp < Math.floor(Date.now() / 1000)) return null;
    return json;
  } catch {
    return null;
  }
}
