// Mehlsäcke (26.11.2026, Basti): a barrier of three flour sacks stacked on top of each other along ONE free side of a tile
// (a sack is exactly as long as a field side). Only on tile edges whose other side is not built (garden border); a tile built
// on the other side later makes the sacks there disappear. Pure geometry, shared by the simulation and the view (aim preview).
import type { Balancing } from '../config';
import { cornerAngle, hexR, slotAt, type Slot } from './sim';

/** one tile edge: built slot a, neighbour slot b (-1 = outside the grid), corners, midpoint, angle of the edge line (atan2 dx, dz) */
export interface Edge { a: number; b: number; k: number; x1: number; z1: number; x2: number; z2: number; mx: number; mz: number; ang: number }

/** edge k of slot a (between corner k and corner k+1) */
export function edgeOf(cfg: Balancing, slots: Slot[], a: number, k: number): Edge {
  const s = slots[a], H = hexR(cfg), c1 = cornerAngle(k), c2 = cornerAngle(k + 1);
  const x1 = s.x + Math.cos(c1) * H, z1 = s.z + Math.sin(c1) * H, x2 = s.x + Math.cos(c2) * H, z2 = s.z + Math.sin(c2) * H;
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  const nb = slotAt(cfg, slots, s.x + (mx - s.x) * 2, s.z + (mz - s.z) * 2);
  return { a, b: nb >= 0 && !slots[nb].forest ? nb : -1, k, x1, z1, x2, z2, mx, mz, ang: Math.atan2(x2 - x1, z2 - z1) };
}
/** the same edge seen from both tiles has the same key (midpoint in cm) */
export const edgeKey = (mx: number, mz: number) => `${Math.round(mx * 100)}|${Math.round(mz * 100)}`;

/** every edge of a built tile (field, building, chest, Werkbank) whose other side is free */
export function freeEdges(cfg: Balancing, slots: Slot[], built: (slot: number) => boolean): Edge[] {
  const out: Edge[] = [];
  for (let a = 0; a < slots.length; a++) {
    if (slots[a].forest || !built(a)) continue;
    for (let k = 0; k < 6; k++) { const e = edgeOf(cfg, slots, a, k); if (e.b < 0 || !built(e.b)) out.push(e); }
  }
  return out;
}

/** distance of a point to a segment and the closest point */
export function segDist(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): [number, number, number, number] {
  const sx = x2 - x1, sz = z2 - z1, L2 = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, ((px - x1) * sx + (pz - z1) * sz) / L2));
  const cx = x1 + sx * t, cz = z1 + sz * t; return [Math.hypot(px - cx, pz - cz), cx, cz, t];
}

/** where a player at (x, z) looking along (dx, dz) would put sacks: the free edge without sacks closest to a point just in front of him,
 *  within reach m of him (null = nowhere) */
export function sackSpot(cfg: Balancing, slots: Slot[], built: (slot: number) => boolean, taken: Set<string>, x: number, z: number, dx: number, dz: number): Edge | null {
  const S = cfg.skills.sack; if (!S) return null;
  const tx = x + dx * S.reach * .5, tz = z + dz * S.reach * .5;
  let best: Edge | null = null, bd = 1e9;
  for (const e of freeEdges(cfg, slots, built)) {
    if (taken.has(edgeKey(e.mx, e.mz))) continue;
    const [d] = segDist(x, z, e.x1, e.z1, e.x2, e.z2); if (d > S.reach) continue;
    const [dt] = segDist(tx, tz, e.x1, e.z1, e.x2, e.z2), sc = dt + d * .3;
    if (sc < bd) { bd = sc; best = e; }
  }
  return best;
}
