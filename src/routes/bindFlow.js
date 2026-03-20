import express from "express";
import {
  listReadyToBind,
  getBindDetails,
  initiateBind,
  resendBind,
  cancelBind,
} from "../services/bindService.js";

const router = express.Router();

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
    const details = await getBindDetails(req.params.quoteId);
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
    const { agent_id, payment_method, effective_date_override, agent_notes, signer_name, signer_email } =
      req.body || {};

    const result = await initiateBind({
      quoteId: req.params.quoteId,
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

router.post("/api/quotes/:quoteId/bind/resend", async (req, res) => {
  try {
    const { agent_id } = req.body || {};
    await resendBind({ quoteId: req.params.quoteId, agentId: agent_id });
    res.json({ success: true });
  } catch (err) {
    console.error("bind resend error:", err);
    res.status(500).json({ success: false, error: err.message || "error" });
  }
});

router.post("/api/quotes/:quoteId/bind/cancel", async (req, res) => {
  try {
    const { agent_id, reason } = req.body || {};
    await cancelBind({
      quoteId: req.params.quoteId,
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

