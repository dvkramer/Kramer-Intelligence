import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { ChatController } from "../public/js/chat.js";
import { messageText } from "../public/js/model.js";
import { updateTranscript } from "../public/js/render.js";
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function app() {
  const window = new Window({ url: "http://localhost:3000" });
  window.document.write(await readFile("public/index.html", "utf8"));
  globalThis.window = window;
  globalThis.document = window.document;
  let calls = 0;
  let receiveAuth;
  const deleted = [];
  const cloud = {
    onAuth: (fn) => {
      receiveAuth = fn;
      fn(null);
    },
    list: async () => [],
    remove: async (id) => deleted.push(id),
    logout: async () => receiveAuth(null),
  };
  const context = vm.createContext({
    window,
    document: window.document,
    ChatController,
    messageText,
    updateTranscript,
    readAttachment: async () => {},
    connectCloud: async () => cloud,
    Intl,
    AbortSignal,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => fn(),
    matchMedia: () => ({ matches: false }),
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ text: "Complete answer" }));
    },
  });
  const script = (await readFile("public/script.js", "utf8")).replace(
    /^import .*;\n/gm,
    "",
  );
  vm.runInContext(script, context);
  await tick();
  return {
    window,
    document: window.document,
    context,
    deleted,
    calls: () => calls,
  };
}
test("composer submits once, clears only accepted drafts, and renders a complete reply", async () => {
  const a = await app(),
    input = a.document.getElementById("message-input");
  input.value = "Hello";
  input.dispatchEvent(new a.window.Event("input"));
  a.document
    .getElementById("chat-form")
    .dispatchEvent(new a.window.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(a.calls(), 1);
  assert.equal(input.value, "");
  assert.match(
    a.document.getElementById("chat-history").textContent,
    /Complete answer/,
  );
  assert.equal(a.document.getElementById("send-button").disabled, false);
});
test("oversized input retains its draft and makes no API request", async () => {
  const a = await app(),
    input = a.document.getElementById("message-input");
  input.value = "x".repeat(4_000_100);
  input.dispatchEvent(new a.window.Event("input"));
  a.document
    .getElementById("chat-form")
    .dispatchEvent(new a.window.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(a.calls(), 0);
  assert.equal(input.value.length, 4_000_100);
  assert.match(
    a.document.getElementById("error-text").textContent,
    /too large/,
  );
});
test("delete dialog can open and confirm repeatedly without stale button references", async () => {
  const a = await app();
  for (const id of ["first", "second"]) {
    vm.runInContext(`deleteChat({id:'${id}',title:'Test chat'})`, a.context);
    a.document
      .getElementById("action-form")
      .dispatchEvent(new a.window.Event("submit", { cancelable: true }));
    await tick();
    assert.equal(a.document.getElementById("action-modal").open, false);
  }
  assert.deepEqual(a.deleted, ["first", "second"]);
});
test("mobile sidebar opens and closes and has a visible menu control", async () => {
  const a = await app();
  a.document.getElementById("menu-button").click();
  assert.equal(
    a.document.getElementById("menu-button").getAttribute("aria-expanded"),
    "true",
  );
  assert.ok(a.document.getElementById("sidebar").classList.contains("open"));
  a.document.getElementById("close-sidebar").click();
  assert.equal(
    a.document.getElementById("menu-button").getAttribute("aria-expanded"),
    "false",
  );
});
