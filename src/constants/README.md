# `postgresEnums.js`

Canonical strings for **Postgres ENUM** columns used by this service.

- **Source of truth:** `migrations/001_cid_initial_schema.sql` (and follow-on migrations that alter types).
- **Usage:** `import { DocumentRole, DocumentType, ... } from "../constants/postgresEnums.js"` instead of hard-coding `'pdf'`, `'signed_bind_docs'`, etc., in SQL paths.

R2 metadata (`uploadBuffer(..., { type: "..." })`) is **not** a DB enum — those labels can stay descriptive in each call site, but matching `DocumentRole.*` when it represents the same concept keeps grep/search consistent.

**Non-enum:** `documents.sha256_hash` is `NOT NULL` — always set when inserting rows (hash the PDF bytes).

See `.cursor/rules/postgres-enums.mdc` for agent guidance.
