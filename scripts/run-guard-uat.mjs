#!/usr/bin/env node
/**
 * Run Jon's GUARD UAT pack against cid-pdf-api-sandbox (or local).
 *
 * Usage:
 *   node scripts/run-guard-uat.mjs
 *   node scripts/run-guard-uat.mjs --limit 3
 *   node scripts/run-guard-uat.mjs --id Contractors-1 --id Non-Contractors-3
 *   CID_UAT_API=http://localhost:3000 node scripts/run-guard-uat.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API = (process.env.CID_UAT_API || "https://cid-pdf-api-sandbox.onrender.com").replace(
  /\/$/,
  "",
);
const TOKEN = process.env.GUARD_PARTNER_TEST_TOKEN || "";

const args = process.argv.slice(2);
let limit = null;
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit") limit = Number(args[++i]);
  else if (args[i] === "--id") ids.push(args[++i]);
}

const casesPath = join(ROOT, "data/guard-uat-cases-v1.json");
const pack = JSON.parse(readFileSync(casesPath, "utf8"));

const body = { cases: pack.cases };
if (limit != null) body.limit = limit;
if (ids.length) body.ids = ids;

const url = `${API}/api/guard/wc/uat/run`;
const headers = { "Content-Type": "application/json" };
if (TOKEN) headers["X-Partner-Test-Token"] = TOKEN;

console.log(`POST ${url} (${body.ids?.length || body.limit || pack.cases.length} cases)…`);

const res = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("Non-JSON response:", text.slice(0, 500));
  process.exit(1);
}

const outPath = join(ROOT, "data/guard-uat-results-v1.json");
writeFileSync(outPath, JSON.stringify({ runAt: new Date().toISOString(), api: API, ...data }, null, 2));

if (!data.ok) {
  console.error("Run failed:", data);
  process.exit(1);
}

console.log("\nSummary:", data.summary);
for (const r of data.results || []) {
  const mark = r.pass ? "PASS" : r.ok ? "FAIL" : "ERR ";
  const g = r.guard || {};
  console.log(
    `${mark}  ${r.caseId || "?"}  expected=${r.expectedOutcome || "?"}  actual=${r.outcome?.actual || r.phase || r.error}  policy=${g.policyNumber || "—"}  rq=${g.nbsRqUid || g.indicateRqUid || "—"}`,
  );
  if (r.unmatchedQuestions?.length) {
    console.log(`      unmatched: ${r.unmatchedQuestions.join("; ")}`);
  }
  if (r.experienceMod && !r.experienceMod.pass) {
    console.log(`      ex mod sent=${r.experienceMod.sent} returned=${r.experienceMod.returned}`);
  }
}
console.log(`\nWrote ${outPath}`);
