import { getPool } from "../db.js";

/**
 * Generate a CID policy number from a submission_public_id.
 * CID-BAR-20260310-000001 → CID-POL-BAR-20260310-000001
 */
export function generatePolicyNumber(segment, submissionPublicId) {
  if (submissionPublicId && submissionPublicId.startsWith("CID-")) {
    return submissionPublicId.replace("CID-", "CID-POL-");
  }
  const seg = (segment || "bar").toUpperCase();
  return `CID-POL-${seg}-${Date.now()}`;
}

/**
 * Create a policy record in Postgres.
 * Expects the core entities already loaded from the DB.
 */
export async function createPolicy({
  client,
  submission,
  quote,
  bindRequest,
  extraction,
  txClient, // optional pg client in an open transaction
  boundBy,
}) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Postgres pool not configured; cannot create policy");
  }

  const clientOrTx = txClient || (await pool.connect());
  const useLocalTx = !txClient;

  try {
    if (useLocalTx) {
      await clientOrTx.query("BEGIN");
    }

    const policyNumber = generatePolicyNumber(
      submission.segment,
      submission.submission_public_id,
    );

    const coverage = extraction?.reviewed_json || {};

    const result = await clientOrTx.query(
      `
        INSERT INTO policies (
          policy_number,
          submission_id,
          quote_id,
          bind_request_id,
          client_id,
          segment,
          carrier_name,
          policy_type,
          annual_premium,
          payment_method,
          effective_date,
          expiration_date,
          coverage_data,
          status,
          bound_at,
          bound_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, 'active', NOW(), $14
        )
        RETURNING *
      `,
      [
        policyNumber,
        submission.submission_id || submission.id,
        quote.quote_id || quote.id,
        bindRequest.id,
        client.client_id || client.id,
        submission.segment,
        coverage.carrier_name || quote.carrier_name,
        coverage.policy_type || quote.policy_type,
        coverage.annual_premium || quote.annual_premium,
        bindRequest.payment_method || "annual",
        coverage.effective_date || quote.effective_date,
        coverage.expiration_date || quote.expiration_date,
        coverage,
        boundBy || bindRequest.initiated_by || null,
      ],
    );

    const policy = result.rows[0];

    if (useLocalTx) {
      await clientOrTx.query("COMMIT");
      clientOrTx.release();
    }

    return policy;
  } catch (err) {
    if (useLocalTx) {
      await clientOrTx.query("ROLLBACK");
      clientOrTx.release();
    }
    throw err;
  }
}

