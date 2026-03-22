import express from "express";
import { getPool } from "../db.js";
import extractionReviewApi from "./extractionReview.js";
import packetBuilderApi from "./packetBuilder.js";
import bindFlowApi from "./bindFlow.js";
import {
  processBoldSignDocumentCompleted,
  tryFinalizeBoldSignFromDocumentId,
} from "../services/boldsignBindCompletion.js";
import {
  parseOperatorSegmentQuery,
  segmentQuerySuffix,
  sqlSegmentFilter,
} from "../utils/operatorSegment.js";

const router = express.Router();
const pool = getPool();

router.use(extractionReviewApi);
router.use(packetBuilderApi);
router.use(bindFlowApi);

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
    const [countsResult, submissionsQueueResult, s4QueueResult, bindsAwaitingResult, renewalsResult] =
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
              ) AS policies_bound_today
          `,
          segParams,
        ),
        pool.query(
          `
            SELECT
              s.submission_public_id,
              NULL::timestamp AS created_at,
              c.primary_email AS client_email,
              COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
            FROM submissions s
            JOIN clients c ON c.client_id = s.client_id
            LEFT JOIN businesses b ON b.business_id = s.business_id
            LEFT JOIN quotes q ON q.submission_id = s.submission_id
            WHERE s.status = 'received'
              AND q.submission_id IS NULL
              ${segSql}
            ORDER BY s.submission_public_id ASC
            LIMIT 20
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
              COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
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
      },
      queues: {
        submissions_waiting_outreach: submissionsQueueResult.rows,
        quotes_pending_s4: s4QueueResult.rows,
        binds_awaiting_signature: bindsAwaitingResult.rows,
        upcoming_policy_renewals: renewalsResult.rows,
      },
    });
  } catch (err) {
    console.error("[operator/dashboard] error:", err.message || err);
    res.status(500).json({ error: "internal_error" });
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
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
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
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
        FROM quote_extractions qe
        JOIN quotes q ON q.quote_id = qe.quote_id
        JOIN submissions s ON s.submission_id = q.submission_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        LEFT JOIN clients c ON c.client_id = s.client_id
        WHERE qe.review_status = 'approved'
          AND qe.reviewed_at >= CURRENT_DATE
          ${segSql}
        ORDER BY qe.reviewed_at DESC
        LIMIT 200
      `,
      columns: [
        { key: "submission_public_id", label: "Submission" },
        { key: "quote_id", label: "Quote", link: "quote_packet" },
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
    });
  } catch (err) {
    console.error("[operator/today] error:", err.message || err);
    res.status(500).send("internal_error");
  }
});

router.get("/operator/extraction-review", async (_req, res) => {
  res.render("operator/extraction-queue", {});
});

router.get("/operator/extraction-review/:workQueueItemId", async (req, res) => {
  res.render("operator/extraction-review", {
    workQueueItemId: req.params.workQueueItemId,
  });
});

router.get("/operator/packet-builder", async (_req, res) => {
  res.render("operator/packet-queue", {});
});

router.get("/operator/packet-builder/:quoteId", async (req, res) => {
  res.render("operator/packet-detail", {
    quoteId: req.params.quoteId,
  });
});

router.get("/operator/bind", async (_req, res) => {
  res.render("operator/bind-queue", {});
});

router.get("/operator/bind/:quoteId", async (req, res) => {
  res.render("operator/bind-detail", {
    quoteId: req.params.quoteId,
  });
});

export default router;

