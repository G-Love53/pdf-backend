import express from "express";
import crypto from "crypto";
import { getPool } from "../db.js";
import {
  listReadyToBind,
  getBindDetails,
  initiateBind,
  resendBind,
  cancelBind,
} from "../services/bindService.js";
import { uploadBuffer } from "../services/r2Service.js";
import { runPolicyIndexer } from "../workers/policyIndexer.js";
import { DocumentRole, DocumentType, StorageProvider } from "../constants/postgresEnums.js";
import { parseOptionalUuid } from "../utils/uuid.js";
import { verifySignedBindLinkParams } from "../utils/bindLinkToken.js";
import { getSegmentBranding } from "../config/segmentBranding.js";

const router = express.Router();
const pool = getPool();

const DOCS_RECONCILE_ROLES = new Set([
  DocumentRole.SIGNED_BIND_DOCS,
  DocumentRole.POLICY_ORIGINAL,
  DocumentRole.DECLARATIONS_ORIGINAL,
  DocumentRole.ENDORSEMENT,
]);

function safeFilename(name) {
  return String(name || "document.pdf")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .trim()
    .slice(0, 120) || "document.pdf";
}

function quoteIdOr400(req, res) {
  const id = parseOptionalUuid(req.params.quoteId);
  if (!id) {
    res.status(400).json({ success: false, error: "invalid_quote_id" });
    return null;
  }
  return id;
}

router.get("/api/quotes/ready-to-bind", async (req, res) => {
  try {
    const segment = req.query.segment || undefined;
    const data = await listReadyToBind({ segment });
    res.json(data);
  } catch (err) {
    console.error("ready-to-bind error:", err);
    res.status(500).json({ success: false, error: err.message || "error" });
  }
});

// S6 Docs Reconcile: lookup by CID submission id.
router.get("/api/s6/docs-reconcile/:submissionPublicId", async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: "database_not_configured" });
  const submissionPublicId = String(req.params.submissionPublicId || "").trim().toUpperCase();
  if (!submissionPublicId) {
    return res.status(400).json({ success: false, error: "missing_submission_public_id" });
  }
  try {
    const subRes = await pool.query(
      `
        SELECT
          s.submission_id,
          s.submission_public_id,
          s.segment::text AS segment,
          s.client_id,
          COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name,
          c.primary_email AS client_email
        FROM submissions s
        JOIN clients c ON c.client_id = s.client_id
        LEFT JOIN businesses b ON b.business_id = s.business_id
        WHERE s.submission_public_id = $1
        LIMIT 1
      `,
      [submissionPublicId],
    );
    if (!subRes.rows.length) {
      return res.status(404).json({ success: false, error: "submission_not_found" });
    }
    const sub = subRes.rows[0];

    const policyRes = await pool.query(
      `
        SELECT id AS policy_id, quote_id, policy_number, carrier_name, created_at
        FROM policies
        WHERE submission_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [sub.submission_id],
    );
    const docsRes = await pool.query(
      `
        SELECT
          document_role::text AS role,
          COUNT(*)::int AS count
        FROM documents
        WHERE submission_id = $1
          OR policy_id IN (SELECT id FROM policies WHERE submission_id = $1)
        GROUP BY 1
        ORDER BY count DESC
      `,
      [sub.submission_id],
    );

    return res.json({
      success: true,
      submission: sub,
      policy: policyRes.rows[0] || null,
      document_counts: docsRes.rows,
    });
  } catch (err) {
    console.error("docs-reconcile lookup error:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  }
});

// S6 Docs Reconcile: manual upload + link by CID ID.
router.post("/api/s6/docs-reconcile/upload", async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: "database_not_configured" });
  const {
    submission_public_id,
    document_role,
    filename,
    file_base64,
    note,
  } = req.body || {};
  const sid = String(submission_public_id || "").trim().toUpperCase();
  const role = String(document_role || "").trim();
  if (!sid || !role || !file_base64) {
    return res.status(400).json({ success: false, error: "missing_required_fields" });
  }
  if (!DOCS_RECONCILE_ROLES.has(role)) {
    return res.status(400).json({ success: false, error: "invalid_document_role" });
  }

  const m = String(file_base64).match(/^data:application\/pdf;base64,(.+)$/i);
  const b64 = m ? m[1] : String(file_base64).trim();
  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(b64, "base64");
  } catch {
    return res.status(400).json({ success: false, error: "invalid_file_base64" });
  }
  if (!pdfBuffer || pdfBuffer.length < 32) {
    return res.status(400).json({ success: false, error: "empty_or_invalid_pdf" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const subRes = await client.query(
      `
        SELECT submission_id, client_id, segment::text AS segment
        FROM submissions
        WHERE submission_public_id = $1
        LIMIT 1
      `,
      [sid],
    );
    if (!subRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "submission_not_found" });
    }
    const sub = subRes.rows[0];

    const policyRes = await client.query(
      `
        SELECT id AS policy_id, quote_id
        FROM policies
        WHERE submission_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [sub.submission_id],
    );
    const policy = policyRes.rows[0] || null;
    if (
      (role === DocumentRole.POLICY_ORIGINAL ||
        role === DocumentRole.DECLARATIONS_ORIGINAL ||
        role === DocumentRole.ENDORSEMENT) &&
      !policy
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "policy_not_found_for_submission",
      });
    }

    const safeName = safeFilename(filename || `${sid}-${role}.pdf`);
    const storagePath = `manual/${sub.segment}/${sid}/${Date.now()}-${safeName}`;
    await uploadBuffer(storagePath, pdfBuffer, "application/pdf", {
      segment: sub.segment,
      type: role,
      source: "s6_docs_reconcile",
    });

    const sha = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const docRes = await client.query(
      `
        INSERT INTO documents (
          client_id, submission_id, quote_id, policy_id,
          document_type, document_role, storage_provider, storage_path,
          mime_type, sha256_hash, is_original, created_by
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid,
          $5, $6::document_role, $7, $8,
          'application/pdf', $9, TRUE, 'agent'
        )
        RETURNING document_id
      `,
      [
        sub.client_id,
        sub.submission_id,
        policy?.quote_id || null,
        policy?.policy_id || null,
        DocumentType.PDF,
        role,
        StorageProvider.R2,
        storagePath,
        sha,
      ],
    );
    const documentId = docRes.rows[0].document_id;

    await client.query(
      `
        INSERT INTO timeline_events (
          submission_id, quote_id, policy_id,
          event_type, event_label, event_payload_json, created_by
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid,
          'policy.document.manual_linked',
          'S6 Docs Reconcile upload linked',
          $4::jsonb,
          'agent'
        )
      `,
      [
        sub.submission_id,
        policy?.quote_id || null,
        policy?.policy_id || null,
        JSON.stringify({
          document_id: documentId,
          role,
          filename: safeName,
          note: note ? String(note).slice(0, 500) : null,
          source: "s6_docs_reconcile",
        }),
      ],
    );

    await client.query("COMMIT");

    if (
      role === DocumentRole.POLICY_ORIGINAL ||
      role === DocumentRole.DECLARATIONS_ORIGINAL ||
      role === DocumentRole.ENDORSEMENT
    ) {
      runPolicyIndexer({ limit: 50 }).catch((err) =>
        console.error("docs-reconcile index trigger error:", err?.message || err),
      );
    }

    return res.json({
      success: true,
      document_id: documentId,
      storage_path: storagePath,
      linked_policy_id: policy?.policy_id || null,
      message: "Document uploaded and linked.",
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("docs-reconcile upload error:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  } finally {
    client.release();
  }
});

router.get("/api/quotes/:quoteId/bind-details", async (req, res) => {
  try {
    const quoteId = quoteIdOr400(req, res);
    if (!quoteId) return;
    const syncBoldSign = req.query.sync !== "0";
    const details = await getBindDetails(quoteId, { syncBoldSign });
    if (!details) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    res.json(details);
  } catch (err) {
    console.error("bind-details error:", err);
    res.status(500).json({ success: false, error: err.message || "error" });
  }
});

router.post("/api/quotes/:quoteId/bind/initiate", async (req, res) => {
  try {
    const quoteId = quoteIdOr400(req, res);
    if (!quoteId) return;
    const { agent_id, payment_method, effective_date_override, agent_notes, signer_name, signer_email } =
      req.body || {};

    const result = await initiateBind({
      quoteId,
      agentId: agent_id,
      paymentMethod: payment_method,
      effectiveDateOverride: effective_date_override,
      agentNotes: agent_notes,
      signerName: signer_name,
      signerEmail: signer_email,
    });

    res.json({
      success: true,
      bind_request_id: result.bindRequest.id,
      boldsign_document_id: result.boldsign?.documentId || null,
      boldsign_send_url: result.boldsign?.sendUrl || null,
      signature_request_sent_via_email: true,
      message:
        "BoldSign will email the signer a link to review and sign the bind confirmation.",
      status: result.bindRequest.status,
    });
  } catch (err) {
    console.error("bind initiate error:", err);
    res.status(500).json({ success: false, error: err.message || "error" });
  }
});

// Customer-facing one-click from quote packet email (GET works in mail clients).
// After HMAC validation, we initiate bind and embed BoldSign in-page (same pattern as operator bind-detail).
router.get("/api/quotes/:quoteId/bind/initiate", async (req, res) => {
  try {
    const quoteId = quoteIdOr400(req, res);
    if (!quoteId) return;
    const details = await getBindDetails(quoteId, { syncBoldSign: false });
    if (!details) {
      return res.status(404).send("Quote not found.");
    }
    const signerName =
      details.client?.contact_name ||
      details.client?.business_name ||
      "Insured";
    const signerEmail = details.client?.email || null;
    if (!signerEmail) {
      return res
        .status(400)
        .send("Unable to initiate bind: signer email is missing on this quote.");
    }

    const requireSignature = String(process.env.BIND_LINK_REQUIRE_SIGNATURE || "false") === "true";
    const token = req.query.t;
    const exp = req.query.exp;
    if (token || exp || requireSignature) {
      const vr = verifySignedBindLinkParams({
        quoteId,
        submissionPublicId: details.submission_public_id || "",
        token: token || null,
        exp: exp || null,
      });
      if (!vr.ok) {
        return res
          .status(403)
          .send("This bind link is invalid or expired. Please request a new quote packet.");
      }
    }

    const result = await initiateBind({
      quoteId,
      agentId: null,
      paymentMethod: "annual",
      effectiveDateOverride: null,
      agentNotes: "initiated_via_quote_email",
      signerName,
      signerEmail,
    });

    const sendUrl = result?.boldsign?.sendUrl || null;
    if (!sendUrl) {
      return res
        .status(503)
        .send(
          "Signing could not start (no embed link from the signature provider). Please try again in a minute or reply to your quote email for help.",
        );
    }

    const branding = getSegmentBranding(details.segment);
    return res.status(200).render("customer/bind-sign", {
      boldsignSendUrl: sendUrl,
      submissionPublicId: details.submission_public_id || "",
      segmentBrandName: branding.segmentBrandName,
      segmentColor: branding.segmentColor,
      segmentIcon: branding.segmentIcon,
    });
  } catch (err) {
    console.error("bind initiate redirect error:", err?.message || err);
    const msg = String(err?.message || err || "error");
    if (/does not have a sent packet/i.test(msg)) {
      return res
        .status(400)
        .send(
          "A packet must be sent to the client before binding. If you already received your quote packet, open Issue Policy from that email or contact us.",
        );
    }
    if (/not configured|BOLD_SIGN_API_KEY|BOLDSIGN_API_KEY|CID_BOLDSIGN_API_KEY/i.test(msg)) {
      return res
        .status(503)
        .send(
          "Signing is not available right now (service configuration). Please reply to your quote email for help.",
        );
    }
    if (/BoldSign|document\/send|template\/send/i.test(msg)) {
      return res
        .status(503)
        .send(
          "The signature provider could not send the request. Please try again in a minute or reply to your quote email for help.",
        );
    }
    return res
      .status(500)
      .send(
        "Unable to start signature right now. Please reply to your quote email for help.",
      );
  }
});

router.post("/api/quotes/:quoteId/bind/resend", async (req, res) => {
  try {
    const quoteId = quoteIdOr400(req, res);
    if (!quoteId) return;
    const { agent_id } = req.body || {};
    await resendBind({ quoteId, agentId: agent_id });
    res.json({ success: true });
  } catch (err) {
    console.error("bind resend error:", err);
    res.status(500).json({ success: false, error: err.message || "error" });
  }
});

router.post("/api/quotes/:quoteId/bind/cancel", async (req, res) => {
  try {
    const quoteId = quoteIdOr400(req, res);
    if (!quoteId) return;
    const { agent_id, reason } = req.body || {};
    await cancelBind({
      quoteId,
      agentId: agent_id,
      reason,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("bind cancel error:", err);
    res.status(500).json({ success: false, error: err.message || "error" });
  }
});

export default router;

