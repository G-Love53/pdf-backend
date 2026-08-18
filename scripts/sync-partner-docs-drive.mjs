#!/usr/bin/env node
/**
 * Sync partner-facing docs from docs/partner-manifest.txt → Google Shared Drive.
 *
 * Env:
 *   GDRIVE_SERVICE_ACCOUNT_JSON — full service account JSON (GitHub secret)
 *   GDRIVE_PARTNER_FOLDER_ID    — Shared drive folder ID from Drive URL
 *
 * One-time: add the service account email to Shared drive "CID Partner Docs"
 * as Content manager. See docs/PARTNER_DOCS_SETUP.md.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(REPO_ROOT, "docs", "partner-manifest.txt");
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function parseManifest(manifestPath) {
  return fs
    .readFileSync(manifestPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function driveClient(credentialsJson) {
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DRIVE_SCOPE],
  });
  return google.drive({ version: "v3", auth });
}

async function listFolderFiles(drive, folderId) {
  const byName = new Map();
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
      pageSize: 200,
    });
    for (const f of res.data.files || []) {
      byName.set(f.name, f);
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return byName;
}

async function uploadOrUpdate(drive, folderId, localPath, existing) {
  const name = path.basename(localPath);
  const media = {
    mimeType: "text/markdown",
    body: fs.createReadStream(localPath),
  };

  if (existing) {
    await drive.files.update({
      fileId: existing.id,
      media,
      supportsAllDrives: true,
    });
    console.log(`updated  ${name} (${existing.id})`);
    return existing.id;
  }

  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
      mimeType: "text/markdown",
    },
    media,
    supportsAllDrives: true,
    fields: "id",
  });
  console.log(`created  ${name} (${res.data.id})`);
  return res.data.id;
}

async function main() {
  const folderId = process.env.GDRIVE_PARTNER_FOLDER_ID?.trim();
  const credentialsJson = process.env.GDRIVE_SERVICE_ACCOUNT_JSON?.trim();

  if (!folderId || !credentialsJson) {
    console.error(
      "Missing GDRIVE_PARTNER_FOLDER_ID or GDRIVE_SERVICE_ACCOUNT_JSON"
    );
    process.exit(1);
  }

  const relPaths = parseManifest(MANIFEST);
  const drive = driveClient(credentialsJson);
  const existingByName = await listFolderFiles(drive, folderId);

  let ok = 0;
  for (const rel of relPaths) {
    const localPath = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(localPath)) {
      console.error(`missing  ${rel}`);
      process.exitCode = 1;
      continue;
    }
    const name = path.basename(localPath);
    await uploadOrUpdate(drive, folderId, localPath, existingByName.get(name));
    ok += 1;
  }

  console.log(`\nSynced ${ok}/${relPaths.length} file(s) to folder ${folderId}`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
