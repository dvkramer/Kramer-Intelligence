// Free-tier model/tool compatibility checked against Google pricing 2026-09-16.
export const CHAT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
];
export const SEARCH_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
export const LIVE_MODEL = "gemini-3.8-live";
export const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
export const MAX_BODY_BYTES = 4_000_000;
export const MAX_CONTEXT_TOKENS = 900_000;
const MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function readBody(req, limit = MAX_BODY_BYTES) {
  let body = req.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > limit)
      throw new RequestError(
        "This conversation and its attachments are too large to send. Start a new chat or use smaller files.",
        413,
      );
    try {
      body = JSON.parse(body);
    } catch {
      throw new RequestError("Invalid JSON request.");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new RequestError("Invalid request body.");
  if (Buffer.byteLength(JSON.stringify(body)) > limit)
    throw new RequestError(
      "This conversation and its attachments are too large to send. Start a new chat or use smaller files.",
      413,
    );
  return body;
}

export function prepareHistory(history) {
  if (!Array.isArray(history) || !history.length || history.length > 2000)
    throw new RequestError(
      "A nonempty conversation history is required (up to 2,000 messages).",
    );
  return history.map((message) => {
    if (
      !message ||
      !["user", "model"].includes(message.role) ||
      !Array.isArray(message.parts)
    )
      throw new RequestError("Invalid message in conversation history.");
    const parts = [];
    for (const part of message.parts) {
      if (!part || typeof part !== "object")
        throw new RequestError("Invalid message content.");
      if (typeof part.text === "string" && part.text.trim())
        parts.push({ text: part.text });
      if (part.inlineData) {
        const { mimeType, data } = part.inlineData;
        if (!MIME_TYPES.has(mimeType) || typeof data !== "string")
          throw new RequestError(
            "Unsupported attachment type. Use a PNG, JPEG, WebP, HEIC, HEIF, or PDF.",
          );
        const match = data.match(/^data:([^;,]+);base64,([\s\S]+)$/);
        if (data.startsWith("data:") && (!match || match[1] !== mimeType))
          throw new RequestError("Invalid attachment data.");
        const base64 = match ? match[2] : data;
        if (
          !base64 ||
          base64.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
        )
          throw new RequestError("Invalid attachment encoding.");
        parts.push({ inlineData: { mimeType, data: base64 } });
      }
      // Legacy display-only parts remain in Firestore, never in API requests.
    }
    if (!parts.length)
      throw new RequestError("A message has no text or supported attachment.");
    return { role: message.role, parts };
  });
}

export function systemPrompt(
  { isStudyModeActive = false, timezone = "UTC" } = {},
  headers = {},
) {
  let date;
  try {
    date = new Date().toLocaleDateString("en-US", {
      dateStyle: "full",
      timeZone: typeof timezone === "string" ? timezone : "UTC",
    });
  } catch {
    date = new Date().toLocaleDateString("en-US", {
      dateStyle: "full",
      timeZone: "UTC",
    });
  }
  let location = "";
  try {
    const city = decodeURIComponent(headers["x-vercel-ip-city"] || "")
      .replace(/[\r\n]/g, " ")
      .slice(0, 100);
    const region = String(headers["x-vercel-ip-country-region"] || "")
      .replace(/[\r\n]/g, " ")
      .slice(0, 50);
    if (city)
      location = ` The user's approximate city is ${city}${region ? ", " + region : ""}.`;
  } catch {
    /* Location is optional. */
  }
  const study =
    isStudyModeActive === true
      ? "\nStudy Mode is enabled. Be a patient, plain-spoken teacher. Guide the user with hints and small steps rather than immediately solving their homework. Ask one question at a time and wait for their answer. Adapt to their knowledge, explain concepts clearly, and check understanding. Keep the exchange brief and useful."
      : "";
  return `You are Kramer Intelligence (KI), an AI assistant developed by Daniel Vincent Kramer. Give clear, direct, useful answers. Use Markdown when helpful. For math, use \\( ... \\) inline and \\[ ... \\] for display equations. Today's date is ${date}.${location}${study}`;
}

export async function googleRequest(
  path,
  body,
  { signal, timeout = 22_000 } = {},
) {
  const timeoutSignal = AbortSignal.timeout(timeout);
  const response = await fetch(`${API_ROOT}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export function publicApiError(status) {
  if (status === 429)
    return "The free Gemini quota is temporarily exhausted. Please try again later. Your conversation is still here.";
  if (status === 401 || status === 403)
    return "Gemini access is unavailable for the configured key. Your conversation has been kept.";
  if (status === 404)
    return "The configured Gemini model is unavailable. Please try again later.";
  if (status === 400)
    return "Gemini could not process this conversation. Try a smaller attachment or a new chat.";
  return "Gemini is temporarily unavailable. Please try again. Your conversation has been kept.";
}

export function endpoint(req, res, method = "POST") {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*"); // Preserve existing clients.
  res.setHeader("Access-Control-Allow-Methods", `${method}, OPTIONS`);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }
  if (req.method !== method) {
    res.setHeader("Allow", `${method}, OPTIONS`);
    res.status(405).json({ error: "Method not allowed." });
    return false;
  }
  return true;
}
