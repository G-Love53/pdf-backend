// mapping/bar-data-enricher.js
// Enriches form data with calculated fields and transformations

function enrichBarFormData(formData) {
  // Add calculated fields that your templates need
  const enrichedData = {
    ...formData,
    
    // Organization and Construction Types
    organization_type: determineOrgType(formData),
    construction_type: determineConstructionType(formData),
    
    // Clean currency fields (remove $ and commas)
    business_personal_property_clean: cleanCurrency(formData.business_personal_property),
    food_sales_clean: cleanCurrency(formData.food_sales),
    alcohol_sales_clean: cleanCurrency(formData.alcohol_sales),
    total_sales_clean: cleanCurrency(formData.total_sales),
    
    // Producer Information (Agency)
    producer_name: "All Access Ins, dba Commercial Insurance Direct LLC",
    producer_address1: "9200 W Cross Drive #515", 
    producer_address2: "Littleton, CO 80123",
    producer_phone: "(303) 932-1700",
    producer_email: "quote@barinsurancedirect.com",
    
    // Date Fields
    effective_date: formData.effective_date || '',
    expiration_date: calculateExpirationDate(formData.effective_date),
    current_date: new Date().toISOString().split('T')[0],
    
    // Building Information (ACORD 140)
    year_built: formData.year_built || '',
    automatic_sprinkler_system: formData.automatic_sprinkler || 'No',
    automatic_sprinkler_system_extent: formData.automatic_sprinkler_system_extent || '',
    number_of_stories: formData.number_of_stories || '1',
    
    // Applicant Address Fields (ACORD 125)
    applicant_mailing_address: formData.applicant_mailing_address || formData.mailing_address1 || '',
    applicant_city: formData.applicant_city || formData.mailing_city || '',
    applicant_state: formData.applicant_state || formData.mailing_state || '',
    applicant_zip: formData.applicant_zip || formData.mailing_zip || '',
    
    // Mailing Address Fields (for ACORD 130 - maps from premise address)
    mailing_address1: formData.premise_address || '',
    mailing_address2: formData.mailing_address2 || '',
    mailing_city: formData.premise_city || '',
    mailing_state: formData.premise_state || '',
    mailing_zip: formData.premise_zip || '',
    
    // Contact Information
    inspection_contact_email: formData.inspection_contact_email || formData.contact_email || '',
    business_phone: formData.business_phone || formData.contact_phone || '',
    
    // Lines of Business Flags
    needs_gl: true,  // Always for bar/restaurant
    needs_liquor: formData.alcohol_sales && parseFloat(cleanCurrency(formData.alcohol_sales)) > 0,
    needs_property: formData.business_personal_property && parseFloat(cleanCurrency(formData.business_personal_property)) > 0,
    needs_umbrella: formData.total_sales && parseFloat(cleanCurrency(formData.total_sales)) > 1000000,
    
    // Employee Counts
    total_employees: (parseInt(formData.wc_employees_ft || 0) + parseInt(formData.wc_employees_pt || 0)) || formData.num_employees || '',
    full_time_employees: formData.wc_employees_ft || formData.full_time_employees || '',
    part_time_employees: formData.wc_employees_pt || formData.part_time_employees || '',
    
    // Workers Comp specific fields
    wc_employees_ft: formData.wc_employees_ft || '',
    wc_employees_pt: formData.wc_employees_pt || '',
    wc_annual_payroll: formData.wc_annual_payroll || '',
    
    // WC Classification checkboxes (pass through as-is)
    wc_bar_tavern: formData.wc_bar_tavern || '',
    wc_restaurant: formData.wc_restaurant || '',
    wc_outside_sales_clerical: formData.wc_outside_sales_clerical || '',
    
    // WC Classification employee counts and payroll
    wc_bar_tavern_ft: formData.wc_bar_tavern ? formData.wc_employees_ft : '',
    wc_bar_tavern_pt: formData.wc_bar_tavern ? formData.wc_employees_pt : '',
    wc_bar_tavern_payroll: formData.wc_bar_tavern ? formData.wc_annual_payroll : '',
    
    wc_restaurant_ft: formData.wc_restaurant ? formData.wc_employees_ft : '',
    wc_restaurant_pt: formData.wc_restaurant ? formData.wc_employees_pt : '',
    wc_restaurant_payroll: formData.wc_restaurant ? formData.wc_annual_payroll : '',
    
    wc_clerical_ft: '0', // Default for clerical
    wc_clerical_pt: '0',
    wc_clerical_payroll: '0',
    
    // Claims
    total_claims: mapClaimCount(formData.claim_count),
    
    // Additional Common Fields
    square_footage: formData.square_footage || '',
    premises_name: formData.premises_name || formData.dba_name || '',
    applicant_name: formData.applicant_name || formData.legal_business_name || '',
    premises_website: formData.premises_website || ''
  };
  
  return enrichedData;
}

// Helper functions
function determineOrgType(data) {
  if (data.org_type_corporation === 'Yes') return 'Corporation';
  if (data.org_type_llc === 'Yes') return 'LLC';
  if (data.org_type_individual === 'Yes') return 'Individual';
  return '';
}

function determineConstructionType(data) {
  if (data.construction_frame === 'Yes') return 'Frame';
  if (data.construction_joist_masonry === 'Yes') return 'Joisted Masonry';
  if (data.construction_masonry === 'Yes') return 'Masonry Non-Combustible';
  return '';
}

function cleanCurrency(value) {
  if (!value) return '0';
  return value.replace(/[$,]/g, '');
}

function calculateExpirationDate(effectiveDate) {
  if (!effectiveDate) return '';
  const date = new Date(effectiveDate);
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split('T')[0];
}

function mapClaimCount(claimCount) {
  if (claimCount === 'Zero') return '0';
  if (claimCount === '2_or_less') return '2';
  if (claimCount === '3_or_more') return '3+';
  return '0';
}

export default enrichBarFormData;
