import express from "express";
import { listBusinessClasses } from "../config/coterieRegistry.js";
import {
  resolveIntakeSchema,
  listIntakeSchemasForSegment,
} from "../config/connectQuoteIntakeSchema.js";
import {
  processConnectQuoteIntake,
  loadCoterieSession,
} from "../services/coterieIntakeService.js";
import { getCoteriePublicConfig } from "../services/coterieService.js";
import {
  processCoterieBindPayment,
  processCoterieDemoFinalize,
} from "../services/coterieBindCompletion.js";

const router = express.Router();

/** Public config for ConnectQuote intake pages (Stripe pk only — safe for browser). */
router.get("/api/coterie/config", (_req, res) => {
  const cfg = getCoteriePublicConfig();
  return res.json({
    ok: true,
    stripePublishableKey: cfg.stripePublishableKey,
    sandbox: cfg.sandbox,
    demoFinalizeEnabled: cfg.demoFinalizeEnabled,
    paymentBindReady: cfg.paymentBindReady,
    apiBase: process.env.PUBLIC_API_BASE_URL || "https://cid-pdf-api.onrender.com",
  });
});

router.get("/api/coterie/registry/:segment", (req, res) => {
  const segment = String(req.params.segment || "").toLowerCase();
  return res.json({
    ok: true,
    segment,
    businessClasses: listBusinessClasses(segment),
    intakeSchemas: listIntakeSchemasForSegment(segment),
  });
});

router.get("/api/coterie/intake-schema/:segment/:businessClass", (req, res) => {
  const segment = String(req.params.segment || "").toLowerCase();
  const businessClass = String(req.params.businessClass || "").toLowerCase();
  const isOwner = req.query.is_owner !== "false" && req.query.is_owner !== "no";
  const schema = resolveIntakeSchema(segment, businessClass, {
    isOwner,
    state: req.query.state || null,
  });
  return res.json({ ok: true, schema });
});

router.post("/api/coterie/connectquote", async (req, res) => {
  try {
    const result = await processConnectQuoteIntake(req.body || {}, {
      origin: req.headers.origin,
      host: req.headers.host,
    });
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[coterie connectquote] error:", err);
    return res.status(500).json({
      ok: false,
      error: "CONNECTQUOTE_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.get("/api/coterie/session/:submissionPublicId", async (req, res) => {
  try {
    const session = await loadCoterieSession(req.params.submissionPublicId);
    if (!session) {
      return res.status(404).json({ ok: false, error: "SESSION_NOT_FOUND" });
    }
    return res.json({ ok: true, session });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** Bind after Stripe payment method (Coterie Stripe — not CID merchant). */
router.post("/api/coterie/bind", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await processCoterieBindPayment({
      submissionPublicId: body.submission_public_id,
      quoteId: body.quote_id || body.coterie_quote_id,
      stripeToken: body.stripe_token || body.stripeToken || body.token,
      stripePaymentMethodId:
        body.stripe_payment_method_id || body.payment_method_id,
      paymentPlan: body.payment_plan || "Annual",
      contactEmail:
        body.contact_email || body.contactEmail || body.email || null,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[coterie bind] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** Sandbox-only: finalize policy without live bind (investor demo). */
router.post("/api/coterie/demo-finalize", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await processCoterieDemoFinalize({
      submissionPublicId: body.submission_public_id,
      quoteId: body.quote_id,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[coterie demo-finalize] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
