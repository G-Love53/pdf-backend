# Claude — CID outreach (lists + Instantly creatives)

When Rick asks about **Instantly campaigns**, **Apollo/LocalProspects lists**, **prefill CSV**, or **segment email creatives**, read:

**`docs/outreach-claude-playbook.md`** — includes verified Instantly failure modes (Aug 2026)

Registry: **`docs/outreach-creatives.md`**

Critical:
- **Lists / prefill** → `pdf-backend/scripts/` (never segment repos)
- **Hosted JPEG + HTML step** → `{segment}-pdf-backend/Netlify/email/archive/` → file **`instantly_html_step.html`**
- **`src=`** → `instantly-{state}-{segment}` (not `apollo`)
- **After Instantly HTML paste:** re-apply `{{connectquote_url}}` on image + CTA (editor strips anchors)
- **Do not** use Zywave; **do not** host campaign images on Render; **never** `data:image` in email
