/**
 * MERGE into api.ts — bulk campaigns (server-side send recommended for large lists)
 * Client version: sequential invoke with 1s delay (below)
 */

import { supabase } from "@/lib/supabase";

export type CampaignRow = {
  id: string;
  name: string;
  template_id: string | null;
  recipient_filter: Record<string, unknown>;
  status: string;
  sent_count: number;
  failed_count: number;
  total_recipients: number;
  created_at: string;
};

export async function listCampaigns() {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CampaignRow[];
}

export async function createCampaign(row: Partial<CampaignRow>) {
  const { data, error } = await supabase.from("campaigns").insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateCampaign(id: string, patch: Partial<CampaignRow>) {
  const { error } = await supabase.from("campaigns").update(patch).eq("id", id);
  if (error) throw error;
}

/** Resolve recipients from filter — customize to your schema */
export async function previewRecipientCount(filter: Record<string, unknown>): Promise<number> {
  let q = supabase.from("profiles").select("id", { count: "exact", head: true });

  const role = filter.role as string | undefined;
  if (role) q = q.eq("role", role);

  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sequential sends at ~1/sec. For production, move to Edge Function + queue.
 */
export async function runCampaignSend(
  campaignId: string,
  recipients: { email: string; user_name?: string }[],
  buildPayload: (r: { email: string; user_name?: string }) => Record<string, unknown>,
): Promise<void> {
  let sent = 0;
  let failed = 0;
  const gateway = import.meta.env.VITE_GATEWAY_API_KEY || "";

  await updateCampaign(campaignId, { status: "sending", total_recipients: recipients.length });

  for (const rec of recipients) {
    try {
      const { error } = await supabase.functions.invoke("send-notification", {
        body: buildPayload(rec),
        headers: gateway ? { "x-gateway-key": gateway } : {},
      });
      if (error) throw error;
      sent++;
    } catch {
      failed++;
    }
    await sleep(1000);
    await updateCampaign(campaignId, { sent_count: sent, failed_count: failed });
  }

  await updateCampaign(campaignId, {
    status: failed === recipients.length ? "failed" : "completed",
  });
}
