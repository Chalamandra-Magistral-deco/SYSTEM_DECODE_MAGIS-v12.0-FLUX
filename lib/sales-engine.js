const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_CODE_PATTERN = /^[a-z0-9_-]{2,40}$/;

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isPaidCheckoutEvent(event) {
  if (event?.type === "checkout.session.async_payment_succeeded") return true;
  if (event?.type !== "checkout.session.completed") return false;
  return event.data?.object?.payment_status === "paid";
}

export function getEventPaymentIntentId(session) {
  if (typeof session?.payment_intent === "string") return session.payment_intent;
  return session?.payment_intent?.id || null;
}

/**
 * Route a verified, paid Checkout Session without granting entitlements from
 * client-controlled metadata alone. Invalid/incomplete credit metadata becomes
 * a durable review case instead of a silently acknowledged fulfillment.
 */
export function classifyCheckoutSession(session) {
  const metadata = session?.metadata ?? {};
  const planCode = typeof metadata.plan_code === "string" ? metadata.plan_code : null;
  const userId = typeof metadata.user_id === "string" ? metadata.user_id : null;
  const hasCreditMetadata = planCode !== null || userId !== null;

  if (hasCreditMetadata) {
    if (!planCode || !PLAN_CODE_PATTERN.test(planCode) || !isUuid(userId)) {
      return { kind: "review", reason: "incomplete_credit_metadata" };
    }

    if (session?.client_reference_id !== userId) {
      return { kind: "review", reason: "credit_identity_mismatch" };
    }

    return { kind: "credits", planCode, userId };
  }

  const paymentLinkId = typeof session?.payment_link === "string"
    ? session.payment_link
    : session?.payment_link?.id;

  if (typeof paymentLinkId === "string" && paymentLinkId.length > 0) {
    return { kind: "payment_link", paymentLinkId };
  }

  return { kind: "review", reason: "unmapped_paid_checkout" };
}
