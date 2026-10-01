/**
 * Classify GUARD Refer/Reject for agent follow-up.
 * Applicant copy stays generic — never put these hints in the insured popup.
 *
 * Sources, in order of usefulness:
 * 1. Encoding / test mistakes (Yes vs Y, years consecutive 0)
 * 2. Known ACORD appetite answers (temp labor, hazmat, etc.)
 * 3. Class-level Y answers (15 ft, commercial, roof)
 * 4. GUARD RemarkText / MsgStatusDesc
 * 5. Unknown — Digital Decision with no reason text
 */

const ACORD_APPETITE = [
  {
    match: /TEMPSTAFFCASHLABOR|TEMPSTAFFEMPLOYERORG/i,
    kind: "appetite",
    expected: "decline",
    label: "Temp / leased / cash labor",
    hint: "Appetite knockout: temp or leased labor. If they meant W-2 employees, re-run NBS with No.",
  },
  {
    match: /VOLUNTEERLABOR/i,
    kind: "appetite",
    expected: "refer",
    label: "Volunteer labor",
    hint: "Appetite: volunteer labor usually Refer.",
  },
  {
    match: /PPDOPERATIONS/i,
    kind: "appetite",
    expected: "refer",
    label: "Hazardous material / PPD operations",
    hint: "Appetite: hazardous-material operations usually Refer.",
  },
  {
    match: /AIRCRAFTWATERCRAFT/i,
    kind: "appetite",
    expected: "refer",
    label: "Aircraft / watercraft",
    hint: "Appetite: aircraft or watercraft usually Refer.",
  },
  {
    match: /SUBCONTRACTWORK/i,
    kind: "appetite",
    expected: "refer",
    label: "Subcontract work",
    hint: "Appetite: subcontract work (often >10%) usually Refer.",
  },
  {
    match: /TRANSPORTFIVEORMORE/i,
    kind: "appetite",
    expected: "refer",
    label: "Transport 5+ employees",
    hint: "Appetite: transporting 5+ employees usually Refer.",
  },
  {
    match: /OWNMORETHANHALF/i,
    kind: "appetite",
    expected: "refer",
    label: "Owns >50% of another business",
    hint: "Appetite: other-business ownership usually Refer.",
  },
];

const KNOWN_ACORD =
  /YEARSCONSECUTIVECOVERAGE|QUESTIONOWNMORETHANHALF|QUESTIONTEMPSTAFF|QUESTIONVOLUNTEERLABOR|QUESTIONPPDOPERATIONS|QUESTIONAIRCRAFTWATERCRAFT|QUESTIONSUBCONTRACTWORK|QUESTIONTRANSPORTFIVEORMORE|QUESTIONFRAUDDISCLAIMER/i;

function answerValue(raw) {
  if (raw == null) return "";
  if (typeof raw === "object") {
    if (raw.num != null && raw.num !== "") return String(raw.num);
    return String(raw.response ?? raw.answer ?? "");
  }
  return String(raw);
}

function isYes(val) {
  const s = String(val || "").trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

function isFullWordYn(val) {
  const s = String(val || "").trim().toLowerCase();
  return s === "yes" || s === "no";
}

function remarksList(parsed) {
  const raw = parsed?.remarks;
  if (Array.isArray(raw)) {
    return raw.map((r) => String(r || "").trim()).filter(Boolean);
  }
  if (raw) return [String(raw).trim()].filter(Boolean);
  return [];
}

function findAppetiteRule(questionCd) {
  const cd = String(questionCd || "");
  return ACORD_APPETITE.find((rule) => rule.match.test(cd)) || null;
}

/**
 * @param {object} opts
 * @param {object} [opts.parsed] GUARD SOAP parse
 * @param {Array} [opts.answers] NBS answers (questionCd + response/num)
 * @param {string} [opts.purpose] NBQ | NBS
 * @param {string} [opts.uwDecision]
 * @param {string} [opts.digitalDecisionNote]
 */
export function explainGuardKickout(opts = {}) {
  const parsed = opts.parsed || {};
  const answers = Array.isArray(opts.answers) ? opts.answers : [];
  const purpose = String(opts.purpose || "").toUpperCase() || "NBQ";
  const remarks = remarksList(parsed);
  const msgStatusDesc = String(parsed.msgStatusDesc || "").trim();
  const flags = [];

  for (const a of answers) {
    const cd = String(a?.questionCd || "").trim();
    if (!cd) continue;
    const value = answerValue(a);
    if (!value) continue;

    if (isFullWordYn(value)) {
      flags.push({
        kind: "possible_mistake",
        questionCd: cd,
        value,
        label: "Answer sent as Yes/No instead of Y/N",
        hint: "Possible encoding mistake. GUARD expects Y or N. Re-submit with Y/N.",
      });
    }

    if (/YEARSCONSECUTIVECOVERAGE/i.test(cd)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        flags.push({
          kind: "possible_mistake",
          questionCd: cd,
          value,
          label: "Years consecutive coverage is 0 or blank",
          hint: "Possible test/intake mistake. Favorable NBS uses 5 years consecutive.",
        });
      }
    }

    if (/QUESTIONFRAUDDISCLAIMER/i.test(cd) && !isYes(value)) {
      flags.push({
        kind: "possible_mistake",
        questionCd: cd,
        value,
        label: "Fraud / I Agree not Yes",
        hint: "Application attestation was not Y. Confirm they checked I Agree.",
      });
    }

    const rule = findAppetiteRule(cd);
    if (rule && isYes(value)) {
      flags.push({
        kind: rule.kind,
        questionCd: cd,
        value,
        label: rule.label,
        hint: rule.hint,
        expected: rule.expected,
      });
    } else if (!KNOWN_ACORD.test(cd) && isYes(value)) {
      flags.push({
        kind: "appetite",
        questionCd: cd,
        value,
        label: "Class underwriting question = Yes",
        hint:
          "Class-level Yes (15 ft, commercial, roof, etc.). Check the question text against GUARD appetite.",
      });
    }
  }

  const mistake = flags.filter((f) => f.kind === "possible_mistake");
  const appetite = flags.filter((f) => f.kind === "appetite");
  const carrierText = remarks[0] || msgStatusDesc || "";

  let category = "unknown";
  const hintParts = [];
  if (mistake.length) {
    category = "possible_mistake";
    hintParts.push(mistake[0].hint);
  }
  if (appetite.length) {
    if (category === "unknown") category = "appetite";
    hintParts.push(appetite[0].hint);
    const labels = [...new Set(appetite.map((f) => f.label))];
    hintParts.push(`Tripped: ${labels.join("; ")}.`);
  }
  if (carrierText) {
    if (category === "unknown") category = "carrier";
    hintParts.push(`GUARD: ${carrierText}`);
  }
  if (purpose === "NBQ" && opts.digitalDecisionNote) {
    hintParts.push(`Class note: ${opts.digitalDecisionNote}`);
  }
  if (!hintParts.length) {
    hintParts.push(
      purpose === "NBQ"
        ? "Indication Reject/Refer with no reason text. Class or identity may be out of Digital Decision — send RqUID to GUARD if this was a real applicant."
        : "Application Reject/Refer with no reason text and no known knockout answers. Send RqUID + policy number to GUARD if this was a real applicant.",
    );
  }

  return {
    category,
    purpose,
    followUpHint: hintParts.join(" "),
    flags,
    remarks,
    msgStatusDesc: msgStatusDesc || null,
    policyStatusCd: parsed.policyStatusCd || null,
  };
}

export function kickoutTimelinePayload(parsed, explain) {
  const e = explain || {};
  return {
    purpose: e.purpose || null,
    rqUid: parsed?.rqUid || null,
    policyNumber: parsed?.policyNumber || null,
    premium: parsed?.fullTermAmt ?? null,
    policyStatusCd: parsed?.policyStatusCd || e.policyStatusCd || null,
    uwDecision: parsed?.uwDecision || null,
    msgStatusCd: parsed?.msgStatusCd || null,
    msgStatusDesc: e.msgStatusDesc || parsed?.msgStatusDesc || null,
    remarks: e.remarks || remarksList(parsed),
    category: e.category || null,
    followUpHint: e.followUpHint || null,
    flags: e.flags || [],
  };
}
