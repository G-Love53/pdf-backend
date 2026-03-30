# Admin notifications, Analytics tab, Claim detail — Famous handoff

CID Connect source of truth is **Famous**. This repo holds **reference files** to copy or paste into Famous’s prompt.

## 1. `api.ts`

- Ensure **`getClaimPhotoUrl`** exists (see `api.getClaimPhotoUrl.ts`).
- Ensure **`Claim`** in `types/index.ts` includes optional fields you use: `photo_paths` (string[]), `estimated_amount`, `third_party_name`, `third_party_contact`, `adjuster_*`, `backend_*`, `created_at`, `updated_at`.

## 2. AdminDashboard — notifications

After **`handleClaimStatusUpdate`** successfully updates the row:

```ts
await afterClaimStatusUpdate(claim.user_id, claim.claim_number, newStatus);
```

After **`handleCoiStatusUpdate`** successfully updates the row:

```ts
await afterCoiStatusUpdate(req.user_id, req.request_number, newStatus);
```

Import from `./adminNotifyHelpers` or paste `adminNotifyHelpers.ts` into `src/lib/`.

- **COI:** only `completed` and `failed` send (handled inside `afterCoiStatusUpdate`).
- **Claims:** all changes send (handled by always calling `afterClaimStatusUpdate` after success).

If **`sendStatusNotification`** uses different property names, adjust `adminNotifyHelpers.ts` to match `api.ts`.

**Toast:** If the project does not use `sonner`, replace `toast.success` / `toast.warning` with your toast helper.

## 3. AdminDashboard — Analytics tab

- Add file **`components/AnalyticsTab.tsx`** from this folder (`components/AnalyticsTab.tsx`).
- Import `AnalyticsTab` in `AdminDashboard.tsx`.
- Add a **4th tab** `"Analytics"` that renders `<AnalyticsTab />`.
- Align **`AnalyticsData`** fields with `AnalyticsTab.tsx` (e.g. `claimsPerWeek`, `coiPerWeek`, `policyBindsPerMonth`, summary numbers). If your `getAnalyticsData()` returns different keys, update the mapping in `AnalyticsTab.tsx` once.

## 4. Claim detail — MainApp + ClaimHistory

**State** (e.g. in `MainApp.tsx`):

```ts
const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
```

**`ServiceView` type:** add `'claim-detail'`.

**`renderContent` switch:**

```tsx
case "claim-detail":
  if (!selectedClaim) return null;
  return (
    <ClaimDetail
      claim={selectedClaim}
      onBack={() => {
        setSelectedClaim(null);
        setServiceView("claim-history");
      }}
    />
  );
```

**`ServicesScreen` → `ClaimHistory`:** pass `onOpenClaim={(c) => { setSelectedClaim(c); setServiceView("claim-detail"); }}` (or lift from parent).

**`ClaimHistory.tsx`:** on card click, call `onOpenClaim(claim)`.

**Import:** `import ClaimDetail from "@/components/services/ClaimDetail";` (adjust path).

## 5. Famous prompt (single block)

You can paste this into Famous:

```text
Integrate the following using existing api.ts (getUserEmailById, sendStatusNotification, getAnalyticsData, AnalyticsData, getClaimPhotoUrl).

A) In AdminDashboard.tsx after successful handleClaimStatusUpdate and handleCoiStatusUpdate: resolve user email with getUserEmailById(claim.user_id or coi.user_id), then sendStatusNotification with reference_number (claim_number or request_number), entity_type claim|coi, new_status. Toast success "Notification sent"; on failure non-blocking warning. COI: only when new status is completed or failed. Claims: all status changes.

B) Add 4th tab Analytics rendering bar charts from getAnalyticsData() — claims/week, COI/week, binds/month (div+Tailwind), plus summary cards: total premium, avg claim amount, total claims with amounts, total claim amount.

C) Add ClaimDetail.tsx and route service view claim-detail from ClaimHistory card tap; pass selected claim via MainApp state; back returns to claim-history.

Use sonner for toasts if present; otherwise use existing toast.
```
