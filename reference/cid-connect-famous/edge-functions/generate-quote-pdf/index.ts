/**
 * Supabase Edge Function: generate-quote-pdf
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GATEWAY_API_KEY
 * Client: supabase.functions.invoke('generate-quote-pdf', { body: { quote_id } })
 *
 * Returns JSON: { base64: string, filename: string } — client decodes to Blob download.
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";

const GATEWAY = Deno.env.get("GATEWAY_API_KEY") ?? "";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-gateway-key",
  };
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

  let body: { quote_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  const quoteId = (body.quote_id || "").trim();
  if (!quoteId) {
    return new Response(JSON.stringify({ error: "quote_id required" }), {
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
  const analysis =
    (r.analysis_json as Record<string, unknown> | undefined) ||
    (r.analysis as Record<string, unknown> | undefined) ||
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
  draw(`Quote ID: ${String(r.quote_id ?? r.id)}`);
  draw(`Date: ${new Date(String(r.created_at ?? "")).toLocaleString()}`);
  draw(`Segment: ${String(r.segment ?? "")}`);
  draw(`Carrier: ${String(r.carrier_name ?? analysis.carrier ?? "")}`);
  draw(`Premium: ${String(r.premium ?? "")}`);
  draw(`Eligibility: ${String(r.eligibility ?? r.eligibility_status ?? analysis.eligibility ?? "")}`);
  y -= 6;
  drawBold("Coverage summary", 12);
  draw(String(analysis.summary ?? analysis.coverage_summary ?? r.description ?? "—"), 10);
  y -= 4;
  drawBold("Risk factors", 12);
  const risks = analysis.risk_factors ?? analysis.risks ?? [];
  if (Array.isArray(risks)) {
    for (const x of risks.slice(0, 12)) draw(`• ${String(x)}`, 10);
  } else {
    draw(String(risks || "—"), 10);
  }

  const bytes = await pdf.save();
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const base64 = btoa(bin);
  const filename = `quote-${String(r.quote_id ?? quoteId).replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;

  return new Response(JSON.stringify({ base64, filename }), {
    status: 200,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
});
