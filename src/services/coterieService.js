import {
  filterGlLimitOptions,
  filterGlAggregateOptions,
} from "../config/connectQuoteIntakeSchema.js";

const DEFAULT_API_BASE = "https://api-sandbox.coterieinsurance.com";

export class CoterieApiError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "CoterieApiError";
    this.code = meta.code;
    this.status = meta.status;
    this.body = meta.body;
  }
}

export function isCoterieConfigured() {
  return Boolean(
    process.env.COTERIE_PUBLISHABLE_KEY && process.env.COTERIE_AGENCY_EXTERNAL_ID,
  );
}

function coterieApiBase() {
  return (process.env.COTERIE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
}

export function isCoterieSandboxApi() {
  return coterieApiBase().includes("sandbox");
}

function coterieStripePublishableKey() {
  const raw = process.env.COTERIE_STRIPE_PUBLISHABLE_KEY;
  if (raw == null || raw === "") return "";
  return String(raw).trim();
}

/** True when prod Coterie can accept live Stripe bind (pk_live on prod API). */
export function isCoteriePaymentBindReady() {
  const stripePk = coterieStripePublishableKey();
  if (!stripePk) return false;
  if (isCoterieSandboxApi()) return stripePk.startsWith("pk_");
  return stripePk.startsWith("pk_live_");
}

/**
 * Skip-payment demo bind allowed (sandbox, explicit flag, or interim prod quoting).
 * Interim: prod Coterie API + pk_test_ — quotes are real; bind uses demo-finalize until Coterie ships pk_live.
 */
export function isDemoFinalizeAllowed() {
  if (process.env.COTERIE_DEMO_FINALIZE_ENABLED === "true") return true;
  if (isCoterieSandboxApi()) return true;
  if (process.env.COTERIE_INTERIM_DEMO_MODE === "true") return true;
  const stripePk = coterieStripePublishableKey();
  if (!isCoterieSandboxApi() && stripePk.startsWith("pk_test_")) return true;
  return false;
}

export function getCoteriePublicConfig() {
  return {
    apiConfigured: isCoterieConfigured(),
    stripePublishableKey: coterieStripePublishableKey() || null,
    sandbox: isCoterieSandboxApi(),
    demoFinalizeEnabled: isDemoFinalizeAllowed(),
    paymentBindReady: isCoteriePaymentBindReady(),
  };
}

export function getCoterieConfig() {
  const apiBase = (process.env.COTERIE_API_BASE || DEFAULT_API_BASE).replace(
    /\/$/,
    "",
  );
  const publishableKey = process.env.COTERIE_PUBLISHABLE_KEY || null;
  const agencyExternalId = process.env.COTERIE_AGENCY_EXTERNAL_ID || null;

  if (!publishableKey || !agencyExternalId) {
    throw new CoterieApiError(
      "Coterie not configured (COTERIE_PUBLISHABLE_KEY and COTERIE_AGENCY_EXTERNAL_ID required)",
      { code: "COTERIE_NOT_CONFIGURED" },
    );
  }

  return { apiBase, publishableKey, agencyExternalId };
}

export function parseCoterieWebhookPayload(req) {
  const body = req.body;
  if (Buffer.isBuffer(body)) {
    const text = body.toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === "object" ? body : null;
}

function extractCoterieErrorCode(body) {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body.errors) && body.errors[0]) {
    const m = String(body.errors[0]).match(/\bE\d{4}\b/);
    if (m) return m[0];
  }
  const code =
    body.code ||
    body.errorCode ||
    body.error_code ||
    (typeof body.error === "object" ? body.error?.code : null);
  if (code) return String(code);
  const msg = String(body.message || body.error || "");
  const match = msg.match(/\bE\d{4}\b/);
  return match ? match[0] : null;
}

function extractCoterieErrorMessage(body, fallback) {
  if (!body || typeof body !== "object") return fallback;
  if (Array.isArray(body.errors) && body.errors.length) {
    return String(body.errors[0]);
  }
  return (
    body.message ||
    (typeof body.error === "string" ? body.error : body.error?.message) ||
    fallback
  );
}

export function isProducerNotLicensedError(err) {
  if (!err) return false;
  if (err.code === "E0122") return true;
  return /producer is not licensed/i.test(String(err.message || ""));
}

async function parseCoterieResponse(res) {
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!res.ok) {
    const code = extractCoterieErrorCode(body);
    const message = extractCoterieErrorMessage(
      body,
      `Coterie API ${res.status}`,
    );
    throw new CoterieApiError(message, {
      code: code || undefined,
      status: res.status,
      body,
    });
  }

  return body;
}

async function coterieFetch(path, { method = "GET", body } = {}) {
  const { apiBase, publishableKey } = getCoterieConfig();
  const url = `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = {
    Authorization: `token ${publishableKey}`,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return parseCoterieResponse(res);
}

export async function createApplication(applicationBody) {
  const { agencyExternalId } = getCoterieConfig();
  return coterieFetch("/v1.6/commercial/applications", {
    method: "POST",
    body: { agencyExternalId, ...applicationBody },
  });
}

export async function createBindableQuote(quoteBody) {
  const { agencyExternalId } = getCoterieConfig();
  return coterieFetch("/v1.6/commercial/quotes/bindable", {
    method: "POST",
    body: { agencyExternalId, ...quoteBody },
  });
}

export async function getQuote(quoteId) {
  return coterieFetch(`/v1.6/commercial/quotes/${quoteId}`, { method: "GET" });
}

function splitContactName(form) {
  const first =
    form.first_name ||
    form.contact_first_name ||
    form.applicant_first_name ||
    null;
  const last =
    form.last_name ||
    form.contact_last_name ||
    form.applicant_last_name ||
    null;
  if (first && last) return { contactFirstName: first, contactLastName: last };
  const full = String(
    form.contact_name || form.applicant_name || "",
  ).trim();
  if (!full) return { contactFirstName: "Insured", contactLastName: "Contact" };
  const parts = full.split(/\s+/);
  if (parts.length === 1) {
    return { contactFirstName: parts[0], contactLastName: "Contact" };
  }
  return {
    contactFirstName: parts[0],
    contactLastName: parts.slice(1).join(" "),
  };
}

function defaultPolicyStartDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

function formatPolicyStartDate(form) {
  const raw = form.policy_start_date || form.policyStartDate || null;
  if (!raw) return defaultPolicyStartDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
    const [y, m, d] = String(raw).split("-");
    return `${m}/${d}/${y}`;
  }
  return String(raw);
}

export function buildApplicationPayload(form, { akHash }) {
  const { street, city, state, zip } = buildMailingAddress(form);
  const phone = pickContactPhone(form);

  return {
    legalBusinessName:
      form.insured_name ||
      form.business_name ||
      form.legalBusinessName ||
      form.premises_name,
    businessState: state,
    businessZip: zip,
    numEmployees: Number(form.num_employees || form.numEmployees || 1),
    AKHash: akHash,
    email: form.contact_email || form.email || form.applicant_email,
    ...(phone ? { contactPhone: phone } : {}),
    locations: [buildLocationRow(form)],
  };
}

function parseBusinessAgeMonths(form) {
  const monthVal = form.business_start_month || form.businessStartMonth;
  if (monthVal && /^\d{4}-\d{2}$/.test(String(monthVal))) {
    const [y, m] = String(monthVal).split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const now = new Date();
    return Math.max(
      1,
      (now.getFullYear() - start.getFullYear()) * 12 +
        (now.getMonth() - start.getMonth()),
    );
  }

  const startYear = Number(form.business_start_year || form.businessStartYear);
  const now = new Date();
  if (
    Number.isFinite(startYear) &&
    startYear >= 1900 &&
    startYear <= now.getFullYear()
  ) {
    return Math.max(1, (now.getFullYear() - startYear) * 12 + now.getMonth());
  }

  const raw =
    form.business_age_months ||
    form.businessAgeInMonths ||
    form.business_age_years ||
    null;
  if (raw == null || raw === "") return 36;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 36;
  if (n <= 120) return n;
  return n * 12;
}

function formatBusinessStartDate(form) {
  const monthVal = form.business_start_month || form.businessStartMonth;
  if (monthVal && /^\d{4}-\d{2}$/.test(String(monthVal))) {
    const [y, m] = String(monthVal).split("-");
    return `${m}/01/${y}`;
  }
  const startYear = Number(form.business_start_year || form.businessStartYear);
  if (!Number.isFinite(startYear) || startYear < 1900) return null;
  return `01/01/${startYear}`;
}

function pickContactPhone(form) {
  return (
    form.contact_phone ||
    form.contactPhone ||
    form.phone ||
    form.applicant_phone ||
    null
  );
}

function buildMailingAddress(form) {
  const street = form.premise_street || form.address || form.street || null;
  const city = form.premise_city || form.city || null;
  const state =
    form.premise_state ||
    form.physical_state ||
    form.state ||
    form.businessState ||
    null;
  const zip =
    form.premise_zip || form.physical_zip || form.zip || form.businessZip || null;
  return { street, city, state, zip };
}

function parseGlLimit(form) {
  const n = Number(form.gl_limit || form.glLimit || 1000000);
  const raw = Number.isFinite(n) ? n : 1000000;
  const segment = String(form.segment || "").toLowerCase();
  const state =
    form.premise_state ||
    form.physical_state ||
    form.state ||
    form.mailingAddressState ||
    null;
  const allowed = filterGlLimitOptions(segment, state).map((o) => Number(o.value));
  if (!allowed.length) return raw;
  if (allowed.includes(raw)) return raw;
  const sorted = [...allowed].sort((a, b) => b - a);
  return sorted.find((v) => v <= raw) || sorted[sorted.length - 1];
}

function parseGlAggregateLimit(form, glLimit) {
  const n = Number(form.gl_aggregate_limit || form.glAggregateLimit);
  if (Number.isFinite(n)) {
    const segment = String(form.segment || "").toLowerCase();
    const state =
      form.premise_state ||
      form.physical_state ||
      form.state ||
      form.mailingAddressState ||
      null;
    const allowed = filterGlAggregateOptions(segment, state, glLimit).map(
      (o) => Number(o.value),
    );
    if (allowed.includes(n)) return n;
  }
  return glLimit * 2;
}

function parseBuildingLimit(form) {
  const n = Number(form.building_limit || form.buildingLimit);
  if (!Number.isFinite(n)) return null;
  return Math.min(1000000, Math.max(25000, Math.round(n)));
}

function parseBppLimit(form) {
  const n = Number(form.bpp_limit || form.bppLimit);
  if (!Number.isFinite(n)) return null;
  return Math.min(500000, Math.max(5000, Math.round(n)));
}

function buildLocationRow(form, { includeBopFields = false } = {}) {
  const { street, city, state, zip } = buildMailingAddress(form);
  const row = {
    street,
    city,
    state,
    zip,
    isPrimaryLocation: true,
  };
  if (includeBopFields) {
    const locType =
      form.location_type || form.locationType || "BuildingLeased";
    row.locationType = locType;
    const bppLimit = parseBppLimit(form);
    if (bppLimit != null) {
      row.bppLimit = bppLimit;
    }
    if (locType === "BuildingOwned") {
      const buildingLimit = parseBuildingLimit(form);
      if (buildingLimit != null) {
        row.buildingLimit = buildingLimit;
      }
    }
  }
  return row;
}

export function buildBindableQuotePayload(
  form,
  { akHash, applicationId, applicationTypes = ["BOP"] },
) {
  const names = splitContactName(form);
  const { street, city, state, zip } = buildMailingAddress(form);
  const phone = pickContactPhone(form);
  const glLimit = parseGlLimit(form);
  const glAggregateLimit = parseGlAggregateLimit(form, glLimit);

  const types = Array.isArray(applicationTypes)
    ? applicationTypes
    : [applicationTypes];
  const includesBop = types.includes("BOP");

  const payload = {
    applicationId,
    applicationTypes: types,
    AKHash: akHash,
    legalBusinessName:
      form.insured_name ||
      form.business_name ||
      form.legalBusinessName ||
      form.premises_name,
    contactEmail:
      form.contact_email || form.email || form.applicant_email || null,
    contactFirstName: names.contactFirstName,
    contactLastName: names.contactLastName,
    ...(phone ? { contactPhone: phone } : {}),
    mailingAddressStreet: street,
    mailingAddressCity: city,
    mailingAddressState: state,
    mailingAddressZip: zip,
    numEmployees: Number(form.num_employees || form.numEmployees || 1),
    locations: [buildLocationRow(form, { includeBopFields: includesBop })],
    glLimit,
    glAggregateLimit,
    glAggregatePcoLimit: glAggregateLimit,
    policyStartDate: formatPolicyStartDate(form),
  };

  const businessStartDate = formatBusinessStartDate(form);
  if (businessStartDate) {
    payload.businessStartDate = businessStartDate;
  }

  if (includesBop || types.includes("GL")) {
    payload.annualPayroll = Number(
      form.annual_payroll || form.annualPayroll || 50000,
    );
    payload.grossAnnualSales = Number(
      form.gross_annual_sales || form.grossAnnualSales || 150000,
    );
    payload.businessAgeInMonths = parseBusinessAgeMonths(form);
  }
  if (includesBop) {
    payload.bppDeductible = Number(
      form.bpp_deductible || form.bppDeductible || 1000,
    );
  }

  return payload;
}

/** Only route traditional when appetite truly failed — not standard exclusion form list. */
export function shouldRouteToTraditionalRail(bindableResponse) {
  const decl =
    bindableResponse?.underwritingInformation?.declinations ||
    bindableResponse?.declinations ||
    [];
  if (Array.isArray(decl) && decl.length > 0) return true;
  if (bindableResponse?.isSuccess === false && Array.isArray(bindableResponse?.errors)) {
    const fatal = bindableResponse.errors.some((e) =>
      /declin|not eligible|prohibited/i.test(String(e)),
    );
    if (fatal) return true;
  }
  return false;
}

export function extractApplicationSummary(applicationResponse) {
  const app =
    applicationResponse?.application ||
    applicationResponse?.data?.application ||
    applicationResponse ||
    {};
  const topTypes = applicationResponse?.availablePolicyTypes;
  return {
    applicationId: app.applicationId || app.id || null,
    availablePolicyTypes:
      app.availablePolicyTypes ||
      (Array.isArray(topTypes) ? topTypes : []) ||
      [],
    exclusions: app.exclusions || applicationResponse?.exclusions || [],
    applicationUrl: app.applicationUrl || null,
    status: app.status || null,
  };
}

export function extractQuoteSummary(bindableResponse) {
  const q = bindableResponse?.quote || {};
  const nested = q.quotes?.[0] || {};
  return {
    quoteId: nested.quoteId || q.externalId || null,
    applicationId: nested.applicationId || null,
    premium: q.premium ?? nested.premium ?? null,
    monthlyPremium: q.monthlyPremium ?? nested.monthlyPremium ?? null,
    totalYearlyOwed: q.totalYearlyOwed ?? null,
    monthlyOwed: q.monthlyOwed ?? null,
    carrier: nested.insuranceCarrier || "Coterie",
    policyType: nested.policyType || "BOP",
    effectiveDate: nested.decisionDate || null,
    applicationUrl: q.applicationUrl || nested.applicationUrl || null,
    quoteProposalUrl: q.quoteProposalUrl || nested.quoteProposalUrl || null,
    snapshotUrl: q.snapshotUrl || nested.snapshotUrl || null,
    stateNoticeText: q.stateNoticeText || nested.stateNoticeText || null,
    isSuccess: bindableResponse?.isSuccess === true,
    errors: bindableResponse?.errors || [],
    raw: bindableResponse,
  };
}

function normalizePaymentPlan(plan) {
  const p = String(plan || "Annual").trim();
  if (/^month/i.test(p)) return "Monthly";
  if (/^year|^annual/i.test(p)) return "Annual";
  return p;
}

function normalizePaymentInterval(plan) {
  const p = normalizePaymentPlan(plan);
  return p === "Monthly" ? "Monthly" : "Yearly";
}

function pickBindContactEmail(paymentPayload = {}) {
  const raw =
    paymentPayload.contactEmail ||
    paymentPayload.contact_email ||
    paymentPayload.email ||
    null;
  const trimmed = String(raw || "").trim();
  return trimmed || null;
}

function withBindContact(body, contactEmail) {
  if (!contactEmail) return body;
  return {
    ...body,
    contactEmail,
    email: contactEmail,
  };
}

function buildBindAttempts(quoteId, agencyExternalId, paymentPayload) {
  const paymentPlan = normalizePaymentPlan(paymentPayload.paymentPlan);
  const paymentInterval = normalizePaymentInterval(paymentPayload.paymentPlan);
  const altPlan =
    paymentPlan === "Monthly"
      ? "Monthly"
      : paymentPlan === "Annual"
        ? "Yearly"
        : paymentPlan;
  const altInterval = paymentInterval === "Monthly" ? "Yearly" : "Monthly";
  const contactEmail = pickBindContactEmail(paymentPayload);
  const stripeToken =
    paymentPayload.stripeToken ||
    paymentPayload.stripe_token ||
    paymentPayload.token ||
    null;
  const stripePaymentMethodId = paymentPayload.stripePaymentMethodId || null;

  /** @type {{ path: string, body: Record<string, unknown> }[]} */
  const attempts = [];

  const add = (path, body) => attempts.push({ path, body: withBindContact(body, contactEmail) });

  if (stripeToken) {
    for (const interval of [paymentInterval, altInterval]) {
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        tokenizedPaymentID: stripeToken,
        paymentInterval: interval,
      });
    }
    for (const plan of [paymentPlan, altPlan]) {
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        paymentInfo: { stripeToken, paymentPlan: plan },
      });
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        paymentInfo: { StripeToken: stripeToken, PaymentPlan: plan },
      });
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        paymentInfo: { stripePaymentToken: stripeToken, paymentPlan: plan },
      });
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        stripeToken,
        paymentPlan: plan,
      });
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        StripeToken: stripeToken,
        PaymentPlan: plan,
      });
      add(`/v1.6/commercial/policies`, {
        agencyExternalId,
        agencyId: agencyExternalId,
        quoteId,
        stripePaymentToken: stripeToken,
        paymentPlan: plan,
      });
      add(`/v1.6/commercial/policies`, {
        agencyExternalId,
        quoteId,
        paymentInfo: { stripePaymentToken: stripeToken, paymentPlan: plan },
      });
    }
  }

  if (stripePaymentMethodId) {
    for (const plan of [paymentPlan, altPlan]) {
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        paymentInfo: { stripePaymentMethodId, paymentPlan: plan },
      });
      add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
        agencyExternalId,
        PaymentInfo: { StripePaymentMethodId: stripePaymentMethodId, PaymentPlan: plan },
      });
    }
  }

  if (!attempts.length) {
    add(`/v1.6/commercial/quotes/${quoteId}/bind`, {
      agencyExternalId,
      paymentPlan,
    });
  }

  return attempts;
}

function bindAttemptSucceeded(result) {
  return result?.isSuccess !== false && !(result?.errors?.length > 0);
}

/** POST bind — Coterie Stripe token (tok_…) or payment method; tries quote bind + policies paths. */
export async function bindQuote(quoteId, paymentPayload = {}) {
  const { agencyExternalId } = getCoterieConfig();
  const attempts = buildBindAttempts(quoteId, agencyExternalId, paymentPayload);

  let lastBody = null;
  for (const { path, body } of attempts) {
    try {
      const result = await coterieFetch(path, { method: "POST", body });
      if (bindAttemptSucceeded(result)) {
        console.log("[coterie bind] success", { path, keys: Object.keys(body) });
        return { result, bindBodyUsed: body, bindPathUsed: path };
      }
      lastBody = result;
      if (!/payment info is missing/i.test(JSON.stringify(result))) {
        console.warn("[coterie bind] non-missing error", { path, result });
        return { result, bindBodyUsed: body, bindPathUsed: path };
      }
    } catch (err) {
      lastBody = err.body || { message: err.message };
      if (!/payment info is missing/i.test(JSON.stringify(lastBody))) {
        console.warn("[coterie bind] fetch error", { path, message: err.message });
        return { result: lastBody, bindBodyUsed: body, bindPathUsed: path };
      }
    }
  }

  console.warn("[coterie bind] all attempts failed", {
    quoteId,
    attemptCount: attempts.length,
    lastError: lastBody?.errors?.[0] || lastBody?.message,
  });
  return { result: lastBody, bindBodyUsed: null, bindPathUsed: null };
}
