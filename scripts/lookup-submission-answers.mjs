#!/usr/bin/env node
/**
 * Print ConnectQuote / submit-quote answers for one submission_public_id.
 *
 * Usage (Render shell or local with DATABASE_URL):
 *   node scripts/lookup-submission-answers.mjs CID-ELC-20260928-000261
 */
import pg from "pg";

const id = process.argv[2]?.trim().toUpperCase();
if (!id) {
  console.error("Usage: node scripts/lookup-submission-answers.mjs CID-ELC-YYYYMMDD-######");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (Render → cid_postgres → Connect).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  const sub = await pool.query(
    `
      SELECT s.submission_id, s.submission_public_id, s.segment::text AS segment,
             s.source_form, s.submitted_at, s.status::text AS status,
             c.primary_email, c.first_name, c.last_name,
             s.raw_submission_json
      FROM submissions s
      LEFT JOIN clients c ON c.client_id = s.client_id
      WHERE s.submission_public_id = $1
      LIMIT 1
    `,
    [id],
  );
  if (!sub.rows.length) {
    console.error("No submission found for", id);
    process.exit(2);
  }
  const row = sub.rows[0];
  const tl = await pool.query(
    `
      SELECT event_type, event_payload_json, created_at
      FROM timeline_events
      WHERE submission_id = $1
      ORDER BY created_at ASC
    `,
    [row.submission_id],
  );

  console.log("=== Submission ===");
  console.log(JSON.stringify({
    submission_public_id: row.submission_public_id,
    segment: row.segment,
    source_form: row.source_form,
    submitted_at: row.submitted_at,
    status: row.status,
    email: row.primary_email,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
  }, null, 2));

  console.log("\n=== Timeline (Coterie / rail) ===");
  for (const e of tl.rows) {
    console.log(`- ${e.created_at}  ${e.event_type}`);
    if (e.event_payload_json && Object.keys(e.event_payload_json).length) {
      console.log(JSON.stringify(e.event_payload_json, null, 2));
    }
  }

  console.log("\n=== Form answers (raw_submission_json) ===");
  console.log(JSON.stringify(row.raw_submission_json, null, 2));
} finally {
  await pool.end();
}
