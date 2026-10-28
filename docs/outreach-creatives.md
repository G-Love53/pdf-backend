# Outreach creatives registry

> **Canonical tooling:** `pdf-backend/marketing/` + `pdf-backend/scripts/`  
> **Hosted assets:** each `{segment}-pdf-backend/Netlify/email/` (segment domain CDN — not Render)  
> **As of:** 2026-08-21 creatives (America/Denver). Electrical Netlify deploy method updated 2026-10-06.

## Active creatives (2026-08-connect-v1)

| Segment | Repo | Public JPEG URL | Instantly HTML | Status |
|---------|------|-----------------|----------------|--------|
| **fitness** | `fitness-pdf-backend` | [archive JPEG](https://fitnessinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Fitness_Creative.jpg) | `instantly_html_step.html` | Live (+ legacy root) |
| **electrical** | `electrical-pdf-backend` | [archive JPEG](https://electricalinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg) | same | Live |
| **beauty** | `beauty-pdf-backend` | [archive JPEG](https://beautyinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Beauty_Creative.jpg) | same | **Live** — JPEG committed 2026-08-21 (`OWN EASIER` footer) |
| **cleaning** | `cleaning-pdf-backend` | [archive JPEG](https://cleaninginsurancedirect.com/email/archive/2026-08-connect-v1/CID_Cleaning_Creative.jpg) | same | Live |
| **pet** | `pet-pdf-backend` | [archive JPEG](https://petserviceinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Pet_Creative.jpg) | same | Live |
| **painter** | `painter-pdf-backend` | [archive JPEG](https://painterinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Painter_Creative.jpg) | same | **Deploy live** — campaign after warmup |
| **hvac** | `hvac-pdf-backend` | [archive JPEG](https://hvacinsurancedirect.com/email/archive/2026-08-connect-v1/CID_HVAC_Creative.jpg) | same | Live |
| **plumber** | `plumber-pdf-backend` | [archive JPEG](https://plumberinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Plumber_Creative.jpg) | same | Live |
| **bar, roofer** | respective repos | — | HTML template only | Traditional intake only — no ConnectQuote campaigns |

**License #6784587** (All Access) is baked into all segment `instantly_html_step.html` via `generate-instantly-email.mjs`.

### Netlify deploy (how live JPEGs get updated)

| Segment | Deploy method | Notes |
|---------|---------------|-------|
| **electrical, fitness, hvac, plumber, beauty, cleaning, pet, painter** | Git → Netlify auto-deploy | Commit JPEG + HTML under `Netlify/email/archive/2026-08-connect-v1/` and push. Electrical linked 2026-10-06 (`electrical-pdf-backend`, publish directory `Netlify`). |

Smoke: `curl -I` the archive JPEG URL → **200** before pasting into Instantly.

**Aug 2026:** **Seven CO Instantly campaigns** live — electrical, fitness, hvac, plumber, beauty, cleaning, pet. Step 1 text + Step 2 HTML creative per segment; list vars **`connectquote_url`** + **`displayName`**.

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

## Workers’ comp creatives (2026-10-wc-v1)

Copy the Beauty HTML for the next segment. Electrical is the shell those files were matched to. Paste rules: [`outreach-claude-playbook.md`](./outreach-claude-playbook.md) §D.

| Segment | Step | HTML in the segment repo | Public JPEG |
|---------|------|--------------------------|-------------|
| **electrical** | 2 and 3 | `CID_Instantly_Step2_Ready.html`, `CID_Instantly_Step3_Ready.html` | [CID_Electrical_WC_Creative_v2.jpg](https://electricalinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Electrical_WC_Creative_v2.jpg) |
| **beauty** | 2 | `CID_Beauty_Instantly_Step2.html` | [CID_Beauty_WC_Creative2.jpg](https://beautyinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Beauty_WC_Creative2.jpg) |
| **beauty** | 3 | `CID_Beauty_Instantly_Step3.html` | [CID_Beauty_Certificate_Creative3.jpg](https://beautyinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Beauty_Certificate_Creative3.jpg) |
| **plumber** | 2 | `CID_Plumber_Instantly_Step2.html` | [CID_Plumber_Creative2.jpg](https://plumberinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Plumber_Creative2.jpg) |
| **plumber** | 3 | `CID_Plumber_Instantly_Step3.html` | [CID_Plumber_Creative3.jpg](https://plumberinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Plumber_Creative3.jpg) |
| **cleaning** | 2 | `CID_Cleaning_Instantly_Step2.html` | [CID_Cleaning_Creative2.jpg](https://cleaninginsurancedirect.com/email/archive/2026-10-wc-v1/CID_Cleaning_Creative2.jpg) |
| **cleaning** | 3 | `CID_Cleaning_Instantly_Step3.html` | [CID_Cleaning_Creative3.jpg](https://cleaninginsurancedirect.com/email/archive/2026-10-wc-v1/CID_Cleaning_Creative3.jpg) |
| **pet** | 2 | `CID_Pet_Instantly_Step2.html` | [CID_Pet_Creative2.jpg](https://petserviceinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Pet_Creative2.jpg) |
| **pet** | 3 | `CID_Pet_Instantly_Step3.html` | [CID_Pet_Creative3.jpg](https://petserviceinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Pet_Creative3.jpg) |
| **fitness** | 2 | `CID_Fitness_Instantly_Step2.html` | [CID_Fitness_Creative2.jpg](https://fitnessinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Fitness_Creative2.jpg) |
| **fitness** | 3 | `CID_Fitness_Instantly_Step3.html` | [CID_Fitness_Creative3.jpg](https://fitnessinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Fitness_Creative3.jpg) |

All live under `Netlify/email/archive/2026-10-wc-v1/`. A push publishes. The `img` src must start with `https://` and must be the filename that was pushed. `CID_Beauty_WC_Creative3.jpg` and `CID_Plumber_WC_Creative.jpg` are not those files. Plumber’s pictures were replaced on 26 October at the same two addresses.

HVAC and painter still need the shell, and they do not get a workers’ comp line. A new picture gets a new filename. Gmail caches the old URL.

## JPEG spec

| Property | Value |
|----------|--------|
| Width | **1200 px** |
| Format | JPEG, quality ~82, progressive |
| Target size | 250–400 KB |
| Email `<img width>` | 600 (display); file is 2× for retina |

Extract with `extract-creative-jpg.mjs` — verify hosted `src` is `https://`, never `data:image`.

## Instantly paste checklist

See **`outreach-claude-playbook.md` §D**. Copy the Beauty step file. Empty code view, paste the whole file, confirm the three `href`s. Confirm the JPEG URL returns 200 before the test send.

## Scripts

| Script | Purpose |
|--------|---------|
| `extract-creative-jpg.mjs` | Embedded HTML → JPEG |
| `generate-instantly-email.mjs` | → `instantly_html_step.html` |
| `bootstrap-segment-email.mjs` | Layout + ingest |
| `clean-apollo-instantly.mjs` | Apollo list clean; **`ch` + `src`** on `connectquote_url`; default **2 contacts/company** |
| `pull-localprospects-instantly.mjs` | LP API statewide pull → Instantly CSV |
| `clean-localprospects-instantly.mjs` | LP Advanced CSV → Instantly CSV |
| `print-step1-copy.mjs` | Step 1 plain-text from `segmentEmailConfig.js` |

Template: `marketing/templates/instantly_html_step.base.html`  
Friction lines: `marketing/segmentEmailConfig.js`

## Related

- [`outreach-claude-playbook.md`](./outreach-claude-playbook.md)
- [`localprospects-list-design.md`](./localprospects-list-design.md)
