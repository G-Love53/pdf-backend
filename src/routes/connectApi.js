/**
 * CID Connect API — /api/connect/*
 * Requires connectAuthMiddleware (X-User-Email, optional X-User-Id).
 */
import express from "express";
import { getPool } from "../db.js";
import { generateConnectChatReply } from "../services/connectChatService.js";
import { buildEnrichedChatInput } from "../services/connectChatEnrichment.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(`[ConnectAPI] ${req.method} ${req.path}`, err);
      res.status(500).json({
        ok: false,
        error: "Something went wrong. Please try again.",
      });
    });
  };
}

function requirePool(res) {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ ok: false, error: "Database unavailable" });
    return null;
  }
  return pool;
}

/** Map cid-postgres policy row → Connect Policy-like shape */
function mapPolicy(row, supabaseUserId) {
  const cov = row.coverage_data;
  return {
    id: row.id,
    user_id: supabaseUserId || null,
    policy_number: row.policy_number,
    segment: row.segment,
    business_name: row.business_name || null,
    carrier: row.carrier_name,
    carrier_id: null,
    effective_date: row.effective_date,
    expiration_date: row.expiration_date,
    premium:
      row.annual_premium != null ? Number(row.annual_premium) : 0,
    status: row.status,
    coverage_data: cov,
    general_liability_limit: null,
    property_limit: null,
    auto_limit: null,
    workers_comp_limit: null,
    umbrella_limit: null,
    deductible: null,
    payment_frequency: row.payment_method || null,
    next_payment_date: null,
    next_payment_amount: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Resolve carrier slug for KB search from policies.carrier_name */
async function resolveCarrierSlug(pool, carrierName) {
  if (!carrierName) return null;
  const raw = String(carrierName).trim();
  const slugify = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 64) || null;

  const exact = await pool.query(
    `SELECT slug FROM carriers WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
    [raw],
  );
  if (exact.rows.length) return exact.rows[0].slug;

  const r = await pool.query(
    `SELECT slug FROM carriers
     WHERE $1::text ILIKE '%' || name || '%'
        OR name ILIKE '%' || $1 || '%'
     ORDER BY length(name) ASC
     LIMIT 1`,
    [raw],
  );
  if (r.rows.length) return r.rows[0].slug;
  return slugify(raw);
}

// --- Profile ---

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;

    const result = await pool.query(
      `SELECT c.client_id, c.primary_email, c.first_name, c.last_name, c.primary_phone,
              c.famous_user_id, c.created_at,
              (
                SELECT b.business_name
                FROM submissions s
                LEFT JOIN businesses b ON b.business_id = s.business_id
                WHERE s.client_id = c.client_id
                ORDER BY s.submitted_at DESC NULLS LAST
                LIMIT 1
              ) AS business_name,
              (
                SELECT s.segment::text
                FROM submissions s
                WHERE s.client_id = c.client_id
                ORDER BY s.submitted_at DESC NULLS LAST
                LIMIT 1
              ) AS segment
       FROM clients c
       WHERE c.client_id = $1`,
      [client_id],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "Client not found" });
    }

    res.json({ ok: true, data: result.rows[0] });
  }),
);

// --- Policies ---

router.get(
  "/policies",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const status = req.query.status;

    let sql = `
      SELECT p.*, b.business_name
      FROM policies p
      LEFT JOIN submissions s ON s.submission_id = p.submission_id
      LEFT JOIN businesses b ON b.business_id = s.business_id
      WHERE p.client_id = $1
    `;
    const params = [client_id];
    if (status) {
      sql += ` AND p.status = $2`;
      params.push(status);
    }
    sql += ` ORDER BY p.effective_date DESC NULLS LAST, p.created_at DESC`;

    const { rows } = await pool.query(sql, params);
    const mapped = rows.map((row) =>
      mapPolicy(row, req.connectSupabaseUserId),
    );
    res.json({ ok: true, data: mapped, count: mapped.length });
  }),
);

router.get(
  "/policies/:policyId",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const { policyId } = req.params;

    const result = await pool.query(
      `SELECT p.*, b.business_name
       FROM policies p
       LEFT JOIN submissions s ON s.submission_id = p.submission_id
       LEFT JOIN businesses b ON b.business_id = s.business_id
       WHERE p.id = $1::uuid AND p.client_id = $2::uuid`,
      [policyId, client_id],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "Policy not found" });
    }

    res.json({
      ok: true,
      data: mapPolicy(result.rows[0], req.connectSupabaseUserId),
    });
  }),
);

router.get(
  "/policies/:policyId/documents",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const { policyId } = req.params;

    const check = await pool.query(
      `SELECT id FROM policies WHERE id = $1::uuid AND client_id = $2::uuid`,
      [policyId, client_id],
    );
    if (!check.rows.length) {
      return res.status(404).json({ ok: false, error: "Policy not found" });
    }

    const result = await pool.query(
      `SELECT document_id, document_type, document_role, storage_path, mime_type,
              created_at, policy_id, client_id
       FROM documents
       WHERE policy_id = $1::uuid AND client_id = $2::uuid
       ORDER BY created_at DESC`,
      [policyId, client_id],
    );

    res.json({ ok: true, data: result.rows, count: result.rows.length });
  }),
);

// --- Quotes ---

router.get(
  "/quotes",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;

    const result = await pool.query(
      `SELECT q.quote_id, q.submission_id, q.carrier_name, q.segment::text AS segment,
              q.status::text AS status, q.premium AS annual_premium,
              q.effective_date, q.expiration_date, q.created_at, q.updated_at,
              s.submission_public_id,
              qe.reviewed_json,
              qe.reviewed_json AS ai_summary
       FROM quotes q
       JOIN submissions s ON s.submission_id = q.submission_id
       LEFT JOIN LATERAL (
         SELECT reviewed_json
         FROM quote_extractions qe2
         WHERE qe2.quote_id = q.quote_id
         ORDER BY qe2.is_active DESC NULLS LAST, qe2.created_at DESC
         LIMIT 1
       ) qe ON TRUE
       WHERE s.client_id = $1::uuid
       ORDER BY q.created_at DESC`,
      [client_id],
    );

    res.json({ ok: true, data: result.rows, count: result.rows.length });
  }),
);

router.get(
  "/quotes/:quoteId",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const { quoteId } = req.params;

    const result = await pool.query(
      `SELECT q.*, q.segment::text AS segment, q.status::text AS status,
              s.submission_public_id, s.client_id,
              qe.reviewed_json, qe.reviewed_json AS ai_summary
       FROM quotes q
       JOIN submissions s ON s.submission_id = q.submission_id
       LEFT JOIN LATERAL (
         SELECT reviewed_json
         FROM quote_extractions qe2
         WHERE qe2.quote_id = q.quote_id
         ORDER BY qe2.is_active DESC NULLS LAST, qe2.created_at DESC
         LIMIT 1
       ) qe ON TRUE
       WHERE s.client_id = $1::uuid
         AND (q.quote_id::text = $2 OR q.quote_id = $2::uuid)`,
      [client_id, quoteId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const row = result.rows[0];
    res.json({
      ok: true,
      data: {
        ...row,
        id: row.quote_id,
        quote_id: row.quote_id,
      },
    });
  }),
);

// --- COI ---

function generateCoiNumber() {
  return `COI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function generateClaimNumber() {
  return `CLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

router.post(
  "/coi/request",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const body = req.body || {};
    const policyId = body.policyId;
    if (!policyId) {
      return res.status(400).json({
        ok: false,
        error: "policyId is required",
      });
    }

    const pol = await pool.query(
      `SELECT id, carrier_name, segment, status FROM policies
       WHERE id = $1::uuid AND client_id = $2::uuid AND status = 'active'`,
      [policyId, client_id],
    );
    if (!pol.rows.length) {
      return res.status(404).json({ ok: false, error: "Active policy not found" });
    }

    const requestNumber = generateCoiNumber();
    const ins = await pool.query(
      `INSERT INTO coi_requests (
        client_id, policy_id, request_number,
        certificate_holder_name, certificate_holder_address,
        certificate_holder_city, certificate_holder_state, certificate_holder_zip,
        delivery_email, certificate_type, additional_instructions,
        status, segment
      ) VALUES (
        $1::uuid, $2::uuid, $3,
        $4, $5, $6, $7, $8, $9, $10, $11,
        'submitted', $12
      )
      RETURNING *`,
      [
        client_id,
        policyId,
        requestNumber,
        body.holderName || body.certificate_holder_name || "Holder",
        body.holderAddress || body.certificate_holder_address || null,
        body.city || body.certificate_holder_city || null,
        body.state || body.certificate_holder_state || null,
        body.zip || body.certificate_holder_zip || null,
        body.email || body.delivery_email || req.connectClient.primary_email,
        body.certificateType || body.certificate_type || "standard",
        body.additionalInstructions || body.additional_instructions || null,
        pol.rows[0].segment || null,
      ],
    );

    res.status(201).json({ ok: true, data: ins.rows[0] });
  }),
);

router.get(
  "/coi/history",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;

    const result = await pool.query(
      `SELECT cr.*, p.policy_number, p.carrier_name AS carrier_slug
       FROM coi_requests cr
       JOIN policies p ON p.id = cr.policy_id
       WHERE cr.client_id = $1::uuid
       ORDER BY cr.created_at DESC`,
      [client_id],
    );

    res.json({ ok: true, data: result.rows, count: result.rows.length });
  }),
);

// --- Claims ---

router.post(
  "/claims",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const body = req.body || {};
    const policyId = body.policyId;
    const description = body.description || body.detailedDescription;

    if (!policyId || !description) {
      return res.status(400).json({
        ok: false,
        error: "policyId and description are required",
      });
    }

    const pol = await pool.query(
      `SELECT id, carrier_name, segment::text AS segment FROM policies
       WHERE id = $1::uuid AND client_id = $2::uuid`,
      [policyId, client_id],
    );
    if (!pol.rows.length) {
      return res.status(404).json({ ok: false, error: "Policy not found" });
    }

    const claimNumber = generateClaimNumber();
    const photosArr = Array.isArray(body.photos) ? body.photos : [];
    const ins = await pool.query(
      `INSERT INTO claims (
        client_id, policy_id, claim_number, segment,
        incident_date, incident_location, description, claim_type,
        estimated_amount, photos, status, backend_notified
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4,
        $5::date, $6, $7, $8,
        $9, $10::jsonb, 'submitted', false
      )
      RETURNING *`,
      [
        client_id,
        policyId,
        claimNumber,
        pol.rows[0].segment,
        body.incidentDate || body.dateOfIncident || null,
        body.locationOfIncident || body.incident_location || "",
        description,
        body.typeOfLoss || body.claim_type || "general",
        body.estimatedAmount != null ? Number(body.estimatedAmount) : null,
        JSON.stringify(photosArr),
      ],
    );

    res.status(201).json({ ok: true, data: ins.rows[0] });
  }),
);

router.get(
  "/claims",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;

    const result = await pool.query(
      `SELECT cl.*, p.policy_number, p.carrier_name
       FROM claims cl
       JOIN policies p ON p.id = cl.policy_id
       WHERE cl.client_id = $1::uuid
       ORDER BY cl.created_at DESC`,
      [client_id],
    );

    res.json({ ok: true, data: result.rows, count: result.rows.length });
  }),
);

// --- Knowledge ---

router.get(
  "/knowledge/search",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const q = req.query.query || req.query.q;
    const category = req.query.category;

    if (!q || !String(q).trim()) {
      return res.status(400).json({ ok: false, error: "query parameter is required" });
    }

    const pol = await pool.query(
      `SELECT * FROM policies
       WHERE client_id = $1::uuid AND status = 'active'
       ORDER BY effective_date DESC NULLS LAST
       LIMIT 1`,
      [client_id],
    );

    if (!pol.rows.length) {
      return res.json({
        ok: true,
        data: [],
        count: 0,
        message: "No active policy to scope knowledge search",
      });
    }

    const pr = pol.rows[0];
    let carrierSlug = pr.carrier_slug || null;
    if (!carrierSlug) {
      carrierSlug = await resolveCarrierSlug(pool, pr.carrier_name);
    }
    if (!carrierSlug) {
      carrierSlug = String(pr.carrier_name || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 64) || "unknown";
    }
    const segment = pr.segment;
    const searchText = String(q).trim();

    const params = [carrierSlug, segment, searchText];
    let sql = `
      SELECT id, topic, content, category, source_label, tags, carrier_slug, segment
      FROM carrier_knowledge
      WHERE carrier_slug = $1
        AND is_published = true
        AND (segment::text = $2 OR segment IS NULL)
        AND to_tsvector('english', topic || ' ' || content) @@ plainto_tsquery('english', $3)
    `;
    if (category) {
      sql += ` AND category = $4`;
      params.push(category);
    }
    sql += `
      ORDER BY ts_rank(
        to_tsvector('english', topic || ' ' || content),
        plainto_tsquery('english', $3)
      ) DESC
      LIMIT 10
    `;

    const { rows } = await pool.query(sql, params);

    res.json({ ok: true, data: rows, count: rows.length });
  }),
);

router.get(
  "/knowledge/coverages",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;

    const pol = await pool.query(
      `SELECT * FROM policies
       WHERE client_id = $1::uuid AND status = 'active'
       ORDER BY effective_date DESC NULLS LAST
       LIMIT 1`,
      [client_id],
    );

    if (!pol.rows.length) {
      return res.json({ ok: true, data: [], count: 0 });
    }

    const pr = pol.rows[0];
    let carrierSlug = pr.carrier_slug || null;
    if (!carrierSlug) {
      carrierSlug = await resolveCarrierSlug(pool, pr.carrier_name);
    }
    if (!carrierSlug) {
      carrierSlug = String(pr.carrier_name || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 64) || "unknown";
    }
    const segment = pr.segment;

    const result = await pool.query(
      `SELECT topic, content, tags, source_label, category
       FROM carrier_knowledge
       WHERE carrier_slug = $1
         AND category = 'coverage_options'
         AND is_published = true
         AND (segment::text = $2 OR segment IS NULL)
       ORDER BY topic ASC`,
      [carrierSlug, segment],
    );

    res.json({ ok: true, data: result.rows, count: result.rows.length });
  }),
);

// --- Chat (Claude + Gemini fallback) ---

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const message = body.message;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ ok: false, error: "message is required" });
    }

    const pool = requirePool(res);
    if (!pool) return;

    try {
      const enriched = await buildEnrichedChatInput(
        pool,
        req.connectClient.client_id,
        body,
      );
      const reply = await generateConnectChatReply({
        message: String(message).trim(),
        policyContext: enriched.policyContext,
        chatHistory: enriched.chatHistory,
        aiSummary: enriched.aiSummary,
        carrierDisplayName: enriched.carrierDisplayName,
        knowledgeBlock: enriched.knowledgeBlock,
      });
      res.json({ ok: true, data: { message: reply } });
    } catch (err) {
      console.error("[ConnectAPI] /chat", err?.message || err);
      res.status(503).json({
        ok: false,
        error: "Coverage assistant is temporarily unavailable.",
      });
    }
  }),
);

export default router;
