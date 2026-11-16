import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyType, FruitType } from '../config';
import { buildFarmer } from './farmer';
import type { Look } from '../look';
import { GEO, M, TINE_GAP, envU, part, rakeTines, rand, windU } from './core';

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
  const mat = proj ? (type === 'asp' ? PROJ_ASP : type === 'cran' ? PROJ_CRAN : PROJ_CAB) : glow ? GROUND_MAT[type] : BUSH_MAT[type];
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
const RAKE_STEEL = M(0xa8b0b8, { m: .8, r: .35 });
/** rake head as wide as the raked strip: one tine per scratch, same spacing (wider rake = more tines) */
export function rakeHead(w: number) {
  const head = new THREE.Group(), n = rakeTines(w);
  part(head, GEO.box, RAKE_STEEL, n * TINE_GAP, .04, .05, 0, 0, 0);
  for (let i = 0; i < n; i++) part(head, GEO.cyl, RAKE_STEEL, .012, .12, .012, -w / 2 + w * (i + .5) / n, -.06, .02);
  head.userData.w = w; return head;
}
export function buildPlayer(look: Look, rakeLen: number, rakeW: number) {
  const g = new THREE.Group();
  const wood = M(0x7a5230);
  const body = new THREE.Group(); g.add(body);
  // detailed farmer figure (character editor look), hands follow the weapons via IK (view.animPlayer)
  const rig = buildFarmer(look); body.add(rig.root);
  // rake: pivot at the player, head reaches exactly the hit range so the swing matches the cone
  const rake = new THREE.Group(); rake.position.set(0, .62, 0); rake.rotation.order = 'YXZ'; g.add(rake);
  const L = rakeLen - .12;
  const h = part(rake, GEO.cyl, wood, .025, L, .025, 0, 0, L / 2); h.rotation.x = Math.PI / 2;
  const head = rakeHead(rakeW); head.position.z = L; rake.add(head);
  // lemon wand (Citrateaser): second arm + slim wooden wand with a lemon on the tip, only while equipped
  const wand = new THREE.Group(); wand.visible = false; body.add(wand);
  const stick = new THREE.Group(); stick.position.set(-.25, .67, .22); stick.rotation.set(-.42, .2, 0, 'YXZ'); wand.add(stick); // in the hand, tilted up, pointing slightly inward
  const wandWood = M(0x4a2e1a, { r: .6 }), brass = M(0xc89a3a, { m: .7, r: .35 });
  const shaftG = new THREE.CylinderGeometry(.011, .019, .46, 7); shaftG.rotateX(Math.PI / 2); shaftG.translate(0, 0, .17);
  const shaft = new THREE.Mesh(shaftG, wandWood); shaft.castShadow = true; stick.add(shaft);
  part(stick, GEO.sph, wandWood, .024, .024, .03, 0, 0, -.07); // pommel
  for (const z of [.02, .36]) { const r = part(stick, GEO.cyl, brass, .02, .018, .02, 0, 0, z, false); r.rotation.x = Math.PI / 2; } // grip + tip ferrule
  const lemonMat = new THREE.MeshStandardMaterial({ color: 0xf0cf2a, roughness: .42, emissive: 0xffe46a, emissiveIntensity: 0 });
  part(stick, GEO.sph, lemonMat, .052, .052, .07, 0, 0, .46); // lemon: elongated along the wand
  const nub = part(stick, GEO.cone, lemonMat, .022, .04, .022, 0, 0, .535, false); nub.rotation.x = Math.PI / 2;
  part(stick, GEO.cyl, M(0x3d6a2a), .012, .02, .012, 0, 0, .385, false).rotation.x = Math.PI / 2; // stem
  const leaf = part(stick, GEO.sph, M(0x3f7a2c), .035, .006, .016, .03, .02, .39, false); leaf.rotation.y = .6;
  const wandTip = new THREE.Object3D(); wandTip.position.set(0, 0, .56); stick.add(wandTip);
  const stars = new THREE.Group(); stars.position.y = 1.55; stars.visible = false; g.add(stars);
  for (let i = 0; i < 3; i++) part(stars, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffe066 }), .05, .05, .05, Math.cos(i * 2.1) * .25, 0, Math.sin(i * 2.1) * .25, false);
  return { g, body, rake, head, stars, L, wand, wandTip, wandGrip: stick, lemonMat, rig };
}

// eye colours requested for the darkness: panda orange, raccoon blue, toad green
export const EYE_COL: Record<EnemyType, number> = { raccoon: 0x5fb4ff, panda: 0xff8a26, toad: 0x6dff3a, sheep: 0xe8e2cc, hedgehog: 0xffc04a, squirrel: 0xffe070 };
function eyeMat(c: number) { return new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); }

const shieldBase = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x6fd0ff) }, uTime: windU, uStr: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vP=position; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uStr; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float f=pow(1.-abs(dot(normalize(vN),vV)),2.2); float band=.5+.5*sin(vP.y*18.-uTime*5.); float hx=step(.92,fract(vP.x*6.+vP.y*3.))+step(.92,fract(vP.z*6.-vP.y*3.));
      float a=(f*1.1+band*.06+hx*.08)*uStr; gl_FragColor=vec4(uColor*a*1.4,a); }`,
});

export interface EnemyParts { tail?: THREE.Group; body: THREE.Group; stars: THREE.Group; mats: THREE.MeshStandardMaterial[]; tongue?: THREE.Group; spines?: THREE.MeshStandardMaterial; puff?: THREE.Group; shield?: THREE.Mesh; eyes?: THREE.Mesh[]; carry: THREE.Group }
export function buildEnemy(type: EnemyType) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); const P: Partial<EnemyParts> = { body };
  if (type === 'raccoon') {
    const fur = M(0x77726c), dk = M(0x26231f), lt = M(0xd8d0c4);
    part(body, GEO.sph, fur, .25, .21, .34, 0, .3, 0); part(body, GEO.sph, fur, .19, .16, .17, 0, .46, .3);
    part(body, GEO.sph, dk, .2, .065, .16, 0, .49, .34); part(body, GEO.sph, lt, .08, .065, .1, 0, .43, .45); part(body, GEO.sph, dk, .03, .03, .03, 0, .45, .55);
    part(body, GEO.cone, dk, .06, .1, .05, -.11, .63, .27); part(body, GEO.cone, dk, .06, .1, .05, .11, .63, .27);
    const em = eyeMat(EYE_COL.raccoon); part(body, GEO.sph, em, .028, .028, .028, -.07, .5, .47, false); part(body, GEO.sph, em, .028, .028, .028, .07, .5, .47, false);
    for (let i = 0; i < 4; i++) { const s = part(body, GEO.cyl, i % 2 ? dk : fur, .075 - i * .008, .12, .075 - i * .008, 0, .36 + i * .05, -.36 - i * .1); s.rotation.x = -1.0; }
    for (const [x, z] of [[-.13, .18], [.13, .18], [-.13, -.18], [.13, -.18]]) part(body, GEO.cyl, dk, .045, .18, .045, x, .09, z);
    P.mats = [fur, dk, lt];
  } else if (type === 'panda') {
    const fur = M(0xb2471e), dk = M(0x2a1510), wt = M(0xf0e6d6);
    part(body, GEO.sph, fur, .27, .22, .36, 0, .32, 0); part(body, GEO.sph, fur, .2, .17, .18, 0, .5, .32);
    part(body, GEO.sph, wt, .09, .07, .08, 0, .45, .46); part(body, GEO.sph, wt, .05, .06, .03, -.11, .54, .44); part(body, GEO.sph, wt, .05, .06, .03, .11, .54, .44);
    part(body, GEO.sph, dk, .03, .03, .03, 0, .47, .54);
    part(body, GEO.cone, fur, .07, .1, .05, -.13, .67, .28); part(body, GEO.cone, fur, .07, .1, .05, .13, .67, .28);
    const em = eyeMat(EYE_COL.panda); part(body, GEO.sph, em, .028, .028, .028, -.075, .52, .48, false); part(body, GEO.sph, em, .028, .028, .028, .075, .52, .48, false);
    for (let i = 0; i < 5; i++) { const s = part(body, GEO.cyl, i % 2 ? M(0x6a2a10) : fur, .085, .11, .085, 0, .34 + i * .03, -.38 - i * .1); s.rotation.x = -1.2; }
    for (const [x, z] of [[-.14, .2], [.14, .2], [-.14, -.2], [.14, -.2]]) part(body, GEO.cyl, dk, .05, .2, .05, x, .1, z);
    P.mats = [fur, wt];
  } else if (type === 'toad') {
    const sk = M(0x5f7d3a, { tr: true }), bl = M(0xb8b070, { tr: true }), wart = M(0x3f5a26, { tr: true });
    part(body, GEO.ico, sk, .33, .2, .3, 0, .2, 0); part(body, GEO.sph, bl, .26, .12, .22, 0, .14, .06);
    for (let i = 0; i < 6; i++) part(body, GEO.sph, wart, .04, .03, .04, rand(-.2, .2), .37, rand(-.2, .15));
    part(body, GEO.sph, sk, .08, .08, .08, -.14, .36, .18); part(body, GEO.sph, sk, .08, .08, .08, .14, .36, .18);
    const em = eyeMat(EYE_COL.toad); part(body, GEO.sph, em, .045, .045, .045, -.15, .38, .24, false); part(body, GEO.sph, em, .045, .045, .045, .15, .38, .24, false);
    for (const [x, z] of [[-.25, -.1], [.25, -.1]]) part(body, GEO.sph, sk, .12, .07, .16, x, .08, z);
    const tongue = new THREE.Group(); tongue.position.set(0, .2, .28); body.add(tongue);
    const tmat = M(0xff6a8a, { e: 0xff3060, ei: .8 });
    const tm = part(tongue, GEO.cyl, tmat, .045, 1, .045, 0, 0, .5, false); tm.rotation.x = Math.PI / 2;
    part(tongue, GEO.sph, tmat, .09, .07, .09, 0, 0, 1, false); // sticky tip
    tongue.scale.set(1, 1, .01); tongue.visible = false; P.tongue = tongue;
    P.mats = [sk, bl, wart];
  } else if (type === 'hedgehog') {
    // spiky ball on short legs; the spiky part sits in its own group so it can puff up
    const skin = M(0x8a6a4a), face = M(0xc8a47a), dk = M(0x1a120c), spine = M(0x4a3524, { e: 0xfff0c0, ei: 0 });
    const puff = new THREE.Group(); puff.position.y = .2; body.add(puff); P.puff = puff;
    part(puff, GEO.sph, skin, .27, .2, .32, 0, 0, -.02);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 70; i++) { // spines on the back half, pointing outwards
      const u = rand(0, 1), th = rand(0, Math.PI * 2), ph = Math.acos(1 - u * 1.15);
      const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      if (d.z > .55) continue; // keep the face free
      const m = part(puff, GEO.cone, spine, .035, rand(.2, .26), .035, d.x * .26, d.y * .18 + .02, d.z * .3 - .02);
      m.quaternion.setFromUnitVectors(up, d.clone().add(new THREE.Vector3(0, .25, -.15)).normalize());
    }
    const snout = part(body, GEO.cone, face, .1, .2, .1, 0, .17, .34); snout.rotation.x = Math.PI / 2;
    part(body, GEO.sph, face, .14, .12, .12, 0, .18, .24);
    part(body, GEO.sph, dk, .03, .03, .03, 0, .17, .45);
    const em = eyeMat(EYE_COL.hedgehog); part(body, GEO.sph, em, .022, .022, .022, -.065, .23, .33, false); part(body, GEO.sph, em, .022, .022, .022, .065, .23, .33, false);
    for (const [x, z] of [[-.13, .14], [.13, .14], [-.13, -.14], [.13, -.14]]) part(body, GEO.cyl, dk, .035, .1, .035, x, .05, z);
    P.spines = spine; P.mats = [skin, face];
  } else if (type === 'squirrel') {
    // small red squirrel: slim body sitting up a little, big bushy tail curled up over the back, tufted ears
    const fur = M(0xb2541e), belly = M(0xf0d8b0), dk = M(0x2a160c);
    part(body, GEO.sph, fur, .13, .14, .19, 0, .2, 0); part(body, GEO.sph, belly, .085, .1, .1, 0, .18, .09);
    part(body, GEO.sph, fur, .1, .095, .1, 0, .33, .15); part(body, GEO.sph, belly, .05, .045, .05, 0, .31, .24); part(body, GEO.sph, dk, .018, .018, .018, 0, .32, .28);
    for (const sx of [-1, 1]) { const ear = part(body, GEO.cone, fur, .035, .09, .025, sx * .055, .44, .13); ear.rotation.z = -sx * .2; part(body, GEO.cone, dk, .015, .05, .015, sx * .06, .5, .13, false); }
    const em = eyeMat(EYE_COL.squirrel); part(body, GEO.sph, em, .02, .022, .02, -.05, .35, .23, false); part(body, GEO.sph, em, .02, .022, .02, .05, .35, .23, false);
    const tail = new THREE.Group(); tail.position.set(0, .2, -.16); body.add(tail); P.tail = tail;
    const tl = M(0xd0743a); // bushy S-shaped tail: back, up over the back, tip curled forward
    for (const [y, z, r, c] of [[.04, -.08, .085, fur], [.14, -.17, .1, fur], [.28, -.21, .115, fur], [.42, -.18, .12, tl], [.53, -.1, .11, fur], [.57, -.01, .085, tl]] as [number, number, number, THREE.MeshStandardMaterial][]) part(tail, GEO.ico, c, r * 1.05, r, r, 0, y, z);
    for (const [x, z] of [[-.07, .1], [.07, .1], [-.08, -.08], [.08, -.08]]) part(body, GEO.cyl, dk, .025, .1, .025, x, .05, z);
    P.mats = [fur, belly, tl];
  } else {
    const wool = M(0xa29c90), dk = M(0x1e1a18); // greyer wool: no bloom
    for (let i = 0; i < 9; i++) { const a = i / 9 * 7; part(body, GEO.ico, wool, rand(.18, .24), rand(.18, .22), rand(.18, .24), Math.cos(a) * .2, .44 + rand(-.05, .08), Math.sin(a) * .26); }
    part(body, GEO.ico, wool, .3, .26, .36, 0, .45, 0);
    part(body, GEO.box, dk, .17, .19, .24, 0, .52, .4); part(body, GEO.box, dk, .14, .04, .06, -.13, .58, .36).rotation.z = .4; part(body, GEO.box, dk, .14, .04, .06, .13, .58, .36).rotation.z = -.4;
    const em = eyeMat(0xffffff); P.eyes = [part(body, GEO.sph, em, .025, .025, .025, -.06, .56, .52, false), part(body, GEO.sph, em.clone(), .025, .025, .025, .06, .56, .52, false)];
    for (const [x, z] of [[-.15, .2], [.15, .2], [-.15, -.2], [.15, -.2]]) part(body, GEO.cyl, dk, .045, .3, .045, x, .15, z);
    const sh = new THREE.Mesh(GEO.sph, shieldBase.clone()); (sh.material as THREE.ShaderMaterial).uniforms.uTime = windU; sh.scale.setScalar(.7); sh.position.y = .42; g.add(sh); P.shield = sh;
    P.mats = [wool];
  }
  const stars = new THREE.Group(); stars.visible = false; stars.position.y = type === 'toad' || type === 'hedgehog' || type === 'squirrel' ? .65 : .9; g.add(stars);
  for (let i = 0; i < 3; i++) part(stars, GEO.sph, new THREE.MeshBasicMaterial({ color: 0x9cff60 }), .045, .045, .045, Math.cos(i * 2.1) * .22, 0, Math.sin(i * 2.1) * .22, false);
  P.stars = stars;
  const carry = new THREE.Group(); body.add(carry); P.carry = carry;
  return { g, P: P as EnemyParts };
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
  if (!o) { const p = new THREE.BufferGeometry(); p.setAttribute('position', g.getAttribute('position')); if (g.index) p.setIndex(g.index); o = mergeVertices(p, 1e-4); o.computeVertexNormals(); outlineGeo.set(g.uuid, o); }
  return o;
}
const outlineMats = new Map<string, THREE.ShaderMaterial>();
function outlineMat(color: number, width: number) {
  const key = color + ':' + width; let m = outlineMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uW: { value: width }, uTime: windU, uDay: envU.uDay },
      side: THREE.BackSide, toneMapped: false, fog: false,
      vertexShader: `uniform float uW; uniform float uDay; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vec3 n=normalize(mat3(modelMatrix)*normal);
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
  for (const m of list) { const h = new THREE.Mesh(smoothGeo(m.geometry), mat); h.castShadow = false; h.renderOrder = -1; m.add(h); }
}
