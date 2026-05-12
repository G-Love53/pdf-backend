/**
 * Unsigned public GET for Netlify (or any client) to load sanitized renewal prefill
 * after verifying HMAC renewal_token. No Connect session required.
 */
import { getPool } from "../db.js";
import { verifyRenewalIntakeToken } from "../lib/renewalIntakeToken.js";

export async function renewalPrefillHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.query.renewal_token || req.query.token || "").trim();
  const claims = verifyRenewalIntakeToken(token);
  if (!claims) {
    return res.status(401).json({ ok: false, error: "invalid_or_expired_token" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ ok: false, error: "database_unavailable" });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, p.policy_number, p.segment::text AS segment, p.carrier_name,
              p.effective_date, p.expiration_date, p.annual_premium, p.coverage_data,
              b.business_name
       FROM policies p
       LEFT JOIN submissions s ON s.submission_id = p.submission_id
       LEFT JOIN businesses b ON b.business_id = s.business_id
       WHERE p.id = $1::uuid
         AND COALESCE(p.client_id, s.client_id) = $2::uuid`,
      [claims.policyId, claims.clientId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "policy_not_found" });
    }

    const row = result.rows[0];
    const data = {
      policy_id: row.id,
      policy_number: row.policy_number,
      segment: row.segment,
      carrier_name: row.carrier_name || null,
      business_name: row.business_name || null,
      effective_date: row.effective_date,
      expiration_date: row.expiration_date,
      annual_premium: row.annual_premium != null ? Number(row.annual_premium) : null,
      coverage_data: row.coverage_data || {},
    };

    return res.json({ ok: true, data });
  } catch (e) {
    console.error("[renewalPrefill]", e?.message || e);
    return res.status(500).json({ ok: false, error: "prefill_failed" });
  }
}
