#!/usr/bin/env node
/**
 * Seed the bound Fitness policy into Connect (vault + Am I Covered) and clone
 * for Rick / Ray. policy_number is unique, so clones use CSG-00507726-00-RICK / -RAY.
 *
 * Usage (local with DATABASE_URL + R2, or Render shell with the PDF uploaded there):
 *   node scripts/seed-golden-fitness-connect.mjs \
 *     --policy-pdf "/Users/newmacminim4/Downloads/DEMO Policy Fitness Bound 1784825991899-PolicyPackage_CSG-00507726-00-(1).pdf"
 *
 * Operator (no local DB): after deploy, POST the PDF at
 *   /operator/maintenance/golden-fitness-demo
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  GOLDEN_FITNESS_CLONE_USERS,
  GOLDEN_FITNESS_POLICY_NUMBER,
  seedGoldenFitnessConnect,
} from "../src/services/goldenFitnessDemoService.js";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const policyPdfPath = arg("--policy-pdf");
const carrierPolicyNumber = arg("--carrier-policy-number") || GOLDEN_FITNESS_POLICY_NUMBER;
const cloneRaw = arg("--clone-emails");
const dryRun = process.argv.includes("--dry-run");

if (!policyPdfPath && !dryRun) {
  console.error("Required: --policy-pdf (or --dry-run to only look up the policy).");
  process.exit(1);
}

const cloneUsers = cloneRaw
  ? cloneRaw.split(",").map((email, i) => {
      const trimmed = email.trim();
      const preset = GOLDEN_FITNESS_CLONE_USERS.find(
        (u) => u.email.toLowerCase() === trimmed.toLowerCase(),
      );
      if (preset) return preset;
      const local = trimmed.split("@")[0] || `USER${i + 1}`;
      return {
        email: trimmed,
        firstName: local,
        lastName: "",
        suffix: local.replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 12) || `U${i + 1}`,
      };
    })
  : GOLDEN_FITNESS_CLONE_USERS;

const pdfBuffer = policyPdfPath ? fs.readFileSync(policyPdfPath) : null;

const result = await seedGoldenFitnessConnect({
  policyPdfBuffer: pdfBuffer,
  policyPdfFilename: policyPdfPath ? path.basename(policyPdfPath) : undefined,
  carrierPolicyNumber,
  cloneUsers,
  dryRun,
});

console.log(JSON.stringify(result, null, 2));
console.log("Done. Connect logins: matching emails on Connect (Famous). First sign-in links famous_user_id.");
