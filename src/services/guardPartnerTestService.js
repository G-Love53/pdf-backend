import { recordSubmission } from "../db.js";
import {
  GUARD_WC_LINES,
  getGuardPilotStates,
  guardDbSegmentFromLine,
  isGuardPilotState,
  isGuardWcEnabledForSegment,
  ratingClassificationCd,
  resolveGuardWcLine,
} from "../config/guardRegistry.js";
import { getGuardPublicConfig, isGuardConfigured } from "./guardService.js";

const PARTNER_SOURCE = "guard-partner-test";

export function isGuardPartnerTestEnabled() {
  const flag = process.env.GUARD_PARTNER_TEST_ENABLED;
  if (flag == null || String(flag).trim() === "") {
    return getGuardPublicConfig().sandbox;
  }
  return String(flag).toLowerCase() === "true";
}

export function verifyGuardPartnerTestToken(req) {
  const expected = process.env.GUARD_PARTNER_TEST_TOKEN;
  if (!expected) return true;
  const fromQuery = req.query?.token;
  const fromHeader = req.headers["x-partner-test-token"];
  return fromQuery === expected || fromHeader === expected;
}

export function getGuardWcRegistry(state = "CO") {
  const st = String(state || "CO").trim().toUpperCase();
  const stateOk = isGuardPilotState(st);
  const pub = getGuardPublicConfig();
  const segments = Object.entries(GUARD_WC_LINES)
    .map(([key, entry]) => {
      const enabled = isGuardWcEnabledForSegment(key);
      return {
        segment: key,
        lineKey: entry?.lineKey || key,
        parentSegment: entry?.parentSegment || key,
        businessClass: entry?.businessClass || null,
        label: entry?.label || key,
        wcEnabled: Boolean(entry?.wcEnabled),
        offerWc: Boolean(enabled && stateOk && pub.apiConfigured),
        classCode: entry?.classCode || null,
        classSuffix: entry?.classSuffix || null,
        ratingClassificationCd: ratingClassificationCd(entry),
        classDescription: entry?.classDescription || null,
        operationsDesc: entry?.operationsDesc || null,
        digitalDecisionNote: entry?.digitalDecisionNote || null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    ok: true,
    purpose: "Workers' Comp partner test (P-env)",
    pilotStates: [...getGuardPilotStates()],
    state: st,
    stateOk,
    apiConfigured: pub.apiConfigured,
    sandbox: pub.sandbox,
    segments,
  };
}

function truthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v || "").toLowerCase();
  return s === "true" || s === "yes" || s === "on" || s === "1";
}

function partnerLocations(body, state, city1, zip1, street1) {
  const loc2Street = String(
    body.location2_street || body.location2Street || "",
  ).trim();
  const locations = [
    {
      id: "L1",
      street: street1,
      city: city1,
      state,
      zip: zip1,
    },
  ];
  if (loc2Street) {
    locations.push({
      id: "L2",
      street: loc2Street,
      city: body.location2_city || body.location2City || city1,
      state: body.location2_state || body.location2State || state,
      zip: body.location2_zip || body.location2Zip || zip1,
    });
  }
  return locations;
}

function normalizePartnerForm(body = {}) {
  const segment = String(body.segment || "plumber").trim().toLowerCase();
  const state = String(body.state || body.premise_state || "CO")
    .trim()
    .toUpperCase();
  const locationStreet =
    body.location_street || body.locationStreet || body.street || body.address || "";
  const locationCity = body.location_city || body.premise_city || body.city || "Denver";
  const locationZip = body.location_zip || body.premise_zip || body.zip || "80202";
  const mailingSame = truthyFlag(
    body.mailing_same ?? body.mailingSame ?? false,
  );
  const mailingStreet = mailingSame
    ? locationStreet
    : body.mailing_street || body.mailingStreet || "";
  const mailingCity = mailingSame
    ? locationCity
    : body.mailing_city || body.city || locationCity;
  const mailingZip = mailingSame
    ? locationZip
    : body.mailing_zip || body.zip || "80203";
  const locations = partnerLocations(
    body,
    state,
    locationCity,
    locationZip,
    locationStreet,
  );
  return {
    segment,
    state,
    first_name: body.first_name || body.firstName || "Demo",
    last_name: body.last_name || body.lastName || "Insured",
    contact_email: body.contact_email || body.email || "guard-test@commercialinsurance-direct.com",
    phone: body.phone || body.contact_phone || "3039321700",
    insured_name: body.insured_name || body.business_name || body.legal_business_name || "Demo Business LLC",
    premise_street: locationStreet,
    premise_city: locationCity,
    premise_state: state,
    premise_zip: locationZip,
    street: mailingStreet || locationStreet || "PO Box 100",
    city: mailingCity,
    state,
    zip: mailingZip || locationZip,
    mailing_same: mailingSame,
    locations,
    num_employees: Number(body.num_employees || body.numEmployees || 2),
    annual_payroll: Number(body.annual_payroll || body.payroll || 80000),
    owner_payroll: body.owner_payroll || body.ownerPayroll || null,
    years_in_business: Number(body.years_in_business || 3),
    traffic_source: PARTNER_SOURCE,
    campaign_id: body.campaign_id || "guard-partner-test",
  };
}

export async function startGuardPartnerTest(body = {}) {
  if (!isGuardPartnerTestEnabled()) {
    return {
      ok: false,
      status: 404,
      error: "PARTNER_TEST_DISABLED",
      message: "GUARD partner test is not enabled on this service.",
    };
  }
  if (!isGuardConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "GUARD_NOT_CONFIGURED",
      message: "GUARD API env is not set on this service.",
    };
  }

  const form = normalizePartnerForm(body);
  if (!isGuardWcEnabledForSegment(form.segment)) {
    return {
      ok: false,
      status: 400,
      error: "GUARD_WC_OFF",
      message: "Workers' Comp is not enabled for this segment.",
    };
  }
  if (!isGuardPilotState(form.state)) {
    return {
      ok: false,
      status: 400,
      error: "GUARD_STATE_NOT_SUPPORTED",
      message: `State ${form.state} is not in the GUARD pilot list.`,
    };
  }

  const line = resolveGuardWcLine(form.segment);
  const dbSegment = guardDbSegmentFromLine(form.segment);

  const dbResult = await recordSubmission({
    segment: dbSegment,
    sourceDomain: "partner-test",
    sourceForm: PARTNER_SOURCE,
    rawSubmission: form,
    primaryEmail: form.contact_email,
    primaryPhone: form.phone,
    firstName: form.first_name,
    lastName: form.last_name,
    notifyAgent: false,
  });

  if (!dbResult?.submissionPublicId) {
    return {
      ok: false,
      status: 500,
      error: "SUBMISSION_FAILED",
      message: "Could not create test submission.",
    };
  }

  return {
    ok: true,
    submission_public_id: dbResult.submissionPublicId,
    segment: form.segment,
    parentSegment: dbSegment,
    businessClass: line?.businessClass || null,
    label: line?.label || form.segment,
    state: form.state,
    ratingClassificationCd: ratingClassificationCd(line),
    classDescription: line?.classDescription || null,
    message:
      "Test submission created. Continue with WC indication on this page.",
  };
}
