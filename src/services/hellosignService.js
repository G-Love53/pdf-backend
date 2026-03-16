import pkg from "@dropbox/sign";

const { SignatureRequestApi, Configuration } = pkg;

const apiKey =
  process.env.HELLOSIGN_API_KEY || process.env.DROPBOX_SIGN_API_KEY || null;

let signatureApi = null;

function getSignatureApi() {
  if (!apiKey) {
    throw new Error("HELLOSIGN_API_KEY not configured");
  }
  if (!signatureApi) {
    const config = new Configuration();
    config.username = apiKey;
    signatureApi = new SignatureRequestApi(config);
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
    files: [pdfBuffer],
    metadata: metadata || {},
    testMode: process.env.NODE_ENV !== "production" ? 1 : 0,
  };

  const response = await api.signatureRequestSend(request);
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

