# CID Connect — policyholder app (LEG 3)

**Product name:** **CID Connect** (iOS / Android / web shell as built in Famous.ai).

**Purpose:** Post-bind **self-service** for insureds: COI requests, claims intake, policy documents, **AI coverage Q&A** (premium questions, “am I covered for X?”), renewals and retention — without duplicating the insurance execution engine.

**RSS rule:** **CID-PDF-API** (`pdf-backend` on Render) remains the **only** system of record for S4–S6, poller, bind, policy artifacts, and COI **execution**. CID Connect + Supabase provide **identity, UX, and optional app-side cache**; they **call** the API, they do not fork pipeline logic.

**GUARD WC:** second policy on the same submission when segment/state allow (`bind_source: guard`). ConnectQuote intake offers WC on the main form or post-bind; quote/bind still hits CID-PDF-API — no GUARD secrets in the browser. Spec: [`guard-integration.md`](./guard-integration.md).

---

## Who builds what (Famous vs Cursor / `pdf-backend`)

| Layer | Tool | Responsibility |
|--------|------|------------------|
| **Screens, navigation, branding, mobile shell, store packaging** | **Famous.ai** | You prompt Famous; it generates UI, hooks, and Expo-style project structure. You **Publish** / export toward App Store & Google Play per Famous + Apple/Google requirements. |
| **API contracts, secrets, webhooks, Postgres/R2, operator, S4–S6** | **Cursor + `pdf-backend` repo** | Immutable **submission_public_id**, `/request-coi`, packet/bind routes, `timeline_events`, etc. Changes here are **reviewed PRs**, not ad-hoc prompts. |
| **App auth & lightweight profile** | **Supabase** (Auth + optional tables) | Logins, sessions, device tokens; **map** Supabase `user` → CID `client_id` / policies via **server-side** or **CID-PDF-API** endpoints — avoid two competing sources of policy truth. |

**Workflow that works:**

1. **Define the contract in Cursor** (or this doc): e.g. “COI submit: `POST https://cid-pdf-api.onrender.com/request-coi` with `segment`, `policy_id`, holder fields, `X-API-Key` or session pattern TBD.”
2. **Paste the contract + env var names into a Famous prompt** so it generates `src/api/cidClient.ts` (or equivalent) that **only** talks to that host.
3. **Famous owns** navigation, forms, empty states, and store metadata; **you** own keys in Render/Supabase/Cloudflare dashboards.

Famous does **not** decide your Postgres schema for quotes — it consumes **your** API. Cursor does **not** replace Famous for pixel-perfect mobile layout — unless you later eject to raw React Native in Git.

---

## Cloudflare (edge)

Typical placement (document when domains are final):

- **DNS** for `connect.…` or app API subdomain.
- **WAF / rate limit** in front of public app or BFF.
- **Workers** optional: thin proxy that adds headers and forwards to `CID-PDF-API` so **secrets stay off the device** (recommended for production Q&A and COI).

**Do not** put `DATABASE_URL` or Gmail secrets in Famous front-end code — ever.

---

## Integration checklist (COI first, then claims, then Q&A)

1. **COI** — CID Connect calls **`CID-PDF-API`** `POST /request-coi` (see `pdf-backend` routes) with **segment** + holder fields; display success from response / email flow your backend already uses.
2. **Claims** — Same pattern: one **canonical** endpoint on `CID-PDF-API` (or dedicated route already present); photos → Supabase Storage **or** presigned upload pattern **you** standardize.
3. **AI Q&A** — Retrieval over **policy/dec pages** + **`carrier_resources`** (Librarian index) + structured quote/policy fields; implement as **server-side** completion API (on `pdf-backend` or Worker) so prompts and keys are not in the app binary.

---

## Revision

| Date | Change |
|------|--------|
| 2026-03-30 | Initial: CID Connect naming, Famous vs Cursor split, Cloudflare notes, RSS boundaries. |
