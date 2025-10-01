// mapping/bar-data-enricher.js
// Enriches form data with calculated fields and transformations

function enrichBarFormData(formData) {
  // Base object: ONLY key/value properties here (no statements)
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
    effective_date: formData.effective_date || "",
    expiration_date: calculateExpirationDate(formData.effective_date),
    current_date: new Date().toISOString().split("T")[0],

    // Building Information (ACORD 140)
    year_built: formData.year_built || "",
    automatic_sprinkler_system: formData.automatic_sprinkler || "No",
    automatic_sprinkler_system_extent: formData.automatic_sprinkler_system_extent || "",
    number_of_stories: formData.number_of_stories || "1",

    // Applicant Address Fields (ACORD 125 - fallback to premise address)
    applicant_mailing_address: formData.applicant_mailing_address || formData.premise_address || "",
    applicant_city: formData.applicant_city || formData.premise_city || "",
    applicant_state: formData.applicant_state || formData.premise_state || "",
    applicant_zip: formData.applicant_zip || formData.premise_zip || "",

    // Premise Address Fields (direct from form)
    premise_address: formData.premise_address || "",
    premise_city: formData.premise_city || "",
    premise_state: formData.premise_state || "",
    premise_zip: formData.premise_zip || "",

    // Mailing Address Fields (for forms that need them - maps from premise)
    mailing_address1: formData.mailing_address1 || formData.premise_address || "",
    mailing_address2: formData.mailing_address2 || "",
    mailing_city: formData.mailing_city || formData.premise_city || "",
    mailing_state: formData.mailing_state || formData.premise_state || "",
    mailing_zip: formData.mailing_zip || formData.premise_zip || "",

    // Contact Information
    contact_email: formData.contact_email || "",
    business_phone: formData.business_phone || "",
    closing_time: formData.closing_time || "",

    // Lines of Business Flags
    needs_gl: true, // Always for bar/restaurant
    needs_liquor: formData.alcohol_sales && parseFloat(cleanCurrency(formData.alcohol_sales)) > 0,
    needs_property: formData.business_personal_property && parseFloat(cleanCurrency(formData.business_personal_property)) > 0,
    needs_umbrella: formData.total_sales && parseFloat(cleanCurrency(formData.total_sales)) > 1000000,

    // Employee Counts
    num_employees: formData.num_employees || "",
    total_employees:
      (parseInt(formData.wc_employees_ft || 0) + parseInt(formData.wc_employees_pt || 0)) ||
      formData.num_employees ||
      "",
    full_time_employees: formData.wc_employees_ft || formData.full_time_employees || "",
    part_time_employees: formData.wc_employees_pt || formData.part_time_employees || "",

    // Workers Comp specific fields
    wc_employees_ft: formData.wc_employees_ft || "",
    wc_employees_pt: formData.wc_employees_pt || "",
    wc_annual_payroll: formData.wc_annual_payroll || "",

    // WC Classification checkboxes (pass through as-is)
    wc_bar_tavern: formData.wc_bar_tavern || "",
    wc_restaurant: formData.wc_restaurant || "",
    wc_outside_sales_clerical: formData.wc_outside_sales_clerical || "",

    // WC Classification employee counts and payroll
    wc_bar_tavern_ft: formData.wc_bar_tavern ? formData.wc_employees_ft : "",
    wc_bar_tavern_pt: formData.wc_bar_tavern ? formData.wc_employees_pt : "",
    wc_bar_tavern_payroll: formData.wc_bar_tavern ? formData.wc_annual_payroll : "",

    wc_restaurant_ft: formData.wc_restaurant ? formData.wc_employees_ft : "",
    wc_restaurant_pt: formData.wc_restaurant ? formData.wc_employees_pt : "",
    wc_restaurant_payroll: formData.wc_restaurant ? formData.wc_annual_payroll : "",

    wc_clerical_ft: "0", // Default for clerical
    wc_clerical_pt: "0",
    wc_clerical_payroll: "0",

    // Additional Insureds/Interests
    additional_insureds_present: formData.additional_insureds_present || "No",
    ai_loss_payee: formData.ai_loss_payee || "",
    ai_lienholder: formData.ai_lienholder || "",
    ai_mortgagee: formData.ai_mortgagee || "",
    ai_additional_insured: formData.ai_additional_insured || "",

    // Additional Insured details (supports up to 5)
    ai_name_1: formData.ai_name_1 || "",
    ai_address_1: formData.ai_address_1 || "",
    ai_city_1: formData.ai_city_1 || "",
    ai_state_1: formData.ai_state_1 || "",
    ai_zip_1: formData.ai_zip_1 || "",

    ai_name_2: formData.ai_name_2 || "",
    ai_address_2: formData.ai_address_2 || "",
    ai_city_2: formData.ai_city_2 || "",
    ai_state_2: formData.ai_state_2 || "",
    ai_zip_2: formData.ai_zip_2 || "",

    ai_name_3: formData.ai_name_3 || "",
    ai_address_3: formData.ai_address_3 || "",
    ai_city_3: formData.ai_city_3 || "",
    ai_state_3: formData.ai_state_3 || "",
    ai_zip_3: formData.ai_zip_3 || "",

    ai_name_4: formData.ai_name_4 || "",
    ai_address_4: formData.ai_address_4 || "",
    ai_city_4: formData.ai_city_4 || "",
    ai_state_4: formData.ai_state_4 || "",
    ai_zip_4: formData.ai_zip_4 || "",

    ai_name_5: formData.ai_name_5 || "",
    ai_address_5: formData.ai_address_5 || "",
    ai_city_5: formData.ai_city_5 || "",
    ai_state_5: formData.ai_state_5 || "",
    ai_zip_5: formData.ai_zip_5 || "",

    // Claims (raw inputs)
    claim_count: formData.claim_count || "Zero",
    total_claims: mapClaimCount(formData.claim_count),
    claims_details_2_or_less: formData.claims_details_2_or_less || "",
    claims_details_3_or_more: formData.claims_details_3_or_more || "",

    // Additional Common Fields
    square_footage: formData.square_footage || "",
    premises_name: formData.premises_name || formData.dba_name || "",
    applicant_name: formData.applicant_name || formData.legal_business_name || "",
    premises_website: formData.premises_website || "",
    building_quote: formData.building_quote || "",

    // Solid fuel cooking equipment fields
    solid_fuel: formData.solid_fuel || "",
    professionally_installed: formData.professionally_installed || "",
    regularly_maintained: formData.regularly_maintained || "",
    cleaned_scraped_weekly: formData.cleaned_scraped_weekly || "",
    vent_cleaned_monthly: formData.vent_cleaned_monthly || "",
    ashes_removed_daily: formData.ashes_removed_daily || "",
    storage_10_feet: formData.storage_10_feet || "",
    hood_ul300: formData.hood_ul300 || "",
    fire_extinguisher_20_feet: formData.fire_extinguisher_20_feet || ""
  };

  // === Post-build computed fields & logic (safe statements go here) ===

  // Full Applicant address for 126 (street + city/state/zip)
  enrichedData.applicant_street =
    formData.premise_address || formData.applicant_mailing_address || "";
  enrichedData.applicant_city_state_zip = [
    formData.premise_city || formData.applicant_city || "",
    formData.premise_state || formData.applicant_state || "",
    formData.premise_zip || formData.applicant_zip || ""
  ]
    .filter(Boolean)
    .join(", ");

  // Claims logic for ACORD 125
  if (enrichedData.claim_count === "2_or_less") {
    enrichedData.claims_description = "See Remarks Below";
    enrichedData.claims_remarks = enrichedData.claims_details_2_or_less || "";
    enrichedData.total_claims = "2"; // count
    enrichedData.description_of_insurance = "See Remarks Below";
  } else if (enrichedData.claim_count === "3_or_more") {
    enrichedData.claims_description = "See Remarks Below";
    enrichedData.claims_remarks = enrichedData.claims_details_3_or_more || "";
    enrichedData.total_claims = "3";
    enrichedData.description_of_insurance = "See Remarks Below";
  } else {
    enrichedData.total_claims = "0";
    enrichedData.claims_description = "";
    enrichedData.claims_remarks = "";
    enrichedData.description_of_insurance = "";
  }

  // Total Losses $ for 125 (prefer explicit input; else parse from remarks text)
  {
    const explicitLossTotal = cleanCurrency(formData.total_losses_amount);
    const parsedTotal = sumCurrencyFromText(
      [enrichedData.claims_remarks, enrichedData.claims_details_2_or_less, enrichedData.claims_details_3_or_more]
        .filter(Boolean)
        .join("\n")
    );
    enrichedData.total_losses_amount = explicitLossTotal !== "0" ? explicitLossTotal : parsedTotal;
  }

  // Additional Insured address (single string for 125/140 convenience)
  if (enrichedData.ai_address_1 && enrichedData.ai_city_1) {
    enrichedData.additionalInsuredAddress = [
      enrichedData.ai_address_1,
      `${enrichedData.ai_city_1}, ${enrichedData.ai_state_1} ${enrichedData.ai_zip_1}`
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Default business type if not provided
  if (!enrichedData.businessType) {
    enrichedData.businessType = "RESTAURANT";
  }

  return enrichedData;
}

// Helper functions
function determineOrgType(data) {
  if (data.org_type_corporation === "Yes") return "Corporation";
  if (data.org_type_llc === "Yes") return "LLC";
  if (data.org_type_individual === "Yes") return "Individual";
  return "";
}

function determineConstructionType(data) {
  if (data.construction_frame === "Yes") return "Frame";
  if (data.construction_joist_masonry === "Yes") return "Joisted Masonry";
  if (data.construction_masonry === "Yes") return "Masonry Non-Combustible";
  return "";
}

function cleanCurrency(value) {
  if (!value) return "0";
  return String(value).replace(/[$,]/g, "");
}

// Strict parser: only sums values with $ or USD prefix to avoid counting dates like 2023
function sumCurrencyFromText(text) {
  if (!text) return "0";
  const rx = /(?:\$\s*|USD\s*)([\d,]+(?:\.\d{1,2})?)/gi;
  let total = 0;
  for (const m of String(text).matchAll(rx)) {
    const n = Number((m[1] || "").replace(/[,]/g, ""));
    if (isFinite(n)) total += n;
  }
  return String(Math.round(total));
}

function calculateExpirationDate(effectiveDate) {
  if (!effectiveDate) return "";
  const date = new Date(effectiveDate);
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split("T")[0];
}

function mapClaimCount(claimCount) {
  if (claimCount === "Zero") return "0";
  if (claimCount === "2_or_less") return "2";
  if (claimCount === "3_or_more") return "3+";
  return "0";
}

export default enrichBarFormData;
