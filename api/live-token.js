import { randomUUID } from "node:crypto";
import { requireProviderApiKey } from "../lib/provider-config.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import {
  assertRefundConfigured,
  authorizeRequest,
  consumeCredits,
  refundCredits,
  CREDIT_COSTS,
  sendJson,
} from "../lib/commercial.js";


export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  if (!(await enforceRateLimit(req, res, {
    scope: "live-token", limit: 6, windowSeconds: 60,
  }))) return;

  let user;
  let client;
  let operationId;
  let charged = false;
  try {
    ({ user, client } = await authorizeRequest(req));
    if (!(await enforceRateLimit(req, res, {
      scope: "live-token", limit: 6, windowSeconds: 60, includeIp: false, userId: user.id,
    }))) return;
    const key = requireProviderApiKey("gemini");
    assertRefundConfigured();
    operationId = randomUUID();
    await consumeCredits(client, user.id, operationId, "live", CREDIT_COSTS.live);
    charged = true;

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
