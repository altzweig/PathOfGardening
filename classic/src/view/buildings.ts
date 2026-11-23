// Buildings on hex tiles (Classic, 22.11.2026): procedural low-poly props in the style of the plants and weapons.
// Each building gets a little cobbled/earthen pad and its own idle/work animation; broken buildings sag and lose parts.
import * as THREE from 'three';
import type { BuildingType } from '../config';
import { GEO, M, PART, V, part, rand } from './core';
import { friedEgg } from './eggfx';
import { EGG_POS } from '../sim/sim';

export interface BuildingView {
  g: THREE.Group;
  /** working: a batch is running / the source is producing; broken: knocked out by animals */
  anim(dt: number, now: number, working: boolean, broken: boolean, wx: number, wz: number): void;
}

const WOOD = M(0x7a5232), WOOD_D = M(0x553620), WOOD_L = M(0x9a7048), STONE = M(0x8a8a86), STONE_D = M(0x6a6a68);
const PLASTER = M(0xe8dcc0), ROOF = M(0xa8442e), ROOF_D = M(0x7a3424), THATCH = M(0xc8a050), CLOTH = M(0xf0e8d8, { flat: false, r: .95 });
const IRON = M(0x4a4a50, { m: .4, r: .5 }), WATER = M(0x3a8adf, { e: 0x1a5aaf, ei: .12, r: .1, flat: false });
const JUICE = M(0xb0204a, { e: 0x801030, ei: .12, r: .2, flat: false }), FIRE = M(0xff8a20, { e: 0xff6a10, ei: .5 }), EMBER = M(0xffd060, { e: 0xffb030, ei: .5 }); // 23.11.2026: buildings no longer glow (no bloom)
const WHITE = M(0xf4f2ea), BLACK = M(0x2a2622), PINK = M(0xe8a0a0), RED = M(0xd03020), YELLOW = M(0xf0c030), CHEESE = M(0xf2c630, { e: 0x8a6000, ei: .15 }), HORN = M(0xe8dcc0);
const GROUND = M(0x6a5038), COBBLE = M(0x9a948a);

/** triangular prism (gable roof) along x: width w (x), depth d (z), height h */
function gable(w: number, d: number, h: number) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2); return g;
}
function pad(g: THREE.Group, H: number) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(H * .9, H * .95, .05, 6), GROUND); base.rotation.y = Math.PI / 6; base.position.y = .02; base.receiveShadow = true; g.add(base);
  for (let i = 0; i < 16; i++) { const a = rand(0, 7), r = rand(.55, .82) * H; const st = part(g, GEO.lo, COBBLE, rand(.07, .13), .04, rand(.07, .13), Math.cos(a) * r, .05, Math.sin(a) * r, false); st.rotation.y = rand(0, 7); st.receiveShadow = true; }
}
function house(g: THREE.Group, w: number, d: number, h: number, wall: THREE.Material, roof: THREE.Material, x = 0, z = 0) {
  part(g, GEO.box, wall, w, h, d, x, h / 2, z);
  const r = new THREE.Mesh(gable(w + .14, d + .2, h * .55), roof); r.position.set(x, h, z); r.castShadow = true; g.add(r);
  // timber frame
  for (const sx of [-1, 1]) part(g, GEO.box, WOOD_D, .05, h, .05, x + sx * w / 2, h / 2, z + d / 2 + .005);
  part(g, GEO.box, WOOD_D, w, .05, .05, x, h * .55, z + d / 2 + .01);
}

function well(g: THREE.Group, H: number) {
  pad(g, H);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(.42, .46, .45, 14, 1, true), STONE); ring.position.y = .22; ring.castShadow = true; ring.material.side = THREE.DoubleSide; g.add(ring);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; part(g, GEO.box, i % 2 ? STONE : STONE_D, .2, .08, .1, Math.cos(a) * .44, .47, Math.sin(a) * .44).rotation.y = -a; }
  const w = part(g, GEO.cyl, WATER, .38, .02, .38, 0, .3, 0, false);
  for (const sx of [-1, 1]) part(g, GEO.box, WOOD, .07, 1.1, .07, sx * .48, .55, 0);
  const r = new THREE.Mesh(gable(1.15, .7, .35), ROOF); r.position.y = 1.08; r.castShadow = true; g.add(r);
  const crank = new THREE.Group(); crank.position.set(0, .86, 0); g.add(crank);
  part(crank, GEO.cyl, WOOD_L, .06, .9, .06, 0, 0, 0).rotation.z = Math.PI / 2;
  const handle = part(crank, GEO.box, WOOD_D, .04, .22, .04, .5, .1, 0);
  const rope = part(g, GEO.cyl, M(0xc8b088), .012, .5, .012, 0, .6, 0, false);
  const bucket = new THREE.Group(); g.add(bucket);
  part(bucket, GEO.cyl, WOOD, .09, .12, .09, 0, 0, 0); part(bucket, GEO.cyl, IRON, .095, .02, .095, 0, .04, 0);
  let ph = 0;
  return (dt: number, _n: number, working: boolean) => {
    ph += dt * (working ? 2.2 : 0); crank.rotation.x = ph * 2; void handle;
    const y = .45 + (Math.sin(ph) * .5 + .5) * .3; bucket.position.y = y; rope.scale.y = .86 - y; rope.position.y = (y + .86) / 2;
    w.position.y = .28 + Math.sin(_n * 2) * .005;
  };
}

function mill(g: THREE.Group, H: number) {
  pad(g, H);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(.38, .58, 1.7, 10), PLASTER); tower.position.y = .85; tower.castShadow = true; g.add(tower);
  for (const y of [.35, 1.05]) part(g, GEO.cyl, WOOD_D, .56 - y * .12, .05, .56 - y * .12, 0, y, 0);
  part(g, GEO.box, WOOD_D, .22, .42, .05, 0, .21, .52); // door
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.5, .55, 10), THATCH); cap.position.y = 1.95; cap.castShadow = true; g.add(cap);
  const hub = new THREE.Group(); hub.position.set(0, 1.6, .5); g.add(hub);
  part(hub, GEO.cyl, WOOD_D, .07, .16, .07, 0, 0, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; hub.add(arm);
    part(arm, GEO.box, WOOD, .05, 1.05, .04, 0, .55, .06);
    part(arm, GEO.box, CLOTH, .26, .8, .015, .15, .62, .07);
    for (let k = 0; k < 4; k++) part(arm, GEO.box, WOOD_L, .3, .02, .02, .15, .28 + k * .22, .08, false);
  }
  // sacks at the foot
  for (let i = 0; i < 2; i++) part(g, GEO.sph, M(0xd8c49a), .14, .17, .12, .55 - i * .25, .15, .3 + i * .15);
  let sp = 0, ang = 0;
  return (dt: number, _n: number, working: boolean, broken: boolean) => {
    sp += ((broken ? 0 : working ? 2.6 : .25) - sp) * Math.min(1, dt * 1.5); ang += sp * dt; hub.rotation.z = -ang;
    if (working && Math.random() < dt * 3) PART.spawn(V(g.position.x + .5 + rand(-.1, .1), .3, g.position.z + .35), V(rand(-.15, .15), rand(.2, .5), rand(-.1, .1)), 0xfff4e0, .06, rand(.6, 1.1));
  };
}

function press(g: THREE.Group, H: number) {
  pad(g, H);
  const vat = new THREE.Mesh(new THREE.CylinderGeometry(.42, .38, .5, 14, 1, true), WOOD); vat.position.y = .3; vat.castShadow = true; (vat.material as THREE.Material).side = THREE.DoubleSide; g.add(vat);
  for (const y of [.12, .45]) part(g, GEO.cyl, IRON, .43, .03, .43, 0, y, 0);
  const juice = part(g, GEO.cyl, JUICE, .37, .02, .37, 0, .35, 0, false);
  for (const sx of [-1, 1]) part(g, GEO.box, WOOD_D, .1, 1.35, .1, sx * .55, .68, 0);
  part(g, GEO.box, WOOD_D, 1.25, .12, .14, 0, 1.38, 0);
  const screw = new THREE.Group(); g.add(screw);
  part(screw, GEO.cyl, IRON, .05, .9, .05, 0, .95, 0);
  part(screw, GEO.cyl, WOOD_L, .36, .08, .36, 0, .5, 0); // pressing plate
  const bar = part(screw, GEO.box, WOOD, .9, .05, .05, 0, 1.5, 0);
  // fruit heap next to it + jug
  for (let i = 0; i < 6; i++) part(g, GEO.sph, i % 2 ? RED : M(0x3a50e0), .06, .06, .06, .6 + rand(-.1, .1), .08, .45 + rand(-.1, .1));
  part(g, GEO.cyl, M(0x8a5a3a), .1, .2, .1, -.6, .12, .4);
  let ph = 0;
  return (dt: number, n: number, working: boolean) => {
    if (working) ph += dt * 3.2;
    const k = Math.abs(Math.sin(ph)); screw.position.y = -k * .12; screw.rotation.y = ph * 1.5; void bar;
    juice.position.y = .33 + (working ? Math.sin(n * 6) * .01 : 0);
    if (working && Math.random() < dt * 4) PART.spawn(V(g.position.x + rand(-.2, .2), .55, g.position.z + rand(-.2, .2)), V(rand(-.4, .4), rand(.4, .9), rand(-.4, .4)), 0xd02050, .05, .5, { g: 3 });
  };
}

function bakery(g: THREE.Group, H: number) {
  pad(g, H);
  house(g, 1.2, .9, .85, PLASTER, ROOF);
  const chim = part(g, GEO.box, STONE_D, .2, .6, .2, .35, 1.25, -.15);
  const oven = part(g, GEO.box, EMBER, .3, .22, .02, -.25, .22, .46, false);
  part(g, GEO.box, WOOD_D, .2, .45, .02, .3, .23, .46); // door
  part(g, GEO.box, M(0x88b0d0, { e: 0xffc070, ei: .12 }), .18, .16, .02, .3, .62, .46);
  // bread rack
  part(g, GEO.box, WOOD, .5, .04, .25, -.65, .35, .25); for (let i = 0; i < 3; i++) part(g, GEO.capsule, M(0xb87a38), .05, .09, .05, -.8 + i * .15, .41, .25).rotation.z = Math.PI / 2;
  let glow = 0;
  return (dt: number, n: number, working: boolean) => {
    glow += ((working ? 1 : .15) - glow) * Math.min(1, dt * 2);
    (oven.material as THREE.MeshStandardMaterial).emissiveIntensity = .15 + glow * .45 + Math.sin(n * 9) * .06 * glow;
    if (working && Math.random() < dt * 5) PART.spawn(V(g.position.x + .35 + rand(-.05, .05), 1.6, g.position.z - .15), V(rand(-.05, .15), rand(.5, .8), rand(-.05, .05)), 0x9a9490, rand(.12, .2), rand(1.2, 2), { s1: 2.5, a: .35 });
    void chim;
  };
}

function chicken(par: THREE.Object3D) {
  const c = new THREE.Group(); par.add(c);
  const body = part(c, GEO.sph, WHITE, .1, .09, .13, 0, .12, 0);
  const head = new THREE.Group(); head.position.set(0, .2, .1); c.add(head);
  part(head, GEO.sph, WHITE, .055, .06, .055, 0, 0, 0); part(head, GEO.box, RED, .015, .05, .06, 0, .06, 0); part(head, GEO.cone, YELLOW, .02, .05, .02, 0, -.01, .07).rotation.x = Math.PI / 2;
  part(c, GEO.cone, WHITE, .05, .09, .05, 0, .16, -.13).rotation.x = -.9; // tail
  for (const sx of [-1, 1]) part(c, GEO.cyl, YELLOW, .01, .07, .01, sx * .04, .035, 0);
  void body; return { c, head };
}
function hens(g: THREE.Group, H: number) {
  pad(g, H);
  // low fence on 5 sides, coop hut at the back
  const R = H * .78;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3, b = a + Math.PI / 3;
    part(g, GEO.box, WOOD, .05, .38, .05, Math.cos(a) * R, .19, Math.sin(a) * R);
    if (i === 1) continue; // gap = gate (towards the camera)
    const mx = (Math.cos(a) + Math.cos(b)) / 2 * R, mz = (Math.sin(a) + Math.sin(b)) / 2 * R, len = R;
    for (const y of [.14, .3]) { const r = part(g, GEO.box, WOOD_L, len, .035, .025, mx, y, mz); r.rotation.y = -(a + Math.PI / 3 / 2) - Math.PI / 2; }
  }
  house(g, .7, .55, .5, WOOD, THATCH, 0, -.45);
  part(g, GEO.box, BLACK, .16, .16, .02, 0, .2, -.17);
  part(g, GEO.cyl, WOOD_D, .14, .06, .14, -.5, .04, .25); // feed trough
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(.27, .3, .03, 8), M(0xd8b860)); straw.position.set(EGG_POS[0], .065, EGG_POS[1]); straw.rotation.y = .3; straw.receiveShadow = true; g.add(straw); // straw bed under the egg pyramid
  const birds = [0, 1, 2].map(i => { const b = chicken(g); b.c.position.set(-.45 + i * .25, 0, .1 + (i % 2) * .2); b.c.rotation.y = rand(0, 7); return { ...b, t: rand(0, 5), tx: 0, tz: 0, peck: 0 }; });
  return (dt: number, _n: number, working: boolean) => {
    for (const b of birds) {
      b.t -= dt;
      if (b.t <= 0) { b.t = rand(.8, 2.5); const a = rand(0, 7), r = rand(0, .38); b.tx = Math.cos(a) * r - .15; b.tz = Math.sin(a) * r + .05; /* keeps off the egg pyramid */ b.peck = working ? 1.2 : .5; }
      const dx = b.tx - b.c.position.x, dz = b.tz - b.c.position.z, d = Math.hypot(dx, dz);
      if (d > .03) { b.c.position.x += dx / d * dt * .4; b.c.position.z += dz / d * dt * .4; b.c.rotation.y = Math.atan2(dx, dz); b.c.position.y = Math.abs(Math.sin(_n * 18)) * .02; }
      else { b.peck -= dt; b.head.rotation.x = b.peck > 0 ? Math.max(0, Math.sin(_n * 14)) * .9 : 0; }
    }
  };
}

function cow(g: THREE.Group, H: number) {
  pad(g, H);
  const post = part(g, GEO.cyl, WOOD_D, .06, .7, .06, 0, .35, 0); void post;
  part(g, GEO.cone, WOOD_D, .07, .08, .07, 0, .74, 0);
  // the cow walks slowly around the post on its rope
  const c = new THREE.Group(); g.add(c);
  const body = new THREE.Group(); body.position.y = .5; c.add(body);
  part(body, GEO.sph, WHITE, .26, .22, .42, 0, 0, 0);
  for (let i = 0; i < 5; i++) { const s = part(body, GEO.sph, BLACK, rand(.08, .13), rand(.06, .1), rand(.08, .14), 0, 0, 0, false); const a = rand(0, 7), y = rand(-.05, .12); s.position.set(Math.cos(a) * .22, y, Math.sin(a) * .34); s.scale.multiplyScalar(1); }
  part(body, GEO.sph, PINK, .1, .07, .08, 0, -.17, -.12); // udder
  const head = new THREE.Group(); head.position.set(0, .12, .42); body.add(head);
  part(head, GEO.sph, WHITE, .13, .13, .17, 0, 0, .05); part(head, GEO.sph, PINK, .1, .07, .07, 0, -.05, .19);
  for (const sx of [-1, 1]) { part(head, GEO.cone, HORN, .025, .1, .025, sx * .1, .12, 0).rotation.z = -sx * .7; part(head, GEO.sph, WHITE, .05, .025, .035, sx * .14, .05, -.02); part(head, GEO.sph, BLACK, .02, .02, .02, sx * .08, .04, .15); }
  const legs: THREE.Mesh[] = [];
  for (const [lx, lz] of [[-.13, .24], [.13, .24], [-.13, -.24], [.13, -.24]]) legs.push(part(c, GEO.cyl, WHITE, .045, .32, .045, lx, .16, lz));
  const tail = part(body, GEO.cyl, WHITE, .015, .3, .015, 0, -.05, -.42); tail.rotation.x = .3;
  const rope = part(g, GEO.cyl, M(0xc8b088), .012, 1, .012, 0, 0, 0, false);
  let a = rand(0, 7), graze = 0, gt = 0;
  return (dt: number, n: number, working: boolean, broken: boolean) => {
    gt -= dt; if (gt <= 0) { gt = rand(2, 5); graze = Math.random() < .6 ? 1 : 0; }
    const walk = !broken && !graze ? 1 : 0;
    a += dt * .12 * walk; const r = .72;
    c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.rotation.y = -a; // tangent to the circle
    legs.forEach((l, i) => l.rotation.x = walk ? Math.sin(n * 5 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * .35 : 0);
    head.rotation.x = graze ? .7 + Math.sin(n * 3) * .1 : Math.sin(n * 1.3) * .05;
    tail.rotation.z = Math.sin(n * 2.3) * .4; body.position.y = .5 + (working ? Math.sin(n * 1.5) * .01 : 0);
    // rope from the post top to the neck
    const nx = c.position.x + Math.cos(a + Math.PI / 2) * -.0, ny = .62, nz = c.position.z;
    const hx = nx + Math.sin(c.rotation.y) * .38, hz = nz + Math.cos(c.rotation.y) * .38;
    const p0 = V(0, .66, 0), p1 = V(hx, ny, hz), mid = p0.clone().add(p1).multiplyScalar(.5);
    rope.position.copy(mid); rope.scale.y = p0.distanceTo(p1); rope.lookAt(p1); rope.rotateX(Math.PI / 2);
  };
}

function dairy(g: THREE.Group, H: number) {
  pad(g, H);
  house(g, 1.0, .8, .7, PLASTER, ROOF_D, -.1, -.2);
  // cheese wheels on a shelf + butter churn out front
  part(g, GEO.box, WOOD, .7, .04, .3, .35, .45, .45);
  for (let i = 0; i < 3; i++) part(g, GEO.cyl, CHEESE, .12, .09, .12, .12 + i * .23, .52, .45);
  for (let i = 0; i < 2; i++) part(g, GEO.cyl, CHEESE, .14, .1, .14, .2 + i * .3, .08, .55);
  const churn = new THREE.Group(); churn.position.set(-.55, 0, .35); g.add(churn);
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, .45, 10), WOOD_L); tub.position.y = .23; tub.castShadow = true; churn.add(tub);
  for (const y of [.1, .38]) part(churn, GEO.cyl, IRON, .17 - y * .1, .02, .17 - y * .1, 0, y, 0);
  const dash = part(churn, GEO.cyl, WOOD_D, .02, .5, .02, 0, .55, 0);
  let ph = 0;
  return (dt: number, _n: number, working: boolean) => { if (working) ph += dt * 5; dash.position.y = .55 + Math.sin(ph) * .08; };
}

/** Spiegeleierei (23.11.2026, replaces the kitchen): an old cast-iron stove on legs with a giant paella pan full of sizzling fried eggs.
 *  Now and then the pan wobbles by itself and the eggs slide about; steam rises; flames lick out from under the stove;
 *  the oven door has slits with a flickering fire glow (emissive, picked up by the bloom). */
function kitchen(g: THREE.Group, H: number) {
  pad(g, H);
  const CAST = M(0x34322f, { m: .5, r: .62 }), CAST_D = M(0x24221f, { m: .5, r: .7 }), RUST = M(0x5a3a26, { r: .9 }), STEEL = M(0x8a8a8a, { m: .7, r: .35, flat: false });
  const GLOW = M(0xff7a20, { e: 0xff5a10, ei: .6 }), GLOW_D = M(0xff5a10, { e: 0xff3a00, ei: .4 });
  const st = new THREE.Group(); st.position.set(-.05, 0, -.05); g.add(st);
  // legs, body, top plate with two hot plates, stove pipe at the back right
  for (const [x, z] of [[-.44, -.26], [.44, -.26], [-.44, .26], [.44, .26]]) part(st, GEO.box, CAST_D, .06, .34, .06, x, .17, z);
  part(st, GEO.box, CAST, .96, .5, .58, 0, .58, 0);
  part(st, GEO.box, CAST_D, 1.08, .05, .68, 0, .855, 0);
  for (const x of [-.24, .24]) part(st, GEO.cyl, RUST, .2, .012, .2, x, .885, -.02, false);
  part(st, GEO.cyl, STEEL, .065, 1.05, .065, .38, 1.35, -.24);
  part(st, GEO.cyl, CAST_D, .075, .05, .075, .38, 1.88, -.24);
  part(st, GEO.box, CAST_D, .98, .03, .6, 0, .335, 0); // bottom rail
  // front: small upper door, lower ash door with a draught dial (left), big oven door with glowing slits (right)
  const fz = .295;
  part(st, GEO.box, CAST_D, .3, .2, .03, -.28, .7, fz); part(st, GEO.box, STEEL, .025, .07, .025, -.16, .7, fz + .03);
  part(st, GEO.box, CAST_D, .3, .17, .03, -.28, .45, fz); part(st, GEO.cyl, STEEL, .04, .01, .04, -.28, .46, fz + .02).rotation.x = Math.PI / 2;
  part(st, GEO.box, STEEL, .02, .06, .02, -.16, .44, fz + .03).rotation.z = .5;
  part(st, GEO.box, CAST_D, .5, .38, .03, .18, .57, fz);
  part(st, GEO.box, STEEL, .14, .025, .03, .18, .7, fz + .035); // handle
  for (const x of [.02, .34]) part(st, GEO.box, CAST_D, .04, .05, .04, x, .39, fz + .02); // hinges
  const slits: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) slits.push(part(st, GEO.box, i % 2 ? GLOW_D : GLOW, .06, .02, .012, .03 + i * .075, .48, fz + .018, false));
  for (let i = 0; i < 4; i++) slits.push(part(st, GEO.box, GLOW_D, .045, .018, .012, -.33 + i * .05, .4, fz + .018, false)); // ash door vents
  // warm glow on the ground in front of the oven (additive, no extra light)
  const glow = new THREE.Mesh(GEO.circle, new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.scale.set(.55, .4, 1); glow.position.set(.05, .06, .55); st.add(glow);
  // flames licking out from under the stove
  const under = [0, 1, 2, 3].map(i => { const f = part(st, GEO.cone, i % 2 ? FIRE : EMBER, .05, .2, .05, -.3 + i * .2, .3, .2 + (i % 2) * .05, false); f.visible = false; return { f, t: 0, d: 0, x: -.3 + i * .2 }; });
  // giant paella pan with two loop handles and a load of fried eggs
  const pan = new THREE.Group(); pan.position.set(-.06, .9, .02); st.add(pan);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.6, .55, .07, 32, 1, true), CAST); (bowl.material as THREE.Material).side = THREE.DoubleSide; bowl.position.y = .035; bowl.castShadow = true; pan.add(bowl);
  part(pan, GEO.cyl, CAST_D, .555, .012, .555, 0, .006, 0);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(.6, .012, 6, 40), CAST); lip.rotation.x = Math.PI / 2; lip.position.y = .07; pan.add(lip);
  for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(.07, .014, 6, 14, Math.PI), CAST); h.position.set(sx * .64, .06, 0); h.rotation.set(Math.PI / 2, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2); pan.add(h); }
  const eggs = [0, 1, 2, 3, 4, 5, 6].map(i => { const e = friedEgg(.13, i); const a = i / 6 * Math.PI * 2 + .3, r = i === 6 ? 0 : .33; e.position.set(Math.cos(a) * r, .012, Math.sin(a) * r); e.rotation.y = rand(0, 7); pan.add(e); return { e, vx: 0, vz: 0 }; });
  let heat = 0, wob = 0, wobT = rand(2, 5), wobA = 0, smokeT = 0;
  return (dt: number, n: number, working: boolean) => {
    heat += ((working ? 1 : .35) - heat) * Math.min(1, dt * 1.5);
    // flickering glow through the slits (bloom does the rest)
    const fl = .55 + .25 * Math.sin(n * 11.3) + .15 * Math.sin(n * 23.7 + 1) + .1 * Math.sin(n * 5.1);
    (GLOW.emissiveIntensity as number) = (.25 + .4 * heat) * fl; GLOW_D.emissiveIntensity = (.15 + .3 * heat) * fl;
    (glow.material as THREE.MeshBasicMaterial).opacity = (.05 + .08 * heat) * fl;
    // flames from under the stove: short random bursts
    for (const u of under) {
      if (u.t <= 0 && Math.random() < dt * (.25 + heat * .9)) { u.t = u.d = rand(.25, .6); }
      if (u.t > 0) { u.t -= dt; const k = Math.sin((1 - u.t / u.d) * Math.PI); u.f.visible = true; u.f.scale.set(.05 + k * .03, .05 + k * rand(.15, .24), .05 + k * .03); u.f.position.set(u.x + Math.sin(n * 17 + u.x * 9) * .02, .28 + u.f.scale.y * .3, .27 + k * .05); }
      else u.f.visible = false;
    }
    // the pan wobbles by itself now and then, the eggs slide about (and settle again)
    wobT -= dt; if (wobT <= 0) { wobT = rand(3, 7) / (.6 + heat * .6); wob = .9; wobA = rand(0, 7); }
    let tx = 0, tz = 0;
    if (wob > 0) { wob -= dt; const k = Math.max(0, wob) / .9, w = Math.sin(n * 26) * .035 * k; tx = Math.cos(wobA) * w; tz = Math.sin(wobA) * w; }
    pan.rotation.x = tz; pan.rotation.z = -tx;
    for (const e of eggs) {
      e.vx += tx * 9 * dt; e.vz += tz * 9 * dt; e.vx *= Math.exp(-dt * 3); e.vz *= Math.exp(-dt * 3);
      e.e.position.x += e.vx * dt; e.e.position.z += e.vz * dt;
      const r = Math.hypot(e.e.position.x, e.e.position.z); if (r > .42) { e.e.position.x *= .42 / r; e.e.position.z *= .42 / r; e.vx *= -.3; e.vz *= -.3; }
      e.e.position.y = .012 + Math.max(0, Math.sin(n * 30 + e.e.position.x * 40)) * .002 * heat; // bubbling fat
    }
    for (let a = 0; a < eggs.length; a++) for (let b = a + 1; b < eggs.length; b++) { // keep apart
      const A = eggs[a].e.position, B = eggs[b].e.position, dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d < .2 && d > 1e-4) { const p = (.2 - d) * .5 / d; A.x -= dx * p; A.z -= dz * p; B.x += dx * p; B.z += dz * p; }
    }
    // a little steam over the pan, sizzling fat specks; smoke from the pipe
    if (Math.random() < dt * (1.5 + heat * 4)) PART.spawn(V(g.position.x - .1 + rand(-.4, .4), 1.05, g.position.z - .03 + rand(-.35, .35)), V(rand(-.05, .05), rand(.3, .55), rand(-.05, .05)), 0x5a5856, rand(.14, .22), rand(1.2, 1.8), { s1: .5, a: .4 });
    if (working && Math.random() < dt * 6) PART.spawn(V(g.position.x - .1 + rand(-.35, .35), 1, g.position.z + rand(-.3, .3)), V(rand(-.5, .5), rand(.5, 1.1), rand(-.5, .5)), 0xffd890, .03, .25, { g: 5 });
    smokeT -= dt; if (smokeT <= 0) { smokeT = rand(.25, .5) / (.5 + heat); PART.spawn(V(g.position.x + .33, 1.95, g.position.z - .29), V(rand(-.05, .1), rand(.4, .6), rand(-.05, .05)), 0x4a4644, rand(.12, .18), rand(1.5, 2.2), { s1: .55, a: .35 }); }
  };
}

const MAKERS: Record<BuildingType, (g: THREE.Group, H: number) => (dt: number, now: number, working: boolean, broken: boolean) => void> = { well, mill, press, bakery, hens, cow, dairy, kitchen };

/** Lager-Truhe (23.11.2026): big wooden chest with iron bands on an earth hex in the garden centre; the lid opens a crack
 *  and rattles while raccoons steal from it. Returns the update function (dt, thieves at work). */
export function chestModel(g: THREE.Group) {
  const B = M(0x7a5232), BD = M(0x4f331d), BAND = M(0x3a3a40, { m: .5, r: .5 }), GOLD = M(0xc8a040, { m: .6, r: .35 });
  const ch = new THREE.Group(); ch.rotation.y = .3; g.add(ch);
  const W = 1.15, D = .7, Hb = .52;
  part(ch, GEO.box, BD, W, .06, D, 0, .03, 0);
  for (let i = 0; i < 4; i++) part(ch, GEO.box, i % 2 ? B : M(0x86603c), W - .02, Hb / 4 - .01, D - .02, 0, .06 + Hb / 8 + i * Hb / 4, 0); // planks
  for (const x of [-W / 2 + .12, 0, W / 2 - .12]) part(ch, GEO.box, BAND, .07, Hb + .02, D + .03, x, .06 + Hb / 2, 0); // iron bands
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(ch, GEO.box, BAND, .09, .09, .09, sx * (W / 2 - .02), .07, sz * (D / 2 - .02)); // corner shoes
  // lid: hinged at the back edge, rounded (half cylinder)
  const hinge = new THREE.Group(); hinge.position.set(0, .06 + Hb, -D / 2); ch.add(hinge);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 14, 1, false, 0, Math.PI), B); lid.rotation.set(0, 0, Math.PI / 2); lid.rotation.order = 'ZYX'; lid.position.set(0, 0, D / 2); lid.castShadow = true; hinge.add(lid);
  for (const x of [-W / 2 + .12, 0, W / 2 - .12]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(D / 2 + .015, D / 2 + .015, .075, 14, 1, true, 0, Math.PI), BAND); b.rotation.copy(lid.rotation); b.position.set(x, 0, D / 2); hinge.add(b); }
  part(hinge, GEO.box, GOLD, .14, .16, .04, 0, -.02, D + .01); // lock plate
  part(ch, GEO.box, GOLD, .1, .1, .03, 0, .06 + Hb - .08, D / 2 + .02);
  // a few things peeking out of the gap
  const loot = new THREE.Group(); ch.add(loot);
  for (let i = 0; i < 6; i++) part(loot, GEO.sph, [M(0x3550e0), M(0xb00a1e), M(0x3a1f44), M(0xe0b85a)][i % 4], .07, .07, .07, rand(-.4, .4), .06 + Hb - .04, rand(-.2, .2), false);
  let open = 0, t = 0;
  return (dt: number, thieves: number) => {
    t += dt; open += ((thieves > 0 ? .28 + Math.min(.25, thieves * .04) : 0) - open) * Math.min(1, dt * 6);
    hinge.rotation.x = -open - (thieves > 0 ? Math.abs(Math.sin(t * 13)) * .06 : 0);
    loot.visible = open > .05;
  };
}
export function buildBuilding(type: BuildingType, H: number): BuildingView {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const anim = MAKERS[type](g, H);
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.receiveShadow = true; } });
  let sag = 0, smokeT = 0;
  return {
    g: root,
    anim(dt, now, working, broken, wx, wz) {
      // broken: the whole thing sags and leans, dust and dark smoke rise from it
      sag += ((broken ? 1 : 0) - sag) * Math.min(1, dt * 4);
      g.rotation.z = sag * .14; g.rotation.x = sag * -.08; g.scale.y = 1 - sag * .18;
      if (broken) { smokeT -= dt; if (smokeT <= 0) { smokeT = rand(.15, .35); PART.spawn(V(wx + rand(-.4, .4), rand(.4, 1), wz + rand(-.4, .4)), V(rand(-.1, .1), rand(.3, .6), rand(-.1, .1)), 0x5a5048, rand(.15, .25), rand(1, 1.8), { s1: 2, a: .4 }); } }
      anim(dt, now, working && !broken, broken);
    },
  };
}
