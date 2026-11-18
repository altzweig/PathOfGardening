import * as THREE from 'three';
import { hoeModel, lemonWand } from './arsenal';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyType, FruitType } from '../config';
import { buildFarmer } from './farmer';
import { ANIMAL_EYE, makeAnimal, type Animal } from './animals';
import type { Look } from '../look';
import { GEO, M, envU, part, rand, windU } from './core';

// Fruit lying on the ground glows; fruit still on the bush does not.
export const FRUIT_COL: Record<FruitType, string> = { blue: '#4a64f0', asp: '#8fe36a', cran: '#f0306a', cab: '#b8f070', lemon: '#ffe44a', chili: '#ff3a1a', nut: '#c08a4a' };
export const FRUIT_HEX: Record<FruitType, number> = { blue: 0x4a64f0, asp: 0x8fe36a, cran: 0xf0306a, cab: 0xb8f070, lemon: 0xffe44a, chili: 0xff3a1a, nut: 0xc08a4a };
export const GROUND_MAT: Record<FruitType, THREE.MeshStandardMaterial> = {
  // berries: real berry shape (vertex colours = dark crown), royal blue / raspberry red, glossy instead of milky glow;
  // blueberries only glow up (gently) as the next level-up approaches, see View.berryGlow
  blue: new THREE.MeshStandardMaterial({ color: 0x3358ff, emissive: 0x2440ff, emissiveIntensity: 0, roughness: .3, vertexColors: true }),
  asp: new THREE.MeshStandardMaterial({ color: 0x7fbf45, emissive: 0x4fa01a, emissiveIntensity: 1.1, roughness: .5 }),
  cran: new THREE.MeshStandardMaterial({ color: 0xc80a48, emissive: 0xe0104a, emissiveIntensity: .06, roughness: .22, vertexColors: true }),
  cab: new THREE.MeshStandardMaterial({ color: 0x9ad870, emissive: 0x5aa020, emissiveIntensity: .9, roughness: .6, flatShading: true }),
  lemon: new THREE.MeshStandardMaterial({ color: 0xf0d030, emissive: 0xffd020, emissiveIntensity: 1.1, roughness: .4 }),
  chili: new THREE.MeshStandardMaterial({ color: 0xe0200c, emissive: 0xff2a08, emissiveIntensity: 1.2, roughness: .3 }),
  nut: new THREE.MeshStandardMaterial({ color: 0xa8743a, emissive: 0xc07a28, emissiveIntensity: .8, roughness: .5 }), // lying nuts glow warm, so they can be found in the grass
};
export const NUT_CAP = new THREE.MeshStandardMaterial({ color: 0x6a8a3a, roughness: .8, flatShading: true });
export const BUSH_MAT: Record<FruitType, THREE.MeshStandardMaterial> = {
  blue: new THREE.MeshStandardMaterial({ color: 0x2c4ae8, roughness: .32, vertexColors: true }),
  asp: new THREE.MeshStandardMaterial({ color: 0x5f8f35, roughness: .6 }),
  cran: new THREE.MeshStandardMaterial({ color: 0xc00e46, roughness: .25, vertexColors: true }),
  cab: new THREE.MeshStandardMaterial({ color: 0x7aa858, roughness: .7, flatShading: true }),
  lemon: new THREE.MeshStandardMaterial({ color: 0xc8b02a, roughness: .45, emissive: 0x8ac0ff, emissiveIntensity: 0 }), // emissive flickers with the harvest lightning
  chili: new THREE.MeshStandardMaterial({ color: 0xc81a0a, roughness: .3, emissive: 0xff2000, emissiveIntensity: .45 }), // chilis glow slightly red, also on the plant
  nut: new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: .55 }),
};
export const CHILI_STEM = new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: .6 });
export const ASP_TIP_GROUND = new THREE.MeshStandardMaterial({ color: 0x9a5cc0, emissive: 0x7a2aaa, emissiveIntensity: 1.1 });
export const ASP_TIP_BUSH = new THREE.MeshStandardMaterial({ color: 0x6a3a88, roughness: .6 });
// projectiles glow clearly brighter than anything lying around
export const PROJ_ASP = new THREE.MeshStandardMaterial({ color: 0xb8ff70, emissive: 0x8cff3a, emissiveIntensity: 3.2, roughness: .4 });
export const PROJ_ASP_TIP = new THREE.MeshStandardMaterial({ color: 0xd8a0ff, emissive: 0xb050ff, emissiveIntensity: 3.2 });
export const PROJ_CRAN = new THREE.MeshStandardMaterial({ color: 0xff4a5e, emissive: 0xff1a3a, emissiveIntensity: 3.6, roughness: .3 });
/** blueberry pellet of the berry shotgun (18.11.2026: the shotgun fires both berries) */
export const PROJ_BLUE = new THREE.MeshStandardMaterial({ color: 0x6a7cff, emissive: 0x2a3cff, emissiveIntensity: 3.2, roughness: .3 });
export const PROJ_CAB = new THREE.MeshStandardMaterial({ color: 0xc8ff90, emissive: 0x8ae040, emissiveIntensity: 1.8, roughness: .6, flatShading: true });

/** berry: slightly flattened sphere with a sunken dark star-shaped crown on top (blueberry big, lingonberry small) */
function berryGeo(crown: number) {
  const g = new THREE.SphereGeometry(1, 16, 12), p = g.attributes.position, col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(z, x), star = .5 + .5 * Math.cos(th * 5), top = 1 - crown;
    if (y > top) y = top - (y - top) * .9; // dimple
    const dark = y > top - .14 - star * .1 * crown * 4 ? 1 : 0;
    const shade = .9 + .1 * Math.sin(x * 7 + z * 5); // a little unevenness in the skin
    const c = dark ? .16 : shade; col.push(c, c, c * (dark ? 1.1 : 1));
    p.setXYZ(i, x * 1.02, y * .9, z * 1.02);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
export const BERRY_GEO = { blue: berryGeo(.2), cran: berryGeo(.1) };
export function fruitMesh(type: FruitType, scale: number, glow = true, proj = false) {
  const g = new THREE.Group();
  const mat = proj ? (type === 'asp' ? PROJ_ASP : type === 'cran' ? PROJ_CRAN : type === 'blue' ? PROJ_BLUE : PROJ_CAB) : glow ? GROUND_MAT[type] : BUSH_MAT[type];
  if (type === 'asp') {
    const st = part(g, GEO.cyl, mat, .035, .38, .035, 0, 0, 0); st.rotation.z = Math.PI / 2;
    const tp = part(g, GEO.cone, proj ? PROJ_ASP_TIP : glow ? ASP_TIP_GROUND : ASP_TIP_BUSH, .045, .1, .045, .22, 0, 0); tp.rotation.z = -Math.PI / 2;
  } else if (type === 'cab') { part(g, GEO.ico, mat, .14, .13, .14, 0, 0, 0); part(g, GEO.lo, mat, .1, .06, .12, .08, .03, 0); part(g, GEO.lo, mat, .1, .06, .12, -.08, .03, .02); }
  else if (type === 'lemon') part(g, GEO.sph, mat, .1, .075, .075, 0, 0, 0);
  else if (type === 'chili') { // pod lying on its side: body, curved pointed tip, green stem
    const b = part(g, GEO.capsule, mat, .034, .07, .034, 0, 0, 0); b.rotation.z = Math.PI / 2;
    const t = part(g, GEO.cone, mat, .032, .09, .032, .11, .012, 0); t.rotation.z = -Math.PI / 2 + .35;
    const st = part(g, GEO.cyl, CHILI_STEM, .012, .06, .012, -.1, .015, 0); st.rotation.z = Math.PI / 2 - .5;
  }
  else if (type === 'nut') { // hazelnut: round shell with a pale tip, ragged green husk on top
    part(g, GEO.sph, mat, .075, .07, .075, 0, 0, 0); part(g, GEO.cone, mat, .035, .05, .035, 0, .075, 0);
    part(g, GEO.lo, NUT_CAP, .07, .035, .07, 0, .045, 0, false);
  }
  else { const r = type === 'blue' ? .085 : .07; const b = part(g, !proj && (type === 'blue' || type === 'cran') ? BERRY_GEO[type] : GEO.sph, mat, r, r, r, 0, 0, 0); b.rotation.set(rand(-.6, .6), rand(0, 7), rand(-.6, .6)); }
  g.scale.setScalar(scale); return g;
}

export interface PlantMats { leaf: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial }
export function buildPlant(type: FruitType, mats: PlantMats) {
  const g = new THREE.Group(); const fruits: THREE.Mesh[] = [];
  if (type === 'blue') {
    for (let i = 0; i < 7; i++) { const a = i / 7 * 7, r = i ? .38 : 0; part(g, GEO.ico, mats.leaf, rand(.32, .42), rand(.3, .4), rand(.32, .42), Math.cos(a) * r, .38 + (i ? 0 : .22), Math.sin(a) * r); }
    for (let i = 0; i < 16; i++) { const a = rand(0, 7), y = rand(.25, .8), r = .62 - Math.abs(y - .5) * .3; { const b = part(g, BERRY_GEO.blue, BUSH_MAT.blue, .055, .055, .055, Math.cos(a) * r, y, Math.sin(a) * r, false); b.rotation.set(rand(-1.2, 1.2), rand(0, 7), rand(-1.2, 1.2)); fruits.push(b); } }
  } else if (type === 'asp') {
    for (let i = 0; i < 9; i++) {
      const a = rand(0, 7), r = rand(0, .5), h = rand(.4, .8); const st = part(g, GEO.cyl, mats.leaf, .04, h, .04, Math.cos(a) * r, h / 2, Math.sin(a) * r); st.rotation.set(rand(-.15, .15), 0, rand(-.15, .15));
      fruits.push(part(g, GEO.cone, ASP_TIP_BUSH, .055, .12, .055, Math.cos(a) * r, h + .04, Math.sin(a) * r, false));
    }
  } else if (type === 'cran') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * 7, r = rand(.15, .5); part(g, GEO.ico, mats.leaf, rand(.22, .3), rand(.14, .2), rand(.22, .3), Math.cos(a) * r, .16, Math.sin(a) * r); }
    for (let i = 0; i < 22; i++) { const a = rand(0, 7), r = rand(.1, .65); { const b = part(g, BERRY_GEO.cran, BUSH_MAT.cran, .045, .045, .045, Math.cos(a) * r, rand(.2, .36), Math.sin(a) * r, false); b.rotation.set(rand(-1.2, 1.2), rand(0, 7), rand(-1.2, 1.2)); fruits.push(b); } }
  } else if (type === 'lemon') { // small lemon tree: trunk, round crown, lemons on the outside
    part(g, GEO.cyl, mats.head, .06, .7, .06, 0, .35, 0);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 7; part(g, GEO.ico, mats.leaf, rand(.28, .36), rand(.24, .3), rand(.28, .36), Math.cos(a) * .18, .85 + rand(-.05, .1), Math.sin(a) * .18); }
    for (let i = 0; i < 9; i++) { const a = rand(0, 7), y = rand(.7, 1.05), r = .38 - Math.abs(y - .88) * .4; fruits.push(part(g, GEO.sph, BUSH_MAT.lemon, .07, .055, .055, Math.cos(a) * r, y, Math.sin(a) * r, false)); }
  } else if (type === 'chili') { // bushy chili plant full of red pods hanging down
    for (let i = 0; i < 4; i++) { const a = i / 4 * 7 + rand(-.3, .3), r = rand(.06, .14), h = rand(.35, .5); const st = part(g, GEO.cyl, mats.head, .025, h, .025, Math.cos(a) * r, h / 2, Math.sin(a) * r); st.rotation.set(rand(-.2, .2), 0, rand(-.2, .2)); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * 7, r = rand(.08, .26); part(g, GEO.ico, mats.leaf, rand(.14, .19), rand(.08, .11), rand(.14, .19), Math.cos(a) * r, rand(.42, .6), Math.sin(a) * r); }
    for (let i = 0; i < 15; i++) { // fat pods hang around the outside: rounded body + curved tip, pointing down and outwards
      const a = i / 15 * Math.PI * 2 + rand(-.15, .15), r = rand(.28, .5), y = rand(.24, .46);
      const pod = new THREE.Group(); pod.position.set(Math.cos(a) * r, y, Math.sin(a) * r); pod.rotation.set(-Math.sin(a) * .55, 0, Math.cos(a) * .55); g.add(pod);
      fruits.push(part(pod, GEO.capsule, BUSH_MAT.chili, .05, .07, .05, 0, -.04, 0, false));
      const tip = part(pod, GEO.cone, BUSH_MAT.chili, .045, .12, .045, .012, -.17, 0, false); tip.rotation.z = Math.PI + .3; fruits.push(tip);
      part(pod, GEO.cyl, CHILI_STEM, .018, .06, .018, 0, .06, 0, false);
    }
    g.scale.setScalar(1.25);
  } else if (type === 'cab') {
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2, r = .42, x = Math.cos(a) * r, z = Math.sin(a) * r;
      part(g, GEO.ico, mats.head, .26, .24, .26, x, .24, z);
      for (let k = 0; k < 4; k++) { const b = k / 4 * 7; const l = part(g, GEO.lo, mats.leaf, .2, .06, .26, x + Math.cos(b) * .18, .14, z + Math.sin(b) * .18); l.rotation.set(rand(-.5, .5), b, rand(-.4, .4)); }
    }
  }
  return { g, fruits };
}

export const PLAYER_RING = [0xffd890, 0x8fc8ff, 0xff9a8a, 0xd0a0ff];
export function buildPlayer(look: Look) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  // detailed farmer figure (character editor look), hands follow the weapons via IK (view.animPlayer)
  const rig = buildFarmer(look); body.add(rig.root);
  // hoe (weapon id 'rake'): `rake` = pivot in the hands (position + pitch/yaw animated), `head` = the hoe itself, slides through the hands
  const rake = new THREE.Group(); rake.position.set(0, .62, 0); rake.rotation.order = 'YXZ'; g.add(rake);
  const head = hoeModel(); rake.add(head);
  // lemon wand (Citrateaser): second arm + slim wooden wand with a lemon on the tip, only while equipped
  const wand = new THREE.Group(); wand.visible = false; body.add(wand);
  const stick = new THREE.Group(); stick.position.set(-.25, .67, .22); stick.rotation.set(-.42, .2, 0, 'YXZ'); wand.add(stick); // in the hand, tilted up, pointing slightly inward
  const lemonMat = lemonWand(stick) as THREE.MeshStandardMaterial;
  const wandTip = new THREE.Object3D(); wandTip.position.set(0, 0, .53); stick.add(wandTip);
  const stars = new THREE.Group(); stars.position.y = 1.55; stars.visible = false; g.add(stars);
  for (let i = 0; i < 3; i++) part(stars, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffe066 }), .05, .05, .05, Math.cos(i * 2.1) * .25, 0, Math.sin(i * 2.1) * .25, false);
  return { g, body, rake, head, stars, wand, wandTip, wandGrip: stick, lemonMat, rig };
}

// eye colours requested for the darkness: panda orange, raccoon blue, toad green
export const EYE_COL: Record<EnemyType, number> = ANIMAL_EYE;

const shieldBase = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x6fd0ff) }, uTime: windU, uStr: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vP=position; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uStr; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float f=pow(1.-abs(dot(normalize(vN),vV)),2.2); float band=.5+.5*sin(vP.y*18.-uTime*5.); float hx=step(.92,fract(vP.x*6.+vP.y*3.))+step(.92,fract(vP.z*6.-vP.y*3.));
      float a=(f*1.1+band*.06+hx*.08)*uStr; gl_FragColor=vec4(uColor*a*1.4,a); }`,
});

export interface EnemyParts { a: Animal; body: THREE.Group; stars: THREE.Group; mats: THREE.MeshStandardMaterial[]; tongue?: THREE.Group; spines?: THREE.MeshStandardMaterial; puff?: THREE.Object3D; shield?: THREE.Mesh; eyes?: THREE.Mesh[]; carry: THREE.Group }
/** enemy = sculpted, rigged animal (animals.ts) + game extras: stun stars, sheep shield */
export function buildEnemy(type: EnemyType, boss = false) {
  const a = makeAnimal(type, boss), g = a.g;
  const P: EnemyParts = { a, body: a.body, mats: [a.mat], tongue: a.tongue, spines: a.spineMat, puff: a.b.puff, carry: a.carry, stars: new THREE.Group() };
  if (type === 'sheep') {
    P.eyes = [a.eyes];
    const sh = new THREE.Mesh(GEO.sph, shieldBase.clone()); (sh.material as THREE.ShaderMaterial).uniforms.uTime = windU; sh.scale.setScalar(.72); sh.position.y = .44; g.add(sh); P.shield = sh;
  }
  const stars = P.stars; stars.visible = false; stars.position.y = type === 'toad' || type === 'hedgehog' || type === 'squirrel' ? .65 : .9; g.add(stars);
  for (let i = 0; i < 3; i++) part(stars, GEO.sph, new THREE.MeshBasicMaterial({ color: 0x9cff60 }), .045, .045, .045, Math.cos(i * 2.1) * .22, 0, Math.sin(i * 2.1) * .22, false);
  return { g, P };
}

/** Hat material: uHp 1..0 eats the hat. Crown (y 1.215..1.37) is bitten from the top down,
 *  then the brim from the outside in. uCol = colour, uPulse = emissive blink. */
/** elite colour per animal (its eye colour; the sheep gets warm gold) */
export const ELITE_COL: Record<EnemyType, number> = { ...EYE_COL, sheep: 0xffd860 };
// Glowing outline: inverted hull of every lit body part, pushed out along smoothed normals by a fixed
// world width, drawn back-faces only (shows only around the silhouette), HDR colour -> slight bloom.
const outlineGeo = new Map<string, THREE.BufferGeometry>();
function smoothGeo(g: THREE.BufferGeometry) {
  let o = outlineGeo.get(g.uuid);
  if (!o) {
    const p = new THREE.BufferGeometry(); p.setAttribute('position', g.getAttribute('position')); if (g.index) p.setIndex(g.index);
    if (g.getAttribute('skinIndex')) { p.setAttribute('skinIndex', g.getAttribute('skinIndex')); p.setAttribute('skinWeight', g.getAttribute('skinWeight')); }
    o = mergeVertices(p, 1e-4); o.computeVertexNormals(); outlineGeo.set(g.uuid, o);
  }
  return o;
}
const outlineMats = new Map<string, THREE.ShaderMaterial>();
function outlineMat(color: number, width: number) {
  const key = color + ':' + width; let m = outlineMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uW: { value: width }, uTime: windU, uDay: envU.uDay },
      side: THREE.BackSide, toneMapped: false, fog: false,
      // works for rigid and skinned meshes (the skinning chunks are only active on a SkinnedMesh)
      vertexShader: `uniform float uW; uniform float uDay;
        #include <common>
        #include <skinning_pars_vertex>
        void main(){
          #include <skinbase_vertex>
          #include <beginnormal_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 wp=modelMatrix*vec4(transformed,1.); vec3 n=normalize(mat3(modelMatrix)*objectNormal);
          wp.xyz+=n*uW*(1.+.5*uDay); gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uDay; void main(){ gl_FragColor=vec4(uColor*(1.9+.35*sin(uTime*3.)+uDay*.8),1.); }`,
    });
    outlineMats.set(key, m);
  }
  return m;
}
/** add a glowing outline in the given colour around all lit parts below root (eyes, shield, stars stay without) */
export function addOutline(root: THREE.Object3D, color: number, width = .03) {
  const mat = outlineMat(color, width), list: THREE.Mesh[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).type === 'MeshStandardMaterial') list.push(m); });
  for (const m of list) {
    const sk = m as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) { const h = new THREE.SkinnedMesh(smoothGeo(m.geometry), mat); h.castShadow = false; h.renderOrder = -1; h.frustumCulled = false; m.parent!.add(h); h.bind(sk.skeleton, sk.bindMatrix); }
    else { const h = new THREE.Mesh(smoothGeo(m.geometry), mat); h.castShadow = false; h.renderOrder = -1; m.add(h); }
  }
}

