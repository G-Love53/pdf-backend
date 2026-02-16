/**
 * Paste this entire script into the browser Console (F12 → Console) on the
 * Bar Insurance Quote form page (barinsurancedirect.com), then press Enter.
 * It fills every field with test data so you can submit and test the flow.
 *
 * How to run in Inspect:
 * 1. Open the quote form page.
 * 2. Press F12 (or right‑click → Inspect) to open Developer Tools.
 * 3. Click the "Console" tab.
 * 4. Paste this whole script into the console.
 * 5. Press Enter. The form will fill; scroll and click Submit to test.
 */
(function () {
  const form = document.getElementById("quoteForm");
  if (!form) {
    console.error("Form #quoteForm not found. Run this on the Bar Insurance Quote page.");
    return;
  }

  function setInput(name, value) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === "checkbox" || el.type === "radio") {
      el.checked = !!value;
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelect(name, value) {
    const el = form.querySelector(`select[name="${name}"]`);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // —— Basic info ——
  setInput("applicant_name", "Test Applicant");
  setInput("premises_name", "Test Bar & Grill LLC");
  setInput("premise_address", "123 Main St");
  setInput("premise_city", "Denver");
  setInput("premise_state", "CO");
  setInput("premise_zip", "80202");
  setInput("business_phone", "303-555-1234");
  setInput("premises_website", "https://testbar.example.com");
  setInput("contact_email", "test@example.com");
  setInput("effective_date", "2025-03-01");

  // Org type: check LLC
  setInput("org_type_llc", "Yes");

  // —— Q1: Open within 60 days ——
  setSelect("1_open_for_business_now_or_within_60_days", "Yes");

  // —— Q2: 3+ years experience ——
  setSelect("2_at_least_3_years_restaurantbar_ownership_in_last_5_years", "Yes");
  setInput("ownership_experience_details_yes", "5 years bar management.");

  // —— Q3–4 ——
  setInput("business_personal_property", "75000");
  setInput("square_footage", "2500");

  // Construction: Frame
  setInput("construction_frame", "Yes");

  setInput("year_built", "1995");
  setInput("number_of_stories", "1");
  setSelect("automatic_sprinkler", "Yes");
  setInput("number_of_employees", "12");
  setInput("closing_time", "23:00");
  setSelect("fine_dining", "No");
  setSelect("counter_serv", "Yes");

  // —— Alcohol / receipts / cooking ——
  setSelect("8_manufacture_alcohol", "No");
  setInput("food_sales", "400000");
  setInput("alcohol_sales", "100000");
  setInput("full", "Yes"); // one cooking level

  setSelect("11_infuse_products_with_cannabis", "No");

  // —— Smoker/grill: No to skip long conditional ——
  setSelect("solid_fuel_smoker_grill_within_10_ft", "No");

  setSelect("ul_suppression_over_cooking", "No");

  // —— Entertainment / recreational ——
  setSelect("14_any_entertainment_other_than_bg_musickaraoketrivia", "No");
  setSelect("15_other_recreational_activities_beyond_listed", "No");

  // —— Security ——
  setSelect("security_present", "Yes");
  setSelect("background_checks", "Yes");
  setSelect("armed", "No");
  setSelect("conflictres_trained", "Yes");

  // —— Delivery: Yes to test conditional block ——
  setSelect("17_offer_delivery", "Yes");
  setSelect("insuredowned_autos", "No");
  setSelect("employee_autos", "No");
  setSelect("3rdparty_delivery", "Yes");
  setInput("delivery_sales_insuredemp_autos", "15000");
  setSelect("3rdparty_deliverymore_than_20_of_location_sales", "No");
  setSelect("ComboBox17", "No");
  setSelect("hours_past_10_pm", "No");

  setSelect("18_if_auto_coverage_is_rated_shuttle_servic", "No");
  setSelect("ComboBox1", "No");

  // —— Liquor / claims / quotes ——
  setSelect("19_any_liquor_law_violations_in_last_3_years", "No");
  setSelect("claim_count", "Zero");
  setSelect("building_quote", "No");
  setSelect("workers_comp_quote", "Yes");
  setInput("wc_restaurant", "Yes");
  setInput("wc_employees_ft", "5");
  setInput("wc_employees_pt", "7");
  setInput("wc_annual_payroll", "250000");

  setSelect("additional_insureds_present", "No");

  // Payment plan
  setInput("payment_plan_Annual", "Yes");

  // Trigger address composite (premises_address hidden)
  const addr = form.querySelector('[name="premise_address"]');
  const city = form.querySelector('[name="premise_city"]');
  const state = form.querySelector('[name="premise_state"]');
  const zip = form.querySelector('[name="premise_zip"]');
  const premisesHidden = document.getElementById("premises_address_hidden");
  if (premisesHidden && addr) {
    premisesHidden.value = [addr.value, city?.value, state?.value, zip?.value].filter(Boolean).join(", ");
  }

  console.log("Form filled with test data. Scroll down and click Submit to test.");
})();
