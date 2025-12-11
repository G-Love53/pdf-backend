// src/server.js
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { renderPdf } from "./pdf.js";           // <- make sure this is your actual renderer
import { sendWithGmail } from "./email.js";
import enrichBarFormData from '../mapping/bar-data-enricher.js';

// --- LEG 2 / LEG 3 IMPORTS ADDED ---
import { processInbox } from "./quote-processor.js";
import { triggerCarrierBind } from "./bind-processor.js";
import { google } from 'googleapis'; // Imported here for the JWT client in /check-quotes
// -----------------------------------


const FILENAME_MAP = {
  Society_FieldNames: "Society-Supplement.pdf",
  BarAccord125: "ACORD-125.pdf",
  BarAccord126: "ACORD-126.pdf",
  BarAccord140: "ACORD-140.pdf",
  WCBarform: "WC-Application.pdf",
};

// ... existing path definitions, APP setup, CORS, and helper functions (maybeMapData, renderBundleAndRespond) ...

// --- Health check ---
APP.get("/healthz", (_req, res) => res.status(200).send("ok"));

// *** EXISTING LEG 1 ROUTES (/render-bundle, /submit-quote) REMAIN UNCHANGED ***

// --- NEW LEG 2: Check Quotes Route ---
APP.post("/check-quotes", async (req, res) => {
  console.log("🤖 Robot Waking Up: Checking for new quotes...");

  // 1. Read Credentials
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const serviceEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const impersonatedUser = (process.env.GMAIL_USER || "").trim();
  const privateKey = rawKey.replace(/\\n/g, '\n'); // Fix for Render newline issues

  // 2. Safety Checks
  if (!serviceEmail || !impersonatedUser || !rawKey || !process.env.OPENAI_API_KEY) {
    console.error("❌ Error: Missing configuration for LEG 2.");
    return res.status(500).json({ ok: false, error: "Missing Env Vars (Google/OpenAI)" });
  }

  try {
    // 3. Connect to Google (WITH IMPERSONATION)
    const jwtClient = new google.auth.JWT(
      serviceEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/gmail.modify'], 
      impersonatedUser 
    );

    // 4. Authorize and Run the Processor
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
    // 1. Capture the unique ID from the URL query string
    const quoteId = req.query.id;

    if (!quoteId) {
        return res.status(400).send("Quote ID is missing. Please contact support.");
    }

    try {
        // 2. Call the binding processor (LEG 3 Handoff)
        await triggerCarrierBind({ quoteId }); 

        // 3. Respond to the client with a confirmation page
        const confirmationHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bar Insurance Bind Confirmed</title>
                </head>
            <body>
                <div class="container">
                    <h1>🎉 Binding Accepted!</h1>
                    <p>Thank you! Your request to bind this Bar quote (ID: <b>${quoteId.substring(0, 8)}</b>) has been successfully recorded.</p>
                    <p>We are now preparing the final documents and processing payment. Your Certificate of Insurance will arrive shortly.</p>
                </div>
            </body>
            </html>
        `;
        res.status(200).send(confirmationHtml);
        
    } catch (e) {
        console.error(`BIND_FAILED for ID ${quoteId}:`, e);
        res.status(500).send("An error occurred during the binding process. Please contact support immediately.");
    }
});


// --- Start server ---
const PORT = process.env.PORT || 8080;
APP.listen(PORT, () => console.log(`PDF service listening on ${PORT}`));
