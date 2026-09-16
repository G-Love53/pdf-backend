import { recordSubmission } from "../db.js";
import { guardDbSegmentFromLine } from "../config/guardRegistry.js";
import {
  GUARD_DEFAULT_ACORD_ANSWERS,
  buildRatingPayloadFromForm,
  guardFetchQuestions,
  guardIndicate,
  guardSubmitNbs,
  isGuardConfigured,
  mergeGuardQuestionAnswers,
} from "./guardService.js";

const PARTNER_SOURCE = "guard-uat";

function fakeFein(caseId) {
  let h = 0;
  for (const c of String(caseId)) h = (h * 31 + c.charCodeAt(0)) % 1000000000;
  const base = 200000000 + (h % 700000000);
  return String(base).padStart(9, "0").slice(0, 9);
}

function uniqueBusinessName(caseDef) {
  const slug = String(caseDef.id || "uat").replace(/[^a-zA-Z0-9]/g, "");
  return `CID UAT ${slug} ${Date.now().toString(36).slice(-4)}`.slice(0, 40);
}

function acordOverrides(caseDef) {
  const overrides = [];
  if (caseDef.acordFavorable === false) {
    if (
      (caseDef.expectedReason &&
        /hazardous material/i.test(caseDef.expectedReason)) ||
      (caseDef.expectedOutcome === "Refer" &&
        !(caseDef.questions || []).length)
    ) {
      overrides.push({
        questionCd: "com.guard_QUESTIONPPDOPERATIONS",
        response: "Y",
      });
    }
    if (
      caseDef.expectedReason &&
      /temporary staffing|leased employees|cash\/casual/i.test(
        caseDef.expectedReason,
      )
    ) {
      overrides.push({
        questionCd: "com.guard_QUESTIONTEMPSTAFFCASHLABOR",
        response: "Y",
      });
    }
    if (
      caseDef.expectedReason &&
      /own more than 50%/i.test(caseDef.expectedReason)
    ) {
      overrides.push({
        questionCd: "com.guard_QUESTIONOWNMORETHANHALF",
        response: "Y",
      });
    }
  }
  return overrides;
}

function matchQuestionAnswer(guardQ, uatAnswer) {
  const want = String(uatAnswer || "").trim().toLowerCase();
  if (!guardQ?.options?.length) {
    if (want.startsWith("y")) return "Y";
    if (want.startsWith("n")) return "N";
    return uatAnswer;
  }
  for (const opt of guardQ.options) {
    const val = String(opt.value || "").toLowerCase();
    const lab = String(opt.label || "").toLowerCase();
    if (want === "yes" && (val === "y" || val === "yes" || lab.startsWith("yes")))
      return opt.value;
    if (want === "no" && (val === "n" || val === "no" || lab.startsWith("no")))
      return opt.value;
  }
  return ynToSimple(uatAnswer);
}

function ynToSimple(text) {
  const t = String(text || "").trim().toLowerCase();
  if (t === "yes") return "Y";
  if (t === "no") return "N";
  return text;
}

function matchUatQuestions(guardQuestions, uatQuestions) {
  const answers = [];
  for (const uq of uatQuestions || []) {
    const needle = String(uq.text || "").toLowerCase();
    const gq = (guardQuestions || []).find((q) => {
      const hay = String(q.questionText || "").toLowerCase();
      return hay.includes(needle) || needle.includes(hay.slice(0, 30));
    });
    if (!gq) {
      answers.push({ _unmatched: uq.text, answer: uq.answer });
      continue;
    }
    const response = matchQuestionAnswer(gq, uq.answer);
    if (gq.options?.length) {
      answers.push({ questionCd: gq.questionCd, response });
    } else if (String(gq.type || "").toLowerCase() === "number") {
      answers.push({ questionCd: gq.questionCd, num: String(response) });
    } else {
      answers.push({ questionCd: gq.questionCd, response: String(response) });
    }
  }
  return answers;
}

function classifyOutcome(parsed, expectedOutcome) {
  const uw = String(parsed?.uwDecision || "").toLowerCase();
  const status = String(parsed?.policyStatusCd || "").replace(/\s/g, "");
  const bindable = /QuotedNotBound/i.test(status);
  const exp = String(expectedOutcome || "").toLowerCase();

  let actual = "unknown";
  if (bindable && uw !== "reject" && uw !== "refer") actual = "quote";
  else if (uw === "refer" || uw.includes("refer")) actual = "refer";
  else if (uw === "reject" || uw.includes("declin") || uw.includes("reject"))
    actual = "decline";
  else if (!bindable && parsed?.fullTermAmt) actual = "quote";
  else if (parsed?.msgStatusCd?.toLowerCase() === "error") actual = "error";

  const pass =
    (exp === "quote" && actual === "quote") ||
    (exp === "refer" && actual === "refer") ||
    (exp === "decline" && actual === "decline");

  return { actual, pass, bindable };
}

function buildForm(caseDef) {
  const addr = caseDef.address || {};
  const payroll = Number(caseDef.payroll || 150000);
  const employees =
    caseDef.questions?.some((q) => /five \(5\)|5 full time|5 w2/i.test(q.text)) ||
    payroll >= 100000
      ? 6
      : caseDef.questions?.some((q) => /3 w2|three/i.test(q.text))
        ? 4
        : 2;

  return {
    segment: caseDef.segment,
    state: addr.state || "CO",
    first_name: "UAT",
    last_name: "Tester",
    contact_email: `guard-uat+${caseDef.id}@commercialinsurance-direct.com`,
    phone: "3039321700",
    insured_name: uniqueBusinessName(caseDef),
    premise_street: addr.street || "123 Main St",
    premise_city: addr.city || "Denver",
    premise_state: addr.state || "CO",
    premise_zip: addr.zip || "80202",
    street: `${addr.street || "123 Main St"} Mailing`,
    city: addr.city || "Denver",
    zip: addr.zip || "80203",
    num_employees: employees,
    annual_payroll: payroll,
    years_in_business: 5,
    traffic_source: PARTNER_SOURCE,
    campaign_id: "guard-uat-v1",
    uat_case_id: caseDef.id,
    rating_classification_cd: caseDef.ratingClassificationCd,
  };
}

export async function runGuardUatCase(caseDef) {
  if (!isGuardConfigured()) {
    return {
      ok: false,
      error: "GUARD_NOT_CONFIGURED",
      message: "GUARD API env is not set on this service.",
    };
  }

  const form = buildForm(caseDef);
  const dbSegment = guardDbSegmentFromLine(caseDef.segment);
  const ownerIncluded = caseDef.ownerIncluded === true;
  let ownerPayroll = 73900;
  if (caseDef.notes?.some((n) => /75000|75,000/.test(n))) {
    ownerPayroll = 75000;
  }

  const dbResult = await recordSubmission({
    segment: dbSegment,
    sourceDomain: "guard-uat",
    sourceForm: PARTNER_SOURCE,
    rawSubmission: form,
    primaryEmail: form.contact_email,
    primaryPhone: form.phone,
    firstName: form.first_name,
    lastName: form.last_name,
    notifyAgent: false,
  });

  if (!dbResult?.submissionPublicId) {
    return { ok: false, error: "SUBMISSION_FAILED" };
  }

  const submissionPublicId = dbResult.submissionPublicId;
  const lineKey = caseDef.segment;

  const indicatePayload = buildRatingPayloadFromForm(form, lineKey, {
    legalEntityCd: caseDef.entity || "LL",
    ownerIncluded,
    ownerPayroll: ownerIncluded ? ownerPayroll : 0,
    numYrsInBusiness: 5,
    experienceMod: caseDef.experienceMod ?? null,
    ratingClassificationCd: caseDef.ratingClassificationCd,
    exposure: ownerIncluded ? payroll + ownerPayroll : payroll,
  });

  let indicateParsed;
  try {
    indicateParsed = await guardIndicate(indicatePayload);
  } catch (err) {
    return {
      ok: false,
      caseId: caseDef.id,
      submission_public_id: submissionPublicId,
      phase: "indicate",
      error: err.message || String(err),
      rqUid: indicatePayload.rqUid,
    };
  }

  let questionsParsed;
  try {
    questionsParsed = await guardFetchQuestions({
      state: form.premise_state,
      ratingClassificationCd: caseDef.ratingClassificationCd,
    });
  } catch (err) {
    return {
      ok: false,
      caseId: caseDef.id,
      submission_public_id: submissionPublicId,
      phase: "questions",
      error: err.message || String(err),
      indicate: {
        rqUid: indicateParsed.rqUid,
        policyNumber: indicateParsed.policyNumber,
      },
    };
  }

  const classAnswers = matchUatQuestions(
    questionsParsed.questions,
    caseDef.questions,
  );
  const unmatched = classAnswers.filter((a) => a._unmatched);
  const matched = classAnswers.filter((a) => a.questionCd);

  const questionAnswers = mergeGuardQuestionAnswers([
    ...acordOverrides(caseDef),
    ...matched,
  ]);

  const nbsPayload = buildRatingPayloadFromForm(form, lineKey, {
    legalEntityCd: caseDef.entity || "LL",
    ownerIncluded,
    ownerPayroll: ownerIncluded ? ownerPayroll : 0,
    numYrsInBusiness: 5,
    experienceMod: caseDef.experienceMod ?? null,
    ratingClassificationCd: caseDef.ratingClassificationCd,
    exposure: ownerIncluded ? payroll + ownerPayroll : payroll,
    fein: fakeFein(caseDef.id),
    policyNumber: indicateParsed.policyNumber || null,
    questionAnswers,
  });

  let nbsParsed;
  try {
    nbsParsed = await guardSubmitNbs(nbsPayload);
  } catch (err) {
    return {
      ok: false,
      caseId: caseDef.id,
      submission_public_id: submissionPublicId,
      phase: "nbs",
      error: err.message || String(err),
      body: err.body || null,
      indicate: {
        rqUid: indicateParsed.rqUid,
        policyNumber: indicateParsed.policyNumber,
      },
      unmatchedQuestions: unmatched,
    };
  }

  const outcome = classifyOutcome(nbsParsed, caseDef.expectedOutcome);
  const exModSent = caseDef.experienceMod ?? null;
  const exModReturned = nbsParsed.experienceMod
    ? Number(nbsParsed.experienceMod)
    : null;
  const exModPass =
    exModSent == null ||
    exModReturned == null ||
    Math.abs(exModReturned - Number(exModSent)) < 0.011;

  return {
    ok: true,
    caseId: caseDef.id,
    sheet: caseDef.sheet,
    number: caseDef.number,
    expectedOutcome: caseDef.expectedOutcome,
    submission_public_id: submissionPublicId,
    pass: outcome.pass && exModPass && unmatched.length === 0,
    outcome,
    experienceMod: {
      sent: exModSent,
      returned: exModReturned,
      pass: exModPass,
    },
    unmatchedQuestions: unmatched.map((u) => u._unmatched),
    guard: {
      indicateRqUid: indicateParsed.rqUid,
      nbsRqUid: nbsParsed.rqUid,
      policyNumber: nbsParsed.policyNumber || indicateParsed.policyNumber,
      premium: nbsParsed.fullTermAmt ? Number(nbsParsed.fullTermAmt) : null,
      policyStatusCd: nbsParsed.policyStatusCd,
      uwDecision: nbsParsed.uwDecision,
      msgStatusCd: nbsParsed.msgStatusCd,
      remarks: nbsParsed.remarks,
    },
    acordDefaultsUsed: GUARD_DEFAULT_ACORD_ANSWERS.length,
    classQuestionsAnswered: matched.length,
  };
}

export async function runGuardUatPack(cases, { limit = null, ids = null } = {}) {
  let list = cases || [];
  if (ids?.length) {
    const set = new Set(ids);
    list = list.filter((c) => set.has(c.id));
  }
  if (limit != null) list = list.slice(0, limit);

  const results = [];
  for (const caseDef of list) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runGuardUatCase(caseDef);
    results.push(result);
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => r.ok && !r.pass).length,
    errors: results.filter((r) => !r.ok).length,
  };

  return { ok: true, summary, results };
}
