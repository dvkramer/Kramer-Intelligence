import { messageText } from "./model.js";

function button(label, action, className = "message-action") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = label;
  el.addEventListener("click", action);
  return el;
}
export async function copyText(text, el) {
  try {
    await navigator.clipboard.writeText(text);
    const old = el.textContent;
    el.textContent = "Copied";
    setTimeout(() => {
      el.textContent = old;
    }, 1500);
  } catch {
    el.textContent = "Copy unavailable";
  }
}
function renderMarkdown(el, text) {
  if (!window.marked || !window.DOMPurify) {
    el.textContent = text;
    return;
  }
  // Protect math delimiters from Markdown backslash processing, but leave fenced
  // code untouched. Math is rendered as text nodes only after sanitization.
  const maths = [];
  const protectedText = text.replace(
    /```[\s\S]*?```|`[^`\n]*`|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$/g,
    (match) => {
      if (match.startsWith("`")) return match;
      const token = `KIMATHPLACEHOLDER${maths.length}END`;
      maths.push(match);
      return token;
    },
  );
  el.innerHTML = window.DOMPurify.sanitize(
    window.marked.parse(protectedText, { breaks: true, gfm: true }),
    { USE_PROFILES: { html: true } },
  );
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes)
    node.textContent = node.textContent.replace(
      /KIMATHPLACEHOLDER(\d+)END/g,
      (token, index) => maths[index] ?? token,
    );
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
        trust: false,
      });
    } catch {
      /* Keep readable source. */
    }
  }
  for (const link of el.querySelectorAll("a")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  for (const pre of el.querySelectorAll("pre")) {
    const code = pre.querySelector("code")?.textContent || pre.textContent;
    const copy = button("Copy", () => copyText(code, copy), "copy-code");
    pre.append(copy);
  }
}
export function renderMessage(message, { edit, regenerate, busy }) {
  const entry = document.createElement("article");
  entry.className = `message-entry ${message.role === "user" ? "user-message-entry" : "ai-message-entry"}`;
  entry.dataset.messageId = message.id;
  entry.setAttribute(
    "aria-label",
    message.role === "user" ? "Your message" : "Kramer Intelligence response",
  );
  const body = document.createElement("div");
  body.className = "message-body";
  const info = message.parts.find(
    (p) => p.fileInfoForDisplay,
  )?.fileInfoForDisplay;
  const inline = message.parts.find((p) => p.inlineData)?.inlineData;
  if (info || inline) {
    if (
      (info?.type === "image" || inline?.mimeType?.startsWith("image/")) &&
      (info?.dataUrl || inline?.data)
    ) {
      const url = info?.dataUrl || inline.data;
      if (/^data:image\/(png|jpeg|webp|heic|heif);base64,/i.test(url)) {
        const image = document.createElement("img");
        image.className = "message-image";
        image.src = url;
        image.alt = info?.name || "Attached image";
        body.append(image);
      }
    } else {
      const file = document.createElement("div");
      file.className = "message-file";
      file.textContent = `PDF · ${info?.name || "Attached document"}`;
      body.append(file);
    }
  }
  const content = document.createElement("div");
  content.className = "message-content";
  const text = messageText(message);
  if (message.role === "user") content.textContent = text;
  else renderMarkdown(content, text);
  body.append(content);
  const suggestion = message.parts.find(
    (p) => p.searchSuggestionHtml,
  )?.searchSuggestionHtml;
  if (suggestion && window.DOMPurify) {
    // Search-entry markup contains Google's styles. A scriptless, isolated frame
    // preserves them without allowing saved markup to execute in the app.
    const frame = document.createElement("iframe");
    frame.title = "Google Search suggestions";
    frame.className = "search-suggestions";
    frame.setAttribute(
      "sandbox",
      "allow-popups allow-popups-to-escape-sandbox",
    );
    const safe = window.DOMPurify.sanitize(`<div>${suggestion}</div>`, {
      ADD_TAGS: ["style"],
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
      FORBID_ATTR: ["srcdoc"],
    });
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'"><base target="_blank"><style>body{margin:0;color:#e3e5e8;font:13px system-ui}a{color:#a5c9ff}</style>${safe}`;
    body.append(frame);
  }
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copy = button("Copy", () => copyText(text, copy));
  actions.append(copy);
  const action =
    message.role === "user"
      ? button("Edit", () => edit(message))
      : button("Retry answer", () => regenerate(message));
  action.disabled = busy;
  actions.append(action);
  entry.append(body, actions);
  return entry;
}

export function updateTranscript(container, messages, callbacks) {
  const existing = new Map(
    [...container.children].map((el) => [el.dataset.messageId, el]),
  );
  const kept = new Set();
  for (const message of messages) {
    kept.add(message.id);
    const signature = JSON.stringify(message.parts) + callbacks.busy;
    let el = existing.get(message.id);
    if (!el || el._signature !== signature) {
      const replacement = renderMessage(message, callbacks);
      replacement._signature = signature;
      if (el) el.replaceWith(replacement);
      el = replacement;
    }
    // appendChild also moves existing nodes, preserving their event handlers.
    container.append(el);
  }
  for (const [id, el] of existing) if (!kept.has(id)) el.remove();
}
