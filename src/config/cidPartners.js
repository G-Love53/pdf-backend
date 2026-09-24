/**
 * CID Partner Layer — lightweight distribution registry.
 *
 * Partner ID → ch=partner-{id} → ConnectQuote (optional logo) → CONNECT.
 * Not an embedded quote API. Add a row here + logo in public/partners/ when
 * a trade org / supplier / payroll / software partner says yes.
 *
 * Instantly / LocalProspects stay channels, not partners.
 */

import { SEGMENT_DOMAINS } from "./connectQuoteLinks.js";

/** @typedef {"instantly" | "partner" | "demo" | "direct" | "other"} ChannelFamily */

/**
 * @typedef {object} CidPartner
 * @property {string} id  kebab-case, used in URL `partner=` and `ch=partner-{id}`
 * @property {string} name
 * @property {string} segment  ConnectQuote segment key
 * @property {string[]} [states]
 * @property {string} [logoUrl]  Public path or absolute HTTPS URL
 * @property {string} [tagline]  Shown under logo on intake
 * @property {boolean} [active]
 * @property {string} [notes]  Internal only — never sent to intake
 */

/** @type {Record<string, CidPartner>} */
export const CID_PARTNERS = {
  // Template — set active: true and add public/partners/{id}.png when real.
  "sample-assoc": {
    id: "sample-assoc",
    name: "Sample Trade Association",
    segment: "plumber",
    states: ["CO"],
    logoUrl: "",
    tagline: "Member insurance program",
    active: false,
    notes: "Placeholder. Copy this object; do not send this URL to a real partner.",
  },
};

export const PARTNER_CHANNEL_PREFIX = "partner-";

const DEMO_CHANNELS = new Set([
  "demo",
  "coterie-demo",
  "guard-partner-test",
]);

export function normalizePartnerId(raw) {
  const id = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^partner-/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) return "";
  return id;
}

/** @param {string} id */
export function getPartner(id) {
  const key = normalizePartnerId(id);
  if (!key) return null;
  return CID_PARTNERS[key] || null;
}

export function listPartners({ includeInactive = true } = {}) {
  return Object.values(CID_PARTNERS).filter((p) => includeInactive || p.active);
}

/** Channel value stored on submissions / cq_events. */
export function partnerChannel(id) {
  const key = normalizePartnerId(id);
  return key ? `${PARTNER_CHANNEL_PREFIX}${key}` : "";
}

/** Default campaign id for a partner landing. */
export function partnerCampaignId(id, when = new Date()) {
  const key = normalizePartnerId(id);
  if (!key) return "";
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, "0");
  return `${key}-${y}-${m}`;
}

/**
 * @param {string | null | undefined} channel
 * @returns {ChannelFamily}
 */
export function classifyChannel(channel) {
  const ch = String(channel || "")
    .trim()
    .toLowerCase();
  if (!ch || ch === "direct") return "direct";
  if (DEMO_CHANNELS.has(ch) || ch.includes("partner-demo")) return "demo";
  if (ch.startsWith(PARTNER_CHANNEL_PREFIX)) return "partner";
  if (ch.startsWith("instantly") || ch.startsWith("apollo") || ch.startsWith("localprospects")) {
    return "instantly";
  }
  return "other";
}

/** Public card for intake co-brand (no notes). */
export function publicPartnerCard(id) {
  const p = getPartner(id);
  if (!p || p.active === false) return null;
  return {
    id: p.id,
    name: p.name,
    segment: p.segment,
    logoUrl: p.logoUrl || "",
    tagline: p.tagline || "",
    states: p.states || [],
  };
}

export function partnerSegmentDomain(segment) {
  return SEGMENT_DOMAINS[String(segment || "").toLowerCase()] || "";
}
