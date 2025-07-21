const express = require('express');
const multer = require('multer');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs').promises; // Node.js built-in file system module for reading files
const path = require('path'); // For path.join and __dirname
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib'); // Import pdf-lib

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer();

// --- PDF Field Mappings ---
const societyFieldMappings = {
    'applicant_name': 'applicant_name',
    'premises_address': 'premises_address',
    'open_60_days': 'open_60_days',
    'open_60_days_details': 'open_60_days_details',
    'ownership_experience': 'ownership_experience',
    'ownership_experience_details': 'ownership_experience_details',
    'closing_time': 'closing_time',
    'square_footage': 'square_footage',
    'num_employees': 'num_employees',
    'fine_dining': 'fine_dining',
    'counter_service': 'counter_service',
    'alcohol_manufactured': 'alcohol_manufactured',
    'percent_consumed': 'percent_consumed',
    'food_sales': 'food_sales',
    'alcohol_sales': 'alcohol_sales',
    'total_sales': 'total_sales',
    'percent_alcohol': 'percent_alcohol',
    'cooking_level': 'cooking_level',
    'cannabis_infusion': 'infused_with_cannabis',
    'solid_fuel': 'solid_fuel',
    'ul300': 'non_UL300',
    'other_entertainment': 'entertainment_other',
    'entertainment_details': 'entertainment_details',
    'recreation': 'recreational_activities',
    'recreation_details': 'recreation_details',
    'security_staff': 'security_present',
    'delivery': 'delivery_offered',
    'bouncers_background_checks': 'Combo Box22',
    'bouncers_armed': 'Combo Box23',
    'bouncers_conflict_resolution': 'Combo Box24',
    'delivery_insured_autos': 'Combo Box3',
    'delivery_employee_autos': 'Combo Box4',
    'delivery_third_party': 'Combo Box5',
    'delivery_sales_insured_employee_autos': 'TextField0',
    'delivery_sales_exceed_20_percent': 'Combo Box6',
    'delivery_sales_exceed_20_percent_details': 'TextField1',
    'delivery_radius_greater_than_5_miles': 'Combo Box7',
    'delivery_radius_greater_than_5_miles_details': 'TextField2',
    'delivery_hours_past_10pm': 'Combo Box8',
    'delivery_hours_past_10pm_details': 'TextField3',
    'shuttle_services': 'Combo Box9',
    'additional_auto_policies': 'Combo Box1',
    'liquor_violations': 'liquor_lapse',
    'liquor_violation_details': 'liquor_claims',
};

const bar125FieldMappings = {
    'applicant_name': 'applicantinfo1',
    'premises_address': 'STREET MAILING1',
    'contact_email': 'agentemail',
    'business_phone': 'agentphone',
    'effective_date': 'effectivedate',
    'square_footage': 'square_footage',
    'num_employees': '1# emp 1',
    'food_sales': '1ann rev 1',
    'alcohol_sales': '1ann rev 2',
    'fine_dining': 'fine_dining',
    'shuttle': 'shuttle',
    'auto_policy': 'auto_policy',
    'liquor_violation_details': 'liquor_violation_details',
    'additional_insureds': 'additional_insureds',
};


// Function to fill a PDF using pdf-lib
async function fillPdfForm(fileName, formData, fieldMappings) {
    console.log(`Attempting to read file: ${fileName}`); // Now using fileName directly
    try {
        const existingPdfBytes = await fs.readFile(fileName); // Read from the provided full path
        console.log(`Successfully read file: ${fileName}. Size: ${existingPdfBytes.byteLength} bytes`);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const htmlFieldName in fieldMappings) {
            const pdfFieldName = fieldMappings[htmlFieldName];
            let value = formData[htmlFieldName] || '';

            if (htmlFieldName.includes('_sales') || htmlFieldName === 'total_sales') {
                value = String(value).replace(/[^0-9.]/g, '');
            }
            if (htmlFieldName === 'percent_alcohol') {
                value = String(value).replace('%', '');
            }
            if (typeof value === 'string') {
                value = value.toLowerCase().trim();
            }

            try {
                const field = form.getField(pdfFieldName);

                if (field.constructor.name === 'PDFCheckBox') {
                    if (value === 'yes' || value === 'true' || value === 'on') {
                        field.check();
                    } else {
                        field.uncheck();
                    }
                } else if (field.constructor.name === 'PDFRadioGroup') {
                    field.select(String(value));
                } else if (field.constructor.name === 'PDFDropdown') {
                    field.select(String(value));
                } else if (field.constructor.name === 'PDFTextField') {
                    field.setText(String(value));
                }

            } catch (error) {
                console.warn(`⚠️ Warning: PDF field "${pdfFieldName}" (mapped from HTML field "${htmlFieldName}") not found or issue setting value in ${fileName}. Error: ${error.message}`);
            }
        }

        form.flatten();

        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
    } catch (readError) {
        console.error(`❌ Failed to read PDF template file "${fileName}": ${readError.message}`);
        throw readError;
    }
}


app.post('/submit', upload.none(), async (req, res) => {
    console.log("📝 Form received:", req.body);

    const formData = req.body;

    try {
        // --- Diagnostic: Check current working directory and list files ---
        console.log(`Current Working Directory (CWD): ${process.cwd()}`);
        try {
            const filesInRoot = await fs.readdir(process.cwd());
            console.log(`Files in CWD: ${filesInRoot.join(', ')}`);
            // CORRECTED: changed 'templates' to 'template' (singular)
            const filesInTemplates = await fs.readdir(path.join(process.cwd(), 'template'));
            console.log(`Files in ./template: ${filesInTemplates.join(', ')}`);
        } catch (dirReadError) {
            console.error(`❌ Error reading directories for diagnostics: ${dirReadError.message}`);
        }
        // --- End Diagnostics ---

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS
            }
        });

        // --- Generate PDFs using pdf-lib ---
        console.log("🚀 Generating Society PDF with pdf-lib...");
        const societyPdfBuffer = await fillPdfForm(
            // CORRECTED: changed 'templates' to 'template' (singular)
            path.join(__dirname, 'template', 'Society_Mapped_Corrected.pdf'),
            formData,
            societyFieldMappings
        );
        console.log(`Society PDF generated. Size: ${societyPdfBuffer.byteLength} bytes`);


        console.log("🚀 Generating Bar125 PDF with pdf-lib...");
        const bar125PdfBuffer = await fillPdfForm(
            // CORRECTED: changed 'templates' to 'template' (singular)
            path.join(__dirname, 'template', 'BarAccord-125.pdf'),
            formData,
            bar125FieldMappings
        );
        console.log(`Bar125 PDF generated. Size: ${bar125PdfBuffer.byteLength} bytes`);

        // 📧 Send confirmation email with PDFs attached
        const mailOptions = {
            from: '"Commercial Insurance Direct" <quote@barinsurancedirect.com>',
            to: formData.contact_email,
            subject: 'Your Bar/Tavern Quote Application from Commercial Insurance Direct',
            text: `Dear ${formData.applicant_name || 'Applicant'},\n\nThank you for submitting your application. We are processing your request and will be in touch shortly with your quote.\n\nYour submitted data:\n${JSON.stringify(formData, null, 2)}\n\nBest regards,\nCommercial Insurance Direct Team`,
            html: `
                <p>Dear ${formData.applicant_name || 'Applicant'},</p>
                <p>Thank you for submitting your application. We are processing your request and will be in touch shortly with your quote.</p>
                <p>You can review your submitted data below:</p>
                <pre>${JSON.stringify(formData, null, 2)}</pre>
                <p>Best regards,</p>
                <p><b>Commercial Insurance Direct Team</b></p>
            `,
            attachments: [
                { filename: 'CID_Society_Application.pdf', content: Buffer.from(societyPdfBuffer), contentType: 'application/pdf' },
                { filename: 'CID_Bar125_Application.pdf', content: Buffer.from(bar125PdfBuffer), contentType: 'application/pdf' }
            ]
        };

        console.log("📧 Attempting to send email...");
        const info = await transporter.sendMail(mailOptions);
        console.log("📧 Email sent:", info.messageId);
        res.json({
            status: "Thank you for your submission! We value your business. A quote will be sent to your email shortly."
        });
    } catch (error) {
        console.error("❌ Error in /submit (pdf-lib generation):", error);
        res.status(500).json({ error: "Failed to generate or send PDFs. See server logs for details." });
    }
});

app.listen(port, () => {
    console.log("🚀 Server listening on port", port);
});
