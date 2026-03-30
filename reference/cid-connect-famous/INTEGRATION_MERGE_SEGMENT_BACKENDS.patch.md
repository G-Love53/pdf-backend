# Fix Famous dynamic segments (fallbacks + seeds)

Famous removed hardcoded `SEGMENT_API_MAP`. Without rows in **`app_settings`** or an empty DB, flows can break or the segment list can be empty.

## 1) SQL (run in Famous DB)

See **`migrations/app_settings_segment_backends_seed.sql`**. Adjust host if yours is not `https://cid-pdf-api.onrender.com`.

## 2) Code (Famous `src/api.ts`)

Merge **`api.segmentBackends.ts`** into **`api.ts`** (or re-export):

- Use **`getSegmentBackendBaseUrl`** / **`getBaseUrl`** (= same impl) for **`fileClaim`**, **`requestCoi`**, **`getRenewalQuotes`**, etc.
- Use **`getDistinctSegments()`** from this file (union tables + `segment_backend_%` keys + **`VITE_DEFAULT_SEGMENTS`** fallback).
- Use **`formatSegmentForApi`** so a missing segment still sends a valid default (**`VITE_DEFAULT_SEGMENT`** or **`bar`**).
- Use **`getSegmentColorClass`** where badges need unknown-segment colors.

## 3) Env (Famous / Netlify)

| Variable | Purpose |
|----------|--------|
| `VITE_CID_API_URL` | Default API base when no `segment_backend_*` row (e.g. `https://cid-pdf-api.onrender.com`) |
| `VITE_DEFAULT_SEGMENTS` | Optional comma list when DB has no segments yet (e.g. `bar,plumber,roofer,hvac`) |
| `VITE_DEFAULT_SEGMENT` | Fallback slug for API bodies when UI omits segment (e.g. `bar`) |

## 4) Admin Claims filter

Replace any remaining hardcoded segment options with **`getDistinctSegments()`** or distinct values from loaded claims — same pattern as policies.
