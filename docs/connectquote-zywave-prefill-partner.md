# ConnectQuote × Zywave — prefill link partner guide

> **For:** Zywave Sales Cloud / Content Cloud / campaign teams  
> **From:** Commercial Insurance Direct (CID)  
> **Use case:** Colorado owner campaigns → segment ConnectQuote instant-quote pages  
> **Contact:** Gerry Jones — g@commercialinsurance-direct.com — (303) 932-1700

---

## What we need (plain language)

When CID sends an email campaign through Zywave, **each recipient must get their own link** — not one shared URL for everyone. When they click, our quote form opens with **their** business name, address, email, and phone **already filled in**.

We need Zywave to confirm **which approach** below works in your product (or suggest another).

---

## Our landing pages (ConnectQuote)

| Segment | URL (CO campaigns) |
|---------|-------------------|
| HVAC | `https://hvacinsurancedirect.com/connectquote.html` |
| Plumber | `https://plumberinsurancedirect.com/connectquote.html` |
| Electrical | `https://electricalinsurancedirect.com/connectquote.html` |
| Fitness | `https://fitnessinsurancedirect.com/connectquote.html` |
| Beauty | `https://beautyinsurancedirect.com/connectquote.html` |
| Cleaning | `https://cleaninginsurancedirect.com/connectquote.html` |
| Pet services | `https://petserviceinsurancedirect.com/connectquote.html` |

All use the same URL parameter names (see below).

---

## Option A — Merge fields inside the link (preferred)

If Zywave can insert **contact/account fields into a button or image link URL**, use this pattern.

**HVAC example (replace `{...}` with Zywave merge tags):**

```
https://hvacinsurancedirect.com/connectquote.html?fn={FirstName}&ln={LastName}&em={Email}&ph={Phone}&bn={CompanyName}&ad={AddressLine1}&ct={City}&st=CO&zp={Zip}&bc=hvac_contractor&src=zywave&cid={CampaignId}
```

**Plumber example:**

```
https://plumberinsurancedirect.com/connectquote.html?fn={FirstName}&ln={LastName}&em={Email}&ph={Phone}&bn={CompanyName}&ad={AddressLine1}&ct={City}&st=CO&zp={Zip}&bc=plumbing_contractor&src=zywave&cid={CampaignId}
```

### Parameter map (CID ← Zywave list fields)

| CID URL param | Meaning | Typical Zywave / list field |
|---------------|---------|----------------------------|
| `fn` | First name | Contact first name |
| `ln` | Last name | Contact last name |
| `em` | Email | Contact email |
| `ph` | Phone | Contact phone |
| `bn` | Business / insured name | Account or company name |
| `ad` | Street address | Address line 1 |
| `ct` | City | City |
| `st` | State | `CO` (fixed for our pilot) |
| `zp` | ZIP | Postal code |
| `bc` | Business class | Fixed per segment (see table below) |
| `src` | Source tag | Fixed: `zywave` |
| `cid` | Campaign id | Your campaign or list id (tracking) |

### `bc` values by segment (fixed in URL)

| Segment | `bc` value |
|---------|------------|
| HVAC | `hvac_contractor` |
| Plumber | `plumbing_contractor` |
| Electrical | `electric_contracting` |
| Fitness (yoga) | `yoga_studio` |
| Fitness (pilates) | `pilates_studio` |
| Fitness (trainer) | `personal_trainer` |
| Beauty (hair) | `hair_salon` |
| Beauty (barber) | `barber_shop` |
| Beauty (nail) | `nail_salon` |
| Beauty (esthetician) | `esthetician` |
| Cleaning (home) | `home_cleaning` |
| Cleaning (carpet) | `carpet_cleaning` |
| Pet (grooming) | `pet_grooming` |
| Pet (sitting) | `pet_sitting` |

**Optional** (if available on list): `sales`, `payroll` — annual revenue and payroll for faster quoting.

---

## Option B — Pre-built URL column (no Zywave link merge required)

1. Export contact list from Zywave (CSV).  
2. CID adds a column **`quote_url`** with the full personalized link per row.  
3. Campaign uses that column as the button destination (or import into a tool that supports per-row URLs).

**Example row:**

| Email | CompanyName | City | Zip | quote_url |
|-------|-------------|------|-----|-----------|
| owner@acme.com | Acme HVAC LLC | Denver | 80202 | `https://hvacinsurancedirect.com/connectquote.html?fn=Jane&ln=Doe&em=owner%40acme.com&bn=Acme+HVAC+LLC&ct=Denver&st=CO&zp=80202&bc=hvac_contractor&src=zywave&cid=co-hvac-pilot` |

CID can provide a sample 10-row test file on request.

---

## Option C — Single-token redirect (future CID endpoint)

If Zywave can only merge **one field** into a link (e.g. contact id or email):

```
https://cid-pdf-api.onrender.com/campaign/go/{ContactId}?segment=hvac&cid=co-hvac-pilot
```

CID redirects to the full ConnectQuote URL with prefill. **Requires CID setup** for each campaign upload — we can build this if Zywave confirms single-field merge is the limit.

---

## Questions for Zywave engineering

Please reply with yes/no or short notes:

1. Can merge tags be used in **hyperlink / button URL** (not only email body text)?  
2. What is the **exact merge-tag syntax**? (e.g. `{{Contact.Email}}`, `{Account.Name}`, etc.)  
3. Are special characters **URL-encoded** automatically when merged?  
4. If **click tracking** wraps links, do query parameters reach our landing page intact?  
5. Can campaigns send from **our domain** (e.g. `@hvacinsurancedirect.com`) or only Zywave shared domains?  
6. Which option (A, B, or C) is **recommended** for your platform?

---

## What the insured sees

1. Clicks personalized link in email  
2. ConnectQuote form opens with fields prefilled (highlighted)  
3. Owner confirms details → instant premium → optional bind  
4. Post-bind: **CID Connect** app (certificates, coverage questions, documents)

---

## Test checklist (joint)

- [ ] Send **one test email** to CID with a real prefill link  
- [ ] Open on **mobile** (Safari / Chrome)  
- [ ] Confirm name, business, address, email, phone prefilled  
- [ ] Confirm **Get quote** returns a premium (CO owner, eligible class)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-16 | Initial partner prefill guide for Zywave forward to engineering |
| 2026-08-04 | Beauty, Cleaning, Pet ConnectQuote URLs and `bc` values |
