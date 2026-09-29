/**
 * Launch defaults for GUARD WC (ConnectQuote).
 * EMR / Capita field names can change when Jon confirms the Data Directory.
 */

export const GUARD_DEFAULT_EXPERIENCE_MOD = 1;
export const GUARD_NEW_VENTURE_YEARS = 3;

export const GUARD_REFER_APPLICANT_MESSAGE =
  "Based on the information given, an agent will follow up to finalize the quote.";

export function guardReferInbox() {
  return (
    process.env.GUARD_REFER_EMAIL || "support@commercialinsurance-direct.com"
  );
}

export function zipDigits(zip) {
  const d = String(zip || "").replace(/\D/g, "");
  return d.length >= 5 ? d.slice(0, 5) : "";
}

/**
 * New venture (< 3 years) always 1.00.
 * Otherwise use a known factor if the applicant entered one; else 1.00.
 */
export function resolveGuardExperienceMod({ yearsInBusiness, explicit } = {}) {
  const years = Number(yearsInBusiness);
  if (
    Number.isFinite(years) &&
    years > 0 &&
    years < GUARD_NEW_VENTURE_YEARS
  ) {
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
