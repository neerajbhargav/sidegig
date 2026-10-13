// Interface sound, treated like motion design (after Velvet UI): opt-in,
// quiet, synthesized live and never quite identical twice. Positive states
// rise, negative states fall, arrivals are noticed rather than announced, and
// failures inform without scolding. It's a bonus layer, never the only signal.

export type SoundKind = 'key' | 'on' | 'off' | 'confirm' | 'dismiss' | 'arrive' | 'fail' | 'send';
type Voice = 'velvet' | 'crisp';

let enabled = false;
let voice: Voice = 'velvet';
let ac: AudioContext | null = null;

export function configureSound(on: boolean, v: Voice) {
  enabled = on;
  voice = v;
}

const jitter = (x: number, pct: number) => x * (1 + (Math.random() * 2 - 1) * pct);

function ctx(): AudioContext | null {
  if (!enabled) return null;
  try {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, at: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine') {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(jitter(f0, 0.015), at);
  o.frequency.exponentialRampToValueAtTime(jitter(f1, 0.015), at + dur * 0.7);
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = voice === 'crisp' ? 6200 : 2400;
  lp.Q.value = 0.5;
  const g = a.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(jitter(peak, 0.1), at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
  o.connect(lp).connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** The keycap's tick: a burst of filtered noise. */
function click(a: AudioContext, at: number, peak: number) {
  const len = Math.floor(a.sampleRate * 0.03);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = jitter(voice === 'crisp' ? 3800 : 2200, 0.05);
  bp.Q.value = 3.5;
  const g = a.createGain();
  g.gain.value = jitter(peak, 0.1);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(at);
}

export function play(kind: SoundKind) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + 0.005;
  const bright = voice === 'crisp' ? 1 : 0.8;
  switch (kind) {
    case 'key':
      click(a, t, 0.09 * bright);
      tone(a, t, 210, 170, 0.06, 0.035, 'triangle');
      break;
    case 'on':
      tone(a, t, 520, 700, 0.12, 0.04);
      tone(a, t + 0.06, 700, 880, 0.12, 0.03);
      break;
    case 'off':
      tone(a, t, 700, 520, 0.12, 0.035);
      tone(a, t + 0.06, 520, 400, 0.12, 0.028);
      break;
    case 'confirm':
      tone(a, t, 523, 523, 0.09, 0.04);
      tone(a, t + 0.08, 784, 784, 0.18, 0.035);
      tone(a, t + 0.08, 3000 * bright, 2820 * bright, 0.12, 0.01);
      break;
    case 'dismiss':
      tone(a, t, 440, 330, 0.12, 0.025);
      break;
    case 'arrive':
      tone(a, t, 1760, 1650, 0.16, 0.012);
      tone(a, t, 880, 880, 0.22, 0.018);
      break;
    case 'fail':
      tone(a, t, 330, 311, 0.12, 0.03, 'triangle');
      tone(a, t + 0.11, 294, 277, 0.16, 0.025, 'triangle');
      break;
    case 'send':
      click(a, t, 0.05 * bright);
      tone(a, t, 400, 900, 0.18, 0.03);
      break;
  }
}
