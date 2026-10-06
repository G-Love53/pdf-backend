# CID documentation

**One editable home for pipeline, carriers, deploy, and partnerships:** this repo’s `docs/`. Connect the app in `cid-connect/docs/`. Decisions that must survive a new agent: [`docs/decisions-log.md`](./docs/decisions-log.md).

`~/GitHub/CID-docs/` and any `*.md` in the home folder are **indexes**. They point here. Do not paste a second full copy. `/Volumes/CID_Master/docs-snapshots/` is a dated read-only archive. Do not edit `CID_MASTER_OLD_DO_NOT_USE`.

## Rules (audit and sale)

1. Change a procedure in `pdf-backend/docs/` (or `cid-connect/docs/` for the app). Commit it. That is the diligence copy.
2. Status lines say what a customer URL does today. Sandbox signed-off is not “live.”
3. When a call would change the next session, add a dated entry to `docs/decisions-log.md`.
4. After a doc pass, copy `docs/` to `/Volumes/CID_Master/docs-snapshots/YYYY-MM-DD/`. That folder is not a working tree.
5. Keep old filenames so links still open. Replace drifted duplicates with a pointer. Git history keeps the old text.

| Document | Description |
|----------|-------------|
| **[docs/connectquote-segment-deploy.md](./docs/connectquote-segment-deploy.md)** | **ConnectQuote segment launch** — Netlify, API, Gmail, poller (not outreach) |
| **[docs/Deploy_Guide.md](./docs/Deploy_Guide.md)** | **Canonical** — Render, Netlify, env, post-deploy checks, intake JSON contract, **Postmaster** + campaign DNS alignment, GitHub heartbeat notes |
| **[docs/VENDORS_S1_S6_CONNECT.md](./docs/VENDORS_S1_S6_CONNECT.md)** | **Dated** — vendors by S1–S6 stage and Connect; active vs legacy vs marketing-only |
| **[docs/corporate-structure.md](./docs/corporate-structure.md)** | **Dated** — legal entity, segment brands/domains/inboxes, partner narrative vs internal stack |
| **[docs/partnerships.md](./docs/partnerships.md)** | **Dated** — partnerships/integrations registry (exit, carriers, vendors, SOC vendor status) |
| **[docs/partnership-gaps.md](./docs/partnership-gaps.md)** | **Dated** — diligence gaps P0–P3; segment carrier appointments; Ray inter-company |
| **[docs/compliance-roadmap.md](./docs/compliance-roadmap.md)** | **Dated** — SOC 2 / security roadmap for founder & counsel review (download/share with Ray) |
| **[docs/coterie-integration.md](./docs/coterie-integration.md)** | **Dated** — Coterie ConnectQuote technical spec (AKHash, API, prod CO segments, env — no secrets) |
| **[docs/agent-start.md](./docs/agent-start.md)** | **Start here for any agent** — live vs not live, plus lanes (general, new carrier, GUARD go-live, Connect, outreach) |
| **[docs/decisions-log.md](./docs/decisions-log.md)** | Dated calls (GUARD prod, COI, NEXT, geography). No secrets |
| **[docs/connect-coi-carrier.md](./docs/connect-coi-carrier.md)** | **Connect COI** — ConnectQuote partners (Coterie, GUARD) issue certs; long-form keeps CID ACORD 25 |
| **[docs/Segment_Template.md](./docs/Segment_Template.md)** | What a segment repo is. Operator / S4–S6 stay in this repo |
| **[docs/DEPLOY_SEGMENTS.md](./docs/DEPLOY_SEGMENTS.md)** | Long-form segment add on CID-PDF-API. ConnectQuote launches use `connectquote-segment-deploy.md` |
| **[docs/guard-integration.md](./docs/guard-integration.md)** | **GUARD WC spec** — SOAP, NBQ/NBS/BND/SBR, Connect policy row |
| **[docs/guard-wc-rollout.md](./docs/guard-wc-rollout.md)** | **GUARD WC launch** — registry + Render env + CO Electrical / new segment |
| **[docs/guard-uat-runbook.md](./docs/guard-uat-runbook.md)** | **GUARD P-env / partner-test** |
| **[docs/Workers_Comp.md](./docs/Workers_Comp.md)** | **Due diligence start-here** for GUARD WC — points at the files above |
| **[docs/connectquote-shipped-2026-06.md](./docs/connectquote-shipped-2026-06.md)** | **Dated** — ConnectQuote shipped summary (investor/handoff): architecture, segments, demo URLs, verification checklist |
| **[docs/outreach-claude-playbook.md](./docs/outreach-claude-playbook.md)** | **Dated** — Instantly campaigns: list cleaning, attribution (`ch`/`src`/`cid`), HTML paste checklist, verified failure modes, **prefill policy** |
| **[docs/localprospects-list-design.md](./docs/localprospects-list-design.md)** | **Dated** — LocalProspects CO pulls: dedupe, ZIP extraction, category allowlist, credit economics, Instantly upload |
| **[docs/outreach-creatives.md](./docs/outreach-creatives.md)** | **Dated** — Segment email JPEG + HTML registry; Netlify deploy methods (Drop vs git) |
| **[docs/connectquote-operator-learning.md](./docs/connectquote-operator-learning.md)** | **Dated** — ConnectQuote C&F metrics; **Click → Bind** at `/operator/funnel` |
| **[docs/partner-layer.md](./docs/partner-layer.md)** | **Internal** — Partner Layer registry, mint URL, attribution (`ch=partner-{id}`) |
| **[docs/partner-layer-onboarding.md](./docs/partner-layer-onboarding.md)** | **Give to a partner’s team** — how to add the CID quote link (no internals) |
| **[docs/CID_IP_AND_ACQUIRER_PROTECTION.md](./docs/CID_IP_AND_ACQUIRER_PROTECTION.md)** | **Partner Shared drive** — IP / AI-assisted build / what a buyer CIO purchases |
| **[docs/CID_Overview.md](./docs/CID_Overview.md)** | **Partner Shared drive** — company overview (purpose, live footprint, SAFE, strategic outcome) |
| **[docs/Distribution_Validation_Plan.md](./docs/Distribution_Validation_Plan.md)** | **Partner Shared drive** — SAFE capital: channel × vertical × state tests and scorecard |
| **[docs/CID_INVESTMENT_THESIS.md](./docs/CID_INVESTMENT_THESIS.md)** | **Partner Shared drive** — investor thesis (Ray/Rick); auto-synced on push |
| **[docs/00 PARTNER_README.md](./docs/00%20PARTNER_README.md)** | Partner Shared drive index |
| **[docs/PARTNER_DOCS_SETUP.md](./docs/PARTNER_DOCS_SETUP.md)** | One-time Google service account + GitHub secrets for Drive sync (internal) |
| **[docs/connectquote-build-day.md](./docs/connectquote-build-day.md)** | Demo script (5–7 min) for ConnectQuote walkthroughs |
| **[docs/coterie-sandbox-fixtures.md](./docs/coterie-sandbox-fixtures.md)** | Redacted Coterie API + ConnectQuote intake examples (E0122, webhook TBD) |
| **[docs/OPERATOR_DAILY_RUNBOOK.md](./docs/OPERATOR_DAILY_RUNBOOK.md)** | Operator quote → bind → policy flow; **S5 client email** preview/send expectations |
| **[OPERATOR_SEGMENT_AUDIT.md](./OPERATOR_SEGMENT_AUDIT.md)** | Segment filter audit + **S5 email** behavior (shared backend) |
| [CID-docs/README.md](../CID-docs/README.md) | Finder index only. Each file there points back to this repo |

---

## Repo-local notes (`pdf-backend`)

- **`README.md`** — Bar segment + **Gmail poller / `DATABASE_URL` / optional dedupe** (short operational summary).
- **Outbound marketing (Instantly, etc.):** verify sending domains in **Google Postmaster Tools** and keep **SPF/DKIM/DMARC** aligned with the same identities — see **`docs/Deploy_Guide.md`** § Email infrastructure. Campaign runbook: **`docs/outreach-claude-playbook.md`** · asset registry: **`docs/outreach-creatives.md`**.
- **`cid-connect`** (sibling repo): **`docs/ARCHITECTURE.md`**, **`docs/WORKFLOW_HANDOFF.md`**, **`docs/STAGING_INTEGRATION_TEST_PLAN_DRAFT.md`** — Connect vs pipeline DB, staging E2E.
