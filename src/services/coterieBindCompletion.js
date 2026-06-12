import { getPool } from "../db.js";
import { finalizeCoterieBind } from "./coteriePipelineService.js";
import {
  bindQuote,
  extractQuoteSummary,
  getQuote,
} from "./coterieService.js";
import { loadCoterieSession } from "./coterieIntakeService.js";

/**
 * Coterie bind webhook → policy path.
 */
export async function processCoterieBindWebhook(payload, meta = {}) {
  const pool = getPool();
  if (!pool) {
    console.warn("[coterie webhook] no DB pool — skipping finalize");
    return { ok: false, reason: "no_db" };
  }

  const eventType =
    payload?.eventType ||
    payload?.event_type ||
    payload?.type ||
    "unknown";

  const applicationId =
    payload?.applicationId ||
    payload?.application_id ||
    payload?.data?.applicationId ||
    null;

  const quoteId =
    payload?.quoteId ||
    payload?.quote_id ||
    payload?.data?.quoteId ||
    null;

  const submissionPublicId =
    payload?.submissionPublicId ||
    payload?.submission_public_id ||
    payload?.externalReference ||
    null;

  console.log("[coterie webhook] received", {
    eventType,
    eventId: meta.eventId,
    applicationId,
    quoteId,
    submissionPublicId,
  });

  const isBindEvent =
    /bound|bind\.complete|policy\.issued|payment\.complete/i.test(
      String(eventType),
    );

  if (!isBindEvent) {
    return { ok: true, ignored: true, eventType };
  }

  if (!submissionPublicId || !quoteId) {
    return { ok: true, acknowledged: true, finalize: "missing_correlation" };
  }

  const session = await loadCoterieSession(submissionPublicId);
  const quoteSummary =
    session?.quoteSummary ||
    extractQuoteSummary({ quote: payload?.quote || payload, isSuccess: true });
  quoteSummary.quoteId = quoteSummary.quoteId || quoteId;
  quoteSummary.applicationId =
    quoteSummary.applicationId || applicationId;

  const result = await finalizeCoterieBind({
    submissionPublicId,
    quoteSummary,
    bindResult: { result: payload },
  });

  return { ok: true, ...result };
}

/**
 * Client-initiated bind after Stripe payment method created (Coterie Stripe account).
 */
export async function processCoterieBindPayment({
  submissionPublicId,
  quoteId,
  stripePaymentMethodId,
  paymentPlan = "Annual",
}) {
  const session = await loadCoterieSession(submissionPublicId);
  const resolvedQuoteId = quoteId || session?.quoteId;
  if (!resolvedQuoteId) {
    return { ok: false, error: "QUOTE_ID_REQUIRED" };
  }

  const bindResult = await bindQuote(resolvedQuoteId, {
    stripePaymentMethodId,
    paymentPlan,
    paymentInfo: {
      stripePaymentMethodId,
      paymentPlan,
    },
  });

  const body = bindResult.result;
  if (body?.isSuccess === false || (body?.errors && body.errors.length)) {
    return {
      ok: false,
      error: "COTERIE_BIND_FAILED",
      message: body?.errors?.[0] || "Bind failed",
      coterie: body,
    };
  }

  let quoteSummary = session?.quoteSummary;
  if (!quoteSummary) {
    const q = await getQuote(resolvedQuoteId);
    quoteSummary = extractQuoteSummary(q);
  }
  quoteSummary.quoteId = resolvedQuoteId;

  const finalized = await finalizeCoterieBind({
    submissionPublicId,
    quoteSummary,
    bindResult,
  });

  return { ok: true, ...finalized, coterie: body };
}

/**
 * Sandbox demo finalize — simulates post-payment policy write when bind API shape is unresolved.
 */
export async function processCoterieDemoFinalize({ submissionPublicId, quoteId }) {
  const sandbox =
    process.env.COTERIE_DEMO_FINALIZE_ENABLED === "true" ||
    (process.env.COTERIE_API_BASE || "").includes("sandbox");
  if (!sandbox) {
    return { ok: false, error: "DEMO_FINALIZE_DISABLED" };
  }

  const session = await loadCoterieSession(submissionPublicId);
  const resolvedQuoteId = quoteId || session?.quoteId;
  if (!resolvedQuoteId || !session?.quoteSummary) {
    return { ok: false, error: "SESSION_NOT_FOUND" };
  }

  const finalized = await finalizeCoterieBind({
    submissionPublicId,
    quoteSummary: session.quoteSummary,
    bindResult: {
      result: {
        isSuccess: true,
        demo: true,
        premium: session.quoteSummary.premium,
      },
    },
  });

  return { ok: true, demo: true, ...finalized };
}
