# Draft reply — Jon UAT feedback (2026-09-23)

**Re:** Non-Contractors-3 officer payroll; Contractors-1 / #7 state UW question codes

---

Jon,

Thanks for the detail — you were right that these traced to our **automated UAT** builder, not your pack.

**Non-Contractor #3 ($75,000 officer):** We were including the officer but **`buildRatingPayloadFromForm` always overwrote remuneration with the CO state minimum** ($73,900 in our constant; we’ve updated the default to **$79,800** to match your Data Dictionary ticket). The pack’s **$75,000** is now sent explicitly on NBS (`InclIndividualsEstAnnualRemunerationAmt`).

**Contractors #1 and #7 (CA / MA question codes):** Our text matcher’s index fallback was picking **wrong-state** `questionCd`s (e.g. `5183CA01`, `9014MA01`) instead of Colorado (`23-5183_01`, `56-9014_01`). We now prefer GUARD’s CO question list from the API and, on fallback, **`5183_` / `9014_`** index rows only.

**Re-test (sandbox, 2026-09-23):**

| Case | Policy # | NBS RqUID | Outcome | Notes |
|------|----------|-----------|---------|--------|
| Non-Contractors-3 | UAWC773636 | db2430b3-ac4d-4810-8528-d6f9e29aae9e | Decline (expected) | `ownerPayrollSent: 75000` in UAT JSON after deploy |
| Contractors-1 | CIWC775506 | 707889e7-471a-4c02-8229-80a954881b70 | Quote | Class CDs should be `com.guard_QUESTION23-5183_0x` |
| Contractors-7 | CIWC775507 | 1151e5a9-4633-4267-a35e-8edde9dee5ea | Quote | Class CDs should be `com.guard_QUESTION56-9014_0x` |

Please confirm on your side that the request XML shows **$75,000** on #3 and **CO** question IDs on #1/#7. Happy to send a redacted snippet if useful.

Gerry
