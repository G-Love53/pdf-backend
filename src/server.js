// src/server.js
import express from "express";
import { normalizeBar125 } from "../mapping/normalizeBar125.js";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { renderPdf } from "./pdf.js";           // <- make sure this is your actual renderer
import { sendWithGmail } from "./email.js";
import helpers from "../utils/helpers.js";      // <- shared yn/money etc. used by EJS templates

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
      const cssPath  = path.join(TPL_DIR, name, "styles.css");

      // Source data from request
      const rawData = t.data || {};

      // Normalize/mapping per template
      let unified;
      if (name === "BarAccord125") {
        // 125 uses a schema normalizer
        unified = normalizeBar125(rawData);
      } else {
        // others may optionally have mapping/<name>.json
        unified = await maybeMapData(name, rawData);
      }

      // Render (pass helpers so templates can call helpers.yn / helpers.money)
      const buffer = await renderPdf(htmlPath, cssPath, name, { data: unified, helpers });

      const prettyName = FILENAME_MAP[name] || t.filename || `${name}.pdf`;
      return { filename: prettyName, buffer };
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length) {
    console.error("RENDER_FAILURES", failures.map((f) => String(f.reason)));
    return res.status(500).json({
      ok: false,
      success: false,
      error: "ONE_OR_MORE_ATTACHMENTS_FAILED",
      failedCount: failures.length,
    });
  }

  const attachments = results.map((r) => r.value);

  if (email?.to?.length) {
    await sendWithGmail({
      to: email.to,
      subject: email.subject || "Submission Packet",
      html: email.bodyHtml || "<p>Attachments included.</p>",
      attachments,
    });
    return res.json({ ok: true, success: true, sent: true, count: attachments.length });
  }

  // Non-email test path: stream first PDF
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
    const { formData = {}, segments = [], email } = req.body || {};

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
          subject: `New Submission – ${formData.applicant_name || ""}`,
          bodyHtml: "<p>Quote packet attached.</p>",
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

