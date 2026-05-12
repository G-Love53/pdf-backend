/**
 * CID Connect API — /api/connect/*
 * Requires connectAuthMiddleware (X-User-Email, optional X-User-Id).
 */
import express from "express";
import multer from "multer";
import { getPool } from "../db.js";
import { fulfillConnectCoiRequest } from "../services/connectCoiFulfillmentService.js";
import { uploadBuffer, deleteObject } from "../services/r2Service.js";
import { generateConnectChatReply } from "../services/connectChatService.js";
import { buildEnrichedChatInput } from "../services/connectChatEnrichment.js";
import { searchCarrierKnowledgeRows } from "../lib/carrierKnowledgeSearch.js";
import { mintRenewalIntakeToken, segmentIntakeBaseUrl } from "../lib/renewalIntakeToken.js";

const router = express.Router();

const COI_REQUIREMENTS_MAX_BYTES = 10 * 1024 * 1024;

const coiRequirementsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COI_REQUIREMENTS_MAX_BYTES },
});

/** JSON stays on express.json(); multipart fields + optional file land here. */
function coiRequestBodyParser(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (!ct.includes("multipart/form-data")) {
    return next();
  }
  return coiRequirementsUpload.single("requirements")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ ok: false, error: "Requirements file too large (max 10MB)" });
      }
      return res.status(400).json({ ok: false, error: err.message || "Upload parse error" });
    }
    next();
  });
}

function sanitizeCoiRequirementsFilename(name) {
  const base = String(name || "requirements").split(/[/\\]/).pop() || "requirements";
  const cleaned = base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 200);
  return cleaned || "requirements";
}

function sniffRequirementsMime(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

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
    quote_id: row.quote_id != null ? String(row.quote_id) : null,
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
      WHERE COALESCE(p.client_id, s.client_id) = $1::uuid
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
       WHERE p.id = $1::uuid AND COALESCE(p.client_id, s.client_id) = $2::uuid`,
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
      `SELECT p.id
       FROM policies p
       LEFT JOIN submissions s ON s.submission_id = p.submission_id
       WHERE p.id = $1::uuid
         AND COALESCE(p.client_id, s.client_id) = $2::uuid`,
      [policyId, client_id],
    );
    if (!check.rows.length) {
      return res.status(404).json({ ok: false, error: "Policy not found" });
    }

    const result = await pool.query(
      `SELECT document_id, document_type, document_role, storage_path, mime_type,
              created_at, policy_id, client_id
       FROM documents
       WHERE policy_id = $1::uuid
         AND (client_id = $2::uuid OR client_id IS NULL)
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
  coiRequestBodyParser,
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

    const file = req.file;
    let requirementsMime = null;
    if (file) {
      if (!file.buffer?.length) {
        return res.status(400).json({
          ok: false,
          error: "Requirements file is empty",
        });
      }
      const sniffed = sniffRequirementsMime(file.buffer);
      if (!sniffed) {
        return res.status(400).json({
          ok: false,
          error: "Requirements file must be PDF, PNG, or JPEG",
        });
      }
      const declared = String(file.mimetype || "").toLowerCase();
      const normDeclared = declared === "image/jpg" ? "image/jpeg" : declared;
      const allowedDeclared = new Set(["application/pdf", "image/png", "image/jpeg"]);
      if (allowedDeclared.has(normDeclared) && normDeclared !== sniffed) {
        return res.status(400).json({
          ok: false,
          error: "File content does not match declared type",
        });
      }
      requirementsMime = sniffed;
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

    let created = ins.rows[0];
    const segment = String(pol.rows[0].segment || "bar").toLowerCase();
    const safeSeg = segment.replace(/[^a-z0-9_-]/gi, "_");

    if (requirementsMime && file?.buffer) {
      const mime = requirementsMime;
      const displayName = sanitizeCoiRequirementsFilename(file.originalname || file.filename || "requirements");
      const ext =
        mime === "application/pdf"
          ? ".pdf"
          : mime === "image/png"
            ? ".png"
            : ".jpg";
      const stamp = Date.now().toString(36);
      const r2Key = `coi/${safeSeg}/${requestNumber}/requirements-${stamp}${ext}`;

      try {
        await uploadBuffer(r2Key, file.buffer, mime, {
          segment: safeSeg,
          type: "coi_requirements",
          request_number: requestNumber,
        });
      } catch (e) {
        console.error("[ConnectAPI] COI requirements R2 upload failed:", e?.message || e);
        await pool.query(
          `UPDATE coi_requests SET status = 'failed', updated_at = NOW(),
            backend_response = COALESCE(backend_response, '{}'::jsonb) || $2::jsonb
           WHERE id = $1::uuid`,
          [
            created.id,
            JSON.stringify({
              error: "requirements_upload_failed",
              detail: e.message || String(e),
            }),
          ],
        );
        return res.status(502).json({
          ok: false,
          error: "Could not store requirements file. Please try again.",
        });
      }

      try {
        const upd = await pool.query(
          `UPDATE coi_requests
           SET uploaded_file_path = $2, uploaded_file_name = $3, updated_at = NOW()
           WHERE id = $1::uuid
           RETURNING *`,
          [created.id, r2Key, displayName],
        );
        created = upd.rows[0];
      } catch (e) {
        console.error("[ConnectAPI] COI requirements DB update failed:", e?.message || e);
        await deleteObject(r2Key);
        await pool.query(
          `UPDATE coi_requests SET status = 'failed', updated_at = NOW(),
            backend_response = COALESCE(backend_response, '{}'::jsonb) || $2::jsonb
           WHERE id = $1::uuid`,
          [
            created.id,
            JSON.stringify({
              error: "requirements_db_update_failed",
              detail: e.message || String(e),
            }),
          ],
        );
        return res.status(500).json({
          ok: false,
          error: "Could not finalize COI request. Please try again.",
        });
      }
    }

    res.status(201).json({ ok: true, data: created });
    setImmediate(() => {
      fulfillConnectCoiRequest(pool, created.id).catch((err) => {
        console.error("[ConnectAPI] COI auto-fulfill error:", err?.message || err);
      });
    });
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

    const rows = await searchCarrierKnowledgeRows(pool, {
      carrierSlug,
      segment,
      searchText,
      category: category || null,
      limit: 10,
    });

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
         AND (
           ($2::text IS NULL OR segment::text = $2 OR segment IS NULL)
         )
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
      // Prompt string is built inside generateConnectChatReply → buildSystemPrompt (connectChatService.js).
      // Logging returned systemPrompt verifies the same string passed to Claude/Gemini (log runs after the model returns).
      const { reply, systemPrompt } = await generateConnectChatReply({
        message: String(message).trim(),
        policyContext: enriched.policyContext,
        chatHistory: enriched.chatHistory,
        aiSummary: enriched.aiSummary,
        carrierDisplayName: enriched.carrierDisplayName,
        knowledgeBlock: enriched.knowledgeBlock,
        policyPdfExcerptsBlock: enriched.policyPdfExcerptsBlock,
      });
      if (process.env.CONNECT_CHAT_PROMPT_DEBUG === "true") {
        console.log("[ConnectAPI] /chat systemPrompt prefix:", String(systemPrompt || "").substring(0, 400));
      }
      const data = { message: reply };
      if (process.env.CONNECT_CHAT_PROMPT_DEBUG === "true") {
        data._promptDebug = String(systemPrompt || "").substring(0, 120);
      }
      res.json({ ok: true, data });
    } catch (err) {
      console.error("[ConnectAPI] /chat", err?.code || "", err?.message || err);
      res.status(503).json({
        ok: false,
        error: "Coverage assistant is temporarily unavailable.",
      });
    }
  }),
);

router.post(
  "/renewal-intake-token",
  asyncHandler(async (req, res) => {
    const pool = requirePool(res);
    if (!pool) return;
    const { client_id } = req.connectClient;
    const policyId = req.body?.policyId;
    if (!policyId) {
      return res.status(400).json({ ok: false, error: "policyId is required" });
    }

    let row;
    try {
      const q = await pool.query(
        `SELECT p.id, p.segment::text AS segment
         FROM policies p
         LEFT JOIN submissions s ON s.submission_id = p.submission_id
         WHERE p.id = $1::uuid AND COALESCE(p.client_id, s.client_id) = $2::uuid`,
        [policyId, client_id],
      );
      if (!q.rows.length) {
        return res.status(404).json({ ok: false, error: "Policy not found" });
      }
      row = q.rows[0];
    } catch (e) {
      console.error("[ConnectAPI] renewal-intake-token lookup", e?.message || e);
      return res.status(500).json({ ok: false, error: "lookup_failed" });
    }

    let token;
    let expiresInSec;
    try {
      const minted = mintRenewalIntakeToken({
        policyId: row.id,
        clientId: client_id,
        segment: row.segment,
      });
      token = minted.token;
      expiresInSec = minted.expiresInSec;
    } catch (e) {
      console.error("[ConnectAPI] renewal-intake-token mint", e?.message || e);
      return res.status(503).json({
        ok: false,
        error: "renewal_intake_not_configured",
        detail: String(e.message || e),
      });
    }

    const base = segmentIntakeBaseUrl(row.segment);
    const u = new URL(base.endsWith("/") ? base : `${base}/`);
    u.searchParams.set("renewal_token", token);

    res.json({
      ok: true,
      data: {
        redirectUrl: u.toString(),
        expiresInSec,
      },
    });
  }),
);

export default router;
