const express = require('express');
const multer = require('multer');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer();

// --- PDF Field Mappings ---
[cite_start]// FINALIZED MAPPINGS for Society based on PDF-LIB's OWN DETECTED FIELDS from last log. [cite: 1]
// BarAccord-125 mappings are awaiting its XML export or PDF field renaming.

const societyFieldMappings = {
    [cite_start]// These names are copied DIRECTLY from the "🔎 SOCIETY PDF FIELDS DETECTED BY PDF-LIB:" log output [cite: 1]
    [cite_start]'applicant_name': 'applicant_name', // HTML matches PDF-Lib detected [cite: 1, 3]
    [cite_start]'premises_name': 'premises_name', // HTML name [cite: 3]
    [cite_start]'premises_address': 'premise_address', // Corrected: PDF-Lib detected 'premise_address' (singular) [cite: 1]
    [cite_start]'business_phone': 'business_phone', // HTML name [cite: 3]
    [cite_start]'premises_website': 'premises_website', // HTML name [cite: 3]
    [cite_start]'contact_email': 'contact_email', // HTML name [cite: 3]
    [cite_start]'effective_date': 'effective_date', // HTML name [cite: 3]

    [cite_start]'open_60_days': 'open_60_days', // PDF-Lib detected [cite: 1]
    [cite_start]'open_60_days_details': 'open_60_days_details', // PDF-Lib detected [cite: 1]
    [cite_start]'ownership_experience': 'ownership_experience', // PDF-Lib detected [cite: 1]
    [cite_start]'ownership_experience_details': 'ownership_experience_details', // PDF-Lib detected [cite: 1]
    [cite_start]'closing_time': 'closing_time', // PDF-Lib detected [cite: 1]
    [cite_start]'square_footage': 'square_footage', // PDF-Lib detected [cite: 1]
    [cite_start]'num_employees': 'num_employees', // PDF-Lib detected [cite: 1]
    [cite_start]'fine_dining': 'fine_dining', // PDF-Lib detected [cite: 1]
    [cite_start]'counter_service': 'counter_service', // PDF-Lib detected [cite: 1]
    [cite_start]'alcohol_manufactured': 'alcohol_manufactured', // PDF-Lib detected [cite: 1]
    [cite_start]'percent_consumed': 'percent_consumed', // PDF-Lib detected [cite: 1]
    [cite_start]'food_sales': 'food_sales', // PDF-Lib detected [cite: 1]
    [cite_start]'alcohol_sales': 'alcohol_sales', // PDF-Lib detected [cite: 1]
    [cite_start]'total_sales': 'total_sales', // PDF-Lib detected [cite: 1]
    [cite_start]'percent_alcohol': 'Percent_Alcohol', // PDF-Lib detected 'Percent_Alcohol' [cite: 1]
    // 'cooking_level_radio' is handled specifically below in fillPdfForm. PDF fields are:
    [cite_start]// 'cooking_level_full', 'cooking_level_limited', 'cooking_level_non' [cite: 1]
    [cite_start]'cannabis_infusion': 'infused_with_cannabis', // PDF-Lib detected [cite: 1]
    [cite_start]'solid_fuel': 'solid_fuel', // PDF-Lib detected [cite: 1]
    [cite_start]'ul300': 'non_UL300', // PDF-Lib detected 'non_UL300' [cite: 1]

    [cite_start]// Page 2 Fields (from PDF-LIB DETECTED FIELDS log [cite: 1] and index (6).html)
    [cite_start]'other_entertainment': 'entertainment_other', // PDF-Lib detected [cite: 1]
    [cite_start]'entertainment_details': 'entertainment_details', // HTML name [cite: 3]
    [cite_start]'recreation': 'recreational_activites', // PDF-Lib detected 'recreational_activites' [cite: 1]
    [cite_start]'recreation_details': 'recreational_details', // PDF-Lib detected [cite: 1]
    [cite_start]'security_staff': 'security_present', // PDF-Lib detected 'security_present' [cite: 1]
    [cite_start]'delivery': 'delivery_offered', // PDF-Lib detected 'delivery_offered' [cite: 1]

    // Security Staff sub-questions (HTML field names match PDF-Lib detected)
    [cite_start]'bouncers_background_checks': 'ComboBox22', // PDF-Lib detected 'ComboBox22' [cite: 1]
    [cite_start]'bouncers_armed': 'ComboBox23', // PDF-Lib detected 'ComboBox23' [cite: 1]
    [cite_start]'bouncers_conflict_resolution': 'ComboBox24', // PDF-Lib detected 'ComboBox24' [cite: 1]

    // Delivery sub-questions (HTML field names match PDF-Lib detected)
    [cite_start]'delivery_insured_autos': 'ComboBox13', // PDF-Lib detected 'ComboBox13' [cite: 1]
    [cite_start]'delivery_employee_autos': 'ComboBox14', // PDF-Lib detected 'ComboBox14' [cite: 1]
    [cite_start]'delivery_third_party': 'ComboBox15', // PDF-Lib detected 'ComboBox15' [cite: 1]
    [cite_start]'delivery_sales_insured_employee_autos': 'TextField0', // PDF-Lib detected 'TextField0' [cite: 1]
    [cite_start]'delivery_sales_exceed_20_percent': 'ComboBox16', // PDF-Lib detected 'ComboBox16' [cite: 1]
    [cite_start]'delivery_sales_exceed_20_percent_details': 'TextField10', // PDF-Lib detected 'TextField10' [cite: 1]
    [cite_start]'delivery_radius_greater_than_5_miles': 'ComboBox17', // PDF-Lib detected 'ComboBox17' [cite: 1]
    [cite_start]'delivery_radius_greater_than_5_miles_details': 'TextField11', // PDF-Lib detected 'TextField11' [cite: 1]
    [cite_start]'delivery_hours_past_10pm': 'ComboBox18', // PDF-Lib detected 'ComboBox18' [cite: 1]
    [cite_start]'delivery_hours_past_10pm_details': 'TextField12', // PDF-Lib detected 'TextField12' [cite: 1]

    // Auto Coverage sub-questions (HTML field names match PDF-Lib detected)
    [cite_start]'shuttle_services': 'ComboBox19', // PDF-Lib detected 'ComboBox19' [cite: 1]
    [cite_start]'additional_auto_policies': 'ComboBox1', // PDF-Lib detected 'ComboBox1' [cite: 1]

    // Liquor Law Violations (HTML field names match PDF-Lib detected)
    [cite_start]'liquor_violations': 'liquor_lapse', // PDF-Lib detected 'liquor_lapse' [cite: 1]
    [cite_start]'liquor_violation_details': 'liquor_claims', // PDF-Lib detected 'liquor_claims' [cite: 1]

    [cite_start]'claim_count': 'claim_count', // PDF-Lib detected 'claim_count' [cite: 1]
    [cite_start]'additional_insureds': 'additional_insureds', // PDF-Lib detected [cite: 1]

    // Payment Plan Checkboxes (HTML field names match PDF-Lib detected)
    [cite_start]'payment_plan_Monthly': 'Monthly_Checkbox', // PDF-Lib detected 'Monthly_Checkbox' [cite: 1]
    [cite_start]'payment_plan_Annual': 'Annual_Checkbox', // PDF-Lib detected 'Annual_Checkbox' [cite: 1]

    // Agency Info Fields (PDF-Lib detected names. Hardcoded in fillPdfForm for Society)
    [cite_start]'agency_name_field': 'TextField16', // PDF-Lib detected 'TextField16' [cite: 1]
    [cite_start]'agent_name_field': 'TextField17', // PDF-Lib detected 'TextField17' [cite: 1]
    [cite_start]'agent_email_field': 'TextField18', // PDF-Lib detected 'TextField18' [cite: 1]
    [cite_start]'agent_phone_number_field': 'TextField19', // PDF-Lib detected 'TextField19' [cite: 1]
};

const bar125FieldMappings = {
    [cite_start]// BarAccord-125 fields (Placeholders from 125Mapping.notepad. [cite: 2] Requires its own PDF-Lib detected names for finalization.)
    // These need to be updated after you get the PDF-Lib detected names for BarAccord-125.
    [cite_start]'applicant_name': 'applicantinfo1', // HTML: applicant_name, XML: applicantinfo1 [cite: 2]
    [cite_start]'premises_name': 'applicantinfo1', // HTML premises_name maps to the same PDF field as applicant_name [cite: 2]
    [cite_start]'premises_address': 'STREET MAILING1', // HTML matches PDF [cite: 2]
    [cite_start]'contact_email': 'agentemail', // HTML matches PDF [cite: 2]
    [cite_start]'business_phone': 'agentphone', // HTML matches PDF [cite: 2]
    [cite_start]'effective_date': 'todaysdate', // HTML: effective_date, PDF: todaysdate [cite: 2]
    'square_footage': 'square_footage', // (Assumed, not in notepad, but in general Accord)
    [cite_start]'num_employees': '1# emp 1', // HTML matches PDF [cite: 2]
    [cite_start]'food_sales': '1ann rev 1', // HTML matches PDF [cite: 2]
    [cite_start]'alcohol_sales': '1ann rev 2', // HTML matches PDF [cite: 2]

    'fine_dining': 'fine_dining', // (Assumed)
    'shuttle': 'shuttle', // (Assumed)
    'auto_policy': 'auto_policy', // (Assumed)
    'liquor_violation_details': 'liquor_violation_details', // (Assumed)
    [cite_start]'additional_insureds': '6Text151', // HTML: additional_insureds, PDF: 6Text151 [cite: 2]

    // Claim Count (HTML names presumed to match PDF names if fields exist)
    'claim_count_zero': 'CheckBox5',
    'claim_count_2orless': 'CheckBox6',
    'claim_count_3ormore': 'CheckBox7',
    // ... need to verify exact names from renamed BarAccord-125 PDF
};


// Function to fill a PDF using pdf-lib
async function fillPdfForm(fileName, formData, fieldMappings) {
    console.log(`Attempting to read file: ${fileName}`);
    try {
        const existingPdfBytes = await fs.readFile(fileName);
        console.log(`Successfully read file: ${fileName}. Size: ${existingPdfBytes.byteLength} bytes`);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // --- DIAGNOSTIC: Log all PDF field names found by pdf-lib ---
        if (fileName.includes('Society_Mapped_Corrected.pdf')) {
            const allPdfFields = form.getFields().map(f => f.getName());
            console.log(`🔎 SOCIETY PDF FIELDS DETECTED BY PDF-LIB: ${JSON.stringify(allPdfFields)}`);
        } else if (fileName.includes('Acord-125-Fillable.pdf')) { // Corrected BarAccord-125 filename check
            const allPdfFields = form.getFields().map(f => f.getName());
            console.log(`🔎 BARACCORD-125 PDF FIELDS DETECTED BY PDF-LIB: ${JSON.stringify(allPdfFields)}`);
        }
        // --- END DIAGNOSTIC ---


        // --- Special Handling for Society PDF Fields ---
        if (fileName.includes('Society_Mapped_Corrected.pdf')) {
            [cite_start]// Agency Info (hardcoded values into the PDF fields directly) [cite: 1]
            try {
                form.getTextField('TextField16')?.setText("All Access Insurance dba Commercial Insurance Direct, LLC 70025M");
                form.getTextField('TextField17')?.setText("Rick Cline");
                form.getTextField('TextField18')?.setText("quote@barinsurancedirect.com");
                form.getTextField('TextField19')?.setText("303-932*1700");
            } catch (agencyError) {
                console.warn(`⚠️ Warning: Failed to set Agency Info fields (hardcoded): ${agencyError.message}`);
            }

            [cite_start]// Cooking Level Radio Group (from Section 10) [cite: 3, 1]
            // We use the HTML 'cooking_level_radio' to check the specific PDF radio button
            const cookingLevelValue = formData.cooking_level_radio ? formData.cooking_level_radio.toLowerCase().trim() : ''; // HTML radio name
            try {
                [cite_start]// Ensure these names EXACTLY match what pdf-lib detects [cite: 1]
                const cookingFullField = form.getCheckBox('cooking_level_full'); [cite_start]// Name from PDF-Lib detected [cite: 1]
                const cookingLimitedField = form.getCheckBox('cooking_level_limited'); [cite_start]// Name from PDF-Lib detected [cite: 1]
                const cookingNoneField = form.getCheckBox('cooking_level_non'); [cite_start]// Name from PDF-Lib detected [cite: 1]

                cookingFullField?.uncheck();
                cookingLimitedField?.uncheck();
                cookingNoneField?.uncheck();

                // Assuming "Yes" is the export value for these radio buttons
                if (cookingFullField && cookingLevelValue === 'full cooking') {
                    cookingFullField.check();
                } else if (cookingLimitedField && cookingLevelValue === 'limited cooking') {
                    cookingLimitedField.check();
                } else if (cookingNoneField && cookingLevelValue === 'no cooking') {
                    cookingNoneField.check();
                }
            } catch (cookingError) {
                console.warn(`⚠️ Warning: Issue setting cooking_level radio group: ${cookingError.message}`);
            }

            [cite_start]// Payment Plan Checkboxes (HTML has payment_plan_Monthly/Annual. PDF likely separate fields) [cite: 3]
            // Assuming PDF fields are 'Monthly_Checkbox' and 'Annual_Checkbox'. [cite_start]These need manual verification! [cite: 1]
            [cite_start]if (formData.payment_plan_Monthly) { // Check if HTML radio/checkbox for Monthly was checked [cite: 3]
                try {
                    const monthlyCheckbox = form.getCheckBox('Monthly_Checkbox'); [cite_start]// PDF-Lib detected (or will be) [cite: 1]
                    if (monthlyCheckbox) monthlyCheckbox.check();
                } catch (err) { console.warn(`⚠️ Warning: Issue with Monthly Payment Checkbox: ${err.message}`); }
            }
            [cite_start]if (formData.payment_plan_Annual) { // Check if HTML radio/checkbox for Annual was checked [cite: 3]
                try {
                    const annualCheckbox = form.getCheckBox('Annual_Checkbox'); [cite_start]// PDF-Lib detected (or will be) [cite: 1]
                    if (annualCheckbox) annualCheckbox.check();
                } catch (err) { console.warn(`⚠️ Warning: Issue with Annual Payment Checkbox: ${err.message}`); }
            }
        }
        // --- End Special Handling ---

        for (const htmlFieldName in fieldMappings) {
            const pdfFieldName = fieldMappings[htmlFieldName];
            let value = formData[htmlFieldName] || '';

            if (htmlFieldName.includes('_sales') || htmlFieldName === 'total_sales') {
                value = String(value).replace(/[^0-9.]/g, '');
            }
            [cite_start]if (htmlFieldName === 'Percent_Alcohol') { // PDF field name from XML [cite: 1]
                value = String(value).replace('%', '');
            }
            if (typeof value === 'string') {
                value = value.trim();
                // Standardize common dropdown/checkbox values to 'Yes'/'No' expected by PDF forms.
                if (value.toLowerCase() === 'yes') value = 'Yes';
                else if (value.toLowerCase() === 'no') value = 'No';
                else if (value.toLowerCase() === 'full cooking') value = 'Full cooking'; // For Society Radio
                else if (value.toLowerCase() === 'limited cooking') value = 'Limited cooking';
                else if (value.toLowerCase() === 'no cooking') value = 'No cooking';
                // Add other specific export values if discovered.
            }

            // Special handling for initial "-- Select --" option from HTML dropdowns
            if (value.toLowerCase() === '-- select --' || value === '') {
                 value = '';
            }

            try {
                const field = form.getField(pdfFieldName);

                if (field.constructor.name === 'PDFCheckBox') {
                    if (value === 'Yes') {
                        field.check();
                    } else if (value === 'No') {
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
            path.join(__dirname, 'template', 'Society_Mapped_Corrected.pdf'),
            formData,
            societyFieldMappings
        );
        console.log(`Society PDF generated. Size: ${societyPdfBuffer.byteLength} bytes`);


        console.log("🚀 Generating Bar125 PDF with pdf-lib...");
        const bar125PdfBuffer = await fillPdfForm(
            path.join(__dirname, 'template', 'Acord-125-Fillable.pdf'), // CORRECTED FILENAME for BarAccord-125
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
