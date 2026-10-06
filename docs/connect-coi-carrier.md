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

## Coterie (BOP/GL) — from their public API docs

Coterie does **not** document a “create COI for this holder” POST. Certificates show up two ways:

### 1. Additional insured **on the quote** (before bind)

`endorsements.additionalInsureds[]` on `POST …/commercial/quotes` (their docs example):

`name`, `street`, `city`, `state`, `zip`, `email`, `description`

That names a party **at quote**. It is **not** Instant COI after the policy is live (new landlord next month).

### 2. Retrieve issued documents (after bind)

| Source | Call | What we get |
|--------|------|-------------|
| **What we already use** (v1.6, vault ingest) | `GET /v1.6/commercial/policies/docs/links/{PolicyNumber}` | PDF URLs for issued docs |
| **Public Documents API** | `GET /commercial/policies/{policyId}/documents` | Array: `documentId`, `type`, `url`, `contentType`. Example `type`: `Proposal`, `PolicyDeclaration`, **`CertificateOfInsurance`** |

Adapter v1 (once we smoke it on a live Coterie policy):

1. Resolve `coverage_data.coterie_policy_id` and/or carrier `PolicyNumber` (not `CID-POL-*`).  
2. GET document list (prefer v1.6 `docs/links`; also try `{policyId}/documents` if links omit certs).  
3. Pick `type === CertificateOfInsurance` (or filename/url that is clearly a cert).  
4. Download PDF → R2 `documents.coi_generated` → email delivery address → `completed`.

**Standard Instant COI** can ship on that retrieve path if Coterie already puts a cert in the document list.

**New holder / waiver / PNC / special wording:** public docs have **no** post-bind request endpoint. Queue those until Coterie confirms how to order a **new** cert. Do not invent CID ACORD 25.

Sandbox note (their docs): issued policy documents are **not emailed** in sandbox for legal reasons. Smoke retrieve-by-API on prod or ask their insurance team for sample forms.

**Still confirm with Coterie (one email)**

- Does `docs/links` include `CertificateOfInsurance`, or only the `{policyId}/documents` route?  
- Can we request a cert for a **new** holder after bind? If yes, method + payload.  
- Waiver / PNC as endorsements vs cert-only.

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
| Smoke `docs/links` + `{policyId}/documents` for `CertificateOfInsurance` on a live Coterie policy | CID | Next (Coterie first) |
| Confirm new-holder / waiver / PNC with Coterie partner eng | Gerry | Before adapter v2 |
| GUARD WC cert path | Gerry → Jon | **After Electrical live** |
| Adapter split in `fulfillConnectCoiRequest` | CID | After Coterie retrieve smoke |
| Stop auto ACORD 25 on `coterie` (and later `guard`) | Same PR | |

**Not this spec:** sending insureds to carrier portals; CID ACORD 25 on ConnectQuote policies.
