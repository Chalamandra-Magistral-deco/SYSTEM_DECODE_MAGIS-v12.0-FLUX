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
    res.statusCode = 429;
    res.setHeader("Retry-After", String(retryAfter));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Live token rate limit exceeded." }));
    return;
  }

  const key = apiKey();
  if (!key) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Server AI credentials are not configured." }));
    return;
  }

  try {
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

    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ token }));
  } catch (error) {
    console.error("MAGIS_LIVE_TOKEN_ERROR", error);
    res.statusCode = 502;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Live service unavailable." }));
  }
}
