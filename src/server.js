import fsSync from "fs";
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { generateDocument } from "./generators/index.js";
import { sendWithGmail } from "./email.js";
// Note: Ensure your enricher import matches the file name in your 'src' folder
// import enrichFormData from '../mapping/data-enricher.js'; 

// --- LEG 2 / LEG 3 IMPORTS ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CID RSS: load universal forms registry
const formsPath = path.join(__dirname, "config", "forms.json");
const FORMS = JSON.parse(fsSync.readFileSync(formsPath, "utf8"));

/* ============================================================
   🟢 SECTION 1: CONFIGURATION (EDIT THIS PER SEGMENT)
   ============================================================ */

// 1. Map Frontend Names (from Netlify) to Actual Folder Names (in /templates)
const TEMPLATE_ALIASES = {
  // Canonical ACORD names
  "ACORD125": "ACORD125",
  "ACORD126": "ACORD126",
  "ACORD130": "ACORD130",
  "ACORD140": "ACORD140",
  "ACORD25":  "ACORD25",

  // Supplemental (segment-specific)
  "SUPP_BAR": "SUPP_BAR",

  // Backward compatibility (optional but safe)
  "Accord125": "ACORD125",
  "Accord126": "ACORD126",
  "Accord130": "ACORD130",
  "Accord140": "ACORD140",
  "Accord25":  "ACORD25",
};

// 2. Map Folder Names to Pretty Output Filenames (for the client email)
const FILENAME_MAP = {
  "ACORD125": "ACORD-125.pdf",
  "ACORD126": "ACORD-126.pdf",
  "ACORD130": "ACORD-130.pdf",
  "ACORD140": "ACORD-140.pdf",
  "ACORD25":  "ACORD-25.pdf",
  "SUPP_BAR": "Supplemental-Application.pdf",
};


/* ============================================================
   🔴 SECTION 2: LOGIC (DO NOT EDIT BELOW THIS LINE)
   ============================================================ */

const resolveTemplate = (name) =>
  String(name || "").trim().toUpperCase();

// --- APP SETUP ---
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

// RSS ROOT: always /app in Render Docker (and correct locally too)
const PROJECT_ROOT = process.cwd();
const TPL_DIR = path.join(PROJECT_ROOT, "CID_HomeBase", "templates");


function resolveTemplateDir(name) {
  const key = String(name || "").trim().toUpperCase();
  if (!FORMS[key]) throw new Error(`UNKNOWN_FORM: ${key}`);

  return path.join(TPL_DIR, key);
}
// RSS: flatten all common request shapes into a single overlay object
function flattenData(body = {}) {
  const rr = body.requestRow || {};
  return {
    ...(body || {}),
    ...(rr || {}),
    ...(body.data || {}),
    ...(body.fields || {}),
    ...(rr.data || {}),
    ...(rr.fields || {}),
    ...(rr.requestRow || {}),
  };
}

// --- ROUTES ---

APP.get("/healthz", (_req, res) => res.status(200).send("ok"));
APP.get("/", (_req, res) => res.status(200).send("ok"));

APP.get("/__version", (_req, res) => {
  res.json({
    ok: true,
    service: "pdf-backend",
    commit: process.env.RENDER_GIT_COMMIT || null,
    fingerprint: "CID-PDF-BACKEND-2026-02-12",
    node: process.version,
    time: new Date().toISOString(),
  });
});

// Helper: Data Mapping
async function maybeMapData(name, rawData) {
  return rawData;
}

// Helper: Render Bundle
async function renderBundleAndRespond({ templates, email }, res) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return res.status(400).json({ ok: false, error: "NO_TEMPLATES" });
  }

  const results = [];

  for (const t of templates) {
    const original = String(t.name || "").trim();
    const name = resolveTemplate(original);

// Resolve once
const rawData = t.data || {};
const unified = await maybeMapData(name, rawData);

// GOLD STANDARD (Step 1): backend sets segment; template name drives form_id.
// (Step 2 we’ll lift Roofer’s exact formIdForTemplateFolder().)
unified.segment = String(process.env.SEGMENT || "bar").trim().toLowerCase();
// form_id must match forms.json resolution rules
if (/^ACORD\d+$/i.test(name)) {
  unified.form_id = name.toLowerCase();      // ACORD125 -> acord125
} else {
  unified.form_id = name.toUpperCase();      // SUPP_BAR -> SUPP_BAR, LESSOR_A129S -> LESSOR_A129S
}


try {
  const { buffer } = await generateDocument(unified);
  const prettyName = FILENAME_MAP[name] || t.filename || `${name}.pdf`;
  results.push({ status: "fulfilled", value: { filename: prettyName, buffer, contentType: "application/pdf" } });
} catch (err) {
  console.error(`❌ Render Error for ${name}:`, err.message);
  results.push({ status: "rejected", reason: err?.message || String(err) });
}

  }

  const attachments = results.filter(r => r.status === "fulfilled").map(r => r.value);

  if (email?.to?.length) {
    await sendWithGmail({
      to: email.to,
      subject: email.subject || "Submission Packet",
      formData: email.formData,
      html: email.bodyHtml,
      attachments
    });
    return res.json({ ok: true, success: true, sent: true, count: attachments.length });
  }

  if (attachments.length > 0) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${attachments[0].filename}"`);
      res.send(attachments[0].buffer);
  } else {
      res.status(500).send("No valid PDFs were generated.");
  }
}

// 1. Render Bundle Endpoint (render-only)
APP.post("/render-bundle", async (req, res) => {
  try {
    const body = req.body || {};

    // Accept either templates[] OR bundle_id (+ data/formData)
    if ((!Array.isArray(body.templates) || body.templates.length === 0) && body.bundle_id) {
      const bundlesPath = path.join(__dirname, "config", "bundles.json");
      const formsPath = path.join(__dirname, "config", "forms.json");

      const bundles = JSON.parse(fsSync.readFileSync(bundlesPath, "utf8"));
      const forms = JSON.parse(fsSync.readFileSync(formsPath, "utf8"));

      const list = bundles[body.bundle_id];
      if (!Array.isArray(list) || list.length === 0) {
        return res.status(400).json({ ok: false, error: "UNKNOWN_BUNDLE" });
      }

      const mergedData = (body.formData && typeof body.formData === "object") ? body.formData
        : (body.data && typeof body.data === "object") ? body.data
        : {};

      body.templates = list
        .filter((name) => forms[name]?.enabled !== false)
        .map((name) => ({ name, data: mergedData }));
    }

    await renderBundleAndRespond(body, res);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// Submit Quote Endpoint (LEG 1) — CID RSS CANONICAL
APP.post("/submit-quote", async (req, res) => {
  try {
    const body = req.body || {};
    const formData =
    body.data ||
    body.formData ||
    body.fields ||
    body.requestRow?.data ||
    body.requestRow?.fields ||
    body.requestRow ||
    {};
    const bundle_id = body.bundle_id;
    const segments = Array.isArray(body.segments) ? body.segments : [];
    const segment = String(body.segment || process.env.SEGMENT || "").trim().toLowerCase();

    // 1) Resolve template list from bundle_id (preferred) OR segments[] (legacy)
    let templateNames = [];

    if (bundle_id) {
      const bundlesPath = path.join(__dirname, "config", "bundles.json");
      const bundles = JSON.parse(fsSync.readFileSync(bundlesPath, "utf8"));
      const list = bundles[bundle_id];

      if (!Array.isArray(list) || list.length === 0) {
        return res.status(400).json({ ok: false, success: false, error: "UNKNOWN_BUNDLE" });
      }

      templateNames = list;
    } else {
      templateNames = segments;
    }

    if (!templateNames.length) {
      return res.status(400).json({ ok: false, success: false, error: "NO_VALID_SEGMENTS" });
    }

    // 2) Build templates[] for renderBundleAndRespond
    const templates = templateNames.map((name) => {
      const resolved = resolveTemplate(name); // keeps your aliasing logic consistent
      return {
        name,
        filename: FILENAME_MAP[resolved] || `${name}.pdf`,
        data: formData,
      };
    });

    // 3) Email block (canonical)
    const defaultTo = process.env.CARRIER_EMAIL || process.env.GMAIL_USER;
    const to =
      body.email?.to?.length ? body.email.to
      : body.email_to ? [body.email_to] // optional backward compat
      : [defaultTo].filter(Boolean);

    const applicant = (formData.applicant_name || formData.insured_name || "").trim();
    const segLabel = segment ? segment.toUpperCase() : "CID";
    const subject =
      body.email?.subject?.trim()
      || `CID Submission Packet — ${segLabel}${applicant ? " — " + applicant : ""}`;

    const emailBlock = {
      to,
      subject,
      formData,
      ...((body.email && typeof body.email === "object") ? body.email : {}),
      to,       // ensure canonical wins
      subject,  // ensure canonical wins
      formData, // ensure canonical wins
    };

    // 4) One call does it all (render + attach + email)
    await renderBundleAndRespond({ templates, email: emailBlock }, res);
  } catch (e) {
    res.status(500).json({ ok: false, success: false, error: e.message });
  }
});


const PORT = process.env.PORT || 8080;
APP.listen(PORT, () => console.log(`PDF service listening on ${PORT}`));


