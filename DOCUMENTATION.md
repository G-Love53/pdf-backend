# CID documentation (canonical location)

**Segment-agnostic docs do not live in this repo.** They apply to **all segments** (Bar, Roofer, Plumber, future RSS / shared intake).

**Canonical folder:** [`../CID-docs/`](../CID-docs/) (sibling to `pdf-backend` under `GitHub/`)

| Document | Description |
|----------|-------------|
| [CID-docs/README.md](../CID-docs/README.md) | Index |
| [CID-docs/Deploy_Guide.md](../CID-docs/Deploy_Guide.md) | Render, Netlify, env, post-deploy checks |
| [CID-docs/AUDIT_READINESS.md](../CID-docs/AUDIT_READINESS.md) | Audit / S1–S6 |
| [CID-docs/CID_ARCHITECTURE.md](../CID-docs/CID_ARCHITECTURE.md) | Architecture |
| [CID-docs/DEPLOY_SEGMENTS.md](../CID-docs/DEPLOY_SEGMENTS.md) | New segment checklist |
| [CID-docs/CID_CONNECT.md](../CID-docs/CID_CONNECT.md) | **CID Connect** (LEG 3 app): Famous vs API, Cloudflare, RSS |

Clone or copy `CID-docs` into its **own git repo** (or a monorepo root) if the team needs it versioned independently of `pdf-backend`.

---

## Repo-local notes (`pdf-backend`)

- **`README.md`** — Bar segment + **Gmail poller / `DATABASE_URL` / optional dedupe** (short operational summary).
- **`cid-connect`** (sibling repo): **`docs/ARCHITECTURE.md`**, **`docs/WORKFLOW_HANDOFF.md`**, **`docs/STAGING_INTEGRATION_TEST_PLAN_DRAFT.md`** — Connect vs pipeline DB, staging E2E.
