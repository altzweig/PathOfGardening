// Co-op visits (22.11.2026): what the farm owner sends to the guests and how a guest shows it.
// Fast snapshots (20/s): farmers, animals, pellets, loot, events. Slow state (4/s + on every change of phase): the whole
// farm (FarmState) + the data of the running day. A guest runs no simulation of its own: it shows the owner's farm and only
// moves its own farmer ahead locally (the owner follows that position, so walking never feels delayed).
import type { FarmCfg } from './config';
import type { FarmState } from './state';
import { DaySim, Ev, Intent, Player, Target, emptyIntent } from './sim';

/** numbers with 3 decimals: keeps the messages small */
const pack = (o: unknown) => JSON.stringify(o, (_k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);

let seq = 0;
export function snapOf(sim: DaySim, ev: Ev[]): string {
  return pack({
    q: ++seq, t: sim.t, n: sim.nightOn, wv: sim.nightOn ? sim.waves : undefined, r: sim.raining,
    pl: sim.players,
    an: sim.animals.map(a => ({ ...a, route: undefined, path: undefined })),
    pe: sim.pellets, lo: sim.loot, ev,
  });
}
export type Phase = 'day' | 'evening';
export function stateOf(sim: DaySim | null, s: FarmState, ph: Phase): string {
  return pack({ ph, s, d: sim ? { got: sim.got, lost: sim.lost, stalls: sim.stalls, apples: sim.apples, brambles: sim.brambles, rain: sim.rain, broken: sim.broken, driven: sim.driven } : null });
}

// ---------------- guest side ----------------
/** where the guest shows a farmer / an animal is heading (it glides there between two snapshots) */
const goalOf = new WeakMap<object, { x: number; z: number }>();
/** take over the owner's farm state in place (the view, HUD and book keep their reference to the same object) */
export function applyState(sim: DaySim | null, s: FarmState, d: { s: FarmState; d: any }) {
  for (const k of Object.keys(s) as (keyof FarmState)[]) if (!(k in d.s)) delete (s as any)[k];
  Object.assign(s, d.s);
  if (sim && d.d) Object.assign(sim, { got: d.d.got, lost: d.d.lost, stalls: d.d.stalls, apples: d.d.apples, brambles: d.d.brambles, rain: d.d.rain, broken: d.d.broken, driven: d.d.driven });
}
/** a fast snapshot: farmers + animals glide to their new spots, the own farmer keeps its own position while it walks */
let lastSeq = 0;
/** a new visit: snapshots count from the start again */
export function resetSnapSeq() { lastSeq = 0; }
export function applySnap(sim: DaySim, d: any, steering: boolean): Ev[] {
  // the fast connection is unordered: an older snapshot that arrives late only brings its events
  if (d.q !== undefined) { if (d.q <= lastSeq && lastSeq - d.q < 1000) return d.ev as Ev[]; lastSeq = d.q; }
  sim.t = d.t; sim.raining = d.r;
  if (d.n && !sim.nightOn) sim.nightOn = true;
  if (d.wv) sim.waves = d.wv; // the host planned the night (waves follow the average level)
  if (!d.n) sim.nightOn = false;
  const ids = new Set<number>();
  for (const p of d.pl as Player[]) {
    ids.add(p.id);
    let P = sim.byId(p.id);
    if (!P) { P = { ...p }; sim.players.push(P); goalOf.set(P, { x: p.x, z: p.z }); continue; }
    const mine = p.id === sim.localId, keep = mine && steering && p.hp > 0 && p.ko <= 0 ? { x: P.x, z: P.z, f: P.f, walk: P.walk, speed: P.speed } : null;
    const x = P.x, z = P.z;
    Object.assign(P, p);
    if (keep) Object.assign(P, keep);
    else {
      P.x = x; P.z = z; goalOf.set(P, { x: p.x, z: p.z });
      if (Math.hypot(p.x - x, p.z - z) > 4) { P.x = p.x; P.z = p.z; } // far off (got up at the house): jump
    }
  }
  sim.players = sim.players.filter(P => ids.has(P.id));
  const old = new Map(sim.animals.map(a => [a.id, a]));
  sim.animals = (d.an as DaySim['animals']).map(a => {
    const o = old.get(a.id); if (!o) { goalOf.set(a, { x: a.x, z: a.z }); return a; }
    const x = o.x, z = o.z; Object.assign(o, a); o.x = x; o.z = z; goalOf.set(o, { x: a.x, z: a.z }); return o;
  });
  sim.pellets = d.pe; sim.loot = d.lo;
  return d.ev as Ev[];
}
/** between snapshots: glide towards the last known spots, running work bars go on */
export function smooth(sim: DaySim, dt: number) {
  const k = 1 - Math.exp(-dt * 14);
  for (const P of sim.players) {
    if (P.action) P.action.t = Math.min(P.action.info.dur, P.action.t + dt);
    const g = goalOf.get(P); if (!g) continue;
    P.x += (g.x - P.x) * k; P.z += (g.z - P.z) * k;
  }
  for (const a of sim.animals) { const g = goalOf.get(a); if (g) { a.x += (g.x - a.x) * k; a.z += (g.z - a.z) * k; } }
  for (const p of sim.pellets) { p.x += p.vx * dt; p.z += p.vz * dt; }
}
/** the guest walks its own farmer right away (same rules as the owner's simulation: speed, crouch, collisions) */
export function predict(sim: DaySim, it: Intent, dt: number) {
  const P = sim.player, C = sim.cfg.player;
  if (!sim.up(P) || P.swing) return;
  const l = Math.hypot(it.mx, it.mz); if (l <= .15) return;
  const base = P.crouch ? C.crouchSpeed : P.action ? C.actionSpeed : C.speed;
  const sp = base * Math.min(1, l) * (P.stun > 0 ? 1 - P.stun / C.hurtStun * .7 : 1);
  const c = sim.hof.collide(P.x + it.mx / l * sp * dt, P.z + it.mz / l * sp * dt, C.radius, true);
  P.speed = Math.hypot(c.x - P.x, c.z - P.z) / dt; P.x = c.x; P.z = c.z;
  if (!P.action) P.f = Math.atan2(it.mx, it.mz);
  P.walk += P.speed * dt * (P.crouch ? 3.4 : 2.1);
  goalOf.set(P, { x: P.x, z: P.z });
}

// ---------------- owner side ----------------
const KINDS = new Set<Target['k']>(['bush', 'well', 'plot', 'bld', 'stall', 'tree', 'bramble', 'forage', 'weed']);
const num = (v: unknown, a: number, b: number, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
function cleanTarget(t: any): Target | null {
  if (!t || typeof t !== 'object' || !KINDS.has(t.k)) return null;
  const o: any = { k: t.k };
  if (t.i !== undefined) o.i = Math.floor(num(t.i, 0, 999));
  if (t.id !== undefined) o.id = typeof t.id === 'number' ? Math.floor(num(t.id, 0, 1e9)) : String(t.id).slice(0, 24);
  return o as Target;
}
/** whatever a guest sends: only sane values reach the simulation (the simulation checks reach, time and rules itself) */
export function cleanIntent(o: any): Intent {
  const it = emptyIntent(); if (!o || typeof o !== 'object') return it;
  it.mx = num(o.mx, -1, 1); it.mz = num(o.mz, -1, 1);
  it.aimX = num(o.aimX, -500, 500); it.aimZ = num(o.aimZ, -500, 500); it.aimAuto = !!o.aimAuto;
  it.act = cleanTarget(o.act); it.hold = !!o.hold; it.holdAt = cleanTarget(o.holdAt); it.up = !!o.up; it.attack = !!o.attack;
  if (o.face !== undefined) it.face = num(o.face, -10, 10);
  if (typeof o.seed === 'string') it.seed = o.seed.slice(0, 24);
  if (o.px !== undefined && o.pz !== undefined) { it.px = num(o.px, -500, 500); it.pz = num(o.pz, -500, 500); }
  return it;
}
/** a short fingerprint of the balancing + world: owner and guest must play the same version */
export function versionOf(cfg: FarmCfg) {
  const t = JSON.stringify(cfg); let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
