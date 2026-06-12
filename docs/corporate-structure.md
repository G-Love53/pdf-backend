# CID — Corporate structure and segment brands

> **Canonical location (RSS):** `pdf-backend/docs/corporate-structure.md` — versioned with **CID-PDF-API** (`main`).  
> **As of:** 2026-06-04 (America/Denver). Update when segments, domains, or partner-facing narrative change.
>
> **Purpose:** One reference for **legal entity**, **umbrella vs segment brands**, **domains and ops inboxes**, and **what we tell partners** (e.g. carriers, MGAs) vs internal stack details. For deploy steps see [`Deploy_Guide.md`](./Deploy_Guide.md). For vendors see [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md).

---

## Legal entity and umbrella brand

| Item | Value |
|------|--------|
| **Legal name** | Commercial Insurance Direct LLC |
| **Umbrella / agency brand** | Commercial Insurance Direct (CID) |
| **Corporate site** | [commercialinsurancedirect.com](https://www.commercialinsurancedirect.com/) |
| **Producer phone (ACORD / collateral)** | (303) 932-1700 |

CID is the **parent distribution platform**. Customers often first meet us through a **trade-specific segment brand** (intake site + `quotes@…` mailbox). Legally and on carrier paperwork, the agency is **Commercial Insurance Direct LLC** unless a segment-specific disclosure is required.

---

## How the model works

```text
Commercial Insurance Direct LLC  (legal / agency of record)
        │
        ├── Corporate hub          commercialinsurancedirect.com
        │
        └── Segment brands (go-to-market by trade)
                ├── Bar Insurance Direct              → barinsurancedirect.com
                ├── Roofing Contractor Insurance Direct → roofingcontractorinsurancedirect.com
                ├── Plumber Insurance Direct          → plumberinsurancedirect.com
                ├── HVAC Insurance Direct             → hvacinsurancedirect.com
                ├── Fitness Insurance Direct          → fitnessinsurancedirect.com
                └── Electrical Insurance Direct       → electricalinsurancedirect.com
```

**Per segment:**

1. **Marketing / intake** — Netlify-hosted quote form on the segment domain (S1 capture).
2. **Operations** — Segment **`quotes@…`** Gmail inbox (carrier replies, poller, ops pings). Bar uses historical **`quote@`** (singular).
3. **Pipeline** — All segments POST to **one backend** (CID-PDF-API on Render): `/submit-quote`, operator S4–S6, bind, documents.
4. **Post-bind service** — Insured-facing app (Connect) and bridge APIs; see **`cid-connect`** docs internally — **not** the default partner narrative.

One code pattern; only segment config, templates (SUPP_*), and branding change.

---

## Segment registry (production)

Keep in sync with `src/config/segmentBranding.js` and `src/config/segmentAgentInbox.js`.

| Segment key | Segment brand | Public domain | Ops inbox | Intake |
|-------------|---------------|---------------|-----------|--------|
| `bar` | Bar Insurance Direct | barinsurancedirect.com | quote@barinsurancedirect.com | `/quote` on segment site |
| `roofer` | Roofing Contractor Insurance Direct | roofingcontractorinsurancedirect.com | quotes@roofingcontractorinsurancedirect.com | `/quote` |
| `plumber` | Plumber Insurance Direct | plumberinsurancedirect.com | quotes@plumberinsurancedirect.com | `/quote` |
| `hvac` | HVAC Insurance Direct | hvacinsurancedirect.com | quotes@hvacinsurancedirect.com | `/quote` |
| `fitness` | Fitness Insurance Direct | fitnessinsurancedirect.com | quotes@fitnessinsurancedirect.com | `/quote` + **`connectquote.html`** (CO instant) |
| `electrical` | Electrical Insurance Direct | electricalinsurancedirect.com | quotes@electricalinsurancedirect.com | `/quote` + **`connectquote.html`** (CO instant) |

**Outreach / reserved (not full pipeline rows yet):** `generalcontractorinsurancedirect.com`, `landscaperinsurancedirect.com` — see `src/outreach/urlBuilder.js`.

---

## Technical footprint (internal)

| Layer | Host / repo | Role |
|-------|-------------|------|
| **CID-PDF-API** | `cid-pdf-api.onrender.com` · `pdf-backend` | Single operator, S4–S6, poller, `/submit-quote`, Connect bridge `/api/connect/*`, webhooks (e.g. future `/webhooks/coterie`) |
| **Segment repos** | `*-pdf-backend` on GitHub + Netlify | Intake HTML/CSS only; no duplicated operator stack |
| **Templates** | **CID_HomeBase** (submodule) | SUPP_*, ACORD assets and mapping |
| **Pipeline DB** | Render Postgres (`DATABASE_URL` / cid-postgres) | Submissions, quotes, policies, segment enum |
| **Insured app** | Connect PWA · `cid-connect` | Auth (Famous), policy/COI/coverage when bridge enabled |

Segment GitHub repos and Netlify sites are **wrappers**. Operational truth lives on CID-PDF-API.

---

## Quote rails (how business gets bound)

| Rail | When | Customer sees |
|------|------|-----------------|
| **Traditional** | Full supplement + carrier quote + S5 packet + S6 (BoldSign) | Segment brand through bind; agency ops via segment inbox |
| **ConnectQuote (Coterie API)** | Segment passes appetite gate + **AKHash**; **CO pilot live** (Electrical + Fitness) | Segment `connectquote.html` + prefill → Coterie bind/pay → **Connect** same day — see [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md) |

Both rails should write the **same policy shape** in cid-postgres (`bind_source` distinguishes origin). Segment **`quotes@…`** remains the ops story even when bind is API-driven (contact, BCC, attribution).

---

## Partner-facing narrative (carriers, MGAs, distribution)

Use this with partners who do **not** need product architecture detail.

**One sentence:**

> Segment-branded intake, API bind on our backend where appetite allows, operations through segment quote inboxes — same model we run across all our trades.

**Expand only if asked:**

- We operate **trade-specific commercial intake** (separate sites and forms per segment).
- Submissions and agency operations run through **segment-branded mailboxes** (`quotes@…`).
- We integrate carrier **APIs on our backend** for instant quote/bind on eligible SMB classes; everything else uses our **standard submission and review workflow**.
- Webhooks and bind ingestion hit **CID-PDF-API** (neutral backend URL — no product names in paths).

**Do not lead with:** Connect, PWA, Famous, cid-postgres bridge, or multi-repo internals unless a specific technical question requires it.

**Do ask carriers about:** post-bind insured email (from, co-brand, reply-to), `agencyexternalId` / producer attribution, sandbox `industryId` / NAICS lists, policy webhooks and document URLs.

---

## Marketing and acquisition (summary)

| Channel | Identity | Notes |
|---------|----------|--------|
| **Segment sites** | Segment brand + domain | Primary quote URL for paid/organic per trade |
| **Corporate site** | Commercial Insurance Direct | Platform story, Connect overview for prospects |
| **Cold / warm outbound** | Segment domain in links (Instantly, etc.) | SPF/DKIM/DMARC on sending domains — see Deploy Guide |
| **Cohesive AI (planned)** | Forward to segment `quotes@…` | Warm leads; not in production code yet |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | Initial doc: LLC, umbrella vs segments, inbox registry, partner narrative, quote rails. |
| 2026-06-04 | ConnectQuote rail label; link to `coterie-integration.md`. |
| 2026-06-12 | Electrical + Fitness `connectquote.html` intake; link to `connectquote-shipped-2026-06.md`. |
