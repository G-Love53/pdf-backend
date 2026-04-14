import express from "express";
import {
  listReadyToBind,
  getBindDetails,
  initiateBind,
  resendBind,
  cancelBind,
} from "../services/bindService.js";
import { parseOptionalUuid } from "../utils/uuid.js";
import { verifySignedBindLinkParams } from "../utils/bindLinkToken.js";

const router = express.Router();

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
      status: result.bindRequest.status,
    });
  } catch (err) {
    console.error("bind initiate error:", err);
    res.status(500).json({ success: false, error: err.message || "error" });
  }
});

// Customer-facing one-click bind from quote packet email.
// Initiates bind and redirects directly to the BoldSign embedded sign URL.
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

    const signUrl = result.boldsign?.sendUrl || null;
    if (!signUrl) {
      return res
        .status(503)
        .send("Unable to start signature right now. Please reply to your quote email for help.");
    }

    return res.redirect(signUrl);
  } catch (err) {
    console.error("bind initiate redirect error:", err);
    return res
      .status(500)
      .send("Unable to start signature right now. Please reply to your quote email for help.");
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

