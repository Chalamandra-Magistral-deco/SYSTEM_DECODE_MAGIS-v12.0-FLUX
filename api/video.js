import {
  authorizeRequest,
  getVideoOperation,
  isAllowedGeneratedVideoUri,
  sendJson,
} from "../lib/commercial.js";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.API_KEY || "";

const buckets = globalThis.__MAGIS_VIDEO_STREAM_LIMIT__ || new Map();
globalThis.__MAGIS_VIDEO_STREAM_LIMIT__ = buckets;

function limited(req) {
  const forwarded = req.headers["x-forwarded-for"] || "";
  const ip = String(forwarded).split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const current = buckets.get(ip);

  if (!current || now >= current.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return null;
  }

  if (current.count >= 20) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }

  current.count += 1;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.end("Method not allowed.");
    return;
  }

  const retryAfter = limited(req);
  if (retryAfter) {
    return sendJson(res, 429, { error: "Rate limit exceeded." }, {
      "Retry-After": String(retryAfter),
    });
  }

  let user;
  try {
    ({ user } = await authorizeRequest(req));
  } catch (error) {
    const status = Number(error?.statusCode) || 503;
    return sendJson(res, status, {
      error: status === 401 ? "Authentication required." : "Video service unavailable.",
    });
  }

  const operationId =
    typeof req.query?.operationId === "string"
      ? req.query.operationId
      : "";

  if (
    !operationId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      operationId,
    )
  ) {
    return sendJson(res, 400, { error: "Invalid video operation." });
  }

  const operation = await getVideoOperation(user.id, operationId);

  if (!operation?.video_uri || operation.status !== "complete") {
    return sendJson(res, 404, { error: "Video not available." });
  }

  if (!isAllowedGeneratedVideoUri(operation.video_uri)) {
    return sendJson(res, 502, { error: "Stored video URI is invalid." });
  }

  const key = apiKey();
  if (!key) {
    return sendJson(res, 503, { error: "Video service unavailable." });
  }

  const videoUri = new URL(operation.video_uri);
  videoUri.searchParams.delete("key");

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    headers["x-goog-api-key"] = key;

    const upstream = await fetch(videoUri.toString(), { headers });

    if (!upstream.ok && upstream.status !== 206) {
      const detail = await upstream.text();
      return sendJson(
        res,
        upstream.status,
        { error: detail.slice(0, 500) || "Video fetch failed." },
      );
    }

    res.statusCode = upstream.status;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "video/mp4",
    );

    for (const header of [
      "content-length",
      "content-range",
      "accept-ranges",
    ]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
  } catch (error) {
    console.error("MAGIS_VIDEO_PROXY_ERROR", error);
    return sendJson(res, 502, { error: "Video service unavailable." });
  }
}
