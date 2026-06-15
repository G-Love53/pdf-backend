/**
 * Canonical ConnectQuote intake URLs (segment Netlify → connectquote.html).
 * Traditional-only segments (bar, roofer) keep domain root / long-form index.html.
 */

export const SEGMENT_DOMAINS = {
  bar: "https://barinsurancedirect.com",
  roofer: "https://roofingcontractorinsurancedirect.com",
  plumber: "https://plumberinsurancedirect.com",
  hvac: "https://hvacinsurancedirect.com",
  fitness: "https://fitnessinsurancedirect.com",
  electrical: "https://electricalinsurancedirect.com",
};

/** Segments on the Coterie ConnectQuote rail — default `bc` when not passed. */
export const CONNECTQUOTE_SEGMENT_DEFAULTS = {
  electrical: {},
  plumber: { bc: "plumbing_contractor" },
  hvac: { bc: "hvac_contractor" },
  fitness: {},
};

export const FITNESS_BUSINESS_CLASSES = {
  yoga_studio: "Yoga studio",
  pilates_studio: "Pilates / mind-body studio",
  personal_trainer: "Personal trainer",
};

export function isConnectQuoteSegment(segment) {
  return Object.prototype.hasOwnProperty.call(
    CONNECTQUOTE_SEGMENT_DEFAULTS,
    String(segment || "").toLowerCase(),
  );
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

  if (!isConnectQuoteSegment(key)) {
    return `${domain}/`;
  }

  const params = new URLSearchParams();
  const defaults = CONNECTQUOTE_SEGMENT_DEFAULTS[key] || {};
  const bc = opts.businessClass || defaults.bc;
  if (bc) params.set("bc", bc);

  const src = opts.src || opts.query?.src;
  if (src) params.set("src", src);
  const cid = opts.cid || opts.query?.cid;
  if (cid) params.set("cid", cid);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && v !== "" && k !== "src" && k !== "cid" && k !== "bc") {
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
  if (isConnectQuoteSegment(key)) {
    return buildConnectQuoteUrl(key, opts);
  }
  const domain = SEGMENT_DOMAINS[key];
  return domain ? `${domain}/` : "/";
}
