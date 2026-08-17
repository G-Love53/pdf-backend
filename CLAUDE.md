# Claude — CID outreach (lists + Instantly creatives)

When Rick asks about **Instantly campaigns**, **Apollo/LocalProspects lists**, **prefill CSV**, or **segment email creatives**, read:

**`docs/outreach-claude-playbook.md`**

Registry of active creatives: **`docs/outreach-creatives.md`**

Quick rules:
- **Lists / prefill** → `pdf-backend/scripts/` (never segment repos)
- **Hosted JPEG + Step 3 HTML** → `{segment}-pdf-backend/Netlify/email/archive/`
- **`src=`** on prefill URLs → `instantly-{state}-{segment}` (not `apollo`)
- **Do not** use Zywave; **do not** host campaign images on Render
