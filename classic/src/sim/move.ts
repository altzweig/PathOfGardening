// Player movement as plain functions (25.11.2026, Koop-Netcode): the simulation and the co-op guest's prediction of its
// own figure run exactly the same code, so a guest's figure moves at once and the host's answer later matches.
import type { Balancing } from '../config';
import type { Intent } from './snap';

/** the part of a player the movement touches */
export interface MoveState { x: number; z: number; face: number; walk: number; sta: number; staT: number; staX: boolean; sprint: boolean }
/** what the movement needs from the rest of the game: stun factor 0..1 (1 = free), knocked back (the sim moves it), arena */
export interface MoveCtx { sf: number; kb: boolean; chest: boolean; sb: { W: number; D: number } | null; /** 25.11.2026 Werkbank: solid circle (x, z, radius) */ bench?: { x: number; z: number; r: number } | null }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** stamina of the sprint (Shift): sprint.duration s full -> empty, regenerates after regenDelay, drained = locked until exhausted */
export function sprintStep(cfg: Balancing, p: MoveState, want: boolean, moving: boolean, dt: number) {
  const S = cfg.player.sprint;
  if (S) {
    if (p.staX && p.sta >= S.exhausted - 1e-6) p.staX = false;
    p.sprint = want && moving && !p.staX && p.sta > 0;
    if (p.sprint) {
      p.sta = Math.max(0, p.sta - dt / S.duration); p.staT = S.regenDelay;
      if (p.sta <= 0) { p.staX = true; p.sprint = false; }
    } else if ((p.staT -= dt) <= 0) p.sta = Math.min(1, p.sta + dt / S.regen);
  } else p.sprint = false;
}
/** walking by the intent (not while knocked back: the sim moves the player then) */
export function walkStep(cfg: Balancing, p: MoveState, it: Intent, mx: number, mz: number, ml: number, sf: number, dt: number) {
  const P = cfg.player;
  if (ml > .05 && sf > 0) { const sp = P.speed * (p.sprint ? P.sprint!.speed : 1); p.x += mx * sp * sf * dt; p.z += mz * sp * sf * dt; p.walk += dt * sf * 10 * Math.min(1, ml) * (p.sprint ? P.sprint!.speed : 1); if (!it.aim) p.face = Math.atan2(mx, mz); } // 27.11.2026: also while firing (touch shoots where the player looks)
}
export function clampArena(cfg: Balancing, sb: MoveCtx['sb'], x: number, z: number): [number, number] {
  if (sb) return [clamp(x, -sb.W, sb.W), clamp(z, -sb.D, sb.D)];
  const R = cfg.arena.radius, r = Math.hypot(x, z); return r > R ? [x * R / r, z * R / r] : [x, z];
}
/** the chest in the centre is solid */
export function chestPush(p: { x: number; z: number }) {
  const d = Math.hypot(p.x, p.z), R = .75;
  if (d < R) { const k = d > 1e-3 ? R / d : 0; p.x = d > 1e-3 ? p.x * k : 0; p.z = d > 1e-3 ? p.z * k : R; }
}
/** 25.11.2026 the Werkbank is solid like the chest (circle of radius r, player radius included) */
export function benchPush(p: { x: number; z: number }, b: { x: number; z: number; r: number }) {
  const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
  if (d < b.r) { if (d > 1e-3) { p.x = b.x + dx * b.r / d; p.z = b.z + dz * b.r / d; } else p.z = b.z + b.r; }
}
export const normMove = (it: Intent): [number, number, number] => { let mx = it.mx, mz = it.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; } return [mx, mz, ml]; };

/** one step of the guest's own figure, the same order as Sim.updatePlayer (sprint, walk, arena, chest) */
export function predictStep(cfg: Balancing, p: MoveState, it: Intent, dt: number, c: MoveCtx) {
  const [mx, mz, ml] = normMove(it);
  sprintStep(cfg, p, !!it.sprint, ml > .05 && c.sf > 0 && !c.kb, dt);
  if (!c.kb) walkStep(cfg, p, it, mx, mz, ml, c.sf, dt);
  [p.x, p.z] = clampArena(cfg, c.sb, p.x, p.z);
  if (c.chest) chestPush(p);
  if (c.bench) benchPush(p, c.bench);
}
