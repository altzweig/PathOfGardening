// Player figure (21.11.2026): an animal on two legs (raccoon, red panda, fox, dog, cat) in bib overalls.
// The body is ONE skinned subdivision surface: a quad cage modelled in code (torso rings, legs extruded from the
// hips, arms from the shoulders, neck + head + snout + ears + tail extruded like in a modelling package), two
// Catmull-Clark steps, smooth skin weights authored per edge loop. Trousers + bib are part of that surface (hems
// and the bib are extruded with creased edges), straps are ribbons glued onto the surface with the weights of the
// skin under them, so nothing can clip through the body. Eyes, nose, whiskers and accessories ride on bones.
// The joints keep the names and conventions of the older human rig (pelvis, torso, head, 2-bone arms + legs),
// so every animation of the game (farmView.animPlayer, start menu) drives the animals unchanged; feet, spine,
// tail and ears are layered on top (foot roll, spine bend, tail + ear follow-through, blinking).
import * as THREE from 'three';
import type { Look } from '../look';
import { Cage, toGeometry, type Vec } from './subdiv';
import { SPECIES, EYE_COLS, OVERALLS, HAT_COLS, GLASS_COLS, METALS, type FurIn, type Part, type Species, sst, vn } from './critters';

export { SPECIES, EYE_COLS, OVERALLS, HAT_COLS, GLASS_COLS, METALS };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------------- skeleton layout ----------------
const BI = { pelvis: 0, spine: 1, torso: 2, head: 3, shL: 4, elL: 5, shR: 6, elR: 7, hipL: 8, kneeL: 9, hipR: 10, kneeR: 11, t0: 12, t1: 13, t2: 14, t3: 15, earL: 16, earR: 17, footL: 18, footR: 19 } as const;
const NB = 20;
const X = { tail: 0, ear: 1, earIn: 2, limb: 3, snout: 4 } as const;
const NX = 5;
const TAG = { body: 0, cloth: 1, head: 2, snout: 3, ear: 4, arm: 5, hand: 6, leg: 7, foot: 8, tail: 9, bib: 10 } as const;
const PART: Part[] = ['body', 'body', 'head', 'snout', 'ear', 'arm', 'hand', 'leg', 'foot', 'tail', 'body'];
const isCloth = (t: number) => t === TAG.cloth || t === TAG.bib;

// proportions shared by all animals (the animations of the game are tuned to them)
const TH = .24, SI = .22, LEG_LEN = TH + SI + .06, TORSO = .42, UA = .21, FA = .18;
const PELVIS_Y = LEG_LEN, SHOULDER: Vec = [.172, .885, -.005], ARM_OUT = .72; // A-pose of the bind
const HEAD_PIVOT: Vec = [0, .975, .01], HEAD_C = V3(0, 1.15, 0), HS_PAT = 1.42;
const ANKLE_Y = .072;

// ---------------- rig types (same shape as the old human rig) ----------------
export interface Arm { sh: THREE.Object3D; el: THREE.Object3D; side: number; qs: THREE.Quaternion; qe: THREE.Quaternion }
export interface Leg { hip: THREE.Object3D; knee: THREE.Object3D; foot: THREE.Object3D }
/** th = thigh, sh = shin down to the sole, legLen = hip height standing */
export interface Rig {
  root: THREE.Group; pelvis: THREE.Object3D; torso: THREE.Object3D; head: THREE.Object3D; arms: [Arm, Arm]; legs: [Leg, Leg];
  ua: number; fa: number; walk: number; t: number; th: number; sh: number; legLen: number;
  spine: THREE.Object3D; tail: THREE.Object3D[]; ears: THREE.Object3D[]; eyes: THREE.Object3D[];
  /** secondary motion state */
  sec: { tail: number[]; tailV: number[]; ear: number[]; earV: number[]; blink: number; nextBlink: number; twitch: number[]; nextTwitch: number; low: number; prevYaw: number; yawV: number; kneel: number };
  species: number; flop: boolean;
}

// ---------------- textures (canvas, cached) ----------------
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  let t = texCache.get(key); if (t) return t;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t); return t;
}
function noise(c: CanvasRenderingContext2D, w: number, h: number, f: (x: number, y: number) => number) {
  const d = c.getImageData(0, 0, w, h), p = d.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, n = f(x, y); p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  c.putImageData(d, 0, 0);
}
/** neutral denim twill (multiplied with the overalls colour) */
const denimTex = () => canvasTex('pDenim', 128, 128, c => {
  c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, 128, 128);
  noise(c, 128, 128, (x, y) => (Math.random() - .5) * 26 + ((x + y * 2) % 6 < 3 ? 12 : -10) + (Math.random() < .02 ? 30 : 0));
}, false);
/** fur strands: soft streaks along one axis, multiplied with the vertex colours */
const furTex = () => canvasTex('pFur', 128, 128, c => {
  c.fillStyle = '#e0e0e0'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, l = 4 + Math.random() * 10, b = Math.random() < .5 ? 255 : 150;
    c.strokeStyle = `rgba(${b},${b},${b},${.12 + Math.random() * .2})`; c.lineWidth = .8 + Math.random();
    for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(x + dx + (Math.random() - .5) * 2, y + dy + l); c.stroke(); }
  }
}, false);
const strawTex = () => canvasTex('pStraw', 128, 128, c => {
  c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 8) { const o = (y / 4) % 2 ? 4 : 0, b = 180 + Math.random() * 75; c.fillStyle = `rgb(${b},${b},${b})`; c.fillRect((x + o) % 128, y, 7, 3); }
  noise(c, 128, 128, () => (Math.random() - .5) * 20);
}, false);
const knitTex = () => canvasTex('pKnit', 64, 64, c => {
  c.fillStyle = '#bcbcbc'; c.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 6) for (let x = 0; x < 64; x += 6) {
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + 1.5, y + 3, 1.6, 3, -.5, 0, 7); c.fill(); c.beginPath(); c.ellipse(x + 4.5, y + 3, 1.6, 3, .5, 0, 7); c.fill();
  }
}, false);
function eyeTex(iris: number, slit: boolean) {
  return canvasTex('pEye' + iris + slit, 128, 128, c => {
    c.fillStyle = '#f4efe6'; c.fillRect(0, 0, 128, 128);
    const col = new THREE.Color(iris), cx = 64, cy = 64, r = 50;
    const g = c.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(0, '#' + col.clone().multiplyScalar(1.25).getHexString()); g.addColorStop(.7, '#' + col.getHexString()); g.addColorStop(1, '#' + col.clone().multiplyScalar(.35).getHexString());
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
    c.strokeStyle = '#' + col.clone().multiplyScalar(.25).getHexString(); c.lineWidth = 3; c.stroke();
    for (let i = 0; i < 40; i++) { const a = i / 40 * 7; c.strokeStyle = `rgba(255,255,255,${.06 + Math.random() * .08})`; c.lineWidth = 1; c.beginPath(); c.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); c.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); c.stroke(); }
    c.fillStyle = '#070505'; c.beginPath();
    if (slit) c.ellipse(cx, cy, 9, 36, 0, 0, 7); else c.arc(cx, cy, 27, 0, 7);
    c.fill(); c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.ellipse(cx - 16, cy + 17, 9, 8, 0, 0, 7); c.fill(); c.beginPath(); c.arc(cx + 14, cy - 14, 3.5, 0, 7);
    c.fill();
  });
}

/** triplanar detail texture in object (bind) space: stays glued to the skin while it deforms, no UVs needed */
function triplanar(m: THREE.Material, tex: THREE.Texture, scale: number, amt: number) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uTri = { value: tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriP = position; vTriN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uTri; varying vec3 vTriP; varying vec3 vTriN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 w = pow(abs(normalize(vTriN)), vec3(4.)); w /= w.x + w.y + w.z; vec3 q = vTriP * ${scale.toFixed(2)};
          float t = texture2D(uTri, q.zy).r * w.x + texture2D(uTri, q.xz).r * w.y + texture2D(uTri, q.xy).r * w.z;
          diffuseColor.rgb *= mix(1., t * 1.15, ${amt.toFixed(2)}); }`);
  };
  m.customProgramCacheKey = () => 'tri' + scale + amt + tex.uuid;
}

// ---------------- the cage ----------------
interface Anchors {
  eyes: THREE.Vector3[]; eyeN: THREE.Vector3[]; nose: THREE.Vector3; noseN: THREE.Vector3;
  earBase: THREE.Vector3[]; earTip: THREE.Vector3[]; earUp: THREE.Vector3[]; earFront: THREE.Vector3[]; earOuter: THREE.Vector3[];
  headTop: number; headC: THREE.Vector3; hk: number; tailBones: THREE.Vector3[]; crown: { y: number; rx: number; rz: number; cz: number };
  bibCorners: THREE.Vector3[];
}
interface Built { cage: Cage; a: Anchors }
const cageCache = new Map<number, Built>();

/** ring of 12 vertices (angles 15° + k·30° from +z towards +x), 4x4-grid compatible for caps */
const RING = 12, ang = (k: number) => (15 + k * 30) * Math.PI / 180;

export function buildCage(si: number): Built {
  const hit = cageCache.get(si); if (hit) return hit;
  const S = SPECIES[si], c = new Cage(NB, NX);
  const ring = (y: number, rx: number, rz: number, cz: number, w: Record<number, number>, shape?: (a: number) => number) => {
    const out: number[] = [];
    for (let k = 0; k < RING; k++) { const a = ang(k), f = shape ? shape(a) : 1; out.push(c.v([rx * f * Math.sin(a), y, cz + rz * f * Math.cos(a)], w)); }
    return out;
  };
  const faceAt: number[][] = [];
  const loft = (A: number[], B: number[], tag: number | ((k: number) => number)) => {
    const row: number[] = [];
    for (let k = 0; k < RING; k++) row.push(c.f([A[k], A[(k + 1) % RING], B[(k + 1) % RING], B[k]], typeof tag === 'number' ? tag : tag(k)));
    faceAt.push(row); return row;
  };
  const creaseRing = (R: number[], s: number) => { for (let k = 0; k < RING; k++) c.creaseEdge(R[k], R[(k + 1) % RING], s); };
  const creaseLoop = (L: number[], s: number) => { for (let k = 0; k < L.length; k++) c.creaseEdge(L[k], L[(k + 1) % L.length], s); };
  /** 4x4 grid cap over a 12-ring; returns quads[i][j] (i: x+ .. x-, j: front .. back) */
  const cap = (R: number[], y: number, rx: number, rz: number, cz: number, w: Record<number, number>, up: boolean) => {
    const g: number[][] = [[], [], [], []];
    const side = [[1, 2, 3, 4]], back = [4, 5, 6, 7], right = [10, 9, 8, 7], front = [1, 0, 11, 10];
    for (let j = 0; j < 4; j++) { g[0][j] = R[side[0][j]]; g[3][j] = R[right[j]]; }
    for (let i = 0; i < 4; i++) { g[i][0] = R[front[i]]; g[i][3] = R[back[i]]; }
    for (const i of [1, 2]) for (const j of [1, 2]) g[i][j] = c.v([(i === 1 ? 1 : -1) * rx * .36, y, cz + (j === 1 ? 1 : -1) * rz * .36], w);
    const q: number[][] = [[], [], []];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const v = [g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]];
      q[i][j] = c.f(up ? v.slice().reverse() : v, TAG.body);
    }
    return q;
  };
  /** move an extruded region onto a new section: loop on an ellipse, inner vertices scaled along + domed */
  const section = (all: number[], loop: number[], ctr: Vec, n: Vec, u: Vec, ru: number, rv: number, dome = 0, shape?: (a: number) => number) => {
    const N = V3(...n).normalize(), U = V3(...u); U.addScaledVector(N, -U.dot(N)).normalize(); const Vv = V3().crossVectors(N, U);
    const C0 = V3(); for (const i of loop) C0.add(c.pos(i)); C0.divideScalar(loop.length);
    let r0u = 0, r0v = 0; for (const i of loop) { const d = c.pos(i).sub(C0); r0u = Math.max(r0u, Math.abs(d.dot(U))); r0v = Math.max(r0v, Math.abs(d.dot(Vv))); }
    const L = new Set(loop), inner = all.filter(i => !L.has(i)).map(i => { const d = c.pos(i).sub(C0); return [i, d.dot(U) / (r0u || 1), d.dot(Vv) / (r0v || 1)]; });
    c.place(loop, ctr, n, u, ru, rv, shape);
    const C = V3(...ctr);
    for (const [i, du, dv] of inner) c.set(i, C.clone().addScaledVector(U, du * ru).addScaledVector(Vv, dv * rv).addScaledVector(N, dome * (1 - Math.hypot(du, dv) * .7)));
  };
  const W = (i: number, w: Record<number, number>, x?: Record<number, number>) => { c.setW(i, w); if (x) for (const k in x) c.setX(i, +k, x[k]); };
  const Bv = S.body.belly;

  // ---- torso: hips (trousers), waistband with a lip, belly + chest (fur), shoulders ----
  const P = BI.pelvis, SP = BI.spine, T = BI.torso;
  const belly = (a: number) => 1 + (Bv - 1) * Math.max(0, Math.cos(a));
  const R: number[][] = [
    ring(.455, 0.145, 0.110, 0, { [P]: 1 }),
    ring(.55, 0.166, 0.126, 0, { [P]: 1 }),
    ring(.632, 0.161, 0.131, .008, { [P]: .75, [SP]: .25 }, belly),
    ring(.646, 0.161, 0.131, .008, { [P]: .7, [SP]: .3 }, belly),
    ring(.646, 0.147, 0.119, .008, { [P]: .7, [SP]: .3 }, belly),
    ring(.74, 0.160, 0.126, .016, { [P]: .15, [SP]: .55, [T]: .3 }, belly),
    ring(.835, 0.177, 0.112, .002, { [T]: 1 }),
    ring(.91, 0.165, 0.100, -.004, { [T]: 1 }),
  ];
  for (let i = 0; i < R.length - 1; i++) loft(R[i], R[i + 1], i < 4 ? TAG.cloth : TAG.body);
  creaseRing(R[3], 2); creaseRing(R[4], 2);
  const bottom = cap(R[0], .438, .145, .11, 0, { [P]: 1 }, false);
  const top = cap(R[R.length - 1], .935, .165, .1, -.004, { [T]: 1 }, true);
  for (const row of bottom) for (const f of row) c.F[f].tag = TAG.cloth;

  // ---- legs (extruded from the front two quads of the left / right column of the bottom cap) ----
  for (const sd of [1, -1]) {
    const col = sd > 0 ? 0 : 2, region = [bottom[col][0], bottom[col][1]];
    const H = sd > 0 ? BI.hipL : BI.hipR, K = sd > 0 ? BI.kneeL : BI.kneeR, Fo = sd > 0 ? BI.footL : BI.footR, x0 = sd * .075;
    const step = (y: number, rz: number, rx: number, cz: number, w: Record<number, number>, tag: number, limb: number, crease = 0) => {
      const { loop, all } = c.extrude(region, tag);
      section(all, loop, [x0, y, cz], [0, -1, 0], [0, 0, 1], rz, rx);
      for (const i of all) W(i, w, { [X.limb]: limb });
      if (crease) creaseLoop(loop, crease);
      return loop;
    };
    step(.40, .09, .086, 0, { [P]: .2, [H]: .8 }, TAG.cloth, .1);
    step(.282, .074, .072, .004, { [H]: .5, [K]: .5 }, TAG.cloth, .5);
    step(.112, .071, .069, 0, { [K]: 1 }, TAG.cloth, .85, 2);
    step(.1, .071, .069, 0, { [K]: 1 }, TAG.cloth, .88, 2);
    step(.1, .05, .048, .002, { [K]: .8, [Fo]: .2 }, TAG.leg, .88, 2);
    step(.042, .088, .058, .036, { [Fo]: 1 }, TAG.foot, .95);
    step(.0, .096, .06, .044, { [Fo]: 1 }, TAG.foot, 1, 1);
  }

  // ---- bib: front panel of the chest extruded outwards (creased rim) ----
  const bibFaces: number[] = [];
  for (const row of [4, 5]) for (const k of [10, 11, 0]) bibFaces.push(faceAt[row][k]);
  {
    const base = c.loop(bibFaces);
    const { loop, all } = c.extrude(bibFaces, TAG.bib);
    for (const f of bibFaces) c.F[f].tag = TAG.bib;
    for (const i of all) { const p = c.pos(i), n = V3(p.x, 0, p.z - .01).normalize(); c.set(i, p.addScaledVector(n, .012)); }
    creaseLoop(loop, 2); creaseLoop(base, 1);
  }
  const bibCorners = [V3(.093, .835, .09), V3(-.093, .835, .09)];

  // ---- arms (extruded from the side of the chest, A-pose) ----
  for (const sd of [1, -1]) {
    const k = sd > 0 ? 2 : 8, region = [faceAt[6][k]];
    const SH = sd > 0 ? BI.shL : BI.shR, EL = sd > 0 ? BI.elL : BI.elR;
    const dir = V3(sd * Math.sin(ARM_OUT), -Math.cos(ARM_OUT), 0), Sp = V3(sd * SHOULDER[0], SHOULDER[1], SHOULDER[2]);
    const step = (d: number, rf: number, rs: number, w: Record<number, number>, tag: number) => {
      const { loop, all } = c.extrude(region, tag), ctr = Sp.clone().addScaledVector(dir, d);
      section(all, loop, [ctr.x, ctr.y, ctr.z], [dir.x, dir.y, dir.z], [0, 0, 1], rf, rs);
      for (const i of all) W(i, w, { [X.limb]: clamp(d / .5, 0, 1) });
      return loop;
    };
    step(.02, .074, .072, { [T]: .45, [SH]: .55 }, TAG.arm);
    step(.11, .066, .064, { [SH]: 1 }, TAG.arm);
    step(.212, .056, .055, { [SH]: .45, [EL]: .55 }, TAG.arm);
    step(.3, .054, .052, { [EL]: 1 }, TAG.arm);
    step(.372, .044, .042, { [EL]: 1 }, TAG.arm);
    const palm = step(.43, .066, .043, { [EL]: 1 }, TAG.hand);
    step(.5, .056, .034, { [EL]: 1 }, TAG.hand);
    // thumb: from the forward face of the palm segment
    let best = -1, bz = -1e9;
    c.F.forEach((F, fi) => { if (F.tag !== TAG.hand || !F.v.some(v => palm.includes(v))) return; const z = F.v.reduce((s, v) => s + c.A[v][2], 0) / 4 - Math.abs(F.v.reduce((s, v) => s + c.A[v][1], 0) / 4 - (Sp.y + dir.y * .5)) * 0; if (z > bz && F.v.filter(v => palm.includes(v)).length === 2) { bz = z; best = fi; } });
    if (best >= 0) {
      const base = V3(); for (const v of c.F[best].v) base.add(c.pos(v)); base.divideScalar(4);
      const td = V3(0, -.2, 1).addScaledVector(dir, .7).normalize();
      for (const [len, r] of [[.022, .016], [.042, .011]] as [number, number][]) {
        const { loop, all } = c.extrude([best], TAG.hand), ctr = base.clone().addScaledVector(td, len);
        section(all, loop, [ctr.x, ctr.y, ctr.z], [td.x, td.y, td.z], [dir.x, dir.y, dir.z], r, r * .9);
        for (const i of all) W(i, { [EL]: 1 }, { [X.limb]: 1 });
      }
    }
  }

  // ---- neck + head (extruded from the shoulder cap) ----
  const H = BI.head, hd = S.head;
  const topRegion = top.flat();
  const headStep = (y: number, rz: number, rx: number, cz: number, w: Record<number, number>, tag: number, dome = 0, shape?: (a: number) => number) => {
    const { loop, all } = c.extrude(topRegion, tag);
    section(all, loop, [0, y, cz], [0, 1, 0], [0, 0, 1], rz, rx, dome, shape);
    for (const i of all) W(i, w);
    return loop;
  };
  const cheek = (k: number) => (a: number) => 1 + (hd.cheek - 1) * k * Math.pow(Math.abs(Math.sin(a)), 2) * (Math.cos(a) > -.3 ? 1 : .6);
  const HK = hd.ry * 1.3, hy = (y: number) => 1.0 + (y - 1.0) * HK;
  const HS = 1.42; // head size (stylised: big heads)
  headStep(.955, .074, .08, .004, { [T]: .5, [H]: .5 }, TAG.body);
  const H1 = headStep(hy(1.03), .118 * hd.rz * HS, .136 * hd.rx * HS, .016, { [T]: .06, [H]: .94 }, TAG.head, 0, cheek(1));
  const H2 = headStep(hy(1.11), .132 * hd.rz * HS, .155 * hd.rx * HS, .004, { [H]: 1 }, TAG.head, 0, cheek(.75));
  const H3 = headStep(hy(1.19), .128 * hd.rz * HS, .148 * hd.rx * HS, -.006, { [H]: 1 }, TAG.head, 0, cheek(.2));
  headStep(hy(1.262), .102 * hd.rz * HS, .116 * hd.rx * HS, -.016, { [H]: 1 }, TAG.head, .045);
  for (const f of topRegion) c.F[f].tag = TAG.head;
  const crown = { y: hy(1.262) + .045, rx: .116 * hd.rx * HS, rz: .102 * hd.rz * HS, cz: -.016 };

  // ---- snout: the front face of the two face rows, extruded forward ----
  const sn = S.snout;
  const findFace = (a: number, b: number, cc: number, d: number) => c.F.findIndex(F => F.v.length === 4 && [a, b, cc, d].every(v => F.v.includes(v)));
  const sf = [findFace(H1[11], H1[0], H2[0], H2[11]), findFace(H2[11], H2[0], H3[0], H3[11])].filter(i => i >= 0);
  let zf = 0; for (const v of [H2[11], H2[0]]) zf += c.A[v][2] / 2;
  const sy = hy(1.095);
  let tipC = V3();
  for (const [t, kw, kh, xs] of [[.45, 1.1, 1.08, .35], [.86, .82, .8, .75], [1, .42, .4, 1]] as [number, number, number, number][]) {
    const { loop, all } = c.extrude(sf, TAG.snout), ctr = V3(0, sy - .008 - sn.drop * t, zf + sn.len * t);
    const flatBottom = (a: number) => Math.sin(a) < 0 ? 1 - .2 * Math.pow(-Math.sin(a), 2) : 1;
    section(all, loop, [ctr.x, ctr.y, ctr.z], [0, -.1 - sn.drop * 2, 1], [1, 0, 0], sn.w * kw * HS, sn.h * kh * HS, 0, flatBottom);
    for (const i of all) W(i, { [H]: 1 }, { [X.snout]: xs });
    tipC = ctr;
  }
  for (const f of sf) for (const v of c.F[f].v) c.setX(v, X.snout, 1);

  // ---- ears: from the middle quad of the left / right column of the head top cap ----
  const E = S.ear, earBase: THREE.Vector3[] = [], earTip: THREE.Vector3[] = [], earUp: THREE.Vector3[] = [], earFront: THREE.Vector3[] = [], earOuter: THREE.Vector3[] = [];
  const EL2 = E.len * HS, EW = E.w * HS;
  for (const sd of [1, -1]) {
    const q = top[sd > 0 ? 0 : 2][1], EB = sd > 0 ? BI.earL : BI.earR;
    const B0 = V3(); for (const v of c.F[q].v) B0.add(c.pos(v)); B0.divideScalar(4);
    const base = B0.clone().add(V3(sd * .004, -.01, .004));
    const up = V3(sd * Math.sin(E.out), Math.cos(E.out), -Math.sin(E.back)).normalize();
    const front = V3(0, 0, 1).addScaledVector(up, -up.z).normalize();
    const ctrl = E.flop ? base.clone().add(V3(sd * .1, .035, .012)) : base.clone().addScaledVector(up, EL2 * .5);
    const tip = E.flop ? base.clone().add(V3(sd * .125, -EL2 * .7, .03)) : base.clone().addScaledVector(up, EL2);
    const curve = new THREE.QuadraticBezierCurve3(base, ctrl, tip);
    for (const t of [.12, .45, .78, .97]) {
      const { loop, all } = c.extrude([q], TAG.ear), p = curve.getPoint(t), tg = curve.getTangent(t);
      const prof = E.round * Math.sqrt(Math.max(0, 1 - t * t)) + (1 - E.round) * (1 - t * .95);
      const wid = EW * (t < .15 ? 1.05 : prof) * (E.flop ? 1 + .25 * Math.sin(Math.PI * t) : 1), th = Math.max(.007, E.flop ? E.th * (1.3 - t * .5) : wid * (t < .15 ? .75 : .5 - t * .2));
      const u = E.flop ? V3(0, 0, 1) : V3().crossVectors(tg, front).normalize();
      section(all, loop, [p.x, p.y, p.z], [tg.x, tg.y, tg.z], [u.x, u.y, u.z], Math.max(.004, wid), th);
      const fr = E.flop ? V3(sd, 0, 0) : front;
      for (const i of all) { const d = c.pos(i).sub(p).dot(fr); W(i, t < .15 ? { [H]: .3, [EB]: .7 } : { [EB]: 1 }, { [X.ear]: t, [X.earIn]: d > 0 ? 1 : 0 }); }
    }
    for (const v of c.F[q].v) c.setX(v, X.ear, 1);
    earBase.push(base); earTip.push(tip); earUp.push(up); earFront.push(front);
    earOuter.push(curve.getPoint(.4).add(E.flop ? V3(0, 0, -EW * .75) : V3().crossVectors(up, front).normalize().multiplyScalar(-sd * EW * .8)));
  }

  // ---- tail: from the back face between the hips ----
  const tl = S.tail, tc = new THREE.CatmullRomCurve3(tl.pts.map(p => V3(...p)));
  const tailRegion = [faceAt[0][5]], tb = [0, .3, .58, .82];
  const tBones = [BI.t0, BI.t1, BI.t2, BI.t3];
  const tailW = (t: number) => {
    const w: Record<number, number> = {}, bl = .07;
    if (t < .06) { w[P] = 1 - t / .06; w[BI.t0] = t / .06; return w; }
    let i = 0; while (i < 3 && t >= tb[i + 1]) i++;
    w[tBones[i]] = 1;
    if (i > 0 && t - tb[i] < bl) { const f = (t - tb[i] + bl) / (2 * bl); w[tBones[i]] = f; w[tBones[i - 1]] = 1 - f; }
    else if (i < 3 && tb[i + 1] - t < bl) { const f = (t - tb[i + 1] + bl) / (2 * bl); w[tBones[i + 1]] = f; w[tBones[i]] = 1 - f; }
    return w;
  };
  const rAt = (t: number) => { const f = t * (tl.r.length - 1), i = Math.min(tl.r.length - 2, Math.floor(f)); return tl.r[i] + (tl.r[i + 1] - tl.r[i]) * (f - i); };
  for (const t of [.06, .28, .52, .76, .92, 1]) {
    const { loop, all } = c.extrude(tailRegion, TAG.tail), p = tc.getPointAt(t), tg = tc.getTangentAt(t);
    const r = (t < 1 ? rAt(t) : rAt(1) * .4) * 1.15;
    section(all, loop, [p.x, p.y, p.z], [tg.x, tg.y, tg.z], [1, 0, 0], r, r);
    for (const i of all) W(i, tailW(t), { [X.tail]: t });
  }
  for (const v of c.verts(tailRegion)) c.setX(v, X.tail, 1);
  const tailBones = tb.map(t => tc.getPointAt(t));

  const bad = c.check(); if (bad) console.warn('player cage: ' + bad + ' bad edges');
  const fine = c.subdivide().subdivide();

  // ---- anchors on the smooth surface (eyes, nose) ----
  const ray = (o: THREE.Vector3, d: THREE.Vector3, tags: number[]) => {
    let best = 1e9, n = V3(); const a = V3(), b = V3(), cc = V3(), e1 = V3(), e2 = V3(), pv = V3(), tv = V3(), qv = V3();
    for (const F of fine.F) {
      if (!tags.includes(F.tag)) continue;
      const v = F.v;
      for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) {
        a.fromArray(fine.A[v[i0]]); b.fromArray(fine.A[v[i1]]); cc.fromArray(fine.A[v[i2]]);
        e1.subVectors(b, a); e2.subVectors(cc, a); pv.crossVectors(d, e2); const det = e1.dot(pv); if (Math.abs(det) < 1e-9) continue;
        const inv = 1 / det; tv.subVectors(o, a); const u = tv.dot(pv) * inv; if (u < 0 || u > 1) continue;
        qv.crossVectors(tv, e1); const w = d.dot(qv) * inv; if (w < 0 || u + w > 1) continue;
        const t = e2.dot(qv) * inv; if (t > 0 && t < best) { best = t; n = V3().crossVectors(e1, e2).normalize(); }
      }
    }
    return best < 1e9 ? { p: o.clone().addScaledVector(d, best), n } : null;
  };
  const eyes: THREE.Vector3[] = [], eyeN: THREE.Vector3[] = [];
  for (const sd of [1, -1]) {
    const o = V3(0, hy(S.eye.y), -.02), d = V3(sd * Math.sin(S.eye.az), 0, Math.cos(S.eye.az)).normalize();
    const h = ray(o, d, [TAG.head, TAG.snout]);
    eyes.push(h ? h.p : o.clone().addScaledVector(d, .14)); eyeN.push(h ? h.n.clone().lerp(d, .5).normalize() : d);
  }
  const nh = ray(V3(0, tipC.y + .004, tipC.z - .1), V3(0, 0, 1), [TAG.snout]);
  const a: Anchors = {
    eyes, eyeN, nose: nh ? nh.p : tipC.clone(), noseN: nh ? nh.n : V3(0, 0, 1),
    earBase, earTip, earUp, earFront, earOuter, headTop: crown.y, headC: V3(0, hy(1.14), 0), hk: HK, tailBones, crown, bibCorners,
  };
  const out = { cage: fine, a }; cageCache.set(si, out); return out;
}

// ---------------- sculpt pass: sockets, fur tufts, toes ----------------
function sculptFn(S: Species, a: Anchors) {
  const tmp = V3(), tmp2 = V3();
  return (p: THREE.Vector3, x: number[], tag: number, n: THREE.Vector3) => {
    if (tag === TAG.head || tag === TAG.snout) {
      // eye sockets: a bowl under the eye ball, a soft lid rim around it
      for (let i = 0; i < 2; i++) {
        const E = a.eyes[i], N = a.eyeN[i], r = S.eye.r;
        tmp.subVectors(p, E); const along = tmp.dot(N), lat = Math.sqrt(Math.max(0, tmp.lengthSq() - along * along));
        if (along > -r * 1.2 && lat < r * 1.9) {
          const k = lat / (r * 1.05);
          if (k < 1) p.addScaledVector(n, -r * .8 * (1 - k * k));
          else p.addScaledVector(n, r * .14 * Math.sin(Math.PI * clamp((lat - r * 1.12) / (r * .75), 0, 1)));
        }
      }
      const q = tmp.subVectors(p, a.headC).divideScalar(a.hk);
      // cheek ruff: tufts pointing out + down below the ears
      if (tag === TAG.head && S.head.fluff > 0) {
        const side = Math.abs(q.x), k = sst(side, .1, .14) * sst(.03, q.y, -.01) * sst(q.y, -.08, -.045) * sst(q.z, -.06, .0) * sst(.08, q.z, .03);
        if (k > 0) { const th = Math.atan2(q.y, side) * 9 + q.z * 40, sp = Math.pow(Math.abs(Math.sin(th)), 3); p.addScaledVector(n, k * S.head.fluff * (.004 + .008 * sp)); p.y -= k * S.head.fluff * .004 * sp; }
        // crown tuft
        const kt = sst(q.y, .12, .16) * sst(q.z, -.02, .05) * S.head.tuft;
        if (kt > 0) p.addScaledVector(n, kt * .012 * Math.pow(Math.abs(Math.sin(q.x * 110)), 2));
      }
      // whisker pads either side of the nose, a soft brow ridge over the eyes
      if (tag === TAG.snout) {
        const nq = tmp2.subVectors(p, a.nose);
        for (const sd of [1, -1]) { const d2 = ((nq.x - sd * S.snout.w * .55) / (S.snout.w * .6)) ** 2 + ((nq.y + S.snout.h * .55) / (S.snout.h * .55)) ** 2 + ((nq.z + .02) / .035) ** 2; p.addScaledVector(n, .006 * Math.exp(-d2 * 2)); }
      }
      for (let i = 0; i < 2; i++) { const d = tmp2.subVectors(p, a.eyes[i]); const k = Math.exp(-(((d.y - S.eye.r * 1.35) / (S.eye.r * .5)) ** 2) - ((d.x / (S.eye.r * 1.6)) ** 2)) * sst(d.z, -.03, .0); p.addScaledVector(n, .005 * k); }
      // mouth: a soft groove under the snout from the tip back to the corners
      if (tag === TAG.snout || (tag === TAG.head && q.z > .08)) {
        const sx = x[X.snout], my = a.nose.y - S.snout.h * .95 - S.snout.nose * .2;
        const g = Math.exp(-(((p.y - my - Math.abs(p.x) * .15) / .006) ** 2)) * sst(sx, .15, .5) * sst(.98, sx, .9) * sst(n.y, .2, -.3);
        p.addScaledVector(n, -.004 * g);
      }
    } else if (tag === TAG.ear) {
      // hollow inside of the ear
      const t = x[X.ear], inn = x[X.earIn];
      if (inn > .5 && !S.ear.flop) p.addScaledVector(n, -S.ear.w * .14 * sst(inn, .5, 1) * Math.sin(Math.PI * clamp((t - .1) / .78, 0, 1)));
    } else if (tag === TAG.tail) {
      const t = x[X.tail], f = S.tail.fluff;
      const nz = vn(p.x * 40, p.y * 40, p.z * 40) - .5, ridge = Math.pow(Math.abs(Math.sin(Math.atan2(n.y, n.x) * 5 + t * 20)), 3);
      p.addScaledVector(n, f * .1 * (nz * .6 + ridge * .4) * sst(t, .05, .25));
      if (S.id === 'fox' || S.id === 'raccoon' || S.id === 'redpanda') { const tipK = sst(t, .93, 1); p.addScaledVector(n, -tipK * .01); }
    } else if (tag === TAG.foot) {
      // three toe bumps at the front of the paw
      const loc = p.z - .06 * (1);
      if (loc > 0 && p.y > .004) for (const o of [-.026, 0, .026]) { const cx = Math.sign(p.x) * .075 + o; p.addScaledVector(n, .006 * Math.exp(-(((p.x - cx) / .011) ** 2)) * sst(loc, 0, .03)); }
    } else if (tag === TAG.body) {
      // chest fluff peeking over the bib
      const k = sst(p.y, .84, .9) * sst(.96, p.y, .93) * sst(n.z, .3, .7) * S.body.chest;
      if (k > 0) p.addScaledVector(n, k * (.004 + .01 * Math.pow(Math.abs(Math.sin(p.x * 120)), 3)));
    } else if (tag === TAG.hand) {
      // finger grooves at the tip of the paw
      const t = x[X.limb]; if (t > .9) p.addScaledVector(n, -.003 * Math.pow(Math.abs(Math.cos(p.z * 150)), 6));
    }
  };
}

// ---------------- materials ----------------
function furMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .86 });
  triplanar(m, furTex(), 9, .55); return m;
}
function clothMat(col: number) {
  const m = new THREE.MeshStandardMaterial({ color: col, vertexColors: true, roughness: .93 });
  triplanar(m, denimTex(), 7, .6); return m;
}
const mat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });

// ---------------- build ----------------
/** build the figure; returns the root group (feet on y = 0, facing +z) and its rig */
export function buildFarmer(L: Look): Rig {
  const si = clamp(L.animal | 0, 0, SPECIES.length - 1), S = SPECIES[si], Vr = S.variants[clamp(L.fur | 0, 0, 4)];
  const { cage, a } = buildCage(si);
  const root = new THREE.Group();

  // --- bones (bind pose = A-pose) ---
  const bones: THREE.Bone[] = [];
  const mk = (i: number, parent: THREE.Object3D, world: THREE.Vector3, parentWorld: THREE.Vector3) => { const b = new THREE.Bone(); b.position.copy(world).sub(parentWorld); parent.add(b); bones[i] = b; return b; };
  const O = V3(), pelvisW = V3(0, PELVIS_Y, 0);
  const pelvis = mk(BI.pelvis, root, pelvisW, O);
  const spine = mk(BI.spine, pelvis, pelvisW, pelvisW);
  const torso = mk(BI.torso, pelvis, pelvisW, pelvisW);
  const headW = V3(...HEAD_PIVOT), head = mk(BI.head, torso, headW, pelvisW);
  const arms: Arm[] = [];
  for (const sd of [1, -1]) {
    const SW = V3(sd * SHOULDER[0], SHOULDER[1], SHOULDER[2]);
    const sh = mk(sd > 0 ? BI.shL : BI.shR, torso, SW, pelvisW);
    const el = new THREE.Bone(); el.position.set(0, -UA, 0); sh.add(el); bones[sd > 0 ? BI.elL : BI.elR] = el;
    sh.quaternion.setFromEuler(new THREE.Euler(0, 0, sd * ARM_OUT));
    arms.push({ sh, el, side: sd, qs: new THREE.Quaternion(), qe: new THREE.Quaternion() });
  }
  const legs: Leg[] = [];
  for (const sd of [1, -1]) {
    const hipW = V3(sd * .075, PELVIS_Y, 0), hip = mk(sd > 0 ? BI.hipL : BI.hipR, pelvis, hipW, pelvisW);
    const kneeW = V3(sd * .075, PELVIS_Y - TH, 0), knee = mk(sd > 0 ? BI.kneeL : BI.kneeR, hip, kneeW, hipW);
    const foot = mk(sd > 0 ? BI.footL : BI.footR, knee, V3(sd * .075, ANKLE_Y, .004), kneeW);
    legs.push({ hip, knee, foot });
  }
  const tail: THREE.Bone[] = [];
  let prevW = pelvisW, prevB: THREE.Object3D = pelvis;
  a.tailBones.forEach((p, i) => { const b = mk(BI.t0 + i, prevB, p, prevW); tail.push(b); prevB = b; prevW = p; });
  const ears = [0, 1].map(i => mk(i ? BI.earR : BI.earL, head, a.earBase[i], headW));

  // --- skin ---
  const fur = furMat(), cloth = clothMat(OVERALLS[clamp(L.outfit | 0, 0, OVERALLS.length - 1)]);
  const hc = V3();
  const { geo } = toGeometry(cage, t => isCloth(t) ? 1 : 0, (p, x, tag, n) => {
    if (isCloth(tag)) { const ao = .82 + .18 * sst(n.y, -.6, .3); return [ao, ao, ao]; }
    hc.subVectors(p, a.headC).divideScalar(a.hk);
    const f: FurIn = {
      p, n, part: PART[tag], tail: x[X.tail], ear: x[X.ear], earIn: x[X.earIn], limb: x[X.limb], snout: x[X.snout],
      q: hc, eye: Math.min(p.distanceTo(a.eyes[0]), p.distanceTo(a.eyes[1])), side: p.x >= 0 ? 1 : -1,
    };
    const c = S.colour(f, Vr), ao = .72 + .28 * sst(n.y, -.8, .2);
    return [c[0] * ao, c[1] * ao, c[2] * ao];
  }, sculptFn(S, a));
  const body = new THREE.SkinnedMesh(geo, [fur, cloth]);
  body.castShadow = true; body.frustumCulled = false; root.add(body);

  // --- straps: ribbons glued onto the surface (weights of the skin under them) ---
  const strapGeo = straps(geo);
  const strap = new THREE.SkinnedMesh(strapGeo, cloth); strap.castShadow = true; strap.frustumCulled = false; root.add(strap);

  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  body.bind(skel); strap.bind(skel);

  // --- rigid parts on bones ---
  const onBone = (b: THREE.Object3D, o: THREE.Object3D, worldPos: THREE.Vector3, worldQ?: THREE.Quaternion) => {
    const inv = b.matrixWorld.clone().invert(); o.position.copy(worldPos).applyMatrix4(inv);
    if (worldQ) { const bq = new THREE.Quaternion(); b.getWorldQuaternion(bq); o.quaternion.copy(bq.invert().multiply(worldQ)); }
    b.add(o); return o;
  };
  // eyes: ball with iris texture, looking forward + slightly out; scaled flat for blinking
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex(EYE_COLS[clamp(L.eyes | 0, 0, 4)], !!S.eye.slit), roughness: .08, clearcoat: 1, clearcoatRoughness: .05 });
  const eyeGeo = new THREE.SphereGeometry(S.eye.r, 14, 8);
  { const p = eyeGeo.getAttribute('position') as THREE.BufferAttribute, uv = eyeGeo.getAttribute('uv') as THREE.BufferAttribute; // planar from the front: iris in the middle
    for (let i = 0; i < p.count; i++) uv.setXY(i, .5 + p.getX(i) / S.eye.r * .5, .5 + p.getY(i) / S.eye.r * .5); }
  const eyeObjs: THREE.Object3D[] = [];
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1, pivot = new THREE.Group(), ball = new THREE.Mesh(eyeGeo, eyeMat);
    // the eye sits in its socket: centre a bit below the surface, gaze between straight ahead and the face normal
    const N = a.eyeN[i], ctr = a.eyes[i].clone().addScaledVector(N, -S.eye.r * .68);
    const gaze = V3(sd * S.eye.out * .35, -.03, 1).normalize();
    ball.rotation.set(0, 0, 0); ball.quaternion.setFromUnitVectors(V3(0, 0, 1), gaze);
    pivot.add(ball); onBone(head, pivot, ctr, new THREE.Quaternion()); eyeObjs.push(pivot);
  }
  // nose pad
  {
    const g = new THREE.SphereGeometry(1, 14, 8), p = g.getAttribute('position') as THREE.BufferAttribute, nz = S.snout.nose;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i); const z = p.getZ(i); x *= 1 + .35 * y; y *= y < 0 ? .75 : 1; p.setXYZ(i, x * nz * 1.15, y * nz * .78, z * nz * S.snout.noseFlat); }
    g.computeVertexNormals();
    const nose = new THREE.Mesh(g, mat(Vr.nose, { roughness: .28 }));
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), a.noseN.clone().lerp(V3(0, .25, 1).normalize(), .5).normalize());
    onBone(head, nose, a.nose.clone().addScaledVector(a.noseN, -nz * .25).add(V3(0, nz * .25, 0)), q);
  }
  if (S.whiskers) {
    const wm = new THREE.MeshBasicMaterial({ color: 0xf4f0e8 });
    for (const sd of [1, -1]) for (let k = 0; k < 3; k++) {
      const st = a.nose.clone().add(V3(sd * .03, -.012 - k * .006, -.03));
      const pts = [st, st.clone().add(V3(sd * .05, .004 - k * .01, -.01)), st.clone().add(V3(sd * .1, -.006 - k * .022, -.025))];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, .0011, 3), wm);
      onBone(head, tube, O.clone());
      tube.position.set(0, 0, 0); tube.quaternion.identity(); tube.applyMatrix4(head.matrixWorld.clone().invert());
    }
  }

  // --- accessories ---
  accessories(L, S, a, geo, head, ears, onBone);

  const rig: Rig = {
    root, pelvis, torso, head, arms: arms as [Arm, Arm], legs: legs as [Leg, Leg], ua: UA, fa: FA + .035, walk: 0, t: Math.random() * 10,
    th: TH, sh: SI + .06, legLen: LEG_LEN, spine, tail, ears, eyes: eyeObjs,
    sec: { tail: [0, 0, 0, 0, 0, 0, 0, 0], tailV: [0, 0, 0, 0, 0, 0, 0, 0], ear: [0, 0, 0, 0], earV: [0, 0, 0, 0], blink: 0, nextBlink: 1 + Math.random() * 3, twitch: [0, 0], nextTwitch: 2 + Math.random() * 4, low: 0, prevYaw: 0, yawV: 0, kneel: 0 },
    species: si, flop: !!S.ear.flop,
  };
  // rest pose = arms down (bind was the A-pose)
  for (const A of rig.arms) A.sh.quaternion.identity();
  return rig;
}

/** overall straps: front bib corner, over the shoulder, crossing on the back down to the waistband */
function straps(body: THREE.BufferGeometry) {
  const P = body.getAttribute('position') as THREE.BufferAttribute, N = body.getAttribute('normal') as THREE.BufferAttribute;
  const SI = body.getAttribute('skinIndex') as THREE.BufferAttribute, SW = body.getAttribute('skinWeight') as THREE.BufferAttribute;
  // candidate vertices: torso region only (fast nearest search)
  const cand: number[] = [];
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > .6 && y < 1.0 && Math.abs(P.getX(i)) < .17) cand.push(i); }
  const nearest = (p: THREE.Vector3) => { let b = -1, bd = 1e9; for (const i of cand) { const d = (P.getX(i) - p.x) ** 2 + (P.getY(i) - p.y) ** 2 + (P.getZ(i) - p.z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  /** project a point onto the surface: walk from an inner centre outwards, take the nearest skin vertex as anchor */
  const snap = (p: THREE.Vector3) => {
    const i = nearest(p), n = V3(N.getX(i), N.getY(i), N.getZ(i)), s = V3(P.getX(i), P.getY(i), P.getZ(i));
    // closest point on the tangent plane of that vertex
    const q = p.clone().addScaledVector(n, -p.clone().sub(s).dot(n));
    return { p: q, n, i };
  };
  const pos: number[] = [], nor: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  for (const sd of [1, -1]) {
    const way = [V3(sd * .08, .842, .1), V3(sd * .1, .9, .07), V3(sd * .102, .94, .0), V3(sd * .085, .9, -.075), V3(sd * .04, .8, -.1), V3(-sd * .03, .72, -.11), V3(-sd * .06, .655, -.112)];
    const curve = new THREE.CatmullRomCurve3(way), M = 30, wHalf = .0125, th = .004, base = pos.length / 3;
    const pts: { p: THREE.Vector3; n: THREE.Vector3; i: number }[] = [];
    for (let k = 0; k <= M; k++) pts.push(snap(curve.getPointAt(k / M)));
    // smooth the normals along the strap
    const ns = pts.map((_, k) => { const s = V3(); for (let j = -2; j <= 2; j++) s.add(pts[clamp(k + j, 0, M)].n); return s.normalize(); });
    for (let k = 0; k <= M; k++) {
      const { p, i } = pts[k], n = ns[k], tg = pts[Math.min(M, k + 1)].p.clone().sub(pts[Math.max(0, k - 1)].p).normalize(), bi = V3().crossVectors(n, tg).normalize();
      const lift = .0035 + (sd < 0 && k > 19 && k < 27 ? .004 : 0); // the right strap lies over the left one where they cross
      const c0 = p.clone().addScaledVector(n, lift);
      const corners = [c0.clone().addScaledVector(bi, -wHalf), c0.clone().addScaledVector(bi, wHalf), c0.clone().addScaledVector(bi, wHalf).addScaledVector(n, th), c0.clone().addScaledVector(bi, -wHalf).addScaledVector(n, th)];
      const cn = [n.clone().negate(), n.clone().negate(), n, n];
      // side normals blended for a soft rounded look
      corners.forEach((q, j) => { pos.push(q.x, q.y, q.z); const nn = cn[j].clone().addScaledVector(bi, j === 0 || j === 3 ? -.6 : .6).normalize(); nor.push(nn.x, nn.y, nn.z); for (let w = 0; w < 4; w++) { si.push(SI.getComponent(i, w)); sw.push(SW.getComponent(i, w)); } });
    }
    for (let k = 0; k < M; k++) for (let j = 0; j < 4; j++) {
      const a0 = base + k * 4 + j, a1 = base + k * 4 + (j + 1) % 4, b0 = a0 + 4, b1 = a1 + 4;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(.9), 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------------- accessories ----------------
/** measure the head in bind pose (head-weighted, ear-free vertices): hat line above the eyes, ellipse there,
 *  and f(y) = how far the head reaches at height y relative to that ellipse */
function headProfile(geo: THREE.BufferGeometry, a: Anchors, S: Species) {
  const P = geo.getAttribute('position') as THREE.BufferAttribute, SI = geo.getAttribute('skinIndex') as THREE.BufferAttribute, SW = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
  const ok: boolean[] = [];
  let top = -1e9;
  for (let i = 0; i < P.count; i++) {
    let hw = 0, ew = 0;
    for (let k = 0; k < 4; k++) { const b = SI.getComponent(i, k), w = SW.getComponent(i, k); if (b === BI.head) hw += w; else if (b === BI.earL || b === BI.earR) ew += w; }
    ok[i] = hw > .6 && ew < .02; if (ok[i]) top = Math.max(top, P.getY(i));
  }
  const ix = geo.getIndex()!;
  // exact cross-section: intersect every head triangle edge with the plane at height y
  const band = (y: number, c?: { rx: number; rz: number; cz: number }) => {
    let rx = 0, z0 = 1e9, z1 = -1e9, n = 0, fm = 0;
    for (let t = 0; t < ix.count; t += 3) {
      const v = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)]; if (!ok[v[0]] || !ok[v[1]] || !ok[v[2]]) continue;
      for (let e = 0; e < 3; e++) {
        const i = v[e], j = v[(e + 1) % 3], yi = P.getY(i), yj = P.getY(j);
        if ((yi - y) * (yj - y) > 0 || yi === yj) continue;
        const u = (y - yi) / (yj - yi), x = P.getX(i) + (P.getX(j) - P.getX(i)) * u, z = P.getZ(i) + (P.getZ(j) - P.getZ(i)) * u;
        rx = Math.max(rx, Math.abs(x)); z0 = Math.min(z0, z); z1 = Math.max(z1, z); n++;
        if (c) fm = Math.max(fm, Math.hypot(x / c.rx, (z - c.cz) / c.rz));
      }
    }
    return n ? { rx, rz: (z1 - z0) / 2, cz: (z0 + z1) / 2, fm } : null;
  };
  const eyeTop = Math.max(a.eyes[0].y, a.eyes[1].y) + S.eye.r * 1.5 + .01;
  const yb = Math.min(Math.max(eyeTop, top - .1), top - .045);
  const b0 = band(yb) || { rx: .1, rz: .1, cz: 0 };
  const f = (y: number) => { if (y >= top - .002) return 0; const b = band(y, b0); return b ? b.fm : 0; };
  return { yb, top, RX: b0.rx, RZ: b0.rz, cz: b0.cz, f };
}
type OnBone = (b: THREE.Object3D, o: THREE.Object3D, worldPos: THREE.Vector3, worldQ?: THREE.Quaternion) => THREE.Object3D;
function accessories(L: Look, S: Species, a: Anchors, geo: THREE.BufferGeometry, head: THREE.Object3D, ears: THREE.Object3D[], onBone: OnBone) {
  const metal = mat(METALS[clamp(L.metal | 0, 0, 2)], { metalness: .9, roughness: .25 });
  const ID = new THREE.Quaternion();
  // --- hats: fitted to the measured head shape (bind pose), ears come out through them ---
  const hat = clamp(L.hat | 0, 0, 5), hcol = HAT_COLS[clamp(L.hatCol | 0, 0, 5)];
  if (hat) {
    const hp = headProfile(geo, a, S), { yb, RX, RZ, cz, top } = hp, H = top - yb;
    const g = new THREE.Group();
    const hm = (o: Partial<THREE.MeshStandardMaterialParameters> = {}) => mat(hcol, { roughness: .85, ...o });
    // lathe in "base units": r = 1 is the head ellipse at the hat line, y is absolute height above it
    const lath = (pts: [number, number][], m: THREE.Material, seg = 28) => {
      const ge = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg);
      const pp = ge.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) * RX, pp.getY(i), pp.getZ(i) * RZ);
      ge.computeVertexNormals();
      const me = new THREE.Mesh(ge, m); me.castShadow = true; g.add(me); return me;
    };
    // crown that hugs the head from the hat line up and closes above the top
    const wrap = (k: number, lift: number, flat = 1, n = 5): [number, number][] => {
      const pts: [number, number][] = [];
      const y1 = H * .7;
      for (let i = 0; i <= n; i++) { const y = y1 * i / n; pts.push([Math.max(hp.f(yb + y), .3) * k, y]); }
      const r1 = pts[n][0], h1 = H - y1 + lift * flat;
      // dome over the top: quarter ellipse from the last ring to the axis
      for (let j = 1; j <= 4; j++) { const ang = j / 4 * Math.PI / 2; pts.push([r1 * Math.cos(ang), y1 + h1 * Math.sin(ang)]); }
      return pts;
    };
    if (hat === 1) { // straw hat: tall round crown, wide brim, coloured band
      const st = mat(0xf2d79a, { map: strawTex(), roughness: .9, side: THREE.DoubleSide });
      const c = wrap(1.1, .05, 1, 4).map(([r, y], i) => [Math.max(r, i < 7 ? 1.04 - y * .5 : 0), y] as [number, number]);
      lath([[1.72, -.008], [1.76, -.002], [1.66, .004], [1.12, .006], ...c.slice(1)], st);
      lath([[1.1, -.004], [1.12, .002], [1.13, .028], [1.1, .03]], hm({ roughness: .6 }));
      g.rotation.x = -.06;
    } else if (hat === 2) { // cap: six-panel dome hugging the head, button, bill forward
      const c = wrap(1.07, .022);
      lath([[1.0, -.004], [1.08, -.002], ...c], hm({ side: THREE.DoubleSide }));
      const btn = new THREE.Mesh(new THREE.SphereGeometry(.009, 10, 6), hm()); btn.scale.y = .5; btn.position.y = H + .022; g.add(btn);
      const bill = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .007, 28, 1, false, -Math.PI / 2, Math.PI), hm());
      bill.scale.set(RX * .9, 1, RZ * .95); bill.position.set(0, .006, RZ * .62); bill.rotation.x = .16; bill.castShadow = true; g.add(bill);
    } else if (hat === 3) { // bobble hat: knit dome, folded cuff, pompom
      const kn = mat(hcol, { map: knitTex(), roughness: 1 });
      const c = wrap(1.1, .06);
      lath([[1.03, -.016], [1.16, -.02], [1.19, .0], [1.17, .03], [1.11, .036], ...c.slice(2)], kn);
      const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(.034, 2), mat(0xf6f0e6, { roughness: 1 }));
      const pp = pom.geometry.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < pp.count; i++) { const k = 1 + (Math.random() - .5) * .25; pp.setXYZ(i, pp.getX(i) * k, pp.getY(i) * k, pp.getZ(i) * k); }
      pom.geometry.computeVertexNormals(); pom.position.y = H + .085; pom.castShadow = true; g.add(pom);
      g.rotation.x = -.05;
    } else if (hat === 4) { // bucket hat: soft crown, sloped brim
      const c = wrap(1.1, .03, 1, 4);
      lath([[1.55, -.045], [1.58, -.05], [1.53, -.05], [1.1, -.004], ...c], hm({ side: THREE.DoubleSide }));
      lath([[1.115, .0], [1.12, .022], [1.1, .024], [1.095, .0]], mat(new THREE.Color(hcol).multiplyScalar(.6).getHex()));
    } else { // flat cap: low crown pulled forward over a small peak
      const c = wrap(1.1, .016, 1, 5);
      const fc = lath([[1.0, -.004], [1.09, -.002], ...c], hm({ side: THREE.DoubleSide }));
      // pull the top forward: vertices above the band shift towards the peak
      const pp = fc.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), t = sst(y, H * .3, H + .014); const z = pp.getZ(i); pp.setZ(i, z * (1 + t * .1) + (z > 0 ? t * .03 * Math.min(1, z / RZ * 2) : 0)); pp.setX(i, pp.getX(i) * (1 + t * .06)); }
      fc.geometry.computeVertexNormals();
      const peak = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .006, 24, 1, false, -Math.PI / 2, Math.PI), hm());
      peak.scale.set(RX * .85, 1, RZ * .5); peak.position.set(0, .004, RZ * .82); peak.rotation.x = .22; peak.castShadow = true; g.add(peak);
    }
    g.position.set(0, yb, cz);
    onBone(head, g, g.position.clone(), g.quaternion.clone());
  }
  // --- glasses: frames in front of the eyes, bridge over the snout, temples back into the fur ---
  const gl = clamp(L.glasses | 0, 0, 3);
  if (gl) {
    const fm = mat(GLASS_COLS[clamp(L.glassCol | 0, 0, 3)], { roughness: .35, metalness: L.glassCol === 1 ? .8 : .1 });
    const g = new THREE.Group(), er = S.eye.r * 1.55;
    const lens = new THREE.MeshPhysicalMaterial({ color: gl === 3 ? 0x1a1a22 : 0xddeeff, transparent: true, opacity: gl === 3 ? .88 : .16, roughness: .05, metalness: .1, depthWrite: false });
    const E0 = a.eyes[0], E1 = a.eyes[1], zF = Math.max(E0.z, E1.z) + S.eye.r * .9;
    for (const [i, E] of [[0, E0], [1, E1]] as [number, THREE.Vector3][]) {
      const sd = i ? -1 : 1;
      let rim: THREE.BufferGeometry, glass: THREE.BufferGeometry;
      if (gl === 2) { // square
        const sh = new THREE.Shape(), w = er * 1.05, h = er * .82, r = .006;
        sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h);
        const pts = sh.getSpacedPoints(48).map(p => V3(p.x, p.y, 0));
        rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 28, .0035, 4, true);
        glass = new THREE.ShapeGeometry(sh, 8);
      } else {
        rim = new THREE.TorusGeometry(er, gl === 3 ? .0045 : .0032, 4, 26);
        glass = new THREE.CircleGeometry(er, 28);
        if (gl === 3) { glass.scale(1.05, .88, 1); rim.scale(1.05, .88, 1); }
      }
      const fr = new THREE.Mesh(rim, fm), ln = new THREE.Mesh(glass, lens);
      const c = V3(E.x * 1.06, E.y + .002, zF), yaw = sd * .32;
      fr.position.copy(c); fr.rotation.y = yaw; ln.position.copy(c); ln.rotation.y = yaw; g.add(fr, ln);
      // temple: from the outer edge straight back into the side of the head
      const o = c.clone().add(V3(sd * er * Math.cos(yaw), 0, -er * Math.sin(Math.abs(yaw))));
      const tp = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(o, o.clone().add(V3(sd * .006, .004, -.08))), 1, .0028, 6), fm);
      g.add(tp);
    }
    // bridge: an arch over the snout between the two frames
    const bx = Math.abs(E0.x) * 1.06 - er * .95, by = E0.y + .006;
    const bridge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(bx, by, zF), V3(0, by + .02, zF + .012 + S.snout.len * .12), V3(-bx, by, zF)), 10, .003, 6), fm);
    g.add(bridge);
    onBone(head, g, V3(), ID); g.position.set(0, 0, 0); g.quaternion.identity(); g.applyMatrix4(head.matrixWorld.clone().invert());
  }
  // --- earrings ---
  const ea = clamp(L.earring | 0, 0, 3);
  if (ea) for (let i = 0; i < 2; i++) {
    const ear = ears[i], o = a.earOuter[i], up = a.earUp[i], fr = a.earFront[i];
    if (ea === 1) { // studs on the front of the ear
      const st = new THREE.Mesh(new THREE.SphereGeometry(.0065, 8, 6), metal);
      onBone(ear, st, o.clone().addScaledVector(fr, S.ear.th * .9).addScaledVector(up, -.01));
    } else {
      const n = ea === 2 ? 1 : 3;
      for (let k = 0; k < n; k++) {
        const r = ea === 2 ? .017 : .009, ring = new THREE.Mesh(new THREE.TorusGeometry(r, ea === 2 ? .0024 : .0018, 5, 18), metal);
        const p = o.clone().addScaledVector(up, (S.ear.flop ? -1 : 1) * k * .016 - (S.ear.flop ? .0 : .006));
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), fr);
        const sideQ = new THREE.Quaternion().setFromAxisAngle(fr, 0);
        const ctr = p.clone().add(S.ear.flop ? V3(0, -r * .8, 0) : V3((i ? -1 : 1) * r * .8, -r * .3, 0));
        onBone(ear, ring, ctr, sideQ.multiply(q).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI / 2)));
      }
    }
  }
  // --- piercings: nose ring / brow bar ---
  const pi = clamp(L.pierce | 0, 0, 2);
  if (pi === 1) {
    const r = S.snout.nose * .55, ring = new THREE.Mesh(new THREE.TorusGeometry(r, .0022, 5, 18), metal);
    onBone(head, ring, a.nose.clone().add(V3(0, -S.snout.nose * .55 - r * .5, .0)), new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -.25));
  } else if (pi === 2) {
    const E = a.eyes[0], N = a.eyeN[0], up = V3(0, 1, 0);
    for (const k of [-1, 1]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.0042, 8, 6), metal);
      onBone(head, ball, E.clone().addScaledVector(up, S.eye.r * 1.7).addScaledVector(N, .004).add(V3(.008 + k * .009, k * .004, 0)));
    }
  }
}

/** dispose geometries + materials of a figure (textures are shared and kept) */
export function disposeFarmer(R: Rig) {
  R.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); } });
}

// ---------------- animation ----------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = V3(), _w = V3(), _S = V3(), _E = V3(), _P = V3(), _L = V3();
const DOWN = V3(0, -1, 0);
/**
 * 2-bone leg in the side plane: hip angle + knee bend so the ankle lands at (fz forward, fy down) from the hip.
 * Angles like the rig: hip.rotation.x < 0 swings the leg forward, knee.rotation.x > 0 bends the shin back.
 */
function legIK(R: Rig, fz: number, fy: number): [number, number] {
  const a = R.th, b = R.sh, U = -fz, W2 = -fy, D = Math.min(a + b - 1e-3, Math.max(.05, Math.hypot(U, W2)));
  const al = Math.atan2(U, W2), be = Math.acos(Math.max(-1, Math.min(1, (a * a + D * D - b * b) / (2 * a * D))));
  const p1 = al - be, kx = Math.sin(p1) * a, ky = Math.cos(p1) * a, p2 = Math.atan2(U - kx, W2 - ky); // knee points forward
  return [p1, Math.max(0, p2 - p1)];
}
/** smooth periodic keyframes (Catmull-Rom over a loop) */
function loopKeys(keys: number[], ph: number) {
  const n = keys.length, f = ((ph % 1) + 1) % 1 * n, i = Math.floor(f), t = f - i;
  const p0 = keys[(i - 1 + n) % n], p1 = keys[i], p2 = keys[(i + 1) % n], p3 = keys[(i + 2) % n];
  return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
// jog cycle of one leg (8 keys, phase 0 = heel strike in front): hip, knee, foot pitch in the world (+ = toes down)
const WALK_HIP = [-.5, -.32, -.02, .3, .52, .3, -.12, -.48];
const WALK_KNEE = [.12, .38, .26, .2, .55, 1.25, 1.05, .4];
const WALK_FOOT = [-.22, 0, 0, .18, .62, .45, .05, -.2];
/**
 * legs + torso. low (21.11.2026): k = 0 standing .. 1 down; kneel = 1 on one knee (working on the ground) .. 0 deep crouch
 * (waddling with the action button held: short quick steps, the body rocks from side to side).
 */
export function animateLegs(R: Rig, dt: number, wk: number, walk: number, low?: { k: number; kneel: number }) {
  R.t += dt; R.walk = walk;
  const k = low ? clamp(low.k, 0, 1) : 0, kn = low ? low.kneel : 0;
  R.sec.low = k; R.sec.kneel = kn;
  // kneel: pelvis just above the knee on the ground; crouch: a little higher, feet under the body
  const hK = R.th * .92 + .055, hC = R.th * .55 + R.sh * .62, h = hK * kn + hC * (1 - kn);
  const ph = wk / (Math.PI * 2);
  for (let i = 0; i < 2; i++) {
    const lp = ph + (i ? .5 : 0);
    // standing: a relaxed contrapposto (weight on leg 0)
    const idle = 1 - walk;
    let hip = loopKeys(WALK_HIP, lp) * walk + idle * (i ? -.04 : .02);
    let knee = loopKeys(WALK_KNEE, lp) * walk + idle * (i ? .1 : .03);
    let footW = loopKeys(WALK_FOOT, lp) * walk; // world pitch of the sole
    if (k > 0) {
      const s = Math.sin(wk + (i ? Math.PI : 0));
      // crouch step: the foot swings forward/back under the body, lifted while it moves forward
      const st = .11 * walk, cz = .05 + (i ? -.03 : .07), lift = Math.max(0, Math.cos(wk + (i ? Math.PI : 0))) * .055 * walk;
      const [ch, ck] = legIK(R, cz + s * st, -h + lift + .012);
      // kneel: leg 0 in front (foot flat, shin upright), leg 1 kneels (knee on the ground, shin back, toes tucked)
      let kh: number, kk: number, kf: number;
      if (i === 0) { [kh, kk] = legIK(R, .19, -h + .012); kf = 0; }
      else { kh = -Math.acos(clamp((h - .055) / R.th, -1, 1)); kk = 1.42 - kh; kf = 1.15; } // toes tucked under, the sole points back
      const lh = kh * kn + ch * (1 - kn), lk = kk * kn + ck * (1 - kn), lf = kf * kn + lift * 2 * (1 - kn);
      hip = hip + (lh - hip) * k; knee = knee + (lk - knee) * k; footW = footW + (lf - footW) * k;
    }
    R.legs[i].hip.rotation.x = hip;
    R.legs[i].knee.rotation.x = knee;
    R.legs[i].foot.rotation.x = footW - hip - knee;
  }
  const breathe = Math.sin(R.t * 1.7);
  R.pelvis.position.y = R.legLen + (h - R.legLen) * k - (1 - walk) * (1 - k) * .006;
  // waddle: the body rocks over the stepping foot; walking: the hips tilt + turn with the steps
  R.pelvis.rotation.z = Math.sin(wk) * .13 * walk * k * (1 - kn) + Math.sin(wk) * .05 * walk * (1 - k) + (1 - walk) * (1 - k) * .025;
  R.pelvis.rotation.y = -Math.sin(wk) * .12 * walk * (1 - k);
  R.pelvis.position.x = Math.sin(wk) * .025 * walk * k * (1 - kn) + (1 - walk) * (1 - k) * .006;
  R.torso.rotation.y = Math.sin(wk) * .2 * walk * (1 - k * .6);                 // shoulders counter the hips
  R.torso.rotation.x = .07 * walk + breathe * .012 * (1 - walk);              // lean into the jog, breathing at rest
  R.torso.rotation.z = -R.pelvis.rotation.z * .8;                              // the head stays fairly level
  R.head.rotation.x = -.05 * walk - Math.cos(wk * 2) * .02 * walk + breathe * .008 * (1 - walk);
  R.head.rotation.y = 0; R.head.rotation.z = -R.torso.rotation.z * .4;
}
/**
 * arms: target = world point for the hand (2-bone IK, elbow towards pole) or null for a relaxed swing.
 * Call after the root's world matrices are up to date. Hand targets inside the body are pushed out of it,
 * elbows are kept outside the chest. Also runs the secondary motion (spine, tail, ears, eyes).
 */
export function animateArms(R: Rig, dt: number, wk: number, targets: [THREE.Vector3 | null, THREE.Vector3 | null], instant = false) {
  const k = instant ? 1 : 1 - Math.exp(-dt * 16);
  // spine takes half of the torso bend (smooth belly)
  R.spine.quaternion.copy(_q.identity()).slerp(R.torso.quaternion, .5);
  R.root.updateMatrixWorld(true);
  R.torso.getWorldQuaternion(_q2);
  const inv = R.torso.matrixWorld.clone().invert();
  // reaching above the head (tree): look up, the paws pass in front of the face instead of through it
  const hi = Math.max(targets[0]?.y ?? 0, targets[1]?.y ?? 0);
  if (hi > 1.25) { R.head.rotation.x -= clamp((hi - 1.25) * 1.6, 0, .45); R.root.updateMatrixWorld(true); }
  R.head.getWorldPosition(_v); const headC = _v.clone().add(V3(0, .17, .02).applyQuaternion(R.head.getWorldQuaternion(_q)));
  for (let i = 0; i < 2; i++) {
    const A = R.arms[i]; let T = targets[i];
    let qs: THREE.Quaternion, qe: THREE.Quaternion;
    if (!T) {
      const sw = -Math.sin(wk + (i ? 0 : Math.PI)) * .5 * R.walk;
      qs = new THREE.Quaternion().setFromEuler(_e.set(sw - .06, 0, A.side * (.17 + .015 * Math.sin(R.t * 1.7) + .06 * R.walk)));
      qe = new THREE.Quaternion().setFromEuler(_e.set(-.28 - .5 * R.walk - Math.max(0, sw) * .5, 0, 0));
    } else {
      T = keepOut(T.clone(), R, inv);
      const dh = T.clone().sub(headC); if (dh.length() < .27) T.copy(headC).addScaledVector(dh.normalize(), .27);
      const a = R.ua, b = R.fa;
      A.sh.getWorldPosition(_S); _v.subVectors(T, _S);
      const dist = Math.max(.05, Math.min(a + b - .002, _v.length())); _v.normalize();
      const cosA = (a * a + dist * dist - b * b) / (2 * a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      // elbow pole: out + down + back; if that puts the elbow into the chest, swing it further out
      for (let tries = 0; tries < 4; tries++) {
        _P.set(A.side * (.9 + tries * .6), -.7, -.45 + tries * .1).applyQuaternion(_q2); _P.addScaledVector(_v, -_P.dot(_v)).normalize();
        _E.copy(_S).addScaledVector(_v, a * cosA).addScaledVector(_P, a * sinA);
        _L.copy(_E).applyMatrix4(inv); if (outside(_L, .045)) break;
      }
      const qU = new THREE.Quaternion().setFromUnitVectors(DOWN, _w.subVectors(_E, _S).normalize());
      const hand = _S.clone().addScaledVector(_v, dist);
      const qF = new THREE.Quaternion().setFromUnitVectors(DOWN, _w.subVectors(hand, _E).normalize());
      qs = _q2.clone().invert().multiply(qU); qe = qU.clone().invert().multiply(qF);
    }
    A.qs.slerp(qs, k); A.qe.slerp(qe, k);
    A.sh.quaternion.copy(A.qs); A.el.quaternion.copy(A.qe);
  }
  secondary(R, dt, instant);
}
/** chest volume in torso space (pelvis origin): ellipse per height, generous for the belly */
function outside(p: THREE.Vector3, margin: number) {
  const y = p.y; if (y < -.12 || y > .44) return true;
  const rx = (y < .3 ? .158 : .175) + margin, rz = (y < .3 ? .13 : .11) + margin, cz = y < .3 ? .014 : 0;
  return (p.x / rx) ** 2 + ((p.z - cz) / rz) ** 2 > 1;
}
/** push a hand target out of the chest / belly (keeps the paw on the surface instead of inside) */
function keepOut(T: THREE.Vector3, R: Rig, inv: THREE.Matrix4) {
  const p = T.clone().applyMatrix4(inv), m = .05;
  if (p.y > -.12 && p.y < .44 && !outside(p, m)) {
    const rx = (p.y < .3 ? .158 : .175) + m, rz = (p.y < .3 ? .13 : .11) + m, cz = p.y < .3 ? .014 : 0;
    const a = Math.atan2(p.x / rx, (p.z - cz) / rz);
    p.x = Math.sin(a) * rx; p.z = cz + Math.cos(a) * rz;
    return p.applyMatrix4(R.torso.matrixWorld);
  }
  return T;
}
/** follow-through: tail sways and lags behind turns, lifts when crouching; ears twitch / flop; blinking */
function secondary(R: Rig, dt: number, instant: boolean) {
  const s = R.sec, t = R.t;
  // turning speed of the whole figure (for lag)
  R.root.getWorldQuaternion(_q); const yaw = new THREE.Euler().setFromQuaternion(_q, 'YXZ').y;
  let dy = yaw - s.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.prevYaw = yaw;
  s.yawV = instant || dt <= 0 ? 0 : lerp(s.yawV, clamp(dy / dt, -8, 8), 1 - Math.exp(-dt * 8));
  const walk = R.walk, low = s.low;
  // tail: target angles (x = up/down, y = side) per bone, springs towards them
  const n = R.tail.length, kSp = 70, damp = 9;
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    const tx = -(.18 + .55 * low) * (i === 0 ? 1 : .35) - Math.sin(t * 2.2 + i * .6) * .03 * (1 - walk) - walk * .08 * (i === 0 ? 1 : .2);
    const ty = Math.sin(t * 1.3 - i * .7) * (.12 + .05 * f) * (1 - walk) + Math.sin(R.walk > .05 ? t * 0 : 0) + Math.sin(t * 9.5 - i * .9) * .16 * walk - s.yawV * .05 * f;
    for (const [ax, target] of [[0, tx], [1, ty]] as [number, number][]) {
      const j = i * 2 + ax;
      if (instant) { s.tail[j] = target; s.tailV[j] = 0; continue; }
      s.tailV[j] += ((target - s.tail[j]) * kSp - s.tailV[j] * damp) * dt; s.tail[j] += s.tailV[j] * dt;
    }
    R.tail[i].rotation.set(s.tail[i * 2], s.tail[i * 2 + 1], 0);
  }
  // ears: occasional twitch, bounce with the steps, floppy ears swing
  s.nextTwitch -= dt;
  if (s.nextTwitch < 0) { s.twitch[Math.random() < .5 ? 0 : 1] = 1; s.nextTwitch = 2.5 + Math.random() * 5; }
  for (let i = 0; i < 2; i++) {
    s.twitch[i] = Math.max(0, s.twitch[i] - dt * 4);
    const tw = Math.sin(s.twitch[i] * Math.PI * 2) * .35 * (R.flop ? .4 : 1);
    const bounce = Math.cos(t * 9.5) * walk * (R.flop ? .3 : .08);
    for (const [ax, target] of [[0, -tw * .4 + bounce], [1, tw * (i ? -1 : 1)]] as [number, number][]) {
      const j = i * 2 + ax;
      if (instant) { s.ear[j] = target; s.earV[j] = 0; continue; }
      s.earV[j] += ((target - s.ear[j]) * (R.flop ? 60 : 160) - s.earV[j] * (R.flop ? 6 : 14)) * dt; s.ear[j] += s.earV[j] * dt;
    }
    R.ears[i].rotation.set(s.ear[i * 2], 0, s.ear[i * 2 + 1] * .6);
  }
  // blink: quick close + open every few seconds
  s.nextBlink -= dt;
  if (s.nextBlink < 0) { s.blink = 1; s.nextBlink = 2 + Math.random() * 4 + (Math.random() < .2 ? -1.8 : 0); }
  s.blink = Math.max(0, s.blink - dt * 7);
  const closed = Math.sin(s.blink * Math.PI);
  for (const e of R.eyes) { e.scale.y = 1 - closed * .9; }
}
