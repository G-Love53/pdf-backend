import { sendWithGmail } from "../email.js";

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
  const seg = String(segment || "bar").toLowerCase();
  const display = SEGMENT_DISPLAY[seg] || "Commercial Insurance";
  const line = SEGMENT_LINE[seg] || "";

  const premium = packetData.annual_premium ?? packetData.premium;

  const html =
    bodyOverride ||
    `
    <p>Hi ${packetData.contact_name || packetData.client_name || ""},</p>
    <p>
      Thank you for requesting a commercial insurance quote through
      ${display} Insurance Direct.
    </p>
    <p>
      We've reviewed options from our carrier partners and have a
      ${packetData.policy_type || ""} quote ready for you from
      ${packetData.carrier_name || ""}:
    </p>
    <ul>
      <li>Annual Premium: $${premium != null ? Number(premium).toLocaleString() : "—"}</li>
      <li>Effective Date: ${packetData.effective_date || "—"}</li>
      <li>Per Occurrence Limit: $${packetData.gl_per_occurrence != null ? Number(packetData.gl_per_occurrence).toLocaleString() : "—"}</li>
      <li>Aggregate Limit: $${packetData.gl_aggregate != null ? Number(packetData.gl_aggregate).toLocaleString() : "—"}</li>
    </ul>
    <p>
      Your full quote packet is attached, including a detailed coverage summary
      and the carrier's official quote document.
    </p>
    <p>${line}</p>
    <p>
      If you'd like to move forward, simply reply to this email or call us.
      We can bind coverage and have your certificate of insurance ready the same day.
    </p>
    <p>
      You can also manage your policy, generate certificates, and ask coverage
      questions anytime through the CID app:<br/>
      ${packetData.cid_app_url || "https://app.commercialinsurancedirect.com"}
    </p>
  `;

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

