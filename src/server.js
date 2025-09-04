// src/server.js
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { renderPdf } from "./pdf.js";
import { sendWithGmail } from "./email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP = express();
APP.use(express.json({ limit: "20mb" }));

// --- CORS (so Netlify forms / browser can POST directly) ---
APP.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- Directories ---
const TPL_DIR = path.join(__dirname, "..", "templates");
const MAP_DIR = path.join(__dirname, "..", "mapping");

// --- Health check ---
APP.get("/healthz", (_req, res) => res.status(200).send("ok"));

// --- Optional: apply mapping/<template>.json if present ---
async function maybeMapData(templateName, rawData) {
  try {
    const mapPath = path.join(MAP_DIR, `${templateName}.json`);
    const mapping = JSON.parse(await fs.readFile(mapPath, "utf8"));
    const out = {};
    for (const [tplKey, formKey] of Object.entries(mapping)) {
      out[tplKey] = rawData?.[formKey] ?? "";
    }
    return out;
  } catch {
    return rawData; // no mapping file -> pass-through
  }
}

// --- Core: render all PDFs (strict) and optionally email ---
async function renderBundleAndRespond({ templates, email }, res) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return res.status(400).json({ ok: false, error: "NO_TEMPLATES" });
  }

  const results = await Promise.allSettled(
    templates.map(async (t) => {
      const name = t.name;
      const htmlPath = path.join(TPL_DIR, name, "index.ejs");
      const cssPath = path.join(TPL_DIR, name, "styles.css");
      const data = await maybeMapData(name, t.data || {});
      const buffer = await renderPdf({ htmlPath, cssPath, data });
      return { filename: t.filename || `${name}.pdf`, buffer };
    })
  );

  const failures = results.filter(r => r.status === "rejected");
  if (failures.length) {
    console.error("RENDER_FAILURES", failures.map(f => String(f.reason)));
    return res
      .status(500)
      .json({ ok: false, error: "ONE_OR_MORE_ATTACHMENTS_FAILED", failedCount: failures.length });
  }

  const attachments = results.map(r => r.value);

  if (email?.to?.length) {
    await sendWithGmail({
      to: email.to,
      subject: email.subject || "Submission Packet",
      html: email.bodyHtml || "<p>Attachments included.</p>",
      attachments
    });
    return res.json({ ok: true, sent: true, count: attachments.length });
  }

  // Non-email test path: stream first PDF
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${attachments[0].filename}"`);
  res.send(attachments[0].buffer);
}

// --- Public routes ---

// New JSON API (what we designed for): { templates:[{name,filename,data}], email? }
APP.post("/render-bundle", async (req, res) => {
  try {
    await renderBundleAndRespond(req.body || {}, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Back-compat for your existing forms (no HTML changes):
// Accepts: { formData: {...}, segments: ["Society_FieldNames","BarAccord125", ...], email? }
APP.post("/submit-quote", async (req, res) => {
  try {
    const { formData = {}, segments = [], email } = req.body || {};
    const templates = (segments || []).map((name) => ({
      name,                   // must match templates/<name>/ folder
      filename: `${name}.pdf`,
      data: formData
    }));
    await renderBundleAndRespond({ templates, email }, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 8080;
APP.listen(PORT, () => console.log(`PDF service listening on ${PORT}`));
