import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import chat from "../api/chat.js";
import live from "../api/live-token.js";
import {
  prepareHistory,
  systemPrompt,
  CHAT_MODELS,
  SEARCH_MODELS,
} from "../lib/gemini.js";
const originalFetch = globalThis.fetch,
  oldKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = oldKey;
});
const history = [{ role: "user", parts: [{ text: "Hello" }] }];
function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(s) {
      this.statusCode = s;
      return this;
    },
    json(d) {
      this.body = d;
      return this;
    },
    end() {},
  };
}
function req(body = { history }) {
  process.env.GEMINI_API_KEY = "test-key";
  return {
    method: "POST",
    body,
    headers: {
      host: "example.test",
      origin: "https://example.test",
      "content-type": "application/json",
    },
  };
}
const answer = (parts) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts }, finishReason: "STOP" }],
    }),
    { status: 200 },
  );
test("legacy requests remain non-streaming JSON and use a free Search model", async () => {
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return answer([
      { text: "First " },
      { text: "private", thought: true },
      { text: "second." },
    ]);
  };
  const res = response();
  await chat(req(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.text, "First second.");
  assert.equal(res.body.modelUsed, SEARCH_MODELS[0]);
  assert.match(sent.url, /:generateContent$/);
  assert.ok(sent.body.tools[0].google_search);
  assert.ok(sent.body.systemInstruction);
  assert.equal(sent.body.contents[0].parts[0].text, "Hello");
  assert.equal(sent.options.headers["x-goog-api-key"], "test-key");
  assert.ok(!sent.url.includes("test-key"));
});
test("ordinary chat uses modern models without a paid Search tool", async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes(CHAT_MODELS[0]));
    assert.equal(JSON.parse(options.body).tools, undefined);
    return answer([{ text: "OK" }]);
  };
  const res = response();
  await chat(req({ history, searchEnabled: false }), res);
  assert.equal(res.body.text, "OK");
});
test("attachment-only opening message still receives system instructions", async () => {
  const attachment = [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: "image/png",
            data: "data:image/png;base64,YWJj",
          },
        },
        { fileInfoForDisplay: { type: "image", dataUrl: "legacy" } },
      ],
    },
  ];
  globalThis.fetch = async (_, options) => {
    const b = JSON.parse(options.body);
    assert.ok(b.systemInstruction.parts[0].text.includes("Kramer"));
    assert.equal(b.contents[0].parts.length, 1);
    assert.equal(b.contents[0].parts[0].inlineData.data, "YWJj");
    return answer([{ text: "An image" }]);
  };
  const res = response();
  await chat(req({ history: attachment }), res);
  assert.equal(res.statusCode, 200);
});
test("malformed input fails before any Gemini call and timezone falls back", async () => {
  globalThis.fetch = () => {
    throw new Error("must not call");
  };
  for (const bad of [
    null,
    {},
    { history: [] },
    { history: [{ role: "system", parts: [{ text: "x" }] }] },
    { history: [{ role: "user", parts: [null] }] },
  ]) {
    const res = response();
    await chat(req(bad), res);
    assert.equal(res.statusCode, 400);
  }
  assert.ok(
    systemPrompt({ timezone: "not/a/timezone" }).includes(
      "Kramer Intelligence",
    ),
  );
});
test("only transient/model availability failures fall back", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({ error: { message: "upstream secret" } }),
      { status: 403 },
    );
  };
  const res = response();
  await chat(req(), res);
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 403);
  assert.ok(!res.body.error.includes("upstream secret"));
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? new Response("{}", { status: 404 })
      : answer([{ text: "fallback" }]);
  };
  const fallback = response();
  await chat(req(), fallback);
  assert.equal(calls, 2);
  assert.equal(fallback.body.text, "fallback");
});
test("429 is preserved, bounded, and provides retry guidance", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("{}", { status: 429 });
  };
  const res = response();
  await chat(req(), res);
  assert.equal(calls, SEARCH_MODELS.length);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "60");
});
test("invalid base64/MIME and oversized request are rejected", async () => {
  assert.throws(() =>
    prepareHistory([
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "image/svg+xml", data: "YWJj" } }],
      },
    ]),
  );
  assert.throws(() =>
    prepareHistory([
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "image/png", data: "bad!" } }],
      },
    ]),
  );
  const res = response();
  await chat(
    req({
      history: [{ role: "user", parts: [{ text: "x".repeat(4_000_001) }] }],
    }),
    res,
  );
  assert.equal(res.statusCode, 413);
});
test("safety and truncated responses are distinguished", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }));
  const blocked = response();
  await chat(req(), blocked);
  assert.equal(blocked.statusCode, 400);
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: "Partial answer" }] },
          },
        ],
      }),
    );
  const partial = response();
  await chat(req(), partial);
  assert.equal(partial.body.truncated, true);
  assert.equal(partial.body.text, "Partial answer");
});
test("Live issues a constrained, expiring single-use token, never the server key", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ name: "auth_tokens/temporary" }));
  };
  const res = response();
  await live(req({ isStudyModeActive: true }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(request.url.endsWith("/v1beta/auth_tokens"));
  assert.equal(request.body.uses, 1);
  assert.deepEqual(
    request.body.bidiGenerateContentSetup.generationConfig.responseModalities,
    ["AUDIO"],
  );
  assert.ok(
    request.body.bidiGenerateContentSetup.systemInstruction.parts[0].text.includes(
      "Study Mode",
    ),
  );
  assert.ok(Date.parse(request.body.expireTime) - Date.now() <= 8 * 60_000);
  assert.equal(res.body.token, "auth_tokens/temporary");
  assert.ok(!JSON.stringify(res.body).includes("test-key"));
  assert.equal(res.headers["Cache-Control"], "no-store");
});
test("Live rejects cross-origin and non-JSON requests before token creation", async () => {
  globalThis.fetch = () => {
    throw new Error("must not call");
  };
  const request = req({});
  request.headers.origin = "https://other.test";
  const res = response();
  await live(request, res);
  assert.equal(res.statusCode, 403);
  request.headers.origin = "https://example.test";
  request.headers["content-type"] = "text/plain";
  const plain = response();
  await live(request, plain);
  assert.equal(plain.statusCode, 415);
});
