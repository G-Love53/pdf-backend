import { recordSubmission, getPool } from "../db.js";
import {
  resolveAkHash,
  isCoteriePilotState,
} from "../config/coterieAkHash.js";
import { resolveRegistryEntry } from "../config/coterieRegistry.js";
import {
  isCoterieConfigured,
  createApplication,
  createBindableQuote,
  buildApplicationPayload,
  buildBindableQuotePayload,
  shouldRouteToTraditionalRail,
  extractApplicationSummary,
  extractQuoteSummary,
  isProducerNotLicensedError,
  CoterieApiError,
} from "./coterieService.js";

function normalizeFormData(body = {}) {
  return body.data || body.formData || body.fields || body || {};
}

function pickPrimaryEmail(form) {
  return form.contact_email || form.email || form.applicant_email || null;
}

function resolveApplicationTypes(form, segment, businessClassKey) {
  const entry = resolveRegistryEntry(segment, businessClassKey);
  const rawTypes =
    form.application_types ||
    form.applicationTypes ||
    form.coverage_types ||
    null;
  if (rawTypes) {
    const list = Array.isArray(rawTypes)
      ? rawTypes
      : String(rawTypes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (list.length) return list;
  }
  const isNonOwner =
    form.is_owner === false ||
    form.is_owner === "no" ||
    String(form.is_owner).toLowerCase() === "false";
  if (isNonOwner) {
    return entry?.employeeApplicationTypes || ["GL"];
  }
  return entry?.defaultApplicationTypes || ["BOP"];
}

const CONNECTQUOTE_SEGMENTS = new Set(["electrical", "fitness"]);

export async function processConnectQuoteIntake(body, reqMeta = {}) {
  const form = normalizeFormData(body);
  const segment = String(body.segment || form.segment || "electrical")
    .trim()
    .toLowerCase();
  const businessClassKey =
    body.business_class ||
    form.business_class ||
    form.coterie_business_class ||
    "electric_contracting";
  const state =
    form.premise_state ||
    form.physical_state ||
    form.state ||
    form.businessState ||
    null;

  if (!CONNECTQUOTE_SEGMENTS.has(segment)) {
    return {
      ok: false,
      status: 400,
      error: "CONNECTQUOTE_SEGMENT_NOT_SUPPORTED",
      message: `ConnectQuote does not support segment "${segment}".`,
    };
  }

  if (!isCoteriePilotState(state)) {
    return {
      ok: false,
      status: 400,
      error: "CONNECTQUOTE_STATE_NOT_SUPPORTED",
      message: "ConnectQuote v1 is CO only.",
      rail: "traditional",
    };
  }

  const akHash = resolveAkHash(segment, businessClassKey);
  if (akHash === null || akHash === undefined) {
    return {
      ok: true,
      rail: "traditional",
      reason:
        akHash === null
          ? "business_class_disqualified"
          : "business_class_unknown",
      message: "Route to traditional intake — no Coterie AKHash for this class.",
    };
  }

  const registryEntry = resolveRegistryEntry(segment, businessClassKey);

  const primaryEmail = pickPrimaryEmail(form);
  if (!primaryEmail) {
    return {
      ok: false,
      status: 400,
      error: "EMAIL_REQUIRED",
      message: "contact_email is required for ConnectQuote intake.",
    };
  }

  let submissionPublicId = body.submission_public_id || null;
  let submissionId = null;

  if (!submissionPublicId) {
    const sourceDomain =
      body.site_domain || reqMeta.origin || reqMeta.host || "unknown";
    const dbResult = await recordSubmission({
      segment,
      sourceDomain,
      sourceForm: body.bundle_id || "connectquote",
      rawSubmission: {
        ...form,
        segment,
        business_class: businessClassKey,
        quote_rail: "coterie",
        site_domain: body.site_domain,
        traffic_source: form.traffic_source || form.src || null,
        campaign_id: form.campaign_id || form.cid || null,
      },
      primaryEmail,
      primaryPhone: form.phone || form.contact_phone || null,
      firstName: form.first_name || form.applicant_first_name || null,
      lastName: form.last_name || form.applicant_last_name || null,
    });

    if (dbResult) {
      submissionPublicId = dbResult.submissionPublicId;
      submissionId = dbResult.submissionId;
    }
  } else {
    const pool = getPool();
    if (pool) {
      const r = await pool.query(
        `SELECT submission_id FROM submissions WHERE submission_public_id = $1 LIMIT 1`,
        [submissionPublicId],
      );
      submissionId = r.rows[0]?.submission_id || null;
    }
  }

  const isNonOwner =
    form.is_owner === false ||
    form.is_owner === "no" ||
    String(form.is_owner).toLowerCase() === "false";

  if (registryEntry?.ownerOnly && isNonOwner) {
    await appendCoterieTimeline(submissionId, "coterie.rail_traditional", {
      submission_public_id: submissionPublicId,
      reason: "employee_not_owner",
    });
    return {
      ok: true,
      rail: "traditional",
      reason: "employee_not_owner",
      submission_public_id: submissionPublicId,
      message:
        "Instant quotes are for business owners. Use our full application for employee / non-owner coverage.",
    };
  }

  if (!isCoterieConfigured()) {
    return {
      ok: true,
      rail: "coterie",
      submission_public_id: submissionPublicId,
      submission_id: submissionId,
      coterie: {
        configured: false,
        message:
          "Submission recorded; Coterie API env not set on this service.",
      },
    };
  }

  let applicationResponse;
  try {
    applicationResponse = await createApplication(
      buildApplicationPayload(form, { akHash }),
    );
  } catch (err) {
    console.error("[coterie intake] createApplication failed:", err);
    return {
      ok: false,
      status: err instanceof CoterieApiError ? err.status || 502 : 502,
      error: "COTERIE_APPLICATION_FAILED",
      submission_public_id: submissionPublicId,
      message: err.message || "Coterie application failed",
      coterie: {
        code: err instanceof CoterieApiError ? err.code : undefined,
      },
    };
  }

  const appSummary = extractApplicationSummary(applicationResponse);
  const applicationTypes = resolveApplicationTypes(
    form,
    segment,
    businessClassKey,
  );

  if (
    Array.isArray(appSummary.availablePolicyTypes) &&
    appSummary.availablePolicyTypes.length === 0
  ) {
    await appendCoterieTimeline(submissionId, "coterie.appetite_excluded", {
      submission_public_id: submissionPublicId,
    });
    return {
      ok: true,
      rail: "traditional",
      reason: "no_policy_types",
      submission_public_id: submissionPublicId,
      coterie: appSummary,
    };
  }

  await appendCoterieTimeline(submissionId, "coterie.application_created", {
    submission_public_id: submissionPublicId,
    applicationId: appSummary.applicationId,
    availablePolicyTypes: appSummary.availablePolicyTypes,
  });

  let bindableResponse = null;
  let quoteSummary = null;
  let bindBlocked = null;

  if (appSummary.applicationId) {
    const types = applicationTypes.filter((t) =>
      appSummary.availablePolicyTypes?.includes(t),
    );
    const quoteBody = buildBindableQuotePayload(form, {
      akHash,
      applicationId: appSummary.applicationId,
      applicationTypes: types.length ? types : applicationTypes,
    });

    try {
      bindableResponse = await createBindableQuote(quoteBody);
      quoteSummary = extractQuoteSummary(bindableResponse);
      quoteSummary.applicationId = appSummary.applicationId;

      if (shouldRouteToTraditionalRail(bindableResponse)) {
        await appendCoterieTimeline(submissionId, "coterie.appetite_excluded", {
          submission_public_id: submissionPublicId,
          declinations:
            bindableResponse?.underwritingInformation?.declinations,
        });
        return {
          ok: true,
          rail: "traditional",
          reason: "coterie_declined",
          submission_public_id: submissionPublicId,
          coterie: { ...appSummary, quote: quoteSummary },
        };
      }

      if (quoteSummary.isSuccess) {
        await appendCoterieTimeline(submissionId, "coterie.bindable_quote", {
          submission_public_id: submissionPublicId,
          applicationId: appSummary.applicationId,
          quoteId: quoteSummary.quoteId,
          premium: quoteSummary.premium,
        });
        await persistCoterieSession(submissionId, {
          submission_public_id: submissionPublicId,
          applicationId: appSummary.applicationId,
          quoteId: quoteSummary.quoteId,
          quoteSummary,
        });
      }
    } catch (err) {
      if (isProducerNotLicensedError(err)) {
        bindBlocked = {
          code: err.code || "E0122",
          message: err.message,
          retryWhen: "coterie_co_producer_license_enabled",
        };
        await appendCoterieTimeline(
          submissionId,
          "coterie.bindable_blocked",
          bindBlocked,
        );
      } else {
        console.error("[coterie intake] createBindableQuote failed:", err);
        return {
          ok: false,
          status: err instanceof CoterieApiError ? err.status || 502 : 502,
          error: "COTERIE_BINDABLE_FAILED",
          submission_public_id: submissionPublicId,
          message: err.message || "Coterie bindable quote failed",
          coterie: {
            ...appSummary,
            code: err instanceof CoterieApiError ? err.code : undefined,
          },
        };
      }
    }
  }

  return {
    ok: true,
    rail: "coterie",
    submission_public_id: submissionPublicId,
    coterie: {
      ...appSummary,
      quote: quoteSummary,
      bindBlocked,
      payment: quoteSummary?.isSuccess
        ? {
            quoteId: quoteSummary.quoteId,
            premium: quoteSummary.premium,
            monthlyOwed: quoteSummary.monthlyOwed,
            totalYearlyOwed: quoteSummary.totalYearlyOwed,
            applicationUrl: quoteSummary.applicationUrl,
          }
        : null,
    },
  };
}

async function persistCoterieSession(submissionId, payload) {
  if (!submissionId) return;
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `
        INSERT INTO timeline_events (
          submission_id, event_type, event_label, event_payload_json, created_by
        )
        VALUES ($1, 'coterie.session', 'Coterie quote session', $2, 'system')
      `,
      [submissionId, payload],
    );
  } catch (err) {
    console.error("[coterie intake] session persist error:", err.message || err);
  }
}

async function appendCoterieTimeline(submissionId, eventType, payload) {
  if (!submissionId) return;
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `
        INSERT INTO timeline_events (
          submission_id, event_type, event_label, event_payload_json, created_by
        )
        VALUES ($1, $2, $3, $4, 'system')
      `,
      [submissionId, eventType, eventType.replace(/\./g, " "), payload],
    );
  } catch (err) {
    console.error("[coterie intake] timeline error:", err.message || err);
  }
}

export async function loadCoterieSession(submissionPublicId) {
  const pool = getPool();
  if (!pool) return null;
  const r = await pool.query(
    `
      SELECT event_payload_json
      FROM timeline_events te
      JOIN submissions s ON s.submission_id = te.submission_id
      WHERE s.submission_public_id = $1
        AND te.event_type = 'coterie.session'
      ORDER BY te.created_at DESC
      LIMIT 1
    `,
    [submissionPublicId],
  );
  return r.rows[0]?.event_payload_json || null;
}
