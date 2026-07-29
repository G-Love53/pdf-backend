# ConnectQuote — partner demo (sandbox + home-screen tile)

> **As of:** 2026-07-29 · **Segment:** Fitness only (owner + employee, BOP + GL on Pilates).  
> **Prod marketing:** demo bind **off**. **Sandbox API:** demo bind **on**.

---

## Why Fitness for partner demos

| Show | Fitness demo |
|------|----------------|
| **Owner vs employee** | Yes — toggle ownership; employee → GL path |
| **BOP + GL** | Yes — **Pilates / mind-body** (owner can select both) |
| **GL only** | Yoga studio, personal trainer |
| **Not owner-gated** | Unlike Electrical / HVAC / Plumber |

---

## Two Render services

| Service | Purpose | Demo bind |
|---------|---------|-----------|
| **`cid-pdf-api`** (prod) | Live marketing, real card bind | **`COTERIE_DEMO_FINALIZE_ENABLED=false`** |
| **`cid-pdf-api-sandbox`** (new) | Partner walkthroughs | **`COTERIE_DEMO_FINALIZE_ENABLED=true`** |

Same repo (`pdf-backend` `main`), different env.

### Sandbox env (minimum)

**Important:** `cid-pdf-api-sandbox` is a **CID demo service** (demo bind on, no marketing traffic). It does **not** require Coterie’s sandbox API host unless you have separate sandbox Coterie keys.

**Recommended (copied prod keys — what you have today):**

| Variable | Value |
|----------|--------|
| `COTERIE_API_BASE` | **`https://api.coterieinsurance.com`** (prod Coterie — same keys as prod) |
| `COTERIE_PUBLISHABLE_KEY` | Same as prod |
| `COTERIE_SECRET_KEY` | Same as prod |
| `COTERIE_STRIPE_PUBLISHABLE_KEY` | Same as prod (`pk_live_` OK — demo bind skips card) |
| `COTERIE_DEMO_FINALIZE_ENABLED` | **`true`** |
| `PUBLIC_API_BASE_URL` | `https://cid-pdf-api-sandbox.onrender.com` |
| `ENABLE_GMAIL_POLLING` | **`false`** |
| `DATABASE_URL` / `CID_APP_URL` / Gmail | Same as prod |

**401 fix:** If `COTERIE_API_BASE` is `https://api-sandbox.coterieinsurance.com` but keys are prod → **Coterie API 401**. Either switch API base to **prod** (above) or install Coterie sandbox keys from partner setup (`docs/connectquote-build-day.md`).

**Alternate (Coterie sandbox API):**

| Variable | Value |
|----------|--------|
| `COTERIE_API_BASE` | `https://api-sandbox.coterieinsurance.com` |
| `COTERIE_PUBLISHABLE_KEY` | Sandbox publishable key (not prod) |
| `COTERIE_SECRET_KEY` | Sandbox secret |
| `COTERIE_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` |

**DB note:** Demo-finalize writes real `policies` rows. Submissions use `traffic_source=demo` and `campaign_id=partner-demo` for filtering. Prefer a **staging Postgres** later; shared prod DB is OK for low-volume partner demos if emails are yours.

---

## Partner demo URL (bookmark + home screen)

After sandbox Render is live:

```
https://cid-pdf-api.onrender.com/connectquote/fitness-demo.html
```

Override API (testing):

```
https://cid-pdf-api.onrender.com/connectquote/fitness-demo.html?api=https://cid-pdf-api-sandbox.onrender.com
```

Once sandbox is the default in HTML, the short URL above is enough.

**Add to phone home screen (Chrome/Safari):**

1. Open the URL on the phone you use in partner meetings.
2. **iPhone:** Share → **Add to Home Screen** → name **CQ Demo**.
3. **Android:** ⋮ → **Install app** or **Add to Home screen**.

The page includes a **web manifest** for a standalone tile (`CQ Demo`).

---

## 5-minute partner script

1. **Open tile** — Fitness demo (sandbox).
2. **Owner + Pilates** — show BOP + GL toggles → **Get instant quote** (real sandbox premium).
3. **Optional:** switch to **employee** or **yoga** to show GL-only path.
4. Tap **Complete bind — demo (no charge)** — no Stripe charge.
5. **Phone:** “Welcome email just landed” → link to **`connect.commercialinsurance-direct.com`**.
6. **Sign in** (same email) → policy vault, COI, Am I Covered.

**Line for partners:** *“Quote on segment site → pay or demo bind → same-day Connect on our domain — not Coterie’s portal.”*

---

## Prod checklist (you)

- [ ] Render prod: **`COTERIE_DEMO_FINALIZE_ENABLED=false`** (demo button hidden on live segment sites)
- [ ] Render sandbox: service created, sandbox Coterie keys, **`COTERIE_DEMO_FINALIZE_ENABLED=true`**
- [ ] Smoke: open fitness-demo URL → quote → demo bind → welcome email → Connect
- [ ] Home-screen tile on demo phone

---

## Files

| Path | Role |
|------|------|
| `public/connectquote/fitness-demo.html` | Partner demo page (PWA-ready) |
| `public/connectquote/fitness-demo.webmanifest` | Home-screen install |
| `docs/coterie-sandbox-fixtures.md` | Sandbox API shapes |

---

## Related

- [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md) — live segments, CO marketing
- [`connectquote-operator-learning.md`](./connectquote-operator-learning.md) — exclude `src=demo` from marketing KPIs
