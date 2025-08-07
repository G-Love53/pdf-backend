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
        "http://localhost:8888"
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Origin', 'X-Requested-With', 'Accept'],
    credentials: true
}));

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

// Gmail transporter setup
function createGmailTransporter() {
    return nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
            pass: process.env.GMAIL_APP_PASSWORD // Gmail App Password
        }
    });
}

// Email sending function
async function sendQuoteToCarriers(filesToZip, formData) {
    try {
        console.log('Starting email send process...');
        const transporter = createGmailTransporter();
        
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
                    <p><strong>Square Footage:</strong> ${formData.square_footage || 'N/A'}</p>
                    <p><strong>Employees:</strong> ${formData.num_employees || 'N/A'}</p>
                    ${formData.total_sales ? `<p><strong>Total Sales:</strong> ${formData.total_sales}</p>` : ''}
                </div>
                
                <p>Please find the completed application forms attached. We look forward to your competitive quote.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
                    <p><strong>Commercial Insurance Direct LLC</strong><br>
                    Phone: (303) 932-1700<br>
                    Email: quote@barinsurancedirect.com</p>
                </div>
            </div>
        `;

        const mailOptions = {
            from: process.env.GMAIL_USER || 'quote@barinsurancedirect.com',
            to: process.env.CARRIER_EMAIL || 'quote@barinsurancedirect.com',
            subject: `Quote Request - ${formData.applicant_name || 'New Application'} - Bar/Restaurant Insurance`,
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
            attachmentCount: mailOptions.attachments.length
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

// Function to process form data and combine checkbox fields
function processFormData(formData) {
    const processed = { ...formData };
    
    // Combine Organization Type checkboxes into single field
    const orgTypes = [];
    if (formData.org_type_corporation === "Yes") orgTypes.push("Corporation");
    if (formData.org_type_llc === "Yes") orgTypes.push("LLC");
    if (formData.org_type_individual === "Yes") orgTypes.push("Individual");
    processed.organization_type = orgTypes.join(", ");
    
    // Combine Construction Type checkboxes into single field
    const constructionTypes = [];
    if (formData.construction_frame === "Yes") constructionTypes.push("Frame");
    if (formData.construction_joist_masonry === "Yes") constructionTypes.push("Joist Masonry");
    if (formData.construction_masonry === "Yes") constructionTypes.push("Masonry");
    processed.construction_type = constructionTypes.join(", ");
    
    return processed;
}

// Utility to create FDF for pdftk
function createFDF(formData, mapping) {
    let fdf = `%FDF-1.2
1 0 obj
<<
/FDF
<<
/Fields [
`;
    for (const [formField, pdfField] of Object.entries(mapping)) {
        const value = formData[formField] || '';
        fdf += `<< /T (${pdfField}) /V (${value}) >>\n`;
    }
    fdf += `]
>>
>>
endobj
trailer
<<
/Root 1 0 R
>>
%%EOF
`;
    return fdf;
}

// Function to fill and flatten a PDF using pdftk
async function fillAndFlattenPDF(pdfTemplate, fdfData, outputPath) {
    const fdfPath = outputPath.replace(/\.pdf$/, '.fdf');
    await fs.writeFile(fdfPath, fdfData);
    return new Promise((resolve, reject) => {
        execFile('pdftk', [pdfTemplate, 'fill_form', fdfPath, 'output', outputPath, 'flatten'], (err) => {
            // Always clean up FDF even on error
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

        // Process form data to combine checkbox fields
        const processedFormData = processFormData(formData);

        // Create temp dir for this request
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-filler-'));

        const filesToZip = [];
        for (const segment of segments) {
            const templatePath = path.join(__dirname, 'forms', `${segment}.pdf`);
            const mappingPath = path.join(__dirname, 'mapping', `${segment}.json`);
            const outputPath = path.join(tempDir, `${segment}-filled.pdf`);

            // Load mapping
            let mapping;
            try {
                mapping = JSON.parse(await fs.readFile(mappingPath, 'utf-8'));
            } catch (err) {
                console.error(`Mapping not found for ${segment}:`, err);
                continue; // Skip segment if mapping missing
            }

            // Create FDF and fill PDF using PROCESSED form data
            const fdfData = createFDF(processedFormData, mapping);
            try {
                await fillAndFlattenPDF(templatePath, fdfData, outputPath);
                filesToZip.push({ path: outputPath, name: `${segment}-filled.pdf` });
            } catch (err) {
                console.error(`Error filling ${segment}:`, err);
                // Continue to next segment
            }
        }

        // Send email to carriers if PDFs were created successfully (use original formData for email)
        if (filesToZip.length > 0) {
            console.log(`=== EMAIL DEBUG START ===`);
            console.log(`Attempting to send email with ${filesToZip.length} PDFs`);
            console.log('PDF files:', filesToZip.map(f => ({ name: f.name, exists: require('fs').existsSync(f.path) })));
            
            try {
                const emailResult = await sendQuoteToCarriers(filesToZip, formData);
                console.log('Email sending result:', emailResult);
                
                if (!emailResult.success) {
                    console.error('EMAIL FAILED:', emailResult.error);
                }
            } catch (emailError) {
                console.error('EMAIL EXCEPTION:', emailError);
            }
            console.log(`=== EMAIL DEBUG END ===`);
        } else {
            console.log('No PDFs generated, skipping email');
        }

        // Set ZIP response headers
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename=filled-apps.zip');

        // Create ZIP and stream to response
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        for (const file of filesToZip) {
            archive.file(file.path, { name: file.name });
        }
        await archive.finalize();

        // Clean up files after response
        res.on('finish', async () => {
            try {
                for (const file of filesToZip) {
                    await fs.unlink(file.path);
                }
                await fs.rmdir(tempDir);
            } catch (err) {
                // Log but don't block
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

        // Process form data to combine checkbox fields
        const processedFormData = processFormData(formData);

        // Create temp dir for this request
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-filler-'));

        const filesToZip = [];
        for (const segment of segments) {
            const templatePath = path.join(__dirname, 'forms', `${segment}.pdf`);
            const mappingPath = path.join(__dirname, 'mapping', `${segment}.json`);
            const outputPath = path.join(tempDir, `${segment}-filled.pdf`);

            // Load mapping
            let mapping;
            try {
                mapping = JSON.parse(await fs.readFile(mappingPath, 'utf-8'));
            } catch (err) {
                console.error(`Mapping not found for ${segment}:`, err);
                continue;
            }

            // Create FDF and fill PDF using PROCESSED form data
            const fdfData = createFDF(processedFormData, mapping);
            try {
                await fillAndFlattenPDF(templatePath, fdfData, outputPath);
                filesToZip.push({ path: outputPath, name: `${segment}-filled.pdf` });
            } catch (err) {
                console.error(`Error filling ${segment}:`, err);
            }
        }

        if (filesToZip.length === 0) {
            return res.status(400).json({ error: 'No PDFs were generated successfully' });
        }

        // Send email to carriers
        const emailResult = await sendQuoteToCarriers(filesToZip, formData);

        // Clean up files
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