import { getPool } from "../db.js";

const pool = getPool();

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function isValidEmail(s) {
  // Practical check; DB is source of truth
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Update operational contact email for the client tied to a submission.
 * submission_public_id (CID token) never changes.
 * raw_submission_json is not mutated (historical intake record).
 *
 * @returns {{ ok: true, unchanged?: boolean, client_id: string, submission_id: string }}
 */
export async function updatePrimaryEmailBySubmissionPublicId(
  submissionPublicId,
  { newEmail, actorId, reason = null },
) {
  if (!pool) {
    throw new Error("database_not_configured");
  }

  const normalized = normalizeEmail(newEmail);
  if (!normalized || !isValidEmail(normalized)) {
    const err = new Error("invalid_email");
    err.code = "invalid_email";
    throw err;
  }

  const subRes = await pool.query(
    `
      SELECT
        s.submission_id,
        s.submission_public_id,
        c.client_id,
        c.primary_email
      FROM submissions s
      JOIN clients c ON c.client_id = s.client_id
      WHERE s.submission_public_id = $1
      LIMIT 1
    `,
    [submissionPublicId],
  );

  if (subRes.rows.length === 0) {
    const err = new Error("submission_not_found");
    err.code = "submission_not_found";
    throw err;
  }

  const row = subRes.rows[0];
  const previous = String(row.primary_email || "").trim().toLowerCase();

  if (previous === normalized) {
    return {
      ok: true,
      unchanged: true,
      client_id: row.client_id,
      submission_id: row.submission_id,
      submission_public_id: row.submission_public_id,
    };
  }

  const conflict = await pool.query(
    `
      SELECT client_id
      FROM clients
      WHERE primary_email = $1
        AND client_id <> $2::uuid
      LIMIT 1
    `,
    [normalized, row.client_id],
  );

  if (conflict.rows.length > 0) {
    const err = new Error(
      "That email is already used by another client. Use account merge or support workflow.",
    );
    err.code = "email_already_in_use";
    err.conflicting_client_id = conflict.rows[0].client_id;
    throw err;
  }

  const clientDb = await pool.connect();
  try {
    await clientDb.query("BEGIN");

    await clientDb.query(
      `
        UPDATE clients
        SET primary_email = $1,
            updated_at = NOW()
        WHERE client_id = $2
      `,
      [normalized, row.client_id],
    );

    await clientDb.query(
      `
        INSERT INTO timeline_events (
          client_id,
          submission_id,
          quote_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        )
        VALUES ($1, $2, NULL, $3, $4, $5, $6)
      `,
      [
        row.client_id,
        row.submission_id,
        "client.primary_email_updated",
        "Primary contact email updated",
        JSON.stringify({
          previous_email: previous,
          new_email: normalized,
          reason: reason || null,
          submission_public_id: row.submission_public_id,
        }),
        actorId || "operator",
      ],
    );

    await clientDb.query("COMMIT");
  } catch (e) {
    await clientDb.query("ROLLBACK");
    throw e;
  } finally {
    clientDb.release();
  }

  return {
    ok: true,
    client_id: row.client_id,
    submission_id: row.submission_id,
    submission_public_id: row.submission_public_id,
  };
}
