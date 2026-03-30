# Bind confirmation email + Browse carriers + Quote PDF

## 1) Bind success → email (fire-and-forget)

**Edge function `send-notification`** must support **`entity_type: "policy"`** + **`new_status: "bound"`** + **`extra_context`** (multi-line: policy #, carrier, premium, effective date). Reference updated in **`edge-functions/send-notification/index.ts`**.

**`api.ts`:** add **`notifyBindSuccess`** (see commented template in **`api.notifyBindSuccess.ts`**) calling **`sendStatusNotification`**.

**`QuoteScreen`** — in **`handleBindSuccess`** after policy is persisted:

```ts
void notifyBindSuccess({
  userEmail: user.email!,
  policyNumber: policy.policy_number,
  carrierName: selectedCarrierName,
  premiumDisplay: formatMoney(premium),
  effectiveDate: policy.effective_date ?? policy.effective_start ?? "",
}).catch((e) => console.warn("bind notify", e));
```

Adjust field names to your **`bindQuote`** / policy insert result.

---

## 2) Browse carriers

- **`ServiceView`:** `'browse-carriers'`.
- **`CarrierBrowser.tsx`** — **`components/CarrierBrowser.tsx`** (reference): **`getActiveCarriers()`**, search, grid, card click → **`onSelectCarrier(id)`**.
- **`MainApp`:** **`handleBrowseCarriers`**, **`handleCarrierDetail(id)`** already exists — from browser call **`setSelectedCarrierId(id)`** + **`carrier-detail`** OR reuse **`handleCarrierDetail`**.
- **`ServicesScreen`:** button **“Browse carriers”** → **`onBrowseCarriers()`**.

---

## 3) `generate-quote-pdf` Edge Function

- Deploy **`edge-functions/generate-quote-pdf/index.ts`**.
- Secrets: **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`GATEWAY_API_KEY`** (same pattern as other functions).
- **`downloadQuotePdf(quoteId)`** in **`api.downloadQuotePdf.ts`** — invokes function, decodes **`base64`**, triggers download.

**`QuoteResults.tsx`:** After analysis, show **Download Quote PDF** → **`downloadQuotePdf(quote.id)`** (or current quote row id).

**Note:** `pdf-lib` + `esm.sh` in Deno may need version pinning if deploy fails. If `analysis_json` shape differs, adjust the PDF text layout in the edge function.

---

## Paste into Famous

```text
1) After successful bind in QuoteScreen, fire-and-forget notifyBindSuccess via send-notification with entity_type policy, new_status bound, extra_context with policy number, carrier, premium, effective date. Use void/catch. Extend send-notification edge function if needed.

2) Add browse-carriers service view, CarrierBrowser with getActiveCarriers searchable grid, Services button, navigate to carrier-detail on card click.

3) Deploy generate-quote-pdf edge function (quote row from DB, pdf-lib summary). Add downloadQuotePdf in api.ts and Download Quote PDF button on QuoteResults after analysis; invoke with x-gateway-key.

Summarize files changed.
```
