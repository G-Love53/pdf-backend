/**
 * Coterie ConnectQuote policies: build chat/COI-friendly coverage_data from bindable quote + intake.
 * Policy PDF ingest runs via Coterie webhook + GET docs/links; quote summary + intake remain authoritative for limits.
 */
import crypto from "crypto";
import { extractBindPolicyInfo } from "./coterieService.js";

function parseNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function submissionForm(submission) {
  const raw =
    submission?.raw_submission_json ||
    submission?.rawSubmission ||
    submission?.raw_submission ||
    {};
  return raw && typeof raw === "object" ? raw : {};
}

function pickPolicyType(form, quoteSummary) {
  const types = form.application_types || form.applicationTypes;
  const list = Array.isArray(types)
    ? types
    : typeof types === "string"
      ? types.split(",").map((s) => s.trim())
      : [];
  if (list.includes("BOP")) return "BOP";
  if (list.includes("GL")) return "GL";
  return (
    quoteSummary?.policyType ||
    quoteSummary?.raw?.quote?.quotes?.[0]?.policyType ||
    "BOP"
  );
}

function isSparseCoterieCoverage(cov) {
  if (!cov || cov.bind_source !== "coterie") return false;
  if (cov.general_liability || cov.gl_limit || cov.coverages?.length) return false;
  return true;
}

/**
 * @param {{ quoteSummary?: object, submission?: object, bindResult?: object }} input
 */
export function buildCoterieCoverageData({ quoteSummary = {}, submission = {}, bindResult = {} }) {
  const form = submissionForm(submission);
  const raw = quoteSummary?.raw || {};
  const quote = raw?.quote || {};
  const nested = quote?.quotes?.[0] || {};

  const premium = Number(
    quoteSummary.premium ??
      bindResult?.result?.premium ??
      bindResult?.result?.quote?.premium ??
      0,
  );
  const effective =
    quoteSummary.effectiveDate ||
    bindResult?.result?.effectiveDate ||
    form.policy_start_date ||
    new Date().toISOString().slice(0, 10);

  let expiration = bindResult?.result?.expirationDate || null;
  if (!expiration && effective) {
    const d = new Date(String(effective).slice(0, 10) + "T12:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    expiration = d.toISOString().slice(0, 10);
  }

  const policyType = pickPolicyType(form, quoteSummary);
  const includesBop = policyType === "BOP";
  const includesGl = includesBop || policyType === "GL";

  const glLimit = parseNum(
    form.gl_limit ||
      form.glLimit ||
      nested.glLimit ||
      quote.glLimit ||
      raw.glLimit,
  );
  const glAggregate = parseNum(
    form.gl_aggregate_limit ||
      form.glAggregateLimit ||
      nested.glAggregateLimit ||
      quote.glAggregateLimit ||
      raw.glAggregateLimit,
  );
  const bppLimit = parseNum(form.bpp_limit || form.bppLimit || nested.bppLimit);
  const bppDeductible = parseNum(form.bpp_deductible || form.bppDeductible) ?? 1000;
  const buildingLimit = parseNum(form.building_limit || form.buildingLimit);
  const bindPolicy = extractBindPolicyInfo(bindResult);

  const coverage = {
    bind_source: "coterie",
    carrier_name:
      quoteSummary.carrier ||
      nested.insuranceCarrier ||
      quote.insuranceCarrier ||
      "Spinnaker",
    policy_type: policyType,
    annual_premium: Number.isFinite(premium) ? premium : 0,
    effective_date: String(effective).slice(0, 10),
    expiration_date: String(expiration || effective).slice(0, 10),
    coterie_quote_id: quoteSummary.quoteId || null,
    coterie_application_id: quoteSummary.applicationId || null,
    coterie_policy_id: bindPolicy.coteriePolicyId,
    carrier_policy_number: bindPolicy.carrierPolicyNumber,
    coterie_bind: bindResult?.result || null,
    summary_source: "coterie_bindable_quote",
    summary_note: bindPolicy.carrierPolicyNumber
      ? "Coverage limits from ConnectQuote bindable quote and intake. Policy documents ingest via Coterie webhook."
      : "Coverage limits from ConnectQuote bindable quote and intake selections. Policy documents pending Coterie webhook.",
    insured_name:
      form.insured_name || form.business_name || form.legalBusinessName || null,
    business_class: form.business_class || form.coterie_business_class || null,
    num_employees: parseNum(form.num_employees || form.numEmployees),
    gross_annual_sales: parseNum(form.gross_annual_sales),
    annual_payroll: parseNum(form.annual_payroll),
    location_type: form.location_type || form.locationType || null,
    premise_state: form.state || form.premise_state || form.businessState || null,
  };

  if (includesGl && glLimit) {
    const aggregate = glAggregate || glLimit * 2;
    coverage.gl_limit = glLimit;
    coverage.gl_aggregate_limit = aggregate;
    coverage.general_liability_limit = glLimit;
    coverage.general_liability = {
      each_occurrence: glLimit,
      general_aggregate: aggregate,
      products_completed_operations_aggregate: aggregate,
      description:
        "General liability — bodily injury, property damage, and personal/advertising injury from business operations.",
    };
  }

  if (includesBop && bppLimit != null) {
    coverage.bpp_limit = bppLimit;
    coverage.bpp_deductible = bppDeductible;
    coverage.business_personal_property = {
      limit: bppLimit,
      deductible: bppDeductible,
      description:
        "Business personal property — tools, equipment, and inventory at covered locations.",
    };
  }

  if (buildingLimit) {
    coverage.building_limit = buildingLimit;
    coverage.building = {
      limit: buildingLimit,
      description: "Building coverage for owned commercial property.",
    };
  }

  coverage.coverages = [];
  if (coverage.general_liability) {
    coverage.coverages.push({
      type: "general_liability",
      name: "General Liability",
      each_occurrence_limit: glLimit,
      aggregate_limit: coverage.gl_aggregate_limit,
    });
  }
  if (coverage.business_personal_property) {
    coverage.coverages.push({
      type: "business_personal_property",
      name: "Business Personal Property",
      limit: bppLimit,
      deductible: bppDeductible,
    });
  }
  if (includesBop) {
    coverage.coverages.push({
      type: "businessowners_policy",
      name: "Businessowners Policy (BOP)",
      note: "Package policy — GL and property components as quoted.",
    });
  }

  return coverage;
}

/** Plain-text block for policy_document_chunks FTS (Connect chat). */
export function buildCoterieChatIndexText(coverage, segment) {
  const seg = String(segment || coverage?.segment || "business").replace(/_/g, " ");
  const lines = [
    `Commercial Insurance Direct — ${seg} policy coverage summary (Coterie ConnectQuote).`,
    `Policy type: ${coverage.policy_type || "—"}. Carrier: ${coverage.carrier_name || "—"}.`,
    `Effective ${coverage.effective_date || "—"} through ${coverage.expiration_date || "—"}.`,
  ];

  if (coverage.general_liability) {
    const gl = coverage.general_liability;
    lines.push(
      `General liability (GL): each occurrence $${Number(gl.each_occurrence || 0).toLocaleString("en-US")}; ` +
        `general aggregate $${Number(gl.general_aggregate || 0).toLocaleString("en-US")}; ` +
        `products and completed operations aggregate $${Number(gl.products_completed_operations_aggregate || 0).toLocaleString("en-US")}.`,
      "GL covers third-party bodily injury and property damage from your operations, products, and completed work, including legal defense costs subject to policy terms.",
    );
  }

  if (coverage.business_personal_property) {
    const bpp = coverage.business_personal_property;
    lines.push(
      `Business personal property (BPP): limit $${Number(bpp.limit || 0).toLocaleString("en-US")}; ` +
        `deductible $${Number(bpp.deductible || 0).toLocaleString("en-US")}.`,
      "BPP covers tools, equipment, and business property at covered locations subject to policy terms and exclusions.",
    );
  }

  if (coverage.building?.limit) {
    lines.push(
      `Building limit $${Number(coverage.building.limit).toLocaleString("en-US")} for owned property.`,
    );
  }

  lines.push(
    "Contractor operations such as panel upgrades, service work, and completed operations are evaluated under general liability terms and exclusions in the full policy.",
    "Equipment breakdown, cyber, flood, professional liability, and liquor liability are not included unless separately shown in coverage details.",
    coverage.summary_note || "",
  );

  return lines.filter(Boolean).join("\n");
}

function chunkTextByWords(text, perChunk = 400, overlap = 40) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(words.length, start + perChunk);
    const content = words.slice(start, end).join(" ").trim();
    if (content) chunks.push(content);
    if (end >= words.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

/**
 * Load submission + optional session snapshot and rebuild coverage_data for chat/COI.
 * @param {import("pg").Pool} pool
 * @param {{ id: string, submission_id?: string, coverage_data?: object, segment?: string }} policyRow
 */
export async function hydrateCoterieCoverageData(pool, policyRow) {
  if (!pool || !policyRow?.id) return null;
  const existing = policyRow.coverage_data || {};
  if (existing.bind_source !== "coterie") return null;
  if (!isSparseCoterieCoverage(existing)) return existing;

  const subId = policyRow.submission_id;
  if (!subId) return existing;

  const subRes = await pool.query(
    `SELECT raw_submission_json FROM submissions WHERE submission_id = $1 LIMIT 1`,
    [subId],
  );
  const submission = subRes.rows[0]
    ? { raw_submission_json: subRes.rows[0].raw_submission_json }
    : {};

  let quoteSummary = {};
  const sessionRes = await pool.query(
    `
      SELECT event_payload_json
      FROM timeline_events te
      JOIN submissions s ON s.submission_id = te.submission_id
      WHERE s.submission_id = $1
        AND te.event_type = 'coterie.session'
      ORDER BY te.created_at DESC
      LIMIT 1
    `,
    [subId],
  );
  const session = sessionRes.rows[0]?.event_payload_json;
  if (session?.quoteSummary) {
    quoteSummary = session.quoteSummary;
  } else if (session?.quoteId) {
    quoteSummary = { quoteId: session.quoteId, ...(session.quoteSummary || {}) };
  }

  const rebuilt = buildCoterieCoverageData({
    quoteSummary,
    submission,
    bindResult: { result: existing.coterie_bind || null },
  });

  return { ...existing, ...rebuilt };
}

/**
 * Index Coterie quote summary text for Connect chat FTS (no PDF yet).
 * @param {import("pg").PoolClient} client
 */
export async function indexCoterieCoverageForChat(
  client,
  { policyId, clientId, submissionId, segment, coverageData },
) {
  if (!policyId || !coverageData) return { indexed: 0 };

  const existing = await client.query(
    `
      SELECT COUNT(*)::int AS n
      FROM policy_document_chunks
      WHERE policy_id = $1::uuid AND index_status = 'indexed'
    `,
    [policyId],
  );
  if (existing.rows[0]?.n > 0) return { indexed: 0, skipped: true };

  const text = buildCoterieChatIndexText(coverageData, segment);
  const chunks = chunkTextByWords(text);
  if (!chunks.length) return { indexed: 0 };

  const sha256 = crypto.createHash("sha256").update(text).digest("hex");
  const storagePath = `coterie/chat-index/${policyId}.txt`;

  const docRes = await client.query(
    `
      INSERT INTO documents (
        client_id, submission_id, policy_id, document_type, document_role,
        storage_provider, storage_path, mime_type, sha256_hash, is_original, created_by
      )
      VALUES ($1, $2, $3::uuid, 'json', 'coverage_summary_generated', 'r2', $4, 'text/plain', $5, FALSE, 'system')
      RETURNING document_id
    `,
    [clientId, submissionId, policyId, storagePath, sha256],
  );
  const documentId = docRes.rows[0].document_id;

  for (let i = 0; i < chunks.length; i += 1) {
    await client.query(
      `
        INSERT INTO policy_document_chunks (
          policy_id, document_id, document_role, chunk_index, content,
          source_storage_path, source_sha256, document_priority, index_status
        )
        VALUES ($1::uuid, $2::uuid, 'coverage_summary_generated', $3, $4, $5, $6, 3, 'indexed')
        ON CONFLICT (document_id, chunk_index)
        DO UPDATE SET
          content = EXCLUDED.content,
          index_status = EXCLUDED.index_status,
          updated_at = NOW()
      `,
      [
        policyId,
        documentId,
        i,
        chunks[i],
        storagePath,
        sha256,
      ],
    );
  }

  return { indexed: chunks.length, documentId };
}

export { isSparseCoterieCoverage };
