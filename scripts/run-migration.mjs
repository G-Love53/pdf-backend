/**
 * Run a SQL migration file against DATABASE_URL (Render cid-postgres).
 * Usage (CID-PDF-API shell — psql not required):
 *   node scripts/run-migration.mjs migrations/009_coterie_kb_step1_appetite.sql
 */
import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

async function main() {
  const rel = process.argv[2];
  if (!rel) {
    console.error("Usage: node scripts/run-migration.mjs migrations/<file>.sql");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(filePath)) {
    console.error("Migration file not found:", filePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, "utf8");
  const client = new Client({
    connectionString,
    ssl:
      process.env.PGSSLMODE === "disable"
        ? undefined
        : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Running migration:", rel);
    await client.query(sql);
    console.log("Migration complete:", rel);
  } catch (err) {
    console.error("Migration failed:", err.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
