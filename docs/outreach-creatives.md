# Outreach creatives registry

> **Canonical tooling:** `pdf-backend/marketing/` + `pdf-backend/scripts/`  
> **Hosted assets:** each `{segment}-pdf-backend/Netlify/email/` (segment domain CDN — not Render)  
> **As of:** 2026-08-18

## Active creatives (2026-08-connect-v1)

| Segment | Repo | Public JPEG URL | Instantly HTML | Status |
|---------|------|-----------------|----------------|--------|
| **fitness** | `fitness-pdf-backend` | [archive JPEG](https://fitnessinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Fitness_Creative.jpg) | `instantly_html_step.html` | Live (+ legacy root) |
| **electrical** | `electrical-pdf-backend` | [archive JPEG](https://electricalinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg) | same | Live |
| **beauty** | `beauty-pdf-backend` | [archive JPEG](https://beautyinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Beauty_Creative.jpg) | same | Live |
| **cleaning** | `cleaning-pdf-backend` | [archive JPEG](https://cleaninginsurancedirect.com/email/archive/2026-08-connect-v1/CID_Cleaning_Creative.jpg) | same | Live |
| **pet** | `pet-pdf-backend` | [archive JPEG](https://petserviceinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Pet_Creative.jpg) | same | Live |
| **hvac** | `hvac-pdf-backend` | [archive JPEG](https://hvacinsurancedirect.com/email/archive/2026-08-connect-v1/CID_HVAC_Creative.jpg) | same | Live |
| **plumber** | `plumber-pdf-backend` | [archive JPEG](https://plumberinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Plumber_Creative.jpg) | same | Live |
| **bar, roofer** | respective repos | — | HTML template only | Traditional intake only — no ConnectQuote campaigns |

**License #6784587** (All Access) is baked into all segment `instantly_html_step.html` via `generate-instantly-email.mjs`.

### Netlify deploy (how live JPEGs get updated)

| Segment | Deploy method | Notes |
|---------|---------------|-------|
| **electrical** | **Netlify Drop** (manual) | Site is **not** Git-connected — `git push` does **not** update live assets. Drop the `Netlify/` folder after JPEG/HTML changes. |
| **fitness, hvac, plumber, beauty, cleaning, pet** | Git → Netlify auto-deploy | Commit JPEG + HTML under `Netlify/email/archive/2026-08-connect-v1/` and push. |

Smoke: `curl -I` the archive JPEG URL → **200** before pasting into Instantly.

**Instantly CTD (every segment):** Netlify DNS `inst` CNAME → `prox.itrackly.com` + Netlify site env for branded unsubscribe + Instantly email-account setting — see **`Deploy_Guide.md`** § Instantly CTD.

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
| `clean-apollo-instantly.mjs` | List clean; **`ch` + `src`** on `connectquote_url`; default **2 contacts/company** |
| `print-step1-copy.mjs` | Step 1 plain-text from `segmentEmailConfig.js` |

Template: `marketing/templates/instantly_html_step.base.html`  
Friction lines: `marketing/segmentEmailConfig.js`

## Related

- [`outreach-claude-playbook.md`](./outreach-claude-playbook.md)
