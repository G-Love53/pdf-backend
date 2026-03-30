# Browse Carriers button + email quote PDF + policy timeline

## 1) ServicesScreen + MainApp

- **`ServicesScreenProps`:** `onBrowseCarriers?: () => void`
- **Documents** (or new **Carriers** section): button **Browse carriers** → `onBrowseCarriers()`
- **`MainApp`:** `handleBrowseCarriers` → `setServiceView('browse-carriers')`
- **`renderContent`:**  
  `case 'browse-carriers':`  
  `return <CarrierBrowser onBack={handleBackToServices} onSelectCarrier={handleCarrierDetail} />`
- **`getTitle`:** `'browse-carriers'` → `'Browse Carriers'`

---

## 2) `email-quote-pdf` Edge Function

- Deploy **`edge-functions/email-quote-pdf/index.ts`**
- Secrets: **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`**, **`SUPABASE_*`**, **`GATEWAY_API_KEY`**
- Resend **`attachments`**: `{ filename, content: base64 }` (see Resend docs)
- **`api.emailQuotePdf.ts`:** `emailQuotePdf(quoteId, userEmail)` → `supabase.functions.invoke('email-quote-pdf', { body: { quote_id, user_email } })`
- **`QuoteResults`:** **Email Quote PDF** next to Download; `userEmail` from `supabase.auth.getUser()` or profile

---

## 3) Policy timeline

- **`PolicyTimeline.tsx`** — reference builds events from **`policies`** + linked **`quotes`** (adjust column names: `quote_id`, `first_payment_date`, `renewal_date`, etc.)
- **`ServiceView`:** `'policy-timeline'`, state **`selectedPolicyId`**
- **`PolicyVault`:** **View timeline** on card → `setSelectedPolicyId(policy.id)` + `policy-timeline`
- **`renderContent`:**  
  `<PolicyTimeline policyId={selectedPolicyId!} onBack={() => setServiceView('policy')} />`

---

## Paste into Famous

```text
1) ServicesScreen: onBrowseCarriers prop + Browse carriers button; MainApp browse-carriers case with CarrierBrowser, getTitle Browse Carriers.

2) Deploy email-quote-pdf edge function: quote_id + user_email, PDF via pdf-lib, Resend attachment. api emailQuotePdf + QuoteResults button next to Download.

3) PolicyTimeline component + policy-timeline view; PolicyVault View timeline button; fetch quotes/policies for events.

Summarize files changed.
```
