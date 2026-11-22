/**
 * Small synthesized sound effects (Web Audio, no files). Soft and minimal, to match the world.
 * Browsers only allow audio after a user gesture, so the context is created on the first
 * pointer or key press. Muting is remembered on this device.
 */

const MUTE_KEY = "stride.muted";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
const listeners = new Set<(muted: boolean) => void>();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function unlock() {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const Context =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  ctx = new Context();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(compressor).connect(ctx.destination);
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

export function isMuted() {
  return muted;
}
export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Not remembered if storage is blocked; still applies for this visit.
  }
  if (ctx && master) master.gain.setTargetAtTime(value ? 0 : 0.55, ctx.currentTime, 0.05);
  listeners.forEach((listener) => listener(value));
}
export function onMuteChange(listener: (muted: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ready() {
  return ctx && master && !muted && ctx.state === "running" ? { ctx, out: master } : null;
}

type ToneOptions = {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  decay?: number;
  delay?: number;
  slideTo?: number;
};
function tone(
  frequency: number,
  { type = "sine", gain = 0.2, attack = 0.005, decay = 0.4, delay = 0, slideTo }: ToneOptions = {},
) {
  const audio = ready();
  if (!audio) return;
  const { ctx, out } = audio;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + attack + decay);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + attack + decay + 0.05);
  return osc;
}

let noiseBuffer: AudioBuffer | null = null;
function noise(
  duration: number,
  { filter = "lowpass" as BiquadFilterType, from = 400, to = 400, gain = 0.2, q = 0.8, delay = 0 } = {},
) {
  const audio = ready();
  if (!audio) return;
  const { ctx, out } = audio;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const shape = ctx.createBiquadFilter();
  shape.type = filter;
  shape.Q.value = q;
  shape.frequency.setValueAtTime(from, start);
  shape.frequency.exponentialRampToValueAtTime(to, start + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(shape).connect(env).connect(out);
  source.start(start);
  source.stop(start + duration + 0.05);
  return source;
}

// A pentatonic scale keeps any run of notes pleasant.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

/** Everything scheduled for the current hold, so letting go can silence it at once. */
let holdVoices: AudioScheduledSourceNode[] = [];

export const sfx = {
  /**
   * While a commit is held: soft mechanical ratchet clicks that speed up as the bar fills,
   * like winding a watch, over a faint airy swell. Letting go cuts it off.
   */
  holdStart(duration = 0.65) {
    sfx.holdStop();
    const clicks = 8;
    for (let k = 0; k < clicks; k++) {
      // Accelerating spacing: early clicks are slow, the last ones bunch up.
      const at = duration * (1 - Math.pow(1 - k / clicks, 1.7));
      const click = noise(0.025, {
        filter: "bandpass",
        from: 3200 + k * 160,
        to: 2600 + k * 160,
        gain: 0.05 + k * 0.006,
        q: 6,
        delay: at,
      });
      const body = tone(900 + k * 70, { type: "sine", gain: 0.025 + k * 0.004, attack: 0.002, decay: 0.03, delay: at });
      if (click) holdVoices.push(click);
      if (body) holdVoices.push(body);
    }
    const air = noise(duration, { filter: "bandpass", from: 400, to: 1600, gain: 0.025, q: 0.7 });
    if (air) holdVoices.push(air);
  },
  holdStop() {
    if (!ctx) return;
    const now = ctx.currentTime;
    holdVoices.forEach((voice) => {
      try {
        voice.stop(now);
      } catch {
        // Already finished.
      }
    });
    holdVoices = [];
  },
  /** A task committed: a soft two-note chime over a low click. */
  commit() {
    tone(120, { type: "sine", gain: 0.18, decay: 0.12, slideTo: 70 });
    tone(659.25, { type: "triangle", gain: 0.12, decay: 0.5 });
    tone(987.77, { type: "triangle", gain: 0.09, decay: 0.7, delay: 0.09 });
  },
  /** A bonus task: the chime, one step higher, with a sparkle. */
  bonus() {
    sfx.commit();
    tone(1318.5, { type: "sine", gain: 0.06, decay: 0.8, delay: 0.2 });
    tone(1760, { type: "sine", gain: 0.04, decay: 0.9, delay: 0.28 });
  },
  /** One heave against the stone: a heavy, muffled thud. */
  heave() {
    tone(82, { type: "sine", gain: 0.32, attack: 0.01, decay: 0.32, slideTo: 44 });
    noise(0.22, { filter: "lowpass", from: 320, to: 90, gain: 0.22 });
  },
  /** The stone locks into its slot: a wooden click and a bell. */
  lock() {
    tone(1400, { type: "square", gain: 0.05, decay: 0.05 });
    tone(523.25, { type: "sine", gain: 0.14, decay: 1.1, delay: 0.03 });
    tone(784, { type: "sine", gain: 0.07, decay: 1.3, delay: 0.05 });
  },
  /** A bridge stone landing; successive stones climb the scale. */
  stone(index: number) {
    tone(SCALE[index % SCALE.length], { type: "sine", gain: 0.06, decay: 0.18 });
    noise(0.06, { filter: "bandpass", from: 2400, to: 1800, gain: 0.04, q: 2 });
  },
  /** A monument-style landing of a skyline tower or similar: very soft. */
  pluck(step = 0) {
    tone(SCALE[step % SCALE.length], { type: "triangle", gain: 0.09, decay: 0.25 });
  },
  /** A paper plane leaving: a quick airy whoosh. */
  whoosh() {
    noise(0.55, { filter: "bandpass", from: 700, to: 3200, gain: 0.12, q: 1.4 });
  },
  /** "Not yet": two dull, descending notes. */
  nudge() {
    tone(329.63, { type: "sine", gain: 0.1, decay: 0.18 });
    tone(246.94, { type: "sine", gain: 0.1, decay: 0.28, delay: 0.13 });
  },
  /** A slip, logged: one low, plain tone. No drama. */
  slip() {
    tone(146.83, { type: "sine", gain: 0.16, attack: 0.04, decay: 1.2 });
  },
  /** A vow sealed: a calm, open fifth. */
  vow() {
    tone(392, { type: "sine", gain: 0.1, attack: 0.03, decay: 1.2 });
    tone(587.33, { type: "sine", gain: 0.08, attack: 0.05, decay: 1.4, delay: 0.06 });
  },
  /** A keypad press on the lock screen: a tiny soft tap. */
  key() {
    noise(0.03, { filter: "bandpass", from: 2600, to: 2000, gain: 0.05, q: 3 });
    tone(1200, { type: "sine", gain: 0.02, attack: 0.002, decay: 0.03 });
  },
  /** Wrong passcode: a short, low double buzz. */
  denied() {
    tone(160, { type: "triangle", gain: 0.12, decay: 0.09 });
    tone(150, { type: "triangle", gain: 0.12, decay: 0.12, delay: 0.12 });
  },
  /** Unlocked: a light rising pair and a breath of air. */
  unlocked() {
    tone(659.25, { type: "sine", gain: 0.08, decay: 0.35 });
    tone(987.77, { type: "sine", gain: 0.07, decay: 0.6, delay: 0.08 });
    noise(0.6, { filter: "bandpass", from: 800, to: 3000, gain: 0.04, q: 1, delay: 0.05 });
  },
  /** The whole day sealed and the core ignites: a slow swelling chord. */
  ignite() {
    [261.63, 329.63, 392, 523.25, 659.25].forEach((frequency, i) =>
      tone(frequency, { type: "triangle", gain: 0.08, attack: 0.6 + i * 0.08, decay: 3.2, delay: i * 0.12 }),
    );
    tone(65.41, { type: "sine", gain: 0.22, attack: 0.4, decay: 3.5 });
    noise(2.5, { filter: "highpass", from: 3000, to: 6000, gain: 0.03, delay: 0.5 });
  },
};
