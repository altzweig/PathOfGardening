// Terrain textures (juliovii, CC BY 4.0, see CREDITS.md) and the materials built from them.
// Ground: several textures mixed by world-space masks + noise, each sampled with a
// "no tile" lookup (two randomly offset samples blended by a noise index), so no repeat is visible.
import * as THREE from 'three';
import { envU, renderer } from './core';

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

/** world-space ground: lawn (3 textures) around a dirt garden (2 textures), paths + dark rim from the control map */
const noLush = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); noLush.needsUpdate = true;
/** control: r dirt, g patchiness, b brightness; lush (optional, r): pure green lawn under the wild grass patches, ragged soft border */
export function groundMaterial(control: THREE.Texture, lush: THREE.Texture = noLush) {
  const T = { grass: pair('grass'), grassdirt: pair('grassdirt'), dry: pair('dry'), dirt: pair('dirt'), pebble: pair('pebble') };
  const mat = new THREE.MeshStandardMaterial({ map: control, roughness: 1 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      tLush: { value: lush }, tGrass: { value: T.grass.c }, nGrass: { value: T.grass.n }, tGD: { value: T.grassdirt.c }, nGD: { value: T.grassdirt.n },
      uDay: envU.uDay, uSnow: envU.uSnow, uAutumn: envU.uAutumn,
      tDry: { value: T.dry.c }, nDry: { value: T.dry.n }, tDirt: { value: T.dirt.c }, nDirt: { value: T.dirt.n }, tPeb: { value: T.pebble.c }, nPeb: { value: T.pebble.n },
    });
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWP;
uniform float uDay;
uniform float uSnow;
uniform float uAutumn;
uniform sampler2D tLush, tGrass, nGrass, tGD, nGD, tDry, nDry, tDirt, nDirt, tPeb, nPeb;
vec3 gNor = vec3(0.);
${NOISE}
` + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
  vec4 ctl = texture2D(map, vMapUv);           // r: dirt (garden + paths), g: patchiness, b: brightness
  vec2 p = vWP.xz;
  float n1 = tFbm(p*.18), n2 = tFbm(p*.11+13.), n3 = tFbm(p*.6+5.);
  float k = tNoise(p*.35);                     // no-tile index
  // dirt vs lawn: soft, ragged border
  float wDirtAll = smoothstep(.35,.65, ctl.r + (n3-.5)*.55 + (n1-.5)*.25);
  float lush = smoothstep(.3,.7, texture2D(tLush, vMapUv).r + (n3-.5)*.45 + (n1-.5)*.3);   // under wild grass: green lawn, frayed edge
  wDirtAll *= 1.-lush;
  float wLawn = 1.-wDirtAll;
  // lawn: grass, worn grass-dirt and dry straw patches
  float gd = smoothstep(.45,.75, n1*.8 + ctl.g*.35) * (1.-lush), dr = smoothstep(.55,.8, n2) * (1.-gd) * (1.-lush);
  float wGrass = wLawn*(1.-gd)*(1.-dr), wGD = wLawn*gd, wDry = wLawn*dr;
  // garden dirt with pebbly spots
  float pb = smoothstep(.55,.78, n2*.7 + n3*.4);
  float wDirt = wDirtAll*(1.-pb), wPeb = wDirtAll*pb;
  vec3 gc = vec3(0.);
  if (wGrass>.002) noTile(tGrass, nGrass, p/3.6, k, gc, gNor, wGrass);
  if (wGD>.002) noTile(tGD, nGD, p/4.1, k, gc, gNor, wGD);
  if (wDry>.002) noTile(tDry, nDry, p/4.4, k, gc, gNor, wDry);
  if (wDirt>.002) noTile(tDirt, nDirt, p/3.9, k, gc, gNor, wDirt);
  if (wPeb>.002) noTile(tPeb, nPeb, p/3.3, k, gc, gNor, wPeb);
  gc *= (.82 + .36*tFbm(p*.07+2.)) * mix(ctl.b, .45 + .55*ctl.b, uDay) * mix(.42, .78, uDay);     // large-scale light/dark variation + darkness to the rim (softer by day)
  // seasons (18.11.2026): autumn turns the lawn to straw, snow covers the ground in soft drifts (thinner on the garden earth)
  float dim = mix(ctl.b, .45 + .55*ctl.b, uDay) * mix(.42, .78, uDay);
  gc = mix(gc, gc * vec3(1.25, .98, .6), uAutumn * wLawn * .7);
  float sn = uSnow * smoothstep(.3, .62, n1*.7 + n3*.45 + uSnow*.45 - wDirtAll*.2);
  gc = mix(gc, vec3(.93, .96, 1.) * (.82 + .18*n3) * dim * 1.25, sn);
  gc = mix(gc, gc * vec3(.82, 1.12, .62) * 1.05, lush);   // lush lawn under the wild grass: greener
  diffuseColor.rgb *= gc;`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
  { vec3 tn = normalize(vec3(gNor.xy*.9, max(gNor.z, .2)));
    normal = normalize((viewMatrix * vec4(tn.x, tn.z, tn.y, 0.)).xyz); }`);
  };
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
