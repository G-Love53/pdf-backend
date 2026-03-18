import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET_NAME;
const ENDPOINT = process.env.R2_ENDPOINT;

let client = null;

function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export function getDocumentPublicUrl(storagePath) {
  if (!storagePath) return null;

  if (process.env.R2_PUBLIC_BASE_URL) {
    let base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
    // Some deployments set R2_PUBLIC_BASE_URL without a protocol (e.g. "bucket.r2.cloudflarestorage.com").
    // Ensure the returned URL is always fully-qualified so the browser iframe/link works.
    if (!/^https?:\/\//i.test(base)) {
      base = `https://${base}`;
    }
    const path = String(storagePath).replace(/^\/+/, "");
    return `${base}/${path}`;
  }

  if (BUCKET) {
    const path = String(storagePath).replace(/^\/+/, "");
    return `https://${BUCKET}.r2.cloudflarestorage.com/${path}`;
  }

  return null;
}

export async function getObjectStream(storagePath) {
  if (!BUCKET || !ENDPOINT) {
    throw new Error("R2 not configured");
  }

  const s3 = getClient();
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storagePath,
  });
  const res = await s3.send(cmd);
  return res.Body;
}

export async function uploadBuffer(storagePath, buffer, contentType = "application/pdf", metadata = {}) {
  if (!BUCKET || !ENDPOINT) {
    throw new Error("R2 not configured");
  }

  const s3 = getClient();
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storagePath,
    Body: buffer,
    ContentType: contentType,
    Metadata: metadata,
  });
  await s3.send(cmd);
  return storagePath;
}


