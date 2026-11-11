const GROQ_ACTIONS = new Set(["text", "thinking", "speech"]);

export function providerForAction(action) {
  return GROQ_ACTIONS.has(action) ? "groq" : "gemini";
}

export function requireProviderApiKey(provider, env = process.env) {
  let key;
  let variable;

  if (provider === "groq") {
    key = env.GROQ_API_KEY;
    variable = "GROQ_API_KEY";
  } else if (provider === "gemini") {
    key = env.GEMINI_API_KEY || env.API_KEY;
    variable = "GEMINI_API_KEY or API_KEY";
  } else {
    throw new TypeError(`Unsupported AI provider: ${provider}`);
  }

  if (typeof key !== "string" || !key.trim()) {
    const error = new Error(`${variable} is not configured.`);
    error.statusCode = 503;
    throw error;
  }

  return key;
}
