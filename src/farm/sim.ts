// One playable day on the farm: player movement, timed actions (left click, see actions in balancing.yaml), fighting
// (right click), animals (raccoon, hare), stalls with livestock, weeds + forage that grow back out of sight, loot, rain,
// clock. Works on the persistent FarmState; the view only reads.
import { ActionKind, AnimalType, BuildingId, FarmCfg, ItemId, STALL_IDS, StallId, Tool, cropXp, nightPlan, otherXp, rollHerbs, treeCfg, treeKind } from './config';
import { FarmState, addItem, breakPlot, count, gainXp, growMul, repairPlot, ripeCuts } from './state';
import { Hof, Obstacle, obsDist } from './hof';
import { NavGrid, navFor } from './nav';

export type Target =
  | { k: 'bush' } | { k: 'well' } | { k: 'plot'; i: number }
  | { k: 'bld'; id: BuildingId } | { k: 'stall'; id: StallId }
  | { k: 'tree'; i: number } | { k: 'bramble'; i: number }
  | { k: 'forage'; id: number } | { k: 'weed'; id: number };
/** the Lager at the main house (H.basket): raccoons steal from it (21.11.2026: no harvest basket any more) */
type Lager = { k: 'lager' };
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
  /** a good shown as an icon after the name (the crop that is sown) */
  item?: ItemId;
}
export interface Intent {
  mx: number; mz: number;           // movement -1..1 in world x/z (main.ts turns the stick by the camera)
  aimX: number; aimZ: number;       // world point the attack goes to (mouse) ...
  aimAuto: boolean;                 // ... or aim at the nearest animal (touch)
  act: Target | null;               // left click / action button this frame
  /** left mouse button / action button held (21.11.2026): when an action ends the next possible one at `holdAt` starts */
  hold: boolean; holdAt: Target | null;
  /** the button was let go this frame (Basti 21.11.2026: releasing cancels the work at once) */
  up?: boolean;
  attack: boolean;                  // right click / attack button held
}
export const emptyIntent = (): Intent => ({ mx: 0, mz: 0, aimX: 0, aimZ: 0, aimAuto: false, act: null, hold: false, holdAt: null, attack: false });
/** actions done kneeling / crouching on the ground (hand rake, sowing, harvesting a plot, gathering) */
export const LOW_ACTIONS = new Set<ActionKind>(['weed', 'weedHof', 'sow', 'harvestPlot', 'fertilize', 'gather', 'repair']);
export type Ev = { k: string; [key: string]: any };

export interface Player {
  x: number; z: number; f: number; hp: number; maxHp: number; walk: number; speed: number;
  action: { target: Target; info: ActionInfo; t: number; pick: number } | null;
  goal: Target | null;              // auto-walk to a clicked target, then act
  /** down on one knee / in a crouch: from a ground action on until the action button is released (then walking = waddling) */
  crouch: boolean;
  /** pause between automatic work steps (Basti 21.11.2026: always player.actionGap s): rest = time left,
   *  after = the finished step, the chain goes on from it once the pause is over */
  rest: number; after: { target: Target; info: ActionInfo; pick: number } | null;
  /** the running work was started with the button held: letting go stops it */
  held?: boolean;
  swing: { t: number; dir: number; hit: boolean } | null;
  shotT: number; cd: number; hurt: number; stun: number;
}
export type AnimalState = 'enter' | 'go' | 'steal' | 'eat' | 'attack' | 'flee' | 'wander' | 'run' | 'script';
export interface Animal {
  id: number; type: AnimalType; x: number; z: number; f: number; hp: number; maxHp: number;
  state: AnimalState; target: Target | Lager | null; gap: number; t: number; act: number;
  carry: Record<ItemId, number>; carryN: number; stun: number; freeze: number; flash: number; bite: number;
  shy: boolean; brave: boolean; driven: boolean; gone: boolean; speedMul: number; dmgMul: number;
  stuck: number; lx: number; lz: number; detour: { x: number; z: number } | null;
  /** hares (21.11.2026): hop around home, run dest when startled, scared = times startled */
  home?: { x: number; z: number }; dest?: { x: number; z: number } | null; idle?: number; scared?: number;
  /** night attack (21.11.2026): aggressive, only driven off when its HP are gone; hits = successful bites of a raccoon */
  night?: boolean; hits?: number;
  /** tutorial: walks a fixed list of points, no AI */
  path?: { x: number; z: number; speed: number }[];
  /** pathfinding (nav.ts): goal of the current route, its corner points, age; none = no way found (then straight) */
  route?: { gx: number; gz: number; pts: { x: number; z: number }[]; t: number; none: boolean } | null;
}
export interface Pellet { x: number; z: number; vx: number; vz: number; life: number; dmg: number; freeze: number; ammo: ItemId }
/** goods on the ground: dropped by a raccoon (stolen) or shaken off a tree (new) */
export interface Loot { id: number; item: ItemId; x: number; z: number; y: number; vx: number; vz: number; vy: number; t: number; fresh?: boolean; /** pieces in this pile (default 1) */ n?: number }
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
/** goods animals take from the Lager (not straw, wood, stones ...) */
const NOT_EDIBLE = new Set(['straw', 'plank', 'wood', 'stone', 'water', 'green', 'slurry', 'fert']); // goods raccoons take from the Lager
const EDIBLE = (id: ItemId) => !NOT_EDIBLE.has(id);
/** which targets win when several are in reach: buildings, plots, bush first, then forage, weeds last */
const PRIO: Record<Target['k'], number> = { bush: 0, well: 0, plot: 0, bld: 0, stall: 0, tree: 1, bramble: 1, forage: 2, weed: 3 };

/** a planned animal: near = hops around a field from the morning on, night = attacker of the night (wave = its wave, 0-based) */
export interface Spawn { at: number; type: AnimalType; gap: number; near?: boolean; night?: boolean; wave?: number }
/** the running day in a save made during the day (animals on the farm are not kept, the plan of the rest of the day is) */
export interface DaySnap {
  t: number; player: { x: number; z: number; f: number; hp: number };
  got: Record<ItemId, number>; lost: Record<ItemId, number>; driven: number; xpGained: number;
  /** old saves: where the harvest basket stood (ignored since 21.11.2026) */
  basketAt?: { x: number; z: number } | null; stalls: Record<StallId, Stall>; apples: number[]; brambles: { n: number; t: number }[];
  plan: Spawn[]; half: number; rain: { at: number; dur: number; t: number } | null;
  loot: { item: ItemId; x: number; z: number; fresh?: boolean; n?: number }[];
  /** night: goods of today raccoons took out of the pocket, fields broken so far */
  taken?: Record<ItemId, number>; broken?: number;
}

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
  /** night after the day (21.11.2026): s long, 0 = none (tutorial); nightOn from nightfall on; waves = start of every wave (s of the clock) */
  nightLen: number; nightOn = false; waves: number[] = []; broken = 0;
  got: Record<ItemId, number> = {}; lost: Record<ItemId, number> = {}; driven = 0; xpGained = 0;
  stalls = {} as Record<StallId, Stall>;
  apples: number[];
  brambles: { n: number; t: number }[];
  /** is a ground point on screen? (set by the game from the camera; wild things only grow where nobody looks) */
  visible: (x: number, z: number) => boolean = (x, z) => dist(x, z, this.player.x, this.player.z) < 22;
  private plan: Spawn[] = [];
  private nid = 1;
  private pelletBuf: Obstacle[] = [];
  private half = 0;
  private weedT: number; private forageT: number;
  /** s until the next wild plant of each kind grows (wild.forage.plants) */
  private plantT: Record<ItemId, number> = {};

  constructor(public cfg: FarmCfg, public s: FarmState, public hof: Hof, o: { tutorial?: boolean } = {}) {
    this.length = cfg.day.length; this.nightLen = o.tutorial || !cfg.night ? 0 : cfg.night.length;
    const P = cfg.player, d = cfg.hof.door, W = cfg.wild;
    this.player = { x: d.x, z: d.z + .4, f: 0, hp: P.hp, maxHp: P.hp, walk: 0, speed: 0, action: null, goal: null, crouch: false, rest: 0, after: null, swing: null, shotT: 0, cd: 0, hurt: 0, stun: 0 };
    for (const id of STALL_IDS) this.stalls[id] = { fed: 0, done: false, straw: false };
    // perennials: ripe again from the remembered day on (a tree / bramble that was picked empty rests a few days)
    const per = s.perennial;
    this.apples = cfg.hof.trees.map((_, i) => (per.trees[i] ?? 0) <= s.day ? treeCfg(cfg, i).picks : 0);
    this.brambles = hof.brambles.map((_, i) => ({ n: (per.brambles[i] ?? 0) <= s.day ? W.brambles.picks : 0, t: 0 }));
    hof.setBuilt(id => !!s.buildings[id]?.built);   // world editor: only built buildings block
    // a building that went up overnight covers whatever grew there
    if (hof.hideUnbuilt) { s.wild.forage = s.wild.forage.filter(f => !hof.underBuilding(f.x, f.z, .2)); s.wild.weeds = s.wild.weeds.filter(f => !hof.underBuilding(f.x, f.z, .2)); }
    this.weedT = rnd(...W.weeds.every); this.forageT = rnd(...W.forage.every);
    for (const [k, v] of Object.entries(W.forage.plants ?? {})) this.plantT[k] = v.spawn * rnd(.3, 1);
    void this.nav; // bake the walk grid now (once per farm), not when the first animal needs it
    if (!s.wild.init) this.seedWild();
    if (o.tutorial) { this.clockRuns = false; this.spawns = false; }
    else { this.planSpawns(); if (Math.random() < cfg.day.rain.chance) { const [a, b] = cfg.day.rain.duration; this.rain = { at: rnd(.15, .7) * this.length, dur: rnd(a, b), t: 0 }; } }
  }

  // ---------------- clock ----------------
  /** 0..1 of the day */
  get k() { return Math.min(1, this.t / this.length); }
  /** s until nightfall (0 at night) */
  get dayLeft() { return Math.max(0, this.length - this.t); }
  /** 0..1 of the night (0 by day) */
  get nightK() { return this.nightLen ? Math.min(1, Math.max(0, (this.t - this.length) / this.nightLen)) : 0; }
  get nightLeft() { return Math.max(0, this.length + this.nightLen - this.t); }
  /** waves that have come so far */
  get wavesIn() { return this.waves.filter(w => w <= this.t).length; }

  // ---------------- wild growth (weeds on the farm, forage at the edge) ----------------
  /** a new game: lots of things lying around */
  private seedWild() {
    const W = this.cfg.wild; this.s.wild.init = true;
    for (let i = 0; i < W.weeds.start; i++) this.growWeed(true);
    const kinds = [...Object.keys(W.forage.plants ?? {}), ...Object.keys(W.forage.items)];
    for (let i = 0; i < W.forage.start; i++) this.growForage(true, kinds[i % kinds.length]);
  }
  private spot(k0: number, k1: number, pad: number, hidden: boolean) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rnd(0, Math.PI * 2), k = Math.sqrt(rnd(k0 * k0, k1 * k1)), { x, z } = this.hof.edge(a, k);
      if (!this.hof.freeSpot(x, z, pad)) continue;
      if (!hidden && this.visible(x, z)) continue;
      return { x, z };
    }
    return null;
  }
  /** a point near the grass patches (rim, not the dense middle): wild herbs; wet = only the damp meadow behind the well */
  private grassSpot(hidden: boolean, wet = false) {
    if (this.hof.logic) return this.paintedGrassSpot(hidden);
    const ps = this.hof.patches.filter(p => wet ? p.wet : !p.low); if (!ps.length) return null;
    for (let tries = 0; tries < 40; tries++) {
      const p = ps[Math.floor(Math.random() * ps.length)], b = this.hof.patchBox(p);
      const x = rnd(b.x0 - 1, b.x1 + 1), z = rnd(b.z0 - 1, b.z1 + 1), g = this.hof.grass(x, z), raw = this.hof.patchDensity(p, x, z);
      if (raw <= .02 && Math.random() < .7) continue;                         // next to the patch, not out in the open
      if (g > .45 || this.hof.pathDist(x, z) < .2 || this.hof.ellipse(x, z) > .97 || this.hof.inGap(x, z, .5)) continue;
      if (!this.hof.freeSpot(x, z, .4)) continue;
      if (!hidden && this.visible(x, z)) continue;
      return { x, z };
    }
    return null;
  }
  /** world editor: at the rim of the painted wild grass (some grass, not the dense middle) */
  private paintedGrassSpot(hidden: boolean) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rnd(0, Math.PI * 2), { x, z } = this.hof.edge(a, Math.sqrt(Math.random()) * .97), g = this.hof.grass(x, z);
      if (g < .08 || g > .6 || this.hof.inGap(x, z, .5) || !this.hof.freeSpot(x, z, .4)) continue;
      if (!hidden && this.visible(x, z)) continue;
      return { x, z };
    }
    return null;
  }
  private growWeed(any = false) {
    const w = this.s.wild; if (w.weeds.length >= this.cfg.wild.weeds.max) return;
    // world editor: weeds / wild herbs on the farm only grow on the wild plant spots painted there
    if (this.hof.hasWildSpots) { const q = this.hof.wildSpot((x, z) => (any || !this.visible(x, z)) && !w.weeds.some(f => (f.x - x) ** 2 + (f.z - z) ** 2 < .36)); if (q) w.weeds.push({ id: w.seq++, ...q }); return; }
    const p = this.grassSpot(any) ?? this.spot(.08, .95, .5, any); if (p) w.weeds.push({ id: w.seq++, ...p });
  }
  /** k = a wild plant kind (wild.forage.plants), else firewood / stones by weight */
  private growForage(any = false, k0?: ItemId) {
    const w = this.s.wild, F = this.cfg.wild.forage; if (w.forage.length >= F.max) return;
    let k = k0 ?? '';
    if (!k) {
      const items = Object.entries(F.items); if (!items.length) return;
      const tot = items.reduce((n, [, v]) => n + v, 0); let r = Math.random() * tot; k = items[0][0];
      for (const [id, v] of items) { r -= v; if (r <= 0) { k = id; break; } }
    }
    // world editor (21.11.2026): wild plants only grow on the spawn points painted there (where, not how often)
    if (F.plants?.[k] && this.hof.hasWildSpots) {
      const q = this.hof.wildSpot((x, z) => (any || !this.visible(x, z)) && !w.forage.some(f => (f.x - x) ** 2 + (f.z - z) ** 2 < .36));
      if (q) { const n = F.plants[k].picks; w.forage.push(n ? { id: w.seq++, k, ...q, n } : { id: w.seq++, k, ...q }); }
      return;
    }
    const where = F.where?.[k] ?? ['edge'], place = where[Math.floor(Math.random() * where.length)];
    const p = place === 'edge' ? this.spot(F.band[0], F.band[1], .4, any) : this.grassSpot(any, place === 'wet');
    if (!p || this.hof.inGap(p.x, p.z) || this.hof.pathDist(p.x, p.z) < .2) return;
    const picks = F.plants?.[k]?.picks;
    w.forage.push(picks ? { id: w.seq++, k, ...p, n: picks } : { id: w.seq++, k, ...p });
  }
  /** weeds + forage on the farm (weeds on the plots only come in the morning: state.morningWeeds) */
  private updateWild(dt: number) {
    const W = this.cfg.wild;
    if ((this.weedT -= dt) <= 0) { this.weedT = rnd(...W.weeds.every); this.growWeed(); }
    if ((this.forageT -= dt) <= 0) { this.forageT = rnd(...W.forage.every); this.growForage(); }
    for (const [k, v] of Object.entries(W.forage.plants ?? {})) if ((this.plantT[k] -= dt) <= 0) { this.plantT[k] = v.spawn; this.growForage(false, k); }
  }

  // ---------------- targets ----------------
  targetPos(t: Target | Lager): { x: number; z: number } {
    const H = this.cfg.hof;
    switch (t.k) {
      case 'bush': return H.bush;
      case 'lager': return H.basket;
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
        if (b.phase === 'ripe') return this.act('harvestBush', 'hands');
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
        if (p.broken) return this.act('repair', 'handrake'); // trampled in the night: rake it smooth again first (10 s)
        // 21.11.2026 (Basti): only sow, water, harvest + weed every morning. Weeds never block anything, they slow the growth.
        // Order = what helps most first: sow, water (growth starts), then weed; while sprouting / clearing there is time to weed.
        const fert = count(s, 'fert') > 0 && p.fertDay !== s.day, weed = p.weeds > 0 ? this.act('weed', 'handrake', { count: '' + p.weeds }) : null;
        if (p.stage === 'ripe') return this.act('harvestPlot', p.crop === 'wheat' ? 'sickle' : 'hands', { count: '' + p.yieldLeft });
        if (p.stage === 'empty') return this.act('sow', 'seed', { item: this.seedCrop(t.i) });
        if (p.stage === 'sown') {
          if (p.t > 0) return weed;                       // sprouting
          if (!p.watered) { const w = this.act('water', 'can', noWater); return !w.ok && weed ? weed : w; }
          if (weed) return weed;
          if (fert) return this.act('fertilize', 'hands');
          return null;
        }
        return weed;                                      // 'done': cleared in a moment
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
      case 'weed': return s.wild.weeds.some(f => f.id === t.id) ? this.act('weedHof', 'handrake') : null;
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
  /** front = third person (21.11.2026): what lies in front of the farmer wins over what is behind */
  nearestTarget(range: number, front = false): Target | null {
    const P = this.player; let best: Target | null = null, score = 1e9;
    for (const t of this.targetsNear(P.x, P.z, range)) {
      const a = this.actionFor(t); if (!a) continue;
      const d = this.targetDist(t, P.x, P.z); if (d > range) continue;
      let sc = PRIO[t.k] * 100 + (a.ok ? 0 : 50) + d;
      if (front && d > .3) { const tp = this.targetPos(t), da = Math.abs(((angTo(P.x, P.z, tp.x, tp.z) - P.f) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); sc += da * .8; }
      if (sc < score) { score = sc; best = t; }
    }
    return best;
  }

  // ---------------- update ----------------
  update(dt: number, it: Intent) {
    this.ev.length = 0;
    if (this.paused || this.finished) return;
    if (this.clockRuns) this.t += dt;
    if (this.clockRuns && this.nightLen > 0 && !this.nightOn && this.t >= this.length) this.startNight();
    this.updateHalf();
    this.updateRain(dt);
    this.updateBush(dt);
    this.updatePlots(dt);
    if (this.clockRuns && !this.nightOn) this.updateWild(dt);
    this.updatePlayer(dt, this.inputLocked ? { ...it, mx: 0, mz: 0, act: null, hold: false, holdAt: null, attack: false } : it);
    this.updatePellets(dt);
    this.updateAnimals(dt);
    this.updateLoot(dt);
    if (this.spawns) this.updateSpawns();
    if (this.nightOn && this.nightLeft <= this.cfg.night.flee) for (const a of this.animals) if (a.night && a.state !== 'flee' && !a.gone) this.flee(a); // the night is over: they run off
    if (this.clockRuns && this.t >= this.length + this.nightLen) this.finished = 'time';
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
      for (const p of this.s.plots) if (p.open && p.stage === 'sown' && p.t <= 0) p.watered = true;
      if (this.s.bush.phase === 'dry') { this.s.bush.phase = 'growing'; this.s.bush.t = 0; }
    }
    void dt;
  }
  /** the crop a field grows (21.11.2026: every field has a fixed fruit) */
  seedCrop(i: number) { const k = this.s.plots[i]?.kind; return k && this.cfg.crops[k] ? k : 'wheat'; }
  /** XP for every harvest pass (Basti 21.11.2026) */
  private harvestXp(xp: number, at: { x: number; z: number }) {
    if (xp <= 0) return;
    gainXp(this.cfg, this.s, xp); this.xpGained += xp; this.ev.push({ k: 'xp', xp, x: at.x, z: at.z });
  }
  /** field cycle: sprout (plots.sprout s) -> watered: grow crops.*.grow s -> ripe -> after the last harvest clear (plots.clear s) */
  private updatePlots(dt: number) {
    this.s.plots.forEach((p, i) => {
      if (!p.open) return;
      if (p.stage === 'sown') {
        if (p.t > 0) { p.t = Math.max(0, p.t - dt); return; }
        if (!p.watered || !p.crop || this.nightOn) return; // crops grow by day only
        const C = this.cfg.crops[p.crop]; p.grow += dt * growMul(this.cfg, p); // every weed slows the growth
        if (C && p.grow >= C.grow) { p.stage = 'ripe'; p.bites = 0; p.yieldLeft = ripeCuts(this.cfg, p); this.ev.push({ k: 'plotRipe', i }); }
      } else if (p.stage === 'done') {
        if ((p.t -= dt) <= 0) Object.assign(p, { stage: 'empty', crop: null, t: 0, grow: 0, watered: false, bites: 0, yieldLeft: 0, fert: 0 }); // sow again right away
      }
    });
  }
  private updateBush(dt: number) {
    const b = this.s.bush, B = this.cfg.bush;
    if (b.phase === 'growing') {
      b.t += dt * (this.ripenMul ?? 1);
      if (b.t >= B.ripen) {
        b.phase = 'ripe'; b.picked = 0; b.small = 0; b.berries = B.picks * B.berries;
        this.ev.push({ k: 'ripe' });
      }
    }
    if (b.phase === 'ripe' && b.berries <= 0) { b.phase = 'empty'; this.ev.push({ k: 'bushEmpty' }); }
  }
  /** tutorial can speed up the bush (never used by default) */
  ripenMul: number | undefined;

  private updatePlayer(dt: number, it: Intent) {
    const P = this.player, C = this.cfg.player;
    P.cd = Math.max(0, P.cd - dt); P.hurt = Math.max(0, P.hurt - dt); P.stun = Math.max(0, P.stun - dt);
    // --- fighting (right click): never together with an action, the player stands up for the swing
    if (it.attack && !P.swing && P.cd <= 0) {
      if (P.action) this.cancelAction();
      P.goal = null; P.crouch = false; P.rest = 0; P.after = null;
      this.attack(it);
    }
    // --- left click / action button pressed: act now if close enough, else walk there first
    if (it.act && !P.swing && !(P.action && sameTarget(P.action.target, it.act))) {
      const a = this.actionFor(it.act);
      if (!a) { /* nothing to do */ }
      else if (!a.ok) this.ev.push({ k: 'deny', why: a.why, target: it.act });
      else { if (P.action) this.cancelAction(); P.rest = 0; P.after = null; this.begin(it.act, a); P.held = it.hold; }
    }
    // --- let go: whatever was started by holding stops right away (also the walk over to it)
    if (it.up && P.held) { this.cancelAction(); P.goal = null; P.held = false; P.crouch = false; }
    if (it.hold && (P.action || P.goal || P.after)) P.held = true;
    if (!P.action && !P.goal && !P.after) P.held = false;
    // --- short pause after every finished step, then the chain goes on (repeat or held button)
    const steering = Math.hypot(it.mx, it.mz) > .15;
    if (P.after) {
      P.rest -= dt;
      if (P.rest <= 0) { const A = P.after; P.after = null; P.rest = 0; this.chain(it, A, steering); }
    }
    // --- held (21.11.2026): whenever nothing runs, the next possible action at the aimed target starts by itself
    if (it.hold && !P.action && !P.swing && !P.goal && !P.after) this.holdNext(it, null, !steering);
    // released: up again once the running action (and a repeat chain) is over
    if (!it.hold && !P.action && !P.after) P.crouch = false;
    // --- movement: walking is possible during an action (slower); in a crouch it is a slow waddle
    let mx = it.mx, mz = it.mz;
    if (steering) P.goal = null;
    if (P.goal && !steering) {
      const a = this.actionFor(P.goal);
      if (!a || !a.ok) P.goal = null;
      else if (this.inPlace(P.goal, a, .85)) { const t = P.goal; P.goal = null; this.startAction(t, a); }
      else { const g = this.low(P.goal, a) ? this.workPoint(P.goal, a.kind) : this.targetPos(P.goal), l = dist(P.x, P.z, g.x, g.z) || 1; mx = (g.x - P.x) / l; mz = (g.z - P.z) / l; }
    }
    const swinging = !!P.swing && P.swing.t < this.cfg.weapons.rake.swing;
    const base = P.crouch ? C.crouchSpeed : P.action ? C.actionSpeed : C.speed;
    const sp = swinging ? 0 : base * Math.min(1, Math.hypot(mx, mz)) * (P.stun > 0 ? 1 - P.stun / C.hurtStun * .7 : 1);
    if (sp > 0) {
      const l = Math.hypot(mx, mz) || 1, nx = P.x + mx / l * sp * dt, nz = P.z + mz / l * sp * dt;
      const c = this.hof.collide(nx, nz, C.radius, true);
      P.speed = dist(P.x, P.z, c.x, c.z) / dt; P.x = c.x; P.z = c.z;
      if (!P.swing && !P.action) P.f = Math.atan2(mx, mz);
    } else P.speed = 0;
    P.walk += P.speed * dt * (P.crouch ? 3.4 : 2.1); // short quick steps in the crouch
    // --- running action: too far away = cancelled; when the bar is full it takes effect, then the next one follows
    if (P.action && this.tooFar(P.action.target, P.action.info)) this.cancelAction();
    if (P.action) {
      const A = P.action, tp = this.facePoint(A.target, A.info.kind); P.f = angTo(P.x, P.z, tp.x, tp.z);
      A.t += dt;
      if (A.t >= A.info.dur) {
        P.action = null; this.finishAction(A.target, A.info);
        const gap = this.cfg.player.actionGap ?? .5;
        if (gap > 0) { P.after = { target: A.target, info: A.info, pick: A.pick }; P.rest = gap; this.ev.push({ k: 'actRest', kind: A.info.kind, target: A.target }); }
        else this.chain(it, A, steering);
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
  /** a step is done (and the pause after it is over): the same work goes on (repeat), else the next one while the button is held */
  private chain(it: Intent, A: { target: Target; info: ActionInfo; pick: number }, steering: boolean) {
    const P = this.player;
    if (P.action || P.swing) return;
    const next = A.info.repeat ? this.actionFor(A.target) : null;
    if (next && next.ok && next.kind === A.info.kind) {
      if (this.inPlace(A.target, next)) { P.crouch = LOW_ACTIONS.has(next.kind); P.action = { target: A.target, info: next, t: 0, pick: A.pick + 1 }; this.ev.push({ k: 'act', kind: next.kind, tool: next.tool, target: A.target, again: true }); return; }
      if (!this.tooFar(A.target, next)) { P.goal = A.target; return; } // the next weed of the plot lies elsewhere: shuffle over (in the crouch) and go on
    }
    if (it.hold && (this.holdNext(it, A.target, !steering) || (!steering && this.nextPlot(A.target)))) return;
    this.ev.push({ k: 'actEnd', kind: A.info.kind, target: A.target });
  }
  /** button still held and nothing left to do here (Basti 21.11.2026): walk on to the nearest field with work (player.nextField m) */
  private nextPlot(last: Target) {
    const P = this.player, R = this.cfg.player.nextField ?? 5;
    let best: Target | null = null, bd = 1e9;
    this.s.plots.forEach((p, i) => {
      if (!p.open || (last.k === 'plot' && last.i === i)) return;
      const t: Target = { k: 'plot', i }, a = this.actionFor(t); if (!a || !a.ok) return;
      const d = this.targetDist(t, P.x, P.z); if (d <= R && d < bd) { bd = d; best = t; }
    });
    if (!best) return false;
    const a = this.actionFor(best)!;
    if (this.inPlace(best, a)) this.startAction(best, a); else { P.goal = best; P.crouch = false; } // up and walk over normally
    return true;
  }
  /** button held: start the next possible action at the aimed target (else at the one just finished). Within reach only;
   *  ground work first shuffles over to its spot (walk = true, not while the player steers). false = none: the chain ends */
  private holdNext(it: Intent, last: Target | null, walk: boolean) {
    const P = this.player, reach = this.cfg.player.reach;
    for (const t of [it.holdAt, last]) {
      if (!t) continue;
      const a = this.actionFor(t);
      if (!a || !a.ok || this.targetDist(t, P.x, P.z) > reach) continue;
      if (this.inPlace(t, a)) { this.startAction(t, a); return true; }
      if (walk) { P.goal = t; return true; }
    }
    return false;
  }
  /** click / chain: act right here, or walk over first */
  private begin(t: Target, a: ActionInfo) { if (this.inPlace(t, a)) this.startAction(t, a); else this.player.goal = t; }
  /** is this done down on the ground (kneeling, hand rake / hands in the soil)? */
  low(t: Target, a: ActionInfo) { return LOW_ACTIONS.has(a.kind) && (t.k === 'plot' || t.k === 'weed' || t.k === 'forage'); }
  /** ground work: the point the hands work at (the weed that comes out next, else the part of the plot facing the player) */
  workPoint(t: Target, kind?: ActionKind): { x: number; z: number } {
    if (t.k === 'plot') {
      const c = this.cfg.hof.plots[t.i], p = this.s.plots[t.i], P = this.player;
      if (kind === 'weed' && p?.weeds > 0) { const sp = this.hof.plotWeeds[t.i]?.[p.weeds - 1]; if (sp) return { x: c.x + sp.x, z: c.z + sp.z }; }
      const dx = P.x - c.x, dz = P.z - c.z, l = Math.hypot(dx, dz) || 1, r = Math.min(l, this.cfg.plots.size / 2 * .5);
      return { x: c.x + dx / l * r, z: c.z + dz / l * r };
    }
    return this.targetPos(t);
  }
  /** close enough to do it (k < 1: a bit closer, for walking over) */
  inPlace(t: Target, a: ActionInfo, k = 1) {
    const P = this.player, C = this.cfg.player;
    if (this.low(t, a)) { const w = this.workPoint(t, a.kind); return dist(P.x, P.z, w.x, w.z) <= C.kneel * k; }
    return this.targetDist(t, P.x, P.z) <= C.reach * k;
  }
  /** walked away from a running action (Basti 21.11.2026: walking is fine, too far cancels) */
  private tooFar(t: Target, a: ActionInfo) {
    const P = this.player, C = this.cfg.player;
    if (this.low(t, a)) { const w = this.workPoint(t, a.kind); return dist(P.x, P.z, w.x, w.z) > C.kneel * C.leave + .35; }
    return this.targetDist(t, P.x, P.z) > C.reach * C.leave;
  }
  /** the point the player looks at while working (nearest point of a building, the spot of ground work) */
  facePoint(t: Target, kind?: ActionKind) {
    if (kind && this.low(t, { kind } as ActionInfo)) return this.workPoint(t, kind);
    if (t.k === 'bld' || t.k === 'stall') {
      const o = this.hof.building(t.id), P = this.player;
      if (o && o.kind === 'box') { const dx = P.x - o.x, dz = P.z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c, cx = Math.max(-o.hw, Math.min(o.hw, lx)), cz = Math.max(-o.hd, Math.min(o.hd, lz)); return { x: o.x + cx * o.c + cz * o.s, z: o.z - cx * o.s + cz * o.c }; }
    }
    return this.targetPos(t);
  }
  startAction(t: Target, a: ActionInfo) {
    const P = this.player; P.goal = null;
    if (a.kind === 'water' && this.s.water <= 0) return;
    P.crouch = LOW_ACTIONS.has(a.kind); // down on one knee for ground work, up again for everything else
    P.action = { target: t, info: a, t: 0, pick: 0 };
    this.ev.push({ k: 'act', kind: a.kind, tool: a.tool, target: t });
  }
  cancelAction() { const P = this.player; P.rest = 0; P.after = null; if (P.action) this.ev.push({ k: 'actCancel', kind: P.action.info.kind }); P.action = null; }
  private finishAction(t: Target, a: ActionInfo) {
    const s = this.s, cfg = this.cfg, tp = this.targetPos(t);
    // something changed meanwhile? (weeding stays valid while weeds are left, even if the plot now wants water first)
    const now = this.actionFor(t), weedOk = a.kind === 'weed' && t.k === 'plot' && s.plots[t.i]?.weeds > 0;
    if (!weedOk && (!now || !now.ok || now.kind !== a.kind)) return;
    switch (a.kind) {
      case 'water':
        s.water = Math.max(0, s.water - 1);
        if (t.k === 'bush' && s.bush.phase === 'dry') { s.bush.phase = 'growing'; s.bush.t = 0; }
        if (t.k === 'plot') s.plots[t.i].watered = true;
        break;
      case 'sow': if (t.k === 'plot') {
        const crop = this.seedCrop(t.i); // seeds cost nothing (Basti 20.11.2026)
        Object.assign(s.plots[t.i], { stage: 'sown', crop, days: 0, watered: false, bites: 0, fert: 0, fertDay: 0, t: cfg.plots.sprout, grow: 0 });
        break;
      }
      case 'repair': if (t.k === 'plot') { repairPlot(cfg, s.plots[t.i]); this.ev.push({ k: 'repaired', i: t.i, x: tp.x, z: tp.z }); } break;
      case 'weed': if (t.k === 'plot') { const p = s.plots[t.i]; p.weeds = Math.max(0, p.weeds - 1); this.store('green', 1, tp); } break; // one weed per pass (repeats)
      case 'fertilize': if (t.k === 'plot') {
        const p = s.plots[t.i]; addItem(cfg, s, 'fert', -1); p.fert++; p.fertDay = s.day;
        if (p.stage === 'ripe') p.yieldLeft += Math.max(1, Math.round((cfg.crops[p.crop ?? 'wheat']?.cuts ?? 3) * cfg.plots.fertBonus));
        break;
      }
      case 'harvestPlot': if (t.k === 'plot') {
        const p = s.plots[t.i], C = cfg.crops[p.crop ?? 'wheat'];
        for (const [k, v] of Object.entries(C.yield)) this.store(k, v, tp);
        this.harvestXp(cropXp(cfg, p.crop ?? 'wheat'), tp);
        p.yieldLeft--; if (p.yieldLeft <= 0) Object.assign(p, { stage: 'done', t: cfg.plots.clear, watered: false, bites: 0, yieldLeft: 0 });
        break;
      }
      case 'harvestBush': this.pickBush(); break;
      case 'refill': s.water = Math.min(cfg.can.capacity, s.water + cfg.can.perFill); break; // 21.11.2026: +2 per filling, never above capacity
      case 'draw': addItem(cfg, s, 'water', 1); this.ev.push({ k: 'store', item: 'water', n: 1, x: tp.x, z: tp.z }); break;
      case 'gather': if (t.k === 'forage') { const w = s.wild, i = w.forage.findIndex(f => f.id === t.id); if (i >= 0) { const f = w.forage[i]; f.n = (f.n ?? 1) - 1; if (f.n <= 0) w.forage.splice(i, 1); this.store(f.k, 1, f); this.harvestXp(otherXp(cfg, f.k, cfg.wild.forage.plants?.[f.k]?.picks ?? 1), f); } } break;
      case 'weedHof': if (t.k === 'weed') { const w = s.wild, i = w.weeds.findIndex(f => f.id === t.id); if (i >= 0) {
        // wild herbs (21.11.2026): one tuft = weed + maybe wild garlic / dandelion / sorrel; XP only for the herbs
        const f = w.weeds[i], H = cfg.wild.herbs; w.weeds.splice(i, 1);
        let xp = 0; for (const [k, n] of Object.entries(rollHerbs(H))) { this.store(k, n, f); if (k !== 'green') xp += n * otherXp(cfg, k, H?.xpPicks ?? 3); }
        this.harvestXp(xp, f);
      } } break;
      case 'pickWild': if (t.k === 'bramble') {
        const B = cfg.wild.brambles, b = this.brambles[t.i]; b.n--; this.store('bramble', B.pick, tp); this.harvestXp(otherXp(cfg, 'bramble', B.picks), tp); this.ev.push({ k: 'bramble', i: t.i, n: B.pick });
        if (b.n <= 0) s.perennial.brambles[t.i] = s.day + B.every;
        break;
      }
      case 'shake': if (t.k === 'tree') {
        const T = treeCfg(cfg, t.i), item = treeKind(cfg, t.i), n = T.shake; this.apples[t.i]--; this.harvestXp(otherXp(cfg, item, T.picks), tp);
        if (this.apples[t.i] <= 0) s.perennial.trees[t.i] = s.day + T.every;
        for (let k = 0; k < n; k++) { const an = rnd(0, 7), v = rnd(.6, 1.6); this.loot.push({ id: this.nid++, item, x: tp.x + Math.cos(an) * .6, z: tp.z + Math.sin(an) * .6, y: rnd(2, 2.8), vx: Math.cos(an) * v, vz: Math.sin(an) * v, vy: 0, t: 0, fresh: true }); }
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
  /** one pass through the blueberry bush: the berries go straight into the Lager (21.11.2026: no basket) */
  private pickBush() {
    const b = this.s.bush, B = this.cfg.bush; if (b.phase !== 'ripe') return;
    const n = Math.min(b.berries, B.berries); b.berries -= n;
    b.picked++; this.store('blue', n, this.cfg.hof.bush); this.harvestXp(otherXp(this.cfg, 'blue', B.picks), this.cfg.hof.bush);
    this.ev.push({ k: 'berry', n, small: b.berries <= 0, x: this.cfg.hof.bush.x, z: this.cfg.hof.bush.z });
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
      if (!hit) for (const o of this.hof.near(p.x, p.z, .05, this.pelletBuf)) { if (o.id === 'bush' || o.kind === 'box') continue; if (obsDist(o, p.x, p.z) <= 0) { hit = true; break; } }
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
    if (a.night) { // the attackers of the night only leave when their HP are gone (Basti 21.11.2026)
      if (a.hp <= 0) this.driveOff(a); else if (a.type === 'raccoon' && a.state !== 'flee') a.state = 'attack';
      return;
    }
    if (a.hp <= 0) { this.driveOff(a); return; }
    if (a.type === 'hare' || a.shy) this.driveOff(a);
    else { a.brave = true; if (a.state !== 'flee') a.state = 'attack'; }
  }
  /** XP once, then the animal runs into the forest */
  driveOff(a: Animal) {
    if (!a.driven) {
      a.driven = true; const xp = a.night ? this.cfg.night[a.type].xp : this.cfg.animals[a.type].xp;
      gainXp(this.cfg, this.s, xp); this.driven++; this.xpGained += xp;
      this.ev.push({ k: 'driven', id: a.id, x: a.x, z: a.z, xp, type: a.type });
    }
    this.flee(a);
  }
  private flee(a: Animal) { if (a.state === 'flee') return; a.state = 'flee'; a.t = 0; a.gap = this.hof.nearestGap(a.x, a.z); a.detour = null; this.ev.push({ k: 'flee', id: a.id, type: a.type, x: a.x, z: a.z, carry: a.carryN }); }
  dropCarry(a: Animal) {
    for (const [item, n] of Object.entries(a.carry)) {
      const piles = Math.min(n, 4); // a big haul falls as a few piles
      for (let i = 0; i < piles; i++) {
        const an = rnd(0, 7), v = rnd(1, 2.6), k = Math.floor(n / piles) + (i < n % piles ? 1 : 0);
        this.loot.push({ id: this.nid++, item, x: a.x, z: a.z, y: .3, vx: Math.cos(an) * v, vz: Math.sin(an) * v, vy: rnd(2.5, 4), t: 0, n: k });
      }
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
        const n = l.n ?? 1;
        this.loot.splice(i, 1); addItem(this.cfg, this.s, l.item, n);
        if (l.fresh) this.got[l.item] = (this.got[l.item] ?? 0) + n;
        else { this.lost[l.item] = Math.max(0, (this.lost[l.item] ?? 0) - n); if (this.taken[l.item]) this.taken[l.item] = Math.max(0, this.taken[l.item] - n); }
        this.ev.push({ k: 'pickup', item: l.item, x: l.x, z: l.z, n });
      }
    }
  }

  // ---------------- night (Basti 21.11.2026) ----------------
  /** nightfall: the day hares run off, the waves of the night are planned (more every night, at most as many as the level allows) */
  private startNight(warn = true) {
    this.nightOn = true;
    this.plan = this.plan.filter(p => p.night);
    for (const a of this.animals) if (!a.night && !a.gone) { a.driven = true; this.flee(a); } // no XP: they just leave
    if (warn) this.planNight(); // (a save made at night keeps its plan)
    this.waves = this.cfg.night.waves.map(w => this.length + w.at);
    if (warn) this.ev.push({ k: 'nightfall' });
  }
  private planNight() {
    const gaps = this.hof.gaps.length; if (!gaps) return;
    nightPlan(this.cfg, this.s.day, this.s.level).forEach((w, wave) => {
      const at = this.length + w.at, g1 = this.hof.pickGap(), g2 = this.hof.pickGap();
      for (let i = 0; i < w.raccoon; i++) this.plan.push({ at: at + i * .8, type: 'raccoon', gap: g1, night: true, wave });
      for (let i = 0; i < w.hare; i++) this.plan.push({ at: at + .4 + i * .7, type: 'hare', gap: g2, night: true, wave });
    });
    this.plan.sort((a, b) => a.at - b.at);
  }
  /** a hare picks a field to eat: fields with a crop first, near ones first (not broken ones) */
  private nightPlot(a: Animal): Animal['target'] {
    let best: Animal['target'] = null, bw = 0;
    this.s.plots.forEach((p, i) => {
      if (!p.open || p.broken) return;
      const c = this.cfg.hof.plots[i], w = (p.stage === 'empty' ? 1 : 3) * rnd(.6, 1.4) / (1 + dist(a.x, a.z, c.x, c.z) / 8);
      if (w > bw) { bw = w; best = { k: 'plot', i }; }
    });
    return best;
  }
  /** one bite of a night hare into a field: the field loses HP, at 0 it is trampled (crop gone, needs repair) */
  private gnaw(a: Animal, i: number) {
    const p = this.s.plots[i], N = this.cfg.night; if (!p?.open || p.broken) return;
    p.hp = Math.max(0, (p.hp ?? N.plotHp) - N.hare.plotDamage);
    const c = this.cfg.hof.plots[i];
    this.ev.push({ k: 'gnaw', id: a.id, i, x: c.x, z: c.z, crop: p.crop });
    if (p.hp <= 0) { breakPlot(p); this.broken++; this.ev.push({ k: 'plotBroken', i, x: c.x, z: c.z }); a.target = null; }
  }
  /** a raccoon bit the player: it takes `steal` of the day's harvest out of the pocket (goods of today that are still in the storage) */
  private pocketSteal(a: Animal) {
    const share = this.cfg.night.raccoon.steal, avail: [ItemId, number][] = [];
    let total = 0;
    for (const [k, v] of Object.entries(this.got)) { if (!EDIBLE(k) || v <= 0) continue; total += v; const n = Math.min(v - (this.taken[k] ?? 0), count(this.s, k)); if (n > 0) avail.push([k, n]); }
    const have = avail.reduce((n, [, v]) => n + v, 0); if (!have) return;
    let want = Math.min(have, Math.max(1, Math.round(total * share)));
    const took: Record<ItemId, number> = {};
    // a share of every good, the rest piece by piece by weight
    for (const [k, v] of avail) { const n = Math.min(v, Math.floor(want * v / have)); if (n > 0) took[k] = n; }
    want -= Object.values(took).reduce((n, v) => n + v, 0);
    for (let g = 0; g < 200 && want > 0; g++) { const [k, v] = avail[Math.floor(Math.random() * avail.length)]; if ((took[k] ?? 0) < v) { took[k] = (took[k] ?? 0) + 1; want--; } }
    for (const [k, n] of Object.entries(took)) {
      addItem(this.cfg, this.s, k, -n); this.taken[k] = (this.taken[k] ?? 0) + n;
      a.carry[k] = (a.carry[k] ?? 0) + n; a.carryN += n;
    }
    this.ev.push({ k: 'pocket', id: a.id, x: this.player.x, z: this.player.z, items: took });
  }
  /** goods of today a raccoon took out of the pocket (so the next bite does not count them again) */
  private taken: Record<ItemId, number> = {};
  /** night animals: hares eat the fields, raccoons hunt the player */
  private nightAnimal(a: Animal, dt: number, sp: number, dp: number) {
    const N = this.cfg.night, P = this.player;
    switch (a.state) {
      case 'enter': {
        const p = this.hof.gapIn(a.gap);
        if (this.moveTo(a, p.x, p.z, sp, dt, false, true) || this.hof.ellipse(a.x, a.z) < .9) { a.state = a.type === 'hare' ? 'go' : 'attack'; a.t = 0; a.target = null; a.bite = .5; }
        return;
      }
      case 'go': case 'eat': case 'wander': {
        if (a.type !== 'hare') { a.state = 'attack'; return; }
        if (!a.target || !this.targetValid(a, a.target)) {
          a.target = this.nightPlot(a); a.dest = null; a.state = 'go';
          if (!a.target) { // nothing left to eat: hop around the broken fields
            if (!a.dest) { const an = rnd(0, 7); a.dest = { x: a.x + Math.cos(an) * 2, z: a.z + Math.sin(an) * 2 }; }
            if (this.moveTo(a, a.dest.x, a.dest.z, sp * .5, dt) || a.t > 4) { a.dest = null; a.t = 0; }
            return;
          }
        }
        const i = (a.target as { i: number }).i, c = this.cfg.hof.plots[i];
        if (!a.dest) { const an = rnd(0, 7), r = rnd(0, this.cfg.plots.size * .3); a.dest = { x: c.x + Math.cos(an) * r, z: c.z + Math.sin(an) * r }; a.t = 0; }
        if (a.state === 'go') {
          if (this.moveTo(a, a.dest.x, a.dest.z, sp, dt) || dist(a.x, a.z, a.dest.x, a.dest.z) < .3 || (a.t > 4 && dist(a.x, a.z, c.x, c.z) < this.cfg.plots.size * .55)) { a.state = 'eat'; a.act = 0; a.f = angTo(a.x, a.z, c.x, c.z) + rnd(-1, 1); }
          return;
        }
        if (a.stun > 0) return;
        a.act += dt;
        if (a.act >= N.hare.biteInterval) { a.act -= N.hare.biteInterval; this.gnaw(a, i); if (Math.random() < .25) { a.dest = null; a.state = 'go'; } } // now and then a hop to another spot of the field
        return;
      }
      case 'attack': case 'steal': {
        if (a.type !== 'raccoon') { a.state = 'go'; return; }
        a.state = 'attack';
        const C = this.cfg.animals.raccoon, R = N.raccoon;
        if (dp > (C.biteRange ?? .85)) { this.moveTo(a, P.x, P.z, sp, dt); a.bite = Math.max(a.bite, .35); } // wind-up when it reaches the player
        else {
          a.f = angTo(a.x, a.z, P.x, P.z);
          if (a.bite <= 0 && a.stun <= 0) {
            a.bite = R.biteInterval; this.hurtPlayer(R.damage * a.dmgMul, a); this.pocketSteal(a);
            a.hits = (a.hits ?? 0) + 1; if (a.hits >= R.bites && P.hp > 0) this.flee(a); // pockets full: off into the forest
          }
        }
        return;
      }
    }
  }
  /** fainted (0 HP, Basti 21.11.2026): the worst case of the night. The harvest of the day is gone (also what animals carry and what
   *  lies on the ground) and every field is trampled. Returns the number of fields broken now. */
  applyKO() {
    const F = this.cfg.faint, s = this.s;
    // what the animals carry and what lies on the ground is gone (raccoons that already got away are counted in 'gone')
    for (const a of this.animals) { for (const [k, n] of Object.entries(a.carry)) this.lost[k] = (this.lost[k] ?? 0) + n; a.carry = {}; a.carryN = 0; }
    for (const l of this.loot) if (!l.fresh) this.lost[l.item] = (this.lost[l.item] ?? 0) + (l.n ?? 1);
    this.loot.length = 0;
    if (F.loseHarvest) for (const [k, v] of Object.entries(this.got)) {
      const n = Math.min(v - (this.taken[k] ?? 0), count(s, k)); if (n <= 0) continue;
      addItem(this.cfg, s, k, -n); this.lost[k] = (this.lost[k] ?? 0) + n;
    }
    this.taken = {};
    let n = 0;
    if (F.breakFields) for (const p of s.plots) if (p.open && !p.broken) { breakPlot(p); n++; }
    this.broken += n;
    return n;
  }

  // ---------------- animals ----------------
  /** a few animals spread over the day (hares) + one raccoon raid in the second half (one more raccoon per level) */
  private planSpawns() {
    const S = this.cfg.spawns, L = this.s.level - 1, gaps = this.hof.gaps.length;
    const types = Object.entries(S.wanderTypes) as [AnimalType, number][], tot = types.reduce((n, [, v]) => n + v, 0);
    const n = rint(S.wanderers);
    for (let i = 0; i < n; i++) { // 21.11.2026: they are already there in the morning, hopping around near the fields
      let r = Math.random() * tot, type = types[0][0]; for (const [k, v] of types) { r -= v; if (r <= 0) { type = k; break; } }
      this.plan.push({ at: rnd(0, 2), type, gap: this.hof.pickGap(), near: true });
    }
    if (!gaps) { this.plan.length = 0; return; }
    const at = this.length * rnd(S.raid.from, S.raid.to), gap = this.hof.pickGap(), m = Math.max(0, S.raid.raccoons + Math.floor(L * S.raid.perLevel));
    for (let i = 0; i < m; i++) this.plan.push({ at: at + i * .9, type: 'raccoon', gap });
    this.plan.sort((a, b) => a.at - b.at);
  }
  private waveSeen = new Set<number>();
  private updateSpawns() {
    while (this.plan.length && this.plan[0].at <= this.t) {
      const g = this.plan.shift()!;
      if (g.night) {
        const N = this.cfg.night, L = this.s.level - 1, hp = N[g.type].hp * (1 + this.cfg.spawns.scaling.hp * L);
        const w = g.wave ?? 0; if (!this.waveSeen.has(w)) { this.waveSeen.add(w); this.ev.push({ k: 'wave', n: w + 1 }); }
        this.spawn(g.type, g.gap, { night: true, shy: false, hp, maxHp: hp, hits: 0 });
        continue;
      }
      if (this.nightOn) continue; // day animals do not come at night
      if (g.near) { const h = this.nearField(); if (h) { const a = this.spawn(g.type, g.gap, { x: h.x, z: h.z, state: 'wander' }); a.home = h; a.idle = rnd(.5, 2); continue; } }
      this.spawn(g.type, g.gap);
    }
  }
  /** a free spot a few metres beside a random open field (home of a hare) */
  private nearField(): { x: number; z: number } | null {
    const open = this.s.plots.map((p, i) => p.open ? this.cfg.hof.plots[i] : null).filter(Boolean) as { x: number; z: number }[];
    if (!open.length) return null;
    for (let k = 0; k < 12; k++) {
      const p = open[Math.floor(Math.random() * open.length)], an = rnd(0, 7), r = rnd(2.5, 4.5);
      const c = this.hof.collide(p.x + Math.cos(an) * r, p.z + Math.sin(an) * r, .3, false);
      if (this.hof.ellipse(c.x, c.z) < .8 && this.s.plots.every((q, i) => !q.open || dist(c.x, c.z, this.cfg.hof.plots[i].x, this.cfg.hof.plots[i].z) > this.cfg.plots.size * .6)) return c;
    }
    const p = open[0]; return { x: p.x + 3, z: p.z };
  }
  /** a startled hare runs `run` m away from the player (staying on the farm) */
  private runAway(a: Animal) {
    const P = this.player, C = this.cfg.animals.hare, R = C.run ?? 15;
    let an = angTo(P.x, P.z, a.x, a.z);
    for (let k = 0; k < 9; k++) {
      const tr = an + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .45, x = a.x + Math.sin(tr) * R, z = a.z + Math.cos(tr) * R;
      if (this.hof.ellipse(x, z) < .8) { an = tr; break; }
    }
    let x = a.x + Math.sin(an) * R, z = a.z + Math.cos(an) * R;
    for (let k = 0; k < 6 && this.hof.ellipse(x, z) >= .8; k++) { x = (x + a.x) / 2; z = (z + a.z) / 2; }
    a.dest = { x, z }; a.state = 'run'; a.t = 0; a.scared = (a.scared ?? 0) + 1;
    this.ev.push({ k: 'startle', id: a.id, x: a.x, z: a.z });
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
      if (food > 0) opts.push({ t: { k: 'lager' }, w: 3 });
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
  /** next point to steer at on the way to (x, z): straight when the line is free, else along an A* route (re-planned
   *  when the goal moves, after getting stuck or every few seconds). null = no way (straight + collision as before) */
  private steer(a: Animal, x: number, z: number, dt: number): { x: number; z: number; end: boolean } | null {
    const N = this.nav; let R = a.route;
    if (R) R.t += dt;
    const replan = !R || Math.hypot(R.gx - x, R.gz - z) > .75 || R.t > 6 || (a.stuck > .4 && R.t > .5);
    if (replan) {
      if (N.free(x, z) && N.los(a.x, a.z, x, z)) R = a.route = { gx: x, gz: z, pts: [], t: 0, none: false };
      else if (this.navBudget > 0) { this.navBudget--; const p = N.path(a.x, a.z, x, z); R = a.route = { gx: x, gz: z, pts: p ?? [], t: 0, none: !p }; }
      else if (!R) return null; // too many searches this frame: keep going straight for one frame
    }
    if (!R || R.none) return null;
    // corner reached (or already in sight of the next one): on to the next
    while (R.pts.length > 1 && (dist(a.x, a.z, R.pts[0].x, R.pts[0].z) < .35 || N.los(a.x, a.z, R.pts[1].x, R.pts[1].z))) R.pts.shift();
    if (R.pts.length === 1 && dist(a.x, a.z, R.pts[0].x, R.pts[0].z) < .2) R.pts.shift();
    if (!R.pts.length) return { x, z, end: !N.free(x, z) };
    return { x: R.pts[0].x, z: R.pts[0].z, end: false };
  }
  /** searches allowed per frame (spreads the cost when many animals re-plan at once) */
  private navBudget = 0;
  get nav(): NavGrid { return navFor(this.hof); }
  /** move towards (x, z); ghost = through everything (scripted), pass = through obstacles only when no way is found */
  private moveTo(a: Animal, x: number, z: number, speed: number, dt: number, ghost = false, pass = false) {
    const d = dist(a.x, a.z, x, z); if (d < .05) return true;
    let tx = x, tz = z;
    if (!ghost) {
      const w = this.steer(a, x, z, dt);
      if (w) { tx = w.x; tz = w.z; a.detour = null; if (w.end && dist(a.x, a.z, x, z) < 1.4 && a.stuck > .25) return true; } // goal inside an obstacle (bush): as close as it gets
      else if (pass) ghost = true;
    }
    if (a.detour) { tx = a.detour.x; tz = a.detour.z; if (dist(a.x, a.z, tx, tz) < .5) a.detour = null; }
    const l = dist(a.x, a.z, tx, tz) || 1, st = Math.min(speed * dt, l);
    let nx = a.x + (tx - a.x) / l * st, nz = a.z + (tz - a.z) / l * st;
    if (!ghost) { const c = this.hof.collide(nx, nz, this.cfg.animals[a.type].radius, false); nx = c.x; nz = c.z; }
    const moved = dist(a.x, a.z, nx, nz);
    a.f = Math.atan2(nx - a.x, nz - a.z) || a.f; a.x = nx; a.z = nz;
    // stuck behind a building: go round via a point beside it
    if (moved < speed * dt * .3) { a.stuck += dt; if (a.stuck > .6 && !a.detour && (ghost || !a.route || a.route.none)) { const side = Math.random() < .5 ? 1 : -1, an = Math.atan2(tz - a.z, tx - a.x) + side * 1.4; a.detour = { x: a.x + Math.cos(an) * 3, z: a.z + Math.sin(an) * 3 }; a.stuck = 0; } }
    else a.stuck = 0;
    return d < .15;
  }
  private updateAnimals(dt: number) {
    const P = this.player; this.navBudget = this.nightOn ? 6 : 3; // more animals at night
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
      if (a.night && a.state !== 'flee') {
        const N = this.cfg.night[a.type];
        a.t += dt; this.nightAnimal(a, dt, N.speed * a.speedMul * slow, dp); continue;
      }
      // hares (21.11.2026): first time startled they run 15 m, the second time they leave the farm for a minute
      if (a.type === 'hare' && a.state === 'wander' && dp < C.scare) { if (!a.scared) this.runAway(a); else this.driveOff(a); continue; }
      // shy animals run as soon as the player comes close (that counts as driving them off)
      if (a.type !== 'hare' && a.state !== 'flee' && a.shy && dp < C.scare && a.state !== 'enter') { this.driveOff(a); continue; }
      a.t += dt;
      switch (a.state) {
        case 'enter': {
          const p = this.hof.gapIn(a.gap);
          if (this.moveTo(a, p.x, p.z, sp, dt, false, true) || this.hof.ellipse(a.x, a.z) < .9) {
            if (a.type === 'hare') { a.home = this.nearField() ?? { x: a.x, z: a.z }; a.dest = a.home; a.state = 'wander'; a.t = 0; break; }
            a.state = 'go'; a.target = this.pickTarget(a); a.t = 0;
          }
          break;
        }
        case 'run': {
          if (!a.dest || this.moveTo(a, a.dest.x, a.dest.z, fsp, dt) || a.t > 6) { a.home = { x: a.x, z: a.z }; a.dest = null; a.idle = rnd(1, 3); a.state = 'wander'; a.t = 0; }
          break;
        }
        case 'wander': case 'go': {
          if (a.type === 'hare') { // hops around its home, never eats or steals (21.11.2026)
            if (a.dest) { if (this.moveTo(a, a.dest.x, a.dest.z, sp * .55, dt) || a.t > 5) { a.dest = null; a.idle = rnd(1.5, 4); } }
            else if ((a.idle = (a.idle ?? 0) - dt) <= 0) { const h = a.home ?? { x: a.x, z: a.z }, an = rnd(0, 7), r = rnd(.8, 3); a.dest = { x: h.x + Math.cos(an) * r, z: h.z + Math.sin(an) * r }; a.t = 0; }
            break;
          }
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
          // 21.11.2026: runs the way round through the entrances (pathfinding); only without any way (or stuck for long) it slips through
          this.moveTo(a, target.x, target.z, fsp, dt, a.t > 12, true);
          if (this.hof.outside(a.x, a.z, a.gap)) {
            a.gone = true;
            for (const [k, n] of Object.entries(a.carry)) this.lost[k] = (this.lost[k] ?? 0) + n;
            this.ev.push({ k: 'gone', id: a.id, type: a.type, carry: a.carryN });
            if (a.type === 'hare' && this.spawns && !a.night && !this.nightOn) { const C2 = this.cfg.animals.hare; this.plan.push({ at: this.t + (C2.away ?? 60), type: 'hare', gap: a.gap }); this.plan.sort((p, q) => p.at - q.at); }
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
    if (t.k === 'lager') return Object.entries(s.items).some(([k, v]) => EDIBLE(k) && v > 0);
    if (t.k === 'bush') return (s.bush.phase === 'ripe' && s.bush.berries > 0) || (a.type === 'hare' && s.bush.phase === 'growing');
    if (t.k === 'plot') { const p = s.plots[t.i]; if (a.night) return p.open && !p.broken; return p.open && (p.stage === 'ripe' ? p.yieldLeft > 0 : a.type === 'hare' && p.stage === 'sown'); }
    return false;
  }
  private takeFrom(a: Animal, t: NonNullable<Animal['target']>) {
    const s = this.s, C = this.cfg.animals[a.type];
    const grab = (item: ItemId) => { if (a.type === 'raccoon') { a.carry[item] = (a.carry[item] ?? 0) + 1; a.carryN++; } else this.lost[item] = (this.lost[item] ?? 0) + 1; };
    if (t.k === 'lager') {
      const list = Object.entries(s.items).filter(([k, v]) => EDIBLE(k) && v > 0); if (!list.length) return;
      let r = Math.random() * list.reduce((n, [, v]) => n + v, 0), pick = list[0][0];
      for (const [k, v] of list) { r -= v; if (r <= 0) { pick = k; break; } }
      addItem(this.cfg, s, pick, -1); grab(pick);
      this.ev.push({ k: 'steal', id: a.id, item: pick, x: a.x, z: a.z, from: 'lager' });
    } else if (t.k === 'bush') {
      if (s.bush.phase === 'ripe' && s.bush.berries > 0) { s.bush.berries--; grab('blue'); this.ev.push({ k: a.type === 'raccoon' ? 'steal' : 'eat', id: a.id, item: 'blue', x: a.x, z: a.z, from: 'bush' }); }
      else if (a.type === 'hare' && s.bush.phase === 'growing') { s.bush.t = Math.max(0, s.bush.t - 4); this.ev.push({ k: 'eat', id: a.id, x: a.x, z: a.z, from: 'bush' }); }
    } else if (t.k === 'plot') {
      const p = s.plots[t.i];
      if (p.stage === 'ripe' && p.yieldLeft > 0) { if (++p.bites >= 2) { p.bites = 0; p.yieldLeft--; } grab(Object.keys(this.cfg.crops[p.crop ?? 'wheat']?.yield ?? { wheat: 1 })[0]); this.ev.push({ k: a.type === 'raccoon' ? 'steal' : 'eat', id: a.id, x: a.x, z: a.z, from: 'plot', i: t.i }); }
      else if (p.stage === 'sown') {
        p.bites++; this.ev.push({ k: 'eat', id: a.id, x: a.x, z: a.z, from: 'plot', i: t.i });
        if (p.bites >= (C.plotBites ?? 3)) { p.bites = 0; p.grow = Math.max(0, p.grow - (this.cfg.crops[p.crop ?? 'wheat']?.grow ?? 20) * .25); }
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
  /** save during the day: what is needed to go on from here */
  snapshot(): DaySnap {
    const P = this.player, c = <T>(o: T): T => JSON.parse(JSON.stringify(o));
    // goods a raccoon is carrying away count as dropped where it is (they lie on the ground after loading)
    const loot: DaySnap['loot'] = this.loot.map(l => ({ item: l.item, x: l.x, z: l.z, fresh: l.fresh, n: l.n }));
    for (const a of this.animals) if (!a.gone) for (const [k, n] of Object.entries(a.carry)) loot.push({ item: k, x: a.x, z: a.z, n });
    return {
      t: this.t, player: { x: P.x, z: P.z, f: P.f, hp: P.hp }, got: c(this.got), lost: c(this.lost), driven: this.driven, xpGained: this.xpGained,
      stalls: c(this.stalls), apples: [...this.apples], brambles: c(this.brambles),
      plan: c(this.plan), half: this.half, rain: c(this.rain), loot, taken: c(this.taken), broken: this.broken,
    };
  }
  restore(d: DaySnap) {
    this.t = Math.min(d.t, this.length + this.nightLen - 1);
    Object.assign(this.player, d.player); this.player.hp = Math.max(1, Math.min(this.player.maxHp, d.player.hp));
    this.got = d.got ?? {}; this.lost = d.lost ?? {}; this.driven = d.driven ?? 0; this.xpGained = d.xpGained ?? 0;
    for (const id of STALL_IDS) if (d.stalls?.[id]) this.stalls[id] = d.stalls[id];
    if (d.apples?.length === this.apples.length) this.apples = d.apples;
    if (d.brambles?.length === this.brambles.length) this.brambles = d.brambles;
    this.plan = d.plan ?? []; this.half = d.half ?? 0; this.rain = d.rain ?? null;
    for (const l of d.loot ?? []) this.loot.push({ id: this.nid++, item: l.item, x: l.x, z: l.z, y: 0, vx: 0, vz: 0, vy: 0, t: 99, fresh: l.fresh, n: l.n });
    this.taken = d.taken ?? {}; this.broken = d.broken ?? 0;
    // saved at night: the night goes on without a new warning (the animals that were on the farm are not kept, the waves still to come are)
    if (this.nightLen > 0 && this.t >= this.length) { this.startNight(false); for (let w = 0; w < this.waves.length; w++) if (this.waves[w] <= this.t) this.waveSeen.add(w); }
  }
  initRipe() { for (const p of this.s.plots) if (p.open && p.stage === 'ripe' && p.crop && p.yieldLeft <= 0) p.yieldLeft = ripeCuts(this.cfg, p); }
}
