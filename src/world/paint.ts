// Painted ground of the world editor: 8 channels over the whole ground plane (extent x extent m, size x size texels).
// 0..5 = how much of each ground texture is painted here (their sum <= 1, the rest stays the generated ground),
// 6 = wild grass added, 7 = wild grass removed. Two RGBA byte planes go straight to the ground shader.
// Texel row 0 = world z +extent/2 (matches the uv of the ground plane, v = 0 at +z).
// 0..5 follow the terrain layers of the texture concept (20.11.2026): grass_01, moss_ground_02, ground_02, ground_06, grass_04, cobblestone_01
export const PAINT_CH = ['grass', 'moss', 'field', 'path', 'dry', 'pave', 'wild', 'nowild'] as const;
export type PaintCh = typeof PAINT_CH[number];
export const TEX_CH = 6;

export class WorldPaint {
  /** float weights, 8 per texel */
  f: Float32Array;
  /** byte planes for the shader: a = ch 0..3, b = ch 4..7 */
  a: Uint8Array; b: Uint8Array;
  constructor(public size = 512, public extent = 170) {
    this.f = new Float32Array(size * size * 8); this.a = new Uint8Array(size * size * 4); this.b = new Uint8Array(size * size * 4);
  }
  /** world -> texel coordinates (continuous) */
  tx(x: number) { return (x / this.extent + .5) * this.size - .5; }
  ty(z: number) { return (.5 - z / this.extent) * this.size - .5; }
  wx(i: number) { return ((i + .5) / this.size - .5) * this.extent; }
  wz(j: number) { return (.5 - (j + .5) / this.size) * this.extent; }
  get m() { return this.extent / this.size; }
  /** bilinear value of channel c at a world point */
  sample(c: number, x: number, z: number) {
    const S = this.size, fx = this.tx(x), fy = this.ty(z);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= S || j >= S) ? 0 : this.f[(j * S + i) * 8 + c];
    return (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - v) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * v;
  }
  /** largest value of channel c in a world rectangle (to skip empty grass tiles fast) */
  maxIn(c: number, x0: number, z0: number, x1: number, z1: number) {
    const S = this.size, i0 = Math.max(0, Math.floor(this.tx(x0))), i1 = Math.min(S - 1, Math.ceil(this.tx(x1)));
    const j0 = Math.max(0, Math.floor(this.ty(z1))), j1 = Math.min(S - 1, Math.ceil(this.ty(z0)));
    let m = 0; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) m = Math.max(m, this.f[(j * S + i) * 8 + c]);
    return m;
  }
  empty() { for (let i = 0; i < this.f.length; i++) if (this.f[i] > .002) return false; return true; }
  /** refresh the byte planes in a texel rectangle (inclusive) */
  sync(i0 = 0, j0 = 0, i1 = this.size - 1, j1 = this.size - 1) {
    const S = this.size, f = this.f, A = this.a, B = this.b;
    for (let j = Math.max(0, j0); j <= Math.min(S - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(S - 1, i1); i++) {
      const k = j * S + i, o = k * 8, q = k * 4;
      for (let c = 0; c < 4; c++) { A[q + c] = Math.round(f[o + c] * 255); B[q + c] = Math.round(f[o + 4 + c] * 255); }
    }
  }
  /** raw bytes for saving: plane a then plane b */
  toBytes() { this.sync(); const out = new Uint8Array(this.a.length * 2); out.set(this.a); out.set(this.b, this.a.length); return out; }
  fromBytes(u: Uint8Array) {
    const n = this.size * this.size * 4; if (u.length < n * 2) throw new Error('paint: wrong size');
    this.a.set(u.subarray(0, n)); this.b.set(u.subarray(n, n * 2));
    for (let k = 0; k < this.size * this.size; k++) for (let c = 0; c < 4; c++) { this.f[k * 8 + c] = this.a[k * 4 + c] / 255; this.f[k * 8 + 4 + c] = this.b[k * 4 + c] / 255; }
  }
  /** copy of a texel rectangle (undo) */
  grab(i0: number, j0: number, i1: number, j1: number) {
    const S = this.size, w = i1 - i0 + 1, out = new Float32Array(w * (j1 - j0 + 1) * 8);
    for (let j = j0; j <= j1; j++) out.set(this.f.subarray((j * S + i0) * 8, (j * S + i1 + 1) * 8), (j - j0) * w * 8);
    return out;
  }
  put(i0: number, j0: number, i1: number, j1: number, d: Float32Array) {
    const S = this.size, w = i1 - i0 + 1;
    for (let j = j0; j <= j1; j++) this.f.set(d.subarray((j - j0) * w * 8, (j - j0 + 1) * w * 8), (j * S + i0) * 8);
    this.sync(i0, j0, i1, j1);
  }
  /** one brush dab at world (x, z): radius r (m), strength k (0..1), hardness h (0 = soft edge .. 1 = hard);
   *  tool = a ground channel (0..5), 'wild' / 'nowild', or 'erase' (back to the generated ground). Returns the texel rect touched. */
  dab(x: number, z: number, r: number, k: number, h: number, tool: number | 'wild' | 'nowild' | 'erase') {
    const S = this.size, cx = this.tx(x), cy = this.ty(z), rt = r / this.m;
    const i0 = Math.max(0, Math.floor(cx - rt)), i1 = Math.min(S - 1, Math.ceil(cx + rt)), j0 = Math.max(0, Math.floor(cy - rt)), j1 = Math.min(S - 1, Math.ceil(cy + rt));
    const f = this.f;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i - cx, j - cy) / rt; if (d >= 1) continue;
      const e = d <= h ? 1 : 1 - (d - h) / (1 - h), fall = e * e * (3 - 2 * e), a = Math.min(1, k * fall); if (a <= 0) continue;
      const o = (j * S + i) * 8;
      if (tool === 'erase') { for (let c = 0; c < 8; c++) f[o + c] *= 1 - a; continue; }
      if (tool === 'wild') { f[o + 6] += (1 - f[o + 6]) * a; f[o + 7] *= 1 - a; continue; }
      if (tool === 'nowild') { f[o + 7] += (1 - f[o + 7]) * a; f[o + 6] *= 1 - a; continue; }
      for (let c = 0; c < TEX_CH; c++) f[o + c] = c === tool ? f[o + c] + (1 - f[o + c]) * a : f[o + c] * (1 - a);
    }
    this.sync(i0, j0, i1, j1);
    return { i0, j0, i1, j1 };
  }
}
