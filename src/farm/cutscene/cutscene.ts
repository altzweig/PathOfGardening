// Reusable cutscenes (21.11.2026): a cutscene is a list of keyframes for the camera (position, look-at point, roll, field of
// view) and for the screen (eyelids, blur, black). The player evaluates them over time, the farm view takes the camera from it
// and an overlay draws eyelids + black on top of the canvas; the blur is a CSS filter on the canvas. Sounds and other side effects
// run as cues at a time. A concrete scene (e.g. waking up after fainting: faint.ts) only builds the keyframes from a few anchors.
import * as THREE from 'three';
import { renderer } from '../../view/core';

export interface Vec3 { x: number; y: number; z: number }
export type Ease = 'linear' | 'smooth' | 'in' | 'out';
/** one keyframe. Every value is optional and keeps its last value until the next key that sets it. */
export interface CutKey {
  t: number;
  /** camera position + the point it looks at (world, m); followed on a smooth curve through all keys */
  pos?: Vec3; look?: Vec3;
  /** camera roll around the view axis (rad, + = head tilts to the right) */
  roll?: number;
  /** vertical field of view (deg) */
  fov?: number;
  /** eyelids: 0 = closed, 1 = wide open */
  eye?: number;
  /** blur of the whole picture (CSS px at 1080p height, scaled to the screen) */
  blur?: number;
  /** black over everything: 0 .. 1 */
  black?: number;
  /** easing of every value towards this key (default smooth) */
  ease?: Ease;
}
export interface Cutscene {
  name: string;
  keys: CutKey[];
  /** side effects at a time (sounds ...) */
  cues?: { t: number; run: () => void }[];
}
/** what the view needs per frame */
export interface CineFrame { pos: THREE.Vector3; look: THREE.Vector3; roll: number; fov: number }

const EASE: Record<Ease, (x: number) => number> = {
  linear: x => x,
  smooth: x => x * x * (3 - 2 * x),
  in: x => x * x,
  out: x => 1 - (1 - x) * (1 - x),
};
type Scalar = 'roll' | 'fov' | 'eye' | 'blur' | 'black';
const DEF: Record<Scalar, number> = { roll: 0, fov: 40, eye: 1, blur: 0, black: 0 };

/** overlay: two eyelids (soft dark ellipses) + a black layer; built once */
function overlay() {
  let el = document.getElementById('cine');
  if (!el) {
    el = document.createElement('div'); el.id = 'cine'; el.hidden = true;
    el.innerHTML = '<i class="lid top"></i><i class="lid bot"></i><b class="vig"></b><b class="blk"></b>';
    document.body.appendChild(el);
  }
  return el;
}

export class CutscenePlayer {
  scene: Cutscene | null = null;
  t = 0;
  private done: (() => void) | null = null;
  private cue = 0;
  private path: { pos: THREE.CatmullRomCurve3 | null; look: THREE.CatmullRomCurve3 | null; pk: CutKey[]; lk: CutKey[] } | null = null;
  private frame: CineFrame = { pos: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0, fov: 40 };
  private el = overlay();
  get active() { return !!this.scene; }
  get length() { return this.scene ? this.scene.keys[this.scene.keys.length - 1].t : 0; }

  /** starts a cutscene; resolves when it is over (the last key: black stays on until stop()) */
  play(c: Cutscene): Promise<void> {
    this.stop(false);
    const keys = [...c.keys].sort((a, b) => a.t - b.t);
    this.scene = { ...c, keys, cues: [...(c.cues ?? [])].sort((a, b) => a.t - b.t) };
    this.t = 0; this.cue = 0;
    const pk = keys.filter(k => k.pos), lk = keys.filter(k => k.look);
    const curve = (list: CutKey[], f: 'pos' | 'look') => list.length > 1 ? new THREE.CatmullRomCurve3(list.map(k => new THREE.Vector3(k[f]!.x, k[f]!.y, k[f]!.z)), false, 'centripetal') : null;
    this.path = { pos: curve(pk, 'pos'), look: curve(lk, 'look'), pk, lk };
    this.el.hidden = false;
    this.apply(0);
    return new Promise(res => { this.done = res; });
  }
  /** per frame: advances the time, runs cues, updates the overlay; returns the camera for the view (null = no cutscene) */
  update(dt: number): CineFrame | null {
    const c = this.scene; if (!c) return null;
    this.t += dt;
    while (c.cues && this.cue < c.cues.length && c.cues[this.cue].t <= this.t) { try { c.cues[this.cue].run(); } catch { /* a cue must never stop the scene */ } this.cue++; }
    this.apply(this.t);
    if (this.t >= this.length && this.done) { const d = this.done; this.done = null; d(); }
    return this.frame;
  }
  /** ends the cutscene: overlay and blur off (keepBlack = the black layer stays until the next fade takes over) */
  stop(keepBlack = false) {
    this.scene = null; this.path = null; this.done = null;
    renderer.domElement.style.filter = '';
    if (!keepBlack) { this.el.hidden = true; return; }
    (this.el.querySelector('.blk') as HTMLElement).style.opacity = '1';
    for (const l of this.el.querySelectorAll<HTMLElement>('.lid,.vig')) l.style.opacity = '0';
    setTimeout(() => { if (!this.scene) this.el.hidden = true; }, 80);
  }

  /** value of a scalar channel at time t (eased between the keys that set it) */
  private value(ch: Scalar, t: number) {
    const keys = this.scene!.keys; let a: CutKey | null = null, b: CutKey | null = null;
    for (const k of keys) { if (k[ch] === undefined) continue; if (k.t <= t) a = k; else { b = k; break; } }
    if (!a) return b ? b[ch]! : DEF[ch];
    if (!b) return a[ch]!;
    const x = EASE[b.ease ?? 'smooth']((t - a.t) / Math.max(1e-3, b.t - a.t));
    return a[ch]! + (b[ch]! - a[ch]!) * x;
  }
  /** point on the camera curve at time t: segments between the keys that have the value, eased per segment */
  private along(list: CutKey[], curve: THREE.CatmullRomCurve3 | null, f: 'pos' | 'look', t: number, out: THREE.Vector3) {
    if (!list.length) return out;
    if (!curve || t <= list[0].t) { const p = list[0][f]!; return out.set(p.x, p.y, p.z); }
    let i = list.length - 2; for (let k = 0; k < list.length - 1; k++) if (t < list[k + 1].t) { i = k; break; }
    const a = list[i], b = list[i + 1], x = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-3, b.t - a.t)));
    return curve.getPoint((i + EASE[b.ease ?? 'smooth'](x)) / (list.length - 1), out);
  }
  private apply(t: number) {
    const p = this.path!, F = this.frame;
    this.along(p.pk, p.pos, 'pos', t, F.pos); this.along(p.lk, p.look, 'look', t, F.look);
    F.roll = this.value('roll', t); F.fov = this.value('fov', t);
    // screen: eyelids from the top + bottom, vignette while they are not quite open, blur, black
    const eye = Math.min(1, Math.max(0, this.value('eye', t))), shut = 1 - eye;
    const top = this.el.querySelector('.top') as HTMLElement, bot = this.el.querySelector('.bot') as HTMLElement;
    top.style.transform = `translate(-50%, ${(-100 + shut * 62).toFixed(2)}%)`;
    bot.style.transform = `translate(-50%, ${(100 - shut * 62).toFixed(2)}%)`;
    top.style.opacity = bot.style.opacity = '1';
    const vig = this.el.querySelector('.vig') as HTMLElement; vig.style.opacity = (.35 + shut * .65).toFixed(3);
    (this.el.querySelector('.blk') as HTMLElement).style.opacity = this.value('black', t).toFixed(3);
    const blur = this.value('blur', t) * innerHeight / 1080;
    renderer.domElement.style.filter = blur > .05 ? `blur(${blur.toFixed(2)}px)` : '';
  }
}
