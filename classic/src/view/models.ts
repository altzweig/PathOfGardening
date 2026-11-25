import * as THREE from 'three';
import { lemonWand, rakeHandle, rakeHeadModel } from './arsenal';
import { friedEgg } from './eggfx';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyType, FruitType } from '../config';
import { buildFarmer } from './farmer';
import { ANIMAL_EYE, makeAnimalShell, type Animal } from './animals';
import type { Look } from '../look';
import { BERRY_DATA } from './berryModels';
import { GEO, M, TINE_GAP, envU, outlineU, part, rakeTines, rand, windU } from './core';

// Fruit lying on the ground glows; fruit still on the bush does not.
const ITEM_HEX = { wheat: 0xe8c060, flour: 0xf4eee0, water: 0x5ab8ff, milk: 0xf8f8f0, egg: 0xf2e2c4, juice: 0xc8305a, bread: 0xc88a40, cheese: 0xf6c838, fegg: 0xfff4e0,
  well: 0x7a8a9a, mill: 0xd8c8a8, press: 0x9a5a3a, bakery: 0xd87a3a, hens: 0xe8d8a8, cow: 0xf0f0e8, dairy: 0xf6d860, kitchen: 0xe0a060 };
export const FRUIT_HEX: Record<FruitType, number> = { pea: 0x7ac943, blue: 0x4a64f0, black: 0x5a2a6a, asp: 0x8fe36a, cran: 0xf0306a, cab: 0xb8f070, lemon: 0xffe44a, chili: 0xff3a1a, nut: 0xc08a4a, ...ITEM_HEX };
export const FRUIT_COL: Record<FruitType, string> = Object.fromEntries(Object.entries(FRUIT_HEX).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')])) as Record<FruitType, string>;
const fbxCol = (k: keyof typeof BERRY_DATA) => new THREE.Color().setRGB(...BERRY_DATA[k].body, THREE.LinearSRGBColorSpace);
export const GROUND_MAT = <Record<FruitType, THREE.MeshStandardMaterial>><unknown>{
  // berries: real berry shape (vertex colours = dark crown), royal blue / raspberry red, glossy instead of milky glow;
  // blueberries only glow up (gently) as the next level-up approaches, see View.berryGlow
  blue: new THREE.MeshStandardMaterial({ color: fbxCol('blue'), emissive: 0x2440ff, emissiveIntensity: 0, roughness: BERRY_DATA.blue.rough, vertexColors: true }),
  asp: new THREE.MeshStandardMaterial({ color: 0x7fbf45, emissive: 0x4fa01a, emissiveIntensity: .44, roughness: .5 }),
  cran: new THREE.MeshStandardMaterial({ color: fbxCol('cran'), emissive: 0xe0104a, emissiveIntensity: .06, roughness: BERRY_DATA.cran.rough, vertexColors: true }),
  black: new THREE.MeshStandardMaterial({ color: fbxCol('black'), emissive: 0x4a1a5a, emissiveIntensity: .06, roughness: BERRY_DATA.black.rough, vertexColors: true }), // blackberry: dark violet drupelets
  cab: new THREE.MeshStandardMaterial({ color: 0x9ad870, emissive: 0x5aa020, emissiveIntensity: .36, roughness: .6, flatShading: true }),
  lemon: new THREE.MeshStandardMaterial({ color: 0xf0d030, emissive: 0xffd020, emissiveIntensity: .44, roughness: .4 }),
  chili: new THREE.MeshStandardMaterial({ color: 0xe0200c, emissive: 0xff2a08, emissiveIntensity: .48, roughness: .3 }),
  nut: new THREE.MeshStandardMaterial({ color: 0xa8743a, emissive: 0xc07a28, emissiveIntensity: .32, roughness: .5 }), // lying nuts glow warm, so they can be found in the grass
  // 23.11.2026: lying goods only glow faintly (40 %), so the night stays clear; goods from the fields and buildings: glow a little, so they can be found next to the buildings
  wheat: new THREE.MeshStandardMaterial({ color: 0xe0b85a, emissive: 0xc09030, emissiveIntensity: .28, roughness: .6, flatShading: true }),
  flour: new THREE.MeshStandardMaterial({ color: 0xf0e8d8, emissive: 0xfff4e0, emissiveIntensity: .14, roughness: .9, flatShading: true }),
  water: new THREE.MeshStandardMaterial({ color: 0x4aa8ff, emissive: 0x3a90ff, emissiveIntensity: .32, roughness: .15, transparent: true, opacity: .85 }),
  milk: new THREE.MeshStandardMaterial({ color: 0xf6f6ee, emissive: 0xffffff, emissiveIntensity: .1, roughness: .3 }),
  egg: new THREE.MeshStandardMaterial({ color: 0xf0dcbc, emissive: 0xffe8c0, emissiveIntensity: .14, roughness: .4 }),
  juice: new THREE.MeshStandardMaterial({ color: 0xc02850, emissive: 0xe03060, emissiveIntensity: .28, roughness: .2 }),
  bread: new THREE.MeshStandardMaterial({ color: 0xb87a38, emissive: 0xc07a28, emissiveIntensity: .18, roughness: .7, flatShading: true }),
  cheese: new THREE.MeshStandardMaterial({ color: 0xf2c630, emissive: 0xf0b820, emissiveIntensity: .22, roughness: .5, flatShading: true }),
  fegg: new THREE.MeshStandardMaterial({ color: 0xfffaf0, emissive: 0xfff0d0, emissiveIntensity: .12, roughness: .4 }),
};
const GLASS = new THREE.MeshStandardMaterial({ color: 0xdff0ff, roughness: .1, transparent: true, opacity: .45 });
const CORK = new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: .8 });
const BOWL = new THREE.MeshStandardMaterial({ color: 0xd8c8b0, roughness: .6, flatShading: true });
const SACK = new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: .95, flatShading: true });
const STRING = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: .9 });
/** goods: little props instead of round fruit (sheaf, sack, droplet, bottle, egg, loaf, wedge, bowl) */
/** Saftpresse (23.11.2026): juice colour of each berry (BERRIES order: blue, black, cran) */
export const JUICE_HEX = [0x3a2fb0, 0x6e2476, 0xc81e3c];
const JUICE_MATS = JUICE_HEX.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .25, emissive: c, emissiveIntensity: .45 }));
const BOTTLE_GLASS = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: .3, transparent: true, opacity: .14, depthWrite: false });
const BOTTLE_CORK = new THREE.MeshStandardMaterial({ color: 0xe2c690, roughness: .9, flatShading: true });
const BOTTLE_BODY = new THREE.CylinderGeometry(.052, .055, .12, 14), BOTTLE_SHOULDER = new THREE.SphereGeometry(.052, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const BOTTLE_NECK = new THREE.CylinderGeometry(.021, .024, .045, 10), BOTTLE_JUICE = new THREE.CylinderGeometry(.047, .05, .1, 14), BOTTLE_TOP = new THREE.CircleGeometry(.047, 14);
/** little juice bottle like Basti's sketch: round shoulders, short neck, cork; juice of berry jb (-1 = mixed red) up to the shoulder.
 *  Origin = bottle centre, the bottom sits at y -.06 */
export function juiceBottle(jb = 2, fill = 1) {
  const g = new THREE.Group(), jm = JUICE_MATS[jb] ?? JUICE_MATS[2];
  const j = new THREE.Mesh(BOTTLE_JUICE, jm); j.scale.y = Math.max(.02, fill); j.position.y = -.055 + .05 * j.scale.y; g.add(j);
  const top = new THREE.Mesh(BOTTLE_TOP, jm); top.rotation.x = -Math.PI / 2; top.position.y = -.055 + .1 * j.scale.y; g.add(top);
  const body = new THREE.Mesh(BOTTLE_BODY, BOTTLE_GLASS); body.renderOrder = 3; g.add(body);
  const sh = new THREE.Mesh(BOTTLE_SHOULDER, BOTTLE_GLASS); sh.position.y = .06; sh.scale.y = .7; sh.renderOrder = 3; g.add(sh);
  const nk = new THREE.Mesh(BOTTLE_NECK, BOTTLE_GLASS); nk.position.y = .11; nk.renderOrder = 3; g.add(nk);
  part(g, GEO.cyl, BOTTLE_CORK, .025, .03, .025, 0, .14, 0);
  g.userData.juice = j; g.userData.top = top; g.scale.setScalar(1.5);
  return g;
}
function itemMesh(type: FruitType, g: THREE.Group, mat: THREE.Material) {
  switch (type) {
    case 'wheat': for (let i = 0; i < 5; i++) { const a = i / 5 * 7, s = part(g, GEO.capsule, mat, .022, .09, .022, Math.cos(a) * .03, .02, Math.sin(a) * .03); s.rotation.set(Math.cos(a) * .3, 0, Math.sin(a) * .3); }
      part(g, GEO.cyl, STRING, .045, .03, .045, 0, -.03, 0); return true;
    case 'flour': part(g, GEO.sph, SACK, .09, .1, .08, 0, 0, 0); part(g, GEO.cone, SACK, .05, .06, .05, 0, .11, 0); part(g, GEO.cyl, STRING, .04, .015, .04, 0, .085, 0); part(g, GEO.sph, mat, .05, .02, .05, 0, .14, 0); return true;
    case 'water': part(g, GEO.sph, mat, .07, .07, .07, 0, 0, 0); part(g, GEO.cone, mat, .045, .08, .045, 0, .09, 0); return true;
    case 'juice': g.add(juiceBottle(2)); void GLASS; void CORK; void mat; return true;
    case 'egg': for (let i = 0; i < 3; i++) { const a = i / 3 * 7; part(g, GEO.sph, mat, .045, .06, .045, Math.cos(a) * .045, 0, Math.sin(a) * .045); } return true;
    case 'bread': { const b = part(g, GEO.capsule, mat, .07, .1, .07, 0, 0, 0); b.rotation.z = Math.PI / 2; b.scale.y = .1; for (let i = -1; i <= 1; i++) { const c = part(g, GEO.box, SACK, .012, .01, .07, i * .05, .065, 0); c.rotation.y = .5; } return true; }
    case 'fegg': { const e = friedEgg(.1); e.position.y = -.07; g.add(e); void BOWL; return true; } // Spiegelei (23.11.2026)
  }
  return false;
}
export const NUT_CAP = new THREE.MeshStandardMaterial({ color: 0x6a8a3a, roughness: .8, flatShading: true });
export const BUSH_MAT = <Record<FruitType, THREE.MeshStandardMaterial>><unknown>{
  blue: new THREE.MeshStandardMaterial({ color: fbxCol('blue'), roughness: BERRY_DATA.blue.rough, vertexColors: true }),
  asp: new THREE.MeshStandardMaterial({ color: 0x5f8f35, roughness: .6 }),
  cran: new THREE.MeshStandardMaterial({ color: fbxCol('cran'), roughness: BERRY_DATA.cran.rough, vertexColors: true }), // blood red (23.11.2026)
  black: new THREE.MeshStandardMaterial({ color: fbxCol('black'), roughness: BERRY_DATA.black.rough, vertexColors: true }),
  cab: new THREE.MeshStandardMaterial({ color: 0x7aa858, roughness: .7, flatShading: true }),
  lemon: new THREE.MeshStandardMaterial({ color: 0xc8b02a, roughness: .45, emissive: 0x8ac0ff, emissiveIntensity: 0 }), // emissive flickers with the harvest lightning
  chili: new THREE.MeshStandardMaterial({ color: 0xc81a0a, roughness: .3, emissive: 0xff2000, emissiveIntensity: .45 }), // chilis glow slightly red, also on the plant
  nut: new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: .55 }),
  wheat: new THREE.MeshStandardMaterial({ color: 0xd8b050, roughness: .7, flatShading: true }),
};
export const CHILI_STEM = new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: .6 });
const THORN_CANE = new THREE.MeshStandardMaterial({ color: 0x5a2a30, roughness: .7 }), THORN = new THREE.MeshStandardMaterial({ color: 0xc8a890, roughness: .6 });
export const ASP_TIP_GROUND = new THREE.MeshStandardMaterial({ color: 0x9a5cc0, emissive: 0x7a2aaa, emissiveIntensity: .45 });
export const ASP_TIP_BUSH = new THREE.MeshStandardMaterial({ color: 0x6a3a88, roughness: .6 });
// projectiles glow clearly brighter than anything lying around
export const PROJ_ASP = new THREE.MeshStandardMaterial({ color: 0xb8ff70, emissive: 0x8cff3a, emissiveIntensity: 3.2, roughness: .4 });
export const PROJ_ASP_TIP = new THREE.MeshStandardMaterial({ color: 0xd8a0ff, emissive: 0xb050ff, emissiveIntensity: 3.2 });
export const PROJ_CRAN = new THREE.MeshStandardMaterial({ color: 0xff4a5e, emissive: 0xff1a3a, emissiveIntensity: 3.6, roughness: .3 });
export const PROJ_CAB = new THREE.MeshStandardMaterial({ color: 0xc8ff90, emissive: 0x8ae040, emissiveIntensity: 1.8, roughness: .6, flatShading: true });

/** Startbeeren = Bastis eigene Modelle aus der FBX (24.11.2026, tools/berries): vertex colours = crown relative to the body colour */
function fbxBerryGeo(k: keyof typeof BERRY_DATA) {
  const d = BERRY_DATA[k], g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3)); return g;
}
export const BERRY_GEO = { blue: fbxBerryGeo('blue'), cran: fbxBerryGeo('cran'), black: fbxBerryGeo('black') };
/** berry size on the bush / lying on the ground: one scale for all three, the size differences come from the FBX */
const BERRY_BUSH = .058, BERRY_GROUND = .085;
export function fruitMesh(type: FruitType, scale: number, glow = true, proj = false) {
  const g = new THREE.Group();
  const mat = (proj ? (type === 'asp' ? PROJ_ASP : type === 'cran' ? PROJ_CRAN : PROJ_CAB) : glow ? GROUND_MAT[type] : BUSH_MAT[type]) ?? GROUND_MAT[type] ?? GROUND_MAT.wheat;
  if (itemMesh(type, g, mat)) { /* goods */ }
  else if (type === 'asp') {
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
  else { const berry = !proj && (type === 'blue' || type === 'cran' || type === 'black'), r = berry ? BERRY_GROUND : .07; const b = part(g, berry ? BERRY_GEO[type as 'blue'] : GEO.sph, mat, r, r, r, 0, 0, 0); b.rotation.set(rand(-.6, .6), rand(0, 7), rand(-.6, .6)); }
  g.scale.setScalar(scale); return g;
}

export interface PlantMats { leaf: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial }
export function buildPlant(type: FruitType, mats: PlantMats) {
  const g = new THREE.Group(); const fruits: THREE.Mesh[] = [];
  if (type === 'blue') { // 23.11.2026 blueberry bush: mixed saturated and dark green leaves, berries in bunches of 2-3
    for (let i = 0; i < 9; i++) { const a = i / 9 * 7, r = i ? rand(.28, .42) : 0; part(g, GEO.ico, i % 3 === 1 ? mats.head : mats.leaf, rand(.26, .36), rand(.24, .34), rand(.26, .36), Math.cos(a) * r, .36 + (i ? rand(-.04, .06) : .22), Math.sin(a) * r); }
    for (let i = 0; i < 7; i++) {
      const a = rand(0, 7), y = rand(.3, .75), r = .6 - Math.abs(y - .5) * .3, n = 2 + (Math.random() < .5 ? 1 : 0);
      for (let k = 0; k < n; k++) { const o = k / n * 6.28 + rand(0, 1); const b = part(g, BERRY_GEO.blue, BUSH_MAT.blue, BERRY_BUSH, BERRY_BUSH, BERRY_BUSH, Math.cos(a) * r + Math.cos(o) * .06, y - k * .03, Math.sin(a) * r + Math.sin(o) * .06, false); b.rotation.set(rand(-1.2, 1.2), rand(0, 7), rand(-1.2, 1.2)); fruits.push(b); }
    }
  } else if (type === 'asp') {
    for (let i = 0; i < 9; i++) {
      const a = rand(0, 7), r = rand(0, .5), h = rand(.4, .8); const st = part(g, GEO.cyl, mats.leaf, .04, h, .04, Math.cos(a) * r, h / 2, Math.sin(a) * r); st.rotation.set(rand(-.15, .15), 0, rand(-.15, .15));
      fruits.push(part(g, GEO.cone, ASP_TIP_BUSH, .055, .12, .055, Math.cos(a) * r, h + .04, Math.sin(a) * r, false));
    }
  } else if (type === 'cran') { // 23.11.2026 lingonberry: low, compact, many small saturated green leaves, berries in bunches of 3-4
    for (let i = 0; i < 16; i++) { const a = rand(0, 7), r = Math.sqrt(Math.random()) * .55; part(g, GEO.ico, mats.leaf, rand(.12, .17), rand(.08, .12), rand(.12, .17), Math.cos(a) * r, rand(.12, .26), Math.sin(a) * r); }
    for (let i = 0; i < 7; i++) {
      const a = rand(0, 7), r = rand(.15, .55), y = rand(.24, .34), n = 3 + (Math.random() < .5 ? 1 : 0);
      for (let k = 0; k < n; k++) { const o = k / n * 6.28 + rand(0, 1); const b = part(g, BERRY_GEO.cran, BUSH_MAT.cran, BERRY_BUSH, BERRY_BUSH, BERRY_BUSH, Math.cos(a) * r + Math.cos(o) * .045, y - (k % 2) * .03, Math.sin(a) * r + Math.sin(o) * .045, false); b.rotation.set(rand(-1.2, 1.2), rand(0, 7), rand(-1.2, 1.2)); fruits.push(b); }
    }
  } else if (type === 'black') { // 23.11.2026 blackberry: darker cool green leaves (some reddish), thorny arching canes, single big drupelet berries
    for (let i = 0; i < 4; i++) { // arching canes with small thorns
      const a = i / 4 * 6.28 + rand(-.3, .3), cane = new THREE.Group(); cane.rotation.y = -a; g.add(cane);
      const c = part(cane, GEO.cyl, THORN_CANE, .028, .7, .028, .2, .4, 0); c.rotation.z = -.75;
      for (let k = 0; k < 5; k++) { const t = .1 + k * .12, th = part(cane, GEO.cone, THORN, .014, .045, .014, .2 + (t - .35) * .68 * 1, .4 + (t - .35) * .73, (k % 2 ? 1 : -1) * .02, false); th.rotation.set((k % 2 ? 1 : -1) * 1.3, 0, -.75 + .8); }
    }
    for (let i = 0; i < 8; i++) { const a = i / 8 * 7, r = i ? rand(.25, .45) : 0; part(g, GEO.ico, i % 4 === 2 ? mats.head : mats.leaf, rand(.24, .32), rand(.2, .28), rand(.24, .32), Math.cos(a) * r, .34 + (i ? rand(-.05, .08) : .16), Math.sin(a) * r); }
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28 + rand(-.2, .2), y = rand(.28, .7), r = .58 - Math.abs(y - .48) * .3; const b = part(g, BERRY_GEO.black, BUSH_MAT.black, BERRY_BUSH, BERRY_BUSH, BERRY_BUSH, Math.cos(a) * r, y, Math.sin(a) * r, false); b.rotation.set(rand(-.4, .4), rand(0, 7), rand(-.4, .4)); fruits.push(b); }
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
  } else if (type === 'wheat') { // a dense tuft of golden stalks with ears, swaying
    for (let i = 0; i < 26; i++) {
      const a = rand(0, 7), r = Math.sqrt(Math.random()) * .55, h = rand(.55, .8);
      const st = part(g, GEO.cyl, mats.leaf, .012, h, .012, Math.cos(a) * r, h / 2, Math.sin(a) * r); st.rotation.set(rand(-.12, .12), 0, rand(-.12, .12));
      fruits.push(part(g, GEO.capsule, BUSH_MAT.wheat, .03, .1, .03, Math.cos(a) * r + st.rotation.z * -h * .5, h + .06, Math.sin(a) * r + st.rotation.x * h * .5, false));
    }
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
/** rake head as wide as the raked strip: one tine per scratch, same spacing (wider rake = more tines) */
export function rakeHead(w: number) {
  const head = rakeHeadModel(rakeTines(w), TINE_GAP, w);
  head.userData.w = w; return head;
}
export function buildPlayer(look: Look, rakeLen: number, rakeW: number) {
  const g = new THREE.Group();
  const wood = M(0x7a5230);
  const body = new THREE.Group(); g.add(body);
  // detailed farmer figure (character editor look), hands follow the weapons via IK (view.animPlayer)
  const rig = buildFarmer(look); body.add(rig.root);
  addOutline(rig.root, INK, .014, false); // clear dark silhouette (23.11.2026)
  // rake: pivot at the player, head reaches exactly the hit range so the swing matches the cone
  const rake = new THREE.Group(); rake.position.set(0, .62, 0); rake.rotation.order = 'YXZ'; g.add(rake);
  const L = rakeLen - .12;
  rake.add(rakeHandle(L)); void wood;
  const head = rakeHead(rakeW); head.position.z = L; rake.add(head);
  // lemon wand (Citrateaser): second arm + slim wooden wand with a lemon on the tip, only while equipped
  const wand = new THREE.Group(); wand.visible = false; body.add(wand);
  const stick = new THREE.Group(); stick.position.set(-.25, .67, .22); stick.rotation.set(-.42, .2, 0, 'YXZ'); wand.add(stick); // in the hand, tilted up, pointing slightly inward
  const lemonMat = lemonWand(stick) as THREE.MeshStandardMaterial;
  const wandTip = new THREE.Object3D(); wandTip.position.set(0, 0, .53); stick.add(wandTip);
  const stars = new THREE.Group(); stars.position.y = 1.55; stars.visible = false; g.add(stars);
  for (let i = 0; i < 3; i++) part(stars, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffe066 }), .05, .05, .05, Math.cos(i * 2.1) * .25, 0, Math.sin(i * 2.1) * .25, false);
  return { g, body, rake, head, stars, L, wand, wandTip, wandGrip: stick, lemonMat, rig };
}

// eye colours requested for the darkness: panda orange, raccoon blue, toad golden on blue skin
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
  const a = makeAnimalShell(type, boss), g = a.g; // 25.11.2026: drawn instanced with baked motion (herd.ts)
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
/** dark outline colour of the figure and the animals */
export const INK = 0x140e0a;
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
function outlineMat(color: number, width: number, glow = true) {
  const key = color + ':' + width + ':' + glow; let m = outlineMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uW: { value: width }, uTime: windU, uDay: envU.uDay, uOutl: outlineU },
      side: THREE.BackSide, toneMapped: false, fog: false,
      // works for rigid and skinned meshes (the skinning chunks are only active on a SkinnedMesh)
      vertexShader: `uniform float uW; uniform float uDay; uniform float uOutl;
        #include <common>
        #include <skinning_pars_vertex>
        void main(){
          #include <skinbase_vertex>
          #include <beginnormal_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 wp=modelMatrix*vec4(transformed,1.); vec3 n=normalize(mat3(modelMatrix)*objectNormal);
          wp.xyz+=n*uW*(1.+.5*uDay); gl_Position=projectionMatrix*viewMatrix*wp; if(uOutl<.5) gl_Position=vec4(0.,0.,2.,1.); }`, // outlines off: outside the clip space
      fragmentShader: glow ? `uniform vec3 uColor; uniform float uTime; uniform float uDay; void main(){ gl_FragColor=vec4(uColor*(1.9+.35*sin(uTime*3.)+uDay*.8),1.); }`
        : `uniform vec3 uColor; void main(){ gl_FragColor=vec4(uColor,1.); }`, // plain dark ink line (23.11.2026: clearer silhouettes, no glow)
    });
    outlineMats.set(key, m);
  }
  return m;
}
/** add a glowing outline in the given colour around all lit parts below root (eyes, shield, stars stay without) */
export function addOutline(root: THREE.Object3D, color: number, width = .03, glow = true) {
  // (the animal player body is one skinned mesh with two materials: fur + overalls)
  const mat = outlineMat(color, width, glow), list: THREE.Mesh[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; const mt = Array.isArray(m.material) ? m.material[0] : m.material; if (m.isMesh && mt?.type === 'MeshStandardMaterial') list.push(m); });
  for (const m of list) {
    const sk = m as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) { const h = new THREE.SkinnedMesh(smoothGeo(m.geometry), mat); h.castShadow = false; h.renderOrder = -1; h.frustumCulled = false; m.parent!.add(h); h.bind(sk.skeleton, sk.bindMatrix); }
    else { const h = new THREE.Mesh(smoothGeo(m.geometry), mat); h.castShadow = false; h.renderOrder = -1; m.add(h); }
  }
}


// ---------------- one-hand field tools (23.11.2026, Basti): sickle for wheat, hand rake for berries ----------------
// Both hang in a pivot at the right shoulder (see View.animPlayer); local +z points away from the player, the grip
// is at the origin of the returned group.
const TOOL_WOOD = M(0x8a5a32), TOOL_STEEL = M(0xc8ccd2, { m: .6, r: .35 }), TOOL_DARK = M(0x5a3a22);
/** sickle: short wooden grip, a crescent blade curving to the left (sharp side inside) */
export function sickleModel() {
  const g = new THREE.Group();
  const grip = part(g, GEO.cyl, TOOL_WOOD, .022, .17, .022, 0, 0, .07); grip.rotation.x = Math.PI / 2;
  part(g, GEO.cyl, TOOL_DARK, .026, .025, .026, 0, 0, .155).rotation.x = Math.PI / 2;
  const blade = new THREE.Mesh(new THREE.TorusGeometry(.17, .016, 5, 22, Math.PI * 1.15), TOOL_STEEL);
  blade.scale.set(1, 1, .35); blade.rotation.set(Math.PI / 2, 0, Math.PI * .05); blade.position.set(-.17, 0, .17); blade.castShadow = true; g.add(blade);
  return g;
}
/** small hand rake: short handle, three curved tines */
export function handRakeModel() {
  const g = new THREE.Group();
  const h = part(g, GEO.cyl, TOOL_WOOD, .02, .22, .02, 0, 0, .09); h.rotation.x = Math.PI / 2;
  part(g, GEO.box, TOOL_STEEL, .13, .02, .03, 0, 0, .21);
  for (let i = -1; i <= 1; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(.06, .009, 5, 10, Math.PI * .6), TOOL_STEEL);
    t.rotation.set(0, Math.PI / 2, -Math.PI * .1); t.position.set(i * .055, -.05, .2); t.castShadow = true; g.add(t);
  }
  return g;
}
