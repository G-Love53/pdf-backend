import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordSubmission } from "../db.js";
import {
  GUARD_CO_OFFICER_PAYROLL,
  guardDbSegmentFromLine,
} from "../config/guardRegistry.js";
import {
  GUARD_DEFAULT_ACORD_ANSWERS,
  buildRatingPayloadFromForm,
  guardFetchQuestions,
  guardIndicate,
  guardSubmitNbs,
  isGuardConfigured,
  mergeGuardQuestionAnswers,
  normalizeWorkCompLocations,
} from "./guardService.js";

const PARTNER_SOURCE = "guard-uat";

const __dirname = dirname(fileURLToPath(import.meta.url));
let questionIndex = null;

function loadQuestionIndex() {
  if (questionIndex) return questionIndex;
  try {
    const raw = readFileSync(
      join(__dirname, "../../data/guard-question-index.json"),
      "utf8",
    );
    questionIndex = JSON.parse(raw).questions || [];
  } catch {
    questionIndex = [];
  }
  return questionIndex;
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function classPrefixFromRating(ratingClassificationCd) {
  const raw = String(ratingClassificationCd || "").replace(/\D/g, "");
  if (raw.length >= 4) return raw.slice(0, 4);
  return null;
}

/** Prefer CO class codes (`5183_01`) over other states (`5183CA01`, `9014MA01`). */
function pickQuestionRowForState(scoped, classPrefix, state) {
  if (!scoped.length) return null;
  if (state === "CO" && classPrefix) {
    const coUnderscore = scoped.find((row) =>
      String(row.questionId || "").includes(`${classPrefix}_`),
    );
    if (coUnderscore) return coUnderscore;
    const notOtherState = scoped.filter((row) => {
      const id = String(row.questionId || "");
      return !new RegExp(`${classPrefix}[A-Z]{2}\\d`, "i").test(id);
    });
    if (notOtherState.length) return notOtherState[0];
  }
  return scoped[0];
}

function isCoAppropriateQuestionCd(questionCd, classPrefix, state = "CO") {
  if (state !== "CO" || !classPrefix) return true;
  const cd = String(questionCd || "");
  if (!cd.includes(classPrefix)) return false;
  if (cd.includes(`${classPrefix}_`)) return true;
  if (new RegExp(`${classPrefix}[A-Z]{2}`, "i").test(cd)) return false;
  return true;
}

function lookupQuestionCd(text, ratingClassificationCd, state = "CO") {
  const needle = normText(text);
  if (!needle) return null;
  const index = loadQuestionIndex();
  const classPrefix = classPrefixFromRating(ratingClassificationCd);
  const matches = [];
  for (const row of index) {
    const hay = normText(row.text);
    if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
      matches.push(row);
    }
  }
  if (!matches.length) return null;
  if (classPrefix) {
    const scoped = matches.filter((row) =>
      String(row.questionId || "").includes(classPrefix),
    );
    const picked = pickQuestionRowForState(scoped, classPrefix, state);
    if (picked) return picked.questionCd;
  }
  return matches[0].questionCd;
}

function controllingState(caseDef) {
  return (
    caseDef?.address?.state ||
    caseDef?.addresses?.[0]?.state ||
    "CO"
  ).toUpperCase();
}

function findGuardQuestion(guardQuestions, uatText, classPrefix, state) {
  const needle = String(uatText || "").toLowerCase();
  const candidates = (guardQuestions || []).filter((q) => {
    if (!isCoAppropriateQuestionCd(q.questionCd, classPrefix, state)) return false;
    const hay = String(q.questionText || "").toLowerCase();
    return hay.includes(needle) || needle.includes(hay.slice(0, 40));
  });
  const exact = candidates.find(
    (q) => normText(q.questionText) === normText(uatText),
  );
  return exact || candidates[0] || null;
}

function fakeFein(caseId) {
  let h = 0;
  for (const c of String(caseId)) h = (h * 31 + c.charCodeAt(0)) % 1000000000;
  const base = 200000000 + (h % 700000000);
  return String(base).padStart(9, "0").slice(0, 9);
}

function uniqueBusinessName(caseDef) {
  const slug = String(caseDef.id || "uat").replace(/[^a-zA-Z0-9]/g, "");
  const nonce = crypto.randomUUID().slice(0, 8);
  return `CID UAT ${slug} ${nonce}`.slice(0, 40);
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

function matchUatQuestions(guardQuestions, uatQuestions, caseDef) {
  const answers = [];
  const state = controllingState(caseDef);
  const classPrefix = classPrefixFromRating(caseDef?.ratingClassificationCd);
  for (const uq of uatQuestions || []) {
    let gq = findGuardQuestion(
      guardQuestions,
      uq.text,
      classPrefix,
      state,
    );
    let questionCd =
      gq?.questionCd ||
      lookupQuestionCd(uq.text, caseDef?.ratingClassificationCd, state);
    if (!questionCd) {
      answers.push({ _unmatched: uq.text, answer: uq.answer });
      continue;
    }
    if (!gq) {
      gq = { questionCd, options: [{ value: "Y" }, { value: "N" }] };
    }
    const response = matchQuestionAnswer(gq, uq.answer);
    if (gq.options?.length) {
      answers.push({ questionCd, response });
    } else if (String(gq.type || "").toLowerCase() === "number") {
      answers.push({ questionCd, num: String(response) });
    } else {
      answers.push({ questionCd, response: String(response) });
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

function caseAddresses(caseDef) {
  if (Array.isArray(caseDef.addresses) && caseDef.addresses.length) {
    return caseDef.addresses;
  }
  if (caseDef.address) return [caseDef.address];
  return [{ street: "123 Main St", city: "Denver", state: "CO", zip: "80202" }];
}

function buildForm(caseDef) {
  const addrs = caseAddresses(caseDef);
  const primary = addrs[0] || {};
  const payroll = Number(caseDef.payroll || 150000);
  const has5w2 = caseDef.questions?.some((q) =>
    /five \(5\)|5 full time|5 w2/i.test(q.text),
  );
  const has3w2 = caseDef.questions?.some((q) => /3 w2|three/i.test(q.text));
  const employees = has5w2 ? 6 : has3w2 ? 4 : payroll >= 100000 ? 6 : 2;

  const locations = addrs.map((addr, index) => ({
    id: `L${index + 1}`,
    street: addr.street || "123 Main St",
    city: addr.city || "Denver",
    state: addr.state || "CO",
    zip: addr.zip || "80202",
    locationAddr2: `Loc ${index + 1}`,
    ratingClassificationCd: caseDef.ratingClassificationCd,
  }));

  return {
    segment: caseDef.segment,
    state: primary.state || "CO",
    first_name: "UAT",
    last_name: "Tester",
    contact_email: `guard-uat+${caseDef.id}@commercialinsurance-direct.com`,
    phone: "3039321700",
    insured_name: uniqueBusinessName(caseDef),
    premise_street: primary.street || "123 Main St",
    premise_city: primary.city || "Denver",
    premise_state: primary.state || "CO",
    premise_zip: primary.zip || "80202",
    street: `${primary.street || "123 Main St"} Mailing`,
    city: primary.city || "Denver",
    zip: primary.zip || "80203",
    locations,
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
  const payroll = Number(caseDef.payroll || form.annual_payroll || 150000);
  const dbSegment = guardDbSegmentFromLine(caseDef.segment);
  const ownerIncluded = caseDef.ownerIncluded === true;
  let ownerPayroll = caseDef.ownerPayroll ?? null;
  if (ownerPayroll == null && caseDef.notes?.some((n) => /75000|75,000/.test(n))) {
    ownerPayroll = 75000;
  }
  if (ownerIncluded && ownerPayroll == null) {
    ownerPayroll = GUARD_CO_OFFICER_PAYROLL;
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
    caseDef,
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
    classQuestionCds: matched.map((a) => a.questionCd),
    ownerPayrollSent: ownerIncluded ? ownerPayroll : 0,
    locations: normalizeWorkCompLocations(nbsPayload).map((loc) => ({
      id: loc.id,
      street: loc.street,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      exposure: loc.exposure,
      numEmployeesFullTime: loc.numEmployeesFullTime,
    })),
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
