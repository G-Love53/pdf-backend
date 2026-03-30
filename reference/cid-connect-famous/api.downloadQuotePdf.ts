/**
 * MERGE into api.ts — QuoteResults "Download Quote PDF" button
 */

import { supabase } from "@/lib/supabase";

export async function downloadQuotePdf(quoteId: string): Promise<void> {
  const gateway = import.meta.env.VITE_GATEWAY_API_KEY || "";

  const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
    body: { quote_id: quoteId },
    headers: gateway ? { "x-gateway-key": gateway } : {},
  });

  if (error) throw error;
  const payload = data as { base64?: string; filename?: string; error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.base64) throw new Error("No PDF data");

  const bytes = Uint8Array.from(atob(payload.base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.filename || `quote-${quoteId}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
