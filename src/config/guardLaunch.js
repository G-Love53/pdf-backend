/**
 * Launch defaults for GUARD WC (ConnectQuote).
 * EMR / Capita field names can change when Jon confirms the Data Directory.
 */

import { getCidSupportInboxEmail } from "./segmentAgentInbox.js";

export const GUARD_DEFAULT_EXPERIENCE_MOD = 1.0;
export const GUARD_NEW_VENTURE_YEARS = 3;

export const GUARD_REFER_APPLICANT_MESSAGE =
  "Based on the information given, an agent will follow up to finalize the quote.";

export const GUARD_AGENT_FOLLOW_UP = "An agent will follow up.";

export const GUARD_NOTICE_APPETITE =
  "NOTICE: This risk does not meet the current underwriting appetite. An agent will follow up.";

export const GUARD_NOTICE_UNDERWRITING_REVIEW =
  "NOTICE: This risk will require underwriting review. An agent will follow up.";

function withAgentFollowUp(text) {
  const t = String(text || "").trim();
  if (!t) return GUARD_NOTICE_UNDERWRITING_REVIEW;
  if (/agent will follow up/i.test(t)) return t;
  return `${t.replace(/[.]*$/, ".")} ${GUARD_AGENT_FOLLOW_UP}`;
}

/**
 * Applicant / partner-test copy: GUARD NOTICE only (no ops classification).
 */
export function guardApplicantKickoutMessage({
  uw,
  remarks,
  msgStatusDesc,
} = {}) {
  const blobs = [
    ...(Array.isArray(remarks) ? remarks : remarks ? [remarks] : []),
    msgStatusDesc,
  ]
    .map((t) => String(t || "").replace(/^GUARD:\s*/i, "").trim())
    .filter(Boolean);
  const notice = blobs.find((t) => /NOTICE:\s*This risk/i.test(t));
  if (notice) return withAgentFollowUp(notice);
  const decision = String(uw || "").toLowerCase();
  if (decision === "decline" || decision === "reject") {
    return GUARD_NOTICE_APPETITE;
  }
  if (decision === "refer") return GUARD_NOTICE_UNDERWRITING_REVIEW;
  return GUARD_REFER_APPLICANT_MESSAGE;
}

export function guardReferInbox() {
  return getCidSupportInboxEmail();
}

export function zipDigits(zip) {
  const d = String(zip || "").replace(/\D/g, "");
  return d.length >= 5 ? d.slice(0, 5) : "";
}

/** 0, 1, or 2 years — including a typed 0 (do not treat 0 as missing). */
export function isGuardNewVentureYears(years) {
  const n = Number(years);
  return Number.isFinite(n) && n >= 0 && n < GUARD_NEW_VENTURE_YEARS;
}

/** Keep a typed 0. `Number(0) || fallback` would wrongly become 3. */
export function parseGuardYearsInBusiness(raw, fallback = null) {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

/**
 * New venture (< 3 years, including 0) always 1.00 — ignore a typed mod.
 * Otherwise use a known factor if the applicant entered one; else 1.00.
 */
export function resolveGuardExperienceMod({ yearsInBusiness, explicit } = {}) {
  if (isGuardNewVentureYears(yearsInBusiness)) {
    return GUARD_DEFAULT_EXPERIENCE_MOD;
  }
  const n = Number(explicit);
  if (Number.isFinite(n) && n > 0) return n;
  return GUARD_DEFAULT_EXPERIENCE_MOD;
}

/**
 * Prefill GUARD Capita. Set GUARD_CAPITA_PAY_URL on Render.
 * Template may include `{customerNumber}` and `{zip}`, or a base URL
 * (query params appended). Customer param defaults to customerNumber.
 */
export function buildGuardCapitaPayUrl({ customerNumber, zip } = {}) {
  const template = String(process.env.GUARD_CAPITA_PAY_URL || "").trim();
  const customer = String(customerNumber || "").trim();
  if (!template || !customer) return null;
  const z = zipDigits(zip);
  if (template.includes("{customerNumber}") || template.includes("{zip}")) {
    return template
      .replaceAll("{customerNumber}", encodeURIComponent(customer))
      .replaceAll("{zip}", encodeURIComponent(z));
  }
  try {
    const url = new URL(template);
    const customerParam =
      process.env.GUARD_CAPITA_CUSTOMER_PARAM || "customerNumber";
    const zipParam = process.env.GUARD_CAPITA_ZIP_PARAM || "zip";
    url.searchParams.set(customerParam, customer);
    if (z) url.searchParams.set(zipParam, z);
    return url.toString();
  } catch {
    return null;
  }
}

export function isGuardCapitaConfigured() {
  return Boolean(String(process.env.GUARD_CAPITA_PAY_URL || "").trim());
}
