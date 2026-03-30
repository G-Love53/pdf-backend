/**
 * MERGE into api.ts if not present.
 * Align with carrier_resources table + storage paths in your Supabase project.
 */

import { supabase } from "@/lib/supabase";

export type CarrierResourceRow = {
  id: string;
  carrier_name: string;
  segment: string | null;
  resource_type: string | null;
  title: string | null;
  file_path: string | null;
  file_url?: string | null;
};

export async function getCarrierResources(
  carrierName: string,
  segment: string,
): Promise<CarrierResourceRow[]> {
  const { data, error } = await supabase
    .from("carrier_resources")
    .select("*")
    .ilike("carrier_name", carrierName.trim())
    .eq("segment", segment);

  if (error) throw error;
  return (data ?? []) as CarrierResourceRow[];
}

/** Signed download or public URL — adjust bucket name */
export async function downloadCarrierResource(resource: CarrierResourceRow): Promise<void> {
  if (resource.file_url) {
    window.open(resource.file_url, "_blank", "noopener,noreferrer");
    return;
  }
  if (!resource.file_path) return;

  const { data, error } = await supabase.storage
    .from("cid-uploads")
    .createSignedUrl(resource.file_path, 3600);

  if (error) throw error;
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
