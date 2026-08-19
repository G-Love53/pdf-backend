/** Valid 10-digit US NANP — rejects truncated +1 leftovers like 1303422740. */
const NANP_TEN = /^[2-9]\d{2}[2-9]\d{6}$/;

/**
 * Normalize a US phone for Instantly CSV and ConnectQuote `ph=` prefill.
 *
 * 1. Strip non-digits
 * 2. Drop leading 1 when 11 digits (country code)
 * 3. If still >10 digits, keep last 10 (extension / bad paste)
 * 4. Return '' unless exactly 10 valid NANP digits
 *
 * Empty is intentional — wrong prefill is worse than blank.
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

/** @deprecated use normalizeUsPhone */
export function cleanPhone(raw) {
  return normalizeUsPhone(raw);
}
