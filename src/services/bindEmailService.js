import { sendWithGmail } from "../email.js";
import { getSegmentAgentInboxEmail } from "../config/segmentAgentInbox.js";

/** @param {string} [email] @param {string} [baseUrl] */
export function buildCidConnectUrl(email, baseUrl) {
  const raw =
    baseUrl || process.env.CID_APP_URL || "https://cid-connect.netlify.app";
  const base = raw.split("?")[0].replace(/\/$/, "");
  if (email) return `${base}/?email=${encodeURIComponent(email)}`;
  return base;
}

/** Filename for Gmail attachment; keep consistent with R2 key basename. */
export function bindSignedAttachmentFilename(carrierName) {
  const safe = String(carrierName || "carrier")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .trim()
    .slice(0, 80);
  return `${safe || "carrier"}-quote-signed.pdf`;
}

function formatPolicyDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Post-bind welcome email — single insured-facing message (Connect onboarding + policy summary).
 * @param {{ primary_email?: string, first_name?: string, last_name?: string, contact_name?: string }} client
 * @param {object} policy
 * @param {string} [cidAppUrl]
 * @param {string} [segment]
 * @param {Buffer} [signedPdfBuffer] - BoldSign / HelloSign signed quote (traditional bind)
 * @param {string} [signedPdfFilename]
 */
export async function sendWelcomeEmail({
  client,
  policy,
  cidAppUrl,
  segment,
  signedPdfBuffer,
  signedPdfFilename = "quote-signed.pdf",
}) {
  if (!client?.primary_email) return;

  const attachments =
    signedPdfBuffer && Buffer.isBuffer(signedPdfBuffer)
      ? [{ filename: signedPdfFilename, buffer: signedPdfBuffer }]
      : [];

  const to = [client.primary_email];
  const subject = "You're covered — your CID Connect account is ready";

  const firstName =
    client.first_name ||
    String(client.contact_name || "")
      .trim()
      .split(/\s+/)[0] ||
    "there";
  const url = buildCidConnectUrl(client.primary_email, cidAppUrl);
  const carrier = policy.carrier_name || "your carrier";
  const coverage = policy.policy_type || "Commercial";
  const status =
    String(policy.status || "active").toLowerCase() === "active"
      ? "Active"
      : policy.status || "Active";
  const segmentInbox =
    getSegmentAgentInboxEmail(segment) ||
    "info@commercialinsurance-direct.com";
  const effective = formatPolicyDate(policy.effective_date);
  const expiration = formatPolicyDate(policy.expiration_date);
  const premium =
    policy.annual_premium != null && policy.annual_premium !== ""
      ? `$${Number(policy.annual_premium).toFixed(2)}`
      : null;

  const text = [
    `Hi ${firstName},`,
    "",
    `You're covered. Your ${coverage} policy with ${carrier} is active, and your CID Connect account is ready right now.`,
    "",
    "Open your account here:",
    url,
    "",
    "",
    "SAVE CONNECT TO YOUR HOME SCREEN",
    "",
    "CID Connect works like an app — no download required. Save it for instant access:",
    "",
    'iPhone: Open the link in Safari → tap the Share button (□↑) → tap "Add to Home Screen"',
    "",
    'Android: Open the link in Chrome → tap the three dots (⋮) → tap "Add to Home Screen"',
    "",
    "Once saved, Connect opens like any app on your phone.",
    "",
    "",
    "WHAT YOU CAN DO RIGHT NOW",
    "",
    "• Need a certificate of insurance for a job? Generate one in under 60 seconds",
    "• Add a certificate holder or additional insured — done in the app",
    "• Ask a coverage question and get an answer from your actual policy",
    "• View and download your policy documents anytime",
    "• Check your payment schedule",
    "",
    "",
    "Your policy details:",
    `Carrier: ${carrier}`,
    `Coverage: ${coverage}`,
    ...(policy.policy_number ? [`Policy number: ${policy.policy_number}`] : []),
    ...(premium ? [`Annual premium: ${premium}`] : []),
    ...(effective ? [`Effective: ${effective}`] : []),
    ...(expiration ? [`Expires: ${expiration}`] : []),
    `Status: ${status}`,
    "",
    ...(attachments.length
      ? ["Your signed carrier quote is attached for your records.", ""]
      : []),
    "Questions? Just ask inside the app — we're here.",
    "",
    "— The CID Team",
    "Commercial Insurance Direct",
    segmentInbox,
  ].join("\n");

  await sendWithGmail({
    to,
    subject,
    text,
    segment,
    attachments,
  });
}
