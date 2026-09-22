# CID Connect — mobile access (partner summary)

> **Audience:** carriers, agency partners, diligence.  
> **Technical:** [`CID_CONNECT.md`](./CID_CONNECT.md) · Connect repo `docs/PWA.md` (deploy checklist).

**URL:** `https://connect.commercialinsurance-direct.com`

---

## What Connect is

Post-bind **insured portal**: policy documents, COI requests, claims intake, coverage Q&A, renewals. Execution (COI PDF, bind artifacts, pipeline) stays on **CID-PDF-API**; Connect is identity + UX.

---

## Mobile access (Sep 2026)

Connect is an **installable app** via **Progressive Web App (PWA)**:

- Insureds **add Connect to the home screen** on iPhone (Safari), Android (Chrome), or desktop (Chrome/Edge).
- Standalone icon and window — same login as the web portal.
- Post-bind onboarding and Profile include install instructions; Android/desktop may show a one-tap **Install** button.

**Partner line:** *“Insureds can install CID Connect on their phone like an app — no App Store download required today.”*

---

## App Store / Google Play

| Today | Later (optional) |
|-------|------------------|
| **Not** listed in Apple App Store or Google Play | Same Vite/React codebase can wrap with **Capacitor** for store badges when distribution or partner asks warrant it |
| Intentional: low-frequency annual use (COI, renewal); store adds review cycles and platform maintenance | Not a rebuild; not a separate no-code mobile product |

**Do not tell partners:** “Available on the App Store” (not true yet).

**Investor / diligence line:** *“Mobile app available today via installable PWA; App Store / Play is a packaging option on the same codebase when we choose.”*

---

## Famous.ai (backend only)

For this project, **Famous / DatabasePad** is **backend-only**: Postgres-compatible DB, Auth, Storage, Edge Functions. The Connect **frontend** lives in GitHub (`cid-connect`), deploys on **Netlify**, and is **not** published through Famous’s separate “Mobile app” product path.

Famous confirmed (Sep 2026): no App Store submission, native builds, or WebView packaging from the backend project. Native store distribution, if pursued, is **Capacitor** (or similar) wrapping our web app — Famous unchanged as auth/DB host.

---

## What this means for partners

| Topic | CID position |
|-------|----------------|
| Post-bind insured home | Connect remains CID-branded service layer |
| Welcome / servicing emails | May include web link + “add to home screen” |
| Carrier insured portals | Unchanged where required; Connect = docs, COI, Q&A |
| Policy truth | **cid-postgres** via `/api/connect/*`; Connect does not fork S4–S6 |

---

## Related

| Doc | Use |
|-----|-----|
| [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md) | Pre-bind ConnectQuote rail |
| [`connectquote-analytics-partner.md`](./connectquote-analytics-partner.md) | Pre-submit funnel analytics |
| [`direct-partner-discovery-rss.md`](./direct-partner-discovery-rss.md) | Carrier discovery — Connect servicing questions |
