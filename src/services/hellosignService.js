import pkg from "@dropbox/sign";

const { SignatureRequestApi } = pkg;

const apiKey =
  process.env.HELLOSIGN_API_KEY || process.env.DROPBOX_SIGN_API_KEY || null;

let signatureApi = null;

function getSignatureApi() {
  if (!apiKey) {
    throw new Error("HELLOSIGN_API_KEY not configured");
  }
  if (!signatureApi) {
    // The generated SDK in this environment does not export a Configuration class.
    // Authentication is done by setting the api_key username on the API client auth handler.
    signatureApi = new SignatureRequestApi();
    if (signatureApi?.authentications?.api_key) {
      signatureApi.authentications.api_key.username = apiKey;
      signatureApi.authentications.api_key.password = "";
    }
  }
  return signatureApi;
}

export async function createSignatureRequest({
  pdfBuffer,
  signerName,
  signerEmail,
  metadata,
  subject,
}) {
  const api = getSignatureApi();

  // HelloSign SDK expects `files` to be either:
  // - fs.ReadStream, or
  // - { value: Buffer, options: { filename, contentType, ... } }
  // Passing a raw Buffer causes the SDK to omit the upload and HelloSign
  // responds with: "Must specify file(s) to be sent."
  const bufferBytes = pdfBuffer?.length ?? 0;
  console.log("[hellosignService] bind PDF buffer bytes:", bufferBytes);

  const request = {
    title: subject,
    subject,
    message:
      "Please review and sign your bind confirmation to activate your policy.",
    signers: [
      {
        emailAddress: signerEmail,
        name: signerName,
        order: 0,
      },
    ],
    files: [
      {
        value: pdfBuffer,
        options: {
          filename: "bind-confirmation.pdf",
          contentType: "application/pdf",
        },
      },
    ],
    metadata: metadata || {},
    // Default behavior: use test_mode in non-production.
    // In production, some accounts may still require test_mode=1 unless paid.
    testMode: process.env.NODE_ENV !== "production",
  };

  let response;
  try {
    response = await api.signatureRequestSend(request);
  } catch (err) {
    // If the account isn't on a paid plan, HelloSign rejects with:
    // "You must either upgrade ... or use the test_mode=1 parameter."
    const statusCode =
      err?.statusCode ||
      err?.response?.status ||
      err?.response?.statusCode ||
      err?.response?.status_code;
    const errorName =
      err?.body?.error?.errorName ||
      err?.error?.errorName ||
      err?.response?.data?.error?.errorName ||
      err?.response?.data?.error?.error ||
      null;

    const isPaymentRequired =
      statusCode === 402 || String(errorName).includes("payment_required");

    if (isPaymentRequired) {
      request.testMode = true;
      response = await api.signatureRequestSend(request);
    } else {
      throw err;
    }
  }

  return response.body.signatureRequest;
}

export async function resendSignatureRequest(hellosignRequestId, signerEmail) {
  const api = getSignatureApi();
  await api.signatureRequestRemind(hellosignRequestId, {
    emailAddress: signerEmail,
  });
}

export async function cancelSignatureRequest(hellosignRequestId) {
  const api = getSignatureApi();
  await api.signatureRequestCancel(hellosignRequestId);
}

export async function downloadSignedDocument(hellosignRequestId) {
  const api = getSignatureApi();
  const response = await api.signatureRequestFiles(hellosignRequestId, {
    fileType: "pdf",
  });
  return response.body;
}

