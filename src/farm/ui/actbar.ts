// The animated progress bar over the farmer's head (Basti 22.11.2026). Follows the running action of the own player,
// keeps one "session" over all repeats of the same work on the same spot (3 harvest passes = one bar from left to right),
// and draws the scene of barScenes.ts into one small canvas. The canvas is only drawn while it is visible.
import type { FarmCfg } from '../config';
import { treeCfg, treeKind } from '../config';
import type { FarmState } from '../state';
import { count } from '../state';
import type { DaySim, Target } from '../sim';
import type { FarmView } from '../view/farmView';
import { BarArgs, H, W, drawScene, sceneFor } from './barScenes';
import { sfx } from '../../audio';
import { VP } from '../../view/core';

const tkey = (t: Target) => t.k + ':' + ((t as any).i ?? (t as any).id ?? '');
function hash(n: number) { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }

interface Session { key: string; kind: string; v: string; scene: string; total: number; per: number; seed: number; t: number; hits: Map<string, number>; need?: string[] }

/** the per-scene inputs that the preview page (ladebalken.html) sets by hand */
export interface BarInput { kind: string; v: string; k: number; step: number; f: number; n: number; fill?: number; cap?: number; per?: number; need?: string[] }

/** draws one bar into a canvas (shared by the game and the preview page) */
export class BarCanvas {
  readonly el: HTMLCanvasElement; private g: CanvasRenderingContext2D; private dpr = 1; private cw = 0;
  constructor(el?: HTMLCanvasElement) { this.el = el ?? document.createElement('canvas'); this.g = this.el.getContext('2d')!; }
  /** css width in px (height follows 240:60) */
  size(cssW: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cssW === this.cw && dpr === this.dpr) return; this.cw = cssW; this.dpr = dpr;
    this.el.style.width = cssW + 'px'; this.el.style.height = cssW * H / W + 'px';
    this.el.width = Math.round(cssW * dpr); this.el.height = Math.round(cssW * H / W * dpr);
  }
  draw(scene: string, inp: BarInput, t: number, seed: number, hits: Map<string, number>, cue: (s: string) => void) {
    const g = this.g, s = this.el.width / W;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.el.width, this.el.height); g.setTransform(s, 0, 0, s, 0, 0);
    const a: BarArgs = {
      scene, v: inp.v, k: inp.k, step: inp.step, f: inp.f, n: Math.max(1, inp.n), t, fill: inp.fill, cap: inp.cap, per: inp.per, need: inp.need,
      r: i => hash(seed * 7919 + i),
      hit: (id, cond, snd) => { const h = hits.get(id); if (h !== undefined) return t - h; if (!cond) return -1; hits.set(id, t); if (snd) cue(snd); return 0; },
    };
    drawScene(g, a, inp.per ?? 1);
  }
}

export class ActBar {
  private c = new BarCanvas(); private ses: Session | null = null; private last: BarInput | null = null;
  private alpha = 0; private seeds = 0; private sx = 0; private sy = 0;
  constructor(private cfg: FarmCfg, host: HTMLElement) {
    this.c.el.id = 'fActBar'; this.c.el.style.opacity = '0'; host.appendChild(this.c.el);
  }
  private crop(s: FarmState, sim: DaySim, t: Target) { if (t.k !== 'plot') return ''; const p = s.plots[t.i]; return p?.crop ?? sim.seedCrop(t.i); }
  /** what the session is about: crop / good / building */
  private variant(kind: string, t: Target, s: FarmState, sim: DaySim): string {
    switch (kind) {
      case 'harvestPlot': return this.crop(s, sim, t);
      case 'sow': return t.k === 'plot' ? sim.seedCrop(t.i) : '';
      case 'harvestBush': return 'blue';
      case 'pickWild': return 'bramble';
      case 'eggs': return 'egg';
      case 'shake': return t.k === 'tree' ? treeKind(this.cfg, t.i) : 'apple';
      case 'gather': return t.k === 'forage' ? (s.wild.forage.find(f => f.id === t.id)?.k ?? 'wood') : 'wood';
      case 'weedHof': return 'hof';
      case 'feed': return t.k === 'stall' ? t.id : '';
      case 'produce': return t.k === 'bld' ? t.id : '';
      default: return '';
    }
  }
  /** steps still to do on the spot (undefined = a single step) */
  private remaining(kind: string, t: Target, s: FarmState, sim: DaySim): number | undefined {
    const C = this.cfg;
    switch (kind) {
      case 'harvestPlot': return t.k === 'plot' ? s.plots[t.i]?.yieldLeft ?? 0 : 0;
      case 'harvestBush': return Math.max(0, C.bush.picks - s.bush.picked);
      case 'pickWild': return t.k === 'bramble' ? sim.brambles[t.i]?.n ?? 0 : 0;
      case 'shake': return t.k === 'tree' ? sim.apples[t.i] ?? 0 : 0;
      case 'gather': return t.k === 'forage' ? (s.wild.forage.find(f => f.id === t.id)?.n ?? 0) : 0;
      case 'weed': return t.k === 'plot' ? s.plots[t.i]?.weeds ?? 0 : 0;
      case 'refill': return Math.ceil(Math.max(0, C.can.capacity - this.can(sim, s)) / C.can.perFill);
      case 'draw': return Math.max(0, C.wild.barrel - count(s, 'water'));
      default: return undefined;
    }
  }
  private can(sim: DaySim, s: FarmState) { const P = sim.player; return P.guest ? P.water ?? 0 : s.water; }
  private per(kind: string, v: string, t: Target) {
    if (kind === 'harvestPlot') { const y = this.cfg.crops[v]?.yield; return y ? (Object.values(y)[0] as number) : 1; }
    if (kind === 'shake' && t.k === 'tree') return treeCfg(this.cfg, t.i).shake;
    return 1;
  }
  hide() { this.ses = null; this.last = null; this.alpha = 0; this.c.el.style.opacity = '0'; }
  /** per frame */
  update(sim: DaySim, s: FarmState, view: FarmView, dt: number, touch: boolean) {
    const P = sim.player, A = P.action, rest = !A && P.rest > 0 && P.after ? P.after : null;
    const cur = A ?? rest;
    if (cur && !sim.inputLocked && cur.info.kind !== 'harvestPlot') { // harvest experiment: the field harvest has no bar
      const kind = cur.info.kind, key = kind + '|' + tkey(cur.target);
      if (!this.ses || this.ses.key !== key) {
        const v = this.variant(kind, cur.target, s, sim), rem = this.remaining(kind, cur.target, s, sim);
        this.ses = { key, kind, v, scene: sceneFor(kind, v), total: Math.max(1, rem ?? 1), per: this.per(kind, v, cur.target), seed: ++this.seeds, t: 0, hits: new Map(), need: cur.info.need ? Object.keys(cur.info.need) : undefined };
      }
      const S = this.ses, rem = this.remaining(kind, cur.target, s, sim);
      const frac = A ? Math.min(1, A.t / A.info.dur) : 0;
      let done = rem === undefined ? (A ? 0 : 1) : Math.max(0, S.total - rem);
      if (rem !== undefined && rem > S.total) { S.total = rem; done = 0; } // e.g. fertilized while harvesting
      const k = Math.min(1, (done + frac) / S.total);
      const C = this.cfg, inp: BarInput = { kind, v: S.v, k, step: done, f: frac, n: S.total, per: S.per, need: S.need };
      if (kind === 'refill') { inp.cap = C.can.capacity; inp.fill = Math.min(1, (this.can(sim, s) + C.can.perFill * frac) / C.can.capacity); }
      if (kind === 'water') { inp.cap = C.can.capacity; inp.fill = Math.max(0, (this.can(sim, s) - frac) / C.can.capacity); }
      if (kind === 'draw') { inp.cap = C.wild.barrel; inp.fill = Math.min(1, (count(s, 'water') + frac) / C.wild.barrel); }
      this.last = inp; this.alpha = Math.min(1, this.alpha + dt * 8);
    } else if (this.last) {
      this.alpha -= dt * 3.2; if (this.alpha <= 0) { this.hide(); return; }
    } else return;
    const S = this.ses!, inp = this.last!; S.t += dt;
    // over the head (lower while kneeling), kept on screen
    const cssW = touch ? Math.min(200, VP.w * .46) : 232; this.c.size(cssW);
    const p = view.screen(P.x, P.crouch ? 1.55 : 2.1, P.z), h = cssW * H / W;
    const x = Math.max(cssW / 2 + 6, Math.min(VP.w - cssW / 2 - 6, p.x)), y = Math.max(h + 6, Math.min(VP.h - 10, p.y));
    // smoothed so the bar does not jitter with the walk cycle
    if (!this.sx) { this.sx = x; this.sy = y; } this.sx += (x - this.sx) * Math.min(1, dt * 14); this.sy += (y - this.sy) * Math.min(1, dt * 14);
    this.c.el.style.transform = `translate(${this.sx.toFixed(1)}px,${this.sy.toFixed(1)}px) translate(-50%,-100%)`;
    this.c.el.style.opacity = (p.on ? this.alpha : 0).toFixed(2);
    this.c.draw(S.scene, inp, S.t, S.seed, S.hits, snd => sfx('bar.' + snd, P.x, P.z));
  }
}
