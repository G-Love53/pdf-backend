# GUARD WC sandbox fixtures (redacted)

> **Canonical location:** `pdf-backend/docs/guard-sandbox-fixtures.md`  
> **As of:** 2026-08-20. **No secrets.** Packet: `GUARD WC API Documentation - 08.19.26`.  
> Spec: [`guard-integration.md`](./guard-integration.md)

v1 pilot class: **Plumber CO 5183** (`518300`). Electrical 5190 is in registry with `wcEnabled: false`.

---

## SOAP (all calls)

```http
POST {GUARD_API_BASE}
Content-Type: text/xml; charset=utf-8
SOAPAction: "http://guardwebservices.com/IAcordService/Service"
```

ACORD XML is **escaped** inside `<data>`. P host: `https://pgigezrate.guard.com/dotnet/api/acordservice/acord.svc`

---

## Indication (NBQ) — Plumber CO

CID: `POST /api/guard/wc/indicate`

```json
{
  "submission_public_id": "CID-PLUMBER-YYYYMMDD-######",
  "segment": "plumber",
  "legal_entity": "LL",
  "years_in_business": 6,
  "owner_on_wc": false
}
```

Expected GUARD shape: `MsgStatusCd` SuccessWithChanges, `PolicyStatusCd` NotQuotedNotBound, `FullTermAmt` present, `PolicyNumber` returned for later NBS.

---

## Questions

CID: `POST /api/guard/wc/questions` with `submission_public_id`.  
GUARD: `UnderwritingQuestionsInqRq` state `CO` + class `518300`.

---

## Bindable (NBS) then BND

CID: `POST /api/guard/wc/quote` (FEIN + answers) then `POST /api/guard/wc/bind` (clickwrap).  
Bindable when `PolicyStatusCd` is QuotedNotBound. Billing is **GUARD CPB** — CID does not take a card.

---

## Doc webhook

`POST https://cid-pdf-api.onrender.com/webhooks/guard-docs`  
`Authorization: {GUARD_WEBHOOK_AUTH}`  
JSON: `policyNumber`, `fileName`, `fileType`, `fileSize`, `fileContent` (base64). Ack only until R2 ingest ships.
