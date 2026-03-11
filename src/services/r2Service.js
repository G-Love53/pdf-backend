import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

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
    const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
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

