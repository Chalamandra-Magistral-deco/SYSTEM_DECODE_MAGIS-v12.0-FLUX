import { describe, expect, test } from "vitest";
import { providerForAction, requireProviderApiKey } from "./provider-config.js";

describe("providerForAction", () => {
  test.each(["text", "thinking", "speech"])("%s uses Groq", action => {
    expect(providerForAction(action)).toBe("groq");
  });

  test.each(["search", "image", "videoStart", "videoStatus", "videoAnalysis", "unknown"])(
    "%s uses Gemini",
    action => {
      expect(providerForAction(action)).toBe("gemini");
    },
  );
});

describe("requireProviderApiKey", () => {
  test("reads Groq credentials only for Groq", () => {
    expect(requireProviderApiKey("groq", {
      GROQ_API_KEY: "groq-test",
      GEMINI_API_KEY: "gemini-test",
    })).toBe("groq-test");
  });

  test("accepts the Gemini compatibility variable", () => {
    expect(requireProviderApiKey("gemini", { API_KEY: "gemini-compat-test" }))
      .toBe("gemini-compat-test");
  });

  test.each(["groq", "gemini"])("%s fails before execution when credentials are absent", provider => {
    expect(() => requireProviderApiKey(provider, {})).toThrow(/not configured/);
    try {
      requireProviderApiKey(provider, {});
    } catch (error) {
      expect(error.statusCode).toBe(503);
    }
  });

  test("rejects unknown provider names", () => {
    expect(() => requireProviderApiKey("other", {})).toThrow(TypeError);
  });
});
