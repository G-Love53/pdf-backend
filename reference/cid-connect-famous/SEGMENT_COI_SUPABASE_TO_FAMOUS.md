# Point segment COI apps at Famous Supabase

**Goal:** Segment sites that today use their **own** Supabase (mostly **COI**) should use the **same** Supabase project as **CID Connect on Famous** — one database, one storage, one set of Edge Functions for that product surface.

## 1. Get the target values (once)

In **Supabase** for the project Famous uses (same ref as **Famous → Edge Functions / Database**):

1. **Settings → API**
2. Copy **Project URL** (e.g. `https://xxxxx.supabase.co`)
3. Copy **anon public** key (not service role)

Never put the **service role** key in a static site or Netlify **public** env.

## 2. Segment repos — environment variables

Set these in **Netlify** (or Vercel / `.env.production`) for **each** segment static app that currently talks to Supabase for COI:

| Variable (typical) | Value |
|--------------------|--------|
| `VITE_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
| `VITE_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key from step 1 |

**Search the repo** for: `supabase.co`, `createClient`, `SUPABASE`, `supabaseUrl`, `supabaseKey` — rename/migrate any custom env names to match what the code reads.

Redeploy the site after saving env.

## 3. Famous / Connect (sanity)

- **`src/lib/supabase.ts`** (or Famous **Secrets** for URL/key) must use the **same** URL + anon key.
- No second “mystery” ref in previews vs production without documenting it.

## 4. Schema and security (don’t skip)

The **Famous** project must already have everything COI needs:

- Tables: e.g. **`coi_requests`**, **`profiles`** / **`user_profiles`** if inserts reference them, **`policies`** if your form links COI to a policy row
- **RLS** must allow what segment forms do (often **anon** or **authenticated** `INSERT`/`SELECT` for the submit path you coded). If the old segment DB had looser policies, **adjust policies on the Famous project** — not the other way around.
- **Storage**: bucket names in code (e.g. `cid-uploads`) must **exist** on the Famous project with matching policies.

## 5. Edge Functions / COI PDF

If segment apps call **`supabase.functions.invoke(...)`** for COI-related functions, those function names must be **deployed** on the **Famous** Supabase project with the same **Secrets** (`GATEWAY_API_KEY`, etc.) you use in Connect.

## 6. Optional: historical data

If old segment projects have existing **`coi_requests`** rows you need:

- Export from old project (SQL or CSV) and import into the Famous project, **or**
- Run dual URLs briefly and accept new data only on Famous (simpler).

## 7. Quick verification

1. Submit a **test COI** from a segment site (staging).
2. In Supabase **Table Editor** on the **Famous** project → confirm a new **`coi_requests`** (or equivalent) row.
3. Confirm **Connect admin** COI tab can see it if that’s the intended ops path.

## Related

- **`SUPABASE_PROJECT_CONSOLIDATION.md`** — app ref vs dashboard ref drift.
