import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  META_FIELDS,
  UNIVERSAL_COPY,
  ACORD_AI_COPY,
  AI_ROLE_CHECKBOXES,
  BACKEND_ROUTED,
  SECOND_AI_FIELDS,
  CONTRACTOR_YES_NO,
  ROOFER_COPY,
  REMARKS_OVERFLOW,
  SEGMENT_FORMS,
  SEGMENT_SUPP,
} from "../config/formFieldRouting.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME_BASE = path.join(__dirname, "../../CID_HomeBase/templates");
const SIBLING = path.join(__dirname, "../../..");
const ACORD_TEMPLATES = ["ACORD125", "ACORD126", "ACORD130", "ACORD140"];

const CONTRACTOR_SEGMENTS = new Set(["plumber", "hvac", "fitness", "electrical"]);

function getVal(d, key) {
  const v = d[key];
  return v != null && String(v).trim() !== "" ? v : undefined;
}

function setIfEmpty(d, key, value) {
  if (getVal(d, key) != null || value == null || String(value).trim() === "") return;
  d[key] = value;
}

function applyYesNo(d, formKey, yesKey, noKey) {
  const v = getVal(d, formKey);
  if (v == null) return;
  const norm = String(v).trim().toLowerCase();
  if (norm === "yes") {
    setIfEmpty(d, yesKey, "Yes");
  } else if (norm === "no") {
    setIfEmpty(d, noKey, "Yes");
  }
}

function appendRemarks(d, label, value, remarksKey = "remarks") {
  if (value == null || String(value).trim() === "") return;
  const line = `${label}: ${value}`;
  const prev = getVal(d, remarksKey);
  d[remarksKey] = prev ? `${prev} | ${line}` : line;
}

function applyCopyRoutes(d, routes) {
  for (const { form, to } of routes) {
    if (getVal(d, to) == null && getVal(d, form) != null) {
      d[to] = d[form];
    }
  }
}

function applyBusinessStructure(d) {
  const structure = getVal(d, "business_structure");
  if (structure == null) return;
  const s = String(structure).trim().toLowerCase();
  const map = {
    individual: "individual",
    partnership: "partnership",
    corporation: "corporation",
    "joint venture": "jv",
    jv: "jv",
    llc: "corporation",
  };
  const target = map[s];
  if (target) setIfEmpty(d, target, "Yes");
}

function applyAiRoleCheckboxes(d) {
  const roles = [
    { form: "ai_loss_payee", block: 1 },
    { form: "ai_lienholder", block: 1 },
    { form: "ai_mortgagee", block: 1 },
    { form: "ai_additional_insured", block: 1 },
    { form: "ai_loss_payee_2", block: 2 },
    { form: "ai_lienholder_2", block: 2 },
    { form: "ai_mortgagee_2", block: 2 },
    { form: "ai_additional_insured_2", block: 2 },
  ];
  for (const { form, block } of roles) {
    if (getVal(d, form) === "Yes") {
      setIfEmpty(d, `ai_type_${block}`, "Yes");
    }
  }
}

function applyBarConstructionFlags(d) {
  const parts = [];
  if (getVal(d, "construction_frame") === "Yes") parts.push("Frame");
  if (getVal(d, "construction_joist_masonry") === "Yes") parts.push("Joist Masonry");
  if (getVal(d, "construction_masonry") === "Yes") parts.push("Masonry");
  if (parts.length) {
    setIfEmpty(d, "bldg_description", parts.join(", "));
  }
}

function applyHvacOpsToSupp(d, segment) {
  if (segment !== "hvac" && segment !== "plumber") return;
  const hvacYes = getVal(d, "hvac_operations") === "Yes";
  const roofingYes = getVal(d, "roofing_operations") === "Yes";
  if (hvacYes) {
    setIfEmpty(d, "hvac_emp", "Yes");
  }
  if (roofingYes) {
    setIfEmpty(d, "roofing_emp", "Yes");
  }
}

function applySecondAiBlock(d, segment) {
  if (!getVal(d, "ai_name_2")) return;
  if (CONTRACTOR_SEGMENTS.has(segment)) return;
  const parts = [
    getVal(d, "ai_name_2"),
    getVal(d, "ai_address_2"),
    [getVal(d, "ai_city_2"), getVal(d, "ai_state_2"), getVal(d, "ai_zip_2")].filter(Boolean).join(", "),
  ].filter(Boolean);
  appendRemarks(d, "Additional insured 2", parts.join(" — "));
}

/**
 * Normalize intake formData so every answer has a SUPP/ACORD destination
 * (or remarks/meta). Call once on submit before bundle render.
 */
export function applyFormFieldRouting(rawData, segmentInput) {
  const d = { ...rawData };
  const segment = String(segmentInput || d.segment || "").trim().toLowerCase();

  applyCopyRoutes(d, UNIVERSAL_COPY);
  applyCopyRoutes(d, ACORD_AI_COPY);
  applyBusinessStructure(d);
  applyAiRoleCheckboxes(d);
  applyBarConstructionFlags(d);
  applyHvacOpsToSupp(d, segment);
  applySecondAiBlock(d, segment);

  if (CONTRACTOR_SEGMENTS.has(segment)) {
    for (const route of CONTRACTOR_YES_NO) {
      applyYesNo(d, route.form, route.yes, route.no);
    }
  }

  if (segment === "roofer") {
    applyCopyRoutes(d, ROOFER_COPY);
    if (getVal(d, "entity_type_llc") === "Yes") {
      setIfEmpty(d, "other", "Yes");
      appendRemarks(d, "Entity type", "LLC");
    }
  }

  const overflow = REMARKS_OVERFLOW[segment] || [];
  for (const { form, label } of overflow) {
    appendRemarks(d, label, getVal(d, form));
  }

  if (segment === "bar") {
    if (getVal(d, "building_quote") === "Yes" && getVal(d, "business_personal_property")) {
      setIfEmpty(d, "building_limit", d.business_personal_property);
    }
    if (getVal(d, "year_built")) {
      appendRemarks(d, "Year built", d.year_built);
    }
  }

  return d;
}

function loadMapNames(template, root = HOME_BASE) {
  const dir = path.join(root, template, "mapping");
  if (!fs.existsSync(dir)) return new Set();
  const names = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".map.json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const field of j.fields || []) names.add(field.name);
  }
  return names;
}

export function extractFormFieldNames(htmlPath) {
  if (!fs.existsSync(htmlPath)) return [];
  const html = fs.readFileSync(htmlPath, "utf8");
  const names = new Set();
  const re = /<(?:input|select|textarea)[^>]*\bname=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) names.add(m[1]);
  return [...names].sort();
}

function routingDestinations(segment) {
  const dest = new Set();
  for (const { to } of UNIVERSAL_COPY) dest.add(to);
  for (const { to } of ACORD_AI_COPY) dest.add(to);
  if (CONTRACTOR_SEGMENTS.has(segment)) {
    for (const r of CONTRACTOR_YES_NO) {
      dest.add(r.yes);
      dest.add(r.no);
    }
  }
  if (segment === "roofer") {
    for (const { to } of ROOFER_COPY) dest.add(to);
  }
  return dest;
}

function formHasRoutingRule(form, segment) {
  if (BACKEND_ROUTED.has(form) || AI_ROLE_CHECKBOXES.has(form)) return true;
  if (UNIVERSAL_COPY.some((c) => c.form === form)) return true;
  if (ACORD_AI_COPY.some((c) => c.form === form)) return true;
  if (CONTRACTOR_SEGMENTS.has(segment) && CONTRACTOR_YES_NO.some((c) => c.form === form)) return true;
  if (segment === "roofer" && ROOFER_COPY.some((c) => c.form === form)) return true;
  if ((REMARKS_OVERFLOW[segment] || []).some((r) => r.form === form)) return true;
  if (SECOND_AI_FIELDS.includes(form)) return true;
  return false;
}

/**
 * Audit form fields vs SUPP/ACORD maps + routing config.
 * Returns { segment, total, covered, gaps, meta, byBucket }.
 */
export function auditSegmentFormRouting(segment) {
  const formPath = SEGMENT_FORMS[segment];
  const suppTemplate = SEGMENT_SUPP[segment];
  if (!formPath || !suppTemplate) {
    throw new Error(`Unknown segment: ${segment}`);
  }

  const formFields = extractFormFieldNames(formPath);
  const suppRoot =
    segment === "roofer" && fs.existsSync(path.join(SIBLING, "roofing-pdf-backend/CID_HomeBase/templates/SUPP_ROOFER"))
      ? path.join(SIBLING, "roofing-pdf-backend/CID_HomeBase/templates")
      : HOME_BASE;

  const supp = loadMapNames(suppTemplate, suppRoot);
  const acord = new Set();
  for (const t of ACORD_TEMPLATES) {
    for (const n of loadMapNames(t)) acord.add(n);
  }

  const routed = routingDestinations(segment);
  const overflowForms = new Set((REMARKS_OVERFLOW[segment] || []).map((r) => r.form));

  const buckets = {
    meta: [],
    supp: [],
    acord: [],
    both: [],
    routed: [],
    remarks: [],
    client_only: [],
  };

  for (const f of formFields) {
    if (META_FIELDS.has(f)) {
      buckets.meta.push(f);
      continue;
    }
    if (overflowForms.has(f)) {
      buckets.remarks.push(f);
      continue;
    }
    if (SECOND_AI_FIELDS.includes(f)) {
      buckets.routed.push(f);
      continue;
    }

    const onSupp = supp.has(f);
    const onAcord = acord.has(f);
    const viaCopy = UNIVERSAL_COPY.some((c) => c.form === f && (supp.has(c.to) || acord.has(c.to)));
    const viaAcordAi = ACORD_AI_COPY.some((c) => c.form === f && acord.has(c.to));
    const viaSuppAi = /^ai_(name|address|city|state|zip)_\d$/.test(f) && supp.has(f);
    const viaRule = formHasRoutingRule(f, segment);

    if (onSupp && onAcord) buckets.both.push(f);
    else if (onSupp || viaSuppAi) buckets.supp.push(f);
    else if (onAcord || viaAcordAi) buckets.acord.push(f);
    else if (viaCopy || viaRule || routed.has(f)) buckets.routed.push(f);
    else buckets.client_only.push(f);
  }

  const covered =
    formFields.length - buckets.client_only.length;

  return {
    segment,
    total: formFields.length,
    covered,
    gaps: buckets.client_only,
    buckets,
  };
}

export function auditAllSegments() {
  return Object.keys(SEGMENT_FORMS).map((seg) => auditSegmentFormRouting(seg));
}
