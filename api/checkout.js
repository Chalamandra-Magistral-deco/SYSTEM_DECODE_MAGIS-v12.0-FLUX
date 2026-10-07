import { authorizeRequest, createServiceClient, sendJson } from "../lib/commercial.js";

const stripeKey = () => process.env.STRIPE_SECRET_KEY || "";

const getBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

const requirePlanCode = (value) => {
  if (typeof value !== "string" || !/^[a-z0-9_-]{2,40}$/.test(value)) {
    const error = new Error("Plan code is invalid.");
    error.statusCode = 400;
    throw error;
  }
  return value;
};

const getAppUrl = () => {
  const raw = process.env.MAGIS_APP_URL;
  if (!raw) {
    const error = new Error("MAGIS_APP_URL is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    const error = new Error("MAGIS_APP_URL must use HTTPS.");
    error.statusCode = 503;
    throw error;
  }

  return url;
};

const getStripePrice = async (key, priceId) => {
  const response = await fetch(
    `https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Stripe price lookup failed (${response.status}).`);
  }

  if (
    data?.active !== true ||
    data?.type !== "one_time" ||
    typeof data?.unit_amount !== "number" ||
    typeof data?.currency !== "string"
  ) {
    throw new Error("Configured Stripe price is not a valid one-time active price.");
  }

  return data;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const { user } = await authorizeRequest(req);
    const body = getBody(req);
    const planCode = requirePlanCode(body.planCode);

    if (planCode === "free") {
      return sendJson(res, 400, { error: "The free plan cannot be purchased." });
    }

    const key = stripeKey();
    if (!key) {
      return sendJson(res, 503, { error: "Stripe checkout is not configured." });
    }

    const admin = createServiceClient();
    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id,code,name,credits,price_cents,currency,active")
      .eq("code", planCode)
      .eq("active", true)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan || plan.price_cents <= 0) {
      return sendJson(res, 404, { error: "Paid plan not available." });
    }

    const priceId = process.env[`STRIPE_PRICE_${planCode.toUpperCase()}`];
    if (!priceId) {
      return sendJson(res, 503, { error: `Stripe price is not configured for ${planCode}.` });
    }

    const stripePrice = await getStripePrice(key, priceId);
    if (
      stripePrice.unit_amount !== plan.price_cents ||
      stripePrice.currency.toLowerCase() !== plan.currency.toLowerCase()
    ) {
      return sendJson(res, 503, { error: "Stripe price does not match the active MAGIS plan." });
    }

    const appUrl = getAppUrl();
    const successUrl = new URL("/", appUrl);
    successUrl.searchParams.set("checkout", "success");
    successUrl.searchParams.set("plan", plan.code);

    const cancelUrl = new URL("/", appUrl);
    cancelUrl.searchParams.set("checkout", "cancelled");

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("line_items[0][price]", priceId);
    form.set("line_items[0][quantity]", "1");
    form.set("client_reference_id", user.id);
    form.set("customer_email", user.email || "");
    form.set("allow_promotion_codes", "true");
    form.set("success_url", successUrl.toString());
    form.set("cancel_url", cancelUrl.toString());
    form.set("metadata[user_id]", user.id);
    form.set("metadata[plan_code]", plan.code);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data?.url !== "string") {
      console.error("MAGIS_STRIPE_CHECKOUT_CREATE_FAILED", {
        status: response.status,
        userId: user.id,
        planCode: plan.code,
      });
      return sendJson(res, 502, { error: "Unable to initialize Stripe Checkout." });
    }

    return sendJson(res, 200, {
      url: data.url,
      sessionId: data.id,
      plan: {
        code: plan.code,
        credits: plan.credits,
        price_cents: plan.price_cents,
        currency: plan.currency,
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    console.error("MAGIS_CHECKOUT_ERROR", {
      status,
      message: error?.message || "unknown_error",
    });
    return sendJson(res, status, {
      error: status >= 500 ? "Checkout is temporarily unavailable." : error?.message,
    });
  }
}
