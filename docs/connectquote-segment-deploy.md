# ConnectQuote segment — Deploy checklist

> **Deploy = launch the segment rail** (URL, Netlify, Gmail, Render, Git, ConnectQuote + Connect after bind).  
> **Not deploy:** creatives, Instantly, list pulls, campaigns, warmup — see **`outreach-claude-playbook.md`**. Partner Layer (unique `ch=partner-{id}` URL) is minted after the segment is live — [`partner-layer.md`](./partner-layer.md).

**Template segment:** Painter (`painterinsurancedirect.com`, Aug 2026, ~90 min first time).

---

## Done when

- [ ] `https://{segment}insurancedirect.com/connectquote.html` loads branded intake
- [ ] `GET /api/coterie/registry/{segment}` returns business classes
- [ ] CO test quote returns a premium
- [ ] *(When GUARD has confirmed class)* live URL WC indication → bindable **or** NOTICE
- [ ] `quotes@{domain}` sends and receives mail
- [ ] `GMAIL_REFRESH_TOKEN_{SEGKEY}` on **prod** CID-PDF-API
- [ ] *(Optional)* Segment on **commercialinsurance-direct.com** (`segment-links.js`)

---

## 1 — GitHub repo

1. Copy **`beauty-pdf-backend`** → **`{segment}-pdf-backend`**
2. Update `Netlify/connectquote.html` (`segment`, brand colors, bridge text)
3. `netlify.toml` publish dir **`Netlify`**
4. Commit creative under `Netlify/email/archive/2026-08-connect-v1/` when ready for outreach (not required for deploy sign-off)
5. **Push to GitHub before Netlify Git connect** (empty repo fails)

---

## 2 — Netlify + domain

1. New site → **Link GitHub** → repo `{segment}-pdf-backend`, branch **`main`**, publish **`Netlify`**, no build command
2. Add custom domain `{segment}insurancedirect.com`
3. Registrar → point **4 Netlify nameservers** to Netlify
4. Wait for **HTTPS** (DNS verified)

*Bootstrap option:* Netlify Drop stub first, add domain + NS, then Git link later (Painter path).

---

## 3 — CID-PDF-API (`pdf-backend`)

Edit on **`main`**, push → Render auto-deploys **prod cid-pdf-api** (confirm service — not sandbox unless intended).

| File | Action |
|------|--------|
| `src/config/coterieRegistry.js` | AKHash, classes, `ownerOnly`; no pre-quote yes/no knockouts (use Coterie exclusion list on quote) |
| `src/config/connectQuoteLinks.js` | domain + `CONNECTQUOTE_SEGMENT_DEFAULTS` |
| `src/config/segmentBranding.js` | brand name, color |
| `src/config/segmentAgentInbox.js` | `quotes@…` |
| `src/services/coterieIntakeService.js` | `CONNECTQUOTE_SEGMENTS` |
| `src/utils/operatorSegment.js` | operator filter |
| `src/constants/postgresEnums.js` + `src/db.js` | segment enum |
| `src/jobs/gmailPoller.js` | domain → `GMAIL_REFRESH_TOKEN_*` key |
| `src/config/connectQuoteIntakeSchema.js` | contractor segments if applicable |
| `public/connectquote-intake.js` | `FALLBACK_CLASSES` row |
| `migrations/NNN_segment_{segment}.sql` | `ALTER TYPE segment_type` + public id prefix |

---

## 4 — Database migration

**Prod** CID-PDF-API → **Shell**:

```bash
node scripts/run-migration.mjs migrations/NNN_segment_{segment}.sql
```

Verify: `curl -s https://cid-pdf-api.onrender.com/api/coterie/registry/{segment}`

---

## 5 — Gmail (`quotes@`)

| Step | Screen | Action |
|------|--------|--------|
| A | Admin → Domains → Manage | **Verify domain** → host **OTHER** → copy TXT → Netlify DNS `@` → Verify |
| B | Domain setup wizard | **Activate Gmail** → **Other verification options** (not GoDaddy) |
| C | Netlify DNS | MX `@` priority **1** → **`SMTP.GOOGLE.COM`** |
| D | Workspace | **Confirm** Gmail activated |
| E | Admin → Users | Create **`quotes@{domain}`** |
| F | User → Security | 2SV ON (backup-code incognito sign-in if org shows OFF) |
| G | Netlify DNS | SPF, DKIM (`google._domainkey`), DMARC (`_dmarc`) |
| H | Test | Send mail to `quotes@` from outside Gmail |

**Ineligible for ConnectQuote?** See **[`connectquote-kickout-callback-spec.md`](./connectquote-kickout-callback-spec.md)** (kick-out panel + agent callback to Gerry). **ConnectQuote-only Netlify:** beauty, cleaning, pet, painter, **electrical** (2026-09-28). **Still long-form `index.html` until migrated:** plumber, HVAC, fitness.

---

## 6 — Poller OAuth (prod cid-pdf-api)

1. Render → **prod cid-pdf-api** → copy `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET`
2. [OAuth Playground](https://developers.google.com/oauthplayground) → ⚙️ → use your credentials → **Offline**
3. Step 1 → Gmail **`gmail.modify`** → Authorize as **`quotes@{domain}`**
4. Step 2 → **Exchange authorization code for tokens** → copy **Refresh token**
5. Render → add **`GMAIL_REFRESH_TOKEN_{SEGKEY}`** → Save → deploy

| Segment | Env var |
|---------|---------|
| painter | `GMAIL_REFRESH_TOKEN_PAINTER` |
| beauty | `GMAIL_REFRESH_TOKEN_BEAUTY` |
| pet | `GMAIL_REFRESH_TOKEN_PET` |

---

## 7 — Smoke test

1. Open ConnectQuote URL (owner, 1 employee, primary class, CO, leased, BPP ~$50k)
2. Confirm premium + Stripe section
3. *(Optional)* bind in sandbox/demo mode
4. *(When WC is on for this segment)* unique name/ZIP/FEIN → Workers’ Comp opt-in → indication → bindable premium **or** GUARD NOTICE. Partner-test is not the launch smoke.

---

## 8 — Marketing site (optional)

**`CID Website/Netlify/`** (Drop → commercialinsurance-direct.com):

- `segment-links.js` — domain, card, nav, footer
- `privacy.html` — add domain
- `index.html` — about copy if needed. **No WC copy** on the marketing homepage until that segment’s live WC smoke is green.

---

## 9 — Workers’ Comp (GUARD) — after BOP/GL is live

WC is **pdf-backend only**. Do not add operator/WC API code to `{segment}-pdf-backend`.

**HOLD** until Jon confirms NCCI class + suffix for this trade/state. HVAC stays off. Painter / bar / roofer are not in the WC registry yet.

1. `src/config/guardRegistry.js` — `wcEnabled: true` on that line; class code from GUARD (state suffix matters).
2. Render **prod** `cid-pdf-api`:
   - `GUARD_ENABLED_SEGMENTS` includes the segment
   - `GUARD_PILOT_STATES` includes the state (`CO` until expansion)
   - Prod `GUARD_API_BASE` / `GUARD_API_KEY` / `GUARD_API_SECRET` / `GUARD_CONTRACT_NUMBER` (not `PAFAKE10`)
   - `GUARD_CAPITA_PAY_URL` when GUARD sends the pay link
   - `GUARD_WEBHOOK_AUTH` before **16 October 2026** doc push
3. Bump `{segment}` `Netlify/connectquote.html` `?v=`
4. Smoke on **`https://{segment}insurancedirect.com/connectquote.html`** (not `/partner-test/guard-wc.html`)
5. Then Instantly / homepage WC language

Diligence + env table: [`guard-wc-rollout.md`](./guard-wc-rollout.md) · spec: [`guard-integration.md`](./guard-integration.md) · start-here: `~/GitHub/CID-docs/Workers_Comp.md`.

**10 states:** Places allowlist is not WC expansion. Add states only via `GUARD_PILOT_STATES` + class suffix + smoke.

---

## Not part of Deploy

| Item | Doc |
|------|-----|
| Instantly warmup / campaign | `outreach-claude-playbook.md` |
| LocalProspects list pull | same |
| CTD `inst` CNAME | same (before send, not before deploy) |
| Postmaster | same |

---

## Painter reference (live Aug 2026)

| Item | Value |
|------|--------|
| Domain | `painterinsurancedirect.com` |
| Repo | `G-Love53/painter-pdf-backend` |
| Class | `painting_contractor` · AKHash `b8a05e6eaa436028e5348ad732317156` |
| Inbox | `quotes@painterinsurancedirect.com` |
| Migration | `015_segment_painter.sql` |
