# `postgresEnums.js`

Canonical strings for **Postgres ENUM** columns used by this service.

- **Source of truth:** `migrations/001_cid_initial_schema.sql` (and follow-on migrations that alter types).
- **Usage:** `import { DocumentRole, DocumentType, ... } from "../constants/postgresEnums.js"` instead of hard-coding `'pdf'`, `'signed_bind_docs'`, etc., in SQL paths.

R2 metadata (`uploadBuffer(..., { type: "..." })`) is **not** a DB enum — those labels can stay descriptive in each call site, but matching `DocumentRole.*` when it represents the same concept keeps grep/search consistent.

**Non-enum:** `documents.sha256_hash` is `NOT NULL` — always set when inserting rows (hash the PDF bytes).

**Columns:** `quote_packets` and `submissions` have **no** `updated_at` in `001` (unlike `quotes`, `bind_requests`, `policies`). Do not `SET updated_at` on those tables unless a migration adds the column.

**Policies:** `policy_number` is unique. `generatePolicyNumber()` includes a short `quote_id` suffix so multiple quotes on one submission do not collide. `createPolicy()` is idempotent on `bind_request_id` (retries / concurrent finalize).

See `.cursor/rules/postgres-enums.mdc` for agent guidance.

## RSS / bind deploy env (optional)

| Variable | Purpose |
|----------|---------|
| `SEGMENT` | Deploy default segment when normalizing unknown slugs (`bar` / `roofer` / …). |
| `CID_BRAND_NAME` | First line of generated bind-confirmation PDF (per-segment deploys). |
| `R2_PUBLIC_BASE_URL` | **Public browser URL base** for `getDocumentPublicUrl()` (e.g. `https://files.yourdomain.com`). **Do not** use `https://<bucket>.r2.cloudflarestorage.com` — that is the S3 API host, not a website; browsers will TLS-error. In Cloudflare: R2 bucket → **Settings → Public access** → connect a **Custom Domain** (or serve via **Worker**), then set this env to that origin (no trailing slash). |

Signed bind PDFs are also **attached** to the client bind email and the Bar agent `[CID][Bind]` email (Gmail), so operators get the file even before R2 links work in the browser.
