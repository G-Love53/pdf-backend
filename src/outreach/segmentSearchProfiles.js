/**
 * Coterie ConnectQuote segments → LocalProspects search keywords + default bc.
 * One LP campaign per keyword (API is single-keyword); merge on export.
 *
 * Coverage: statewide = LP region scope + per-city default_depth (not one query).
 * Overlap across cities is expected — dedupe on google_cid/place_id at clean time.
 * See docs/localprospects-list-design.md.
 */

export const SEGMENT_SEARCH_PROFILES = {
  beauty: {
    keywords: [
      { keyword: "hair salon", bc: "hair_salon" },
      { keyword: "barber shop", bc: "barber_shop" },
      { keyword: "nail salon", bc: "nail_salon" },
      { keyword: "esthetician", bc: "esthetician" },
    ],
  },
  cleaning: {
    keywords: [
      { keyword: "house cleaning", bc: "home_cleaning" },
      { keyword: "carpet cleaning", bc: "carpet_cleaning" },
    ],
  },
  pet: {
    keywords: [
      { keyword: "pet groomer", bc: "pet_grooming" },
      { keyword: "pet sitter", bc: "pet_sitting" },
      { keyword: "pet boarding", bc: "pet_sitting" },
    ],
  },
  plumber: {
    keywords: [{ keyword: "plumber", bc: "plumbing_contractor" }],
  },
  hvac: {
    keywords: [{ keyword: "hvac contractor", bc: "hvac_contractor" }],
  },
  electrical: {
    keywords: [{ keyword: "electrician", bc: "electric_contracting" }],
  },
  fitness: {
    keywords: [
      { keyword: "yoga studio", bc: "yoga_studio" },
      { keyword: "pilates studio", bc: "pilates_studio" },
      { keyword: "personal trainer", bc: "personal_trainer" },
    ],
  },
};

export function getSegmentSearchProfile(segment) {
  const key = String(segment || "").toLowerCase();
  return SEGMENT_SEARCH_PROFILES[key] || null;
}

export function listSegmentKeywords(segment) {
  return getSegmentSearchProfile(segment)?.keywords || [];
}
