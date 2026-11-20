// Painted ground of the world editor (welt.html), version 2 (21.11.2026): the whole map (extent x extent m) at
// size x size texels. A base texture everywhere (default: dry grass), on top any number of texture layers like in an
// image editor (each = one terrain texture + its own coverage mask, can be hidden, deleted, reordered), plus two wild
// grass planes: density (0 = none .. 1 = 3x the normal amount) and height (0.3x .. 3x).
// Texel row 0 = world z +extent/2 (matches the uv of the ground plane, v = 0 at +z).
export interface TexLayer { id: number; tex: string; vis: boolean; m: Uint8Array }

/** grass density plane: byte -> factor of balancing grass.perM2 */
export const GRASS_MAX = 3;
/** height plane: byte -> height factor (128 = normal) */
export const grassHeight = (v: number) => v < 128 ? Math.pow(.3, 1 - v / 128) : Math.pow(3, (v - 128) / 127);
export const grassHeightByte = (f: number) => Math.round(f < 1 ? 128 * (1 - Math.log(Math.max(.3, f)) / Math.log(.3)) : 128 + 127 * Math.log(Math.min(3, f)) / Math.log(3));

export type Rect = { i0: number; j0: number; i1: number; j1: number };
export const unionRect = (a: Rect | null, b: Rect): Rect => a ? { i0: Math.min(a.i0, b.i0), j0: Math.min(a.j0, b.j0), i1: Math.max(a.i1, b.i1), j1: Math.max(a.j1, b.j1) } : { ...b };

/** a brush stamp: weight 0..1 at (u, v) in -1..1 (outside the unit circle = 0) */
export type Stamp = (u: number, v: number) => number;

export class WorldPaint {
  base = 'grass_04';
  layers: TexLayer[] = [];
  /** wild grass density + height */
  gd: Uint8Array; gh: Uint8Array;
  private nid = 1;
  constructor(public size = 1024, public extent = 128) {
    this.gd = new Uint8Array(size * size); this.gh = new Uint8Array(size * size).fill(128);
  }
  /** world -> texel coordinates (continuous) */
  tx(x: number) { return (x / this.extent + .5) * this.size - .5; }
  ty(z: number) { return (.5 - z / this.extent) * this.size - .5; }
  wx(i: number) { return ((i + .5) / this.size - .5) * this.extent; }
  wz(j: number) { return (.5 - (j + .5) / this.size) * this.extent; }
  get m() { return this.extent / this.size; }
  full(): Rect { return { i0: 0, j0: 0, i1: this.size - 1, j1: this.size - 1 }; }
  /** texel rectangle of a world rectangle */
  rectOf(x0: number, z0: number, x1: number, z1: number): Rect {
    const S = this.size - 1, c = (v: number) => Math.max(0, Math.min(S, v));
    return { i0: c(Math.floor(this.tx(x0))), i1: c(Math.ceil(this.tx(x1))), j0: c(Math.floor(this.ty(z1))), j1: c(Math.ceil(this.ty(z0))) };
  }
  newLayer(tex: string, at = this.layers.length): TexLayer {
    const L = { id: this.nid++, tex, vis: true, m: new Uint8Array(this.size * this.size) };
    this.layers.splice(at, 0, L); return L;
  }
  /** bilinear sample of a byte plane (0..1) */
  private bil(a: Uint8Array, x: number, z: number, out = 0) {
    const S = this.size, fx = this.tx(x), fy = this.ty(z), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= S || j >= S) ? out : a[j * S + i] / 255;
    return (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - v) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * v;
  }
  /** wild grass at a world point: d = density factor (0..3), h = height factor */
  grass(x: number, z: number) { return { d: this.bil(this.gd, x, z) * GRASS_MAX, h: grassHeight(this.bil(this.gh, x, z, 128 / 255) * 255) }; }
  /** largest grass density factor in a world rectangle (skip empty grass tiles fast) */
  grassMax(x0: number, z0: number, x1: number, z1: number) {
    const R = this.rectOf(x0, z0, x1, z1), S = this.size; let m = 0;
    for (let j = R.j0; j <= R.j1; j++) for (let i = R.i0; i <= R.i1; i++) m = Math.max(m, this.gd[j * S + i]);
    return m / 255 * GRASS_MAX;
  }
  /** coverage of the visible layers on top of texture tex at a point (0..1), e.g. "is this painted as path" */
  texAt(tex: string, x: number, z: number) {
    const S = this.size, i = Math.round(this.tx(x)), j = Math.round(this.ty(z)); if (i < 0 || j < 0 || i >= S || j >= S) return tex === this.base ? 1 : 0;
    let w = tex === this.base ? 1 : 0; const k = j * S + i;
    for (const L of this.layers) { if (!L.vis) continue; const a = L.m[k] / 255; w = w * (1 - a) + (L.tex === tex ? a : 0); }
    return w;
  }

  // ---------------- brushes ----------------
  /** one dab at world (x, z): radius r (m), strength k (0..1), stamp (shape), rotation rot (rad).
   *  target: a layer (add coverage; erase = remove), or the grass planes: 'gd' moves density towards value v (0..1),
   *  'gh' moves height towards v (byte 0..255). Returns the texel rect touched. */
  dab(x: number, z: number, r: number, k: number, stamp: Stamp, rot: number, target: { L: TexLayer; erase?: boolean } | { plane: 'gd' | 'gh'; v: number }): Rect {
    const S = this.size, cx = this.tx(x), cy = this.ty(z), rt = Math.max(.5, r / this.m);
    const i0 = Math.max(0, Math.floor(cx - rt)), i1 = Math.min(S - 1, Math.ceil(cx + rt)), j0 = Math.max(0, Math.floor(cy - rt)), j1 = Math.min(S - 1, Math.ceil(cy + rt));
    const c = Math.cos(rot), s = Math.sin(rot);
    const plane = 'L' in target ? target.L.m : this[target.plane], erase = 'L' in target && !!target.erase, goal = 'L' in target ? 255 : target.v;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i - cx) / rt, dy = (j - cy) / rt; if (dx * dx + dy * dy >= 1) continue;
      const w = stamp(dx * c - dy * s, dx * s + dy * c), a = Math.min(1, k * w); if (a <= .001) continue;
      const q = j * S + i, v = plane[q];
      plane[q] = erase ? Math.round(v * (1 - a)) : Math.round(v + (goal - v) * a);
    }
    return { i0, j0, i1, j1 };
  }
  /** fill a whole layer (1 = covered) */
  fill(L: TexLayer, v: number) { L.m.fill(Math.round(v * 255)); }

  // ---------------- undo snapshots ----------------
  grab(a: Uint8Array, R: Rect) {
    const S = this.size, w = R.i1 - R.i0 + 1, out = new Uint8Array(w * (R.j1 - R.j0 + 1));
    for (let j = R.j0; j <= R.j1; j++) out.set(a.subarray(j * S + R.i0, j * S + R.i1 + 1), (j - R.j0) * w);
    return out;
  }
  put(a: Uint8Array, R: Rect, d: Uint8Array) {
    const S = this.size, w = R.i1 - R.i0 + 1;
    for (let j = R.j0; j <= R.j1; j++) a.set(d.subarray((j - R.j0) * w, (j - R.j0 + 1) * w), j * S + R.i0);
  }

  /** same world at another map size: everything keeps its place in the world (cut off / empty at the new border) */
  resized(extent: number): WorldPaint {
    const n = new WorldPaint(this.size, extent); n.base = this.base; n.nid = this.nid;
    const S = this.size, map = new Int32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const oi = Math.round(this.tx(n.wx(i))), oj = Math.round(this.ty(n.wz(j)));
      map[j * S + i] = oi < 0 || oj < 0 || oi >= S || oj >= S ? -1 : oj * S + oi;
    }
    const copy = (src: Uint8Array, dst: Uint8Array, out: number) => { for (let q = 0; q < S * S; q++) dst[q] = map[q] < 0 ? out : src[map[q]]; };
    for (const L of this.layers) { const m = new Uint8Array(S * S); copy(L.m, m, 0); n.layers.push({ ...L, m }); }
    copy(this.gd, n.gd, 0); copy(this.gh, n.gh, 128);
    return n;
  }

  // ---------------- file ----------------
  /** header + raw planes: grass density, grass height, then every layer mask */
  toBytes() {
    const S = this.size * this.size, out = new Uint8Array(S * (2 + this.layers.length));
    out.set(this.gd, 0); out.set(this.gh, S); this.layers.forEach((L, i) => out.set(L.m, S * (2 + i)));
    return out;
  }
  meta() { return { size: this.size, extent: this.extent, base: this.base, layers: this.layers.map(L => ({ tex: L.tex, vis: L.vis })) }; }
  static fromBytes(meta: ReturnType<WorldPaint['meta']>, u: Uint8Array) {
    const p = new WorldPaint(meta.size, meta.extent), S = meta.size * meta.size;
    if (u.length < S * (2 + meta.layers.length)) throw new Error('paint: wrong size');
    p.base = meta.base; p.gd.set(u.subarray(0, S)); p.gh.set(u.subarray(S, 2 * S));
    meta.layers.forEach((l, i) => { const L = p.newLayer(l.tex); L.vis = l.vis; L.m.set(u.subarray(S * (2 + i), S * (3 + i))); });
    return p;
  }
  /** a painted ground of the first editor version (6 texture channels + wild grass added/removed, 512 px) */
  static fromV1(size: number, extent: number, u: Uint8Array) {
    const p = new WorldPaint(size, extent), S = size * size; p.base = 'grass_01';
    const tex = ['grass_01', 'moss_ground_02', 'ground_02', 'ground_06', 'grass_04', 'cobblestone_01'];
    const ch = (c: number) => (k: number) => c < 4 ? u[k * 4 + c] : u[S * 4 + k * 4 + c - 4];
    tex.forEach((t, c) => { const g = ch(c); let any = false; const L = p.newLayer(t); for (let k = 0; k < S; k++) { L.m[k] = g(k); if (L.m[k]) any = true; } if (!any) p.layers.pop(); });
    const add = ch(6), rem = ch(7);
    for (let k = 0; k < S; k++) p.gd[k] = Math.round(Math.max(0, add(k) - rem(k)) / GRASS_MAX);
    return p;
  }
}
