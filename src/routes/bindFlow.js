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
// BoldSign emails the signer; we show a short confirmation page (no iframe redirect).
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

    await initiateBind({
      quoteId,
      agentId: null,
      paymentMethod: "annual",
      effectiveDateOverride: null,
      agentNotes: "initiated_via_quote_email",
      signerName,
      signerEmail,
    });

    const safeEmail = String(signerEmail || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return res
      .status(200)
      .type("html")
      .send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Signature request sent</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1.2rem;line-height:1.5;color:#111827;}
h1{font-size:1.25rem;} p{color:#374151;} .muted{font-size:14px;color:#6b7280;margin-top:1.5rem;}</style></head>
<body>
<h1>Check your email</h1>
<p>We sent a signature request to <strong>${safeEmail}</strong> via our e-sign provider. Use that message to open and sign your bind confirmation.</p>
<p class="muted">If you don&rsquo;t see it in a few minutes, check spam or contact the address shown in your quote email.</p>
</body></html>`);
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

