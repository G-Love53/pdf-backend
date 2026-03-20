const DEFAULT_API_BASE = "https://api.boldsign.com";

function getBoldSignApiKey() {
  const apiKey =
    process.env.BOLD_SIGN_API_KEY ||
    process.env.BOLDSIGN_API_KEY ||
    process.env.CID_BOLDSIGN_API_KEY ||
    null;
  if (!apiKey) {
    throw new Error(
      "BOLD_SIGN_API_KEY (or BOLDSIGN_API_KEY / CID_BOLDSIGN_API_KEY) not configured",
    );
  }
  return apiKey;
}

function getApiBaseUrl() {
  return process.env.BOLD_SIGN_API_BASE_URL || DEFAULT_API_BASE;
}

function toIsoDateTimePlusDays(days) {
  const ms = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

/**
 * Create an embedded signing request URL (in-app signing primary path).
 * Returns { documentId, sendUrl }.
 */
export async function createEmbeddedSignatureRequest({
  pdfBuffer,
  signerName,
  signerEmail,
  metadata,
  subject,
}) {
  const apiKey = getBoldSignApiKey();
  const apiBase = getApiBaseUrl();

  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error("createEmbeddedSignatureRequest: pdfBuffer missing/invalid");
  }

  const base64 = pdfBuffer.toString("base64");

  // NOTE: BoldSign expects bounds for the Signature field. We place it near the bottom.
  // If this proves mispositioned after first tests, we adjust X/Y/Width/Height.
  const signatureField = {
    FieldType: "Signature",
    Id: "signature_1",
    PageNumber: 1,
    Bounds: {
      // Using common PDF-ish coordinate examples from BoldSign samples.
      X: 120,
      Y: 70,
      Width: 360,
      Height: 60,
    },
    IsRequired: true,
  };

  const requestBody = {
    Title: subject || "Bind Confirmation",
    Message:
      "Please review and sign your bind confirmation to activate your policy.",
    Locale: "EN",
    SendViewOption: "FillingPage",

    // Primary flow is embedded signing; avoid email delivery here.
    DisableEmails: true,

    // UI options: keep it minimal so signer focuses on the document.
    ShowToolbar: false,
    ShowNavigationButtons: false,
    ShowPreviewButton: true,
    ShowSendButton: true,
    ShowSaveButton: false,

    // Used by BoldSign after signing (not critical for webhook-driven workflow).
    RedirectUrl: process.env.CID_APP_URL || "https://cid-pdf-api.onrender.com/",
    SendLinkValidTill: toIsoDateTimePlusDays(7),

    Signers: [
      {
        Name: signerName,
        EmailAddress: signerEmail,
        SignerOrder: 1,
        FormFields: [signatureField],
      },
    ],

    Files: [`data:application/pdf;base64,${base64}`],
    MetaData: metadata || {},
  };

  const res = await fetch(`${apiBase}/v1/document/createEmbeddedRequestUrl`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `BoldSign createEmbeddedRequestUrl failed: ${res.status} ${res.statusText} - ${text}`,
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`BoldSign createEmbeddedRequestUrl: invalid JSON response: ${text}`);
  }

  return {
    documentId: data.documentId,
    sendUrl: data.sendUrl,
    raw: data,
  };
}

/**
 * Download the completed signed PDF from BoldSign by provider documentId.
 * Returns a Buffer with PDF bytes.
 */
export async function downloadSignedDocument(documentId) {
  const apiKey = getBoldSignApiKey();
  const apiBase = getApiBaseUrl();

  if (!documentId) throw new Error("downloadSignedDocument: documentId missing");

  const url = new URL(`${apiBase}/v1/document/download`);
  url.searchParams.set("documentId", String(documentId));

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/pdf,application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `BoldSign download failed: ${res.status} ${res.statusText} - ${text}`,
    );
  }

  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

