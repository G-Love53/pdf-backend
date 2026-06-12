# Coterie sandbox fixtures (redacted)

> **Canonical location:** `pdf-backend/docs/coterie-sandbox-fixtures.md`  
> **As of:** 2026-06-10. Replace placeholders when Gerry confirms CO producer license and first bind succeeds.
>
> **No secrets in this file.** Use Render env for keys. AKHash values are public appetite identifiers from Coterie workbook.

---

## Auth (all requests)

```http
POST https://api-sandbox.coterieinsurance.com/v1.6/commercial/applications
Authorization: token <COTERIE_PUBLISHABLE_KEY>
Content-Type: application/json
```

---

## Create Application — Electrical CO (validated shape)

**Request (redacted):**

```json
{
  "legalBusinessName": "Redacted Electric LLC",
  "businessState": "CO",
  "businessZip": "80202",
  "numEmployees": 3,
  "agencyExternalId": "<COTERIE_AGENCY_EXTERNAL_ID>",
  "AKHash": "1520d13449f07456570fa1048b4bd7c4",
  "email": "insured@example.com",
  "locations": [
    {
      "zip": "80202",
      "street": "123 Main St",
      "city": "Denver",
      "state": "CO",
      "isPrimaryLocation": true
    }
  ]
}
```

**Response (shape — values redacted):**

```json
{
  "application": {
    "applicationId": "app_xxxxxxxx",
    "status": "FailedExtendedValidation",
    "availablePolicyTypes": ["BOP", "GL"],
    "exclusions": [],
    "applicationUrl": "https://sandbox.coterieinsurance.com/..."
  }
}
```

`FailedExtendedValidation` may still return `availablePolicyTypes` when appetite is OK — extended fields complete on bindable quote or hosted URL.

---

## Bindable Quote — Electrical CO (blocked in sandbox)

**Request (redacted):**

```json
{
  "applicationId": "app_xxxxxxxx",
  "applicationTypes": ["BOP"],
  "agencyExternalId": "<COTERIE_AGENCY_EXTERNAL_ID>",
  "AKHash": "1520d13449f07456570fa1048b4bd7c4",
  "contactEmail": "insured@example.com",
  "locations": [
    {
      "street": "123 Main St",
      "city": "Denver",
      "state": "CO",
      "zip": "80202",
      "isPrimaryLocation": true
    }
  ],
  "glLimit": "1000000",
  "glAggregateLimit": "2000000",
  "policyStartDate": "06/01/2026"
}
```

**Error (current sandbox — graceful handling in code):**

```json
{
  "code": "E0122",
  "message": "Producer is not licensed in CO"
}
```

CID ConnectQuote intake returns `coterie.bindBlocked` with `retryWhen: coterie_co_producer_license_enabled` — submission still recorded.

---

## ConnectQuote intake — CID-PDF-API

**Endpoint:** `POST /api/coterie/connectquote`

**Request (segment form → API):**

```json
{
  "segment": "electrical",
  "business_class": "electric_contracting",
  "site_domain": "electricalinsurancedirect.com",
  "formData": {
    "insured_name": "Redacted Electric LLC",
    "contact_email": "insured@example.com",
    "state": "CO",
    "zip": "80202",
    "premise_street": "123 Main St",
    "city": "Denver",
    "num_employees": 3,
    "src": "instantly",
    "cid": "co-electrical-pilot-01"
  }
}
```

**Response — application OK, bind blocked (E0122):**

```json
{
  "ok": true,
  "rail": "coterie",
  "submission_public_id": "CID-ELC-20260610-000001",
  "coterie": {
    "applicationId": "app_xxxxxxxx",
    "availablePolicyTypes": ["BOP", "GL"],
    "exclusions": [],
    "applicationUrl": "https://sandbox.coterieinsurance.com/...",
    "status": "FailedExtendedValidation",
    "bindableQuote": null,
    "bindBlocked": {
      "code": "E0122",
      "message": "Producer is not licensed in CO",
      "retryWhen": "coterie_co_producer_license_enabled"
    }
  }
}
```

**Response — exclusions → traditional rail:**

```json
{
  "ok": true,
  "rail": "traditional",
  "reason": "coterie_exclusions",
  "submission_public_id": "CID-ELC-20260610-000002",
  "coterie": {
    "applicationId": "app_yyyyyyyy",
    "availablePolicyTypes": [],
    "exclusions": ["solar_installation"],
    "applicationUrl": null,
    "status": "Failed"
  }
}
```

---

## Webhook — shape TBD

**URL (Render):** `https://cid-pdf-api.onrender.com/webhooks/coterie`

Registration with Coterie pending. Skeleton handler acknowledges `verification` / `ping` and logs bind events. Expected finalize events (confirm with Coterie):

| Event (TBD) | Action |
|-------------|--------|
| `verification` / `ping` | Return `{ ok: true }` |
| `policy.bound` (placeholder) | Idempotent `createPolicy()` + R2 docs + bind/welcome emails |

**Placeholder payload (do not treat as final):**

```json
{
  "eventType": "policy.bound",
  "eventId": "evt_xxxxxxxx",
  "applicationId": "app_xxxxxxxx",
  "policyNumber": "POL-REDACTED",
  "premium": 1234.56,
  "effectiveDate": "2026-06-01",
  "expirationDate": "2027-06-01"
}
```

---

## AKHash reference (electrical pilot)

| `business_class` key | AKHash | Owner products | Non-owner |
|---------------------|--------|----------------|-----------|
| `electric_contracting` | `1520d13449f07456570fa1048b4bd7c4` | BOP | Traditional (ownerOnly) |
| `solar` | — (null) | — | Traditional |

## AKHash reference (fitness pilot)

| `business_class` key | AKHash | Owner products | Non-owner |
|---------------------|--------|----------------|-----------|
| `yoga_studio` | `dc8a2c208bfed26ce3cc102f929bf557` | GL | GL |
| `pilates_studio` | `96811230e7feec657c12dc32b6910a60` | BOP, GL | GL |
| `personal_trainer` | `39c33b2f8fe71a4716f92728aba92278` | GL | GL |

Config: `src/config/coterieRegistry.js`. Full workbook: local `Coterie AKHash 06-04-2026-V2-10.xlsx`.
