// Sound for the game, synthesised: wind that rises with airspeed, a chime for
// each ring, and a soft thump on landing. No audio files; it starts only after
// the visitor presses "Take the controls", and it can be muted.
export interface Sound {
  wind(airspeed: number): void;
  ring(climb: boolean): void;
  boost(on: boolean): void;
  pickup(kind: "boost" | "lift" | "time"): void;
  miss(): void;
  land(): void;
  setMuted(muted: boolean): void;
  stop(): void;
}

export function createSound(): Sound | null {
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  const ctx = new AudioCtor();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  // Wind: looping noise through a band-pass that opens with speed.
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish noise
    data[i] = last * 6;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  noise.connect(band).connect(windGain).connect(master);
  noise.start();
  // Booster: the same noise, high and bright, behind its own gate.
  const roar = ctx.createBiquadFilter();
  roar.type = "highpass";
  roar.frequency.value = 900;
  const roarGain = ctx.createGain();
  roarGain.gain.value = 0;
  noise.connect(roar).connect(roarGain).connect(master);

  const tone = (freq: number, at: number, duration: number, level: number, type: OscillatorType = "sine") => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  };

  return {
    wind(airspeed) {
      const now = ctx.currentTime;
      const v = Math.max(0, airspeed);
      band.frequency.setTargetAtTime(250 + v * 28, now, 0.2);
      windGain.gain.setTargetAtTime(Math.min(0.5, (v / 30) ** 2 * 0.35), now, 0.25);
    },
    ring(climb) {
      const at = ctx.currentTime;
      const notes = climb ? [523, 659, 784, 1047] : [784, 1175];
      notes.forEach((f, i) => tone(f, at + i * 0.07, 0.5, 0.18, "triangle"));
    },
    boost(on) {
      roarGain.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, on ? 0.04 : 0.15);
      if (on) tone(150, ctx.currentTime, 0.3, 0.15, "sawtooth");
    },
    pickup(kind) {
      const at = ctx.currentTime;
      const notes = kind === "boost" ? [440, 880] : kind === "lift" ? [392, 587, 784] : [988, 1319];
      notes.forEach((f, i) => tone(f, at + i * 0.05, 0.35, 0.16, kind === "boost" ? "sawtooth" : "sine"));
    },
    miss() {
      tone(196, ctx.currentTime, 0.25, 0.12, "square");
    },
    land() {
      const at = ctx.currentTime;
      tone(80, at, 0.4, 0.4);
      tone(55, at + 0.02, 0.6, 0.3);
      windGain.gain.setTargetAtTime(0, at, 0.1);
    },
    setMuted(muted) {
      master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
      if (!muted && ctx.state === "suspended") void ctx.resume();
    },
    stop() {
      void ctx.close();
    },
  };
}
