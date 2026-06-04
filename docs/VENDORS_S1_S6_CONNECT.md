# CID vendors — S1–S6 pipeline and Connect

> **Canonical location (RSS):** `pdf-backend/docs/VENDORS_S1_S6_CONNECT.md` — version with **CID-PDF-API** on Render.  
> **As of:** 2026-05-15 (America/Denver). Update this date when vendors or roles change.

**Purpose:** One dated reference for **who we use** (and what we dropped) across intake → operator → bind and **CID Connect**. For deploy steps and env var names, see [`Deploy_Guide.md`](./Deploy_Guide.md). For daily ops, see [`OPERATOR_DAILY_RUNBOOK.md`](./OPERATOR_DAILY_RUNBOOK.md). For Connect architecture, see **`cid-connect`** [`docs/ARCHITECTURE.md`](https://github.com/G-Love53/cid-connect/blob/main/docs/ARCHITECTURE.md). For business registry, gaps, and SOC roadmap, see [`partnerships.md`](./partnerships.md), [`partnership-gaps.md`](./partnership-gaps.md), [`compliance-roadmap.md`](./compliance-roadmap.md).

---

## Two stacks (do not confuse)

| Stack | Primary data | Main vendors |
|-------|----------------|--------------|
| **Pipeline (S1–S6)** | **Render Postgres** (`DATABASE_URL` on CID-PDF-API) | Render, Gmail/Google, R2, BoldSign, Anthropic (+ Gemini), Puppeteer/Chrome in Docker |
| **Connect (SPA + app shell)** | **Famous** (auth, app tables) + **cid-postgres** when `VITE_CID_API_URL` is set | Famous (DatabasePad), Netlify, CID-PDF-API, Resend (Edge), R2/Gmail on API for bridge COI |

---

## By pipeline stage (S1–S6)

| Stage | What happens | Vendors in use | Notes |
|-------|----------------|----------------|-------|
| **S1 — Capture** | Lead opens segment form or lands from outreach | **Netlify** (segment `Netlify/`), **GoDaddy** (or registrar DNS), **CID-PDF-API** (Render) | Form posts to `POST /submit-quote` on **one** API host with `segment` in JSON |
| **S2 — Submit** | Record submission, render PDFs, email carrier packet | **Render**, **Render Postgres**, **Gmail** (app passwords), **Cloudflare R2**, **Puppeteer/Chrome** (in image) | Short **`[CID][Submission]`** ops ping to segment `quotes@…` inbox (all segments) |
| **S3** | *(Grouped with submit in practice)* | Same as S2 | No separate third-party product |
| **S4 — Carrier ingest + review** | Poller reads inbox; quote PDFs → R2; extraction queue | **Gmail** (OAuth poller), **Google Cloud** (OAuth client), **Render**, **Postgres**, **R2**, **Anthropic** | Operator UI on Render `/operator` |
| **S5 — Client packet** | Sales letter + email quote packet to insured | **Render**, **Gmail**, **Anthropic** (primary), **Gemini** (fallback), **R2** | **OpenAI** not wired in `pdf-backend` letter/chat today |
| **S6 — Bind** | E-sign, policy row, bind/welcome mail | **BoldSign**, **Render**, **Postgres**, **R2**, **Gmail** | **HelloSign/Dropbox Sign** legacy webhook only |

---

## Connect (insured portal + admin)

| Area | Vendors in use | When / notes |
|------|----------------|--------------|
| **Auth & app shell** | **Famous** (Supabase-compatible / DatabasePad) | `VITE_SUPABASE_URL` + anon key in browser |
| **Hosted SPA** | **Netlify** (typical) | Optional; build from Git or other static host |
| **Insured insurance data (bridge)** | **CID-PDF-API** (Render) + **Render Postgres** | When **`VITE_CID_API_URL`** is set — `/api/connect/*` |
| **Insured data (legacy)** | **Famous** tables + RLS | When bridge URL **unset** |
| **Coverage chat** | **Anthropic + Gemini** on API (bridge) or Famous **`coverage-chat`** Edge | Bridge: `POST /api/connect/chat` |
| **COI (bridge)** | **API** + **Postgres** + **R2** + **Gmail** on Render | Auto-fulfill when `CONNECT_COI_AUTO_FULFILL` + R2 + Gmail configured |
| **App notifications / renewals cron** | **Resend** via Famous Edge Functions | e.g. `send-notification`, `check-renewals` — not the main COI path in bridge mode |
| **Bind in browser** | *(removed)* | Bind is **S6 on API** → **cid-postgres**; Connect does not run in-app Famous bind |

---

## Cross-cutting infrastructure

| Vendor | Role |
|--------|------|
| **GitHub** | Source of truth for `pdf-backend`, `cid-connect`, segment repos, **CID_HomeBase** |
| **Render** | Host **CID-PDF-API**; **Render Postgres** for pipeline DB |
| **Netlify** | Segment intake sites + often Connect |
| **Google Postmaster Tools** | Sending-domain reputation (campaign + transactional DNS alignment) — operational, not app code |
| **Cohesive AI** | **Planned** — outsourced warm leads forwarded to `quotes@…`; **not in production code** |
| **Instantly** | **Marketing** — cold outbound / warming; documented with Postmaster/SPF; **not** auto-wired into S1 API |

---

## Dropped or demoted (historical)

| Was | Now |
|-----|-----|
| **HelloSign / Dropbox Sign** (new binds) | **BoldSign** (legacy HelloSign webhook for old rows) |
| **Per-segment Render** `submit-quote` (e.g. `bar-pdf-backend.onrender.com`) | **Single CID-PDF-API** `cid-pdf-api.onrender.com` |
| **Connect `bindQuote`** writing Famous policies | **S6** → **cid-postgres**; Connect reads via bridge |
| **Famous as canonical pipeline DB** (target) | **cid-postgres** for submissions/quotes/policies when bridge on |
| **`coverage-chat` Edge** as primary chat (bridge builds) | **`/api/connect/chat`** on Render |
| **OpenAI** for S5 letters / Connect chat on API | **Claude + Gemini** only in `pdf-backend` today |
| **Instantly → automatic S1** in API | Not implemented; marketing layer only |

---

## Master vendor list (current)

| Vendor | S1 | S2–S3 | S4 | S5 | S6 | Connect | Status |
|--------|:--:|:-----:|:--:|:--:|:--:|:-------:|--------|
| **Render** (Web Service) | — | ✓ | ✓ | ✓ | ✓ | — | Active |
| **Render Postgres** | — | ✓ | ✓ | ✓ | ✓ | Bridge reads | Active (pipeline DB) |
| **Netlify** | ✓ | — | — | — | — | ✓ | Active |
| **Gmail / Google Workspace** | — | ✓ | ✓ | ✓ | ✓ | COI (bridge) | Active |
| **Google Cloud (OAuth)** | — | — | ✓ | — | — | — | Active (poller) |
| **Cloudflare R2** | — | ✓ | ✓ | ✓ | ✓ | ✓ | Active |
| **BoldSign** | — | — | — | — | ✓ | — | Active (new binds) |
| **Anthropic (Claude)** | — | — | ✓ | ✓ | — | ✓ (bridge chat) | Active |
| **Google Gemini** | — | — | — | ✓ | — | ✓ (fallback) | Active |
| **Puppeteer / Chrome** | — | ✓ | — | — | — | — | In Docker image |
| **Famous (DatabasePad)** | — | — | — | — | — | ✓ | Active (app/auth) |
| **Resend** | — | — | — | — | — | ✓ (Edge mail) | Active (app notifications) |
| **GoDaddy / registrar** | ✓ | — | — | — | — | — | DNS |
| **GitHub** | — | — | — | — | — | — | Source control |
| **HelloSign / Dropbox Sign** | — | — | — | — | Legacy | — | Legacy webhook only |
| **OpenAI** | — | — | — | — | — | — | Not wired (API) |
| **Instantly** | Marketing | — | — | — | — | — | Ops / DNS; not in S1 code |
| **Cohesive AI** | Planned | — | — | — | — | — | Not in repo yet |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-15 | Initial vendor table: S1–S6 + Connect; BoldSign active; HelloSign legacy; single CID-PDF-API intake; bridge vs Famous split; Cohesive/Instantly called out as non-pipeline. |
