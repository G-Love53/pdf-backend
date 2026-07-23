#!/usr/bin/env node
/**
 * One-off: upload local Coterie policy PDFs → R2 → documents → optional indexer.
 *
 * Usage (Render shell or local with prod env):
 *   node scripts/backfill-coterie-policy-docs.mjs \
 *     --carrier-policy-number CSG-00507726-00 \
 *     --policy-pdf "/path/PolicyPackage.pdf" \
 *     --coi-pdf "/path/Certificate.pdf" \
 *     --index
 *
 * Lookup fallbacks: --email, --submission-public-id
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import pg from "pg";
import { uploadBuffer } from "../src/services/r2Service.js";
import { runPolicyIndexer } from "../src/workers/policyIndexer.js";
import {
  DocumentRole,
  DocumentType,
  StorageProvider,
} from "../src/constants/postgresEnums.js";

dotenv.config();

const { Pool } = pg;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const carrierPolicyNumber = arg("--carrier-policy-number");
const submissionPublicId = arg("--submission-public-id");
const email = arg("--email");
const policyPdfPath = arg("--policy-pdf");
const coiPdfPath = arg("--coi-pdf");
const runIndex = process.argv.includes("--index");
const dryRun = process.argv.includes("--dry-run");

if (!policyPdfPath) {
  console.error(
    "Required: --policy-pdf. Optional: --carrier-policy-number, --email, --submission-public-id, --coi-pdf, --index, --dry-run",
  );
  process.exit(1);
}

function safeFilename(name) {
  return (
    String(name || "document.pdf")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .slice(0, 120) || "document.pdf"
  );
}

async function findPolicy(client) {
  const nums = new Set();
  if (carrierPolicyNumber) {
    nums.add(carrierPolicyNumber.trim());
    if (carrierPolicyNumber.endsWith("-00")) {
      nums.add(carrierPolicyNumber.replace(/-00$/, "-0007"));
    }
  }

  for (const num of nums) {
    const res = await client.query(
      `
        SELECT p.*, s.submission_public_id, s.client_id
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        WHERE p.coverage_data->>'carrier_policy_number' = $1
           OR p.policy_number = $1
           OR p.coverage_data->'coterie_bind'->>'PolicyNumber' = $1
        ORDER BY p.bound_at DESC NULLS LAST
        LIMIT 1
      `,
      [num],
    );
    if (res.rows.length) return res.rows[0];
  }

  if (submissionPublicId) {
    const res = await client.query(
      `
        SELECT p.*, s.submission_public_id, s.client_id
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        WHERE s.submission_public_id = $1
        ORDER BY p.bound_at DESC NULLS LAST
        LIMIT 1
      `,
      [submissionPublicId.trim().toUpperCase()],
    );
    if (res.rows.length) return res.rows[0];
  }

  if (email) {
    const res = await client.query(
      `
        SELECT p.*, s.submission_public_id, s.client_id
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        JOIN clients c ON c.client_id = s.client_id
        WHERE lower(c.primary_email) = lower($1)
        ORDER BY p.bound_at DESC NULLS LAST
        LIMIT 1
      `,
      [email.trim()],
    );
    if (res.rows.length) return res.rows[0];
  }

  return null;
}

async function ingestFile(client, policy, filePath, documentRole, label) {
  const pdfBuffer = fs.readFileSync(filePath);
  if (!pdfBuffer.length) throw new Error(`empty file: ${filePath}`);

  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const existing = await client.query(
    `
      SELECT document_id FROM documents
      WHERE policy_id = $1::uuid AND sha256_hash = $2
      LIMIT 1
    `,
    [policy.id, sha256],
  );
  if (existing.rows.length) {
    console.log(`[skip] ${label} already ingested (${existing.rows[0].document_id})`);
    return existing.rows[0].document_id;
  }

  const segment = String(policy.segment || "fitness").toLowerCase();
  const policyNum =
    carrierPolicyNumber ||
    policy.coverage_data?.carrier_policy_number ||
    "unknown";
  const filename = safeFilename(path.basename(filePath));
  const storagePath = `coterie/${segment}/${policy.submission_public_id}/${policyNum}/${filename}`;

  if (dryRun) {
    console.log(`[dry-run] would upload ${label} → ${storagePath}`);
    return null;
  }

  await uploadBuffer(storagePath, pdfBuffer, "application/pdf", {
    segment,
    type: documentRole,
    carrier_policy_number: policyNum,
    source: "manual_backfill",
  });

  const docRes = await client.query(
    `
      INSERT INTO documents (
        client_id, submission_id, quote_id, policy_id,
        document_type, document_role, storage_provider,
        storage_path, mime_type, sha256_hash, is_original, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 'system')
      RETURNING document_id
    `,
    [
      policy.client_id,
      policy.submission_id,
      policy.quote_id || null,
      policy.id,
      DocumentType.PDF,
      documentRole,
      StorageProvider.R2,
      storagePath,
      "application/pdf",
      sha256,
    ],
  );

  const documentId = docRes.rows[0].document_id;
  console.log(`[ok] ${label} → document_id ${documentId}`);
  return documentId;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? undefined : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    const policy = await findPolicy(client);
    if (!policy) {
      console.error("Policy not found. Try --email or --submission-public-id.");
      process.exit(1);
    }

    console.log("Found policy:", {
      policy_id: policy.id,
      submission_public_id: policy.submission_public_id,
      segment: policy.segment,
      policy_number: policy.policy_number,
      carrier_policy_number: policy.coverage_data?.carrier_policy_number || null,
    });

    if (!dryRun && carrierPolicyNumber) {
      const cov =
        policy.coverage_data && typeof policy.coverage_data === "object"
          ? { ...policy.coverage_data }
          : {};
      cov.carrier_policy_number =
        cov.carrier_policy_number || carrierPolicyNumber;
      cov.summary_note =
        "Policy PDF manually backfilled for Connect vault and Am I Covered.";
      await client.query(
        `UPDATE policies SET coverage_data = $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`,
        [policy.id, cov],
      );
    }

    await ingestFile(
      client,
      policy,
      policyPdfPath,
      DocumentRole.POLICY_ORIGINAL,
      "policy package",
    );

    if (coiPdfPath) {
      await ingestFile(
        client,
        policy,
        coiPdfPath,
        DocumentRole.COI_GENERATED,
        "certificate (ACORD 25)",
      );
    }

    if (!dryRun) {
      await client.query(
        `
          INSERT INTO timeline_events (
            client_id, submission_id, quote_id,
            event_type, event_label, event_payload_json, created_by
          )
          VALUES ($1, $2, $3, 'coterie.policy.docs_ingested', 'Coterie policy documents backfilled', $4, 'system')
        `,
        [
          policy.client_id,
          policy.submission_id,
          policy.quote_id || null,
          {
            policy_id: policy.id,
            carrier_policy_number: carrierPolicyNumber,
            source: "manual_backfill",
          },
        ],
      );
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (runIndex && !dryRun) {
    console.log("[index] running policy document indexer…");
    await runPolicyIndexer({ backfill: false, limit: 10 });
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
