# CID — Partnerships and integrations registry

> **Canonical location (RSS):** `pdf-backend/docs/partnerships.md`  
> **As of:** 2026-06-04 (America/Denver). Update when vendors, carriers, or status change.
>
> **Related:** Coterie ConnectQuote spec → [`coterie-integration.md`](./coterie-integration.md). Technical vendor-by-stage → [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md). Entity/brands → [`corporate-structure.md`](./corporate-structure.md). Diligence backlog → [`partnership-gaps.md`](./partnership-gaps.md). Compliance → [`compliance-roadmap.md`](./compliance-roadmap.md).

---

## Summary

**All Access Insurance** (dba **Commercial Insurance Direct**, Colorado) operates a multi-segment commercial insurance platform: segment intake (Netlify), single pipeline backend (**CID-PDF-API** on Render), and insured service (**CID Connect**). This registry is the **business and exit-facing** view—who we depend on, integration type, SOC posture of vendors, and next actions. It extends (does not replace) the S1–S6 vendor matrix in `VENDORS_S1_S6_CONNECT.md`.

**CID is not SOC 2 certified.** Several infrastructure partners publish SOC 2 Type II attestations we inherit in diligence; formal CID audit is planned—see [`compliance-roadmap.md`](./compliance-roadmap.md).

---

## Registry

| Partner / service | Category | Status | Our dependency (if this ends) | Their dependency on us | Integration type | SOC 2 / security (vendor) | Next action | Owner |
|-------------------|----------|--------|-------------------------------|-------------------------|------------------|----------------------------|-------------|-------|
| **All Access Insurance** (dba Commercial Insurance Direct, CO) | Legal / Compliance | Live | Legal entity for agency ops | N/A | N/A | N/A (entity governance) | Cap table, filings, inter-company docs | Gerry / Rick / Ray |
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
| **Coterie Insurance** | MGA / API carrier | **Sandbox live (CO)** | ConnectQuote instant rail — Electrical + Fitness | Distribution / API volume | API + webhooks (+ Stripe bind) | Coterie states compliant; confirm | DPA; issued-policy webhook; prod keys | Gerry |
| **Stripe** (via Coterie) | API | **Live (sandbox)** | Payment on Coterie instant bind | Payment volume | Embedded (Coterie) | Stripe Type II (standard) | PCI: insured pays Coterie/Stripe; CID not MoR | Gerry |
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
