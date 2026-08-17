/**
 * displayName normalizer for Instantly merge tags.
 * Raw companyName can run 124+ chars on SEO-stuffed Google Business names.
 * Rule: if it can't be cleaned to <=45 chars, emit '' — blank beats a broken sentence.
 */

const LEGAL_SUFFIX =
  /[,\s]+(inc|llc|l\.l\.c|ltd|co|corp|corporation|company|incorporated)\.?$/i;

export function normalizeDisplayName(raw, maxLen = 45) {
  if (!raw) return '';
  let n = String(raw).trim();

  n = n.split('|')[0].trim();
  n = n.split(/\s+[-–—]\s+/)[0].trim();
  n = n.replace(/\s*\(.*?\)\s*/g, ' ').trim();

  for (let i = 0; i < 2; i++) {
    n = n.replace(LEGAL_SUFFIX, '').trim();
  }

  n = n.replace(/\s{2,}/g, ' ').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '');

  return n.length > maxLen ? '' : n;
}
