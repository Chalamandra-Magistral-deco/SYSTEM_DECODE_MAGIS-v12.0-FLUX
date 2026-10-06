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
    res.statusCode = 429;
    res.setHeader("Retry-After", String(retryAfter));
    res.end("Rate limit exceeded.");
    return;
  }

  const key = apiKey();
  if (!key) {
    res.statusCode = 503;
    res.end("Video service unavailable.");
    return;
  }

  const rawUri = typeof req.query?.uri === "string" ? req.query.uri : "";
  if (!rawUri || rawUri.length > 3000) {
    res.statusCode = 400;
    res.end("Invalid video URI.");
    return;
  }

  let videoUri;
  try {
    videoUri = new URL(rawUri);
  } catch {
    res.statusCode = 400;
    res.end("Invalid video URI.");
    return;
  }

  if (videoUri.protocol !== "https:" || videoUri.hostname !== "generativelanguage.googleapis.com") {
    res.statusCode = 400;
    res.end("Video URI host is not allowed.");
    return;
  }

  videoUri.searchParams.delete("key");
  videoUri.searchParams.set("key", key);

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(videoUri.toString(), { headers });

    if (!upstream.ok && upstream.status !== 206) {
      const detail = await upstream.text();
      res.statusCode = upstream.status;
      res.end(detail.slice(0, 500) || "Video fetch failed.");
      return;
    }

    res.statusCode = upstream.status;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "video/mp4");

    for (const header of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
  } catch (error) {
    console.error("MAGIS_VIDEO_PROXY_ERROR", error);
    res.statusCode = 502;
    res.end("Video service unavailable.");
  }
}
