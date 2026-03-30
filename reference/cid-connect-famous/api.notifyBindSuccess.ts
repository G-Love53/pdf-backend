/**
 * MERGE into api.ts (same module as sendStatusNotification).
 *
 * QuoteScreen handleBindSuccess:
 *   void notifyBindSuccess({ userEmail, policyNumber, carrierName, premiumDisplay, effectiveDate })
 *     .catch((e) => console.warn("bind notify", e));
 */

/*
import { sendStatusNotification } from "./same-file-after-merge";

export async function notifyBindSuccess(input: {
  userEmail: string;
  policyNumber: string;
  carrierName: string;
  premiumDisplay: string;
  effectiveDate: string;
}): Promise<void> {
  const extra_context = [
    `Policy number: ${input.policyNumber}`,
    `Carrier: ${input.carrierName}`,
    `Premium: ${input.premiumDisplay}`,
    `Effective date: ${input.effectiveDate}`,
  ].join("\n");

  await sendStatusNotification({
    user_email: input.userEmail,
    reference_number: input.policyNumber,
    entity_type: "policy",
    new_status: "bound",
    extra_context,
  });
}
*/

export {};
