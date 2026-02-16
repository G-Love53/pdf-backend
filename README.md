# pdf-backend (Bar segment)

**CID Leg 2 — Bar segment.** Renders ACORD + supplemental PDFs from CID_HomeBase templates, emails via Gmail API.

* **Segment:** `bar` (set via `SEGMENT` env; default `bar`).
* **RSS base:** This repo is the reference for cleaning and replicating segments (Roofer, Plumber, HVAC, etc.). Same structure, segment-specific config only.
* **Templates:** CID_HomeBase submodule (canonical). Bar uses SUPP_BAR; bundles in `src/config/bundles.json`.

**CID_HomeBase submodule:** On GitHub you’ll see `CID_HomeBase @ a1d0f5b` (or another short hash). That’s the **commit** of CID_HomeBase this repo is using, not a file path. SUPP_BAR lives at `CID_HomeBase/templates/SUPP_BAR/`. To use the latest SUPP_BAR (or any HomeBase change), update the submodule and push: run `bash CID_HomeBase/scripts/deploy-bar-backend.sh` from CID_HomeBase (after pushing your HomeBase changes to `main`). That script pulls latest `main` into the submodule, commits the new commit ref in pdf-backend, and pushes so Render deploys with the updated templates.

Deploy: Docker (Render). Build clones CID_HomeBase when submodules are not available.
