# CID — Partnership and diligence gaps

> **Canonical location (RSS):** `pdf-backend/docs/partnership-gaps.md`  
> **As of:** 2026-06-04 (America/Denver). Review with **Ray** for governance, inter-company, and exit readiness.
>
> **Related:** Full registry → [`partnerships.md`](./partnerships.md). Compliance timeline → [`compliance-roadmap.md`](./compliance-roadmap.md). Technical vendors → [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md).

---

## Summary

CID’s **technology stack is diligence-friendly** (hosted on vendors that typically carry SOC 2 Type II). Gaps are mostly **governance and paper**: carrier appointments by segment, formal partner agreements (especially **Coterie**), inter-company structure after **C-Corp** filing, vendor DPAs, and written security policies—not a missing database.

**Priority order below** is ranked for **exit readiness** and **carrier/API conversations**, not day-to-day coding.

---

## P0 — Before deep Coterie integration or strategic partner talks

| # | Gap | Risk if ignored | Recommended action | Owner |
|---|-----|---------------|-------------------|-------|
| 1 | **No segment → carrier/MGA appointment matrix** | Cannot answer “who is appointed for Electrical?” in diligence | One table: segment, appointing entity, carrier/MGA, traditional vs instant rail, status | Gerry / Rick |
| 2 | **Coterie — sandbox bind blocked (CO producer license)** | Cannot complete test bind or demo | Coterie enable CO license in sandbox; then bindable quote + webhook — see [`coterie-integration.md`](./coterie-integration.md) | Gerry |
| 3 | **Inter-company services agreement** (if multiple entities post C-Corp) | IP, billing, and liability unclear on acquisition | Ray drafts: who owns `pdf-backend`, Connect, HomeBase; cost allocation; employment | Ray |
| 4 | **Vendor DPAs / terms not centralized** | SOC 2 and privacy diligence stall | Folder of executed or click-through: Render, Google, BoldSign, Anthropic, Famous, Cloudflare | Gerry / Ray |

---

## P1 — First production bind milestone (M1) / Coterie pilot live

| # | Gap | Risk if ignored | Recommended action | Owner |
|---|-----|---------------|-------------------|-------|
| 5 | **SOC 2 — policies not written** | “We thought about security” fails audits | Adopt lightweight policies (see compliance roadmap § Now) | Gerry / Ray |
| 6 | **MFA not enforced everywhere** | Access control finding | MFA on GitHub, Render, Netlify, Google Workspace, BoldSign, Coterie dashboard | Gerry |
| 7 | **Insured data flow map** | Privacy criterion unclear | One diagram: S1 forms → cid-postgres → Connect bridge; what hits Famous/Coterie | Gerry |
| 8 | **Instant vs traditional rail undocumented** | Ops and legal ambiguity | Document in `corporate-structure.md` + operator runbook when Coterie live | Gerry |
| 9 | **Post-bind insured comms (Coterie)** | Customer relationship leaks to carrier | Confirm Coterie emails vs CID welcome; same-day Connect invite | Gerry |

---

## P2 — Scale (~100 binds / strategic conversations)

| # | Gap | Risk if ignored | Recommended action | Owner |
|---|-----|---------------|-------------------|-------|
| 10 | **SOC 2 Type I readiness tool** | Manual evidence collection | Vanta, Drata, or Secureframe (~$500–800/mo startup tier) | Ray / Gerry |
| 11 | **Instantly / outbound formalized** | Marketing compliance questions | Vendor agreement + SPF/DKIM/DMARC evidence per segment domain | Rick |
| 12 | **Cohesive AI** | Informal lead handoff | Contract before routing leads to `quotes@` | Rick |
| 13 | **Carrier API roadmap** | “Email-only” limits valuation story | List segments where API bind (Coterie) vs email carrier is permanent | Gerry |

---

## P3 — Type II audit period / acquirer diligence

| # | Gap | Risk if ignored | Recommended action | Owner |
|---|-----|---------------|-------------------|-------|
| 14 | **SOC 2 Type I audit** | Cannot claim “Type I complete” | Engage auditor after readiness tool green | Ray |
| 15 | **SOC 2 Type II** (6–12 mo operating effectiveness) | Enterprise/carrier asks for Type II | Run observation period after Type I | Ray |
| 16 | **Quarterly access reviews** | Security criterion gap | Even 3-person founder review log | Gerry |
| 17 | **Logging / monitoring for policyholder data access** | Confidentiality / privacy evidence | Document operator + `/api/connect` access controls | Gerry |
| 18 | **HelloSign legacy sunset** | Confusion on bind evidence | Retention policy + disable new HelloSign binds | Gerry |

---

## Segments live today — carrier appointment check

Use this as a working checklist (fill names with Ray / Gerry):

| Segment | Intake live | Ops inbox | Named appointing carrier/MGA (traditional) | Instant rail (Coterie) |
|---------|-------------|-----------|---------------------------------------------|-------------------------|
| bar | Yes | quote@barinsurancedirect.com | _Document_ | TBD |
| roofer | Yes | quotes@roofingcontractorinsurancedirect.com | _Document_ | TBD |
| plumber | Yes | quotes@plumberinsurancedirect.com | _Document_ | TBD |
| hvac | Yes | quotes@hvacinsurancedirect.com | _Document_ | TBD |
| fitness | Yes | quotes@fitnessinsurancedirect.com | _Document_ | Pilot candidate |
| electrical | Yes | quotes@electricalinsurancedirect.com | _Document_ | **Coterie ConnectQuote CO pilot** (sandbox) |

---

## Recommended sequence (one page for Ray)

1. **Now (no audit cost):** Written policies + MFA + vendor DPAs + appointment matrix draft + inter-company outline.  
2. **Coterie sandbox:** Partner agreement path parallel to technical validation.  
3. **M1 — first binds + Coterie pilot:** Data flow map; readiness tool optional start.  
4. **M2 — strategic interest:** SOC 2 **Type I** in progress or complete.  
5. **Exit / scale:** SOC 2 **Type II** observation period; partnership registry maintained.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | Initial gap analysis P0–P3; segment appointment checklist; Ray inter-company item. |
| 2026-06-04 | Coterie sandbox credentials issued; applications OK; CO producer license pending for bindable quote. |
