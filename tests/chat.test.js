import test from "node:test";
import assert from "node:assert/strict";
import { ChatController } from "../public/js/chat.js";
import {
  makePayload,
  mergeMessages,
  checkDocument,
} from "../public/js/model.js";
const settings = { searchEnabled: false };
const userMessage = (id, text = "hello") => ({
  id,
  role: "user",
  parts: [{ text }],
});
const modelMessage = (id, text = "answer") => ({
  id,
  role: "model",
  parts: [{ text }],
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function controller(request) {
  const errors = [];
  const chat = new ChatController({ request, error: (...e) => errors.push(e) });
  return { chat, errors };
}
function mockCloud() {
  const writes = [],
    chats = new Map();
  let listener;
  return {
    writes,
    chats,
    listen: (id, fn) => {
      listener = fn;
      return () => {};
    },
    emit: (messages) => listener?.(messages),
    get: async (id) => ({ id, title: id, ownerId: "u" }),
    create: async (id, title) => {
      if (!chats.has(id)) chats.set(id, { title });
    },
    append: async (id, message) => {
      writes.push({ id, message });
      return message.id;
    },
    edit: async (id, message) => {
      writes.push({ id, message });
    },
  };
}
test("switching chats during generation never moves the reply to the new chat", async () => {
  const pending = deferred();
  const { chat } = controller(() => pending.promise);
  const origin = chat.current;
  const run = chat.send("first", null, settings);
  chat.newChat();
  pending.resolve({ text: "reply to first" });
  await run;
  assert.equal(chat.current.messages.length, 0);
  assert.equal(origin.messages[1].parts[0].text, "reply to first");
});
test("switching saved chats binds writes and input history to the originating chat", async () => {
  const pending = deferred();
  let payload;
  const { chat } = controller((data) => {
    payload = data;
    return pending.promise;
  });
  chat.cloud = mockCloud();
  chat.user = { uid: "u" };
  Object.assign(chat.current, { isSynced: true, id: "original" });
  const run = chat.send("new user turn", null, settings);
  await Promise.resolve();
  await Promise.resolve();
  chat.newChat();
  pending.resolve({ text: "reply" });
  await run;
  assert.ok(chat.cloud.writes.every((w) => w.id === "original"));
  assert.equal(payload.history.at(-1).parts[0].text, "new user turn");
});
test("duplicate keyboard sends cannot launch concurrent requests", async () => {
  const pending = deferred();
  let calls = 0;
  const { chat } = controller(() => {
    calls++;
    return pending.promise;
  });
  const first = chat.send("one", null, settings);
  const second = await chat.send("two", null, settings);
  assert.equal(second, false);
  pending.resolve({ text: "reply" });
  await first;
  assert.equal(calls, 1);
  assert.equal(chat.current.messages.length, 2);
});
test("saved chats wait for their first snapshot before allowing a new request", async () => {
  let payload;
  const { chat } = controller(async (data) => {
    payload = data;
    return { text: "continued" };
  });
  chat.cloud = mockCloud();
  chat.user = { uid: "u" };
  await chat.load("saved");
  assert.equal(await chat.send("too early", null, settings), false);
  assert.equal(payload, undefined);
  chat.cloud.emit([
    userMessage("old", "earlier question"),
    modelMessage("reply"),
  ]);
  await chat.send("continue", null, settings);
  assert.equal(payload.history.length, 3);
  assert.equal(payload.history[0].parts[0].text, "earlier question");
});
test("failed regeneration preserves the answer and later turns; successful retry replaces them", async () => {
  let fail = true;
  const { chat, errors } = controller(async () => {
    if (fail) throw new Error("offline");
    return { text: "replacement" };
  });
  chat.current.messages = [
    userMessage("u1"),
    modelMessage("a1"),
    userMessage("u2"),
    modelMessage("a2"),
  ];
  await chat.regenerate("a1", settings);
  assert.equal(chat.current.messages.length, 4);
  assert.equal(chat.current.messages[1].id, "a1");
  fail = false;
  await errors[0][1]();
  assert.equal(chat.current.messages.length, 2);
  assert.equal(chat.current.messages[1].parts[0].text, "replacement");
});
test("failed local edit leaves original text and file parts unchanged", async () => {
  const { chat } = controller(async () => {
    throw new Error("offline");
  });
  chat.current.messages = [userMessage("u1", "original"), modelMessage("a1")];
  await chat.regenerate("u1", settings, "edited");
  assert.equal(chat.current.messages[0].parts[0].text, "original");
  assert.equal(chat.current.messages.length, 2);
});
test("cloud-save retry reuses chat/message IDs and attaches a listener before continuation", async () => {
  const { chat } = controller(async () => ({ text: "new reply" }));
  chat.cloud = mockCloud();
  chat.user = { uid: "u" };
  chat.current.messages = [userMessage("u1"), modelMessage("a1")];
  let attempts = 0;
  const append = chat.cloud.append;
  chat.cloud.append = async (...args) => {
    if (++attempts === 2) throw new Error("network");
    return append(...args);
  };
  await assert.rejects(chat.save("Saved"));
  const firstId = chat.current.saveId;
  assert.equal(chat.current.isSynced, false);
  await chat.save("Saved");
  assert.equal(chat.current.id, firstId);
  assert.equal(chat.cloud.chats.size, 1);
  chat.cloud.emit([userMessage("u1"), modelMessage("a1")]);
  await chat.send("continue", null, settings);
  assert.equal(chat.current.messages.at(-1).parts[0].text, "new reply");
});
test("an answer whose cloud save failed retries the write without regenerating", async () => {
  let requests = 0,
    fail = true;
  const { chat, errors } = controller(async () => {
    requests++;
    return { text: "answer" };
  });
  chat.cloud = mockCloud();
  chat.user = { uid: "u" };
  Object.assign(chat.current, { isSynced: true, id: "saved" });
  const append = chat.cloud.append;
  chat.cloud.append = async (id, message) => {
    if (message.role === "model" && fail) throw new Error("offline");
    return append(id, message);
  };
  await chat.send("hello", null, settings);
  assert.equal(chat.current.messages.length, 2);
  const pending = chat.current.pending;
  await chat.regenerate(chat.current.messages[1].id, settings);
  assert.equal(await chat.send("next", null, settings), false);
  assert.equal(chat.current.pending, pending);
  fail = false;
  await errors[0][1]();
  assert.equal(requests, 1);
  assert.equal(chat.current.messages.length, 2);
  assert.equal(chat.current.pending, null);
});
test("failed user writes cannot be discarded by a new send", async () => {
  let requests = 0;
  const { chat, errors } = controller(async () => {
    requests++;
    return { text: "answer" };
  });
  chat.cloud = mockCloud();
  chat.user = { uid: "u" };
  Object.assign(chat.current, { isSynced: true, id: "saved" });
  const append = chat.cloud.append;
  chat.cloud.append = async () => {
    throw new Error("offline");
  };
  await chat.send("keep me", null, settings);
  const pending = chat.current.pending;
  assert.equal(await chat.send("next", null, settings), false);
  assert.equal(chat.current.pending, pending);
  assert.equal(requests, 0);
  chat.cloud.append = append;
  await errors.at(-1)[1]();
  assert.equal(requests, 1);
  assert.equal(chat.current.messages[0].parts[0].text, "keep me");
});
test("signing out while a saved request runs prevents later cloud writes", async () => {
  const pending = deferred();
  const { chat } = controller(() => pending.promise);
  chat.cloud = mockCloud();
  chat.setUser({ uid: "u" });
  Object.assign(chat.current, { isSynced: true, id: "saved" });
  const run = chat.send("hello", null, settings);
  await Promise.resolve();
  await Promise.resolve();
  chat.setUser(null);
  pending.resolve({ text: "private reply" });
  await run;
  assert.ok(chat.cloud.writes.every((w) => w.message.role !== "model"));
  assert.equal(chat.current.messages.length, 0);
});
test("logging in preserves an unsaved conversation", () => {
  const { chat } = controller(() => {});
  chat.current.messages = [userMessage("u1")];
  chat.setUser({ uid: "u" });
  assert.equal(chat.current.messages.length, 1);
});
test("stale cloud snapshots keep pending messages and edits, without duplicates", () => {
  const remote = [userMessage("u1", "old")],
    local = [userMessage("u1", "new"), modelMessage("a1")];
  const merged = mergeMessages(remote, local, new Set(["u1", "a1"]));
  assert.equal(merged.length, 2);
  assert.equal(merged[0].parts[0].text, "new");
});
test("legacy display data is retained in storage but omitted from request size", () => {
  const message = userMessage("u1");
  message.parts.push(
    { fileInfoForDisplay: { name: "legacy" } },
    { searchSuggestionHtml: "<div>legacy</div>" },
  );
  const payload = makePayload([message]);
  assert.equal(payload.history[0].parts.length, 1);
  assert.equal(message.parts.length, 3);
  assert.throws(
    () => checkDocument(userMessage("large", "x".repeat(910_000))),
    /too large/,
  );
});
