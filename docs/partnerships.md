# CID — Partnerships and integrations registry

> **Canonical location (RSS):** `pdf-backend/docs/partnerships.md`  
> **As of:** 2026-07-07 (America/Denver). Update when vendors, carriers, or status change.
>
> **Related:** Coterie ConnectQuote spec → [`coterie-integration.md`](./coterie-integration.md). **Direct partner discovery (RSS)** → [`direct-partner-discovery-rss.md`](./direct-partner-discovery-rss.md). Technical vendor-by-stage → [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md). Entity/brands → [`corporate-structure.md`](./corporate-structure.md). Diligence backlog → [`partnership-gaps.md`](./partnership-gaps.md). Compliance → [`compliance-roadmap.md`](./compliance-roadmap.md).

---

## Summary

**Commercial Insurance Direct, Inc.** (Colorado C Corporation, EIN 42-3060315) operates the platform; **All Access Insurance** (dba **Commercial Insurance Direct** on carrier paperwork, Colorado) is **agency of record** for insurance operations. Multi-segment commercial platform: segment intake (Netlify), single pipeline backend (**CID-PDF-API** on Render), insured service (**CID Connect**). Officer roster: [`corporate-structure.md`](./corporate-structure.md) · Board resolution: [`board-resolution-officer-titles-2026.md`](./board-resolution-officer-titles-2026.md).

**CID is not SOC 2 certified.** Several infrastructure partners publish SOC 2 Type II attestations we inherit in diligence; formal CID audit is planned—see [`compliance-roadmap.md`](./compliance-roadmap.md).

---

## Registry

| Partner / service | Category | Status | Our dependency (if this ends) | Their dependency on us | Integration type | SOC 2 / security (vendor) | Next action | Owner |
|-------------------|----------|--------|-------------------------------|-------------------------|------------------|----------------------------|-------------|-------|
| **Commercial Insurance Direct, Inc.** | Legal / Compliance | Live | Platform company; cap table, bylaws, board governance | N/A | N/A | N/A (entity governance) | Corporate records; officer titles per board resolution Aug 2026 | Ray / Gerry / Rick |
| **All Access Insurance** (dba Commercial Insurance Direct, CO) | Legal / Compliance | Live | **Agency of record** — appointments, producer, carrier paperwork | N/A | N/A | N/A (entity governance) | Appointments, filings, inter-company docs | Rick / Gerry |
| **Render** (Web Service + Postgres) | Infrastructure | Live | CID-PDF-API, operator, S4–S6, poller, Connect bridge down | Hosting revenue | Infrastructure hosting | Type II (verify trust page) | DPA on file; MFA on Render; env access list | Gerry |
| **Netlify** | Infrastructure | Live | Segment sites + typical Connect host | Hosting revenue | Infrastructure hosting | Type II (verify) | MFA; site access list | Gerry |
| **GitHub** | Infrastructure | Live | Source control, deploy path | N/A | Infrastructure / change mgmt | Type II (verify) | MFA; branch protection | Gerry |
| **Google Workspace / Gmail** | Infrastructure | Live | S2 submit email, S4 poller, S5/S6/COI mail | Workspace customer | Email routing | Google attestation | MFA; app password / OAuth inventory | Gerry |
| **Google Cloud (OAuth)** | Infrastructure | Live | Gmail poller OAuth client | N/A | API (OAuth) | Google | Document OAuth clients | Gerry |
| **Cloudflare R2** | Infrastructure | Live | PDFs, quotes, policy docs, COI artifacts | Storage customer | Object storage | Verify Cloudflare trust | Bucket access; lifecycle/retention | Gerry |
| **BoldSign** | Legal / Compliance | Live | S6 e-sign for new binds | E-sign customer | API + webhooks | Verify trust page | DPA; webhook secret rotation | Gerry |
| **HelloSign / Dropbox Sign** | Legal / Compliance | Legacy | Old bind rows only | N/A | Webhook (legacy) | — | Sunset / retention plan | Gerry |
| **Anthropic (Claude)** | API | Live | S4 extraction assist, S5 letters, Connect chat (bridge) | API usage | API | Vendor policies | Key custody; minimize PII in logs | Gerry |
| **Google Gemini** | API | Live | S5 / Connect chat fallback | API usage | API | Google | Same | Gerry |
| **Famous (DatabasePad)** | Infrastructure | Live | Connect auth, app tables, Edge functions | Platform customer | Auth + DB + Edge | **Confirm** with Famous | DPA; anon vs service role; no service role in browser | Gerry |
| **Resend** | API | Live | Connect app notifications / renewals (Edge) | Email volume | API (Edge) | Verify | Align SPF with sending domain | Rick |
| **GoDaddy / registrar** | Infrastructure | Live | DNS for segment + corporate domains | Domain customer | DNS | N/A | Document domain ownership | Rick |
| **Google Postmaster Tools** | Marketing / Compliance | Live | Sending-domain reputation monitoring | N/A | Operational | N/A | SPF/DKIM/DMARC evidence per domain | Rick |
| **Instantly** | Marketing | Live (ops) | Cold/warm outbound; **not wired to S1 API** | Lead gen customer | Marketing / links | Verify if available | Vendor terms; domain alignment | Rick |
| **Cohesive AI** | Marketing | Planned | Warm leads → segment `quotes@` | Referral partner | Email forward (planned) | N/A | Written lead-referral agreement before prod | Rick |
| **Coterie Insurance** | MGA / API carrier | **Prod live (CO)** | ConnectQuote instant rail — Electrical, Fitness, HVAC, Plumber | Distribution / API volume | API + webhooks (+ Stripe bind) | Coterie states compliant; confirm | DPA; issued-policy webhook + doc ingest; multi-state licensing | Gerry |
| **Stripe** (via Coterie) | API | **Live (prod + sandbox paths)** | Payment on Coterie instant bind | Payment volume | Embedded (Coterie) | Stripe Type II (standard) | PCI: insured pays Coterie/Stripe; CID not MoR; `pk_live_` for live card bind | Gerry |
| **USLI / CoverSmart** | Carrier | **Appointment** (small business + special events) | Optional second instant rail; COI/docs if no API | Distribution / premium | TBD — discovery | Verify USLI trust / DPA | Send RSS discovery (`direct-partner-discovery-rss.md`); API vs hosted; Connect handoff | Rick / Gerry |
| **Traditional carriers** (per segment) | Carrier | Live | Placement for non-instant risks | Submissions / premium | ACORD/SUPP + email (S1–S6) | Varies by carrier | **Named appointment matrix** (see gaps doc) | Gerry / Rick |
| **Coterie admitted insurers** (Spinnaker, Clear Spring, Benchmark) | Carrier | Via Coterie | Paper behind Coterie BOP/GL/PL | N/A | Via Coterie API | Carrier NAIC per Coterie FAQ | Document as Coterie paper, not direct CID API | Gerry |
| **CID_HomeBase** (repo / submodule) | Other | Live | Templates, mapping, PDF truth | Internal IP | Git submodule | N/A | Access control | Gerry |
| **Puppeteer / Chrome** (in Render image) | Other | Live | SVG→PDF render | N/A | In-container | N/A | Pin versions in Dockerfile | Gerry |
| **OpenAI** | API | Not wired | None on API path | N/A | — | — | Intentionally unused (Claude + Gemini) | — |
| **Apollo** (lead tests) | Marketing | Referenced | Test CSVs only (`src=apollo`) | N/A | UTM / outbound | — | Confirm if production lead source | Rick |

---

## Integration types (legend)

| Type | Meaning |
|------|---------|
| **Infrastructure hosting** | Render, Netlify, R2, DNS |
| **ACORD / S1–S6** | Intake → PDF → email → poller → operator → bind |
| **API** | REST/webhooks (Coterie, BoldSign, AI, Stripe-via-Coterie) |
| **Email routing** | Segment `quotes@…`, carrier packets, poller |
| **Auth + app DB** | Famous / Connect shell |
| **Bridge** | Connect reads cid-postgres via `/api/connect/*` |
| **Marketing** | Instantly, Cohesive (planned), Postmaster |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | Initial registry from repo markdown + VENDORS; Coterie in progress; SOC wording corrected (CID not certified). |
| 2026-06-04 | Coterie sandbox auth + applications validated; bindable blocked on CO producer license; see `coterie-integration.md`. |
| 2026-06-12 | ConnectQuote sandbox E2E shipped — bindable quotes, demo bind, Connect; see `connectquote-shipped-2026-06.md`. |
| 2026-07-07 | ConnectQuote **prod** expanded to HVAC + Plumber (CO); Coterie + Stripe rows updated; diligence docs aligned. |
| 2026-07-30 | USLI / CoverSmart row added; RSS direct-partner discovery template (`direct-partner-discovery-rss.md`). |
