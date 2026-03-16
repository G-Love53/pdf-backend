// Simple one-off runner to apply S6 bind_requests / policies migration
// Usage:
//   export DATABASE_URL="postgres://..."
//   node run-migration-s6.cjs

const { Client } = require("pg");
const fs = require("fs");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sqlPath = "./migrations/006_s6_bind_requests_policies.sql";
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Render Postgres requires SSL
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log("S6 migration complete.");
  } catch (err) {
    console.error("S6 migration failed:", err);
  } finally {
    await client.end();
  }
}

main();

