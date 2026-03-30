/**
 * MERGE into api.ts — align field names with your `quotes` table + QuoteAnalysisResult.
 */

import { supabase } from "@/lib/supabase";

/** Fetch full quote by business quote_id or UUID id. */
export async function getQuoteDetails(quoteId: string): Promise<Record<string, unknown> | null> {
  const { data: byQ, error: e1 } = await supabase
    .from("quotes")
    .select("*")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (e1) throw e1;
  if (byQ) return byQ as Record<string, unknown>;

  const { data: byId, error: e2 } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (e2) throw e2;
  return (byId as Record<string, unknown>) ?? null;
}

/**
 * Map DB row → QuoteAnalysisResult for QuoteResults / QuoteScreen.
 * CUSTOMIZE to match your QuoteAnalysisResult shape and stored JSON columns.
 */
export function quoteRowToAnalysisResult(row: Record<string, unknown>): unknown {
  const analysis =
    (row.analysis_json as Record<string, unknown> | undefined) ||
    (row.analysis as Record<string, unknown> | undefined) ||
    {};

  return {
    segment: row.segment,
    premium: row.premium,
    eligibility: row.eligibility ?? row.eligibility_status,
    carrier: row.carrier_name,
    carrierId: row.carrier_id,
    carrierOptions: row.carrier_options ?? [],
    summary: analysis.summary ?? row.description ?? "",
    ...analysis,
    _quoteRowId: row.id,
    _quoteId: row.quote_id,
  };
}
