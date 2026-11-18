// Animals (all enemy types + boss): sculpted procedural creatures with a bone rig and procedural animation.
// Every species is ONE skinned mesh (vertex colours, rigid per-bone weights) + one eye mesh (+ hedgehog spines),
// geometry built once per species and shared by all instances -> 2-3 draw calls per animal on mobile.
// Rest pose = all bones unrotated; all shapes are authored in body space (y up, +z forward, feet at y 0).
// No imports from core.ts: the dev preview page (tiere.html) uses this file without the game renderer.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyType } from '../config';

type V3 = [number, number, number];
type RGB = [number, number, number];
/** colour of a vertex: p = body-space position, d = unit direction in the shape (blob) / (cos, sin, 0) around the tube, t = 0..1 along a tube */
type Col = (p: THREE.Vector3, d: THREE.Vector3, t: number) => RGB;

// ---------------- colour + noise helpers ----------------
const C = (hex: number): RGB => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, f: number): RGB => [a[0] * f, a[1] * f, a[2] * f];
const sst = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function h3(x: number, y: number, z: number) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
/** value noise 0..1 */
function vn(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
    L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v), w);
}
/** fur: vertical gradient belly -> side -> back plus fine strand noise (stretched along the body) and a coarser mottling */
function fur(top: number, side: number, belly: number, amt = .22): Col {
  const T = C(top), S = C(side), B = C(belly);
  return (p, d) => {
    const t = sst(d.y, -.75, .8), base = t < .5 ? mix(B, S, t * 2) : mix(S, T, (t - .5) * 2);
    const n = vn(p.x * 38, p.y * 38, p.z * 9) * .65 + vn(p.x * 9, p.y * 9, p.z * 9) * .35;
    return mul(base, 1 + (n - .5) * amt * 2);
  };
}
const solid = (hex: number, amt = .1): Col => { const c = C(hex); return p => mul(c, 1 + (vn(p.x * 30, p.y * 30, p.z * 30) - .5) * amt * 2); };

// ---------------- rig builder ----------------
interface BoneDef { name: string; parent: string | null; pivot: V3 }
interface Piece { bone: number; g: THREE.BufferGeometry }
class Rig {
  bones: BoneDef[] = []; idx = new Map<string, number>();
  skin: Piece[] = []; rigid = new Map<string, THREE.BufferGeometry[]>(); eyeGeos: THREE.BufferGeometry[] = []; spineGeos: THREE.BufferGeometry[] = [];
  bone(name: string, parent: string | null, pivot: V3) { this.idx.set(name, this.bones.length); this.bones.push({ name, parent, pivot }); return this; }
  private bi(name: string) { const i = this.idx.get(name); if (i === undefined) throw new Error('bone ' + name); return i; }
  /** finish one shape: colours + skin attributes, normals */
  private add(bone: string, g: THREE.BufferGeometry, col: Col, ds: THREE.Vector3[], ts: number[]) {
    const p = g.attributes.position, n = p.count, cols = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i); const c = col(v, ds[i], ts[i]); cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    const b = this.bi(bone), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.skin.push({ bone: b, g }); return g;
  }
  /** soft ellipsoid: centre c, radii r, optional rotation (x,y,z) and a radial deform f(dir) */
  blob(bone: string, c: V3, r: V3, col: Col, o: { rot?: V3; deform?: (d: THREE.Vector3) => number; seg?: number } = {}) {
    const seg = o.seg ?? 14, s = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * .7)));
    s.deleteAttribute('uv'); s.deleteAttribute('normal'); const g = mergeVertices(s);
    const p = g.attributes.position, ds: THREE.Vector3[] = [], q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
    for (let i = 0; i < p.count; i++) {
      const d = new THREE.Vector3().fromBufferAttribute(p, i).normalize(), f = o.deform ? o.deform(d) : 1;
      const w = new THREE.Vector3(d.x * r[0] * f, d.y * r[1] * f, d.z * r[2] * f).applyQuaternion(q).add(new THREE.Vector3(...c));
      p.setXYZ(i, w.x, w.y, w.z); ds.push(d);
    }
    return this.add(bone, g, col, ds, ds.map(() => 0));
  }
  /** tube along a smooth curve through pts, radius interpolated over radii, rounded caps; fluff = noisy radius (fur) */
  tube(bone: string, pts: V3[], radii: number[], col: Col, o: { seg?: number; steps?: number; fluff?: number; flat?: number; closed?: boolean } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)), !!o.closed);
    const seg = o.seg ?? 10, steps = o.steps ?? Math.max(4, pts.length * 4), pos: number[] = [], ds: THREE.Vector3[] = [], ts: number[] = [], idx: number[] = [];
    const rad = (t: number) => { const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)); return radii[i] + (radii[i + 1] - radii[i]) * (f - i); };
    const ref = new THREE.Vector3(1, 0, 0), side = new THREE.Vector3(), up = new THREE.Vector3();
    const ring = (t: number, rr: number, push = 0) => {
      const c = curve.getPointAt(Math.min(1, Math.max(0, t))), tg = curve.getTangentAt(Math.min(1, Math.max(0, t)));
      side.crossVectors(tg, Math.abs(tg.x) > .9 ? new THREE.Vector3(0, 1, 0) : ref).normalize(); up.crossVectors(side, tg).normalize();
      if (Math.abs(tg.x) <= .9) { side.crossVectors(up, tg).normalize(); } // keep "up" roughly world up
      c.addScaledVector(tg, push);
      for (let k = 0; k < seg; k++) {
        const a = k / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const fl = o.fluff ? 1 + o.fluff * (vn(c.x * 9 + ca * 2.5, c.y * 9 + sa * 2.5, c.z * 9) - .5) * 2 : 1;
        const r = rr * fl, w = c.clone().addScaledVector(side, ca * r * (o.flat ?? 1)).addScaledVector(up, sa * r);
        pos.push(w.x, w.y, w.z); ds.push(new THREE.Vector3(ca * (o.flat ?? 1), sa, 0).normalize()); ts.push(t);
      }
    };
    const rings: number[] = [];
    if (!o.closed) { ring(0, rad(0) * .55, -rad(0) * .45); rings.push(1); }
    for (let s = 0; s <= steps; s++) { if (o.closed && s === steps) break; ring(s / steps, rad(s / steps)); rings.push(1); }
    if (!o.closed) { ring(1, rad(1) * .55, rad(1) * .45); rings.push(1); }
    const R = rings.length;
    for (let i = 0; i < R - 1 + (o.closed ? 1 : 0); i++) for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + (k + 1) % seg, c2 = ((i + 1) % R) * seg + k, d = ((i + 1) % R) * seg + (k + 1) % seg;
      idx.push(a, b, c2, b, d, c2);
    }
    if (!o.closed) { // cap centres
      const s0 = curve.getPointAt(0).addScaledVector(curve.getTangentAt(0), -rad(0) * .6), s1 = curve.getPointAt(1).addScaledVector(curve.getTangentAt(1), rad(1) * .6);
      const c0 = pos.length / 3; pos.push(s0.x, s0.y, s0.z); ds.push(new THREE.Vector3(0, 0, -1)); ts.push(0);
      const c1 = pos.length / 3; pos.push(s1.x, s1.y, s1.z); ds.push(new THREE.Vector3(0, 0, 1)); ts.push(1);
      for (let k = 0; k < seg; k++) { idx.push(c0, (k + 1) % seg, k); const L = (R - 1) * seg; idx.push(c1, L + k, L + (k + 1) % seg); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return this.add(bone, g, col, ds, ts);
  }
  /** glowing eye pair on bone "eyes": sphere with a dark pupil looking along dir */
  eyes(at: V3[], r: number, look: V3 = [0, 0, 1]) {
    const piv = this.bones[this.bi('eyes')].pivot;
    for (const e of at) {
      const s = new THREE.SphereGeometry(r, 12, 8); s.deleteAttribute('uv');
      const L = new THREE.Vector3(look[0] + Math.sign(e[0]) * .45, look[1], look[2]).normalize(), p = s.attributes.position, col: number[] = [], d = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { d.fromBufferAttribute(p, i).normalize(); const k = d.dot(L); const c = k > .82 ? .02 : k > .74 ? .35 : 1; col.push(c, c, c); }
      s.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); s.translate(e[0] - piv[0], e[1] - piv[1], e[2] - piv[2]); this.eyeGeos.push(s);
    }
  }
  pivot(name: string) { return this.bones[this.bi(name)].pivot; }
}

// ---------------- shared limbs ----------------
const LEGS = ['fl', 'fr', 'bl', 'br'] as const;
interface LegSpec { hip: V3; knee: V3; foot: V3; r: [number, number, number]; up: Col; lo: Col; paw: Col; pawR: V3 }
function legPair(R: Rig, front: boolean, L: LegSpec) {
  for (const sx of [-1, 1]) {
    const n = (front ? 'f' : 'b') + (sx < 0 ? 'l' : 'r'), X = (v: V3): V3 => [v[0] * sx, v[1], v[2]];
    R.bone(n, 'torso', X(L.hip)).bone(n + '2', n, X(L.knee));
    R.blob(n, [X(L.hip)[0] * .92, L.hip[1] + L.r[0] * .2, L.hip[2]], [L.r[0] * 1.25, L.r[0] * 1.5, L.r[0] * 1.35], L.up, { seg: 10 }); // muscle where the leg meets the body
    R.tube(n, [X(L.hip), X(L.knee)], [L.r[0], L.r[1]], L.up, { seg: 8, steps: 3 });
    R.tube(n + '2', [X(L.knee), X(L.foot)], [L.r[1] * .95, L.r[2]], L.lo, { seg: 8, steps: 3 });
    const f = X(L.foot); R.blob(n + '2', [f[0], L.pawR[1], f[2] + L.pawR[2] * .45], L.pawR, L.paw, { seg: 10 });
  }
}
/** ringed bushy tail over 3 bones; ring(s) gives the colour along the tail (s = 0 root .. 1 tip) */
function tail3(R: Rig, pts: V3[], radii: number[], ring: (s: number, p: THREE.Vector3) => RGB, fluff = .12) {
  // pts: 7 points (root .. tip), bones at pts[0], pts[2], pts[4]
  R.bone('t0', 'torso', pts[0]).bone('t1', 't0', pts[2]).bone('t2', 't1', pts[4]);
  const col = (a: number, b: number): Col => (p, _d, t) => ring(a + (b - a) * t, p);
  // segments overlap half a step into their neighbours so the caps hide inside (no pinched joints)
  const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  R.tube('t0', [pts[0], pts[1], pts[2], mid(pts[2], pts[3])], [radii[0], radii[1], radii[2], radii[2] * .8], col(0, 5 / 12), { fluff, seg: 11 });
  R.tube('t1', [mid(pts[1], pts[2]), pts[2], pts[3], pts[4], mid(pts[4], pts[5])], [radii[2] * .8, radii[2], radii[3], radii[4], radii[4] * .8], col(1 / 4, 3 / 4), { fluff, seg: 11 });
  R.tube('t2', [mid(pts[3], pts[4]), pts[4], pts[5], pts[6]], [radii[4] * .8, radii[4], radii[5], radii[6]], col(7 / 12, 1), { fluff, seg: 11 });
}

// ---------------- species ----------------
function raccoon(R: Rig, boss: boolean) {
  const fT = boss ? 0x48433d : 0x5e5850, fS = boss ? 0x6a645a : 0x847c71, fB = boss ? 0x9a9284 : 0xb3ab9c;
  const body = fur(fT, fS, fB), dark = C(0x1d1b18), white = C(boss ? 0xb4ad9f : 0xc8c1b3), scar = C(0xb06a62);
  R.bone('torso', null, [0, .32, 0]);
  R.blob('torso', [0, .34, -.05], [.21, .2, .3], body, { deform: d => 1 + .14 * Math.max(0, -d.z) * Math.max(0, d.y) + .05 * Math.max(0, -d.y) }); // hunched rump
  R.blob('torso', [0, .31, .15], [.17, .18, .17], body);
  R.bone('neck', 'torso', [0, .38, .22]).blob('neck', [0, .4, .25], [.125, .125, .12], body);
  if (boss) { // red neckerchief with a knot
    const red = (p: THREE.Vector3): RGB => mul(C(0x9c2a20), .85 + .3 * vn(p.x * 40, p.y * 40, p.z * 40) + (Math.sin((p.x + p.y) * 90) > .6 ? .25 : 0));
    const ring: V3[] = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ring.push([Math.cos(a) * .128, .4 + Math.sin(a) * .122, .25 - Math.sin(a) * .035]); }
    R.tube('neck', ring, [.028, .028], red, { closed: true, seg: 6, steps: 16 });
    R.blob('neck', [0, .29, .29], [.07, .075, .022], red, { rot: [-.3, 0, Math.PI / 4] });
  }
  R.bone('head', 'neck', [0, .44, .3]);
  const face: Col = (p, d) => {
    const base = fur(fT, fS, fB)(p, d, 0); if (d.z < .1) return base;
    const ay = .47 - .32 * Math.abs(p.x) + .01, half = .032 + .015 * Math.abs(p.x) / .1;
    if (p.z > .36 && Math.abs(p.y - ay) < half) return mul(dark, .9 + .2 * vn(p.x * 50, p.y * 50, 0));
    if (p.z > .37 && p.y > ay + half && p.y < ay + half + .03) return white;
    if (boss && p.x < -.02 && p.x > -.11 && Math.abs(p.y - (.53 - (p.x + .02) * .9)) < .008) return scar; // scar across the brow
    return base;
  };
  R.blob('head', [0, .46, .33], [.15, .125, .13], face, { deform: d => 1 + .12 * Math.max(0, -d.y) * Math.abs(d.x) });
  for (const sx of [-1, 1]) R.blob('head', [sx * .105, .425, .36], [.075, .06, .07], (p, d) => mul(mix(white, C(0x8a847a), sst(-d.y, 0, .8)), .9 + .16 * vn(p.x * 60, p.y * 60, p.z * 60)), { deform: d => 1 + .14 * Math.max(0, d.x * sx) * vn(d.y * 9, d.z * 9, 0) }); // white cheek ruff
  R.blob('head', [0, .425, .44], [.058, .05, .09], (p, d) => d.y > .45 && p.z < .5 ? dark : mul(white, .95), { rot: [.12, 0, 0] });
  R.blob('head', [0, .438, .525], [.026, .02, .02], () => C(0x121010));
  R.bone('eyes', 'head', [0, .475, .425]).eyes([[-.058, .475, .425], [.058, .475, .425]], .023);
  R.bone('jaw', 'head', [0, .41, .4]).blob('jaw', [0, .398, .445], [.045, .022, .06], () => mul(white, .9));
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'earL' : 'earR'; R.bone(n, 'head', [sx * .085, .55, .3]);
    const torn = boss && sx < 0;
    R.blob(n, [sx * .1, .6, .3], [.055, .06, .022], (p, d) => d.z > .45 && d.y < .8 ? mul(dark, 1.5) : d.z > -.35 ? white : fur(fT, fS, fB)(p, d, 0),
      { rot: [0, 0, -sx * .28], deform: torn ? (d => d.y > .3 && d.x > .1 ? .6 : 1) : undefined });
  }
  tail3(R, [[0, .37, -.29], [0, .4, -.37], [0, .41, -.45], [0, .4, -.53], [0, .38, -.6], [0, .35, -.67], [0, .31, -.75]],
    [.055, .075, .088, .09, .085, .07, .035], s => { const k = s * 5.5 % 1; return s > .9 ? dark : mix(C(0x8a8277), mul(dark, 1.3), sst(k, .42, .58) - sst(k, .88, 1)); }, .08);
  const lu = fur(0x4a453e, 0x524c44, 0x5a544b), ll = solid(0x24211d), paw = solid(0x1b1916);
  legPair(R, true, { hip: [.12, .27, .17], knee: [.125, .13, .2], foot: [.12, .03, .21], r: [.06, .045, .036], up: lu, lo: ll, paw, pawR: [.045, .026, .06] });
  legPair(R, false, { hip: [.13, .31, -.18], knee: [.14, .15, -.25], foot: [.13, .03, -.18], r: [.075, .045, .036], up: lu, lo: ll, paw, pawR: [.047, .026, .065] });
}

function panda(R: Rig) {
  const rT = 0xa2441a, rS = 0xb8582a, dkB = 0x2c1810, white = C(0xf0e6d6), dk = C(0x2a1610), rust = C(0xc0602c);
  const body: Col = (p, d) => { const t = sst(d.y, -.55, .55), n = vn(p.x * 36, p.y * 36, p.z * 9) * .6 + vn(p.x * 8, p.y * 8, p.z * 8) * .4; return mul(mix(C(dkB), mix(C(rS), C(rT), sst(d.y, .3, 1)), t), .86 + n * .28); };
  R.bone('torso', null, [0, .33, 0]);
  R.blob('torso', [0, .34, -.03], [.22, .19, .34], body, { deform: d => 1 + .06 * Math.max(0, -d.z) * Math.max(0, d.y) });
  R.blob('torso', [0, .32, .17], [.17, .17, .16], body);
  R.bone('neck', 'torso', [0, .4, .24]).blob('neck', [0, .42, .27], [.13, .125, .12], body);
  R.bone('head', 'neck', [0, .48, .32]);
  const face: Col = (p, d) => {
    const n = .9 + .2 * vn(p.x * 50, p.y * 50, p.z * 50);
    if (d.z > .15) {
      for (const sx of [-1, 1]) {
        if (Math.hypot(p.x - sx * .062, p.y - .552) < .026) return mul(white, n); // brow spots
        if (Math.abs(p.x - sx * (.05 + (.52 - p.y) * .25)) < .016 && p.y < .505 && p.y > .44) return mul(C(0x6a2610), n); // tear stripes
      }
      if (p.y < .5 && Math.abs(p.x) > .085) return mul(white, n); // white cheeks
    }
    return mul(mix(rust, C(0xd07a40), sst(d.y, .2, 1) * .4), n);
  };
  R.blob('head', [0, .5, .35], [.16, .13, .13], face, { deform: d => 1 + .1 * Math.max(0, -d.y) * Math.abs(d.x) });
  R.blob('head', [0, .462, .46], [.065, .05, .07], () => white);
  R.blob('head', [0, .474, .528], [.025, .019, .02], () => C(0x120a08));
  R.bone('eyes', 'head', [0, .515, .45]).eyes([[-.066, .515, .45], [.066, .515, .45]], .022);
  R.bone('jaw', 'head', [0, .45, .42]).blob('jaw', [0, .44, .46], [.045, .02, .055], () => white);
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'earL' : 'earR'; R.bone(n, 'head', [sx * .1, .6, .31]);
    R.blob(n, [sx * .122, .645, .31], [.065, .075, .024], (_p, d) => d.z > .45 && d.y < .8 ? mul(dk, 1.3) : d.z > -.35 ? white : rust, { rot: [0, 0, -sx * .3], seg: 16 });
  }
  tail3(R, [[0, .36, -.31], [0, .375, -.42], [0, .375, -.53], [0, .36, -.64], [0, .33, -.74], [0, .29, -.84], [0, .25, -.94]],
    [.07, .095, .105, .105, .1, .085, .045], s => { const k = s * 7 % 1; return s > .92 ? C(0x5a2410) : mix(C(0xc8743a), C(0x8a3412), sst(k, .45, .55) - sst(k, .9, 1)); }, .14);
  const lu: Col = (p, d) => mul(mix(C(dkB), C(0x3a2014), sst(d.y, 0, 1)), .9 + .2 * vn(p.x * 40, p.y * 40, p.z * 40)), paw = solid(0x170c08);
  legPair(R, true, { hip: [.13, .28, .18], knee: [.135, .14, .2], foot: [.13, .03, .21], r: [.065, .05, .04], up: lu, lo: lu, paw, pawR: [.048, .027, .06] });
  legPair(R, false, { hip: [.14, .3, -.2], knee: [.15, .15, -.26], foot: [.14, .03, -.2], r: [.08, .05, .04], up: lu, lo: lu, paw, pawR: [.05, .027, .066] });
}

function squirrel(R: Rig) {
  const body = fur(0x8e3c14, 0xb05a26, 0xeedcbc, .14), dk = C(0x4a1e0a), belly = C(0xf0e0c4), tailC = C(0xb85a24), tailL = C(0xe0904c);
  R.bone('torso', null, [0, .2, 0]);
  R.blob('torso', [0, .21, -.01], [.11, .13, .17], body, { rot: [-.4, 0, 0] });
  R.bone('neck', 'torso', [0, .27, .1]).blob('neck', [0, .285, .115], [.075, .075, .075], body);
  R.bone('head', 'neck', [0, .32, .14]);
  R.blob('head', [0, .335, .16], [.085, .08, .09], (p, d) => d.y < -.25 && d.z > 0 ? belly : body(p, d, 0));
  R.blob('head', [0, .312, .232], [.045, .04, .05], (p, d) => d.y < 0 ? belly : body(p, d, 0));
  R.blob('head', [0, .322, .28], [.014, .012, .012], () => C(0x1a0c06));
  R.bone('eyes', 'head', [0, .348, .215]).eyes([[-.05, .348, .213], [.05, .348, .213]], .02);
  R.bone('jaw', 'head', [0, .3, .22]).blob('jaw', [0, .292, .24], [.03, .014, .035], () => belly);
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'earL' : 'earR'; R.bone(n, 'head', [sx * .045, .39, .13]);
    R.blob(n, [sx * .052, .425, .13], [.024, .048, .014], body, { rot: [0, 0, -sx * .2] });
    R.tube(n, [[sx * .056, .45, .13], [sx * .062, .485, .127], [sx * .066, .51, .124]], [.013, .009, .002], () => dk, { seg: 5, steps: 3 }); // ear tufts
  }
  tail3(R, [[0, .19, -.13], [0, .22, -.21], [0, .32, -.25], [0, .44, -.23], [0, .53, -.16], [0, .575, -.07], [0, .55, .01]],
    [.05, .085, .11, .122, .115, .095, .045], (s, p) => mul(mix(tailC, tailL, sst(vn(p.x * 30, p.y * 30, p.z * 30), .55, .8) * .5 + s * .2), .9 + .2 * vn(p.x * 60, p.y * 20, p.z * 60)), .12);
  const lu = fur(0x8e3c14, 0xa04a1c, 0xd8b890), paw = solid(0x3a1a0c);
  legPair(R, true, { hip: [.055, .17, .1], knee: [.06, .09, .12], foot: [.055, .02, .13], r: [.028, .022, .018], up: lu, lo: lu, paw, pawR: [.022, .014, .028] });
  legPair(R, false, { hip: [.075, .19, -.08], knee: [.085, .1, -.01], foot: [.08, .02, -.1], r: [.06, .035, .022], up: lu, lo: lu, paw, pawR: [.026, .016, .06] });
  for (const sx of [-1, 1]) R.blob(sx < 0 ? 'bl' : 'br', [sx * .085, .15, -.06], [.05, .075, .09], body, { rot: [.5, 0, 0] }); // big haunches
}

function hedgehog(R: Rig) {
  const skin = fur(0x5a4230, 0x7a5a3e, 0xb09272, .14), face = (p: THREE.Vector3): RGB => mul(C(0xc9a77c), .9 + .2 * vn(p.x * 50, p.y * 50, p.z * 50));
  R.bone('torso', null, [0, .18, 0]);
  R.blob('torso', [0, .16, 0], [.21, .13, .26], skin);
  R.bone('puff', 'torso', [0, .2, -.02]);
  R.blob('puff', [0, .2, -.03], [.255, .185, .3], solid(0x3a2a1c, .2));
  // spines: one merged rigid mesh on the puff bone, banded dark / cream / dark
  const piv = R.pivot('puff'), up = new THREE.Vector3(0, 1, 0), base = C(0x2a1c10), band = C(0xcdb894), tip = C(0x4a3624);
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 230; i++) {
    const u = rnd(), th = rnd() * Math.PI * 2, ph = Math.acos(1 - u * 1.15);
    const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    if (d.z > .5 || (d.y < .05 && d.z > .1)) continue; // face stays free
    const len = .13 + rnd() * .06, cg = new THREE.ConeGeometry(.024, len, 5, 3, true); cg.translate(0, len / 2, 0); cg.deleteAttribute('uv');
    const p = cg.attributes.position, col: number[] = [];
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / len; const c = t < .4 ? base : t < .62 ? band : t < .9 ? tip : band; const v = .85 + rnd() * .3; col.push(c[0] * v, c[1] * v, c[2] * v); }
    cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const dir = d.clone().multiplyScalar(.6).add(new THREE.Vector3(0, .02, -.65)).normalize(), q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    cg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(d.x * .24, d.y * .17 + .02 + .2 - piv[1], d.z * .28 - .03 - piv[2]), q, new THREE.Vector3(1, 1, 1)));
    R.spineGeos.push(cg);
  }
  R.bone('neck', 'torso', [0, .17, .2]).bone('head', 'neck', [0, .18, .24]);
  R.blob('head', [0, .18, .27], [.12, .105, .12], p => face(p));
  R.tube('head', [[0, .17, .3], [0, .162, .37], [0, .152, .43]], [.07, .045, .022], p => face(p), { seg: 9 });
  R.blob('head', [0, .152, .445], [.02, .017, .016], () => C(0x120c08));
  R.bone('eyes', 'head', [0, .22, .34]).eyes([[-.058, .218, .34], [.058, .218, .34]], .019);
  R.bone('jaw', 'head', [0, .14, .33]).blob('jaw', [0, .136, .36], [.035, .014, .05], p => face(p));
  for (const sx of [-1, 1]) { const n = sx < 0 ? 'earL' : 'earR'; R.bone(n, 'head', [sx * .08, .26, .27]); R.blob(n, [sx * .09, .275, .27], [.03, .03, .012], solid(0x6a4a30)); }
  const leg = solid(0x2a1c12);
  legPair(R, true, { hip: [.11, .1, .13], knee: [.115, .06, .14], foot: [.11, .02, .15], r: [.032, .026, .022], up: leg, lo: leg, paw: leg, pawR: [.026, .015, .03] });
  legPair(R, false, { hip: [.12, .1, -.13], knee: [.125, .06, -.14], foot: [.12, .02, -.13], r: [.034, .026, .022], up: leg, lo: leg, paw: leg, pawR: [.026, .015, .032] });
}

function sheep(R: Rig) {
  const woolA = C(0x9a917c), woolB = C(0x655e52), woolC = C(0xada38c);
  const wool: Col = (p, d) => { const n = vn(p.x * 14, p.y * 14, p.z * 14), f = vn(p.x * 60, p.y * 60, p.z * 60); return mul(mix(mix(woolB, woolA, sst(d.y, -.7, .3)), woolC, sst(n, .55, .8) * .5), .88 + f * .24); };
  const lumpy = (s: number) => (d: THREE.Vector3) => 1 + .08 * (vn(d.x * 3.2 + s, d.y * 3.2, d.z * 3.2) - .5) * 2 + .07 * (vn(d.x * 9, d.y * 9 + s, d.z * 9) - .5) * 2 + .04 * (vn(d.x * 20 + s, d.y * 20, d.z * 20) - .5) * 2;
  const face = (p: THREE.Vector3): RGB => mul(C(0x2a2420), .85 + .3 * vn(p.x * 50, p.y * 50, p.z * 50)), leg = solid(0x26201c), hoof = solid(0x3e362e);
  R.bone('torso', null, [0, .45, 0]);
  R.blob('torso', [0, .46, -.01], [.27, .24, .35], wool, { deform: lumpy(0), seg: 18 });
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) { // wool curls on the surface
    const th = rnd() * Math.PI * 2, ph = Math.acos(1 - rnd() * 1.4), d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    if (d.z > .75) continue; const r = .06 + rnd() * .045;
    R.blob('torso', [d.x * .26, .46 + d.y * .23, -.01 + d.z * .34], [r, r * .85, r], wool, { deform: lumpy(i * 3), seg: 8 });
  }
  R.bone('neck', 'torso', [0, .5, .3]).blob('neck', [0, .53, .32], [.14, .15, .12], wool, { deform: lumpy(9), seg: 11 });
  R.bone('head', 'neck', [0, .56, .38]);
  R.blob('head', [0, .545, .45], [.085, .09, .13], p => face(p), { rot: [.55, 0, 0] });
  R.blob('head', [0, .49, .535], [.062, .058, .065], p => mul(face(p), 1.25));
  R.blob('head', [0, .628, .4], [.1, .06, .09], wool, { deform: lumpy(4), seg: 10 }); // wool top knot
  for (const sx of [-1, 1]) { // curled horns (side view spiral, drifting outwards)
    const pts: V3[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10, th = .35 - t * 4.4, r = .085 * (1 - .38 * t); pts.push([sx * (.075 + .07 * t), .565 + Math.cos(th) * r, .38 + Math.sin(th) * r]); }
    R.tube('head', pts, [.036, .03, .022, .013], (_p, _d, t) => mul(mix(C(0xc6b088), C(0x8a7452), .5 + .5 * Math.sin(t * 70)), 1 - t * .15), { seg: 8, steps: 22 });
  }
  R.bone('eyes', 'head', [0, .58, .49]).eyes([[-.066, .58, .49], [.066, .58, .49]], .022);
  R.bone('jaw', 'head', [0, .47, .52]).blob('jaw', [0, .462, .55], [.045, .02, .05], p => face(p));
  for (const sx of [-1, 1]) { const n = sx < 0 ? 'earL' : 'earR'; R.bone(n, 'head', [sx * .075, .575, .42]); R.blob(n, [sx * .125, .56, .42], [.065, .022, .034], p => face(p), { rot: [0, 0, sx * .45] }); }
  R.bone('t0', 'torso', [0, .5, -.34]).blob('t0', [0, .46, -.38], [.07, .09, .06], wool, { deform: lumpy(5), seg: 9 });
  legPair(R, true, { hip: [.15, .32, .2], knee: [.15, .17, .21], foot: [.15, .035, .22], r: [.042, .033, .028], up: leg, lo: leg, paw: hoof, pawR: [.036, .032, .04] });
  legPair(R, false, { hip: [.15, .33, -.2], knee: [.155, .16, -.25], foot: [.15, .035, -.21], r: [.048, .033, .028], up: leg, lo: leg, paw: hoof, pawR: [.036, .032, .04] });
  for (const n of LEGS) { const p = R.pivot(n); R.blob(n, [p[0], p[1] + .02, p[2]], [.09, .1, .1], wool, { deform: lumpy(p[2] * 10), seg: 9 }); } // woolly "trousers"
}

function toad(R: Rig) {
  const top = C(0x5a6834), dark = C(0x34401e), wart = C(0x8a8a46), belly = C(0xcabe7c), throat = C(0xdccc84);
  const skin: Col = (p, d) => {
    if (d.y < -.25) return mul(mix(belly, throat, .3), .92 + .16 * vn(p.x * 40, p.y * 40, p.z * 40));
    const b = vn(p.x * 11, p.y * 11, p.z * 11), w = vn(p.x * 34, p.y * 34, p.z * 34);
    let c = mix(top, dark, sst(b, .55, .65)); if (w > .72) c = mix(c, wart, .7); return mul(mix(c, mix(top, belly, .4), sst(-d.y, 0, .25)), .9 + .2 * vn(p.x * 70, p.y * 70, p.z * 70));
  };
  const warts = (d: THREE.Vector3) => (d.y < -.3 ? .72 + .28 * (d.y + 1) / .7 : 1) + .07 * Math.max(0, vn(d.x * 9, d.y * 9, d.z * 9) - .55) * 4;
  R.bone('torso', null, [0, .18, 0]);
  R.blob('torso', [0, .19, -.03], [.29, .17, .29], skin, { deform: warts, seg: 18 });
  for (const sx of [-1, 1]) R.blob('torso', [sx * .14, .31, .07], [.06, .04, .1], skin, { deform: warts }); // parotoid glands
  R.bone('neck', 'torso', [0, .2, .16]).bone('head', 'neck', [0, .22, .18]);
  const headCol: Col = (p, d) => (d.z > .3 && Math.abs(p.y - (.195 - Math.abs(p.x) * .12)) < .006 ? mul(dark, .6) : skin(p, d, 0)); // mouth line
  R.blob('head', [0, .225, .2], [.22, .12, .16], headCol, { deform: d => warts(d) * (1 - .12 * Math.max(0, d.z) * Math.max(0, -d.y)) });
  for (const sx of [-1, 1]) R.blob('head', [sx * .13, .31, .22], [.072, .07, .072], skin);
  R.bone('eyes', 'head', [0, .345, .25]).eyes([[-.14, .345, .25], [.14, .345, .25]], .045, [0, .2, 1]);
  R.bone('jaw', 'head', [0, .17, .22]).blob('jaw', [0, .14, .19], [.17, .06, .14], p => mul(throat, .92 + .16 * vn(p.x * 40, p.y * 40, p.z * 40)));
  const sk = skin, web = (p: THREE.Vector3): RGB => mul(mix(top, belly, .35), .9 + .2 * vn(p.x * 40, p.y * 40, p.z * 40));
  for (const sx of [-1, 1]) {
    const f = sx < 0 ? 'fl' : 'fr', b = sx < 0 ? 'bl' : 'br';
    R.bone(f, 'torso', [sx * .17, .16, .14]).bone(f + '2', f, [sx * .22, .08, .18]);
    R.tube(f, [[sx * .17, .16, .14], [sx * .22, .08, .18]], [.045, .035], sk, { seg: 7, steps: 3 });
    R.tube(f + '2', [[sx * .22, .08, .18], [sx * .23, .02, .21]], [.032, .025], sk, { seg: 7, steps: 3 });
    R.blob(f + '2', [sx * .235, .015, .235], [.05, .014, .05], p => web(p));
    R.bone(b, 'torso', [sx * .2, .14, -.14]).bone(b + '2', b, [sx * .32, .09, -.02]).bone(b + '3', b + '2', [sx * .3, .04, -.19]);
    R.blob(b, [sx * .27, .12, -.09], [.09, .075, .15], skin, { rot: [0, sx * .55, 0], deform: warts });
    R.tube(b + '2', [[sx * .32, .09, -.02], [sx * .31, .06, -.12], [sx * .3, .04, -.19]], [.055, .045, .032], sk, { seg: 7, steps: 4 });
    R.blob(b + '3', [sx * .31, .015, -.25], [.065, .014, .1], p => web(p), { rot: [0, -sx * .2, 0] });
  }
}

const BUILD: Record<string, (R: Rig) => void> = {
  raccoon: R => raccoon(R, false), boss: R => raccoon(R, true), panda, squirrel, hedgehog, sheep, toad,
};

// ---------------- templates (one per species, shared) ----------------
interface Template { bones: BoneDef[]; geo: THREE.BufferGeometry; eyes: THREE.BufferGeometry; spines?: THREE.BufferGeometry; h: number; w: number }
const TPL = new Map<string, Template>();
function template(key: string): Template {
  let t = TPL.get(key); if (t) return t;
  const R = new Rig(); BUILD[key](R);
  const geo = mergeGeometries(R.skin.map(p => p.g))!; geo.computeBoundingSphere();
  const eyes = mergeGeometries(R.eyeGeos)!;
  const spines = R.spineGeos.length ? mergeGeometries(R.spineGeos)! : undefined;
  geo.computeBoundingBox(); const bb = geo.boundingBox!;
  t = { bones: R.bones, geo, eyes, spines, h: R.bones[0].pivot[1], w: Math.max(.08, (bb.max.x - bb.min.x) / 2 * .8) }; TPL.set(key, t); return t;
}

export const ANIMAL_EYE: Record<EnemyType, number> = { raccoon: 0x5fb4ff, panda: 0xff8a26, toad: 0x6dff3a, sheep: 0xe8e2cc, hedgehog: 0xffc04a, squirrel: 0xffe070 };
const eyeMats = new Map<number, THREE.MeshBasicMaterial>();
function eyeMat(c: number) { let m = eyeMats.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, vertexColors: true, toneMapped: false }); eyeMats.set(c, m); } return m; }

/** animation memory per instance */
export interface AnimMem {
  ph: number; spd: number; px: number; pz: number; yaw: number; yawV: number; tail: number; tailV: number;
  look: number; lookT: number; lookTo: number; blinkT: number; earT: number; earS: number; hit: number; atk: number; grab: number; seed: number;
  flash: boolean; lunge: boolean; carry: number; init: boolean;
}
export interface Animal {
  type: EnemyType; boss: boolean; g: THREE.Group; body: THREE.Group; mesh: THREE.SkinnedMesh; b: Record<string, THREE.Bone>;
  mat: THREE.MeshStandardMaterial; spineMat?: THREE.MeshStandardMaterial; eyeMat: THREE.MeshBasicMaterial; eyes: THREE.Mesh; spines?: THREE.Mesh;
  carry: THREE.Group; tongue?: THREE.Group; h: number; w: number; m: AnimMem;
}

export function makeAnimal(type: EnemyType, boss = false): Animal {
  const T = template(boss ? 'boss' : type), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: type === 'toad' ? .5 : .92, metalness: 0, transparent: type === 'toad' });
  const b: Record<string, THREE.Bone> = {}, list: THREE.Bone[] = [];
  for (const d of T.bones) {
    const bn = new THREE.Bone(); bn.name = d.name; const pp = d.parent ? T.bones.find(x => x.name === d.parent)!.pivot : [0, 0, 0];
    bn.position.set(d.pivot[0] - pp[0], d.pivot[1] - pp[1], d.pivot[2] - pp[2]); if (d.parent) b[d.parent].add(bn);
    b[d.name] = bn; list.push(bn);
  }
  const mesh = new THREE.SkinnedMesh(T.geo, mat); mesh.castShadow = true; mesh.add(list[0]); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list)); body.add(mesh);
  const em = type === 'sheep' ? new THREE.MeshBasicMaterial({ color: ANIMAL_EYE.sheep, vertexColors: true, toneMapped: false }) : eyeMat(ANIMAL_EYE[type]);
  const eyes = new THREE.Mesh(T.eyes, em); b.eyes.add(eyes);
  const a: Animal = { type, boss, g, body, mesh, b, mat, eyeMat: em, eyes, carry: new THREE.Group(), h: T.h, w: T.w,
    m: { ph: Math.random() * 6, spd: 0, px: 0, pz: 0, yaw: 0, yawV: 0, tail: 0, tailV: 0, look: 0, lookT: 0, lookTo: 0, blinkT: 1 + Math.random() * 3, earT: Math.random() * 3, earS: 0, hit: 0, atk: 0, grab: 0, seed: Math.random() * 100, flash: false, lunge: false, carry: 0, init: false } };
  body.add(a.carry);
  if (T.spines) { a.spineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, emissive: 0xfff0c0, emissiveIntensity: 0 }); a.spines = new THREE.Mesh(T.spines, a.spineMat); a.spines.castShadow = true; b.puff.add(a.spines); }
  if (type === 'toad') { // sticky tongue out of the mouth (scale.z = length)
    const tongue = new THREE.Group(); tongue.position.set(0, -.03, .15); b.head.add(tongue);
    const tm = new THREE.MeshStandardMaterial({ color: 0xff6a8a, emissive: 0xff3060, emissiveIntensity: .8, roughness: .3 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1, 8), tm); c.rotation.x = Math.PI / 2; c.position.z = .5; tongue.add(c);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), tm); tip.scale.set(.09, .07, .09); tip.position.z = 1; tongue.add(tip);
    tongue.scale.set(1, 1, .01); tongue.visible = false; a.tongue = tongue;
  }
  return a;
}

// ---------------- animation ----------------
/** what the simulation says this frame (all optional, 0 / false = off) */
export interface AnimIn {
  x: number; z: number; yaw: number; dt: number; now: number;
  stun?: boolean; flee?: boolean; flash?: boolean; lunge?: boolean; carry?: number;
  air?: number;      // toad: 0..1 jump arc (0 = sitting) ; squirrel: hop height 0..1
  climb?: boolean;   // squirrel on the trunk
  windup?: number;   // sheep 0..1 run-up
  charge?: boolean;  // sheep ramming
  puff?: number;     // hedgehog: 0..1 puffed
  tongue?: number;   // toad tongue length (0 = in)
  rear?: number;     // boss rearing up while charging 0..1
}
const GAIT: Record<EnemyType, { stride: number; amp: number; bob: number; roll: number; ref: number }> = {
  raccoon: { stride: .62, amp: .62, bob: .03, roll: .09, ref: 2.4 },
  panda: { stride: .66, amp: .58, bob: .03, roll: .06, ref: 2.2 },
  sheep: { stride: .8, amp: .5, bob: .035, roll: .04, ref: 1.7 },
  hedgehog: { stride: .26, amp: .75, bob: .012, roll: .05, ref: 1.8 },
  squirrel: { stride: .5, amp: .7, bob: .02, roll: .03, ref: 3 },
  toad: { stride: 1, amp: 0, bob: 0, roll: 0, ref: 2 },
};
const OFF_TROT: Record<string, number> = { fl: 0, br: 0, fr: Math.PI, bl: Math.PI };
const OFF_GALLOP: Record<string, number> = { fl: 0, fr: .45, bl: Math.PI, br: Math.PI + .45 };

function rot(o: THREE.Object3D | undefined, x: number, y = 0, z = 0) { if (o) o.rotation.set(x, y, z); }

export function animate(a: Animal, I: AnimIn) {
  const m = a.m, dt = Math.min(.05, I.dt), now = I.now, b = a.b, G = GAIT[a.type];
  // --- speed + turn rate from the motion itself
  if (!m.init) { m.px = I.x; m.pz = I.z; m.yaw = I.yaw; m.init = true; }
  const v = dt > 0 ? Math.hypot(I.x - m.px, I.z - m.pz) / dt : 0; m.px = I.x; m.pz = I.z;
  m.spd += (Math.min(v, 12) - m.spd) * Math.min(1, dt * 10);
  let dy = I.yaw - m.yaw; dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; m.yaw = I.yaw;
  m.yawV += ((dt > 0 ? dy / dt : 0) - m.yawV) * Math.min(1, dt * 8);
  // --- one-shot triggers
  if (I.flash && !m.flash) m.hit = 1; m.flash = !!I.flash;
  if (I.lunge && !m.lunge) m.atk = 1; m.lunge = !!I.lunge;
  if ((I.carry ?? 0) > m.carry) m.grab = 1; m.carry = I.carry ?? 0;
  m.hit = Math.max(0, m.hit - dt / .28); m.atk = Math.max(0, m.atk - dt / .4); m.grab = Math.max(0, m.grab - dt / .35);
  // --- idle life: look around, blink, ear flicks
  m.lookT -= dt; if (m.lookT <= 0) { m.lookT = a.type === 'squirrel' ? .3 + Math.random() * .9 : 1.2 + Math.random() * 2.8; m.lookTo = (Math.random() - .5) * 1.1; }
  m.look += (m.lookTo - m.look) * Math.min(1, dt * (a.type === 'squirrel' ? 18 : 4));
  m.blinkT -= dt; if (m.blinkT < -.12) m.blinkT = 1.5 + Math.random() * 3.5;
  m.earT -= dt; if (m.earT <= 0) { m.earT = 1 + Math.random() * 3; m.earS = 1; } m.earS = Math.max(0, m.earS - dt * 6);
  const stun = !!I.stun, sp = m.spd, w = clamp(sp / (G.ref * .5), 0, 1), run = clamp((sp - G.ref) / G.ref, 0, 1);
  const s = m.seed, breathe = Math.sin(now * (stun ? 1.4 : 2.3) + s);
  m.ph += (sp / G.stride) * Math.PI * 2 * dt * (I.charge ? 1 : 1);
  const ph = m.ph;
  // reset pose
  a.body.position.set(0, 0, 0); a.body.rotation.set(0, 0, 0);
  for (const k in b) b[k].rotation.set(0, 0, 0);
  b.torso.scale.set(1 + breathe * .012, 1 + breathe * .018, 1);
  a.eyes.scale.set(1, m.blinkT < 0 ? .12 : stun ? .45 : 1, 1);
  const earBase = I.flee ? .7 : stun ? .5 : 0, earFlick = Math.sin(m.earS * Math.PI * 3) * .35 * m.earS;
  rot(b.earL, earBase, 0, earFlick * (s % 2 > 1 ? 1 : 0)); rot(b.earR, earBase, 0, -earFlick * (s % 2 > 1 ? 0 : 1));

  if (a.type === 'toad') { animToad(a, I, breathe); return; }
  if (a.type === 'squirrel' && ((I.air ?? 0) > .02 || I.climb)) { animSquirrelHop(a, I); return; }

  // --- quadruped gait
  const gallop = !!I.charge || (a.type === 'sheep' && run > .5);
  const amp = G.amp * (1 + run * .35) * w;
  for (const n of LEGS) {
    const front = n[0] === 'f', o = (gallop ? OFF_GALLOP : OFF_TROT)[n] + s, sw = Math.sin(ph + o), cw = Math.cos(ph + o);
    const up = b[n], lo = b[n + '2'];
    if (!up) continue;
    up.rotation.x = -sw * amp;
    lo.rotation.x = (front ? 1 : -1) * Math.max(0, cw) * amp * 1.1;
  }
  const bob = G.bob * (1 + run) * w;
  a.body.position.y = (1 - Math.cos(ph * 2)) * .5 * bob;
  b.torso.rotation.z = Math.sin(ph) * G.roll * w;
  b.torso.rotation.x = Math.sin(ph * 2) * .03 * w + (gallop ? Math.sin(ph) * .08 : 0);
  if (b.neck) b.neck.rotation.x = -Math.sin(ph * 2) * .05 * w + Math.sin(now * 1.3 + s) * .04 * (1 - w);
  if (b.head) b.head.rotation.set(-Math.sin(ph * 2 + .6) * .05 * w, m.look * (1 - w * .8), -b.torso.rotation.z * .7);
  // tail: spring that lags behind turns, sways, lifts while fleeing
  const tgt = -m.yawV * .14 + Math.sin(now * 1.6 + s) * .18 * (1 - w) + Math.sin(ph) * .2 * w;
  m.tailV += ((tgt - m.tail) * 60 - m.tailV * 9) * dt; m.tail += m.tailV * dt;
  if (b.t0) {
    const lift = I.flee ? -.35 : a.type === 'squirrel' ? 0 : .08;
    b.t0.rotation.set(lift + Math.sin(ph * 2) * .05 * w, m.tail * .5, 0);
    if (b.t1) b.t1.rotation.set(a.type === 'squirrel' ? Math.sin(now * 2 + s) * .06 : .05, m.tail * .7, 0);
    if (b.t2) b.t2.rotation.set(a.type === 'squirrel' ? Math.sin(now * 2.4 + s) * .1 : .04, m.tail * .9, 0);
  }
  // --- states on top
  if (a.type === 'squirrel' && w < .3) { // sitting up, nervous little twitches
    b.torso.rotation.x -= .35 * (1 - w); a.body.position.y += .02 * (1 - w);
    for (const n of ['fl', 'fr']) b[n].rotation.x += -.4 * (1 - w); b.bl.rotation.x += .35 * (1 - w); b.br.rotation.x += .35 * (1 - w);
    b.head.rotation.x += .3 * (1 - w) + Math.sin(now * 23 + s) * .03;
  }
  if (I.windup) { // sheep: head down, scrapes the ground with a front hoof, rear braced
    const k = I.windup; b.neck.rotation.x += .5 * k; b.head.rotation.x += .25 * k; b.torso.rotation.x += .1 * k;
    b.fr.rotation.x = Math.sin(now * 14) * .55 * k - .2 * k; b.fr2.rotation.x = .5 * k;
    b.bl.rotation.x += .25 * k; b.br.rotation.x += .25 * k;
  }
  if (I.charge) { b.neck.rotation.x += .55; b.head.rotation.x += .2; }
  if (I.puff !== undefined && a.type === 'hedgehog') { // curls a little into its spines
    const k = I.puff; b.head.rotation.x += .35 * k; b.neck.rotation.x += .25 * k; for (const n of LEGS) b[n].rotation.x += (n[0] === 'f' ? -.5 : .5) * k;
    a.body.position.y -= .03 * k;
  }
  if (m.grab > 0) { const k = Math.sin(m.grab * Math.PI); b.neck.rotation.x += .6 * k; b.head.rotation.x += .3 * k; if (b.jaw) b.jaw.rotation.x = .4 * k; }
  if (m.atk > 0) { // bite + paw swipe
    const k = Math.sin((1 - m.atk) * Math.PI); b.neck.rotation.x += .35 * k; b.head.rotation.x -= .25 * k; if (b.jaw) b.jaw.rotation.x = Math.max(b.jaw.rotation.x, .55 * k);
    b.fr.rotation.x = -1.1 * k; b.fr2.rotation.x = .3 * k; b.torso.rotation.x += .1 * k; a.body.position.z += .06 * k;
  }
  if (I.rear) { // boss charging: rises onto the hind legs, front paws paddle
    const k = I.rear, p = .75 * k; b.torso.rotation.x -= p; a.body.position.y += Math.sin(p) * .2 + .02 * k;
    b.bl.rotation.x += p; b.br.rotation.x += p; b.bl2.rotation.x = 0; b.br2.rotation.x = 0;
    b.fl.rotation.x = -.6 * k + Math.sin(now * 12) * .4 * k; b.fr.rotation.x = -.6 * k - Math.sin(now * 12) * .4 * k;
    b.neck.rotation.x += .35 * k; if (b.jaw) b.jaw.rotation.x = .5 * k; if (b.t0) b.t0.rotation.x += .5 * k;
  }
  if (stun) { // dizzy: head droops and wobbles, body sways
    b.neck.rotation.x += .4; b.head.rotation.z += Math.sin(now * 3.2 + s) * .3; b.torso.rotation.z += Math.sin(now * 2.2 + s) * .1;
    if (b.jaw) b.jaw.rotation.x = .2;
  }
  if (m.hit > 0) { const k = m.hit * m.hit; b.torso.rotation.x -= .22 * k; b.neck.rotation.x -= .25 * k; b.head.rotation.x -= .2 * k; a.body.position.z -= .05 * k; }
}

function animToad(a: Animal, I: AnimIn, breathe: number) {
  const b = a.b, m = a.m, air = I.air ?? 0, k = Math.sin(air * Math.PI); // 0 sitting .. 1 top of the jump
  const up = air > 0 ? (air < .5 ? air * 2 : 1) : 0, land = air > .5 ? (air - .5) * 2 : 0;
  b.jaw.scale.set(1, 1 + (air ? 0 : Math.max(0, Math.sin(I.now * 7 + m.seed)) * .35), 1); // throat pumping while sitting
  b.torso.rotation.x = air ? -.35 * (1 - land) + .25 * land : breathe * .02;
  for (const sx of ['l', 'r']) {
    const s = sx === 'l' ? -1 : 1, bb = 'b' + sx, ff = 'f' + sx;
    // hind legs fold at rest, kick out straight backwards on take-off, fold again for landing
    const ext = air ? Math.min(1, up * 1.6) * (1 - land) : 0;
    b[bb].rotation.set(.9 * ext, -s * .5 * ext, 0); b[bb + '2'].rotation.set(.6 * ext, 0, 0); b[bb + '3'].rotation.set(.6 * ext, 0, 0);
    b[ff].rotation.set(-.9 * k - .4 * land, 0, 0); b[ff + '2'].rotation.set(.5 * k, 0, 0);
  }
  b.head.rotation.set(air ? -.15 * k : 0, air ? 0 : m.look * .4, 0);
  const t = I.tongue ?? 0;
  if (a.tongue) { a.tongue.visible = t > 0; a.tongue.scale.z = Math.max(.01, t); }
  b.jaw.rotation.x = t > 0 ? .4 : 0;
  if (I.stun) { b.head.rotation.z = Math.sin(I.now * 3) * .2; b.torso.rotation.z = Math.sin(I.now * 2.1) * .08; }
  if (m.hit > 0) { b.torso.rotation.x -= .25 * m.hit; a.body.position.z -= .04 * m.hit; }
}

function animSquirrelHop(a: Animal, I: AnimIn) {
  const b = a.b, h = I.air ?? 0;
  if (I.climb) { // upright on the trunk, legs gripping, tail as balance
    a.body.rotation.x = -1.3; for (const n of LEGS) b[n].rotation.x = (n[0] === 'f' ? -.8 : .4) + Math.sin(I.now * 20 + (n[1] === 'l' ? 0 : 3)) * .3;
    b.t0.rotation.x = .4; b.t1.rotation.x = .2; return;
  }
  a.body.rotation.x = -.35 * h + .15;
  b.bl.rotation.x = .9 * h; b.br.rotation.x = .9 * h; b.bl2.rotation.x = -.5 * h; b.br2.rotation.x = -.5 * h; // push off with the long hind legs
  b.fl.rotation.x = -.8 * h; b.fr.rotation.x = -.8 * h;                                                     // reach forward for the landing
  b.t0.rotation.x = -.5 * h + Math.sin(I.now * 6 + a.m.seed) * .08; b.t1.rotation.x = -.2 * h; b.t2.rotation.x = .2 * h; // tail streams behind
  b.head.rotation.x = .25 * h;
}

/** death: rears up, tips over onto its side, legs twitch stiffly, then sinks into the ground. Returns false when done. */
export const DEATH_TIME = 1.6;
export function animateDeath(a: Animal, t: number, now: number) {
  const b = a.b, side = a.m.seed % 2 > 1 ? 1 : -1;
  for (const k in b) b[k].rotation.set(0, 0, 0);
  if (a.tongue) a.tongue.visible = false;
  const rear = Math.sin(clamp(t / .2, 0, 1) * Math.PI) * (t < .2 ? 1 : 0);
  const fall = sst(t, .12, .5), th = side * fall * Math.PI / 2 * (a.type === 'toad' ? 2 : 1); // the toad flips onto its back
  const h = a.h, wdt = a.type === 'toad' ? .1 : a.w;
  const bounce = Math.max(0, Math.sin(clamp((t - .5) / .18, 0, 1) * Math.PI)) * .04;
  a.body.rotation.set(-.3 * rear, 0, th);
  a.body.position.set(h * Math.sin(th), h - h * Math.cos(th) - (h - wdt) * fall + .05 * rear + bounce, 0);
  const tw = Math.max(0, 1 - t / 1.1) * Math.sin(now * 32 + a.m.seed);
  for (const n of LEGS) if (b[n]) { b[n].rotation.x = (n[0] === 'f' ? -.35 : .35) * fall + tw * .15 * (n[1] === 'l' ? 1 : -1); if (b[n + '2']) b[n + '2'].rotation.x = 0; }
  if (b.neck) b.neck.rotation.x = -.2 * fall; if (b.head) b.head.rotation.x = -.15 * fall; if (b.jaw) b.jaw.rotation.x = .3 * fall;
  if (b.t0) b.t0.rotation.y = .4 * fall * side;
  a.eyes.scale.y = t > .15 ? .1 : 1;
  const sink = sst(t, 1.0, DEATH_TIME); a.g.position.y = -sink * (h + .25) * a.g.scale.x;
  return t < DEATH_TIME;
}
