import { randomUUID } from "node:crypto";
import {
  assertRefundConfigured,
  authorizeRequest,
  consumeCredits,
  refundCredits,
  CREDIT_COSTS,
  sendJson,
} from "../lib/commercial.js";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.API_KEY || "";

const buckets = globalThis.__MAGIS_LIVE_RATE_LIMIT__ || new Map();
globalThis.__MAGIS_LIVE_RATE_LIMIT__ = buckets;

function limited(req) {
  const forwarded = req.headers["x-forwarded-for"] || "";
  const ip = String(forwarded).split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const current = buckets.get(ip);

  if (!current || now >= current.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return null;
  }

  if (current.count >= 6) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }

  current.count += 1;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  const retryAfter = limited(req);
  if (retryAfter) {
    return sendJson(res, 429, { error: "Live token rate limit exceeded." }, {
      "Retry-After": String(retryAfter),
    });
  }

  let user;
  let client;
  let operationId;
  let charged = false;
  try {
    ({ user, client } = await authorizeRequest(req));
    assertRefundConfigured();
    operationId = randomUUID();
    await consumeCredits(client, user.id, operationId, "live", CREDIT_COSTS.live);
    charged = true;

    const key = apiKey();
    if (!key) {
      const error = new Error("Server AI credentials are not configured.");
      error.statusCode = 503;
      throw error;
    }

    const now = Date.now();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: "gemini-3.8-live",
          config: {
            responseModalities: ["AUDIO"],
            sessionResumption: {},
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Live token provisioning failed (${response.status}): ${detail.slice(0, 400)}`);
    }

    const data = await response.json();
    const token = data?.name;
    if (!token) throw new Error("Live token was not returned.");

    return sendJson(res, 200, { token });
  } catch (error) {
    if (charged) {
      try {
        await refundCredits(user.id, operationId, "live_token_provisioning_failed");
      } catch (refundError) {
        console.error("MAGIS_LIVE_CREDIT_REFUND_ERROR", {
          operationId,
          userId: user.id,
          error: refundError?.message,
        });
        return sendJson(res, 502, {
          error: "Live token provisioning failed and its credit refund could not be confirmed. Contact support.",
        });
      }
    }

    console.error("MAGIS_LIVE_TOKEN_ERROR", error);
    const status = Number(error?.statusCode) || 502;
    return sendJson(res, status, {
      error: status === 402 ? "Insufficient credits." : status === 401
        ? "Authentication required."
        : "Live service unavailable.",
    });
  }
}
