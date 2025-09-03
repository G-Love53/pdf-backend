const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fssync = require('fs');
const archiver = require('archiver');
const path = require('path');
const { spawn, exec } = require('child_process');
const os = require('os');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// --- Log pdftk path/version at boot (to see if platform flips binaries) ---
exec('which pdftk && pdftk --version', (e, out, err) => {
  console.log('PDFTK PATH/VERSION:\n', out || err || (e && e.message) || '(unknown)');
});

// CORS config
app.use(cors({
  origin: [
    "https://barinsurancedirect.com",
    "https://barinsurancedirect.netlify.app",
    "https://roofingcontractorinsurancedirect.com",
    "https://barindex.com",
    "https://www.barindex.com",
    "http://localhost:8888"
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Origin', 'X-Requested-With', 'Accept'],
  credentials: true
}));

// EMAIL CONFIG
const EMAIL_CONFIG = {
  'RoofingForm': {
    from: process.env.GMAIL_USER_ROOFING || 'quotes@roofingcontractorinsurancedirect.com',
    to: [
      process.env.CARRIER_EMAIL_ROOFING || 'quotes@roofingcontractorinsurancedirect.com',
      process.env.UW_EMAIL_ROOFING || 'gtjoneshome@gmail.com'
    ].filter(Boolean),
    subject: 'Quote Request - {applicant_name} - Roofing Contractor Insurance'
  },
  'Roofing125': {
    from: process.env.GMAIL_USER_ROOFING || 'quotes@roofingcontractorinsurancedirect.com',
    to: [
      process.env.CARRIER_EMAIL_ROOFING || 'quotes@roofingcontractorinsurancedirect.com',
      process.env.UW_EMAIL_ROOFING || 'gtjoneshome@gmail.com'
    ].filter(Boolean),
    subject: 'Quote Request - {applicant_name} - Roofing Contractor Insurance'
  },
  'Roofing126': {
    from: process.env.GMAIL_USER_ROOFING || 'quotes@roofingcontractorinsurancedirect.com',
    to: [
      process.env.CARRIER_EMAIL_ROOFING || 'quotes@roofingcontractorinsurancedirect.com',
      process.env.UW_EMAIL_ROOFING || 'gtjoneshome@gmail.com'
    ].filter(Boolean),
    subject: 'Quote Request - {applicant_name} - Roofing Contractor Insurance'
  },
  'BarAccord125': {
    from: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
    to: [process.env.CARRIER_EMAIL || 'quote@barinsurancedirect.com'],
    subject: 'Quote Request - {applicant_name} - Bar/Restaurant Insurance'
  },
  'BarAccord140': {
    from: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
    to: [process.env.CARRIER_EMAIL || 'quote@barinsurancedirect.com'],
    subject: 'Quote Request - {applicant_name} - Bar/Restaurant Insurance'
  },
  'Society_FieldNames': {
    from: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
    to: [process.env.CARRIER_EMAIL || 'quote@barinsurancedirect.com'],
    subject: 'Quote Request - {applicant_name} - Bar/Restaurant Insurance'
  },
  'BarAccord126': {
    from: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
    to: [process.env.CARRIER_EMAIL || 'quote@barinsurancedirect.com'],
    subject: 'Quote Request - {applicant_name} - Bar/Restaurant Insurance'
  },
  'WCBarform': {
    from: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
    to: [process.env.CARRIER_EMAIL || 'quote@barinsurancedirect.com'],
    subject: 'Quote Request - {applicant_name} - Bar/Restaurant Insurance'
  }
};

// Select email config by segment(s)
function getEmailConfig(segments) {
  for (const segment of segments) {
    if (EMAIL_CONFIG[segment]) return EMAIL_CONFIG[segment];
  }
  return {
    from: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
    to: [process.env.CARRIER_EMAIL || 'quote@barinsurancedirect.com'],
    subject: 'Quote Request - {applicant_name} - Commercial Insurance'
  };
}

// Middleware for parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  if (!apiKey || apiKey !== 'CID9200$') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// Gmail transporter
function createGmailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

// Email sending
async function sendQuoteToCarriers(filesToZip, formData, segments) {
  try {
    console.log('Starting email send process...');
    const emailConfig = getEmailConfig(segments);
    const transporter = createGmailTransporter();
    const subject = emailConfig.subject.replace('{applicant_name}', formData.applicant_name || 'New Application');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff8c00;">Commercial Insurance Quote Request</h2>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Applicant Information:</h3>
          <p><strong>Business Name:</strong> ${formData.applicant_name || 'N/A'}</p>
          <p><strong>Premises Name:</strong> ${formData.premises_name || 'N/A'}</p>
          <p><strong>Address:</strong> ${formData.premise_address || 'N/A'}</p>
          <p><strong>Phone:</strong> ${formData.business_phone || 'N/A'}</p>
          <p><strong>Email:</strong> ${formData.contact_email || 'N/A'}</p>
          <p><strong>Effective Date:</strong> ${formData.effective_date || 'N/A'}</p>
          <p><strong>Would Like A Building Quote:</strong> ${formData.building_quote || 'N/A'}</p>
          <p><strong>Workers Comp Quote:</strong> ${formData.workers_comp_quote || 'N/A'}</p>
          ${formData.total_sales ? `<p><strong>Total Sales:</strong> ${formData.total_sales}</p>` : ''}
        </div>
        <p>Please find the completed application forms attached. We look forward to your competitive quote.</p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
          <p><strong>Commercial Insurance Direct LLC</strong><br>
          Phone: (303) 932-1700<br>
          Email: ${emailConfig.from}</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: emailConfig.from,
      to: emailConfig.to,
      subject,
      html: emailHtml,
      attachments: filesToZip.map(file => ({
        filename: file.name,
        path: file.path,
        contentType: 'application/pdf'
      }))
    };

    console.log('Email config:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      attachmentCount: mailOptions.attachments.length,
      segments
    });

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email sending failed:', error.message);
    console.error('Full error:', error);
    return { success: false, error: error.message };
  }
}

// Sanitize apostrophes/etc.
function sanitizeFormData(formData) {
  const sanitized = { ...formData };
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      sanitized[key] = value
        .replace(/['']/g, "'")
        .replace(/â•Ž/g, "'");
    }
  }
  return sanitized;
}

// Process form data (future hooks live here)
function processFormData(formData) {
  return sanitizeFormData(formData);
}

// ===== FDF generator (canonical structure) =====
function createFDF(formData, mapping) {
  const esc = (v) => v.toString()
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]/g, ' ')
    .trim();

  let fields = '';
  for (const [formField, pdfFields] of Object.entries(mapping)) {
    const value = formData[formField];
    if (value === undefined || value === null) continue;
    const targets = Array.isArray(pdfFields) ? pdfFields : [pdfFields];
    for (const t of targets) {
      fields += `<< /T (${t}) /V (${esc(value)}) >>\n`;
    }
  }

  return `%FDF-1.2
1 0 obj
<<
/FDF <<
/Fields [
${fields}]
>>
>>
endobj
trailer
<<
/Root 1 0 R
>>
%%EOF
`;
}

// ===== XFDF generator (XML) for resilient fallback =====
function createXFDF(formData, mapping) {
  const esc = (s) => (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');

  let fields = '';
  for (const [formField, pdfFields] of Object.entries(mapping)) {
    const value = formData[formField];
    if (value === undefined || value === null) continue;
    const targets = Array.isArray(pdfFields) ? pdfFields : [pdfFields];
    for (const t of targets) {
      fields += `  <field name="${esc(t)}"><value>${esc(value)}</value></field>\n`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <fields>
${fields}  </fields>
</xfdf>`;
}

// ===== pdftk runner (stdin + timeout) =====
async function fillAndFlattenPDF(pdfTemplate, dataDoc, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [pdfTemplate, 'fill_form', '-', 'output', outputPath, 'flatten'];
    const proc = spawn('pdftk', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    // 20s kill guard to avoid zombie processes
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) {}
    }, 20000);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (code === 0) resolve();
      else reject(new Error(`pdftk exited with code ${code}: ${stderr}`));
    });

    proc.stdin.write(Buffer.from(dataDoc, 'utf8'));
    proc.stdin.end();
  });
}

// ===== Fallback wrapper: try FDF, then XFDF =====
async function fillWithFallback(pdfTemplate, mapping, processedFormData, outputPath) {
  try {
    const fdfDoc = createFDF(processedFormData, mapping);
    await fillAndFlattenPDF(pdfTemplate, fdfDoc, outputPath);
    return 'FDF';
  } catch (e1) {
    console.warn('FDF failed, retrying with XFDF…', e1 && e1.message);
    const xfdfDoc = createXFDF(processedFormData, mapping);
    await fillAndFlattenPDF(pdfTemplate, xfdfDoc, outputPath);
    return 'XFDF';
  }
}

// ===== Debug endpoint: inspect actual PDF fields in prod =====
app.get('/debug/fields/:template', async (req, res) => {
  try {
    const pdfPath = path.join(__dirname, 'forms', `${req.params.template}.pdf`);
    const proc = spawn('pdftk', [pdfPath, 'dump_data_fields']);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', code => {
      if (code !== 0) return res.status(500).type('text/plain').send(err || `pdftk exit ${code}`);
      res.type('text/plain').send(out);
    });
  } catch (e) {
    res.status(500).type('text/plain').send(e.message);
  }
});

// ===== Endpoints =====

// Fill multiple PDFs and return ZIP
app.post('/fill-multiple', validateApiKey, async (req, res) => {
  try {
    const { formData, segments } = req.body;
    if (!formData || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'Missing formData or segments' });
    }

    const processedFormData = processFormData(formData);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-filler-'));

    const filesToZip = [];
    for (const segment of segments) {
      const templatePath = path.join(__dirname, 'forms', `${segment}.pdf`);
      const mappingPath = path.join(__dirname, 'mapping', `${segment}.json`);
      const outputPath = path.join(tempDir, `${segment}-filled.pdf`);

      let mapping;
      try {
        mapping = JSON.parse(await fs.readFile(mappingPath, 'utf-8'));
      } catch (err) {
        console.error(`Mapping not found for ${segment}:`, err);
        continue;
      }

      try {
        const modeUsed = await fillWithFallback(templatePath, mapping, processedFormData, outputPath);
        console.log(`${segment}: filled via ${modeUsed}`);
        filesToZip.push({ path: outputPath, name: `${segment}-filled.pdf` });
      } catch (err) {
        console.error(`Error filling ${segment}:`, err);
      }
    }

    if (filesToZip.length > 0) {
      try {
        const emailResult = await sendQuoteToCarriers(filesToZip, formData, segments);
        console.log('Email sending result:', emailResult);
        if (!emailResult.success) console.error('EMAIL FAILED:', emailResult.error);
      } catch (emailError) {
        console.error('EMAIL EXCEPTION:', emailError);
      }
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=filled-apps.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    for (const file of filesToZip) {
      archive.file(file.path, { name: file.name });
    }
    await archive.finalize();

    res.on('finish', async () => {
      try {
        for (const file of filesToZip) await fs.unlink(file.path);
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Cleanup error:', err);
      }
    });

  } catch (error) {
    console.error('Detailed error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Error processing PDFs' });
    }
  }
});

// Submit without ZIP (email only)
app.post('/submit-quote', validateApiKey, async (req, res) => {
  try {
    const { formData, segments } = req.body;
    if (!formData || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'Missing formData or segments' });
    }

    const processedFormData = processFormData(formData);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-filler-'));

    const filesToZip = [];
    for (const segment of segments) {
      const templatePath = path.join(__dirname, 'forms', `${segment}.pdf`);
      const mappingPath = path.join(__dirname, 'mapping', `${segment}.json`);
      const outputPath = path.join(tempDir, `${segment}-filled.pdf`);

      let mapping;
      try {
        mapping = JSON.parse(await fs.readFile(mappingPath, 'utf-8'));
      } catch (err) {
        console.error(`Mapping not found for ${segment}:`, err);
        continue;
      }

      try {
        const modeUsed = await fillWithFallback(templatePath, mapping, processedFormData, outputPath);
        console.log(`${segment}: filled via ${modeUsed}`);
        filesToZip.push({ path: outputPath, name: `${segment}-filled.pdf` });
      } catch (err) {
        console.error(`Error filling ${segment}:`, err);
      }
    }

    if (filesToZip.length === 0) {
      return res.status(400).json({ error: 'No PDFs were generated successfully' });
    }

    const emailResult = await sendQuoteToCarriers(filesToZip, formData, segments);

    try {
      for (const file of filesToZip) await fs.unlink(file.path);
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Cleanup error:', err);
    }

    if (emailResult.success) {
      res.json({
        success: true,
        message: 'Quote submitted successfully',
        messageId: emailResult.messageId,
        pdfsGenerated: filesToZip.length
      });
    } else {
      res.status(500).json({
        error: 'PDFs generated but email failed',
        emailError: emailResult.error
      });
    }

  } catch (error) {
    console.error('Detailed error:', error);
    res.status(500).json({ error: error.message || 'Error processing quote submission' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Process guards
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
