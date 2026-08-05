/**
 * Operator UI segment filter (All + DB segment_type values).
 * Routes/services already use `submissions.segment` / `quotes.segment` — this only unifies the dashboard.
 */

export const OPERATOR_SEGMENT_VALUES = ["bar", "roofer", "plumber", "hvac", "fitness", "electrical", "beauty", "cleaning", "pet"];

/**
 * @param {unknown} value - query param `segment` or undefined
 * @returns {'all'|'bar'|'roofer'|'plumber'|'hvac'}
 */
export function parseOperatorSegmentQuery(value) {
  const raw = String(value ?? "all").toLowerCase().trim();
  if (raw === "" || raw === "all") return "all";
  if (OPERATOR_SEGMENT_VALUES.includes(raw)) return raw;
  return "all";
}

/**
 * Postgres: filter submissions alias `s` (or any table with `.segment` of type segment_type).
 * Bind `$paramIndex` to the string 'all' or a segment enum label.
 * @param {string} [alias='s'] - table alias for submissions
 * @param {number} [paramIndex=1] - `$N` placeholder index
 */
export function sqlSegmentFilter(alias = "s", paramIndex = 1) {
  return `AND ($${paramIndex}::text = 'all' OR ${alias}.segment = $${paramIndex}::segment_type)`;
}

/** Append `&segment=` for redirects when operator had a segment filter (req.query.segment). */
export function segmentQuerySuffix(req) {
  const seg = parseOperatorSegmentQuery(req?.query?.segment);
  if (seg === "all") return "";
  return `&segment=${encodeURIComponent(seg)}`;
}
