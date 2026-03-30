# CID Connect — Git + Cursor + Famous

**Agreed workflow**

1. **Connect** (React app) = **GitHub/GitLab repo** — canonical source; edited in **Cursor**.
2. **Famous** = deploy / DB / Edge UI — pulls or syncs from Git; not the only copy of frontend code.
3. **Workspace** = `pdf-backend` + segment backends + **Connect clone** in one Cursor window when possible.

**Setup:** Export or connect Connect from Famous → create repo → clone next to `pdf-backend` → open folder in Cursor. After that, handoff snippets under `reference/cid-connect-famous/` are optional; prefer editing the Connect repo directly.

**Local clone (this machine):** `~/GitHub/cid-connect` — remote `https://github.com/G-Love53/cid-connect.git`.

**Deploy without Famous Git:** Netlify (or Vercel) → import **GitHub** `cid-connect` → set `VITE_*` env vars. See **`cid-connect/docs/DEPLOY.md`**.

**When synchronized:** Say the Connect repo path or remote URL so agents know where `src/api.ts` and components live.
