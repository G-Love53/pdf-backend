import express from "express";
import path from "path";
import {
  LOGO_PATH,
  isResumeToken,
} from "../services/readyToBindLeaveBehind.js";
import {
  readReadyToBindPage,
  sendReadyToBindCode,
  verifyReadyToBindCode,
} from "../services/readyToBindJob.js";

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
}

router.get("/q-assets/cid-logo.png", (_req, res) => {
  res.type("png");
  res.sendFile(path.resolve(LOGO_PATH));
});

router.get("/q/:token", async (req, res) => {
  noStore(res);
  try {
    const result = await readReadyToBindPage(req.params.token, {
      proof: req.query.proof,
    });
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[readyToBind] page:", err?.message || err);
    res.status(500).type("html").send("This quote link is not valid.");
  }
});

router.post("/q/:token/code", async (req, res) => {
  noStore(res);
  if (!isResumeToken(req.params.token)) {
    return res.status(404).type("html").send("This quote link is not valid.");
  }
  try {
    const result = await sendReadyToBindCode(req.params.token);
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[readyToBind] code:", err?.message || err);
    res.status(500).type("html").send("This quote link is not valid.");
  }
});

router.post("/q/:token/verify", async (req, res) => {
  noStore(res);
  if (!isResumeToken(req.params.token)) {
    return res.status(404).type("html").send("This quote link is not valid.");
  }
  try {
    const result = await verifyReadyToBindCode(req.params.token, req.body?.code);
    if (result.proof) {
      return res.redirect(303, `/q/${encodeURIComponent(req.params.token)}?proof=${encodeURIComponent(result.proof)}`);
    }
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[readyToBind] verify:", err?.message || err);
    res.status(500).type("html").send("This quote link is not valid.");
  }
});

export default router;
