import {
  listBusinessClasses,
  resolveRegistryEntry,
} from "./coterieRegistry.js";

/** v1 pilot states — expand when Coterie licenses additional producer states. */
export const COTERIE_PILOT_STATES = new Set(["CO"]);

/**
 * Resolve AKHash for segment intake. Returns:
 * - string: use on Coterie API
 * - null: explicit disqualifier → traditional rail
 * - undefined: unknown class → traditional rail
 */
export function resolveAkHash(segment, businessClassKey) {
  const entry = resolveRegistryEntry(segment, businessClassKey);
  if (!entry) return undefined;
  if (entry.prohibited || entry.akHash === null) return null;
  return entry.akHash || undefined;
}

export { listBusinessClasses, resolveRegistryEntry };

export function isCoteriePilotState(state) {
  const st = String(state || "").trim().toUpperCase();
  return COTERIE_PILOT_STATES.has(st);
}
