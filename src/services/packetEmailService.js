import { sendWithGmail } from "../email.js";
import { createSignedBindLinkParams } from "../utils/bindLinkToken.js";

const SEGMENT_DISPLAY = {
  bar: "Bar & Restaurant",
  roofer: "Roofing Contractor",
  plumber: "Plumber",
  hvac: "HVAC Contractor",
};

const SEGMENT_LINE = {
  bar: "This quote includes coverage tailored for bar and restaurant operations, including liquor liability where indicated.",
  roofer: "This quote addresses the specific liability and workers' comp needs of roofing contractors.",
  plumber: "This quote covers the professional liability and equipment risks specific to plumbing operations.",
  hvac: "This quote includes pollution liability and refrigerant coverage designed for HVAC contractors.",
};

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return escapeHtml(v);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return escapeHtml(v);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/**
 * Same HTML used when sending the client packet email (unless bodyOverride replaces it).
 * @param {object} opts
 * @param {string} [opts.segment]
 * @param {object} opts.packetData - from buildPacketData / buildPacket
 * @param {string|null|undefined} [opts.bodyOverride] - full HTML replacement from operator
 * @returns {{ html: string }}
 */
export function buildPacketEmailHtml({ segment, packetData, bodyOverride }) {
  if (bodyOverride && String(bodyOverride).trim()) {
    return { html: String(bodyOverride) };
  }

  const seg = String(segment || "bar").toLowerCase();
  const display = SEGMENT_DISPLAY[seg] || "Commercial Insurance";
  const line = SEGMENT_LINE[seg] || "";

  const premium = packetData.annual_premium ?? packetData.premium ?? null;
  const glSummary =
    packetData.gl_per_occurrence || packetData.gl_aggregate
      ? `${packetData.gl_per_occurrence ? `$${Number(packetData.gl_per_occurrence).toLocaleString()} per occurrence` : "—"}${packetData.gl_per_occurrence && packetData.gl_aggregate ? " / " : ""}${packetData.gl_aggregate ? `$${Number(packetData.gl_aggregate).toLocaleString()} aggregate` : ""}`
      : "—";
  const submissionId = packetData.submission_public_id || "—";
  const apiBase =
    process.env.PUBLIC_API_BASE_URL ||
    process.env.CID_API_BASE_URL ||
    "https://cid-pdf-api.onrender.com";
  const bindNowUrl =
    packetData.quote_id
      ? (() => {
          const base = `${apiBase.replace(/\/$/, "")}/api/quotes/${encodeURIComponent(String(packetData.quote_id))}/bind/initiate`;
          const signed = createSignedBindLinkParams({
            quoteId: String(packetData.quote_id),
            submissionPublicId: String(packetData.submission_public_id || ""),
          });
          if (!signed) return `${base}?source=email`;
          return `${base}?source=email&t=${encodeURIComponent(signed.t)}&exp=${encodeURIComponent(signed.exp)}`;
        })()
      : null;
  const questionsTo = `quotes@${seg}insurancedirect.com`;
  const questionSubject = `Question re: Quote ${submissionId}`;
  const questionBody = "My question about my quote: ";
  const questionMailto = `mailto:${encodeURIComponent(questionsTo)}?subject=${encodeURIComponent(questionSubject)}&body=${encodeURIComponent(questionBody)}`;

  const html = `
<div style="font-family: Arial, sans-serif; color:#111827; line-height:1.45;">
  <p>Hi ${escapeHtml(packetData.contact_name || packetData.client_name || "there")},</p>
  <p>Thank you for the opportunity to earn your business. The full carrier quote is attached for your review.</p>
  <p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>

  <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse; width:100%; max-width:720px; border-color:#e5e7eb; font-size:14px; margin: 12px 0 20px 0;">
    <tr style="background:#f9fafb;"><th align="left">Business Name</th><td>${escapeHtml(packetData.client_name || "—")}</td></tr>
    <tr><th align="left">Coverage Type</th><td>${escapeHtml(packetData.policy_type || "—")}</td></tr>
    <tr style="background:#f9fafb;"><th align="left">Carrier Name</th><td>${escapeHtml(packetData.carrier_name || "—")}</td></tr>
    <tr><th align="left">General Liability Limits</th><td>${escapeHtml(glSummary)}</td></tr>
    <tr style="background:#f9fafb;"><th align="left">Annual Premium</th><td>${formatMoney(premium)}</td></tr>
    <tr><th align="left">Effective Date</th><td>${formatDate(packetData.effective_date)}</td></tr>
    <tr style="background:#f9fafb;"><th align="left">Submission ID</th><td>${escapeHtml(submissionId)}</td></tr>
  </table>

  <div style="margin: 16px 0 8px 0;">
    ${
      bindNowUrl
        ? `<a href="${escapeHtml(bindNowUrl)}" style="display:inline-block; background:#111827; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:8px; font-weight:700;">Issue Policy</a>`
        : `<span style="display:inline-block; background:#9ca3af; color:#ffffff; padding:12px 18px; border-radius:8px; font-weight:700;">Issue Policy unavailable</span>`
    }
  </div>
  <p style="font-size:12px;color:#6b7280;margin-top:10px;max-width:36rem;">
    After you click, you&rsquo;ll see a short confirmation and you&rsquo;ll get an email from our e-sign partner with a link to sign the bind confirmation (separate from this message).
  </p>
  <div style="margin: 10px 0;">
    <a href="${escapeHtml(questionMailto)}" style="display:inline-block; background:#ffffff; color:#111827; text-decoration:none; padding:10px 14px; border-radius:8px; border:1px solid #d1d5db; font-weight:600;">I Have Questions</a>
  </div>
  <div style="margin: 8px 0 16px 0;">
    <a href="#" style="font-size:13px; color:#6b7280; text-decoration:underline;">Not Right Now</a>
  </div>

  <p style="font-size:13px; color:#374151;">
    Premium is billed directly by your carrier per the payment schedule included with your policy documents.
    No payment is collected by Commercial Insurance Direct.
  </p>

  <p style="font-size:13px; color:#6b7280;">${escapeHtml(display)} Insurance Direct</p>
</div>
  `;

  return { html };
}

/** Default subject line when operator does not override (matches finalize). */
export function defaultPacketEmailSubject(packetData) {
  return `Your ${packetData.policy_type || ""} Insurance Quote — ${packetData.carrier_name || ""}`;
}

export async function sendPacketEmail({
  segment,
  to,
  cc = [],
  subject,
  bodyOverride,
  packetData,
  attachmentBuffer,
  attachmentFilename,
}) {
  const { html } = buildPacketEmailHtml({
    segment,
    packetData,
    bodyOverride,
  });

  await sendWithGmail({
    to: [to, ...cc].filter(Boolean),
    subject,
    html,
    formData: null,
    attachments: attachmentBuffer
      ? [
          {
            filename: attachmentFilename,
            buffer: attachmentBuffer,
          },
        ]
      : [],
  });
}

