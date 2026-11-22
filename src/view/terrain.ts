// Terrain textures for painted worlds (world editor, 21.11.2026). Every FreeStylized ground texture listed in
// public/textures/terrain/terrain.json has its own KTX2 files; the six of the texture concept also live in the old
// combined array (terrain_c_*.ktx2), which is the fallback while their own files do not exist. A world only loads the
// textures it uses: their layers are copied into one 2D-array texture (colour + normals), so the ground stays one draw call.
// The ground shader blends up to 16 textures per point from four RGBA weight maps (see GroundWeights).
import * as THREE from 'three';
import { envU, renderer } from './core';
import { GLSL_LAYER, GLSL_NOISE, TERRAIN_LAYERS, TERRAIN_U, ktxFile, lowTex, updateTexQuality } from './textures';
import type { WorldPaint, Rect } from '../world/paint';

export const MAX_TEX = 16;
export interface TerrainInfo { id: string; label: string; cat: string; tile: number; own: boolean }

const BUILTIN: Omit<TerrainInfo, 'own'>[] = [
  { id: 'grass_01', label: 'Gras', cat: 'Gras', tile: 3.5 }, { id: 'moss_ground_02', label: 'Moos', cat: 'Waldboden', tile: 3 },
  { id: 'ground_02', label: 'Feldboden', cat: 'Erde', tile: 3 }, { id: 'ground_06', label: 'Pfad', cat: 'Erde', tile: 2.6 },
  { id: 'grass_04', label: 'Trockenrasen', cat: 'Gras', tile: 3.8 }, { id: 'cobblestone_01', label: 'Pflaster', cat: 'Stein', tile: 2.2 },
];
let list: Promise<TerrainInfo[]> | null = null;
/** every terrain texture there is (terrain.json, else the six of the texture concept) */
export function terrainList(): Promise<TerrainInfo[]> {
  list ??= fetch(import.meta.env.BASE_URL + 'textures/terrain/terrain.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() as Promise<Omit<TerrainInfo, 'own'>[]> : [])
    .catch(() => [] as Omit<TerrainInfo, 'own'>[])
    .then(own => {
      const out: TerrainInfo[] = own.map(t => ({ id: t.id, tile: t.tile ?? 3, cat: t.cat ?? 'Sonstiges', label: t.label ?? t.id, own: true }));
      for (const b of BUILTIN) if (!out.some(t => t.id === b.id)) out.push({ ...b, own: false });
      return out;
    });
  return list;
}
export const swatchUrl = (id: string) => import.meta.env.BASE_URL + 'textures/swatch/' + id + '.jpg';

/** one layer (all mip levels) of a terrain texture: from its own file or from the combined array */
async function slices(t: TerrainInfo, kind: 'c' | 'n', res: number): Promise<{ tex: THREE.CompressedTexture; mips: Uint8Array[] }> {
  let tex: THREE.CompressedTexture, layer = 0;
  if (t.own) tex = await ktxFile(`terrain/${t.id}_${kind}_${res}.ktx2`);
  else { tex = await ktxFile(kind === 'c' ? `terrain/terrain_c_${res}.ktx2` : 'terrain/terrain_n_1024.ktx2'); layer = Math.max(0, (TERRAIN_LAYERS as readonly string[]).indexOf(t.id)); }
  const depth = (tex as unknown as { isCompressedArrayTexture?: boolean }).isCompressedArrayTexture ? (tex.image as unknown as { depth: number }).depth : 1;
  const mips = (tex.mipmaps as unknown as { data: Uint8Array }[]).map(m => { const n = m.data.length / depth; return m.data.subarray(layer * n, (layer + 1) * n); });
  return { tex, mips };
}
/** 2D-array texture with the given textures as layers 0..n-1 (missing ones repeat the first) */
async function buildArray(ids: string[], kind: 'c' | 'n', res: number) {
  const all = await terrainList();
  const got = await Promise.all(ids.map(id => { const t = all.find(x => x.id === id) ?? all[0]; return slices(t, kind, res).catch(e => { console.error('terrain', id, e); return null; }); }));
  const first = got.find(g => g); if (!first) return null;
  const src = first.tex, M = src.mipmaps as unknown as { width: number; height: number }[];
  const ok = got.map(g => g && g.mips.length === first.mips.length && g.mips[0].length === first.mips[0].length ? g : first);
  const mips = M.map((m, k) => { const n = first.mips[k].length, d = new Uint8Array(n * ids.length); ok.forEach((g, i) => d.set(g.mips[k], i * n)); return { data: d, width: m.width, height: m.height }; });
  const arr = new THREE.CompressedArrayTexture(mips as unknown as ImageData[], M[0].width, M[0].height, ids.length, src.format as THREE.CompressedPixelFormat, src.type);
  arr.colorSpace = src.colorSpace; arr.wrapS = arr.wrapT = THREE.RepeatWrapping; arr.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  arr.minFilter = mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; arr.magFilter = THREE.LinearFilter; arr.generateMipmaps = false; arr.needsUpdate = true;
  return arr;
}

/** per-texel weights of up to 16 textures (slot order = layer order in the array texture), from base + paint layers */
export class GroundWeights {
  slots: string[] = [];
  tex: THREE.DataTexture[];
  private data: Uint8Array[];
  constructor(public paint: WorldPaint) {
    const S = paint.size;
    this.data = Array.from({ length: MAX_TEX / 4 }, () => new Uint8Array(S * S * 4));
    this.tex = this.data.map(d => { const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t; });
    this.updateSlots();
  }
  /** textures in use (base first); returns true when the list changed */
  updateSlots() {
    const want = [this.paint.base]; for (const L of this.paint.layers) if (!want.includes(L.tex) && want.length < MAX_TEX) want.push(L.tex);
    const changed = want.join() !== this.slots.join(); this.slots = want; return changed;
  }
  /** recompute a texel rect (default: all) and upload it */
  compose(R: Rect = this.paint.full(), upload = true) {
    const P = this.paint, S = P.size, n = this.slots.length, w = new Float32Array(MAX_TEX), D = this.data;
    const lay = P.layers.filter(L => L.vis).map(L => ({ m: L.m, s: this.slots.indexOf(L.tex) })).filter(l => l.s >= 0);
    for (let j = R.j0; j <= R.j1; j++) for (let i = R.i0; i <= R.i1; i++) {
      const k = j * S + i; w.fill(0, 0, n); w[0] = 1;
      for (const l of lay) { const a = l.m[k] / 255; if (a <= 0) continue; for (let c = 0; c < n; c++) w[c] *= 1 - a; w[l.s] += a; }
      const o = k * 4; for (let c = 0; c < MAX_TEX; c++) D[c >> 2][o + (c & 3)] = c < n ? Math.round(w[c] * 255) : 0;
    }
    if (upload) this.upload(R);
  }
  private sub: THREE.DataTexture | null = null;
  /** upload only the changed rect (texSubImage2D) */
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

/** ground of a painted world: blends the slots of GroundWeights; the array textures follow the slots (setSlots) */
export function layeredGround(W: GroundWeights) {
  const low = lowTex();
  updateTexQuality();
  const flat = (rgb: number[]) => { const d = new Uint8Array(4 * MAX_TEX); for (let i = 0; i < MAX_TEX; i++) d.set([...rgb, 255], i * 4); const t = new THREE.DataArrayTexture(d, 1, 1, MAX_TEX); t.needsUpdate = true; return t; };
  const U = {
    tCol: { value: flat([150, 140, 90]) as THREE.Texture }, tNor: { value: flat([128, 128, 255]) as THREE.Texture },
    tW0: { value: W.tex[0] }, tW1: { value: W.tex[1] }, tW2: { value: W.tex[2] }, tW3: { value: W.tex[3] },
    uN: { value: 1 }, uTileL: { value: new Array(MAX_TEX).fill(3) }, uExt: { value: W.paint.extent },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
  let req = 0;
  /** load the textures of the current slots (async; the old ones stay until the new array is ready) */
  const setSlots = async () => {
    const ids = [...W.slots], my = ++req, all = await terrainList();
    U.uTileL.value = Array.from({ length: MAX_TEX }, (_, i) => all.find(t => t.id === ids[i])?.tile ?? 3);
    const [c, n] = await Promise.all([buildArray(ids, 'c', low ? 512 : 1024), low ? Promise.resolve(null) : buildArray(ids, 'n', 1024)]);
    if (my !== req) { c?.dispose(); n?.dispose(); return; }
    const oc = U.tCol.value, on = U.tNor.value;
    if (c) U.tCol.value = c; if (n) U.tNor.value = n; U.uN.value = ids.length;
    if (Math.max(1, ids.length) !== NL) mat.needsUpdate = true; // other slot count: new loop bounds
    if (c && oc !== c) setTimeout(() => oc.dispose(), 500); if (n && on !== n) setTimeout(() => on.dispose(), 500);
  };
  /** loops only over the slots in use (compile-time constant, performance plan 3: the 16-slot loops cost ~10 % of the frame) */
  let NL = Math.max(1, W.slots.length);
  mat.onBeforeCompile = sh => {
    NL = Math.max(1, W.slots.length);
    Object.assign(sh.uniforms, TERRAIN_U, U, { uDay: envU.uDay, uSnow: envU.uSnow, uAutumn: envU.uAutumn });
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWP;
uniform float uDay, uSnow, uAutumn, uSharp, uFray, uVary, uNorK, uNorOn, uExt;
uniform float uTileL[${MAX_TEX}];
uniform int uN;
uniform sampler2D tW0, tW1, tW2, tW3;
uniform sampler2DArray tCol, tNor;
vec3 gNor = vec3(0.);
${GLSL_NOISE}
${GLSL_LAYER}
` + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
  vec2 p = vWP.xz;
  vec2 wuv = clamp(vec2(p.x/uExt + .5, .5 - p.y/uExt), vec2(0.), vec2(1.));
  vec4 A0 = texture2D(tW0, wuv), A1 = ${NL > 4 ? 'texture2D(tW1, wuv)' : 'vec4(0.)'}, A2 = ${NL > 8 ? 'texture2D(tW2, wuv)' : 'vec4(0.)'}, A3 = ${NL > 12 ? 'texture2D(tW3, wuv)' : 'vec4(0.)'};
  float w[${MAX_TEX}];
  w[0]=A0.r; w[1]=A0.g; w[2]=A0.b; w[3]=A0.a; w[4]=A1.r; w[5]=A1.g; w[6]=A1.b; w[7]=A1.a;
  w[8]=A2.r; w[9]=A2.g; w[10]=A2.b; w[11]=A2.a; w[12]=A3.r; w[13]=A3.g; w[14]=A3.b; w[15]=A3.a;
  float k = tNoise(p*.35);
  // ragged borders: every texture gets its own noise "height", the highest ones win (no clean round brush edge)
  float fr = .7*uFray/.55, mx = -9.;
  float t[${MAX_TEX}];
  for (int i = 0; i < ${NL}; i++) { t[i] = (i < uN && w[i] > .004) ? w[i] + (tFbm(p*.42 + float(i)*3.37 + 1.3) - .5)*fr*min(1., w[i]*4.) : -9.; mx = max(mx, t[i]); }
  mx -= .22/max(uSharp/2.5, .3);
  float qs = 0.;
  for (int i = 0; i < ${NL}; i++) qs += max(t[i] - mx, 0.);
  bool useN = uNorOn > .5;
  vec3 gc = vec3(0.);
  for (int i = 0; i < ${NL}; i++) { float q = max(t[i] - mx, 0.)/max(qs, 1e-4); if (q > .003) layerS(tCol, tNor, float(i), p/uTileL[i], k, gc, gNor, q, useN); }
  float lf = tFbm(p*.035+7.), lf2 = tFbm(p*.07+2.), n1 = tFbm(p*.18), n3 = tFbm(p*.6+5.);
  gc *= mix(vec3(1.), mix(vec3(.86, .92, 1.02), vec3(1.1, 1.05, .9), lf), uVary) * (1. + (lf2-.5)*uVary*1.2);
  // outside the map: darker the further out
  float outM = max(max(abs(p.x), abs(p.y)) - uExt*.5, 0.);
  float rimB = mix(1., .4, smoothstep(0., 30., outM));
  float dim = mix(rimB, .45 + .55*rimB, uDay) * mix(.42, .78, uDay);
  gc *= dim * 1.12;
  gc = mix(gc, gc * vec3(1.25, .98, .6), uAutumn * .7);
  float sn = uSnow * smoothstep(.3, .62, n1*.7 + n3*.45 + uSnow*.45);
  gc = mix(gc, vec3(.93, .96, 1.) * (.82 + .18*n3) * dim * 1.25, sn);
  diffuseColor.rgb *= gc;`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
  { vec3 tn = normalize(vec3(gNor.xy*uNorK, max(gNor.z, .2)));
    normal = normalize((viewMatrix * vec4(tn.x, tn.z, -tn.y, 0.)).xyz); }`);
  };
  mat.customProgramCacheKey = () => 'groundL1-' + Math.max(1, W.slots.length);
  void setSlots();
  return { mat, setSlots, U };
}
