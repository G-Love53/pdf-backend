#!/usr/bin/env node
/**
 * Test Bar bundle without filling the Netlify form.
 * POSTs scripts/bar-test-payload.json to /render-bundle (one PDF per template),
 * saves each to test-output/ for spot-checking.
 *
 * Usage:
 *   node scripts/test-bar-bundle.js
 *   Always runs against Render (cid-pdf-api). Override with BASE_URL or first arg if needed.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const BASE_URL = process.env.BASE_URL || process.argv[2] || "https://cid-pdf-api.onrender.com";
const PAYLOAD_PATH = path.join(root, "scripts", "bar-test-payload.json");
const OUT_DIR = path.join(root, "test-output");

const TEMPLATES = [
  "SUPP_BAR",
  "ACORD125",
  "ACORD126",
  "ACORD130",
  "ACORD140",
];

const FILENAMES = {
  SUPP_BAR: "Supplemental-Application.pdf",
  ACORD125: "ACORD-125.pdf",
  ACORD126: "ACORD-126.pdf",
  ACORD130: "ACORD-130.pdf",
  ACORD140: "ACORD-140.pdf",
};

async function main() {
  const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Bar bundle test");
  console.log("  BASE_URL:", BASE_URL);
  console.log("  Output:  ", OUT_DIR);
  console.log("");

  for (const name of TEMPLATES) {
    const body = JSON.stringify({
      templates: [{ name, data: payload }],
    });
    const url = `${BASE_URL.replace(/\/$/, "")}/render-bundle`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      console.error(`  ${name}: HTTP ${res.status} ${res.statusText}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = path.join(OUT_DIR, FILENAMES[name] || `${name}.pdf`);
    fs.writeFileSync(outPath, buf);
    console.log(`  ${name} -> ${path.basename(outPath)}`);
  }

  console.log("");
  console.log("Done. Open test-output/ to spot-check PDFs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
