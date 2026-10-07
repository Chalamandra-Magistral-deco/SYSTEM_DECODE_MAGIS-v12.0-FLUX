import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createServiceClient,
  sendJson,
} from "../lib/commercial.js";

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

  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    return false;
  }

  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  return signatures.some(signature => secureEqualHex(expected, signature));
};

const getEventPaymentIntentId = (session) =>
  typeof session?.payment_intent === "string"
    ? session.payment_intent
    : session?.payment_intent?.id || null;

const isPaidCheckoutEvent = (event) => {
  if (event.type === "checkout.session.async_payment_succeeded") return true;
  if (event.type !== "checkout.session.completed") return false;
  return event.data?.object?.payment_status === "paid";
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return sendJson(res, 503, { error: "Stripe webhook is not configured." });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];

    if (!verifyStripeSignature(rawBody, signature, secret)) {
      return sendJson(res, 400, { error: "Invalid Stripe signature." });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    if (!isPaidCheckoutEvent(event)) {
      return sendJson(res, 200, { received: true, ignored: true });
    }

    const session = event.data?.object;
    const userId = session?.metadata?.user_id;
    const planCode = session?.metadata?.plan_code;
    const sessionId = session?.id;
    const amountTotal = session?.amount_total;
    const currency = session?.currency;
    const eventId = event?.id;

    if (
      typeof userId !== "string" ||
      typeof planCode !== "string" ||
      typeof sessionId !== "string" ||
      typeof amountTotal !== "number" ||
      typeof currency !== "string" ||
      typeof eventId !== "string"
    ) {
      return sendJson(res, 400, { error: "Stripe checkout event is incomplete." });
    }

    if (session?.client_reference_id !== userId) {
      return sendJson(res, 400, { error: "Stripe checkout identity mismatch." });
    }

    const admin = createServiceClient();
    const { data, error } = await admin.rpc("grant_purchase_credits", {
      p_user_id: userId,
      p_plan_code: planCode,
      p_provider_session_id: sessionId,
      p_provider_event_id: eventId,
      p_provider_payment_id: getEventPaymentIntentId(session),
      p_amount_cents: amountTotal,
      p_currency: currency,
    });

    if (error) {
      console.error("MAGIS_STRIPE_FULFILLMENT_FAILED", {
        eventId,
        sessionId,
        userId,
        planCode,
      });
      return sendJson(res, 500, { error: "Purchase fulfillment failed." });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return sendJson(res, 200, {
      received: true,
      status: result?.status || "granted",
      replayed: Boolean(result?.replayed),
    });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    console.error("MAGIS_STRIPE_WEBHOOK_ERROR", {
      status,
      message: error?.message || "unknown_error",
    });
    return sendJson(res, status, {
      error: status === 500 ? "Webhook processing failed." : error?.message,
    });
  }
}
