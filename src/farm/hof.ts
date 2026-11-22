// Farm geometry shared by simulation and view: building footprints (collision), forest edge, gaps, entry/exit points.
import { BuildingId, FarmCfg, RectCfg, rotY } from './config';
import { MODEL } from '../world/catalog';
import type { PropRec } from '../world/data';
import { Logic, Pt, centroid, closestOnPoly, inPoly, radial, splinePoly } from '../world/logic';

export interface Obb { kind: 'box'; x: number; z: number; hw: number; hd: number; c: number; s: number; id?: string; /** fence piece (lumber.fences id) */ fid?: number }
export interface Circ { kind: 'circle'; x: number; z: number; r: number; id?: string }
/** convex outline in world space (rocks): pts = x0, z0, x1, z1 ... counter-clockwise or clockwise; x/z/r = bounding circle */
export interface Poly { kind: 'poly'; x: number; z: number; r: number; pts: Float32Array; id?: string }
export type Obstacle = Obb | Circ | Poly;
/** radius of a circle around the obstacle (spatial hash, quick rejects) */
export function boundR(o: Obstacle) { return o.kind === 'circle' || o.kind === 'poly' ? o.r : Math.hypot(o.hw, o.hd); }
/** closest point on the outline of a convex polygon and whether (x, z) lies inside */
function polyNear(o: Poly, x: number, z: number) {
  const P = o.pts, n = P.length / 2; let bx = x, bz = z, bd = 1e18, inside = true, sgn = 0;
  for (let i = 0; i < n; i++) {
    const ax = P[i * 2], az = P[i * 2 + 1], cx = P[((i + 1) % n) * 2], cz = P[((i + 1) % n) * 2 + 1];
    const ex = cx - ax, ez = cz - az, cr = ex * (z - az) - ez * (x - ax);
    if (cr !== 0) { const sg = Math.sign(cr); if (!sgn) sgn = sg; else if (sg !== sgn) inside = false; }
    const l2 = ex * ex + ez * ez, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
    const px = ax + ex * t, pz = az + ez * t, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; bx = px; bz = pz; }
  }
  return { x: bx, z: bz, d: Math.sqrt(bd), inside };
}

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
  if (o.kind === 'poly') {
    if ((x - o.x) ** 2 + (z - o.z) ** 2 >= (o.r + r) ** 2) return null;
    const c = polyNear(o, x, z);
    if (!c.inside) { if (c.d >= r) return null; return { x: c.x + (x - c.x) / c.d * r, z: c.z + (z - c.z) / c.d * r }; }
    // centre inside: out through the nearest edge, away from the middle
    const dx = c.x - o.x, dz = c.z - o.z, l = Math.hypot(dx, dz) || 1; return { x: c.x + dx / l * r, z: c.z + dz / l * r };
  }
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

/** collision of an object placed in the world editor (null = walk through: plants, grass, small stones) */
export function propObstacle(p: PropRec): Obstacle | null {
  const d = MODEL.get(p.m); if (!d) return null;
  if (d.wall) { const a = p.ry; return { kind: 'box', x: p.x, z: p.z, hw: d.wall[0] * p.s, hd: d.wall[1] * p.s, c: Math.cos(a), s: Math.sin(a), id: 'prop' }; }
  if (d.hull) {
    const c = Math.cos(p.ry), sn = Math.sin(p.ry), pts = new Float32Array(d.hull.length * 2); let r = 0;
    d.hull.forEach(([lx, lz], i) => { const x = p.x + (lx * c + lz * sn) * p.s, z = p.z + (-lx * sn + lz * c) * p.s; pts[i * 2] = x; pts[i * 2 + 1] = z; });
    let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; } cx /= d.hull.length; cz /= d.hull.length;
    for (let i = 0; i < pts.length; i += 2) r = Math.max(r, Math.hypot(pts[i] - cx, pts[i + 1] - cz));
    return { kind: 'poly', x: cx, z: cz, r, pts, id: 'prop' };
  }
  if (d.solid) return { kind: 'circle', x: p.x, z: p.z, r: d.solid * p.s, id: 'prop' };
  return null;
}
/** distance from a point to the outside of an obstacle (0 inside) */
export function obsDist(o: Obstacle, x: number, z: number) {
  if (o.kind === 'circle') return Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r);
  if (o.kind === 'poly') { const c = polyNear(o, x, z); return c.inside ? 0 : c.d; }
  const { lx, lz } = toLocal(o, x, z); return Math.hypot(Math.max(0, Math.abs(lx) - o.hw), Math.max(0, Math.abs(lz) - o.hd));
}

/** small seeded random generator: the same layout on every start */
export function seeded(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

/** one soft blob of a grass patch (ellipse rotated by a, peak density d) */
export interface Blob { x: number; z: number; rx: number; rz: number; a: number; d: number }
/** a grass patch: overlapping blobs, dense inside, thinning out; low = only short grass (under fruit trees);
 *  wet = damp spot (behind the well), wild garlic likes it there */
export interface Patch { blobs: Blob[]; low?: boolean; wet?: boolean; tag: string }
export interface PathLine { pts: { x: number; z: number }[]; w: number }

const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** cheap smooth value noise (-1..1) for ragged patch borders */
function noise(x: number, z: number) { return Math.sin(x * 1.7 + Math.sin(z * 1.3) * 1.4) * .5 + Math.sin(z * 2.3 - x * .9 + 1.7) * .3 + Math.sin((x + z) * 3.9) * .2; }
function segDist(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2)) : 0;
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

export class Hof {
  obstacles: Obstacle[] = [];
  /** trodden paths over the yard (ground texture + no grass here) */
  paths: PathLine[] = [];
  /** grass patches where nobody walks or mows: behind the well, behind buildings, along closed fences, at the forest edge, under fruit trees */
  patches: Patch[] = [];
  gaps: { a: number; x: number; z: number }[] = [];
  /** wild bramble bushes along the forest edge */
  brambles: { x: number; z: number }[] = [];
  rx: number; rz: number;
  /** world editor logic (null = the farm of balancing.yaml): walk area + build area as polygons, spawn weights */
  logic: Logic | null;
  walkPoly: Pt[] = []; buildPoly: Pt[] = [];
  /** centre of the walk area and its radius per degree (the polygon counts as "clearing": 0 = centre, 1 = edge) */
  cx = 0; cz = 0; private R: Float32Array | null = null;
  private spawnW: number[] = [];
  /** fixed spots of the weeds on each plot (offset from the plot centre), one per third of the hexagon so they lie apart;
   *  weed k (1-based) sits at spot k-1 and is the next one to come out while it is the last one (sim + view share this) */
  plotWeeds: { x: number; z: number; r: number }[][];
  /** footprints of all buildings; with a world editor logic only the BUILT ones block (and cut out grass): an unbuilt
   *  building does not exist yet, there is what was painted / placed in the editor (21.11.2026) */
  private bldObs = new Map<BuildingId, Obstacle>();
  /** goes up whenever the set of obstacles changes (caches of other code compare it) */
  rev = 0;
  /** obstacles that come and go during play (yard trees, fences): the walk grid is patched there instead of baked again */
  navPatches: { rev: number; x: number; z: number; r: number }[] = [];
  addDyn(o: Obstacle) { this.obstacles.push(o); this.rev++; this.navPatches.push({ rev: this.rev, x: o.x, z: o.z, r: boundR(o) }); if (this.navPatches.length > 400) this.navPatches.splice(0, 200); }
  removeDyn(o: Obstacle) { const i = this.obstacles.indexOf(o); if (i < 0) return; this.obstacles.splice(i, 1); this.rev++; this.navPatches.push({ rev: this.rev, x: o.x, z: o.z, r: boundR(o) }); if (this.navPatches.length > 400) this.navPatches.splice(0, 200); }
  /** wood + fences (22.11.2026): the yard trees that stand, the workbench, every fence piece */
  treeObs: Circ[] = []; benchObs: Obb | null = null; fenceObs = new Map<number, Obb>(); private lumberRev = -1;
  /** a fence piece as an obstacle (box along its angle) */
  fenceBox(f: { id?: number; x: number; z: number; a: number }): Obb {
    const F = this.cfg.lumber.fence; return { kind: 'box', x: f.x, z: f.z, hw: F.length / 2, hd: F.depth / 2, c: Math.cos(f.a), s: Math.sin(f.a), id: 'fence', fid: f.id };
  }
  /** make the obstacles match the trees + fences of the farm state (cheap when nothing changed); true = changed */
  syncLumber(L: { trees: { fell: number; sap: number }[]; fences: { id: number; x: number; z: number; a: number }[]; rev: number } | undefined) {
    if (!L || !this.cfg.lumber || L.rev === this.lumberRev) return false;
    this.lumberRev = L.rev;
    this.treeObs.forEach((o, i) => { const up = !(L.trees[i] && (L.trees[i].fell > 0 || L.trees[i].sap > 0)), on = this.obstacles.includes(o); if (up && !on) this.addDyn(o); else if (!up && on) this.removeDyn(o); });
    const ids = new Set(L.fences.map(f => f.id));
    for (const [id, o] of this.fenceObs) if (!ids.has(id)) { this.removeDyn(o); this.fenceObs.delete(id); }
    for (const f of L.fences) if (!this.fenceObs.has(f.id)) { const o = this.fenceBox(f); this.fenceObs.set(f.id, o); this.addDyn(o); }
    return true;
  }
  /** buildings that are only there when built (world editor logic) */
  get hideUnbuilt() { return !!this.logic; }
  /** tell the farm which buildings stand; returns true when the obstacles changed */
  setBuilt(built: (id: BuildingId) => boolean) {
    if (!this.hideUnbuilt) return false;
    let changed = false;
    for (const [id, o] of this.bldObs) {
      const on = id === 'house' || built(id), i = this.obstacles.indexOf(o);
      if (on && i < 0) { this.obstacles.push(o); changed = true; } else if (!on && i >= 0) { this.obstacles.splice(i, 1); changed = true; }
    }
    if (changed) this.rev++;
    return changed;
  }
  /** is (x, z) under a building that stands (pad = margin) */
  underBuilding(x: number, z: number, pad = 0) {
    for (const [, o] of this.bldObs) {
      if (!this.obstacles.includes(o)) continue;
      if (o.kind === 'box') { const { lx, lz } = toLocal(o, x, z); if (Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad) return true; }
      else if (obsDist(o, x, z) < pad + (o.kind === 'circle' ? 1e-6 : 0)) return true;
    }
    return false;
  }
  /** a free spawn point of the wild plants from the world editor (null = none set / none free) */
  wildSpot(ok: (x: number, z: number) => boolean): { x: number; z: number } | null {
    const W = this.logic?.wild; if (!W?.length) return null;
    for (let t = 0; t < 40; t++) {
      const p = W[Math.floor(Math.random() * W.length)], a = Math.random() * Math.PI * 2, r = Math.random() * .3, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (this.freeSpot(x, z, .3) && ok(x, z)) return { x, z };
    }
    return null;
  }
  /** the world editor set spawn points for the wild plants */
  get hasWildSpots() { return !!this.logic?.wild?.length; }
  constructor(public cfg: FarmCfg) {
    const H = cfg.hof; this.rx = H.clearing.rx; this.rz = H.clearing.rz;
    const wr = seeded(31), PH = cfg.plots.size / 2, WN = Math.max(1, cfg.plots.weeds.max);
    this.plotWeeds = H.plots.map(() => { const a0 = wr() * 6.283; return Array.from({ length: WN }, (_, k) => { const a = a0 + k / WN * 6.283 + (wr() - .5) * 1.2, r = PH * (.32 + wr() * .4); return { x: Math.cos(a) * r, z: Math.sin(a) * r, r: wr() * 7 }; }); });
    const L = this.logic = cfg.world?.logic ?? null;
    if (L) {
      this.walkPoly = splinePoly(L.walk); this.buildPoly = splinePoly(L.build);
      const c = centroid(this.walkPoly); this.cx = c.x; this.cz = c.z; this.R = radial(this.walkPoly, c);
      let mx = 0, mz = 0; for (const p of this.walkPoly) { mx = Math.max(mx, Math.abs(p.x - c.x)); mz = Math.max(mz, Math.abs(p.z - c.z)); }
      this.rx = mx; this.rz = mz;
    }
    for (const [id, r] of Object.entries(H.buildings) as [BuildingId, RectCfg][]) { const o = obstacleOf(r, id); this.bldObs.set(id, o); this.obstacles.push(o); }
    if (L) this.setBuilt(id => !!cfg.buildings[id]?.built);   // until the game says which ones stand: the yaml start (house, well)
    for (const t of H.trees) this.obstacles.push({ kind: 'circle', x: t.x, z: t.z, r: .45, id: 'tree' });
    this.obstacles.push({ kind: 'circle', x: H.bush.x, z: H.bush.z, r: cfg.bush.radius ?? .8, id: 'bush' });
    if (cfg.lumber) { // wood + fences: yard trees (stand until chopped) and the workbench
      this.treeObs = cfg.lumber.trees.map(t => ({ kind: 'circle', x: t.x, z: t.z, r: cfg.lumber.radius, id: 'lumber' }));
      this.obstacles.push(...this.treeObs);
      const B = cfg.lumber.bench; this.benchObs = obstacleOf({ x: B.x, z: B.z, w: B.w, d: B.d, rot: B.rot }, 'bench') as Obb; this.obstacles.push(this.benchObs);
    }
    // objects placed in the world editor: trees, rocks, fences on the farm block the way (not in the forest ring, the animals come through there)
    // 21.11.2026: with a world from the editor everything solid blocks, also in the forest: the animals find the entrances (nav.ts)
    for (const p of cfg.world?.props ?? []) { const o = propObstacle(p); if (o && (L || this.ellipse(p.x, p.z) < .97)) this.obstacles.push(o); }
    if (L) {
      // spawns instead of forest gaps: the "gap" points from the middle towards the spawn
      this.gaps = L.spawns.map(sp => { const a = Math.atan2(sp.z - this.cz, sp.x - this.cx), e = this.edge(a); return { a, x: e.x, z: e.z }; });
      this.spawnW = L.spawns.map(sp => Math.max(0, sp.w ?? 1));
      this.brambles = L.objects.filter(o => o.k === 'bramble').map(o => ({ x: o.x, z: o.z }));
      for (const b of this.brambles) this.obstacles.push({ kind: 'circle', x: b.x, z: b.z, r: .7, id: 'bramble' });
      return;   // no generated paths or grass patches: the editor paints them
    }
    this.gaps = H.gaps.map(d => { const a = d * Math.PI / 180, e = this.edge(a); return { a, x: e.x, z: e.z }; });
    // brambles: evenly around the edge (seeded jitter), never in a gap
    const rnd = seeded(7), n = cfg.wild?.brambles?.count ?? 0;
    for (let i = 0, tries = 0; this.brambles.length < n && tries < n * 30; tries++, i++) {
      const a = (i + rnd() * .6) / n * Math.PI * 2 + .3, e = this.edge(a, .9 + rnd() * .04);
      if (this.inGap(e.x, e.z, 2) || !this.freeSpot(e.x, e.z, 1)) continue;
      this.brambles.push(e);
    }
    for (const b of this.brambles) this.obstacles.push({ kind: 'circle', x: b.x, z: b.z, r: .7, id: 'bramble' });
    this.buildPaths();
    this.buildPatches();
  }
  private buildPaths() {
    const H = this.cfg.hof, B = H.buildings, P = (pts: { x: number; z: number }[], w: number) => this.paths.push({ pts, w });
    const yard = { x: 3, z: -5.6 };
    P([{ x: -6, z: -6.2 }, yard, { x: 11, z: -5.4 }], 3.2);                       // yard in front of the house
    P([yard, { x: H.door.x, z: H.door.z }], 2);
    for (const gp of this.gaps) { const e = this.edge(gp.a, 1.15); P([yard, { x: (yard.x + e.x) / 2 + Math.sin(gp.a) * 1.5, z: (yard.z + e.z) / 2 }, e], 1.6); }
    P([yard, { x: B.mill.x, z: B.mill.z + 2 }], 1.4); P([yard, { x: B.bakery.x + 1, z: B.bakery.z + 2 }], 1.4);
    P([{ x: 0, z: 6.5 }, { x: B.silo.x, z: B.silo.z - 1.5 }, { x: B.chickens.x, z: B.chickens.z - 2 }], 1.4);
    P([{ x: 0, z: 6.5 }, { x: B.cows.x, z: B.cows.z - 2 }, { x: B.dairy.x + 1, z: B.dairy.z - 1.5 }], 1.4);
    P([{ x: -7.5, z: -5 }, { x: B.carpentry.x + 1.5, z: B.carpentry.z + 1.5 }], 1.4);
    P([{ x: -7.5, z: 4 }, { x: B.workshop.x + 1.5, z: B.workshop.z - 1.2 }], 1.4);
    P([{ x: 8, z: -2 }, { x: B.juicer.x - 1.5, z: B.juicer.z }], 1.4);
  }
  /** distance to the edge of the nearest path (negative = on it) */
  pathDist(x: number, z: number) {
    let d = 1e9;
    for (const p of this.paths) for (let i = 1; i < p.pts.length; i++) d = Math.min(d, segDist(x, z, p.pts[i - 1], p.pts[i]) - p.w / 2);
    return d;
  }
  private buildPatches() {
    const rnd = seeded(23), R = (a: number, b: number) => a + rnd() * (b - a), H = this.cfg.hof, G = { well: 1, back: 1, edge: 40, ...this.cfg.grass };
    /** a ragged patch along a line: centre, length, width, direction; n blobs of different size, the middle ones densest */
    const strip = (tag: string, cx: number, cz: number, len: number, wid: number, ang: number, n: number, o: { low?: boolean; wet?: boolean; d?: number } = {}) => {
      const blobs: Blob[] = [], c = Math.cos(ang), s = Math.sin(ang);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1) - .5) * len * R(.75, 1.05) + R(-.3, .3) * len / n, q = R(-.35, .35) * wid, mid = 1 - Math.abs(t) / (len / 2 + .01);
        const r = (wid / 2) * R(.7, 1.25) * (.75 + .5 * mid);
        blobs.push({ x: cx + c * t - s * q, z: cz + s * t + c * q, rx: r * R(1, 1.8), rz: r * R(.7, 1.1), a: ang + R(-.5, .5), d: (o.d ?? 1) * R(.75, 1) * (.7 + .3 * mid) });
      }
      this.patches.push({ blobs, tag, low: o.low, wet: o.wet });
    };
    // 1) behind the well (wet, lots): on the side away from the yard
    const W = H.buildings.well, yard = { x: 3, z: -5.6 }, wa = Math.atan2(W.z - yard.z, W.x - yard.x) + .9;
    strip('well', W.x + Math.cos(wa) * 2.4, W.z + Math.sin(wa) * 2.4, 6 * G.well, 3.6 * G.well, wa + Math.PI / 2, 7, { wet: true, d: 1.1 });
    strip('well', W.x + Math.cos(wa + .9) * 2.2, W.z + Math.sin(wa + .9) * 2.2, 3 * G.well, 2 * G.well, wa, 3, { wet: true });
    // 2) behind buildings (local -z = back wall), along the closed sides of the pens (gate at the front)
    for (const [id, r] of Object.entries(H.buildings)) {
      if (r.r !== undefined || id === 'well') continue;
      const o = obstacleOf(r) as Obb, w = r.w ?? 3, d = r.d ?? 3;
      const at = (lx: number, lz: number) => toWorld(o, lx, lz), along = Math.atan2(-o.s, o.c); // world direction of local +x
      if (r.fence) {
        const b = at(R(-.4, .4), -d / 2 - .45); strip('fence', b.x, b.z, w * R(.8, 1.05), 1.2, along, 4, { d: .95 });
        for (const sx of [-1, 1]) if (rnd() < .85) { const p = at(sx * (w / 2 + .45), R(-.6, -.1)); strip('fence', p.x, p.z, d * R(.6, .95), 1.1, along + Math.PI / 2, 3, { d: .85 }); }
      } else {
        const b = at(R(-.3, .3) * w, -d / 2 - .7); strip('back', b.x, b.z, w * R(.85, 1.2), 1.8 * G.back, along, rnd() < .5 ? 4 : 3);
        if (rnd() < .6) { const sx = rnd() < .5 ? -1 : 1, p = at(sx * (w / 2 + .5), -d / 2 + R(0, .5)); strip('back', p.x, p.z, 1.6, 1.1, along + Math.PI / 2, 2, { d: .8 }); }
      }
    }
    // round buildings (silo): behind, away from the middle of the farm
    { const S = H.buildings.silo, a = Math.atan2(S.z, S.x); strip('back', S.x + Math.cos(a) * ((S.r ?? 1.8) + .7), S.z + Math.sin(a) * ((S.r ?? 1.8) + .7), 3.5, 1.6, a + Math.PI / 2, 3); }
    // 3) forest edge, behind the bushes and between the trees: patches of every size, never in a gap
    const nEdge = Math.round(G.edge);
    for (let i = 0, k = 0; i < nEdge && k < nEdge * 6; k++) {
      const a = (i + R(-.35, .35)) / nEdge * Math.PI * 2, e = this.edge(a, R(.9, 1.0));
      if (this.inGap(e.x, e.z, 1.5)) { i++; continue; }
      const big = rnd(); strip('edge', e.x, e.z, big < .3 ? R(1.5, 2.5) : big < .8 ? R(3, 5) : R(5.5, 8), big < .3 ? R(1, 1.6) : R(1.6, 2.6), a + Math.PI / 2, big < .3 ? 2 : big < .8 ? 4 : 6);
      i++;
    }
    // 4) around the fruit trees: low grass only
    for (const t of H.trees) strip('tree', t.x + R(-.3, .3), t.z + R(-.3, .3), R(1.8, 2.6), R(1.6, 2.2), R(0, Math.PI), 3, { low: true, d: .8 });
  }
  /** where grass may grow at all: not on paths, plots, buildings, the door, in the gaps or deep in the forest (0..1) */
  grassMask(x: number, z: number, painted = false) {
    const pd = painted ? 9 : this.pathDist(x, z); if (pd < 0) return 0;
    let m = sstep(0, .9, pd);
    const h = this.cfg.plots.size / 2;
    for (const p of this.cfg.hof.plots) { const d = Math.max(Math.abs(x - p.x), Math.abs(z - p.z)) - h; if (d < .15) return 0; m *= sstep(.15, .9, d); }
    for (const o of this.obstacles) {
      if (o.id === 'bramble') continue;
      if (o.kind === 'circle') { if (Math.hypot(x - o.x, z - o.z) < o.r + (o.id === 'tree' ? -.2 : .1)) return 0; }
      else if (o.kind === 'poly') { if (Math.hypot(x - o.x, z - o.z) < o.r + .1 && obsDist(o, x, z) < .1) return 0; }
      else { const { lx, lz } = toLocal(o, x, z); if (Math.abs(lx) < o.hw + .05 && Math.abs(lz) < o.hd + .05) return 0; }
    }
    const door = this.cfg.hof.door; m *= sstep(1, 2, Math.hypot(x - door.x, z - door.z));
    if (painted) return m;
    if (this.ellipse(x, z) > .75 && this.inGap(x, z, .3)) return 0;   // the animals' corridors at the edge stay open
    return m * (1 - sstep(1, 1.12, this.ellipse(x, z)));
  }
  /** density of one patch at a point (0..1, without the mask) */
  patchDensity(p: Patch, x: number, z: number) {
    let v = 0; const n = noise(x, z) * .32;
    for (const b of p.blobs) {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.a), s = Math.sin(b.a), lx = dx * c + dz * s, lz = -dx * s + dz * c;
      const e = Math.hypot(lx / b.rx, lz / b.rz) + n; if (e >= 1) continue;
      const k = sstep(0, 1, 1 - e) * b.d; v = 1 - (1 - v) * (1 - Math.min(1, k));
    }
    return v;
  }
  /** grass density at a point (all patches + mask + painted wild grass) */
  grass(x: number, z: number, only?: (p: Patch) => boolean) { return Math.min(1, this.grassAt(x, z, only).d); }
  /** grass at a point: density, low = only short grass (all patches here are low), wet = damp patch (behind the well);
   *  list = patches to look at (default all) */
  grassAt(x: number, z: number, only?: (p: Patch) => boolean, list: Patch[] = this.patches) {
    let v = 0, hi = 0, wet = 0;
    for (const p of list) {
      if (only && !only(p)) continue; const b = this.patchBox(p); if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const d = this.patchDensity(p, x, z); if (d <= 0) continue;
      v = 1 - (1 - v) * (1 - d); if (!p.low) hi = Math.max(hi, d); if (p.wet) wet = Math.max(wet, d);
    }
    let low = v > 0 && hi < v * .5;
    v = v ? v * this.grassMask(x, z) : 0;
    // painted in the world editor (with a logic): density up to 3x, height factor; not on plots and buildings
    const P = this.logic ? this.cfg.world?.paint : null;
    let h = 1;
    if (P && !only) {
      const g = P.grass(x, z);
      if (g.d > .01) { const k = g.d * this.grassMask(x, z, true) * (.75 + .25 * (noise(x * .7, z * .7) * .5 + .5)); v = Math.max(v, k); h = g.h; if (k > .3) low = false; }
    }
    return { d: v, low, wet: wet > .3, h };
  }
  private boxes = new Map<Patch, { x0: number; x1: number; z0: number; z1: number }>();
  /** bounding box of a patch (with margin for the ragged border) */
  patchBox(p: Patch) {
    let b = this.boxes.get(p);
    if (!b) { b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; for (const q of p.blobs) { const r = Math.max(q.rx, q.rz) * 1.35; b.x0 = Math.min(b.x0, q.x - r); b.x1 = Math.max(b.x1, q.x + r); b.z0 = Math.min(b.z0, q.z - r); b.z1 = Math.max(b.z1, q.z + r); } this.boxes.set(p, b); }
    return b;
  }
  /** no building, tree, bush or plot here (pad = extra distance) */
  freeSpot(x: number, z: number, pad = 0) {
    const h = this.cfg.plots.size / 2 + .2;
    for (const p of this.cfg.hof.plots) if (Math.hypot(x - p.x, z - p.z) < h + pad) return false;
    for (const o of this.obstacles) {
      if (o.kind === 'circle') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return false; }
      else if (o.kind === 'poly') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad && obsDist(o, x, z) < pad) return false; }
      else { const { lx, lz } = toLocal(o, x, z); if (Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad) return false; }
    }
    return Math.hypot(x - this.cfg.hof.door.x, z - this.cfg.hof.door.z) > 1.2 + pad;
  }
  /** obstacle of a building (for distances to its walls / fence) */
  building(id: BuildingId) { return this.obstacles.find(o => o.id === id) ?? null; }
  /** distance from a point to the outside of an obstacle */
  distTo(o: Obstacle, x: number, z: number) { return obsDist(o, x, z); }
  /** radius of the walk area in direction a (world editor logic) */
  private rad(a: number) { const R = this.R!, n = R.length, f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * n, i = Math.floor(f) % n, u = f - Math.floor(f); return R[i] * (1 - u) + R[(i + 1) % n] * u; }
  /** point on the clearing edge in direction a */
  edge(a: number, k = 1) {
    if (this.R) { const r = this.rad(a) * k; return { x: this.cx + Math.cos(a) * r, z: this.cz + Math.sin(a) * r }; }
    return { x: Math.cos(a) * this.rx * k, z: Math.sin(a) * this.rz * k };
  }
  /** 0 = centre, 1 = forest edge (with a logic: the edge of the walk area) */
  ellipse(x: number, z: number) {
    if (this.R) { const dx = x - this.cx, dz = z - this.cz; return Math.hypot(dx, dz) / Math.max(.5, this.rad(Math.atan2(dz, dx))); }
    return Math.hypot(x / this.rx, z / this.rz);
  }
  /** in the build area (world editor logic; without one: the inner farm) */
  inBuild(x: number, z: number) { return this.logic ? inPoly(this.buildPoly, x, z) : this.ellipse(x, z) < .8; }
  /** spawn index for a new animal (weighted by the spawn's w) */
  pickGap() {
    const n = this.gaps.length; if (!n) return 0;
    if (!this.spawnW.length) return Math.floor(Math.random() * n);
    let r = Math.random() * this.spawnW.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) { r -= this.spawnW[i]; if (r <= 0) return i; }
    return n - 1;
  }
  /** an animal running off through gap g is gone */
  outside(x: number, z: number, g: number) {
    if (!this.logic) return this.ellipse(x, z) > 1.35;
    const o = this.gapOut(g); return Math.hypot(x - o.x, z - o.z) < 1.2 || this.ellipse(x, z) > 1.6;
  }
  /** inside a gap corridor (animals come and go here) */
  inGap(x: number, z: number, pad = 0) {
    x -= this.cx; z -= this.cz;
    const r = Math.hypot(x, z);
    return this.gaps.some(g => { const along = x * Math.cos(g.a) + z * Math.sin(g.a), side = Math.abs(-x * Math.sin(g.a) + z * Math.cos(g.a));
      return along > r * .5 && side < this.cfg.hof.gapWidth / 2 + pad + Math.max(0, this.ellipse(x + this.cx, z + this.cz) - 1) * 3; });
  }
  /** spawn point outside the forest in gap g, and the point just inside the clearing */
  gapOut(g: number) {
    const sp = this.logic?.spawns[g]; if (sp) return { x: sp.x, z: sp.z };
    return this.edge(this.gaps[g].a, 1.45);
  }
  gapIn(g: number) {
    const sp = this.logic?.spawns[g]; if (sp && this.ellipse(sp.x, sp.z) < .9) return { x: sp.x, z: sp.z };
    return this.edge(this.gaps[g].a, .9);
  }
  nearestGap(x: number, z: number) {
    let best = 0, bd = 1e9;
    this.gaps.forEach((g, i) => { const d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** keep the player on the farm: inside the clearing (a bit further out in the gaps), out of buildings */
  // ---------------- spatial hash of the obstacles (collision queries only look at the cells around a point) ----------------
  private hash: { n: number; cs: number; x0: number; z0: number; nx: number; nz: number; cells: Obstacle[][]; big: Obstacle[] } | null = null;
  private buildHash() {
    const cs = 4, list = this.obstacles; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const o of list) { const r = boundR(o); x0 = Math.min(x0, o.x - r); z0 = Math.min(z0, o.z - r); x1 = Math.max(x1, o.x + r); z1 = Math.max(z1, o.z + r); }
    if (!list.length) { x0 = z0 = 0; x1 = z1 = 1; }
    const nx = Math.max(1, Math.ceil((x1 - x0) / cs)), nz = Math.max(1, Math.ceil((z1 - z0) / cs)), cells: Obstacle[][] = Array.from({ length: nx * nz }, () => []), big: Obstacle[] = [];
    for (const o of list) {
      const r = boundR(o); if (r > cs * 6) { big.push(o); continue; }
      const i0 = Math.floor((o.x - r - x0) / cs), i1 = Math.floor((o.x + r - x0) / cs), j0 = Math.floor((o.z - r - z0) / cs), j1 = Math.floor((o.z + r - z0) / cs);
      for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) cells[j * nx + i].push(o);
    }
    this.hash = { n: list.length, cs, x0, z0, nx, nz, cells, big };
  }
  private hashRev = -1;
  private qStamp = 0; private qSeen = new Map<Obstacle, number>();
  /** obstacles whose bounding circle may touch the circle (x, z, r) */
  near(x: number, z: number, r: number, out: Obstacle[] = []): Obstacle[] {
    if (!this.hash || this.hash.n !== this.obstacles.length || this.hashRev !== this.rev) { this.buildHash(); this.hashRev = this.rev; }
    const H = this.hash!, st = ++this.qStamp; out.length = 0;
    for (const o of H.big) out.push(o);
    const i0 = Math.max(0, Math.floor((x - r - H.x0) / H.cs)), i1 = Math.min(H.nx - 1, Math.floor((x + r - H.x0) / H.cs));
    const j0 = Math.max(0, Math.floor((z - r - H.z0) / H.cs)), j1 = Math.min(H.nz - 1, Math.floor((z + r - H.z0) / H.cs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const o of H.cells[j * H.nx + i]) {
      if (this.qSeen.get(o) === st) continue; this.qSeen.set(o, st);
      const R = boundR(o) + r; if ((o.x - x) ** 2 + (o.z - z) ** 2 < R * R) out.push(o);
    }
    return out;
  }
  private nearBuf: Obstacle[] = [];
  /** half edge of the square map of the world editor (the player stays on it) */
  get mapHalf() { return this.logic ? this.logic.size / 2 : 0; }
  collide(x: number, z: number, r: number, player: boolean, skip?: string): { x: number; z: number } {
    const list = this.near(x, z, r + .5, this.nearBuf);
    for (let it = 0; it < 3; it++) { let moved = false; for (const o of list) { if (o.id === skip) continue; const p = pushOut(o, x, z, r); if (p) { x = p.x; z = p.z; moved = true; } } if (!moved) break; }
    if (player && this.logic) {
      const m = this.mapHalf - 1; x = Math.max(-m, Math.min(m, x)); z = Math.max(-m, Math.min(m, z));
      // walk area of the world editor: back onto the outline, a hand's width inside
      if (!inPoly(this.walkPoly, x, z)) { const c = closestOnPoly(this.walkPoly, x, z), dx = this.cx - c.x, dz = this.cz - c.z, l = Math.hypot(dx, dz) || 1; x = c.x + dx / l * .05; z = c.z + dz / l * .05; }
    } else if (player) {
      const lim = this.inGap(x, z) ? 1.06 : .96, e = this.ellipse(x, z);
      if (e > lim) { x *= lim / e; z *= lim / e; }
    }
    return { x, z };
  }
}
