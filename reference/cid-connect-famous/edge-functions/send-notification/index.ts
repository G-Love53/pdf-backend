/**
 * Supabase Edge Function: send-notification
 * Deploy to: supabase/functions/send-notification/index.ts
 * Secrets: RESEND_API_KEY, GATEWAY_API_KEY (and optionally RESEND_FROM_EMAIL)
 *
 * Test (replace host + anon key + gateway key):
 * curl -i -X POST 'https://<project>.supabase.co/functions/v1/send-notification' \
 *   -H 'Authorization: Bearer <GATEWAY_OR_ANON>' \
 *   -H 'Content-Type: application/json' \
 *   -H 'x-gateway-key: <GATEWAY_API_KEY>' \
 *   -d '{"user_email":"you@example.com","reference_number":"CLM-TEST-1","entity_type":"claim","new_status":"approved"}'
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const GATEWAY_EXPECTED = Deno.env.get("GATEWAY_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "CID Connect <onboarding@resend.dev>";

type Body = {
  user_email?: string;
  reference_number?: string;
  entity_type?: "coi" | "claim" | "policy";
  /** Use `settlement_set` for payout-recorded emails; optional details below. */
  new_status?: string;
  /** Plain text or safe HTML snippet, e.g. "Settlement amount: $1,200.00 — Settlement date: 2026-03-30" */
  extra_context?: string | null;
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-gateway-key",
  };
}

function htmlBranded(opts: {
  title: string;
  headline: string;
  bodyLines: string[];
  ref: string;
}): string {
  const lines = opts.bodyLines.map((l) => `<p style="margin:0 0 12px;">${l}</p>`).join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="background:#ea580c;padding:20px 24px;">
          <div style="color:#fff;font-size:18px;font-weight:700;">CID Connect</div>
          <div style="color:#ffedd5;font-size:13px;margin-top:4px;">${opts.title}</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#18181b;">${opts.headline}</h1>
          ${lines}
          <p style="margin:16px 0 0;font-size:12px;color:#71717a;">Reference: <strong>${opts.ref}</strong></p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;">
          This message was sent by CID Connect. Please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildEmailContent(
  input: Pick<Body, "reference_number" | "entity_type" | "new_status" | "extra_context">,
): { subject: string; html: string } {
  const ref = input.reference_number;
  const st = (input.new_status || "").toLowerCase();
  const extra = (input.extra_context || "").trim();

  /** Policy bound confirmation — put details in extra_context (policy #, carrier, premium, effective date). */
  if (input.entity_type === "policy" && st === "bound") {
    const lines: string[] = [
      `Your policy <strong>${ref}</strong> is now <strong>active</strong>.`,
    ];
    if (extra) {
      for (const line of extra.split("\n")) {
        if (line.trim()) lines.push(line.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      }
    }
    return {
      subject: `Policy ${ref} — Confirmation`,
      html: htmlBranded({
        title: "Policy bound",
        headline: "You're covered — policy confirmation",
        bodyLines: lines,
        ref,
      }),
    };
  }

  if (input.entity_type === "claim") {
    if (st === "settlement_set") {
      const subject = `Claim ${ref} — Settlement recorded`;
      const lines: string[] = [
        `A settlement has been recorded for your claim <strong>${ref}</strong>.`,
      ];
      if (extra) {
        lines.push(extra.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      } else {
        lines.push(`Log in to CID Connect to view details.`);
      }
      return {
        subject,
        html: htmlBranded({
          title: "Claim settlement",
          headline: `Settlement recorded for claim ${ref}`,
          bodyLines: lines,
          ref,
        }),
      };
    }

    const subject = `Claim ${ref} — ${input.new_status}`;
    let headline = `Update on your claim ${ref}`;
    let lines: string[] = [`Your claim status is now <strong>${input.new_status}</strong>.`];

    if (st === "approved") {
      headline = `Your claim ${ref} has been approved`;
      lines = [
        `Good news — your claim <strong>${ref}</strong> has been <strong>approved</strong>.`,
        `We will follow up if we need anything else.`,
      ];
    } else if (st === "denied") {
      headline = `Update on claim ${ref}`;
      lines = [`Your claim <strong>${ref}</strong> has been updated to <strong>denied</strong>.`];
    } else if (st === "closed") {
      headline = `Claim ${ref} closed`;
      lines = [`Your claim <strong>${ref}</strong> is now marked <strong>closed</strong>.`];
    }

    if (extra) {
      lines.push(extra.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    }

    return {
      subject,
      html: htmlBranded({
        title: "Claim update",
        headline,
        bodyLines: lines,
        ref,
      }),
    };
  }

  if (input.entity_type !== "coi") {
    return {
      subject: `CID Connect — Notification`,
      html: htmlBranded({
        title: "Update",
        headline: "Update",
        bodyLines: [`Unsupported notification type.`],
        ref,
      }),
    };
  }

  // COI
  const subject = `COI ${ref} — ${input.new_status}`;
  let headline = `COI request ${ref} updated`;
  let lines: string[] = [`Your certificate request <strong>${ref}</strong> is now <strong>${input.new_status}</strong>.`];

  if (st === "completed") {
    headline = `Your COI request ${ref} is now completed`;
    lines = [
      `Your COI request <strong>${ref}</strong> is <strong>completed</strong>.`,
      `Open CID Connect to download your certificate if a link is available in your request history.`,
    ];
  } else if (st === "failed") {
    headline = `COI request ${ref} could not be completed`;
    lines = [
      `Your COI request <strong>${ref}</strong> could not be completed.`,
      `Please contact support or submit a new request with updated details.`,
    ];
  }

  return {
    subject,
    html: htmlBranded({
      title: "Certificate of insurance",
      headline,
      bodyLines: lines,
      ref,
    }),
  };
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

  if (GATEWAY_EXPECTED && gateway !== GATEWAY_EXPECTED) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const user_email = (body.user_email || "").trim();
  const reference_number = (body.reference_number || "").trim();
  const entity_type = body.entity_type;
  const new_status = (body.new_status || "").trim();

  if (!user_email || !reference_number || !entity_type || !new_status) {
    return new Response(
      JSON.stringify({
        error: "Missing user_email, reference_number, entity_type, or new_status",
      }),
      { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  }

  if (entity_type !== "coi" && entity_type !== "claim" && entity_type !== "policy") {
    return new Response(
      JSON.stringify({ error: "entity_type must be coi, claim, or policy" }),
      {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }

  const extra_context = body.extra_context ?? null;

  const { subject, html } = buildEmailContent({
    reference_number,
    entity_type,
    new_status,
    extra_context,
  });

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [user_email],
        subject,
        html,
      }),
    });

    const text = await res.text();

    if (res.status === 429) {
      return new Response(
        JSON.stringify({
          error: "Rate limited by Resend — retry later",
          detail: text.slice(0, 500),
        }),
        {
          status: 429,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: "Resend API error",
          status: res.status,
          detail: text.slice(0, 1000),
        }),
        {
          status: 502,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, resend: JSON.parse(text || "{}") }),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "Send failed", detail: msg }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
