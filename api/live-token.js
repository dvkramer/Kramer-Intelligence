import {
  LIVE_MODEL,
  RequestError,
  readBody,
  systemPrompt,
  googleRequest,
  publicApiError,
} from "../lib/gemini.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  // Origin checks reduce cross-site browser misuse; they are not authentication.
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host)
        return res
          .status(403)
          .json({ error: "Voice must be started from this app." });
    } catch {
      return res.status(403).json({ error: "Invalid origin." });
    }
  }
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    return res.status(415).json({ error: "JSON is required." });
  if (!process.env.GEMINI_API_KEY)
    return res
      .status(503)
      .json({
        error:
          "Voice is temporarily unavailable: the server API key is not configured.",
      });
  try {
    const body = readBody(req, 16_000);
    const expireTime = new Date(Date.now() + 8 * 60_000).toISOString();
    const setup = {
      model: `models/${LIVE_MODEL}`,
      generationConfig: { responseModalities: ["AUDIO"] },
      systemInstruction: {
        parts: [
          {
            text:
              systemPrompt(body, req.headers) +
              "\nYou are in a voice conversation. Speak naturally and concisely. Avoid reading Markdown formatting aloud.",
          },
        ],
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };
    const { response, data } = await googleRequest(
      "auth_tokens",
      {
        uses: 1,
        expireTime,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        bidiGenerateContentSetup: setup,
      },
      { timeout: 20_000 },
    );
    if (!response.ok)
      return res
        .status(response.status)
        .json({ error: publicApiError(response.status) });
    if (typeof data.name !== "string")
      return res
        .status(502)
        .json({
          error: "Gemini could not start a voice session. Please try again.",
        });
    return res
      .status(200)
      .json({ token: data.name, model: LIVE_MODEL, setup, expireTime });
  } catch (error) {
    return res
      .status(error.status || 503)
      .json({
        error:
          error instanceof RequestError
            ? error.message
            : "Voice could not connect. Please try again.",
      });
  }
}
