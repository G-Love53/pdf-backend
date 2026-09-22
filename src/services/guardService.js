/**
 * GUARD ACORD SOAP client (Workers’ Comp).
 * Credentials stay on Render. Never ship to the browser.
 */

import crypto from "crypto";
import {
  GUARD_CO_OFFICER_PAYROLL,
  GUARD_DEFAULT_EL_LIMITS,
  getGuardSegmentEntry,
  ratingClassificationCd,
} from "../config/guardRegistry.js";

const DEFAULT_P_BASE =
  "https://pgigezrate.guard.com/dotnet/api/acordservice/acord.svc";

export class GuardApiError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "GuardApiError";
    this.code = meta.code;
    this.status = meta.status;
    this.body = meta.body;
  }
}

export function isGuardConfigured() {
  return Boolean(
    process.env.GUARD_API_KEY &&
      process.env.GUARD_API_SECRET &&
      process.env.GUARD_CONTRACT_NUMBER &&
      process.env.GUARD_SP_NAME,
  );
}

function guardApiBase() {
  return (process.env.GUARD_API_BASE || DEFAULT_P_BASE).replace(/\/$/, "");
}

export function getGuardPublicConfig() {
  return {
    apiConfigured: isGuardConfigured(),
    sandbox: /pgigezrate/i.test(guardApiBase()),
  };
}

export function getGuardConfig() {
  if (!isGuardConfigured()) {
    throw new GuardApiError(
      "GUARD not configured (GUARD_API_KEY, GUARD_API_SECRET, GUARD_CONTRACT_NUMBER, GUARD_SP_NAME)",
      { code: "GUARD_NOT_CONFIGURED" },
    );
  }
  return {
    apiBase: guardApiBase(),
    apiKey: process.env.GUARD_API_KEY,
    apiSecret: process.env.GUARD_API_SECRET,
    contractNumber: process.env.GUARD_CONTRACT_NUMBER,
    spName: process.env.GUARD_SP_NAME,
    producerSubCode: process.env.GUARD_PRODUCER_SUBCODE || "",
    fieldOfficeCd: process.env.GUARD_FIELD_OFFICE_CD || "S",
  };
}

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function unescapeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function sanitizeInsuredName(name) {
  return String(name || "")
    .replace(/[-_~^=`{}[\]|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 35);
}

function firstTag(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = String(xml || "").match(re);
  return m ? unescapeXml(m[1]).trim() : null;
}

function allTags(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  const out = [];
  let m;
  const src = String(xml || "");
  while ((m = re.exec(src))) {
    out.push(unescapeXml(m[1]).trim());
  }
  return out;
}

export function extractAcordFromSoap(soapXml) {
  const src = String(soapXml || "");
  const serviceResult = src.match(
    /<ServiceResult[^>]*>([\s\S]*?)<\/ServiceResult>/i,
  );
  if (serviceResult) {
    const inner = unescapeXml(serviceResult[1]).trim();
    if (inner) return inner;
  }
  const dataMatch = src.match(/<data[^>]*>([\s\S]*?)<\/data>/i);
  if (dataMatch) {
    const inner = unescapeXml(dataMatch[1]).trim();
    if (inner) return inner;
  }
  if (/<ACORD[\s>]/i.test(src)) return src;
  if (/<WorkCompPolicyAddRs/i.test(src)) return unescapeXml(src);
  if (/<SignonRs/i.test(src)) return src;
  return src;
}

function rqUidFromXml(xml) {
  const block = String(xml || "").match(
    /<WorkCompPolicyAddRs[\s\S]*?<\/WorkCompPolicyAddRs>/i,
  )?.[0];
  if (block) {
    const id = firstTag(block, "RqUID");
    if (id) return id;
  }
  const all = allTags(String(xml || ""), "RqUID").filter(Boolean);
  return all.length ? all[all.length - 1] : null;
}

export function guardResponseMessage(parsed) {
  const p = parsed || {};
  if (String(p.msgStatusCd || "").toLowerCase() === "error") {
    return (
      p.msgStatusDesc ||
      p.remarks?.[0] ||
      (p.msgErrorCd ? `GUARD error (${p.msgErrorCd})` : null) ||
      "GUARD returned an error"
    );
  }
  return p.statusDesc || p.msgStatusCd || null;
}

/** Favorable ACORD policy-level defaults (GUARD sample NBS). */
export const GUARD_DEFAULT_ACORD_ANSWERS = [
  { questionCd: "YEARSCONSECUTIVECOVERAGE", response: "5" },
  { questionCd: "com.guard_QUESTIONOWNMORETHANHALF", response: "N" },
  { questionCd: "com.guard_QUESTIONTEMPSTAFFCASHLABOR", response: "N" },
  { questionCd: "com.guard_QUESTIONTEMPSTAFFEMPLOYERORG", response: "N" },
  { questionCd: "com.guard_QUESTIONVOLUNTEERLABOR", response: "N" },
  { questionCd: "com.guard_QUESTIONPPDOPERATIONS", response: "N" },
  { questionCd: "com.guard_QUESTIONAIRCRAFTWATERCRAFT", response: "N" },
  { questionCd: "com.guard_QUESTIONSUBCONTRACTWORK", response: "N" },
  { questionCd: "com.guard_QUESTIONTRANSPORTFIVEORMORE", response: "N" },
  { questionCd: "com.guard_QUESTIONFRAUDDISCLAIMER", response: "Y" },
];

/** @param {Array<{ questionCd?: string, response?: string, answer?: string, num?: string|number }>} list */
export function normalizeQuestionAnswers(list) {
  const byCd = new Map();
  for (const raw of list || []) {
    const questionCd = String(raw?.questionCd || "").trim();
    if (!questionCd) continue;
    if (raw.num != null && raw.num !== "") {
      byCd.set(questionCd, { questionCd, num: String(raw.num) });
      continue;
    }
    const response = raw.response ?? raw.answer;
    if (response == null || response === "") continue;
    byCd.set(questionCd, { questionCd, response: String(response) });
  }
  return [...byCd.values()];
}

/** Merge ACORD defaults with class-specific answers (later wins). */
export function mergeGuardQuestionAnswers(custom = []) {
  const merged = normalizeQuestionAnswers([
    ...GUARD_DEFAULT_ACORD_ANSWERS,
    ...custom,
  ]);
  return merged;
}

export function parseGuardResponse(acordXml) {
  const xml = String(acordXml || "");
  const questions = [];
  const qBlocks = xml.match(/<SPQuestion[\s\S]*?<\/SPQuestion>/gi) || [];
  for (const block of qBlocks) {
    const codes = [];
    const codeBlocks = block.match(/<SPCode[\s\S]*?<\/SPCode>/gi) || [];
    for (const cb of codeBlocks) {
      codes.push({
        label: firstTag(cb, "CodeDesc"),
        value: firstTag(cb, "CodeValue"),
      });
    }
    questions.push({
      questionCd: firstTag(block, "QuestionCd"),
      questionText: firstTag(block, "QuestionText"),
      type: firstTag(block, "com.guard_QuestionType") || firstTag(block, "QuestionType"),
      required: firstTag(block, "com.guard_RequiredInd") === "1",
      options: codes.filter((c) => c.value),
    });
  }

  return {
    rqUid: rqUidFromXml(xml),
    signonStatusCd:
      firstTag(xml, "SignonStatusCd") ||
      firstTag(xml.match(/<SignonRs[\s\S]*?<\/SignonRs>/i)?.[0] || "", "StatusCd"),
    statusDesc: firstTag(xml, "StatusDesc"),
    msgStatusCd: firstTag(xml, "MsgStatusCd"),
    msgErrorCd: firstTag(xml, "MsgErrorCd"),
    msgStatusDesc: firstTag(xml, "MsgStatusDesc"),
    requestStatusCd:
      firstTag(xml, "RequestStatusCd") ||
      firstTag(xml, "RequestStatus") ||
      firstTag(xml, "StatusDesc"),
    policyNumber: firstTag(xml, "PolicyNumber"),
    policyStatusCd:
      firstTag(xml, "PolicyStatusCd") || firstTag(xml, "PolicyStatus"),
    fullTermAmt: firstTag(xml, "FullTermAmt"),
    experienceMod: firstTag(xml, "FormatModFactor"),
    uwDecision: firstTag(xml, "SystemUnderwritingDecisionCd"),
    remarks: allTags(xml, "RemarkText"),
    questions,
    carrier: firstTag(xml, "Carrier"),
    raw: xml.slice(0, 20000),
    soapFault: firstTag(xml, "faultstring") || firstTag(xml, "Fault"),
  };
}

function wrapSoap(acordXml) {
  const escaped = xmlEscape(acordXml);
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <Service xmlns="http://guardwebservices.com">
      <data>${escaped}</data>
    </Service>
  </s:Body>
</s:Envelope>`;
}

function signonXml(cfg) {
  return `<SignonRq>
  <SignonPswd>
    <CustId>
      <SPName>${xmlEscape(cfg.spName)}</SPName>
      <CustLoginId>${xmlEscape(cfg.apiKey)}</CustLoginId>
    </CustId>
    <CustPswd>
      <EncryptionTypeCd>NONE</EncryptionTypeCd>
      <Pswd>${xmlEscape(cfg.apiSecret)}</Pswd>
    </CustPswd>
  </SignonPswd>
</SignonRq>`;
}

function formatPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const ten =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits.slice(-10);
  if (ten.length !== 10) return "+1-303-9321700";
  return `+1-${ten.slice(0, 3)}-${ten.slice(3)}`;
}

function addYearsIso(isoDate, years) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function tomorrowIso() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function legalEntityToTitle(legalEntityCd) {
  const cd = String(legalEntityCd || "LL").toUpperCase();
  if (cd === "SOLEPRP" || cd === "IN") return "SolePrp";
  if (cd === "GP" || cd === "PT" || cd === "LP") return "Ptnr";
  if (cd === "CP" || cd === "SS" || cd === "SCORP S") return "Pres";
  return "LLCMbr";
}

/** Split integer total across N parts (remainder to first buckets). */
export function splitIntegerAcross(total, parts) {
  const n = Math.max(1, Number(parts) || 1);
  const value = Math.max(0, Math.round(Number(total) || 0));
  const base = Math.floor(value / n);
  const rem = value % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Normalize WC locations for SOAP (L1, L2, …).
 * @param {Record<string, unknown>} payload
 */
export function normalizeWorkCompLocations(payload) {
  const classCd = payload.ratingClassificationCd;
  const totalExposure = Number(payload.exposure || 0);
  const ft = Number(payload.numEmployeesFullTime || 1);
  const pt = Number(payload.numEmployeesPartTime || 0);
  const totalEmployees = Math.max(ft + pt, 1);
  const defaultState = String(payload.state || "CO").slice(0, 2).toUpperCase();

  const raw = Array.isArray(payload.locations) ? payload.locations : null;
  if (raw?.length) {
    const exposureSplits = splitIntegerAcross(totalExposure, raw.length);
    const employeeSplits = splitIntegerAcross(totalEmployees, raw.length);
    return raw.map((loc, index) => {
      const street = String(loc.street || loc.locationStreet || "").slice(0, 50);
      const city = String(loc.city || loc.locationCity || "").slice(0, 30);
      const state = String(loc.state || loc.locationState || defaultState)
        .slice(0, 2)
        .toUpperCase();
      const zip = String(loc.zip || loc.locationZip || "")
        .replace(/\D/g, "")
        .slice(0, 9);
      const locFt =
        loc.numEmployeesFullTime != null
          ? Number(loc.numEmployeesFullTime)
          : employeeSplits[index];
      const locPt =
        loc.numEmployeesPartTime != null ? Number(loc.numEmployeesPartTime) : 0;
      return {
        id: String(loc.id || `L${index + 1}`),
        street,
        city,
        state,
        zip,
        addr2: String(loc.addr2 || loc.locationAddr2 || `Loc ${index + 1}`).slice(
          0,
          50,
        ),
        exposure:
          loc.exposure != null
            ? Math.round(Number(loc.exposure))
            : exposureSplits[index],
        numEmployeesFullTime: locFt,
        numEmployeesPartTime: locPt,
        ratingClassificationCd:
          loc.ratingClassificationCd || classCd,
      };
    });
  }

  const street = String(payload.locationStreet || payload.street || "").slice(0, 50);
  const city = String(payload.locationCity || payload.city || "").slice(0, 30);
  const state = String(payload.locationState || payload.state || defaultState)
    .slice(0, 2)
    .toUpperCase();
  const zip = String(payload.locationZip || payload.zip || "")
    .replace(/\D/g, "")
    .slice(0, 9);
  const mailingStreet = String(payload.street || "").slice(0, 50);
  const mailingZip = String(payload.zip || "").replace(/\D/g, "").slice(0, 9);
  const mailingSame =
    street.toLowerCase() === mailingStreet.toLowerCase() &&
    zip === mailingZip &&
    state === String(payload.state || defaultState).slice(0, 2).toUpperCase();

  return [
    {
      id: "L1",
      street,
      city,
      state,
      zip,
      addr2: mailingSame ? "Loc 1" : String(payload.locationAddr2 || "").slice(0, 50),
      exposure: Math.round(totalExposure),
      numEmployeesFullTime: ft,
      numEmployeesPartTime: pt,
      ratingClassificationCd: classCd,
    },
  ];
}

/**
 * Build WorkCompPolicyAddRq inner XML (no Signon).
 * @param {"NBQ"|"NBS"|"BND"} purpose
 */
export function buildWorkCompPolicyAddXml(purpose, payload, cfg) {
  const rqUid = payload.rqUid || crypto.randomUUID();
  const now = new Date().toISOString();

  if (purpose === "BND") {
    return `<WorkCompPolicyAddRq>
  <RqUID>${xmlEscape(rqUid)}</RqUID>
  <TransactionRequestDt>${xmlEscape(now)}</TransactionRequestDt>
  <BusinessPurposeTypeCd>BND</BusinessPurposeTypeCd>
  <Producer>
    <ProducerInfo>
      <ContractNumber>${xmlEscape(cfg.contractNumber)}</ContractNumber>
    </ProducerInfo>
  </Producer>
  <CommlPolicy>
    <PolicyNumber>${xmlEscape(payload.policyNumber)}</PolicyNumber>
  </CommlPolicy>
</WorkCompPolicyAddRq>`;
  }

  const effective = payload.effectiveDt || tomorrowIso();
  const expiration = payload.expirationDt || addYearsIso(effective, 1);
  const legal = payload.legalEntityCd || "LL";
  const name = sanitizeInsuredName(payload.commercialName);
  const street = String(payload.street || "").slice(0, 50);
  const city = String(payload.city || "").slice(0, 30);
  const state = String(payload.state || "CO").slice(0, 2).toUpperCase();
  const zip = String(payload.zip || "").replace(/\D/g, "").slice(0, 9);
  const classCd = payload.ratingClassificationCd;
  const locations = normalizeWorkCompLocations(payload);
  const ownerIncluded = payload.ownerIncluded === true;
  const ownerPayroll = ownerIncluded
    ? Number(payload.ownerPayroll || GUARD_CO_OFFICER_PAYROLL)
    : 0;
  const el = payload.elLimits || GUARD_DEFAULT_EL_LIMITS;
  const years = Number(payload.numYrsInBusiness || 1);
  const ops = String(payload.operationsDesc || "plumbing contracting").slice(
    0,
    255,
  );
  const given = String(payload.contactFirstName || "Owner").slice(0, 25);
  const surname = String(payload.contactLastName || "Contact").slice(0, 25);
  const email = String(payload.email || "");
  const phone = formatPhone(payload.phone);
  const policyNumberXml = payload.policyNumber
    ? xmlEscape(payload.policyNumber)
    : "";

  const questionXml = normalizeQuestionAnswers(payload.questionAnswers || [])
    .map((qa) => {
      const cd = xmlEscape(qa.questionCd);
      if (qa.num != null && qa.num !== "") {
        return `<QuestionAnswer>
      <QuestionCd>${cd}</QuestionCd>
      <Num>${xmlEscape(qa.num)}</Num>
    </QuestionAnswer>`;
      }
      return `<QuestionAnswer>
      <QuestionCd>${cd}</QuestionCd>
      <com.guard_QuestionResponse>${xmlEscape(qa.response)}</com.guard_QuestionResponse>
    </QuestionAnswer>`;
    })
    .join("\n    ");

  const expMod = Number(payload.experienceMod);
  const expModXml =
    Number.isFinite(expMod) && expMod > 0
      ? `<CreditOrSurcharge>
      <CreditSurchargeCd>EXP</CreditSurchargeCd>
      <NumericValue>
        <FormatModFactor>${expMod}</FormatModFactor>
      </NumericValue>
    </CreditOrSurcharge>`
      : "";

  const feinXml =
    purpose === "NBS" && payload.fein
      ? `<TaxIdentity>
          <TaxIdTypeCd>FEIN</TaxIdTypeCd>
          <TaxId>${xmlEscape(String(payload.fein).replace(/\D/g, "").slice(0, 9))}</TaxId>
        </TaxIdentity>`
      : "";

  const billingXml =
    purpose === "NBS"
      ? `<BillingMethodCd>CPB</BillingMethodCd>
    <PaymentOption>
      <DownPaymentPct>100</DownPaymentPct>
      <PaymentIntervalCd>MO</PaymentIntervalCd>
      <NumPayments>0</NumPayments>
    </PaymentOption>`
      : `<PaymentOption>
      <PaymentIntervalCd>MO</PaymentIntervalCd>
      <NumPayments>0</NumPayments>
    </PaymentOption>`;

  return `<WorkCompPolicyAddRq>
  <RqUID>${xmlEscape(rqUid)}</RqUID>
  <BusinessPurposeTypeCd>${xmlEscape(purpose)}</BusinessPurposeTypeCd>
  <TransactionRequestDt>${xmlEscape(now)}</TransactionRequestDt>
  <TransactionEffectiveDt>${xmlEscape(effective)}T00:00:00</TransactionEffectiveDt>
  <CurCd>USD</CurCd>
  <Producer>
    <ProducerInfo>
      <ContractNumber>${xmlEscape(cfg.contractNumber)}</ContractNumber>
      <ProducerSubCode>${xmlEscape(cfg.producerSubCode)}</ProducerSubCode>
      <ProducerRoleCd>Agency</ProducerRoleCd>
      <FieldOfficeCd>${xmlEscape(cfg.fieldOfficeCd || "S")}</FieldOfficeCd>
    </ProducerInfo>
  </Producer>
  <InsuredOrPrincipal>
    <GeneralPartyInfo>
      <NameInfo>
        <CommlName>
          <CommercialName>${xmlEscape(name)}</CommercialName>
        </CommlName>
        <LegalEntityCd>${xmlEscape(legal)}</LegalEntityCd>
        ${feinXml}
      </NameInfo>
      <Addr>
        <AddrTypeCd>MailingAddress</AddrTypeCd>
        <Addr1>${xmlEscape(street)}</Addr1>
        <City>${xmlEscape(city)}</City>
        <StateProvCd>${xmlEscape(state)}</StateProvCd>
        <PostalCode>${xmlEscape(zip)}</PostalCode>
      </Addr>
      <Communications>
        <PhoneInfo>
          <PhoneTypeCd>Phone</PhoneTypeCd>
          <CommunicationUseCd>Day</CommunicationUseCd>
          <PhoneNumber>${xmlEscape(phone)}</PhoneNumber>
        </PhoneInfo>
        <EmailInfo>
          <EmailAddr>${xmlEscape(email)}</EmailAddr>
        </EmailInfo>
      </Communications>
    </GeneralPartyInfo>
    <InsuredOrPrincipalInfo>
      <InsuredOrPrincipalRoleCd>Insured</InsuredOrPrincipalRoleCd>
      <BusinessInfo>
        <OperationsDesc>${xmlEscape(ops)}</OperationsDesc>
        <NumYrsInBusiness>${years}</NumYrsInBusiness>
      </BusinessInfo>
    </InsuredOrPrincipalInfo>
  </InsuredOrPrincipal>
  <CommlPolicy id="PolicyLevel">
    <PolicyNumber>${policyNumberXml}</PolicyNumber>
    <LOBCd>WORK</LOBCd>
    <ControllingStateProvCd>${xmlEscape(state)}</ControllingStateProvCd>
    <NumLosses>0</NumLosses>
    <ContractTerm>
      <EffectiveDt>${xmlEscape(effective)}</EffectiveDt>
      <ExpirationDt>${xmlEscape(expiration)}</ExpirationDt>
      <DurationPeriod>
        <NumUnits>12</NumUnits>
        <UnitMeasurementCd>MON</UnitMeasurementCd>
      </DurationPeriod>
    </ContractTerm>
    <AdditionalInterest>
      <GeneralPartyInfo>
        <NameInfo>
          <PersonName>
            <Surname>${xmlEscape(surname)}</Surname>
            <GivenName>${xmlEscape(given)}</GivenName>
          </PersonName>
        </NameInfo>
        <Communications>
          <PhoneInfo>
            <PhoneTypeCd>Phone</PhoneTypeCd>
            <PhoneNumber>${xmlEscape(phone)}</PhoneNumber>
          </PhoneInfo>
          <EmailInfo>
            <EmailAddr>${xmlEscape(email)}</EmailAddr>
          </EmailInfo>
        </Communications>
      </GeneralPartyInfo>
    </AdditionalInterest>
    <AdditionalInterestInfo>
      <NatureInterestCd>OT</NatureInterestCd>
    </AdditionalInterestInfo>
    ${billingXml}
  </CommlPolicy>
  ${locations
    .map(
      (loc) => `<Location id="${xmlEscape(loc.id)}">
    <Addr>
      <Addr1>${xmlEscape(loc.street)}</Addr1>
      <Addr2>${xmlEscape(loc.addr2)}</Addr2>
      <City>${xmlEscape(loc.city)}</City>
      <StateProvCd>${xmlEscape(loc.state)}</StateProvCd>
      <PostalCode>${xmlEscape(loc.zip)}</PostalCode>
    </Addr>
  </Location>`,
    )
    .join("\n  ")}
  <WorkCompLineBusiness>
    <WorkCompIndividuals>
      <DutiesDesc>${xmlEscape(ops)}</DutiesDesc>
      <IncludedExcludedCd>${ownerIncluded ? "I" : "E"}</IncludedExcludedCd>
      ${
        ownerIncluded
          ? `<InclIndividualsEstAnnualRemunerationAmt>
        <Amt>${ownerPayroll}</Amt>
      </InclIndividualsEstAnnualRemunerationAmt>`
          : ""
      }
      <NameInfo>
        <PersonName>
          <GivenName>${xmlEscape(given)}</GivenName>
          <Surname>${xmlEscape(surname)}</Surname>
        </PersonName>
      </NameInfo>
      ${
        ownerIncluded
          ? `<OwnershipPct>100</OwnershipPct>
      <RatingClassificationCd>${xmlEscape(classCd)}</RatingClassificationCd>`
          : ""
      }
      <TitleRelationshipCd>${legalEntityToTitle(legal)}</TitleRelationshipCd>
    </WorkCompIndividuals>
    <WorkCompRateState>
      <StateProvCd>${xmlEscape(state)}</StateProvCd>
      ${locations
        .map((loc) => {
          const locEmployees = loc.numEmployeesFullTime + loc.numEmployeesPartTime;
          return `<WorkCompLocInfo LocationRef="${xmlEscape(loc.id)}">
        <NumEmployees>${locEmployees}</NumEmployees>
        <WorkCompRateClass LocationRef="${xmlEscape(loc.id)}">
          <NumEmployeesFullTime>${loc.numEmployeesFullTime}</NumEmployeesFullTime>
          <NumEmployeesPartTime>${loc.numEmployeesPartTime}</NumEmployeesPartTime>
          <RatingClassificationCd>${xmlEscape(loc.ratingClassificationCd || classCd)}</RatingClassificationCd>
          <Exposure>${loc.exposure}</Exposure>
        </WorkCompRateClass>
      </WorkCompLocInfo>`;
        })
        .join("\n      ")}
      ${expModXml}
    </WorkCompRateState>
    <CommlCoverage>
      <CoverageCd>WCEL</CoverageCd>
      <Limit>
        <FormatInteger>${el.perAccident}</FormatInteger>
        <LimitAppliesToCd>PerAcc</LimitAppliesToCd>
      </Limit>
      <Limit>
        <FormatInteger>${el.perEmployee}</FormatInteger>
        <LimitAppliesToCd>DisEachEmpl</LimitAppliesToCd>
      </Limit>
      <Limit>
        <FormatInteger>${el.perPolicy}</FormatInteger>
        <LimitAppliesToCd>DisPol</LimitAppliesToCd>
      </Limit>
    </CommlCoverage>
    ${questionXml}
  </WorkCompLineBusiness>
</WorkCompPolicyAddRq>`;
}

export function buildQuestionsInquiryXml(payload, cfg) {
  const rqUid = payload.rqUid || crypto.randomUUID();
  const now = payload.transactionRequestDt || new Date().toISOString();
  const state = String(payload.state || "CO").slice(0, 2).toUpperCase();
  const classCd = payload.ratingClassificationCd;
  return `<com.guard_UnderwritingQuestionsInqRq>
  <RqUID>${xmlEscape(rqUid)}</RqUID>
  <TransactionRequestDt>${xmlEscape(now)}</TransactionRequestDt>
  <Producer>
    <ProducerInfo>
      <ContractNumber>${xmlEscape(cfg.contractNumber)}</ContractNumber>
    </ProducerInfo>
  </Producer>
  <WorkCompLineBusiness>
    <LOBCd>WORK</LOBCd>
    <WorkCompRateState>
      <StateProvCd>${xmlEscape(state)}</StateProvCd>
      <WorkCompLocInfo>
        <WorkCompRateClass>
          <RatingClassificationCd>${xmlEscape(classCd)}</RatingClassificationCd>
        </WorkCompRateClass>
      </WorkCompLocInfo>
    </WorkCompRateState>
  </WorkCompLineBusiness>
</com.guard_UnderwritingQuestionsInqRq>`;
}

function wrapAcord(signon, inner) {
  return `<ACORD>
${signon}
  <InsuranceSvcRq>
    ${inner}
  </InsuranceSvcRq>
</ACORD>`;
}

function isAzureGatewayHtml(xml) {
  return /<title>504 Gateway Time-out<\/title>/i.test(xml || "");
}

async function guardSoap(innerXml) {
  const cfg = getGuardConfig();
  const requestRqUid = firstTag(innerXml, "RqUID");
  const acord = wrapAcord(signonXml(cfg), innerXml);
  const soap = wrapSoap(acord);
  const res = await fetch(cfg.apiBase, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://guardwebservices.com/IAcordService/Service"',
    },
    body: soap,
  });
  const text = await res.text();
  const acordOut = extractAcordFromSoap(text);
  const parsed = parseGuardResponse(acordOut || text);
  parsed.rqUid = parsed.rqUid || requestRqUid || null;
  parsed.httpStatus = res.status;

  if (
    !parsed.fullTermAmt &&
    !parsed.msgStatusCd &&
    !parsed.policyNumber &&
    (parsed.raw?.length || 0) < 50
  ) {
    console.warn("[guard soap] empty ACORD parse", {
      rqUid: parsed.rqUid,
      httpStatus: res.status,
      soapPreview: text.slice(0, 1200),
    });
  }

  if (!res.ok) {
    const gateway = isAzureGatewayHtml(parsed.raw || text);
    throw new GuardApiError(
      gateway
        ? "GUARD Azure gateway timeout (504)"
        : parsed.statusDesc || parsed.msgStatusCd || `GUARD HTTP ${res.status}`,
      {
        status: res.status,
        body: parsed,
        code: gateway ? "GUARD_GATEWAY_TIMEOUT" : parsed.msgStatusCd,
      },
    );
  }
  if (/authentication failed/i.test(parsed.statusDesc || "")) {
    throw new GuardApiError("GUARD authentication failed", {
      code: "GUARD_AUTH",
      status: 401,
      body: parsed,
    });
  }
  if (String(parsed.msgStatusCd || "").toLowerCase() === "error") {
    throw new GuardApiError(guardResponseMessage(parsed) || "GUARD returned Error", {
      code: parsed.msgErrorCd || "GUARD_ERROR",
      status: 422,
      body: parsed,
    });
  }
  return parsed;
}

export async function guardIndicate(payload) {
  const cfg = getGuardConfig();
  const inner = buildWorkCompPolicyAddXml("NBQ", payload, cfg);
  return guardSoap(inner);
}

export async function guardFetchQuestions(payload) {
  const cfg = getGuardConfig();
  const inner = buildQuestionsInquiryXml(payload, cfg);
  return guardSoap(inner);
}

export async function guardSubmitNbs(payload) {
  const cfg = getGuardConfig();
  const inner = buildWorkCompPolicyAddXml("NBS", payload, cfg);
  return guardSoap(inner);
}

export async function guardBind(policyNumber) {
  const cfg = getGuardConfig();
  const inner = buildWorkCompPolicyAddXml(
    "BND",
    { policyNumber },
    cfg,
  );
  return guardSoap(inner);
}

export function buildRatingPayloadFromForm(form, segment, extras = {}) {
  const businessClass =
    extras.businessClass ||
    form.business_class ||
    form.businessClass ||
    null;
  const entry = getGuardSegmentEntry(segment, businessClass);
  const classCd =
    extras.ratingClassificationCd ||
    ratingClassificationCd(entry);
  const payroll = Number(
    extras.exposure ||
      form.annual_payroll ||
      form.payroll ||
      form.annualPayroll ||
      0,
  );
  const employees = Number(
    form.num_employees || form.numEmployees || extras.numEmployees || 0,
  );
  const ownerIncluded = extras.ownerIncluded === true;
  let exposure = payroll;
  if (ownerIncluded && (!exposure || exposure < GUARD_CO_OFFICER_PAYROLL)) {
    exposure = GUARD_CO_OFFICER_PAYROLL;
  }
  if (!exposure && employees > 0) {
    exposure = Math.max(employees, 1) * 40000;
  }

  const locations = Array.isArray(extras.locations)
    ? extras.locations
    : Array.isArray(form.locations)
      ? form.locations
      : null;

  return {
    rqUid: extras.rqUid || null,
    commercialName:
      form.insured_name ||
      form.legal_business_name ||
      form.business_name ||
      "Unknown Business",
    legalEntityCd: extras.legalEntityCd || form.legal_entity || "LL",
    street:
      form.premise_street ||
      form.street ||
      form.address ||
      form.mailing_street ||
      "",
    city: form.premise_city || form.city || "",
    state: form.premise_state || form.state || form.businessState || "CO",
    zip: form.zip || form.businessZip || form.premise_zip || "",
    email: form.contact_email || form.email || "",
    phone: form.phone || form.contact_phone || "",
    contactFirstName: form.first_name || form.applicant_first_name || "Owner",
    contactLastName: form.last_name || form.applicant_last_name || "Contact",
    numYrsInBusiness: extras.numYrsInBusiness || yearsInBusinessFromForm(form),
    operationsDesc: extras.operationsDesc || entry?.operationsDesc || "Operations",
    ratingClassificationCd: classCd,
    experienceMod: extras.experienceMod ?? null,
    exposure: Math.round(exposure),
    numEmployeesFullTime: employees > 0 ? employees : ownerIncluded ? 1 : 0,
    numEmployeesPartTime: 0,
    locations,
    ownerIncluded,
    ownerPayroll: GUARD_CO_OFFICER_PAYROLL,
    fein: extras.fein || form.fein || null,
    policyNumber: extras.policyNumber || null,
    questionAnswers: normalizeQuestionAnswers(extras.questionAnswers || []),
  };
}

export function yearsInBusinessFromForm(form) {
  const explicit = form.years_in_business || form.num_yrs_in_business;
  if (explicit) {
    const n = Number(explicit);
    if (Number.isFinite(n) && n >= 0) return Math.max(1, Math.round(n));
  }
  const start = form.business_start_month || form.businessStartDate || "";
  const year = String(start).match(/^(19|20)\d{2}/);
  if (year) {
    const y = Number(year[0]);
    const now = new Date().getUTCFullYear();
    return Math.max(1, now - y);
  }
  return 3;
}

export function verifyGuardWebhookAuth(req) {
  const expected = process.env.GUARD_WEBHOOK_AUTH;
  if (!expected) return true;
  const got = req.headers.authorization || "";
  return got === expected;
}

export function parseGuardDocWebhook(req) {
  const body = req.body;
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      return null;
    }
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === "object" ? body : null;
}
