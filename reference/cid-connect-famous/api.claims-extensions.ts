/**
 * MERGE INTO Famous `src/api.ts` (or import these functions).
 * Dependencies: supabase client, types COIRequest, Claim, Policy, User.
 */

import { supabase } from "@/lib/supabase";
// import type { Claim, COIRequest } from "@/types";

const CID_API_BASE =
  import.meta.env.VITE_CID_API_URL || "https://cid-pdf-api.onrender.com";

/** Same key you use for COI backend notify (Famous Secrets → GATEWAY_API_KEY). */
function gatewayHeaders(): HeadersInit {
  const key = import.meta.env.VITE_GATEWAY_API_KEY || "";
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) h["X-API-Key"] = key;
  return h;
}

function claimNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(1000 + Math.random() * 9000);
  return `CLM-${t}-${r}`;
}

export async function uploadClaimPhotos(
  userId: string,
  files: File[],
): Promise<{ path: string; name: string }[]> {
  const out: { path: string; name: string }[] = [];
  const prefix = `claims/${userId}/${Date.now()}`;
  for (const file of files) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${prefix}/${safe}`;
    const { error } = await supabase.storage.from("cid-uploads").upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;
    out.push({ path, name: file.name });
  }
  return out;
}

export type SubmitClaimInput = {
  userId: string;
  policyId: string | null;
  segment: string;
  policyNumber?: string | null;
  claimType: string;
  incidentDate: string;
  incidentLocation: string;
  description: string;
  thirdPartyInfo?: string | null;
  photos: File[];
};

export type SubmitClaimResult = {
  claimId: string;
  claimNumber: string;
  backendOk: boolean;
  backendMessage?: string;
};

/**
 * Insert claim, upload photos, notify backend (same pattern as submitCoiRequest).
 * Adjust `CLAIM_NOTIFY_PATH` if your Render route differs.
 */
export async function submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult> {
  const claim_no = claimNumber();
  const uploads = await uploadClaimPhotos(input.userId, input.photos);

  const row = {
    user_id: input.userId,
    policy_id: input.policyId,
    segment: input.segment.toLowerCase(),
    claim_number: claim_no,
    claim_type: input.claimType,
    incident_date: input.incidentDate,
    incident_location: input.incidentLocation,
    description: input.description,
    third_party_info: input.thirdPartyInfo || null,
    photo_paths: uploads.map((u) => u.path),
    status: "submitted",
    backend_notified: false,
    backend_response: null as string | null,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("claims")
    .insert(row)
    .select("id")
    .single();

  if (insErr) throw insErr;
  const claimId = inserted.id as string;

  let backendOk = false;
  let backendMessage = "";

  try {
    const CLAIM_NOTIFY_PATH =
      import.meta.env.VITE_CLAIM_NOTIFY_PATH || "/file-claim";

    const res = await fetch(`${CID_API_BASE}${CLAIM_NOTIFY_PATH}`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: JSON.stringify({
        claim_id: claimId,
        claim_number: claim_no,
        user_id: input.userId,
        policy_id: input.policyId,
        policy_number: input.policyNumber,
        segment: input.segment,
        claim_type: input.claimType,
        incident_date: input.incidentDate,
        incident_location: input.incidentLocation,
        description: input.description,
        third_party_info: input.thirdPartyInfo,
        photo_paths: uploads.map((u) => u.path),
      }),
    });

    const text = await res.text();
    backendOk = res.ok;
    backendMessage = text.slice(0, 2000);

    await supabase
      .from("claims")
      .update({
        backend_notified: res.ok,
        backend_response: backendMessage,
      })
      .eq("id", claimId);
  } catch (e: unknown) {
    backendMessage = e instanceof Error ? e.message : String(e);
    await supabase
      .from("claims")
      .update({
        backend_notified: false,
        backend_response: backendMessage,
      })
      .eq("id", claimId);
  }

  return {
    claimId,
    claimNumber: claim_no,
    backendOk,
    backendMessage,
  };
}

export async function getUserClaims(userId: string) {
  const { data, error } = await supabase
    .from("claims")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** If not already in api.ts — fetch COI rows for history screen */
export async function getUserCoiRequests(userId: string) {
  const { data, error } = await supabase
    .from("coi_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export type CoiStatus = "submitted" | "processing" | "completed" | "failed";

export async function adminListCoiRequests() {
  const { data, error } = await supabase
    .from("coi_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function adminUpdateCoiRequest(
  id: string,
  patch: {
    status?: CoiStatus | string;
    generated_pdf_url?: string | null;
  },
) {
  const { error } = await supabase.from("coi_requests").update(patch).eq("id", id);

  if (error) throw error;
}
