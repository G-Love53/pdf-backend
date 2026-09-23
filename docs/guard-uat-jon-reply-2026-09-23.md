# Draft reply — Jon UAT feedback (2026-09-23)

**Re:** Non-Contractors-3 officer payroll; Contractors-1 / #7 state UW question codes

---

Jon,

Thanks for the detail — you were right that these traced to our **automated UAT** builder, not your pack.

**Non-Contractor #3 ($75,000 officer):** We were including the officer but **`buildRatingPayloadFromForm` always overwrote remuneration with the CO state minimum** ($73,900 in our constant; we’ve updated the default to **$79,800** to match your Data Dictionary ticket). The pack’s **$75,000** is now sent explicitly on NBS (`InclIndividualsEstAnnualRemunerationAmt`).

**Contractors #1 and #7 (CA / MA question codes):** Our text matcher’s index fallback was picking **wrong-state** `questionCd`s (e.g. `5183CA01`, `9014MA01`) instead of Colorado (`23-5183_01`, `56-9014_01`). We now prefer GUARD’s CO question list from the API and, on fallback, **`5183_` / `9014_`** index rows only.

**Re-test (sandbox, 2026-09-23 — post-deploy):**

| Case | Policy # | NBS RqUID | Outcome | Verification |
|------|----------|-----------|---------|--------------|
| Non-Contractors-3 | UAWC773636 | 09b16484-11a0-4d9a-afad-fb994345ba68 | Decline (expected) | `ownerPayrollSent: 75000` |
| Contractors-1 | CIWC775513 | 44127141-f75a-42f1-a073-c27ccc147133 | Quote / Accept | `23-5183_01`–`_03`; proposal generated |
| Contractors-7 | CIWC775514 | 39ff4f7e-6eac-4168-90d8-2041b55f370a | Quote / Accept | `56-9014_01`–`_03`; proposal generated |

Please confirm on your side that the request XML shows **$75,000** on #3 and **CO** question IDs on #1/#7. Happy to send a redacted snippet if useful.

Gerry
