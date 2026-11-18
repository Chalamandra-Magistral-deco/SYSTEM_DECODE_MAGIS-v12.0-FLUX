import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, createServiceClientMock, sendJsonMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  sendJsonMock: vi.fn(),
}));

vi.mock("./commercial.js", () => ({
  createServiceClient: createServiceClientMock,
  sendJson: sendJsonMock,
}));

import { enforceRateLimit } from "./rate-limit.js";

describe("shared rate limiter", () => {
  const req = {
    headers: {
      "x-vercel-forwarded-for": "198.51.100.23",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = {};

  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ rpc: rpcMock });
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0, remaining: 9 }],
      error: null,
    });
  });

  it("uses separate hashed IP and user buckets", async () => {
    expect(await enforceRateLimit(req, res, {
      scope: "gemini-text", limit: 30, windowSeconds: 60, userId: "user-123",
    })).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const expectedIpKey = createHash("sha256")
      .update("magis-rate-limit:v1:ip:gemini-text:198.51.100.23")
      .digest("hex");
    expect(rpcMock.mock.calls[0][1].p_bucket_key).toBe(expectedIpKey);
    for (const call of rpcMock.mock.calls) {
      expect(call[1].p_bucket_key).toMatch(/^[0-9a-f]{64}$/);
      expect(call[1].p_bucket_key).not.toContain("203.0.113.10");
      expect(call[1].p_bucket_key).not.toContain("user-123");
    }
  });

  it("returns 429 with Retry-After when the IP bucket is exhausted", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ allowed: false, retry_after_seconds: 17, remaining: 0 }], error: null,
    });
    expect(await enforceRateLimit(req, res, {
      scope: "live-token", limit: 6, windowSeconds: 60,
    })).toBe(false);
    expect(sendJsonMock).toHaveBeenCalledWith(res, 429,
      { error: "Rate limit exceeded. Retry shortly." }, { "Retry-After": "17" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when the user bucket is exhausted", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ allowed: false, retry_after_seconds: 9 }], error: null,
    });
    expect(await enforceRateLimit(req, res, {
      scope: "checkout", limit: 5, windowSeconds: 60, includeIp: false, userId: "user-123",
    })).toBe(false);
    expect(sendJsonMock).toHaveBeenCalledWith(res, 429,
      { error: "Rate limit exceeded. Retry shortly." }, { "Retry-After": "9" });
  });

  it("fails closed when the shared store is unavailable", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    expect(await enforceRateLimit(req, res, {
      scope: "feedback", limit: 10, windowSeconds: 60,
    })).toBe(false);
    expect(sendJsonMock).toHaveBeenCalledWith(res, 503,
      { error: "Request protection is temporarily unavailable." });
  });
});
