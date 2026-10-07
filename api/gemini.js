import { GoogleGenAI, Modality } from "@google/genai";
import { randomUUID } from "node:crypto";
import {
  assertRefundConfigured,
  authorizeRequest,
  consumeCredits,
  refundCredits,
  CREDIT_COSTS,
  sendJson,
  createVideoOperation,
  bindVideoProviderOperation,
  getVideoOperation,
  completeVideoOperation,
  failVideoOperation,
} from "../lib/commercial.js";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.API_KEY || "";

const buckets = globalThis.__MAGIS_RATE_LIMIT__ || new Map();
globalThis.__MAGIS_RATE_LIMIT__ = buckets;

function rateLimit(req, bucket, limit, windowMs) {
  const forwarded = req.headers["x-forwarded-for"] || "";
  const ip = String(forwarded).split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return { retryAfter };
  }

  current.count += 1;
  return true;
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function requireApiKey() {
  const key = apiKey();
  if (!key) {
    const error = new Error("Server AI credentials are not configured.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}

function requireString(value, name, maxLength = 12000) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${name} is required.`);
    error.statusCode = 400;
    throw error;
  }
  if (value.length > maxLength) {
    const error = new Error(`${name} exceeds the allowed size.`);
    error.statusCode = 413;
    throw error;
  }
  return value;
}

function requireOneOf(value, allowed, name) {
  if (!allowed.includes(value)) {
    const error = new Error(`${name} is invalid.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

async function handleText(ai, payload) {
  const prompt = requireString(payload.prompt, "Prompt");
  const systemInstruction = typeof payload.systemInstruction === "string"
    ? payload.systemInstruction.slice(0, 6000)
    : undefined;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt,
    config: systemInstruction ? { systemInstruction } : undefined,
  });

  return { text: response.text || "" };
}

async function handleThinking(ai, payload) {
  const prompt = requireString(payload.prompt, "Prompt");
  const context = typeof payload.context === "string" ? payload.context.slice(0, 20000) : "";

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: `Context: ${context}\n\nTask: ${prompt}`,
    config: {
      thinkingConfig: { thinkingLevel: "high" },
    },
  });

  return { text: response.text || "" };
}

async function handleSearch(ai, payload) {
  const query = requireString(payload.query, "Query", 4000);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: query,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  return {
    text: response.text || "",
    grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [],
  };
}

async function handleImage(payload, key) {
  const prompt = requireString(payload.prompt, "Prompt");
  const aspectRatio = requireOneOf(
    payload.aspectRatio || "1:1",
    ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"],
    "Aspect ratio"
  );
  const size = requireOneOf(payload.size || "1K", ["1K", "2K", "4K"], "Image size");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image",
      input: prompt,
      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: aspectRatio,
        image_size: size,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  const base64 = data?.output_image?.data;
  if (!base64) throw new Error("No image generated.");

  return { image: `data:image/png;base64,${base64}` };
}

async function handleSpeech(ai, payload) {
  const text = requireString(payload.text, "Text", 16000);

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  });

  const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audio) throw new Error("No audio generated.");

  return { audio };
}

async function handleVideoStart(ai, payload, userId, operationId) {
  const prompt = requireString(payload.prompt, "Prompt", 8000);
  const aspectRatio = requireOneOf(
    payload.aspectRatio || "16:9",
    ["16:9", "9:16"],
    "Aspect ratio"
  );

  await createVideoOperation(userId, operationId);

  let operation;
  try {
    operation = await ai.models.generateVideos({
      model: "veo-3.1-generate-preview",
      prompt,
      config: {
        numberOfVideos: 1,
        resolution: "720p",
        aspectRatio,
      },
    });
  } catch (error) {
    const providerStatus = Number(error?.status ?? error?.statusCode);
    if (providerStatus >= 400 && providerStatus < 500 && providerStatus !== 408) {
      await failVideoOperation(userId, operationId);
      throw error;
    }

    console.error("MAGIS_VIDEO_START_RECONCILIATION_REQUIRED", {
      operationId,
      userId,
      providerStatus: Number.isFinite(providerStatus) ? providerStatus : null,
    });
    const reconciliationError = new Error(
      "Video start status is uncertain; provider execution may still be running.",
      { cause: error },
    );
    reconciliationError.statusCode = 503;
    reconciliationError.reconciliationRequired = true;
    reconciliationError.operationId = operationId;
    throw reconciliationError;
  }

  if (typeof operation?.name !== "string" || !operation.name.trim()) {
    console.error("MAGIS_VIDEO_START_RECONCILIATION_REQUIRED", {
      operationId,
      userId,
      providerStatus: null,
    });
    const reconciliationError = new Error(
      "Video start status is uncertain; provider execution may still be running.",
    );
    reconciliationError.statusCode = 503;
    reconciliationError.reconciliationRequired = true;
    reconciliationError.operationId = operationId;
    throw reconciliationError;
  }

  try {
    await bindVideoProviderOperation(
      userId,
      operationId,
      operation.name,
    );
  } catch (error) {
    console.error("MAGIS_VIDEO_BIND_RECONCILIATION_REQUIRED", {
      operationId,
      userId,
      providerOperationName: operation.name,
    });
    const reconciliationError = new Error(
      "The provider accepted the video operation, but tracking could not be confirmed.",
      { cause: error },
    );
    reconciliationError.statusCode = 503;
    reconciliationError.reconciliationRequired = true;
    reconciliationError.operationId = operationId;
    throw reconciliationError;
  }

  return { operationId };
}

async function handleVideoStatus(ai, payload, userId) {
  const operationId = requireString(
    payload.operationId,
    "Operation id",
    100,
  );

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      operationId,
    )
  ) {
    const error = new Error("Operation id is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const owned = await getVideoOperation(userId, operationId);

  if (!owned) {
    const error = new Error("Video operation not found.");
    error.statusCode = 404;
    throw error;
  }

  if (owned.status === "failed") {
    await refundCredits(userId, operationId, "video_provider_failed");
    return {
      done: true,
      videoUrl: null,
    };
  }

  if (!owned.provider_operation_name) {
    return {
      done: false,
      videoUrl: null,
    };
  }

  const operation = await ai.operations.getVideosOperation({
    operation: {
      name: owned.provider_operation_name,
    },
  });

  const videoUri =
    operation?.response?.generatedVideos?.[0]?.video?.uri || null;

  if (operation?.done && videoUri) {
    await completeVideoOperation(
      userId,
      operationId,
      videoUri,
    );

    return {
      done: true,
      videoUrl: `/api/video?operationId=${encodeURIComponent(operationId)}`,
    };
  }

  if (operation?.done) {
    await failVideoOperation(userId, operationId);
    await refundCredits(userId, operationId, "video_provider_failed");
    return {
      done: true,
      videoUrl: null,
    };
  }

  return {
    done: Boolean(operation?.done),
    videoUrl: null,
  };
}

async function handleVideoAnalysis(ai, payload) {
  const videoBase64 = requireString(payload.videoBase64, "Video data", 4200000);
  const mimeType = requireString(payload.mimeType || "video/mp4", "MIME type", 100);
  const prompt = typeof payload.prompt === "string" && payload.prompt.trim()
    ? payload.prompt.slice(0, 6000)
    : "Analyze this video.";

  const normalized = videoBase64.includes(",") ? videoBase64.split(",")[1] : videoBase64;

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: normalized,
          },
        },
        { text: prompt },
      ],
    },
  });

  return { text: response.text || "" };
}

export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const body = getBody(req);
  const action = body.action;
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const expensive = ["image", "speech", "videoStart", "videoStatus", "videoAnalysis"].includes(action);
  const allowed = rateLimit(req, expensive ? "media" : "text", expensive ? 8 : 30, 60_000);
  if (allowed !== true) {
    return sendJson(res, 429, { error: "Rate limit exceeded. Retry shortly." }, {
      "Retry-After": String(allowed.retryAfter),
    });
  }

  let user;
  let client;
  let operationId;
  let charged = false;
  try {
    ({ user, client } = await authorizeRequest(req));
    if (!Object.hasOwn(CREDIT_COSTS, action) && action !== "videoStatus") {
      return sendJson(res, 400, { error: "Unknown API action." });
    }

    if (action !== "videoStatus") {
      assertRefundConfigured();
      operationId = randomUUID();
      await consumeCredits(client, user.id, operationId, action, CREDIT_COSTS[action]);
      charged = true;
    }

    const key = requireApiKey();
    const ai = new GoogleGenAI({ apiKey: key });

    let result;
    switch (action) {
      case "text":
        result = await handleText(ai, payload);
        break;
      case "thinking":
        result = await handleThinking(ai, payload);
        break;
      case "search":
        result = await handleSearch(ai, payload);
        break;
      case "image":
        result = await handleImage(payload, key);
        break;
      case "speech":
        result = await handleSpeech(ai, payload);
        break;
      case "videoStart":
        result = await handleVideoStart(ai, payload, user.id, operationId);
        break;
      case "videoStatus":
        result = await handleVideoStatus(ai, payload, user.id);
        break;
      case "videoAnalysis":
        result = await handleVideoAnalysis(ai, payload);
        break;
      default:
        return sendJson(res, 400, { error: "Unknown API action." });
    }

    return sendJson(res, 200, result);
  } catch (error) {
    if (charged && error?.reconciliationRequired !== true) {
      try {
        await refundCredits(user.id, operationId, "ai_execution_failed");
      } catch (refundError) {
        console.error("MAGIS_CREDIT_REFUND_ERROR", {
          operationId,
          userId: user.id,
          error: refundError?.message,
        });
        return sendJson(res, 502, {
          error: "The AI request failed and its credit refund could not be confirmed. Contact support.",
        });
      }
    }

    if (error?.reconciliationRequired === true) {
      return sendJson(res, 503, {
        error: `Video operation status is uncertain; credits remain reserved. Contact support with operation ID ${error.operationId}.`,
        operationId: error.operationId,
        reconciliationRequired: true,
      });
    }

    const status = Number(error?.statusCode) || 502;
    const message = status === 402
      ? "Insufficient credits."
      : status >= 500
        ? "AI service unavailable. Check server configuration and provider status."
        : String(error?.message || "Request failed.");
    console.error("MAGIS_API_ERROR", {
      action,
      status,
      message: error?.message,
    });
    return sendJson(res, status, { error: message });
  }
}
