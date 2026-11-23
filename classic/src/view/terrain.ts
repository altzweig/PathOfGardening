// Painted ground (boden.html, 23.11.2026, recycled from the Hof world editor). Every nature ground texture of FreeStylized
// listed in public/textures/terrain/terrain.json has its own KTX2 files. The ground only loads the textures it uses:
// their layers are copied into one 2D-array texture (colour + normals), so the ground stays one draw call.
// Slot order = layer order in the array: the two wet-earth textures first (the game puts earth around the fields on top),
// then the base texture and the painted layers. Up to MAX_TEX textures, weights in three RGBA maps.
import * as THREE from 'three';
import { renderer } from './core';
import { ktxLoader, lowTex } from './textures';
import type { BodenPaint, Rect } from '../boden/paint';

export const MAX_TEX = 12;
/** wet earth around the fields: always slots 0 and 1 */
export const EARTH = ['ground_02', 'ground_06'];
export interface TerrainInfo { id: string; label: string; cat: string; tile: number }

let list: Promise<TerrainInfo[]> | null = null;
export function terrainList(): Promise<TerrainInfo[]> {
  list ??= fetch(import.meta.env.BASE_URL + 'textures/terrain/terrain.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() as Promise<TerrainInfo[]> : [])
    .catch(() => [] as TerrainInfo[])
    .then(a => a.map(t => ({ id: t.id, tile: t.tile ?? 3, cat: t.cat ?? 'Sonstiges', label: t.label ?? t.id })));
  return list;
}
export const swatchUrl = (id: string) => import.meta.env.BASE_URL + 'textures/swatch/' + id + '.jpg';

const cache = new Map<string, Promise<THREE.CompressedTexture>>();
async function ktxFile(file: string): Promise<THREE.CompressedTexture> {
  let p = cache.get(file);
  if (!p) {
    p = new Promise<THREE.CompressedTexture>((res, rej) => ktxLoader().load(import.meta.env.BASE_URL + 'textures/terrain/' + file, t => res(t as THREE.CompressedTexture), undefined, rej));
    cache.set(file, p); p.catch(() => cache.delete(file));
  }
  return p;
}
/** 2D-array texture with the given textures as layers 0..n-1 (a missing one repeats the first) */
async function buildArray(ids: string[], kind: 'c' | 'n', res: number) {
  const got = await Promise.all(ids.map(id => ktxFile(`${id}_${kind}_${res}.ktx2`).catch(e => { console.error('terrain', id, e); return null; })));
  const first = got.find(g => g); if (!first) return null;
  const mipsOf = (t: THREE.CompressedTexture) => (t.mipmaps as unknown as { data: Uint8Array; width: number; height: number }[]);
  const M = mipsOf(first);
  const ok = got.map(g => g && mipsOf(g).length === M.length && mipsOf(g)[0].data.length === M[0].data.length ? g : first);
  const mips = M.map((m, k) => { const n = m.data.length, d = new Uint8Array(n * ids.length); ok.forEach((g, i) => d.set(mipsOf(g)[k].data, i * n)); return { data: d, width: m.width, height: m.height }; });
  const arr = new THREE.CompressedArrayTexture(mips as unknown as ImageData[], M[0].width, M[0].height, ids.length, first.format as THREE.CompressedPixelFormat, first.type);
  arr.colorSpace = first.colorSpace; arr.wrapS = arr.wrapT = THREE.RepeatWrapping; arr.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  arr.minFilter = mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; arr.magFilter = THREE.LinearFilter; arr.generateMipmaps = false; arr.needsUpdate = true;
  return arr;
}

/** per-texel weights of the slots, from base + painted layers */
export class BodenWeights {
  slots: string[] = [];
  tex: THREE.DataTexture[];
  private data: Uint8Array[];
  private sub: THREE.DataTexture | null = null;
  constructor(public paint: BodenPaint) {
    const S = paint.size;
    this.data = Array.from({ length: MAX_TEX / 4 }, () => new Uint8Array(S * S * 4));
    this.tex = this.data.map(d => { const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t; });
    this.updateSlots();
  }
  /** textures in use (earth, base, layers); returns true when the list changed */
  updateSlots() {
    const want = [...EARTH]; for (const t of this.paint.textures()) if (!want.includes(t) && want.length < MAX_TEX) want.push(t);
    const changed = want.join() !== this.slots.join(); this.slots = want; return changed;
  }
  compose(R: Rect = this.paint.full(), upload = true) {
    const P = this.paint, S = P.size, n = this.slots.length, w = new Float32Array(MAX_TEX), D = this.data, b = this.slots.indexOf(P.base);
    const lay = P.layers.filter(L => L.vis).map(L => ({ m: L.m, s: this.slots.indexOf(L.tex) })).filter(l => l.s >= 0);
    for (let j = R.j0; j <= R.j1; j++) for (let i = R.i0; i <= R.i1; i++) {
      const k = j * S + i; w.fill(0, 0, n); w[b] = 1;
      for (const l of lay) { const a = l.m[k] / 255; if (a <= 0) continue; for (let c = 0; c < n; c++) w[c] *= 1 - a; w[l.s] += a; }
      const o = k * 4; for (let c = 0; c < MAX_TEX; c++) D[c >> 2][o + (c & 3)] = c < n ? Math.round(w[c] * 255) : 0;
    }
    if (upload) this.upload(R);
  }
  /** upload only the changed rect */
  upload(R: Rect) {
    const S = this.paint.size, full = R.i1 - R.i0 + 1 >= S && R.j1 - R.j0 + 1 >= S;
    for (let t = 0; t < this.tex.length; t++) {
      const dst = this.tex[t];
      if (full || dst.version === 0 || !(renderer.properties.get(dst) as { __webglTexture?: unknown }).__webglTexture) { dst.needsUpdate = true; continue; }
      const w = R.i1 - R.i0 + 1, h = R.j1 - R.j0 + 1, d = new Uint8Array(w * h * 4), src = this.data[t];
      for (let j = 0; j < h; j++) d.set(src.subarray(((R.j0 + j) * S + R.i0) * 4, ((R.j0 + j) * S + R.i1 + 1) * 4), j * w * 4);
      this.sub?.dispose(); this.sub = new THREE.DataTexture(d, w, h, THREE.RGBAFormat); this.sub.needsUpdate = true;
      renderer.copyTextureToTexture(new THREE.Vector2(R.i0, R.j0), this.sub, dst);
    }
  }
}

/** shader inputs of a painted ground (see groundMaterial in textures.ts) */
export interface PaintedU {
  tCol: { value: THREE.Texture }; tNor: { value: THREE.Texture }; tW0: { value: THREE.Texture }; tW1: { value: THREE.Texture }; tW2: { value: THREE.Texture };
  uTileL: { value: number[] }; uExt: { value: number }; nl: number;
}
export function paintedU(W: BodenWeights): PaintedU {
  const flat = (rgb: number[]) => { const d = new Uint8Array(4 * MAX_TEX); for (let i = 0; i < MAX_TEX; i++) d.set([...rgb, 255], i * 4); const t = new THREE.DataArrayTexture(d, 1, 1, MAX_TEX); t.needsUpdate = true; return t; };
  return {
    tCol: { value: flat([70, 92, 48]) }, tNor: { value: flat([128, 128, 255]) },
    tW0: { value: W.tex[0] }, tW1: { value: W.tex[1] }, tW2: { value: W.tex[2] },
    uTileL: { value: new Array(MAX_TEX).fill(3) }, uExt: { value: W.paint.extent }, nl: W.slots.length,
  };
}
let req = 0;
/** load the array textures of the current slots (the old ones stay until the new ones are ready) */
export async function loadSlots(W: BodenWeights, U: PaintedU) {
  const ids = [...W.slots], my = ++req, all = await terrainList(), low = lowTex();
  const tile = Array.from({ length: MAX_TEX }, (_, i) => all.find(t => t.id === ids[i])?.tile ?? 3);
  const [c, n] = await Promise.all([buildArray(ids, 'c', low ? 512 : 1024), low ? Promise.resolve(null) : buildArray(ids, 'n', 1024)]);
  if (my !== req) { c?.dispose(); n?.dispose(); return false; }
  const oc = U.tCol.value, on = U.tNor.value;
  if (c) U.tCol.value = c; if (n) U.tNor.value = n; U.uTileL.value = tile;
  if (c && oc !== c) setTimeout(() => oc.dispose(), 500); if (n && on !== n) setTimeout(() => on.dispose(), 500);
  return true;
}
