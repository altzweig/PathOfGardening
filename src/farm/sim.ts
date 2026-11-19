// One playable day on the farm: player movement, timed actions (left click, see actions in balancing.yaml), fighting
// (right click), animals (raccoon, hare), stalls with livestock, weeds + forage that grow back out of sight, loot, rain,
// clock. Works on the persistent FarmState; the view only reads.
import { ActionKind, AnimalType, BuildingId, FarmCfg, ItemId, STALL_IDS, StallId, Tool } from './config';
import { FarmState, addItem, count, gainXp, ripeCuts } from './state';
import { Hof } from './hof';

export type Target =
  | { k: 'bush' } | { k: 'well' } | { k: 'plot'; i: number }
  | { k: 'bld'; id: BuildingId } | { k: 'stall'; id: StallId }
  | { k: 'tree'; i: number } | { k: 'bramble'; i: number }
  | { k: 'forage'; id: number } | { k: 'weed'; id: number };
type Basket = { k: 'basket' };
const keyOf = (t: Target) => t.k + ':' + ((t as any).i ?? (t as any).id ?? '');
export const sameTarget = (a: Target | null, b: Target | null) => !!a && !!b && keyOf(a) === keyOf(b);
/** what a left click on a target does right now */
export interface ActionInfo {
  kind: ActionKind; label: string; tool: Tool; dur: number; ok: boolean; repeat?: boolean;
  /** why it does not work: missing goods (need), no water in the can, well broken, too many weeds */
  why?: 'water' | 'seed' | 'well' | 'weeds' | 'need';
  need?: Record<ItemId, number>;
  /** small extra after the name, e.g. "3/10" */
  count?: string;
}
export interface Intent {
  mx: number; mz: number;           // movement -1..1 in world x/z (main.ts turns the stick by the camera)
  aimX: number; aimZ: number;       // world point the attack goes to (mouse) ...
  aimAuto: boolean;                 // ... or aim at the nearest animal (touch)
  act: Target | null;               // left click / action button this frame
  attack: boolean;                  // right click / attack button held
}
export const emptyIntent = (): Intent => ({ mx: 0, mz: 0, aimX: 0, aimZ: 0, aimAuto: false, act: null, attack: false });
export type Ev = { k: string; [key: string]: any };

export interface Player {
  x: number; z: number; f: number; hp: number; maxHp: number; walk: number; speed: number;
  action: { target: Target; info: ActionInfo; t: number; pick: number } | null;
  goal: Target | null;              // auto-walk to a clicked target, then act
  swing: { t: number; dir: number; hit: boolean } | null;
  shotT: number; cd: number; hurt: number; stun: number;
}
export type AnimalState = 'enter' | 'go' | 'steal' | 'eat' | 'attack' | 'flee' | 'wander' | 'script';
export interface Animal {
  id: number; type: AnimalType; x: number; z: number; f: number; hp: number; maxHp: number;
  state: AnimalState; target: Target | Basket | null; gap: number; t: number; act: number;
  carry: Record<ItemId, number>; carryN: number; stun: number; freeze: number; flash: number; bite: number;
  shy: boolean; brave: boolean; driven: boolean; gone: boolean; speedMul: number; dmgMul: number;
  stuck: number; lx: number; lz: number; detour: { x: number; z: number } | null;
  /** tutorial: walks a fixed list of points, no AI */
  path?: { x: number; z: number; speed: number }[];
}
export interface Pellet { x: number; z: number; vx: number; vz: number; life: number; dmg: number; freeze: number; ammo: ItemId }
/** goods on the ground: dropped by a raccoon (stolen) or shaken off a tree (new) */
export interface Loot { id: number; item: ItemId; x: number; z: number; y: number; vx: number; vz: number; vy: number; t: number; fresh?: boolean }
/** a stall during the day: fed 0..maxFed (this half of the day), collected this half, fresh straw today */
export interface Stall { fed: number; done: boolean; straw: boolean }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (r: [number, number]) => Math.floor(rnd(r[0], r[1] + 1));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
/** distance from point (px, pz) to the segment a-b */
function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
const angTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az); // three.js yaw (0 = +z)
/** goods animals take from the basket (not straw, wood, stones ...) */
const NOT_EDIBLE = new Set(['straw', 'plank', 'wood', 'stone', 'water', 'green', 'slurry', 'fert']);
const EDIBLE = (id: ItemId) => !NOT_EDIBLE.has(id);
/** which targets win when several are in reach: buildings, plots, bush first, then forage, weeds last */
const PRIO: Record<Target['k'], number> = { bush: 0, well: 0, plot: 0, bld: 0, stall: 0, tree: 1, bramble: 1, forage: 2, weed: 3 };

export class DaySim {
  t = 0;
  length: number;
  player: Player;
  animals: Animal[] = [];
  pellets: Pellet[] = [];
  loot: Loot[] = [];
  ev: Ev[] = [];
  rain: { at: number; dur: number; t: number } | null = null;
  raining = false;
  /** tutorial switches */
  clockRuns = true; spawns = true; inputLocked = false; paused = false;
  finished: 'time' | 'faint' | null = null;
  got: Record<ItemId, number> = {}; lost: Record<ItemId, number> = {}; driven = 0; xpGained = 0;
  /** the harvest basket: set down next to the player at the first harvest of the day (raccoons steal from it) */
  basketAt: { x: number; z: number } | null = null;
  stalls = {} as Record<StallId, Stall>;
  apples: number[];
  brambles: { n: number; t: number }[];
  /** is a ground point on screen? (set by the game from the camera; wild things only grow where nobody looks) */
  visible: (x: number, z: number) => boolean = (x, z) => dist(x, z, this.player.x, this.player.z) < 22;
  private plan: { at: number; type: AnimalType; gap: number }[] = [];
  private nid = 1;
  private half = 0;
  private weedT: number; private forageT: number; private plotWeedT: number[];

  constructor(public cfg: FarmCfg, public s: FarmState, public hof: Hof, o: { tutorial?: boolean } = {}) {
    this.length = cfg.day.length;
    const P = cfg.player, d = cfg.hof.door, W = cfg.wild;
    this.player = { x: d.x, z: d.z + .4, f: 0, hp: P.hp, maxHp: P.hp, walk: 0, speed: 0, action: null, goal: null, swing: null, shotT: 0, cd: 0, hurt: 0, stun: 0 };
    for (const id of STALL_IDS) this.stalls[id] = { fed: 0, done: false, straw: false };
    this.apples = cfg.hof.trees.map(() => W.apples.perTree);
    this.brambles = hof.brambles.map(() => ({ n: W.brambles.berries, t: 0 }));
    this.weedT = rnd(...W.weeds.every); this.forageT = rnd(...W.forage.every);
    this.plotWeedT = s.plots.map(() => rnd(...cfg.plots.weeds.every));
    if (!s.wild.init) this.seedWild();
    if (o.tutorial) { this.clockRuns = false; this.spawns = false; }
    else { this.planSpawns(); if (Math.random() < cfg.day.rain.chance) { const [a, b] = cfg.day.rain.duration; this.rain = { at: rnd(.15, .7) * this.length, dur: rnd(a, b), t: 0 }; } }
  }

  // ---------------- clock ----------------
  /** 0..1 of the day */
  get k() { return Math.min(1, this.t / this.length); }

  // ---------------- wild growth (weeds on the farm, forage at the edge) ----------------
  /** a new game: lots of things lying around */
  private seedWild() {
    const W = this.cfg.wild; this.s.wild.init = true;
    for (let i = 0; i < W.weeds.start; i++) this.growWeed(true);
    for (let i = 0; i < W.forage.start; i++) this.growForage(true);
  }
  private spot(k0: number, k1: number, pad: number, hidden: boolean) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rnd(0, Math.PI * 2), k = Math.sqrt(rnd(k0 * k0, k1 * k1)), x = Math.cos(a) * this.hof.rx * k, z = Math.sin(a) * this.hof.rz * k;
      if (!this.hof.freeSpot(x, z, pad)) continue;
      if (!hidden && this.visible(x, z)) continue;
      return { x, z };
    }
    return null;
  }
  private growWeed(any = false) {
    const w = this.s.wild; if (w.weeds.length >= this.cfg.wild.weeds.max) return;
    const p = this.spot(.08, .95, .5, any); if (p) w.weeds.push({ id: w.seq++, ...p });
  }
  private growForage(any = false) {
    const w = this.s.wild, F = this.cfg.wild.forage; if (w.forage.length >= F.max) return;
    const p = this.spot(F.band[0], F.band[1], .4, any); if (!p || this.hof.inGap(p.x, p.z)) return;
    const items = Object.entries(F.items), tot = items.reduce((n, [, v]) => n + v, 0); let r = Math.random() * tot, k = items[0][0];
    for (const [id, v] of items) { r -= v; if (r <= 0) { k = id; break; } }
    w.forage.push({ id: w.seq++, k, ...p });
  }
  private updateWild(dt: number) {
    const W = this.cfg.wild, PW = this.cfg.plots.weeds;
    if ((this.weedT -= dt) <= 0) { this.weedT = rnd(...W.weeds.every); this.growWeed(); }
    if ((this.forageT -= dt) <= 0) { this.forageT = rnd(...W.forage.every); this.growForage(); }
    this.s.plots.forEach((p, i) => {
      if (!p.open || p.weeds >= PW.max) return;
      if ((this.plotWeedT[i] -= dt) <= 0) { this.plotWeedT[i] = rnd(...PW.every); p.weeds++; this.ev.push({ k: 'plotWeed', i }); }
    });
    this.brambles.forEach(b => { if (b.n < W.brambles.berries && (b.t += dt) >= W.brambles.regrow) { b.t = 0; b.n++; } });
  }

  // ---------------- targets ----------------
  targetPos(t: Target | Basket): { x: number; z: number } {
    const H = this.cfg.hof;
    switch (t.k) {
      case 'bush': return H.bush;
      case 'basket': return this.basketAt ?? H.basket;
      case 'well': return H.buildings.well;
      case 'plot': return H.plots[t.i];
      case 'bld': case 'stall': return H.buildings[t.id];
      case 'tree': return H.trees[t.i];
      case 'bramble': return this.hof.brambles[t.i];
      case 'forage': return this.s.wild.forage.find(f => f.id === t.id) ?? { x: 1e4, z: 1e4 };
      case 'weed': return this.s.wild.weeds.find(f => f.id === t.id) ?? { x: 1e4, z: 1e4 };
    }
  }
  /** distance from (x, z) to the edge of a target */
  targetDist(t: Target, x: number, z: number) {
    if (t.k === 'bld' || t.k === 'stall') { const o = this.hof.building(t.id); return o ? this.hof.distTo(o, x, z) : 1e4; }
    const p = this.targetPos(t), r = t.k === 'plot' ? this.cfg.plots.size / 2 * .85 : t.k === 'well' ? (this.cfg.hof.buildings.well.r ?? 1) : t.k === 'bush' ? this.cfg.bush.radius : t.k === 'tree' ? .5 : t.k === 'bramble' ? .6 : .15;
    return Math.max(0, dist(x, z, p.x, p.z) - r);
  }
  private act(kind: Exclude<ActionKind, 'produce'>, tool: Tool, o: Partial<ActionInfo> = {}): ActionInfo {
    const A = this.cfg.actions[kind]; return { kind, label: A.label, tool, dur: A.time, ok: true, repeat: !!A.repeat, ...o };
  }
  private needs(need: Record<ItemId, number>) { return Object.entries(need).every(([k, v]) => count(this.s, k) >= v); }
  /** what a left click on the target would do right now (null = nothing to do there) */
  actionFor(t: Target): ActionInfo | null {
    const s = this.s, water = s.water > 0, noWater = water ? {} : { ok: false, why: 'water' as const };
    switch (t.k) {
      case 'bush': {
        const b = s.bush;
        if (b.phase === 'dry') return this.act('water', 'can', noWater);
        if (b.phase === 'ripe') return this.act('harvestBush', 'rake');
        return null;
      }
      case 'well': {
        if (!s.buildings.well.built) return this.act('refill', 'can', { ok: false, why: 'well' });
        if (s.water < this.cfg.can.capacity) return this.act('refill', 'can', { count: `${s.water}/${this.cfg.can.capacity}` });
        const n = count(s, 'water'), cap = this.cfg.wild.barrel;
        return n < cap ? this.act('draw', 'bucket', { count: `${n}/${cap}` }) : null;
      }
      case 'plot': {
        const p = s.plots[t.i]; if (!p?.open) return null;
        const PW = this.cfg.plots.weeds, fert = count(s, 'fert') > 0 && p.fertDay !== s.day;
        if (p.stage === 'empty') return this.act('plow', 'rake');
        if (p.stage === 'raked') { const seed = this.cfg.crops.wheat.seed; return this.act('sow', 'seed', count(s, seed) > 0 ? {} : { ok: false, why: 'seed', need: { [seed]: 1 } }); }
        if (p.stage === 'sown') {
          if (!p.watered) return this.act('water', 'can', noWater);
          if (p.weeds > 0) return this.act('weed', 'hands', { count: '' + p.weeds });
          if (fert) return this.act('fertilize', 'hands');
          return null;
        }
        if (p.stage === 'ripe') {
          if (p.weeds >= PW.blockAt) return this.act('weed', 'hands', { count: '' + p.weeds });
          return this.act('harvestPlot', 'sickle', { count: '' + p.yieldLeft });
        }
        return null;
      }
      case 'bld': {
        const B = this.cfg.buildings[t.id]; if (!B?.action || !B.recipes?.length || !s.buildings[t.id]?.built) return null;
        const r = B.recipes.find(x => this.needs(x.in));
        const base = { kind: 'produce' as const, label: B.action.label, tool: 'hands' as const, dur: B.action.time, repeat: false };
        return r ? { ...base, ok: true, need: r.in } : { ...base, ok: false, why: 'need', need: B.recipes[0].in };
      }
      case 'stall': {
        if (!s.buildings[t.id]?.built) return null;
        const C = this.cfg.stalls[t.id], st = this.stalls[t.id];
        if (st.fed < C.maxFed && count(s, C.feed) >= C.feedCost) return this.act('feed', 'hands', { need: { [C.feed]: C.feedCost }, count: `${st.fed}/${C.maxFed}` });
        if (!st.straw && count(s, 'straw') >= this.cfg.stalls.strawCost) return this.act('straw', 'hands', { need: { straw: this.cfg.stalls.strawCost } });
        if (st.fed > 0 && !st.done) return this.act(C.collect, 'hands');
        if (st.fed < C.maxFed) return this.act('feed', 'hands', { ok: false, why: 'need', need: { [C.feed]: C.feedCost } });
        return null;
      }
      case 'tree': return this.apples[t.i] > 0 ? this.act('shake', 'hands', { count: '' + this.apples[t.i] }) : null;
      case 'bramble': return this.brambles[t.i]?.n > 0 ? this.act('pickWild', 'hands') : null;
      case 'forage': return s.wild.forage.some(f => f.id === t.id) ? this.act('gather', 'hands') : null;
      case 'weed': return s.wild.weeds.some(f => f.id === t.id) ? this.act('weedHof', 'hands') : null;
    }
  }
  /** every target near a point (cheap for the many small things) */
  private targetsNear(x: number, z: number, r: number): Target[] {
    const out: Target[] = [{ k: 'bush' }, { k: 'well' }];
    this.s.plots.forEach((p, i) => { if (p.open) out.push({ k: 'plot', i }); });
    for (const id of Object.keys(this.cfg.buildings) as BuildingId[]) {
      if (STALL_IDS.includes(id as StallId)) out.push({ k: 'stall', id: id as StallId });
      else if (this.cfg.buildings[id].action) out.push({ k: 'bld', id });
    }
    this.cfg.hof.trees.forEach((_, i) => out.push({ k: 'tree', i }));
    this.hof.brambles.forEach((_, i) => out.push({ k: 'bramble', i }));
    const r2 = (r + 1) ** 2;
    for (const f of this.s.wild.forage) if ((f.x - x) ** 2 + (f.z - z) ** 2 < r2) out.push({ k: 'forage', id: f.id });
    for (const f of this.s.wild.weeds) if ((f.x - x) ** 2 + (f.z - z) ** 2 < r2) out.push({ k: 'weed', id: f.id });
    return out;
  }
  /** target under a ground point (mouse / tap) */
  targetAt(x: number, z: number): Target | null {
    const H = this.cfg.hof, near = (p: { x: number; z: number }, r: number) => dist(x, z, p.x, p.z) < r;
    let best: Target | null = null, bd = .55;
    for (const f of this.s.wild.forage) { const d = dist(x, z, f.x, f.z); if (d < bd) { bd = d; best = { k: 'forage', id: f.id }; } }
    for (const f of this.s.wild.weeds) { const d = dist(x, z, f.x, f.z); if (d < bd) { bd = d; best = { k: 'weed', id: f.id }; } }
    if (best) return best;
    if (near(H.bush, this.cfg.bush.radius + .35)) return { k: 'bush' };
    const w = H.buildings.well; if (near(w, (w.r ?? 1) + .35)) return { k: 'well' };
    for (let i = 0; i < this.hof.brambles.length; i++) if (near(this.hof.brambles[i], .9)) return { k: 'bramble', i };
    for (let i = 0; i < H.trees.length; i++) if (near(H.trees[i], 1.1)) return { k: 'tree', i };
    for (let i = 0; i < H.plots.length; i++) if (this.s.plots[i].open && near(H.plots[i], this.cfg.plots.size / 2 + .1)) return { k: 'plot', i };
    for (const id of Object.keys(this.cfg.buildings) as BuildingId[]) {
      const o = this.hof.building(id); if (!o || this.hof.distTo(o, x, z) > .3) continue;
      if (STALL_IDS.includes(id as StallId)) return { k: 'stall', id: id as StallId };
      if (this.cfg.buildings[id].action) return { k: 'bld', id };
    }
    return null;
  }
  /** the target the player stands at (shown as "[Aktion]", touch action button, click on nothing) */
  nearestTarget(range: number): Target | null {
    const P = this.player; let best: Target | null = null, score = 1e9;
    for (const t of this.targetsNear(P.x, P.z, range)) {
      const a = this.actionFor(t); if (!a) continue;
      const d = this.targetDist(t, P.x, P.z); if (d > range) continue;
      const sc = PRIO[t.k] * 100 + (a.ok ? 0 : 50) + d;
      if (sc < score) { score = sc; best = t; }
    }
    return best;
  }

  // ---------------- update ----------------
  update(dt: number, it: Intent) {
    this.ev.length = 0;
    if (this.paused || this.finished) return;
    if (this.clockRuns) this.t += dt;
    this.updateHalf();
    this.updateRain(dt);
    this.updateBush(dt);
    if (this.clockRuns) this.updateWild(dt);
    this.updatePlayer(dt, this.inputLocked ? { ...it, mx: 0, mz: 0, act: null, attack: false } : it);
    this.updatePellets(dt);
    this.updateAnimals(dt);
    this.updateLoot(dt);
    if (this.spawns) this.updateSpawns();
    if (this.clockRuns && this.t >= this.length) this.finished = 'time';
    if (this.player.hp <= 0 && !this.finished) { this.finished = 'faint'; this.ev.push({ k: 'faint' }); }
  }
  /** morning / evening: the livestock is hungry again and gives a new yield */
  private updateHalf() {
    const h = this.t >= this.length / 2 ? 1 : 0; if (h === this.half) return;
    this.half = h; for (const id of STALL_IDS) { this.stalls[id].fed = 0; this.stalls[id].done = false; }
    this.ev.push({ k: 'hungry' });
  }

  private updateRain(dt: number) {
    const R = this.rain; if (!R) return;
    const on = this.t >= R.at && this.t < R.at + R.dur;
    if (on !== this.raining) { this.raining = on; this.ev.push({ k: 'rain', on }); }
    if (on) {
      for (const p of this.s.plots) if (p.open && p.stage === 'sown') p.watered = true;
      if (this.s.bush.phase === 'dry') { this.s.bush.phase = 'growing'; this.s.bush.t = 0; }
    }
    void dt;
  }
  private updateBush(dt: number) {
    const b = this.s.bush, B = this.cfg.bush;
    if (b.phase === 'growing') {
      b.t += dt * (this.ripenMul ?? 1);
      if (b.t >= B.ripen) {
        b.phase = 'ripe'; b.picked = 0; b.small = B.smallPicks; b.berries = 0;
        for (let i = 0; i < B.bigPicks; i++) b.berries += rint(B.bigBerries);
        this.ev.push({ k: 'ripe' });
      }
    }
    if (b.phase === 'ripe' && b.berries <= 0 && b.small <= 0) { b.phase = 'empty'; this.ev.push({ k: 'bushEmpty' }); }
  }
  /** tutorial can speed up the bush (never used by default) */
  ripenMul: number | undefined;

  private updatePlayer(dt: number, it: Intent) {
    const P = this.player, C = this.cfg.player;
    P.cd = Math.max(0, P.cd - dt); P.hurt = Math.max(0, P.hurt - dt); P.stun = Math.max(0, P.stun - dt);
    // --- fighting (right click): never together with an action
    if (it.attack && !P.swing && P.cd <= 0) {
      if (P.action) this.cancelAction();
      P.goal = null;
      this.attack(it);
    }
    // --- left click: act now if close enough, else walk there first
    if (it.act && !P.swing) {
      const a = this.actionFor(it.act);
      if (!a) { /* nothing to do */ }
      else if (!a.ok) this.ev.push({ k: 'deny', why: a.why, target: it.act });
      else if (this.targetDist(it.act, P.x, P.z) <= C.reach) this.startAction(it.act, a);
      else { P.goal = it.act; if (P.action) this.cancelAction(); }
    }
    // --- movement
    let mx = it.mx, mz = it.mz; const ml = Math.hypot(mx, mz);
    if (ml > .15) { P.goal = null; if (P.action) this.cancelAction(); }
    if (P.goal && ml <= .15) {
      const g = this.targetPos(P.goal), d = this.targetDist(P.goal, P.x, P.z);
      const a = this.actionFor(P.goal);
      if (!a || !a.ok) P.goal = null;
      else if (d <= C.reach * .8) { const t = P.goal; P.goal = null; this.startAction(t, a); }
      else { const l = dist(P.x, P.z, g.x, g.z) || 1; mx = (g.x - P.x) / l; mz = (g.z - P.z) / l; }
    }
    const busy = !!P.action || (P.swing && P.swing.t < this.cfg.weapons.rake.swing);
    const sp = busy ? 0 : C.speed * Math.min(1, Math.hypot(mx, mz)) * (P.stun > 0 ? 1 - P.stun / C.hurtStun * .7 : 1);
    if (sp > 0) {
      const l = Math.hypot(mx, mz) || 1, nx = P.x + mx / l * sp * dt, nz = P.z + mz / l * sp * dt;
      const c = this.hof.collide(nx, nz, C.radius, true);
      P.speed = dist(P.x, P.z, c.x, c.z) / dt; P.x = c.x; P.z = c.z;
      if (!P.swing) P.f = Math.atan2(mx, mz);
    } else P.speed = 0;
    P.walk += P.speed * dt * 2.1;
    // --- running action: when the bar is full it takes effect; repeating actions go on by themselves
    if (P.action) {
      const A = P.action, tp = this.facePoint(A.target); P.f = angTo(P.x, P.z, tp.x, tp.z);
      A.t += dt;
      if (A.t >= A.info.dur) {
        P.action = null; this.finishAction(A.target, A.info);
        const next = A.info.repeat ? this.actionFor(A.target) : null;
        if (next && next.ok && next.kind === A.info.kind) { P.action = { target: A.target, info: next, t: 0, pick: A.pick + 1 }; this.ev.push({ k: 'act', kind: next.kind, tool: next.tool, target: A.target, again: true }); }
        else this.ev.push({ k: 'actEnd', kind: A.info.kind, target: A.target });
      }
    }
    // --- swing
    if (P.swing) {
      const W = this.cfg.weapons.rake; P.swing.t += dt;
      if (!P.swing.hit && P.swing.t >= W.swing * .5) { P.swing.hit = true; this.rakeHit(P.swing.dir); }
      if (P.swing.t >= W.swing + .12) P.swing = null;
    }
    P.shotT = Math.max(0, P.shotT - dt);
  }
  /** the point the player looks at while working (nearest point of a building) */
  facePoint(t: Target) {
    if (t.k === 'bld' || t.k === 'stall') {
      const o = this.hof.building(t.id), P = this.player;
      if (o && o.kind === 'box') { const dx = P.x - o.x, dz = P.z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c, cx = Math.max(-o.hw, Math.min(o.hw, lx)), cz = Math.max(-o.hd, Math.min(o.hd, lz)); return { x: o.x + cx * o.c + cz * o.s, z: o.z - cx * o.s + cz * o.c }; }
    }
    return this.targetPos(t);
  }
  startAction(t: Target, a: ActionInfo) {
    const P = this.player; P.goal = null;
    if (a.kind === 'water' && this.s.water <= 0) return;
    // the harvest basket is set down right next to the player
    if (a.kind === 'harvestBush') { const tp = this.targetPos(t), l = dist(P.x, P.z, tp.x, tp.z) || 1, sx = -(tp.z - P.z) / l, sz = (tp.x - P.x) / l; this.basketAt = this.hof.collide(P.x + sx * .6, P.z + sz * .6, .25, false); this.ev.push({ k: 'basket', x: this.basketAt.x, z: this.basketAt.z }); }
    P.action = { target: t, info: a, t: 0, pick: 0 };
    this.ev.push({ k: 'act', kind: a.kind, tool: a.tool, target: t });
  }
  cancelAction() { const P = this.player; if (P.action) this.ev.push({ k: 'actCancel', kind: P.action.info.kind }); P.action = null; }
  private finishAction(t: Target, a: ActionInfo) {
    const s = this.s, cfg = this.cfg, tp = this.targetPos(t);
    const now = this.actionFor(t); if (!now || !now.ok || now.kind !== a.kind) return; // something changed meanwhile
    switch (a.kind) {
      case 'water':
        s.water = Math.max(0, s.water - 1);
        if (t.k === 'bush' && s.bush.phase === 'dry') { s.bush.phase = 'growing'; s.bush.t = 0; }
        if (t.k === 'plot') s.plots[t.i].watered = true;
        break;
      case 'plow': if (t.k === 'plot') s.plots[t.i].stage = 'raked'; break;
      case 'sow': if (t.k === 'plot') {
        const crop = 'wheat', C = cfg.crops[crop]; if (count(s, C.seed) <= 0) return;
        addItem(cfg, s, C.seed, -1); Object.assign(s.plots[t.i], { stage: 'sown', crop, days: 0, watered: false, bites: 0, fert: 0, fertDay: 0 });
        break;
      }
      case 'weed': if (t.k === 'plot') { const p = s.plots[t.i]; this.store('green', p.weeds, tp); p.weeds = 0; this.plotWeedT[t.i] = rnd(...cfg.plots.weeds.every); } break;
      case 'fertilize': if (t.k === 'plot') {
        const p = s.plots[t.i]; addItem(cfg, s, 'fert', -1); p.fert++; p.fertDay = s.day;
        if (p.stage === 'ripe') p.yieldLeft += Math.max(1, Math.round(cfg.plots.cuts * cfg.plots.fertBonus));
        break;
      }
      case 'harvestPlot': if (t.k === 'plot') {
        const p = s.plots[t.i], C = cfg.crops[p.crop ?? 'wheat'];
        for (const [k, v] of Object.entries(C.yield)) this.store(k, v, tp);
        p.yieldLeft--; if (p.yieldLeft <= 0) Object.assign(p, { stage: 'raked', crop: null, days: 0, watered: false, bites: 0, yieldLeft: 0, fert: 0 });
        break;
      }
      case 'harvestBush': this.pickBush(); break;
      case 'refill': s.water = cfg.can.capacity; break;
      case 'draw': addItem(cfg, s, 'water', 1); this.ev.push({ k: 'store', item: 'water', n: 1, x: tp.x, z: tp.z }); break;
      case 'gather': if (t.k === 'forage') { const w = s.wild, i = w.forage.findIndex(f => f.id === t.id); if (i >= 0) { const f = w.forage[i]; w.forage.splice(i, 1); this.store(f.k, 1, f); } } break;
      case 'weedHof': if (t.k === 'weed') { const w = s.wild, i = w.weeds.findIndex(f => f.id === t.id); if (i >= 0) { const f = w.weeds[i]; w.weeds.splice(i, 1); this.store('green', 1, f); } } break;
      case 'pickWild': if (t.k === 'bramble') { const b = this.brambles[t.i], n = Math.min(b.n, rint(cfg.wild.brambles.pick)); b.n -= n; this.store('bramble', n, tp); this.ev.push({ k: 'bramble', i: t.i, n }); } break;
      case 'shake': if (t.k === 'tree') {
        const n = Math.min(this.apples[t.i], rint(cfg.wild.apples.shake)); this.apples[t.i] -= n;
        for (let k = 0; k < n; k++) { const an = rnd(0, 7), v = rnd(.6, 1.6); this.loot.push({ id: this.nid++, item: 'apple', x: tp.x + Math.cos(an) * .6, z: tp.z + Math.sin(an) * .6, y: rnd(2, 2.8), vx: Math.cos(an) * v, vz: Math.sin(an) * v, vy: 0, t: 0, fresh: true }); }
        this.ev.push({ k: 'shake', i: t.i, x: tp.x, z: tp.z, n });
        break;
      }
      case 'feed': if (t.k === 'stall') { const C = cfg.stalls[t.id], st = this.stalls[t.id]; addItem(cfg, s, C.feed, -C.feedCost); st.fed++; this.ev.push({ k: 'fed', id: t.id, full: st.fed >= C.maxFed }); } break;
      case 'straw': if (t.k === 'stall') { addItem(cfg, s, 'straw', -cfg.stalls.strawCost); this.stalls[t.id].straw = true; } break;
      case 'milk': case 'eggs': if (t.k === 'stall') {
        const C = cfg.stalls[t.id], st = this.stalls[t.id], k = st.fed / C.maxFed * (st.straw ? 1 + cfg.stalls.strawBonus : 1);
        for (const [item, per] of Object.entries(C.yield)) this.store(item, Math.max(1, Math.round(per * C.animals.length * k)), tp);
        st.done = true;
        break;
      }
      case 'produce': if (t.k === 'bld') {
        const r = cfg.buildings[t.id].recipes!.find(x => this.needs(x.in)); if (!r) return;
        for (const [k, v] of Object.entries(r.in)) addItem(cfg, s, k, -v);
        for (const [k, v] of Object.entries(r.out)) this.store(k, v, tp);
        break;
      }
    }
    this.ev.push({ k: 'actDone', kind: a.kind, target: t });
  }
  /** one pass through the blueberry bush: 3-4 big berries (later small ones) fly into the basket */
  private pickBush() {
    const b = this.s.bush, B = this.cfg.bush; if (b.phase !== 'ripe') return;
    let n: number;
    if (b.berries > 0) { n = Math.min(b.berries, rint(B.bigBerries)); b.berries -= n; }
    else { n = B.smallBerries; b.small--; }
    b.picked++; this.store('blue', n, this.cfg.hof.bush, false);
    this.ev.push({ k: 'berry', n, small: b.berries <= 0, x: this.cfg.hof.bush.x, z: this.cfg.hof.bush.z, bx: this.basketAt?.x, bz: this.basketAt?.z });
  }
  /** harvest goes straight into the Lager */
  store(item: ItemId, n: number, at?: { x: number; z: number }, show = true) {
    if (n <= 0) return; addItem(this.cfg, this.s, item, n);
    this.got[item] = (this.got[item] ?? 0) + n;
    if (show) this.ev.push({ k: 'store', item, n, x: at?.x, z: at?.z });
  }

  // ---------------- fighting ----------------
  /** weapon of the day can fire? */
  canShoot() { const s = this.s, W = s.weapon && s.weapon !== 'rake' ? this.cfg.weapons[s.weapon] : null; return !!W && W.available && !!s.ammo && s.ammoCount >= (W.ammoPerShot ?? 1); }
  private aimDir(it: Intent, range: number) {
    const P = this.player;
    if (it.aimAuto) {
      let best: Animal | null = null, bd = range + 1.5;
      for (const a of this.animals) { if (a.gone || a.state === 'script') continue; const d = dist(P.x, P.z, a.x, a.z); if (d < bd) { bd = d; best = a; } }
      return best ? angTo(P.x, P.z, best.x, best.z) : P.f;
    }
    return dist(P.x, P.z, it.aimX, it.aimZ) > .2 ? angTo(P.x, P.z, it.aimX, it.aimZ) : P.f;
  }
  private attack(it: Intent) {
    const P = this.player, s = this.s;
    if (this.canShoot()) {
      const W = this.cfg.weapons[s.weapon as Exclude<typeof s.weapon, 'rake' | null>]!, A = this.cfg.ammo[s.ammo!] ?? { damage: 1 };
      const dir = this.aimDir(it, W.range ?? 6); P.f = dir; P.cd = W.cooldown ?? .7; P.shotT = .18;
      s.ammoCount -= W.ammoPerShot ?? 1;
      const n = W.pellets ?? 6, cone = (W.cone ?? 26) * Math.PI / 180, sp = W.speed ?? 20;
      for (let i = 0; i < n; i++) {
        const a = dir + (Math.random() - .5) * cone, v = sp * rnd(.85, 1.1);
        this.pellets.push({ x: P.x + Math.sin(dir) * .5, z: P.z + Math.cos(dir) * .5, vx: Math.sin(a) * v, vz: Math.cos(a) * v, life: (W.range ?? 7) / v, dmg: (W.damage ?? 2) * A.damage, freeze: A.freeze ?? 0, ammo: s.ammo! });
      }
      this.ev.push({ k: 'shot', x: P.x, z: P.z, dir, ammo: s.ammo });
      return;
    }
    const W = this.cfg.weapons.rake, dir = this.aimDir(it, W.range);
    P.f = dir; P.cd = W.cooldown; P.swing = { t: 0, dir, hit: false };
    this.ev.push({ k: 'swing', x: P.x, z: P.z, dir });
  }
  private rakeHit(dir: number) {
    const P = this.player, W = this.cfg.weapons.rake, half = W.arc * Math.PI / 360;
    let n = 0;
    for (const a of this.animals) {
      if (a.gone || a.state === 'flee' && a.driven) continue;
      const d = dist(P.x, P.z, a.x, a.z); if (d > W.range + this.cfg.animals[a.type].radius) continue;
      let da = angTo(P.x, P.z, a.x, a.z) - dir; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > half && d > .5) continue;
      this.hitAnimal(a, W.damage, { stun: W.stun, knock: W.knockback, fromX: P.x, fromZ: P.z }); n++;
    }
    this.ev.push({ k: 'rakeHit', n, x: P.x + Math.sin(dir) * W.range * .7, z: P.z + Math.cos(dir) * W.range * .7 });
  }
  private updatePellets(dt: number) {
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const p = this.pellets[i], x0 = p.x, z0 = p.z; p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
      let hit = false;
      for (const a of this.animals) { // swept test: a fast pellet must not tunnel through an animal between two frames
        if (a.gone || a.state === 'script') continue;
        if (segDist(x0, z0, p.x, p.z, a.x, a.z) < this.cfg.animals[a.type].radius + .1) { this.hitAnimal(a, p.dmg, { freeze: p.freeze, fromX: p.x - p.vx, fromZ: p.z - p.vz, knock: .08 }); hit = true; break; }
      }
      if (!hit) for (const o of this.hof.obstacles) { if (o.id === 'bush' || o.id === 'basket') continue; const q = o.kind === 'circle' ? dist(p.x, p.z, o.x, o.z) < o.r : false; if (q) { hit = true; break; } }
      if (hit || p.life <= 0) { if (hit) this.ev.push({ k: 'pelletHit', x: p.x, z: p.z, ammo: p.ammo }); this.pellets.splice(i, 1); }
    }
  }
  hitAnimal(a: Animal, dmg: number, o: { stun?: number; knock?: number; freeze?: number; fromX: number; fromZ: number }) {
    if (a.gone) return;
    a.hp -= dmg; a.flash = .25;
    if (o.stun) a.stun = Math.max(a.stun, o.stun);
    if (o.freeze) a.freeze = Math.max(a.freeze, o.freeze);
    if (o.knock) { const l = dist(a.x, a.z, o.fromX, o.fromZ) || 1; const c = this.hof.collide(a.x + (a.x - o.fromX) / l * o.knock, a.z + (a.z - o.fromZ) / l * o.knock, this.cfg.animals[a.type].radius, false); a.x = c.x; a.z = c.z; }
    this.ev.push({ k: 'hit', id: a.id, x: a.x, z: a.z, type: a.type, frozen: !!o.freeze });
    if (a.carryN > 0) this.dropCarry(a);
    if (a.state === 'script') return;
    if (a.hp <= 0) { this.driveOff(a); return; }
    if (a.type === 'hare' || a.shy) this.driveOff(a);
    else { a.brave = true; if (a.state !== 'flee') a.state = 'attack'; }
  }
  /** XP once, then the animal runs into the forest */
  driveOff(a: Animal) {
    if (!a.driven) {
      a.driven = true; const xp = this.cfg.animals[a.type].xp;
      gainXp(this.cfg, this.s, xp); this.driven++; this.xpGained += xp;
      this.ev.push({ k: 'driven', id: a.id, x: a.x, z: a.z, xp, type: a.type });
    }
    this.flee(a);
  }
  private flee(a: Animal) { if (a.state === 'flee') return; a.state = 'flee'; a.t = 0; a.gap = this.hof.nearestGap(a.x, a.z); a.detour = null; this.ev.push({ k: 'flee', id: a.id, type: a.type, x: a.x, z: a.z, carry: a.carryN }); }
  dropCarry(a: Animal) {
    for (const [item, n] of Object.entries(a.carry)) for (let i = 0; i < n; i++) {
      const an = rnd(0, 7), v = rnd(1, 2.6);
      this.loot.push({ id: this.nid++, item, x: a.x, z: a.z, y: .3, vx: Math.cos(an) * v, vz: Math.sin(an) * v, vy: rnd(2.5, 4), t: 0 });
    }
    this.ev.push({ k: 'drop', x: a.x, z: a.z, n: a.carryN });
    a.carry = {}; a.carryN = 0;
  }
  private updateLoot(dt: number) {
    const P = this.player, C = this.cfg.player;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i]; l.t += dt;
      if (l.y > 0 || l.vy > 0) { l.vy -= 14 * dt; l.y = Math.max(0, l.y + l.vy * dt); l.x += l.vx * dt; l.z += l.vz * dt; if (l.y === 0) { l.vy = 0; l.vx *= .3; l.vz *= .3; } }
      const d = dist(P.x, P.z, l.x, l.z);
      if (l.t > .5 && d < C.magnetRadius) { const k = Math.min(1, C.magnetSpeed * dt / Math.max(.01, d)); l.x += (P.x - l.x) * k; l.z += (P.z - l.z) * k; }
      if (l.t > .5 && d < C.pickupRadius) {
        this.loot.splice(i, 1); addItem(this.cfg, this.s, l.item, 1);
        if (l.fresh) this.got[l.item] = (this.got[l.item] ?? 0) + 1; else this.lost[l.item] = Math.max(0, (this.lost[l.item] ?? 0) - 1);
        this.ev.push({ k: 'pickup', item: l.item, x: l.x, z: l.z });
      }
    }
  }

  // ---------------- animals ----------------
  /** a few animals spread over the day (hares) + one raccoon raid in the second half (one more raccoon per level) */
  private planSpawns() {
    const S = this.cfg.spawns, L = this.s.level - 1, gaps = this.hof.gaps.length;
    const types = Object.entries(S.wanderTypes) as [AnimalType, number][], tot = types.reduce((n, [, v]) => n + v, 0);
    const n = rint(S.wanderers);
    for (let i = 0; i < n; i++) {
      let r = Math.random() * tot, type = types[0][0]; for (const [k, v] of types) { r -= v; if (r <= 0) { type = k; break; } }
      this.plan.push({ at: this.length * (.08 + .82 * (i + rnd(.15, .85)) / n), type, gap: Math.floor(Math.random() * gaps) });
    }
    const at = this.length * rnd(S.raid.from, S.raid.to), gap = Math.floor(Math.random() * gaps), m = S.raid.raccoons + Math.floor(L * S.raid.perLevel);
    for (let i = 0; i < m; i++) this.plan.push({ at: at + i * .9, type: 'raccoon', gap });
    this.plan.sort((a, b) => a.at - b.at);
  }
  private updateSpawns() {
    while (this.plan.length && this.plan[0].at <= this.t) { const g = this.plan.shift()!; this.spawn(g.type, g.gap); }
  }
  /** when the raccoon raid comes (tests) */
  get raidAt() { return this.plan.find(p => p.type === 'raccoon')?.at ?? null; }
  spawn(type: AnimalType, gap: number, o: Partial<Animal> = {}): Animal {
    const C = this.cfg.animals[type], S = this.cfg.spawns.scaling, L = this.s.level - 1, p = this.hof.gapOut(gap);
    const hp = C.hp * (1 + S.hp * L);
    const a: Animal = { id: this.nid++, type, x: p.x + rnd(-1, 1), z: p.z + rnd(-1, 1), f: 0, hp, maxHp: hp, state: 'enter', target: null, gap, t: 0, act: 0,
      carry: {}, carryN: 0, stun: 0, freeze: 0, flash: 0, bite: 0, shy: type === 'hare' || Math.random() < (C.shy ?? 0), brave: false, driven: false, gone: false,
      speedMul: 1 + S.speed * L, dmgMul: 1 + S.damage * L, stuck: 0, lx: 0, lz: 0, detour: null, ...o };
    this.animals.push(a); this.ev.push({ k: 'spawn', id: a.id, type, x: a.x, z: a.z });
    return a;
  }
  private pickTarget(a: Animal): Animal['target'] {
    const s = this.s, opts: { t: NonNullable<Animal['target']>; w: number }[] = [];
    const bush = s.bush.phase === 'ripe' && s.bush.berries > 0;
    if (a.type === 'raccoon') {
      const food = Object.entries(s.items).filter(([k, v]) => EDIBLE(k) && v > 0).reduce((n, [, v]) => n + v, 0);
      if (food > 0 && this.basketAt) opts.push({ t: { k: 'basket' }, w: 3 });
      if (bush) opts.push({ t: { k: 'bush' }, w: 2 });
      s.plots.forEach((p, i) => { if (p.open && p.stage === 'ripe' && p.yieldLeft > 0) opts.push({ t: { k: 'plot', i }, w: 1.5 }); });
    } else {
      if (bush || s.bush.phase === 'growing') opts.push({ t: { k: 'bush' }, w: 1 });
      s.plots.forEach((p, i) => { if (p.open && (p.stage === 'sown' || (p.stage === 'ripe' && p.yieldLeft > 0))) opts.push({ t: { k: 'plot', i }, w: 2 }); });
    }
    if (!opts.length) return null;
    let r = Math.random() * opts.reduce((n, o) => n + o.w, 0);
    for (const o of opts) { r -= o.w; if (r <= 0) return o.t; }
    return opts[0].t;
  }
  /** spot next to a target where the animal stands */
  private standAt(a: Animal, t: NonNullable<Animal['target']>) {
    const p = this.targetPos(t as Target), r = t.k === 'plot' ? 0 : .75;
    if (!r) return p;
    const an = Math.atan2(a.z - p.z, a.x - p.x); return { x: p.x + Math.cos(an) * r, z: p.z + Math.sin(an) * r };
  }
  private moveTo(a: Animal, x: number, z: number, speed: number, dt: number, ghost = false) {
    const d = dist(a.x, a.z, x, z); if (d < .05) return true;
    let tx = x, tz = z;
    if (a.detour) { tx = a.detour.x; tz = a.detour.z; if (dist(a.x, a.z, tx, tz) < .5) a.detour = null; }
    const l = dist(a.x, a.z, tx, tz) || 1, st = Math.min(speed * dt, l);
    let nx = a.x + (tx - a.x) / l * st, nz = a.z + (tz - a.z) / l * st;
    if (!ghost) { const c = this.hof.collide(nx, nz, this.cfg.animals[a.type].radius, false); nx = c.x; nz = c.z; }
    const moved = dist(a.x, a.z, nx, nz);
    a.f = Math.atan2(nx - a.x, nz - a.z) || a.f; a.x = nx; a.z = nz;
    // stuck behind a building: go round via a point beside it
    if (moved < speed * dt * .3) { a.stuck += dt; if (a.stuck > .6 && !a.detour) { const side = Math.random() < .5 ? 1 : -1, an = Math.atan2(tz - a.z, tx - a.x) + side * 1.4; a.detour = { x: a.x + Math.cos(an) * 3, z: a.z + Math.sin(an) * 3 }; a.stuck = 0; } }
    else a.stuck = 0;
    return d < .15;
  }
  private updateAnimals(dt: number) {
    const P = this.player;
    for (const a of this.animals) {
      if (a.gone) continue;
      const C = this.cfg.animals[a.type];
      a.flash = Math.max(0, a.flash - dt); a.stun = Math.max(0, a.stun - dt); a.bite = Math.max(0, a.bite - dt);
      if (a.freeze > 0) { a.freeze -= dt; continue; }
      const slow = a.stun > 0 ? 1 - a.stun / Math.max(.01, this.cfg.weapons.rake.stun) : 1;
      const sp = C.speed * a.speedMul * slow, fsp = C.fleeSpeed * a.speedMul * slow;
      const dp = dist(P.x, P.z, a.x, a.z);
      if (a.state === 'script') {
        const w = a.path?.[0];
        if (w) { if (this.moveTo(a, w.x, w.z, w.speed, dt, true)) a.path!.shift(); }
        continue;
      }
      // shy animals run as soon as the player comes close (that counts as driving them off)
      if (a.state !== 'flee' && a.shy && dp < C.scare && a.state !== 'enter') { this.driveOff(a); continue; }
      a.t += dt;
      switch (a.state) {
        case 'enter': {
          const p = this.hof.gapIn(a.gap);
          if (this.moveTo(a, p.x, p.z, sp, dt, true) || this.hof.ellipse(a.x, a.z) < .9) { a.state = 'go'; a.target = this.pickTarget(a); a.t = 0; }
          break;
        }
        case 'wander': case 'go': {
          if (!a.target || !this.targetValid(a, a.target)) { a.target = this.pickTarget(a); if (!a.target) { if (a.t > 12) this.flee(a); else { a.state = 'wander'; this.moveTo(a, a.x + Math.sin(a.t) * .5, a.z + Math.cos(a.t * .7) * .5, sp * .4, dt); } break; } }
          a.state = 'go';
          const p = this.standAt(a, a.target);
          if (this.moveTo(a, p.x, p.z, sp, dt) || dist(a.x, a.z, p.x, p.z) < .35) { a.state = a.type === 'raccoon' ? 'steal' : 'eat'; a.act = 0; const tp = this.targetPos(a.target as Target); a.f = angTo(a.x, a.z, tp.x, tp.z); }
          if (a.type === 'raccoon' && a.brave && dp < (C.aggro ?? 3)) a.state = 'attack';
          break;
        }
        case 'steal': case 'eat': {
          if (!a.target || !this.targetValid(a, a.target)) { if (a.carryN > 0) this.flee(a); else { a.state = 'go'; a.target = null; } break; }
          a.act += dt;
          const iv = a.type === 'raccoon' ? C.stealInterval ?? .8 : C.eatInterval ?? 2.5;
          if (a.act >= iv) { a.act -= iv; this.takeFrom(a, a.target); }
          if (a.type === 'raccoon' && a.carryN >= (C.carryMax ?? 5)) this.flee(a);
          if (a.type === 'raccoon' && !a.shy && dp < (C.aggro ?? 3) && a.carryN === 0) a.state = 'attack';
          break;
        }
        case 'attack': {
          if (dp > (C.aggro ?? 3) * 2.2) { a.state = 'go'; break; }
          if (dp > (C.biteRange ?? .85)) this.moveTo(a, P.x, P.z, sp * 1.15, dt);
          else { a.f = angTo(a.x, a.z, P.x, P.z); if (a.bite <= 0) { a.bite = C.biteInterval ?? 1.2; this.hurtPlayer((C.damage ?? 5) * a.dmgMul, a); } }
          break;
        }
        case 'flee': {
          const out = this.hof.gapOut(a.gap), inn = this.hof.gapIn(a.gap);
          const target = this.hof.ellipse(a.x, a.z) < .85 ? inn : out;
          this.moveTo(a, target.x, target.z, fsp, dt, this.hof.ellipse(a.x, a.z) > .8 || a.t > 4); // never stuck for long: after 4 s it slips through
          if (this.hof.ellipse(a.x, a.z) > 1.35) {
            a.gone = true;
            for (const [k, n] of Object.entries(a.carry)) this.lost[k] = (this.lost[k] ?? 0) + n;
            this.ev.push({ k: 'gone', id: a.id, type: a.type, carry: a.carryN });
          }
          break;
        }
      }
    }
    // separate overlapping animals a little
    for (let i = 0; i < this.animals.length; i++) for (let j = i + 1; j < this.animals.length; j++) {
      const a = this.animals[i], b = this.animals[j]; if (a.gone || b.gone || a.state === 'script' || b.state === 'script') continue;
      const d = dist(a.x, a.z, b.x, b.z), m = .55; if (d > m || d < 1e-3) continue;
      const k = (m - d) / d * .5; a.x += (a.x - b.x) * k; a.z += (a.z - b.z) * k; b.x -= (a.x - b.x) * k; b.z -= (a.z - b.z) * k;
    }
    this.animals = this.animals.filter(a => !a.gone || false);
  }
  private targetValid(a: Animal, t: NonNullable<Animal['target']>) {
    const s = this.s;
    if (t.k === 'basket') return !!this.basketAt && Object.entries(s.items).some(([k, v]) => EDIBLE(k) && v > 0);
    if (t.k === 'bush') return (s.bush.phase === 'ripe' && s.bush.berries > 0) || (a.type === 'hare' && s.bush.phase === 'growing');
    if (t.k === 'plot') { const p = s.plots[t.i]; return p.open && (p.stage === 'ripe' ? p.yieldLeft > 0 : a.type === 'hare' && p.stage === 'sown'); }
    return false;
  }
  private takeFrom(a: Animal, t: NonNullable<Animal['target']>) {
    const s = this.s, C = this.cfg.animals[a.type];
    const grab = (item: ItemId) => { if (a.type === 'raccoon') { a.carry[item] = (a.carry[item] ?? 0) + 1; a.carryN++; } else this.lost[item] = (this.lost[item] ?? 0) + 1; };
    if (t.k === 'basket') {
      const list = Object.entries(s.items).filter(([k, v]) => EDIBLE(k) && v > 0); if (!list.length) return;
      let r = Math.random() * list.reduce((n, [, v]) => n + v, 0), pick = list[0][0];
      for (const [k, v] of list) { r -= v; if (r <= 0) { pick = k; break; } }
      addItem(this.cfg, s, pick, -1); grab(pick);
      this.ev.push({ k: 'steal', id: a.id, item: pick, x: a.x, z: a.z, from: 'basket' });
    } else if (t.k === 'bush') {
      if (s.bush.phase === 'ripe' && s.bush.berries > 0) { s.bush.berries--; grab('blue'); this.ev.push({ k: a.type === 'raccoon' ? 'steal' : 'eat', id: a.id, item: 'blue', x: a.x, z: a.z, from: 'bush' }); }
      else if (a.type === 'hare' && s.bush.phase === 'growing') { s.bush.t = Math.max(0, s.bush.t - 4); this.ev.push({ k: 'eat', id: a.id, x: a.x, z: a.z, from: 'bush' }); }
    } else if (t.k === 'plot') {
      const p = s.plots[t.i];
      if (p.stage === 'ripe' && p.yieldLeft > 0) { if (++p.bites >= 2) { p.bites = 0; p.yieldLeft--; } grab(this.cfg.crops[p.crop ?? 'wheat'].seed); this.ev.push({ k: a.type === 'raccoon' ? 'steal' : 'eat', id: a.id, x: a.x, z: a.z, from: 'plot', i: t.i }); }
      else if (p.stage === 'sown') {
        p.bites++; this.ev.push({ k: 'eat', id: a.id, x: a.x, z: a.z, from: 'plot', i: t.i });
        if (p.bites >= (C.plotBites ?? 3)) { p.bites = 0; p.days = Math.max(0, p.days - 1); p.watered = false; }
      }
    }
  }
  hurtPlayer(dmg: number, from: Animal | null) {
    const P = this.player; if (P.hp <= 0) return;
    P.hp = Math.max(0, P.hp - dmg); P.hurt = .35; P.stun = this.cfg.player.hurtStun;
    if (P.action) this.cancelAction();
    this.ev.push({ k: 'hurt', x: P.x, z: P.z, dmg, from: from?.id });
  }
  /** ripe plots carry their main yield as "yieldLeft" (animals can eat it) */
  initRipe() { for (const p of this.s.plots) if (p.open && p.stage === 'ripe' && p.crop && p.yieldLeft <= 0) p.yieldLeft = ripeCuts(this.cfg, p); }
  /** faint: watered plots are dry again */
  applyFaint() { if (this.cfg.faint.dryFields) for (const p of this.s.plots) p.watered = false; }
}
