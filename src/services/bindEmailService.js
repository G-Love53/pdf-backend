import { sendWithGmail } from "../email.js";

export async function sendBindConfirmationEmail({ client, policy, segment }) {
  if (!client?.primary_email) return;

  const to = [client.primary_email];
  const subject = `Your ${policy.policy_type} Policy is Bound — ${policy.carrier_name} | Commercial Insurance Direct`;
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
    "Your signed bind confirmation is attached for your records.",
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

