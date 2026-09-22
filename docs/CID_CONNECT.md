# CID Connect — policyholder app (LEG 3)

**Product name:** **CID Connect**

**URL:** `https://connect.commercialinsurance-direct.com`

**Purpose:** Post-bind **self-service** for insureds: COI requests, claims intake, policy documents, **AI coverage Q&A**, renewals and retention — without duplicating the insurance execution engine.

**Mobile:** Installable **PWA** (home screen on iPhone, Android, desktop). App Store / Google Play **not** shipped; optional **Capacitor** wrap of the same codebase later. Partner-facing summary: [`connect-pwa-partner.md`](./connect-pwa-partner.md).

**RSS rule:** **CID-PDF-API** (`pdf-backend` on Render) remains the **only** system of record for S4–S6, poller, bind, policy artifacts, and COI **execution**. Connect uses Famous (Supabase-compatible) for **auth and app tables**; insured policy reads use **`/api/connect/*`** on cid-postgres when `VITE_CID_API_URL` is set.

**GUARD WC:** second policy on the same submission when segment/state allow (`bind_source: guard`). ConnectQuote intake offers WC on the main form or post-bind; quote/bind still hits CID-PDF-API — no GUARD secrets in the browser. Spec: [`guard-integration.md`](./guard-integration.md).

---

## Who builds what

| Layer | Where | Responsibility |
|--------|--------|------------------|
| **Frontend (screens, PWA, install UX)** | **`cid-connect`** repo — Vite/React, Netlify | UI, navigation, PWA manifest/service worker, post-bind onboarding |
| **Backend runtime (auth, profiles, app tables, Edge)** | **Famous / DatabasePad** | Supabase-compatible URL + anon key in browser; **not** frontend hosting or store publish |
| **Pipeline + Connect bridge** | **`pdf-backend`** on Render | S4–S6, bind, COI execution, `/api/connect/*`, timeline, cid-postgres |

**Famous (Sep 2026):** This DatabasePad instance is **backend-only**. Famous’s separate “Mobile app” product is a **different project flow** — not layered onto our GitHub Vite app. Store distribution = **Capacitor** (or similar) wrapping `vite build` output if we choose later.

**Workflow:**

1. Define API contracts in **`pdf-backend`** (`/api/connect/*`, COI multipart, claims, chat).
2. Implement UI in **`cid-connect`**; env: `VITE_SUPABASE_*`, `VITE_CID_API_URL`, `VITE_SITE_URL`.
3. Famous: schema, RLS, Auth redirect URLs, Edge Functions — not App Store or WebView packaging.

Canonical frontend architecture: **`cid-connect/docs/ARCHITECTURE.md`**.

---

## PWA (shipped Sep 2026)

| Piece | Notes |
|-------|--------|
| Manifest + service worker | `vite-plugin-pwa` in `cid-connect` |
| Icons | PNG 192 / 512 + Apple touch 180 |
| Install UX | Profile, post-bind onboarding, Chromium `beforeinstallprompt` |
| Deploy verify | `cid-connect/docs/PWA.md` |

---

## Cloudflare (edge)

Optional: DNS, WAF, Workers in front of Connect or as BFF to CID-PDF-API so secrets stay off the device.

**Do not** put `DATABASE_URL`, service role keys, or Gmail secrets in the Connect browser bundle.

---

## Integration checklist

1. **COI** — `POST /api/connect/coi/request` on CID-PDF-API (bridge); async fulfill + email when configured.
2. **Claims** — `POST /api/connect/claims`; segment notification via `app_settings` backend URLs.
3. **AI Q&A** — `POST /api/connect/chat` on CID-PDF-API (Claude primary, Gemini fallback); keys server-side only.

---

## Revision

| Date | Change |
|------|--------|
| 2026-03-30 | Initial: CID Connect naming, Famous vs Cursor split, RSS boundaries. |
| 2026-09-22 | PWA shipped; Famous = backend-only; frontend = `cid-connect` + Netlify; store = optional Capacitor. |
