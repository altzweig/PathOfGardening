// Painted ground of Classic (boden.html, 23.11.2026, recycled from the Hof world editor): the garden area (extent x extent m)
// at size x size texels. A base texture everywhere, on top any number of texture layers like in an image editor
// (each = one terrain texture + its own coverage mask, can be hidden, deleted, reordered).
// The wet earth around the fields is not painted: the game puts it on top (world.ts setEarthSpots).
// Texel row 0 = world z -extent/2, column 0 = world x -extent/2.
// File: public/world/boden.json = { version: 1, saved, size, extent, base, layers: [{ tex, vis }], data: base64(deflate(masks)) }.
export interface TexLayer { id: number; tex: string; vis: boolean; m: Uint8Array }
export type Rect = { i0: number; j0: number; i1: number; j1: number };
export const unionRect = (a: Rect | null, b: Rect): Rect => a ? { i0: Math.min(a.i0, b.i0), j0: Math.min(a.j0, b.j0), i1: Math.max(a.i1, b.i1), j1: Math.max(a.j1, b.j1) } : { ...b };
/** a brush stamp: weight 0..1 at (u, v) in -1..1 (outside the unit circle = 0) */
export type Stamp = (u: number, v: number) => number;
export interface BodenFile { version: 1; saved: string; size: number; extent: number; base: string; layers: { tex: string; vis: boolean }[]; data: string }

export const BODEN_SIZE = 512, BODEN_EXTENT = 40;

export class BodenPaint {
  base = 'grass_01';
  layers: TexLayer[] = [];
  private nid = 1;
  constructor(public size = BODEN_SIZE, public extent = BODEN_EXTENT) {}
  /** world -> texel coordinates (continuous) */
  tx(x: number) { return (x / this.extent + .5) * this.size - .5; }
  ty(z: number) { return (z / this.extent + .5) * this.size - .5; }
  get m() { return this.extent / this.size; }
  full(): Rect { return { i0: 0, j0: 0, i1: this.size - 1, j1: this.size - 1 }; }
  newLayer(tex: string, at = this.layers.length): TexLayer {
    const L = { id: this.nid++, tex, vis: true, m: new Uint8Array(this.size * this.size) };
    this.layers.splice(at, 0, L); return L;
  }
  /** one dab at world (x, z): radius r (m), strength k (0..1), stamp (shape), rotation rot (rad); erase removes coverage.
   *  Returns the texel rect touched. */
  dab(x: number, z: number, r: number, k: number, stamp: Stamp, rot: number, L: TexLayer, erase = false): Rect {
    const S = this.size, cx = this.tx(x), cy = this.ty(z), rt = Math.max(.5, r / this.m);
    const i0 = Math.max(0, Math.floor(cx - rt)), i1 = Math.min(S - 1, Math.ceil(cx + rt)), j0 = Math.max(0, Math.floor(cy - rt)), j1 = Math.min(S - 1, Math.ceil(cy + rt));
    const c = Math.cos(rot), s = Math.sin(rot), plane = L.m;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i - cx) / rt, dy = (j - cy) / rt; if (dx * dx + dy * dy >= 1) continue;
      const w = stamp(dx * c - dy * s, dx * s + dy * c), a = Math.min(1, k * w); if (a <= .001) continue;
      const q = j * S + i, v = plane[q];
      plane[q] = erase ? Math.round(v * (1 - a)) : Math.round(v + (255 - v) * a);
    }
    return { i0, j0, i1: Math.max(i0, i1), j1: Math.max(j0, j1) };
  }
  fill(L: TexLayer, v: number) { L.m.fill(Math.round(v * 255)); }
  // undo snapshots
  grab(a: Uint8Array, R: Rect) {
    const S = this.size, w = R.i1 - R.i0 + 1, out = new Uint8Array(w * (R.j1 - R.j0 + 1));
    for (let j = R.j0; j <= R.j1; j++) out.set(a.subarray(j * S + R.i0, j * S + R.i1 + 1), (j - R.j0) * w);
    return out;
  }
  put(a: Uint8Array, R: Rect, d: Uint8Array) {
    const S = this.size, w = R.i1 - R.i0 + 1;
    for (let j = R.j0; j <= R.j1; j++) a.set(d.subarray((j - R.j0) * w, (j - R.j0 + 1) * w), j * S + R.i0);
  }
  /** a new ground that looks like the built-in meadow: grass with dry grass patches (same noise as the ground shader) */
  static meadow(): BodenPaint {
    const P = new BodenPaint(), S = P.size, L = P.newLayer('grass_04');
    const fr = (v: number) => v - Math.floor(v);
    const hash = (x: number, y: number) => { x = fr(x * 123.34); y = fr(y * 456.21); const d = x * (x + 45.32) + y * (y + 45.32); x += d; y += d; return fr(x * y); };
    const noise = (x: number, y: number) => { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy; };
    const fbm = (x: number, y: number) => noise(x, y) * .55 + noise(x * 2.13 + 7.1, y * 2.13 + 7.1) * .3 + noise(x * 4.37 + 3.3, y * 4.37 + 3.3) * .15;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = ((i + .5) / S - .5) * P.extent, z = ((j + .5) / S - .5) * P.extent;
      const t = Math.min(1, Math.max(0, (fbm(x * .11 + 13, z * .11 + 13) - .5) / .22));
      L.m[j * S + i] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    return P;
  }
  /** textures in use, base first */
  textures() { const s = [this.base]; for (const L of this.layers) if (!s.includes(L.tex)) s.push(L.tex); return s; }

  // ---------------- file ----------------
  async encode(): Promise<BodenFile> {
    const S = this.size * this.size, raw = new Uint8Array(S * this.layers.length);
    this.layers.forEach((L, i) => raw.set(L.m, S * i));
    return { version: 1, saved: new Date().toISOString(), size: this.size, extent: this.extent, base: this.base, layers: this.layers.map(L => ({ tex: L.tex, vis: L.vis })), data: b64(await pipe(raw, new CompressionStream('deflate'))) };
  }
  static async decode(f: BodenFile): Promise<BodenPaint> {
    const p = new BodenPaint(f.size, f.extent), S = f.size * f.size; p.base = f.base;
    const raw = f.layers.length ? await pipe(unb64(f.data), new DecompressionStream('deflate')) : new Uint8Array(0);
    if (raw.length < S * f.layers.length) throw new Error('boden: wrong size');
    f.layers.forEach((l, i) => { const L = p.newLayer(l.tex); L.vis = l.vis; L.m.set(raw.subarray(S * i, S * (i + 1))); });
    return p;
  }
}

async function pipe(bytes: Uint8Array, s: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(s)).arrayBuffer());
}
function b64(u: Uint8Array) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s: string) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

// ---------------- browser draft (IndexedDB) ----------------
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open('pog-classic-boden', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function saveDraft(f: BodenFile | null) {
  const d = await db();
  await new Promise<void>((res, rej) => { const t = d.transaction('kv', 'readwrite'); if (f) t.objectStore('kv').put(f, 'draft'); else t.objectStore('kv').delete('draft'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function loadDraft(): Promise<BodenFile | null> {
  try {
    const d = await db();
    return await new Promise(res => { const r = d.transaction('kv').objectStore('kv').get('draft'); r.onsuccess = () => res((r.result as BodenFile) ?? null); r.onerror = () => res(null); });
  } catch { return null; }
}
/** the game's ground file (public/world/boden.json), null when there is none */
export async function fetchBodenFile(): Promise<BodenFile | null> {
  try { const r = await fetch(import.meta.env.BASE_URL + 'world/boden.json', { cache: 'no-store' }); if (!r.ok) return null; const f = await r.json() as BodenFile; return f?.version ? f : null; }
  catch { return null; }
}
/** what the game shows: the browser draft with ?boden=entwurf, else the file in the repo; null = the built-in meadow */
export async function loadBoden(): Promise<BodenPaint | null> {
  const draft = new URLSearchParams(location.search).get('boden') === 'entwurf';
  const f = draft ? (await loadDraft()) ?? await fetchBodenFile() : await fetchBodenFile();
  if (!f) return null;
  try { return await BodenPaint.decode(f); } catch (e) { console.error('boden.json', e); return null; }
}
