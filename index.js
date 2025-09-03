const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fssync = require('fs');
const archiver = require('archiver');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// CORS config
app.use(cors({
    origin: [
        "https://barinsurancedirect.com",
        "https://barinsurancedirect.netlify.app",
        "https://roofingcontractorinsurancedirect.com",
        "http://localhost:8888"
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Origin', 'X-Requested-With', 'Accept'],
    credentials: true
}));

// EMAIL CONFIG - Updated for RoofingForm segments
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
     },
};

// Function to get email config based on segments
function getEmailConfig(segments) {
    for (const segment of segments) {
        if (EMAIL_CONFIG[segment]) {
            return EMAIL_CONFIG[segment];
        }
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

// Gmail transporter setup with dynamic email
function createGmailTransporter(fromEmail) {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

// Email sending function with segment-specific logic
async function sendQuoteToCarriers(filesToZip, formData, segments) {
    try {
        console.log('Starting email send process...');
        
        // Get segment-specific email config
        const emailConfig = getEmailConfig(segments);
        const transporter = createGmailTransporter(emailConfig.from);
        
        // Replace placeholder in subject
        const subject = emailConfig.subject.replace('{applicant_name}', formData.applicant_name || 'New Application');
        
        // Create professional email content
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
            subject: subject,
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
            segments: segments
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
// Function to sanitize apostrophe encoding issues
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
// Function to process form data
function processFormData(formData) {
    const sanitized = sanitizeFormData(formData);
    return sanitized;
}

function createFDF(formData, mapping) {
    let fdf = `%FDF-1.2
1 0 obj

/FDF

/Fields [
`;
    for (const [formField, pdfFields] of Object.entries(mapping)) {
        const value = formData[formField] || '';
        
        // Skip if value is not a string or number
        if (typeof value !== 'string' && typeof value !== 'number') {
            console.log(`Skipping non-string field: ${formField}`, value);
            continue;
        }
        
        const fieldsToFill = Array.isArray(pdfFields) ? pdfFields : [pdfFields];
        
        fieldsToFill.forEach(pdfField => {
            // Make sure pdfField is a string
            if (typeof pdfField !== 'string') {
                console.log(`Invalid PDF field mapping for ${formField}:`, pdfField);
                return;
            }
            
            const escapedValue = value.toString()
                .replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/[\r\n]/g, ' ')  // Remove ALL newlines
                .trim();  // Remove leading/trailing whitespace
            
            fdf += `<< /T (${pdfField}) /V (${escapedValue}) >>\n`;
        });
    }
    fdf += `]
>>
>>
endobj
trailer

/Root 1 0 R
>>
%%EOF
`;
    return fdf;
}

// Function to fill and flatten a PDF using pdftk
async function fillAndFlattenPDF(pdfTemplate, fdfData, outputPath) {
    const fdfPath = outputPath.replace(/\.pdf$/, '.fdf');
    
    // DEBUG: Log what we're about to write
    console.log('=== FDF DEBUG ===');
    console.log('FDF Path:', fdfPath);
    console.log('FDF data length:', fdfData.length);
    console.log('First 500 chars of FDF:', fdfData.substring(0, 500));
    
    await fs.writeFile(fdfPath, fdfData);
    
    // DEBUG: Verify file was written
    try {
        const stats = await fs.stat(fdfPath);
        console.log('FDF file written successfully, size:', stats.size);
    } catch (e) {
        console.error('FDF file NOT found after write:', e);
    }
    
    return new Promise((resolve, reject) => {
        execFile('pdftk', [pdfTemplate, 'fill_form', fdfPath, 'output', outputPath, 'flatten'], (err) => {
            fs.unlink(fdfPath).catch(() => {});
            if (err) reject(err);
            else resolve();
        });
    });
}

// Endpoint to fill multiple PDFs and return ZIP
app.post('/fill-multiple', validateApiKey, async (req, res) => {
    try {
        const { formData, segments } = req.body;
        if (!formData || !Array.isArray(segments) || segments.length === 0) {
            return res.status(400).json({ error: 'Missing formData or segments' });
        }

        const processedFormData = processFormData(formData);
        console.log('DATA BEING SENT TO PDF:', JSON.stringify(processedFormData).substring(0, 500));
        console.log('Number of fields:', Object.keys(processedFormData).length);
        
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

            const fdfData = createFDF(processedFormData, mapping);
            try {
                await fillAndFlattenPDF(templatePath, fdfData, outputPath);
                filesToZip.push({ path: outputPath, name: `${segment}-filled.pdf` });
            } catch (err) {
                console.error(`Error filling ${segment}:`, err);
            }
        }

        if (filesToZip.length > 0) {
            try {
                const emailResult = await sendQuoteToCarriers(filesToZip, formData, segments);
                console.log('Email sending result:', emailResult);
                
                if (!emailResult.success) {
                    console.error('EMAIL FAILED:', emailResult.error);
                }
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
                for (const file of filesToZip) {
                    await fs.unlink(file.path);
                }
                await fs.rmdir(tempDir);
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

// New endpoint to send email only (without ZIP download)
app.post('/submit-quote', validateApiKey, async (req, res) => {
    try {
        const { formData, segments } = req.body;
        if (!formData || !Array.isArray(segments) || segments.length === 0) {
            return res.status(400).json({ error: 'Missing formData or segments' });
        }

        const processedFormData = processFormData(formData);
        console.log('DATA BEING SENT TO PDF:', JSON.stringify(processedFormData).substring(0, 500));
        console.log('Number of fields:', Object.keys(processedFormData).length);
        
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-filler-'));

        const filesToZip = [];
        for (const segment of segments) {
            const templatePath = path.join(__dirname, 'forms', `${segment}.pdf`);
            const mappingPath = path.join(__dirname, 'mapping', `${segment}.json`);
            const outputPath = path.join(tempDir, `${segment}-filled.pdf`);

            let mapping;
            try {
                mapping = JSON.parse(await fs.readFile(mappingPath, 'utf-8'));
            console.log(`Loaded mapping for ${segment}:`, Object.keys(mapping).length, 'fields');    
            } catch (err) {
                console.error(`Mapping not found for ${segment}:`, err);
                continue;
            }

            const fdfData = createFDF(processedFormData, mapping);
            try {
                await fillAndFlattenPDF(templatePath, fdfData, outputPath);
             // Check if file was actually written
            try {
            const stats = await fs.stat(fdfPath);
            console.log(`FDF written: ${fdfPath}, size: ${stats.size} bytes`);
            } catch (statErr) {
            console.error('FDF not found after write:', statErr);
            }   
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
            for (const file of filesToZip) {
                await fs.unlink(file.path);
            }
            await fs.rmdir(tempDir);
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Handle unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});