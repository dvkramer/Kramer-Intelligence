import {
  CHAT_MODELS,
  SEARCH_MODELS,
  MAX_CONTEXT_TOKENS,
  RequestError,
  readBody,
  prepareHistory,
  systemPrompt,
  googleRequest,
  publicApiError,
  endpoint,
} from "../lib/gemini.js";

export default async function handler(req, res) {
  if (!endpoint(req, res)) return;
  if (!process.env.GEMINI_API_KEY)
    return res
      .status(503)
      .json({
        error:
          "Chat is temporarily unavailable: the server API key is not configured.",
      });
  try {
    const body = readBody(req);
    let contents = prepareHistory(body.history);
    if (contents.at(-1).role !== "user")
      throw new RequestError("The conversation must end with a user message.");
    // Existing clients omitted this field and always had Search enabled.
    const searchEnabled = body.searchEnabled !== false;
    const models = searchEnabled ? SEARCH_MODELS : CHAT_MODELS;
    const instruction = { parts: [{ text: systemPrompt(body, req.headers) }] };
    const deadline = AbortSignal.timeout(50_000);
    let contextTrimmed = false;
    if (JSON.stringify(contents).length > 240_000) {
      try {
        const count = await googleRequest(
          `models/${models[0]}:countTokens`,
          { contents },
          { signal: deadline, timeout: 6000 },
        );
        if (count.response.ok && count.data.totalTokens > MAX_CONTEXT_TOKENS) {
          const targetSize =
            ((JSON.stringify(contents).length * MAX_CONTEXT_TOKENS) /
              count.data.totalTokens) *
            0.85;
          while (
            contents.length > 1 &&
            JSON.stringify(contents).length > targetSize
          ) {
            contents.shift();
            while (contents.length > 1 && contents[0].role !== "user")
              contents.shift();
            contextTrimmed = true;
          }
          if (JSON.stringify(contents).length > targetSize)
            throw new RequestError(
              "The latest message is too large for Gemini. Please shorten it or use a smaller attachment.",
            );
        }
      } catch (error) {
        if (error instanceof RequestError) throw error;
      }
    }
    let lastStatus = 503;
    for (const model of models) {
      try {
        const { response, data } = await googleRequest(
          `models/${model}:generateContent`,
          {
            contents,
            systemInstruction: instruction,
            ...(searchEnabled ? { tools: [{ google_search: {} }] } : {}),
            generationConfig: { temperature: 1, maxOutputTokens: 16384 },
          },
          { signal: deadline },
        );
        if (!response.ok) {
          lastStatus = response.status;
          if (![404, 429, 500, 502, 503, 504].includes(lastStatus)) break;
          continue;
        }
        const candidate = data.candidates?.[0];
        if (
          data.promptFeedback?.blockReason ||
          ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(
            candidate?.finishReason,
          )
        )
          return res
            .status(400)
            .json({
              error:
                "Gemini could not answer this request because of its content restrictions.",
            });
        const text = (candidate?.content?.parts || [])
          .filter((p) => typeof p.text === "string" && !p.thought)
          .map((p) => p.text)
          .join("");
        if (!text.trim())
          return res
            .status(502)
            .json({
              error:
                candidate?.finishReason === "MAX_TOKENS"
                  ? "Gemini used its response limit before producing an answer. Try a shorter question."
                  : "Gemini returned no answer. Please try again.",
            });
        return res.status(200).json({
          text,
          searchSuggestionHtml:
            candidate.groundingMetadata?.searchEntryPoint?.renderedContent ||
            null,
          modelUsed: model,
          contextTrimmed,
          truncated: candidate.finishReason === "MAX_TOKENS",
        });
      } catch (error) {
        if (deadline.aborted) break;
        lastStatus = error.name === "TimeoutError" ? 504 : 503;
      }
    }
    if (lastStatus === 429) res.setHeader("Retry-After", "60");
    return res.status(lastStatus).json({ error: publicApiError(lastStatus) });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({
        error:
          error instanceof RequestError
            ? error.message
            : "Unable to process this request. Your conversation has been kept.",
      });
  }
}
