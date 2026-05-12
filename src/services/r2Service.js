import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

/**
 * Same-origin path for GET /api/documents/:id/download (presigned redirect).
 * Prefer this over public R2 hostnames — no custom DNS on the bucket required.
 */
export function documentDownloadPath(documentId) {
  if (!documentId) return null;
  return `/api/documents/${documentId}/download`;
}

/**
 * @deprecated Prefer {@link documentDownloadPath} + GET /api/documents/:id/download.
 * Kept only for legacy callers; do not use for operator UI.
 */
export function getDocumentPublicUrl(storagePath) {
  if (!storagePath) return null;

  if (process.env.R2_PUBLIC_BASE_URL) {
    let base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
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

/** Presigned GET for R2 (S3-compatible). Default 15 minutes. */
export async function getPresignedGetObjectUrl(storagePath, options = {}) {
  if (!BUCKET || !ENDPOINT || !storagePath) {
    throw new Error("R2 not configured or missing storage path");
  }
  const expiresIn = options.expiresIn ?? 900;
  const s3 = getClient();
  const key = String(storagePath).replace(/^\/+/, "");
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
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

/** Best-effort remove object (e.g. rollback after failed DB update). */
export async function deleteObject(storagePath) {
  if (!BUCKET || !ENDPOINT || !storagePath) return;
  const s3 = getClient();
  const key = String(storagePath).replace(/^\/+/, "");
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    );
  } catch (e) {
    console.warn("[r2Service] deleteObject failed:", key, e?.message || e);
  }
}


