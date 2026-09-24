# CID Partner Layer

Thin distribution wrap around ConnectQuote. **Not** an embedded quote API.

**Operator:** [`/operator/funnel`](https://cid-pdf-api.onrender.com/operator/funnel) — Click → Bind graphs + mint URL.

---

## What we need from the partner

| Item | Required | Notes |
|------|----------|--------|
| Display name | Yes | Association / supplier / payroll / software |
| Segment they serve | Yes | plumber, electrical, beauty, … |
| Default state | Yes | CO first |
| Logo | Optional | PNG/SVG, transparent, ~200px wide → `public/partners/{id}.png` |
| Member list | Optional | If they have emails we prefill `em` / `bn` like Instantly |

That’s it. No API key. No dashboard login for them in v1.

---

## How it works

1. CID adds a row in `src/config/cidPartners.js` and sets `active: true`.
2. Operator **Click → Bind → mint** builds:

   `https://{segment}insurancedirect.com/connectquote.html?st=CO&ch=partner-{id}&src=partner-{id}&cid={id}-YYYY-MM&partner={id}`

3. Partner puts that URL (or a redirect they own) in an email, portal, or QR.
4. Intake reads `partner` + `ch`, shows their logo if we have one, same quote/bind/Connect path.
5. Scoreboard attributes: clicks (`cq_events`) → fills → quotes → binds → WC → premium.

**CID still owns the customer.** Bind lands in Connect. Partner gets a weekly row, not the policy.

---

## Code

| Piece | Path |
|-------|------|
| Registry | `src/config/cidPartners.js` |
| Mint + attribution SQL | `src/services/partnerLayerService.js` |
| Scoreboard | `src/services/operatorScoreboardService.js` · `/operator/funnel` |
| Public card (logo) | `GET /api/partners/:id` |
| Intake banner | `public/connectquote-intake.js` (`applyPartnerBrand`) |

Channel convention: Instantly = `instantly-co-{segment}`. Partners = `partner-{id}`. Do not reuse Instantly `ch` for a trade org.

---

## “Live tomorrow”

When someone says yes: logo + name + segment. One registry row. Mint URL. They can send traffic the same day. Do not build `POST /v1/embed/quote` unless a partner cannot live with a URL.
