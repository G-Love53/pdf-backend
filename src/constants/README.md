# `postgresEnums.js`

Canonical strings for **Postgres ENUM** columns used by this service.

- **Source of truth:** `migrations/001_cid_initial_schema.sql` (and follow-on migrations that alter types).
- **Usage:** `import { DocumentRole, DocumentType, ... } from "../constants/postgresEnums.js"` instead of hard-coding `'pdf'`, `'signed_bind_docs'`, etc., in SQL paths.

R2 metadata (`uploadBuffer(..., { type: "..." })`) is **not** a DB enum — those labels can stay descriptive in each call site, but matching `DocumentRole.*` when it represents the same concept keeps grep/search consistent.

**Non-enum:** `documents.sha256_hash` is `NOT NULL` — always set when inserting rows (hash the PDF bytes).

**Columns:** `quote_packets` and `submissions` have **no** `updated_at` in `001` (unlike `quotes`, `bind_requests`, `policies`). Do not `SET updated_at` on those tables unless a migration adds the column.

See `.cursor/rules/postgres-enums.mdc` for agent guidance.

## RSS / bind deploy env (optional)

| Variable | Purpose |
|----------|---------|
| `SEGMENT` | Deploy default segment when normalizing unknown slugs (`bar` / `roofer` / …). |
| `CID_BRAND_NAME` | First line of generated bind-confirmation PDF (per-segment deploys). |
