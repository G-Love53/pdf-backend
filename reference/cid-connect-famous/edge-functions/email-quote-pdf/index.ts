/**
 * Edge Function: email-quote-pdf
 * Body: { quote_id: string, user_email: string }
 * Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GATEWAY_API_KEY, RESEND_FROM_EMAIL
 * Generates PDF (same layout as generate-quote-pdf) and emails via Resend attachments API.
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "CID Connect <onboarding@resend.dev>";
const GATEWAY = Deno.env.get("GATEWAY_API_KEY") ?? "";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-gateway-key",
  };
}

async function buildQuotePdfBytes(row: Record<string, unknown>, quoteId: string): Promise<{
  bytes: Uint8Array;
  filename: string;
}> {
  const analysis =
    (row.analysis_json as Record<string, unknown> | undefined) ||
    (row.analysis as Record<string, unknown> | undefined) ||
    {};

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 760;
  const left = 50;
  const line = 14;

  function drawBold(t: string, size = 14) {
    page.drawText(t, { x: left, y, size, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 6;
  }
  function draw(t: string, size = 11) {
    page.drawText(t.substring(0, 500), { x: left, y, size, font, color: rgb(0.2, 0.2, 0.2) });
    y -= line;
  }

  drawBold("CID Connect — Quote summary");
  draw(`Quote ID: ${String(row.quote_id ?? row.id)}`);
  draw(`Date: ${new Date(String(row.created_at ?? "")).toLocaleString()}`);
  draw(`Segment: ${String(row.segment ?? "")}`);
  draw(`Carrier: ${String(row.carrier_name ?? analysis.carrier ?? "")}`);
  draw(`Premium: ${String(row.premium ?? "")}`);
  draw(`Eligibility: ${String(row.eligibility ?? row.eligibility_status ?? analysis.eligibility ?? "")}`);
  y -= 6;
  drawBold("Coverage summary", 12);
  draw(String(analysis.summary ?? analysis.coverage_summary ?? row.description ?? "—"), 10);

  const bytes = await pdf.save();
  const filename = `quote-${String(row.quote_id ?? quoteId).replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
  return { bytes, filename };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  const gw = req.headers.get("x-gateway-key") ?? "";
  if (GATEWAY && gw !== GATEWAY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
      status: 500,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  let body: { quote_id?: string; user_email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  const quoteId = (body.quote_id || "").trim();
  const userEmail = (body.user_email || "").trim();
  if (!quoteId || !userEmail) {
    return new Response(JSON.stringify({ error: "quote_id and user_email required" }), {
      status: 400,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Supabase env missing" }), {
      status: 500,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(url, key);
  const { data: row, error } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }
  if (!row) {
    return new Response(JSON.stringify({ error: "Quote not found" }), {
      status: 404,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  const r = row as Record<string, unknown>;
  const { bytes, filename } = await buildQuotePdfBytes(r, quoteId);

  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const contentBase64 = btoa(bin);

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [userEmail],
      subject: `Your quote PDF — ${String(r.quote_id ?? quoteId)}`,
      html: `<p>Your requested quote summary is attached.</p><p>— CID Connect</p>`,
      attachments: [{ filename, content: contentBase64 }],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Resend failed", detail: text.slice(0, 800) }), {
      status: 502,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, resend: JSON.parse(text || "{}") }), {
    status: 200,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
});
