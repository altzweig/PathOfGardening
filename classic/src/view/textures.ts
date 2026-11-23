// Textures (juliovii, CC BY 4.0; ground: FreeStylized, see CREDITS.md) and the materials built from them.
// Ground: several textures mixed by world-space masks + noise, each sampled with a
// "no tile" lookup (two randomly offset samples blended by a noise index), so no repeat is visible.
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { envU, gfx, isTouch, renderer } from './core';
import type { PaintedU } from './terrain';

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

// shared GLSL: value noise + no-tile sampling of a colour/normal pair
const NOISE = /* glsl */`
float tHash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float tNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(tHash(i),tHash(i+vec2(1,0)),f.x), mix(tHash(i+vec2(0,1)),tHash(i+vec2(1,1)),f.x), f.y); }
float tFbm(vec2 p){ return tNoise(p)*.55 + tNoise(p*2.13+7.1)*.3 + tNoise(p*4.37+3.3)*.15; }
// samples colour + normal at two offsets picked by a smooth noise index and blends them
void noTile(sampler2D C, sampler2D N, vec2 uv, float k, inout vec3 col, inout vec3 nor, float w){
  vec2 dx=dFdx(uv), dy=dFdy(uv);
  float l=k*8.; float ia=floor(l), f=fract(l);
  vec2 oa=sin(vec2(3.,7.)*ia), ob=sin(vec2(3.,7.)*(ia+1.));
  vec3 ca=textureGrad(C,uv+oa,dx,dy).rgb, cb=textureGrad(C,uv+ob,dx,dy).rgb;
  float t=smoothstep(.2,.8,f-.1*dot(ca-cb,vec3(1.)));
  col+=mix(ca,cb,t)*w;
  nor+=(mix(textureGrad(N,uv+oa,dx,dy).rgb, textureGrad(N,uv+ob,dx,dy).rgb, t)*2.-1.)*w;
}`;

// ---------------- ground 23.11.2026: FreeStylized terrain (as in the Hof game), KTX2 2D-array textures ----------------
// One material, one draw call: meadow everywhere (grass_01 with grass_04 patches), wet dark earth only around and
// between the fields (control map r, drawn by world.ts). Every layer is sampled twice with a randomly rotated +
// shifted UV per noise cell, so no tile repeat is visible. Towards the rim the ground dissolves into the fog colour.
// Layer order in terrain_c_*.ktx2 / terrain_n_1024.ktx2: grass_01, moss_ground_02, ground_02, ground_06, grass_04, cobblestone_01
export const lowTex = () => isTouch || gfx.quality === 'niedrig';
const TU = { uNorOn: { value: 1 } };
/** terrain normal maps off on "niedrig" and on phones (uniform, no recompile) */
export function updateTexQuality() { TU.uNorOn.value = lowTex() ? 0 : 1; }
let ktx: KTX2Loader | null = null;
/** the one KTX2 loader (painted ground textures use it too) */
export function ktxLoader() { return ktx ??= new KTX2Loader().setTranscoderPath(import.meta.env.BASE_URL + 'basis/').detectSupport(renderer); }
function loadKtx(file: string, done: (t: THREE.CompressedTexture) => void) {
  ktxLoader().load(BASE + file, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
    done(t as THREE.CompressedTexture);
  }, undefined, e => console.error('ktx2', file, e));
}
function flatArray(layers: number, rgb: [number, number, number]) {
  const d = new Uint8Array(4 * layers); for (let i = 0; i < layers; i++) d.set([...rgb, 255], i * 4);
  const t = new THREE.DataArrayTexture(d, 1, 1, layers); t.needsUpdate = true; return t;
}
const ARR_GLSL = /* glsl */`
precision highp sampler2DArray;
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
    na.xy = na.xy*Ra; nb.xy = nb.xy*Rb;
    nor += mix(na, nb, t)*w;
  } else nor += vec3(0., 0., 1.)*w;
}`;
/** ground tunables (balancing.yaml boden) */
export const GROUND_U = {
  uTileG: { value: 3.5 }, uTileE: { value: 2.8 }, uWet: { value: .62 }, uFogR: { value: new THREE.Vector2(12.5, 19) },
};
/** control (CanvasTexture over the 64 m ground): r = wet earth, g = brightness falloff.
 *  P (boden.html, 23.11.2026): painted meadow instead of the built-in grass mix; wet earth = array layers 0 and 1 */
export function groundMaterial(control: THREE.Texture, P?: PaintedU) {
  const low = lowTex();
  updateTexQuality();
  const U = P ? { tCol: P.tCol, tNor: P.tNor } : { tCol: { value: flatArray(6, [70, 92, 48]) as THREE.Texture }, tNor: { value: flatArray(6, [128, 128, 255]) as THREE.Texture } };
  if (!P) {
    loadKtx(`terrain/terrain_c_${low ? 512 : 1024}.ktx2`, t => { U.tCol.value = t; });
    if (!low) loadKtx('terrain/terrain_n_1024.ktx2', t => { U.tNor.value = t; });
  }
  const mat = new THREE.MeshStandardMaterial({ map: control, roughness: 1 });
  mat.onBeforeCompile = sh => {
    const NL = P ? Math.max(1, P.nl) : 0;
    Object.assign(sh.uniforms, TU, U, GROUND_U, { uDay: envU.uDay, uFogCol: envU.uFogCol }, P ? { tW0: P.tW0, tW1: P.tW1, tW2: P.tW2, uTileL: P.uTileL, uExt: P.uExt } : {});
    // painted meadow: up to 12 textures blended by the weight maps, ragged borders (every texture its own noise "height",
    // the highest ones win, as in the Hof world editor); earth from the control map on top
    const meadow = P ? /* glsl */`
  vec2 wuv = clamp(p/uExt + .5, vec2(0.), vec2(1.));
  vec4 A0 = texture2D(tW0, wuv), A1 = ${NL > 4 ? 'texture2D(tW1, wuv)' : 'vec4(0.)'}, A2 = ${NL > 8 ? 'texture2D(tW2, wuv)' : 'vec4(0.)'};
  float w[12];
  w[0]=A0.r; w[1]=A0.g; w[2]=A0.b; w[3]=A0.a; w[4]=A1.r; w[5]=A1.g; w[6]=A1.b; w[7]=A1.a; w[8]=A2.r; w[9]=A2.g; w[10]=A2.b; w[11]=A2.a;
  float mx = -9., t[12];
  for (int i = 0; i < ${NL}; i++) { t[i] = w[i] > .004 ? w[i] + (tFbm(p*.42 + float(i)*3.37 + 1.3) - .5)*.7*min(1., w[i]*4.) : -9.; mx = max(mx, t[i]); }
  mx -= .22;
  float qs = 0.;
  for (int i = 0; i < ${NL}; i++) qs += max(t[i] - mx, 0.);
  for (int i = 0; i < ${NL}; i++) { float q = max(t[i] - mx, 0.)/max(qs, 1e-4)*(1.-we); if (q > .003) layerS(tCol, tNor, float(i), p/uTileL[i], k, gc, gNor, q, useN); }
  if (e2>.003) layerS(tCol, tNor, 0., p/uTileE, k, gc, gNor, e2, useN);
  if (e6>.003) layerS(tCol, tNor, 1., p/(uTileE*.93), k, gc, gNor, e6, useN);` : /* glsl */`
  float g4 = smoothstep(.5, .72, n2) * (1.-we), g1 = (1.-we)*(1.-g4);
  if (g1>.003) layerS(tCol, tNor, 0., p/uTileG, k, gc, gNor, g1, useN);
  if (g4>.003) layerS(tCol, tNor, 4., p/(uTileG*1.08), k, gc, gNor, g4, useN);
  if (e2>.003) layerS(tCol, tNor, 2., p/uTileE, k, gc, gNor, e2, useN);
  if (e6>.003) layerS(tCol, tNor, 3., p/(uTileE*.93), k, gc, gNor, e6, useN);`;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWP;
uniform float uDay, uNorOn, uTileG, uTileE, uWet;
uniform vec2 uFogR;
uniform vec3 uFogCol;
uniform sampler2DArray tCol, tNor;
${P ? `uniform sampler2D tW0, tW1, tW2;
uniform float uTileL[12], uExt;` : ''}
vec3 gNor = vec3(0.);
float gWet = 0.;
${NOISE}
${ARR_GLSL}
` + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
  vec4 ctl = texture2D(map, vMapUv);
  vec2 p = vWP.xz;
  float n1 = tFbm(p*.18), n2 = tFbm(p*.11+13.), n3 = tFbm(p*.6+5.);
  float k = tNoise(p*.35);
  // wet earth: control map, frayed by noise so the border to the meadow is ragged
  float we = smoothstep(.4, .6, ctl.r + (n3-.5)*.5 + (n1-.5)*.3);
  gWet = we;
  float e2 = we*smoothstep(.35, .65, n1), e6 = we-e2;
  bool useN = uNorOn > .5;
  vec3 gc = vec3(0.);${meadow}
  // wet earth: darker, a little cooler
  gc *= mix(vec3(1.), vec3(.86, .87, .97)*uWet, we);
  float lf = tFbm(p*.035+7.), lf2 = tFbm(p*.07+2.);
  gc *= mix(vec3(.86, .92, 1.02), vec3(1.1, 1.05, .9), lf) * (1. + (lf2-.5)*.36);
  gc *= mix(ctl.g, .45 + .55*ctl.g, uDay) * mix(.47, .87, uDay);
  diffuseColor.rgb *= gc;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(1., .5, gWet);`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
  { vec3 tn = normalize(vec3(gNor.xy*.9, max(gNor.z, .2)));
    normal = normalize((viewMatrix * vec4(tn.x, tn.z, -tn.y, 0.)).xyz); }`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogCol, smoothstep(uFogR.x, uFogR.y, length(vWP.xz) + (tFbm(vWP.xz*.25)-.5)*3.));`);
  };
  mat.customProgramCacheKey = () => P ? 'ground-painted-' + Math.max(1, P.nl) : 'ground-fs';
  return mat;
}

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
