# GUARD WC UAT v1 — Defect Log (CID)

**Run date:** 2026-09-16 · **Env:** P/sandbox · **API:** cid-pdf-api-sandbox.onrender.com  
**Summary:** 15 / 16 passed · 1 open item

| Date | Test Case | RqUID | GUARD Policy # | Result | Notes |
|------|-----------|-------|----------------|--------|-------|
| 2026-09-16 | Contractors-1 | 0ddf5226-1bbc-4a1c-9bc6-6320a172d83f | CIWC773664 | Pass | Quote / Accept |
| 2026-09-16 | Contractors-2 | c228dc5e-0283-4e7b-bdb8-24c92f32085b | CIWC773665 | Pass | Refer (hazmat ACORD) |
| 2026-09-16 | Contractors-3 | cb78c26b-bfde-47b0-bd2b-c6065b126c72 | UAWC773628 | Pass | Decline (HVAC roof) |
| 2026-09-16 | Contractors-4 | 2ae90473-dd05-4a0e-9dca-0784b14943fd | CIWC773666 | Pass | Decline (low payroll) |
| 2026-09-16 | Contractors-5 | 3a946d7d-80b0-466f-b3ee-0f80245e2717 | CIWC773667 | Pass | Quote / Accept |
| 2026-09-16 | Contractors-6 | 9a6f7e30-9b8b-4290-b4a1-2623dc2bf292 | CIWC773668 | Pass | Refer (commercial HVAC) |
| 2026-09-16 | Contractors-7 | 2da6e5bf-013f-47e4-adb4-2106e7561b92 | CIWC773669 | Pass | Quote / Accept |
| 2026-09-16 | Contractors-8 | 73d11e95-24f5-4d14-89b7-2efa31b90791 | CIWC773670 | **Open** | Expected **Refer** (above 15 ft = Yes). Got **Accept** + premium. Remark: `56-9014_01` missing/invalid. CO rules file has only `56-9014_01`–`_03`; no `56-9014_04` for “above 15 feet” — mapped from AZ/IN variant. |
| 2026-09-16 | Non-Contractors-1 | fa47bdf3-5fad-4bf3-bd1f-b9df71b23cd0 | CIWC773671 | Pass | Quote |
| 2026-09-16 | Non-Contractors-2 | 632c3e11-15df-4e2e-af74-87db37b5587f | CIWC773672 | Pass | Refer |
| 2026-09-16 | Non-Contractors-3 | f19b94e5-76ea-47f7-a292-9a0e4e150150 | UAWC773636 | Pass | Decline |
| 2026-09-16 | Non-Contractors-4 | c055d018-388f-43c8-a419-f9139abe6dad | CIWC773673 | Pass | Quote |
| 2026-09-16 | Non-Contractors-5 | 146cee44-becf-4efe-96a9-a3d7f91c1b19 | CIWC773674 | Pass | Refer (ex mod 0.5) |
| 2026-09-16 | Non-Contractors-6 | 7b9ea2b7-46a9-49a3-a79e-5ac141afaf84 | CIWC773675 | Pass | Quote |
| 2026-09-16 | Non-Contractors-7 | 894396a6-24eb-4804-b1aa-94b56de6d7d3 | CIWC773676 | Pass | Refer (>50% other business) — **v1 sent one location only** |
| 2026-09-22 | Non-Contractors-7 | *(see results JSON)* | CIWC774942+ | Pass | **Fixed:** L1 21 S Tejon + L2 28 E Bijou; $150k payroll each; Refer as expected |
| 2026-09-23 | Non-Contractors-3 | db2430b3-ac4d-4810-8528-d6f9e29aae9e | UAWC773636 | Pass | **Fixed:** officer remuneration **$75,000** in NBS (was clamped to state min). Re-run after sandbox deploy. |
| 2026-09-23 | Contractors-1 | 707889e7-471a-4c02-8229-80a954881b70 | CIWC775506 | Pass | **Fixed:** CO class UW codes (`23-5183_0x`, not CA). Verify remarks clear post-deploy. |
| 2026-09-23 | Contractors-7 | 1151e5a9-4633-4267-a35e-8edde9dee5ea | CIWC775507 | Pass | **Fixed:** CO class UW codes (`56-9014_0x`, not MA). Verify remarks clear post-deploy. |
| 2026-09-16 | Non-Contractors-8 | 5d3582bd-038a-4fcd-8eba-9bd5bd03a003 | UAWC773641 | Pass | Quote |

## Observations for GUARD

1. **Experience mod** — We send `CreditSurchargeCd=EXP` + `FormatModFactor` on NBS. Response XML did not echo mod factor on any case; please confirm expected response field for partner verification.
2. **Contractors-8 / 9014CO** — Please confirm CO question ID for “Any work performed above 15 feet?” (`56-9014_04` vs state-specific code).
3. **Webhook** — Awaiting ticket; doc ingest not tested in this pass.
