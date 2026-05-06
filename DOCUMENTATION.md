# CID documentation

**Deploy / Render / Netlify — canonical in this repo (RSS):** [`docs/Deploy_Guide.md`](./docs/Deploy_Guide.md) — **versioned with `pdf-backend`**; **no GitHub remote required** for a separate docs folder.

**Optional local folder:** `~/GitHub/CID-docs/` may hold copies for convenience; **edit [`docs/Deploy_Guide.md`](./docs/Deploy_Guide.md) in `pdf-backend`** when procedures change, then refresh any local copy if you use one.

| Document | Description |
|----------|-------------|
| **[docs/Deploy_Guide.md](./docs/Deploy_Guide.md)** | **Canonical** — Render, Netlify, env, post-deploy checks, intake JSON contract, **Postmaster** + campaign DNS alignment, GitHub heartbeat notes |
| **[docs/OPERATOR_DAILY_RUNBOOK.md](./docs/OPERATOR_DAILY_RUNBOOK.md)** | Operator quote → bind → policy flow; **S5 client email** preview/send expectations |
| **[OPERATOR_SEGMENT_AUDIT.md](./OPERATOR_SEGMENT_AUDIT.md)** | Segment filter audit + **S5 email** behavior (shared backend) |
| [CID-docs/README.md](../CID-docs/README.md) | Optional local index (if present) |
| [CID-docs/AUDIT_READINESS.md](../CID-docs/AUDIT_READINESS.md) | Optional local copy — audit / S1–S6 |
| [CID-docs/CID_ARCHITECTURE.md](../CID-docs/CID_ARCHITECTURE.md) | Optional local copy — architecture |
| [CID-docs/DEPLOY_SEGMENTS.md](../CID-docs/DEPLOY_SEGMENTS.md) | Optional — new segment checklist |
| [CID-docs/CID_CONNECT.md](../CID-docs/CID_CONNECT.md) | Optional — CID Connect (Famous vs API) |

---

## Repo-local notes (`pdf-backend`)

- **`README.md`** — Bar segment + **Gmail poller / `DATABASE_URL` / optional dedupe** (short operational summary).
- **Outbound marketing (Instantly, etc.):** verify sending domains in **Google Postmaster Tools** and keep **SPF/DKIM/DMARC** aligned with the same identities — see **`docs/Deploy_Guide.md`** § Email infrastructure.
- **`cid-connect`** (sibling repo): **`docs/ARCHITECTURE.md`**, **`docs/WORKFLOW_HANDOFF.md`**, **`docs/STAGING_INTEGRATION_TEST_PLAN_DRAFT.md`** — Connect vs pipeline DB, staging E2E.
