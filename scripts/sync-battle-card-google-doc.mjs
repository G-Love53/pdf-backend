#!/usr/bin/env node
/**
 * Upload battle card HTML → native Google Doc in CID Partner Docs folder.
 * Not in partner-manifest.txt (internal sales/competitive doc).
 *
 * Env:
 *   GDRIVE_SERVICE_ACCOUNT_JSON
 *   GDRIVE_PARTNER_FOLDER_ID
 *
 * Optional:
 *   BATTLE_CARD_HTML — path override (default: docs/CID_BATTLE_CARD_digital_marketplace_brokers.html)
 *   BATTLE_CARD_DOC_TITLE — default: "CID Battle Card — Digital Marketplace Brokers"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_HTML = path.join(
  REPO_ROOT,
  "docs",
  "CID_BATTLE_CARD_digital_marketplace_brokers.html",
);
const DOC_TITLE =
  process.env.BATTLE_CARD_DOC_TITLE?.trim() ||
  "CID Battle Card — Digital Marketplace Brokers";
const GOOGLE_DOC = "application/vnd.google-apps.document";

function driveClient(credentialsJson) {
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function findDocByTitle(drive, folderId, title) {
  const q = [
    `'${folderId}' in parents`,
    "trashed=false",
    `name='${title.replace(/'/g, "\\'")}'`,
    `mimeType='${GOOGLE_DOC}'`,
  ].join(" and ");
  const res = await drive.files.list({
    q,
    fields: "files(id, name, modifiedTime)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 5,
  });
  return res.data.files?.[0] || null;
}

async function main() {
  const folderId = process.env.GDRIVE_PARTNER_FOLDER_ID?.trim();
  const credentialsJson = process.env.GDRIVE_SERVICE_ACCOUNT_JSON?.trim();
  const htmlPath = path.resolve(
    process.env.BATTLE_CARD_HTML?.trim() || DEFAULT_HTML,
  );

  if (!folderId || !credentialsJson) {
    console.error(
      "Missing GDRIVE_PARTNER_FOLDER_ID or GDRIVE_SERVICE_ACCOUNT_JSON",
    );
    process.exit(1);
  }
  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML not found: ${htmlPath}`);
    process.exit(1);
  }

  const drive = driveClient(credentialsJson);
  const existing = await findDocByTitle(drive, folderId, DOC_TITLE);
  const media = {
    mimeType: "text/html",
    body: fs.createReadStream(htmlPath),
  };

  if (existing) {
    await drive.files.update({
      fileId: existing.id,
      media,
      supportsAllDrives: true,
    });
    console.log(`Updated Google Doc: "${DOC_TITLE}" (${existing.id})`);
    console.log(
      `https://docs.google.com/document/d/${existing.id}/edit`,
    );
    return;
  }

  const res = await drive.files.create({
    requestBody: {
      name: DOC_TITLE,
      parents: [folderId],
      mimeType: GOOGLE_DOC,
    },
    media,
    supportsAllDrives: true,
    fields: "id",
  });
  const id = res.data.id;
  console.log(`Created Google Doc: "${DOC_TITLE}" (${id})`);
  console.log(`https://docs.google.com/document/d/${id}/edit`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
