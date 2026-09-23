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
 *   BATTLE_CARD_HTML — path override
 *   BATTLE_CARD_DOC_TITLE — default ASCII title (Drive search-friendly)
 *   BATTLE_CARD_NOTIFY_EMAIL — grant writer after upload (default g@commercialinsurance-direct.com)
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
  "CID Battle Card - Digital Marketplace Brokers";
const NOTIFY_EMAIL =
  process.env.BATTLE_CARD_NOTIFY_EMAIL?.trim() ||
  "g@commercialinsurance-direct.com";
const GOOGLE_DOC = "application/vnd.google-apps.document";

function driveClient(credentialsJson) {
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

function escapeDriveQueryString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getFolderMeta(drive, folderId) {
  const res = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,driveId,teamDriveId,parents",
    supportsAllDrives: true,
  });
  return res.data;
}

async function listBattleFiles(drive, folderId) {
  const q = [
    `'${folderId}' in parents`,
    "trashed=false",
    "name contains 'Battle'",
  ].join(" and ");
  const res = await drive.files.list({
    q,
    fields: "files(id, name, mimeType, webViewLink, modifiedTime)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
    pageSize: 20,
  });
  return res.data.files || [];
}

async function findDocByTitle(drive, folderId, title) {
  const safe = escapeDriveQueryString(title);
  const q = [
    `'${folderId}' in parents`,
    "trashed=false",
    `name='${safe}'`,
    `mimeType='${GOOGLE_DOC}'`,
  ].join(" and ");
  const res = await drive.files.list({
    q,
    fields: "files(id, name, webViewLink, modifiedTime)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
    pageSize: 5,
  });
  return res.data.files?.[0] || null;
}

async function grantWriter(drive, fileId, email) {
  if (!email) return;
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: email,
      },
      supportsAllDrives: true,
      sendNotificationEmail: false,
    });
    console.log(`Granted writer to ${email} on file ${fileId}`);
  } catch (err) {
    console.warn(
      `Could not grant ${email} (file may inherit Shared drive ACL):`,
      err.message || err,
    );
  }
}

async function uploadAsGoogleDoc(drive, folderId, htmlPath, existingId) {
  const media = {
    mimeType: "text/html",
    body: fs.createReadStream(htmlPath),
  };

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media,
      supportsAllDrives: true,
    });
    const got = await drive.files.get({
      fileId: existingId,
      fields: "id,name,webViewLink,parents,driveId",
      supportsAllDrives: true,
    });
    return got.data;
  }

  const res = await drive.files.create({
    requestBody: {
      name: DOC_TITLE,
      parents: [folderId],
      mimeType: GOOGLE_DOC,
    },
    media,
    supportsAllDrives: true,
    fields: "id,name,webViewLink,parents,driveId",
  });
  return res.data;
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

  const folder = await getFolderMeta(drive, folderId);
  console.log("Target folder:", {
    id: folder.id,
    name: folder.name,
    driveId: folder.driveId || folder.teamDriveId || "(My Drive — prefer Shared drive folder)",
  });

  const existing = await findDocByTitle(drive, folderId, DOC_TITLE);
  if (existing) {
    console.log("Found existing doc:", existing.id, existing.name);
  }

  const file = await uploadAsGoogleDoc(
    drive,
    folderId,
    htmlPath,
    existing?.id,
  );

  await grantWriter(drive, file.id, NOTIFY_EMAIL);

  const docUrl =
    file.webViewLink ||
    `https://docs.google.com/document/d/${file.id}/edit`;
  console.log(`\nOK: "${file.name}"`);
  console.log("Open:", docUrl);
  console.log("File ID:", file.id);
  console.log("Parent folder:", folder.name, folder.id);

  const siblings = await listBattleFiles(drive, folderId);
  console.log(
    `\nFiles in folder matching "Battle" (${siblings.length}):`,
  );
  for (const f of siblings) {
    console.log(` - ${f.name} [${f.mimeType}] ${f.webViewLink || f.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
