# Settlement call + Carrier detail + Quote history

## 1) Admin settlement email (fire-and-forget)

In **`AdminDashboard.tsx`**, in the settlement **Save** handler, after **`await fetchAllData()`** succeeds:

```ts
void afterSettlementSaved(claim, amt, dt).catch((e) => console.warn("settlement notify", e));
```

- Use the same **`claim`**, amount, and date variables you pass to **`updateClaimSettlement`**.
- **`void`** avoids `floating promise` lint; **`.catch`** prevents unhandled rejection if the edge function fails.

---

## 2) Carrier detail (Policy Vault → MainApp)

**State (MainApp):** `selectedCarrierId: string | null`

**`ServiceView`:** add `'carrier-detail'`.

**Render:**

```tsx
case "carrier-detail":
  if (!selectedCarrierId) return null;
  return (
    <CarrierDetail
      carrierId={selectedCarrierId}
      onBack={() => {
        setSelectedCarrierId(null);
        setServiceView("policy"); // or policy-vault key you use
      }}
    />
  );
```

**PolicyVault:** Where the policy card shows **carrier name**, wrap the name in a button:

```tsx
<button
  type="button"
  className="text-left font-medium text-orange-600 underline"
  onClick={() => {
    if (policy.carrier_id) {
      setSelectedCarrierId(policy.carrier_id);
      setServiceView("carrier-detail");
    }
  }}
>
  {carrierName}
</button>
```

**Carrier:** `getCarrierById(carrierId)` — see `api.getCarrierById.ts` and `components/CarrierDetail.tsx`.

---

## 3) Quote history

**`api.ts`:** Ensure **`getUserQuotes(userId)`** (and optionally **`getQuoteById`**) — align column list with your **`quotes`** table (`select('*')` is fine if unsure).

**`ServiceView`:** `'quote-history'`.

**ServicesScreen (Documents):** Button **“Quote history”** → `onQuoteHistory()` → parent sets `quote-history`.

**`QuoteHistory.tsx`:** Cards list; **`onOpenQuote(quote)`**:
- If **`quote.status`** is **`quoted`** (or your bindable state), load full row via **`getQuoteById(quote.id)`**, hydrate **`QuoteResults`** / analysis state, navigate to the same view you use after **analyze-quote** (or pass **`quoteId`** to **`QuoteScreen`** if you have a remount path).

**MainApp:** Pass **`handleOpenQuoteFromHistory`** that sets **`selectedQuoteId`**, fetches analysis payload, **`setServiceView('quote-results')`** (or your route).

---

## Paste into Famous (single prompt)

```text
1) AdminDashboard settlement save: after await fetchAllData() in the settlement Button onClick (~889-903), add fire-and-forget: void afterSettlementSaved(claim, amt, dt).catch(console.warn) using the same variables as updateClaimSettlement.

2) Carrier detail: Add serviceView 'carrier-detail' in MainApp with selectedCarrierId state. Render CarrierDetail.tsx with getCarrierById. In PolicyVault, make carrier name clickable when policy.carrier_id exists; set carrier-detail. Import CarrierDetail from components/services.

3) Quote history: Add getUserQuotes if needed, QuoteHistory.tsx, serviceView 'quote-history', Services button under Documents, handleOpenQuote to re-open QuoteResults for quoted status via getQuoteById + existing quote state.

Match existing Tailwind and naming. Summarize files changed.
```
