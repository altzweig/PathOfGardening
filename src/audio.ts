// Procedural WebAudio sound effects (no audio files).
const rand = (a: number, b: number) => a + Math.random() * (b - a);

let AC: AudioContext | null = null, master: GainNode, noiseBuf: AudioBuffer;
export const audio = { on: true };
const last: Record<string, number> = {};

export function initAudio() {
  if (AC) { AC.resume(); return; }
  try {
    AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.65;
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp); comp.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { AC = null; }
}
function can(name: string, gap: number) {
  if (!AC || !audio.on) return false; const n = AC.currentTime;
  if (last[name] && n - last[name] < gap) return false; last[name] = n; return true;
}
interface ToneO { type?: OscillatorType; f?: number; f2?: number | null; t?: number; vol?: number; at?: number; when?: number; vib?: number; vibF?: number; filt?: { type: BiquadFilterType; f: number; q?: number } | null }
function tone({ type = 'sine', f = 440, f2 = null, t = .12, vol = .2, at = .004, when = 0, vib = 0, vibF = 0, filt = null }: ToneO) {
  const A = AC!, n = A.currentTime + when;
  const o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, n);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, n + t);
  const g = A.createGain(); g.gain.setValueAtTime(.0001, n); g.gain.exponentialRampToValueAtTime(vol, n + at); g.gain.exponentialRampToValueAtTime(.0001, n + t);
  let lastNode: AudioNode = o;
  if (vib) { const l = A.createOscillator(); l.frequency.value = vibF; const lg = A.createGain(); lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(n); l.stop(n + t + .05); }
  if (filt) { const bq = A.createBiquadFilter(); bq.type = filt.type; bq.frequency.value = filt.f; bq.Q.value = filt.q || 1; lastNode.connect(bq); lastNode = bq; }
  lastNode.connect(g); g.connect(master); o.start(n); o.stop(n + t + .05);
}
interface NoiseO { t?: number; vol?: number; type?: BiquadFilterType; f?: number; f2?: number | null; q?: number; when?: number; at?: number }
function noise({ t = .2, vol = .2, type = 'lowpass', f = 1200, f2 = null, q = .8, when = 0, at = .004 }: NoiseO) {
  const A = AC!, n = A.currentTime + when;
  const s = A.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rand(.8, 1.2);
  const bq = A.createBiquadFilter(); bq.type = type; bq.Q.value = q; bq.frequency.setValueAtTime(f, n);
  if (f2) bq.frequency.exponentialRampToValueAtTime(f2, n + t);
  const g = A.createGain(); g.gain.setValueAtTime(.0001, n); g.gain.exponentialRampToValueAtTime(vol, n + at); g.gain.exponentialRampToValueAtTime(.0001, n + t);
  s.connect(bq); bq.connect(g); g.connect(master); s.start(n, rand(0, .5)); s.stop(n + t + .05);
}
// Shepard pop: octave partials under a bell curve -> seemingly endlessly rising pickup sound
let popStep = 0;
function shepardPop(big: boolean) {
  const A = AC!, step = popStep++, n = A.currentTime, p = (step % 12) / 12;
  const out = A.createGain(); const peak = big ? .38 : .26;
  out.gain.setValueAtTime(.0001, n); out.gain.exponentialRampToValueAtTime(peak, n + .005); out.gain.exponentialRampToValueAtTime(.0001, n + (big ? .32 : .2));
  out.connect(master);
  for (let k = 0; k < 7; k++) {
    const f = 110 * Math.pow(2, k + p);
    const l = Math.log2(f / 110) - 3; const a = Math.exp(-(l * l) / (2 * .95 * .95));
    if (a < .02) continue;
    const o = A.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * .72, n); o.frequency.exponentialRampToValueAtTime(f, n + .03);
    const g = A.createGain(); g.gain.value = a * .45; o.connect(g); g.connect(out); o.start(n); o.stop(n + .35);
  }
}
// Comic punch: fat low "thwack" + snappy slap noise + a short pitch-dropping "pow" body
function comicPunch(when: number, strength: number) {
  const v = Math.min(1, .55 + strength * .12);
  tone({ type: 'sine', f: 190, f2: 48, t: .16, vol: .42 * v, when });
  tone({ type: 'square', f: 420, f2: 110, t: .07, vol: .07 * v, when, filt: { type: 'lowpass', f: 1800 } });
  noise({ t: .07, vol: .32 * v, type: 'bandpass', f: 2400, f2: 700, q: 1.1, when, at: .002 });
  noise({ t: .14, vol: .14 * v, type: 'lowpass', f: 900, f2: 120, when: when + .01 });
}

const popQueue: boolean[] = []; let popT = 0;
export function tickAudio(dt: number) {
  popT -= dt;
  if (popQueue.length && popT <= 0 && AC) { shepardPop(popQueue.shift()!); popT = .045; if (popQueue.length > 12) popQueue.splice(0, popQueue.length - 12); }
}

export const SND: Record<string, (arg?: any) => void> = {
  pop(big: boolean) { if (!AC || !audio.on) return; popQueue.push(big); },
  rake() { if (can('rake', .08)) noise({ t: .16, vol: .18, type: 'bandpass', f: 2600, f2: 500, q: 1.2 }); },
  /** n = number of enemies hit by one swing: one punch per target, slightly staggered */
  punches(n: number) { if (!can('punch', .06)) return; const k = Math.min(5, n); for (let i = 0; i < k; i++) comicPunch(i * .045, n); },
  asp() { if (can('asp', .05)) { tone({ type: 'triangle', f: 1100, f2: 260, t: .11, vol: .16 }); noise({ t: .05, vol: .08, type: 'highpass', f: 3000 }); } },
  shot() { if (can('shot', .05)) { noise({ t: .22, vol: .28, f: 4000, f2: 300 }); tone({ f: 140, f2: 45, t: .16, vol: .25 }); } },
  throw() { if (can('throw', .05)) noise({ t: .25, vol: .1, type: 'bandpass', f: 600, f2: 1600, q: 2 }); },
  boom() { if (can('boom', .04)) { noise({ t: .55, vol: .32, f: 900, f2: 90 }); tone({ f: 85, f2: 30, t: .45, vol: .32 }); } },
  boomS() { if (can('boomS', .04)) { noise({ t: .25, vol: .18, f: 900, f2: 90 }); tone({ f: 120, f2: 30, t: .2, vol: .18 }); } },
  confuse() { if (can('confuse', .4)) { tone({ type: 'triangle', f: 980, f2: 520, t: .7, vol: .09, vib: 140, vibF: 13 }); tone({ type: 'sine', f: 1500, f2: 1200, t: .5, vol: .05, vib: 90, vibF: 9, when: .12 }); } },
  bleed() { if (can('bleed', .25)) tone({ f: 330, f2: 160, t: .09, vol: .05 }); },
  hit() { if (can('hit', .04)) noise({ t: .06, vol: .12, type: 'bandpass', f: 1800, q: 1.5 }); },
  imm() { if (can('imm', .15)) tone({ f: 2200, f2: 2600, t: .06, vol: .04 }); },
  die() { if (can('die', .05)) { tone({ f: 520, f2: 90, t: .25, vol: .14, type: 'triangle' }); noise({ t: .2, vol: .08, f: 1500, f2: 200 }); } },
  hurt() { if (can('hurt', .2)) tone({ type: 'square', f: 160, f2: 70, t: .14, vol: .09 }); },
  field() { if (can('field', .5)) noise({ t: .12, vol: .08, f: 400 }); },
  level() { if (!can('level', .3)) return; [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f, t: .5, vol: .12, when: i * .08 })); },
  ready() { if (can('ready', .15)) { tone({ f: 1320, t: .3, vol: .06 }); tone({ f: 1980, t: .35, vol: .04, when: .06 }); } },
  merge() { if (can('merge', .1)) tone({ f: 700, f2: 1400, t: .18, vol: .06 }); },
  baa() { if (can('baa', .3)) tone({ type: 'sawtooth', f: 330, f2: 300, t: .55, vol: .06, vib: 18, vibF: 7, filt: { type: 'bandpass', f: 900, q: 2 } }); },
  ram() { if (can('ram', .1)) { tone({ f: 110, f2: 40, t: .3, vol: .3 }); noise({ t: .15, vol: .18, f: 700 }); } },
  tongue() { if (can('tongue', .1)) tone({ f: 180, f2: 700, t: .12, vol: .08 }); },
  respawn() { if (can('resp', .3)) [392, 523, 659].forEach((f, i) => tone({ f, t: .35, vol: .08, when: i * .07 })); },
  cycle() { if (can('cycle', .05)) tone({ type: 'triangle', f: 880, f2: 1320, t: .07, vol: .06 }); },
  warn() { if (can('warn', .8)) { noise({ t: .6, vol: .05, type: 'bandpass', f: 500, f2: 900, q: 3 }); } },
};
export function play(name: string, arg?: any) { if (!AC || !audio.on) return; const f = SND[name]; if (f) f(arg); }
