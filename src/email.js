import nodemailer from "nodemailer";

// Generate formatted HTML email summary
function generateEmailSummary(formData) {
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
  .footer { padding: 20px; text-align: center; color: #666; }
</style>
    </head>
    <body>
      <div class="header">
        <h1>Commercial Insurance Quote Request</h1>
      </div>
      
      <div class="content">
        <h3>Applicant Information:</h3>
        
        <div class="field">
          <span class="label">Business Name:</span> ${formData.applicant_name || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Premises Name:</span> ${formData.premises_name || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Address:</span> ${formData.premise_address || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Phone:</span> ${formData.business_phone || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Email:</span> ${formData.contact_email || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Effective Date:</span> ${formData.effective_date || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Would Like A Building Quote:</span> ${formData.building_quote || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Workers Comp Quote:</span> ${formData.workers_comp_quote || 'N/A'}
        </div>
        
        <div class="field">
          <span class="label">Total Sales:</span> ${formData.total_sales || 'N/A'}
        </div>
      </div>
      
      <p style="text-align: center; padding: 20px;">
        Please find the completed application forms attached. We look forward to your competitive quote.
      </p>
      
      <div class="footer">
        <strong>Commercial Insurance Direct LLC</strong><br/>
        Phone: (303) 932-1700<br/>
        Email: <a href="mailto:quote@barinsurancedirect.com">quote@barinsurancedirect.com</a>
      </div>
    </body>
    </html>
  `;
}

export async function sendWithGmail({ to, subject, html, formData, attachments }) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    // Use generated summary if formData provided, otherwise use provided html
    const emailHtml = formData ? generateEmailSummary(formData) : html;

    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to,
        subject,
        html: emailHtml,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.buffer }))
    });
}
