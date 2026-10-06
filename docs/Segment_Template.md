# CID — Segment Template

> **Canonical:** `pdf-backend/docs/Segment_Template.md` (2026-10-06). ConnectQuote launches: [`connectquote-segment-deploy.md`](./connectquote-segment-deploy.md).

**Purpose:** What a segment backend repo looks like and how to create a new segment (e.g. HVAC) from the Bar base. Same structure = scaling; only config and mapping change.

Segment quote inboxes live in `src/config/segmentAgentInbox.js` on CID-PDF-API. Do not hardcode a second inbox or domain in a segment file.

---

## Reference: Bar (pdf-backend)

Bar is the RSS base, but operational pipeline is centralized in `pdf-backend`.

### Directory layout

```
pdf-backend/                    (CID-PDF-API, universal operator + S4-S6 + poller)
├── .github/workflows/          (optional: heartbeat, CI)
├── CID_HomeBase/              submodule -> canonical templates + mapping
├── mapping/                   segment-specific field mapping JSON (e.g. ACORD130.json, SUPP_BAR.json)
├── src/
│   ├── config/
│   │   ├── forms.json         which forms exist and point at CID_HomeBase/templates/...
│   │   └── bundles.json       which template lists each bundle_id uses (e.g. BAR_INTAKE -> [SUPP_BAR, ACORD125, ...])
│   ├── generators/            rendering engines (svg-engine.js, html-engine.js, index.js)
│   ├── services/
│   ├── utils/
│   ├── prompts/               optional segment prompts
│   ├── email.js
│   ├── db.js
│   └── server.js              thin wrapper: routes, config load, call generators
├── Dockerfile
├── package.json
├── .gitmodules                 CID_HomeBase submodule
└── README.md                  segment name + "RSS base" or "clone of Bar"
```

### What is segment-specific (change per segment)

| Item | Bar | New segment (e.g. HVAC) |
|------|-----|-------------------------|
| Repo name | pdf-backend | hvac-pdf-backend |
| `SEGMENT` env | bar | hvac |
| `bundles.json` | BAR_INTAKE, COI_STANDARD, ... | HVAC_INTAKE, ... (choose the appropriate SUPP_* template, e.g. SUPP_PLUMBER for contractor segments) |
| `forms.json` | Same canonical form set; can trim to only forms this segment uses | Same; enable only what you need |
| `mapping/` | ACORD*.json, SUPP_SOCIETY_BAR.json, etc. | ACORD*.json, segment-specific supp mapping |
| Render service | CID-PDF-API | segment intake service only |
| Carrier / UW email env | CARRIER_EMAIL_BAR, UW_EMAIL_BAR | CARRIER_EMAIL_HVAC, etc. |

### What is shared (do not duplicate)

- **Templates:** All in CID_HomeBase (submodule). No template files in segment repo.
- **Engines:** `src/generators/` (svg-engine, html-engine, index). Same code across segments until/unless moved to HomeBase.
- **Operator/S4/S5/S6 pipeline:** `pdf-backend` only. Do not replicate in segment repos.
- **Poller + bind + policy creation:** `pdf-backend` only.

---

## Steps to add a new segment (e.g. HVAC)

1. **Create/clone segment intake repo** (e.g. `hvac-pdf-backend`) for static intake + submit endpoint only.
2. **Update config:**
   - `src/config/bundles.json`: Define HVAC bundles; point to the correct SUPP_* template for that segment (for contractor-style segments you can clone from SUPP_PLUMBER and rename).
   - `src/config/forms.json`: Keep canonical list or trim to only forms this segment uses.
3. **Add mapping:** Add any segment-specific mapping JSON under `mapping/` (e.g. for the chosen SUPP_* template, HVAC-specific field map).
4. **Env:** Set `SEGMENT=hvac`, `DATABASE_URL`, and mail vars needed for intake dispatch.
5. **Deploy:** Segment intake deploy should route submissions to the shared CID-PDF-API flow.
6. **README:** State segment name (hvac), that it's cloned from Bar, and which bundles/mapping are used.

**Do not copy operator/bind/poller code into segment repos.** Keep them intake-thin and route pipeline work through `pdf-backend`.

