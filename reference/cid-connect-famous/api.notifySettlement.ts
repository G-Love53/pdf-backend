/**
 * MERGE into api.ts — call after updateClaimSettlement() succeeds (admin saved settlement).
 * Requires sendStatusNotification to accept extra_context and edge function new_status settlement_set.
 */

import { getUserEmailById, sendStatusNotification } from "@/api";

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    Number(n),
  );
}

export async function notifyClaimSettlementRecorded(
  userId: string,
  claimNumber: string,
  settlementAmount: number | null | undefined,
  settlementDate: string | null | undefined,
) {
  const email = await getUserEmailById(userId);
  if (!email?.trim()) return;

  const parts: string[] = [];
  const amt = money(settlementAmount ?? null);
  if (amt) parts.push(`Settlement amount: ${amt}`);
  if (settlementDate) parts.push(`Settlement date: ${settlementDate}`);
  const extra_context = parts.join(" — ") || undefined;

  await sendStatusNotification({
    user_email: email.trim(),
    reference_number: claimNumber,
    entity_type: "claim",
    new_status: "settlement_set",
    extra_context,
  });
}
