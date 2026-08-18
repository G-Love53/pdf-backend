# START HERE — CID Partner Docs

> **Shared drive:** CID Partner Docs (Google Workspace)  
> **As of:** 2026-08-18  
> **Owner:** Gerry (`g@commercialinsurance-direct.com`)  
> **Members:** Ray (Content manager), Rick (Contributor) · GC Bob Hersher — planned

---

## What this folder is

Partner-facing documentation for **Commercial Insurance Direct / All Access Insurance**: platform architecture, audit posture, compliance roadmap, partnerships registry, and ConnectQuote (instant quote-and-bind) summary.

**No secrets** — env var names may appear; no keys, tokens, or credentials.

**Not included:** internal deploy runbooks, Instantly/outreach ops, operator SQL, or maintenance tooling. Those stay in Git for the build team only.

---

## How it stays current

We edit docs in **Git** (`pdf-backend/docs/`). On push to `main`, a GitHub Action syncs every file in **`partner-manifest.txt`** to this Shared drive folder (same filename → overwrite).

If a doc looks stale, ask Gerry — **Git is always the source of truth.** Setup: **`PARTNER_DOCS_SETUP.md`** (internal, not in this folder).

---

## Suggested read order

### Ray (counsel / diligence)

1. **[AUDIT_READINESS.md](./AUDIT_READINESS.md)** — what is auditable today (S1–S6): submissions, timeline, R2 docs, bind trail  
2. **[CID_ARCHITECTURE.md](./CID_ARCHITECTURE.md)** — single-backend rule, end-to-end pipeline, operator surfaces  
3. **[compliance-roadmap.md](./compliance-roadmap.md)** — SOC 2 / security roadmap  
4. **[partnership-gaps.md](./partnership-gaps.md)** — diligence backlog P0–P3  
5. **[corporate-structure.md](./corporate-structure.md)** — legal entity, segment brands, partner narrative  
6. **[partnerships.md](./partnerships.md)** — vendor/carrier registry and SOC vendor status  

Then as needed: **System_Flow.md** (one-page diagram), **connectquote-shipped-2026-06.md** (ConnectQuote product summary).

### Rick (ops / partner)

1. **[connectquote-shipped-2026-06.md](./connectquote-shipped-2026-06.md)** — what shipped, CO geography, segments on marketing rail  
2. **[corporate-structure.md](./corporate-structure.md)** — brands, domains, inboxes  
3. **[partnerships.md](./partnerships.md)** — who we depend on (Coterie, Render, Instantly, etc.)  
4. **[coterie-integration.md](./coterie-integration.md)** — Coterie API rail (technical, no secrets)  
5. **[connectquote-build-day.md](./connectquote-build-day.md)** — demo walkthrough script  

---

## Document index

| Document | Topic |
|----------|--------|
| **board-resolution-officer-titles-2026.md** | Board resolution — officer title amendment (Aug 2026) |
| **00 PARTNER_README.md** | This file — start here |
| **AUDIT_READINESS.md** | Audit posture: Postgres, R2, timeline, bind artifacts (S1–S6) |
| **CID_ARCHITECTURE.md** | Platform architecture: intake → operator → bind → service |
| **System_Flow.md** | One-page LEG 1 → LEG 2 → LEG 3 flow |
| **CID_CONNECT.md** | CID Connect (insured app): Famous vs API, post-bind service |
| **connectquote-shipped-2026-06.md** | ConnectQuote shipped summary — investor/handoff |
| **corporate-structure.md** | LLC, segment brands/domains, partner-facing narrative |
| **partnerships.md** | Partnerships and integrations registry |
| **partnership-gaps.md** | Diligence gaps and next actions |
| **compliance-roadmap.md** | SOC 2 / security roadmap |
| **coterie-integration.md** | Coterie ConnectQuote technical spec |
| **VENDORS_S1_S6_CONNECT.md** | Vendors by pipeline stage (S1–S6) and Connect |
| **connectquote-partner-demo.md** | Partner demo (Fitness sandbox) |
| **connectquote-build-day.md** | ConnectQuote demo script |
| **direct-partner-discovery-rss.md** | Carrier/MGA discovery questions (RSS framework) |
| **coterie-sandbox-fixtures.md** | Redacted Coterie API / intake examples |

---

## Key facts (quick reference)

| Topic | Today (Aug 2026) |
|-------|------------------|
| **Platform company** | Commercial Insurance Direct, Inc. (CO C Corp, EIN 42-3060315) |
| **Agency of record** | All Access Insurance dba Commercial Insurance Direct (CO) · Rick Cline, producer |
| **Officers** | Ray — Executive Chairman · Gerry — CEO · Rick — CRO (see `board-resolution-officer-titles-2026.md`) |
| **Pipeline backend** | Single service: **CID-PDF-API** on Render (`pdf-backend` repo) |
| **Insured app** | **CID Connect** at `connect.commercialinsurance-direct.com` |
| **Instant bind rail** | **Coterie API** — marketing **Colorado (CO) only** |
| **ConnectQuote marketing segments** | Electrical, Fitness, Beauty, Cleaning, Pet |
| **Traditional only (no ConnectQuote marketing)** | Bar, Roofer; HVAC/Plumber intake exists but not on marketing rail |
| **CID SOC 2** | Not certified — roadmap in `compliance-roadmap.md` |

---

## Questions

Reply in email or the shared thread with Gerry (`g@commercialinsurance-direct.com`).

---

*Last folder refresh: 2026-08-18 · Auto-sync from Git on push to `main` (see manifest in repo).*
