import { stringify as stringifyCsv } from "csv-stringify/sync";
import { normalizeDisplayName } from "../../marketing/normalizeDisplayName.js";
import { isConnectQuoteMarketingReady, CONNECTQUOTE_SEGMENT_DEFAULTS } from "../config/connectQuoteLinks.js";
import { buildPrefilledUrl } from "./urlBuilder.js";
import * as localProspectsAdapter from "./adapters/localProspectsAdapter.js";
import { resolveBcFromLocalProspects } from "./localProspects/categoryToBc.js";
import { validateOutreachEmail } from "./outreachEmailValidation.js";

const STATE_ABBR = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export function normalizeState(input) {
  const raw = String(input || "").trim();
  if (!raw) return "CO";
  if (raw.length === 2) return raw.toUpperCase();
  return STATE_ABBR[raw.toLowerCase()] || raw.toUpperCase();
}

function rowStateAbbr(rowState) {
  const s = String(rowState || "").trim();
  if (!s) return "";
  if (s.length === 2) return s.toUpperCase();
  return STATE_ABBR[s.toLowerCase()] || s.toUpperCase();
}

/** Strict: address must resolve to target state (no empty-state pass-through). */
function rowStateMatches(rowState, targetState) {
  const abbr = rowStateAbbr(rowState);
  if (!abbr) return false;
  return abbr === targetState.toUpperCase();
}

export function channelSrc(stateAbbr, segment) {
  return `instantly-${stateAbbr.toLowerCase()}-${segment.toLowerCase()}`;
}

function listingDedupeKey(row) {
  const id = String(row.listing_id || row.place_id || row.google_cid || "").trim();
  if (id) return `g:${id}`;
  return "";
}

function emailDedupeKey(row) {
  return String(row.email || "").toLowerCase().trim();
}

/** Prefer richer listing when same Google ID appears across overlapping metro pulls. */
function listingRichness(row) {
  let score = 0;
  if (row.email) score += 4;
  if (row.phone) score += 2;
  if (row.business_name) score += 1;
  if (row.address) score += 1;
  return score;
}

function pickBestListing(candidates) {
  return [...candidates].sort((a, b) => listingRichness(b) - listingRichness(a))[0];
}

/**
 * @param {Record<string, string>[]} records raw CSV rows
 * @param {{ segment: string, targetState?: string, keyword?: string, keywordBc?: string, defaultBc?: string }} options
 */
export function cleanLocalProspectsRows(records, options = {}) {
  const segment = String(options.segment || "").toLowerCase();
  const targetState = normalizeState(options.targetState || "CO");
  const keywordBc = options.keywordBc || options.defaultBc || CONNECTQUOTE_SEGMENT_DEFAULTS[segment]?.bc;

  const skipped = {
    no_email: 0,
    bad_email: 0,
    junk_email: 0,
    missing_state: 0,
    wrong_state: 0,
    out_of_appetite: 0,
    duplicate_listing: 0,
    duplicate_email: 0,
  };

  const phoneStats = {
    with_valid_phone: 0,
    no_valid_phone: 0,
  };

  const byListing = new Map();
  const orphanRows = [];

  for (const record of records) {
    const normalized = localProspectsAdapter.normalize(record, {
      keyword: options.keyword || record.search_keyword,
    });

    const emailCheck = validateOutreachEmail(normalized.email);
    if (!emailCheck.ok) {
      if (emailCheck.reason === "empty" || emailCheck.reason === "bad_format") {
        skipped.no_email += 1;
      } else {
        skipped.junk_email += 1;
      }
      continue;
    }

    if (!normalized.state || !String(normalized.state).trim()) {
      skipped.missing_state += 1;
      continue;
    }

    if (!rowStateMatches(normalized.state, targetState)) {
      skipped.wrong_state += 1;
      continue;
    }

    const cityLower = String(normalized.city || "").toLowerCase();
    if (/,\s*ca\b|california\b|burlingame/.test(cityLower)) {
      skipped.wrong_state += 1;
      continue;
    }

    const bc = resolveBcFromLocalProspects(segment, {
      category: normalized.category,
      keywordBc: keywordBc || record.default_bc,
    });

    if (!bc) {
      skipped.out_of_appetite += 1;
      continue;
    }

    normalized.businessClass = bc;
    if (normalized.phone) phoneStats.with_valid_phone += 1;
    else phoneStats.no_valid_phone += 1;

    const listKey = listingDedupeKey(normalized);
    if (listKey) {
      const bucket = byListing.get(listKey) || [];
      bucket.push(normalized);
      byListing.set(listKey, bucket);
    } else {
      orphanRows.push(normalized);
    }
  }

  const rows = [];
  const seenEmails = new Set();

  for (const candidates of byListing.values()) {
    if (candidates.length > 1) {
      skipped.duplicate_listing += candidates.length - 1;
    }
    const row = pickBestListing(candidates);
    const ek = emailDedupeKey(row);
    if (seenEmails.has(ek)) {
      skipped.duplicate_email += 1;
      continue;
    }
    seenEmails.add(ek);
    rows.push(row);
  }

  for (const row of orphanRows) {
    const ek = emailDedupeKey(row);
    if (seenEmails.has(ek)) {
      skipped.duplicate_email += 1;
      continue;
    }
    seenEmails.add(ek);
    rows.push(row);
  }

  return { rows, skipped, phoneStats };
}

function toInstantlyRow(row, { segment, campaignTag, targetState, channelSource }) {
  const contact = {
    email: row.email,
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    business_name: row.business_name || "",
    phone: row.phone || "",
    address: row.address || "",
    city: row.city || "",
    state: targetState,
    zip: row.zip || "",
  };

  const prefilledUrl = buildPrefilledUrl(contact, segment, campaignTag, {
    src: channelSource,
    businessClass: row.businessClass,
  });

  const displayName = normalizeDisplayName(contact.business_name) || contact.business_name || "";

  return {
    email: contact.email,
    firstName: contact.first_name,
    lastName: contact.last_name,
    companyName: contact.business_name,
    displayName,
    category: row.category || "",
    phone: contact.phone,
    city: contact.city,
    zip: contact.zip,
    website: row.website || "",
    google_listing_id: row.listing_id || row.place_id || row.google_cid || "",
    campaign_tag: campaignTag,
    src: channelSource,
    connectquote_url: prefilledUrl,
    business_class: row.businessClass,
    segment,
    data_source: "localprospects",
  };
}

export function toInstantlyCsv(rows, { segment, campaignTag, targetState, channelSource }) {
  const contacts = rows.map((row) =>
    toInstantlyRow(row, { segment, campaignTag, targetState, channelSource }),
  );
  return stringifyCsv(contacts, { header: true });
}

export function assertMarketingReady(segment) {
  if (!isConnectQuoteMarketingReady(segment)) {
    throw new Error(
      `Segment "${segment}" is not ConnectQuote-ready. Marketing-ready: electrical, fitness, hvac, plumber, beauty, cleaning, pet, painter.`,
    );
  }
}
