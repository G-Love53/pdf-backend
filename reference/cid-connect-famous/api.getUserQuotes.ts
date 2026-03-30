/**
 * MERGE into api.ts if getUserQuotes is missing.
 * Assumes a `quotes` table with user_id, segment, premium, status/eligibility, carrier fields, etc.
 */

import { supabase } from "@/lib/supabase";

export async function getUserQuotes(userId: string) {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data ?? [];
}

/** Fetch single quote for re-open / QuoteResults */
export async function getQuoteById(quoteId: string) {
  const { data, error } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error) throw error;
  return data;
}
