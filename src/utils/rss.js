/**
 * RSS (multi-segment) helpers: normalize segment slugs and deploy-local branding.
 * Backend segment is still driven by DB `submissions.segment` + `SEGMENT` env per deploy.
 */
import { SegmentType } from "../constants/postgresEnums.js";

const KNOWN_SEGMENTS = new Set(Object.values(SegmentType));

/**
 * Normalize segment from DB, BoldSign metadata, or path segments.
 * Falls back to `fallback`, then `process.env.SEGMENT`, then `bar`.
 *
 * @param {unknown} raw
 * @param {string} [fallback]
 * @returns {string}
 */
export function normalizeSegment(raw, fallback) {
  const fb = String(
    fallback ?? process.env.SEGMENT ?? SegmentType.BAR,
  )
    .trim()
    .toLowerCase();
  const safeFb = KNOWN_SEGMENTS.has(fb) ? fb : SegmentType.BAR;

  if (raw == null || raw === "") return safeFb;
  const t = String(raw).trim().toLowerCase();
  return KNOWN_SEGMENTS.has(t) ? t : safeFb;
}

/**
 * First line of generated bind-confirmation PDF (all segments can override per deploy).
 * @returns {string}
 */
export function brandLineForBindPdf() {
  const line = process.env.CID_BRAND_NAME || "Commercial Insurance Direct";
  return String(line).trim() || "Commercial Insurance Direct";
}
