/** Valid 10-digit US NANP — rejects truncated +1 leftovers like 1303422740. */
const NANP_TEN = /^[2-9]\d{2}[2-9]\d{6}$/;

/**
 * 10 digits starting with 1 where digit 2 is a valid area-code start — classic
 * slice(0,10) on "13034227400" before country-code strip.
 */
export function isLikelyTruncatedUsPhone(digits) {
  return (
    typeof digits === 'string' &&
    digits.length === 10 &&
    digits.startsWith('1') &&
    /^[2-9]/.test(digits.slice(1, 2))
  );
}

/**
 * Normalize a US phone for Instantly CSV and ConnectQuote `ph=` prefill.
 *
 * 1. Strip non-digits (never cap length before this)
 * 2. Drop leading 1 when 11 digits (country code)
 * 3. If still >10 digits, keep last 10 (extension / bad paste)
 * 4. Return '' unless exactly 10 valid NANP digits
 *
 * Empty is intentional — wrong prefill is worse than blank.
 * Already-truncated 10-digit "1303422740" cannot be recovered; caller should try another source field.
 */
export function normalizeUsPhone(raw) {
  if (raw == null || raw === '') return '';
  let digits = String(raw).replace(/\D+/g, '');
  if (!digits) return '';

  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  if (!NANP_TEN.test(digits)) return '';
  return digits;
}

/**
 * Try multiple raw phone fields; return first valid 10-digit NANP.
 * Prefer mobile/direct over corporate switchboard.
 */
export function pickBestUsPhone(...rawCandidates) {
  for (const raw of rawCandidates) {
    const normalized = normalizeUsPhone(raw);
    if (normalized) return normalized;
  }
  return '';
}

/** @deprecated use normalizeUsPhone */
export function cleanPhone(raw) {
  return normalizeUsPhone(raw);
}
