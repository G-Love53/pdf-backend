/**
 * Canonical ConnectQuote intake URLs (segment Netlify → connectquote.html).
 * Traditional-only segments (bar, roofer) keep domain root / long-form index.html.
 */

import { setAttributionParams } from "../outreach/attributionParams.js";

export const SEGMENT_DOMAINS = {
  bar: "https://barinsurancedirect.com",
  roofer: "https://roofingcontractorinsurancedirect.com",
  plumber: "https://plumberinsurancedirect.com",
  hvac: "https://hvacinsurancedirect.com",
  fitness: "https://fitnessinsurancedirect.com",
  electrical: "https://electricalinsurancedirect.com",
  beauty: "https://beautyinsurancedirect.com",
  cleaning: "https://cleaninginsurancedirect.com",
  pet: "https://petserviceinsurancedirect.com",
};

/**
 * Segments live on Netlify connectquote.html and approved for Instantly outreach.
 * HVAC, Plumber, Bar, and Roofer are NOT ready — use traditional intake only.
 */
export const CONNECTQUOTE_MARKETING_READY = new Set([
  "electrical",
  "fitness",
  "beauty",
  "cleaning",
  "pet",
]);

/** Default `bc` when not passed (marketing-ready segments only). */
export const CONNECTQUOTE_SEGMENT_DEFAULTS = {
  electrical: {},
  fitness: {},
  beauty: {},
  cleaning: {},
  pet: {},
};

export const FITNESS_BUSINESS_CLASSES = {
  yoga_studio: "Yoga studio",
  pilates_studio: "Pilates / mind-body studio",
  personal_trainer: "Personal trainer",
};

export function isConnectQuoteMarketingReady(segment) {
  return CONNECTQUOTE_MARKETING_READY.has(String(segment || "").toLowerCase());
}

/** @deprecated Prefer isConnectQuoteMarketingReady — same set for link generation. */
export function isConnectQuoteSegment(segment) {
  return isConnectQuoteMarketingReady(segment);
}

/**
 * @param {string} segment
 * @param {{ businessClass?: string, query?: Record<string, string>, src?: string, cid?: string }} [opts]
 */
export function buildConnectQuoteUrl(segment, opts = {}) {
  const key = String(segment || "").toLowerCase();
  const domain = SEGMENT_DOMAINS[key];
  if (!domain) {
    throw new Error(`No domain configured for segment: ${segment}`);
  }

  if (!isConnectQuoteMarketingReady(key)) {
    return `${domain}/`;
  }

  const params = new URLSearchParams();
  const defaults = CONNECTQUOTE_SEGMENT_DEFAULTS[key] || {};
  const bc = opts.businessClass || defaults.bc;
  if (bc) params.set("bc", bc);

  const channel = opts.src || opts.query?.src || opts.query?.ch;
  const campaign = opts.cid || opts.query?.cid;
  setAttributionParams(params, { channel, campaign });

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && v !== "" && k !== "src" && k !== "ch" && k !== "cid" && k !== "bc") {
        params.set(k, String(v));
      }
    }
  }

  const qs = params.toString();
  return `${domain}/connectquote.html${qs ? `?${qs}` : ""}`;
}

/** Primary marketing / dropdown link — ConnectQuote when supported, else segment home. */
export function primaryIntakeUrl(segment, opts = {}) {
  const key = String(segment || "").toLowerCase();
  if (isConnectQuoteMarketingReady(key)) {
    return buildConnectQuoteUrl(key, opts);
  }
  const domain = SEGMENT_DOMAINS[key];
  return domain ? `${domain}/` : "/";
}
