// Simple one-off runner to apply S6 bind_requests / policies migration
// Usage:
//   export DATABASE_URL="postgres://..."
//   node run-migration-s6.js

const { Client } = require("pg");
const fs = require("fs");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  const sql = fs.readFileSync(
    "./migrations/006_s6_bind_requests_policies.sql",
    "utf-8",
  );

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

