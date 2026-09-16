import { ChatController } from "./js/chat.js";
import { messageText } from "./js/model.js";
import { updateTranscript } from "./js/render.js";
import { readAttachment } from "./js/attachments.js";
import { connectCloud } from "./js/cloud.js";

const $ = (id) => document.getElementById(id);
let cloud,
  chatList = [],
  retryAction,
  authMode = "login",
  authReady = false,
  fileReading = false,
  attachmentEpoch = 0,
  voice = null,
  voiceStarting = false,
  renderedKey;
const settings = () => ({
  searchEnabled: $("search-button").getAttribute("aria-pressed") === "true",
  isStudyModeActive:
    $("study-mode-button").getAttribute("aria-pressed") === "true",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
const chat = new ChatController({
  request: requestAnswer,
  changed: render,
  error: showError,
  notice: showNotice,
});
async function requestAnswer(payload) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(65_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error ||
        (response.status === 413
          ? "The conversation is too large to send. Use a smaller file or a new chat."
          : "The request failed. Please try again."),
    );
  if (typeof data.text !== "string" || !data.text.trim())
    throw new Error("Gemini returned an empty answer. Please retry.");
  return data;
}
function showError(message, retry) {
  $("error-text").textContent = message;
  $("error").classList.remove("hidden");
  retryAction = retry;
  $("retry-button").classList.toggle("hidden", !retry);
}
function clearError() {
  $("error").classList.add("hidden");
  retryAction = null;
}
function showNotice(message) {
  $("notice").textContent = message;
  $("notice").classList.remove("hidden");
}
function resizeInput() {
  $("message-input").style.height = "auto";
  $("message-input").style.height =
    Math.min($("message-input").scrollHeight, 180) + "px";
}
function endVoice() {
  const session = voice;
  session?.end();
  voice = null;
  voiceStarting = false;
  render();
  return session?.turnQueue || Promise.resolve();
}
function beforeSwitch() {
  endVoice();
  clearError();
  $("notice").classList.add("hidden");
  attachmentEpoch++;
  closeSidebar();
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-backdrop").classList.add("hidden");
  $("menu-button").setAttribute("aria-expanded", "false");
}
function render() {
  const current = chat.current,
    scroller = $("main-content-area");
  const changedChat = renderedKey !== current.key;
  const nearBottom =
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  if (changedChat) {
    $("chat-history").replaceChildren();
    $("message-input").value = current.draft;
    resizeInput();
    renderedKey = current.key;
    clearError();
    if (current.pending && !current.busy)
      showError(current.lastError || "This request did not finish.", () =>
        chat.run(current),
      );
  }
  const inVoice = voice?.active || voiceStarting;
  const busy = current.busy || current.loading || inVoice;
  $("chat-title").textContent = current.isSynced ? current.title : "New chat";
  $("chat-status").textContent = current.isSynced
    ? "Saved to cloud"
    : "Only here until you save";
  $("empty-state").classList.toggle("hidden", current.messages.length > 0);
  $("loading").classList.toggle("hidden", !current.busy && !current.loading);
  $("save-chat-button").classList.toggle("hidden", current.isSynced);
  $("save-chat-button").disabled = busy || !current.messages.length;
  $("share-chat-button").classList.toggle("hidden", !current.isSynced);
  $("share-chat-button").disabled = busy;
  $("send-button").disabled = busy || fileReading;
  $("voice-button").disabled = busy || fileReading;
  $("attach-button").disabled = busy || fileReading;
  $("study-mode-button").disabled = inVoice;
  $("message-input").disabled = !!inVoice;
  updateTranscript($("chat-history"), current.messages, {
    busy,
    edit: editMessage,
    regenerate: (message) =>
      chat
        .regenerate(message.id, settings())
        .catch((error) => showError(error.message)),
  });
  const file = current.attachment;
  $("image-preview-container").classList.toggle("hidden", !file);
  if (file) {
    $("filename-preview").textContent = file.name;
    $("image-preview").classList.toggle(
      "hidden",
      file.mimeType === "application/pdf",
    );
    if (file.mimeType.startsWith("image/")) $("image-preview").src = file.data;
  } else $("image-preview").removeAttribute("src");
  $("user-info").classList.toggle("hidden", !chat.user);
  $("login-button").classList.toggle("hidden", !!chat.user);
  $("user-email").textContent = chat.user?.email || "";
  renderSidebar();
  if (nearBottom || changedChat)
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
}
function renderSidebar() {
  const list = $("chat-list");
  list.replaceChildren();
  for (const local of chat.locals.filter(
    (c) => !c.isSynced && c.messages.length,
  ))
    sidebarItem(
      local.key,
      messageText(local.messages[0]).slice(0, 60) || "Temporary chat",
      () => {
        beforeSwitch();
        chat.selectLocal(local);
      },
      null,
      true,
      chat.current === local,
    );
  for (const saved of chatList)
    sidebarItem(
      saved.id,
      saved.title || "Untitled chat",
      () => {
        beforeSwitch();
        chat.load(saved.id).catch((error) => showError(error.message));
      },
      saved.ownerId === chat.user?.uid ? () => deleteChat(saved) : null,
      false,
      chat.current.id === saved.id,
    );
  if (!list.children.length) {
    const p = document.createElement("p");
    p.className = "sidebar-hint";
    p.textContent = chat.user
      ? "Your saved chats will appear here."
      : "Sign in to save and revisit conversations.";
    list.append(p);
  }
}
function sidebarItem(id, title, select, remove, temporary, active) {
  const row = document.createElement("div");
  row.className = "chat-list-item" + (active ? " active" : "");
  row.dataset.chatId = id;
  const label = document.createElement("button");
  label.className = "chat-select";
  label.textContent = title;
  label.title = title;
  label.addEventListener("click", select);
  row.append(label);
  if (temporary) {
    const tag = document.createElement("span");
    tag.className = "temporary-tag";
    tag.textContent = "local";
    row.append(tag);
  }
  if (remove) {
    const button = document.createElement("button");
    button.className = "delete-chat-button";
    button.textContent = "×";
    button.setAttribute("aria-label", `Delete ${title}`);
    button.addEventListener("click", remove);
    row.append(button);
  }
  $("chat-list").append(row);
}
async function refreshChats() {
  const uid = chat.user?.uid;
  if (!uid || !cloud) return;
  try {
    const result = await cloud.list(uid);
    if (chat.user?.uid === uid) {
      chatList = result;
      renderSidebar();
    }
  } catch {
    showError("Could not load your saved chats. Try again.", refreshChats);
  }
}
async function submitMessage(event) {
  event?.preventDefault();
  if (
    chat.current.busy ||
    chat.current.loading ||
    fileReading ||
    voice?.active ||
    voiceStarting
  )
    return;
  clearError();
  $("notice").classList.add("hidden");
  const current = chat.current;
  try {
    const task = chat.send(
      $("message-input").value,
      current.attachment,
      settings(),
    );
    // send() commits the input synchronously after preflight; failed preflight
    // retains the draft/attachment, including on keyboard submission.
    $("message-input").value = current.draft;
    resizeInput();
    render();
    await task;
  } catch (error) {
    showError(error.message);
  }
}
$("chat-form").addEventListener("submit", submitMessage);
$("message-input").addEventListener("input", () => {
  chat.current.draft = $("message-input").value;
  resizeInput();
});
$("message-input").addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    !matchMedia("(pointer: coarse)").matches
  )
    submitMessage(event);
});
for (const id of ["search-button", "study-mode-button"])
  $(id).addEventListener("click", () => {
    const enabled = $(id).getAttribute("aria-pressed") !== "true";
    $(id).setAttribute("aria-pressed", String(enabled));
    $(id).classList.toggle("active", enabled);
  });
$("new-chat-button").addEventListener("click", () => {
  beforeSwitch();
  chat.newChat();
});
$("menu-button").addEventListener("click", () => {
  $("sidebar").classList.add("open");
  $("sidebar-backdrop").classList.remove("hidden");
  $("menu-button").setAttribute("aria-expanded", "true");
});
$("close-sidebar").addEventListener("click", closeSidebar);
$("sidebar-backdrop").addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});
$("dismiss-error").addEventListener("click", clearError);
$("retry-button").addEventListener("click", async () => {
  const retry = retryAction;
  clearError();
  if (retry) await retry();
});
for (const button of document.querySelectorAll("[data-prompt]"))
  button.addEventListener("click", () => {
    $("message-input").value = button.dataset.prompt;
    chat.current.draft = button.dataset.prompt;
    $("message-input").focus();
    resizeInput();
  });
$("attach-button").addEventListener("click", () => {
  $("file-upload-input").value = "";
  $("file-upload-input").click();
});
async function selectFile(file) {
  if (!file || chat.current.busy || voice?.active) return;
  const current = chat.current,
    epoch = ++attachmentEpoch;
  fileReading = true;
  render();
  try {
    const attachment = await readAttachment(file);
    if (epoch === attachmentEpoch && current === chat.current) {
      current.attachment = attachment;
      if (attachment.compressed)
        showNotice(
          "Image resized to make sending and cloud saving more reliable.",
        );
    }
  } catch (error) {
    if (epoch === attachmentEpoch) showError(error.message);
  } finally {
    fileReading = false;
    render();
  }
}
$("file-upload-input").addEventListener("change", (event) =>
  selectFile(event.target.files[0]),
);
$("message-input").addEventListener("paste", (event) => {
  const file = [...(event.clipboardData?.items || [])]
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))
    ?.getAsFile();
  if (file) {
    event.preventDefault();
    selectFile(file);
  }
});
$("remove-image-button").addEventListener("click", () => {
  attachmentEpoch++;
  chat.current.attachment = null;
  render();
});

function actionDialog({
  title,
  description = "",
  label = "",
  value = "",
  confirm = "Save",
  multiline = false,
  destructive = false,
  action,
}) {
  $("action-title").textContent = title;
  $("action-description").textContent = description;
  $("action-label").textContent = label;
  $("action-label").classList.toggle("hidden", !label);
  const field = document.createElement(multiline ? "textarea" : "input");
  field.id = "action-input";
  field.value = value;
  field.required = !!label;
  field.classList.toggle("hidden", !label);
  $("action-input").replaceWith(field);
  $("action-error").textContent = "";
  $("action-confirm").textContent = confirm;
  $("action-confirm").classList.toggle("danger", destructive);
  $("action-confirm").disabled = false;
  $("action-cancel").disabled = false;
  $("action-form").onsubmit = async (event) => {
    event.preventDefault();
    $("action-confirm").disabled = true;
    $("action-cancel").disabled = true;
    try {
      await action(field.value.trim());
      $("action-modal").close();
    } catch (error) {
      $("action-error").textContent = error.message;
    } finally {
      $("action-confirm").disabled = false;
      $("action-cancel").disabled = false;
    }
  };
  $("action-modal").showModal();
}
$("action-cancel").addEventListener("click", () => $("action-modal").close());
$("action-modal").addEventListener("cancel", (event) => {
  if ($("action-confirm").disabled) event.preventDefault();
});
function editMessage(message) {
  actionDialog({
    title: "Edit message",
    description: chat.current.isSynced
      ? "Update this message. Use Retry answer to regenerate its reply."
      : "A successful new answer will replace the conversation from this point onward.",
    label: "Message",
    value: messageText(message),
    multiline: true,
    action: (text) => chat.regenerate(message.id, settings(), text),
  });
}
$("save-chat-button").addEventListener("click", () => {
  if (!chat.user) {
    showAuth("login");
    showNotice(
      "Sign in, then save this conversation. Your current chat stays here.",
    );
    return;
  }
  actionDialog({
    title: "Save to cloud",
    label: "Chat name",
    value: messageText(chat.current.messages[0]).slice(0, 60) || "New chat",
    action: async (title) => {
      await chat.save(title);
      await refreshChats();
    },
  });
});
$("share-chat-button").addEventListener("click", () => {
  const id = chat.current.id;
  actionDialog({
    title: "Share conversation",
    description:
      "The person needs an existing account. Shared chats can be read and edited by collaborators.",
    label: "Their email address",
    confirm: "Share",
    action: (email) => cloud.share(id, email),
  });
});
function deleteChat(saved) {
  if (chat.locals.some((c) => c.id === saved.id && c.busy)) {
    showError(
      "Wait for this chat’s current request to finish before deleting it.",
    );
    return;
  }
  actionDialog({
    title: "Delete conversation?",
    description: `“${saved.title}” and all its messages will be permanently deleted for all collaborators.`,
    confirm: "Delete",
    destructive: true,
    action: async () => {
      if (chat.current.id === saved.id) await endVoice();
      await cloud.remove(saved.id);
      chat.locals = chat.locals.filter((c) => c.id !== saved.id);
      if (chat.current.id === saved.id) chat.newChat();
      await refreshChats();
    },
  });
}

function showAuth(mode) {
  authMode = mode;
  $("auth-error").textContent = "";
  const reset = mode === "reset";
  $("auth-title").textContent =
    mode === "signup"
      ? "Create an account"
      : reset
        ? "Reset password"
        : "Welcome back";
  $("auth-description").textContent = reset
    ? "We’ll email you a password reset link."
    : "Save your conversations and pick up where you left off.";
  $("auth-submit").textContent =
    mode === "signup"
      ? "Create account"
      : reset
        ? "Send reset link"
        : "Sign in";
  $("auth-password").required = !reset;
  $("auth-password").classList.toggle("hidden", reset);
  $("password-label").classList.toggle("hidden", reset);
  $("auth-password").autocomplete =
    mode === "signup" ? "new-password" : "current-password";
  $("auth-toggle").textContent =
    mode === "login" ? "Create an account" : "Back to sign in";
  $("forgot-password").classList.toggle("hidden", mode !== "login");
  if (!$("auth-modal").open) $("auth-modal").showModal();
}
$("login-button").addEventListener("click", () => showAuth("login"));
$("auth-toggle").addEventListener("click", () =>
  showAuth(authMode === "login" ? "signup" : "login"),
);
$("forgot-password").addEventListener("click", () => showAuth("reset"));
document
  .querySelector(".dialog-close")
  .addEventListener("click", () => $("auth-modal").close());
$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("auth-submit").disabled = true;
  $("auth-error").textContent = "";
  try {
    cloud ||= await connectCloud();
    chat.cloud = cloud;
    bindAuth();
    const email = $("auth-email").value.trim(),
      password = $("auth-password").value;
    if (authMode === "reset") {
      await cloud.reset(email);
      showNotice(
        "If an account exists for this email, a password reset link has been sent.",
      );
    } else if (authMode === "signup") await cloud.signup(email, password);
    else await cloud.login(email, password);
    $("auth-password").value = "";
    $("auth-modal").close();
  } catch (error) {
    $("auth-error").textContent =
      error.code === "auth/invalid-credential"
        ? "The email or password is incorrect."
        : error.message;
  } finally {
    $("auth-submit").disabled = false;
  }
});
$("logout-button").addEventListener("click", async () => {
  endVoice();
  try {
    await cloud.logout();
  } catch {
    showError("Could not sign out. Please try again.");
  }
});
function bindAuth() {
  if (authReady) return;
  authReady = true;
  cloud.onAuth((user) => {
    if (chat.user?.uid && chat.user.uid !== user?.uid) endVoice();
    chatList = [];
    chat.setUser(user);
    if (user) refreshChats();
  });
}
connectCloud()
  .then((value) => {
    cloud = value;
    chat.cloud = cloud;
    bindAuth();
  })
  .catch(() => {
    $("login-button").title =
      "Cloud accounts could not connect. Click to retry.";
  });

$("voice-button").addEventListener("click", async () => {
  if (voiceStarting || voice?.active) return;
  if (!chat.readyForRequest(chat.current)) return;
  clearError();
  voiceStarting = true;
  render();
  const current = chat.current,
    uid = chat.user?.uid;
  try {
    const { LiveVoice } = await import("./js/voice.js");
    if (!voiceStarting || current !== chat.current) return;
    voice = new LiveVoice({
      state: (state) => {
        $("voice-panel").classList.toggle("hidden", state === "Ended");
        $("voice-status").textContent = state;
        if (state === "Ended") voiceStarting = false;
        render();
      },
      caption: (text) => {
        $("voice-caption").textContent = text;
      },
      turn: (turns) => chat.voiceTurn(current, turns, uid),
      error: (message) => showError(message),
    });
    $("voice-mute").textContent = "Mute";
    $("voice-mute").setAttribute("aria-pressed", "false");
    await voice.start(current.messages, settings());
  } catch (error) {
    endVoice();
    showError(error.message);
  } finally {
    voiceStarting = false;
    render();
  }
});
$("voice-mute").addEventListener("click", () => {
  const muted = voice?.mute();
  $("voice-mute").textContent = muted ? "Unmute" : "Mute";
  $("voice-mute").setAttribute("aria-pressed", String(!!muted));
});
$("voice-end").addEventListener("click", endVoice);
window.addEventListener("pagehide", endVoice);
render();
