/**
 * CID shared UUID helpers — keep Postgres UUID columns from seeing junk strings.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 * @returns {string | null} Lowercase RFC UUID string, or null if missing/invalid
 */
export function parseOptionalUuid(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s.toLowerCase() : null;
}
