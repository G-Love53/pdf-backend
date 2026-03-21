import express from "express";
import { getPool } from "../db.js";
import extractionReviewApi from "./extractionReview.js";
import packetBuilderApi from "./packetBuilder.js";
import bindFlowApi from "./bindFlow.js";
import {
  processBoldSignDocumentCompleted,
  tryFinalizeBoldSignFromDocumentId,
} from "../services/boldsignBindCompletion.js";

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
        const q =
          result.quoteId != null
            ? `?bind_signed=1&quote_id=${encodeURIComponent(String(result.quoteId))}`
            : "?bind_signed=1";
        return res.redirect(302, `/operator${q}`);
      }
      if (result.outcome === "missing") {
        return res.redirect(302, "/operator?bind_error=unknown_document");
      }
      if (result.outcome === "cancelled") {
        return res.redirect(302, "/operator?bind_error=cancelled");
      }
    } catch (err) {
      console.error("[operator] BoldSign redirect finalize failed:", err.message || err);
      return res.redirect(302, "/operator?bind_pending=1");
    }
  }

  res.render("operator/home", {});
});

// Lightweight dashboard API for counts + key queues (Bar segment)
router.get("/api/operator/dashboard", async (_req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  try {
    const [countsResult, submissionsQueueResult, s4QueueResult, bindsAwaitingResult, renewalsResult] =
      await Promise.all([
        pool.query(
          `
            SELECT
              -- Submissions (all time, Bar)
              (
                SELECT COUNT(*)::int
                FROM submissions s
                WHERE s.segment = 'bar'::segment_type
              ) AS submissions_today,
              -- Quotes approved in S4 today (approved extractions)
              (
                SELECT COUNT(*)::int
                FROM quote_extractions qe
                JOIN quotes q ON q.quote_id = qe.quote_id
                JOIN submissions s ON s.submission_id = q.submission_id
                WHERE s.segment = 'bar'::segment_type
                  AND qe.review_status = 'approved'
                  AND qe.reviewed_at >= CURRENT_DATE
              ) AS approved_quotes_today,
              -- Packets sent today (S5)
              (
                SELECT COUNT(*)::int
                FROM quote_packets qp
                JOIN quotes q ON q.quote_id = qp.quote_id
                JOIN submissions s ON s.submission_id = q.submission_id
                WHERE s.segment = 'bar'::segment_type
                  AND qp.status = 'sent'
                  AND qp.sent_at >= CURRENT_DATE
              ) AS packets_sent_today,
              -- Binds initiated today
              (
                SELECT COUNT(*)::int
                FROM bind_requests br
                JOIN quotes q ON q.quote_id = br.quote_id
                JOIN submissions s ON s.submission_id = q.submission_id
                WHERE s.segment = 'bar'::segment_type
                  AND br.created_at >= CURRENT_DATE
              ) AS binds_initiated_today,
              -- Policies bound today
              (
                SELECT COUNT(*)::int
                FROM policies p
                JOIN submissions s ON s.submission_id = p.submission_id
                WHERE s.segment = 'bar'::segment_type
                  AND p.created_at >= CURRENT_DATE
              ) AS policies_bound_today
          `,
        ),
        // Submissions waiting for carrier outreach (received, no quotes yet)
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
            WHERE s.segment = 'bar'::segment_type
              AND s.status = 'received'
              AND q.submission_id IS NULL
            ORDER BY s.submission_public_id ASC
            LIMIT 20
          `,
        ),
        // Quotes pending S4 extraction review (open work_queue_items)
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
              AND s.segment = 'bar'::segment_type
            ORDER BY wqi.created_at ASC
            LIMIT 20
          `,
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
              AND s.segment = 'bar'::segment_type
            ORDER BY br.initiated_at ASC
            LIMIT 20
          `,
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
            WHERE s.segment = 'bar'::segment_type
            ORDER BY p.effective_date DESC
            LIMIT 20
          `,
        ),
      ]);

    const countsRow = countsResult.rows[0] || {};

    res.json({
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

