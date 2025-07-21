const express = require('express');
const multer = require('multer');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs').promises; // Node.js built-in file system module for reading files
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib'); // Import pdf-lib

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer();

// --- PDF Field Mappings ---
// These are based on your provided information and screenshots.
// IMPORTANT: Double-check these against your actual blank PDFs if issues arise.

const societyFieldMappings = {
    'applicant_name': 'applicant_name', // Looks like the same name from screenshot
    'premises_address': 'premises_address', // Looks like the same name from screenshot
    'open_60_days': 'open_60_days', // From screenshot
    'open_60_days_details': 'open_60_days_details', // From screenshot
    'ownership_experience': 'ownership_experience', // From screenshot
    'ownership_experience_details': 'ownership_experience_details', // From screenshot
    'closing_time': 'closing_time', // From screenshot
    'square_footage': 'square_footage', // From screenshot
    'num_employees': 'num_employees', // From screenshot
    'fine_dining': 'fine_dining', // From screenshot
    'counter_service': 'counter_service', // From screenshot
    'alcohol_manufactured': 'alcohol_manufactured', // From screenshot
    'percent_consumed': 'percent_consumed', // From screenshot
    'food_sales': 'food_sales', // From screenshot
    'alcohol_sales': 'alcohol_sales', // From screenshot
    'total_sales': 'total_sales', // From screenshot
    'percent_alcohol': 'percent_alcohol', // From screenshot
    'cooking_level': 'cooking_level', // From screenshot
    'cannabis_infusion': 'infused_with_cannabis', // From screenshot
    'solid_fuel': 'solid_fuel', // From screenshot
    'ul300': 'non_UL300', // From screenshot
    'other_entertainment': 'entertainment_other', // From screenshot
    'entertainment_details': 'entertainment_details', // From screenshot
    'recreation': 'recreational_activities', // From screenshot
    'recreation_details': 'recreational_details', // From screenshot
    'security_staff': 'security_present', // From screenshot
    'delivery': 'delivery_offered', // From screenshot

    // Security Staff sub-questions (Generic Combo Box/TextField names from screenshot)
    'bouncers_background_checks': 'Combo Box22',
    'bouncers_armed': 'Combo Box23',
    'bouncers_conflict_resolution': 'Combo Box24',

    // Delivery sub-questions (Generic Combo Box/TextField names from screenshot)
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

    // Auto Coverage sub-questions (Generic Combo Box names from screenshot)
    'shuttle_services': 'Combo Box9',
    'additional_auto_policies': 'Combo Box1',

    // Liquor Law Violations (Names from screenshot)
    'liquor_violations': 'liquor_lapse',
    'liquor_violation_details': 'liquor_claims',
};

// Bar125.pdf field mappings (from your previous list and screenshots)
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
    // 'total_sales' and 'percent_alcohol' are calculated in HTML and not directly mapped to PDF fields in Bar125
    'fine_dining': 'fine_dining', // Assuming this maps to a Yes/No text field or checkbox
    'shuttle': 'shuttle', // Assuming this maps to a Yes/No text field or checkbox
    'auto_policy': 'auto_policy', // Assuming this maps to a Yes/No text field or checkbox
    'liquor_violation_details': 'liquor_violation_details',
    'additional_insureds': 'additional_insureds', // Assuming this maps to a Paragraph text field
    // Note: Other fields from your HTML form (e.g., open_60_days, ownership_experience, etc.)
    // are not present in the Bar125 mapping you provided or screenshots, so they won't be filled in Bar125.
};


// Function to fill a PDF using pdf-lib
async function fillPdfForm(templatePath, formData, fieldMappings) {
    const existingPdfBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    // Embedding a font is good practice if you want consistent text appearance
    // and to avoid issues with non-standard characters.
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const htmlFieldName in fieldMappings) {
        const pdfFieldName = fieldMappings[htmlFieldName];
        let value = formData[htmlFieldName] || ''; // Get value from form data, default to empty string if not found

        // --- Data Pre-processing for PDF Fields ---
        // Clean up currency symbols from sales figures
        if (htmlFieldName.includes('_sales') || htmlFieldName === 'total_sales') {
            value = String(value).replace(/[^0-9.]/g, ''); // Remove non-numeric chars except decimal
        }
        // Handle percentages
        if (htmlFieldName === 'percent_alcohol') {
            value = String(value).replace('%', ''); // Remove '%' symbol
        }
        // Standardize Yes/No for easier boolean/selection handling
        if (typeof value === 'string') {
            value = value.toLowerCase().trim();
        }

        try {
            const field = form.getField(pdfFieldName);

            // Handle different PDF field types
            if (field.constructor.name === 'PDFCheckBox') {
                if (value === 'yes' || value === 'true' || value === 'on') {
                    field.check();
                } else {
                    field.uncheck();
                }
            } else if (field.constructor.name === 'PDFRadioGroup') {
                // For radio buttons, the value must match one of the export values of the radio options
                // (e.g., "Full cooking", "Limited cooking", "No cooking" for 'cooking_level')
                field.select(String(value));
            } else if (field.constructor.name === 'PDFDropdown') {
                // For dropdowns, the value must match one of the export values of the dropdown options
                field.select(String(value));
            } else if (field.constructor.name === 'PDFTextField') {
                field.setText(String(value));
            }
            // Add more specific field type handling if needed (e.g., for signatures, images).

        } catch (error) {
            console.warn(`⚠️ Warning: PDF field "${pdfFieldName}" (mapped from HTML field "${htmlFieldName}") not found or issue setting value in ${templatePath}. Error: ${error.message}`);
            // This warning is important for debugging which fields might not be filling.
        }
    }

    // Flatten the form fields to make them static and uneditable
    form.flatten();

    const pdfBytes = await pdfDoc.save();
    return pdfBytes; // Returns a Uint8Array (which can be converted to a Node.js Buffer)
}


app.post('/submit', upload.none(), async (req, res) => {
    console.log("📝 Form received:", req.body);

    const formData = req.body;

    try {
        // 📧 Set up email transporter (confirm App Password for Gmail in production)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS
            }
        });

        // --- Generate PDFs using pdf-lib ---
        // Ensure the paths match the filenames you uploaded to the 'templates' folder exactly.
        console.log("🚀 Generating Society PDF with pdf-lib...");
        const societyPdfBuffer = await fillPdfForm(
            './templates/Society_Mapped_Full_Fillable.pdf', // EXACT filename from your GitHub
            formData,
            societyFieldMappings
        );
        console.log(`Society PDF generated. Size: ${societyPdfBuffer.byteLength} bytes`);


        console.log("🚀 Generating Bar125 PDF with pdf-lib...");
        const bar125PdfBuffer = await fillPdfForm(
            './templates/BarAccord-125 (1).pdf', // EXACT filename from your GitHub
            formData,
            bar125FieldMappings
        );
        console.log(`Bar125 PDF generated. Size: ${bar125PdfBuffer.byteLength} bytes`);

        // 📧 Send confirmation email with PDFs attached
        const mailOptions = {
            from: '"Commercial Insurance Direct" <quote@barinsurancedirect.com>',
            to: formData.contact_email, // Send to the applicant's email from the form
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
