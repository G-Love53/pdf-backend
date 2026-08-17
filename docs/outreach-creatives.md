# Outreach creatives registry

> **Canonical tooling:** `pdf-backend/marketing/` + `pdf-backend/scripts/`  
> **Hosted assets:** each `{segment}-pdf-backend/Netlify/email/` (segment domain CDN — not Render)

## Active creatives (2026-08-connect-v1)

| Segment | Repo | Public JPEG URL | Instantly HTML | Status |
|---------|------|-----------------|----------------|--------|
| **fitness** | `fitness-pdf-backend` | [archive JPEG](https://fitnessinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Fitness_Creative.jpg) | `instantly_html_step.html` | Live (+ legacy root) |
| **electrical** | `electrical-pdf-backend` | [archive JPEG](https://electricalinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg) | same | Deployed |
| **hvac** | `hvac-pdf-backend` | [archive JPEG](https://hvacinsurancedirect.com/email/archive/2026-08-connect-v1/CID_HVAC_Creative.jpg) | same | Deployed |
| **plumber** | `plumber-pdf-backend` | [archive JPEG](https://plumberinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Plumber_Creative.jpg) | same | Deployed |
| **bar, roofer, beauty, cleaning, pet** | respective repos | — | HTML template only | Add JPEG when ready |

**Legacy (do not break):**  
`https://fitnessinsurancedirect.com/email/CID_Fitness_Creative.jpg` + root `instantly_fitness_step3.html`

## Folder convention

```text
Netlify/email/
  README.md
  archive/YYYY-MM-slug/
    CID_{Segment}_Creative.jpg
    instantly_html_step.html       ← text Step 1 → HTML Step 2
    source_embedded.html
```

Never delete archive folders referenced by live Instantly campaigns.

## JPEG spec

| Property | Value |
|----------|--------|
| Width | **1200 px** |
| Format | JPEG, quality ~82, progressive |
| Target size | 250–400 KB |
| Email `<img width>` | 600 (display); file is 2× for retina |

Extract with `extract-creative-jpg.mjs` — verify hosted `src` is `https://`, never `data:image`.

## Instantly paste checklist

See **`outreach-claude-playbook.md` §C** — re-apply `{{connectquote_url}}` on image + CTA after every paste.

## Scripts

| Script | Purpose |
|--------|---------|
| `extract-creative-jpg.mjs` | Embedded HTML → JPEG |
| `generate-instantly-email.mjs` | → `instantly_html_step.html` |
| `bootstrap-segment-email.mjs` | Layout + ingest |
| `clean-apollo-instantly.mjs` | List clean; default **2 contacts/company** |

Template: `marketing/templates/instantly_html_step.base.html`  
Friction lines: `marketing/segmentEmailConfig.js`

## Related

- [`outreach-claude-playbook.md`](./outreach-claude-playbook.md)
