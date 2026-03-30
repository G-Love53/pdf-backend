# One Supabase project only (CID Connect / Famous)

## What went wrong

The **dashboard** you’re looking at (URL contains one **project ref**) does not match **`VITE_SUPABASE_URL` / anon key** in the app (**`src/lib/supabase.ts`** or env). Then functions, tables, and secrets exist in one place while the app talks to another.

## Pick the winner

| Option | Do this |
|--------|--------|
| **Dashboard / org is canonical** | Point the app at **that** project: Settings → API → **Project URL** + **anon public** key → env / `supabase.ts`. Redeploy or rebuild the frontend. |
| **App ref is canonical** | Open **that** project in Supabase (paste ref from URL into Supabase switcher), deploy Edge Functions + run migrations there, fix Famous “Database ID” if it’s wired to the wrong one. |

Do **not** maintain two live DBs for the same product without a documented split.

## After you switch (checklist)

1. **API** — URL + anon key match one project only.  
2. **Edge Functions** — Listed under **that** project; same ref in cron `net.http_post` URLs if used.  
3. **Secrets** — `GATEWAY_API_KEY`, `RESEND_*`, etc. on **that** project.  
4. **Storage buckets** — Same project as the app.  
5. **Famous** — Project settings **Database ID** / linked backend = same ref as the app.

## Typos

Refs are easy to mistype (e.g. `l` vs `1`, `n` vs `m`). Always copy **Project URL** from Supabase **Settings → API**, don’t retype the ref.
