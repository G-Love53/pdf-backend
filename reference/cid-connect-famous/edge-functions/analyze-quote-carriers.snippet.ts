/**
 * MERGE into existing analyze-quote Edge Function AFTER AI analysis returns.
 * Requires: Supabase service client or fetch to REST to load carriers.
 *
 * Pseudocode:
 * 1. Let segment = (analysis.segment || body.segment || 'bar').toLowerCase()
 * 2. Query carriers where is_active = true and segment = ANY(segments)
 * 3. Append to JSON response: { ..., carrierOptions: rows }
 *
 * Example (Deno + supabase-js):
 */

/*
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function carriersForSegment(segment: string) {
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, logo_url, segments, rating, description")
    .eq("is_active", true)
    .contains("segments", [segment]);

  if (error) throw error;
  return data ?? [];
}

// If .contains doesn't match array overlap, use RPC or filter in JS:
// .filter(c => c.segments?.map(s => s.toLowerCase()).includes(segment))
*/

export {};
