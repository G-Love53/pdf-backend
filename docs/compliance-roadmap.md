# CID — Compliance and security roadmap (Ray review)

> **Canonical location (RSS):** `pdf-backend/docs/compliance-roadmap.md`  
> **As of:** 2026-05-20 (America/Denver). **For:** founders / counsel review (Gerry, Rick, Ray). Not legal advice.
>
> **Related:** [`partnerships.md`](./partnerships.md) · [`partnership-gaps.md`](./partnership-gaps.md) · [`corporate-structure.md`](./corporate-structure.md) · [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md)

---

## Executive summary (read this first)

**Your understanding is correct:**

- You **do not** need a SOC 2 audit **now**, and you **should not** budget **$30k–50k+** for a formal audit until you are closer to carrier-scale API volume or an active acquisition process.
- You **do** need to **build and plan**: written policies, access controls (MFA), vendor documentation, and a clear story that CID runs on **SOC 2–certified infrastructure** while CID itself moves toward **Type I → Type II** on a defined timeline.

**Say today (accurate):**

> Commercial Insurance Direct LLC operates on infrastructure partners that maintain SOC 2 Type II (e.g. Render, Netlify, GitHub). CID is designing controls for a future SOC 2 Type I audit; formal certification is on the roadmap, not yet complete.

**Do not say:**

> “CID is SOC 2 compliant.”

---

## Where we are today

| Area | Status | Notes |
|------|--------|-------|
| **Legal entity** | **All Access Insurance** (CO) · dba **Commercial Insurance Direct** | Segment brands under umbrella; see `corporate-structure.md` |
| **C-Corp filing** | In progress / planned | Align cap table, bylaws, and **inter-company** agreements with Ray |
| **CID SOC 2 audit** | **Not started** | No Type I or Type II report for CID as organization |
| **Infrastructure vendors** | **Strong foundation** | Render, Netlify, GitHub commonly provide SOC 2 Type II; verify current trust pages annually |
| **Coterie** | **Sandbox live (CO)** | API + sandbox bind; ConnectQuote E2E; partner DPA + prod keys TBD |
| **Written security policies** | **Gap** | Likely practices exist; need documentation |
| **MFA on admin systems** | **Verify** | GitHub, Render, Netlify, Google Workspace, BoldSign, Coterie |
| **Vendor DPAs** | **Gap** | Collect click-through / executed terms in one folder |
| **Carrier appointments (by segment)** | **Gap** | Document who appoints CID for each live segment |
| **Privacy / data map** | **In progress** | PII in forms + cid-postgres; Coterie/Stripe on instant rail — document in data map |

---

## SOC 2 in plain language

**SOC 2** is an audit of **controls**, not a code certification. Trust Service Criteria most relevant to CID:

| Criterion | Why it matters to CID |
|-----------|------------------------|
| **Security** (required) | Access, encryption, incidents, change management |
| **Availability** | Render/Netlify uptime, monitoring |
| **Confidentiality** | Policyholder and submission data in pipeline + Connect |
| **Privacy** | Contact info, business financials, future payment flows via Coterie/Stripe |

| Audit type | What it proves | Typical timing |
|------------|----------------|----------------|
| **Type I** | Controls designed appropriately **at a point in time** | ~2–3 months after readiness prep |
| **Type II** | Controls **operating effectively** over 6–12 months | What serious buyers and carriers often want |

**Inherited compliance:** Auditors review **your** vendors. Using SOC 2–certified hosts reduces infrastructure findings; it does **not** replace CID policies and access reviews.

---

## What we already have (technology)

From [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md):

- **Encryption in transit:** HTTPS (Netlify, Render, API clients).
- **Encryption at rest:** Render Postgres, R2 (provider-dependent; document in policies).
- **Secrets:** Env vars on Render; no service role in browser (Connect uses anon + bridge).
- **Change management:** GitHub → deploy; document review process for founders.
- **E-sign / bind evidence:** BoldSign (active); HelloSign legacy only.
- **AI:** Claude primary, Gemini fallback; document data handling for prompts.

---

## Roadmap by phase

### Phase 0 — Now (C-Corp + Ray review) · **$ minimal**

**Goal:** Diligence-ready **documentation**, not audit.

| Action | Deliverable | Owner | Target |
|--------|-------------|-------|--------|
| Confirm entity structure | LLC vs C-Corp hierarchy documented | Ray | With filing |
| Inter-company services agreement (if needed) | IP ownership, billing, employees | Ray | With filing |
| **Information Security Policy** (1–2 pages) | Passwords, MFA, acceptable use | Gerry / Ray | 2 weeks |
| **Incident Response Plan** (outline) | Who to call, breach notification steps | Gerry | 2 weeks |
| **Access Control Policy** | Who has Render/GitHub/Gmail/operator | Gerry | 2 weeks |
| **Vendor list + DPAs** | Folder + `partnerships.md` maintained | Gerry | 2 weeks |
| **MFA enforcement** | GitHub, Google, Render, Netlify, BoldSign | Gerry | 2 weeks |
| **Segment carrier appointment matrix** | Fill blanks in `partnership-gaps.md` | Gerry / Rick | 3 weeks |
| **Accurate external narrative** | No “SOC 2 compliant” claim | All | Immediate |

**Cost:** Internal time only; optional lawyer time for inter-company / C-Corp.

---

### Phase 1 — M1: First binds + Coterie sandbox live · **$ low**

**Goal:** Operational controls match what you tell partners.

| Action | Deliverable | Owner | Target |
|--------|-------------|-------|--------|
| Coterie DPA / partner agreement | Executed or in review | Gerry / Ray | With sandbox |
| **Data flow diagram** | S1 → cid-postgres → Connect; Famous; Coterie | Gerry | M1 |
| **Data retention / destruction** policy | R2, Postgres, email retention | Gerry / Ray | M1 |
| **Change management** policy | PR/review, deploy to Render | Gerry | M1 |
| Post-bind Connect attach | % bound policies invited to Connect within 7 days | Gerry | M1 metric |
| Coterie webhook + bind → policy row | Technical control for instant rail | Gerry | M1 |

**Cost:** Still no SOC audit; possible Coterie/legal fees only.

---

### Phase 2 — M2: ~100 binds / strategic or carrier API depth · **$ medium**

**Goal:** “SOC 2 Type I in progress or complete.”

| Action | Deliverable | Owner | Target |
|--------|-------------|-------|--------|
| SOC 2 **readiness platform** | Vanta, Drata, or Secureframe | Ray / Gerry | ~$500–800/mo |
| Evidence automation | GitHub, Render, Netlify, MFA proofs | Gerry | 1–2 months on tool |
| **Vendor Management Policy** | Coterie, carriers, AI vendors | Ray | With tool |
| **Background check policy** | Anyone with policyholder DB access | Ray | If required by tool/auditor |
| Engage auditor for **Type I** | Point-in-time report | Ray | When tool shows green |

**Cost ballpark:** Readiness tool ~$6k–10k/year; Type I audit often **$15k–30k** (varies by firm and scope).

---

### Phase 3 — Exit / scale · **$ higher**

**Goal:** Type II for acquirer or large carrier diligence.

| Action | Deliverable | Owner | Target |
|--------|-------------|-------|--------|
| **SOC 2 Type II** observation period | 6–12 months controls operating | Ray | After Type I |
| Quarterly access reviews | Logged reviews | Gerry | Quarterly |
| Monitoring / logging narrative | Operator + Connect access | Gerry | Type II prep |

**Cost ballpark:** Type II often **$30k–50k+** depending on scope and auditor.

---

## C-Corp filing — compliance touchpoints (for Ray)

| Topic | Question for counsel |
|-------|----------------------|
| **Entity** | C-Corp parent vs operating LLC? |
| **IP** | Who owns platform code (repos), HomeBase, Connect? |
| **Contracts** | Agency appointments, Coterie partner agreement, customer ToS/Privacy |
| **Insurance** | E&O, cyber liability timing |
| **Inter-company** | Services agreement between entities if split |

Platform compliance docs live in **`pdf-backend/docs/`**; corporate filings live with Ray’s files—cross-reference this roadmap.

---

## Partner-facing security line (Coterie, carriers)

> We run on SOC 2–certified infrastructure providers, maintain written security policies and MFA on administrative systems, and are executing a SOC 2 Type I readiness program aligned with our API and policyholder data growth. We can provide our vendor registry and data flow summary under NDA.

---

## Download / share with Ray

This file is Markdown in the repo:

**`pdf-backend/docs/compliance-roadmap.md`**

To share as PDF:

1. Open in Cursor / VS Code → Markdown preview → Print → Save as PDF, or  
2. From repo root: `pandoc docs/compliance-roadmap.md -o CID-Compliance-Roadmap.pdf` (if pandoc installed), or  
3. Copy into Google Docs / Notion for a one-time export.

Also share: [`partnership-gaps.md`](./partnership-gaps.md) (prioritized backlog) and [`partnerships.md`](./partnerships.md) (full registry).

---

## Decision log (founders)

| Date | Decision |
|------|----------|
| 2026-05-20 | No SOC 2 audit until M2-scale; document controls now; Type I after readiness tool + first binds. |
| 2026-05-20 | External claim: infrastructure partners SOC 2; CID certification **roadmap**, not complete. |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | Initial roadmap for Ray review; phases 0–3; cost ranges; accurate SOC positioning. |
