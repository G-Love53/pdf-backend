/** Coterie ConnectQuote policies often show admitted paper name (e.g. Spinnaker), not "Coterie". */
export const COTERIE_KB_CARRIER_SLUG = "coterie";

const COTERIE_PAPER_PATTERN =
  /spinnaker|clear\s*spring|benchmark|coterie/i;

/**
 * Map underwriting carrier display name → carrier_knowledge slug.
 * @param {string | null | undefined} carrierName
 * @returns {string | null}
 */
export function coterieKbSlugOverride(carrierName) {
  const raw = String(carrierName || "").trim();
  if (!raw) return null;
  if (COTERIE_PAPER_PATTERN.test(raw)) return COTERIE_KB_CARRIER_SLUG;
  return null;
}
