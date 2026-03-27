import pdfParse from "pdf-parse";

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

async function getPdfPageCount(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    const n = data?.numpages;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
    const nn = Number(n);
    if (Number.isFinite(nn) && nn > 0) return nn;
    return 1;
  } catch (_err) {
    return 1;
  }
}

function parseCarrierPlacementOverridesJson(jsonStr) {
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveSignaturePlacement({ carrierName, metadata, pdfBuffer, numPages }) {
  const signatureTemplate = String(metadata?.signature_template || "").toLowerCase().trim();
  if (signatureTemplate === "bind_confirmation_v1") {
    const x = Number(process.env.BOLDSIGN_BIND_CONFIRMATION_SIGNATURE_X || 72);
    const y = Number(process.env.BOLDSIGN_BIND_CONFIRMATION_SIGNATURE_Y || 618);
    const width = Number(process.env.BOLDSIGN_BIND_CONFIRMATION_SIGNATURE_WIDTH || 468);
    const height = Number(process.env.BOLDSIGN_BIND_CONFIRMATION_SIGNATURE_HEIGHT || 64);
    return {
      pageNumber: 1,
      bounds: {
        X: Number.isFinite(x) ? x : 72,
        Y: Number.isFinite(y) ? y : 650,
        Width: Number.isFinite(width) ? width : 468,
        Height: Number.isFinite(height) ? height : 56,
      },
    };
  }

  const globalX = Number(process.env.BOLDSIGN_SIGNATURE_FIELD_X || 72);
  const globalY = Number(
    process.env.BOLDSIGN_SIGNATURE_FIELD_Y ||
      process.env.BOLDSIGN_SIGNATURE_BOUNDS_Y ||
      680,
  );
  const globalWidth = Number(process.env.BOLDSIGN_SIGNATURE_FIELD_WIDTH || 468);
  const globalHeight = Number(process.env.BOLDSIGN_SIGNATURE_FIELD_HEIGHT || 52);

  const globalPageMode =
    process.env.BOLDSIGN_SIGNATURE_FIELD_PAGE_MODE || "last"; // first | last | 1..N

  const overrides = parseCarrierPlacementOverridesJson(
    process.env.BOLDSIGN_SIGNATURE_PLACEMENTS_BY_CARRIER_JSON,
  );

  const carrierKey = String(carrierName || metadata?.carrier_name || "")
    .toLowerCase()
    .trim();

  const carrierOverride = overrides && carrierKey ? overrides[carrierKey] : null;
  const fallbackOverride = overrides && overrides["*"] ? overrides["*"] : null;
  const cfg = carrierOverride || fallbackOverride || {};

  // PageNumber resolution
  let pageNumber = 1;
  const pageCfg =
    cfg.page ??
    cfg.page_mode ??
    cfg.pageMode ??
    process.env.BOLDSIGN_SIGNATURE_FIELD_PAGE_MODE ??
    globalPageMode;

  const pageStr = String(pageCfg || "").toLowerCase().trim();
  if (pageStr === "first") pageNumber = 1;
  else if (pageStr === "last")
    pageNumber = Math.max(1, Number(numPages) || 1);
  else {
    const pn = Number(pageCfg);
    pageNumber = Number.isFinite(pn) && pn > 0 ? pn : 1;
  }

  // X/Y/size resolution
  const x = Number.isFinite(Number(cfg.x)) ? Number(cfg.x) : globalX;
  const y = Number.isFinite(Number(cfg.y)) ? Number(cfg.y) : globalY;
  const width = Number.isFinite(Number(cfg.width)) ? Number(cfg.width) : globalWidth;
  const height = Number.isFinite(Number(cfg.height)) ? Number(cfg.height) : globalHeight;

  return {
    pageNumber,
    bounds: { X: x, Y: y, Width: width, Height: height },
  };
}

/**
 * After POST /v1/document/send, BoldSign may still process the file asynchronously.
 * getEmbeddedSignLink can fail briefly; retry a few times.
 */
function isEmbeddedLinkNotReadyYet(res, text) {
  // After document/send, BoldSign processes the file asynchronously. Until then,
  // getEmbeddedSignLink may return 403 {"error":"Invalid Document ID"} — treat as transient.
  const t = String(text || "");
  if (res.status === 404) return true;
  if (res.status === 403) {
    if (/invalid document id/i.test(t)) return true;
    try {
      const j = JSON.parse(t);
      const err = String(j.error || j.message || "");
      if (/invalid document/i.test(err)) return true;
    } catch {
      // ignore
    }
  }
  if (res.status === 408 || res.status === 409 || res.status === 425 || res.status === 429) {
    return true;
  }
  if (res.status >= 500) return true;
  return false;
}

async function getEmbeddedSignLinkWithRetry({
  documentId,
  signerEmail,
  redirectUrl,
}) {
  const apiKey = getBoldSignApiKey();
  const apiBase = getApiBaseUrl();
  const validTill = toIsoDateTimePlusDays(7);

  // Give BoldSign time to register the document after /send (async processing).
  await sleep(2000);

  let lastErr = null;
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const url = new URL(`${apiBase}/v1/document/getEmbeddedSignLink`);
    url.searchParams.set("documentId", String(documentId).trim());
    url.searchParams.set("signerEmail", String(signerEmail).trim());
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
        if (attempt === maxAttempts - 1) throw e;
        await sleep(2000 * (attempt + 1));
        continue;
      }
    }

    lastErr = new Error(
      `BoldSign getEmbeddedSignLink failed: ${res.status} ${res.statusText} - ${text}`,
    );

    if (isEmbeddedLinkNotReadyYet(res, text)) {
      const delay = Math.min(8000, 1500 + attempt * 800);
      console.warn("[boldsignService] getEmbeddedSignLink retry", {
        attempt: attempt + 1,
        documentId: String(documentId).slice(0, 8) + "…",
        status: res.status,
        delayMs: delay,
      });
      await sleep(delay);
      continue;
    }

    throw lastErr;
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

  const numPages = await getPdfPageCount(pdfBuffer);
  const carrierName =
    metadata?.carrier_name || metadata?.carrierName || metadata?.carrier || null;

  const placement = resolveSignaturePlacement({
    carrierName,
    metadata,
    pdfBuffer,
    numPages,
  });

  const signatureField = {
    FieldType: "Signature",
    Id: "signature_1",
    PageNumber: placement.pageNumber,
    Bounds: {
      ...placement.bounds,
    },
    IsRequired: true,
  };

  // After signing, BoldSign appends query params. `/operator` and `/operator/home` both finalize.
  const redirectUrl =
    process.env.BOLDSIGN_SIGN_REDIRECT_URL ||
    process.env.CID_APP_URL ||
    "https://cid-pdf-api.onrender.com/operator";

  const sendBody = {
    Title: subject || "Bind Confirmation",
    Message:
      "Please review and sign your bind confirmation to activate your policy.",
    DisableEmails: true,
    // Required for GET /v1/document/getEmbeddedSignLink — without this, BoldSign may
    // return 403 Invalid Document ID for embedded signing even after /send returns 201.
    EnableEmbeddedSigning: true,
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

  console.log("[boldsignService] document/send ok, waiting for embedded sign link", {
    documentId: String(documentId),
  });

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

/**
 * GET /v1/document/properties — used to poll completion when webhooks are delayed or
 * application-scoped webhooks miss API-key sends (same pattern for every RSS segment).
 */
export async function getDocumentProperties(documentId) {
  const apiKey = getBoldSignApiKey();
  const apiBase = getApiBaseUrl();
  if (!documentId) throw new Error("getDocumentProperties: documentId missing");

  const url = new URL(`${apiBase}/v1/document/properties`);
  url.searchParams.set("documentId", String(documentId).trim());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `BoldSign document/properties failed: ${res.status} ${res.statusText} - ${text}`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`BoldSign document/properties: invalid JSON: ${text.slice(0, 500)}`);
  }
}

/**
 * Normalize status string from BoldSign properties JSON (camelCase or PascalCase).
 */
export function parseBoldSignDocumentStatus(props) {
  if (!props || typeof props !== "object") return null;
  const p = props;
  return (
    p.status ??
    p.Status ??
    p.documentStatus ??
    p.DocumentStatus ??
    (p.document && (p.document.status || p.document.Status)) ??
    (p.documentProperties && (p.documentProperties.status || p.documentProperties.Status)) ??
    null
  );
}

/** True when document-level status is terminal (download should succeed). */
export function isBoldSignDocumentFullyExecuted(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "completed" || s === "complete";
}

/**
 * True when BoldSign reports the document is ready to download — document status **Signed**
 * often appears before **Completed** in /properties; signerDetails may show Completed first.
 * Single-signer bind: treat Signed as sufficient to attempt finalize (download is authoritative).
 */
export function isBoldSignDocumentReadyForDownload(props) {
  if (!props || typeof props !== "object") return false;

  const status = parseBoldSignDocumentStatus(props);
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed" || s === "complete" || s === "signed") {
    return true;
  }

  const signers = props.signerDetails || props.SignerDetails;
  if (Array.isArray(signers) && signers.length > 0) {
    const allDone = signers.every((sg) => {
      if (!sg || typeof sg !== "object") return false;
      const st = String(sg.status || sg.Status || "").trim().toLowerCase();
      return st === "completed" || st === "signed";
    });
    if (allDone) return true;
  }

  return false;
}

