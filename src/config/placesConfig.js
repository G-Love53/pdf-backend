/**
 * Address autocomplete (Google Places, server-side).
 * 10+1 rollout: CO live + 10 expansion states. Override with GOOGLE_PLACES_STATES.
 */
export const CID_ADDRESS_STATES_10_PLUS_1 = [
  "CO",
  "AZ",
  "UT",
  "NM",
  "WY",
  "NV",
  "ID",
  "KS",
  "NE",
  "OK",
  "TX",
];

export function googlePlacesApiKey() {
  return String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
}

export function isGooglePlacesConfigured() {
  return Boolean(googlePlacesApiKey());
}

export function placesAllowedStates() {
  const raw = String(process.env.GOOGLE_PLACES_STATES || "").trim();
  const list = (raw
    ? raw.split(/[\s,]+/)
    : CID_ADDRESS_STATES_10_PLUS_1
  )
    .map((s) => String(s || "").trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
  return [...new Set(list.length ? list : ["CO"])];
}

export function isPlacesAllowedState(st) {
  const code = String(st || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  return placesAllowedStates().includes(code);
}
