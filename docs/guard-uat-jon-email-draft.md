# Email draft — Jon (GUARD UAT v1)

**To:** Jon  
**From:** Gerry  
**Subject:** GUARD WC UAT v1 — 15/16 complete (P/sandbox) + defect log

---

Hi Jon,

Thanks for the UAT pack — we ran all **16 cases** on **P/sandbox** through our API integration and recorded **Policy Number** + **RqUID** on each row.

**Result: 15 of 16 passed.** One open item on **Contractors-8** (9014CO / cleaning — expected Refer for “above 15 feet = Yes”, received Accept). Details in the defect log below.

**Attached / linked:**
- Defect log (`data/guard-uat-defect-log-v1.md`)
- Full JSON results (`data/guard-uat-results-v1.json`)

**Confirmations:**

1. **Class codes** — We send RatingClassificationCd with our contracted suffix (e.g. plumber **518322** for your **5183CO**). OK on our side unless ASC expects a different suffix.
2. **Experience mod** — We map ex mod as `CreditOrSurcharge` / `EXP` / `FormatModFactor` per your data dictionary. The NBS response did not echo the mod factor — can you confirm the field we should read back for partner verification?
3. **Contractors-8** — Your rules spreadsheet lists `56-9014_01`–`_03` for CO janitorial; the pack’s 4th question (“above 15 feet”) appears under state variants (e.g. AZ/IN) only. Which QuestionCd should CO API use for that referral trigger?
4. **Webhook** — Understood still in progress; we did not block UAT on doc delivery.

**Suggestions (optional):**

- Include **QuestionCd** column in future UAT packs (speeds automation).
- Include **6-digit RatingClassificationCd** per case.
- When webhook is ready, a sample CO policy # + doc webhook payload would help us close Connect ingest.

Happy to walk through any row on a call.

Thanks,  
Gerry  
Commercial Insurance Direct
