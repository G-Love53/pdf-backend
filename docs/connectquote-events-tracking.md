# ConnectQuote funnel events (`cq_events`)

First-party page analytics for ConnectQuote intake — page load, human engagement, intake steps, quote timing, bind click.

**Partner-facing summary:** [`connectquote-analytics-partner.md`](./connectquote-analytics-partner.md)

## Deploy checklist

1. **Migration** (Render shell on CID-PDF-API):
   ```bash
   node scripts/run-migration.mjs migrations/016_cq_events.sql
   ```
2. **Deploy `pdf-backend`** (intake JS + `POST /api/cq/events`).
3. **Each segment Netlify site** — copy `public/connectquote/netlify/_redirects` to publish root so `/api/*` proxies to Render.
4. **Bump intake cache-bust** on segment `connectquote.html`: `connectquote-intake.js?v=20260922a`.
5. **Privacy** — add to segment `privacy.html`:
   > We use first-party visit analytics on our quote pages (page load and form progress) to improve our service. We do not use third-party ad trackers.

## URL attribution

| Param | Meaning |
|-------|---------|
| `ch`, `src`, `cid` | Channel + campaign (unchanged) |
| `st` | **State** prefill (`CO`) — do not reuse for email step |
| `seq` | **Email sequence step** `1` \| `2` \| `3` — stored as `st` in `cq_events` |

Instantly CSV exports:

- `connectquote_url` — no step (legacy)
- `connectquote_url_s1`, `_s2`, `_s3` — step baked in (`seq=1|2|3`)

Use `{{connectquote_url_s1}}` in step 1, `_s2` in step 2, `_s3` in step 3.

## Events

| Event | When |
|-------|------|
| `page_view` | Once per browser session (JS load) |
| `engaged` | First focus, tap, scroll, or step |
| `step_complete` | `business_class`, `is_owner`, `contact`, `location`, `employees`, `coverage` |
| `disqualified` | Non-owner, PL long-form, traditional redirect |
| `quote_requested` / `quote_returned` / `quote_error` | Coterie quote API |
| `bind_clicked` | Pay or demo bind |
| `exit` | `pagehide` — last step reached; includes `funnel_stage`, `steps_completed`, `submission_public_id` |

## Funnel stages (on `exit` meta and Operator SQL)

| Stage | Meaning |
|-------|---------|
| `open` | Landed, no engagement |
| `open_engaged` | Engaged, no intake steps completed |
| `semi_filled` | ≥1 step, no quote returned |
| `quote_pending` | Quote requested, not returned yet |
| `quoted_unbound` | Premium shown, no bind click |
| `bind_clicked` | Pay / demo bind clicked |
| `disqualified` | Non-owner, PL, traditional rail |

**Operator Home** → “Page funnel (cq_events)” tiles, or `GET /api/operator/cq-funnel?window=7&segment=pet`.

**Stale** = open / semi-filled with no quote and last event &gt;30 minutes ago.

## Bot flag (`suspect_bot`)

- Known scanner / headless user agent
- Second `page_view` for same `cid` within ~2 seconds
- `page_view` with no `engaged` within 60s (background janitor on API)

**Funnel SQL:** prefer `engaged` or `NOT suspect_bot` for human counts.

## Quick verify

```sql
SELECT event, step, segment, st, suspect_bot, created_at
FROM cq_events
ORDER BY created_at DESC
LIMIT 20;
```

Open a campaign link on your phone; rows should appear within seconds.
