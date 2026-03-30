/** Escape CSV cell per RFC-style (quotes if needed) */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatMoneyCsv(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(v)) return "";
  return v.toFixed(2);
}
