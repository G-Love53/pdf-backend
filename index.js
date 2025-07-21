const express = require('express');
const multer = require('multer');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer();

app.post('/submit', upload.none(), async (req, res) => {
  console.log("📝 Form received:", req.body);

  // Extract fields
  const formData = req.body;

  try {
    // Set up transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'quote@barinsurancedirect.com',     
        pass: 'ipthsumgewnkwxpm'                
      }
    });

    // Build the message
    const mailOptions = {
      from: '"BarInsuranceDirect Submission" <quote@barinsurancedirect.com',
      to: 'quote@barinsurancedirect.com',
      subject: 'New Bar/Tavern Submission',
      text: `You received a new submission.\n\nData:\n${JSON.stringify(formData, null, 2)}`
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.response);

    res.json({ status: "Email sent!" });
  } catch (error) {
    console.error("❌ Email failed:", error);
    res.status(500).json({ error: "Failed to send email." });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Backend is running.");
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(port, () => {
  console.log(`🚀 PDF backend listening on port ${port}`);
});
