const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { PDFDocument, PDFForm } = require('pdf-lib');
const fs = require('fs').promises;
const fssync = require('fs');
const archiver = require('archiver');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

// CORS config (keeping your existing setup)
app.use(cors({
    origin: [
        "https://barinsurancedirect.com",
        "https://barinsurancedirect.netlify.app",
        "https://roofingcontractorinsurancedirect.com",
        "http://localhost:8888"
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Origin', 'X-REQUESTED-With', 'Accept'],
    credentials: true
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API key validation middleware (keeping your existing)
const validateApiKey = (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    if (!apiKey || apiKey !== 'CID9200$') {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
};

// COMPLETE PDF FIELD MAPPINGS FOR ALL 5 FORMS (NEW)
const pdfMappings = {
    "Society_FieldNames": {
        "applicant_name": "applicant_name",
        "premises_name": "premises_name", 
        "premise_address": "premise_address",
        "premise_city": "premise_city",
        "premise_state": "premise_state", 
        "premise_zip": "premise_zip",
        "business_phone": "business_phone",
        "contact_email": "contact_email",
        "effective_date": "effective_date",
        "square_footage": "square_footage",
        "num_employees": "num_employees",
        "food_sales": "food_sales",
        "alcohol_sales": "alcohol_sales",
        "total_sales": "total_sales",
        "fine_dining": "fine_dining",
        "counter_service": "counter_service",
        "claim_count": "claim_count",
        "building_quote": "building_quote",
        "workers_comp_quote": "workers_comp_quote"
    },
    
    "BarAccord125": {
        "applicant_name": "applicant_name",
        "premises_name": "premises_name",
        "premise_address": "premise_address", 
        "premise_city": "premise_city",
        "premise_state": "premise_state",
        "premise_zip": "premise_zip",
        "business_phone": "business_phone",
        "contact_email": "contact_email",
        "effective_date": "effective_date",
        "square_footage": "square_footage",
        "num_employees": "num_employees",
        "food_sales": "food_sales",
        "alcohol_sales": "alcohol_sales", 
        "total_sales": "total_sales",
        "fine_dining": "fine_dining",
        "counter_service": "counter_service",
        "payment_plan_Monthly": "payment_plan_Monthly",
        "payment_plan_Annual": "payment_plan_Annual"
    },
    
    "BarAccord140": {
        "applicant_name": "applicant_name",
        "premises_name": "premises_name",
        "premise_address": "premise_address",
        "business_personal_property": "business_personal_property",
        "construction_frame": "construction_frame",
        "year_built": "year_built",
        "number_of_stories": "number_of_stories",
        "automatic_sprinkler": "automatic_sprinkler",
        "building_quote": "building_quote",
        "solid_fuel": "solid_fuel",
        "regularly_maintained": "regularly_maintained", 
        "professionally_installed": "professionally_installed",
        "storage_10_feet": "storage_10_feet",
        "hood_ul300": "hood_ul300",
        "fire_extinguisher_20_feet": "fire_extinguisher_20_feet",
        "vent_cleaned_monthly": "vent_cleaned_monthly",
        "cleaned_scraped_weekly": "cleaned_scraped_weekly",
        "ashes_removed_daily": "ashes_removed_daily"
    },
    
    "BarAccord126": {
        "applicant_name": "applicant_name",
        "total_sales": "total_sales", 
        "alcohol_sales": "alcohol_sales",
        "square_footage": "square_footage",
        "ai_additional_insured": "ai_additional_insured",
        "ai_loss_payee": "ai_loss_payee",
        "ai_mortgagee": "ai_mortgagee",
        "ai_lienholder": "ai_lienholder",
        "ai_name_1": "ai_name_1",
        "ai_address_1": "ai_address_1", 
        "ai_city_1": "ai_city_1",
        "ai_state_1": "ai_state_1",
        "ai_zip_1": "ai_zip_1"
    },
    
    "WCBarform": {
        "applicant_name": "applicant_name",
        "business_phone": "business_phone", 
        "contact_email": "contact_email",
        "premises_website": "premises_website",
        "premise_address": "premise_address",
        "premise_city": "premise_city",
        "premise_state": "premise_state",
        "premise_zip": "premise_zip",
        "wc_bar_tavern": "wc_bar_tavern",
        "wc_employees_ft": "wc_employees_ft",
        "wc_annual_payroll": "wc_annual_payroll",
        "wc_restaurant": "wc_restaurant", 
        "wc_employees_pt": "wc_employees_pt"
    }
};

// EMAIL CONFIG (keeping your existing setup)
const EMAIL_CONFIG = {
    'roofing-supplemental': {
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

// Function to get email config based on segments (keeping your existing)
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

// Gmail transporter setup (keeping your existing)
function createGmailTransporter(fromEmail) {
    return nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

// NEW: Function to fill PDF using pdf-lib (for new 5-PDF system)
async function fillPDFWithLib(segment, formData) {
    try {
        const pdfPath = path.join(__dirname, 'forms', `${segment}.pdf`);
        const existingPdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        const fieldMappings = pdfMappings[segment];
        if (!fieldMappings) {
            console.warn(`No mappings found for segment: ${segment}`);
            return null;
        }
        
        Object.entries(fieldMappings).forEach(([formFieldName, pdfFieldName]) => {
            const value = formData[formFieldName];
            if (value && value !== '') {
                try {
                    const field = form.getField(pdfFieldName);
                    if (field) {
                        if (value === 'Yes' || value === 'on') {
                            field.check();
                        } else {
                            field.setText(String(value));
                        }
                    }
                } catch (error) {
                    console.warn(`Could not fill field ${pdfFieldName}: ${error.message}`);
                }
            }
        });
        
        form.flatten();
        return await pdfDoc.save();
        
    } catch (error) {
        console.error(`Error filling PDF ${segment}:`, error);
        return null;
    }
}

// Email sending function (keeping your existing)
async function sendQuoteToCarriers(filesToZip, formData, segments) {
    try {
        console.log('Starting email send process...');
        
        const emailConfig = getEmailConfig(segments);
        const transporter = createGmailTransporter(emailConfig.from);
        
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
                    <p><strong>Square Footage:</strong> ${formData.square_footage || 'N/A'}</p>
                    <p><strong>Employees:</strong> ${formData.num_employees || 'N/A'}</p>
                    ${formData.total_sales ? `<p><strong>Total Sales:</strong> ${formData.total_sales}</p>` : ''}
                </div>
                
                <p><strong>Generated PDFs:</strong> ${filesToZip.length} forms attached</p>
                
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
        return { success: false, error: error.message };
    }
}

// Keep your existing helper functions
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

function processFormData(formData) {
    const sanitized = sanitizeFormData(formData);
    const processed = { ...sanitized };
    
    const orgTypes = [];
    if (processed.org_type_corporation === "Yes") orgTypes.push("Corporation");
    if (processed.org_type_llc === "Yes") orgTypes.push("LLC");
    if (processed.org_type_individual === "Yes") orgTypes.push("Individual");
    processed.organization_type = orgTypes.join(", ");
    
    const constructionTypes = [];
    if (processed.construction_frame === "Yes") constructionTypes.push("Frame");
    if (processed.construction_joist_masonry === "Yes") constructionTypes.push("Joist Masonry");
    if (processed.construction_masonry === "Yes") constructionTypes.push("Masonry");
    processed.construction_type = constructionTypes.join(", ");
    
    return processed;
}

function createFDF(formData, mapping) {
    let fdf = `%FDF-1.2
1 0 obj

/FDF

/Fields [
`;
    for (const [formField, pdfFields] of Object.entries(mapping)) {
        const value = formData[formField] || '';
        
        const fieldsToFill = Array.isArray(pdfFields) ? pdfFields : [pdfFields];
        
        fieldsToFill.forEach(pdfField => {
            const escapedValue = value.toString()
                .replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/\r/g, '')
                .replace(/\n/g, ' ');
            
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

async function fillAndFlattenPDF(pdfTemplate, fdfData, outputPath) {
    const fdfPath = outputPath.replace(/\.pdf$/, '.fdf');
    await fs.writeFile(fdfPath, fdfData);
    return new Promise((resolve, reject) => {
        execFile('pdftk', [pdfTemplate, 'fill_form', fdfPath, 'output', outputPath, 'flatten'], (err) => {
            fs.unlink(fdfPath).catch(() => {});
            if (err) reject(err);
            else resolve();
        });
    });
}

// Keep your existing /fill-multiple endpoint
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

// UPDATED: /submit-quote endpoint for NEW 5-PDF system
app.post('/submit-quote', validateApiKey, async (req, res) => {
    try {
        const { formData, segments } = req.body;
        
        if (!formData || !segments) {
            return res.status(400).json({ error: 'Missing form data or segments' });
        }
        
        // Check if this is the new 5-PDF system
        const newPdfSegments = ["Society_FieldNames", "BarAccord125", "BarAccord140", "BarAccord126", "WCBarform"];
        const isNewSystem = segments.some(segment => newPdfSegments.includes(segment));
        
        if (isNewSystem) {
            // NEW 5-PDF SYSTEM
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-filler-'));
            const attachments = [];
            
            for (const segment of newPdfSegments) {
                const pdfBytes = await fillPDFWithLib(segment, formData);
                if (pdfBytes) {
                    const outputPath = path.join(tempDir, `${segment}_${Date.now()}.pdf`);
                    await fs.writeFile(outputPath, pdfBytes);
                    attachments.push({
                        path: outputPath,
                        name: `${segment}_${Date.now()}.pdf`
                    });
                    console.log(`Successfully generated PDF: ${segment}`);
                } else {
                    console.warn(`Failed to generate PDF: ${segment}`);
                }
            }
            
            if (attachments.length === 0) {
                return res.status(500).json({ error: 'Failed to generate any PDFs' });
            }
            
            const emailResult = await sendQuoteToCarriers(attachments, formData, segments);
            
            // Cleanup
            try {
                for (const file of attachments) {
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
                    pdfsGenerated: attachments.length
                });
            } else {
                res.status(500).json({ 
                    error: 'PDFs generated but email failed', 
                    emailError: emailResult.error 
                });
            }
            
        } else {
            // EXISTING SYSTEM (for roofing, etc.)
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
        }

    } catch (error) {
        console.error('Detailed error:', error);
        res.status(500).json({ error: error.message || 'Error processing quote submission' });
    }
});

// Keep your existing endpoints
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('NEW: 5-PDF system active for bar forms');
    console.log('EXISTING: roofing system still functional');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
