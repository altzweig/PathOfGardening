// Procedural WebAudio sound effects (no audio files).
const rand = (a: number, b: number) => a + Math.random() * (b - a);

let AC: AudioContext | null = null, master: GainNode, noiseBuf: AudioBuffer;
export const audio = { on: true };
const last: Record<string, number> = {};
/** volume multiplier for the next tone()/noise() calls (positional building sounds) */
let busVol = 1;

export function initAudio() {
  if (AC) { AC.resume(); return; }
  try {
    AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.65;
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp); comp.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    void loadSamples();
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
  const g = A.createGain(); g.gain.setValueAtTime(.0001, n); g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol * busVol), n + at); g.gain.exponentialRampToValueAtTime(.0001, n + t);
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
  const g = A.createGain(); g.gain.setValueAtTime(.0001, n); g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol * busVol), n + at); g.gain.exponentialRampToValueAtTime(.0001, n + t);
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
  /** bush rustle for a rake stroke through a plant: a cluster of dry crackly leaf bursts plus a soft swish */
  rustle() {
    if (!can('rustle', .1)) return;
    noise({ t: .32, vol: .11, type: 'bandpass', f: rand(1800, 2600), f2: 900, q: .7, at: .03 });
    const n = 7 + Math.floor(rand(0, 5));
    for (let i = 0; i < n; i++) noise({ t: rand(.025, .06), vol: rand(.05, .12), type: 'bandpass', f: rand(2500, 6500), q: rand(1.5, 4), when: rand(0, .3) * Math.pow(rand(0, 1), .6), at: .002 });
  },
  rake() { if (can('rake', .08)) noise({ t: .16, vol: .18, type: 'bandpass', f: 2600, f2: 500, q: 1.2 }); },
  /** n = number of enemies hit by one swing: one punch per target, slightly staggered */
  punches(n: number) { if (!can('punch', .06)) return; const k = Math.min(5, n); for (let i = 0; i < k; i++) comicPunch(i * .045, n); },
  /** crossbow: string twang + wooden clack */
  asp() { if (can('asp', .05)) { tone({ type: 'triangle', f: 420, f2: 180, t: .13, vol: .16 }); tone({ type: 'sine', f: 900, f2: 700, t: .07, vol: .05 }); noise({ t: .04, vol: .1, type: 'bandpass', f: 1600, q: 2 }); } },
  /** lying cranberry pops: soft wet splat */
  berryPop() { if (can('berryPop', .06)) { noise({ t: .12, vol: .09, type: 'lowpass', f: 1400, f2: 300 }); tone({ f: 260, f2: 90, t: .1, vol: .07 }); } },
  shot() { if (can('shot', .05)) { noise({ t: .22, vol: .28, f: 4000, f2: 300 }); tone({ f: 140, f2: 45, t: .16, vol: .25 }); } },
  /** Mehlsack: cloth swing whoosh around the body + a powdery hiss that settles */
  flour() {
    if (!can('flour', .2)) return;
    noise({ t: .45, vol: .16, type: 'bandpass', f: 350, f2: 1400, q: 1.4, at: .08 });
    noise({ t: .9, vol: .09, type: 'highpass', f: 5200, f2: 2600, q: .5, when: .12, at: .15 });
    for (let i = 0; i < 6; i++) noise({ t: rand(.05, .1), vol: rand(.02, .05), type: 'bandpass', f: rand(5000, 9000), q: 3, when: .15 + rand(0, .6), at: .01 });
  },
  /** crop ripe again (23.11.2026): soft rising sparkle chime with a shimmer, the same for every crop */
  cropRipe() {
    if (!can('cropRipe', .25)) return;
    [659, 880, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f, t: .55 - i * .06, vol: .045, when: i * .07 }));
    tone({ type: 'sine', f: 2637, t: .6, vol: .018, when: .26 });
    noise({ t: .7, vol: .025, type: 'highpass', f: 7000, when: .05, at: .2 });
  },
  /** wheat field all cut: a last scythe swish and crisp stubble crackle */
  cropDoneWheat() {
    if (!can('cropDone', .25)) return;
    noise({ t: .32, vol: .1, type: 'bandpass', f: 2200, f2: 5200, q: 1.6, at: .05 });
    for (let i = 0; i < 7; i++) noise({ t: rand(.015, .03), vol: rand(.03, .06), type: 'bandpass', f: rand(3000, 6000), q: 4, when: .2 + rand(0, .35), at: .002 });
    tone({ f: 180, f2: 110, t: .12, vol: .04, when: .3 });
  },
  /** asparagus / cabbage all cut: two crunchy snaps */
  cropDoneCut() {
    if (!can('cropDone', .25)) return;
    for (let i = 0; i < 2; i++) { noise({ t: .05, vol: .12, type: 'bandpass', f: 2600 - i * 500, q: 3, when: i * .14, at: .002 }); tone({ f: 420 - i * 80, f2: 200, t: .06, vol: .05, when: i * .14 }); }
  },
  /** bush picked bare: dry leaves rustling */
  cropDoneDry() {
    if (!can('cropDone', .25)) return;
    noise({ t: .7, vol: .07, type: 'bandpass', f: 3800, f2: 2400, q: .9, at: .1 });
    for (let i = 0; i < 14; i++) noise({ t: rand(.01, .03), vol: rand(.025, .05), type: 'bandpass', f: rand(2500, 7500), q: 5, when: rand(0, .7), at: .002 });
  },
  /** Bratpfanne: fast swish round the body, abrupt stop (clunk), then the eggs fly off hissing */
  pan() {
    if (!can('pan', .2)) return;
    noise({ t: .36, vol: .17, type: 'bandpass', f: 420, f2: 1700, q: 1.6, at: .07 });
    tone({ type: 'triangle', f: 210, f2: 150, t: .12, vol: .1, when: .34 }); noise({ t: .05, vol: .1, type: 'bandpass', f: 1800, q: 3, when: .34, at: .002 });
    noise({ t: .8, vol: .07, type: 'highpass', f: 6000, f2: 4200, q: .5, when: .36, at: .03 });
    for (let i = 0; i < 8; i++) noise({ t: rand(.02, .05), vol: rand(.02, .05), type: 'bandpass', f: rand(4000, 8000), q: 4, when: .36 + rand(0, .6), at: .002 });
  },
  /** fried egg lands: soft wet slap + a short sizzle */
  eggLand() { if (!can('eggLand', .07)) return; noise({ t: .09, vol: .12, type: 'lowpass', f: 1300, f2: 300 }); tone({ f: 190, f2: 80, t: .08, vol: .06 }); noise({ t: .5, vol: .045, type: 'highpass', f: 5500, when: .05, at: .02 }); },
  /** flour cloud catches fire: deep whoomp, roaring rush that grows and fades, lots of crackle */
  flourFire() {
    if (!can('flourFire', .25)) return;
    tone({ f: 70, f2: 32, t: .7, vol: .34 }); noise({ t: .35, vol: .3, f: 600, f2: 80, at: .01 });
    noise({ t: 1.6, vol: .2, type: 'bandpass', f: 500, f2: 1800, q: .6, at: .25 });
    for (let i = 0; i < 26; i++) noise({ t: rand(.02, .05), vol: rand(.04, .11), type: 'bandpass', f: rand(2500, 7000), q: rand(2, 5), when: rand(.05, 1.6), at: .002 });
  },
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
  /** soft "time slows down": muffled downward sweep + low airy whoosh */
  /** Werkstatt (23.11.2026): a new idea - glassy "ping" of a light bulb switching on with a tiny filament buzz */
  idea() {
    if (!can('idea', .15)) return;
    noise({ t: .03, vol: .06, type: 'bandpass', f: 3800, q: 4, at: .002 });
    tone({ type: 'sine', f: 1568, t: .55, vol: .07, when: .02 }); tone({ type: 'sine', f: 2349, t: .45, vol: .035, when: .05 });
    tone({ type: 'sawtooth', f: 100, t: .25, vol: .012, when: .02, filt: { type: 'lowpass', f: 600 } });
  },
  /** bought an idea: wooden knock on the bench + bright rising chime (golden: fuller chord) */
  buy(gold = false) {
    if (!can('buy', .08)) return;
    noise({ t: .06, vol: .2, type: 'bandpass', f: 900, q: 1.6, at: .002 }); tone({ f: 180, f2: 90, t: .08, vol: .14 });
    (gold ? [784, 988, 1175, 1568, 1976] : [880, 1175, 1568]).forEach((f, i) => tone({ type: 'triangle', f, t: .4, vol: gold ? .07 : .06, when: .04 + i * .055 }));
    noise({ t: .5, vol: gold ? .04 : .025, type: 'highpass', f: 6500, when: .08, at: .15 });
  },
  /** Saftpresse (23.11.2026): a berry bar ran full - juicy bubbling pop + small rising sparkle */
  juiceUp() {
    if (!can('juiceUp', .3)) return;
    for (let i = 0; i < 4; i++) tone({ type: 'sine', f: 380 + i * 140, f2: 720 + i * 180, t: .07, vol: .05, when: i * .045 });
    [1047, 1319, 1568].forEach((f, i) => tone({ type: 'triangle', f, t: .35, vol: .045, when: .18 + i * .05 }));
  },
  /** not enough ideas: dull double thud */
  deny() { if (!can('deny', .2)) return; tone({ type: 'triangle', f: 220, f2: 160, t: .09, vol: .1 }); tone({ type: 'triangle', f: 180, f2: 130, t: .1, vol: .09, when: .1 }); },
  /** Werkstatt opens: chest lid creak + soft workshop chord */
  shop() {
    if (!can('shop', .5)) return;
    noise({ t: .35, vol: .05, type: 'bandpass', f: 700, f2: 1100, q: 6, at: .05 });
    [392, 494, 587].forEach((f, i) => tone({ type: 'triangle', f, t: .7, vol: .045, when: .12 + i * .04 }));
  },
  pauseIn() { if (!can('pause', .2)) return; tone({ type: 'sine', f: 520, f2: 260, t: .5, vol: .045, at: .06, filt: { type: 'lowpass', f: 1400 } }); noise({ t: .5, vol: .035, type: 'lowpass', f: 1600, f2: 260, at: .08 }); },
  /** the reverse: gentle upward sweep as the game speeds up again */
  pauseOut() { if (!can('pause', .2)) return; tone({ type: 'sine', f: 260, f2: 520, t: .5, vol: .04, at: .12, filt: { type: 'lowpass', f: 1600 } }); noise({ t: .45, vol: .03, type: 'lowpass', f: 300, f2: 1800, at: .15 }); },
  /** time bomb tick: short click, higher towards the end (f = 0..1) */
  tick(f = 0) { if (can('tick', .03)) { tone({ type: 'square', f: 1400 + f * 1200, t: .03, vol: .05 }); noise({ t: .02, vol: .05, type: 'bandpass', f: 4000, q: 3 }); } },
  /** wave countdown tick (last tickFrom s): dry woody clock tick, last seconds higher and stronger (hot = red digits) */
  cdTick(hot = false) { if (!can('cdTick', .3)) return; noise({ t: .05, vol: hot ? .2 : .14, type: 'bandpass', f: hot ? 3200 : 2400, q: 4 }); tone({ type: 'triangle', f: hot ? 1250 : 880, t: .07, vol: hot ? .12 : .08 }); },
  /** "Welle N" announcement: low drum hit + two rising horn-like notes */
  waveAnn() { if (!can('waveAnn', 1)) return; tone({ f: 90, f2: 50, t: .5, vol: .3 }); noise({ t: .3, vol: .08, f: 300 });
    tone({ type: 'sawtooth', f: 220, t: .5, vol: .05, at: .04, when: .05, filt: { type: 'lowpass', f: 900 } }); tone({ type: 'sawtooth', f: 330, t: .9, vol: .06, at: .05, when: .32, filt: { type: 'lowpass', f: 1100 } }); },
  /** wave countdown ran out: low soft gong */
  cdEnd() { if (!can('cdEnd', .5)) return; tone({ f: 196, t: 1.4, vol: .14, at: .01 }); tone({ f: 294, t: 1.1, vol: .06, at: .01 }); noise({ t: .25, vol: .05, type: 'lowpass', f: 900 }); },
  /** small electric crackle (Shockgun berries) */
  zapS() { if (can('zapS', .08)) { noise({ t: .09, vol: .07, type: 'bandpass', f: rand(3000, 5000), q: 2 }); tone({ type: 'sawtooth', f: 180, f2: 120, t: .08, vol: .03 }); } },
  warn() { if (can('warn', .8)) { noise({ t: .6, vol: .05, type: 'bandpass', f: 500, f2: 900, q: 3 }); } },
};
export function play(name: string, arg?: any) { if (!AC || !audio.on) return; const f = SND[name]; if (f) f(arg); }

// ---------------- sample-based sounds (Game Design & Balancing/sounds.yaml) ----------------
interface SndEntry { files?: string[]; file?: string; vol?: number; pitch?: [number, number]; gap?: number; synth?: string; every?: [number, number]; chance?: number; delay?: [number, number]; rising?: boolean; lp?: number }
const riseStep = new Map<string, { n: number; t: number }>();
let SC: any = null;
const bufs = new Map<string, AudioBuffer>();
const lastPick = new Map<string, string>();
const lastAt = new Map<string, number>();
let lx = 0, lz = 0;
let ambOn = false; const ambNodes: AudioBufferSourceNode[] = []; let callT = 8;
const ambGains: { g: GainNode; vol: number; at: string }[] = []; let dayShare = 1;
export function setListener(x: number, z: number) { lx = x; lz = z; }

/** soundCfg = parsed sounds.yaml; buffers are fetched once the AudioContext exists */
export function setSoundConfig(cfg: any) { SC = cfg; if (AC) void loadSamples(); }
let loading: Promise<void> | null = null;
function loadSamples() {
  if (loading || !SC || !AC) return loading;
  const names = new Set<string>();
  const walk = (o: any) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o.files)) o.files.forEach((f: string) => names.add(f)); if (typeof o.file === 'string') names.add(o.file); for (const k in o) walk(o[k]); };
  walk(SC);
  loading = Promise.all([...names].map(async n => {
    try { const r = await fetch('./audio/' + n + '.wav'); bufs.set(n, await AC!.decodeAudioData(await r.arrayBuffer())); } catch { /* missing clip: stay silent */ }
  })).then(() => { if (ambWanted) startAmbient(); });
  return loading;
}
const SYNTH_EXTRA: Record<string, () => void> = {
  playerDie() { tone({ type: 'triangle', f: 440, f2: 110, t: .7, vol: .14 }); tone({ type: 'sine', f: 220, f2: 55, t: .9, vol: .18, when: .1 }); noise({ t: .5, vol: .08, f: 900, f2: 120, when: .05 }); },
  /** flamethrower: breathy roar (low noise swell + hiss) */
  flame() { noise({ t: .22, vol: .1, type: 'lowpass', f: 700, f2: 380, at: .05 }); noise({ t: .14, vol: .035, type: 'bandpass', f: 2600, f2: 1800, q: .7, at: .03 }); },
  /** lava breathing under the chili field: soft low rumble + tiny crackle */
  ember() { noise({ t: .5, vol: .03, type: 'lowpass', f: 260, f2: 140, at: .2 }); if (Math.random() < .5) noise({ t: .04, vol: .03, type: 'highpass', f: 3500, when: rand(.05, .3) }); },
  wilt() { tone({ type: 'sine', f: 300, f2: 90, t: .8, vol: .07 }); noise({ t: .6, vol: .06, type: 'bandpass', f: 1400, f2: 300, q: 1.5 }); },
};
function entry(key: string): SndEntry | null {
  if (!SC) return null; let o: any = SC; for (const p of key.split('.')) { o = o?.[p]; if (o === undefined) return null; } return o;
}
/** play a sound event from sounds.yaml at a world position (distance-attenuated, panned) */
export function sfx(key: string, x?: number, z?: number, volMul = 1) {
  if (!AC || !audio.on || !SC) return;
  const e = entry(key); if (!e) return;
  const now = AC.currentTime;
  if (e.gap && (lastAt.get(key) ?? -9) > now - e.gap) return;
  if (e.chance !== undefined && Math.random() > e.chance) { lastAt.set(key, now); return; }
  lastAt.set(key, now);
  let att = 1, pan = 0;
  if (x !== undefined && z !== undefined) {
    const D = SC.distance || { full: 5, silent: 26 }, d = Math.hypot(x - lx, z - lz);
    att = d <= D.full ? 1 : d >= D.silent ? 0 : 1 - (d - D.full) / (D.silent - D.full); att *= att;
    pan = Math.max(-1, Math.min(1, (x - lx) / 12)) * .75;
    if (att <= .01) return;
  }
  if (e.synth) { const f = SND[e.synth] || SYNTH_EXTRA[e.synth]; if (f) f(); }
  const files = (e.files || []).filter(f => bufs.has(f)); if (!files.length) return;
  let pick = files[Math.floor(Math.random() * files.length)];
  if (files.length > 1 && pick === lastPick.get(key)) pick = files[(files.indexOf(pick) + 1) % files.length];
  lastPick.set(key, pick);
  const src = AC.createBufferSource(); src.buffer = bufs.get(pick)!;
  const [p0, p1] = e.pitch || [1, 1]; let rate = p0 + Math.random() * (p1 - p0);
  if (e.rising) { // quick pickups climb a semitone each, wrapping after an octave (Shepard-like)
    const r = riseStep.get(key) || { n: 0, t: 0 }; r.n = now - r.t < 1.2 ? (r.n + 1) % 12 : 0; r.t = now; riseStep.set(key, r); rate *= Math.pow(2, r.n / 12);
  }
  src.playbackRate.value = rate;
  const g = AC.createGain(); g.gain.value = (e.vol ?? .5) * (SC.master ?? 1) * att * volMul;
  let node: AudioNode = g;
  if (AC.createStereoPanner) { const sp = AC.createStereoPanner(); sp.pan.value = pan; g.connect(sp); node = sp; }
  if (e.lp) { const bq = AC.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = e.lp; bq.Q.value = .5; src.connect(bq); bq.connect(g); } else src.connect(g);
  node.connect(master); src.start(now + (e.delay ? e.delay[0] + Math.random() * (e.delay[1] - e.delay[0]) : 0));
}
/** looping sounds (e.g. the flamethrower roar), one per id: fades in/out, follows its world position */
const loops = new Map<string, { src: AudioBufferSourceNode; g: GainNode; pan: StereoPannerNode | null; vol: number }>();
export function loopSfx(id: string, key: string, on: boolean, x = lx, z = lz) {
  const L = loops.get(id);
  if (!AC || !SC || !audio.on) { if (L) stopLoop(id); return; }
  const e = entry(key) as any; if (!e) return;
  const fade = e.fade ?? .12;
  if (!on) { if (L) stopLoop(id, fade); return; }
  const D = SC.distance || { full: 5, silent: 26 }, d = Math.hypot(x - lx, z - lz);
  let att = d <= D.full ? 1 : d >= D.silent ? 0 : 1 - (d - D.full) / (D.silent - D.full); att *= att;
  const vol = (e.vol ?? .4) * (SC.master ?? 1) * att, pan = Math.max(-1, Math.min(1, (x - lx) / 12)) * .75, now = AC.currentTime;
  if (L) { L.g.gain.setTargetAtTime(vol, now, .05); if (L.pan) L.pan.pan.setTargetAtTime(pan, now, .05); return; }
  const name = e.file || (e.files || [])[0]; if (!name || !bufs.has(name)) return;
  const src = AC.createBufferSource(); src.buffer = bufs.get(name)!; src.loop = true;
  const [p0, p1] = e.pitch || [1, 1]; src.playbackRate.value = p0 + Math.random() * (p1 - p0);
  const g = AC.createGain(); g.gain.setValueAtTime(.0001, now); g.gain.linearRampToValueAtTime(vol, now + fade);
  let node: AudioNode = g, sp: StereoPannerNode | null = null;
  if (AC.createStereoPanner) { sp = AC.createStereoPanner(); sp.pan.value = pan; g.connect(sp); node = sp; }
  src.connect(g); node.connect(master); src.start(now, Math.random() * src.buffer.duration);
  loops.set(id, { src, g, pan: sp, vol });
}
function stopLoop(id: string, fade = .12) {
  const L = loops.get(id); if (!L) return; loops.delete(id);
  if (!AC) return; const now = AC.currentTime;
  L.g.gain.cancelScheduledValues(now); L.g.gain.setValueAtTime(L.g.gain.value, now); L.g.gain.linearRampToValueAtTime(.0001, now + fade);
  try { L.src.stop(now + fade + .05); } catch { /* ignore */ }
}
export function stopAllLoops() { for (const id of [...loops.keys()]) stopLoop(id, .05); }
let ambWanted = false;
function startAmbient() {
  if (!AC || ambOn || !SC?.ambient) return;
  for (const k in SC.ambient) { // loops: at = day | night | (always)
    const e = SC.ambient[k]; if (!e?.file || !bufs.has(e.file)) continue;
    const src = AC.createBufferSource(); src.buffer = bufs.get(e.file)!; src.loop = true;
    const g = AC.createGain(), vol = (e.vol ?? .2) * (SC.master ?? 1); g.gain.value = vol * ambShare(e.at);
    src.connect(g); g.connect(master); src.start(0, Math.random() * src.buffer.duration); ambNodes.push(src); ambGains.push({ g, vol, at: e.at || '' });
  }
  ambOn = ambNodes.length > 0;
}
export function ambient(on: boolean) {
  if (on && !audio.on) return;
  ambWanted = on;
  if (on) { if (bufs.size) startAmbient(); else void loadSamples(); }
  else { ambNodes.forEach(n => { try { n.stop(); } catch { /* ignore */ } }); ambNodes.length = 0; ambGains.length = 0; ambOn = false; }
}
const ambShare = (at?: string) => at === 'day' ? dayShare : at === 'night' ? 1 - dayShare : 1;
/** day share 0 (night) .. 1 (day): crossfades the day / night ambience */
export function setDayNight(day: number) {
  if (Math.abs(day - dayShare) < .01 && day !== 0 && day !== 1) return;
  dayShare = day; if (!AC) return;
  for (const a of ambGains) a.g.gain.setTargetAtTime(a.vol * ambShare(a.at), AC.currentTime, .4);
}
/** random distant calls from the forest: owl + crows at night, crows now and then by day */
export function tickAmbient(dt: number) {
  if (!ambOn || !SC?.calls || !audio.on) return;
  callT -= dt; if (callT > 0) return;
  const key = Math.random() < dayShare ? 'day' : 'night', c = SC.calls[key];
  callT = c?.every ? c.every[0] + Math.random() * (c.every[1] - c.every[0]) : 20;
  if (!c) return;
  const a = Math.random() * Math.PI * 2; sfx('calls.' + key, lx + Math.cos(a) * 8, lz + Math.sin(a) * 8);
}
export const audioStats = () => ({ ctx: !!AC, samples: bufs.size, ambient: ambOn });

// ---------------- buildings (Classic, 22.11.2026): synthesized, positional ----------------
/** seconds between two work sounds while a building runs */
export const BUILD_SND_EVERY: Record<string, number> = { mill: .9, press: 1.0, bakery: 1.3, well: 1.4, hens: 1.6, kitchen: 1.2 };
const clicks = (n: number, span: number, f: number, vol: number, q = 4, when = 0) => { for (let i = 0; i < n; i++) noise({ t: .03, vol: vol * rand(.7, 1), type: 'bandpass', f: f * rand(.85, 1.15), q, when: when + i * span / n + rand(0, span / n * .3), at: .002 }); };
const BSND: Record<string, Record<string, () => void>> = {
  mill: { // rattling wooden gear, millstones grinding, flour trickling
    work() { noise({ t: 1.0, vol: .16, type: 'lowpass', f: 220, f2: 160, at: .15 }); tone({ type: 'sawtooth', f: 52, t: .95, vol: .03, at: .2, filt: { type: 'lowpass', f: 180 } }); clicks(7, .85, 1500, .07, 5); noise({ t: .9, vol: .025, type: 'highpass', f: 5200, at: .25 }); },
    done() { noise({ t: .6, vol: .05, type: 'bandpass', f: 4500, f2: 2500, q: .8, at: .05 }); },
  },
  press: { // ratcheting screw; the squelch comes from the animation at the bottom of every stroke (23.11.2026)
    work() { for (let i = 0; i < 4; i++) { tone({ type: 'square', f: 760 + i * 30, t: .025, vol: .03, when: i * .09, filt: { type: 'bandpass', f: 1400, q: 3 } }); noise({ t: .02, vol: .06, type: 'bandpass', f: 2200, q: 5, when: i * .09, at: .002 }); } },
    /** berries squashed: wet squelch (falling filtered noise), a few bubbly pops and a little trickle */
    squish() {
      noise({ t: .32, vol: .2, type: 'lowpass', f: 1400, f2: 220, at: .012 }); noise({ t: .2, vol: .1, type: 'bandpass', f: 700, f2: 300, q: 2.5, at: .01 });
      tone({ f: 190, f2: 70, t: .22, vol: .09 });
      for (let i = 0; i < 5; i++) tone({ type: 'sine', f: rand(300, 650), f2: rand(700, 1200), t: .05, vol: .04, when: .05 + i * rand(.03, .06) });
      noise({ t: .5, vol: .03, type: 'bandpass', f: 3200, q: 1.2, when: .18, at: .15 });
    },
    /** full bottle: glass clink + cork pop */
    done() { tone({ type: 'sine', f: 2600, t: .18, vol: .05 }); tone({ type: 'sine', f: 3900, t: .12, vol: .025, when: .01 }); noise({ t: .04, vol: .1, type: 'bandpass', f: 900, q: 3, when: .12, at: .002 }); tone({ f: 420, f2: 900, t: .06, vol: .05, when: .12 }); },
  },
  bakery: { // oven crackle and the low roar of the fire
    work() { noise({ t: 1.2, vol: .06, type: 'lowpass', f: 380, at: .3 }); clicks(9, 1.1, 3500, .045, 2); },
    done() { tone({ type: 'triangle', f: 1320, t: .9, vol: .07, at: .003 }); tone({ type: 'sine', f: 1980, t: .6, vol: .03, when: .01 }); },
  },
  well: { // chain over the roller, then the bucket splashes
    work() { clicks(10, .9, 3200, .05, 6); tone({ type: 'triangle', f: 210, f2: 190, t: .5, vol: .025, when: .2 }); },
    done() { noise({ t: .4, vol: .14, type: 'lowpass', f: 1600, f2: 250, at: .005 }); tone({ f: 420, f2: 160, t: .12, vol: .06 }); },
  },
  cow: { // a lazy moo now and then, milk squirts when a bottle is full
    work() { if (Math.random() < .7) tone({ type: 'sawtooth', f: 150, f2: 118, t: 1.1, vol: .07, at: .12, vib: 4, vibF: 5, filt: { type: 'lowpass', f: 700, q: 2 } }); },
    done() { for (let i = 0; i < 2; i++) noise({ t: .12, vol: .07, type: 'bandpass', f: 2600, f2: 1800, q: 2, when: i * .18 }); },
  },
  hens: { // clucking
    work() { const n = 1 + Math.floor(rand(0, 3)); for (let i = 0; i < n; i++) tone({ type: 'triangle', f: rand(650, 900), f2: rand(450, 600), t: .09, vol: .045, when: i * rand(.12, .2), vib: 60, vibF: 30 }); },
    done() { tone({ f: 520, f2: 300, t: .06, vol: .07 }); for (let i = 0; i < 4; i++) tone({ type: 'triangle', f: 900 - i * 60, f2: 700, t: .08, vol: .05, when: .12 + i * .1, vib: 80, vibF: 35 }); },
  },
  dairy: { // butter churn: dull wooden thumps and sloshing
    work() { tone({ f: 120, f2: 70, t: .14, vol: .09 }); noise({ t: .3, vol: .07, type: 'lowpass', f: 600, f2: 250, when: .05, at: .05 }); },
    done() { tone({ f: 180, f2: 120, t: .2, vol: .08 }); tone({ type: 'triangle', f: 990, t: .5, vol: .04, when: .1 }); },
  },
  kitchen: { // sizzling pan, a ladle clinking on the pot
    work() { noise({ t: 1.1, vol: .045, type: 'highpass', f: 5500, at: .2 }); if (Math.random() < .6) tone({ type: 'triangle', f: rand(1700, 2300), t: .25, vol: .035, when: rand(.2, .8) }); },
    done() { [784, 988, 1175].forEach((f, i) => tone({ type: 'triangle', f, t: .45, vol: .06, when: i * .09 })); },
  },
  any: {
    break() { noise({ t: .7, vol: .22, type: 'lowpass', f: 1100, f2: 90, at: .004 }); clicks(6, .4, 1800, .12, 2); tone({ f: 95, f2: 40, t: .4, vol: .2 }); },
    repair() { tone({ f: 340, f2: 160, t: .07, vol: .1 }); noise({ t: .04, vol: .12, type: 'bandpass', f: 2600, q: 3, at: .002 }); },
    repaired() { [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f, t: .3, vol: .06, when: i * .07 })); },
  },
};
/** building sound at a world position, quieter with distance from the listener (player) */
export function buildingSound(type: string, ph: string, x: number, z: number) {
  if (!AC || !audio.on) return;
  const d = Math.hypot(x - lx, z - lz), v = Math.pow(Math.max(0, 1 - d / 14), 1.5); if (v < .04) return;
  const f = BSND[type]?.[ph] ?? BSND.any[ph]; if (!f || !can('b.' + type + ph + Math.round(x * 3) + ',' + Math.round(z * 3), .2)) return;
  busVol = v; try { f(); } finally { busVol = 1; }
}
