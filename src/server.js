import fsSync from "fs";
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { renderPdf } from "./pdf.js";
import { sendWithGmail } from "./email.js";
// Note: Ensure your enricher import matches the file name in your 'src' folder
// import enrichFormData from '../mapping/data-enricher.js'; 

// --- LEG 2 / LEG 3 IMPORTS ---
import { processInbox } from "./quote-processor.js";
import { triggerCarrierBind } from "./bind-processor.js";
import { google } from 'googleapis';

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
  "SUPP_SOCIETY_BAR": "SUPP_SOCIETY_BAR",

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
  "SUPP_SOCIETY_BAR": "Supplemental-Application.pdf",
};


/* ============================================================
   🔴 SECTION 2: LOGIC (DO NOT EDIT BELOW THIS LINE)
   ============================================================ */

const resolveTemplate = (name) => TEMPLATE_ALIASES[name] || name;

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

const PROJECT_ROOT = path.join(__dirname, ".."); // /app

function resolveTemplateDir(name) {
  const key = String(name || "").trim();
  const form = FORMS[key];
  if (!form || !form.templatePath) throw new Error(`UNKNOWN_FORM: ${key}`);

  return path.join(PROJECT_ROOT, form.templatePath);
}


// --- ROUTES ---

APP.get("/healthz", (_req, res) => res.status(200).send("ok"));
APP.get("/", (_req, res) => res.status(200).send("ok"));

APP.get("/__version", (_req, res) => {
  res.json({
    ok: true,
    service: "pdf-backend",
    commit: process.env.RENDER_GIT_COMMIT || null
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

// Safety check: verify folder exists
    try {
        await fs.access(resolveTemplateDir(name));
    } catch (e) {
        console.error(`❌ Template folder not found: ${name} (Original: ${original})`);
        results.push({ status: "rejected", reason: `Template ${name} not found` });
        continue;
    }

    const templateDir = resolveTemplateDir(name);
    const htmlPath = path.join(templateDir, "index.ejs");
    const cssPath = path.join(PROJECT_ROOT, "CID_HomeBase", "templates", "_SHARED", "styles.css");
    const rawData  = t.data || {};
    const unified  = await maybeMapData(name, rawData);

    try {
      const buffer = await renderPdf({ htmlPath, cssPath, data: unified });
      const prettyName = FILENAME_MAP[name] || t.filename || `${name}.pdf`;
      results.push({ status: "fulfilled", value: { filename: prettyName, buffer } });
    } catch (err) {
      console.error(`❌ Render Error for ${name}:`, err.message);
      results.push({ status: "rejected", reason: err });
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

    // Allow calling by bundle_id (no templates array needed)
    if ((!Array.isArray(body.templates) || body.templates.length === 0) && body.bundle_id) {
      const bundlesPath = path.join(__dirname, "config", "bundles.json");
      const bundles = JSON.parse(fsSync.readFileSync(bundlesPath, "utf8"));

      const list = bundles[body.bundle_id];
      if (!Array.isArray(list) || list.length === 0) {
        return res.status(400).json({ ok: false, error: "UNKNOWN_BUNDLE" });
      }

      const data = body.data || {};
      body.templates = list.map((name) => ({ name, data }));
    }

    await renderBundleAndRespond(body, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Submit Quote Endpoint (LEG 1) — CID RSS CANONICAL
APP.post("/submit-quote", async (req, res) => {
  try {
    const body = req.body || {};
    const formData = body.formData || {};
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


// 3. LEG 2: Check Quotes
APP.post("/check-quotes", async (req, res) => {
  console.log("🤖 Robot Waking Up: Checking for new quotes...");
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const serviceEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const impersonatedUser = (process.env.GMAIL_USER || "").trim();
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!serviceEmail || !impersonatedUser || !rawKey || !process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "Missing Env Vars" });
  }

  try {
    const jwtClient = new google.auth.JWT(
      serviceEmail, null, privateKey,
      ['https://www.googleapis.com/auth/gmail.modify'], impersonatedUser 
    );
    await jwtClient.authorize();
    const result = await processInbox(jwtClient); 
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("Robot Error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 4. LEG 3: Bind Quote
APP.get("/bind-quote", async (req, res) => {
    const quoteId = req.query.id;
    if (!quoteId) return res.status(400).send("Quote ID is missing.");
    try {
        await triggerCarrierBind({ quoteId }); 
        const confirmationHtml = `
            <!DOCTYPE html>
            <html><head><title>Bind Request Received</title></head>
            <body style="text-align:center; padding:50px; font-family:sans-serif;">
                <h1 style="color:#10b981;">Bind Request Received</h1>
                <p>We are processing your request for Quote ID: <b>${quoteId.substring(0,8)}</b>.</p>
            </body></html>`;
        res.status(200).send(confirmationHtml);
    } catch (e) {
        res.status(500).send("Error processing bind request.");
    }
});

const PORT = process.env.PORT || 8080;
APP.listen(PORT, () => console.log(`PDF service listening on ${PORT}`));


