# Where “Supabase” appears (segments, HomeBase, pdf-backend)

Inventory for consolidating envs / docs. **Famous Connect** uses Famous’s DB host (`databasepad.com`); `@supabase/supabase-js` still works if the URL/key match that backend.

**Not scanned:** repo **`cid-postgres`** — no folder match under `~/GitHub`. Add paths if it lives elsewhere.

---

## Segment Node backends (Render) — **runtime Supabase**

| Repo | Files | Env vars | What it does |
|------|-------|----------|--------------|
| **plumber-pdf-backend** | `src/server.js`, `src/quote-processor.js`, `src/bind-processor.js` (comments); `package.json` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `createClient`, quote save to DB, COI scheduler + librarian crons when `HAS_SUPABASE` |
| **roofing-pdf-backend** | same pattern | same | same |
| **hvac-pdf-backend** | same pattern | same | same |

**Change / remove:** Set both env vars on each Render service to the **same** DB as Connect (Famous), **or** unset them to run “render-only” (quotes skip DB save; COI/librarian crons disabled).

---

## BAR — **pdf-backend** (CID-PDF-API)

| Path | Notes |
|------|--------|
| `src/db.js` | `createClient`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; `quotes` insert, `carrier_resources` + **storage** upload |
| `reference/cid-connect-famous/**` | Handoff snippets only (not production operator path unless copied) |

**Change:** Render env for this service — align `SUPABASE_*` with unified DB or remove features that depend on them.

---

## CID_HomeBase (templates only)

| Path | Notes |
|------|--------|
| `docs/System_Flow.md`, `Deploy_Guide.md`, `SESSION_REPORT.md`, `CID_PARTNER_OVERVIEW.md` | Text references to Supabase / env table |
| Embedded in **plumber/roofing/hvac** copies of `CID_HomeBase/docs/*` | Same doc strings |

**Change:** Documentation only — update after architecture is final.

---

## Standalone **CID_HomeBase** repo (`~/GitHub/CID_HomeBase`)

Same **docs** as above (`System_Flow.md`, `Deploy_Guide.md`, …).

---

## **CID-docs** (`~/GitHub/CID-docs`)

| Files | Notes |
|-------|--------|
| `Deploy_Guide.md`, `System_Flow.md`, `CID_CONNECT.md` | Architecture + env tables mentioning Supabase |

**Change:** Editorial — align “Famous + DB” wording and shared `SUPABASE_*` story.

---

## Famous / Connect handoff (**pdf-backend** `reference/cid-connect-famous/`)

Many **`.md`**, **`.ts`**, **`edge-functions/*`**, **`migrations/*`** mention Supabase (client, Edge deploy URLs, cron examples with `*.supabase.co`).

**Change:** Only if you rename the platform in docs; **code is reference** for Famous, not BAR Render.

---

## Quick grep (re-run)

```bash
rg -i supabase ~/GitHub/plumber-pdf-backend ~/GitHub/roofing-pdf-backend ~/GitHub/hvac-pdf-backend \
  ~/GitHub/pdf-backend/src ~/GitHub/pdf-backend/CID_HomeBase/docs ~/GitHub/CID_HomeBase/docs ~/GitHub/CID-docs \
  ~/GitHub/pdf-backend/reference/cid-connect-famous
```

---

## Summary

| Layer | Supabase in code? |
|-------|-------------------|
| Segment **Netlify** static sites | Not scanned here; grep `VITE_SUPABASE`, `supabase.co` per site |
| Segment **Node** (plumber/roof/hvac) | **Yes** — server + quote-processor |
| **pdf-backend** `src/db.js` | **Yes** |
| **CID_HomeBase** | Docs only |
| **cid-postgres** | Not in inventory (path unknown) — likely **Postgres-only**, no `supabase-js` |
