# Partner docs → Google Drive (one-time setup)

> **Audience:** Gerry (Manager on **CID Partner Docs** Shared drive)  
> **As of:** 2026-08-18  
> **Workflow:** `.github/workflows/sync-partner-docs.yml` · **Script:** `scripts/sync-partner-docs-drive.mjs`

After setup, every push to `main` that changes a file in `docs/partner-manifest.txt` (or listed partner docs) **overwrites** the matching file in the Shared drive folder. Ray, Rick, and future members see updates without manual re-upload.

---

## 1. Google Cloud — service account

1. Open [Google Cloud Console](https://console.cloud.google.com/) (Workspace project or a dedicated `cid-partner-docs` project).
2. **APIs & Services → Enable APIs** → enable **Google Drive API**.
3. **IAM & Admin → Service accounts → Create service account**  
   - Name: `cid-partner-docs-sync`  
   - No roles required on the project for Drive-only sync.
4. **Keys → Add key → JSON** → download the JSON file (store securely; never commit).

Note the service account email:  
`cid-partner-docs-sync@YOUR_PROJECT.iam.gserviceaccount.com`

---

## 2. Shared drive — grant access

1. In Google Drive, open Shared drive **CID Partner Docs**.
2. **Manage members** → add the **service account email** as **Content manager**  
   (needs create/update on existing files Gerry uploaded).
3. Confirm the 16 partner `.md` files live in **one folder** inside that drive (not scattered).

---

## 3. Folder ID

Open the target folder in Drive. URL shape:

```text
https://drive.google.com/drive/folders/FOLDER_ID_HERE
```

Copy `FOLDER_ID_HERE` — this is `GDRIVE_PARTNER_FOLDER_ID`.

---

## 4. GitHub secrets (`pdf-backend` repo)

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|--------|
| `GDRIVE_SERVICE_ACCOUNT_JSON` | Entire contents of the downloaded JSON file |
| `GDRIVE_PARTNER_FOLDER_ID` | Folder ID from step 3 |

---

## 5. Verify

1. **Actions → Sync partner docs to Google Drive → Run workflow** (workflow_dispatch).
2. Green run → open Drive → spot-check a file’s **Modified** time.
3. Optional local test (with JSON path):

```bash
export GDRIVE_SERVICE_ACCOUNT_JSON="$(cat /path/to/sa.json)"
export GDRIVE_PARTNER_FOLDER_ID="your-folder-id"
node scripts/sync-partner-docs-drive.mjs
```

---

## What syncs

Listed in **`docs/partner-manifest.txt`** (16 files). Edit the manifest to add/remove partner docs.

**Not synced:** internal runbooks (`Deploy_Guide.md`, outreach playbooks, operator SQL, etc.).

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `403` / `Insufficient Permission` | Service account not on Shared drive, or role too low → **Content manager** |
| `404` / folder not found | Wrong `GDRIVE_PARTNER_FOLDER_ID`; use folder URL inside Shared drive |
| Workflow skipped | Push did not touch `docs/**` or manifest — use **Run workflow** manually |
| Duplicate files in Drive | Same basename in two folders — keep one target folder only |

---

## Members (human)

| Person | Role | Notes |
|--------|------|--------|
| Gerry | Manager / owner | Secrets, manifest, sync workflow |
| Ray | Content manager | Counsel / diligence |
| Rick | Contributor | Ops partner |
| Bob Hersher (planned) | Content manager | GC |

Service account is **not** a human member for reading — it only writes files for automation.
