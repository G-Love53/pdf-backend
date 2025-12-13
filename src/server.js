// src/server.js
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { renderPdf } from "./pdf.js";
import { sendWithGmail } from "./email.js";
import enrichBarFormData from '../mapping/bar-data-enricher.js';

// --- LEG 2 / LEG 3 IMPORTS ---
import { processInbox } from "./quote-processor.js";
import { triggerCarrierBind } from "./bind-processor.js";
import { google } from 'googleapis';

const FILENAME_MAP = {
  Society_FieldNames: "Society-Supplement.pdf",
  BarAccord125: "ACORD-125.pdf",
  BarAccord126: "ACORD-126.pdf",
  BarAccord140: "ACORD-140.pdf",
  WCBarform: "WC-Application.pdf",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- INITIALIZE APP (Must be before routes) ---
const APP = express();
APP.use(express.json({ limit: "20mb" }));

// --- CORS ---
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

// --- Helper: Data Mapping ---
async function maybeMapData(templateName, rawData) {
  try {
    const mapPath = path.join(MAP_DIR, `${templateName}.json`);
    const mapping = JSON.parse(await fs.readFile(mapPath, "utf8"));
    const mapped = {};
    for (const [tplKey, formKey] of Object.entries(mapping)) {
      mapped[tplKey] = rawData?.[formKey] ?? "";
    }
    return { ...rawData, ...mapped };
  } catch {
    return rawData;
  }
}

// --- Helper: Render Bundle ---
async function renderBundleAndRespond({ templates, email }, res) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return res.status(400).json({ ok: false, error: "NO_TEMPLATES" });
  }

  const results = [];

  for (const t of templates) {
    const name = t.name;
    const htmlPath = path.join(TPL_DIR, name, "index.ejs");
    const cssPath  = path.join(TPL_DIR, name, "styles.css");
    const rawData  = t.data || {};
    const unified  = await maybeMapData(name, rawData);

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
      formData: email.formData,
      html: email.bodyHtml,
      attachments
    });
    return res.json({ ok: true, success: true, sent: true, count: attachments.length });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${attachments[0].filename}"`);
  res.send(attachments[0].buffer);
}

// --- Route: Render Bundle ---
APP.post("/render-bundle", async (req, res) => {
  try {
    await renderBundleAndRespond(req.body || {}, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Route: Submit Quote ---
APP.post("/submit-quote", async (req, res) => {
  try {
    let { formData = {}, segments = [], email } = req.body || {};
    formData = enrichBarFormData(formData);

    const templates = (segments || []).map((name) => ({
      name,
      filename: FILENAME_MAP[name] || `${name}.pdf`,
      data: formData,
    }));
    if (templates.length === 0) {
      return res.status(400).json({ ok: false, success: false, error: "NO_VALID_SEGMENTS" });
    }

    const defaultTo = process.env.CARRIER_EMAIL || process.env.GMAIL_USER;
    const emailBlock = email?.to?.length
      ? email
      : {
          to: [defaultTo].filter(Boolean),
          subject: `New Submission — ${formData.applicant_name || ""}`,
          formData: formData,
        };

    await renderBundleAndRespond({ templates, email: emailBlock }, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, success: false, error: e.message });
  }
});

// --- NEW LEG 2: Check Quotes Route ---
APP.post("/check-quotes", async (req, res) => {
  console.log("🤖 Robot Waking Up: Checking for new quotes...");

  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const serviceEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const impersonatedUser = (process.env.GMAIL_USER || "").trim();
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!serviceEmail || !impersonatedUser || !rawKey || !process.env.OPENAI_API_KEY) {
    console.error("❌ Error: Missing configuration for LEG 2.");
    return res.status(500).json({ ok: false, error: "Missing Env Vars (Google/OpenAI)" });
  }

  try {
    const jwtClient = new google.auth.JWT(
      serviceEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/gmail.modify'], 
      impersonatedUser 
    );

    await jwtClient.authorize();
    const result = await processInbox(jwtClient); 

    console.log("✅ Robot finished checking inbox.");
    return res.json({ ok: true, ...result });

  } catch (error) {
    const errMsg = error.message || String(error);
    console.error("❌ Robot Global Error:", errMsg);
    return res.status(500).json({ ok: false, error: "LEG 2 Failure: " + errMsg });
  }
});

// --- NEW LEG 3: Client Bind Acceptance Endpoint ---
APP.get("/bind-quote", async (req, res) => {
    const quoteId = req.query.id;
    if (!quoteId) return res.status(400).send("Quote ID is missing.");

    try {
        await triggerCarrierBind({ quoteId }); 

        const confirmationHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bar Insurance Bind Confirmed</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #f0fdf4; }
                    .container { background-color: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); max-width: 600px; margin: 0 auto; border-left: 5px solid #10b981; }
                    h1 { color: #10b981; }
                    p { color: #374151; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎉 Binding Accepted!</h1>
                    <p>Thank you! Your request to bind this Bar quote (ID: <b>${quoteId.substring(0, 8)}</b>) has been successfully recorded.</p>
                </div>
            </body>
            </html>
        `;
        res.status(200).send(confirmationHtml);
    } catch (e) {
        console.error(`BIND_FAILED for ID ${quoteId}:`, e);
        res.status(500).send("Error processing bind request.");
    }
});

// --- Start server ---
const PORT = process.env.PORT || 8080;
APP.listen(PORT, () => console.log(`PDF service listening on ${PORT}`));
