// Buildings on hex tiles (Classic, 22.11.2026): procedural low-poly props in the style of the plants and weapons.
// Each building gets a little cobbled/earthen pad and its own idle/work animation; broken buildings sag and lose parts.
import * as THREE from 'three';
import type { BuildingType } from '../config';
import { GEO, M, PART, V, decal, part, rand } from './core';
import { JUICE_HEX, juiceBottle } from './models';
import { buildingSound } from '../audio';
import { friedEgg } from './eggfx';
import { hexGeo } from './beds';
import { mushMesh } from './mushrooms';
import { BOTTLE_SPOUT, EGG_POS } from '../sim/sim';
import { CHEST_BASE, CHEST_LID, CHEST_MATS, CHEST_PIVOT, type ChestChunk } from './chestModel';

export interface BuildingView {
  g: THREE.Group;
  /** working: a batch is running / the source is producing; broken: knocked out by animals */
  anim(dt: number, now: number, working: boolean, broken: boolean, wx: number, wz: number): void;
  /** news from the sim: 'work' (a batch starts, v = berry index for the press), 'done' (batch finished) */
  set?(k: string, v: number): void;
}

const WOOD = M(0x7a5232), WOOD_D = M(0x553620), WOOD_L = M(0x9a7048), STONE = M(0x8a8a86), STONE_D = M(0x6a6a68);
const PLASTER = M(0xe8dcc0), ROOF = M(0xa8442e), ROOF_D = M(0x7a3424), THATCH = M(0xc8a050), CLOTH = M(0xf0e8d8, { flat: false, r: .95 });
const IRON = M(0x4a4a50, { m: .4, r: .5 }), WATER = M(0x3a8adf, { e: 0x1a5aaf, ei: .12, r: .1, flat: false });
const JUICE = M(0xb0204a, { e: 0x801030, ei: .12, r: .2, flat: false }), FIRE = M(0xff8a20, { e: 0xff6a10, ei: .5 }), EMBER = M(0xffd060, { e: 0xffb030, ei: .5 }); // 23.11.2026: buildings no longer glow (no bloom)
const WHITE = M(0xf4f2ea), BLACK = M(0x2a2622), PINK = M(0xe8a0a0), RED = M(0xd03020), YELLOW = M(0xf0c030), CHEESE = M(0xf2c630, { e: 0x8a6000, ei: .15 }), HORN = M(0xe8dcc0);
const GROUND = M(0x6a5038), COBBLE = M(0x9a948a);
const PAD = new THREE.MeshStandardMaterial({ color: 0x6a5038, roughness: 1, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

/** triangular prism (gable roof) along x: width w (x), depth d (z), height h */
function gable(w: number, d: number, h: number) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2); return g;
}
function pad(g: THREE.Group, H: number) {
  const base = new THREE.Mesh(hexGeo(H * .95), PAD); base.position.y = .02; base.receiveShadow = true; g.add(base); // roughly hex, fading out irregularly (no exact hexagon)
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
  // crank outside the right post (23.11.2026): iron arm + wooden grip, turns while someone works at the well
  part(crank, GEO.cyl, IRON, .035, .06, .035, .55, 0, 0).rotation.z = Math.PI / 2;
  part(crank, GEO.box, IRON, .03, .24, .035, .58, .1, 0);
  const handle = part(crank, GEO.cyl, WOOD_D, .028, .16, .028, .66, .2, 0); handle.rotation.z = Math.PI / 2;
  const rope = part(g, GEO.cyl, M(0xc8b088), .012, .5, .012, 0, .6, 0, false);
  const bucket = new THREE.Group(); g.add(bucket);
  part(bucket, GEO.cyl, WOOD, .09, .12, .09, 0, 0, 0); part(bucket, GEO.cyl, IRON, .095, .02, .095, 0, .04, 0);
  let ph = 0;
  return (dt: number, _n: number, working: boolean) => {
    ph += dt * (working ? 2.2 : 0); crank.rotation.x = -ph * 2; void handle;
    const y = .45 + (Math.sin(ph) * .5 + .5) * .3; bucket.position.y = y; rope.scale.y = .86 - y; rope.position.y = (y + .86) / 2;
    w.position.y = .28 + Math.sin(_n * 2) * .005;
  };
}

/** hand mill (23.11.2026, Basti): no windmill any more, two millstones on a low wooden stand, the upper one turned
 *  by a crank handle on its rim while someone works there; grain in the eye, flour runs out into a heap / sack */
function mill(g: THREE.Group, H: number) {
  pad(g, H);
  // stand: four short legs, a plank top
  for (const [x, z] of [[-.32, -.32], [.32, -.32], [-.32, .32], [.32, .32]]) part(g, GEO.box, WOOD_D, .07, .3, .07, x, .15, z);
  part(g, GEO.box, WOOD, .8, .06, .8, 0, .32, 0);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(.34, .36, .14, 18), STONE_D); lower.position.y = .42; lower.castShadow = true; g.add(lower);
  // spout + flour heap and a sack in front
  part(g, GEO.box, WOOD_L, .1, .03, .2, 0, .4, .42).rotation.x = .35;
  const heap = part(g, GEO.cone, M(0xf2ece0), .16, .1, .16, 0, .09, .6); heap.castShadow = false;
  part(g, GEO.sph, M(0xd8c49a), .15, .18, .13, .45, .17, .5);
  const top = new THREE.Group(); top.position.y = .55; g.add(top);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(.32, .33, .12, 18), STONE); upper.castShadow = true; top.add(upper);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(top, GEO.box, STONE_D, .012, .121, .2, Math.cos(a) * .2, 0, Math.sin(a) * .2).rotation.y = -a; } // dressing grooves, so the turning shows
  part(top, GEO.cyl, BLACK, .07, .125, .07, 0, .002, 0); // eye
  part(top, GEO.sph, M(0xe0b85a), .06, .03, .06, 0, .06, 0, false); // grain in the eye
  // crank: upright wooden handle in the rim
  part(top, GEO.cyl, WOOD_D, .03, .3, .03, .25, .2, 0);
  part(top, GEO.sph, WOOD_L, .045, .045, .045, .25, .36, 0);
  let sp = 0, ang = 0;
  return (dt: number, _n: number, working: boolean, broken: boolean) => {
    sp += ((broken ? 0 : working ? 3.4 : 0) - sp) * Math.min(1, dt * 4); ang += sp * dt; top.rotation.y = ang;
    heap.scale.y = .1 + Math.sin(_n * 9) * (sp > .5 ? .004 : 0);
    if (sp > .5 && Math.random() < dt * 6) PART.spawn(V(g.position.x + rand(-.05, .05), .4, g.position.z + .5), V(rand(-.1, .1), rand(.05, .25), rand(.05, .2)), 0xfff4e0, .05, rand(.5, .9));
  };
}

/** Saftpresse (23.11.2026, Basti's polish): wooden vat with a screw press. Berries of the current kind lie in the vat and are
 *  squashed by every stroke (squelch, juice oozing over the rim in the berry colour), juice runs from the spout into a little
 *  bottle under it; when the batch is done the full bottle hops into the row on the tile (the sim's juice item).
 *  Around the press: old juice stains in the three berry colours. No loose berries lying around any more. */
const STAIN = JUICE_HEX.map(c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(.75), roughness: .35, transparent: true, opacity: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
const BERRY_COL = [0x3a50e0, 0x3a1a4a, 0xd8243e], BERRY_MAT = BERRY_COL.map(c => M(c, { r: .4, flat: false }));
const JUICE_M = JUICE_HEX.map(c => M(c, { r: .2, flat: false, e: c, ei: .1 }));
function stain(g: THREE.Group, mat: THREE.Material, x: number, z: number, r: number) { // a blot: a few overlapping flat discs + droplets
  const s = new THREE.Group(); s.position.set(x, .045, z); s.rotation.y = rand(0, 7); g.add(s);
  const disc = (dx: number, dz: number, rr: number) => { const m = new THREE.Mesh(GEO.circle, mat); m.rotation.x = -Math.PI / 2; m.scale.set(rr, rr * rand(.7, 1), 1); m.position.set(dx, 0, dz); m.renderOrder = 1; s.add(m); };
  disc(0, 0, r); for (let i = 0; i < 3; i++) { const a = rand(0, 7), d = r * rand(.4, .75); disc(Math.cos(a) * d, Math.sin(a) * d, r * rand(.45, .7)); }
  for (let i = 0; i < 5; i++) { const a = rand(0, 7), d = r * rand(1.25, 1.9); disc(Math.cos(a) * d, Math.sin(a) * d, r * rand(.08, .16)); }
}
function press(g: THREE.Group, H: number) {
  pad(g, H);
  // stains of all three juices around the press (on the pad, in front of the bottle row they would be covered)
  stain(g, STAIN[2], -.62, -.35, .2); stain(g, STAIN[0], .66, -.2, .17); stain(g, STAIN[1], -.18, -.7, .15); stain(g, STAIN[2], .45, .45, .1); stain(g, STAIN[1], -.55, .3, .12);
  // vat on a low trestle, iron hoops, spout at the front
  const VR = .4, VY = .2;
  part(g, GEO.box, WOOD_D, .95, .08, .14, 0, .05, -.2); part(g, GEO.box, WOOD_D, .95, .08, .14, 0, .05, .2);
  const vat = new THREE.Mesh(new THREE.CylinderGeometry(VR, VR * .92, .46, 16, 1, true), WOOD); vat.position.y = VY + .23; vat.castShadow = true; (vat.material as THREE.Material).side = THREE.DoubleSide; g.add(vat);
  part(g, GEO.cyl, WOOD_D, VR * .92, .04, VR * .92, 0, VY + .02, 0);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const st = part(g, GEO.box, WOOD_L, .012, .46, .02, Math.cos(a) * (VR + .004), VY + .23, Math.sin(a) * (VR + .004), false); st.rotation.y = -a; } // stave joints
  for (const y of [.08, .38]) part(g, GEO.cyl, IRON, VR + .02, .035, VR + .02, 0, VY + y, 0);
  const spout = part(g, GEO.box, WOOD_D, .07, .05, .2, 0, VY + .06, VR + .06); spout.rotation.x = .25;
  // frame + screw + plate
  for (const sx of [-1, 1]) part(g, GEO.box, WOOD_D, .1, 1.45, .1, sx * .56, .73, 0);
  part(g, GEO.box, WOOD_D, 1.28, .13, .15, 0, 1.45, 0);
  const screw = new THREE.Group(); g.add(screw);
  part(screw, GEO.cyl, IRON, .05, .75, .05, 0, 1.2, 0);
  for (let i = 0; i < 5; i++) part(screw, GEO.cyl, IRON, .065, .015, .065, 0, .95 + i * .11, 0, false); // thread
  part(screw, GEO.cyl, WOOD_L, VR - .04, .07, VR - .04, 0, .85, 0); // pressing plate (rests above the rim, the berries stay visible)
  const bar = part(screw, GEO.box, WOOD, 1.0, .055, .055, 0, 1.62, 0); part(screw, GEO.sph, WOOD_D, .045, .045, .045, .5, 1.62, 0); part(screw, GEO.sph, WOOD_D, .045, .045, .045, -.5, 1.62, 0);
  // juice pool + berries in the vat
  const pool = part(g, GEO.cyl, JUICE_M[2], VR - .03, .02, VR - .03, 0, VY + .14, 0, false);
  const berries: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) { const a = rand(0, 7), r = rand(0, VR - .09); berries.push(part(g, GEO.sph, BERRY_MAT[2], .055, .055, .055, Math.cos(a) * r, VY + .2 + rand(0, .12), Math.sin(a) * r)); }
  // stream + bottle under the spout (filling)
  const [sx0, sz0] = BOTTLE_SPOUT;
  const stream = part(g, GEO.cyl, JUICE_M[2], .012, 1, .012, sx0, 0, sz0 - .02, false); stream.visible = false;
  const bottleSpot = new THREE.Group(); bottleSpot.position.set(sx0, .09, sz0); g.add(bottleSpot);
  let bottle = juiceBottle(2, 0); bottleSpot.add(bottle);
  let ph = 0, jb = -1, fill = 0, pop = 0, lastK = 0, hadDown = false, wx0 = 0, wz0 = 0;
  const color = () => jb < 0 ? 2 : jb;
  const tint = () => {
    const c = color(); (pool as THREE.Mesh).material = JUICE_M[c]; (stream as THREE.Mesh).material = JUICE_M[c];
    berries.forEach((b, i) => { b.material = i % 6 === 5 && jb < 0 ? BERRY_MAT[i % 3] : BERRY_MAT[c]; });
    bottleSpot.remove(bottle); bottle = juiceBottle(c, fill); bottleSpot.add(bottle);
  };
  const setFill = (k: number) => { const j = bottle.userData.juice as THREE.Mesh, t = bottle.userData.top as THREE.Mesh; j.scale.y = Math.max(.02, k); j.position.y = -.055 + .05 * j.scale.y; t.position.y = -.055 + .1 * j.scale.y; };
  (g.userData as any).set = (k: string, v: number) => {
    if (k === 'work') { if (v !== jb) { jb = v; tint(); } }
    else if (k === 'done') { pop = .35; fill = 0; } // the full bottle hops away (the sim's bottle takes over), a new empty one appears
  };
  return (dt: number, n: number, working: boolean, _broken: boolean, wx = wx0, wz = wz0) => {
    wx0 = wx; wz0 = wz;
    if (working) ph += dt * 3.2;
    const k = Math.abs(Math.sin(ph)); screw.position.y = -k * .3; screw.rotation.y = ph * 1.2; void bar;
    // berries squashed under the plate, swell back while it rises
    const sq = Math.max(0, (k - .55) / .45);
    berries.forEach((b, i) => { b.scale.y = .055 * (1 - sq * .65); b.scale.x = b.scale.z = .055 * (1 + sq * .3); b.position.y = VY + .2 + (i % 4) * .03 - sq * .06; });
    pool.position.y = VY + .14 + (working ? Math.sin(n * 6) * .006 + fill * .04 : 0);
    // bottom of the stroke: squelch + juice oozing over the rim in the berry colour
    if (working && lastK < k && k > .97 && !hadDown) {
      hadDown = true; buildingSound('press', 'squish', wx, wz);
      const c = JUICE_HEX[color()];
      for (let i = 0; i < 14; i++) { const a = rand(0, 7), sp = rand(.3, .8); PART.spawn(V(wx + Math.cos(a) * VR * .95, VY + .46, wz + Math.sin(a) * VR * .95), V(Math.cos(a) * sp, rand(.2, .7), Math.sin(a) * sp), c, rand(.035, .06), rand(.35, .6), { g: 5 }); }
      for (let i = 0; i < 2; i++) { const a = rand(0, 7), r = VR + rand(.05, .2); decal(wx + Math.cos(a) * r, wz + Math.sin(a) * r, c, rand(.04, .08), 2.5, { op: .7 }); }
    }
    if (k < .8) hadDown = false;
    lastK = k;
    // stream from the spout into the bottle, which fills up during the batch
    stream.visible = working && pop <= 0;
    if (stream.visible) { const top = VY + .02, bot = .2; stream.scale.y = top - bot; stream.position.y = (top + bot) / 2; stream.scale.x = stream.scale.z = .01 + Math.sin(n * 40) * .002; fill = Math.min(.92, fill + dt / 3); setFill(fill);
      if (Math.random() < dt * 6) PART.spawn(V(wx + sx0, .14, wz + sz0), V(rand(-.2, .2), rand(.3, .6), rand(-.2, .2)), JUICE_HEX[color()], .025, .3, { g: 4 }); }
    if (pop > 0) { pop -= dt; setFill(0); bottle.visible = pop < .25; bottle.scale.setScalar(Math.max(.01, 1 - Math.max(0, pop) / .25)); } else { bottle.visible = true; bottle.scale.setScalar(1); }
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
/** hens (23.11.2026): no coop, no fence; the hens run about freely on the tile. When the work is over (nobody rakes /
 *  nothing to do) they each settle down where they are and sleep (crouched, head tucked in, slow breathing). */
function hens(g: THREE.Group, H: number) {
  pad(g, H);
  part(g, GEO.cyl, WOOD_D, .14, .06, .14, -.5, .04, .25); // feed trough
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(.27, .3, .03, 8), M(0xd8b860)); straw.position.set(EGG_POS[0], .065, EGG_POS[1]); straw.rotation.y = .3; straw.receiveShadow = true; g.add(straw); // straw bed under the egg pyramid
  const R = H * .68, free = (x: number, z: number) => Math.hypot(x - EGG_POS[0], z - EGG_POS[1]) > .42;
  const spot = (): [number, number] => { for (let k = 0; k < 12; k++) { const a = rand(0, 7), r = Math.sqrt(Math.random()) * R, x = Math.cos(a) * r, z = Math.sin(a) * r; if (free(x, z)) return [x, z]; } return [-.3, -.2]; };
  const birds = [0, 1, 2, 3, 4].map(() => { const b = chicken(g), [x, z] = spot(); b.c.position.set(x, 0, z); b.c.rotation.y = rand(0, 7); return { ...b, t: rand(0, 3), tx: x, tz: z, peck: 0, sit: 0, ph: rand(0, 7) }; });
  return (dt: number, n: number, working: boolean) => {
    for (const b of birds) {
      // asleep: settles down on the spot, head tucked in; wakes up and scurries off when work starts again
      b.sit = Math.max(0, Math.min(1, b.sit + (working ? -dt * 4 : dt * 2.5)));
      if (b.sit > 0) {
        b.c.position.y = -b.sit * .06; b.c.scale.set(1 + b.sit * .12, 1 - b.sit * .1 + Math.sin(n * 1.6 + b.ph) * .02 * b.sit, 1 + b.sit * .05);
        b.head.rotation.x = b.sit * .7; b.head.position.set(0, .2 - b.sit * .06, .1 - b.sit * .04);
        b.t = rand(0, .4); continue;
      }
      b.c.scale.set(1, 1, 1); b.head.position.set(0, .2, .1);
      b.t -= dt;
      if (b.t <= 0) { b.t = rand(.6, 2.2); [b.tx, b.tz] = spot(); b.peck = rand(.4, 1.4); }
      const dx = b.tx - b.c.position.x, dz = b.tz - b.c.position.z, d = Math.hypot(dx, dz);
      if (d > .03) { const sp = .55; b.c.position.x += dx / d * Math.min(d, dt * sp); b.c.position.z += dz / d * Math.min(d, dt * sp); b.c.rotation.y = Math.atan2(dx, dz); b.c.position.y = Math.abs(Math.sin(n * 18 + b.ph)) * .02; b.head.rotation.x = 0; }
      else { b.peck -= dt; b.c.position.y = 0; b.head.rotation.x = b.peck > 0 ? Math.max(0, Math.sin(n * 14 + b.ph)) * .9 : 0; }
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

/** 27.11.2026 Kompostierer: slatted wooden bin with a dark steaming heap, a pitchfork stuck in it and a few mushrooms growing out of the compost.
 *  Working (someone composts): the heap heaves, the fork rocks, more steam and green spores. */
function compost(g: THREE.Group, H: number) {
  pad(g, H);
  const W = .62, D = .52, HT = .62;
  for (const [x, z] of [[-W, -D], [W, -D], [-W, D], [W, D]]) part(g, GEO.box, WOOD_D, .09, HT + .12, .09, x, (HT + .12) / 2, z);
  for (let i = 0; i < 4; i++) { // slats with gaps: back and both sides full height, the front only two boards (open to shovel)
    const y = .12 + i * .15, mat = i % 2 ? WOOD : WOOD_L;
    part(g, GEO.box, mat, W * 2, .11, .035, 0, y, -D).rotation.z = (i - 1.5) * .012;
    part(g, GEO.box, mat, .035, .11, D * 2, -W, y, 0); part(g, GEO.box, mat, .035, .11, D * 2, W, y, 0);
    if (i < 2) part(g, GEO.box, mat, W * 2, .11, .035, 0, y, D).rotation.z = (1 - i) * .02;
  }
  const EARTH = M(0x3a2a1c, { flat: false, r: 1 }), EARTH_L = M(0x57402a, { flat: false, r: 1 }), LEAF = M(0x6f8a34), PEEL = M(0xc8862e);
  const heap = new THREE.Group(); g.add(heap);
  part(heap, GEO.sph, EARTH, .56, .42, .46, 0, .3, 0);
  part(heap, GEO.sph, EARTH_L, .3, .2, .26, .2, .58, -.08); part(heap, GEO.sph, EARTH, .26, .18, .24, -.24, .52, .1);
  for (let i = 0; i < 9; i++) { const a = rand(0, 7), r = rand(.1, .42); const s = part(heap, GEO.lo, i % 3 ? LEAF : PEEL, rand(.05, .09), .02, rand(.04, .07), Math.cos(a) * r, .66 - r * .35 + rand(0, .04), Math.sin(a) * r * .8, false); s.rotation.set(rand(-.4, .4), rand(0, 7), rand(-.4, .4)); }
  // mushrooms growing out of the heap (the game's own kinds, small)
  for (const [k, x, y, z, s] of [['champ', -.3, .6, .22, .5], ['pfiff', .34, .62, .16, .45], ['flieg', .05, .7, -.2, .42]] as const) { const m = mushMesh(k); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = rand(0, 7); heap.add(m); }
  // pitchfork stuck into the heap
  const fork = new THREE.Group(); fork.position.set(-.08, .62, .05); fork.rotation.set(.18, 0, -.32); g.add(fork);
  part(fork, GEO.cyl, WOOD_L, .028, 1.0, .028, 0, .5, 0); part(fork, GEO.box, IRON, .2, .03, .03, 0, 0, 0);
  for (const x of [-.09, -.03, .03, .09]) part(fork, GEO.box, IRON, .018, .22, .018, x, -.11, 0);
  let k = 0, t = 0, st = 0;
  return (dt: number, _n: number, working: boolean, broken: boolean) => {
    k += ((working && !broken ? 1 : 0) - k) * Math.min(1, dt * 5); t += dt * (1 + k * 3);
    heap.scale.set(1 + Math.sin(t * 3) * .02 * k, 1 + Math.sin(t * 6) * .05 * k, 1 + Math.cos(t * 3) * .02 * k);
    fork.rotation.z = -.32 + Math.sin(t * 6) * .12 * k; fork.position.y = .62 + Math.abs(Math.sin(t * 6)) * .06 * k;
    st -= dt; if (!broken && st <= 0) { st = working ? rand(.05, .12) : rand(.5, 1.1); const wp = g.getWorldPosition(V());
      PART.spawn(V(wp.x + rand(-.3, .3), rand(.75, .95), wp.z + rand(-.25, .25)), V(rand(-.08, .08), rand(.25, .5), rand(-.08, .08)), working && Math.random() < .4 ? 0x9fe060 : 0xd8d2c0, rand(.08, .16), rand(.8, 1.4), { s1: 2.2, a: working ? .45 : .22 }); }
  };
}
const MAKERS: Record<BuildingType, (g: THREE.Group, H: number) => (dt: number, now: number, working: boolean, broken: boolean, wx?: number, wz?: number) => void> = { well, mill, press, bakery, hens, kitchen, compost };
void cow; void dairy; // 23.11.2026 Kuh + Käserei vorerst ausgebaut (Modelle bleiben fürs Wiedereinbauen)

/** Lager-Truhe (23.11.2026): big wooden chest with iron bands on an earth hex in the garden centre; the lid opens a crack
 *  and rattles while raccoons steal from it. Returns the update function (dt, thieves at work). */
/** Lager-Truhe = Bastis Startertruhe (FBX, 24.11.2026): base stays, the lid turns around its own pivot (hinge at the back).
 *  Thieves open it: the more raccoons at the chest, the wider (up to ~70 deg), with a nervous rattle. */
const CHEST_MAT: Record<string, THREE.MeshStandardMaterial> = {};
const chestMat = (k: string) => CHEST_MAT[k] ??= new THREE.MeshStandardMaterial({ color: CHEST_MATS[k].col, roughness: CHEST_MATS[k].rough, metalness: CHEST_MATS[k].rough < .4 ? .5 : 0 }); // grey iron fittings: a bit metallic
const chestGeo = new Map<ChestChunk, THREE.BufferGeometry>();
function chestMeshes(parent: THREE.Object3D, cs: ChestChunk[]) {
  for (const c of cs) {
    let g = chestGeo.get(c); if (!g) { g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nrm, 3)); g.computeBoundingSphere(); chestGeo.set(c, g); }
    const m = new THREE.Mesh(g, chestMat(c.m)); m.castShadow = true; m.receiveShadow = true; parent.add(m);
  }
}
export function chestModel(g: THREE.Group) {
  const ch = new THREE.Group(); ch.rotation.y = .3; g.add(ch);
  chestMeshes(ch, CHEST_BASE);
  const hinge = new THREE.Group(); hinge.position.set(...CHEST_PIVOT); ch.add(hinge);
  chestMeshes(hinge, CHEST_LID);
  // a few things peeking out of the gap
  const loot = new THREE.Group(); ch.add(loot); const top = CHEST_PIVOT[1];
  for (let i = 0; i < 7; i++) part(loot, GEO.sph, [M(0x3550e0), M(0xb00a1e), M(0x3a1f44), M(0xe0b85a)][i % 4], .08, .08, .08, rand(-.4, .4), top - .05, rand(-.22, .22), false);
  let open = 0, t = 0;
  // 26.11.2026 atk: the animals beat on the chest instead of stealing: the lid only jumps, every hit (kick 0..1) jolts the whole chest
  return (dt: number, thieves: number, atk = false, kick = 0) => {
    t += dt; open += ((thieves > 0 ? (atk ? .06 + Math.min(.12, thieves * .02) : .55 + Math.min(.65, thieves * .13)) : 0) - open) * Math.min(1, dt * 6);
    hinge.rotation.x = -open - (thieves > 0 ? Math.abs(Math.sin(t * 13)) * (atk ? .05 : .1) : 0) - kick * .12;
    loot.visible = !atk && open > .05;
    ch.position.set(Math.sin(t * 61) * kick * .05, kick * .03, Math.cos(t * 53) * kick * .04); ch.rotation.z = Math.sin(t * 47) * kick * .05;
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
      anim(dt, now, working && !broken, broken, wx, wz);
    },
    set(k, v) { (g.userData as any).set?.(k, v); },
  };
}
