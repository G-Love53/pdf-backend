/**
 * MERGE into api.ts — used when navigating from activity feed by id only
 */

import { supabase } from "@/lib/supabase";
// import type { Claim, COIRequest } from "@/types";

export async function getClaimById(id: string) {
  const { data, error } = await supabase.from("claims").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCoiRequestById(id: string) {
  const { data, error } = await supabase.from("coi_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPolicyById(id: string) {
  const { data, error } = await supabase.from("policies").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
