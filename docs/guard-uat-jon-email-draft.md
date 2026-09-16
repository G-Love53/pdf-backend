# Email draft — Jon (GUARD UAT v1)

**To:** Jon  
**From:** Gerry  
**Subject:** GUARD WC UAT v1 — CID results + a few confirmations

---

Hi Jon,

Thanks for the UAT pack — we parsed it into our sandbox runner and executed all **16 cases** (Contractors + Non-Contractors) on **P/sandbox** via our API integration.

We recorded **GUARD Policy Number** and **RqUID** on each case and attached the completed **Defect Log** / results summary (see below).

**Confirmations (so we align before prod):**

1. **Class codes** — Your sheet uses `5183CO` etc. We send **RatingClassificationCd** with our contracted suffix (e.g. plumber **`518322`**). Please confirm that matches what you expect in ASC for these tests.
2. **Experience mod** — We map ex mod in NBS as `CreditOrSurcharge` / `CreditSurchargeCd=EXP` / `FormatModFactor` per your data dictionary. Let us know if CO expects a different element.
3. **Webhook** — Understood still in progress; we did not block UAT on doc delivery.

**Suggestions from our side (optional):**

- **Question codes in the pack** — Including GUARD `QuestionCd` values alongside question text would speed automated matching (we fuzzy-match text today).
- **RatingClassificationCd column** — A 6-digit column per case would remove ambiguity on suffix (`22` vs `00`).
- **Webhook sample** — When the ticket closes, a CO sandbox policy number + sample doc webhook payload would help us close the Connect ingest loop.

Happy to walk through any defect row on a call.

Thanks,  
Gerry  
Commercial Insurance Direct  
[phone / email]

---

**Attach:** `data/guard-uat-results-v1.json` or filled Defect Log tab from workbook.
