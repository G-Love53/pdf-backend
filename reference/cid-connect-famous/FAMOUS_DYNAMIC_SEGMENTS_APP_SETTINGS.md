# Famous: dynamic segments + `app_settings` backend URLs

**Source:** Famous handoff — removed hardcoded `SEGMENTS` / `SEGMENT_API_MAP`; URLs from **`app_settings`** (e.g. `segment_backend_bar`); **`getDistinctSegments()`** from DB; **`getBaseUrl()`** async on COI/claim/renewal flows.

## Verify (staging)

1. **`app_settings` rows** exist for **every** segment you still serve (`segment_backend_<slug>` or whatever naming Famous uses). Missing key → **`getBaseUrl()`** failures at runtime.
2. **RSS / CID-PDF-API** — If platform policy is **one** host (`cid-pdf-api.onrender.com`) with **`segment` in JSON**, all keys can point to **that same base URL**; only do per-segment Render URLs if you **intentionally** split traffic again.
3. **Empty DB** — **`getDistinctSegments()`** may return nothing until quotes/policies/claims exist; confirm **SegmentSelector** UX (loading + empty state).
4. **`formatSegmentForApi`** — No default **`bar`**; ensure every call path passes segment or you’ll get silent wrong routing.
5. **Admin Claims filter** — Famous noted **hardcoded options** may remain; align with **`getDistinctSegments`** or loaded claims when you touch that tab.

## Fix pack (this repo)

Merge **`api.segmentBackends.ts`**, run **`migrations/app_settings_segment_backends_seed.sql`**, follow **`INTEGRATION_MERGE_SEGMENT_BACKENDS.patch.md`**.

## Repo policy reminder

`pdf-backend` **CID-PDF-API** rules: operator / S4–S6 stay on Render **pdf-backend**; segment static sites **`POST`** one API with **`segment`**. Dynamic **`app_settings`** URLs should **not** reintroduce duplicate operator stacks per segment unless that’s a deliberate product decision.
