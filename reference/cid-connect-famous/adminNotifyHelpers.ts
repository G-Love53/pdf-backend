/**
 * MERGE into AdminDashboard.tsx OR import from src/lib/adminNotifyHelpers.ts
 * Adjust sendStatusNotification() argument shape to match your api.ts exactly.
 * Toast: swap `sonner` for your app (react-hot-toast, etc.)
 */

import { getUserEmailById, sendStatusNotification } from "@/api";
import { toast } from "sonner";

/** After claim status save succeeds — notify on every status change. */
export async function afterClaimStatusUpdate(
  userId: string | null | undefined,
  claimNumber: string | null | undefined,
  newStatus: string,
) {
  if (!userId || !claimNumber) return;
  try {
    const email = await getUserEmailById(userId);
    if (!email?.trim()) {
      toast.warning("No email on file — notification skipped");
      return;
    }
    await sendStatusNotification({
      user_email: email.trim(),
      reference_number: claimNumber,
      entity_type: "claim",
      new_status: newStatus,
    });
    toast.success("Notification sent");
  } catch (e) {
    console.warn("afterClaimStatusUpdate", e);
    toast.warning("Notification could not be sent");
  }
}

/** After COI status save succeeds — only completed / failed. */
export async function afterCoiStatusUpdate(
  userId: string | null | undefined,
  requestNumber: string | null | undefined,
  newStatus: string,
) {
  if (!userId || !requestNumber) return;
  const s = newStatus.toLowerCase();
  if (s !== "completed" && s !== "failed") return;

  try {
    const email = await getUserEmailById(userId);
    if (!email?.trim()) {
      toast.warning("No email on file — notification skipped");
      return;
    }
    await sendStatusNotification({
      user_email: email.trim(),
      reference_number: requestNumber,
      entity_type: "coi",
      new_status: newStatus,
    });
    toast.success("Notification sent");
  } catch (e) {
    console.warn("afterCoiStatusUpdate", e);
    toast.warning("Notification could not be sent");
  }
}
