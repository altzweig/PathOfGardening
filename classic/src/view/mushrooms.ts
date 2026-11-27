// Wildpilze (27.11.2026, Basti): ten wild mushrooms that pop up at the edge of the area, each with its own silhouette, colours and pattern.
// Commons are plain (white dome, brown bolete, yellow funnel), uncommon ones patterned (red with warts, dripping ink bell, striped violet
// hat), rare and epic ones strange and partly glowing (turquoise glow cluster, red kraken arms, slime blob with eyes, golden star morel).
// Every kind is baked once into two merged geometries with vertex colours: "body" (lit) and "glow" (unlit, so it shines at night and
// feeds the bloom). No lights, no textures: one instanced draw per kind and layer however many stand around (design-kosten rules).
// The module only needs three.js, so the preview page (pilze.html) and the game share the same models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MUSHROOMS, type MushId } from '../config';

type ColFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color | number;
const C = (h: number) => new THREE.Color(h);
const mix = (a: number | THREE.Color, b: number | THREE.Color, t: number) => (a instanceof THREE.Color ? a.clone() : C(a)).lerp(b instanceof THREE.Color ? b : C(b), Math.min(1, Math.max(0, t)));
const sst = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** cheap value noise 0..1 (fixed, so every build of a kind looks the same) */
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a: number, b: number, t: number) => a + (b - a) * t, h = (a: number, b: number, c: number) => hash(xi + a, yi + b, zi + c);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
/** seeded random for the placing of warts, drips, arms (same on every machine) */
function rng(seed: number) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** vertex colours from a function of position and normal (in the part's own space, before it is moved into place) */
function paint(g: THREE.BufferGeometry, fn: ColFn | number | THREE.Color) {
  const geo = g.index ? g.toNonIndexed() : g; geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), col = new Float32Array(P.count * 3), p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
    const c = typeof fn === 'number' ? C(fn) : fn instanceof THREE.Color ? fn : fn(p, n), k = c instanceof THREE.Color ? c : C(c);
    col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}
interface Xf { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; s?: number | [number, number, number] }
function put(g: THREE.BufferGeometry, t: Xf) {
  const s = t.s === undefined ? [1, 1, 1] : typeof t.s === 'number' ? [t.s, t.s, t.s] : t.s;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x ?? 0, t.y ?? 0, t.z ?? 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0)), new THREE.Vector3(s[0], s[1], s[2]));
  g.applyMatrix4(m); return g;
}
/** body of revolution from [radius, height] points (bottom to top or any order), smooth */
const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);
/** the same profile as a smooth curve with n points (patterns need the vertices) */
const fine = (pts: [number, number][], n: number): [number, number][] => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(n).map(v => [v.x, v.y] as [number, number]);
const ball = (r: number, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
/** dome cap: radius r, height h, bulge b (1 = round, >1 flatter top), with a gill underside curling in to the stem (ri) */
function capPts(r: number, h: number, b = 1, ri = .06, lip = .04, n = 9): [number, number][] {
  const o: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const t = i / n * Math.PI / 2; o.push([r * Math.pow(Math.sin(t), 1 / b), h * Math.cos(t)]); }
  o.push([r * .97, -lip], [r * .6, -lip * .2], [ri, lip * .4]); return o.reverse();
}
/** tube along a curve with a radius per position 0..1 */
function tube(pts: THREE.Vector3[], rad: (t: number) => number, seg = 14, sides = 7) {
  const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, seg, 1, sides, false), P = g.getAttribute('position'), v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) { curve.getPointAt(i / seg, c); const r = rad(i / seg); for (let j = 0; j <= sides; j++) { const k = i * (sides + 1) + j; v.fromBufferAttribute(P, k).sub(c).multiplyScalar(r).add(c); P.setXYZ(k, v.x, v.y, v.z); } }
  g.computeVertexNormals(); return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Parts { body: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[] }
type Maker = (P: Parts) => void;

// ---------------------------------------------------------------- the ten kinds ----------------------------------------------------------------
const MAKERS: Record<MushId, Maker> = {
  // 1 Wiesenchampignon (common): plain white button mushroom, a small one next to it
  champ(P) {
    const one = (s: number, x: number, z: number, tilt: number) => {
      P.body.push(put(paint(lathe([[.075, 0], [.085, .04], [.06, .12], [.055, .24]], 10), p => mix(0xe9e2d0, 0xfaf6ec, p.y / .24)), { s, x, z, rz: tilt }));
      P.body.push(put(paint(lathe(capPts(.2, .13, 1.5, .05, .035), 16), (p, n) => n.y < -.2 ? 0xb89a84 : mix(0xf7f2e6, 0xe6dcc6, sst(Math.hypot(p.x, p.z), .08, .2) * .7 + noise(p.x * 14, p.y * 14, p.z * 14) * .15)), { s, x, y: .22 * s, z, rz: tilt }));
    };
    one(1, 0, 0, .05); one(.55, .2, .1, -.25);
  },
  // 2 Steinpilz (common): fat beige stem, brown bun cap
  stein(P) {
    P.body.push(paint(lathe([[.12, 0], [.155, .06], [.15, .16], [.1, .27], [.085, .3]], 12), p => mix(0xd9c6a0, 0xf0e4c8, p.y / .3 + (noise(p.x * 30, p.y * 9, p.z * 30) - .5) * .3)));
    P.body.push(put(paint(lathe(capPts(.26, .17, 1.25, .09, .05), 18), (p, n) => n.y < -.2 ? 0xe6d79a : mix(0x8a5326, 0x5e3516, sst(Math.hypot(p.x, p.z), .05, .26) * .8 + (noise(p.x * 9, p.y * 9, p.z * 9) - .5) * .35)), { y: .28, rz: -.06 }));
  },
  // 3 Pfifferling (common): egg-yolk funnel with a wavy rim, a second smaller funnel
  pfiff(P) {
    const one = (s: number, x: number, z: number, ry: number) => {
      const g = lathe([[.035, 0], [.045, .08], [.06, .17], [.12, .25], [.2, .3], [.215, .315], [.17, .3], [.09, .27], [.02, .24]], 20), A = g.getAttribute('position');
      for (let i = 0; i < A.count; i++) { const px = A.getX(i), pz = A.getZ(i), r = Math.hypot(px, pz), a = Math.atan2(pz, px), k = sst(r, .08, .2); A.setY(i, A.getY(i) + Math.sin(a * 5) * .028 * k + Math.sin(a * 2 + 1) * .02 * k); const f = 1 + Math.sin(a * 5 + .6) * .08 * k; A.setX(i, px * f); A.setZ(i, pz * f); }
      g.computeVertexNormals();
      P.body.push(put(paint(g, (p, n) => { const a = Math.atan2(p.z, p.x), rid = .5 + .5 * Math.sin(a * 22); return n.y > .5 ? mix(0xf6b21a, 0xe8870e, sst(Math.hypot(p.x, p.z), .2, .02)) : mix(0xf2a50f, 0xffcf45, rid * sst(p.y, .05, .25)); }), { s, x, z, ry, rz: .08 }));
    };
    one(1, 0, 0, 0); one(.6, -.19, .12, 2);
  },
  // 4 Fliegenpilz (uncommon): red cap with white warts, white stem with a skirt
  flieg(P) {
    P.body.push(paint(lathe([[.1, 0], [.11, .04], [.065, .1], [.055, .3], [.05, .4]], 12), p => mix(0xe8e0cc, 0xfffdf4, p.y / .4)));
    P.body.push(put(paint(lathe([[.055, .02], [.13, -.035], [.12, -.05], [.055, -.005]], 14), 0xfaf6e6), { y: .29 }));
    P.body.push(put(paint(lathe(capPts(.3, .2, 1.15, .06, .045), 20), (p, n) => n.y < -.2 ? 0xf4eedc : mix(0xe2261c, 0xb3120f, sst(Math.hypot(p.x, p.z), .1, .3))), { y: .37 }));
    const R = rng(4);
    for (let i = 0; i < 15; i++) { // warts sit on the dome
      const t = (i < 1 ? 0 : .3 + R() * 1.1), a = R() * 7, sr = Math.sin(t), r = .3 * Math.pow(sr, 1 / 1.15), y = .2 * Math.cos(t), s = .03 + R() * .028;
      P.body.push(put(paint(ball(1, 7, 5), 0xfffaf0), { s: [s, s * .55, s], x: Math.cos(a) * r, y: .375 + y, z: Math.sin(a) * r }));
    }
  },
  // 5 Tintling (uncommon): tall shaggy white bell that melts into black ink at the rim, drips hanging down
  tint(P) {
    P.body.push(paint(lathe([[.05, 0], [.06, .03], [.04, .1], [.035, .3]], 9), 0xf0ece0));
    const g = lathe(fine([[.105, .16], [.125, .2], [.13, .3], [.115, .44], [.085, .56], [.04, .63], [0, .645]], 20), 18);
    P.body.push(paint(g, p => { const a = Math.atan2(p.z, p.x), sc = sst(noise(a * 3 + 3, p.y * 16, 1), .42, .55); const base = mix(0xf6f1e4, 0x9a7448, sc); return mix(0x0e0d12, base, sst(p.y, .19, .34)); }));
    const R = rng(8);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + R() * .5, l = .05 + R() * .09; P.body.push(put(paint(ball(1, 6, 6), 0x08070b), { s: [.02, l, .02], x: Math.cos(a) * .112, y: .165 - l * .6, z: Math.sin(a) * .112 })); }
    P.body.push(put(paint(new THREE.CircleGeometry(.2, 12), 0x0c0b10), { rx: -Math.PI / 2, y: .012, s: [1, .75, 1] })); // ink puddle
  },
  // 6 Lilakappe (uncommon): a pair of pointed violet hats with pale radial stripes and bent tips
  lila(P) {
    const one = (s: number, x: number, z: number, tilt: number, ry: number) => {
      P.body.push(put(paint(lathe([[.04, 0], [.045, .03], [.03, .12], [.03, .26]], 8), p => mix(0xcdb8e8, 0xefe6fa, p.y / .26)), { s, x, z, rz: tilt, ry }));
      const g = lathe([[.05, -.01], [.17, .0], [.19, .02], [.15, .1], [.085, .22], [.035, .34], [.012, .4], [0, .41]], 16), A = g.getAttribute('position');
      for (let i = 0; i < A.count; i++) { const y = A.getY(i), k = sst(y, .2, .41); A.setX(i, A.getX(i) + k * k * .09); } // the tip leans over
      g.computeVertexNormals();
      P.body.push(put(paint(g, (p, n) => { if (n.y < -.5) return 0xe8dcf6; const a = Math.atan2(p.z, p.x - sst(p.y, .2, .41) ** 2 * .09), st = sst(Math.abs(Math.sin(a * 5)), .6, .85); return mix(mix(0x5a1fa8, 0x8f4fe0, sst(p.y, 0, .4)), 0xf3e2ff, st * sst(p.y, .4, .1)); }), { s, x, y: .24 * s, z, rz: tilt, ry }));
    };
    one(.85, 0, 0, .06, .4); one(.58, .19, -.07, -.3, 2.6);
  },
  // 7 Glimmerling (rare): a tuft of thin dark stems with small turquoise caps that glow
  glimm(P) {
    const R = rng(21), S: [number, number, number, number][] = [[0, 0, .42, 1], [.13, .05, .3, .8], [-.11, .09, .34, .85], [.03, -.13, .24, .7], [-.14, -.07, .19, .6], [.17, -.1, .16, .55]];
    for (const [x, z, h, s] of S) {
      const lx = x * 1.5 + (R() - .5) * .06, lz = z * 1.5 + (R() - .5) * .06;
      P.body.push(paint(tube([V(x * .4, 0, z * .4), V(x * .8, h * .5, z * .8), V(lx, h, lz)], t => .022 - t * .008, 8, 6), p => mix(0x12303a, 0x2c8f96, p.y / .42)));
      P.glow.push(put(paint(lathe(capPts(.085, .075, 1.1, .02, .02, 6), 12), (p, n) => n.y < -.2 ? 0xbffcf2 : mix(0x7ffff0, 0x18c9d6, sst(Math.hypot(p.x, p.z), .01, .085))), { s, x: lx, y: h - .01, z: lz, rz: -x * 1.4, rx: z * 1.4 }));
      P.glow.push(put(paint(ball(1, 6, 5), 0xeafffb), { s: .016 * s, x: lx + .02, y: h + .07 * s, z: lz }));
    }
    P.body.push(put(paint(ball(1, 9, 6), p => mix(0x1f4a3a, 0x2e6a4a, noise(p.x * 9, p.y * 9, p.z * 9))), { s: [.2, .05, .18], y: .01 })); // mossy base
  },
  // 8 Krakenpilz (rare, gross): pale egg with five red arms curling outwards, dark slimy blotches
  krake(P) {
    P.body.push(put(paint(ball(1, 12, 8), p => mix(0xd9cdb6, 0xf2e8d6, p.y * .5 + .5 + (noise(p.x * 6, p.y * 6, p.z * 6) - .5) * .4)), { s: [.13, .1, .13], y: .06 }));
    const R = rng(33);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + .3, c = Math.cos(a), s = Math.sin(a), len = .9 + R() * .25, curl = R() > .5 ? 1 : -1;
      const L = len * .72, pts = [V(c * .04, .1, s * .04), V(c * .1 * L, .3, s * .1 * L), V(c * .26 * L, .42, s * .26 * L), V(c * .42 * L, .3, s * .42 * L), V(c * .47 * L - s * .05 * curl, .14, s * .47 * L + c * .05 * curl), V(c * .4 * L - s * .11 * curl, .06, s * .4 * L + c * .11 * curl)];
      P.body.push(paint(tube(pts, t => .055 * (1 - t * .8) + .01, 18, 8), (p, n) => {
        const blot = sst(noise(p.x * 17 + i * 5, p.y * 17, p.z * 17), .5, .58), up = sst(n.y, -.2, .5);
        return mix(mix(0xf59a86, 0xdc1f24, up), 0x1a070b, blot * (.55 + up * .45)); // pale pink underside, red top with black slime blotches
      }));
    }
    P.body.push(put(paint(ball(1, 8, 6), 0x3a1418), { s: [.05, .035, .05], y: .15 })); // dark mouth in the middle
  },
  // 9 Glotzschleimling (epic, gross): toxic green slime blob with eyeballs and glowing pustules
  schleim(P) {
    const g = new THREE.IcosahedronGeometry(1, 3), A = g.getAttribute('position'), v = new THREE.Vector3();
    for (let i = 0; i < A.count; i++) { v.fromBufferAttribute(A, i); const n = noise(v.x * 1.7 + 4, v.y * 1.7, v.z * 1.7), b = 1 + (n - .5) * .55, low = v.y < -.2 ? 1 + (-.2 - v.y) * .5 : 1; v.multiplyScalar(b); v.x *= low; v.z *= low; A.setXYZ(i, v.x, Math.max(-.55, v.y), v.z); }
    g.computeVertexNormals();
    P.body.push(put(paint(g, (p, n) => mix(mix(0x2f9e1e, 0x9be83a, sst(p.y, -.5, .9)), 0x135a1a, sst(noise(p.x * 5, p.y * 5, p.z * 5), .55, .75) * .7 + (n.y < -.1 ? .3 : 0))), { s: [.27, .26, .25], y: .14 }));
    P.body.push(put(paint(lathe([[0, 0], [.2, 0], [.33, .008], [.36, 0]], 16), 0x4dbb22), { y: .012, s: [1, 1, .85] })); // puddle
    const eye = (x: number, y: number, z: number, r: number) => {
      const d = V(x, y - .14, z).normalize();
      P.body.push(put(paint(ball(1, 10, 8), 0xfbf8ea), { s: r, x, y, z }));
      P.body.push(put(paint(ball(1, 8, 6), 0xd88a10), { s: r * .58, x: x + d.x * r * .55, y: y + d.y * r * .55, z: z + d.z * r * .55 }));
      P.body.push(put(paint(ball(1, 7, 5), 0x0a0a0a), { s: r * .32, x: x + d.x * r * .88, y: y + d.y * r * .88, z: z + d.z * r * .88 }));
    };
    eye(.1, .37, .16, .085); eye(-.15, .3, .12, .06); eye(.03, .2, .25, .045); eye(-.02, .42, -.08, .05);
    const R = rng(55);
    for (let i = 0; i < 9; i++) { const a = R() * 7, h = .06 + R() * .3, r = .26 * Math.sqrt(Math.max(.1, 1 - ((h - .14) / .3) ** 2)) * (.92 + R() * .1); P.glow.push(put(paint(ball(1, 6, 5), mix(0xf4ff5a, 0xb6ff3a, R())), { s: .02 + R() * .025, x: Math.cos(a) * r, y: h, z: Math.sin(a) * r })); }
  },
  // 10 Sternmorchel (epic): tall golden honeycomb morel, the pits glow pink, little stars hover around it
  stern(P) {
    P.body.push(paint(lathe([[.085, 0], [.1, .04], [.07, .12], [.065, .24]], 10), p => mix(0xe6dcc2, 0xfff6dc, p.y / .24)));
    const g = lathe(fine([[.07, .2], [.14, .24], [.17, .34], [.165, .46], [.125, .6], [.07, .7], [0, .73]], 30), 32), A = g.getAttribute('position');
    const cell = (p: THREE.Vector3) => { const a = Math.atan2(p.z, p.x), row = p.y * 19, u = a * 3 + (Math.floor(row / Math.PI) % 2 ? Math.PI / 2 : 0); return Math.abs(Math.sin(u)) * Math.abs(Math.sin(row)); };
    for (let i = 0; i < A.count; i++) { const p = V(A.getX(i), A.getY(i), A.getZ(i)), k = 1 - sst(cell(p), .25, .7) * .13; A.setX(i, p.x * k); A.setZ(i, p.z * k); } // pits sink in
    g.computeVertexNormals();
    const body = g.clone(), glow = g.clone();
    P.body.push(paint(body, p => mix(0xf2bb24, 0x9a5a08, sst(cell(p), .15, .6))));
    P.glow.push(put(paint(glow, p => mix(0xff3fae, 0xffb3e6, sst(cell(p), .5, 1))), { s: [.9, .985, .9], y: .004 })); // pink core just under the golden ridges ...
    // ... which shows through the pits: the golden skin is opened there
    { const B = P.body[P.body.length - 1], pos = B.getAttribute('position'), col = B.getAttribute('color'), keepP: number[] = [], keepC: number[] = [], keepN: number[] = [], nor = B.getAttribute('normal'), c = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) { c.set((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3); if (cell(c) > .62) continue; for (let j = i; j < i + 3; j++) { keepP.push(pos.getX(j), pos.getY(j), pos.getZ(j)); keepC.push(col.getX(j), col.getY(j), col.getZ(j)); keepN.push(nor.getX(j), nor.getY(j), nor.getZ(j)); } }
      const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(keepC, 3)); P.body[P.body.length - 1] = o; }
    const R = rng(77);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + R(), r = .24 + R() * .1, s = .022 + R() * .018; P.glow.push(put(paint(new THREE.OctahedronGeometry(1, 0), i % 2 ? 0xfff3a8 : 0xff9fe0), { s: [s, s * 1.7, s], x: Math.cos(a) * r, y: .35 + R() * .4, z: Math.sin(a) * r, ry: R() * 3 })); }
  },
};

/** colour of a kind for particles / icons / the stock list */
export const MUSH_HEX: Record<MushId, number> = { champ: 0xf4eedf, stein: 0x8a5326, pfiff: 0xf6b21a, flieg: 0xe2261c, tint: 0x3a3840, lila: 0x8f4fe0, glimm: 0x3fe8e0, krake: 0xd41e22, schleim: 0x7fdc2e, stern: 0xff5fbf };
/** size of the whole model in the game (the parts above are modelled around 0.3-0.7 m tall) */
export const MUSH_SCALE = 1.25;

const GEOS = new Map<MushId, { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }>();
/** the two merged geometries of a kind (built once) */
export function mushGeo(kind: MushId) {
  let g = GEOS.get(kind);
  if (!g) {
    const P: Parts = { body: [], glow: [] }; MAKERS[kind](P);
    const fix = (a: THREE.BufferGeometry[]) => a.map(x => { const y = x.index ? x.toNonIndexed() : x; y.deleteAttribute('uv'); if (!y.getAttribute('normal')) y.computeVertexNormals(); return y; });
    g = { body: mergeGeometries(fix(P.body))!, glow: P.glow.length ? mergeGeometries(fix(P.glow))! : null };
    g.body.scale(MUSH_SCALE, MUSH_SCALE, MUSH_SCALE); g.glow?.scale(MUSH_SCALE, MUSH_SCALE, MUSH_SCALE);
    GEOS.set(kind, g);
  }
  return g;
}
let BODY: THREE.MeshStandardMaterial | null = null, GLOW: THREE.MeshBasicMaterial | null = null;
/** one lit and one unlit material for all kinds (vertex colours) */
export function mushMats() {
  BODY ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: 0, side: THREE.DoubleSide });
  GLOW ??= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return { body: BODY, glow: GLOW };
}
/** a single mushroom as a group (preview page, prewarm) */
export function mushMesh(kind: MushId) {
  const g = new THREE.Group(), G = mushGeo(kind), M = mushMats();
  const b = new THREE.Mesh(G.body, M.body); b.castShadow = true; b.receiveShadow = true; g.add(b);
  if (G.glow) g.add(new THREE.Mesh(G.glow, M.glow));
  return g;
}

const CAP = 32;
interface Slot { id: number; k: number; x: number; z: number; t0: number; rot: number; seen: number }
/** all wild mushrooms of the game: one InstancedMesh per kind and layer (count 0 = no draw call). They pop up with a little bounce,
 *  breathe slowly and sink back into the ground at the end of their life. */
export class ShroomPool {
  private body: THREE.InstancedMesh[] = []; private glow: (THREE.InstancedMesh | null)[] = [];
  private slots = new Map<number, Slot>(); private frameId = 0; private now = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private s = new THREE.Vector3();
  /** rare ones sparkle now and then: (x, y, z, colour) */
  sparkle: (x: number, y: number, z: number, c: number) => void = () => {};
  constructor(scene: THREE.Object3D, private life = 120) {
    const M = mushMats();
    MUSHROOMS.forEach((k, i) => {
      const G = mushGeo(k), b = new THREE.InstancedMesh(G.body, M.body, CAP);
      b.count = 0; b.castShadow = true; b.receiveShadow = true; b.frustumCulled = false; b.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(b); this.body[i] = b;
      if (G.glow) { const g = new THREE.InstancedMesh(G.glow, M.glow, CAP); g.count = 0; g.frustumCulled = false; g.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(g); this.glow[i] = g; } else this.glow[i] = null;
    });
  }
  /** snapshot rows [id, kind, x, z, time it popped up], time of the snapshot */
  sync(rows: number[][] | undefined, t: number) {
    const id = ++this.frameId; this.now = t;
    for (const r of rows ?? []) {
      let v = this.slots.get(r[0]);
      if (!v) { v = { id: r[0], k: r[1], x: r[2], z: r[3], t0: r[4], rot: (r[0] * 2.399) % 6.283, seen: id }; this.slots.set(r[0], v); }
      v.seen = id;
    }
    for (const [k, v] of this.slots) if (v.seen !== id) this.slots.delete(k);
  }
  position(id: number) { const v = this.slots.get(id); return v ? { x: v.x, z: v.z, k: v.k } : null; }
  frame(dt: number) {
    this.now += dt; const n = MUSHROOMS.map(() => 0), w = performance.now() / 1000;
    for (const v of this.slots.values()) {
      const age = Math.max(0, this.now - v.t0), left = this.life - age, a = Math.min(1, age / .55);
      const pop = a < 1 ? 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2) : 1; // ease out back: jumps out of the ground a bit too far, settles
      const out = Math.min(1, Math.max(0, left / 2.5)), sc = Math.max(.001, pop * (out * out * (3 - 2 * out)));
      const br = 1 + Math.sin(w * 1.7 + v.id) * .025;
      this.e.set(0, v.rot, (1 - out) * .5); this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(v.x, 0, v.z), this.q, this.s.set(sc / br, sc * br * (a < 1 ? .6 + .4 * a : 1), sc / br));
      const i = n[v.k]++; if (i >= CAP) continue;
      this.body[v.k].setMatrixAt(i, this.m); this.glow[v.k]?.setMatrixAt(i, this.m);
      if (v.k >= 6 && Math.random() < dt * (v.k >= 8 ? 2.2 : 1.2)) this.sparkle(v.x + (Math.random() - .5) * .5, .3 + Math.random() * .6, v.z + (Math.random() - .5) * .5, MUSH_HEX[MUSHROOMS[v.k]]);
    }
    MUSHROOMS.forEach((_, k) => { const c = Math.min(CAP, n[k]); this.body[k].count = c; if (c) this.body[k].instanceMatrix.needsUpdate = true; const g = this.glow[k]; if (g) { g.count = c; if (c) g.instanceMatrix.needsUpdate = true; } });
  }
  /** one tiny instance of every kind for the next frame (shader prewarm: instancing + vertex colour variants) */
  warm() { this.m.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -.5, 0); for (let k = 0; k < MUSHROOMS.length; k++) { this.body[k].setMatrixAt(0, this.m); this.body[k].count = 1; this.body[k].instanceMatrix.needsUpdate = true; const g = this.glow[k]; if (g) { g.setMatrixAt(0, this.m); g.count = 1; g.instanceMatrix.needsUpdate = true; } } }
  clear() { this.slots.clear(); for (let k = 0; k < MUSHROOMS.length; k++) { this.body[k].count = 0; const g = this.glow[k]; if (g) g.count = 0; } }
}
