// Brush shapes of the ground painter (boden.html, recycled from the Hof world editor): the plain circle (with hardness), the effect masks of the game's
// particle atlas (Kenney flames/fire/smoke + the drawn glow, star, snowflake, leaf, shard) and random noise maps that fade
// out towards the edge. Every shape is a 128 x 128 weight map sampled bilinearly (rotated per dab by the painter).
import { fxAtlas } from '../fx/atlas';
import type { Stamp } from './paint';

export interface BrushShape { id: string; label: string; thumb: string; map: Float32Array | null }
const N = 128;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sampler(map: Float32Array): (u: number, v: number) => number {
  return (u, v) => {
    const fx = (u * .5 + .5) * (N - 1), fy = (v * .5 + .5) * (N - 1), x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 >= N - 1 || y0 >= N - 1) return 0;
    const a = fx - x0, b = fy - y0, i = y0 * N + x0;
    return (map[i] * (1 - a) + map[i + 1] * a) * (1 - b) + (map[i + N] * (1 - a) + map[i + N + 1] * a) * b;
  };
}
/** stamp of a shape: circle uses hardness as the hard core, masks use it as contrast (soft .. punchy) */
export function stampOf(b: BrushShape, hard: number): Stamp {
  if (!b.map) return (u, v) => { const d = Math.hypot(u, v); if (d >= 1) return 0; const e = d <= hard ? 1 : 1 - (d - hard) / (1 - hard); return e * e * (3 - 2 * e); };
  const s = sampler(b.map), k = 1 + hard * 3;
  return (u, v) => Math.min(1, s(u, v) * k);
}

// ---------------- value noise (seeded) ----------------
function noiseGen(seed: number) {
  const P = new Uint8Array(512); let t = seed >>> 0; const r = () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const h = (x: number, y: number) => P[(P[x & 255] + y) & 511] / 255;
  const vn = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y); let a = x - xi, b = y - yi; a = a * a * (3 - 2 * a); b = b * b * (3 - 2 * b);
    const q = h(xi, yi), w = h(xi + 1, yi), e = h(xi, yi + 1), f = h(xi + 1, yi + 1); return q + (w - q) * a + (e - q) * b + (q - w - e + f) * a * b; };
  return (x: number, y: number, oct = 4) => { let v = 0, amp = .5, f = 1, tot = 0; for (let o = 0; o < oct; o++) { v += vn(x * f + o * 17.3, y * f + o * 9.1) * amp; tot += amp; amp *= .5; f *= 2.03; } return v / tot; };
}
/** noise map with a gradient towards the edge: scale = noise frequency, edge = how far the fade reaches in, kind = look */
function noiseMap(seed: number, scale: number, kind: 'cloud' | 'blot' | 'speckle' | 'fray' | 'streak') {
  const nz = noiseGen(seed), m = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / (N - 1) * 2 - 1, v = y / (N - 1) * 2 - 1, d = Math.hypot(u, v);
    let n = kind === 'streak' ? nz(u * scale * .35, v * scale * 2.2) : nz(u * scale, v * scale);
    let w: number;
    if (kind === 'cloud') w = smooth(.25, .75, n) * (1 - smooth(.35, 1, d));
    else if (kind === 'blot') w = smooth(.48, .58, n + (1 - d) * .35 - .18) * (1 - smooth(.85, 1, d));
    else if (kind === 'speckle') { n = nz(u * scale * 3, v * scale * 3, 2); w = smooth(.55, .7, n) * (1 - smooth(.3, 1, d)); }
    else if (kind === 'fray') w = smooth(0, .2, 1 - d + (n - .5) * .9);
    else w = smooth(.35, .7, n) * (1 - smooth(.4, 1, d));
    m[y * N + x] = Math.max(0, Math.min(1, w));
  }
  return m;
}
function circleMap() {
  const m = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x / (N - 1) * 2 - 1, y / (N - 1) * 2 - 1); m[y * N + x] = 1 - smooth(.55, 1, d); } return m;
}
function thumb(m: Float32Array) {
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d')!, img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = m[i]; img.data[i * 4] = 40 + v * 215; img.data[i * 4 + 1] = 34 + v * 205; img.data[i * 4 + 2] = 22 + v * 160; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return cv.toDataURL();
}
/** one tile of the effect atlas as a weight map (soft fade at the tile edge so no square shows) */
function atlasMap(cv: HTMLCanvasElement, tile: number) {
  const T = cv.width / 4, sx = (tile % 4) * T, sy = Math.floor(tile / 4) * T;
  const c2 = document.createElement('canvas'); c2.width = c2.height = N; const g = c2.getContext('2d')!;
  g.drawImage(cv, sx, sy, T, T, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data, m = new Float32Array(N * N);
  let mx = 0; for (let i = 0; i < N * N; i++) { m[i] = d[i * 4] / 255; mx = Math.max(mx, m[i]); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.hypot(x / (N - 1) * 2 - 1, y / (N - 1) * 2 - 1); m[y * N + x] = m[y * N + x] / (mx || 1) * (1 - smooth(.85, 1, r)); }
  return m;
}

/** all brush shapes (waits until the Kenney tiles are drawn into the atlas) */
export async function loadBrushes(): Promise<BrushShape[]> {
  const out: BrushShape[] = [{ id: 'kreis', label: 'Kreis', thumb: thumb(circleMap()), map: null }];
  const noise: [string, string, number, number, Parameters<typeof noiseMap>[2]][] = [
    ['wolke', 'Wolke', 11, 2.2, 'cloud'], ['wolke2', 'Wolke fein', 23, 4.5, 'cloud'], ['flecken', 'Flecken', 5, 3, 'blot'], ['flecken2', 'Kleckse', 41, 5.5, 'blot'],
    ['sprenkel', 'Gesprenkelt', 17, 4, 'speckle'], ['franse', 'Ausgefranst', 7, 3.5, 'fray'], ['franse2', 'Zerrissen', 29, 7, 'fray'], ['streifen', 'Streifen', 13, 3, 'streak'],
  ];
  for (const [id, label, seed, sc, k] of noise) { const m = noiseMap(seed, sc, k); out.push({ id, label, thumb: thumb(m), map: m }); }
  const tex = fxAtlas(), cv = tex.image as HTMLCanvasElement;
  for (let t = 0; t < 40 && tex.version < 2; t++) await new Promise(r => setTimeout(r, 100));
  const fx: [number, string][] = [[0, 'Flamme'], [1, 'Flamme 2'], [2, 'Flamme 3'], [4, 'Feuer'], [5, 'Feuer 2'], [6, 'Rauch'], [7, 'Rauch 2'], [8, 'Glühen'], [10, 'Stern'], [11, 'Schneeflocke'], [14, 'Blatt'], [15, 'Splitter']];
  for (const [tile, label] of fx) { const m = atlasMap(cv, tile); out.push({ id: 'fx' + tile, label, thumb: thumb(m), map: m }); }
  return out;
}
