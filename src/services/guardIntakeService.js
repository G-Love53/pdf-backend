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
  guardSubmitSbr,
  isGuardConfigured,
  isGuardInstantBindable,
  mergeGuardQuestionAnswers,
  normalizeGuardUwDecision,
  yearsInBusinessFromForm,
} from "./guardService.js";
import { finalizeGuardBind } from "./guardPolicyService.js";
import { notifyGuardWcKickout } from "./agentNotificationService.js";
import {
  GUARD_REFER_APPLICANT_MESSAGE,
  buildGuardCapitaPayUrl,
  isGuardCapitaConfigured,
  resolveGuardExperienceMod,
  zipDigits,
} from "../config/guardLaunch.js";

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

export function getGuardOfferConfig(segment, state, businessClass) {
  const entry = getGuardSegmentEntry(segment, businessClass);
  const wcEnabled = isGuardWcEnabledForSegment(segment, businessClass);
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
    referApplicantMessage: GUARD_REFER_APPLICANT_MESSAGE,
    capitaConfigured: isGuardCapitaConfigured(),
  };
}

function contactFromForm(form = {}) {
  const first = form.first_name || form.applicant_first_name || "";
  const last = form.last_name || form.applicant_last_name || "";
  return {
    clientName: [first, last].filter(Boolean).join(" ").trim() || null,
    businessName:
      form.business_name || form.applicant_name || form.insured_name || null,
    email: form.contact_email || form.email || null,
    phone: form.phone || form.contact_phone || form.business_phone || null,
    zip:
      zipDigits(
        form.zip ||
          form.mailing_zip ||
          form.premise_zip ||
          form.businessZip ||
          form.location_zip,
      ) || "",
  };
}

function capitaFrom(row, session, parsed) {
  const form = formFromSubmission(row);
  const { zip } = contactFromForm(form);
  const policyNumber =
    parsed?.policyNumber || session?.policyNumber || null;
  const payUrl = buildGuardCapitaPayUrl({
    customerNumber: policyNumber,
    zip,
  });
  if (!payUrl) return null;
  return { payUrl, customerNumber: policyNumber, policyNumber, zip };
}

async function emailGuardKickout({ row, session, parsed, uw }) {
  if (session?.kickoutEmailedAt) return session;
  const form = formFromSubmission(row);
  const contact = contactFromForm(form);
  try {
    await notifyGuardWcKickout({
      segment: row.segment || session?.parentSegment || session?.segment,
      submissionPublicId: row.submission_public_id,
      clientName: contact.clientName,
      businessName: contact.businessName,
      email: contact.email,
      phone: contact.phone,
      policyNumber: parsed?.policyNumber || session?.policyNumber || null,
      premium: parsed?.fullTermAmt ?? session?.premium ?? null,
      uwDecision: parsed?.uwDecision || uw,
      rqUid: parsed?.rqUid || session?.rqUid || null,
    });
    return { ...session, kickoutEmailedAt: new Date().toISOString() };
  } catch (err) {
    console.error("[guard kickout email]", err.message || err);
    return session;
  }
}

function guardContextFrom(body, row, session) {
  const form = formFromSubmission(row);
  const segment = String(
    body?.segment || session?.segment || form.segment || row?.segment || "",
  )
    .trim()
    .toLowerCase();
  const businessClass =
    body?.business_class ||
    form.business_class ||
    form.businessClass ||
    session?.businessClass ||
    null;
  const line = getGuardSegmentEntry(segment, businessClass);
  const guardLineKey = line?.lineKey || segment;
  return { form, segment, businessClass, line, guardLineKey };
}

function ownerPayrollFrom(body = {}, form = {}) {
  const raw =
    body.owner_payroll ??
    body.ownerPayroll ??
    form.owner_payroll ??
    form.ownerPayroll;
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function applicantQuoteMessage(uw, bindable) {
  if (bindable) {
    return "Your Workers’ Comp quote is ready to bind.";
  }
  if (uw === "refer" || uw === "decline") {
    return GUARD_REFER_APPLICANT_MESSAGE;
  }
  return "This application is not available to bind online.";
}

function gate(segment, state, businessClass) {
  if (!isGuardWcEnabledForSegment(segment, businessClass)) {
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
  const ctx = guardContextFrom(body, row, null);
  const state = ctx.form.premise_state || ctx.form.state || body.state || "CO";
  const blocked = gate(ctx.segment, state, ctx.businessClass);
  if (blocked) return blocked;

  const entry = ctx.line;
  const employees = Number(ctx.form.num_employees || ctx.form.numEmployees || 0);
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

  const ownerPayroll = ownerPayrollFrom(body, ctx.form);
  const rqUid = crypto.randomUUID();
  const numYrsInBusiness =
    Number(body.years_in_business) || yearsInBusinessFromForm(ctx.form);
  const experienceMod = resolveGuardExperienceMod({
    yearsInBusiness: numYrsInBusiness,
    explicit: body.experience_mod ?? body.experienceMod ?? null,
  });
  const payload = buildRatingPayloadFromForm(ctx.form, ctx.guardLineKey, {
    legalEntityCd: body.legal_entity || body.legalEntityCd || "LL",
    ownerIncluded,
    ownerPayroll: ownerIncluded ? ownerPayroll : 0,
    numYrsInBusiness,
    experienceMod,
    ratingClassificationCd:
      body.rating_classification_cd || body.ratingClassificationCd || null,
    rqUid,
  });

  let parsed;
  try {
    parsed = await guardIndicate(payload);
  } catch (err) {
    const rq =
      err instanceof GuardApiError ? err.body?.rqUid || rqUid : rqUid;
    console.error("[guard indicate]", { rqUid: rq, err });
    return {
      ok: false,
      status: err instanceof GuardApiError ? err.status || 502 : 502,
      error: err instanceof GuardApiError ? err.code : "GUARD_INDICATE_FAILED",
      message: err.message || "GUARD indication failed",
      rqUid: rq,
    };
  }

  const session = {
    submission_public_id: submissionPublicId,
    segment: ctx.guardLineKey,
    parentSegment: row.segment,
    businessClass: entry?.businessClass || ctx.businessClass || null,
    purpose: "NBQ",
    rqUid: parsed.rqUid || rqUid,
    ratingClassificationCd: ratingClassificationCd(entry),
    legalEntityCd: payload.legalEntityCd,
    ownerIncluded,
    ownerPayroll: ownerIncluded ? ownerPayroll : 0,
    numYrsInBusiness: payload.numYrsInBusiness,
    experienceMod,
    policyNumber: parsed.policyNumber,
    premium: parsed.fullTermAmt,
    policyStatusCd: parsed.policyStatusCd,
    uwDecision: parsed.uwDecision,
    msgStatusCd: parsed.msgStatusCd,
    requestStatusCd: parsed.requestStatusCd,
    remarks: parsed.remarks,
    indicatedAt: new Date().toISOString(),
  };

  const uw = normalizeGuardUwDecision(parsed.uwDecision);
  const kicked = uw === "refer" || uw === "decline";
  let nextSession = session;
  if (kicked) {
    nextSession = await emailGuardKickout({
      row,
      session,
      parsed,
      uw,
    });
  }
  await persistGuardSession(row.submission_id, nextSession);
  await appendGuardTimeline(
    row.submission_id,
    kicked
      ? uw === "decline"
        ? "guard.rejected"
        : "guard.referred"
      : "guard.indicated",
    {
      rqUid: nextSession.rqUid,
      policyNumber: parsed.policyNumber,
      premium: parsed.fullTermAmt,
      policyStatusCd: parsed.policyStatusCd,
      msgStatusCd: parsed.msgStatusCd,
      uwDecision: parsed.uwDecision,
    },
  );

  const sandbox = getGuardPublicConfig().sandbox;
  const emptyGuard =
    !parsed.fullTermAmt && !parsed.msgStatusCd && !parsed.policyNumber;
  if (emptyGuard) {
    console.warn("[guard indicate] empty NBQ response", {
      rqUid: session.rqUid,
      ratingClassificationCd: session.ratingClassificationCd,
      signonStatusCd: parsed.signonStatusCd,
      soapFault: parsed.soapFault,
      rawPreview: parsed.raw?.slice(0, 800),
    });
  }

  return {
    ok: true,
    bindable: false,
    indication: true,
    decision: uw || "",
    popup: kicked,
    canContinue: !kicked,
    message: kicked
      ? GUARD_REFER_APPLICANT_MESSAGE
      : undefined,
    submission_public_id: submissionPublicId,
    guard: {
      rqUid: nextSession.rqUid,
      policyNumber: parsed.policyNumber,
      premium: parsed.fullTermAmt ? Number(parsed.fullTermAmt) : null,
      policyStatusCd: parsed.policyStatusCd,
      uwDecision: parsed.uwDecision,
      msgStatusCd: parsed.msgStatusCd,
      requestStatusCd: parsed.requestStatusCd,
      signonStatusCd: parsed.signonStatusCd,
      remarks: parsed.remarks,
      ...(sandbox && emptyGuard
        ? {
            debug: {
              ratingClassificationCd: session.ratingClassificationCd,
              soapFault: parsed.soapFault,
              rawPreview: parsed.raw?.slice(0, 1200),
            },
          }
        : {}),
    },
    ...(kicked
      ? {}
      : {
          disclaimer:
            "Indication only — not bindable until underwriting questions and FEIN are submitted.",
        }),
  };
}

export async function processGuardQuestions(body = {}) {
  const submissionPublicId = body.submission_public_id;
  const row = submissionPublicId ? await loadSubmission(submissionPublicId) : null;
  const session = submissionPublicId
    ? await loadGuardSession(submissionPublicId)
    : null;
  const ctx = guardContextFrom(body, row, session);
  const state = ctx.form.premise_state || ctx.form.state || body.state || "CO";
  const blocked = gate(ctx.segment, state, ctx.businessClass);
  if (blocked) return blocked;

  const entry = ctx.line;
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
  const ctx = guardContextFrom(body, row, session);
  const state = ctx.form.premise_state || ctx.form.state || "CO";
  const blocked = gate(ctx.segment, state, ctx.businessClass);
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

  const experienceMod = resolveGuardExperienceMod({
    yearsInBusiness: session?.numYrsInBusiness,
    explicit:
      body.experience_mod ??
      body.experienceMod ??
      session?.experienceMod ??
      null,
  });

  const payload = buildRatingPayloadFromForm(ctx.form, ctx.guardLineKey, {
    legalEntityCd: body.legal_entity || session?.legalEntityCd || "LL",
    ownerIncluded: session?.ownerIncluded === true,
    numYrsInBusiness: session?.numYrsInBusiness,
    experienceMod,
    ratingClassificationCd:
      body.rating_classification_cd ||
      body.ratingClassificationCd ||
      session?.ratingClassificationCd ||
      null,
    fein,
    ownerPayroll:
      session?.ownerIncluded === true
        ? ownerPayrollFrom(body, ctx.form) ?? session?.ownerPayroll ?? null
        : 0,
    policyNumber: session?.policyNumber || null,
    questionAnswers: mergeGuardQuestionAnswers(
      Array.isArray(body.answers) ? body.answers : [],
    ),
  });

  let parsed;
  try {
    parsed = await guardSubmitNbs(payload);
  } catch (err) {
    const body = err instanceof GuardApiError ? err.body : null;
    console.error("[guard quote]", err);
    return {
      ok: false,
      status: err instanceof GuardApiError ? err.status || 502 : 502,
      error: err instanceof GuardApiError ? err.code : "GUARD_QUOTE_FAILED",
      message: err.message || "GUARD quote failed",
      rqUid: body?.rqUid || null,
      guard: body
        ? {
            rqUid: body.rqUid,
            msgStatusCd: body.msgStatusCd,
            msgErrorCd: body.msgErrorCd,
            msgStatusDesc: body.msgStatusDesc,
          }
        : null,
    };
  }

  const bindable = isGuardInstantBindable(parsed);
  const uw = normalizeGuardUwDecision(parsed.uwDecision);

  let nextSession = {
    ...session,
    purpose: "NBS",
    policyNumber: parsed.policyNumber || session?.policyNumber,
    premium: parsed.fullTermAmt,
    policyStatusCd: parsed.policyStatusCd,
    uwDecision: parsed.uwDecision,
    experienceMod,
    bindable,
    quotedAt: new Date().toISOString(),
  };
  if (!bindable && (uw === "refer" || uw === "decline")) {
    nextSession = await emailGuardKickout({
      row,
      session: nextSession,
      parsed,
      uw,
    });
  }
  await persistGuardSession(row.submission_id, nextSession);

  const eventType = bindable
    ? "guard.quoted"
    : uw === "refer"
      ? "guard.referred"
      : uw === "decline"
        ? "guard.rejected"
        : "guard.quoted";
  await appendGuardTimeline(row.submission_id, eventType, {
    policyNumber: parsed.policyNumber,
    premium: parsed.fullTermAmt,
    policyStatusCd: parsed.policyStatusCd,
    uwDecision: parsed.uwDecision,
    rqUid: parsed.rqUid,
  });

  const capita = bindable ? capitaFrom(row, nextSession, parsed) : null;

  return {
    ok: true,
    bindable,
    decision: uw || (bindable ? "accept" : ""),
    canRefer: uw === "refer" && Boolean(parsed.policyNumber || session?.policyNumber),
    message: applicantQuoteMessage(uw, bindable),
    popup: !bindable && (uw === "refer" || uw === "decline"),
    submission_public_id: submissionPublicId,
    guard: {
      policyNumber: parsed.policyNumber,
      premium: parsed.fullTermAmt ? Number(parsed.fullTermAmt) : null,
      policyStatusCd: parsed.policyStatusCd,
      uwDecision: parsed.uwDecision,
      msgStatusCd: parsed.msgStatusCd,
      remarks: parsed.remarks,
      carrier: parsed.carrier,
      rqUid: parsed.rqUid,
    },
    ...(capita ? { capita } : {}),
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
  const sessionUw = normalizeGuardUwDecision(session.uwDecision);
  if (session.bindable === false || sessionUw === "refer" || sessionUw === "decline") {
    return {
      ok: false,
      status: 400,
      error: "NOT_BINDABLE",
      message:
        sessionUw === "refer"
          ? "This application was referred to underwriting and cannot be bound online."
          : "This application is not available to bind.",
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

  const ctx = guardContextFrom(body, row, session);
  const blocked = gate(ctx.segment, "CO", ctx.businessClass);
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

  const bound = String(parsed.policyStatusCd || "").includes("Bound");
  let connectPolicy = null;
  if (bound) {
    try {
      const fin = await finalizeGuardBind({
        submissionPublicId,
        session: {
          ...session,
          clickwrap: {
            agreed: true,
            name: body.clickwrap_name || null,
            at: new Date().toISOString(),
          },
        },
        parsed,
        clickwrapName: body.clickwrap_name || null,
      });
      if (fin.ok) {
        connectPolicy = {
          policy_id: fin.policy_id,
          policy_number: fin.policy_number,
        };
      } else {
        console.warn("[guard bind] Connect policy skipped", fin);
      }
    } catch (err) {
      console.error("[guard bind] Connect policy create failed", err);
    }
  }

  const capita = bound ? capitaFrom(row, session, parsed) : null;

  return {
    ok: true,
    bound,
    submission_public_id: submissionPublicId,
    guard: {
      policyNumber: parsed.policyNumber || session.policyNumber,
      policyStatusCd: parsed.policyStatusCd,
      msgStatusCd: parsed.msgStatusCd,
    },
    connect: connectPolicy,
    ...(capita ? { capita } : {}),
    message: capita
      ? "Workers’ Comp bound with GUARD. Pay with GUARD / Capita — CID does not collect the card."
      : "Workers’ Comp bound with GUARD. Payment is through GUARD — CID does not collect the card.",
  };
}

export async function processGuardRefer(body = {}) {
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
      message: "Submit the application before sending it to underwriting.",
    };
  }

  const ctx = guardContextFrom(body, row, session);
  const blocked = gate(ctx.segment, "CO", ctx.businessClass);
  if (blocked) return blocked;

  let parsed;
  try {
    parsed = await guardSubmitSbr(session.policyNumber);
  } catch (err) {
    console.error("[guard refer]", err);
    return {
      ok: false,
      status: err instanceof GuardApiError ? err.status || 502 : 502,
      error: "GUARD_REFER_FAILED",
      message: err.message || "Could not send this application to underwriting.",
    };
  }

  const emailed = await emailGuardKickout({
    row,
    session: {
      ...session,
      purpose: "SBR",
      policyStatusCd: parsed.policyStatusCd || session.policyStatusCd,
      referredAt: new Date().toISOString(),
    },
    parsed: {
      ...parsed,
      policyNumber: parsed.policyNumber || session.policyNumber,
    },
    uw: "refer",
  });
  await persistGuardSession(row.submission_id, {
    ...session,
    purpose: "SBR",
    policyStatusCd: parsed.policyStatusCd || session.policyStatusCd,
    referredAt: new Date().toISOString(),
    kickoutEmailedAt: emailed?.kickoutEmailedAt || session.kickoutEmailedAt,
  });
  await appendGuardTimeline(row.submission_id, "guard.sbr", {
    policyNumber: parsed.policyNumber || session.policyNumber,
    policyStatusCd: parsed.policyStatusCd,
    rqUid: parsed.rqUid,
  });

  return {
    ok: true,
    referred: true,
    popup: true,
    submission_public_id: submissionPublicId,
    guard: {
      policyNumber: parsed.policyNumber || session.policyNumber,
      policyStatusCd: parsed.policyStatusCd,
      msgStatusCd: parsed.msgStatusCd,
      rqUid: parsed.rqUid,
    },
    message: GUARD_REFER_APPLICANT_MESSAGE,
  };
}
