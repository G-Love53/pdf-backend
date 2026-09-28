# ConnectQuote — kick-out UX & agent callback (product spec)

> **Status:** Spec (base for all segments). **Pilot:** Electrical Netlify + shared intake/API.  
> **Owner:** Gerry (callbacks → Gerry → in-house agent).  
> **Related:** [`connectquote-segment-deploy.md`](./connectquote-segment-deploy.md) · [`connectquote-events-tracking.md`](./connectquote-events-tracking.md) · [`coterie-integration.md`](./coterie-integration.md)

---

## 1. Product rules (all segments)

1. **Carrier appetite only** — Instant quote/bind when Coterie (and later GUARD WC) allows it under their guidelines. No fake “instant” path.
2. **ConnectQuote-only front door** — `{segment}insurancedirect.com/connectquote.html` is the product. Long-form supplements are **deprecated** unless a correct trade-specific form exists.
3. **Fail fast, on the page** — Ineligible answers show **why** and, when it’s a mistake, let the user **correct** before submit.
4. **No silent redirect** to long form / thank-you as the default when instant fails.
5. **True appetite kick-out** — Offer optional **agent follow-up** (not a promised quote). User opts in → notification to **Gerry** for forwarding.
6. **WC** — Show Workers’ Comp block only when GUARD is **prod-live** for that segment (`GUARD_ENABLED_SEGMENTS` + smoke passed).

---

## 2. Kick-out categories

### A. Correctable (block quote until fixed)

User can change answers; no callback required unless they still can’t qualify.

| Reason code | Trigger | User message (plain) |
|-------------|---------|-------------------|
| `validation_phone` | Missing/invalid phone | Enter a valid phone number. |
| `validation_email` | Missing/invalid email | Enter a valid email. |
| `validation_zip` | Missing/invalid ZIP | Enter a valid ZIP code. |
| `validation_state` | Not in `COTERIE_PILOT_STATES` | Instant quote is available in **Colorado** only today. |
| `validation_coverage` | No BOP/GL selected | Select at least one coverage option. |
| `validation_percent_total` | Work mix ≠ 100% (when field exists) | Percentages must total **100%** (current: X%). |
| `validation_contradiction` | e.g. subs % vs “no subs” | Please fix conflicting answers. |

### B. Not eligible (instant path closed)

Show panel; user may **go back and edit** if the question is wrong; otherwise offer callback.

| Reason code | Trigger | User message (plain) |
|-------------|---------|-------------------|
| `not_owner` | Owner-only segment; `is_owner` = no | Instant quotes are for **owners/operators** only. |
| `prohibited_class` | e.g. solar (electrical) | This business type isn’t eligible for instant quote. |
| `knockout_yes` | Segment appetite knockout = Yes | This activity isn’t eligible for instant quote ([specific question]). |
| `professional_liability` | PL selected on ConnectQuote | Professional liability requires an agent — not instant online. |
| `coterie_no_policy_types` | API: empty `availablePolicyTypes` | We can’t offer instant coverage for this combination. |
| `coterie_declined` | API: UW declinations | Instant quote isn’t available based on underwriting ([summary if safe]). |
| `coterie_bind_blocked` | e.g. E0122 license | Instant quote temporarily unavailable in this state — request follow-up. |
| `quote_error` | API/transport failure | We couldn’t get a quote right now — try again or request follow-up. |

### C. Legacy (remove over time)

| Reason code | Trigger | Target behavior |
|-------------|---------|-----------------|
| `traditional_redirect` | Old `rail: traditional` → `index.html` | **Remove** — replace with B + callback panel. |
| `long_form_submit` | `ELECTRICAL_INTAKE` / HVAC template | **Remove** — Electrical `index.html` → ConnectQuote redirect (2026-09-28). |

---

## 3. Agent callback UX

### When to show

After **B** (not eligible) or optional after repeated **A** failures / `quote_error`.

### Copy (default)

**Title:** Instant quote isn’t available  

**Body:** Because of the nature of your business (or your answers), we can’t complete an instant quote here. **Would you like a follow-up from one of our agents?** We’ll contact you — we’re not sending a premium by email automatically.

**Buttons:**

- **Yes, contact me** — submits callback request  
- **No thanks** — dismiss; show `quotes@{segment}insurancedirect.com` as optional contact  

**Consent:** Clicking **Yes** = okay to call/email about this request (no separate legal wall of text v1).

### Prefill

Name, email, phone from form; read-only unless empty.

### Do not

- Promise a quote, price, or bind timeline.  
- Send user to `thankyou.html` (“inbox shortly”) on kick-out.  
- Auto-dial or expose Gerry’s personal mobile in UI (email-driven ops v1).

---

## 4. Callback delivery (v1 ops)

| Field | Value |
|-------|--------|
| **To (v1)** | `g@commercialinsurance-direct.com` (Gerry) |
| **Optional CC** | `quotes@{segment}insurancedirect.com` |
| **Subject** | `[CID][ConnectQuote callback] {segment} — {reason_code} — {submission_public_id}` |
| **Body** | Segment, reason_code, human reason label, submission_public_id, name, email, phone, business name, state/ZIP, business_class, timestamp, optional `cq_session_id` |

Gerry forwards to in-house agent manually until a CRM/queue exists.

### Timeline event (implement with API)

```text
event_type: connectquote.agent_callback_requested
payload: { reason_code, submission_public_id, contact_email, contact_phone, business_name, segment, meta }
```

### Analytics (`cq_events`)

| Event | When |
|-------|------|
| `kickout_shown` | Panel displayed (`reason_code`) |
| `kickout_corrected` | User changed answer and re-attempted quote |
| `callback_requested` | User clicked Yes |
| `callback_declined` | User clicked No thanks |

---

## 5. API (to implement on CID-PDF-API)

### `POST /api/connectquote/agent-callback`

**Request (JSON):**

```json
{
  "segment": "electrical",
  "reason_code": "not_owner",
  "reason_detail": "optional short text",
  "submission_public_id": "CID-ELC-20260928-000261",
  "cq_session_id": "uuid-or-null",
  "form": {
    "first_name": "",
    "last_name": "",
    "contact_email": "",
    "contact_phone": "",
    "business_name": "",
    "premise_state": "CO",
    "business_class": "electric_contracting"
  },
  "consent": true
}
```

**Response:** `{ "ok": true }` or 4xx with message.

**Server:**

1. Validate segment + email + `consent === true`.  
2. Append `timeline_events` if `submission_public_id` resolves.  
3. Send email via existing Gmail helper (same pattern as `notifySubmissionReceived`).  
4. Insert `cq_events` row if session id present.

**Env (optional v1):**

```text
CONNECTQUOTE_CALLBACK_EMAIL=g@commercialinsurance-direct.com
```

Default Gerry if unset.

---

## 6. Intake JS behavior (to implement)

Replace `redirectTraditional()` default with **kick-out panel + callback** (keep `index.html?rail=traditional` only as temporary fallback until all segments updated).

| Today | Target |
|-------|--------|
| Redirect to `index.html` after 2.5s | Stay on ConnectQuote; show §3 panel |
| `showManualQuoteContact` only when no long form | Use kick-out panel everywhere |
| Owner-only: error only | Error + link to edit; callback if they confirm not owner |
| Plumber knockouts: redirect | Inline knockout + callback |
| Coterie `rail: traditional` | Map API `reason` → reason_code + panel |

**Math validation:** When schema includes work-mix fields, enforce total 100% before `quote_requested`.

---

## 7. Electrical Netlify (done in repo — deploy to go live)

| File | Change |
|------|--------|
| `Netlify/index.html` | ConnectQuote-only: redirect to `/connectquote.html` (beauty pattern). `?rail=traditional` → mailto `quotes@electricalinsurancedirect.com`. |
| `Netlify/thankyou.html` | Redirect to ConnectQuote (legacy long-form retired). |
| `Netlify/connectquote.html` | Bump intake `?v=20260924b`. |

**Deploy:** Push `electrical-pdf-backend` → Netlify auto-build. Verify:

- `/` and `/index.html` → ConnectQuote.  
- No new `bundle_id: ELECTRICAL_INTAKE` submissions unless old cached form (hard refresh).

---

## 8. Rollout order (other segments)

Same Netlify pattern as Electrical for: **plumber, hvac, fitness** (had long forms). **Beauty, cleaning, pet, painter** — confirm `index.html` already redirects; align thank-you pages.

Then ship **§5–§6** once on `pdf-backend` (all segments pick up via shared `connectquote-intake.js` + cache-bust).

---

## 9. Acceptance tests (Electrical)

- [ ] CO owner, electrical contracting → premium on ConnectQuote.  
- [ ] Not owner → kick-out message (after JS implement); no HVAC form.  
- [ ] Direct visit to old thank-you URL → ConnectQuote.  
- [ ] Callback Yes → email to Gerry with CID + reason (after API implement).  
- [ ] WC block hidden until GUARD prod enabled for `electrical`.

---

## Document control

| Field | Value |
|-------|--------|
| **Created** | 2026-09-28 |
| **Canonical** | `pdf-backend/docs/connectquote-kickout-callback-spec.md` |
