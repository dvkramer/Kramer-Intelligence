import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createDOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import { readFile } from "node:fs/promises";
import { renderMessage, updateTranscript } from "../public/js/render.js";
let win;
beforeEach(() => {
  win = new JSDOM("<!doctype html><html><body></body></html>").window;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.NodeFilter = win.NodeFilter;
  win.marked = marked;
  win.DOMPurify = createDOMPurify(win);
  win.renderMathInElement = renderMathInElement;
});
afterEach(() => win.close());
const callbacks = { edit: () => {}, regenerate: () => {}, busy: false };
test("Markdown and saved search suggestions cannot inject scripts into the app", () => {
  const message = {
    id: "m",
    role: "model",
    parts: [
      {
        text: '<img src=x onerror="alert(1)"><script>alert(1)</script>\n\n**Safe**',
      },
      {
        searchSuggestionHtml:
          '<script>alert(2)</script><a href="javascript:alert(3)">Search</a><style>body{color:red}</style>',
      },
    ],
  };
  const rendered = renderMessage(message, callbacks);
  assert.equal(rendered.querySelector("script"), null);
  assert.equal(rendered.querySelector("[onerror]"), null);
  assert.equal(rendered.querySelector("strong").textContent, "Safe");
  const iframe = rendered.querySelector("iframe");
  assert.ok(!iframe.getAttribute("sandbox").includes("allow-scripts"));
  assert.ok(!iframe.srcdoc.includes("javascript:"));
  assert.ok(!iframe.srcdoc.includes("<script>"));
});
test("code samples remain code, math delimiters survive Markdown, and tables render", () => {
  let mathInput;
  win.renderMathInElement = (el) => {
    mathInput = el.textContent;
  };
  const rendered = renderMessage(
    {
      id: "m",
      role: "model",
      parts: [
        {
          text: 'Inline \\( E=mc^2 \\).\n\n```js\nconst x = "<script>";\n```\n\n|A|B|\n|---|---|\n|1|2|',
        },
      ],
    },
    callbacks,
  );
  assert.ok(mathInput.includes("\\( E=mc^2 \\)"));
  assert.ok(
    rendered.querySelector("pre code").textContent.includes("<script>"),
  );
  assert.ok(rendered.querySelector("table"));
  assert.equal(rendered.querySelector(".copy-code").textContent, "Copy");
});
test("legacy attachment parts render and unsafe data URLs are refused", () => {
  const safe = renderMessage(
    {
      id: "m",
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: "image/png",
            data: "data:image/png;base64,YWJj",
          },
        },
        {
          fileInfoForDisplay: {
            type: "image",
            name: "old.png",
            dataUrl: "data:image/png;base64,YWJj",
          },
        },
      ],
    },
    callbacks,
  );
  assert.equal(safe.querySelector("img").alt, "old.png");
  const unsafe = renderMessage(
    {
      id: "x",
      role: "user",
      parts: [
        {
          fileInfoForDisplay: { type: "image", dataUrl: "javascript:alert(1)" },
        },
      ],
    },
    callbacks,
  );
  assert.equal(unsafe.querySelector("img"), null);
});
test("cloud updates retain unchanged transcript nodes and remove deleted ones", () => {
  const container = document.createElement("div"),
    one = { id: "1", role: "user", parts: [{ text: "Hi" }] },
    two = { id: "2", role: "model", parts: [{ text: "Hello" }] };
  updateTranscript(container, [one], callbacks);
  const node = container.firstChild;
  updateTranscript(container, [one, two], callbacks);
  assert.equal(container.firstChild, node);
  assert.equal(container.children.length, 2);
  updateTranscript(container, [two], callbacks);
  assert.equal(container.children.length, 1);
  assert.equal(container.firstChild.dataset.messageId, "2");
});
test("page structure has unique IDs, accessible composer, and no streaming/Stop control", async () => {
  document.body.innerHTML = await readFile("public/index.html", "utf8");
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(document.querySelector('label[for="message-input"]'));
  assert.equal(
    document.querySelector("#menu-button").classList.contains("hidden"),
    false,
  );
  assert.ok(
    ![...document.querySelectorAll("button")].some((b) =>
      /\bstop\b/i.test(b.textContent),
    ),
  );
});
