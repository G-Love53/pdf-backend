/**
 * GUARD Workers’ Comp — per-line switch + NCCI class.
 * New ConnectQuote launches default wcEnabled: false.
 * GUARD “Digital Decision” is their auto-quote name — never shown in CID UX.
 *
 * Class flags from packet 08.21.26 (CO): [E] auto-quote, [R] refer, [I] ineligible.
 *
 * Fitness and beauty are split by business class (aligned with coterieRegistry.js)
 * so GUARD can map distinct NCCI classes per trade when their systems require it.
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
 * @typedef {object} GuardWcLineEntry
 * @property {string} lineKey  Registry / partner-test key (e.g. fitness_yoga)
 * @property {string} parentSegment  DB segment_type (e.g. fitness)
 * @property {string|null} businessClass  Coterie business_class key when applicable
 * @property {string} label  Human label for partner test + docs
 * @property {boolean} wcEnabled
 * @property {string} classCode  NCCI 4-digit
 * @property {string} classSuffix  padded into 6-digit RatingClassificationCd
 * @property {string} classDescription
 * @property {string} operationsDesc
 * @property {string} [digitalDecisionNote]
 */

/** @type {Record<string, GuardWcLineEntry>} */
export const GUARD_WC_LINES = {
  plumber: {
    lineKey: "plumber",
    parentSegment: "plumber",
    businessClass: null,
    label: "Plumber",
    wcEnabled: true,
    classCode: "5183",
    classSuffix: "22",
    classDescription: "PLUMBING NOC & DRIVERS",
    operationsDesc: "Plumbing contracting",
    digitalDecisionNote:
      "Commercial/industrial customers can decline Digital Decision (NCCI 23-5183_01).",
  },
  electrical: {
    lineKey: "electrical",
    parentSegment: "electrical",
    businessClass: null,
    label: "Electrical contractor",
    wcEnabled: true,
    classCode: "5190",
    classSuffix: "00",
    classDescription: "ELECTRICAL WIRING W/I BLDGS & DRVRS",
    operationsDesc: "Electrical contracting",
    digitalDecisionNote:
      "Work above 15 feet or commercial/industrial can decline Digital Decision.",
  },
  hvac: {
    lineKey: "hvac",
    parentSegment: "hvac",
    businessClass: null,
    label: "HVAC contractor",
    wcEnabled: false,
    classCode: "5537",
    classSuffix: "00",
    classDescription: "HEAT,VENT,AC,REFRIG. SYS-INST REP",
    operationsDesc: "HVAC contracting",
  },
  fitness_yoga: {
    lineKey: "fitness_yoga",
    parentSegment: "fitness",
    businessClass: "yoga_studio",
    label: "Fitness — yoga studio",
    wcEnabled: true,
    classCode: "9063",
    classSuffix: "00",
    classDescription: "EXERCISE OR HEALTH INSTITUTE & CLER",
    operationsDesc: "Yoga studio",
    digitalDecisionNote:
      "Confirm NCCI class with GUARD if yoga splits from other fitness lines.",
  },
  fitness_pilates: {
    lineKey: "fitness_pilates",
    parentSegment: "fitness",
    businessClass: "pilates_studio",
    label: "Fitness — pilates / mind-body studio",
    wcEnabled: true,
    classCode: "9063",
    classSuffix: "00",
    classDescription: "EXERCISE OR HEALTH INSTITUTE & CLER",
    operationsDesc: "Pilates / mind-body studio",
    digitalDecisionNote:
      "Confirm NCCI class with GUARD if pilates splits from other fitness lines.",
  },
  fitness_trainer: {
    lineKey: "fitness_trainer",
    parentSegment: "fitness",
    businessClass: "personal_trainer",
    label: "Fitness — personal trainer / instructor",
    wcEnabled: true,
    classCode: "9063",
    classSuffix: "00",
    classDescription: "EXERCISE OR HEALTH INSTITUTE & CLER",
    operationsDesc: "Personal trainer / fitness instructor",
    digitalDecisionNote:
      "Confirm NCCI class with GUARD if personal training splits from studio classes.",
  },
  beauty_hair: {
    lineKey: "beauty_hair",
    parentSegment: "beauty",
    businessClass: "hair_salon",
    label: "Beauty — hair salon / beauty shop",
    wcEnabled: true,
    classCode: "9586",
    classSuffix: "00",
    classDescription: "BARBER SHOP OR BEAUTY PARLOR",
    operationsDesc: "Hair salon / beauty shop",
    digitalDecisionNote:
      "Confirm NCCI class with GUARD if hair splits from nails/barber.",
  },
  beauty_barber: {
    lineKey: "beauty_barber",
    parentSegment: "beauty",
    businessClass: "barber_shop",
    label: "Beauty — barber shop",
    wcEnabled: true,
    classCode: "9586",
    classSuffix: "00",
    classDescription: "BARBER SHOP OR BEAUTY PARLOR",
    operationsDesc: "Barber shop",
    digitalDecisionNote:
      "Confirm NCCI class with GUARD if barber splits from salon/nails.",
  },
  beauty_nail: {
    lineKey: "beauty_nail",
    parentSegment: "beauty",
    businessClass: "nail_salon",
    label: "Beauty — nail salon",
    wcEnabled: true,
    classCode: "9586",
    classSuffix: "00",
    classDescription: "BARBER SHOP OR BEAUTY PARLOR",
    operationsDesc: "Nail salon",
    digitalDecisionNote:
      "Confirm NCCI class with GUARD if nails split from hair/barber.",
  },
  cleaning: {
    lineKey: "cleaning",
    parentSegment: "cleaning",
    businessClass: null,
    label: "Janitorial / cleaning",
    wcEnabled: true,
    classCode: "9014",
    classSuffix: "00",
    classDescription: "JANITORIAL SERVICES BY CONTRACTORS",
    operationsDesc: "Janitorial services",
  },
  pet: {
    lineKey: "pet",
    parentSegment: "pet",
    businessClass: null,
    label: "Pet sitting",
    wcEnabled: true,
    classCode: "0917",
    classSuffix: "00",
    classDescription: "PET SITTING SERVICES & DRIVERS",
    operationsDesc: "Pet sitting",
  },
};

/** @deprecated Use GUARD_WC_LINES */
export const GUARD_SEGMENTS = GUARD_WC_LINES;

export function ratingClassificationCd(entry) {
  if (!entry) return null;
  return `${entry.classCode}${entry.classSuffix || "00"}`;
}

function normalizeBusinessClass(raw) {
  if (!raw) return null;
  return String(raw).trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Resolve a WC line from partner lineKey, parent segment, or business_class.
 * @param {string} segmentOrLine
 * @param {string} [businessClass]
 * @returns {GuardWcLineEntry|null}
 */
export function resolveGuardWcLine(segmentOrLine, businessClass) {
  const key = String(segmentOrLine || "")
    .trim()
    .toLowerCase();
  const bc = normalizeBusinessClass(businessClass);

  if (GUARD_WC_LINES[key]) return GUARD_WC_LINES[key];

  if (bc) {
    const byBc = Object.values(GUARD_WC_LINES).find(
      (e) => e.parentSegment === key && e.businessClass === bc,
    );
    if (byBc) return byBc;
  }

  const forParent = Object.values(GUARD_WC_LINES).filter(
    (e) => e.parentSegment === key && e.wcEnabled,
  );
  if (forParent.length === 1) return forParent[0];
  return null;
}

export function getGuardSegmentEntry(segmentOrLine, businessClass) {
  return resolveGuardWcLine(segmentOrLine, businessClass);
}

export function guardDbSegmentFromLine(segmentOrLine, businessClass) {
  const line = resolveGuardWcLine(segmentOrLine, businessClass);
  return line?.parentSegment || String(segmentOrLine || "bar").toLowerCase();
}

function envSegmentAllowlist() {
  const raw = process.env.GUARD_ENABLED_SEGMENTS;
  if (raw == null) return null;
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function lineAllowedByEnv(entry) {
  const allow = envSegmentAllowlist();
  if (allow === null) return true;
  return (
    allow.includes(entry.lineKey) ||
    allow.includes(entry.parentSegment) ||
    (entry.businessClass && allow.includes(entry.businessClass))
  );
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
 * WC offer for this segment/line? Registry on/off AND optional env allowlist.
 * Parent segments (fitness, beauty) are on when any child line is enabled.
 */
export function isGuardWcEnabledForSegment(segmentOrLine, businessClass) {
  const key = String(segmentOrLine || "")
    .trim()
    .toLowerCase();
  const bc = normalizeBusinessClass(businessClass);

  const direct = GUARD_WC_LINES[key];
  if (direct) {
    if (!direct.wcEnabled) return false;
    return lineAllowedByEnv(direct);
  }

  if (bc) {
    const line = resolveGuardWcLine(key, bc);
    if (line?.wcEnabled && lineAllowedByEnv(line)) return true;
  }

  const children = Object.values(GUARD_WC_LINES).filter(
    (e) => e.parentSegment === key && e.wcEnabled && lineAllowedByEnv(e),
  );
  return children.length > 0;
}
