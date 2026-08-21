import { getPool } from "../db.js";
import {
  getGuardSegmentEntry,
  isGuardPilotState,
  isGuardWcEnabledForSegment,
  ratingClassificationCd,
} from "../config/guardRegistry.js";
import {
  GuardApiError,
  buildRatingPayloadFromForm,
  getGuardPublicConfig,
  guardBind,
  guardFetchQuestions,
  guardIndicate,
  guardSubmitNbs,
  isGuardConfigured,
  yearsInBusinessFromForm,
} from "./guardService.js";

function formFromSubmission(row) {
  const raw = row?.raw_submission_json || {};
  return raw && typeof raw === "object" ? raw : {};
}

async function loadSubmission(submissionPublicId) {
  const pool = getPool();
  if (!pool) return null;
  const r = await pool.query(
    `SELECT submission_id, submission_public_id, segment, raw_submission_json, client_id
     FROM submissions
     WHERE submission_public_id = $1
     LIMIT 1`,
    [submissionPublicId],
  );
  return r.rows[0] || null;
}

async function appendGuardTimeline(submissionId, eventType, payload) {
  if (!submissionId) return;
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO timeline_events (
         submission_id, event_type, event_label, event_payload_json, created_by
       ) VALUES ($1, $2, $3, $4, 'system')`,
      [submissionId, eventType, eventType.replace(/\./g, " "), payload],
    );
  } catch (err) {
    console.error("[guard] timeline error:", err.message || err);
  }
}

async function persistGuardSession(submissionId, payload) {
  await appendGuardTimeline(submissionId, "guard.session", payload);
}

export async function loadGuardSession(submissionPublicId) {
  const pool = getPool();
  if (!pool) return null;
  const r = await pool.query(
    `SELECT event_payload_json
     FROM timeline_events te
     JOIN submissions s ON s.submission_id = te.submission_id
     WHERE s.submission_public_id = $1
       AND te.event_type = 'guard.session'
     ORDER BY te.created_at DESC
     LIMIT 1`,
    [submissionPublicId],
  );
  return r.rows[0]?.event_payload_json || null;
}

export function getGuardOfferConfig(segment, state) {
  const entry = getGuardSegmentEntry(segment);
  const wcEnabled = isGuardWcEnabledForSegment(segment);
  const stateOk = isGuardPilotState(state || "CO");
  const pub = getGuardPublicConfig();
  return {
    ok: true,
    segment: String(segment || "").toLowerCase(),
    wcEnabled,
    stateOk,
    offerWc: Boolean(wcEnabled && stateOk && pub.apiConfigured),
    apiConfigured: pub.apiConfigured,
    sandbox: pub.sandbox,
    classCode: entry?.classCode || null,
    digitalDecisionNote: entry?.digitalDecisionNote || null,
    indicationDisclaimer:
      "This is a premium indication, not a bindable quote. A few more questions (and FEIN) are required before bind.",
  };
}

function gate(segment, state) {
  if (!isGuardWcEnabledForSegment(segment)) {
    return {
      ok: false,
      status: 400,
      error: "GUARD_WC_OFF",
      message: "Workers’ Comp is not enabled for this segment.",
    };
  }
  if (!isGuardPilotState(state)) {
    return {
      ok: false,
      status: 400,
      error: "GUARD_STATE_NOT_SUPPORTED",
      message: "GUARD Workers’ Comp v1 is CO only.",
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
  return null;
}

export async function processGuardIndicate(body = {}) {
  const submissionPublicId = body.submission_public_id;
  if (!submissionPublicId) {
    return {
      ok: false,
      status: 400,
      error: "SUBMISSION_REQUIRED",
      message: "submission_public_id is required.",
    };
  }

  const row = await loadSubmission(submissionPublicId);
  if (!row) {
    return { ok: false, status: 404, error: "SUBMISSION_NOT_FOUND" };
  }

  const form = formFromSubmission(row);
  const segment = String(body.segment || row.segment || form.segment || "")
    .trim()
    .toLowerCase();
  const state = form.premise_state || form.state || body.state || "CO";
  const blocked = gate(segment, state);
  if (blocked) return blocked;

  const entry = getGuardSegmentEntry(segment);
  const employees = Number(form.num_employees || form.numEmployees || 0);
  const ownerIncluded =
    body.owner_on_wc === true ||
    body.owner_on_wc === "yes" ||
    String(body.owner_on_wc).toLowerCase() === "true";

  if (employees < 1 && !ownerIncluded) {
    return {
      ok: false,
      status: 400,
      error: "WC_NO_EXPOSURE",
      message:
        "Workers’ Comp needs employees, or the owner electing coverage on the WC policy.",
    };
  }

  const payload = buildRatingPayloadFromForm(form, segment, {
    legalEntityCd: body.legal_entity || body.legalEntityCd || "LL",
    ownerIncluded,
    numYrsInBusiness:
      Number(body.years_in_business) || yearsInBusinessFromForm(form),
  });

  let parsed;
  try {
    parsed = await guardIndicate(payload);
  } catch (err) {
    console.error("[guard indicate]", err);
    return {
      ok: false,
      status: err instanceof GuardApiError ? err.status || 502 : 502,
      error: err instanceof GuardApiError ? err.code : "GUARD_INDICATE_FAILED",
      message: err.message || "GUARD indication failed",
    };
  }

  const session = {
    submission_public_id: submissionPublicId,
    segment,
    purpose: "NBQ",
    ratingClassificationCd: ratingClassificationCd(entry),
    legalEntityCd: payload.legalEntityCd,
    ownerIncluded,
    numYrsInBusiness: payload.numYrsInBusiness,
    policyNumber: parsed.policyNumber,
    premium: parsed.fullTermAmt,
    policyStatusCd: parsed.policyStatusCd,
    uwDecision: parsed.uwDecision,
    msgStatusCd: parsed.msgStatusCd,
    remarks: parsed.remarks,
    indicatedAt: new Date().toISOString(),
  };
  await persistGuardSession(row.submission_id, session);
  await appendGuardTimeline(row.submission_id, "guard.indicated", {
    policyNumber: parsed.policyNumber,
    premium: parsed.fullTermAmt,
    policyStatusCd: parsed.policyStatusCd,
  });

  return {
    ok: true,
    bindable: false,
    indication: true,
    submission_public_id: submissionPublicId,
    guard: {
      policyNumber: parsed.policyNumber,
      premium: parsed.fullTermAmt ? Number(parsed.fullTermAmt) : null,
      policyStatusCd: parsed.policyStatusCd,
      uwDecision: parsed.uwDecision,
      msgStatusCd: parsed.msgStatusCd,
      remarks: parsed.remarks,
    },
    disclaimer:
      "Indication only — not bindable until underwriting questions and FEIN are submitted.",
  };
}

export async function processGuardQuestions(body = {}) {
  const submissionPublicId = body.submission_public_id;
  const session = submissionPublicId
    ? await loadGuardSession(submissionPublicId)
    : null;
  const row = submissionPublicId ? await loadSubmission(submissionPublicId) : null;
  const form = formFromSubmission(row);
  const segment = String(
    body.segment || session?.segment || row?.segment || "",
  )
    .trim()
    .toLowerCase();
  const state = form.state || session?.state || body.state || "CO";
  const blocked = gate(segment, state);
  if (blocked) return blocked;

  const entry = getGuardSegmentEntry(segment);
  const classCd =
    session?.ratingClassificationCd || ratingClassificationCd(entry);

  let parsed;
  try {
    parsed = await guardFetchQuestions({
      state,
      ratingClassificationCd: classCd,
    });
  } catch (err) {
    console.error("[guard questions]", err);
    return {
      ok: false,
      status: err instanceof GuardApiError ? err.status || 502 : 502,
      error: "GUARD_QUESTIONS_FAILED",
      message: err.message || "GUARD questions failed",
    };
  }

  if (row?.submission_id) {
    await appendGuardTimeline(row.submission_id, "guard.questions", {
      count: parsed.questions?.length || 0,
    });
  }

  return {
    ok: true,
    submission_public_id: submissionPublicId || null,
    questions: parsed.questions || [],
  };
}

export async function processGuardQuote(body = {}) {
  const submissionPublicId = body.submission_public_id;
  if (!submissionPublicId) {
    return { ok: false, status: 400, error: "SUBMISSION_REQUIRED" };
  }
  const row = await loadSubmission(submissionPublicId);
  if (!row) return { ok: false, status: 404, error: "SUBMISSION_NOT_FOUND" };
  const session = await loadGuardSession(submissionPublicId);
  const form = formFromSubmission(row);
  const segment = String(session?.segment || row.segment || "")
    .trim()
    .toLowerCase();
  const state = form.state || "CO";
  const blocked = gate(segment, state);
  if (blocked) return blocked;

  const fein = String(body.fein || "").replace(/\D/g, "");
  if (fein.length < 9) {
    return {
      ok: false,
      status: 400,
      error: "FEIN_REQUIRED",
      message: "FEIN is required for a bindable Workers’ Comp quote.",
    };
  }

  const payload = buildRatingPayloadFromForm(form, segment, {
    legalEntityCd: body.legal_entity || session?.legalEntityCd || "LL",
    ownerIncluded: session?.ownerIncluded === true,
    numYrsInBusiness: session?.numYrsInBusiness,
    fein,
    policyNumber: session?.policyNumber || null,
    questionAnswers: Array.isArray(body.answers) ? body.answers : [],
  });

  let parsed;
  try {
    parsed = await guardSubmitNbs(payload);
  } catch (err) {
    console.error("[guard quote]", err);
    return {
      ok: false,
      status: err instanceof GuardApiError ? err.status || 502 : 502,
      error: "GUARD_QUOTE_FAILED",
      message: err.message || "GUARD quote failed",
    };
  }

  const bindable = /QuotedNotBound/i.test(
    String(parsed.policyStatusCd || "").replace(/\s/g, ""),
  );

  const nextSession = {
    ...session,
    purpose: "NBS",
    policyNumber: parsed.policyNumber || session?.policyNumber,
    premium: parsed.fullTermAmt,
    policyStatusCd: parsed.policyStatusCd,
    uwDecision: parsed.uwDecision,
    bindable,
    quotedAt: new Date().toISOString(),
  };
  await persistGuardSession(row.submission_id, nextSession);

  const eventType = bindable
    ? "guard.quoted"
    : String(parsed.uwDecision || "").toLowerCase() === "refer"
      ? "guard.referred"
      : String(parsed.uwDecision || "").toLowerCase() === "reject"
        ? "guard.rejected"
        : "guard.quoted";
  await appendGuardTimeline(row.submission_id, eventType, {
    policyNumber: parsed.policyNumber,
    premium: parsed.fullTermAmt,
    policyStatusCd: parsed.policyStatusCd,
    uwDecision: parsed.uwDecision,
  });

  return {
    ok: true,
    bindable,
    submission_public_id: submissionPublicId,
    guard: {
      policyNumber: parsed.policyNumber,
      premium: parsed.fullTermAmt ? Number(parsed.fullTermAmt) : null,
      policyStatusCd: parsed.policyStatusCd,
      uwDecision: parsed.uwDecision,
      msgStatusCd: parsed.msgStatusCd,
      remarks: parsed.remarks,
      carrier: parsed.carrier,
    },
  };
}

export async function processGuardBind(body = {}) {
  const submissionPublicId = body.submission_public_id;
  if (!submissionPublicId) {
    return { ok: false, status: 400, error: "SUBMISSION_REQUIRED" };
  }
  const row = await loadSubmission(submissionPublicId);
  if (!row) return { ok: false, status: 404, error: "SUBMISSION_NOT_FOUND" };
  const session = await loadGuardSession(submissionPublicId);
  if (!session?.policyNumber) {
    return {
      ok: false,
      status: 400,
      error: "QUOTE_REQUIRED",
      message: "Get a bindable GUARD quote before binding.",
    };
  }
  if (!body.clickwrap_agreed) {
    return {
      ok: false,
      status: 400,
      error: "CLICKWRAP_REQUIRED",
      message: "Please agree to the Workers’ Comp application attestation.",
    };
  }

  const segment = String(session.segment || row.segment || "").toLowerCase();
  const blocked = gate(segment, "CO");
  if (blocked) return blocked;

  let parsed;
  try {
    parsed = await guardBind(session.policyNumber);
  } catch (err) {
    console.error("[guard bind]", err);
    return {
      ok: false,
      status: err instanceof GuardApiError ? err.status || 502 : 502,
      error: "GUARD_BIND_FAILED",
      message: err.message || "GUARD bind failed",
    };
  }

  await persistGuardSession(row.submission_id, {
    ...session,
    purpose: "BND",
    policyStatusCd: parsed.policyStatusCd,
    clickwrap: {
      agreed: true,
      name: body.clickwrap_name || null,
      at: new Date().toISOString(),
    },
    boundAt: new Date().toISOString(),
  });
  await appendGuardTimeline(row.submission_id, "guard.bound", {
    policyNumber: parsed.policyNumber || session.policyNumber,
    policyStatusCd: parsed.policyStatusCd,
    clickwrap_name: body.clickwrap_name || null,
  });

  return {
    ok: true,
    bound: String(parsed.policyStatusCd || "").includes("Bound"),
    submission_public_id: submissionPublicId,
    guard: {
      policyNumber: parsed.policyNumber || session.policyNumber,
      policyStatusCd: parsed.policyStatusCd,
      msgStatusCd: parsed.msgStatusCd,
    },
    message:
      "Workers’ Comp bind sent to GUARD. They bill you directly — CID does not charge a card.",
  };
}
