import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { LiveVoice } from "../public/js/voice.js";

test("microphone resampler produces correctly sized 16 kHz PCM from 48 kHz input", async () => {
  let Recorder;
  const packets = [];
  const context = vm.createContext({
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (data) => packets.push(data) };
      }
    },
    registerProcessor: (_, cls) => {
      Recorder = cls;
    },
  });
  vm.runInContext(await readFile("public/js/pcm-worklet.js", "utf8"), context);
  const recorder = new Recorder();
  for (let i = 0; i < 48; i++)
    recorder.process([[new Float32Array(128).fill(0.5)]]);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].byteLength, 4096);
  assert.equal(new DataView(packets[0]).getInt16(0, true), 16384);
});
test("voice hang-up releases mic, socket and playback, flushes transcript only once", async () => {
  const turns = [],
    states = [];
  let stopped = 0,
    closed = 0;
  const voice = new LiveVoice({
    state: (s) => states.push(s),
    caption: () => {},
    turn: async (t) => turns.push(t),
    error: () => {},
  });
  voice.active = true;
  voice.inputText = "Hi";
  voice.outputText = "Hello";
  voice.stream = { getTracks: () => [{ stop: () => stopped++ }] };
  voice.socket = { close: () => closed++ };
  voice.audio = { close: async () => {} };
  voice.sources.add({ stop: () => stopped++, disconnect: () => {} });
  voice.end();
  voice.end();
  await voice.turnQueue;
  assert.equal(stopped, 2);
  assert.equal(closed, 1);
  assert.equal(turns.length, 1);
  assert.equal(turns[0][0].role, "user");
  assert.equal(turns[0][1].text, "Hello");
  assert.deepEqual(states, ["Ended"]);
});
test("voice interruption stops queued audio and retains a marked transcript", async () => {
  const turns = [];
  const voice = new LiveVoice({
    state: () => {},
    caption: () => {},
    turn: async (t) => turns.push(t),
    error: () => {},
  });
  voice.inputText = "question";
  voice.outputText = "unfinished answer";
  voice.flushTurn(true);
  voice.flushTurn();
  await voice.turnQueue;
  assert.equal(turns.length, 1);
  assert.match(turns[0][1].text, /\[interrupted\]$/);
});
