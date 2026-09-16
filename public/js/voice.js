const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
export class LiveVoice {
  constructor({ state, caption, turn, error }) {
    this.onState = state;
    this.onCaption = caption;
    this.onTurn = turn;
    this.onError = error;
    this.active = false;
    this.sources = new Set();
    this.inputText = "";
    this.outputText = "";
    this.turnQueue = Promise.resolve();
    this.incoming = Promise.resolve();
    this.epoch = 0;
  }
  async start(history, settings) {
    if (this.active) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.AudioContext ||
      !window.AudioWorkletNode
    )
      throw new Error(
        "Live voice needs a browser with microphone and audio support. Try current Chrome, Edge, or Safari.",
      );
    this.active = true;
    const epoch = ++this.epoch;
    this.onState("Connecting…");
    try {
      this.audio = new AudioContext();
      await this.audio.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (!this.active || epoch !== this.epoch) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      await this.audio.audioWorklet.addModule("/js/pcm-worklet.js");
      if (!this.active || epoch !== this.epoch) return;
      const response = await fetch("/api/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        signal: AbortSignal.timeout(25_000),
      });
      const config = await response.json();
      if (!response.ok)
        throw new Error(config.error || "Could not start voice.");
      if (!this.active || epoch !== this.epoch) return;
      this.socket = new WebSocket(
        `${WS_URL}?access_token=${encodeURIComponent(config.token)}`,
      );
      this.socket.binaryType = "arraybuffer";
      this.socket.onopen = () => {
        if (this.active) this.send({ setup: config.setup });
      };
      this.socket.onmessage = (event) => {
        this.incoming = this.incoming
          .then(async () => {
            if (!this.active || epoch !== this.epoch) return;
            const data = JSON.parse(
              typeof event.data === "string"
                ? event.data
                : new TextDecoder().decode(event.data),
            );
            if (data.error)
              throw new Error(
                "Gemini could not continue this voice call. Please start a new call.",
              );
            if (data.setupComplete) {
              clearTimeout(this.connectTimer);
              const recent = history
                .slice(-20)
                .map((m) => ({
                  role: m.role,
                  parts: m.parts
                    .filter((p) => typeof p.text === "string")
                    .map((p) => ({ text: p.text.slice(-4000) })),
                }))
                .filter((m) => m.parts.length);
              if (recent.length)
                this.send({
                  clientContent: { turns: recent, turnComplete: false },
                });
              this.beginMic();
              this.onState("Listening");
            }
            const content = data.serverContent;
            if (content) {
              if (content.inputTranscription?.text)
                this.inputText += content.inputTranscription.text;
              if (content.outputTranscription?.text)
                this.outputText += content.outputTranscription.text;
              this.onCaption(
                [
                  this.inputText && `You: ${this.inputText}`,
                  this.outputText && `KI: ${this.outputText}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              );
              if (content.interrupted) {
                this.clearPlayback();
                this.flushTurn(true);
                this.onState(this.muted ? "Muted" : "Listening");
              } else
                for (const part of content.modelTurn?.parts || [])
                  if (part.inlineData?.data) this.play(part.inlineData);
              if (content.turnComplete) {
                this.flushTurn();
                this.onState(this.muted ? "Muted" : "Listening");
              }
            }
            if (data.goAway) {
              this.end();
              this.onError(
                "This voice session has ended. Start a new call to continue.",
              );
            }
          })
          .catch((error) => {
            this.end();
            this.onError(error.message || "Voice connection failed.");
          });
      };
      this.socket.onerror = () => {
        this.end();
        this.onError(
          "Voice could not connect. Check your connection and try again.",
        );
      };
      this.socket.onclose = (event) => {
        if (!this.active) return;
        this.end();
        this.onError(
          event.code === 1008
            ? "Gemini rejected this voice session or its free quota is exhausted. Try again later."
            : "Voice disconnected. Your completed transcript has been kept.",
        );
      };
      this.connectTimer = setTimeout(() => {
        if (this.active) {
          this.end();
          this.onError("Voice connection timed out. Try again.");
        }
      }, 15_000);
      this.expiryTimer = setTimeout(
        () => {
          this.end();
          this.onError(
            "This voice call reached its session limit. Start a new call to continue.",
          );
        },
        Math.max(0, Date.parse(config.expireTime) - Date.now() - 5000),
      );
    } catch (error) {
      if (!this.active || epoch !== this.epoch) return;
      this.end();
      throw new Error(
        error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow the microphone in your browser’s site settings to use voice."
          : error.name === "NotFoundError"
            ? "No microphone was found."
            : error.message || "Could not start voice.",
      );
    }
  }
  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  beginMic() {
    this.mic = this.audio.createMediaStreamSource(this.stream);
    this.processor = new AudioWorkletNode(this.audio, "ki-pcm");
    this.silence = this.audio.createGain();
    this.silence.gain.value = 0;
    this.mic.connect(this.processor);
    this.processor.connect(this.silence);
    this.silence.connect(this.audio.destination);
    this.processor.port.onmessage = ({ data }) => {
      if (
        !this.active ||
        this.muted ||
        this.socket?.readyState !== WebSocket.OPEN
      )
        return;
      if (this.socket.bufferedAmount > 128_000) {
        this.end();
        this.onError(
          "The connection is too slow for live audio. Please try again.",
        );
        return;
      }
      const bytes = new Uint8Array(data);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      this.send({
        realtimeInput: {
          audio: { data: btoa(binary), mimeType: "audio/pcm;rate=16000" },
        },
      });
    };
  }
  mute() {
    this.muted = !this.muted;
    for (const track of this.stream?.getAudioTracks() || [])
      track.enabled = !this.muted;
    if (this.muted) this.send({ realtimeInput: { audioStreamEnd: true } });
    this.onState(this.muted ? "Muted" : "Listening");
    return this.muted;
  }
  play(inline) {
    if (!this.audio || this.audio.state === "closed") return;
    const raw = atob(inline.data);
    const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const count = Math.floor(bytes.length / 2);
    const rate = Number(/rate=(\d+)/.exec(inline.mimeType || "")?.[1] || 24000);
    if (!count || rate < 8000 || rate > 96000) return;
    const buffer = this.audio.createBuffer(1, count, rate),
      samples = buffer.getChannelData(0);
    for (let i = 0; i < count; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = this.audio.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audio.destination);
    this.playAt = Math.max(this.playAt || 0, this.audio.currentTime + 0.02);
    source.start(this.playAt);
    this.playAt += buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
    this.onState(this.muted ? "Muted · speaking" : "Speaking");
  }
  clearPlayback() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.sources.clear();
    this.playAt = 0;
  }
  flushTurn(interrupted = false) {
    const turns = [];
    if (this.inputText.trim())
      turns.push({ role: "user", text: this.inputText.trim() });
    if (this.outputText.trim())
      turns.push({
        role: "model",
        text: this.outputText.trim() + (interrupted ? " [interrupted]" : ""),
      });
    this.inputText = "";
    this.outputText = "";
    if (turns.length)
      this.turnQueue = this.turnQueue
        .then(() => this.onTurn(turns))
        .catch(() => this.onError("Could not save this voice turn."));
  }
  end() {
    if (!this.active) return;
    this.active = false;
    this.epoch++;
    clearTimeout(this.connectTimer);
    clearTimeout(this.expiryTimer);
    this.flushTurn();
    this.clearPlayback();
    this.processor?.disconnect();
    this.mic?.disconnect();
    this.silence?.disconnect();
    if (this.processor) this.processor.port.onmessage = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;
      this.socket.close();
    }
    this.audio?.close().catch(() => {});
    this.onState("Ended");
    this.onCaption("");
  }
}
