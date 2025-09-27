// mapping/bar-data-enricher.js
// Enriches form data with calculated fields and transformations

function enrichBarFormData(formData) {
  // Add calculated fields that your templates need
  const enrichedData = {
    ...formData,
    
    // Determine organization type from checkboxes
    organization_type: determineOrgType(formData),
    
    // Determine construction type from checkboxes
    construction_type: determineConstructionType(formData),
    
    // Clean currency fields (remove $ and commas)
    business_personal_property_clean: cleanCurrency(formData.business_personal_property),
    food_sales_clean: cleanCurrency(formData.food_sales),
    alcohol_sales_clean: cleanCurrency(formData.alcohol_sales),
    total_sales_clean: cleanCurrency(formData.total_sales),
    
    // Add fields needed by ACORD forms but not in Netlify
    producer_name: "All Access Ins, dba Commercial Insurance Direct LLC",
    producer_address1: "9200 W Cross Drive #515", 
    producer_address2: "Littleton, CO 80123",
    producer_phone: "(303) 932-1700",
    producer_email: "quote@barinsurancedirect.com",
    
    // Calculate expiration date (1 year from effective)
    expiration_date: calculateExpirationDate(formData.effective_date),
    
    // Determine lines of business
    needs_gl: true,  // Always for bar/restaurant
    needs_liquor: formData.alcohol_sales && parseFloat(cleanCurrency(formData.alcohol_sales)) > 0,
    needs_property: formData.business_personal_property && parseFloat(cleanCurrency(formData.business_personal_property)) > 0,
    needs_umbrella: formData.total_sales && parseFloat(cleanCurrency(formData.total_sales)) > 1000000,
    
    // Map claim count to number
    total_claims: mapClaimCount(formData.claim_count),
    
    // Combine FT and PT employees
    total_employees: (parseInt(formData.wc_employees_ft || 0) + parseInt(formData.wc_employees_pt || 0)) || formData.num_employees,
    
    // Add today's date
    current_date: new Date().toISOString().split('T')[0]
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

module.exports = enrichBarFormData;
