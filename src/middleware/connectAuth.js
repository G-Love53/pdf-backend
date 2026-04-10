/**
 * Connect API identity: Supabase session → cid-postgres clients row.
 * Phase 1: X-User-Email (required) + X-User-Id (optional, Supabase auth user UUID).
 * Lookup order: famous_user_id → primary_email, then lazy-set famous_user_id.
 *
 * Attaches: req.connectClient { client_id, primary_email, first_name, last_name, primary_phone, famous_user_id }
 *           req.connectSupabaseUserId (string | undefined)
 */
import { getPool } from "../db.js";

export async function connectAuthMiddleware(req, res, next) {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({
      ok: false,
      error: "Database unavailable",
    });
  }

  const emailRaw = req.headers["x-user-email"];
  const supabaseUserId = req.headers["x-user-id"];

  const email =
    typeof emailRaw === "string" && emailRaw.trim()
      ? emailRaw.trim()
      : null;

  if (!email) {
    return res.status(401).json({
      ok: false,
      error: "No user identity provided",
    });
  }

  try {
    let client = null;

    if (supabaseUserId && typeof supabaseUserId === "string") {
      const byFamous = await pool.query(
        `SELECT client_id, primary_email, first_name, last_name, primary_phone, famous_user_id
         FROM clients
         WHERE famous_user_id = $1::uuid`,
        [supabaseUserId],
      );
      if (byFamous.rows.length) {
        client = byFamous.rows[0];
        const rowEmail = String(client.primary_email || "").toLowerCase();
        const hdrEmail = email.toLowerCase();
        if (rowEmail && hdrEmail && rowEmail !== hdrEmail) {
          return res.status(409).json({
            ok: false,
            error: "Identity conflict: email does not match registered user",
          });
        }
      }
    }

    if (!client) {
      const byEmail = await pool.query(
        `SELECT client_id, primary_email, first_name, last_name, primary_phone, famous_user_id
         FROM clients
         WHERE primary_email = $1`,
        [email],
      );

      if (!byEmail.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "No client record found for this email",
        });
      }

      client = byEmail.rows[0];

      if (
        supabaseUserId &&
        typeof supabaseUserId === "string" &&
        !client.famous_user_id
      ) {
        await pool.query(
          `UPDATE clients SET famous_user_id = $1::uuid, updated_at = NOW()
           WHERE client_id = $2 AND famous_user_id IS NULL`,
          [supabaseUserId, client.client_id],
        );
        client.famous_user_id = supabaseUserId;
      } else if (
        supabaseUserId &&
        client.famous_user_id &&
        client.famous_user_id !== supabaseUserId
      ) {
        return res.status(409).json({
          ok: false,
          error: "Identity conflict: user id does not match client mapping",
        });
      }
    }

    req.connectClient = client;
    req.connectSupabaseUserId =
      typeof supabaseUserId === "string" ? supabaseUserId : undefined;
    next();
  } catch (err) {
    console.error("[connectAuth] error:", err.message || err);
    return res.status(500).json({
      ok: false,
      error: "Internal error during identity lookup",
    });
  }
}
