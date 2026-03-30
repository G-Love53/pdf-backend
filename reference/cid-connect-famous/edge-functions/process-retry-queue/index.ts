/**
 * Reference: process-retry-queue — Supabase Edge Function
 * Famous may differ; compare with deployed code.
 *
 * Invoke: pg_cron / Dashboard schedule POST with Authorization: Bearer <SERVICE_ROLE>
 * Optional: require x-internal-secret matching Deno.env INTERNAL_RETRY_QUEUE_SECRET
 *
 * Assumes table retry_queue: id, webhook_event_id, target_function, retry_count, max_retries,
 * next_retry_at, status, last_error, payload (jsonb optional), ...
 * Assumes webhook_events has request_body for replay when payload is null.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function getBackoffMinutes(retryCount: number): number {
  const schedule = [1, 5, 15];
  return schedule[Math.min(retryCount, schedule.length - 1)];
}

type RetryRow = {
  id: string;
  webhook_event_id: string | null;
  target_function: string;
  retry_count: number;
  max_retries: number;
  payload: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internal = Deno.env.get("INTERNAL_RETRY_QUEUE_SECRET") ?? "";
    const gateway = Deno.env.get("GATEWAY_API_KEY") ?? "";

    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const headerSecret = req.headers.get("x-internal-secret") ?? "";

    const authed =
      bearer === SUPABASE_SERVICE_ROLE_KEY ||
      (!!internal && headerSecret === internal);

    if (!authed) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const now = new Date().toISOString();
    const { data: rows, error: selErr } = await supabase
      .from("retry_queue")
      .select("id, webhook_event_id, target_function, retry_count, max_retries, payload")
      .eq("status", "pending")
      .lte("next_retry_at", now)
      .order("next_retry_at", { ascending: true })
      .limit(25);

    if (selErr) throw selErr;

    const processed: {
      id: string;
      outcome: "succeeded" | "requeued" | "failed" | "skipped";
      detail?: string;
    }[] = [];

    for (const row of (rows ?? []) as RetryRow[]) {
      const { error: lockErr } = await supabase
        .from("retry_queue")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");

      if (lockErr) {
        processed.push({ id: row.id, outcome: "skipped", detail: lockErr.message });
        continue;
      }

      let body: Record<string, unknown> = { ...(row.payload ?? {}) };

      if (Object.keys(body).length === 0 && row.webhook_event_id) {
        const { data: ev } = await supabase
          .from("webhook_events")
          .select("request_body")
          .eq("id", row.webhook_event_id)
          .maybeSingle();
        const rb = ev?.request_body as Record<string, unknown> | null;
        if (rb && typeof rb === "object") body = rb;
      }

      body["skip_dedup"] = true;

      const fn = (row.target_function || "send-notification").replace(/^\//, "");
      const url = `${SUPABASE_URL}/functions/v1/${fn}`;

      let invokeOk = false;
      let invokeStatus = 0;
      let invokeText = "";

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            ...(gateway ? { "x-gateway-key": gateway } : {}),
          },
          body: JSON.stringify(body),
        });
        invokeStatus = res.status;
        /// Keep body small for logging.
        invokeText = await res.text();
        invokeOk = res.ok;
        if (invokeOk) {
          try {
            const j = JSON.parse(invokeText) as { queued?: boolean; ok?: boolean; skipped?: boolean };
            if (j.queued === true) invokeOk = false;
            if (j.skipped === true) invokeOk = false;
            if (j.ok === false) invokeOk = false;
          } catch {
            /* non-JSON success body is fine */
          }
        }
      } catch (e) {
        invokeText = e instanceof Error ? e.message : String(e);
        invokeOk = false;
      }

      const nextCount = row.retry_count + 1;
      const ts = new Date().toISOString();

      if (invokeOk) {
        await supabase
          .from("retry_queue")
          .update({
            status: "succeeded",
            retry_count: nextCount,
            updated_at: ts,
            last_error: null,
          })
          .eq("id", row.id);
        processed.push({ id: row.id, outcome: "succeeded" });
      } else if (nextCount >= row.max_retries) {
        await supabase
          .from("retry_queue")
          .update({
            status: "failed",
            retry_count: nextCount,
            last_error: `${invokeStatus} ${invokeText.slice(0, 500)}`,
            updated_at: ts,
          })
          .eq("id", row.id);
        processed.push({
          id: row.id,
          outcome: "failed",
          detail: invokeText.slice(0, 200),
        });
      } else {
        const mins = getBackoffMinutes(nextCount);
        const nextAt = new Date(Date.now() + mins * 60_000).toISOString();
        await supabase
          .from("retry_queue")
          .update({
            status: "pending",
            retry_count: nextCount,
            next_retry_at: nextAt,
            last_error: `${invokeStatus} ${invokeText.slice(0, 500)}`,
            updated_at: ts,
          })
          .eq("id", row.id);
        processed.push({ id: row.id, outcome: "requeued", detail: `next ${nextAt}` });
      }

      // Optional: insert outbound webhook_events row for processor audit
    }

    return new Response(
      JSON.stringify({
        ok: true,
        picked: (rows ?? []).length,
        processed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
