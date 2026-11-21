// Environment models from Quaternius' "Stylized Nature MegaKit" (CC0, see CREDITS.md).
// public/nature/nature.glb holds the chosen models (bark simplified, meshopt-compressed, no textures; built by
// tools/build-nature.mjs). Textures are loaded once here and shared; every model variant is drawn as one
// InstancedMesh per material, so a whole forest costs only a few draw calls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { envU, renderer, windU } from './core';
import { rockMaps } from './textures';

const BASE = import.meta.env.BASE_URL + 'nature/';
const texLoader = new THREE.TextureLoader();
const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
const texCache = new Map<string, THREE.Texture>();
function tex(file: string) {
  let t = texCache.get(file);
  if (!t) { t = texLoader.load(BASE + file); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.flipY = false; texCache.set(file, t); }
  return t;
}

/** shared shader tweaks for all nature materials:
 *  - wind sway (scaled by height in model space and by the vertex colour gradient on plants)
 *  - night: things in the forest ring sink into darkness with a thin cold rim, so the garden stays the lit stage
 *  - optional glow (mushrooms, flowers) that only comes out at night */
interface NatOpt { wind?: number; glow?: number; glowCol?: number; edge?: boolean; /** season: 'leaf' = turns orange in autumn, bare-brown in winter; 'ever' = stays green; snow lands on every upward face */ season?: 'leaf' | 'ever' | 'none' }
function natMat(mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, o: NatOpt, key: string) {
  const wind = o.wind ?? 0, glow = o.glow ?? 0, season = o.season ?? 'ever';
  if (glow) { mat.emissive = new THREE.Color(o.glowCol ?? 0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = glow; }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: windU, uDay: envU.uDay, uSnow: envU.uSnow, uAutumn: envU.uAutumn, uRim: { value: new THREE.Color(0x30405e) } });
    sh.vertexShader = 'uniform float uTime;\nvarying vec3 vNWP;\nvarying vec3 vNWN;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
      #else
        vec4 ip = vec4(0.);
      #endif
      ${wind ? `{ float h = max(position.y, 0.) ${mat.vertexColors ? '* (.25 + .75 * color.r)' : ''};
        transformed.x += sin(uTime*1.6 + ip.x*.5 + ip.z*.33 + position.y*.4) * ${wind.toFixed(4)} * h;
        transformed.z += cos(uTime*1.2 + ip.x*.3 + position.y*.3) * ${(wind * .6).toFixed(4)} * h; }` : ''}`)
      .replace('#include <project_vertex>', `
      #ifdef USE_INSTANCING
        vNWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
        vNWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
      #else
        vNWP = (modelMatrix * vec4(transformed, 1.)).xyz;
        vNWN = normalize(mat3(modelMatrix) * objectNormal);
      #endif
      #include <project_vertex>`);
    sh.fragmentShader = 'uniform float uDay;\nuniform float uSnow;\nuniform float uAutumn;\nuniform vec3 uRim;\nvarying vec3 vNWP;\nvarying vec3 vNWN;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= .25 + .75 * (1. - uDay);`)
      .replace('#include <fog_fragment>', `
      ${o.edge === false ? '' : `{ float rr = length(vNWP.xz), edge = smoothstep(12.8, 17.5, rr) * (1. - uDay);
        float fr = pow(1. - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * .16 + uRim * fr * .55, edge * .9); }`}
      ${season === 'none' ? '' : `{ // seasons: autumn leaves, bare winter crowns, snow on everything facing up
        float lum = dot(gl_FragColor.rgb, vec3(.3, .59, .11));
        float hh = fract(sin(dot(floor(vNWP.xz * .7), vec2(12.99, 78.23))) * 43758.55);
        ${season === 'leaf' ? `vec3 aut = mix(vec3(1., .42, .08), vec3(.86, .16, .06), hh) * (lum * 2.1 + .02);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, aut, uAutumn * (.55 + .4 * hh));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(.42, .33, .26) * (lum * 1.6 + .02), uSnow * .7);` : ''}
        float up = clamp(vNWN.y, 0., 1.), sn = uSnow * smoothstep(.3, .75, up + (hh - .5) * .3 + uSnow * .25);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(.9, .94, 1.) * clamp(lum * 2.4 + .12, .2, 1.15), sn * .85); }`}
      #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'nat' + key + wind + glow + (o.edge === false ? 'n' : 'e') + season;
  return mat;
}

type Kind = 'bark' | 'leaf' | 'plant' | 'rock' | 'glow' | 'flower';
const MAT_DEF: Record<string, { file: string; kind: Kind; color?: number }> = {
  Bark_TwistedTree: { file: 'bark_twisted.jpg', kind: 'bark', color: 0x8a8f9a },
  Bark_DeadTree: { file: 'bark_dead.jpg', kind: 'bark', color: 0x6a5a58 },
  Bark_NormalTree: { file: 'bark_normal.jpg', kind: 'bark', color: 0x9a9088 },
  Leaves_TwistedTree: { file: 'leaves_twisted.png', kind: 'leaf' },
  Leaves_NormalTree: { file: 'leaves_normal.png', kind: 'leaf' },
  Leaves_Pine: { file: 'leaves_pine.png', kind: 'leaf', color: 0x9ab0b0 },
  Leaves: { file: 'leaves.png', kind: 'plant', color: 0xc0d0c8 },
  Grass: { file: 'grass_blades.png', kind: 'plant', color: 0xb8c8b0 },
  Flowers: { file: 'flowers.png', kind: 'flower' },
  Mushrooms: { file: 'mushrooms.jpg', kind: 'glow' },
  Rocks: { file: 'rocks.jpg', kind: 'rock', color: 0x9aa0a8 },
  PathRocks: { file: 'pathrocks.jpg', kind: 'rock', color: 0xa0a4a8 },
};
const matCache = new Map<string, THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>();
function material(name: string, vc: boolean, scale: number) {
  const d = MAT_DEF[name] ?? { file: 'rocks.jpg', kind: 'rock' as Kind };
  const key = name + vc;
  let m = matCache.get(key); if (m) return m;
  const cut = d.kind === 'leaf' || d.kind === 'plant' || d.kind === 'flower';
  // foliage: Lambert (no specular) - PBR fresnel lit the crown edges up as a bright rim
  m = cut ? new THREE.MeshLambertMaterial({ map: tex(d.file), color: d.color ?? 0xffffff, alphaTest: .35, side: THREE.DoubleSide, vertexColors: vc })
    : new THREE.MeshStandardMaterial({ map: tex(d.file), color: d.color ?? 0xffffff, roughness: d.kind === 'rock' ? .92 : .85, metalness: 0, vertexColors: vc,
      // some Quaternius bark/mushroom meshes have flipped triangles (seen as missing/inverted faces): render both sides
      side: d.kind === 'bark' || d.kind === 'glow' ? THREE.DoubleSide : THREE.FrontSide });
  const wind = d.kind === 'leaf' ? .012 / scale : d.kind === 'plant' || d.kind === 'flower' ? .07 : 0;
  const season = d.kind === 'glow' ? 'none' : d.kind === 'leaf' && name !== 'Leaves_Pine' ? 'leaf' : d.kind === 'plant' || d.kind === 'flower' ? 'leaf' : 'ever';
  natMat(m, { season, wind, glow: d.kind === 'glow' ? 1.4 : d.kind === 'flower' ? .3 : 0, glowCol: d.kind === 'glow' ? 0xb8a0ff : 0xffffff, edge: d.kind !== 'glow' }, key);
  // texture concept 20.11.2026: the big rocks wear FreeStylized cliff_rocks_02 (mossy), on the model UVs (flipY false -> green flipped)
  if (name === 'Rocks') { const s = m as THREE.MeshStandardMaterial; rockMaps(r => { s.map = r.c; s.normalMap = r.n; s.normalScale.set(1, -1); s.color.set(0xc4c8c4); s.needsUpdate = true; }); }
  matCache.set(key, m); return m;
}

/** a foliage material for a custom texture (same wind, night edge and seasons as the pack's plants) */
export function plantMaterial(map: THREE.Texture, key: string, wind = .07, side: THREE.Side = THREE.DoubleSide) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: .4, side });
  return natMat(m, { season: 'leaf', wind }, 'custom' + key);
}

/** one mesh of a model; m = own material (custom models like the fence), otherwise the shared pack material by name */
export interface Part { geo: THREE.BufferGeometry; mat: string; vc: boolean; m?: THREE.Material }
const models = new Map<string, Part[]>();

/** quantized glTF attributes -> plain floats, node transform baked in */
function bake(src: THREE.BufferGeometry, m: THREE.Matrix4) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = src.getAttribute(name) as THREE.BufferAttribute | undefined; if (!a) continue;
    const n = a.itemSize, out = new Float32Array(a.count * n);
    const get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = get[k].call(a, i);
    if (name === 'color') for (let i = 0; i < out.length; i++) out[i] = Math.min(1, .3 + .7 * out[i]); // lift the darkest AO a bit
    g.setAttribute(name, new THREE.BufferAttribute(out, n));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(Array.from(src.index.array as ArrayLike<number>)), 1));
  g.applyMatrix4(m); g.computeBoundingSphere();
  return g;
}

/** leaf cards: bend the normals outward from the crown centre, so a crown shades like one soft volume
 *  instead of hundreds of flickering cards */
function softNormals(g: THREE.BufferGeometry) {
  g.computeBoundingBox(); const c = new THREE.Vector3(); g.boundingBox!.getCenter(c); c.y -= (g.boundingBox!.max.y - g.boundingBox!.min.y) * .25;
  const P = g.getAttribute('position'), Nn = g.getAttribute('normal'), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).sub(c).normalize(); n.fromBufferAttribute(Nn, i);
    n.multiplyScalar(.05).addScaledVector(v, .95).normalize(); Nn.setXYZ(i, n.x, n.y, n.z);
  }
}

let loading: Promise<void> | null = null;
export function loadNature() {
  loading ??= new Promise<void>((res, rej) => {
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    l.load(BASE + 'nature.glb', gltf => {
      for (const root of gltf.scene.children) {
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), parts: Part[] = [];
        root.traverse(o => {
          const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
          const geo = bake(mesh.geometry, rel), mat = mats[0].name;
          if (MAT_DEF[mat]?.kind === 'leaf') softNormals(geo);
          parts.push({ geo, mat, vc: !!mesh.geometry.getAttribute('color') });
        });
        models.set(root.name, parts);
      }
      res();
    }, undefined, rej);
  });
  return loading;
}
export const hasModel = (name: string) => models.has(name);
/** all loaded model names (pack + custom) */
export const modelNames = () => [...models.keys()];
/** add a custom model (built in code, e.g. fence) so it can be instanced like the pack models */
export function registerModel(name: string, parts: Part[]) { models.set(name, parts); }
/** bounding box of a model at scale 1 */
const boxes = new Map<string, THREE.Box3>();
export function modelBox(name: string) {
  let b = boxes.get(name); if (b) return b;
  b = new THREE.Box3(); for (const p of models.get(name) ?? []) { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox!); }
  boxes.set(name, b); return b;
}

const white = new THREE.Color(1, 1, 1), tc = new THREE.Color();
/** foliage takes the instance tint, wood/stone only a slight brightness variation */
function tint(kind: Kind | undefined, it: Inst) {
  if (kind === 'leaf' || kind === 'plant' || kind === 'flower') return it.col ?? white;
  const v = it.shade ?? 1; return tc.setRGB(v, v, v);
}
/** tilt = random lean up to this angle; tx/tz = fixed lean (world editor, same on every start) */
export interface Inst { x: number; z: number; y?: number; s: number; ry?: number; tilt?: number; tx?: number; tz?: number; col?: THREE.Color; shade?: number }
/** one InstancedMesh per material of the model; returns the meshes (already added to parent) */
export function instance(parent: THREE.Object3D, name: string, list: Inst[], o: { shadow?: boolean; receive?: boolean; scale?: number } = {}) {
  const parts = models.get(name); if (!parts || !list.length) return [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const out: THREE.InstancedMesh[] = [];
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geo, part.m ?? material(part.mat, part.vc, o.scale ?? 1), list.length);
    list.forEach((it, i) => {
      e.set(it.tx ?? (it.tilt ?? 0) * (Math.random() - .5), it.ry ?? Math.random() * Math.PI * 2, it.tz ?? (it.tilt ?? 0) * (Math.random() - .5));
      m4.compose(p.set(it.x, it.y ?? 0, it.z), q.setFromEuler(e), s.setScalar(it.s)); im.setMatrixAt(i, m4);
      im.setColorAt(i, tint(MAT_DEF[part.mat]?.kind, it));
    });
    im.castShadow = !!o.shadow; im.receiveShadow = MAT_DEF[part.mat]?.kind === 'leaf' ? false : o.receive ?? true; // no self-shadow noise on leaf cards
    im.computeBoundingSphere(); parent.add(im); out.push(im);
  }
  return out;
}

/** a single copy of a model (e.g. the tree standing on a field), tinted like the forest; null until the models are loaded */
export function natureMesh(name: string, scale: number, col?: THREE.Color) {
  if (!models.has(name)) return null;
  const g = new THREE.Group();
  instance(g, name, [{ x: 0, z: 0, s: scale, ry: 0, col, shade: 1 }], { shadow: true, scale });
  return g;
}
