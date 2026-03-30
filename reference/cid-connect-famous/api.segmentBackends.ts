/**
 * MERGE into Famous `src/api.ts` (or import from this module).
 * Fixes: missing `app_settings` keys no longer break COI/claims/renewals;
 * empty DB still shows segments in UI; single default API host (RSS-friendly).
 */

import { supabase } from "@/lib/supabase";

/** Universal CID-PDF-API host when no per-segment override is configured. */
export function getDefaultCidApiBaseUrl(): string {
  const u = (import.meta.env.VITE_CID_API_URL || "").trim().replace(/\/$/, "");
  return u || "https://cid-pdf-api.onrender.com";
}

export function normalizeSegmentKey(segment: string | undefined | null): string {
  return (segment ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** Coerce app_settings.value (jsonb string, json object, or plain string). */
export function coerceSettingToUrl(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const t = val.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t) as unknown;
      if (typeof p === "string" && p.trim()) return p.trim().replace(/\/$/, "");
      if (p && typeof p === "object" && "url" in (p as object)) {
        const u = String((p as { url: unknown }).url || "").trim();
        return u ? u.replace(/\/$/, "") : null;
      }
    } catch {
      return t.replace(/\/$/, "");
    }
    return t.replace(/\/$/, "");
  }
  if (typeof val === "object" && val !== null && "url" in (val as object)) {
    const u = String((val as { url: unknown }).url || "").trim();
    return u ? u.replace(/\/$/, "") : null;
  }
  return null;
}

export async function getAppSettingValue(key: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/**
 * Base URL for segment-scoped backend calls.
 * Order: app_settings `segment_backend_<slug>` → `VITE_CID_API_URL` default.
 */
export async function getSegmentBackendBaseUrl(segment: string | undefined | null): Promise<string> {
  const seg = normalizeSegmentKey(segment);
  const fallback = getDefaultCidApiBaseUrl();

  if (!seg) return fallback;

  const key = `segment_backend_${seg}`;
  const raw = await getAppSettingValue(key);
  const fromDb = coerceSettingToUrl(raw);
  if (fromDb) return fromDb;

  return fallback;
}

/** @deprecated alias — use `getSegmentBackendBaseUrl` */
export async function getBaseUrl(segment: string | undefined | null): Promise<string> {
  return getSegmentBackendBaseUrl(segment);
}

function parseEnvSegmentFallback(): string[] {
  const raw = (import.meta.env.VITE_DEFAULT_SEGMENTS as string | undefined) || "bar,plumber,roofer,hvac";
  return raw
    .split(",")
    .map((s) => normalizeSegmentKey(s))
    .filter(Boolean);
}

async function segmentsFromAppSettingKeys(): Promise<string[]> {
  const { data, error } = await supabase.from("app_settings").select("key").like("key", "segment_backend_%");
  if (error) throw error;
  const out: string[] = [];
  for (const row of data || []) {
    const k = (row as { key?: string }).key;
    if (!k || !k.startsWith("segment_backend_")) continue;
    const suffix = k.slice("segment_backend_".length);
    const n = normalizeSegmentKey(suffix);
    if (n) out.push(n);
  }
  return out;
}

async function segmentsFromTable(table: string): Promise<string[]> {
  const { data, error } = await supabase.from(table).select("segment");
  if (error) {
    console.warn(`[segments] skip ${table}:`, error.message);
    return [];
  }
  const out: string[] = [];
  for (const row of data || []) {
    const s = normalizeSegmentKey((row as { segment?: string }).segment);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Distinct segments for UI filters / SegmentSelector.
 * Union: data tables + segment_backend_* keys + env fallback if empty.
 */
export async function getDistinctSegments(): Promise<string[]> {
  const acc = new Set<string>();

  for (const s of await segmentsFromAppSettingKeys()) acc.add(s);
  for (const s of await segmentsFromTable("quotes")) acc.add(s);
  for (const s of await segmentsFromTable("policies")) acc.add(s);
  for (const s of await segmentsFromTable("claims")) acc.add(s);

  if (acc.size === 0) {
    for (const s of parseEnvSegmentFallback()) acc.add(s);
  }

  return Array.from(acc).sort((a, b) => a.localeCompare(b));
}

/** Stable Tailwind-ish badge classes for unknown segments. */
export function getSegmentColorClass(segment: string | undefined | null): string {
  const palette = [
    "badge-indigo",
    "badge-emerald",
    "badge-amber",
    "badge-rose",
    "badge-violet",
    "badge-cyan",
    "badge-sky",
    "badge-fuchsia",
  ];
  const s = normalizeSegmentKey(segment) || "unknown";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % palette.length;
  return palette[h] ?? "badge-zinc";
}

/**
 * Body/query segment for CID-PDF-API — never empty in production.
 * Uses `VITE_DEFAULT_SEGMENT` (default `bar`) only when caller omits segment.
 */
export function formatSegmentForApi(segment: string | undefined | null): string {
  const s = normalizeSegmentKey(segment);
  if (s) return s;
  const d = normalizeSegmentKey(import.meta.env.VITE_DEFAULT_SEGMENT as string | undefined);
  return d || "bar";
}
