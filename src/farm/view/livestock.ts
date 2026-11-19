// Farm animals in their pens (cow, sheep, goat, chicken): small low-poly models built from primitives, a simple walk
// cycle, lying down asleep when fed, a hunger bubble when they want food. Purely visual: the stall state is in sim.ts.
import * as THREE from 'three';
import type { Livestock } from '../config';

const M = (c: number, r = .85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: true });
const MAT = {
  cowW: M(0xf2ece0), cowB: M(0x2a2622), pink: M(0xe8a0a0), horn: M(0xe8dcc0, .5), hoof: M(0x3a3028),
  wool: M(0xf4f0e6, 1), sheepFace: M(0x2e2a26), goat: M(0xc8b49a), goatD: M(0x6a5240), beard: M(0xe8e0d0),
  hen: M(0xf6f0e4), comb: M(0xe03a2a), beak: M(0xf0a828), eye: new THREE.MeshBasicMaterial({ color: 0x141010 }),
};
const box = (p: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o;
};
const ball = (p: THREE.Object3D, m: THREE.Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
  const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; p.add(o); return o;
};

export interface LivestockView { type: Livestock; g: THREE.Group; body: THREE.Group; head: THREE.Group; legs: THREE.Object3D[]; h: number;
  x: number; z: number; f: number; tx: number; tz: number; wait: number; ph: number; lie: number; zzz: number }

/** legs hang from their hip: pivot group at the top, box below */
function leg(p: THREE.Object3D, m: THREE.Material, w: number, h: number, x: number, y: number, z: number, hoof?: THREE.Material) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  box(g, m, w, h, w, 0, -h / 2, 0); if (hoof) box(g, hoof, w * 1.05, h * .18, w * 1.05, 0, -h + h * .09, 0);
  return g;
}

export function makeLivestock(type: Livestock): LivestockView {
  const g = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(); g.add(body); const legs: THREE.Object3D[] = [];
  let h = 1;
  if (type === 'cow') {
    h = 1.3; body.add(head);
    box(body, MAT.cowW, .62, .5, 1.05, 0, .78, 0);
    // black patches: thin plates just outside the white body
    for (const [x, y, z, h2, d] of [[.315, .82, .2, .3, .34], [-.315, .74, -.22, .26, .3], [.315, .7, -.3, .2, .22], [-.315, .86, .25, .22, .26]] as const) box(body, MAT.cowB, .02, h2, d, x, y, z);
    box(body, MAT.cowB, .4, .02, .3, .05, 1.035, -.15); box(body, MAT.pink, .22, .1, .22, 0, .5, -.25);
    head.position.set(0, 1.02, .58);
    box(head, MAT.cowW, .36, .34, .38, 0, 0, .08); box(head, MAT.pink, .3, .18, .14, 0, -.08, .3);
    for (const sx of [-1, 1]) { box(head, MAT.horn, .05, .14, .05, sx * .14, .22, 0).rotation.z = -sx * .4; box(head, MAT.cowB, .14, .06, .08, sx * .24, .1, 0); box(head, MAT.eye, .05, .05, .02, sx * .1, .06, .27); }
    for (const [x, z] of [[-.2, .36], [.2, .36], [-.2, -.36], [.2, -.36]]) legs.push(leg(body, MAT.cowW, .13, .55, x, .55, z, MAT.hoof));
    const tail = box(body, MAT.cowW, .04, .45, .04, 0, .72, -.54); tail.rotation.x = .2;
  } else if (type === 'sheep' || type === 'goat') {
    h = .95; body.add(head);
    if (type === 'sheep') {
      for (const [x, y, z, r] of [[0, .62, .1, .3], [0, .65, -.18, .3], [.12, .7, 0, .22], [-.12, .7, 0, .22], [0, .74, -.02, .24]] as const) ball(body, MAT.wool, r, x, y, z);
      head.position.set(0, .72, .38); box(head, MAT.sheepFace, .2, .24, .26, 0, 0, .05); ball(head, MAT.wool, .13, 0, .13, -.02);
      for (const sx of [-1, 1]) { box(head, MAT.sheepFace, .14, .05, .08, sx * .15, .02, 0); box(head, MAT.eye, .03, .03, .02, sx * .07, .04, .18); }
      for (const [x, z] of [[-.12, .2], [.12, .2], [-.12, -.22], [.12, -.22]]) legs.push(leg(body, MAT.sheepFace, .07, .42, x, .42, z));
    } else {
      box(body, MAT.goat, .36, .34, .72, 0, .62, 0); box(body, MAT.goatD, .37, .08, .5, 0, .8, 0);
      head.position.set(0, .82, .4); box(head, MAT.goat, .2, .22, .3, 0, 0, .06); box(head, MAT.beard, .08, .14, .06, 0, -.16, .16);
      for (const sx of [-1, 1]) { box(head, MAT.goatD, .04, .2, .04, sx * .07, .18, -.04).rotation.x = -.5; box(head, MAT.goat, .14, .05, .08, sx * .15, .02, 0); box(head, MAT.eye, .03, .03, .02, sx * .08, .04, .21); }
      for (const [x, z] of [[-.12, .26], [.12, .26], [-.12, -.26], [.12, -.26]]) legs.push(leg(body, MAT.goatD, .07, .46, x, .46, z));
      box(body, MAT.goatD, .05, .14, .05, 0, .8, -.38).rotation.x = -.6;
    }
  } else {
    h = .55; body.add(head);
    ball(body, MAT.hen, .17, 0, .3, 0, 1, .9, 1.2); ball(body, MAT.hen, .1, 0, .38, -.18, .8, 1.2, .8);
    head.position.set(0, .48, .14); ball(head, MAT.hen, .09, 0, 0, 0); box(head, MAT.comb, .03, .07, .1, 0, .1, 0);
    box(head, MAT.beak, .05, .04, .07, 0, -.01, .1); box(head, MAT.comb, .03, .05, .03, 0, -.07, .07);
    for (const sx of [-1, 1]) box(head, MAT.eye, .02, .025, .02, sx * .06, .02, .06);
    for (const x of [-.06, .06]) legs.push(leg(body, MAT.beak, .025, .17, x, .17, 0));
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.receiveShadow = true; });
  return { type, g, body, head, legs, h, x: 0, z: 0, f: Math.random() * 7, tx: 0, tz: 0, wait: Math.random() * 2, ph: Math.random() * 7, lie: 0, zzz: Math.random() * 3 };
}

/** wander inside the pen (local box hw x hd), or lie down asleep */
export function animateLivestock(v: LivestockView, dt: number, now: number, hw: number, hd: number, asleep: boolean) {
  const speed = v.type === 'chicken' ? .7 : v.type === 'cow' ? .45 : .55;
  v.lie += ((asleep ? 1 : 0) - v.lie) * Math.min(1, dt * 2);
  let moving = false;
  if (!asleep) {
    if (v.wait > 0) v.wait -= dt;
    else {
      const dx = v.tx - v.x, dz = v.tz - v.z, l = Math.hypot(dx, dz);
      if (l < .1) { v.wait = 1 + Math.random() * 3; v.tx = (Math.random() * 2 - 1) * (hw - .6); v.tz = (Math.random() * 2 - 1) * (hd - .6); }
      else { const st = Math.min(l, speed * dt); v.x += dx / l * st; v.z += dz / l * st; const f = Math.atan2(dx, dz); let d = f - v.f; d = Math.atan2(Math.sin(d), Math.cos(d)); v.f += d * Math.min(1, dt * 5); moving = true; }
    }
  }
  v.ph += dt * (moving ? (v.type === 'chicken' ? 14 : 7) : 0);
  v.g.position.set(v.x, 0, v.z); v.g.rotation.y = v.f;
  const k = v.lie, sw = moving ? Math.sin(v.ph) * .5 : 0;
  v.legs.forEach((l, i) => { l.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? sw : -sw) * (1 - k); l.scale.y = 1 - k * .6; });
  v.body.position.y = -k * v.h * .3 + (moving ? Math.abs(Math.sin(v.ph)) * .02 : 0);
  v.body.rotation.z = k * .12;
  // head: pecks / grazes now and then, droops when asleep
  const graze = !moving && !asleep ? Math.max(0, Math.sin(now * (v.type === 'chicken' ? 3 : .8) + v.zzz * 3)) : 0;
  v.head.rotation.x = graze * (v.type === 'chicken' ? .9 : .6) + k * .45;
}
