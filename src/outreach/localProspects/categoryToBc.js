/**
 * Map LocalProspects rows → Coterie bc via Google category allowlist only.
 */

import {
  resolveBcFromGoogleCategory,
  allowedBcKeys,
} from "./googleCategoryAllowlist.js";

/**
 * @param {string} segment
 * @param {{ category?: string, keywordBc?: string }} opts
 * @returns {string|null}
 */
export function resolveBcFromLocalProspects(segment, opts = {}) {
  const fromCategory = resolveBcFromGoogleCategory(segment, opts.category);
  if (fromCategory) return fromCategory;

  // No matching Google category: only accept keyword bc when category is blank (LP export gap)
  const normCat = String(opts.category || "").trim();
  const hint = opts.keywordBc;
  if (!normCat && hint && allowedBcKeys(segment).includes(hint)) {
    return hint;
  }

  return null;
}

export {
  resolveBcFromGoogleCategory,
  allowedBcKeys,
  GOOGLE_CATEGORY_ALLOWLIST,
} from "./googleCategoryAllowlist.js";
