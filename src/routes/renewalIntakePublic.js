/**
 * Unsigned public GET for Netlify (or any client) to load sanitized renewal prefill
 * after verifying HMAC renewal_token. No Connect session required.
 */
import { getPool } from "../db.js";
import { verifyRenewalIntakeTokenResult, normalizeRenewalToken } from "../lib/renewalIntakeToken.js";

export async function renewalPrefillHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const raw = req.query.renewal_token ?? req.query.token;
  const token = normalizeRenewalToken(raw);
  const v = verifyRenewalIntakeTokenResult(token);
  if (!v.ok) {
    if (v.reason === "missing_secret") {
      return res.status(503).json({ ok: false, error: "renewal_intake_not_configured" });
    }
    if (v.reason === "expired") {
      return res.status(401).json({ ok: false, error: "renewal_token_expired" });
    }
    return res.status(401).json({ ok: false, error: "invalid_or_expired_token", reason: v.reason });
  }
  const claims = v.claims;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ ok: false, error: "database_unavailable" });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, p.policy_number, p.segment::text AS segment, p.carrier_name,
              p.effective_date, p.expiration_date, p.annual_premium, p.coverage_data,
              b.business_name, b.dba_name, b.state AS business_state, b.entity_type AS business_entity_type,
              s.raw_submission_json AS prior_intake,
              cl.first_name AS client_first_name,
              cl.last_name AS client_last_name,
              cl.primary_email AS client_email,
              cl.primary_phone AS client_phone
       FROM policies p
       LEFT JOIN submissions s ON s.submission_id = p.submission_id
       LEFT JOIN businesses b ON b.business_id = s.business_id
       LEFT JOIN clients cl ON cl.client_id = COALESCE(p.client_id, s.client_id)
       WHERE p.id = $1::uuid
         AND COALESCE(p.client_id, s.client_id) = $2::uuid`,
      [claims.policyId, claims.clientId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "policy_not_found" });
    }

    const row = result.rows[0];
    let priorIntake = row.prior_intake;
    if (priorIntake != null && typeof priorIntake === "string") {
      try {
        priorIntake = JSON.parse(priorIntake);
      } catch {
        priorIntake = null;
      }
    }
    if (priorIntake != null && (typeof priorIntake !== "object" || Array.isArray(priorIntake))) {
      priorIntake = null;
    }

    const data = {
      policy_id: row.id,
      policy_number: row.policy_number,
      segment: row.segment,
      carrier_name: row.carrier_name || null,
      business_name: row.business_name || null,
      dba_name: row.dba_name || null,
      business_state: row.business_state || null,
      business_entity_type: row.business_entity_type || null,
      effective_date: row.effective_date,
      expiration_date: row.expiration_date,
      annual_premium: row.annual_premium != null ? Number(row.annual_premium) : null,
      coverage_data: row.coverage_data || {},
      /** Original intake field names/values (flat top-level only; used by segment prefill script). */
      prior_intake: priorIntake || {},
      client_first_name: row.client_first_name || null,
      client_last_name: row.client_last_name || null,
      client_email: row.client_email || null,
      client_phone: row.client_phone || null,
    };

    return res.json({ ok: true, data });
  } catch (e) {
    console.error("[renewalPrefill]", e?.message || e);
    return res.status(500).json({ ok: false, error: "prefill_failed" });
  }
}
