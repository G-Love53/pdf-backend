# Connect COI — carrier-issued (ConnectQuote partners)

> **As of:** 2026-10-06. **Status:** spec only — not built.  
> **Supersedes:** ConnectQuote v1 “ignore Coterie COI; CID generates ACORD 25.”  
> **Related:** [`coterie-integration.md`](./coterie-integration.md) · [`guard-integration.md`](./guard-integration.md) · Instant COI UX is unchanged in cid-connect.

**Rule:** Instant quote-and-bind partners issue the **legal certificate**. CID Connect is the **request + vault + email** surface. We do not send the insured to a carrier portal, and we do not print a CID ACORD 25 as the official cert on those policies.

---

## Why

CID’s ACORD 25 is the right product for **long-form / agency-issued** certificates (packet + BoldSign). It is the **wrong** product for ConnectQuote:

| Rail | `bind_source` | Who issues the cert |
|------|---------------|---------------------|
| ConnectQuote BOP/GL | `coterie` | **Coterie** (carrier paper) |
| ConnectQuote WC | `guard` | **GUARD** (WC cert) |
| Future instant partners | their `bind_source` | **That carrier** |
| Traditional long-form | `boldsign` | **CID ACORD 25** (agency) |

Waiver of subrogation, primary/non-contributory, and additional insured are **carrier endorsements**, not wording we type on a home-grown ACORD 25.

---

## Customer path (same for every rail)

Connect UI does **not** change:

1. Instant COI → holder name/address, delivery email, cert type, optional requirements file.  
2. Request row in `coi_requests` (`submitted`).  
3. Fulfillment adapter by `coverage_data.bind_source`.  
4. Carrier PDF stored in `documents` (`coi_generated`) + emailed to delivery address.  
5. History / holder book / reissue stay in Connect.

No Coterie or GUARD login for the insured.

---

## Adapter (pdf-backend only)

`POST /api/connect/coi/request` already creates the row and calls `fulfillConnectCoiRequest`. Split that fulfill step:

```text
coi_requests
  → bind_source = coterie  → Coterie certificate adapter
  → bind_source = guard    → GUARD certificate adapter
  → bind_source = boldsign → existing CID ACORD 25
  → unknown / missing API  → status stays submitted; ops email quotes@
```

**Do not** silently fall back to CID ACORD 25 on a Coterie or GUARD policy. If the carrier cannot issue yet, the request waits in Connect (“processing”) and ops follows up. A CID-drafted cert on those policies is a compliance miss.

All adapters: **CID-PDF-API only.** No COI code in segment repos.

---

## Coterie (BOP/GL)

Two layers: **agent dashboard** (what Gerry walked on Demo Fitness `CSG-00507726-00`) vs **partner API** (what we can call). Instant COI in Connect must use the **API equivalent** of the dashboard. We do not log into `dashboard-v2.coterieinsurance.com` from CID-PDF-API.

### Dashboard actions (2026-10-06)

Policy toolbar: **Generate COI** · **Add Additional Insureds** · **Add Endorsements** · **Update Policy Info** · **Request Cancel**.

Instant COI maps to the first two only. Endorsement packages (blanket AI, liquor, HNOA, limit changes, …) and “update business name” are **not** Instant COI — those stay a future Connect “policy change” product.

| Connect Instant COI | Coterie dashboard | Instant? |
|---------------------|-------------------|----------|
| Type **standard** + holder name/address | **Generate COI** → Yes, add certificate holder (name, address, city, state, ZIP) → “Designated Additional Insured on the policy?” → Generate | **Yes** — PDF download |
| Type **standard**, no holder | Generate COI → No certificate holder | Yes |
| Type **waiver_subrogation** | **Add Additional Insureds** → Waiver of Rights of Recovery + AI type + effective date. Then Generate COI. | **No** — endorsement request (no backdate) |
| Type **primary_noncontributory** | Add Additional Insureds → Primary and Non-Contributory + AI type. Then Generate COI. | **No** — same |
| Type **special_wording** + notes / drag-drop | Generate COI has **no** file upload. AI form has “Additional information.” Landlord PDF stays on our `coi_requests` row. | Queue unless they take attachments |
| Holder already an AI? | Generate COI “Designated Additional Insured?” = **Yes** only if they **already are**. Adding them is a different button. | Split |

Coterie producer docs: Generate COI is a **download**. They do **not** email the cert. **CID emails** the PDF to Connect’s delivery address.

### Public API today (not the dashboard)

- Quote-time AI: `endorsements.additionalInsureds[]` on `POST …/commercial/quotes` (pre-bind only).  
- Retrieve: `GET /v1.6/commercial/policies/docs/links/{PolicyNumber}` (vault ingest we already run) and `GET /commercial/policies/{policyId}/documents` (`type`: `CertificateOfInsurance`).  
- **No** documented POST for Generate COI or Add Additional Insureds.

### Build process (once Coterie exposes dashboard APIs)

Connect UI does not change. All of this is **CID-PDF-API**.

1. Insured submits Instant COI → `coi_requests` (`submitted` → `processing`).  
2. Adapter reads `bind_source = coterie` and carrier `PolicyNumber` (e.g. `CSG-00507726-00`), not `CID-POL-*`.  
3. **Standard** → call Coterie **Generate COI** (holder fields + designated-AI flag). Receive PDF bytes or URL.  
4. **Waiver / PNC** → call **Add Additional Insureds** first (effective date = today, checkboxes, optional notes). Stay `processing` until that endorsement is issued. Then step 3.  
5. Download PDF → R2 `documents.coi_generated` (vault) → Gmail to `delivery_email` (same file) → `completed`.  
6. If Coterie also puts the cert on `docs/links`, existing ingest may duplicate — dedupe by URL/hash.  
7. Drag-drop file is **ours** (requirements). Do not treat it as the cert. Pass a note/URL to Coterie only if their API accepts it.

**Do not** scrape the dashboard or reuse Gerry’s browser session. **Do not** fall back to CID ACORD 25.

### Ask Coterie (blocker)

Partner API for the same two dashboard routes, authenticated with our existing secret key:

1. Generate COI — payload: policy number, optional holder (name, street, city, state, ZIP), designated AI yes/no; response: PDF or URL.  
2. Add Additional Insureds — payload: effective date, AI option, PNC, waiver, property interest, ACORD 28, notes, “send docs to AI.”  
3. Confirm whether a generated COI also appears on `docs/links` / `{policyId}/documents`.

Fixture they already have: Demo Fitness `CSG-00507726-00`.

---

## GUARD (WC) — after Electrical is live

Do **not** build a GUARD cert adapter until CO Electrical is live. Instant COI on a GUARD policy **queues** until then.

WC certificates are not a GL ACORD 25. Path (API / portal / email) is an ask for **Jon after launch**. Same rule: no CID-drafted WC cert.

---

## Long-form (unchanged)

`bind_source: boldsign` (and anything without a carrier cert API) keeps **CID ACORD 25** auto-fulfill. That is agency paper for packet customers.

---

## Connect states

| `coi_requests.status` | Meaning |
|-----------------------|---------|
| `submitted` | Recorded; adapter not done |
| `processing` | Waiting on carrier |
| `completed` | Carrier PDF in R2 + email attempted |
| `failed` | Carrier/API error; ops sees it; insured can retry |

Vault copy is the **carrier PDF**. Email copy is the same file. Requirements uploads stay on the request (landlord form), not a substitute cert.

---

## RSS

- **Reliable** — legal cert matches the policy that bound.  
- **Scalable** — one Connect form; new partner = one adapter + `bind_source`.  
- **Sellable** — landlords/GCs get carrier paper; Instant COI is a real product, not a CID facsimile.

---

## Open / owners

| Item | Owner | When |
|------|--------|------|
| Partner API for dashboard **Generate COI** + **Add Additional Insureds** | Gerry → Coterie | Blocker |
| Adapter: Connect Instant COI → those two calls → R2 + CID email | CID | After Coterie answers |
| Stop auto ACORD 25 on `coterie` | Same PR | |
| GUARD WC cert path | Gerry → Jon | **After Electrical live** |

**Not this spec:** sending insureds to carrier portals; CID ACORD 25 on ConnectQuote policies.
