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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After POST /v1/document/send, BoldSign may still process the file asynchronously.
 * getEmbeddedSignLink can fail briefly; retry a few times.
 */
async function getEmbeddedSignLinkWithRetry({
  documentId,
  signerEmail,
  redirectUrl,
}) {
  const apiKey = getBoldSignApiKey();
  const apiBase = getApiBaseUrl();
  const validTill = toIsoDateTimePlusDays(7);

  let lastErr = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const url = new URL(`${apiBase}/v1/document/getEmbeddedSignLink`);
    url.searchParams.set("documentId", String(documentId));
    url.searchParams.set("signerEmail", String(signerEmail));
    url.searchParams.set("signLinkValidTill", validTill);
    if (redirectUrl) {
      url.searchParams.set("redirectUrl", String(redirectUrl));
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    if (res.ok) {
      try {
        const data = JSON.parse(text);
        const signLink = data.signLink || data.SignLink;
        if (!signLink) {
          throw new Error(`BoldSign getEmbeddedSignLink: missing signLink in ${text}`);
        }
        return signLink;
      } catch (e) {
        lastErr = e;
        break;
      }
    }

    // Retry while document is still spinning up (async processing).
    const retryable =
      res.status === 404 ||
      res.status === 408 ||
      res.status === 409 ||
      res.status === 425 ||
      res.status === 429 ||
      res.status >= 500;
    lastErr = new Error(
      `BoldSign getEmbeddedSignLink failed: ${res.status} ${res.statusText} - ${text}`,
    );
    if (!retryable) {
      throw lastErr;
    }
    await sleep(1500 * (attempt + 1));
  }

  throw lastErr || new Error("BoldSign getEmbeddedSignLink: exhausted retries");
}

/**
 * Send document for signature, then return the embedded **signing** URL (not the draft/prepare UI).
 * createEmbeddedRequestUrl shows BoldSign's composer (recipients, upload, etc.); RSS wants sign-in-iframe.
 * Returns { documentId, sendUrl } where sendUrl is suitable for <iframe src>.
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
  const signatureField = {
    FieldType: "Signature",
    Id: "signature_1",
    PageNumber: 1,
    Bounds: {
      X: 120,
      Y: 70,
      Width: 360,
      Height: 60,
    },
    IsRequired: true,
  };

  const redirectUrl =
    process.env.BOLDSIGN_SIGN_REDIRECT_URL ||
    process.env.CID_APP_URL ||
    "https://cid-pdf-api.onrender.com/operator";

  const sendBody = {
    Title: subject || "Bind Confirmation",
    Message:
      "Please review and sign your bind confirmation to activate your policy.",
    DisableEmails: true,
    EnableSigningOrder: false,
    Signers: [
      {
        Name: signerName,
        EmailAddress: signerEmail,
        SignerType: "Signer",
        FormFields: [signatureField],
        Locale: "EN",
      },
    ],
    Files: [`data:application/pdf;base64,${base64}`],
    MetaData: metadata || {},
  };

  const sendRes = await fetch(`${apiBase}/v1/document/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
    body: JSON.stringify(sendBody),
  });

  const sendText = await sendRes.text();
  if (!sendRes.ok) {
    throw new Error(
      `BoldSign document/send failed: ${sendRes.status} ${sendRes.statusText} - ${sendText}`,
    );
  }

  let sendData;
  try {
    sendData = JSON.parse(sendText);
  } catch {
    throw new Error(`BoldSign document/send: invalid JSON response: ${sendText}`);
  }

  const documentId = sendData.documentId || sendData.DocumentId;
  if (!documentId) {
    throw new Error(`BoldSign document/send: missing documentId in ${sendText}`);
  }

  const signUrl = await getEmbeddedSignLinkWithRetry({
    documentId,
    signerEmail,
    redirectUrl,
  });

  return {
    documentId,
    sendUrl: signUrl,
    raw: { send: sendData, signUrl },
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

