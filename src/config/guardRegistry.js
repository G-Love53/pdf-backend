/**
 * GUARD Workers’ Comp — per-segment switch + NCCI class.
 * New ConnectQuote launches default wcEnabled: false.
 * GUARD “Digital Decision” is their auto-quote name — never shown in CID UX.
 *
 * Class flags from packet 08.19.26 (CO): [E] auto-quote, [R] refer, [I] ineligible.
 */

export const GUARD_DEFAULT_PILOT_STATES = ["CO"];

/** CO officer payroll is min = max ($73,900 as of 2024 table). */
export const GUARD_CO_OFFICER_PAYROLL = 73900;

/** Default employers liability when Digital Decision accepts (CO stat 9812). */
export const GUARD_DEFAULT_EL_LIMITS = {
  perAccident: 1000000,
  perEmployee: 1000000,
  perPolicy: 1000000,
};

/**
 * @typedef {object} GuardSegmentEntry
 * @property {boolean} wcEnabled
 * @property {string} classCode  NCCI 4-digit
 * @property {string} classSuffix  padded into 6-digit RatingClassificationCd
 * @property {string} classDescription
 * @property {string} operationsDesc
 * @property {string} [digitalDecisionNote]
 */

/** @type {Record<string, GuardSegmentEntry>} */
export const GUARD_SEGMENTS = {
  plumber: {
    wcEnabled: true,
    classCode: "5183",
    classSuffix: "00",
    classDescription: "PLUMBING NOC & DRIVERS",
    operationsDesc: "Plumbing contracting",
    digitalDecisionNote:
      "Commercial/industrial customers can decline Digital Decision (NCCI 23-5183_01).",
  },
  electrical: {
    wcEnabled: false,
    classCode: "5190",
    classSuffix: "00",
    classDescription: "ELECTRICAL WIRING W/I BLDGS & DRVRS",
    operationsDesc: "Electrical contracting",
    digitalDecisionNote:
      "Work above 15 feet or commercial/industrial can decline Digital Decision.",
  },
  hvac: {
    wcEnabled: false,
    classCode: "5537",
    classSuffix: "00",
    classDescription: "HEAT,VENT,AC,REFRIG. SYS-INST REP",
    operationsDesc: "HVAC contracting",
  },
  fitness: {
    wcEnabled: false,
    classCode: "9063",
    classSuffix: "00",
    classDescription: "EXERCISE OR HEALTH INSTITUTE & CLER",
    operationsDesc: "Fitness / health club",
  },
  beauty: {
    wcEnabled: false,
    classCode: "9586",
    classSuffix: "00",
    classDescription: "BARBER SHOP OR BEAUTY PARLOR",
    operationsDesc: "Barber or beauty parlor",
  },
  cleaning: {
    wcEnabled: false,
    classCode: "9014",
    classSuffix: "00",
    classDescription: "JANITORIAL SERVICES BY CONTRACTORS",
    operationsDesc: "Janitorial services",
  },
  pet: {
    wcEnabled: false,
    classCode: "0917",
    classSuffix: "00",
    classDescription: "PET SITTING SERVICES & DRIVERS",
    operationsDesc: "Pet sitting",
  },
};

export function ratingClassificationCd(entry) {
  if (!entry) return null;
  return `${entry.classCode}${entry.classSuffix || "00"}`;
}

export function getGuardSegmentEntry(segment) {
  const key = String(segment || "")
    .trim()
    .toLowerCase();
  return GUARD_SEGMENTS[key] || null;
}

function envSegmentAllowlist() {
  const raw = process.env.GUARD_ENABLED_SEGMENTS;
  if (raw == null) return null;
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getGuardPilotStates() {
  const raw = process.env.GUARD_PILOT_STATES;
  const list = raw
    ? String(raw)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : GUARD_DEFAULT_PILOT_STATES;
  return new Set(list);
}

export function isGuardPilotState(state) {
  const st = String(state || "")
    .trim()
    .toUpperCase();
  return getGuardPilotStates().has(st);
}

/**
 * WC offer for this segment? Registry on/off AND optional env allowlist.
 * Unset GUARD_ENABLED_SEGMENTS → registry only.
 * Empty GUARD_ENABLED_SEGMENTS → WC off everywhere (deploy kill switch).
 */
export function isGuardWcEnabledForSegment(segment) {
  const key = String(segment || "")
    .trim()
    .toLowerCase();
  const entry = GUARD_SEGMENTS[key];
  if (!entry?.wcEnabled) return false;
  const allow = envSegmentAllowlist();
  if (allow === null) return true;
  return allow.includes(key);
}
