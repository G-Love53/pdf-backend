/**
 * US ZIP extraction + validation for outreach prefill.
 * Use the **last** 5-digit match in an address (street numbers often look like zips).
 */

export function normalizeZipDigits(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

/** Last 5-digit (or 5+4) match in a free-form address string. */
export function extractUsZipFromAddress(full) {
  const s = String(full || "");
  const matches = [...s.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1];
}

/** Prefer explicit ZIP column; else last zip token in address line. */
export function resolveUsZip({ address, zip, state } = {}) {
  const fromColumn = normalizeZipDigits(zip);
  const fromAddress = extractUsZipFromAddress(address);
  const candidates = [];
  if (fromColumn) candidates.push(fromColumn);
  if (fromAddress && fromAddress !== fromColumn) candidates.push(fromAddress);
  for (const c of candidates) {
    if (isPlausibleUsZip(c, state)) return c;
  }
  return null;
}

/** @param {string|null|undefined} stateAbbr e.g. CO */
export function isPlausibleUsZip(zip, stateAbbr) {
  const z = normalizeZipDigits(zip);
  if (!z) return false;
  const n = Number(z);
  if (!Number.isFinite(n)) return false;

  const st = String(stateAbbr || "")
    .trim()
    .toUpperCase();
  if (st === "CO") return n >= 80001 && n <= 81699;
  if (st === "TX") return n >= 73301 && n <= 88595;
  if (st === "CA") return n >= 90001 && n <= 96162;

  // Generic US range — excludes low street-number false positives in most cases
  return n >= 501 && n <= 99950;
}
