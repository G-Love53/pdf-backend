# Claude — CID outreach (lists + Instantly creatives)

When Rick asks about **Instantly campaigns**, **Apollo/LocalProspects lists**, **prefill CSV**, or **segment email creatives**, read:

**`docs/outreach-claude-playbook.md`** — includes verified Instantly failure modes (Aug 2026)

Registry: **`docs/outreach-creatives.md`** · LP list design: **`docs/localprospects-list-design.md`**

Critical:
- **Lists / prefill** → `pdf-backend/scripts/` (never segment repos)
- **LocalProspects statewide** → `pull-localprospects-instantly.mjs` + `LOCALPROSPECTS_API_KEY` in `.env`; profiles in `src/outreach/segmentSearchProfiles.js`
- **ZIP prefill** → `src/outreach/parseUsZip.js` — **last** 5-digit match in address; omit bad `zp` from URL; intake requires ZIP at quote
- **Email prefill** → `outreachEmailValidation.js` — omit junk from URL; intake requires email at quote
- **Name** → optional through quote; required at bind (intake `20260821b+`)
- **Instantly CSV vars** → **`connectquote_url`** + **`displayName`**; Step 1 body uses `{{displayName}}`, not `{{firstName}}`, when firstName coverage is low
- **Hosted JPEG + HTML step** → `{segment}-pdf-backend/Netlify/email/archive/` → file **`instantly_html_step.html`**
- **`ch=` + `src=`** — same value, e.g. `instantly-co-electrical` (not `apollo`); intake reads `ch` first
- **After Instantly HTML paste:** re-apply `{{connectquote_url}}` on image + CTA (editor strips anchors)
- **New segment Netlify deploy:** CNAME `inst` → `prox.itrackly.com` + **Netlify env** for Instantly unsubscribe (mirror plumber) — see `Deploy_Guide.md` § Instantly CTD
- **Do not** use Zywave; **do not** host campaign images on Render; **never** `data:image` in email
