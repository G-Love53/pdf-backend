// utils/helpers.js
// One helpers module to rule them all (125/126/140/Society/WC)

// ---- internal utils (not exported directly) ----
const _toStr = (v) => String(v ?? "").trim();
const _isYes = (v) => {
  const s = _toStr(v).toLowerCase();
  return v === true || ["true", "yes", "y", "1"].includes(s);
};
const _toNumber = (v) => {
  if (typeof v === "number") return v;
  const n = parseFloat(_toStr(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// ---- export everything on one default object ----
export default {
  // ============ 125-compatible (keep behavior) ============
  // Checkbox helper – returns 'X' or ''
  x(value) {
    return _isYes(value) ? "X" : "";
  },

  // Yes/No helper – returns 'Y' or 'N'
  yn(value) {
    return _isYes(value) ? "Y" : "N";
  },

  // Plain money (no $) with thousands (e.g., 12345 -> "12,345")
  money(value) {
    const n = _toNumber(value);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },

  // ============ New general-purpose helpers ============
  // Human text "Yes"/"No"
  yesno(value) {
    return _isYes(value) ? "Yes" : "No";
  },

  // Boolean test (nice for ejs if/checkboxes)
  isYes(value) {
    return _isYes(value);
  },

  // $ with thousands (e.g., 12345 -> "$12,345")
  moneyUSD(value) {
    const n = _toNumber(value);
    if (!Number.isFinite(n)) return "";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },

  // Percent out (number or numeric string) -> "42.00%"
  pct(value) {
    const n = _toNumber(value);
    if (!Number.isFinite(n)) return "";
    return n.toFixed(2) + "%";
  },

  // Select "Yes" if ANY argument is a yes (radio-like groups)
  oneOf(...vals) {
    return vals.some((v) => _isYes(v)) ? "Yes" : "";
  },

  // Format date to MM/DD/YYYY
  formatDate(date = new Date()) {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = d.getFullYear();
    return `${mm}/${dd}/${yy}`;
  },

  // Safe join for address lines, etc.
  join(parts, sep = ", ") {
    return (Array.isArray(parts) ? parts : [parts]).filter(Boolean).join(sep);
  },

  // Convenience: compute % Alcohol = alcohol / (food+alcohol)
  // Pass raw values; returns "##.##%" or ""
  calcAlcoholPercent(food, alcohol) {
    const f = _toNumber(food);
    const a = _toNumber(alcohol);
    if (!Number.isFinite(f) || !Number.isFinite(a) || (f + a) <= 0) return "";
    return ((a / (f + a)) * 100).toFixed(2) + "%";
  },
};

