/**
 * MERGE into Famous src/api.ts (or keep alongside and re-export).
 * Requires bucket: cid-uploads
 */

import { supabase } from "@/lib/supabase";

/** Signed URL for one stored object path (private bucket). */
export async function getClaimPhotoUrl(
  storagePath: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("cid-uploads")
    .createSignedUrl(storagePath, expiresInSec);

  if (error) {
    console.warn("getClaimPhotoUrl:", storagePath, error.message);
    return null;
  }
  return data.signedUrl;
}
