/**
 * Form field → PDF destination routing.
 *
 * Every Netlify intake field should resolve to at least one of:
 *   - SUPP map field (segment supplement)
 *   - ACORD map field (125/126/130/140)
 *   - CLIENT_SUBMISSION (raw snapshot — automatic for all formData)
 *   - meta (analytics / quote product — not on carrier PDFs)
 *   - remarks overflow (labeled text on SUPP remarks or ACORD multiline)
 *
 * Types:
 *   copy:       { form, to } — copy value when `to` is empty
 *   yesNo:      { form, yes, no } — Yes/No select → checkbox pair
 *   checkboxAi: { form, suppType } — AI role checkbox → ai_type_1/2 on SUPP
 *   remarks:    { form, label } — append to remarks when no dedicated slot
 *   meta:       form field names stored in DB/email only
 */

/** Fields never rendered on SUPP/ACORD carrier PDFs */
export const META_FIELDS = new Set([
  "traffic_source",
  "campaign_id",
  "site_domain",
  "brand",
  "payment_plan",
  "payment_plan_Annual",
  "payment_plan_Monthly",
  "workers_comp_quote",
  "wc_bar_tavern",
  "wc_restaurant",
  "bar-restaurant-quote",
  "roofing-contractor-quote",
  "plumber-contractor-quote",
  "hvac-contractor-quote",
  "fitness-contractor-quote",
  "electrical-contractor-quote",
  "trade",
  "segment",
  "bundle_id",
  "additional_insureds_present",
  "additional_names",
  "security_present",
  "location_same_as_mailing",
  "Has_Additional_Locations",
]);

/** Universal copy aliases (form → canonical keys used on SUPP/ACORD) */
export const UNIVERSAL_COPY = [
  { form: "premises_name", to: "insured_name" },
  { form: "premise_address", to: "physical_address_1" },
  { form: "premise_city", to: "physical_city" },
  { form: "premise_state", to: "physical_state" },
  { form: "premise_zip", to: "physical_zip" },
  { form: "premises_website", to: "business_website" },
  { form: "web_address", to: "business_website" },
  { form: "effective_date", to: "policy_effective_date" },
  { form: "policy_period_from", to: "policy_effective_date" },
  { form: "applicant_phone", to: "business_phone" },
  { form: "contact_email", to: "contact_email_1" },
  { form: "contact_email", to: "business_email" },
  { form: "wc_employees_ft", to: "num_ft_employees" },
  { form: "wc_employees_pt", to: "num_pt_employees" },
  { form: "wc_annual_payroll", to: "annual_payroll" },
  { form: "annual_payroll_excl_owners", to: "annual_payroll" },
  { form: "fulltime_1", to: "num_ft_employees" },
  { form: "parttime_1", to: "num_pt_employees" },
  { form: "square_footage", to: "total_squarefeet_1" },
  { form: "projected_revenue", to: "projected_gross_revenue" },
  { form: "annual_revenue_1", to: "total_sales" },
  { form: "percent_sprinker", to: "percent_sprinkler" },
  { form: "num_stories", to: "number_of_stories" },
  { form: "ownership_experience_details_yes", to: "prior_experience_details" },
  { form: "ownership_experience_details_no", to: "prior_experience_details" },
  { form: "if_yes_more_than_25_for_onpremise", to: "if_yes_more_than_25_for_onpremise_2" },
  { form: "claim_count", to: "total_claims" },
  { form: "claims_details", to: "typeofclaim_1" },
  { form: "Years_of_Experience", to: "years_of_experience_in_this_field" },
  { form: "entity_type_individual", to: "individual" },
  { form: "entity_type_partnership", to: "partnership" },
  { form: "entity_type_corporation", to: "corporation" },
  { form: "entity_type_joint_venture", to: "joint_venture" },
  { form: "entity_type_llc", to: "other" },
  { form: "entity_type_other", to: "other" },
  { form: "org_type_individual", to: "individual" },
  { form: "org_type_corporation", to: "corporation" },
  { form: "org_type_llc", to: "llc" },
  { form: "states_work_in", to: "if_yes_in_what_states_provide_details_of_work_performed" },
  { form: "max_building_height", to: "what_is_the_maximum_height_of_buildings_you_work_on" },
  { form: "independent_contractors_jobs", to: "please_describe_type_of_work" },
  { form: "industrial_plumbing_clients", to: "please_describe_type_of_work" },
  { form: "pct_repair_remodel", to: "individual_living_units_involved_in_the_remodling_renovation_project" },
  { form: "remodel_condos_hoas_for_whom", to: "what_type_of_work_will_it_entail" },
  { form: "mold_defect_losses_details", to: "if_yes_describe_security_at_ night" },
  { form: "estimated_annual_subcontract_cost", to: "b_subcontractors_under_your_supervision" },
  { form: "number_active_owners", to: "number_of_executive_supervisors" },
  { form: "business_personal_property", to: "building_value" },
  { form: "building_quote", to: "building_limit" },
  { form: "year_built", to: "bldg_description" },
  { form: "delivery_sales_insuredemp_autos", to: "delivery_20_explanation" },
  { form: "ComboBox1", to: "remarks" },
];

/** Yes/No form selects → SUPP checkbox pairs (contractor segments) */
export const CONTRACTOR_YES_NO = [
  { form: "is_licensed", yes: "is_the_applicant_licensed", no: "is_the_applicant_licensed_no" },
  { form: "hire_subs", yes: "hire_subcontractors_yes", no: "hire_subcontractors_no" },
  { form: "subs_require_coi", yes: "coi_from_subcontractors_yes", no: "coi_from_subcontractors_no" },
  { form: "subs_contracts_holdharmless", yes: "hold_harmless_yes", no: "hold_harmless_no" },
  { form: "carry_workers_comp", yes: "subcontractors_carry_workers_comp_yes", no: "subcontractors_carry_workers_comp_no" },
  { form: "work_repair_remodel", yes: "repair_or_remodeling_yes", no: "repair_or_remodeling_no" },
  { form: "condo_conversions", yes: "condo_conversions_yes", no: "condo_conversions_no" },
  { form: "remodel_condos_hoas", yes: "hoa_yes", no: "hoa_no" },
  { form: "mold_defect_losses", yes: "pending_litigation_defect_or_fungus_mold_claims_yes", no: "pending_litigation_defect_or_fungus_mold_claims_no" },
  { form: "fire_water_restoration", yes: "perform_or_subcontract_fire_restoration_andor_water_remediation_yes", no: "perform_or_subcontract_fire_restoration_andor_water_remediation_no" },
  { form: "hazardous_materials_handling", yes: "applying_disposing_or_transporting_of_hazardous_material_eg_landfills_wastes_fuel_tanks_yes", no: "applying_disposing_or_transporting_of_hazardous_material_eg_landfills_wastes_fuel_tanks_no" },
  { form: "roofing_operations", yes: "are_you_involved_in_torch_down_or_hot_tar_roofing_yes", no: "are_you_involved_in_torch_down_or_hot_tar_roofing_no" },
  { form: "use_independent_contractors", yes: "lease_employees_to_or_from_other_employers_yes", no: "lease_employees_to_or_from_other_employers_no" },
  { form: "claims_3_years", yes: "loss_alleges_defect_or_fungus_mold_damage_yes", no: "loss_alleges_defect_or_fungus_mold_damage_no" },
];

/** Roofer operations % → SUPP_ROOFER page-1 fill slots */
export const ROOFER_COPY = [
  { form: "commercial_new_construction", to: "fill_28" },
  { form: "commercial_repair_patching", to: "fill_29" },
  { form: "commercial_replacement", to: "fill_30" },
  { form: "residential_new_construction", to: "fill_32" },
  { form: "residential_repair_patching", to: "fill_33" },
  { form: "residential_replacement", to: "fill_34" },
  { form: "industrial_new_construction", to: "fill_37" },
  { form: "industrial_repair_patching", to: "fill_38" },
  { form: "industrial_replacement", to: "fill_39" },
  { form: "flat_roofs_percent", to: "fill_42" },
  { form: "metal_percent", to: "metal" },
  { form: "pitch_roofs_percent", to: "pitch_roofs" },
  { form: "asphalt_shingle_percent", to: "fill_46" },
  { form: "single_ply_percent", to: "single_ply" },
  { form: "tile_percent", to: "tile" },
  { form: "fiberglass_percent", to: "fill_50" },
  { form: "wood_percent", to: "wood" },
  { form: "polyurethane_foam_percent", to: "polyurethane" },
  { form: "hot_tar_percent", to: "fill_53" },
  { form: "slate_percent", to: "slate" },
  { form: "torch_down_percent", to: "torch_down" },
  { form: "other_roofing_describe", to: "other_describe" },
  { form: "additional_insured", to: "ai_name_1" },
  { form: "certificate_retention_other", to: "certificate_retention_years" },
  { form: "warranties_offered", to: "check_box16" },
  { form: "wrap_up_projects", to: "wrap_up_cost" },
  { form: "written_safety_program", to: "check_box17" },
  { form: "work_restricted_states", to: "restricted_states_details" },
  { form: "draw_plans_designs", to: "plans_description" },
  { form: "fire_watch_program", to: "fire_watch_description" },
  { form: "fall_protection_guardrail", to: "protect_public" },
  { form: "fall_protection_personal", to: "protect_public" },
  { form: "fall_protection_safety_net", to: "protect_public" },
  { form: "cranes_used", to: "cranes_owned" },
  { form: "lease_equipment", to: "cranes_rented" },
  { form: "lease_equipment_description", to: "materials_lifting" },
  { form: "other_operations", to: "additional_comments" },
  { form: "multi_family_units", to: "text1" },
  { form: "sub_lower_coverage", to: "minimum_limits" },
  { form: "Heat_Safety_Inspection_Procedures", to: "Heat_Safety_Inspection_Procedures" },
  { form: "Perform_Fire_Watch", to: "fire_watch_description" },
  { form: "Fire_Watch_Duration", to: "fire_watch_description" },
  { form: "Warranty_Description", to: "additional_comments" },
  { form: "Warranty_Period", to: "text2" },
  { form: "asbestos_work", to: "asbestos_details" },
  { form: "asbestos_last_date", to: "asbestos_details" },
  { form: "completion_inspection", to: "additional_comments" },
  { form: "certificates_required", to: "certificate_recipients_additional_interests" },
];

/** Fields with no mapped PDF slot yet — append to SUPP remarks with label */
export const REMARKS_OVERFLOW = {
  bar: [
    { form: "ComboBox1", label: "Additional auto policies in force" },
    { form: "construction_frame", label: "Construction: Frame" },
    { form: "construction_joist_masonry", label: "Construction: Joist Masonry" },
    { form: "construction_masonry", label: "Construction: Masonry" },
  ],
  plumber: [
    { form: "gas_line_work", label: "Gas line work" },
    { form: "boiler_work", label: "Boiler work" },
    { form: "boiler_work_gas", label: "Boiler work (gas)" },
    { form: "welding_operations_gas", label: "Welding operations (gas)" },
    { form: "high_pressure_steam_gas", label: "High pressure steam (gas)" },
    { form: "high_pressure_steam_work", label: "High pressure steam work" },
    { form: "hvac_operations", label: "HVAC operations" },
    { form: "current_carrier", label: "Current carrier" },
  ],
  hvac: [
    { form: "gas_line_work", label: "Gas line work" },
    { form: "boiler_work", label: "Boiler work" },
    { form: "high_pressure_steam_work", label: "High pressure steam work" },
    { form: "refrigeration_work", label: "Refrigeration work" },
    { form: "ac_units_work", label: "AC units work" },
    { form: "welding_operations", label: "Welding operations" },
    { form: "welding_fire_measures", label: "Welding fire measures" },
    { form: "crane_operations", label: "Crane operations" },
    { form: "current_carrier", label: "Current carrier" },
    { form: "hvac_operations", label: "HVAC operations" },
  ],
  fitness: [
    { form: "current_carrier", label: "Current carrier" },
    { form: "crane_operations", label: "Crane operations" },
    { form: "hvac_operations", label: "HVAC operations" },
  ],
  electrical: [
    { form: "gas_line_work", label: "Gas line work" },
    { form: "boiler_work", label: "Boiler work" },
    { form: "high_pressure_steam_work", label: "High pressure steam work" },
    { form: "refrigeration_work", label: "Refrigeration work" },
    { form: "ac_units_work", label: "AC units work" },
    { form: "welding_operations", label: "Welding operations" },
    { form: "welding_fire_measures", label: "Welding fire measures" },
    { form: "crane_operations", label: "Crane operations" },
    { form: "current_carrier", label: "Current carrier" },
    { form: "hvac_operations", label: "HVAC operations" },
  ],
  roofer: [
    { form: "CERTA_Certified_Employees", label: "CERTA certified employees" },
    { form: "Heat_Application_Experience_Years", label: "Heat application experience years" },
    { form: "Multi_Family_Work", label: "Multi-family work" },
    { form: "OSHA_Fire_Prevention_Compliance", label: "OSHA fire prevention compliance" },
    { form: "hold_harmless_agreements", label: "Hold harmless agreements" },
    { form: "indemnification_clause", label: "Indemnification clause" },
    { form: "osha_compliance", label: "OSHA compliance" },
    { form: "spraying_flammable_liquids", label: "Spraying flammable liquids" },
    { form: "crane_barriers", label: "Crane barriers" },
    { form: "crane_maintenance", label: "Crane maintenance" },
    { form: "crane_training", label: "Crane training" },
    { form: "fire_extinguishers_all_sites", label: "Fire extinguishers all sites" },
    { form: "fire_prevention_processes", label: "Fire prevention processes" },
  ],
};

/** ACORD additional-insured block (form uses _1 suffix; ACORD uses canonical) */
export const ACORD_AI_COPY = [
  { form: "ai_name_1", to: "ai_name" },
  { form: "ai_address_1", to: "ai_address" },
  { form: "ai_city_1", to: "ai_city" },
  { form: "ai_state_1", to: "ai_state" },
  { form: "ai_zip_1", to: "ai_zip" },
  { form: "ai_loss_payee", to: "ai_losspayee" },
  { form: "ai_lienholder", to: "ai_lienholder" },
  { form: "ai_mortgagee", to: "ai_mortgage" },
  { form: "ai_additional_insured", to: "ai_insured" },
];

/** AI role checkboxes → SUPP ai_type_1 / ai_type_2 (applyAiRoleCheckboxes) */
export const AI_ROLE_CHECKBOXES = new Set([
  "ai_loss_payee",
  "ai_lienholder",
  "ai_mortgagee",
  "ai_additional_insured",
  "ai_loss_payee_2",
  "ai_lienholder_2",
  "ai_mortgagee_2",
  "ai_additional_insured_2",
]);

/** Second additional-insured block (forms) — SUPP page-6 on contractor; remarks on bar/roofer */
export const SECOND_AI_FIELDS = [
  "ai_name_2",
  "ai_address_2",
  "ai_city_2",
  "ai_state_2",
  "ai_zip_2",
];
export const BACKEND_ROUTED = new Set([
  "delivery_hours_extend_past_10pm",
  "regularly_maintained",
  "premises_address",
]);
import path from "path";
import { fileURLToPath } from "url";

const _routingDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(_routingDir, "../..");
const SIBLING = path.join(REPO_ROOT, "..");

/** Netlify form HTML paths (sibling *-pdf-backend repos) */
export const SEGMENT_FORMS = {
  bar: path.join(SIBLING, "bar-pdf-backend/Netlify/index.html"),
  roofer: path.join(SIBLING, "roofing-pdf-backend/Netlify/index.html"),
  plumber: path.join(SIBLING, "plumber-pdf-backend/Netlify/index.html"),
  hvac: path.join(SIBLING, "hvac-pdf-backend/Netlify/index.html"),
  fitness: path.join(SIBLING, "fitness-pdf-backend/Netlify/index.html"),
  electrical: path.join(SIBLING, "electrical-pdf-backend/Netlify/index.html"),
};

export const SEGMENT_SUPP = {
  bar: "SUPP_BAR",
  roofer: "SUPP_ROOFER",
  plumber: "SUPP_PLUMBER",
  hvac: "SUPP_HVAC",
  fitness: "SUPP_FITNESS",
  electrical: "SUPP_ELECTRICAL",
};
