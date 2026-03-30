/**
 * MERGE into api.ts — Webhooks admin tab
 */

import { supabase } from "@/lib/supabase";

export type WebhookEventRow = {
  id: string;
  event_type: string;
  channel: string | null;
  target_function: string | null;
  request_body: unknown;
  status: string;
  response_body: string | null;
  http_status: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
};

export async function getWebhookEvents(opts: {
  limit?: number;
  offset?: number;
  event_type?: string | null;
  status?: string | null;
}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  let q = supabase
    .from("webhook_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.event_type) q = q.eq("event_type", opts.event_type);
  if (opts.status) q = q.eq("status", opts.status);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as WebhookEventRow[], total: count ?? 0 };
}

/** Re-invoke edge function with stored request_body */
export async function retryWebhookEvent(id: string): Promise<void> {
  const { data: row, error: fe } = await supabase
    .from("webhook_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fe) throw fe;
  if (!row) throw new Error("Event not found");

  const r = row as WebhookEventRow;
  const fn = r.target_function || "send-notification";
  const gateway = import.meta.env.VITE_GATEWAY_API_KEY || "";

  const { error } = await supabase.functions.invoke(fn, {
    body: r.request_body ?? {},
    headers: gateway ? { "x-gateway-key": gateway } : {},
  });

  if (error) throw error;

  await supabase
    .from("webhook_events")
    .update({
      retry_count: (r.retry_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
