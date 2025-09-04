import nodemailer from "nodemailer";

export async function sendWithGmail({ to, subject, html, attachments }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    html,
    attachments: attachments.map(a => ({ filename: a.filename, content: a.buffer }))
  });
}

