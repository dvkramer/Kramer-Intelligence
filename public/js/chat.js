import {
  newConversation,
  newId,
  copy,
  makePayload,
  checkDocument,
  mergeMessages,
} from "./model.js";

export class ChatController {
  constructor({
    request,
    changed = () => {},
    error = () => {},
    notice = () => {},
  }) {
    this.request = request;
    this.changed = changed;
    this.error = error;
    this.notice = notice;
    this.current = newConversation();
    this.locals = [this.current];
    this.user = null;
    this.cloud = null;
    this.unsubscribe = () => {};
    this.selection = 0;
  }
  settings() {
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isStudyModeActive: false,
      searchEnabled: true,
    };
  }
  authorized(chat, uid) {
    return !chat.isSynced || this.user?.uid === uid;
  }
  newChat() {
    this.unsubscribe();
    this.selection++;
    this.current = newConversation();
    this.locals.push(this.current);
    this.changed();
  }
  selectLocal(chat) {
    this.unsubscribe();
    this.selection++;
    this.current = chat;
    this.changed();
  }
  async load(id) {
    const selection = ++this.selection;
    const uid = this.user?.uid;
    const info = await this.cloud.get(id);
    if (selection !== this.selection || this.user?.uid !== uid) return;
    this.unsubscribe();
    const known = this.locals.find((c) => c.id === id);
    this.current = known || { ...newConversation(), ...info, isSynced: true };
    if (!known) this.locals.push(this.current);
    this.current.loading = true;
    this.listen(this.current);
    this.changed();
  }
  listen(chat) {
    this.unsubscribe();
    this.unsubscribe = this.cloud.listen(
      chat.id,
      (remote) => {
        if (this.current !== chat) return;
        chat.loading = false;
        chat.pendingIds ||= new Set();
        for (const m of remote) {
          const local = chat.messages.find((x) => x.id === m.id);
          if (local && JSON.stringify(local.parts) === JSON.stringify(m.parts))
            chat.pendingIds.delete(m.id);
        }
        chat.messages = mergeMessages(remote, chat.messages, chat.pendingIds);
        this.changed();
      },
      () => {
        if (this.current !== chat) return;
        this.error(
          "Could not sync this chat. Your visible messages have been kept.",
          () => this.listen(chat),
        );
      },
    );
  }
  setUser(user) {
    const oldUid = this.user?.uid;
    this.user = user;
    if (oldUid && oldUid !== user?.uid) {
      this.unsubscribe();
      this.selection++;
      this.locals = this.locals.filter((c) => !c.isSynced && !c.saveId);
      if (this.current.isSynced || this.current.saveId) {
        this.current = newConversation();
        this.locals.push(this.current);
      }
    }
    this.changed();
  }
  async persist(chat, message, uid, edit = false) {
    if (!chat.isSynced) return;
    if (!this.authorized(chat, uid))
      throw new Error("Sign in again before saving this conversation.");
    chat.pendingIds ||= new Set();
    chat.pendingIds.add(message.id);
    if (edit) await this.cloud.edit(chat.id, message);
    else message.firestoreId = await this.cloud.append(chat.id, message);
  }
  readyForRequest(chat) {
    if (chat.busy || chat.loading) return false;
    if (
      chat.pending?.applied ||
      (chat.isSynced &&
        chat.pending?.type === "send" &&
        !chat.pending.userSaved)
    ) {
      this.error(
        "Retry saving the previous message before continuing this conversation.",
        () => this.run(chat),
      );
      return false;
    }
    return true;
  }
  async send(text, attachment, settings) {
    const chat = this.current;
    if (!this.readyForRequest(chat) || (!text.trim() && !attachment))
      return false;
    const parts = [];
    if (attachment) {
      parts.push({
        inlineData: { mimeType: attachment.mimeType, data: attachment.data },
      });
      parts.push({
        fileInfoForDisplay: {
          type: attachment.mimeType === "application/pdf" ? "pdf" : "image",
          name: attachment.name,
          ...(attachment.mimeType === "application/pdf"
            ? {}
            : { dataUrl: attachment.data }),
        },
      });
    }
    if (text.trim()) parts.push({ text: text.trim() });
    const message = {
      id: newId(),
      role: "user",
      parts,
      userId: this.user?.uid || null,
    };
    const history = [...copy(chat.messages), message];
    const payload = makePayload(history, settings);
    if (chat.isSynced) checkDocument(message);
    chat.messages.push(message);
    chat.draft = "";
    chat.attachment = null;
    chat.pending = { type: "send", message, payload, uid: this.user?.uid };
    this.changed();
    await this.run(chat);
    return true;
  }
  async regenerate(id, settings, editedText) {
    const chat = this.current;
    if (!this.readyForRequest(chat)) return;
    const index = chat.messages.findIndex((m) => m.id === id);
    if (index < 0) return;
    const original = chat.messages[index];
    const edited = copy(original);
    if (editedText !== undefined) {
      edited.parts = edited.parts.filter((p) => typeof p.text !== "string");
      if (editedText.trim()) edited.parts.push({ text: editedText.trim() });
      if (!edited.parts.some((p) => p.text || p.inlineData))
        throw new Error("A message needs text or an attachment.");
      if (chat.isSynced) {
        chat.busy = true;
        this.changed();
        try {
          await this.persist(chat, edited, this.user?.uid, true);
          chat.messages[index] = edited;
        } finally {
          chat.busy = false;
          this.changed();
        }
        return;
      }
    }
    const history =
      editedText === undefined
        ? copy(chat.messages.slice(0, index))
        : [...copy(chat.messages.slice(0, index)), edited];
    const payload = makePayload(history, settings);
    chat.pending = {
      type: "replace",
      index,
      original,
      edited: editedText !== undefined ? edited : null,
      payload,
      uid: this.user?.uid,
    };
    await this.run(chat);
  }
  async run(chat) {
    const job = chat.pending;
    if (!job || chat.busy) return;
    chat.busy = true;
    this.changed();
    try {
      if (job.type === "send" && !job.userSaved) {
        await this.persist(chat, job.message, job.uid);
        job.userSaved = true;
      }
      if (!this.authorized(chat, job.uid)) return;
      if (!job.answer) {
        const data = await this.request(job.payload);
        const parts = [{ text: data.text }];
        if (data.searchSuggestionHtml)
          parts.push({ searchSuggestionHtml: data.searchSuggestionHtml });
        job.answer = {
          role: "model",
          parts,
          id:
            job.type === "replace" && chat.isSynced ? job.original.id : newId(),
        };
        if (job.type === "replace" && chat.isSynced)
          job.answer.firestoreId = job.original.firestoreId;
        job.metadata = data;
      }
      if (!this.authorized(chat, job.uid)) return;
      // Commit replacement only after generation succeeds. Failed regeneration
      // leaves every original message intact, including all later turns.
      if (!job.applied) {
        if (job.type === "send") chat.messages.push(job.answer);
        else if (chat.isSynced) {
          const index = chat.messages.findIndex(
            (m) => m.id === job.original.id,
          );
          if (index >= 0) chat.messages[index] = job.answer;
        } else
          chat.messages.splice(
            job.index,
            chat.messages.length - job.index,
            ...(job.edited ? [job.edited] : []),
            job.answer,
          );
        job.applied = true;
        this.changed();
      }
      await this.persist(
        chat,
        job.answer,
        job.uid,
        job.type === "replace" && chat.isSynced,
      );
      chat.pending = null;
      if (this.current === chat) {
        if (job.metadata?.contextTrimmed)
          this.notice(
            "Older turns were left out of this request to fit the model. They remain in your chat.",
          );
        if (job.metadata?.truncated)
          this.notice(
            "This answer reached Gemini’s length limit. Ask it to continue.",
          );
      }
    } catch (error) {
      chat.lastError = error.message;
      if (this.current === chat)
        this.error(
          job.applied
            ? `The answer is here, but cloud saving failed. Retry to save it without generating again. ${error.message}`
            : error.message,
          () => this.run(chat),
        );
    } finally {
      chat.busy = false;
      this.changed();
    }
  }
  async save(title) {
    const chat = this.current,
      uid = this.user?.uid;
    if (!uid) throw new Error("Sign in to save your chat.");
    if (chat.busy || chat.isSynced) return;
    if (!chat.messages.length)
      throw new Error("Send a message before saving this chat.");
    chat.messages.forEach(checkDocument);
    chat.busy = true;
    this.changed();
    // Keep the target ID for safe retries after a partial save/network failure.
    chat.saveId ||= newId();
    try {
      await this.cloud.create(chat.saveId, title, uid);
      for (const message of chat.messages) {
        if (this.user?.uid !== uid)
          throw new Error("Sign in again to finish saving.");
        message.firestoreId = await this.cloud.append(chat.saveId, message);
      }
      if (this.user?.uid !== uid) return;
      Object.assign(chat, {
        id: chat.saveId,
        title,
        ownerId: uid,
        isSynced: true,
      });
      if (chat.pending) chat.pending.uid = uid;
      if (this.current === chat) this.listen(chat);
    } finally {
      chat.busy = false;
      this.changed();
    }
  }
  async voiceTurn(chat, turns, uid) {
    if (!this.authorized(chat, uid)) return;
    for (const { role, text } of turns) {
      if (!text.trim()) continue;
      const message = {
        id: newId(),
        role,
        parts: [{ text }],
        ...(role === "user" ? { userId: uid || null } : {}),
      };
      chat.messages.push(message);
      this.changed();
      try {
        await this.persist(chat, message, uid);
      } catch {
        chat.unsavedVoice ||= [];
        chat.unsavedVoice.push(message);
        if (this.current === chat)
          this.error(
            "The voice transcript is here, but could not be saved. Retry to save it.",
            () => this.retryVoice(chat, uid),
          );
      }
    }
  }
  async retryVoice(chat, uid) {
    try {
      for (const message of [...(chat.unsavedVoice || [])]) {
        await this.persist(chat, message, uid);
        chat.unsavedVoice = chat.unsavedVoice.filter(
          (m) => m.id !== message.id,
        );
      }
      this.notice("Voice transcript saved.");
    } catch (error) {
      this.error(error.message, () => this.retryVoice(chat, uid));
    }
  }
}
