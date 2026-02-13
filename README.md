# pdf-backend (Bar segment)

**CID Leg 2 — Bar segment.** Renders ACORD + supplemental PDFs from CID_HomeBase templates, emails via Gmail API.

* **Segment:** `bar` (set via `SEGMENT` env; default `bar`).
* **RSS base:** This repo is the reference for cleaning and replicating segments (Roofer, Plumber, HVAC, etc.). Same structure, segment-specific config only.
* **Templates:** CID_HomeBase submodule (canonical). Bar uses SUPP_BAR; bundles in `src/config/bundles.json`.

Deploy: Docker (Render). Build clones CID_HomeBase when submodules are not available.
