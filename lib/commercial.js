import { createClient } from "@supabase/supabase-js";

export const CREDIT_COSTS = {
  text: 1,
  thinking: 3,
  search: 1,
  image: 25,
  speech: 5,
  videoStart: 50,
  videoAnalysis: 3,
  live: 5,
};

export function isAllowedGeneratedVideoUri(rawUri) {
  try {
    const uri = new URL(rawUri);
    return uri.protocol === "https:"
      && uri.hostname === "generativelanguage.googleapis.com"
      && /^\/v1beta\/files\/[A-Za-z0-9_-]+(?::download)?$/.test(uri.pathname);
  } catch {
    return false;
  }
}

function createUserClient(accessToken) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const error = new Error("Supabase server configuration is incomplete.");
    error.statusCode = 503;
    throw error;
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function authorizeRequest(req) {
  const authorization = req.headers.authorization || "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const client = createUserClient(match[1]);
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) {
    const unauthorized = new Error("Invalid or expired session.");
    unauthorized.statusCode = 401;
    throw unauthorized;
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    const unavailable = new Error("Account authorization is unavailable.");
    unavailable.statusCode = 503;
    throw unavailable;
  }
  if (profile?.status !== "active") {
    const forbidden = new Error("Account is not active.");
    forbidden.statusCode = 403;
    throw forbidden;
  }

  return { user: data.user, client };
}

export async function consumeCredits(client, userId, operationId, capability, amount) {
  const admin = createServiceClient();

  const { data, error } = await admin.rpc("consume_credits", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_capability: capability,
    p_credits_required: amount,
  });
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    const failure = new Error(result?.status || "Credit authorization failed.");
    failure.statusCode = result?.status === "insufficient_credits" ? 402 : 403;
    throw failure;
  }
}

export async function refundCredits(userId, operationId, reason) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service-role configuration is missing; credits could not be refunded.");
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("refund_execution_credits", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_reason: reason,
  });
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    throw new Error(`Credit refund failed: ${result?.status || "unknown status"}.`);
  }
}

export function assertRefundConfigured() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Credit refund service is not configured.");
    error.statusCode = 503;
    throw error;
  }
}

export function sendJson(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}

export function createServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    const error = new Error("Supabase service-role configuration is missing.");
    error.statusCode = 503;
    throw error;
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createVideoOperation(userId, operationId) {
  const admin = createServiceClient();

  const { error } = await admin
    .from("video_operations")
    .insert({
      operation_id: operationId,
      user_id: userId,
      status: "pending",
    });

  if (error) throw error;
}

export async function bindVideoProviderOperation(
  userId,
  operationId,
  providerOperationName,
) {
  const admin = createServiceClient();

  const { data, error } = await admin
    .from("video_operations")
    .update({
      provider_operation_name: providerOperationName,
    })
    .eq("operation_id", operationId)
    .eq("user_id", userId)
    .select("operation_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Video operation ownership record not found.");
}

export async function getVideoOperation(userId, operationId) {
  const admin = createServiceClient();

  const { data, error } = await admin
    .from("video_operations")
    .select(
      "operation_id,user_id,provider_operation_name,video_uri,status,created_at,completed_at",
    )
    .eq("operation_id", operationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function completeVideoOperation(
  userId,
  operationId,
  videoUri,
) {
  if (!isAllowedGeneratedVideoUri(videoUri)) {
    throw new Error("Generated video URI is not an allowed media path.");
  }

  const admin = createServiceClient();

  const { data, error } = await admin
    .from("video_operations")
    .update({
      video_uri: videoUri,
      status: "complete",
      completed_at: new Date().toISOString(),
    })
    .eq("operation_id", operationId)
    .eq("user_id", userId)
    .select("operation_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Video operation ownership record not found.");
}

export async function failVideoOperation(userId, operationId) {
  const admin = createServiceClient();

  const { data, error } = await admin
    .from("video_operations")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
    })
    .eq("operation_id", operationId)
    .eq("user_id", userId)
    .neq("status", "complete")
    .select("operation_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Video operation ownership record not found.");
}
