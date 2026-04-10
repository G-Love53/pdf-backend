/**
 * One-off: for each (gmail_message_id, segment) with duplicate carrier_messages rows,
 * keep the oldest row and remove the rest using the same logic as the Gmail poller
 * (dedupeCarrierMessagesForGmail). Safe to run when there are no dupes (no-op per group).
 *
 * Usage from repo root:
 *   DATABASE_URL="postgres://..." node scripts/dedupe-carrier-messages.mjs
 */
import "dotenv/config";
import { getPool } from "../src/db.js";
import { dedupeCarrierMessagesForGmail } from "../src/jobs/gmailPoller.js";

const pool = getPool();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const { rows } = await pool.query(`
    SELECT gmail_message_id, segment::text AS segment
    FROM carrier_messages
    WHERE gmail_message_id IS NOT NULL
    GROUP BY gmail_message_id, segment
    HAVING COUNT(*) > 1
    ORDER BY gmail_message_id, segment
  `);

  if (rows.length === 0) {
    console.log("No duplicate (gmail_message_id, segment) pairs found.");
    await pool.end();
    return;
  }

  console.log(`Found ${rows.length} duplicate group(s) to process.`);

  for (const row of rows) {
    const { gmail_message_id: gmailId, segment } = row;
    console.log(`Deduping gmail_message_id=${gmailId} segment=${segment}...`);
    await dedupeCarrierMessagesForGmail({ gmailMessageId: gmailId, segment });
    console.log(`Done ${gmailId} ${segment}`);
  }

  const { rows: verify } = await pool.query(`
    SELECT COUNT(*)::int AS c FROM (
      SELECT 1
      FROM carrier_messages
      WHERE gmail_message_id IS NOT NULL
      GROUP BY gmail_message_id, segment
      HAVING COUNT(*) > 1
    ) t
  `);
  console.log(`Remaining duplicate groups: ${verify[0]?.c ?? "?"}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
