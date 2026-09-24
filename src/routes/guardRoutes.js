import express from "express";
import {
  getGuardOfferConfig,
  processGuardBind,
  processGuardIndicate,
  processGuardQuestions,
  processGuardQuote,
  processGuardRefer,
} from "../services/guardIntakeService.js";
import {
  getGuardWcRegistry,
  isGuardPartnerTestEnabled,
  startGuardPartnerTest,
  verifyGuardPartnerTestToken,
} from "../services/guardPartnerTestService.js";
import { runGuardUatCase, runGuardUatPack } from "../services/guardUatService.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = express.Router();

function partnerTestGate(req, res, next) {
  if (!isGuardPartnerTestEnabled()) {
    return res.status(404).json({
      ok: false,
      error: "PARTNER_TEST_DISABLED",
      message: "GUARD partner test is not enabled on this service.",
    });
  }
  if (!verifyGuardPartnerTestToken(req)) {
    return res.status(401).json({
      ok: false,
      error: "PARTNER_TEST_UNAUTHORIZED",
      message: "Invalid or missing partner test token.",
    });
  }
  return next();
}

router.get("/api/guard/wc/registry", partnerTestGate, (req, res) => {
  const state = req.query.state || "CO";
  return res.json(getGuardWcRegistry(state));
});

function loadUatCases() {
  const path = join(__dirname, "../../data/guard-uat-cases-v1.json");
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  return data.cases || [];
}

router.post("/api/guard/wc/uat/run", partnerTestGate, async (req, res) => {
  try {
    const body = req.body || {};
    const cases = body.cases?.length ? body.cases : loadUatCases();
    const result = await runGuardUatPack(cases, {
      limit: body.limit ?? null,
      ids: body.ids ?? null,
    });
    return res.json(result);
  } catch (err) {
    console.error("[guard uat run] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_UAT_RUN_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.post("/api/guard/wc/uat/run-case", partnerTestGate, async (req, res) => {
  try {
    const caseDef = req.body?.case || req.body;
    if (!caseDef?.id && !caseDef?.classCode) {
      return res.status(400).json({
        ok: false,
        error: "CASE_REQUIRED",
        message: "Provide a UAT case object with id or classCode.",
      });
    }
    const result = await runGuardUatCase(caseDef);
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    console.error("[guard uat run-case] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_UAT_CASE_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.post("/api/guard/wc/partner/start", partnerTestGate, async (req, res) => {
  try {
    const result = await startGuardPartnerTest(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[guard partner start] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_PARTNER_START_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.get("/api/guard/wc/config", (req, res) => {
  const segment = String(req.query.segment || "").toLowerCase();
  const state = req.query.state || "CO";
  return res.json(getGuardOfferConfig(segment, state));
});

router.post("/api/guard/wc/indicate", async (req, res) => {
  try {
    const result = await processGuardIndicate(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[guard indicate] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_INDICATE_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.post("/api/guard/wc/questions", async (req, res) => {
  try {
    const result = await processGuardQuestions(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[guard questions] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_QUESTIONS_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.post("/api/guard/wc/quote", async (req, res) => {
  try {
    const result = await processGuardQuote(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[guard quote] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_QUOTE_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.post("/api/guard/wc/bind", async (req, res) => {
  try {
    const result = await processGuardBind(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[guard bind] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_BIND_ERROR",
      message: err.message || "Internal error",
    });
  }
});

router.post("/api/guard/wc/refer", async (req, res) => {
  try {
    const result = await processGuardRefer(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[guard refer] error:", err);
    return res.status(500).json({
      ok: false,
      error: "GUARD_REFER_ERROR",
      message: err.message || "Internal error",
    });
  }
});

export default router;
