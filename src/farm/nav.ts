// Pathfinding for the animals (21.11.2026): the whole map is baked ONCE into a walk grid (0.5 m cells) when the farm
// is loaded: a cell is blocked when an obstacle (house, fence, tree, rock, bush ...) is closer than the animal radius.
// Queries are cheap: a straight line that stays on free cells needs no search at all; otherwise A* (8 neighbours,
// octile distance, no corner cutting, typed arrays reused between searches) and the path is pulled tight along lines
// of sight, so an animal walks a few long straight legs instead of a zig-zag through the cells.
import type { Hof } from './hof';
import { boundR, obsDist } from './hof';

export interface Pt { x: number; z: number }

export class NavGrid {
  readonly cs: number; readonly x0: number; readonly z0: number; readonly nx: number; readonly nz: number;
  /** 1 = blocked */
  readonly block: Uint8Array;
  /** ms the bake took (tests) */
  readonly bakeMs: number;
  private g: Float32Array; private from: Int32Array; private seen: Uint32Array; private closed: Uint32Array; private stamp = 0;
  private heap: Int32Array; private hf: Float32Array; private hn = 0;

  constructor(hof: Hof, o: { cs?: number; radius?: number } = {}) {
    const t0 = performance.now();
    const cs = this.cs = o.cs ?? .5, R = o.radius ?? .3;
    // bounds: the map of the world editor (+ the spawns, they may lie outside) or the clearing of the generated farm
    let x0: number, z0: number, x1: number, z1: number;
    if (hof.logic) {
      const h = hof.logic.size / 2; x0 = z0 = -h; x1 = z1 = h;
      for (const s of hof.logic.spawns) { x0 = Math.min(x0, s.x - 3); z0 = Math.min(z0, s.z - 3); x1 = Math.max(x1, s.x + 3); z1 = Math.max(z1, s.z + 3); }
    } else { x0 = -hof.rx * 1.7; x1 = hof.rx * 1.7; z0 = -hof.rz * 1.7; z1 = hof.rz * 1.7; }
    this.x0 = x0; this.z0 = z0;
    const nx = this.nx = Math.ceil((x1 - x0) / cs), nz = this.nz = Math.ceil((z1 - z0) / cs), N = nx * nz;
    const B = this.block = new Uint8Array(N);
    // rasterise every obstacle over the cells of its bounding circle
    for (const ob of hof.obstacles) {
      const r = boundR(ob) + R;
      const i0 = Math.max(0, Math.floor((ob.x - r - x0) / cs)), i1 = Math.min(nx - 1, Math.floor((ob.x + r - x0) / cs));
      const j0 = Math.max(0, Math.floor((ob.z - r - z0) / cs)), j1 = Math.min(nz - 1, Math.floor((ob.z + r - z0) / cs));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i; if (B[k]) continue;
        if (obsDist(ob, x0 + (i + .5) * cs, z0 + (j + .5) * cs) < R) B[k] = 1;
      }
    }
    this.g = new Float32Array(N); this.from = new Int32Array(N); this.seen = new Uint32Array(N); this.closed = new Uint32Array(N);
    this.heap = new Int32Array(N); this.hf = new Float32Array(N);
    this.bakeMs = performance.now() - t0;
  }

  private ci(x: number, z: number) { return Math.floor((x - this.x0) / this.cs); }
  private cj(z: number) { return Math.floor((z - this.z0) / this.cs); }
  /** cell index of a point, -1 outside the grid */
  cell(x: number, z: number) { const i = this.ci(x, z), j = this.cj(z); return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i; }
  /** walkable (outside the grid counts as free: open forest) */
  free(x: number, z: number) { const k = this.cell(x, z); return k < 0 || !this.block[k]; }
  private centre(k: number): Pt { return { x: this.x0 + (k % this.nx + .5) * this.cs, z: this.z0 + (Math.floor(k / this.nx) + .5) * this.cs }; }

  /** the straight line from a to b crosses no blocked cell (sampled at a quarter cell) */
  los(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (this.cs * .25));
    for (let s = 1; s <= n; s++) { const t = s / n, k = this.cell(ax + (bx - ax) * t, az + (bz - az) * t); if (k >= 0 && this.block[k]) return false; }
    return true;
  }
  /** nearest free cell centre (ring search up to maxR m), the point itself when it is free */
  nearestFree(x: number, z: number, maxR = 6): Pt | null {
    if (this.free(x, z)) return { x, z };
    const i0 = this.ci(x, z), j0 = this.cj(z), R = Math.ceil(maxR / this.cs);
    let best: Pt | null = null, bd = 1e18;
    for (let r = 1; r <= R; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        const k = j * this.nx + i; if (this.block[k]) continue;
        const c = this.centre(k), d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------------- A* ----------------
  private push(k: number, f: number) {
    const H = this.heap, F = this.hf; let i = this.hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; H[i] = H[p]; F[i] = F[p]; i = p; }
    H[i] = k; F[i] = f;
  }
  private pop() {
    const H = this.heap, F = this.hf, top = H[0], n = --this.hn; if (n <= 0) return top;
    const k = H[n], f = F[n]; let i = 0;
    for (;;) { let c = i * 2 + 1; if (c >= n) break; if (c + 1 < n && F[c + 1] < F[c]) c++; if (F[c] >= f) break; H[i] = H[c]; F[i] = F[c]; i = c; }
    H[i] = k; F[i] = f; return top;
  }
  /** path from a to b as a few corner points (without a, ending at b or the nearest free point to b); null = no way.
   *  maxNodes caps the work for unreachable goals */
  path(ax: number, az: number, bx: number, bz: number, maxNodes = 40000): Pt[] | null {
    const s0 = this.nearestFree(ax, az, 3), g0 = this.nearestFree(bx, bz, 6); if (!s0 || !g0) return null;
    const S = this.cell(s0.x, s0.z), G = this.cell(g0.x, g0.z);
    if (S < 0 || G < 0) return this.los(s0.x, s0.z, g0.x, g0.z) ? [g0] : null; // off the grid: open forest
    if (S === G) return [g0];
    const nx = this.nx, nz = this.nz, B = this.block, gs = this.g, from = this.from, seen = this.seen, closed = this.closed;
    const st = ++this.stamp, gi = G % nx, gj = Math.floor(G / nx), D2 = Math.SQRT2;
    const h = (k: number) => { const dx = Math.abs(k % nx - gi), dz = Math.abs(Math.floor(k / nx) - gj); return dx + dz + (D2 - 2) * Math.min(dx, dz); };
    this.hn = 0; seen[S] = st; gs[S] = 0; from[S] = -1; this.push(S, h(S));
    let found = false, n = 0;
    while (this.hn > 0) {
      const k = this.pop(); if (closed[k] === st) continue; closed[k] = st;
      if (k === G) { found = true; break; }
      if (++n > maxNodes) break;
      const i = k % nx, j = (k - i) / nx, gk = gs[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii; if (B[q] || closed[q] === st) continue;
        if (di && dj && (B[j * nx + ii] || B[jj * nx + i])) continue; // no squeezing diagonally past a corner
        const ng = gk + (di && dj ? D2 : 1);
        if (seen[q] === st && ng >= gs[q]) continue;
        seen[q] = st; gs[q] = ng; from[q] = k; this.push(q, ng + h(q));
      }
    }
    if (!found) return null;
    const cells: Pt[] = []; for (let k = G; k !== S && k >= 0; k = from[k]) cells.push(this.centre(k));
    cells.reverse(); cells[cells.length - 1] = g0;
    // pull tight: from each corner jump to the furthest point still in sight
    const out: Pt[] = []; let cx = s0.x, cz = s0.z, i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.los(cx, cz, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]); cx = cells[j].x; cz = cells[j].z; i = j + 1;
    }
    return out;
  }
}

/** the walk grid of a farm, baked on first use and kept as long as the farm exists */
const cache = new WeakMap<Hof, { rev: number; n: NavGrid }>();
/** baked again when the obstacles changed (world editor: a building went up, hof.rev) */
export function navFor(hof: Hof) { let c = cache.get(hof); if (!c || c.rev !== hof.rev) cache.set(hof, c = { rev: hof.rev, n: new NavGrid(hof) }); return c.n; }
