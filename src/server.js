// src/server.js
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { renderPdf } from "./pdf.js";           // <- make sure this is your actual renderer
import { sendWithGmail } from "./email.js";
import enrichBarFormData from '../mapping/bar-data-enricher.js';

const FILENAME_MAP = {
  Society_FieldNames: "Society-Supplement.pdf",
  BarAccord125: "ACORD-125.pdf",
  BarAccord126: "ACORD-126.pdf",
  BarAccord140: "ACORD-140.pdf",
  WCBarform: "WC-Application.pdf",
  
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const APP = express();
APP.use(express.json({ limit: "20mb" }));

// CORS
APP.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
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
// --- Optional: apply mapping/<template>.json if present (NON-DESTRUCTIVE) ---
async function maybeMapData(templateName, rawData) {
  try {
    const mapPath = path.join(MAP_DIR, `${templateName}.json`);
    const mapping = JSON.parse(await fs.readFile(mapPath, "utf8"));

    // Build only the mapped keys...
    const mapped = {};
    for (const [tplKey, formKey] of Object.entries(mapping)) {
      mapped[tplKey] = rawData?.[formKey] ?? "";
    }

    // ...then merge over the original data so NOTHING gets dropped.
    // Templates can use either the original field names or the mapped aliases.
    return { ...rawData, ...mapped };
  } catch {
    // No mapping file? Just pass the raw form data through.
    return rawData;
  }
}


// --- Core: render all PDFs (strict, sequential) and optionally email ---
async function renderBundleAndRespond({ templates, email }, res) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return res.status(400).json({ ok: false, error: "NO_TEMPLATES" });
  }

  const results = []; // single declaration ONLY

  // Render templates sequentially (stable & low-memory)
  for (const t of templates) {
    const name     = t.name;
    const htmlPath = path.join(TPL_DIR, name, "index.ejs");
    const cssPath  = path.join(TPL_DIR, name, "styles.css");
    const rawData  = t.data || {};
    const unified  = await maybeMapData(name, rawData); // mapping enabled

    try {
      const buffer = await renderPdf({ htmlPath, cssPath, data: unified });
      const prettyName = FILENAME_MAP[name] || t.filename || `${name}.pdf`;
      results.push({ status: "fulfilled", value: { filename: prettyName, buffer } });
    } catch (err) {
      results.push({ status: "rejected", reason: err });
    }
  }

  const failures = results.filter(r => r.status === "rejected");
  if (failures.length) {
    console.error("RENDER_FAILURES", failures.map(f => String(f.reason)));
    return res.status(500).json({
      ok: false,
      success: false,
      error: "ONE_OR_MORE_ATTACHMENTS_FAILED",
      failedCount: failures.length
    });
  }

  const attachments = results.map(r => r.value);

  if (email?.to?.length) {
  await sendWithGmail({
    to: email.to,
    subject: email.subject || "Submission Packet",
    formData: email.formData,  // Pass formData for formatted email
    html: email.bodyHtml,       // Fallback if no formData
    attachments
  });
    return res.json({ ok: true, success: true, sent: true, count: attachments.length });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${attachments[0].filename}"`);
  res.send(attachments[0].buffer);
}


// --- Public routes ---

// JSON API: { templates:[{name,filename?,data}], email? }
APP.post("/render-bundle", async (req, res) => {
  try {
    await renderBundleAndRespond(req.body || {}, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Back-compat: { formData, segments[], email? }
APP.post("/submit-quote", async (req, res) => {
  try {
    let { formData = {}, segments = [], email } = req.body || {};
    formData = enrichBarFormData(formData);

    // Build from front-end `segments` (folder names must match)
    const templates = (segments || []).map((name) => ({
      name,
      filename: FILENAME_MAP[name] || `${name}.pdf`,
      data: formData,
    }));
    if (templates.length === 0) {
      return res.status(400).json({ ok: false, success: false, error: "NO_VALID_SEGMENTS" });
    }

    // Default email (so /submit-quote responds JSON, not a PDF stream)
const defaultTo = process.env.CARRIER_EMAIL || process.env.GMAIL_USER;
const emailBlock = email?.to?.length
  ? email
  : {
      to: [defaultTo].filter(Boolean),
      subject: `New Submission — ${formData.applicant_name || ""}`,
      formData: formData,  // Pass formData instead of bodyHtml
    };

await renderBundleAndRespond({ templates, email: emailBlock }, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, success: false, error: e.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 8080;
APP.listen(PORT, () => console.log(`PDF service listening on ${PORT}`));

