import nodemailer from "nodemailer";

// Generate formatted HTML email summary (shared across segments)
function generateEmailSummary(formData = {}, attachments = [], senderEmail = "quote@barinsurancedirect.com") {
  const safe = (v) => (v == null || v === "" ? "N/A" : String(v));

  const attachmentNames = (attachments || [])
    .map((a) => a?.filename)
    .filter(Boolean);

  const attachmentsLine = attachmentNames.length
    ? `<p style="text-align:center; padding:0 20px 20px 20px; font-size:0.95em; color:#444;">
        PDFs attached: ${attachmentNames.join(", ")}
       </p>`
    : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .header { background-color: #ff8c00; color: white; padding: 12px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 20px; background-color: #f5f5f5; margin: 20px; border-radius: 8px; }
        .field { margin: 10px 0; }
        .label { font-weight: bold; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Commercial Insurance Quote Request</h1>
      </div>
      
      <div class="content">
        <h3>Applicant Information:</h3>
        
        <div class="field">
          <span class="label">Business Name:</span> ${safe(formData.applicant_name || formData.insured_name)}
        </div>
        
        <div class="field">
          <span class="label">Premises Name:</span> ${safe(formData.premises_name)}
        </div>
        
        <div class="field">
          <span class="label">Address:</span> ${safe(formData.premise_address || formData.mailing_address)}
        </div>
        
        <div class="field">
          <span class="label">Phone:</span> ${safe(formData.business_phone || formData.applicant_phone)}
        </div>
        
        <div class="field">
          <span class="label">Email:</span> ${safe(formData.contact_email)}
        </div>
        
        <div class="field">
          <span class="label">Effective Date:</span> ${safe(formData.effective_date || formData.policy_effective_date)}
        </div>
        
        <div class="field">
          <span class="label">Would Like A Building Quote:</span> ${safe(formData.building_quote)}
        </div>
        
        <div class="field">
          <span class="label">Workers Comp Quote:</span> ${safe(formData.workers_comp_quote)}
        </div>
        
        <div class="field">
          <span class="label">Total Sales:</span> ${safe(formData.total_sales)}
        </div>
      </div>
      
      <p style="text-align: center; padding: 10px 20px 0 20px;">
        Please find the completed application forms attached. We look forward to your competitive quote.
      </p>
      ${attachmentsLine}
      
      <div class="footer">
        <strong>Commercial Insurance Direct LLC</strong><br/>
        Phone: (303) 932-1700<br/>
        Email: <a href="mailto:${senderEmail}">${senderEmail}</a>
      </div>
    </body>
    </html>
  `;
}

function normalizeSegment(segment) {
  return String(segment || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolveSegmentSender(segment) {
  const seg = normalizeSegment(segment);
  const suffix = seg ? seg.toUpperCase() : "";

  const segUser =
    (suffix && process.env[`GMAIL_USER_${suffix}`]) || null;
  const segPass =
    (suffix && process.env[`GMAIL_APP_PASSWORD_${suffix}`]) || null;

  const user = segUser || process.env.GMAIL_USER;
  const pass = segPass || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      `Missing Gmail credentials for segment=${seg || "default"} (expected GMAIL_USER/GMAIL_APP_PASSWORD or segment-specific vars)`,
    );
  }

  const replyTo =
    (suffix && process.env[`GMAIL_REPLY_TO_${suffix}`]) || user;

  return { user, pass, replyTo };
}

export async function sendWithGmail({
  to,
  subject,
  html,
  text,
  formData,
  attachments = [],
  segment = null,
  fromOverride = null,
  replyToOverride = null,
  /** Optional RFC822 headers (e.g. X-CID-Origin for poller to ignore client submission mail). */
  headers = {},
}) {
  const sender = resolveSegmentSender(segment);
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: sender.user, pass: sender.pass },
  });

  const emailHtml =
    formData && !html && !text
      ? generateEmailSummary(formData, attachments, sender.user)
      : html;

  const mail = {
    from: fromOverride || sender.user,
    replyTo: replyToOverride || sender.replyTo,
    to,
    subject,
    html: emailHtml,
    text,
    attachments: (attachments || []).map((a) => ({
      filename: a.filename,
      content: a.buffer,
    })),
  };
  if (headers && typeof headers === "object" && Object.keys(headers).length > 0) {
    mail.headers = headers;
  }
  await transporter.sendMail(mail);
}
