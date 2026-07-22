import { finalizeCoterieBind } from "./coteriePipelineService.js";
import {
  bindQuote,
  extractQuoteSummary,
  getQuote,
  isCoteriePaymentBindReady,
  isDemoFinalizeAllowed,
} from "./coterieService.js";
import {
  loadCoterieSession,
  resolveSubmissionContactEmail,
} from "./coterieIntakeService.js";
import { processCoteriePolicyWebhook } from "./coterieDocIngestService.js";

/** @deprecated Use processCoteriePolicyWebhook — bind completes at checkout, webhook is docs-only. */
export async function processCoterieBindWebhook(payload, meta = {}) {
  return processCoteriePolicyWebhook(payload, meta);
}

/**
 * Client-initiated bind after Stripe payment method created (Coterie Stripe account).
 */
export async function processCoterieBindPayment({
  submissionPublicId,
  quoteId,
  stripeToken,
  stripePaymentMethodId,
  paymentPlan = "Annual",
  contactEmail = null,
}) {
  const session = await loadCoterieSession(submissionPublicId);
  const resolvedQuoteId = quoteId || session?.quoteId;
  if (!resolvedQuoteId) {
    return { ok: false, error: "QUOTE_ID_REQUIRED" };
  }
  if (!stripeToken && !stripePaymentMethodId) {
    return { ok: false, error: "PAYMENT_TOKEN_REQUIRED" };
  }

  const resolvedEmail = await resolveSubmissionContactEmail(
    submissionPublicId,
    contactEmail,
  );
  if (!resolvedEmail) {
    return {
      ok: false,
      error: "EMAIL_REQUIRED",
      message:
        "Insured email is required to bind. Go back and enter a valid email, then get a new quote.",
    };
  }

  const bindResult = await bindQuote(resolvedQuoteId, {
    stripeToken,
    stripePaymentMethodId,
    paymentPlan,
    contactEmail: resolvedEmail,
  });

  const body = bindResult.result;
  const errMsg =
    (Array.isArray(body?.errors) && body.errors[0]?.message) ||
    (typeof body?.errors?.[0] === "string" && body.errors[0]) ||
    body?.message ||
    null;
  if (body?.isSuccess === false || (body?.errors && body.errors.length)) {
    const stripePk = String(process.env.COTERIE_STRIPE_PUBLISHABLE_KEY || "").trim();
    let hint = null;
    if (/payment info is missing/i.test(String(errMsg || ""))) {
      if (!isCoteriePaymentBindReady() && stripePk.startsWith("pk_test_")) {
        hint = isDemoFinalizeAllowed()
          ? "Live payment is not enabled yet — use Skip payment — demo only to complete bind and open Connect."
          : "Production Coterie API is live but Stripe publishable key is still pk_test_. Set COTERIE_DEMO_FINALIZE_ENABLED=true or wait for Coterie pk_live_.";
      } else if (!isCoteriePaymentBindReady()) {
        hint =
          "Coterie rejected the payment token. Confirm prod Stripe key with Coterie and see API docs — Bind Using Stripe.";
      }
    }
    return {
      ok: false,
      error: "COTERIE_BIND_FAILED",
      message: errMsg || "Bind failed",
      hint,
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
  if (!isDemoFinalizeAllowed()) {
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
