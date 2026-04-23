import express from "express";
import { getPool } from "../db.js";
import extractionReviewApi from "./extractionReview.js";
import packetBuilderApi from "./packetBuilder.js";
import bindFlowApi from "./bindFlow.js";
import clientContactApi from "./clientContactRoutes.js";
import {
  processBoldSignDocumentCompleted,
  tryFinalizeBoldSignFromDocumentId,
} from "../services/boldsignBindCompletion.js";
import {
  parseOperatorSegmentQuery,
  segmentQuerySuffix,
  sqlSegmentFilter,
} from "../utils/operatorSegment.js";
import { dedupeCarrierMessagesForGmail } from "../jobs/gmailPoller.js";

const router = express.Router();
const pool = getPool();

/** Segment filter for shared operator nav (?segment=all|bar|…). */
function operatorNavLocals(req) {
  const segment = parseOperatorSegmentQuery(req.query.segment);
  const segmentQuery =
    segment === "all" ? "" : `?segment=${encodeURIComponent(segment)}`;
  return { segment, segmentQuery };
}

router.use(extractionReviewApi);
router.use(packetBuilderApi);
router.use(bindFlowApi);
router.use(clientContactApi);

// Operator home dashboard
// BoldSign redirects here after sign with ?documentId=&status=Signed&...
// when webhooks are not delivered or lag; finalize the bind server-side.
router.get(["/operator", "/operator/home"], async (req, res) => {
  // BoldSign may use mixed-case query keys depending on redirect implementation.
  const docId =
    req.query.documentId ||
    req.query.DocumentId ||
    req.query.document_id ||
    null;
  const statusRaw = String(
    req.query.status || req.query.Status || req.query.state || "",
  ).trim();
  const status = statusRaw.toLowerCase();
  const looksSigned =
    status === "signed" ||
    status === "completed" ||
    status === "complete";

  if (docId && looksSigned) {
    try {
      let result = await tryFinalizeBoldSignFromDocumentId(String(docId), {
        source: "redirect",
        payload: { query: req.query },
      });
      // Redirect means the user finished in BoldSign; /properties may still say InProgress.
      // Second path: trust download (same as Completed webhook).
      if (result.outcome === "not_ready") {
        result = await processBoldSignDocumentCompleted(String(docId), {
          source: "redirect_download",
          payload: { query: req.query },
        });
      }
      if (result.outcome === "completed" || result.outcome === "already_signed") {
        const seg = parseOperatorSegmentQuery(req.query.segment);
        const segExtra =
          seg !== "all" ? `&segment=${encodeURIComponent(seg)}` : "";
        const q =
          result.quoteId != null
            ? `?bind_signed=1&quote_id=${encodeURIComponent(String(result.quoteId))}${segExtra}`
            : `?bind_signed=1${segExtra}`;
        return res.redirect(302, `/operator${q}`);
      }
      if (result.outcome === "missing") {
        return res.redirect(
          302,
          `/operator?bind_error=unknown_document${segmentQuerySuffix(req)}`,
        );
      }
      if (result.outcome === "cancelled") {
        return res.redirect(
          302,
          `/operator?bind_error=cancelled${segmentQuerySuffix(req)}`,
        );
      }
    } catch (err) {
      console.error("[operator] BoldSign redirect finalize failed:", err.message || err);
      return res.redirect(
        302,
        `/operator?bind_pending=1${segmentQuerySuffix(req)}`,
      );
    }
  }

  res.render("operator/home", {});
});

// Dashboard API: counts + queues — ?segment=all|bar|roofer|plumber|hvac (default all)
router.get("/api/operator/dashboard", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  const segment = parseOperatorSegmentQuery(req.query.segment);
  const segSql = ` ${sqlSegmentFilter("s")} `;
  const segParams = [segment];

  try {
    const [
      countsResult,
      submissionsQueueResult,
      s4QueueResult,
      bindsAwaitingResult,
      renewalsResult,
      connectBindQueueResult,
      connectPolicyDocsQueueResult,
    ] =
      await Promise.all([
        pool.query(
          `
            SELECT
              (
                SELECT COUNT(*)::int
                FROM submissions s
                WHERE s.submitted_at IS NOT NULL
                  AND s.submitted_at >= CURRENT_DATE
                  AND s.submitted_at < CURRENT_DATE + INTERVAL '1 day'
                  ${segSql}
              ) AS submissions_today,
              (
                SELECT COUNT(*)::int
                FROM quote_extractions qe
                JOIN quotes q ON q.quote_id = qe.quote_id
                JOIN submissions s ON s.submission_id = q.submission_id
                WHERE qe.review_status = 'approved'
                  AND qe.reviewed_at >= CURRENT_DATE
                  ${segSql}
              ) AS approved_quotes_today,
              (
                SELECT COUNT(*)::int
                FROM quote_packets qp
                JOIN quotes q ON q.quote_id = qp.quote_id
                JOIN submissions s ON s.submission_id = q.submission_id
                WHERE qp.status = 'sent'
                  AND qp.sent_at >= CURRENT_DATE
                  ${segSql}
              ) AS packets_sent_today,
              (
                SELECT COUNT(*)::int
                FROM bind_requests br
                JOIN quotes q ON q.quote_id = br.quote_id
                JOIN submissions s ON s.submission_id = q.submission_id
                WHERE br.created_at >= CURRENT_DATE
                  ${segSql}
              ) AS binds_initiated_today,
              (
                SELECT COUNT(*)::int
                FROM policies p
                JOIN submissions s ON s.submission_id = p.submission_id
                WHERE p.created_at >= CURRENT_DATE
                  ${segSql}
              ) AS policies_bound_today,
              (
                SELECT COUNT(*)::int
                FROM documents d
                JOIN policies p ON p.id = d.policy_id
                JOIN submissions s ON s.submission_id = p.submission_id
                WHERE d.document_role = 'signed_bind_docs'
                  AND d.policy_id IS NOT NULL
                  AND d.created_at >= CURRENT_DATE
                  ${segSql}
              ) AS connect_bind_pdf_stored_today,
              (
                SELECT COUNT(*)::int
                FROM documents d
                JOIN policies p ON p.id = d.policy_id
                JOIN submissions s ON s.submission_id = p.submission_id
                WHERE d.document_role IN ('policy_original', 'declarations_original')
                  AND d.policy_id IS NOT NULL
                  AND d.created_at >= CURRENT_DATE
                  ${segSql}
              ) AS connect_policy_docs_stored_today
          `,
          segParams,
        ),
        pool.query(
          `
            SELECT
              s.submission_public_id,
              s.submitted_at AS created_at,
              c.primary_email AS client_email,
              COALESCE(
                NULLIF(TRIM(b.business_name), ''),
                NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
                NULLIF(TRIM(s.raw_submission_json->>'insured_name'), ''),
                NULLIF(TRIM(s.raw_submission_json->>'premises_name'), ''),
                NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
                NULLIF(TRIM(s.raw_submission_json->>'applicant_name'), ''),
                c.primary_email
              ) AS client_name
            FROM submissions s
            JOIN clients c ON c.client_id = s.client_id
            LEFT JOIN businesses b ON b.business_id = s.business_id
            LEFT JOIN quotes q ON q.submission_id = s.submission_id
            WHERE s.status = 'received'
              AND q.submission_id IS NULL
              ${segSql}
            ORDER BY s.submitted_at ASC
            LIMIT 50
          `,
          segParams,
        ),
        pool.query(
          `
            SELECT
              wqi.work_queue_item_id,
              wqi.created_at,
              q.quote_id,
              s.submission_public_id,
              COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
              q.match_confidence,
              CASE
                WHEN q.match_confidence >= 0.95 THEN 'exact'
                WHEN q.match_confidence >= 0.7 THEN 'fuzzy'
                ELSE 'no_match'
              END AS match_confidence_label
            FROM work_queue_items wqi
            JOIN quotes q
              ON wqi.related_entity_type = 'quote'
             AND wqi.related_entity_id = q.quote_id
            JOIN submissions s
              ON q.submission_id = s.submission_id
            LEFT JOIN businesses b
              ON s.business_id = b.business_id
            LEFT JOIN clients c
              ON s.client_id = c.client_id
            WHERE wqi.queue_type = 'extraction_review'
              AND wqi.status = 'open'
              ${segSql}
            ORDER BY wqi.created_at ASC
            LIMIT 20
          `,
          segParams,
        ),
        // Binds awaiting signature (avoid policy_type dependency for older schemas)
        pool.query(
          `
            SELECT
              br.id AS bind_request_id,
              br.initiated_at,
              q.quote_id,
              s.submission_public_id,
              COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
              q.carrier_name
            FROM bind_requests br
            JOIN quotes q ON q.quote_id = br.quote_id
            JOIN submissions s ON s.submission_id = q.submission_id
            LEFT JOIN businesses b ON s.business_id = b.business_id
            LEFT JOIN clients c ON s.client_id = c.client_id
            WHERE br.status = 'awaiting_signature'
              ${segSql}
            ORDER BY br.initiated_at ASC
            LIMIT 20
          `,
          segParams,
        ),
        // Upcoming policy renewals (avoid renewal_date / policy_type dependency)
        pool.query(
          `
            SELECT
              p.id AS policy_id,
              p.effective_date,
              p.expiration_date,
              s.submission_public_id,
              COALESCE(
                NULLIF(TRIM(b.business_name), ''),
                NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
                NULLIF(TRIM(s.raw_submission_json->>'insured_name'), ''),
                NULLIF(TRIM(s.raw_submission_json->>'premises_name'), ''),
                NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
                NULLIF(TRIM(s.raw_submission_json->>'applicant_name'), ''),
                c.primary_email
              ) AS client_name,
              p.carrier_name
            FROM policies p
            JOIN submissions s ON s.submission_id = p.submission_id
            LEFT JOIN businesses b ON s.business_id = b.business_id
            LEFT JOIN clients c ON s.client_id = c.client_id
            WHERE 1=1
              ${segSql}
            ORDER BY p.effective_date DESC
            LIMIT 20
          `,
          segParams,
        ),
        // Bind confirmation PDF on file in cid-postgres (same rows Connect serves via GET /api/connect/policies/:id/documents)
        pool.query(
          `
            SELECT
              d.document_id,
              d.created_at AS stored_at,
              p.id AS policy_id,
              p.policy_number,
              q.quote_id,
              s.submission_public_id,
              COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
              p.carrier_name
            FROM documents d
            JOIN policies p ON p.id = d.policy_id
            JOIN quotes q ON q.quote_id = p.quote_id
            JOIN submissions s ON s.submission_id = p.submission_id
            LEFT JOIN businesses b ON b.business_id = s.business_id
            LEFT JOIN clients c ON c.client_id = s.client_id
            WHERE d.document_role = 'signed_bind_docs'
              AND d.policy_id IS NOT NULL
              ${segSql}
            ORDER BY d.created_at DESC
            LIMIT 15
          `,
          segParams,
        ),
        // Policy / declarations PDFs on file (endorsements: use policy_original or declarations_original; add more roles in enum + migration if needed)
        pool.query(
          `
            SELECT *
            FROM (
              SELECT DISTINCT ON (p.id)
                p.id AS policy_id,
                p.policy_number,
                p.quote_id,
                d.created_at AS stored_at,
                s.submission_public_id,
                COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
                p.carrier_name,
                d.document_role::text AS last_document_role
              FROM documents d
              JOIN policies p ON p.id = d.policy_id
              JOIN submissions s ON s.submission_id = p.submission_id
              LEFT JOIN businesses b ON b.business_id = s.business_id
              LEFT JOIN clients c ON c.client_id = s.client_id
              WHERE d.document_role IN ('policy_original', 'declarations_original', 'endorsement')
                AND d.policy_id IS NOT NULL
                ${segSql}
              ORDER BY p.id, d.created_at DESC
            ) t
            ORDER BY t.stored_at DESC
            LIMIT 15
          `,
          segParams,
        ),
      ]);

    const countsRow = countsResult.rows[0] || {};

    res.json({
      segment,
      counts: {
        submissions_today: countsRow.submissions_today ?? 0,
        approved_quotes_today: countsRow.approved_quotes_today ?? 0,
        packets_sent_today: countsRow.packets_sent_today ?? 0,
        binds_initiated_today: countsRow.binds_initiated_today ?? 0,
        policies_bound_today: countsRow.policies_bound_today ?? 0,
        connect_bind_pdf_stored_today:
          countsRow.connect_bind_pdf_stored_today ?? 0,
        connect_policy_docs_stored_today:
          countsRow.connect_policy_docs_stored_today ?? 0,
      },
      queues: {
        submissions_waiting_outreach: submissionsQueueResult.rows,
        quotes_pending_s4: s4QueueResult.rows,
        binds_awaiting_signature: bindsAwaitingResult.rows,
        upcoming_policy_renewals: renewalsResult.rows,
        connect_bind_confirmation_stored: connectBindQueueResult.rows,
        connect_policy_documents_stored: connectPolicyDocsQueueResult.rows,
      },
    });
  } catch (err) {
    console.error("[operator/dashboard] error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Admin: policy indexing status for Connect "Am I Covered?" retrieval.
// Requires CID_MAINTENANCE_SECRET in env + matching `x-admin-secret` header (or ?secret=...).
router.get("/api/admin/index-status/:policyId", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }
  const expected = process.env.CID_MAINTENANCE_SECRET?.trim();
  if (!expected) {
    return res.status(503).json({ error: "maintenance_secret_not_configured" });
  }
  const supplied =
    String(req.headers["x-admin-secret"] || "").trim() ||
    String(req.query.secret || "").trim();
  if (!supplied || supplied !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { policyId } = req.params;
  try {
    const docsSql = `
      SELECT
        COUNT(*)::int AS total_docs,
        COUNT(*) FILTER (
          WHERE d.document_role::text IN ('policy_original', 'declarations_original')
        )::int AS indexable_docs
      FROM documents d
      WHERE d.policy_id = $1::uuid
    `;
    const chunksSql = `
      SELECT
        COUNT(*)::int AS chunk_count,
        COUNT(DISTINCT document_id) FILTER (WHERE index_status = 'indexed')::int AS indexed_docs,
        COUNT(DISTINCT document_id) FILTER (
          WHERE index_status IN ('download_failed', 'parse_failed', 'needs_ocr', 'empty_text')
        )::int AS failed_docs,
        MAX(updated_at) AS last_indexed_at
      FROM policy_document_chunks
      WHERE policy_id = $1::uuid
    `;
    const [docsRes, chunkRes] = await Promise.all([
      pool.query(docsSql, [policyId]),
      pool.query(chunksSql, [policyId]),
    ]);
    const docs = docsRes.rows[0] || {};
    const chunks = chunkRes.rows[0] || {};
    return res.json({
      ok: true,
      policy_id: policyId,
      total_docs: docs.total_docs ?? 0,
      indexable_docs: docs.indexable_docs ?? 0,
      indexed_docs: chunks.indexed_docs ?? 0,
      failed_docs: chunks.failed_docs ?? 0,
      chunk_count: chunks.chunk_count ?? 0,
      last_indexed_at: chunks.last_indexed_at || null,
    });
  } catch (err) {
    console.error("[admin/index-status] error:", err?.message || err);
    return res.status(500).json({ error: "internal_error" });
  }
});

/** Drill-down for dashboard “today” tiles — same segment + UTC-day filters as /api/operator/dashboard. */
router.get("/operator/today/:metric", async (req, res) => {
  if (!pool) {
    return res.status(503).send("database_not_configured");
  }

  const segment = parseOperatorSegmentQuery(req.query.segment);
  const segSql = ` ${sqlSegmentFilter("s")} `;
  const segParams = [segment];

  const metric = String(req.params.metric || "").toLowerCase();
  const configs = {
    submissions: {
      title: "Submissions (today)",
      sql: `
        SELECT
          s.submission_public_id,
          s.submitted_at,
          s.status::text AS status,
          c.primary_email AS client_email,
          COALESCE(
            NULLIF(TRIM(b.business_name), ''),
            NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
            NULLIF(TRIM(s.raw_submission_json->>'insured_name'), ''),
            NULLIF(TRIM(s.raw_submission_json->>'premises_name'), ''),
            NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
            NULLIF(TRIM(s.raw_submission_json->>'applicant_name'), ''),
            c.primary_email
          ) AS client_name
        FROM submissions s
        JOIN clients c ON c.client_id = s.client_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        WHERE s.submitted_at IS NOT NULL
          AND s.submitted_at >= CURRENT_DATE
          AND s.submitted_at < CURRENT_DATE + INTERVAL '1 day'
          ${segSql}
        ORDER BY s.submitted_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "submission_public_id", label: "Submission" },
        { key: "submitted_at", label: "Submitted (UTC)" },
        { key: "status", label: "Status" },
        { key: "client_name", label: "Client" },
        { key: "client_email", label: "Email" },
      ],
    },
    "approved-quotes": {
      title: "Approved quotes (S4, today)",
      sql: `
        SELECT
          s.submission_public_id,
          q.quote_id,
          qe.reviewed_at,
          q.carrier_name,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
          CASE
            WHEN pkt.st IS NULL THEN '—'
            WHEN pkt.st::text = 'sent' THEN 'SENT'
            ELSE UPPER(pkt.st::text)
          END AS packet_status
        FROM quote_extractions qe
        JOIN quotes q ON q.quote_id = qe.quote_id
        JOIN submissions s ON s.submission_id = q.submission_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        LEFT JOIN LATERAL (
          SELECT qp.status AS st
          FROM quote_packets qp
          WHERE qp.quote_id = q.quote_id
          ORDER BY qp.created_at DESC
          LIMIT 1
        ) pkt ON TRUE
        WHERE qe.review_status = 'approved'
          AND qe.reviewed_at >= CURRENT_DATE
          ${segSql}
        ORDER BY qe.reviewed_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "submission_public_id", label: "Submission" },
        { key: "quote_id", label: "Quote", link: "quote_packet" },
        { key: "packet_status", label: "Packet" },
        { key: "reviewed_at", label: "Approved (UTC)" },
        { key: "carrier_name", label: "Carrier" },
        { key: "client_name", label: "Client" },
      ],
    },
    "packets-sent": {
      title: "Packets sent (S5, today)",
      sql: `
        SELECT
          s.submission_public_id,
          q.quote_id,
          qp.sent_at,
          q.carrier_name,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
        FROM quote_packets qp
        JOIN quotes q ON q.quote_id = qp.quote_id
        JOIN submissions s ON s.submission_id = q.submission_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        WHERE qp.status = 'sent'
          AND qp.sent_at >= CURRENT_DATE
          ${segSql}
        ORDER BY qp.sent_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "submission_public_id", label: "Submission" },
        { key: "quote_id", label: "Quote", link: "quote_packet" },
        { key: "sent_at", label: "Sent (UTC)" },
        { key: "carrier_name", label: "Carrier" },
        { key: "client_name", label: "Client" },
      ],
    },
    "binds-initiated": {
      title: "Binds initiated (S6, today)",
      sql: `
        SELECT
          s.submission_public_id,
          q.quote_id,
          br.created_at,
          br.status::text AS status,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
        FROM bind_requests br
        JOIN quotes q ON q.quote_id = br.quote_id
        JOIN submissions s ON s.submission_id = q.submission_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        WHERE br.created_at >= CURRENT_DATE
          ${segSql}
        ORDER BY br.created_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "submission_public_id", label: "Submission" },
        { key: "quote_id", label: "Quote", link: "quote_bind" },
        { key: "created_at", label: "Initiated (UTC)" },
        { key: "status", label: "Bind status" },
        { key: "client_name", label: "Client" },
      ],
    },
    "policies-bound": {
      title: "Policies bound (today)",
      sql: `
        SELECT
          p.policy_number,
          p.quote_id,
          p.created_at,
          s.submission_public_id,
          p.carrier_name,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        WHERE p.created_at >= CURRENT_DATE
          ${segSql}
        ORDER BY p.created_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "policy_number", label: "Policy #" },
        { key: "submission_public_id", label: "Submission" },
        { key: "quote_id", label: "Quote", link: "quote_bind" },
        { key: "created_at", label: "Bound (UTC)" },
        { key: "carrier_name", label: "Carrier" },
        { key: "client_name", label: "Client" },
      ],
    },
    "connect-bind-stored": {
      title: "Bind confirmation PDF stored (Connect, today)",
      sql: `
        SELECT
          d.document_id,
          d.created_at AS stored_at,
          p.id AS policy_id,
          p.policy_number,
          q.quote_id,
          s.submission_public_id,
          p.carrier_name,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
        FROM documents d
        JOIN policies p ON p.id = d.policy_id
        JOIN quotes q ON q.quote_id = p.quote_id
        JOIN submissions s ON s.submission_id = p.submission_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        WHERE d.document_role = 'signed_bind_docs'
          AND d.policy_id IS NOT NULL
          AND d.created_at >= CURRENT_DATE
          ${segSql}
        ORDER BY d.created_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "submission_public_id", label: "Submission" },
        { key: "policy_number", label: "Policy #" },
        { key: "quote_id", label: "Quote", link: "quote_bind" },
        { key: "stored_at", label: "Stored (UTC)" },
        { key: "carrier_name", label: "Carrier" },
        { key: "client_name", label: "Client" },
        { key: "document_id", label: "Document id" },
      ],
    },
    "connect-policy-docs-stored": {
      title: "Policy / declarations stored (Connect, today)",
      sql: `
        SELECT
          d.document_id,
          d.created_at AS stored_at,
          d.document_role::text AS document_role,
          p.policy_number,
          q.quote_id,
          s.submission_public_id,
          p.carrier_name,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
        FROM documents d
        JOIN policies p ON p.id = d.policy_id
        JOIN quotes q ON q.quote_id = p.quote_id
        JOIN submissions s ON s.submission_id = p.submission_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        WHERE d.document_role IN ('policy_original', 'declarations_original', 'endorsement')
          AND d.policy_id IS NOT NULL
          AND d.created_at >= CURRENT_DATE
          ${segSql}
        ORDER BY d.created_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "submission_public_id", label: "Submission" },
        { key: "policy_number", label: "Policy #", link: "policy_docs" },
        { key: "document_role", label: "Role" },
        { key: "quote_id", label: "Quote" },
        { key: "stored_at", label: "Stored (UTC)" },
        { key: "carrier_name", label: "Carrier" },
        { key: "client_name", label: "Client" },
      ],
    },
  };

  const cfg = configs[metric];
  if (!cfg) {
    return res.status(404).send("Unknown metric");
  }

  try {
    const result = await pool.query(cfg.sql, segParams);
    const rows = result.rows.map((row) => {
      const out = { ...row };
      if (out.submitted_at) out.submitted_at = new Date(out.submitted_at).toISOString();
      if (out.reviewed_at) out.reviewed_at = new Date(out.reviewed_at).toISOString();
      if (out.sent_at) out.sent_at = new Date(out.sent_at).toISOString();
      if (out.created_at) out.created_at = new Date(out.created_at).toISOString();
      if (out.stored_at) out.stored_at = new Date(out.stored_at).toISOString();
      return out;
    });
    const segmentLabel =
      segment === "all"
        ? "All segments"
        : `${segment.charAt(0).toUpperCase() + segment.slice(1)} segment`;
    const segmentQuery =
      segment === "all" ? "" : `?segment=${encodeURIComponent(segment)}`;

    res.render("operator/today-metric", {
      title: cfg.title,
      columns: cfg.columns,
      rows,
      segmentLabel,
      segmentQuery,
      segment: segment === "all" ? "all" : segment,
    });
  } catch (err) {
    console.error("[operator/today] error:", err.message || err);
    res.status(500).send("internal_error");
  }
});

router.get("/operator/extraction-review", async (req, res) => {
  res.render("operator/extraction-queue", operatorNavLocals(req));
});

router.get("/operator/extraction-review/:workQueueItemId", async (req, res) => {
  res.render("operator/extraction-review", {
    workQueueItemId: req.params.workQueueItemId,
    ...operatorNavLocals(req),
  });
});

router.get("/operator/packet-builder", async (req, res) => {
  res.render("operator/packet-queue", operatorNavLocals(req));
});

router.get("/operator/packet-builder/:quoteId", async (req, res) => {
  res.render("operator/packet-detail", {
    quoteId: req.params.quoteId,
    ...operatorNavLocals(req),
  });
});

router.get("/operator/bind", async (req, res) => {
  res.render("operator/bind-queue", operatorNavLocals(req));
});

router.get("/operator/bind/:quoteId", async (req, res) => {
  res.render("operator/bind-detail", {
    quoteId: req.params.quoteId,
    ...operatorNavLocals(req),
  });
});

router.get("/operator/policies/:policyId/documents", async (req, res) => {
  if (!pool) {
    return res.status(503).send("Database unavailable");
  }

  const { policyId } = req.params;
  try {
    const summaryResult = await pool.query(
      `
        SELECT
          p.id AS policy_id,
          p.policy_number,
          p.carrier_name,
          s.submission_public_id,
          q.quote_id,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
        FROM policies p
        JOIN submissions s ON s.submission_id = p.submission_id
        LEFT JOIN quotes q ON q.quote_id = p.quote_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        WHERE p.id = $1::uuid
        LIMIT 1
      `,
      [policyId],
    );
    if (!summaryResult.rows.length) {
      return res.status(404).send("Policy not found");
    }

    const docsResult = await pool.query(
      `
        SELECT
          d.document_id,
          d.document_role::text AS document_role,
          d.document_type,
          d.created_at,
          d.storage_path
        FROM documents d
        WHERE d.policy_id = $1::uuid
        ORDER BY d.created_at DESC
      `,
      [policyId],
    );

    res.render("operator/policy-documents", {
      policy: summaryResult.rows[0],
      documents: docsResult.rows,
      ...operatorNavLocals(req),
    });
  } catch (err) {
    console.error("[operator/policy-documents] error:", err.message || err);
    res.status(500).send("internal_error");
  }
});

/** HTML escape for maintenance response bodies */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * Deduplicate carrier_messages rows that share the same (gmail_message_id, segment).
 * Requires env CID_MAINTENANCE_SECRET (set once on Render). Browser form — no local DATABASE_URL.
 */
router.get("/operator/maintenance/dedupe-carrier-messages", (_req, res) => {
  const configured = Boolean(process.env.CID_MAINTENANCE_SECRET?.trim());
  const body = `
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Dedupe carrier messages</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}
code{background:#f6f6f6;padding:2px 6px;border-radius:4px}</style></head><body>
<h1>Dedupe carrier messages</h1>
<p>Removes duplicate <code>carrier_messages</code> rows (keeps oldest per Gmail id + segment), same logic as the poller.</p>
${
  configured
    ? `<form method="post" action="/operator/maintenance/dedupe-carrier-messages">
<p><label>Maintenance secret<br><input name="maintenance_secret" type="password" required autocomplete="off" style="width:100%;max-width:24rem"/></label></p>
<p><button type="submit">Run dedupe</button></p>
</form>`
    : `<p><strong>Not available.</strong> Set environment variable <code>CID_MAINTENANCE_SECRET</code> on this service, redeploy, then reload this page.</p>`
}
</body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(configured ? 200 : 503).send(body);
});

router.post(
  "/operator/maintenance/dedupe-carrier-messages",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const expected = process.env.CID_MAINTENANCE_SECRET?.trim();
    if (!expected) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res
        .status(503)
        .send(
          `<p>Set <code>CID_MAINTENANCE_SECRET</code> on the server and redeploy.</p>`,
        );
    }
    const got = String(req.body?.maintenance_secret || "").trim();
    if (!got || got !== expected) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(401).send("<p>Unauthorized.</p>");
    }

    if (!pool) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(503).send("<p>Database not configured.</p>");
    }

    try {
      const { rows } = await pool.query(`
        SELECT gmail_message_id, segment::text AS segment
        FROM carrier_messages
        WHERE gmail_message_id IS NOT NULL
        GROUP BY gmail_message_id, segment
        HAVING COUNT(*) > 1
        ORDER BY gmail_message_id, segment
      `);

      if (rows.length === 0) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(
          `<p>No duplicate groups found. <a href="/operator/maintenance/dedupe-carrier-messages">Back</a></p>`,
        );
      }

      for (const row of rows) {
        await dedupeCarrierMessagesForGmail({
          gmailMessageId: row.gmail_message_id,
          segment: row.segment,
        });
      }

      const { rows: verify } = await pool.query(`
        SELECT COUNT(*)::int AS c FROM (
          SELECT 1
          FROM carrier_messages
          WHERE gmail_message_id IS NOT NULL
          GROUP BY gmail_message_id, segment
          HAVING COUNT(*) > 1
        ) t
      `);
      const remaining = verify[0]?.c ?? 0;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(
        `<p>Processed <strong>${rows.length}</strong> duplicate group(s). Remaining duplicate groups: <strong>${remaining}</strong>.</p>
<p><a href="/operator/maintenance/dedupe-carrier-messages">Back</a></p>`,
      );
    } catch (err) {
      console.error("[maintenance/dedupe-carrier-messages]", err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res
        .status(500)
        .send(`<p>Dedupe failed: ${escapeHtml(err.message)}</p>`);
    }
  },
);

export default router;

