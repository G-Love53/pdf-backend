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
        console.log("🚀 Triggering Society merge...");
        const societyMergeRes = await fetch('https://www.webmerge.me/merge/1216545/g9g6t6', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        console.log(`Society merge triggered. Status: ${societyMergeRes.status}`);

        // 📄 Submit to Bar125 form
        console.log("🚀 Triggering Bar125 merge...");
        const bar125MergeRes = await fetch('https://www.webmerge.me/merge/1216553/y6dk9k', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        console.log(`Bar125 merge triggered. Status: ${bar125MergeRes.status}`);

        // ⏱️ Wait 8 seconds to allow Formstack to finalize the PDFs
        console.log("⏱️ Waiting 8 seconds for PDFs to finalize...");
        await new Promise(resolve => setTimeout(resolve, 8000));
        console.log("⏱️ Wait complete. Attempting to download.");

        // 📥 Download merged PDFs from Formstack
        const headers = {
            Authorization: `Bearer ${process.env.FORMSTACK_API_KEY}`
        };

        console.log("Attempting to download Society PDF...");
        const societyPDFResponse = await fetch('https://www.webmerge.me/api/documents/1216545/merged', { headers });
        console.log(`Society PDF download status: ${societyPDFResponse.status}`);
        if (!societyPDFResponse.ok) {
            const errorText = await societyPDFResponse.text();
            console.error(`Society PDF download failed: ${societyPDFResponse.statusText} - ${errorText}`);
            throw new Error(`Failed to download Society PDF: ${societyPDFResponse.statusText}`);
        }
        const societyBuffer = await societyPDFResponse.arrayBuffer();
        console.log(`Society PDF downloaded. Size: ${societyBuffer.byteLength} bytes`);


        console.log("Attempting to download Bar125 PDF...");
        const bar125PDFResponse = await fetch('https://www.webmerge.me/api/documents/1216553/merged', { headers });
        console.log(`Bar125 PDF download status: ${bar125PDFResponse.status}`);
        if (!bar125PDFResponse.ok) {
            const errorText = await bar125PDFResponse.text();
            console.error(`Bar125 PDF download failed: ${bar125PDFResponse.statusText} - ${errorText}`);
            throw new Error(`Failed to download Bar125 PDF: ${bar125PDFResponse.statusText}`);
        }
        const bar125Buffer = await bar125PDFResponse.arrayBuffer();
        console.log(`Bar125 PDF downloaded. Size: ${bar125Buffer.byteLength} bytes`);

        // 📧 Send confirmation email with PDFs attached
        const mailOptions = {
            from: '"BarInsuranceDirect Submission" <quote@barinsurancedirect.com>',
            to: 'quote@barinsurancedirect.com',
            subject: 'New Bar/Tavern Submission',
            text: `You received a new submission.\n\nData:\n${JSON.stringify(formData, null, 2)}`,
            attachments: [
                { filename: 'Society.pdf', content: Buffer.from(societyBuffer), contentType: 'application/pdf' },
                { filename: 'Bar125.pdf', content: Buffer.from(bar125Buffer), contentType: 'application/pdf' }
            ]
        };

        console.log("📧 Attempting to send email...");
        const info = await transporter.sendMail(mailOptions);
        console.log("📧 Email sent:", info.response);
        res.json({
            status: "Thank you for your submission! We value your business. A quote will be sent to your email shortly."
        });
    } catch (error) {
        console.error("❌ Error in /submit:", error);
        res.status(500).json({ error: "Failed to send email or submit PDFs. See server logs for details." });
    }
});

app.listen(port, () => {
    console.log("🚀 Server listening on port", port);
});
