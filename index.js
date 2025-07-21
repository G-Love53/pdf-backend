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

// Gmail transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'quote@barinsurancedirect.com',
    pass: 'biuwuyyjryiwerqs' // Replace with your actual App Password
  }
});

// Handle Netlify form submission
app.post('/submit', upload.none(), async (req, res) => {
  console.log("✅ Form received:", req.body);

  const formData = req.body;

  // Build email message
  const mailOptions = {
    from: '"BarInsuranceDirect Submission" <quote@barinsurancedirect.com>',
    to: 'quote@barinsurancedirect.com',
    subject: `Bar/Tavern Submission - ${formData.applicant_name || 'No Name'}`,
    text: `
📄 New Bar/Tavern Submission Received

Applicant Name: ${formData.applicant_name}
Premises: ${formData.premises_name}
Address: ${formData.premises_address}
Phone: ${formData.business_phone}
Website: ${formData.premises_website}
Email: ${formData.contact_email}
Food Sales: ${formData.food_sales}
Alcohol Sales: ${formData.alcohol_sales}
Total Sales: ${formData.total_sales}
Percent Alcohol: ${formData.percent_alcohol}
Entertainment: ${formData.entertainment_details}

🔗 PDF merge should now be triggered automatically from Formstack.
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("📨 Email sent successfully!");
    res.json({ status: "Success", received: formData });
  } catch (error) {
    console.error("❌ Email failed:", error);
    res.status(500).json({ status: "Email Error", error });
  }
});

app.get("/", (req, res) => {
  res.send("🟢 Backend is running.");
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(port, () => {
  console.log(`🚀 PDF backend listening on port ${port}`);
});
