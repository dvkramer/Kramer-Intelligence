// Average/resample the browser's input to 16 kHz mono signed little-endian PCM.
class PCMRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.samples = [];
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const ratio = sampleRate / 16000;
    for (const value of channel) {
      this.sum += value;
      this.count++;
      this.phase++;
      if (this.phase >= ratio) {
        const sample = Math.max(-1, Math.min(1, this.sum / this.count));
        this.samples.push(Math.round(sample * (sample < 0 ? 32768 : 32767)));
        this.phase -= ratio;
        this.sum = 0;
        this.count = 0;
      }
      if (this.samples.length === 2048) {
        const data = new ArrayBuffer(4096),
          view = new DataView(data);
        this.samples.forEach((sample, i) => view.setInt16(i * 2, sample, true));
        this.port.postMessage(data, [data]);
        this.samples = [];
      }
    }
    return true;
  }
}
registerProcessor("ki-pcm", PCMRecorder);
