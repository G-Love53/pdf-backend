# Outreach creatives registry

> **Canonical tooling:** `pdf-backend/marketing/` + `pdf-backend/scripts/`  
> **Hosted assets:** each `{segment}-pdf-backend/Netlify/email/` (segment domain CDN — not Render)

## Active creatives (2026-08-connect-v1)

| Segment | Repo | Public JPEG URL | Instantly HTML (repo path) | Status |
|---------|------|-----------------|----------------------------|--------|
| **fitness** | `fitness-pdf-backend` | https://fitnessinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Fitness_Creative.jpg | `Netlify/email/archive/2026-08-connect-v1/instantly_step3.html` | Live (+ legacy root URL) |
| **electrical** | `electrical-pdf-backend` | https://electricalinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg | same pattern | Deploy after push |
| **hvac** | `hvac-pdf-backend` | https://hvacinsurancedirect.com/email/archive/2026-08-connect-v1/CID_HVAC_Creative.jpg | same pattern | Deploy after push |
| **plumber** | `plumber-pdf-backend` | https://plumberinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Plumber_Creative.jpg | same pattern | Deploy after push |
| **bar** | `bar-pdf-backend` | — | structure only | Add creative |
| **roofer** | `roofing-pdf-backend` | — | structure only | Add creative |
| **beauty** | `beauty-pdf-backend` | — | structure only | Add creative |
| **cleaning** | `cleaning-pdf-backend` | — | structure only | Add creative |
| **pet** | `pet-pdf-backend` | — | structure only | Add creative |

**Legacy (do not break):** Fitness campaigns may still use  
`https://fitnessinsurancedirect.com/email/CID_Fitness_Creative.jpg` (root copy kept).

## Folder convention (every segment)

```text
{segment}-pdf-backend/Netlify/email/
  README.md                          ← which version is active
  archive/
    YYYY-MM-slug/
      CID_{Segment}_Creative.jpg     ← hosted hero (600px JPEG)
      instantly_step3.html           ← paste into Instantly Step 3
      source_embedded.html           ← optional design source
  CID_*_Creative.jpg                 ← legacy root mirror (optional)
  instantly_*_step3.html             ← legacy root mirror (optional)
```

**Rule:** Never delete archive folders used in live Instantly steps. Add new version folders for A/B or refreshes.

## Scripts (run from `pdf-backend`)

| Script | Purpose |
|--------|---------|
| `scripts/extract-creative-jpg.mjs` | Embedded HTML → JPEG |
| `scripts/generate-instantly-email.mjs` | Template → `instantly_step3.html` |
| `scripts/bootstrap-segment-email.mjs` | Create layout + ingest creative (`--all` or `--segment`) |
| `scripts/clean-apollo-instantly.mjs` | Apollo/list CSV → Instantly CSV + `connectquote_url` |

Config: `marketing/segmentEmailConfig.js`  
Template: `marketing/templates/instantly_step3.base.html`

## Instantly campaign wiring

1. Import cleaned CSV (`connectquote_url` column).
2. Map custom variable **`connectquote_url`**.
3. Paste **`instantly_step3.html`** from repo (Step 3, `<>` source mode).
4. Insert unsubscribe link once in footer placeholder.
5. Replace `[LICENSE NUMBER]` with CO producer license when known.

## Related docs

- [`outreach-claude-playbook.md`](./outreach-claude-playbook.md) — agent instructions (lists + creatives)
- [`connectquote-partner-demo.md`](./connectquote-partner-demo.md) — Fitness demo bind → Connect
