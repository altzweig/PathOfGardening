// One playable day on the farm: player movement, timed actions (left click), fighting (right click),
// animals (raccoon, hare), loot, rain, clock. Works on the persistent FarmState; the view only reads.
import { ActionKind, AnimalType, FarmCfg, ItemId, Tool } from './config';
import { FarmState, addItem, count, gainXp } from './state';
import { Hof } from './hof';

export type Target = { k: 'bush' } | { k: 'plot'; i: number } | { k: 'well' };
export const sameTarget = (a: Target | null, b: Target | null) => !!a && !!b && a.k === b.k && (a.k !== 'plot' || a.i === (b as any).i);
export interface ActionInfo { kind: ActionKind; tool: Tool; dur: number; ok: boolean; why?: 'water' | 'seed' | 'well' }
export interface Intent {
  mx: number; mz: number;           // movement -1..1 (screen aligned = world x/z)
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
  state: AnimalState; target: Target | { k: 'basket' } | null; gap: number; t: number; act: number;
  carry: Record<ItemId, number>; carryN: number; stun: number; freeze: number; flash: number; bite: number;
  shy: boolean; brave: boolean; driven: boolean; gone: boolean; speedMul: number; dmgMul: number;
  stuck: number; lx: number; lz: number; detour: { x: number; z: number } | null;
  /** tutorial: walks a fixed list of points, no AI */
  path?: { x: number; z: number; speed: number }[];
}
export interface Pellet { x: number; z: number; vx: number; vz: number; life: number; dmg: number; freeze: number; ammo: ItemId }
export interface Loot { id: number; item: ItemId; x: number; z: number; y: number; vx: number; vz: number; vy: number; t: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
/** distance from point (px, pz) to the segment a-b */
function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
const angTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az); // three.js yaw (0 = +z)
/** goods animals take from the basket (not straw) */
const EDIBLE = (id: ItemId) => id !== 'straw' && id !== 'plank';

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
  private plan: { at: number; n: number; gap: number }[] = [];
  private nid = 1;
  private bushT = 0;

  constructor(public cfg: FarmCfg, public s: FarmState, public hof: Hof, o: { tutorial?: boolean } = {}) {
    this.length = cfg.day.length;
    const P = cfg.player, d = cfg.hof.door;
    this.player = { x: d.x, z: d.z + .4, f: 0, hp: P.hp, maxHp: P.hp, walk: 0, speed: 0, action: null, goal: null, swing: null, shotT: 0, cd: 0, hurt: 0, stun: 0 };
    if (o.tutorial) { this.clockRuns = false; this.spawns = false; }
    else { this.planSpawns(); if (Math.random() < cfg.day.rain.chance) { const [a, b] = cfg.day.rain.duration; this.rain = { at: rnd(.15, .7) * this.length, dur: rnd(a, b), t: 0 }; } }
  }

  // ---------------- clock ----------------
  /** 0..1 of the day */
  get k() { return Math.min(1, this.t / this.length); }

  // ---------------- targets + actions ----------------
  targetPos(t: Target | { k: 'basket' }): { x: number; z: number } {
    const H = this.cfg.hof;
    if (t.k === 'bush') return H.bush; if (t.k === 'basket') return H.basket;
    if (t.k === 'well') return H.buildings.well;
    return H.plots[t.i];
  }
  /** distance from (x, z) to the edge of a target (plots are squares) */
  targetDist(t: Target, x: number, z: number) {
    if (t.k === 'plot') { const p = this.cfg.hof.plots[t.i], h = this.cfg.plots.size / 2; return Math.hypot(Math.max(0, Math.abs(x - p.x) - h), Math.max(0, Math.abs(z - p.z) - h)); }
    const p = this.targetPos(t); return Math.max(0, dist(x, z, p.x, p.z) - (t.k === 'well' ? (this.cfg.hof.buildings.well.r ?? 1) : .4));
  }
  /** what a left click on the target would do right now (null = nothing to do there) */
  actionFor(t: Target): ActionInfo | null {
    const A = this.cfg.actions, s = this.s, water = s.water > 0;
    if (t.k === 'bush') {
      const b = s.bush;
      if (b.phase === 'dry') return { kind: 'water', tool: 'can', dur: A.water, ok: water, why: water ? undefined : 'water' };
      if (b.phase === 'ripe' && b.berries > 0) return { kind: 'harvestBush', tool: 'hands', dur: this.cfg.bush.pickInterval, ok: true };
      return null;
    }
    if (t.k === 'well') {
      if (!s.buildings.well.built) return { kind: 'refill', tool: 'can', dur: A.refill, ok: false, why: 'well' };
      return s.water < this.cfg.can.capacity ? { kind: 'refill', tool: 'can', dur: A.refill, ok: true } : null;
    }
    const p = s.plots[t.i]; if (!p?.open) return null;
    if (p.stage === 'empty') return { kind: 'rake', tool: 'rake', dur: A.rake, ok: true };
    if (p.stage === 'raked') { const seed = this.cfg.crops.wheat.seed, has = count(s, seed) > 0; return { kind: 'sow', tool: 'seed', dur: A.sow, ok: has, why: has ? undefined : 'seed' }; }
    if (p.stage === 'sown' && !p.watered) return { kind: 'water', tool: 'can', dur: A.water, ok: water, why: water ? undefined : 'water' };
    if (p.stage === 'ripe') return { kind: 'harvestPlot', tool: 'sickle', dur: A.harvestPlot, ok: true };
    return null;
  }
  /** every clickable spot on the farm */
  targets(): Target[] {
    const out: Target[] = [{ k: 'bush' }, { k: 'well' }];
    this.s.plots.forEach((p, i) => { if (p.open) out.push({ k: 'plot', i }); });
    return out;
  }
  /** target under a ground point (mouse) */
  targetAt(x: number, z: number): Target | null {
    const H = this.cfg.hof, h = this.cfg.plots.size / 2 + .1;
    if (dist(x, z, H.bush.x, H.bush.z) < .95) return { k: 'bush' };
    const w = H.buildings.well; if (dist(x, z, w.x, w.z) < (w.r ?? 1) + .35) return { k: 'well' };
    for (let i = 0; i < H.plots.length; i++) { const p = H.plots[i]; if (this.s.plots[i].open && Math.abs(x - p.x) < h && Math.abs(z - p.z) < h) return { k: 'plot', i }; }
    return null;
  }
  /** nearest target with something to do (touch action button) */
  nearestTarget(range: number): Target | null {
    const P = this.player; let best: Target | null = null, bd = range, bestOk = false;
    for (const t of this.targets()) {
      const a = this.actionFor(t); if (!a) continue;
      const d = this.targetDist(t, P.x, P.z);
      if (d > range) continue;
      if ((a.ok && !bestOk) || (a.ok === bestOk && d < bd)) { best = t; bd = d; bestOk = a.ok; }
    }
    return best;
  }

  // ---------------- update ----------------
  update(dt: number, it: Intent) {
    this.ev.length = 0;
    if (this.paused || this.finished) return;
    if (this.clockRuns) this.t += dt;
    this.updateRain(dt);
    this.updateBush(dt);
    this.updatePlayer(dt, this.inputLocked ? { ...it, mx: 0, mz: 0, act: null, attack: false } : it);
    this.updatePellets(dt);
    this.updateAnimals(dt);
    this.updateLoot(dt);
    if (this.spawns) this.updateSpawns();
    if (this.clockRuns && this.t >= this.length) this.finished = 'time';
    if (this.player.hp <= 0 && !this.finished) { this.finished = 'faint'; this.ev.push({ k: 'faint' }); }
  }

  private updateRain(dt: number) {
    const R = this.rain; if (!R) return;
    const on = this.t >= R.at && this.t < R.at + R.dur;
    if (on !== this.raining) { this.raining = on; this.ev.push({ k: 'rain', on }); }
    if (on) {
      for (const p of this.s.plots) if (p.open && p.stage === 'sown') p.watered = true;
      if (this.s.bush.phase === 'dry') { this.s.bush.phase = 'growing'; this.s.bush.t = 0; }
    }
  }
  private updateBush(dt: number) {
    const b = this.s.bush;
    if (b.phase === 'growing') {
      b.t += dt * (this.ripenMul ?? 1);
      if (b.t >= this.cfg.bush.ripen) { b.phase = 'ripe'; b.berries = this.cfg.bush.berries; b.picked = 0; this.ev.push({ k: 'ripe' }); }
    }
    if (b.phase === 'ripe' && b.berries <= 0) { b.phase = 'empty'; this.ev.push({ k: 'bushEmpty' }); }
    void this.bushT;
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
    // --- running action
    if (P.action) {
      const A = P.action, tp = this.targetPos(A.target); P.f = angTo(P.x, P.z, tp.x, tp.z);
      A.t += dt;
      if (A.info.kind === 'harvestBush') {
        if (A.t >= A.info.dur) { A.t -= A.info.dur; this.pickBerry(); }
        if (this.s.bush.phase !== 'ripe') { P.action = null; this.ev.push({ k: 'actDone', kind: 'harvestBush' }); }
      } else if (A.t >= A.info.dur) { P.action = null; this.finishAction(A.target, A.info); }
    }
    // --- swing
    if (P.swing) {
      const W = this.cfg.weapons.rake; P.swing.t += dt;
      if (!P.swing.hit && P.swing.t >= W.swing * .5) { P.swing.hit = true; this.rakeHit(P.swing.dir); }
      if (P.swing.t >= W.swing + .12) P.swing = null;
    }
    P.shotT = Math.max(0, P.shotT - dt);
  }
  startAction(t: Target, a: ActionInfo) {
    const P = this.player; P.goal = null;
    if (a.kind === 'water' && this.s.water <= 0) return;
    P.action = { target: t, info: a, t: 0, pick: 0 };
    this.ev.push({ k: 'act', kind: a.kind, tool: a.tool, target: t });
  }
  cancelAction() { const P = this.player; if (P.action) this.ev.push({ k: 'actCancel', kind: P.action.info.kind }); P.action = null; }
  private finishAction(t: Target, a: ActionInfo) {
    const s = this.s;
    if (a.kind === 'water') {
      s.water = Math.max(0, s.water - 1);
      if (t.k === 'bush' && s.bush.phase === 'dry') { s.bush.phase = 'growing'; s.bush.t = 0; }
      if (t.k === 'plot') s.plots[t.i].watered = true;
    } else if (a.kind === 'rake' && t.k === 'plot') s.plots[t.i].stage = 'raked';
    else if (a.kind === 'sow' && t.k === 'plot') {
      const crop = 'wheat', C = this.cfg.crops[crop];
      if (count(s, C.seed) <= 0) return;
      addItem(this.cfg, s, C.seed, -1);
      Object.assign(s.plots[t.i], { stage: 'sown', crop, days: 0, watered: false, bites: 0 });
    } else if (a.kind === 'harvestPlot' && t.k === 'plot') {
      const p = s.plots[t.i], C = this.cfg.crops[p.crop ?? 'wheat'];
      for (const [k, v] of Object.entries(C.yield)) { const n = k === C.seed ? p.yieldLeft : v; this.store(k, n); }
      Object.assign(p, { stage: 'empty', crop: null, days: 0, watered: false, bites: 0, yieldLeft: 0 });
    } else if (a.kind === 'refill') s.water = this.cfg.can.capacity;
    this.ev.push({ k: 'actDone', kind: a.kind, target: t });
  }
  private pickBerry() {
    const b = this.s.bush; if (b.phase !== 'ripe' || b.berries <= 0) return;
    b.berries--; b.picked++; this.store('blue', 1);
    this.ev.push({ k: 'berry', x: this.cfg.hof.bush.x, z: this.cfg.hof.bush.z });
  }
  /** harvest goes straight into the basket at the Lager */
  store(item: ItemId, n: number) {
    if (n <= 0) return; addItem(this.cfg, this.s, item, n);
    this.got[item] = (this.got[item] ?? 0) + n;
    this.ev.push({ k: 'store', item, n });
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
      if (l.t > .5 && d < C.pickupRadius) { this.loot.splice(i, 1); addItem(this.cfg, this.s, l.item, 1); this.lost[l.item] = Math.max(0, (this.lost[l.item] ?? 0) - 1); this.ev.push({ k: 'pickup', item: l.item, x: l.x, z: l.z }); }
    }
  }

  // ---------------- animals ----------------
  private planSpawns() {
    const S = this.cfg.spawns, L = this.s.level - 1;
    const groups = Math.max(1, Math.floor(S.groups + L * S.groupsPerLevel));
    const t0 = S.firstAfter, t1 = this.length - S.lastBefore;
    for (let i = 0; i < groups; i++) {
      const at = t0 + (t1 - t0) * (i + rnd(.1, .9)) / groups;
      const max = S.size[1] + Math.floor(L * S.sizePerLevel), n = S.size[0] + Math.floor(Math.random() * (max - S.size[0] + 1));
      this.plan.push({ at, n, gap: Math.floor(Math.random() * this.hof.gaps.length) });
    }
  }
  private updateSpawns() {
    while (this.plan.length && this.plan[0].at <= this.t) {
      const g = this.plan.shift()!;
      const W = this.cfg.spawns.types, tot = W.raccoon + W.hare;
      if (g.n > 1) { this.plan.unshift({ at: this.t + .9, n: g.n - 1, gap: g.gap }); this.plan.sort((a, b) => a.at - b.at); }
      this.spawn(Math.random() * tot < W.raccoon ? 'raccoon' : 'hare', g.gap);
    }
  }
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
      if (food > 0) opts.push({ t: { k: 'basket' }, w: 3 });
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
    if (t.k === 'basket') return Object.entries(s.items).some(([k, v]) => EDIBLE(k) && v > 0);
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
      if (p.stage === 'ripe' && p.yieldLeft > 0) { p.yieldLeft--; grab(this.cfg.crops[p.crop ?? 'wheat'].seed); this.ev.push({ k: a.type === 'raccoon' ? 'steal' : 'eat', id: a.id, x: a.x, z: a.z, from: 'plot', i: t.i }); }
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
  initRipe() { for (const p of this.s.plots) if (p.open && p.stage === 'ripe' && p.crop && p.yieldLeft <= 0 && !p.bites) p.yieldLeft = this.cfg.crops[p.crop].yield[this.cfg.crops[p.crop].seed] ?? 0; }
  /** faint: watered plots are dry again */
  applyFaint() { if (this.cfg.faint.dryFields) for (const p of this.s.plots) p.watered = false; }
}
