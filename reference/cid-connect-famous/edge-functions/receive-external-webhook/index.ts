/**
 * Supabase Edge Function: receive-external-webhook
 * Deploy: supabase/functions/receive-external-webhook/index.ts
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GATEWAY_API_KEY (or WEBHOOK_INGEST_SECRET for inbound auth)
 *
 * After logging the inbound POST to webhook_events (and optional legacy inbound_webhook_events),
 * loads active webhook_rules, matches event_type (exact) and source (NULL = wildcard),
 * executes action_type in try/catch, logs each result as an outbound webhook_events row.
 * Always returns 200 to the external caller on successful ingest unless auth/validation fails.
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GATEWAY_EXPECTED = Deno.env.get("GATEWAY_API_KEY") ?? "";
/** Optional dedicated ingest secret if you do not use gateway key on this route */
const WEBHOOK_INGEST_SECRET = Deno.env.get("WEBHOOK_INGEST_SECRET") ?? "";

type InboundBody = {
  source?: string;
  event_type?: string;
  payload?: Record<string, unknown>;
  [k: string]: unknown;
};

type WebhookRule = {
  id: string;
  source_match: string | null;
  event_type_match: string;
  action_type: string;
  action_config: Record<string, unknown> | null;
  is_active: boolean;
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-gateway-key, x-webhook-secret",
  };
}

function getPayloadValue(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Resolve action_config values: literal string, or "payload.foo.bar" / "body.foo" */
function resolveConfigValue(
  raw: unknown,
  ctx: { payload: Record<string, unknown>; body: Record<string, unknown> },
): unknown {
  if (typeof raw !== "string") return raw;
  const s = raw.trim();
  if (s.startsWith("payload.")) return getPayloadValue(ctx.payload, s.slice(8));
  if (s.startsWith("body.")) return getPayloadValue(ctx.body, s.slice(5));
  return raw;
}

function deepResolve(
  obj: unknown,
  ctx: { payload: Record<string, unknown>; body: Record<string, unknown> },
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return resolveConfigValue(obj, ctx);
  if (Array.isArray(obj)) return obj.map((x) => deepResolve(x, ctx));
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = deepResolve(v, ctx);
    }
    return out;
  }
  return obj;
}

async function logOutbound(
  admin: ReturnType<typeof createClient>,
  row: {
    event_type: string;
    endpoint: string;
    source: string;
    request_body: Record<string, unknown>;
    response_status: number | null;
    response_body: Record<string, unknown>;
  },
): Promise<void> {
  const insert: Record<string, unknown> = {
    event_type: row.event_type,
    direction: "outbound",
    endpoint: row.endpoint,
    source: row.source,
    request_body: row.request_body,
    response_status: row.response_status,
    response_body: row.response_body,
  };
  const { error } = await admin.from("webhook_events").insert(insert);
  if (error) {
    console.error("webhook_events outbound log failed", error.message);
  }
}

async function executeRule(
  admin: ReturnType<typeof createClient>,
  rule: WebhookRule,
  ctx: {
    inboundEventId: string | null;
    source: string;
    event_type: string;
    payload: Record<string, unknown>;
    body: Record<string, unknown>;
  },
): Promise<{ ok: boolean; detail?: string }> {
  const cfg = (rule.action_config ?? {}) as Record<string, unknown>;
  const action = rule.action_type.trim();

  if (action === "log_audit") {
    const audit = (cfg.audit ?? cfg) as Record<string, unknown>;
    const actionText = String(audit.action ?? "webhook_rule");
    const entityType = String(audit.entity_type ?? "inbound_webhook");
    const entityRef = String(
      audit.entity_reference ?? `${ctx.event_type}:${ctx.source}`,
    );
    const newValue = deepResolve(audit.new_value ?? {
      rule_id: rule.id,
      event_type: ctx.event_type,
      source: ctx.source,
      payload: ctx.payload,
    }, ctx) as Record<string, unknown>;

    const { error } = await admin.from("admin_audit_log").insert({
      admin_user_id: null,
      action: actionText,
      entity_type: entityType,
      entity_id: null,
      entity_reference: entityRef,
      admin_email: null,
      old_value: null,
      new_value: newValue,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  if (action === "send_notification") {
    const rawBody = (cfg.invoke_body ?? cfg.body ?? {}) as Record<string, unknown>;
    const resolved = deepResolve(rawBody, ctx) as Record<string, unknown>;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        "x-gateway-key": GATEWAY_EXPECTED,
      },
      body: JSON.stringify(resolved),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text || "{}") as Record<string, unknown>;
    } catch {
      parsed = { raw: text.slice(0, 2000) };
    }
    if (!res.ok) {
      throw new Error(`send-notification ${res.status}: ${text.slice(0, 500)}`);
    }
    return { ok: true, detail: JSON.stringify(parsed).slice(0, 500) };
  }

  if (action === "create_claim") {
    const mappings = (cfg.field_mappings ?? cfg.mappings ?? {}) as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    for (const [col, spec] of Object.entries(mappings)) {
      row[col] = resolveConfigValue(spec, ctx);
    }
    if (!row.user_id) throw new Error("create_claim requires user_id in mappings");
    if (!row.claim_number) {
      row.claim_number = `CLM-WH-${Date.now().toString(36).toUpperCase()}`;
    }
    if (!row.status) row.status = "submitted";
    if (!row.photo_paths) row.photo_paths = [];
    if (!row.backend_notified) row.backend_notified = false;

    const { error } = await admin.from("claims").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  throw new Error(`Unknown action_type: ${action}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const gateway = req.headers.get("x-gateway-key") ?? "";
  const bearerSecret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const xSecret = req.headers.get("x-webhook-secret") ?? "";

  const authorized =
    (GATEWAY_EXPECTED && gateway === GATEWAY_EXPECTED) ||
    (WEBHOOK_INGEST_SECRET &&
      (bearerSecret === WEBHOOK_INGEST_SECRET || xSecret === WEBHOOK_INGEST_SECRET));

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: InboundBody;
  try {
    body = (await req.json()) as InboundBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const source = String(body.source ?? req.headers.get("x-webhook-source") ?? "unknown");
  const event_type = String(body.event_type ?? "");
  const payload = (body.payload ?? body) as Record<string, unknown>;

  if (!event_type) {
    return new Response(JSON.stringify({ error: "event_type required" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let inboundId: string | null = null;

  const inboundInsert: Record<string, unknown> = {
    event_type,
    direction: "inbound",
    endpoint: "receive-external-webhook",
    source,
    request_body: body as Record<string, unknown>,
    response_status: 200,
    response_body: { ok: true, accepted: true },
  };

  const { data: insertedInbound, error: inErr } = await admin
    .from("webhook_events")
    .insert(inboundInsert)
    .select("id")
    .maybeSingle();

  if (inErr) {
    console.error("webhook_events inbound insert", inErr.message);
  } else {
    inboundId = (insertedInbound as { id?: string } | null)?.id ?? null;
  }

  // Legacy table (optional)
  await admin.from("inbound_webhook_events").insert({
    source,
    event_type,
    payload: body as Record<string, unknown>,
  }).then(({ error }) => {
    if (error && !String(error.message).includes("does not exist")) {
      console.warn("legacy inbound_webhook_events:", error.message);
    }
  });

  const { data: rules, error: rulesErr } = await admin
    .from("webhook_rules")
    .select("*")
    .eq("is_active", true);

  if (rulesErr) {
    console.error("webhook_rules load", rulesErr.message);
  }

  const list = (rules ?? []) as WebhookRule[];
  const matched = list.filter((r) => {
    if (r.event_type_match !== event_type) return false;
    if (r.source_match === null || r.source_match === "") return true;
    return r.source_match === source;
  });

  const execCtx = {
    inboundEventId: inboundId,
    source,
    event_type,
    payload,
    body: body as Record<string, unknown>,
  };

  for (const rule of matched) {
    try {
      const result = await executeRule(admin, rule, execCtx);
      await logOutbound(admin, {
        event_type: "webhook_rule_execution",
        endpoint: "receive-external-webhook:rule",
        source: `rule:${rule.id}`,
        request_body: {
          rule_id: rule.id,
          action_type: rule.action_type,
          event_type,
          source,
        },
        response_status: 200,
        response_body: {
          ok: true,
          ...result,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOutbound(admin, {
        event_type: "webhook_rule_execution",
        endpoint: "receive-external-webhook:rule",
        source: `rule:${rule.id}`,
        request_body: {
          rule_id: rule.id,
          action_type: rule.action_type,
          event_type,
          source,
        },
        response_status: 500,
        response_body: {
          ok: false,
          error: msg,
        },
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      inbound_id: inboundId,
      rules_matched: matched.length,
    }),
    { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
  );
});
