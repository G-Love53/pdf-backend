const express = require('express');
const multer = require('multer');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer();

app.post('/submit', upload.none(), async (req, res) => {
  console.log("📝 Form received:", req.body);

  const formData = req.body;

  try {
    // 📧 Set up email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    // 📄 Submit to Society form
    await fetch('https://www.webmerge.me/merge/1216545/g9g6t6', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    // 📄 Submit to Bar125 form
    await fetch('https://www.webmerge.me/merge/1216553/y6dk9k', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    // ⏱️ Wait 3 seconds to allow Formstack to finalize the PDFs
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 📥 Download merged PDFs from Formstack
const headers = {
  Authorization: `Bearer ${process.env.FORMSTACK_API_KEY}`
};

const societyPDF = await fetch('https://www.webmerge.me/api/documents/1216545/merged', { headers });
const bar125PDF = await fetch('https://www.webmerge.me/api/documents/1216553/merged', { headers });

const societyBuffer = await societyPDF.arrayBuffer();
const bar125Buffer = await bar125PDF.arrayBuffer();

// 📧 Send confirmation email with PDFs attached
const mailOptions = {
  from: '"BarInsuranceDirect Submission" <quote@barinsurancedirect.com>',
  to: 'quote@barinsurancedirect.com',
  subject: 'New Bar/Tavern Submission',
  text: `You received a new submission.\n\nData:\n${JSON.stringify(formData, null, 2)}`,
  attachments: [
    { filename: 'Society.pdf', content: Buffer.from(societyBuffer) },
    { filename: 'Bar125.pdf', content: Buffer.from(bar125Buffer) }
  ]
};

const info = await transporter.sendMail(mailOptions);
console.log("📧 Email sent:", info.response);
res.json({
  status: "Thank you for your submission! We value your business. A quote will be sent to your email shortly."
});
}; // ✅ closes the try block
catch (error) {
  console.error("❌ Error:", error);
  res.status(500).json({ error: "Failed to send email or submit PDFs." });
}
}); // closes app.post

// 🟢 Start the server
app.listen(port, () => {
  console.log("🚀 Server listening on port", port);
});
