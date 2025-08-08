const express = require('express');
const { spawn } = require('child_process');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Key validation
const VALID_API_KEY = 'CID9200$';

function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== VALID_API_KEY) {
        return res.status(401).json({ error: 'Invalid or missing API key' });
    }
    next();
}

// CHARACTER ENCODING SANITIZATION FUNCTION
function sanitizeText(text) {
    if (!text || typeof text !== 'string') return text;
    
    return text
        // Fix smart quotes and apostrophes
        .replace(/['']/g, "'")
        .replace(/[""]/g, '"')
        .replace(/[""]/g, '"')
        
        // Fix dashes
        .replace(/[—–]/g, '-')
        
        // Fix common problematic characters
        .replace(/…/g, '...')
        .replace(/©/g, '(c)')
        .replace(/®/g, '(R)')
        .replace(/™/g, '(TM)')
        
        // Normalize Unicode and remove combining characters
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        
        // Remove any remaining non-ASCII characters that might cause issues
        .replace(/[^\x00-\x7F]/g, function(char) {
            // Keep common characters, replace others with safe equivalents
            const charCode = char.charCodeAt(0);
            if (charCode === 160) return ' '; // Non-breaking space
            if (charCode >= 8192 && charCode <= 8303) return ' '; // Various spaces
            return ''; // Remove other problematic characters
        })
        
        // Clean up multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
}

// COMPREHENSIVE FORM DATA SANITIZATION
function sanitizeFormData(formData) {
    const sanitized = {};
    
    Object.keys(formData).forEach(key => {
        const value = formData[key];
        
        if (typeof value === 'string') {
            sanitized[key] = sanitizeText(value);
        } else if (Array.isArray(value)) {
            sanitized[key] = value.map(item => 
                typeof item === 'string' ? sanitizeText(item) : item
            );
        } else {
            sanitized[key] = value;
        }
    });
    
    return sanitized;
}

// Email configuration
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

// PDF Field Mappings (unchanged)
const pdfMappings = {
    Society_FieldNames: {
        "Text1": "applicant_name",
        "Text2": "premise_address", 
        "Text3": "business_phone",
        "Text4": "contact_email",
        "Text5": "effective_date",
        "Text6": "premises_name",
        "Text7": "square_footage",
        "Text8": "num_employees",
        "Text9": "closing_time",
        "Text10": "food_sales",
        "Text11": "alcohol_sales", 
        "Text12": "total_sales",
        "Text13": "Percent_Alcohol",
        "ComboBox1": "open_60_days",
        "Text14": "open_60_days_details",
        "ComboBox2": "ownership_experience", 
        "Text15": "ownership_experience_details",
        "ComboBox3": "fine_dining",
        "ComboBox4": "counter_service",
        "ComboBox5": "alcohol_manufactured",
        "ComboBox6": "percent_consumed",
        "CheckBox1": "cooking_level_full",
        "CheckBox2": "cooking_level_limited", 
        "CheckBox3": "cooking_level_non",
        "ComboBox7": "infused_with_cannabis",
        "ComboBox8": "solid_fuel",
        "ComboBox9": "non_UL300",
        "ComboBox10": "entertainment_other",
        "Text16": "entertainment_details", 
        "ComboBox11": "recreational_activites",
        "Text17": "recreational_details",
        "ComboBox12": "security_present",
        "ComboBox22": "ComboBox22",
        "ComboBox23": "ComboBox23",
        "ComboBox24": "ComboBox24",
        "ComboBox13": "ComboBox13",
        "ComboBox14": "ComboBox14", 
        "ComboBox15": "ComboBox15",
        "TextField0": "TextField0",
        "ComboBox16": "ComboBox16",
        "TextField10": "TextField10",
        "ComboBox17": "ComboBox17",
        "TextField11": "TextField11",
        "ComboBox18": "ComboBox18",
        "TextField12": "TextField12",
        "ComboBox19": "ComboBox19",
        "Text18": "shuttle_explanation",
        "ComboBox1_2": "ComboBox1",
        "ComboBox20": "liquor_lapse",
        "Text19": "liquor_claims",
        "ComboBox21": "claim_count",
        "Text20": "claims_details_2_or_less",
        "Text21": "claims_details_3_or_more",
        "Text22": "additional_insureds",
        "CheckBox4": "payment_plan_Monthly",
        "CheckBox5": "payment_plan_Annual",
        "Text23": "All Access Insurance, DBA Commercial Insurance Direct LLC",
        "Text24": "9200 W Cross Drive, #515",
        "Text25": "Littleton, CO 80123", 
        "Text26": "(303) 932-1700",
        "Text27": "quote@barinsurancedirect.com"
    },
    
    BarAccord125: {
        "Text1": "applicant_name",
        "Text2": "premises_name",
        "Text3": "premise_address",
        "Text4": "business_phone", 
        "Text5": "premises_website",
        "Text6": "contact_email",
        "Text7": "effective_date",
        "CheckBox1": "org_type_corporation",
        "CheckBox2": "org_type_llc", 
        "CheckBox3": "org_type_individual",
        "ComboBox1": "claim_count",
        "Text8": "claims_details_2_or_less",
        "Text9": "claims_details_3_or_more",
        "Text10": "additional_insureds",
        "Text11": "All Access Ins, dbs Commercial Insurance Direct LLC",
        "Text12": "9200 W Cross Drive #515",
        "Text13": "Littleton, CO 80123"
    },
    
    BarAccord140: {
        "Text1": "business_personal_property",
        "CheckBox1": "construction_frame",
        "CheckBox2": "construction_joist_masonry",
        "CheckBox3": "construction_masonry", 
        "Text2": "square_footage",
        "Text3": "year_built",
        "Text4": "number_of_stories",
        "ComboBox1": "automatic_sprinkler"
    }
};

// Fill PDF function (unchanged except for error handling)
async function fillPDF(templatePath, outputPath, fieldMappings, formData) {
    return new Promise((resolve, reject) => {
        const fdfData = Object.entries(fieldMappings)
            .map(([pdfField, formField]) => {
                const value = formData[formField] || '';
                const cleanValue = String(value).replace(/\\/g, '\\\\').replace(/\)/g, '\\)').replace(/\(/g, '\\(');
                return `<< /T (${pdfField}) /V (${cleanValue}) >>`;
            })
            .join('\n');

        const fdfContent = `%FDF-1.2
1 0 obj
<<
/FDF
<<
/Fields [
${fdfData}
]
>>
>>
endobj
trailer
<<
/Root 1 0 R
>>
%%EOF`;

        const fdfPath = outputPath.replace('.pdf', '.fdf');
        
        fs.writeFile(fdfPath, fdfContent)
            .then(() => {
                const pdftk = spawn('pdftk', [templatePath, 'fill_form', fdfPath, 'output', outputPath, 'flatten']);
                
                let errorOutput = '';
                pdftk.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });
                
                pdftk.on('close', async (code) => {
                    try {
                        await fs.unlink(fdfPath);
                    } catch (cleanupError) {
                        console.warn('Could not clean up FDF file:', cleanupError.message);
                    }
                    
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`pdftk failed with code ${code}: ${errorOutput}`));
                    }
                });
                
                pdftk.on('error', (error) => {
                    reject(new Error(`pdftk spawn error: ${error.message}`));
                });
            })
            .catch(reject);
    });
}

// Main quote submission endpoint
app.post('/submit-quote', validateApiKey, async (req, res) => {
    try {
        const { formData: rawFormData, segments } = req.body;
        
        if (!rawFormData || !segments || !Array.isArray(segments)) {
            return res.status(400).json({ error: 'Missing formData or segments' });
        }

        // SANITIZE ALL FORM DATA FOR CHARACTER ENCODING
        console.log('Sanitizing form data for character encoding...');
        const formData = sanitizeFormData(rawFormData);
        
        // Log the sanitization results for debugging
        Object.keys(rawFormData).forEach(key => {
            if (rawFormData[key] !== formData[key]) {
                console.log(`Sanitized ${key}: "${rawFormData[key]}" -> "${formData[key]}"`);
            }
        });

        const applicantName = formData.applicant_name || 'Unknown';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputDir = `/tmp/quote_${timestamp}`;
        
        await fs.mkdir(outputDir, { recursive: true });
        
        const generatedFiles = [];
        
        // Generate PDFs
        for (const segment of segments) {
            if (!pdfMappings[segment]) {
                console.warn(`Unknown segment: ${segment}`);
                continue;
            }
            
            // FIX: Use correct forms folder path where PDFs actually exist
            const templatePath = path.join(__dirname, 'forms', `${segment}.pdf`);
            const outputPath = `${outputDir}/${segment}-filled.pdf`;
            
            try {
                await fs.access(templatePath);
                await fillPDF(templatePath, outputPath, pdfMappings[segment], formData);
                generatedFiles.push({
                    filename: `${segment}-filled.pdf`,
                    path: outputPath
                });
                console.log(`Generated: ${segment}`);
            } catch (error) {
                console.error(`Error generating ${segment}:`, error.message);
                throw new Error(`Failed to generate ${segment}: ${error.message}`);
            }
        }
        
        if (generatedFiles.length === 0) {
            throw new Error('No PDFs were generated');
        }
        
        // Send email with attachments
        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #ff8c00 0%, #e67e00 100%); padding: 20px; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; text-align: center;">Commercial Insurance Quote Request</h1>
            </div>
            
            <div style="background: #f8f8f8; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #ddd;">
                <h2 style="color: #333; margin-top: 0;">Applicant Information:</h2>
                
                <div style="background: white; padding: 20px; border-radius: 6px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <p style="margin: 8px 0;"><strong>Business Name:</strong> ${formData.applicant_name || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Premises Name:</strong> ${formData.premises_name || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Address:</strong> ${formData.premise_address || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Phone:</strong> ${formData.business_phone || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Email:</strong> ${formData.contact_email || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Effective Date:</strong> ${formData.effective_date || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Square Footage:</strong> ${formData.square_footage || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Employees:</strong> ${formData.num_employees || 'Not provided'}</p>
                    <p style="margin: 8px 0;"><strong>Total Sales:</strong> ${formData.total_sales || 'Not provided'}</p>
                </div>
                
                <p style="margin: 20px 0; color: #555;">Please find the completed application forms attached. We look forward to your competitive quote.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777;">
                    <p><strong>Commercial Insurance Direct LLC</strong></p>
                    <p>Phone: (303) 932-1700</p>
                    <p>Email: <a href="mailto:quote@barinsurancedirect.com" style="color: #ff8c00;">quote@barinsurancedirect.com</a></p>
                </div>
            </div>
        </div>
        `;
        
        const attachments = generatedFiles.map(file => ({
            filename: file.filename,
            path: file.path
        }));
        
        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply@barinsurancedirect.com',
            to: 'quote@barinsurancedirect.com',
            subject: `Quote Request - ${applicantName} - Bar/Restaurant Insurance`,
            html: emailHtml,
            attachments: attachments
        };
        
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
        
        // Cleanup
        try {
            for (const file of generatedFiles) {
                await fs.unlink(file.path);
            }
            await fs.rmdir(outputDir);
        } catch (cleanupError) {
            console.warn('Cleanup error:', cleanupError.message);
        }
        
        res.json({ 
            success: true, 
            message: 'Quote submitted successfully',
            generatedSegments: segments,
            sanitizedFields: Object.keys(rawFormData).filter(key => rawFormData[key] !== formData[key])
        });
        
    } catch (error) {
        console.error('Quote submission error:', error);
        res.status(500).json({ 
            error: 'Failed to process quote submission',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '2.1.0-encoding-fixed'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Commercial Insurance Direct - PDF API Server',
        version: '2.1.0-encoding-fixed',
        endpoints: ['/submit-quote', '/health']
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 CID PDF API Server running on port ${PORT}`);
    console.log(`📧 Character encoding sanitization enabled`);
    console.log(`🔑 API Key validation: ${VALID_API_KEY ? 'ENABLED' : 'DISABLED'}`);
});

module.exports = app;