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

| Variable | Sandbox value |
|----------|----------------|
| `COTERIE_API_BASE` | `https://api-sandbox.coterieinsurance.com` |
| `COTERIE_PUBLISHABLE_KEY` | Sandbox publishable key |
| `COTERIE_SECRET_KEY` | Sandbox secret |
| `COTERIE_STRIPE_PUBLISHABLE_KEY` | Sandbox `pk_test_…` |
| `COTERIE_DEMO_FINALIZE_ENABLED` | **`true`** |
| `COTERIE_AGENCY_EXTERNAL_ID` | Same or sandbox agency id |
| `DATABASE_URL` | Prod DB *or* staging DB (see note below) |
| `CID_APP_URL` | `https://connect.commercialinsurance-direct.com` |
| Other `COTERIE_*` / Gmail / R2 | Match prod or staging as needed |

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
