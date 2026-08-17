# Direct partner discovery — RSS question set

> **Canonical location (RSS):** `pdf-backend/docs/direct-partner-discovery-rss.md`  
> **Use for:** Any **direct** carrier/MGA partner where CID owns intake and **Connect** owns post-bind servicing (Coterie today; CoverSmart/USLI; future instant rails).  
> **Related:** [`partnerships.md`](./partnerships.md) · [`coterie-integration.md`](./coterie-integration.md)

---

## Purpose

Before we build or expand a partner rail, we ask the same **basic discovery questions**. Answers can be **yes, no, or partial** — a “no” is not always a dead end; it tells us which **workaround path** to evaluate.

**RSS lens**

| Pillar | What we need from the partner |
|--------|-------------------------------|
| **Reliable** | Sandbox, stable APIs/webhooks, predictable documents and policy data into Connect |
| **Scalable** | One integration pattern per partner (or clear product split), campaign prefill, ops we can repeat across segments |
| **Sellable** | Segment-branded intake, Connect as insured policy home, clear appetite for our segments/states |

**Our non-negotiable story:** insureds **start** on our segment experience and **live** in Connect after bind — we are not replacing the carrier; we are their distribution + service layer.

---

## Core questions (all direct partners)

Copy the block below; replace `[Partner]`, product names, and pilot scope.

---

**Subject:** [Partner] integration & Connect servicing — discovery

Hi [Name],

We’re Commercial Insurance Direct (All Access Insurance, Colorado). We’re exploring how we might work with **[Partner]** in a way that is **reliable for insureds, scalable for both teams, and sellable in the market**.

Our model: segment-branded intake → instant quote/bind where available → **Connect** (`connect.commercialinsurance-direct.com`) for post-bind servicing (documents, COI, policy home). We want to understand **if and how** we can use [Partner] as the carrier rail while keeping that experience.

**Integration**

1. For [product line(s)], is there a **quote/bind API** we integrate from our backend, or is the path **hosted [Partner] web only** (redirect or iframe)?
2. If API exists, is it the **same engine** as agent/deep links you issue today, or a different integration product?
3. Can intake live on **our domains and branding** (our HTML/CSS), with [Partner] handling rating and bind behind the scenes?
4. Do you provide a **sandbox / test environment** and partner technical documentation?

**Connect (post-bind)**

5. After bind, can we receive **policy data and documents** programmatically (webhooks, API, or document URLs) — policy number, effective dates, premium, dec page, COI, etc.?
6. Can post-bind insured communication and “manage your policy” links point to **Connect**, or must they use [Partner]’s insured portal?
7. Who is **system of record** for billing, endorsements, and cancellations — [Partner] only, or can a partner portal service policies via API?

**Products & pilot**

8. For a pilot scope [e.g. Colorado + one trade segment + one event type], which **classes/products** are in appetite vs referral/decline?
9. If you offer multiple products (e.g. small business vs special events), are they on the **same integration**, or separate systems?
10. Can we **pre-fill** applicant data (name, email, address, business type) from campaign links or CRM, via URL or API?

**Commercial setup**

11. What do we need from you to go live technically — **agency/retailer IDs**, API credentials, appointment mapping, etc.?
12. How is **agent/agency attribution** set when the quote starts on our site but binds on [Partner]?
13. Is there a **recommended pilot** you’ve run with a partner who kept their own front-end? What did that look like?

**What “yes” looks like for us (RSS)**

- **Reliable:** sandbox, clear API/embed spec, stable post-bind data and documents into Connect  
- **Scalable:** clear integration path, prefill for campaigns, repeatable across segments  
- **Sellable:** our branding on intake, Connect as insured policy home, clear appetite for our segments  

Happy to jump on a 30-minute call to walk through our flow and hear what’s possible on your side.

Thanks,  
[Name]  
Commercial Insurance Direct  
[Phone / email]

---

## Short version (30-minute call opener)

1. **API vs hosted-only?** Can we rate and bind from our backend on our domains?  
2. **Connect servicing?** Can policy docs and insured comms flow into Connect after bind?  
3. **Sandbox + pilot?** What is the smallest live test you support for our segment/state?

---

## When they say “no” — workaround paths

Use this internally after the call. Goal: still RSS-viable, with eyes open on cost and insured experience.

| If partner says… | Possible workaround | RSS tradeoff |
|------------------|---------------------|--------------|
| **No API — hosted only** | Co-branded landing on our domain → redirect/iframe to partner; Phase 2 ask for API | **Sellable** intake OK; **Reliable** depends on their UX; limited Connect automation |
| **No custom skin on their app** | Our full skin on pre-quote landing + handoff; partner UI only for rating/bind | Acceptable if handoff is smooth; document “powered by” if required |
| **No Connect links in their emails** | CID welcome email post-bind with Connect link; partner emails for billing/claims only | **Reliable** if we own welcome + doc ingest; insured may have two portals briefly |
| **No webhooks** | Poll partner API for policy status; scheduled doc fetch; manual ops bridge for pilot | **Scalable** weak until webhooks; OK for small pilot |
| **No doc API** | Insured uploads to Connect; ops pull from partner portal; email-forward ingest | **Reliable** manual cost; not long-term scalable |
| **Separate systems per product** | One CID intake router → two partner connectors behind the scenes | Engineering cost; still **Sellable** as one segment URL |
| **No URL prefill** | Our form collects everything first; POST to partner with mapped fields | Campaign still works; extra step if their hosted flow duplicates questions |
| **Connect cannot be system of record** | Connect = document vault + service UX; deep links to partner for pay/endorse/claim | Honest UX copy; still **Sellable** if docs and COI live in Connect |

**Rule:** Any workaround must be labeled **pilot-only** or **production** in [`partnerships.md`](./partnerships.md) with owner and next action.

---

## Partner log (discovery status)

| Partner | Appointment / status | Discovery sent | Integration answer | Connect answer | Workaround / next step | Owner |
|---------|----------------------|----------------|--------------------|----------------|------------------------|-------|
| **Coterie** | Live (CO) | N/A (built) | API + webhooks | Connect welcome + doc ingest | Baseline reference implementation | Gerry |
| **USLI / CoverSmart** | Appointment — small business + special events | | | | Send core question set; see notes below | Rick / Gerry |

---

## CoverSmart / USLI — first use (2026-07)

**Products in scope:** CoverSmart small business, special events  
**Pilot geography (proposed):** Colorado — one trade segment + one special-events use case  
**Vanity link reference:** `coversmart.org/[agent]` → retailer GUID on `getcoversmart.com` (attribution only; not CID skin)

Use the **core questions** above with `[Partner]` = CoverSmart / USLI. No separate question list — same RSS bar as every direct partner.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-30 | Initial RSS discovery template; CoverSmart as first logged partner. |
