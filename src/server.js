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

// Helper: Data Mapping — add ACORD-expected keys from Bar form so ACORD PDFs fill
async function maybeMapData(name, rawData) {
  const d = { ...rawData };
  const get = (k) => (d[k] != null && d[k] !== "") ? d[k] : undefined;
  if (/^ACORD\d+$/i.test(name)) {
    if (get("insured_name") == null && get("applicant_name")) d.insured_name = d.applicant_name;
    if (get("physical_address_1") == null && get("premises_address")) d.physical_address_1 = d.premises_address;
    if (get("physical_address_1") == null && get("premise_address")) d.physical_address_1 = d.premise_address;
    if (get("physical_city") == null && get("premise_city")) d.physical_city = d.premise_city;
    if (get("physical_state") == null && get("premise_state")) d.physical_state = d.premise_state;
    if (get("physical_zip") == null && get("premise_zip")) d.physical_zip = d.premise_zip;
    if (get("date") == null && get("effective_date")) d.date = d.effective_date;
    if (get("policy_effective_date") == null && get("effective_date")) d.policy_effective_date = d.effective_date;
    if (get("business_website") == null && get("premises_website")) d.business_website = d.premises_website;
    if (get("producer_email") == null && get("contact_email")) d.producer_email = d.contact_email;
    if (get("producer_phone") == null && get("business_phone")) d.producer_phone = d.business_phone;
    if (d.org_type_llc === "Yes") d.llc = "Yes";
    if (d.org_type_corporation === "Yes") d.corporation = "Yes";
    if (d.org_type_individual === "Yes") d.individual = "Yes";
    // ACORD125 page-2 first location
    if (get("premise_address_1") == null && get("premises_address")) d.premise_address_1 = d.premises_address;
    if (get("premise_city_1") == null && get("premise_city")) d.premise_city_1 = d.premise_city;
    if (get("contact_name") == null && get("applicant_name")) d.contact_name = d.applicant_name;
    if (get("contact_email_1") == null && get("contact_email")) d.contact_email_1 = d.contact_email;
    if (get("contact_business_phone") == null && get("business_phone")) d.contact_business_phone = d.business_phone;
    if (get("annual_revenue_1") == null && get("total_sales")) d.annual_revenue_1 = d.total_sales;
    if (get("total_squarefeet_1") == null && get("square_footage")) d.total_squarefeet_1 = d.square_footage;
    // Additional Insured (Bar form → ACORD names; first AI block)
    if (get("ai_name") == null && get("ai_name_1")) d.ai_name = d.ai_name_1;
    if (get("ai_address") == null && get("ai_address_1")) d.ai_address = d.ai_address_1;
    if (get("ai_city") == null && get("ai_city_1")) d.ai_city = d.ai_city_1;
    if (get("ai_state") == null && get("ai_state_1")) d.ai_state = d.ai_state_1;
    if (get("ai_zip") == null && get("ai_zip_1")) d.ai_zip = d.ai_zip_1;
    if (get("ai_losspayee") == null && get("ai_loss_payee")) d.ai_losspayee = d.ai_loss_payee;
    if (get("ai_lienholder") == null && get("ai_lienholder")) d.ai_lienholder = d.ai_lienholder;
    if (get("ai_mortgage") == null && get("ai_mortgagee")) d.ai_mortgage = d.ai_mortgagee;
    if (get("ai_insured") == null && get("ai_additional_insured")) d.ai_insured = d.ai_additional_insured;
    // Smoker/grill notes (SUPP page-2 continuation; build from form if not provided)
    if (get("smoker_grill_notes_cont") == null && get("solid_fuel_smoker_grill_within_10_ft") === "Yes") {
      const parts = [];
      if (d.unit_professionally_installed) parts.push("Professionally installed: " + d.unit_professionally_installed);
      if (d.regularly_maintained) parts.push("Regularly maintained: " + d.regularly_maintained);
      if (d.hood_duct_protection) parts.push("Hood/duct: " + d.hood_duct_protection);
      if (d.class_k_or_2a_extinguisher_within_20_ft) parts.push("Class K/2A extinguisher: " + d.class_k_or_2a_extinguisher_within_20_ft);
      if (parts.length) d.smoker_grill_notes_cont = parts.join("; ");
    }
  }
  return d;
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

// RSS: backend sets segment from env; template name drives form_id (must match forms.json keys).
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
      // Legacy: map old segment names to canonical template names (forms.json keys)
      const LEGACY_SEGMENT_MAP = {
        SOCIETY_FIELDNAMES: "SUPP_BAR",
        BARACCORD125: "ACORD125",
        BARACCORD126: "ACORD126",
        BARACCORD130: "ACORD130",
        BARACCORD140: "ACORD140",
      };
      templateNames = segments
        .map((s) => (LEGACY_SEGMENT_MAP[String(s || "").toUpperCase()] || String(s || "").trim()))
        .filter((name) => {
          const key = /^ACORD\d+$/i.test(name) ? name.toUpperCase() : name.toUpperCase();
          return FORMS[key]; // drop WCBARFORM and any other unknown
        });
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


