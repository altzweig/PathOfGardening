// Combo weapons (Kombiwaffen): weapon models in the hand, projectiles, thrown bombs and all their effects.
// Pure view code: the simulation only sends kinds, positions and events (see sim.ts "combo weapons").
import * as THREE from 'three';
import { COMBOS, ComboId } from '../config';
import { GEO, M, PART, V, addMat, burst, decal, lightning, part, rand } from './core';
import { BUSH_MAT, CHILI_STEM, PROJ_ASP, PROJ_CRAN, BERRY_GEO } from './models';
import { play, sfx } from '../audio';
import { comboModel } from './arsenal';

// ---------- materials ----------
const glow = (c: number, e: number, ei: number, r = .4) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: r });
const MAT = {
  redWood: M(0x7a2416, { r: .55 }), redWoodDk: M(0x4a140c, { r: .6 }), yellowLac: M(0xe8c22a, { r: .35, m: .2 }), yellowDk: M(0xa8861a, { r: .45 }),
  brass: M(0xc89a3a, { m: .75, r: .3 }), steel: M(0x6a727a, { m: .8, r: .35 }), string: new THREE.MeshBasicMaterial({ color: 0xf2e6c8 }),
  tube: M(0x4f8a2a, { r: .5 }), tubeDk: M(0x2f5a1a, { r: .55 }), lemon: glow(0xffe23a, 0xffc800, .35, .45), lemonHot: glow(0xfff07a, 0xffd820, 2.6, .35),
  berry: glow(0xff2a44, 0xff1030, 1.4, .3), berryHot: glow(0xff6a2a, 0xff3a00, 3.2, .3), chili: BUSH_MAT.chili, chiliHot: glow(0xff3a12, 0xff2a00, 1.2, .35),
  bladeY: glow(0xffd23a, 0xff9a10, .5, .3), cab: BUSH_MAT.cab, cabRed: M(0xa8243a, { r: .6 }), cabRedLeaf: M(0x7a1a3a, { r: .6 }),
  tipLemon: glow(0xfff27a, 0xffe040, 3.4, .3), sourShaft: glow(0xd8ff80, 0xa8ff40, 2.4, .4), ember: glow(0xffb040, 0xff7a10, 3, .4),
};
const ADD = (c: number, op: number) => addMat(c, op);
const COL: Record<ComboId, number> = { jam: 0xff3050, cole: 0x9cff60, sour: 0xffe040, lance: 0xff7a20, cabboom: 0xff4060, shock: 0xfff070, hot: 0xff6a20, rocket: 0xfff2a0, kimchi: 0xff5a20, chilight: 0xffe070 };
export const comboOf = (i: number): ComboId | '' => (i >= 0 ? COMBOS[i] ?? '' : '');

function seg(g: THREE.Object3D, mat: THREE.Material, r: number, a: number[], b: number[]) { // cylinder from a to b
  const d = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = part(g, GEO.cyl, mat, r, d.length(), r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, false);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m;
}
const PEL_BLUE = glow(0x5a74ff, 0x2a40d0, .5, .3), PEL_BLACK = glow(0x4a2858, 0x2a0a3a, .3, .3);
function berry(g: THREE.Object3D, mat: THREE.Material, r: number, x: number, y: number, z: number) { const b = part(g, BERRY_GEO.cran, mat, r, r, r, x, y, z, false); b.rotation.set(rand(-.5, .5), rand(0, 7), rand(-.5, .5)); return b; }
function chiliPod(g: THREE.Object3D, mat: THREE.Material, s: number, x: number, y: number, z: number, ry = 0, rx = 0) {
  const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.set(rx, ry, 0); g.add(c);
  const b = part(c, GEO.capsule, mat, .034 * s, .035 * s, .034 * s, 0, 0, 0, false); b.rotation.x = Math.PI / 2;
  const t = part(c, GEO.cone, mat, .03 * s, .08 * s, .03 * s, 0, .01 * s, .1 * s, false); t.rotation.x = Math.PI / 2 - .35;
  const st = part(c, GEO.cyl, CHILI_STEM, .012 * s, .05 * s, .012 * s, 0, .01 * s, -.08 * s, false); st.rotation.x = Math.PI / 2 + .4;
  return c;
}
function cabbage(g: THREE.Object3D, mat: THREE.Material, r: number, leaf: THREE.Material = mat) {
  part(g, GEO.ico, mat, r, r * .92, r, 0, 0, 0, false);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const l = part(g, GEO.lo, leaf, r * .7, r * .38, r * .8, Math.cos(a) * r * .55, r * .15, Math.sin(a) * r * .55, false); l.rotation.set(rand(-.4, .4), a, rand(-.3, .3)); }
}
/** asparagus bolt along +z (shaft + tip of the given material) */
function bolt(g: THREE.Object3D, shaft: THREE.Material, tip: THREE.Material, len: number, r: number, z = 0, x = 0, y = 0, berryTip = false) {
  const s = part(g, GEO.cyl, shaft, r, len, r, x, y, z, false); s.rotation.x = Math.PI / 2;
  if (berryTip) berry(g, tip, r * 2.2, x, y, z + len / 2 + r * 1.2);
  else { const t = part(g, GEO.sph, tip, r * 1.9, r * 1.6, r * 2.8, x, y, z + len / 2 + r * 1.5, false); void t; }
  return s;
}

// ---------- held weapons ----------
export interface Held { g: THREE.Group; cid: ComboId; t0: THREE.Vector3; t1: THREE.Vector3; muzzle: THREE.Vector3; anim: THREE.Group; loaded?: THREE.Object3D; base: THREE.Vector3 }
/** model in the player's hands, local to the player group (+z = forward). t0/t1 = grip points for the hands (weapon space) */
export function buildHeld(cid: ComboId): Held {
  const g = new THREE.Group(), a = new THREE.Group(); g.add(a);
  const m = comboModel(cid, a);
  g.position.copy(m.base);
  return { g, cid, t0: m.t0, t1: m.t1, muzzle: m.muzzle, anim: a, loaded: m.loaded, base: m.base };
}
/** recoil / slam animation; k = time since the last shot (s) */
export function animHeld(h: Held, k: number) {
  const a = h.anim;
  if (h.cid === 'chilight') { // raise and slam down onto the ground
    const t = Math.min(1, k / .35), up = k < .08 ? k / .08 : 1 - t;
    a.rotation.x = k < .08 ? -1.2 * up : t < 1 ? .55 * (1 - t) * Math.sin(t * 3) + .5 * (1 - t) : 0; a.position.y = k < .08 ? .1 * up : 0;
    return;
  }
  const r = Math.max(0, .12 - k) / .12;
  a.position.z = -r * (h.cid === 'rocket' ? .12 : .06); a.rotation.x = -r * (h.cid === 'rocket' ? .25 : .4);
  if (h.loaded) h.loaded.visible = h.cid === 'cole' || h.cid === 'cabboom' || h.cid === 'kimchi' ? k > .35 : h.cid === 'lance' || h.cid === 'shock' || h.cid === 'hot' ? true : k > .12;
  if (h.cid === 'lance' && h.loaded) h.loaded.scale.setScalar(.06 * (1 + .25 * Math.sin(performance.now() / 70)) * Math.min(1, k * 3));
}

// ---------- projectiles / bombs / ground ----------
/** PK index (sim): 0 asp, 1 cran, 2 jam, 3 spike, 4 sour, 5 lance, 6 hot, 7 rocket, 8 shock, 9 lemon ball lightning */
const GRAIN = M(0xe0b050, { r: .5 });
export function projMesh(kind: number): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 2: bolt(g, PROJ_ASP, MAT.berry, .42, .03, 0, 0, 0, true); part(g, GEO.sph, ADD(0xff2040, .45), .09, .09, .09, 0, 0, .3, false); break;
    case 3: bolt(g, PROJ_ASP, M(0xd8a0ff, { e: 0xb050ff, ei: 3 }), .3, .022); break;
    case 4: bolt(g, MAT.sourShaft, MAT.tipLemon, .5, .026); part(g, GEO.sph, ADD(0xfff070, .35), .08, .08, .26, 0, 0, .05, false); break;
    case 5: { // pulsing fireball: hot core + two additive shells
      part(g, GEO.sph, glow(0xffe0a0, 0xffc060, 4), .35, .35, .35, 0, 0, 0, false);
      part(g, GEO.ico, ADD(0xff7a18, .55), .7, .7, .7, 0, 0, 0, false); part(g, GEO.ico, ADD(0xff3a00, .3), 1, 1, 1, 0, 0, 0, false);
      g.userData.pulse = true; break;
    }
    case 6: part(g, BERRY_GEO.cran, MAT.berryHot, .075, .075, .075, 0, 0, 0, false); part(g, GEO.sph, ADD(0xff6a10, .5), .13, .13, .13, 0, 0, 0, false); break;
    case 7: { // rocket: green body, lemon nose, exhaust flame
      const b = part(g, GEO.cyl, MAT.tube, .2, .7, .2, 0, 0, -.1, false); b.rotation.x = Math.PI / 2;
      part(g, GEO.sph, MAT.lemonHot, .22, .22, .34, 0, 0, .3, false);
      for (let i = 0; i < 4; i++) { const f = part(g, GEO.box, MAT.tubeDk, .02, .2, .16, 0, 0, -.4, false); f.rotation.z = i * Math.PI / 2; f.position.set(Math.cos(i * Math.PI / 2) * .14, Math.sin(i * Math.PI / 2) * .14, -.4); }
      const fl = part(g, GEO.cone, ADD(0xffa030, .9), .14, .6, .14, 0, 0, -.75, false); fl.rotation.x = -Math.PI / 2; g.userData.flame = fl;
      break;
    }
    case 8: part(g, BERRY_GEO.cran, glow(0xffe23a, 0xffd000, 2.6, .3), .075, .075, .075, 0, 0, 0, false); part(g, GEO.sph, ADD(0xfff4a0, .4), .12, .12, .12, 0, 0, 0, false); break;
    case 9: { // ball lightning (lemon wand): white-hot core, yellow plasma shell, flickering arcs
      part(g, GEO.sph, glow(0xffffff, 0xfff6c0, 4), .045, .045, .045, 0, 0, 0, false);
      part(g, GEO.ico, ADD(0xffd830, .75), .085, .085, .085, 0, 0, 0, false);
      part(g, GEO.sph, ADD(0xffe050, .25), .16, .16, .16, 0, 0, 0, false);
      const arcs = new THREE.Group(); g.add(arcs);
      for (let i = 0; i < 4; i++) { const d = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); seg(arcs, ADD(0xfffbe0, .9), .006, [0, 0, 0], [d.x * .12, d.y * .12, d.z * .12]); }
      g.userData.arcs = arcs; g.userData.pulse = true; break;
    }
    case 10: part(g, BERRY_GEO.blue, PEL_BLUE, .07, .07, .07, 0, 0, 0, false); break; // blueberry pellet
    case 11: part(g, BERRY_GEO.black, PEL_BLACK, .075, .075, .075, 0, 0, 0, false); break; // blackberry pellet
    case 12: part(g, GEO.sph, GRAIN, .035, .035, .075, 0, 0, 0, false); part(g, GEO.sph, ADD(0xfff0b0, .35), .05, .05, .16, 0, 0, -.06, false); break; // Körner-MP: wheat grain with a faint streak
    default: part(g, GEO.sph, PROJ_CRAN, .07, .07, .07, 0, 0, 0, false);
  }
  return g;
}
/** per frame: trails and pulsing of combo projectiles */
export function animProj(kind: number, m: THREE.Object3D, x: number, y: number, z: number, ang: number, w: number, dt: number) {
  const now = performance.now() / 1000;
  if (kind === 5) { // fireball
    m.scale.setScalar(Math.max(.4, w / 2) * (1 + .14 * Math.sin(now * 22) + .06 * Math.sin(now * 37))); m.rotation.y += dt * 4; m.rotation.x += dt * 3;
    if (Math.random() < dt * 60) PART.spawn(V(x + rand(-.15, .15), y + rand(-.1, .15), z + rand(-.15, .15)), V(-Math.sin(ang) * rand(.5, 1.5), rand(.4, 1.4), -Math.cos(ang) * rand(.5, 1.5)), Math.random() < .5 ? 0xff7a18 : 0xffc040, rand(.18, .32), rand(.3, .55), { a: .9, s1: .1 });
  } else if (kind === 6) { if (Math.random() < dt * 30) PART.spawn(V(x, y, z), V(rand(-.2, .2), rand(.3, .8), rand(-.2, .2)), 0xff8a20, rand(.08, .14), rand(.2, .35), { a: .9 }); }
  else if (kind === 7) { // rocket: smoke and sparks behind
    const fl = m.userData.flame as THREE.Mesh | undefined; if (fl) fl.scale.set(.14, .5 + Math.random() * .3, .14);
    if (Math.random() < dt * 70) PART.spawn(V(x - Math.sin(ang) * .5, y, z - Math.cos(ang) * .5), V(rand(-.3, .3), rand(.2, .6), rand(-.3, .3)), 0x9a9a8a, rand(.3, .5), rand(.6, 1), { a: .35, drag: 1.5, s1: 2 });
    if (Math.random() < dt * 50) PART.spawn(V(x - Math.sin(ang) * .45, y, z - Math.cos(ang) * .45), V(-Math.sin(ang) * 3 + rand(-.5, .5), rand(-.2, .4), -Math.cos(ang) * 3 + rand(-.5, .5)), 0xffc040, rand(.08, .14), rand(.15, .3), { a: .9 });
  } else if (kind === 4) { if (Math.random() < dt * 25) PART.spawn(V(x, y, z), V(rand(-.3, .3), rand(-.1, .3), rand(-.3, .3)), 0xfff6a0, rand(.05, .09), rand(.12, .25), { a: .9 }); }
  else if (kind === 2) { if (Math.random() < dt * 14) PART.spawn(V(x, y, z), V(0, -.3, 0), 0xff2040, .05, .3, { g: 4 }); }
  else if (kind === 8) { m.rotation.y += dt * 9; }
  else if (kind === 9) { // ball lightning: pulsing, arcs spin and flicker, sparks fall off
    m.scale.setScalar((w || 1) * (1 + .12 * Math.sin(now * 31) + .06 * Math.sin(now * 53)));
    const a = m.userData.arcs as THREE.Object3D | undefined; if (a) { a.rotation.set(now * 7, now * 11, now * 5); a.visible = Math.random() < .8; }
    if (Math.random() < dt * 40) PART.spawn(V(x + rand(-.06, .06), y + rand(-.06, .06), z + rand(-.06, .06)), V(rand(-.6, .6), rand(-.2, .6), rand(-.6, .6)), Math.random() < .5 ? 0xfff6a0 : 0xffffff, rand(.03, .06), rand(.12, .25), { a: .95 });
  }
}
/** BK index: 1 cole (spiked time bomb), 2 cabboom (berry cabbage), 3 kimchi (red cabbage, splits) */
export function bombMesh(kind: number, gen: number): THREE.Object3D {
  const g = new THREE.Group(), c = new THREE.Group(); g.add(c);
  const r = .15 * Math.pow(.7, gen);
  if (kind === 3) { cabbage(c, MAT.cabRed, r, MAT.cabRedLeaf); for (let i = 0; i < 3; i++) chiliPod(c, MAT.chiliHot, r * 7, rand(-r, r) * .5, r * .9, rand(-r, r) * .5, rand(0, 7), -1.2); }
  else cabbage(c, PROJ_CAB_MAT, r);
  if (kind === 1) for (let i = 0; i < 16; i++) { const d = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); seg(c, PROJ_ASP, .012, [d.x * r * .7, d.y * r * .7, d.z * r * .7], [d.x * r * 1.6, d.y * r * 1.6, d.z * r * 1.6]); }
  if (kind === 2) for (let i = 0; i < 12; i++) { const d = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); berry(c, MAT.berry, .028, d.x * r * 1.02, d.y * r, d.z * r * 1.02); }
  if (kind === 1) { const l = part(g, GEO.sph, ADD(0xff3020, 0), r * 2.2, r * 2.2, r * 2.2, 0, 0, 0, false); g.userData.warn = l; }
  g.userData.spin = c;
  return g;
}
const PROJ_CAB_MAT = new THREE.MeshStandardMaterial({ color: 0xc8ff90, emissive: 0x8ae040, emissiveIntensity: 1.2, roughness: .6, flatShading: true });
export function animBomb(m: THREE.Object3D, kind: number, armed: boolean, fuse: number) {
  const c = m.userData.spin as THREE.Object3D; if (c && !armed) { c.rotation.x += .14; c.rotation.z += .05; }
  if (kind === 1 && armed) { // ticking faster and faster: red pulse + swell
    const f = 4 + fuse * fuse * 26, s = .5 + .5 * Math.sin(performance.now() / 1000 * f * Math.PI * 2);
    const l = m.userData.warn as THREE.Mesh; (l.material as THREE.MeshBasicMaterial).opacity = (.15 + .5 * fuse) * s;
    c.scale.setScalar(1 + fuse * .25 * s);
  }
  if (kind === 3 && armed && Math.random() < .3) PART.spawn(V(m.position.x, .2, m.position.z), V(rand(-.3, .3), .8, rand(-.3, .3)), 0xff7a18, .12, .3, { a: .9 });
}
export function nodeMesh(): THREE.Object3D {
  const g = new THREE.Group();
  part(g, BERRY_GEO.cran, glow(0xffe23a, 0xffc800, 2, .3), .075, .075, .075, 0, 0, 0, false);
  const h = part(g, GEO.sph, ADD(0xfff4a0, .35), .16, .16, .16, 0, 0, 0, false); g.userData.halo = h;
  return g;
}
export function animNode(m: THREE.Object3D, x: number, z: number, life: number) {
  const h = m.userData.halo as THREE.Mesh; h.scale.setScalar(.12 + .06 * Math.random() * life + .04);
  if (Math.random() < .25) PART.spawn(V(x + rand(-.1, .1), .1, z + rand(-.1, .1)), V(rand(-.6, .6), rand(.2, .9), rand(-.6, .6)), 0xfff6c0, .05, .15, { a: 1 });
}

// ---------- traveling lightning wave (Chillightning) ----------
interface Wave { ox: number; oz: number; dx: number; dz: number; len: number; w: number; sp: number; d: number; t: number; last: number }
const waves: Wave[] = [];
export function clearComboFx() { waves.length = 0; }
export function updateComboFx(dt: number) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; w.t += dt; const d = Math.min(w.len, w.t * w.sp);
    if (d - w.last > .9 || d >= w.len) { // a new stretch of the wave: wide main channel + lateral forks + scorched ground
      const a = w.last, nx = -w.dz, nz = w.dx, segs: [THREE.Vector3, THREE.Vector3, number][] = [];
      for (let k = -1; k <= 1; k++) {
        const o0 = k * w.w * .35 + rand(-.15, .15), o1 = k * w.w * .35 + rand(-.15, .15);
        segs.push([V(w.ox + w.dx * a + nx * o0, .2, w.oz + w.dz * a + nz * o0), V(w.ox + w.dx * d + nx * o1, .2, w.oz + w.dz * d + nz * o1), k === 0 ? 0 : 1]);
      }
      const side = Math.random() < .5 ? 1 : -1, bx = w.ox + w.dx * d, bz = w.oz + w.dz * d;
      segs.push([V(bx, .2, bz), V(bx + nx * side * w.w * rand(.7, 1.3) + w.dx * .4, .1, bz + nz * side * w.w * rand(.7, 1.3) + w.dz * .4), 2]);
      lightning(segs, { width: .03, life: .35, fork: 4, core: 0xfff4d0, halo: 0xffb030 });
      decal(bx, bz, 0x2a1408, w.w * .45, 3, { op: .5 }); decal(bx, bz, 0xffd060, .1, .35, { ring: true, add: true, grow: w.w * .8, op: .7 });
      burst(V(bx, .2, bz), 0xfff0a0, 8, 2.5, .08, .25); burst(V(bx, .1, bz), 0x6a5a40, 5, 1.2, .25, .5, { a: .4 });
      w.last = d;
    }
    if (d >= w.len) waves.splice(i, 1);
  }
}

// ---------- events ----------
export interface ComboCtx { shake(n: number): void; recoil(p: number, cid: ComboId): void; heat(x: number, z: number, v: number): void }
export function comboEvent(e: { k: string; [k: string]: any }, ctx: ComboCtx): boolean {
  switch (e.k) {
    case 'cshot': {
      const cid = comboOf(e.c); if (!cid) return true;
      const col = COL[cid], big = cid === 'rocket' || cid === 'chilight';
      if (cid !== 'chilight') { burst(V(e.x, .8, e.z), col, big ? 22 : 10, big ? 3.5 : 2.2, .2, .25); PART.spawn(V(e.x, .8, e.z), V(0, 0, 0), col, big ? 1.6 : .9, .12); }
      if (cid === 'shock' || cid === 'sour') lightning([[V(e.x, .8, e.z), V(e.x + Math.sin(e.a) * .7, .8, e.z + Math.cos(e.a) * .7), 1]], { width: .012, life: .12, fork: 2, core: 0xfff8d0, halo: 0xffd040 });
      ctx.recoil(e.p, cid);
      if (cid === 'rocket') ctx.shake(.08);
      if (cid === 'hot' || cid === 'lance') sfx('weapons.chiliStart', e.x, e.z, .6);
      return true;
    }
    case 'backblast': for (let i = 0; i < 14; i++) PART.spawn(V(e.x, 1.1, e.z), V(-Math.sin(e.a) * rand(1, 3) + rand(-.6, .6), rand(-.2, .6), -Math.cos(e.a) * rand(1, 3) + rand(-.6, .6)), i % 3 ? 0x8a8a7a : 0xffb040, rand(.25, .5), rand(.4, .9), { a: .4, drag: 2 }); return true;
    case 'jamPop': {
      burst(V(e.x, .35, e.z), 0xff2040, 16, 2.4, .13, .4, { g: 5 }); burst(V(e.x, .35, e.z), 0xff8a90, 6, 1.4, .2, .25);
      decal(e.x, e.z, 0xff3050, .05, .3, { ring: true, add: true, grow: e.r * 1.3, op: .8 }); decal(e.x, e.z, 0x8a0a1a, e.r * rand(.6, .8), 4, { op: .65 });
      for (let k = 0; k < 5; k++) decal(e.x + rand(-1, 1) * e.r, e.z + rand(-1, 1) * e.r, 0xa01020, rand(.04, .08), 4, { op: .7 });
      return true;
    }
    case 'tick': { // time bomb tick: red flash, higher and faster towards the end
      PART.spawn(V(e.x, .3, e.z), V(0, 0, 0), 0xff4030, .5 + e.f * .5, .1); play('tick', e.f); return true;
    }
    case 'coleBoom': {
      decal(e.x, e.z, 0x9cff60, .2, .45, { ring: true, add: true, grow: e.r * 1.2, op: .85 }); decal(e.x, e.z, 0x2a3a18, e.r * .8, 4, { op: .55 });
      for (let i = 0; i < 40; i++) { const a = rand(0, 7), sp = rand(.6, 2) * e.r * 1.5; PART.spawn(V(e.x, rand(.1, .5), e.z), V(Math.cos(a) * sp, rand(.3, 1.2), Math.sin(a) * sp), i % 3 ? 0x5fb030 : 0xd8a0ff, rand(.3, .6), rand(.7, 1.2), { drag: 2.5, a: .4, s1: .9 }); }
      burst(V(e.x, .4, e.z), 0xe8ffb0, 20, 4, .14, .35); ctx.shake(.12); return true;
    }
    case 'cabboom': {
      for (let i = 0; i < 16; i++) { const a = rand(0, 7); PART.spawn(V(e.x, .4, e.z), V(Math.cos(a) * rand(1, 3), rand(1, 2.5), Math.sin(a) * rand(1, 3)), 0xff3050, rand(.1, .16), rand(.4, .7), { g: 6 }); }
      return true;
    }
    case 'kimchiBoom': {
      const s = Math.pow(.7, e.g || 0);
      decal(e.x, e.z, 0xff7a20, .15, .4, { ring: true, add: true, grow: e.r * 1.2, op: .85 }); decal(e.x, e.z, 0x2a1008, e.r * .8, 6, { op: .55 });
      for (let i = 0; i < 26 * s + 6; i++) { const a = rand(0, 7), sp = rand(.5, 1.8) * e.r * 1.4; PART.spawn(V(e.x, rand(.1, .4), e.z), V(Math.cos(a) * sp, rand(.6, 1.8), Math.sin(a) * sp), i % 3 ? 0xff5a18 : 0xffc040, rand(.25, .55) * (s + .3), rand(.4, .8), { drag: 2.5, a: .9, s1: .2 }); }
      for (let i = 0; i < 8; i++) { const a = rand(0, 7); PART.spawn(V(e.x, .3, e.z), V(Math.cos(a) * rand(.5, 2), rand(1, 2), Math.sin(a) * rand(.5, 2)), 0xa8243a, rand(.1, .18), rand(.5, .9), { g: 5 }); } // red cabbage leaves
      for (let i = 0; i < 6; i++) ctx.heat(e.x + rand(-e.r, e.r) * .7, e.z + rand(-e.r, e.r) * .7, .6);
      ctx.shake(.06 * s + .02); return true;
    }
    case 'rocketBoom': {
      const r = e.r;
      decal(e.x, e.z, 0xfff2a0, .3, .5, { ring: true, add: true, grow: r * 1.15, op: .95 }); decal(e.x, e.z, 0xffe040, r * .5, .35, { add: true, op: .6, grow: r });
      decal(e.x, e.z, 0x1a1408, r * .6, 7, { op: .6 }); decal(e.x, e.z, 0x3a2a10, r * .9, 7, { op: .3 });
      PART.spawn(V(e.x, 1, e.z), V(0, 0, 0), 0xfff6d0, r * 1.4, .18);
      for (let i = 0; i < 70; i++) { const a = rand(0, 7), sp = rand(1, 3) * r; PART.spawn(V(e.x, rand(.2, .8), e.z), V(Math.cos(a) * sp, rand(.5, 3), Math.sin(a) * sp), [0xffe040, 0xfff6c0, 0x8fe36a, 0xff9a30][i % 4], rand(.25, .6), rand(.4, .9), { drag: 3, a: .9, s1: .2 }); }
      for (let i = 0; i < 24; i++) { const a = rand(0, 7), d = rand(0, r * .6); PART.spawn(V(e.x + Math.cos(a) * d, rand(.3, 1), e.z + Math.sin(a) * d), V(Math.cos(a) * rand(.2, .8), rand(.6, 1.6), Math.sin(a) * rand(.2, .8)), 0x6a6458, rand(.7, 1.3), rand(1.2, 2.2), { a: .3, drag: 1.5, s1: 1.6 }); }
      const segs: [THREE.Vector3, THREE.Vector3, number][] = [];
      for (let i = 0; i < 6; i++) { const a = rand(0, 7), d = rand(.6, 1) * r; segs.push([V(e.x, .5, e.z), V(e.x + Math.cos(a) * d, .1, e.z + Math.sin(a) * d), 1]); }
      lightning(segs, { width: .022, life: .3, fork: 6, core: 0xfffbe0, halo: 0xffe040 });
      for (let i = 0; i < 10; i++) ctx.heat(e.x + rand(-r, r) * .6, e.z + rand(-r, r) * .6, .5);
      ctx.shake(.42); return true;
    }
    case 'slam': {
      waves.push({ ox: e.x, oz: e.z, dx: Math.sin(e.a), dz: Math.cos(e.a), len: e.l, w: e.w, sp: e.sp, d: 0, t: -.06, last: 0 });
      decal(e.x, e.z, 0x2a1408, .6, 4, { op: .6 }); decal(e.x, e.z, 0xffe070, .2, .4, { ring: true, add: true, grow: 1.4, op: .9 });
      for (let i = 0; i < 18; i++) { const a = rand(0, 7); PART.spawn(V(e.x, .1, e.z), V(Math.cos(a) * rand(.5, 2), rand(.4, 1.4), Math.sin(a) * rand(.5, 2)), i % 2 ? 0x8a7050 : 0xffd060, rand(.15, .35), rand(.4, .8), { a: .6, drag: 2 }); }
      ctx.shake(.22); return true;
    }
    case 'arcs': { // Shockgun: lightning between lying berries
      const sg = e.s as number[][]; if (!sg.length) return true;
      lightning(sg.map(t => [V(e.x, .12, e.z), V(t[0], .12, t[1]), 1] as [THREE.Vector3, THREE.Vector3, number]), { width: .016, life: .22, fork: 2, core: 0xfffbe0, halo: 0xffd040 });
      play('zapS'); return true;
    }
    case 'shockArc': { // enemy under current: crackle, arcs to its neighbours
      const sg = e.s as number[][];
      const list: [THREE.Vector3, THREE.Vector3, number][] = sg.map(t => [V(e.x, .45, e.z), V(t[0], .4, t[1]), 2]);
      for (let i = 0; i < 2; i++) { const a = rand(0, 7); list.push([V(e.x, .5, e.z), V(e.x + Math.cos(a) * .35, rand(.1, .7), e.z + Math.sin(a) * .35), 3]); }
      lightning(list, { width: .01, life: .16, fork: 1, core: 0xfffbe0, halo: 0x9fd0ff });
      burst(V(e.x, .5, e.z), 0xfff6c0, 4, 1.4, .05, .15);
      return true;
    }
    case 'combo': { // weapons merged: golden burst around the player
      burst(V(e.x, .8, e.z), 0xffe08a, 60, 4, .22, 1); decal(e.x, e.z, 0xffd060, .3, .8, { ring: true, add: true, grow: 3, op: .9 });
      ctx.shake(.15); return true;
    }
  }
  return false;
}
