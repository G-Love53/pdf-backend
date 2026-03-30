/**
 * MERGE into api.ts — QuoteResults: Email Quote PDF button
 */

import { supabase } from "@/lib/supabase";

export async function emailQuotePdf(quoteId: string, userEmail: string): Promise<void> {
  const gateway = import.meta.env.VITE_GATEWAY_API_KEY || "";

  const { data, error } = await supabase.functions.invoke("email-quote-pdf", {
    body: { quote_id: quoteId, user_email: userEmail },
    headers: gateway ? { "x-gateway-key": gateway } : {},
  });

  if (error) throw error;
  const payload = data as { ok?: boolean; error?: string };
  if (payload?.error) throw new Error(payload.error);
}
