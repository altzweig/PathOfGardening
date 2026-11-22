// Wood + fences (Basti 22.11.2026): the three yard trees that can be chopped (the notch gets deeper, the tree tips over, the
// trunk splits in two and a sapling grows between the halves), the workbench next to the fields and every fence piece.
// Low poly + flat shaded like the big apple tree. Everything follows the farm state (s.lumber), so a co-op guest sees the same.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FarmCfg } from '../config';
import type { FarmState } from '../state';

const bark = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, flatShading: true, vertexColors: true });
const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, flatShading: true, vertexColors: true });
const woodM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, flatShading: true, vertexColors: true });
const BARK = new THREE.Color(0x6b4a32), FRESH = new THREE.Color(0xd2aa72), CORE = new THREE.Color(0xc89858);

const TRUNK_H = 2.3, NOTCH_Y = .42, NOTCH_H = .3, R0 = .24, R1 = .15;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function seededRnd(x: number, z: number) { let s = Math.abs(Math.round(x * 97 + z * 151)) % 2147483646 + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function colorize(geo: THREE.BufferGeometry, c: THREE.Color) {
  const n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}

/** crown: a few lumpy balls; trunk top + two short branches */
function crown(rnd: () => number, k = 1) {
  const leaves: THREE.BufferGeometry[] = [], col = new THREE.Color();
  const balls: [number, number, number, number][] = [[0, 2.75, 0, 1.0], [.6, 2.35, .25, .72], [-.55, 2.4, -.2, .7], [.1, 2.4, -.6, .66], [-.15, 3.35, .15, .7], [.2, 2.25, .62, .6]];
  balls.forEach(([x, y, z, r], i) => {
    const geo = new THREE.IcosahedronGeometry(r * k * (.92 + rnd() * .16), 1); geo.scale(1, .9, 1); geo.rotateY(i * .9 + rnd());
    geo.translate(x * k + (rnd() - .5) * .15, y * k, z * k + (rnd() - .5) * .15);
    col.setHSL(.25 + (i % 3) * .014 + rnd() * .01, .48, .29 + (i % 4) * .022);
    const P = geo.getAttribute('position'), c = new Float32Array(P.count * 3);
    for (let j = 0; j < P.count; j++) { const sh = .8 + .32 * clamp01((P.getY(j) - (y - r) * k) / (2 * r * k)); c[j * 3] = col.r * sh; c[j * 3 + 1] = col.g * sh; c[j * 3 + 2] = col.b * sh; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); leaves.push(geo);
  });
  return mergeGeometries(leaves);
}
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 6) {
  const d = b.clone().sub(a), len = d.length(), geo = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  geo.translate(0, len / 2, 0); geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); geo.translate(a.x, a.y, a.z);
  return colorize(geo.toNonIndexed(), BARK);
}

/** the lower trunk with the notch cut into it: vertices in front of the cut plane are pushed back onto it (fresh wood colour) */
class NotchTrunk {
  geo: THREE.BufferGeometry; private base: Float32Array; mesh: THREE.Mesh; private last = -1; private lastDir = 99;
  constructor() {
    const g = new THREE.CylinderGeometry(lerp(R0, R1, NOTCH_Y * 2 / TRUNK_H), R0, NOTCH_Y * 2, 18, 36, true).toNonIndexed();
    g.translate(0, NOTCH_Y, 0); colorize(g, BARK);
    this.geo = g; this.base = (g.getAttribute('position').array as Float32Array).slice();
    this.mesh = new THREE.Mesh(g, bark); this.mesh.castShadow = true; this.mesh.receiveShadow = true;
  }
  /** k = 0..1 depth (of the radius x 1.05), dir = yaw the notch faces */
  set(k: number, dir: number) {
    if (Math.abs(k - this.last) < .01 && Math.abs(dir - this.lastDir) < .01) return;
    this.last = k; this.lastDir = dir;
    const P = this.geo.getAttribute('position') as THREE.BufferAttribute, C = this.geo.getAttribute('color') as THREE.BufferAttribute, B = this.base;
    const ux = Math.sin(dir), uz = Math.cos(dir), D = k * R0 * 1.05;
    for (let i = 0; i < P.count; i++) {
      let x = B[i * 3], z = B[i * 3 + 2]; const y = B[i * 3 + 1];
      // notch profile: flat bottom cut at NOTCH_Y, slanted top cut up to NOTCH_Y + NOTCH_H
      const dy = y - NOTCH_Y, prof = dy < 0 ? clamp01(1 + dy / .03) : clamp01(1 - dy / NOTCH_H), depth = D * prof;
      const r = Math.hypot(x, z), f = x * ux + z * uz, lim = r - depth;
      let cut = false;
      if (depth > 1e-4 && f > lim) { const m = f - lim; x -= ux * m; z -= uz * m; cut = true; }
      P.setXYZ(i, x, y, z);
      const c = cut ? (prof > .85 ? CORE : FRESH) : BARK; C.setXYZ(i, c.r, c.g, c.b);
    }
    P.needsUpdate = true; C.needsUpdate = true; this.geo.computeBoundingSphere();
  }
}

interface TreeV {
  root: THREE.Group;
  /** stump (cut part of the trunk) + the part above the notch that tips over */
  notch: NotchTrunk; top: THREE.Group; standing: THREE.Group;
  /** after the fall: the two halves of the trunk and the sapling between them */
  halves: THREE.Group; half: THREE.Mesh[]; sap: THREE.Group;
  /** local animation clocks (guests only get the state 4x per second) */
  fallT: number; downT: number; upT: number; wasFell: boolean; wasSap: boolean; dir: number; face: number; shake: number;
}

export class LumberView {
  g = new THREE.Group();
  private trees: TreeV[] = [];
  private fences: THREE.InstancedMesh;
  private ghost: THREE.Mesh; private ghostMat: THREE.MeshBasicMaterial;
  private fenceIds: number[] = []; private fenceKey = '';
  /** fence pieces that were bitten: shake for a moment */
  private fenceHit = new Map<number, number>();
  bench: THREE.Group;
  /** saw + plank on the workbench (move while crafting) */
  private saw: THREE.Object3D; private benchWork = 0;
  constructor(private cfg: FarmCfg) {
    this.g.name = 'lumber';
    const L = cfg.lumber;
    for (const t of L?.trees ?? []) this.trees.push(this.buildTree(t.x, t.z, t.s ?? 1));
    // fences: one instanced mesh for all pieces (posts + two rails)
    const F = L?.fence, geo = fenceGeo(F?.length ?? 1.6);
    this.fences = new THREE.InstancedMesh(geo, woodM, Math.max(1, F?.max ?? 80)); this.fences.count = 0; this.fences.castShadow = true; this.fences.receiveShadow = true;
    this.fences.frustumCulled = false; this.g.add(this.fences);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x9cff8a, transparent: true, opacity: .35, depthWrite: false });
    this.ghost = new THREE.Mesh(geo, this.ghostMat); this.ghost.visible = false; this.ghost.renderOrder = 5; this.g.add(this.ghost);
    const b = this.buildBench(); this.bench = b.g; this.saw = b.saw; this.g.add(this.bench);
  }

  private buildTree(x: number, z: number, s: number): TreeV {
    const rnd = seededRnd(x, z), root = new THREE.Group(); root.position.set(x, 0, z); root.scale.setScalar(s);
    const standing = new THREE.Group(); root.add(standing);
    const notch = new NotchTrunk(); standing.add(notch.mesh);
    // roots (stay with the stump)
    const roots: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) { const a = k * 1.26 + rnd(); roots.push(limb(new THREE.Vector3(Math.cos(a) * .42, -.05, Math.sin(a) * .42), new THREE.Vector3(0, .38, 0), .085, .05, 5)); }
    const rm = new THREE.Mesh(mergeGeometries(roots), bark); rm.castShadow = true; standing.add(rm);
    // everything above the notch: tips over around the hinge at the back of the notch
    const top = new THREE.Group(); standing.add(top);
    const wood: THREE.BufferGeometry[] = [limb(new THREE.Vector3(0, NOTCH_Y * 2 - .02, 0), new THREE.Vector3(0, TRUNK_H, 0), lerp(R0, R1, NOTCH_Y * 2 / TRUNK_H), R1, 9)];
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + rnd(); wood.push(limb(new THREE.Vector3(0, 1.6 + k * .2, 0), new THREE.Vector3(Math.cos(a) * .6, 2.3 + k * .2, Math.sin(a) * .6), .07, .04, 5)); }
    const wm = new THREE.Mesh(mergeGeometries(wood), bark); wm.castShadow = true; wm.receiveShadow = true; top.add(wm);
    const cm = new THREE.Mesh(crown(rnd), leaf); cm.castShadow = true; cm.receiveShadow = true; top.add(cm);
    // the two halves of the trunk (half cylinders, flat side fresh wood) + the sapling
    const halves = new THREE.Group(); halves.visible = false; root.add(halves);
    const half: THREE.Mesh[] = [];
    for (const sgn of [-1, 1]) {
      const hg = new THREE.CylinderGeometry(R0 * .95, R0 * .95, 1.9, 9, 1, false, 0, Math.PI).toNonIndexed();
      colorize(hg, BARK);
      // flat side (the split): fresh wood
      const flat = new THREE.PlaneGeometry(R0 * 1.9, 1.9).toNonIndexed(); flat.rotateY(-Math.PI / 2); colorize(flat, FRESH);
      const m = new THREE.Mesh(mergeGeometries([hg, flat]), bark); m.castShadow = true; m.receiveShadow = true;
      const hold = new THREE.Group(); hold.add(m); m.rotation.z = Math.PI / 2; m.rotation.x = sgn * Math.PI / 2; // lying, flat side to the middle
      halves.add(hold); half.push(m);
    }
    const sap = new THREE.Group(); root.add(sap); sap.visible = false;
    const sw = new THREE.Mesh(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .7, 0), .035, .02, 5), bark); sap.add(sw);
    const sl = new THREE.Mesh(crown(rnd, .3), leaf); sl.position.y = -.05; sap.add(sl);
    for (const o of [sw, sl]) o.castShadow = true;
    this.g.add(root);
    return { root, notch, top, standing, halves, half, sap, fallT: 0, downT: 0, upT: 1, wasFell: false, wasSap: false, dir: 0, face: 0, shake: 0 };
  }

  private buildBench() {
    const B = this.cfg.lumber?.bench ?? { x: 0, z: 0, rot: 0, w: 1.9, d: .9 };
    const g = new THREE.Group(); g.position.set(B.x, 0, B.z); g.rotation.y = -(B.rot ?? 0) * Math.PI / 180;
    const parts: THREE.BufferGeometry[] = [], W = B.w, D = B.d, H = .86;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) => { const q = new THREE.BoxGeometry(w, h, d).toNonIndexed(); q.rotateY(ry); q.translate(x, y, z); parts.push(colorize(q, new THREE.Color(c))); };
    box(W, .09, D, 0, H, 0, 0xb08050);                                   // top
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.1, H, .1, sx * (W / 2 - .1), H / 2, sz * (D / 2 - .1), 0x7a5232); // legs
    box(W - .25, .06, .08, 0, .25, D / 2 - .1, 0x7a5232); box(W - .25, .06, .08, 0, .25, -D / 2 + .1, 0x7a5232); // stretchers
    box(W - .3, .04, D - .3, 0, .3, 0, 0x8a6038);                        // shelf
    box(.22, .16, .2, -W / 2 + .2, H + .12, -D / 2 + .16, 0x5a5a60);     // vise
    for (let i = 0; i < 4; i++) box(1.2, .05, .16, .2, H + .07 + i * .055, -.1 + (i % 2) * .03, i % 2 ? 0xc89a62 : 0xb88a52, (i - 1.5) * .04); // planks on the top
    for (let i = 0; i < 3; i++) box(.12, .12, .7, -.55 + i * .16, .38, .05, 0x8a6038); // wood on the shelf
    // a finished fence piece leaning on the side
    const fp = fenceGeo(1.2).toNonIndexed(); fp.rotateY(Math.PI / 2); fp.rotateX(-.25); fp.translate(W / 2 + .18, 0, 0); parts.push(fp);
    const m = new THREE.Mesh(mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)), woodM); m.castShadow = true; m.receiveShadow = true; g.add(m);
    // saw: blade + handle, lies on the planks and moves while crafting
    const saw = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.55, .1, .01), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: .6, roughness: .35 })); blade.position.x = .28; saw.add(blade);
    const hand = new THREE.Mesh(colorize(new THREE.BoxGeometry(.12, .1, .04).toNonIndexed(), new THREE.Color(0x8a3a20)), woodM); saw.add(hand);
    saw.position.set(-.1, H + .3, .18); saw.rotation.set(0, .3, -.1); g.add(saw);
    return { g, saw };
  }

  /** chop hit: the tree shakes, the notch looks at the farmer */
  chop(i: number, fx: number, fz: number) { const v = this.trees[i]; if (!v) return; v.shake = 1; v.face = Math.atan2(fx - v.root.position.x, fz - v.root.position.z); }
  /** where the notch is (chips fly out there) */
  notchPos(i: number) { const v = this.trees[i]; if (!v) return null; const r = R0 * v.root.scale.x; return new THREE.Vector3(v.root.position.x + Math.sin(v.face) * r, NOTCH_Y + .1, v.root.position.z + Math.cos(v.face) * r); }
  /** the far end of the fallen trunk (dust + chips when it hits the ground) */
  fallEnd(i: number) { const v = this.trees[i]; if (!v) return null; return new THREE.Vector3(v.root.position.x + Math.sin(v.dir) * 2.4, .2, v.root.position.z + Math.cos(v.dir) * 2.4); }
  hitFence(id: number) { this.fenceHit.set(id, .35); }
  crafting(on: boolean) { if (on) this.benchWork = .3; }

  update(s: FarmState, dt: number, ghost: { x: number; z: number; a: number; ok: boolean } | null) {
    const L = s.lumber, C = this.cfg.lumber; if (!L || !C) return;
    const now = performance.now() / 1000;
    this.trees.forEach((v, i) => {
      const T = L.trees[i]; if (!T) return;
      const fell = T.fell > 0, sap = T.sap > 0;
      if (fell && !v.wasFell) { v.fallT = 0; v.dir = T.dir; }
      if (!fell && v.wasFell && sap) v.downT = 0;
      if (!fell && !sap && (v.wasSap || v.wasFell)) v.upT = 0;
      v.wasFell = fell; v.wasSap = sap;
      v.dir = T.dir || v.dir;
      if (fell) {
        // tipping over: slow at first, then faster (hinge at the back of the notch)
        v.fallT += dt; const k = clamp01(v.fallT / C.fall), ang = (Math.PI / 2 - .06) * Math.pow(k, 2.3);
        v.standing.visible = true; v.halves.visible = false; v.sap.visible = false;
        v.notch.set(1, v.face);
        const hx = Math.sin(v.dir) * R0 * .7, hz = Math.cos(v.dir) * R0 * .7; // tips over its front edge
        v.top.position.set(hx, NOTCH_Y * 2, hz); v.top.children.forEach(c => c.position.set(-hx, -NOTCH_Y * 2, -hz));
        v.top.rotation.set(0, 0, 0); v.top.rotateOnWorldAxis(new THREE.Vector3(Math.cos(v.dir), 0, -Math.sin(v.dir)), ang);
        v.root.rotation.set(0, 0, 0);
      } else if (sap) {
        // split trunk lying in the fall direction, halves rolled apart; the sapling grows between their ends
        v.standing.visible = false; v.halves.visible = true; v.sap.visible = true;
        v.downT += dt; const kd = clamp01(v.downT / .45), e = 1 - Math.pow(1 - kd, 3);
        const ux = Math.sin(v.dir), uz = Math.cos(v.dir), px = -uz, pz = ux, k = 1 - T.sap / C.sapling;
        const sink = clamp01((k - .9) / .1); // the halves sink into the ground at the end
        v.halves.children.forEach((h, j) => {
          const sg = j ? 1 : -1, off = .08 + e * .38;
          h.position.set(ux * 1.3 + px * sg * off, R0 * .45 - sink * .3, uz * 1.3 + pz * sg * off);
          h.rotation.set(0, Math.atan2(ux, uz) - Math.PI / 2, 0);
          (h.children[0] as THREE.Mesh).rotation.x = sg * (Math.PI / 2 + e * .25);
        });
        const sc = .18 + .62 * k + Math.sin(now * 2 + i) * .01; v.sap.scale.setScalar(sc * Math.min(1, v.downT / .6));
        v.sap.rotation.z = Math.sin(now * 1.3 + i) * .03;
      } else {
        v.standing.visible = true; v.halves.visible = false; v.sap.visible = false;
        v.top.rotation.set(0, 0, 0); v.top.position.set(0, 0, 0); v.top.children.forEach(c => c.position.set(0, 0, 0));
        v.notch.set(clamp01(T.cut / C.chop), v.face);
        // grows back out of the sapling: quick pop
        v.upT = Math.min(1, v.upT + dt / .9); const g = v.upT < 1 ? .25 + .75 * (1 - Math.pow(1 - v.upT, 3)) * (1 + Math.sin(v.upT * Math.PI) * .08) : 1;
        v.standing.scale.setScalar(g);
        // shakes a little at every hit
        v.shake = Math.max(0, v.shake - dt * 4);
        const w = v.shake * v.shake * .035;
        v.standing.rotation.set(Math.sin(now * 40) * w, 0, Math.cos(now * 37) * w);
      }
    });
    // fences: rebuilt when the set changes, bitten ones shake
    const key = L.fences.map(f => f.id + ':' + Math.ceil(f.hp)).join(',');
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const shaking = this.fenceHit.size > 0;
    if (key !== this.fenceKey || shaking) {
      this.fenceKey = key; this.fenceIds = L.fences.map(f => f.id);
      const n = Math.min(L.fences.length, this.fences.instanceMatrix.count);
      for (let i = 0; i < n; i++) {
        const f = L.fences[i], h = this.fenceHit.get(f.id) ?? 0, j = h > 0 ? Math.sin(now * 60 + i) * h * .12 : 0;
        q.setFromAxisAngle(up, f.a); const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), j); q.multiply(tilt);
        m4.compose(p.set(f.x, 0, f.z), q, sc); this.fences.setMatrixAt(i, m4);
        const hp = clamp01(f.hp / C.fence.hp); col.setRGB(.55 + .45 * hp, .5 + .5 * hp, .45 + .55 * hp); this.fences.setColorAt(i, col);
      }
      this.fences.count = n; this.fences.instanceMatrix.needsUpdate = true; if (this.fences.instanceColor) this.fences.instanceColor.needsUpdate = true;
      for (const [id, t] of this.fenceHit) { const r = t - dt; if (r <= 0) this.fenceHit.delete(id); else this.fenceHit.set(id, r); }
    }
    // where the next fence piece goes (green = free, red = blocked)
    this.ghost.visible = !!ghost;
    if (ghost) { this.ghost.position.set(ghost.x, .01, ghost.z); this.ghost.rotation.set(0, ghost.a, 0); this.ghostMat.color.setHex(ghost.ok ? 0x9cff8a : 0xff6a5a); this.ghostMat.opacity = .28 + Math.sin(now * 5) * .06; }
    // workbench: the saw moves while crafting
    this.benchWork = Math.max(0, this.benchWork - dt);
    const k = this.benchWork > 0 ? 1 : 0; this.saw.position.x = -.1 + Math.sin(now * 14) * .18 * k; this.saw.rotation.z = -.1 - k * .35;
  }
}

/** one fence piece: three posts with pointed tops, two rails (length along local x) */
export function fenceGeo(len: number) {
  const parts: THREE.BufferGeometry[] = [];
  const post = (x: number) => {
    const b = new THREE.BoxGeometry(.1, .82, .1).toNonIndexed(); b.translate(x, .41, 0); parts.push(colorize(b, new THREE.Color(0x9a6a3a)));
    const t = new THREE.ConeGeometry(.075, .14, 4).toNonIndexed(); t.rotateY(Math.PI / 4); t.translate(x, .89, 0); parts.push(colorize(t, new THREE.Color(0x8a5a30)));
  };
  post(-len / 2 + .06); post(0); post(len / 2 - .06);
  for (const y of [.32, .64]) { const r = new THREE.BoxGeometry(len, .1, .045).toNonIndexed(); r.translate(0, y, .065); parts.push(colorize(r, new THREE.Color(y > .5 ? 0xc49260 : 0xb48252))); }
  return mergeGeometries(parts);
}
