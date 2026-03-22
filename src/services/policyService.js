import { getPool } from "../db.js";

/**
 * Generate a CID policy number from submission + quote.
 * CID-BAR-20260310-000001 → CID-POL-BAR-20260310-000001
 * Appends a short quote id when present so multiple binds per submission never collide
 * on policies_policy_number_key (one quote = one policy number).
 */
export function generatePolicyNumber(segment, submissionPublicId, quoteId) {
  if (submissionPublicId && submissionPublicId.startsWith("CID-")) {
    let base = submissionPublicId.replace("CID-", "CID-POL-");
    if (quoteId) {
      const q = String(quoteId).replace(/-/g, "").slice(0, 8);
      base = `${base}-${q}`;
    }
    return base;
  }
  const seg = (segment || "bar").toUpperCase();
  const q = quoteId ? `-${String(quoteId).replace(/-/g, "").slice(0, 8)}` : "";
  return `CID-POL-${seg}-${Date.now()}${q}`;
}

/**
 * Create a policy record in Postgres.
 * Expects the core entities already loaded from the DB.
 *
 * @param {string|null} [boundBy] - Agent user UUID for `policies.bound_by` only (column is UUID).
 *   Omit or pass null to use `bindRequest.initiated_by`.
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

    const quoteId = quote.quote_id || quote.id;
    const bindId = bindRequest.id;

    const coverage = extraction?.reviewed_json || {};

    // Idempotent: BoldSign poll + redirect, or webhook retries, must not double-insert.
    const existing = await clientOrTx.query(
      `SELECT * FROM policies WHERE bind_request_id = $1 LIMIT 1`,
      [bindId],
    );
    if (existing.rows.length > 0) {
      const policy = existing.rows[0];
      if (useLocalTx) {
        await clientOrTx.query("COMMIT");
        clientOrTx.release();
      }
      return policy;
    }

    const policyNumber = generatePolicyNumber(
      submission.segment,
      submission.submission_public_id,
      quoteId,
    );

    // SAVEPOINT: INSERT unique violation aborts the txn; without this, recovery SELECT
    // fails with "current transaction is aborted" (bind-details poll / concurrent finalize).
    await clientOrTx.query("SAVEPOINT policy_insert");

    let result;
    try {
      result = await clientOrTx.query(
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
          quoteId,
          bindId,
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
      await clientOrTx.query("RELEASE SAVEPOINT policy_insert");
    } catch (err) {
      await clientOrTx.query("ROLLBACK TO SAVEPOINT policy_insert");
      // Concurrent finalize: policy_number unique — load and return within same txn.
      if (err && err.code === "23505") {
        const again = await clientOrTx.query(
          `SELECT * FROM policies WHERE bind_request_id = $1 OR quote_id = $2 LIMIT 1`,
          [bindId, quoteId],
        );
        if (again.rows.length > 0) {
          result = again;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

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

