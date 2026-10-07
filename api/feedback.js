import {
  authorizeRequest,
  createServiceClient,
  getVideoOperation,
  sendJson,
} from "../lib/commercial.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set(["READY", "FAILED", "TIMEOUT", "CANCELLED"]);
const ALLOWED_ERROR_CODES = new Set([
  "AUTH_ERROR",
  "VALIDATION_ERROR",
  "RATE_LIMIT",
  "PROVIDER_ERROR",
  "NETWORK_ERROR",
  "TIMEOUT",
  "UNKNOWN",
]);
const ALLOWED_MODELS = new Set(["veo-3.1-generate-preview"]);
const ALLOWED_FIELDS = new Set([
  "requestId",
  "operationId",
  "feature",
  "action",
  "status",
  "durationMs",
  "model",
  "errorCode",
  "retry",
  "rating",
]);

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function isValidEvent(event) {
  return event && typeof event === "object" && !Array.isArray(event)
    && Object.keys(event).every((field) => ALLOWED_FIELDS.has(field))
    && typeof event.requestId === "string"
    && UUID_PATTERN.test(event.requestId)
    && (event.operationId === undefined || (
      typeof event.operationId === "string" && UUID_PATTERN.test(event.operationId)
    ))
    && event.feature === "media"
    && event.action === "video.generate"
    && ALLOWED_STATUSES.has(event.status)
    && Number.isSafeInteger(event.durationMs)
    && event.durationMs >= 0
    && event.durationMs <= 86_400_000
    && ALLOWED_MODELS.has(event.model)
    && (event.errorCode === undefined || ALLOWED_ERROR_CODES.has(event.errorCode))
    && typeof event.retry === "boolean"
    && (event.rating === undefined || (
      Number.isInteger(event.rating) && event.rating >= 1 && event.rating <= 5
    ));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const { user } = await authorizeRequest(req);
    const event = getBody(req);
    if (!isValidEvent(event)) {
      return sendJson(res, 400, { error: "Feedback data is invalid." });
    }

    if (event.operationId) {
      const operation = await getVideoOperation(user.id, event.operationId);
      if (!operation) {
        return sendJson(res, 400, {
          error: "Feedback operation is invalid.",
        });
      }
    }

    const row = {
      user_id: user.id,
      request_id: event.requestId,
      operation_id: event.operationId || null,
      feature: event.feature,
      action: event.action,
      status: event.status,
      duration_ms: event.durationMs,
      model: event.model,
      error_code: event.errorCode || null,
      retry: event.retry,
      ...(event.rating === undefined ? {} : { rating: event.rating }),
    };
    const admin = createServiceClient();
    if (event.rating === undefined) {
      const { error } = await admin.from("operation_feedback").insert(row);
      if (error?.code === "23505") return sendJson(res, 200, { recorded: true });
      if (error) throw error;
    } else {
      const { data, error } = await admin
        .from("operation_feedback")
        .update({ rating: event.rating })
        .eq("user_id", user.id)
        .eq("request_id", event.requestId)
        .eq("action", event.action)
        .eq("status", event.status)
        .select("id");
      if (error) throw error;

      if (!data?.length) {
        const { error: insertError } = await admin
          .from("operation_feedback")
          .insert(row);
        if (insertError?.code === "23505") return sendJson(res, 200, { recorded: true });
        if (insertError) throw insertError;
      }
    }

    return sendJson(res, 200, { recorded: true });
  } catch (error) {
    const status = Number(error?.statusCode) || 503;
    console.error("MAGIS_FEEDBACK_ERROR", { status, message: error?.message });
    return sendJson(res, status, {
      error: status === 401 || status === 403
        ? "Authentication required."
        : "Feedback could not be recorded.",
    });
  }
}
