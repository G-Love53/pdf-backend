import { sendWithGmail } from "../email.js";

/** Filename for Gmail attachment; keep consistent with R2 key basename. */
export function bindSignedAttachmentFilename(carrierName) {
  const safe = String(carrierName || "carrier")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .trim()
    .slice(0, 80);
  return `${safe || "carrier"}-bind-confirmation-signed.pdf`;
}

/**
 * @param {{ primary_email?: string, first_name?: string, last_name?: string, contact_name?: string }} client
 * @param {object} policy
 * @param {string} [segment]
 * @param {Buffer} [signedPdfBuffer] - same bytes as stored in R2 (BoldSign / HelloSign completion)
 * @param {string} [signedPdfFilename] - e.g. Society-Insurance-bind-confirmation-signed.pdf
 */
export async function sendBindConfirmationEmail({
  client,
  policy,
  segment,
  signedPdfBuffer,
  signedPdfFilename = "bind-confirmation-signed.pdf",
}) {
  if (!client?.primary_email) return;

  const attachments =
    signedPdfBuffer && Buffer.isBuffer(signedPdfBuffer)
      ? [{ filename: signedPdfFilename, buffer: signedPdfBuffer }]
      : [];

  const to = [client.primary_email];
  const subject = `Your ${policy.policy_type} Policy is Bound — ${policy.carrier_name} | Commercial Insurance Direct`;
  const attachmentNote = attachments.length
    ? "Your signed bind confirmation is attached for your records."
    : "Your signed bind confirmation is on file; reply to this email if you need a copy.";

  const text = [
    `Hi ${client.contact_name || client.first_name || "there"},`,
    "",
    `Great news — your ${policy.policy_type} policy with ${policy.carrier_name} is officially bound.`,
    "",
    `Policy Number: ${policy.policy_number}`,
    `Carrier: ${policy.carrier_name}`,
    `Coverage Type: ${policy.policy_type}`,
    `Annual Premium: $${Number(policy.annual_premium || 0).toFixed(2)}`,
    `Effective Date: ${policy.effective_date}`,
    `Expiration Date: ${policy.expiration_date}`,
    "",
    attachmentNote,
    "",
    "We'll have your full policy documents and certificate of insurance available within 24-48 hours.",
    "",
    "Questions about your coverage? Reply to this email or call us anytime.",
    "",
    "— CID Team",
    "Commercial Insurance Direct",
  ].join("\n");

  await sendWithGmail({
    to,
    subject,
    text,
    segment,
    attachments,
  });
}

export async function sendWelcomeEmail({ client, policy, cidAppUrl, segment }) {
  if (!client?.primary_email) return;

  const to = [client.primary_email];
  const subject =
    "Welcome to CID — Manage Your Policy, Get COIs Instantly";

  const url = cidAppUrl || process.env.CID_APP_URL || "https://app.cid.famous.ai";

  const text = [
    `Hi ${client.contact_name || client.first_name || "there"},`,
    "",
    "Welcome to Commercial Insurance Direct. Your " +
      `${policy.policy_type} policy with ${policy.carrier_name} is active and your account is ready.`,
    "",
    "Here's what you can do right now:",
    "",
    "• Download certificates of insurance (COIs) instantly",
    "• Add additional insureds for job sites",
    "• Ask coverage questions and get answers from your actual policy documents",
    "• View your policy details and payment schedule",
    "",
    "Access your account:",
    url,
    "",
    "Need a COI for a job tomorrow? You can generate one in under 60 seconds through the app.",
    "",
    "— CID Team",
    "Commercial Insurance Direct",
  ].join("\n");

  await sendWithGmail({
    to,
    subject,
    text,
    segment,
  });
}

