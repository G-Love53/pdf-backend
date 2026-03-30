# QuoteHistory back + Open quote + Carrier resources

## 1) QuoteHistory `onBack` + ArrowLeft

- Path: **`src/components/history/QuoteHistory.tsx`** (move file if needed).
- Props: **`onBack: () => void`**, **`onOpenQuote: (quote) => void`**.
- Top bar: **`<ArrowLeft />` + “Back”** calling **`onBack`**.
- MainApp **`quote-history`** view:  
  **`<QuoteHistory onBack={handleBackToServices} onOpenQuote={handleOpenQuoteFromHistory} />`**

---

## 2) Open Quote (quoted → bind flow)

**Handler in MainApp** (example):

```ts
async function handleOpenQuoteFromHistory(q: QuoteRow) {
  const key = q.quote_id || q.id;
  if (!key) return;
  const row = await getQuoteDetails(key);
  if (!row) return;
  const result = quoteRowToAnalysisResult(row) as QuoteAnalysisResult;
  setQuoteAnalysisResult(result);
  setSelectedQuoteId(row.id as string);
  setServiceView("quote"); // or 'quote-results' — match your tab key
  setQuoteStep("results"); // if you use step state for QuoteScreen
}
```

- Implement **`getQuoteDetails`** + **`quoteRowToAnalysisResult`** in **`api.ts`** — see **`api.quoteDetailsAdapter.ts`** (adjust to your stored **`analysis_json`** / columns).
- **QuoteScreen / QuoteResults** must read the same **`QuoteAnalysisResult`** shape your **`analyze-quote`** path uses.

---

## 3) CarrierDetail → `carrier_resources`

- Add **`getCarrierResources(carrierName, segment)`** and **`downloadCarrierResource`** — see **`api.carrierResources.ts`** (bucket/path may differ).
- Import **`CarrierResourcesSection`** into **`CarrierDetail.tsx`** after the segments block:

```tsx
import CarrierResourcesSection from "@/components/CarrierResourcesSection";

// Inside render, when carrier loaded:
const resourceSegment = carrier.segments?.[0] ?? "";
{resourceSegment ? (
  <CarrierResourcesSection carrierName={carrier.name} segment={resourceSegment} />
) : null}
```

- For **multiple segments**, add a small segment **tabs** or **dropdown** and pass **`resourceSegment`** state into **`CarrierResourcesSection`**.

---

## Paste into Famous

```text
1) QuoteHistory: ensure onBack with ArrowLeft Back button; MainApp quote-history passes handleBackToServices.

2) QuoteHistory: for status === 'quoted', show primary "Open quote" button; onOpenQuote(quote) in MainApp calls getQuoteDetails(quote.quote_id || quote.id), quoteRowToAnalysisResult, set analysis state, navigate to Quote tab/results for binding.

3) CarrierDetail: add CarrierResourcesSection; use getCarrierResources(carrier.name, first segment or selectable segment); group by resource_type; Download uses downloadCarrierResource. Merge api.carrierResources helpers if missing.

Summarize files changed.
```
