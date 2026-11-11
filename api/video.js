import { enforceRateLimit } from "../lib/rate-limit.js";
import {
  authorizeRequest,
  getVideoOperation,
  isAllowedGeneratedVideoUri,
  sendJson,
} from "../lib/commercial.js";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.API_KEY || "";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.end("Method not allowed.");
    return;
  }

  if (!(await enforceRateLimit(req, res, {
    scope: "video-stream", limit: 20, windowSeconds: 60,
  }))) return;

  let user;
  try {
    ({ user } = await authorizeRequest(req));
    if (!(await enforceRateLimit(req, res, {
      scope: "video-stream", limit: 20, windowSeconds: 60, includeIp: false, userId: user.id,
    }))) return;
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
