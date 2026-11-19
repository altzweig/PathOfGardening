// Farm geometry shared by simulation and view: building footprints (collision), forest edge, gaps, entry/exit points.
import { BuildingId, FarmCfg, RectCfg, rotY } from './config';

export interface Obb { kind: 'box'; x: number; z: number; hw: number; hd: number; c: number; s: number; id?: string }
export interface Circ { kind: 'circle'; x: number; z: number; r: number; id?: string }
export type Obstacle = Obb | Circ;

export function obstacleOf(r: RectCfg, id?: string, pad = 0): Obstacle {
  if (r.r !== undefined) return { kind: 'circle', x: r.x, z: r.z, r: r.r + pad, id };
  const a = rotY(r.rot); // rotation.y; local->world: x' = x cos a + z sin a, z' = -x sin a + z cos a
  return { kind: 'box', x: r.x, z: r.z, hw: (r.w ?? 1) / 2 + pad, hd: (r.d ?? 1) / 2 + pad, c: Math.cos(a), s: Math.sin(a), id };
}
/** world -> local of a box */
export function toLocal(o: Obb, x: number, z: number) { const dx = x - o.x, dz = z - o.z; return { lx: dx * o.c - dz * o.s, lz: dx * o.s + dz * o.c }; }
export function toWorld(o: Obb, lx: number, lz: number) { return { x: o.x + lx * o.c + lz * o.s, z: o.z - lx * o.s + lz * o.c }; }

/** push a circle (x, z, r) out of an obstacle; returns the corrected position or null when not touching */
export function pushOut(o: Obstacle, x: number, z: number, r: number): { x: number; z: number } | null {
  if (o.kind === 'circle') {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
    if (d >= m) return null;
    const k = d < 1e-4 ? 1 : m / d; return d < 1e-4 ? { x: o.x + m, z: o.z } : { x: o.x + dx * k, z: o.z + dz * k };
  }
  const { lx, lz } = toLocal(o, x, z);
  const cx = Math.max(-o.hw, Math.min(o.hw, lx)), cz = Math.max(-o.hd, Math.min(o.hd, lz));
  const dx = lx - cx, dz = lz - cz, d = Math.hypot(dx, dz);
  if (d >= r) return null;
  let nx: number, nz: number;
  if (d > 1e-4) { nx = cx + dx / d * r; nz = cz + dz / d * r; }
  else { // centre inside the box: out through the nearest side
    const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
    if (px < pz) { nx = Math.sign(lx || 1) * (o.hw + r); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (o.hd + r); }
  }
  return toWorld(o, nx, nz);
}

/** small seeded random generator: the same layout on every start */
export function seeded(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export class Hof {
  obstacles: Obstacle[] = [];
  gaps: { a: number; x: number; z: number }[] = [];
  /** wild bramble bushes along the forest edge */
  brambles: { x: number; z: number }[] = [];
  rx: number; rz: number;
  constructor(public cfg: FarmCfg) {
    const H = cfg.hof; this.rx = H.clearing.rx; this.rz = H.clearing.rz;
    for (const [id, r] of Object.entries(H.buildings) as [BuildingId, RectCfg][]) this.obstacles.push(obstacleOf(r, id));
    for (const t of H.trees) this.obstacles.push({ kind: 'circle', x: t.x, z: t.z, r: .45, id: 'tree' });
    this.obstacles.push({ kind: 'circle', x: H.bush.x, z: H.bush.z, r: cfg.bush.radius ?? .8, id: 'bush' });
    this.gaps = H.gaps.map(d => { const a = d * Math.PI / 180, e = this.edge(a); return { a, x: e.x, z: e.z }; });
    // brambles: evenly around the edge (seeded jitter), never in a gap
    const rnd = seeded(7), n = cfg.wild?.brambles?.count ?? 0;
    for (let i = 0, tries = 0; this.brambles.length < n && tries < n * 30; tries++, i++) {
      const a = (i + rnd() * .6) / n * Math.PI * 2 + .3, e = this.edge(a, .9 + rnd() * .04);
      if (this.inGap(e.x, e.z, 2) || !this.freeSpot(e.x, e.z, 1)) continue;
      this.brambles.push(e);
    }
    for (const b of this.brambles) this.obstacles.push({ kind: 'circle', x: b.x, z: b.z, r: .6, id: 'bramble' });
  }
  /** no building, tree, bush or plot here (pad = extra distance) */
  freeSpot(x: number, z: number, pad = 0) {
    const h = this.cfg.plots.size / 2 + .2;
    for (const p of this.cfg.hof.plots) if (Math.hypot(x - p.x, z - p.z) < h + pad) return false;
    for (const o of this.obstacles) {
      if (o.kind === 'circle') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return false; }
      else { const { lx, lz } = toLocal(o, x, z); if (Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad) return false; }
    }
    return Math.hypot(x - this.cfg.hof.door.x, z - this.cfg.hof.door.z) > 1.2 + pad;
  }
  /** obstacle of a building (for distances to its walls / fence) */
  building(id: BuildingId) { return this.obstacles.find(o => o.id === id) ?? null; }
  /** distance from a point to the outside of an obstacle */
  distTo(o: Obstacle, x: number, z: number) {
    if (o.kind === 'circle') return Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r);
    const { lx, lz } = toLocal(o, x, z); return Math.hypot(Math.max(0, Math.abs(lx) - o.hw), Math.max(0, Math.abs(lz) - o.hd));
  }
  /** point on the clearing edge in direction a */
  edge(a: number, k = 1) { return { x: Math.cos(a) * this.rx * k, z: Math.sin(a) * this.rz * k }; }
  /** 0 = centre, 1 = forest edge */
  ellipse(x: number, z: number) { return Math.hypot(x / this.rx, z / this.rz); }
  /** inside a gap corridor (animals come and go here) */
  inGap(x: number, z: number, pad = 0) {
    const r = Math.hypot(x, z);
    return this.gaps.some(g => { const along = x * Math.cos(g.a) + z * Math.sin(g.a), side = Math.abs(-x * Math.sin(g.a) + z * Math.cos(g.a));
      return along > r * .5 && side < this.cfg.hof.gapWidth / 2 + pad + Math.max(0, this.ellipse(x, z) - 1) * 3; });
  }
  /** spawn point outside the forest in gap g, and the point just inside the clearing */
  gapOut(g: number) { return this.edge(this.gaps[g].a, 1.45); }
  gapIn(g: number) { return this.edge(this.gaps[g].a, .9); }
  nearestGap(x: number, z: number) {
    let best = 0, bd = 1e9;
    this.gaps.forEach((g, i) => { const d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** keep the player on the farm: inside the clearing (a bit further out in the gaps), out of buildings */
  collide(x: number, z: number, r: number, player: boolean, skip?: string): { x: number; z: number } {
    for (let it = 0; it < 2; it++) for (const o of this.obstacles) { if (o.id === skip) continue; const p = pushOut(o, x, z, r); if (p) { x = p.x; z = p.z; } }
    if (player) {
      const lim = this.inGap(x, z) ? 1.06 : .96, e = this.ellipse(x, z);
      if (e > lim) { x *= lim / e; z *= lim / e; }
    }
    return { x, z };
  }
}
