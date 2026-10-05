/**
 * Golden two-step demo: bound Fitness policy CSG-00507726-00 ($300, personal trainer,
 * freelance limited liability — Section I Property does not apply).
 *
 * Step 1 (ConnectQuote): live pilates / studio quote — different risk than this bind.
 * Step 2 (Connect): this policy on Gerry / Rick / Ray so Am I Covered + vault work.
 */
import crypto from "crypto";
import { getPool } from "../db.js";
import { uploadBuffer } from "./r2Service.js";
import { runPolicyIndexer } from "../workers/policyIndexer.js";
import {
  DocumentRole,
  DocumentType,
  StorageProvider,
} from "../constants/postgresEnums.js";

export const GOLDEN_FITNESS_POLICY_NUMBER = "CSG-00507726-00";

export const GOLDEN_FITNESS_CLONE_USERS = [
  {
    email: "rick@commercialinsurance-direct.com",
    firstName: "Rick",
    lastName: "Cline",
    suffix: "RICK",
  },
  {
    email: "ray@commercialinsurance-direct.com",
    firstName: "Ray",
    lastName: "Schiavone",
    suffix: "RAY",
  },
];

export const GOLDEN_FITNESS_COVERAGE_PATCH = {
  demo_golden: true,
  demo_story: "personal_trainer_freelance",
  insured_name: "Demo Fitness",
  business_class: "Personal Fitness Trainer",
  location_type: "freelance_limited_liability",
  property_coverage: "does_not_apply",
  property_note:
    "Section I — Property does not apply. Freelance limited-liability personal trainer policy, not a gym or owned studio premises policy.",
  gl_limit: 1000000,
  gl_aggregate_limit: 2000000,
  general_liability_limit: 1000000,
  general_liability: {
    each_occurrence: 1000000,
    general_aggregate: 2000000,
    products_completed_operations_aggregate: 2000000,
    personal_and_advertising_injury: 1000000,
    description:
      "General liability for personal fitness training operations. $1,000,000 each occurrence / $2,000,000 general aggregate.",
  },
  annual_premium: 300,
  payment_method: "monthly",
  effective_date: "2026-07-31",
  expiration_date: "2027-07-31",
  carrier_name: "Spinnaker Specialty Insurance Company",
  carrier_policy_number: GOLDEN_FITNESS_POLICY_NUMBER,
  policy_type: "BOP",
  summary_note:
    "Golden Connect demo policy CSG-00507726-00. Annual premium $300 billed monthly. Personal fitness trainer, freelance limited liability — no Section I property.",
};

function safeFilename(name) {
  return (
    String(name || "document.pdf")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .slice(0, 120) || "document.pdf"
  );
}

function clonePolicyNumber(suffix) {
  const raw = `${GOLDEN_FITNESS_POLICY_NUMBER}-${String(suffix || "DEMO")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 12)}`;
  return raw.slice(0, 50);
}

export async function findGoldenFitnessPolicy(client, carrierPolicyNumber) {
  const num = String(carrierPolicyNumber || GOLDEN_FITNESS_POLICY_NUMBER).trim();
  const nums = new Set([num]);
  if (num.endsWith("-00")) nums.add(num.replace(/-00$/, "-0007"));

  for (const candidate of nums) {
    const res = await client.query(
      `
        SELECT p.*, s.submission_public_id, s.client_id AS submission_client_id,
               s.business_id, s.source_domain, s.source_form, s.raw_submission_json,
               s.segment::text AS submission_segment,
               c.primary_email
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        JOIN clients c ON c.client_id = p.client_id
        WHERE p.coverage_data->>'carrier_policy_number' = $1
           OR p.policy_number = $1
           OR p.coverage_data->'coterie_bind'->>'PolicyNumber' = $1
        ORDER BY p.bound_at DESC NULLS LAST
        LIMIT 1
      `,
      [candidate],
    );
    if (res.rows.length) return res.rows[0];
  }
  return null;
}

export async function applyGoldenFitnessCoverage(client, policy) {
  const cov =
    policy.coverage_data && typeof policy.coverage_data === "object"
      ? { ...policy.coverage_data, ...GOLDEN_FITNESS_COVERAGE_PATCH }
      : { ...GOLDEN_FITNESS_COVERAGE_PATCH };

  await client.query(
    `
      UPDATE policies
      SET coverage_data = $2::jsonb,
          segment = 'fitness',
          carrier_name = $3,
          policy_type = $4,
          annual_premium = $5,
          payment_method = $6,
          effective_date = $7::date,
          expiration_date = $8::date,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [
      policy.id,
      cov,
      GOLDEN_FITNESS_COVERAGE_PATCH.carrier_name,
      GOLDEN_FITNESS_COVERAGE_PATCH.policy_type,
      GOLDEN_FITNESS_COVERAGE_PATCH.annual_premium,
      GOLDEN_FITNESS_COVERAGE_PATCH.payment_method,
      GOLDEN_FITNESS_COVERAGE_PATCH.effective_date,
      GOLDEN_FITNESS_COVERAGE_PATCH.expiration_date,
    ],
  );
  return { ...policy, coverage_data: cov, segment: "fitness" };
}

export async function ingestPolicyPdfBuffer(
  client,
  policy,
  pdfBuffer,
  filename,
  documentRole = DocumentRole.POLICY_ORIGINAL,
) {
  if (!pdfBuffer?.length) throw new Error("empty policy PDF");

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
    return { documentId: existing.rows[0].document_id, skipped: true };
  }

  const segment = String(policy.segment || "fitness").toLowerCase();
  const policyNum =
    policy.coverage_data?.carrier_policy_number ||
    policy.policy_number ||
    GOLDEN_FITNESS_POLICY_NUMBER;
  const storagePath = `coterie/${segment}/${policy.submission_public_id}/${policyNum}/${safeFilename(filename)}`;

  await uploadBuffer(storagePath, pdfBuffer, "application/pdf", {
    segment,
    type: String(documentRole),
    carrier_policy_number: String(policyNum),
    source: "golden_fitness_demo",
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

  return { documentId: docRes.rows[0].document_id, skipped: false, storagePath };
}

async function copyDocumentChunks(client, sourceDocumentId, destPolicyId, destDocumentId) {
  const { rowCount } = await client.query(
    `
      INSERT INTO policy_document_chunks (
        policy_id, document_id, document_role, chunk_index, content,
        source_storage_path, source_sha256, document_priority, index_status
      )
      SELECT
        $2::uuid, $3::uuid, document_role, chunk_index, content,
        source_storage_path, source_sha256, document_priority, index_status
      FROM policy_document_chunks
      WHERE document_id = $1::uuid
      ON CONFLICT (document_id, chunk_index)
      DO UPDATE SET
        policy_id = EXCLUDED.policy_id,
        content = EXCLUDED.content,
        index_status = EXCLUDED.index_status,
        updated_at = NOW()
    `,
    [sourceDocumentId, destPolicyId, destDocumentId],
  );
  return rowCount || 0;
}

async function ensureClient(client, { email, firstName, lastName }) {
  const res = await client.query(
    `
      INSERT INTO clients (primary_email, first_name, last_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (primary_email)
      DO UPDATE SET
        first_name = COALESCE(NULLIF(clients.first_name, ''), EXCLUDED.first_name),
        last_name = COALESCE(NULLIF(clients.last_name, ''), EXCLUDED.last_name),
        updated_at = NOW()
      RETURNING client_id, primary_email, famous_user_id
    `,
    [email, firstName || null, lastName || null],
  );
  return res.rows[0];
}

async function cloneGoldenPolicyForUser(client, sourcePolicy, user) {
  const cloneNumber = clonePolicyNumber(user.suffix);
  const existing = await client.query(
    `SELECT id, client_id, policy_number FROM policies WHERE policy_number = $1 LIMIT 1`,
    [cloneNumber],
  );
  if (existing.rows.length) {
    return { policyId: existing.rows[0].id, policyNumber: cloneNumber, skipped: true };
  }

  const destClient = await ensureClient(client, user);
  if (String(destClient.client_id) === String(sourcePolicy.client_id)) {
    return {
      policyId: sourcePolicy.id,
      policyNumber: sourcePolicy.policy_number,
      skipped: true,
      reason: "same_client",
    };
  }

  let businessId = null;
  if (sourcePolicy.business_id) {
    const biz = await client.query(
      `
        INSERT INTO businesses (client_id, business_name, dba_name, entity_type, segment, state)
        SELECT $1, business_name, dba_name, entity_type, 'fitness'::segment_type, state
        FROM businesses WHERE business_id = $2
        RETURNING business_id
      `,
      [destClient.client_id, sourcePolicy.business_id],
    );
    businessId = biz.rows[0]?.business_id || null;
  }

  const idRes = await client.query(
    `SELECT generate_submission_public_id('fitness'::segment_type) AS id`,
  );
  const submissionPublicId = idRes.rows[0]?.id;
  if (!submissionPublicId) throw new Error("generate_submission_public_id failed");

  const raw =
    sourcePolicy.raw_submission_json && typeof sourcePolicy.raw_submission_json === "object"
      ? {
          ...sourcePolicy.raw_submission_json,
          demo_golden: true,
          contact_email: user.email,
          email: user.email,
        }
      : { demo_golden: true, contact_email: user.email };

  const subRes = await client.query(
    `
      INSERT INTO submissions (
        submission_public_id, client_id, business_id, segment,
        source_domain, source_form, status, raw_submission_json
      )
      VALUES ($1, $2, $3, 'fitness'::segment_type, $4, $5, 'bound', $6::jsonb)
      RETURNING submission_id
    `,
    [
      submissionPublicId,
      destClient.client_id,
      businessId,
      sourcePolicy.source_domain || "fitnessinsurancedirect.com",
      "golden-fitness-demo",
      raw,
    ],
  );
  const submissionId = subRes.rows[0].submission_id;

  const quoteRes = await client.query(
    `
      INSERT INTO quotes (
        submission_id, carrier_name, segment, status, premium,
        effective_date, expiration_date, carrier_quote_ref, packet_ready
      )
      SELECT
        $1, $2, 'fitness'::segment_type, 'accepted', $3,
        $4::date, $5::date, $6, TRUE
      RETURNING quote_id
    `,
    [
      submissionId,
      GOLDEN_FITNESS_COVERAGE_PATCH.carrier_name,
      GOLDEN_FITNESS_COVERAGE_PATCH.annual_premium,
      GOLDEN_FITNESS_COVERAGE_PATCH.effective_date,
      GOLDEN_FITNESS_COVERAGE_PATCH.expiration_date,
      `${GOLDEN_FITNESS_POLICY_NUMBER}-${user.suffix}`,
    ],
  );
  const quoteId = quoteRes.rows[0].quote_id;

  const origBind = await client.query(
    `SELECT packet_id FROM bind_requests WHERE id = $1 LIMIT 1`,
    [sourcePolicy.bind_request_id],
  );
  const packetId = origBind.rows[0]?.packet_id;
  if (!packetId) throw new Error("source bind_request missing packet_id");

  const bindRes = await client.query(
    `
      INSERT INTO bind_requests (
        quote_id, packet_id, hellosign_request_id,
        signer_name, signer_email, payment_method, status,
        initiated_at, signed_at
      )
      VALUES ($1, $2, $3, $4, $5, 'monthly', 'signed', NOW(), NOW())
      RETURNING id
    `,
    [
      quoteId,
      packetId,
      `golden-fitness-${user.suffix}`,
      [user.firstName, user.lastName].filter(Boolean).join(" ") || "Insured",
      user.email,
    ],
  );

  const cov = {
    ...(sourcePolicy.coverage_data || {}),
    ...GOLDEN_FITNESS_COVERAGE_PATCH,
    demo_clone_of: sourcePolicy.id,
    demo_clone_for: user.email,
  };

  const polRes = await client.query(
    `
      INSERT INTO policies (
        policy_number, submission_id, quote_id, bind_request_id, client_id,
        segment, carrier_name, policy_type, annual_premium, payment_method,
        effective_date, expiration_date, coverage_data, status, bound_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        'fitness', $6, $7, $8, 'monthly',
        $9::date, $10::date, $11::jsonb, 'active', NOW()
      )
      RETURNING id
    `,
    [
      cloneNumber,
      submissionId,
      quoteId,
      bindRes.rows[0].id,
      destClient.client_id,
      GOLDEN_FITNESS_COVERAGE_PATCH.carrier_name,
      GOLDEN_FITNESS_COVERAGE_PATCH.policy_type,
      GOLDEN_FITNESS_COVERAGE_PATCH.annual_premium,
      GOLDEN_FITNESS_COVERAGE_PATCH.effective_date,
      GOLDEN_FITNESS_COVERAGE_PATCH.expiration_date,
      cov,
    ],
  );
  const destPolicyId = polRes.rows[0].id;

  const docs = await client.query(
    `
      SELECT document_id, document_type, document_role, storage_provider,
             storage_path, mime_type, sha256_hash, is_original
      FROM documents
      WHERE policy_id = $1::uuid
        AND document_role::text IN ('policy_original', 'declarations_original', 'endorsement')
    `,
    [sourcePolicy.id],
  );

  let copiedChunks = 0;
  for (const doc of docs.rows) {
    const destDoc = await client.query(
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
        destClient.client_id,
        submissionId,
        quoteId,
        destPolicyId,
        doc.document_type,
        doc.document_role,
        doc.storage_provider,
        doc.storage_path,
        doc.mime_type,
        doc.sha256_hash,
      ],
    );
    copiedChunks += await copyDocumentChunks(
      client,
      doc.document_id,
      destPolicyId,
      destDoc.rows[0].document_id,
    );
  }

  return {
    policyId: destPolicyId,
    policyNumber: cloneNumber,
    clientId: destClient.client_id,
    email: user.email,
    skipped: false,
    copiedChunks,
  };
}

/**
 * Attach the bound Fitness package, index Am I Covered, clone to Rick/Ray.
 */
export async function seedGoldenFitnessConnect({
  policyPdfBuffer = null,
  policyPdfFilename = "PolicyPackage_CSG-00507726-00.pdf",
  carrierPolicyNumber = GOLDEN_FITNESS_POLICY_NUMBER,
  cloneUsers = GOLDEN_FITNESS_CLONE_USERS,
  dryRun = false,
} = {}) {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL required");

  const client = await pool.connect();
  const result = {
    source: null,
    ingested: null,
    clones: [],
    indexed: false,
  };

  try {
    const found = await findGoldenFitnessPolicy(client, carrierPolicyNumber);
    if (!found) {
      throw new Error(
        `Policy ${carrierPolicyNumber} not found. Bind must exist in cid-postgres first (usually g@).`,
      );
    }

    if (dryRun) {
      result.source = {
        policy_id: found.id,
        policy_number: found.policy_number,
        email: found.primary_email,
        segment: found.segment,
      };
      return result;
    }

    const policy = await applyGoldenFitnessCoverage(client, found);
    result.source = {
      policy_id: policy.id,
      policy_number: policy.policy_number,
      email: policy.primary_email,
      segment: "fitness",
    };

    if (policyPdfBuffer?.length) {
      result.ingested = await ingestPolicyPdfBuffer(
        client,
        policy,
        policyPdfBuffer,
        policyPdfFilename,
        DocumentRole.POLICY_ORIGINAL,
      );
    }

    await client.query(
      `
        INSERT INTO timeline_events (
          client_id, submission_id, quote_id,
          event_type, event_label, event_payload_json, created_by
        )
        VALUES ($1, $2, $3, 'demo.golden_fitness.seeded', 'Golden Fitness Connect demo seeded', $4, 'system')
      `,
      [
        policy.client_id,
        policy.submission_id,
        policy.quote_id || null,
        {
          policy_id: policy.id,
          carrier_policy_number: carrierPolicyNumber,
          ingested: Boolean(result.ingested && !result.ingested.skipped),
        },
      ],
    );
  } finally {
    client.release();
  }

  if (result.source?.policy_id) {
    await runPolicyIndexer({ policyId: result.source.policy_id, limit: 5 });
    result.indexed = true;
  }

  const cloneClient = await pool.connect();
  try {
    const source = await findGoldenFitnessPolicy(cloneClient, carrierPolicyNumber);
    for (const user of cloneUsers) {
      result.clones.push(await cloneGoldenPolicyForUser(cloneClient, source, user));
    }
  } finally {
    cloneClient.release();
  }

  for (const clone of result.clones) {
    if (clone?.policyId && !clone.skipped && !clone.copiedChunks) {
      await runPolicyIndexer({ policyId: clone.policyId, limit: 5 });
    }
  }

  return result;
}
