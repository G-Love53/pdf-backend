/**
 * Google Business Profile category → Coterie bc (allowlist only).
 *
 * Coterie dropdown labels ≠ Google taxonomy. This table is the source of truth
 * for list quality — expand from production pulls, not regex blocklists.
 *
 * Match: normalized exact string (lowercase, trim, collapse spaces).
 */

/** @type {Record<string, Record<string, string[]>>} segment → bc → Google categories */
export const GOOGLE_CATEGORY_ALLOWLIST = {
  pet: {
    pet_grooming: [
      "pet groomer",
      "dog groomer",
      "pet grooming service",
      "pet groomers",
      "mobile pet groomer",
      "cat groomer",
    ],
    pet_sitting: [
      "pet sitter",
      "pet boarding service",
      "kennel",
      "dog walker",
      "pet boarding",
      "dog boarding",
      "pet care service",
    ],
  },
  beauty: {
    hair_salon: [
      "hair salon",
      "beauty salon",
      "hairdresser",
      "beauty parlour",
      "hair care",
    ],
    barber_shop: ["barber shop", "barbershop", "barber"],
    nail_salon: ["nail salon", "nail spa"],
    esthetician: [
      "esthetician",
      "skin care clinic",
      "facial spa",
      "day spa",
      "spa",
    ],
  },
  cleaning: {
    home_cleaning: [
      "house cleaning service",
      "cleaners",
      "cleaning service",
      "maid service",
      "janitorial service",
      "home help",
      "house cleaning",
    ],
    carpet_cleaning: [
      "carpet cleaning service",
      "upholstery cleaning service",
    ],
  },
  plumber: {
    plumbing_contractor: [
      "plumber",
      "plumbing supply store",
      "plumbing contractor",
      "drainage service",
    ],
  },
  hvac: {
    hvac_contractor: [
      "hvac contractor",
      "air conditioning contractor",
      "heating contractor",
      "furnace repair service",
      "air conditioning repair service",
    ],
  },
  electrical: {
    electric_contracting: [
      "electrician",
      "electrical installation service",
      "electrical engineer",
    ],
  },
  fitness: {
    yoga_studio: ["yoga studio", "yoga instructor"],
    pilates_studio: ["pilates studio"],
    personal_trainer: [
      "personal trainer",
      "fitness center",
      "gym",
      "physical fitness program",
    ],
  },
  painter: {
    painting_contractor: [
      "painting",
      "painter",
      "painting contractor",
      "house painter",
      "commercial painter",
    ],
  },
};

export function normalizeGoogleCategory(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @returns {string|null} Coterie bc key if category is on allowlist for segment
 */
export function resolveBcFromGoogleCategory(segment, category) {
  const norm = normalizeGoogleCategory(category);
  if (!norm) return null;

  const seg = GOOGLE_CATEGORY_ALLOWLIST[String(segment || "").toLowerCase()];
  if (!seg) return null;

  for (const [bc, categories] of Object.entries(seg)) {
    if (categories.some((c) => normalizeGoogleCategory(c) === norm)) {
      return bc;
    }
  }

  return null;
}

/** All allowed bc keys for a segment (for validation). */
export function allowedBcKeys(segment) {
  const seg = GOOGLE_CATEGORY_ALLOWLIST[String(segment || "").toLowerCase()];
  return seg ? Object.keys(seg) : [];
}
