import * as THREE from 'three';
import type { EnemyType, FruitType } from '../config';
import { GEO, M, part, rand, windU } from './core';

// Fruit lying on the ground glows; fruit still on the bush does not.
export const FRUIT_COL: Record<FruitType, string> = { blue: '#5a74ff', asp: '#8fe36a', cran: '#ff4d5e', cab: '#b8f070' };
export const FRUIT_HEX: Record<FruitType, number> = { blue: 0x5a74ff, asp: 0x8fe36a, cran: 0xff4d5e, cab: 0xb8f070 };
export const GROUND_MAT: Record<FruitType, THREE.MeshStandardMaterial> = {
  blue: new THREE.MeshStandardMaterial({ color: 0x3550e0, emissive: 0x2a44ff, emissiveIntensity: 1.3, roughness: .25 }),
  asp: new THREE.MeshStandardMaterial({ color: 0x7fbf45, emissive: 0x4fa01a, emissiveIntensity: 1.1, roughness: .5 }),
  cran: new THREE.MeshStandardMaterial({ color: 0xd02035, emissive: 0xff1030, emissiveIntensity: 1.2, roughness: .3 }),
  cab: new THREE.MeshStandardMaterial({ color: 0x9ad870, emissive: 0x5aa020, emissiveIntensity: .9, roughness: .6, flatShading: true }),
};
export const BUSH_MAT: Record<FruitType, THREE.MeshStandardMaterial> = {
  blue: new THREE.MeshStandardMaterial({ color: 0x2a3a9a, roughness: .35 }),
  asp: new THREE.MeshStandardMaterial({ color: 0x5f8f35, roughness: .6 }),
  cran: new THREE.MeshStandardMaterial({ color: 0x9a1828, roughness: .35 }),
  cab: new THREE.MeshStandardMaterial({ color: 0x7aa858, roughness: .7, flatShading: true }),
};
export const ASP_TIP_GROUND = new THREE.MeshStandardMaterial({ color: 0x9a5cc0, emissive: 0x7a2aaa, emissiveIntensity: 1.1 });
export const ASP_TIP_BUSH = new THREE.MeshStandardMaterial({ color: 0x6a3a88, roughness: .6 });
// projectiles glow clearly brighter than anything lying around
export const PROJ_ASP = new THREE.MeshStandardMaterial({ color: 0xb8ff70, emissive: 0x8cff3a, emissiveIntensity: 3.2, roughness: .4 });
export const PROJ_ASP_TIP = new THREE.MeshStandardMaterial({ color: 0xd8a0ff, emissive: 0xb050ff, emissiveIntensity: 3.2 });
export const PROJ_CRAN = new THREE.MeshStandardMaterial({ color: 0xff4a5e, emissive: 0xff1a3a, emissiveIntensity: 3.6, roughness: .3 });
export const PROJ_CAB = new THREE.MeshStandardMaterial({ color: 0xc8ff90, emissive: 0x8ae040, emissiveIntensity: 1.8, roughness: .6, flatShading: true });

export function fruitMesh(type: FruitType, scale: number, glow = true, proj = false) {
  const g = new THREE.Group();
  const mat = proj ? (type === 'asp' ? PROJ_ASP : type === 'cran' ? PROJ_CRAN : PROJ_CAB) : glow ? GROUND_MAT[type] : BUSH_MAT[type];
  if (type === 'asp') {
    const st = part(g, GEO.cyl, mat, .035, .38, .035, 0, 0, 0); st.rotation.z = Math.PI / 2;
    const tp = part(g, GEO.cone, proj ? PROJ_ASP_TIP : glow ? ASP_TIP_GROUND : ASP_TIP_BUSH, .045, .1, .045, .22, 0, 0); tp.rotation.z = -Math.PI / 2;
  } else if (type === 'cab') { part(g, GEO.ico, mat, .14, .13, .14, 0, 0, 0); part(g, GEO.lo, mat, .1, .06, .12, .08, .03, 0); part(g, GEO.lo, mat, .1, .06, .12, -.08, .03, .02); }
  else { const r = type === 'blue' ? .085 : .07; part(g, GEO.sph, mat, r, r, r, 0, 0, 0); }
  g.scale.setScalar(scale); return g;
}

export interface PlantMats { leaf: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial }
export function buildPlant(type: FruitType, mats: PlantMats) {
  const g = new THREE.Group(); const fruits: THREE.Mesh[] = [];
  if (type === 'blue') {
    for (let i = 0; i < 7; i++) { const a = i / 7 * 7, r = i ? .38 : 0; part(g, GEO.ico, mats.leaf, rand(.32, .42), rand(.3, .4), rand(.32, .42), Math.cos(a) * r, .38 + (i ? 0 : .22), Math.sin(a) * r); }
    for (let i = 0; i < 16; i++) { const a = rand(0, 7), y = rand(.25, .8), r = .62 - Math.abs(y - .5) * .3; fruits.push(part(g, GEO.sph, BUSH_MAT.blue, .055, .055, .055, Math.cos(a) * r, y, Math.sin(a) * r, false)); }
  } else if (type === 'asp') {
    for (let i = 0; i < 9; i++) {
      const a = rand(0, 7), r = rand(0, .5), h = rand(.4, .8); const st = part(g, GEO.cyl, mats.leaf, .04, h, .04, Math.cos(a) * r, h / 2, Math.sin(a) * r); st.rotation.set(rand(-.15, .15), 0, rand(-.15, .15));
      fruits.push(part(g, GEO.cone, ASP_TIP_BUSH, .055, .12, .055, Math.cos(a) * r, h + .04, Math.sin(a) * r, false));
    }
  } else if (type === 'cran') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * 7, r = rand(.15, .5); part(g, GEO.ico, mats.leaf, rand(.22, .3), rand(.14, .2), rand(.22, .3), Math.cos(a) * r, .16, Math.sin(a) * r); }
    for (let i = 0; i < 22; i++) { const a = rand(0, 7), r = rand(.1, .65); fruits.push(part(g, GEO.sph, BUSH_MAT.cran, .045, .045, .045, Math.cos(a) * r, rand(.2, .36), Math.sin(a) * r, false)); }
  } else if (type === 'cab') {
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2, r = .42, x = Math.cos(a) * r, z = Math.sin(a) * r;
      part(g, GEO.ico, mats.head, .26, .24, .26, x, .24, z);
      for (let k = 0; k < 4; k++) { const b = k / 4 * 7; const l = part(g, GEO.lo, mats.leaf, .2, .06, .26, x + Math.cos(b) * .18, .14, z + Math.sin(b) * .18); l.rotation.set(rand(-.5, .5), b, rand(-.4, .4)); }
    }
  }
  return { g, fruits };
}

export const PLAYER_COATS = [0x3c5a3e, 0x34507a, 0x7a3a34, 0x5e3f7a];
export const PLAYER_RING = [0xffd890, 0x8fc8ff, 0xff9a8a, 0xd0a0ff];
export function buildPlayer(color: number, rakeLen: number) {
  const g = new THREE.Group();
  const coat = M(PLAYER_COATS[color % 4]), skin = M(0xe0b08a), straw = M(0xc9a35a), dark = M(0x2a2420), wood = M(0x7a5230), steel = M(0xa8b0b8, { m: .8, r: .35 });
  const body = new THREE.Group(); g.add(body);
  part(body, GEO.capsule, coat, .22, .32, .2, 0, .62, 0);
  part(body, GEO.box, M(0x6b4a2a), .46, .08, .4, 0, .52, 0);
  part(body, GEO.cyl, dark, .07, .32, .07, -.1, .16, 0); part(body, GEO.cyl, dark, .07, .32, .07, .1, .16, 0);
  part(body, GEO.sph, skin, .16, .16, .16, 0, 1.08, 0);
  part(body, GEO.cyl, straw, .36, .03, .36, 0, 1.2, 0);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, .16, 10), straw); crown.position.y = 1.29; crown.castShadow = true; body.add(crown);
  part(body, GEO.sph, M(0x222222), .025, .025, .025, -.06, 1.1, .14, false); part(body, GEO.sph, M(0x222222), .025, .025, .025, .06, 1.1, .14, false);
  const arm = part(body, GEO.cyl, coat, .055, .38, .055, .26, .78, .08); arm.rotation.x = -1.0;
  // rake: pivot at the player, head reaches exactly the hit range so the swing matches the cone
  const rake = new THREE.Group(); rake.position.set(0, .62, 0); rake.rotation.order = 'YXZ'; g.add(rake);
  const L = rakeLen - .12;
  const h = part(rake, GEO.cyl, wood, .025, L, .025, 0, 0, L / 2); h.rotation.x = Math.PI / 2;
  part(rake, GEO.box, steel, .42, .04, .05, 0, 0, L);
  for (let i = 0; i < 6; i++) part(rake, GEO.cyl, steel, .012, .12, .012, -.18 + i * .072, -.06, L + .02);
  const stars = new THREE.Group(); stars.position.y = 1.55; stars.visible = false; g.add(stars);
  for (let i = 0; i < 3; i++) part(stars, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffe066 }), .05, .05, .05, Math.cos(i * 2.1) * .25, 0, Math.sin(i * 2.1) * .25, false);
  return { g, body, rake, stars, coat, L };
}

// eye colours requested for the darkness: panda orange, raccoon blue, toad green
export const EYE_COL: Record<EnemyType, number> = { raccoon: 0x5fb4ff, panda: 0xff8a26, toad: 0x6dff3a, sheep: 0xe8e2cc };
function eyeMat(c: number) { return new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); }

const shieldBase = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x6fd0ff) }, uTime: windU, uStr: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vP=position; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uStr; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float f=pow(1.-abs(dot(normalize(vN),vV)),2.2); float band=.5+.5*sin(vP.y*18.-uTime*5.); float hx=step(.92,fract(vP.x*6.+vP.y*3.))+step(.92,fract(vP.z*6.-vP.y*3.));
      float a=(f*1.1+band*.06+hx*.08)*uStr; gl_FragColor=vec4(uColor*a*1.4,a); }`,
});

export interface EnemyParts { body: THREE.Group; stars: THREE.Group; mats: THREE.MeshStandardMaterial[]; tongue?: THREE.Group; shield?: THREE.Mesh; eyes?: THREE.Mesh[]; carry: THREE.Group }
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
    const tm = part(tongue, GEO.cyl, M(0xff6a8a, { e: 0xff3060, ei: .6 }), .03, 1, .03, 0, 0, .5, false); tm.rotation.x = Math.PI / 2;
    tongue.scale.set(1, 1, .01); tongue.visible = false; P.tongue = tongue;
    P.mats = [sk, bl, wart];
  } else {
    const wool = M(0xece6da), dk = M(0x1e1a18);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 7; part(body, GEO.ico, wool, rand(.18, .24), rand(.18, .22), rand(.18, .24), Math.cos(a) * .2, .44 + rand(-.05, .08), Math.sin(a) * .26); }
    part(body, GEO.ico, wool, .3, .26, .36, 0, .45, 0);
    part(body, GEO.box, dk, .17, .19, .24, 0, .52, .4); part(body, GEO.box, dk, .14, .04, .06, -.13, .58, .36).rotation.z = .4; part(body, GEO.box, dk, .14, .04, .06, .13, .58, .36).rotation.z = -.4;
    const em = eyeMat(0xffffff); P.eyes = [part(body, GEO.sph, em, .025, .025, .025, -.06, .56, .52, false), part(body, GEO.sph, em.clone(), .025, .025, .025, .06, .56, .52, false)];
    for (const [x, z] of [[-.15, .2], [.15, .2], [-.15, -.2], [.15, -.2]]) part(body, GEO.cyl, dk, .045, .3, .045, x, .15, z);
    const sh = new THREE.Mesh(GEO.sph, shieldBase.clone()); (sh.material as THREE.ShaderMaterial).uniforms.uTime = windU; sh.scale.setScalar(.7); sh.position.y = .42; g.add(sh); P.shield = sh;
    P.mats = [wool];
  }
  const stars = new THREE.Group(); stars.visible = false; stars.position.y = type === 'toad' ? .65 : .9; g.add(stars);
  for (let i = 0; i < 3; i++) part(stars, GEO.sph, new THREE.MeshBasicMaterial({ color: 0x9cff60 }), .045, .045, .045, Math.cos(i * 2.1) * .22, 0, Math.sin(i * 2.1) * .22, false);
  P.stars = stars;
  const carry = new THREE.Group(); body.add(carry); P.carry = carry;
  return { g, P: P as EnemyParts };
}
