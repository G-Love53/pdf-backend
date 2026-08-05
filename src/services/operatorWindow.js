/**
 * Shared time window for Operator Home metrics + ConnectQuote learning.
 * Queues (S4/S5/S6 backlog) intentionally stay unfiltered.
 */

export const OPERATOR_WINDOW_OPTIONS = [
  { value: "today", label: "Today (UTC)" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

/**
 * @param {string|number|Record<string, unknown>|undefined} raw
 * Query object may pass `{ window, cq_days, days }` for backward compatibility.
 */
export function parseOperatorWindow(raw) {
  let value = raw;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    value = raw.window ?? raw.cq_days ?? raw.days ?? "7";
  }

  const v = String(value ?? "7").trim().toLowerCase();
  if (v === "today" || v === "day") {
    return {
      key: "today",
      label: "Today (UTC)",
      shortLabel: "today",
      isToday: true,
      days: 1,
    };
  }

  const n = Number.parseInt(v, 10);
  const days = Number.isFinite(n) && n >= 1 ? Math.min(n, 90) : 7;
  return {
    key: String(days),
    label: `Last ${days} days`,
    shortLabel: `${days}d`,
    isToday: false,
    days,
  };
}

/**
 * SQL time predicate for a timestamp column.
 * @param {string} columnExpr e.g. `s.submitted_at`
 * @param {{ isToday: boolean, days: number }} window
 * @param {number} daysParamIndex `$N` for rolling windows (ignored when today)
 */
export function sqlWindowFilter(columnExpr, window, daysParamIndex) {
  if (window.isToday) {
    return `${columnExpr} >= CURRENT_DATE AND ${columnExpr} < CURRENT_DATE + INTERVAL '1 day'`;
  }
  return `${columnExpr} >= NOW() - ($${daysParamIndex}::int * INTERVAL '1 day')`;
}

/** Append `window=` to an existing query string or `?segment=`. */
export function operatorWindowQuerySuffix(segmentQuery, window) {
  const w = parseOperatorWindow(window);
  const base = segmentQuery && segmentQuery.startsWith("?") ? segmentQuery : "";
  const sep = base ? "&" : "?";
  return `${base}${sep}window=${encodeURIComponent(w.key)}`;
}
