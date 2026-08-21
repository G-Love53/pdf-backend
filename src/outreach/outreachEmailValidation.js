/**
 * Reject scraped / telemetry / vendor emails that pass regex but fail as contacts.
 * Observed on LocalProspects pulls (Aug 2026): Sentry/Wix, review platforms, corporate legal.
 */

const BLOCKED_LOCAL_PARTS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
];

const BLOCKED_DOMAINS = [
  /sentry-next\.wixpress\.com$/i,
  /ingest\.[a-z0-9.-]*sentry\.io$/i,
  /\.sentry\.io$/i,
  /^broadly\.com$/i,
  /review\.broadly\.com$/i,
  /^nva\.com$/i,
  /^wixpress\.com$/i,
  /^example\.com$/i,
  /^test\.com$/i,
];

const BLOCKED_SUBSTRINGS = [
  "sentry-next",
  "ingest.us.sentry",
  "ingest.sentry",
  "@sentry.",
  "wixpress.com",
  "telemetry",
  "analytics@",
  "unsubscribe@",
];

/**
 * @param {string|null|undefined} email
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateOutreachEmail(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw) return { ok: false, reason: "empty" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return { ok: false, reason: "bad_format" };
  }

  const [local, domain] = raw.split("@");

  for (const re of BLOCKED_LOCAL_PARTS) {
    if (re.test(raw)) return { ok: false, reason: "blocked_local" };
  }

  for (const re of BLOCKED_DOMAINS) {
    if (re.test(domain)) return { ok: false, reason: "blocked_domain" };
  }

  for (const sub of BLOCKED_SUBSTRINGS) {
    if (raw.includes(sub)) return { ok: false, reason: "blocked_substring" };
  }

  if (local.includes("sentry") && domain.includes("wix")) {
    return { ok: false, reason: "sentry_wix" };
  }

  return { ok: true };
}
