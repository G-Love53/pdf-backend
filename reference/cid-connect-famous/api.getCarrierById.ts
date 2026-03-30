/**
 * MERGE into api.ts
 */

import { supabase } from "@/lib/supabase";

export type CarrierRow = {
  id: string;
  name: string;
  logo_url: string | null;
  segments: string[] | null;
  rating: number | null;
  description: string | null;
  is_active: boolean | null;
};

export async function getCarrierById(id: string): Promise<CarrierRow | null> {
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, logo_url, segments, rating, description, is_active")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as CarrierRow | null;
}
