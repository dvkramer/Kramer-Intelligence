// The stored shape remains compatible with existing Firestore messages.
export const MAX_REQUEST_BYTES = 4_000_000;
export const MAX_DOCUMENT_BYTES = 900_000; // Headroom for Firestore metadata and field overhead.
export const byteSize = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
export const newId = () => `${Date.now()}-${crypto.randomUUID()}`;
export const messageText = (message) =>
  (message.parts || [])
    .filter((p) => typeof p?.text === "string")
    .map((p) => p.text)
    .join("\n");
export const copy = (value) => JSON.parse(JSON.stringify(value));
export function newConversation() {
  return {
    key: newId(),
    id: null,
    isSynced: false,
    ownerId: null,
    title: "New chat",
    messages: [],
    busy: false,
    pending: null,
    draft: "",
    attachment: null,
  };
}
export function storedMessage(message) {
  const { id, role, parts, userId } = message;
  return {
    id,
    role,
    parts: copy(parts),
    ...(userId !== undefined ? { userId } : {}),
  };
}
export function checkDocument(message) {
  if (byteSize(storedMessage(message)) > MAX_DOCUMENT_BYTES)
    throw new Error(
      "This message is too large to save to the cloud. Use a smaller attachment. Your local chat has been kept.",
    );
}
export function makePayload(messages, settings = {}) {
  const history = messages.map((m) => ({
    role: m.role === "ai" ? "model" : m.role,
    parts: m.parts
      .filter((p) => typeof p?.text === "string" || p?.inlineData)
      .map(copy),
  }));
  const payload = { history, ...settings };
  if (byteSize(payload) > MAX_REQUEST_BYTES)
    throw new Error(
      "This conversation and its files are too large to send. Start a new chat or use smaller files.",
    );
  return payload;
}

export function mergeMessages(remote, local, pendingIds = new Set()) {
  const ids = new Set(remote.map((m) => m.id));
  // Keep unsaved replies if a cloud write fails or a snapshot arrives out of order.
  return [
    ...remote.map((m) =>
      pendingIds.has(m.id) ? local.find((l) => l.id === m.id) || m : m,
    ),
    ...local.filter((m) => pendingIds.has(m.id) && !ids.has(m.id)),
  ];
}
