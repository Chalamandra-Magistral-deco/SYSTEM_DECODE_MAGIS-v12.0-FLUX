import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient, sendJson } from "../lib/commercial.js";
import {
  classifyCheckoutSession,
  getEventPaymentIntentId,
  isPaidCheckoutEvent,
  isUuid,
} from "../lib/sales-engine.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BODY_BYTES = 1_000_000;
const SIGNATURE_TOLERANCE_SECONDS = 300;

const readRawBody = async (req) => {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("Webhook payload is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
};

const secureEqualHex = (left, right) => {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

const verifyStripeSignature = (rawBody, header, secret) => {
  const values = String(header || "")
    .split(",")
    .map(part => part.trim().split("="))
    .filter(([key, value]) => key && value)
    .reduce((result, [key, value]) => {
      if (!result[key]) result[key] = [];
      result[key].push(value);
      return result;
    }, {});

  const timestamp = Number(values.t?.[0]);
  const signatures = values.v1 || [];

  if (!Number.isInteger(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return signatures.some(signature => secureEqualHex(expected, signature));
};

const normalizeStripeAmounts = (session) => ({
  total: session?.amount_total,
  subtotal: Number.isInteger(session?.amount_subtotal) ? session.amount_subtotal : null,
  tax: Number.isInteger(session?.total_details?.amount_tax) ? session.total_details.amount_tax : 0,
  discount: Number.isInteger(session?.total_details?.amount_discount)
    ? session.total_details.amount_discount
    : 0,
});

const getCustomerEmail = (session) => {
  const email = session?.customer_details?.email || session?.customer_email;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
};

const getPaymentLinkId = (session) => {
  if (typeof session?.payment_link === "string") return session.payment_link;
  return session?.payment_link?.id || null;
};

const firstRpcRow = (data) => Array.isArray(data) ? data[0] : data;

const persistSaleForReview = async ({
  admin,
  event,
  session,
  route,
  amounts,
  currency,
  reason,
}) => {
  const metadata = {
    source: "stripe_checkout",
    event_type: event.type,
    route: route.kind,
    review_reason: reason || route.reason || null,
    session_mode: session.mode || null,
    session_status: session.status || null,
    payment_status: session.payment_status || null,
  };

  const { data, error } = await admin.rpc("record_payment_link_sale", {
    p_provider_event_id: event.id,
    p_provider_session_id: session.id,
    p_payment_intent_id: getEventPaymentIntentId(session),
    p_payment_link_id: getPaymentLinkId(session),
    p_buyer_user_id: null,
    p_customer_email: getCustomerEmail(session),
    p_amount_total_cents: amounts.total,
    p_amount_subtotal_cents: amounts.subtotal,
    p_amount_tax_cents: amounts.tax,
    p_amount_discount_cents: amounts.discount,
    p_currency: currency,
    p_force_review: true,
    p_review_reason: reason || route.reason || "credit_purchase_validation_failed",
    p_metadata: metadata,
  });

  if (error) return { error };
  const result = firstRpcRow(data);
  if (!result?.receipt_id) {
    return { error: new Error("Sale review RPC returned no receipt identifier.") };
  }
  return { result };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return sendJson(res, 503, { error: "Stripe webhook is not configured." });

  try {
    const rawBody = await readRawBody(req);
    if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"], secret)) {
      return sendJson(res, 400, { error: "Invalid Stripe signature." });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    if (!isPaidCheckoutEvent(event)) {
      return sendJson(res, 200, { received: true, ignored: true });
    }

    const session = event.data?.object;
    const amounts = normalizeStripeAmounts(session);
    const currency = typeof session?.currency === "string"
      ? session.currency.toUpperCase()
      : null;

    if (
      typeof event.id !== "string" ||
      typeof session?.id !== "string" ||
      !Number.isInteger(amounts.total) ||
      amounts.total <= 0 ||
      typeof currency !== "string" ||
      currency.length !== 3
    ) {
      console.error("MAGIS_STRIPE_PAID_SESSION_INCOMPLETE", {
        eventId: typeof event.id === "string" ? event.id : null,
        sessionId: typeof session?.id === "string" ? session.id : null,
      });
      return sendJson(res, 500, { error: "Paid Checkout Session is incomplete; delivery must be retried." });
    }

    const route = classifyCheckoutSession(session);
    const admin = createServiceClient();

    if (route.kind === "credits") {
      const { data, error } = await admin.rpc("grant_purchase_credits", {
        p_user_id: route.userId,
        p_plan_code: route.planCode,
        p_provider_session_id: session.id,
        p_provider_event_id: event.id,
        p_provider_payment_id: getEventPaymentIntentId(session),
        p_amount_cents: amounts.total,
        p_currency: currency,
      });

      if (error) {
        // Business validation errors are durably captured for human review.
        // Transient database/network errors return 5xx so Stripe retries.
        if (error.code === "P0001") {
          const review = await persistSaleForReview({
            admin, event, session, route, amounts, currency,
            reason: "credit_purchase_validation_failed",
          });
          if (review.error) {
            console.error("MAGIS_STRIPE_REVIEW_CAPTURE_FAILED", {
              eventId: event.id,
              sessionId: session.id,
              databaseCode: review.error.code || null,
            });
            return sendJson(res, 500, { error: "Paid session could not be durably queued for review." });
          }
          return sendJson(res, 200, {
            received: true,
            recorded: true,
            status: "review_required",
            receiptId: review.result.receipt_id,
          });
        }

        console.error("MAGIS_STRIPE_CREDIT_FULFILLMENT_FAILED", {
          eventId: event.id,
          sessionId: session.id,
          databaseCode: error.code || null,
        });
        return sendJson(res, 500, { error: "Purchase fulfillment failed; delivery must be retried." });
      }

      const grant = firstRpcRow(data);
      if (grant?.granted !== true) {
        return sendJson(res, 500, { error: "Credit grant returned no successful result." });
      }

      const { data: receiptData, error: receiptError } = await admin.rpc(
        "record_credit_sale_receipt",
        {
          p_user_id: route.userId,
          p_plan_code: route.planCode,
          p_provider_session_id: session.id,
          p_provider_event_id: event.id,
          p_provider_payment_id: getEventPaymentIntentId(session),
          p_customer_email: getCustomerEmail(session),
          p_amount_total_cents: amounts.total,
          p_amount_subtotal_cents: amounts.subtotal,
          p_amount_tax_cents: amounts.tax,
          p_amount_discount_cents: amounts.discount,
          p_currency: currency,
        },
      );

      if (receiptError) {
        console.error("MAGIS_STRIPE_SALES_RECEIPT_FAILED", {
          eventId: event.id,
          sessionId: session.id,
          databaseCode: receiptError.code || null,
        });
        return sendJson(res, 500, { error: "Sale receipt could not be persisted; delivery must be retried." });
      }

      const receipt = firstRpcRow(receiptData);
      if (!receipt?.receipt_id) {
        return sendJson(res, 500, { error: "Sale receipt returned no identifier; delivery must be retried." });
      }

      return sendJson(res, 200, {
        received: true,
        recorded: true,
        creditStatus: grant.status || "granted",
        receiptId: receipt.receipt_id,
        replayed: Boolean(receipt.replayed),
      });
    }

    const metadata = {
      source: "stripe_checkout",
      event_type: event.type,
      route: route.kind,
      review_reason: route.kind === "review" ? route.reason : null,
      session_mode: session.mode || null,
      session_status: session.status || null,
      payment_status: session.payment_status || null,
    };

    const userIdFromMetadata = session?.metadata?.user_id;
    const buyerUserId = route.kind !== "review" && isUuid(userIdFromMetadata)
      ? userIdFromMetadata
      : null;

    const { data, error } = await admin.rpc("record_payment_link_sale", {
      p_provider_event_id: event.id,
      p_provider_session_id: session.id,
      p_payment_intent_id: getEventPaymentIntentId(session),
      p_payment_link_id: getPaymentLinkId(session),
      p_buyer_user_id: buyerUserId,
      p_customer_email: getCustomerEmail(session),
      p_amount_total_cents: amounts.total,
      p_amount_subtotal_cents: amounts.subtotal,
      p_amount_tax_cents: amounts.tax,
      p_amount_discount_cents: amounts.discount,
      p_currency: currency,
      p_force_review: route.kind === "review",
      p_review_reason: route.kind === "review" ? route.reason : null,
      p_metadata: metadata,
    });

    if (error) {
      console.error("MAGIS_STRIPE_SALE_CAPTURE_FAILED", {
        eventId: event.id,
        sessionId: session.id,
        databaseCode: error.code || null,
      });
      return sendJson(res, 500, { error: "Paid sale could not be durably persisted; delivery must be retried." });
    }

    const sale = firstRpcRow(data);
    if (!sale?.receipt_id) {
      return sendJson(res, 500, { error: "Sale capture returned no receipt identifier; delivery must be retried." });
    }

    return sendJson(res, 200, {
      received: true,
      recorded: true,
      status: sale.status,
      fulfillmentStatus: sale.fulfillment_status,
      receiptId: sale.receipt_id,
      replayed: Boolean(sale.replayed),
    });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    console.error("MAGIS_STRIPE_WEBHOOK_ERROR", {
      status,
      message: error?.message || "unknown_error",
    });
    return sendJson(res, status, {
      error: status === 500 ? "Webhook processing failed; delivery must be retried." : error?.message,
    });
  }
}
