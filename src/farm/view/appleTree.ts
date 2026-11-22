// The big apple tree in the middle of the yard (Basti 22.11.2026): about half as tall as the old twisted tree but wider,
// a short trunk with six branches and round "tree balls" as crown. Three of the branches point 120° apart (the first one
// to the middle of the yard): the night lanterns hang from them (lanterns.ts). Built in code, low poly, flat shaded.
// The shape is a pure function of the position, so the apples (wild.ts) and the lanterns find the same crowns and branches.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FarmCfg } from '../config';

export interface Ball { c: THREE.Vector3; r: number }
export interface AppleTreeShape {
  x: number; z: number;
  /** branches: from, to (world) and radius at the start */
  branches: { a: THREE.Vector3; b: THREE.Vector3; r: number; lantern: boolean }[];
  balls: Ball[];
  /** points along the three lantern branches (lanterns.ts picks the hooks from them) */
  hookPts: THREE.Vector3[];
}

/** middle of the yard: fields + house door (the first lantern branch points there) */
export function yardMid(H: FarmCfg['hof']) {
  const P = H.plots, n = P.length || 1;
  return { x: (P.reduce((s, p) => s + p.x, 0) / n + H.door.x) / 2, z: (P.reduce((s, p) => s + p.z, 0) / n + H.door.z) / 2 };
}

const TRUNK = 1.6;
export function appleTreeShape(x: number, z: number, mid: { x: number; z: number }): AppleTreeShape {
  let seed = Math.abs(Math.round(x * 73 + z * 131)) % 2147483646 + 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const R = (a: number, b: number) => a + rnd() * (b - a);
  const a0 = Math.atan2(mid.z - z, mid.x - x);
  const at = (a: number, r: number, y: number) => new THREE.Vector3(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
  const branches: AppleTreeShape['branches'] = [], balls: Ball[] = [], hookPts: THREE.Vector3[] = [];
  for (let k = 0; k < 6; k++) {
    const lantern = k % 2 === 0, a = a0 + k * Math.PI / 3 + (lantern ? 0 : R(-.25, .25));
    const r = lantern ? R(2.0, 2.2) : R(1.4, 1.7), y = lantern ? R(3.0, 3.2) : R(3.3, 3.6);
    const from = at(a, .08, TRUNK - .15), to = at(a, r, y);
    branches.push({ a: from, b: to, r: lantern ? .11 : .09, lantern });
    // crown ball over the end of the branch (+ a smaller one beside it, so the crown looks lumpy)
    const br = lantern ? R(1.0, 1.1) : R(.9, 1.0);
    balls.push({ c: to.clone().add(new THREE.Vector3(0, br * .4, 0)), r: br });
    balls.push({ c: at(a + R(-.35, .35), r * R(.75, 1.05), y + R(.5, .8)), r: br * R(.6, .75) });
    if (lantern) for (let t = .45; t <= .7; t += .025) hookPts.push(from.clone().lerp(to, t));
  }
  // the top: one big ball over the trunk + a few small ones between the branch balls
  balls.push({ c: new THREE.Vector3(x, 4.0, z), r: 1.25 });
  for (let k = 0; k < 6; k++) { const a = a0 + (k + .5) * Math.PI / 3; balls.push({ c: at(a, R(1.0, 1.4), R(3.9, 4.3)), r: R(.7, .85) }); }
  return { x, z, branches, balls, hookPts };
}

const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: .95, flatShading: true });
const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, flatShading: true, vertexColors: true });

/** the tree as one group (trunk + branches in one mesh, all balls in one mesh) */
export function buildAppleTree(S: AppleTreeShape) {
  const g = new THREE.Group(); g.name = 'appleTree';
  const wood: THREE.BufferGeometry[] = [];
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const d = b.clone().sub(a), len = d.length(), geo = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
    geo.translate(0, len / 2, 0); geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); geo.translate(a.x, a.y, a.z);
    wood.push(geo.toNonIndexed());
  };
  limb(new THREE.Vector3(S.x, -.1, S.z), new THREE.Vector3(S.x, TRUNK + .1, S.z), .3, .2);
  // root flare
  for (let k = 0; k < 5; k++) { const a = k * 1.26 + .3; limb(new THREE.Vector3(S.x + Math.cos(a) * .45, -.05, S.z + Math.sin(a) * .45), new THREE.Vector3(S.x, .55, S.z), .1, .06); }
  for (const B of S.branches) {
    // slightly bent: two pieces through a point a little lower than the straight line
    const m = B.a.clone().lerp(B.b, .5); m.y -= .12;
    limb(B.a, m, B.r * 1.3, B.r); limb(m, B.b, B.r, B.r * .5);
  }
  const w = mergeGeometries(wood); w.computeVertexNormals();
  const trunk = new THREE.Mesh(w, bark); trunk.castShadow = true; trunk.receiveShadow = true; g.add(trunk);
  const leaves: THREE.BufferGeometry[] = [], col = new THREE.Color();
  S.balls.forEach((b, i) => {
    const geo = new THREE.IcosahedronGeometry(b.r, 1); geo.scale(1, .88, 1); geo.rotateY(i * .7); geo.translate(b.c.x, b.c.y, b.c.z);
    const n = geo.getAttribute('position').count, c = new Float32Array(n * 3);
    col.setHSL(.27 + (i % 3) * .012, .5, .3 + (i % 4) * .02);
    for (let k = 0; k < n; k++) { const y = geo.getAttribute('position').getY(k), sh = .82 + .3 * Math.min(1, Math.max(0, (y - b.c.y + b.r) / (2 * b.r))); c[k * 3] = col.r * sh; c[k * 3 + 1] = col.g * sh; c[k * 3 + 2] = col.b * sh; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); leaves.push(geo);
  });
  const l = new THREE.Mesh(mergeGeometries(leaves), leaf); l.castShadow = true; l.receiveShadow = true; g.add(l);
  return g;
}

/** n spots for apples on the lower outer side of the crown balls */
export function appleSpots(S: AppleTreeShape, n: number, rnd: () => number) {
  const big = S.balls.filter(b => b.r > .85), out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const b = big[i % big.length], out0 = new THREE.Vector3(b.c.x - S.x, 0, b.c.z - S.z);
    const a = Math.atan2(out0.z, out0.x) + (rnd() - .5) * 2.2, dy = -.55 + rnd() * .75, h = Math.sqrt(1 - dy * dy);
    out.push(new THREE.Vector3(b.c.x + Math.cos(a) * h * b.r * .98, b.c.y + dy * b.r * .88, b.c.z + Math.sin(a) * h * b.r * .98));
  }
  return out;
}
