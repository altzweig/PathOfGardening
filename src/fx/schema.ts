// Data model of the effect system. An effect is pure data (JSON): a list of layers, each switchable and
// with its own parameters. The VFX lab (vfx.html) edits these objects live; the game will load the same JSON.
// PARAMS describes every parameter (label, range, kind) so editors can be generated from it.

export type Range = [number, number];
export type Grad = [number, string][]; // [position 0..1, '#rrggbb']

export type LayerType = 'particles' | 'decal' | 'bolt' | 'ring' | 'crystals' | 'light';
/** where a layer acts: at the source (hand / centre), at every target, or along the beam (source -> range) */
export type At = 'quelle' | 'ziele' | 'strahl';

export interface LayerBase { type: LayerType; name: string; on: boolean; at: At; delay: number }

export interface ParticleLayer extends LayerBase {
  type: 'particles';
  max: number; rate: number; burst: number; emitTime: number;
  sprite: string; blend: 'add' | 'normal';
  shape: 'punkt' | 'kugel' | 'scheibe' | 'ring' | 'kegel'; radius: number; height: number; along: Range;
  dir: 'oben' | 'vorne' | 'aussen' | 'zufall' | 'unten'; spread: number; flat: boolean;
  speed: Range; life: Range; gravity: number; drag: number; turb: number; turbFreq: number; orbit: number;
  size: Range; sizeVar: number; spin: number; stretch: number;
  colors: Grad; texHeat: number; intensity: number; opacity: number; fadeIn: number; fadeOut: number; brightVar: number;
  floor: boolean; local: boolean;
}
export interface DecalLayer extends LayerBase {
  type: 'decal';
  style: 'glut' | 'frost' | 'gift' | 'brand' | 'heil' | 'schein';
  max: number; rate: number; count: number; radius: Range; scatter: number; along: Range;
  life: Range; grow: number; colorA: string; colorB: string; intensity: number; opacity: number; noise: number; pulse: number;
}
export interface BoltLayer extends LayerBase {
  type: 'bolt';
  path: 'kette' | 'faecher' | 'himmel';
  interval: number; count: number; life: number; width: number; rough: number; branch: number; depth: number; twigs: number;
  restrike: boolean; core: string; halo: string; intensity: number; bloom: boolean; hitY: number; startY: number;
}
export interface RingLayer extends LayerBase {
  type: 'ring';
  count: number; interval: number; life: number; radius: Range; thick: number; y: number; soft: number;
  colorA: string; colorB: string; intensity: number; blend: 'add' | 'normal'; loopEvery: number;
}
export interface CrystalLayer extends LayerBase {
  type: 'crystals';
  count: number; radius: Range; height: Range; width: number; tilt: number; grow: number; hold: number; shatter: number;
  color: string; rim: string; intensity: number; opacity: number; loopEvery: number;
}
export interface LightLayer extends LayerBase {
  type: 'light';
  color: string; intensity: number; distance: number; y: number; flicker: number; flickerSpeed: number; life: number; fadeIn: number;
}
export type Layer = ParticleLayer | DecalLayer | BoltLayer | RingLayer | CrystalLayer | LightLayer;

export interface EffectDef {
  id: string; name: string; version: 1;
  mode: 'loop' | 'burst';
  /** burst: auto re-trigger every n s (0 = only manually); loop: on n s, off offTime s (0 = always on) */
  repeat: number; offTime: number;
  /** loop: seconds the power needs to ramp up / down (ignition and tail of a flamethrower) */
  ramp: number;
  source: 'spieler' | 'boden' | 'ziel';
  range: number;
  layers: Layer[];
}

// ---------------- parameter descriptions (editor) ----------------
export type ParamKind = 'num' | 'range' | 'color' | 'grad' | 'select' | 'bool' | 'text';
export interface ParamDesc { key: string; label: string; kind: ParamKind; min?: number; max?: number; step?: number; options?: [string, string][]; rebuild?: boolean; hint?: string; group?: string }

export const SPRITES: Record<string, { label: string; tiles: [number, number] }> = {
  flammen: { label: 'Flammenzungen (Kenney)', tiles: [0, 4] },
  feuer: { label: 'Feuerballen (Kenney)', tiles: [4, 2] },
  feuerAlle: { label: 'Flammen + Feuer', tiles: [0, 6] },
  rauch: { label: 'Rauch (Kenney)', tiles: [6, 2] },
  glow: { label: 'Weiches Leuchten', tiles: [8, 1] },
  funke: { label: 'Funke', tiles: [9, 1] },
  stern: { label: 'Stern (4 Zacken)', tiles: [10, 1] },
  flocke: { label: 'Schneeflocke', tiles: [11, 1] },
  blase: { label: 'Blase', tiles: [12, 1] },
  plus: { label: 'Plus', tiles: [13, 1] },
  blatt: { label: 'Blatt', tiles: [14, 1] },
  splitter: { label: 'Splitter', tiles: [15, 1] },
};
const AT: [string, string][] = [['quelle', 'Quelle'], ['ziele', 'Ziele'], ['strahl', 'Entlang Strahl']];
const common = (): ParamDesc[] => [
  { key: 'at', label: 'Ort', kind: 'select', options: AT, hint: 'Quelle = Hand bzw. Mittelpunkt, Ziele = jeder Dummy, Strahl = entlang der Reichweite' },
  { key: 'delay', label: 'Verzögerung (s)', kind: 'num', min: 0, max: 3, step: .01 },
];

export const PARAMS: Record<LayerType, ParamDesc[]> = {
  particles: [
    ...common(),
    { key: 'rate', label: 'Rate (pro s)', kind: 'num', min: 0, max: 600, step: 1, group: 'Ausstoß' },
    { key: 'burst', label: 'Stoß (Anzahl)', kind: 'num', min: 0, max: 400, step: 1, group: 'Ausstoß' },
    { key: 'emitTime', label: 'Ausstoßdauer bei Auslösung (s)', kind: 'num', min: 0, max: 6, step: .05, group: 'Ausstoß', hint: 'nur Einzel-Effekte: so lange läuft die Rate nach dem Auslösen' },
    { key: 'max', label: 'Max. Partikel', kind: 'num', min: 16, max: 4000, step: 16, rebuild: true, group: 'Ausstoß' },
    { key: 'shape', label: 'Form', kind: 'select', options: [['punkt', 'Punkt'], ['kugel', 'Kugel'], ['scheibe', 'Scheibe'], ['ring', 'Ring'], ['kegel', 'Kegel']], group: 'Emitter' },
    { key: 'radius', label: 'Radius (m)', kind: 'num', min: 0, max: 5, step: .01, group: 'Emitter' },
    { key: 'height', label: 'Höhe (m)', kind: 'num', min: -1, max: 4, step: .01, group: 'Emitter' },
    { key: 'along', label: 'Strahl-Abschnitt (Anteil)', kind: 'range', min: 0, max: 1.5, step: .01, group: 'Emitter' },
    { key: 'dir', label: 'Richtung', kind: 'select', options: [['oben', 'Nach oben'], ['vorne', 'Nach vorne'], ['aussen', 'Nach außen'], ['zufall', 'Zufällig'], ['unten', 'Nach unten']], group: 'Bewegung' },
    { key: 'spread', label: 'Streuung (°)', kind: 'num', min: 0, max: 180, step: 1, group: 'Bewegung' },
    { key: 'flat', label: 'Streuung nur waagerecht', kind: 'bool', group: 'Bewegung' },
    { key: 'speed', label: 'Geschwindigkeit (m/s)', kind: 'range', min: 0, max: 30, step: .05, group: 'Bewegung' },
    { key: 'life', label: 'Lebensdauer (s)', kind: 'range', min: .02, max: 8, step: .01, group: 'Bewegung' },
    { key: 'gravity', label: 'Schwerkraft (− = Auftrieb)', kind: 'num', min: -12, max: 25, step: .1, group: 'Bewegung' },
    { key: 'drag', label: 'Luftwiderstand', kind: 'num', min: 0, max: 12, step: .05, group: 'Bewegung' },
    { key: 'turb', label: 'Turbulenz', kind: 'num', min: 0, max: 15, step: .05, group: 'Bewegung' },
    { key: 'turbFreq', label: 'Turbulenz-Frequenz', kind: 'num', min: .1, max: 6, step: .05, group: 'Bewegung' },
    { key: 'orbit', label: 'Kreisen (rad/s)', kind: 'num', min: -12, max: 12, step: .05, group: 'Bewegung' },
    { key: 'floor', label: 'Abprall am Boden', kind: 'bool', group: 'Bewegung' },
    { key: 'local', label: 'Folgt der Quelle', kind: 'bool', group: 'Bewegung' },
    { key: 'sprite', label: 'Sprite', kind: 'select', options: Object.entries(SPRITES).map(([k, v]) => [k, v.label] as [string, string]), group: 'Aussehen' },
    { key: 'blend', label: 'Blend-Modus', kind: 'select', options: [['add', 'Additiv (leuchtet)'], ['normal', 'Normal (deckt)']], rebuild: true, group: 'Aussehen' },
    { key: 'size', label: 'Größe Start / Ende (m)', kind: 'range', min: 0, max: 8, step: .01, group: 'Aussehen' },
    { key: 'sizeVar', label: 'Größen-Zufall', kind: 'num', min: 0, max: 1, step: .01, group: 'Aussehen' },
    { key: 'spin', label: 'Drehung (rad/s)', kind: 'num', min: 0, max: 15, step: .1, group: 'Aussehen' },
    { key: 'stretch', label: 'Streckung (Bewegung)', kind: 'num', min: 0, max: 1, step: .01, group: 'Aussehen' },
    { key: 'colors', label: 'Farbverlauf über Lebenszeit', kind: 'grad', group: 'Aussehen' },
    { key: 'texHeat', label: 'Textur färbt mit (Flammen-Look)', kind: 'num', min: 0, max: 1, step: .01, group: 'Aussehen', hint: 'helle Stellen der Textur nehmen den Anfang des Verlaufs, dünne Ränder das Ende' },
    { key: 'intensity', label: 'Helligkeit (Bloom)', kind: 'num', min: 0, max: 12, step: .05, group: 'Aussehen' },
    { key: 'opacity', label: 'Deckkraft', kind: 'num', min: 0, max: 1, step: .01, group: 'Aussehen' },
    { key: 'fadeIn', label: 'Einblenden (Anteil)', kind: 'num', min: 0, max: 1, step: .01, group: 'Aussehen' },
    { key: 'fadeOut', label: 'Ausblenden (Anteil)', kind: 'num', min: 0, max: 1, step: .01, group: 'Aussehen' },
    { key: 'brightVar', label: 'Helligkeits-Zufall', kind: 'num', min: 0, max: 1, step: .01, group: 'Aussehen' },
  ],
  decal: [
    ...common(),
    { key: 'style', label: 'Stil', kind: 'select', options: [['glut', 'Glut (Lava-Risse)'], ['frost', 'Frost'], ['gift', 'Giftpfütze'], ['brand', 'Brandfleck (dunkel)'], ['heil', 'Heilkreis'], ['schein', 'Weicher Schein']], rebuild: true },
    { key: 'rate', label: 'Flecken pro s (Dauer-Effekt)', kind: 'num', min: 0, max: 80, step: .5 },
    { key: 'count', label: 'Flecken bei Auslösung', kind: 'num', min: 0, max: 40, step: 1 },
    { key: 'max', label: 'Max. Flecken', kind: 'num', min: 4, max: 512, step: 4, rebuild: true },
    { key: 'radius', label: 'Radius (m)', kind: 'range', min: .05, max: 6, step: .01 },
    { key: 'scatter', label: 'Streuung (m)', kind: 'num', min: 0, max: 5, step: .01 },
    { key: 'along', label: 'Strahl-Abschnitt (Anteil)', kind: 'range', min: 0, max: 1.5, step: .01 },
    { key: 'life', label: 'Dauer (s)', kind: 'range', min: .1, max: 30, step: .05 },
    { key: 'grow', label: 'Wachsen (s)', kind: 'num', min: 0, max: 3, step: .01 },
    { key: 'colorA', label: 'Farbe innen / heiß', kind: 'color' },
    { key: 'colorB', label: 'Farbe außen / kalt', kind: 'color' },
    { key: 'intensity', label: 'Helligkeit', kind: 'num', min: 0, max: 8, step: .05 },
    { key: 'opacity', label: 'Deckkraft', kind: 'num', min: 0, max: 1, step: .01 },
    { key: 'noise', label: 'Muster-Skala', kind: 'num', min: .2, max: 12, step: .05 },
    { key: 'pulse', label: 'Pulsieren', kind: 'num', min: 0, max: 1, step: .01 },
  ],
  bolt: [
    ...common(),
    { key: 'path', label: 'Verlauf', kind: 'select', options: [['kette', 'Kette (Ziel zu Ziel)'], ['faecher', 'Fächer (Quelle zu jedem Ziel)'], ['himmel', 'Vom Himmel auf Ziele']] },
    { key: 'interval', label: 'Intervall (s, Dauer-Effekt)', kind: 'num', min: .03, max: 3, step: .01 },
    { key: 'count', label: 'Ziele (max.)', kind: 'num', min: 1, max: 6, step: 1 },
    { key: 'life', label: 'Sichtbar (s)', kind: 'num', min: .04, max: 1.5, step: .01 },
    { key: 'width', label: 'Breite (m)', kind: 'num', min: .002, max: .12, step: .001 },
    { key: 'rough', label: 'Zackigkeit', kind: 'num', min: 0, max: .5, step: .005 },
    { key: 'branch', label: 'Verästelung', kind: 'num', min: 0, max: .5, step: .005 },
    { key: 'depth', label: 'Ast-Tiefe', kind: 'num', min: 0, max: 3, step: 1 },
    { key: 'twigs', label: 'Zweige am Einschlag', kind: 'num', min: 0, max: 8, step: 1 },
    { key: 'restrike', label: 'Nachschlag-Flackern', kind: 'bool' },
    { key: 'core', label: 'Kernfarbe', kind: 'color' },
    { key: 'halo', label: 'Scheinfarbe', kind: 'color' },
    { key: 'intensity', label: 'Helligkeit', kind: 'num', min: 0, max: 5, step: .05 },
    { key: 'bloom', label: 'Mit Bloom (weicher)', kind: 'bool', rebuild: true },
    { key: 'startY', label: 'Starthöhe (m)', kind: 'num', min: 0, max: 12, step: .05 },
    { key: 'hitY', label: 'Treffer-Höhe (m)', kind: 'num', min: 0, max: 2, step: .01 },
  ],
  ring: [
    ...common(),
    { key: 'count', label: 'Anzahl Ringe', kind: 'num', min: 1, max: 6, step: 1 },
    { key: 'interval', label: 'Abstand zwischen Ringen (s)', kind: 'num', min: 0, max: 1, step: .01 },
    { key: 'loopEvery', label: 'Wiederholen (s, Dauer-Effekt)', kind: 'num', min: 0, max: 5, step: .05 },
    { key: 'life', label: 'Dauer (s)', kind: 'num', min: .05, max: 3, step: .01 },
    { key: 'radius', label: 'Radius Start / Ende (m)', kind: 'range', min: 0, max: 10, step: .01 },
    { key: 'thick', label: 'Dicke (m)', kind: 'num', min: .01, max: 2, step: .01 },
    { key: 'soft', label: 'Weichheit', kind: 'num', min: 0, max: 1, step: .01 },
    { key: 'y', label: 'Höhe (m)', kind: 'num', min: 0, max: 3, step: .01 },
    { key: 'colorA', label: 'Farbe Start', kind: 'color' },
    { key: 'colorB', label: 'Farbe Ende', kind: 'color' },
    { key: 'intensity', label: 'Helligkeit', kind: 'num', min: 0, max: 8, step: .05 },
    { key: 'blend', label: 'Blend-Modus', kind: 'select', options: [['add', 'Additiv'], ['normal', 'Normal']], rebuild: true },
  ],
  crystals: [
    ...common(),
    { key: 'count', label: 'Anzahl', kind: 'num', min: 1, max: 48, step: 1, rebuild: true },
    { key: 'loopEvery', label: 'Wiederholen (s, Dauer-Effekt)', kind: 'num', min: 0, max: 8, step: .05 },
    { key: 'radius', label: 'Abstand innen / außen (m)', kind: 'range', min: 0, max: 6, step: .01 },
    { key: 'height', label: 'Höhe (m)', kind: 'range', min: .05, max: 3, step: .01 },
    { key: 'width', label: 'Dicke (m)', kind: 'num', min: .02, max: .8, step: .01 },
    { key: 'tilt', label: 'Neigung nach außen (°)', kind: 'num', min: 0, max: 80, step: 1 },
    { key: 'grow', label: 'Wachsen (s)', kind: 'num', min: .02, max: 2, step: .01 },
    { key: 'hold', label: 'Halten (s)', kind: 'num', min: 0, max: 6, step: .05 },
    { key: 'shatter', label: 'Zerfallen (s)', kind: 'num', min: .05, max: 2, step: .01 },
    { key: 'color', label: 'Farbe', kind: 'color' },
    { key: 'rim', label: 'Kantenlicht', kind: 'color' },
    { key: 'intensity', label: 'Helligkeit', kind: 'num', min: 0, max: 6, step: .05 },
    { key: 'opacity', label: 'Deckkraft', kind: 'num', min: 0, max: 1, step: .01 },
  ],
  light: [
    ...common(),
    { key: 'color', label: 'Farbe', kind: 'color' },
    { key: 'intensity', label: 'Stärke', kind: 'num', min: 0, max: 60, step: .1 },
    { key: 'distance', label: 'Reichweite (m)', kind: 'num', min: .5, max: 30, step: .1 },
    { key: 'y', label: 'Höhe (m)', kind: 'num', min: 0, max: 5, step: .01 },
    { key: 'flicker', label: 'Flackern', kind: 'num', min: 0, max: 1, step: .01 },
    { key: 'flickerSpeed', label: 'Flacker-Tempo', kind: 'num', min: 0, max: 40, step: .1 },
    { key: 'life', label: 'Blitz-Dauer (s, 0 = dauerhaft)', kind: 'num', min: 0, max: 4, step: .01 },
    { key: 'fadeIn', label: 'Einblenden (s)', kind: 'num', min: 0, max: 2, step: .01 },
  ],
};

export const EFFECT_PARAMS: ParamDesc[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'mode', label: 'Art', kind: 'select', options: [['loop', 'Dauer (z. B. Flammenwerfer)'], ['burst', 'Einzeln (z. B. Explosion)']] },
  { key: 'repeat', label: 'Wiederholen / An-Zeit (s, 0 = aus)', kind: 'num', min: 0, max: 10, step: .05, hint: 'Einzeln: automatisch alle n s auslösen. Dauer: n s an, dann Pause' },
  { key: 'offTime', label: 'Pause (s, Dauer-Effekt)', kind: 'num', min: 0, max: 10, step: .05 },
  { key: 'ramp', label: 'Anlauf / Auslauf (s)', kind: 'num', min: 0, max: 2, step: .01 },
  { key: 'source', label: 'Quelle', kind: 'select', options: [['spieler', 'Spieler (Hand)'], ['boden', 'Boden vor dem Spieler'], ['ziel', 'Erster Dummy']] },
  { key: 'range', label: 'Reichweite (m)', kind: 'num', min: .5, max: 15, step: .05 },
];

export const LAYER_LABEL: Record<LayerType, string> = { particles: 'Partikel', decal: 'Bodeneffekt', bolt: 'Blitz', ring: 'Schockwelle', crystals: 'Kristalle', light: 'Licht' };

/** defaults for a new layer of a type */
export function newLayer(type: LayerType): Layer {
  const base = { name: LAYER_LABEL[type], on: true, at: 'quelle' as At, delay: 0 };
  switch (type) {
    case 'particles': return { ...base, type, max: 256, rate: 30, burst: 0, emitTime: .3, sprite: 'glow', blend: 'add', shape: 'kugel', radius: .2, height: .5, along: [0, 1],
      dir: 'oben', spread: 30, flat: false, speed: [.5, 1.5], life: [.6, 1.2], gravity: 0, drag: .5, turb: 0, turbFreq: 1, orbit: 0, size: [.3, .1], sizeVar: .3, spin: 0, stretch: 0,
      colors: [[0, '#ffffff'], [1, '#ffaa44']], texHeat: 0, intensity: 1.5, opacity: 1, fadeIn: .1, fadeOut: .5, brightVar: .2, floor: false, local: false };
    case 'decal': return { ...base, type, style: 'schein', max: 32, rate: 0, count: 1, radius: [1, 1.2], scatter: 0, along: [0, 1], life: [2, 2], grow: .2, colorA: '#ffffff', colorB: '#4488ff', intensity: 1, opacity: 1, noise: 2, pulse: 0 };
    case 'bolt': return { ...base, type, path: 'kette', interval: .3, count: 3, life: .28, width: .022, rough: .14, branch: .15, depth: 2, twigs: 2, restrike: true, core: '#f2f6ff', halo: '#7f99ff', intensity: 1, bloom: false, hitY: .42, startY: 6 };
    case 'ring': return { ...base, type, count: 1, interval: .1, loopEvery: 0, life: .5, radius: [.2, 3], thick: .3, soft: .6, y: .05, colorA: '#ffffff', colorB: '#4488ff', intensity: 1.5, blend: 'add' };
    case 'crystals': return { ...base, type, count: 12, loopEvery: 0, radius: [.3, 1.6], height: [.4, 1], width: .16, tilt: 25, grow: .15, hold: 1.2, shatter: .3, color: '#9fd8ff', rim: '#e8fbff', intensity: 1, opacity: .85 };
    case 'light': return { ...base, type, color: '#ffffff', intensity: 4, distance: 6, y: 1, flicker: 0, flickerSpeed: 10, life: 0, fadeIn: 0 };
  }
}

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
/** fill missing keys from the defaults (older saved presets keep working when parameters are added) */
export function normalize(def: EffectDef): EffectDef {
  const d = clone(def);
  d.layers = d.layers.map(l => ({ ...newLayer(l.type), ...l } as Layer));
  return d;
}
