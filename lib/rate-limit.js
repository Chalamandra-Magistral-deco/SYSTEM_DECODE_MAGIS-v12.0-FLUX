import { createHash } from "node:crypto";
import { createServiceClient, sendJson } from "./commercial.js";

function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(first || "").split(",")[0].trim()
    || req.socket?.remoteAddress
    || "unknown";
}

function bucketKey(scope, subject) {
  return createHash("sha256")
    .update(`magis-rate-limit:v1:${scope}:${subject}`)
    .digest("hex");
}

async function consume(client, scope, subject, limit, windowSeconds) {
  const { data, error } = await client.rpc("consume_rate_limit", {
    p_bucket_key: bucketKey(scope, subject),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    const unavailable = new Error("Shared rate limiting is unavailable.", { cause: error });
    unavailable.statusCode = 503;
    throw unavailable;
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (typeof result?.allowed !== "boolean") {
    const invalid = new Error("Shared rate limiter returned an invalid response.");
    invalid.statusCode = 503;
    throw invalid;
  }
  return {
    allowed: result.allowed,
    retryAfter: Math.max(1, Number(result.retry_after_seconds) || windowSeconds),
  };
}

/** IP checks run before authentication; user checks run after authorization. */
export async function enforceRateLimit(
  req,
  res,
  { scope, limit, windowSeconds = 60, includeIp = true, userId } = {},
) {
  try {
    const client = createServiceClient();
    if (includeIp) {
      const result = await consume(client, `ip:${scope}`, clientIp(req), limit, windowSeconds);
      if (!result.allowed) {
        sendJson(res, 429, { error: "Rate limit exceeded. Retry shortly." }, {
          "Retry-After": String(result.retryAfter),
        });
        return false;
      }
    }
    if (userId) {
      const result = await consume(client, `user:${scope}`, String(userId), limit, windowSeconds);
      if (!result.allowed) {
        sendJson(res, 429, { error: "Rate limit exceeded. Retry shortly." }, {
          "Retry-After": String(result.retryAfter),
        });
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("MAGIS_SHARED_RATE_LIMIT_ERROR", {
      scope,
      message: error?.message || "unknown_error",
    });
    sendJson(res, 503, { error: "Request protection is temporarily unavailable." });
    return false;
  }
}
