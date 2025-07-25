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
// FINALIZED MAPPINGS for Society based on Adobe Acrobat XML export.
// BarAccord-125 mappings are awaiting its XML export.

const societyFieldMappings = {
    // Page 1 Fields (from Society XML and index (6).html)
    'applicant_name': 'applicant_name', // HTML: applicant_name, XML: applicant_name
    'premises_name': 'premises_name', // HTML matches XML (from old index)
    'premises_address': 'premise_address', // HTML: premises_address, XML: premise_address (singular)
    'business_phone': 'business_phone', // HTML matches XML (from old index)
    'premises_website': 'premises_website', // HTML matches XML (from old index)
    'contact_email': 'contact_email', // HTML matches XML (from old index)
    'effective_date': 'effective_date', // HTML matches XML (from old index)

    'open_60_days': 'open_60_days', // HTML matches XML, default [Please Select]. Assuming dropdown.
    'open_60_days_details': 'open_60_days_details', // HTML matches XML
    'ownership_experience': 'ownership_experience', // HTML matches XML, default [Please Select]
    'ownership_experience_details': 'ownership_experience_details', // HTML matches XML
    'closing_time': 'closing_time', // HTML matches XML ([Please Select])
    'square_footage': 'square_footage', // HTML matches XML
    'num_employees': 'num_employees', // HTML matches XML
    'fine_dining': 'fine_dining', // HTML matches XML ([Please Select] or Off)
    'counter_service': 'counter_service', // HTML matches XML ([Please Select])
    'alcohol_manufactured': 'alcohol_manufactured', // HTML matches XML ([Please Select])
    'percent_consumed': 'percent_consumed', // HTML matches XML
    'food_sales': 'food_sales', // HTML matches XML
    'alcohol_sales': 'alcohol_sales', // HTML matches XML
    'total_sales': 'total_sales', // HTML matches XML
    'percent_alcohol': 'Percent_Alcohol', // HTML: percent_alcohol, XML: Percent_Alcohol (capital P, A)
    // Cooking Level: HTML has cooking_level_radio; PDF has separate fields (handled below).
    'cannabis_infusion': 'infused_with_cannabis', // HTML matches XML, default [Please Select]
    'solid_fuel': 'solid_fuel', // HTML matches XML, default [Please Select]
    'ul300': 'non_UL300', // HTML: ul300, XML: non_UL300, default [Please Select]

    // Page 2 Fields (from Society XML and index (6).html)
    'other_entertainment': 'entertainment_other', // HTML matches XML, default [Please Select]
    'entertainment_details': 'entertainment_details', // HTML matches XML
    'recreation': 'recreational_activites', // HTML: recreation, XML: recreational_activites, default [Please Select]
    'recreation_details': 'recreational_details', // HTML matches XML
    'security_staff': 'security_present', // HTML: security_staff, XML: security_present, default [Please Select]
    'delivery': 'delivery_offered', // HTML matches XML, default [Please Select]

    // Security Staff sub-questions (HTML matches XML, generic ComboBox names from XML)
    'bouncers_background_checks': 'ComboBox22',
    'bouncers_armed': 'ComboBox23',
    'bouncers_conflict_resolution': 'ComboBox24',

    // Delivery sub-questions (HTML matches XML, generic ComboBox/TextField names from XML)
    'delivery_insured_autos': 'ComboBox13',
    'delivery_employee_autos': 'ComboBox14',
    'delivery_third_party': 'ComboBox15',
    'delivery_sales_insured_employee_autos': 'TextField0',
    'delivery_sales_exceed_20_percent': 'ComboBox16',
    'delivery_sales_exceed_20_percent_details': 'TextField10',
    'delivery_radius_greater_than_5_miles': 'ComboBox17',
    'delivery_radius_greater_than_5_miles_details': 'TextField11',
    'delivery_hours_past_10pm': 'ComboBox18',
    'delivery_hours_past_10pm_details': 'TextField12',

    // Auto Coverage sub-questions (HTML matches XML, generic ComboBox names from XML)
    'shuttle_services': 'ComboBox19',
    'additional_auto_policies': 'ComboBox1',

    // Liquor Law Violations (HTML names from index(6).html, XML names from Society XML)
    'liquor_violations': 'liquor_lapse', // HTML: liquor_violations, XML: liquor_lapse
    'liquor_violation_details': 'liquor_claims', // HTML: liquor_violation_details, XML: liquor_claims

    'claim_count': 'claim_count', // HTML has claim_count, Society XML doesn't have a direct matching field in the provided segment.
                               // This field is likely only for Bar125 as per previous discussions.
    'additional_insureds': 'additional_insureds', // HTML matches XML

    // Payment Plan Checkboxes (HTML has payment_plan_Monthly/Annual. XML needs verification of PDF field names)
    // The XML you provided for Society only had general elements, not the specific checkbox field names for payment plan.
    // Assuming PDF fields are 'Monthly_Checkbox' and 'Annual_Checkbox' for now, but these need verification.
    'payment_plan_Monthly': 'Monthly_Checkbox', // ASSUMED PDF field name - NEEDS VERIFICATION!
    'payment_plan_Annual': 'Annual_Checkbox', // ASSUMED PDF field name - NEEDS VERIFICATION!

    // Agency Info - These are TextFields from XML. HTML does not have inputs for them in index(6).html.
    // They are hardcoded in fillPdfForm for Society.
    'agency_name_field': 'TextField16', // XML: TextField16
    'agent_name_field': 'TextField17', // XML: TextField17
    'agent_email_field': 'TextField18', // XML: TextField18
    'agent_phone_number_field': 'TextField19', // XML: TextField19
};

const bar125FieldMappings = {
    // BarAccord-125 fields (from your previous mapping. XML needs to be provided for confirmation)
    'applicant_name': 'applicantinfo1', // HTML: applicant_name, XML: applicantinfo1
    'premises_address': 'STREET MAILING1', // HTML: premises_address, XML: STREET MAILING1
    'contact_email': 'agentemail', // HTML: contact_email, XML: agentemail
    'business_phone': 'agentphone', // HTML: business_phone, XML: agentphone
    'effective_date': 'effectivedate', // HTML: effective_date, XML: effectivedate
    'square_footage': 'square_footage', // HTML: square_footage, XML: square_footage
    'num_employees': '1# emp 1', // HTML: num_employees, XML: 1# emp 1
    'food_sales': '1ann rev 1', // HTML: food_sales, XML: 1ann rev 1
    'alcohol_sales': '1ann rev 2', // HTML: alcohol_sales, XML: 1ann rev 2
    'fine_dining': 'fine_dining',
    'shuttle': 'shuttle',
    'auto_policy': 'auto_policy',
    'liquor_violation_details': 'liquor_violation_details',
    'additional_insureds': 'additional_insureds',
    'claim_count_zero': 'CheckBox5', // Example placeholder - need to confirm this from BarAccord-125 XML
    'claim_count_2orless': 'CheckBox6', // Example placeholder
    'claim_count_3ormore': 'CheckBox7', // Example placeholder
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

        // --- Special Handling for Society PDF Fields ---
        if (fileName.includes('Society_Mapped_Corrected.pdf')) {
            // Agency Info (hardcoded values into the PDF fields directly)
            try {
                form.getTextField('TextField16')?.setText("All Access Insurance dba Commercial Insurance Direct, LLC 70025M");
                form.getTextField('TextField17')?.setText("Rick Cline");
                form.getTextField('TextField18')?.setText("quote@barinsurancedirect.com");
                form.getTextField('TextField19')?.setText("303-932*1700");
            } catch (agencyError) {
                console.warn(`⚠️ Warning: Failed to set Agency Info fields: ${agencyError.message}`);
            }

            // Cooking Level Radio Group (from Section 10)
            // We use the HTML 'cooking_level_radio' to check the specific PDF radio button
            const cookingLevelValue = formData.cooking_level_radio ? formData.cooking_level_radio.toLowerCase().trim() : ''; // HTML radio name
            try {
                const cookingFullField = form.getCheckBox('cooking_level_full'); // Name from XML
                const cookingLimitedField = form.getCheckBox('cooking_level_limited'); // Name from XML
                const cookingNoneField = form.getCheckBox('cooking_level_non'); // Name from XML

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

            // Payment Plan Checkboxes (HTML has single name, PDF likely separate fields)
            // We need to verify these PDF field names (e.g., 'Monthly_Checkbox') via manual inspection of Society PDF.
            // Assuming PDF fields are 'Monthly_Checkbox' and 'Annual_Checkbox' for now.
            if (formData.payment_plan_Monthly) { // Check if HTML radio/checkbox for Monthly was checked
                try {
                    const monthlyCheckbox = form.getCheckBox('Monthly_Checkbox'); // ASSUMED PDF field name - NEEDS VERIFICATION!
                    if (monthlyCheckbox) monthlyCheckbox.check();
                } catch (err) { console.warn(`⚠️ Warning: Issue with Monthly Payment Checkbox: ${err.message}`); }
            }
            if (formData.payment_plan_Annual) { // Check if HTML radio/checkbox for Annual was checked
                try {
                    const annualCheckbox = form.getCheckBox('Annual_Checkbox'); // ASSUMED PDF field name - NEEDS VERIFICATION!
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
            if (htmlFieldName === 'Percent_Alcohol') { // PDF field name from XML
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
                    // Checkboxes often have 'Yes'/'No' or 'On'/'Off' export values.
                    // This uses the standardized 'Yes'/'No' from HTML value.
                    if (value === 'Yes') { // Standardized value from above
                        field.check();
                    } else if (value === 'No') { // Standardized value from above
                        field.uncheck();
                    }
                } else if (field.constructor.name === 'PDFRadioGroup') {
                    field.select(String(value)); // Value must match one of the export values of the radio options.
                } else if (field.constructor.name === 'PDFDropdown') {
                    field.select(String(value)); // Value must match one of the export values of the dropdown options.
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
});

app.listen(port, () => {
    console.log("🚀 Server listening on port", port);
});
