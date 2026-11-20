// Textures and the materials built from them (see CREDITS.md). Terrain, buildings and rocks: FreeStylized as KTX2
// (texture concept 20.11.2026). Older juliovii JPEGs: beds of the old game, lava bed and the VFX lab.
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { envU, gfx, isTouch, renderer } from './core';

const loader = new THREE.TextureLoader();
const BASE = import.meta.env.BASE_URL + 'textures/';
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
function tex(name: string, color = true) {
  const t = loader.load(BASE + name + '.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
const pair = (n: string) => ({ c: tex(n), n: tex(n + '_n', false) });

// shared GLSL: value noise
const NOISE = /* glsl */`
float tHash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float tNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(tHash(i),tHash(i+vec2(1,0)),f.x), mix(tHash(i+vec2(0,1)),tHash(i+vec2(1,1)),f.x), f.y); }
float tFbm(vec2 p){ return tNoise(p)*.55 + tNoise(p*2.13+7.1)*.3 + tNoise(p*4.37+3.3)*.15; }`;

// ---------------- texture concept 20.11.2026: FreeStylized, KTX2 (Basis Universal) ----------------
// Terrain: one material, one draw call. All terrain layers sit in one 2D-array texture (colour) + one (normals);
// a paintable RGBA splatmap picks the layers (see HofWorld.splat), noise frays the borders, low-frequency noise
// varies the colour over large areas, and every layer is sampled twice with a randomly rotated + shifted UV per
// noise cell (blended by a smooth index), so no tile repeat is visible.
/** layer order in terrain_c_*.ktx2 / terrain_n_1024.ktx2 (tools/build-textures.mjs) */
export const TERRAIN_LAYERS = ['grass_01', 'moss_ground_02', 'ground_02', 'ground_06', 'grass_04', 'cobblestone_01'] as const;

/** tunables from balancing.yaml (texturen), shared as uniforms so the yaml values apply without recompiling */
export interface TexCfg {
  gelaende?: { kachel?: Partial<Record<'gras' | 'moos' | 'feld' | 'pfad' | 'trocken' | 'pflaster', number>>; mischschaerfe?: number; rauschen?: number; farbvariation?: number; normalstaerke?: number };
  gebaeude?: { kachel?: Partial<Record<'holz' | 'holzSchuppen' | 'dach' | 'stein' | 'fels', number>>; normalstaerke?: number };
}
const TU = {
  uTile: { value: [3.5, 3, 3, 2.6, 3.8, 2.2] }, uSharp: { value: 2.5 }, uFray: { value: .55 }, uVary: { value: .3 }, uNorK: { value: .9 }, uNorOn: { value: 1 },
};
const PROP_TILE: Record<string, number> = { holz: 2, holzSchuppen: 1.6, dach: 2.2, stein: 1.8, fels: 2 };
const propNorK = { value: 1 };
const propTileU = new Map<string, { value: number }>();
export function setTexCfg(c: TexCfg | undefined) {
  const g = c?.gelaende, k = g?.kachel ?? {};
  TU.uTile.value = [k.gras ?? 3.5, k.moos ?? 3, k.feld ?? 3, k.pfad ?? 2.6, k.trocken ?? 3.8, k.pflaster ?? 2.2];
  TU.uSharp.value = g?.mischschaerfe ?? 2.5; TU.uFray.value = g?.rauschen ?? .55; TU.uVary.value = g?.farbvariation ?? .3; TU.uNorK.value = g?.normalstaerke ?? .9;
  Object.assign(PROP_TILE, c?.gebaeude?.kachel ?? {}); propNorK.value = c?.gebaeude?.normalstaerke ?? 1;
  for (const [key, u] of propTileU) u.value = PROP_TILE[key] ?? 2;
}
/** low = phone or quality "niedrig": 512 px terrain without normal maps (resolution picked when the world is built) */
const lowTex = () => isTouch || gfx.quality === 'niedrig';
/** call when the quality changes: terrain normal maps off on "niedrig" and on phones (uniform, no recompile) */
export function updateTexQuality() { TU.uNorOn.value = lowTex() ? 0 : 1; }

let ktx: KTX2Loader | null = null;
function loadKtx(file: string, done: (t: THREE.CompressedTexture) => void) {
  ktx ??= new KTX2Loader().setTranscoderPath(import.meta.env.BASE_URL + 'basis/').detectSupport(renderer);
  ktx.load(BASE + file, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
    done(t as THREE.CompressedTexture);
  }, undefined, e => console.error('ktx2', file, e));
}
/** a KTX2 file of public/textures (cached, also for the world editor's terrain layers) */
const ktxCache = new Map<string, Promise<THREE.CompressedTexture>>();
export function ktxFile(file: string): Promise<THREE.CompressedTexture> {
  let p = ktxCache.get(file);
  if (!p) { p = new Promise((res, rej) => { ktx ??= new KTX2Loader().setTranscoderPath(import.meta.env.BASE_URL + 'basis/').detectSupport(renderer); ktx.load(BASE + file, t => res(t as THREE.CompressedTexture), undefined, rej); }); ktxCache.set(file, p); p.catch(() => ktxCache.delete(file)); }
  return p;
}
export { NOISE as GLSL_NOISE, ARR_GLSL as GLSL_LAYER, TU as TERRAIN_U, lowTex };
/** placeholders until the KTX2 file is transcoded (plain colour; flat normals) */
function flatArray(layers: number, rgb: [number, number, number]) {
  const d = new Uint8Array(4 * layers); for (let i = 0; i < layers; i++) d.set([...rgb, 255], i * 4);
  const t = new THREE.DataArrayTexture(d, 1, 1, layers); t.needsUpdate = true; return t;
}
function flat2D(rgb: [number, number, number]) { const t = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1); t.needsUpdate = true; return t; }

const ARR_GLSL = /* glsl */`
precision highp sampler2DArray;
// one layer, two samples: UV rotated + shifted per noise cell, cells blended by a smooth index (k)
void layerS(sampler2DArray C, sampler2DArray N, float L, vec2 uv, float k, inout vec3 col, inout vec3 nor, float w, bool useN){
  float l = k*6., ia = floor(l), f = fract(l);
  float ra = tHash(vec2(ia, L*7.1+.3))*6.2832, rb = tHash(vec2(ia+1., L*7.1+.3))*6.2832;
  mat2 Ra = mat2(cos(ra), sin(ra), -sin(ra), cos(ra)), Rb = mat2(cos(rb), sin(rb), -sin(rb), cos(rb));
  vec2 oa = sin(vec2(3.,7.)*ia), ob = sin(vec2(3.,7.)*(ia+1.));
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 ca = textureGrad(C, vec3(Ra*uv+oa, L), Ra*dx, Ra*dy).rgb, cb = textureGrad(C, vec3(Rb*uv+ob, L), Rb*dx, Rb*dy).rgb;
  float t = smoothstep(.2, .8, f - .1*dot(ca-cb, vec3(1.)));
  col += mix(ca, cb, t)*w;
  if (useN) {
    vec3 na = textureGrad(N, vec3(Ra*uv+oa, L), Ra*dx, Ra*dy).rgb*2.-1., nb = textureGrad(N, vec3(Rb*uv+ob, L), Rb*dx, Rb*dy).rgb*2.-1.;
    na.xy = na.xy*Ra; nb.xy = nb.xy*Rb;                      // rotate the normals back (v*R = transpose(R)*v = inverse)
    nor += mix(na, nb, t)*w;
  } else nor += vec3(0., 0., 1.)*w;
}`;

/** world-space ground. splat (RGBA, paintable): r moss, g field earth, b trodden path, a pavement; grass is the base.
 *  lush (r): pure grass_01 under the wild grass patches (no moss, no dry spots), ragged soft border.
 *  rim: clearing radii, the ground darkens towards the deep forest.
 *  paint (world editor, optional, src/world/paint.ts): a = grass, moss, field, path; b = dry grass, pavement, wild grass
 *  added, wild grass removed. Where painted it replaces the generated mix (noise-frayed, height blend between strokes). */
const noPaint = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); noPaint.needsUpdate = true;
export function groundMaterial(splat: THREE.Texture, lush: THREE.Texture, rim: { rx: number; rz: number }, paint: { a: THREE.Texture; b: THREE.Texture } = { a: noPaint, b: noPaint }) {
  const low = lowTex(), n = TERRAIN_LAYERS.length;
  updateTexQuality();
  const U = { tCol: { value: flatArray(n, [70, 92, 48]) as THREE.Texture }, tNor: { value: flatArray(n, [128, 128, 255]) as THREE.Texture } };
  loadKtx(`terrain/terrain_c_${low ? 512 : 1024}.ktx2`, t => { U.tCol.value = t; });
  if (!low) loadKtx('terrain/terrain_n_1024.ktx2', t => { U.tNor.value = t; });
  const mat = new THREE.MeshStandardMaterial({ map: splat, roughness: 1 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, TU, U, { tLush: { value: lush }, tPaintA: { value: paint.a }, tPaintB: { value: paint.b }, uRim: { value: new THREE.Vector2(rim.rx, rim.rz) }, uDay: envU.uDay, uSnow: envU.uSnow, uAutumn: envU.uAutumn });
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWP;
uniform float uDay, uSnow, uAutumn, uTile[6], uSharp, uFray, uVary, uNorK, uNorOn;
uniform vec2 uRim;
uniform sampler2D tLush, tPaintA, tPaintB;
uniform sampler2DArray tCol, tNor;
vec3 gNor = vec3(0.);
${NOISE}
${ARR_GLSL}
` + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
  vec4 sp = texture2D(map, vMapUv);            // r moss, g field, b path, a pavement
  vec2 p = vWP.xz;
  float n1 = tFbm(p*.18), n2 = tFbm(p*.11+13.), n3 = tFbm(p*.6+5.);
  float k = tNoise(p*.35);                     // anti-tiling cell index
  float e = .5/max(uSharp, .5);                // blend width (balancing: mischschaerfe)
  float lush = smoothstep(.3, .7, texture2D(tLush, vMapUv).r + (n3-.5)*.45 + (n1-.5)*.3);
  vec4 pA = texture2D(tPaintA, vMapUv), pB = texture2D(tPaintB, vMapUv);
  // painted wild grass (editor): pure grass under it, none where it was removed
  lush = clamp(lush*(1.-smoothstep(.1, .8, pB.a + (n3-.5)*.4)) + smoothstep(.1, .7, pB.b + (n3-.5)*.4)*.9, 0., 1.);
  float co = smoothstep(.5-e, .5+e, sp.a + (n3-.5)*uFray*.6 + (n1-.5)*uFray*.3);
  float pa = smoothstep(.5-e, .5+e, sp.b + (n3-.5)*uFray + (n1-.5)*uFray*.45);
  float fi = smoothstep(.5-e, .5+e, sp.g + (n3-.5)*uFray*.8 + (n2-.5)*uFray*.5);
  float mo = smoothstep(.5-e, .5+e, sp.r + (n1-.5)*uFray*1.2 + (n3-.5)*uFray*.5) * (1.-lush);
  float dr = smoothstep(.56, .8, n2) * (1.-lush);
  // stack (top wins): pavement > path > field > moss > dry grass > grass
  float wCo = co, r0 = 1.-co;
  float wPa = pa*r0; r0 *= 1.-pa;
  float wFi = fi*r0; r0 *= 1.-fi;
  float wMo = mo*r0; r0 *= 1.-mo;
  float wDr = dr*r0, wGr = r0*(1.-dr);
  // painted ground (world editor): replaces the generated mix where painted; ragged borders from noise, between two
  // painted layers a noise "height" decides, so strokes never show a clean round brush edge
  float pS = pA.r+pA.g+pA.b+pA.a+pB.r+pB.g;
  if (pS > .004) {
    float cov = smoothstep(0., 1., clamp(pS + (n3-.5)*1.6*pS*(1.-pS) + (n1-.5)*.6*pS*(1.-pS), 0., 1.));
    float iS = 1./pS;
    float t0 = pA.r > .004 ? pA.r*iS + (tFbm(p*.42+1.3)-.5)*.7 : -9., t1 = pA.g > .004 ? pA.g*iS + (tFbm(p*.42+4.1)-.5)*.7 : -9.;
    float t2 = pA.b > .004 ? pA.b*iS + (tFbm(p*.42+7.7)-.5)*.7 : -9., t3 = pA.a > .004 ? pA.a*iS + (tFbm(p*.42+9.2)-.5)*.7 : -9.;
    float t4 = pB.r > .004 ? pB.r*iS + (tFbm(p*.42+12.5)-.5)*.7 : -9., t5 = pB.g > .004 ? pB.g*iS + (tFbm(p*.42+15.9)-.5)*.7 : -9.;
    float mx = max(max(max(t0,t1),max(t2,t3)),max(t4,t5)) - .22;
    float q0 = max(t0-mx,0.), q1 = max(t1-mx,0.), q2 = max(t2-mx,0.), q3 = max(t3-mx,0.), q4 = max(t4-mx,0.), q5 = max(t5-mx,0.);
    float qs = cov/max(q0+q1+q2+q3+q4+q5, 1e-4), k0 = 1.-cov;
    wGr = wGr*k0 + q0*qs; wMo = wMo*k0 + q1*qs; wFi = wFi*k0 + q2*qs; wPa = wPa*k0 + q3*qs; wDr = wDr*k0 + q4*qs; wCo = wCo*k0 + q5*qs;
  }
  bool useN = uNorOn > .5;
  vec3 gc = vec3(0.);
  if (wGr>.003) layerS(tCol, tNor, 0., p/uTile[0], k, gc, gNor, wGr, useN);
  if (wMo>.003) layerS(tCol, tNor, 1., p/uTile[1], k, gc, gNor, wMo, useN);
  if (wFi>.003) layerS(tCol, tNor, 2., p/uTile[2], k, gc, gNor, wFi, useN);
  if (wPa>.003) layerS(tCol, tNor, 3., p/uTile[3], k, gc, gNor, wPa, useN);
  if (wDr>.003) layerS(tCol, tNor, 4., p/uTile[4], k, gc, gNor, wDr, useN);
  if (wCo>.003) layerS(tCol, tNor, 5., p/uTile[5], k, gc, gNor, wCo, useN);
  float wLawn = wGr + wDr + wMo, wBare = wFi + wPa + wCo;
  // large-scale colour variation (low-frequency noise): lighter/yellower and darker/bluer areas
  float lf = tFbm(p*.035+7.), lf2 = tFbm(p*.07+2.);
  gc *= mix(vec3(1.), mix(vec3(.86, .92, 1.02), vec3(1.1, 1.05, .9), lf), uVary) * (1. + (lf2-.5)*uVary*1.2);
  // darker towards the deep forest (softer by day)
  float rimB = mix(1., .47, clamp((length(p/uRim)-.9)/1.3, 0., 1.));
  float dim = mix(rimB, .45 + .55*rimB, uDay) * mix(.42, .78, uDay);
  gc *= dim * 1.12;
  // seasons (18.11.2026): autumn turns the lawn to straw, snow covers the ground in soft drifts (thinner on bare earth)
  gc = mix(gc, gc * vec3(1.25, .98, .6), uAutumn * wLawn * .7);
  float sn = uSnow * smoothstep(.3, .62, n1*.7 + n3*.45 + uSnow*.45 - wBare*.2);
  gc = mix(gc, vec3(.93, .96, 1.) * (.82 + .18*n3) * dim * 1.25, sn);
  diffuseColor.rgb *= gc;`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
  { vec3 tn = normalize(vec3(gNor.xy*uNorK, max(gNor.z, .2)));
    normal = normalize((viewMatrix * vec4(tn.x, tn.z, -tn.y, 0.)).xyz); }`);   // KTX2 is not flipped: +green points to -z
  };
  mat.customProgramCacheKey = () => 'ground2';
  return mat;
}

// ---------------- buildings, rocks: tri-planar in object space (metres) with a hard axis blend ----------------
type Maps = { c: THREE.Texture; n: THREE.Texture };
const propCache = new Map<string, { c: THREE.Texture | null; n: THREE.Texture | null; wait: ((m: Maps) => void)[] }>();
function propTex(name: string, set: (m: Maps) => void) {
  let e = propCache.get(name);
  if (!e) {
    const E = e = { c: null as THREE.Texture | null, n: null as THREE.Texture | null, wait: [] as ((m: Maps) => void)[] };
    propCache.set(name, E);
    const fin = () => { if (E.c && E.n) { const m = { c: E.c, n: E.n }; E.wait.forEach(f => f(m)); E.wait = []; } };
    loadKtx(`props/${name}_c.ktx2`, t => { E.c = t; fin(); });
    loadKtx(`props/${name}_n.ktx2`, t => { E.n = t; fin(); });
  }
  if (e.c && e.n) set({ c: e.c, n: e.n }); else e.wait.push(set);
}
/** PBR prop material from the texture concept: colour + normal map only, roughness constant, tri-planar in object space so
 *  boxes of any size keep the texture scale (tileKey -> balancing texturen.gebaeude.kachel, metres per repeat).
 *  Object space: the texture sticks to moving parts (doors, sails). */
export function propMaterial(name: string, tileKey: string, o: { color?: number; roughness?: number; side?: THREE.Side } = {}) {
  const U = { tPC: { value: flat2D([150, 130, 110]) as THREE.Texture }, tPN: { value: flat2D([128, 128, 255]) as THREE.Texture } };
  let tile = propTileU.get(tileKey); if (!tile) propTileU.set(tileKey, tile = { value: PROP_TILE[tileKey] ?? 2 });
  propTex(name, m => { U.tPC.value = m.c; U.tPN.value = m.n; });
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, roughness: o.roughness ?? .85, side: o.side ?? THREE.FrontSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uPTile: tile, uPNorK: propNorK });
    sh.vertexShader = 'varying vec3 vOP;\nvarying vec3 vON;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = `varying vec3 vOP;
varying vec3 vON;
uniform sampler2D tPC, tPN;
uniform float uPTile, uPNorK;
uniform mat3 normalMatrix;
vec3 pObjN = vec3(0.);
// one projection axis: uv on the plane, T/B = object-space directions of +u/+v (KTX2 not flipped: +green = -v)
void pAxis(vec2 uv, vec3 N, vec3 T, vec3 B, float w, inout vec3 col){
  col += texture2D(tPC, uv).rgb*w;
  vec3 tn = texture2D(tPN, uv).rgb*2.-1.;
  pObjN += (N*tn.z + (T*tn.x - B*tn.y)*uPNorK)*w;
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
  { vec3 n = normalize(vON), a = pow(abs(n), vec3(8.)); a /= a.x+a.y+a.z;
    vec3 P = vOP/uPTile, pc = vec3(0.), s = sign(n + 1e-4);
    if (a.x>.01) pAxis(vec2(-P.z*s.x, -P.y), vec3(s.x,0.,0.), vec3(0.,0.,-s.x), vec3(0.,-1.,0.), a.x, pc);
    if (a.z>.01) pAxis(vec2(P.x*s.z, -P.y), vec3(0.,0.,s.z), vec3(s.z,0.,0.), vec3(0.,-1.,0.), a.z, pc);
    if (a.y>.01) pAxis(vec2(P.x*s.y, P.z*s.z), vec3(0.,s.y,0.), vec3(s.y,0.,0.), vec3(0.,0.,s.z), a.y, pc);   // roofs: v runs downhill on both slopes
    diffuseColor.rgb *= pc; }`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
  normal = normalize(normalMatrix * normalize(pObjN));
  #ifdef DOUBLE_SIDED
    normal *= faceDirection;
  #endif`);
  };
  mat.customProgramCacheKey = () => 'prop3';
  return mat;
}
/** cliff_rocks_02 colour + normal (nature rocks use them on their model UVs) */
export function rockMaps(set: (m: Maps) => void) { propTex('cliff_rocks_02', set); }

let bedTex: { c: THREE.Texture; n: THREE.Texture } | null = null;
let lavaTex: { c: THREE.Texture; n: THREE.Texture; e: THREE.Texture } | null = null;
let rockTex: { c: THREE.Texture; n: THREE.Texture } | null = null;

/** world-space UV so neighbouring beds never repeat the same pattern */
function worldUV(mat: THREE.MeshStandardMaterial, scale: number) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec2 wuv = (modelMatrix * vec4(position, 1.0)).xz / ${scale.toFixed(2)};
      #ifdef USE_MAP
        vMapUv = wuv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = wuv;
      #endif
      #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv = wuv;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'wuv' + scale;
  return mat;
}

/** tilled earth for every bed */
export function bedMaterial() {
  bedTex ??= pair('mud');
  return worldUV(new THREE.MeshStandardMaterial({ map: bedTex.c, normalMap: bedTex.n, normalScale: new THREE.Vector2(1.2, -1.2), color: 0x5c4436, roughness: 1 }), 2.6);
}

/** dark lava rock for the chili bed; the emissive cracks are driven by the bed's lava breath */
export function lavaBedMaterial() {
  if (!lavaTex) { const p = pair('lava'); lavaTex = { ...p, e: tex('lava_e') }; }
  return worldUV(new THREE.MeshStandardMaterial({ map: lavaTex.c, normalMap: lavaTex.n, normalScale: new THREE.Vector2(1, -1), color: 0x9a8a80, roughness: .95, emissiveMap: lavaTex.e, emissive: 0xff5a10, emissiveIntensity: .15 }), 2.2);
}

/** stylised grey stone for the border rocks */
export function rockMaterial(color: number) {
  rockTex ??= pair('rock');
  return new THREE.MeshStandardMaterial({ map: rockTex.c, normalMap: rockTex.n, color, roughness: .95, flatShading: true });
}
