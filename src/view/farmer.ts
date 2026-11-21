// Detailed farmer figure (character editor): smooth procedural body with a simple joint rig
// (pelvis, torso, head, 2-bone arms + legs). Bib overalls + rubber boots + plaid shirt always;
// face / body / hair / colours / accessories / hat from the Look. Each body segment is baked into
// one mesh per material (few draw calls on mobile).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Look } from '../look';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------- option palettes (5 each) ----------------
export const SKIN = [0x5c3720, 0xc68c5f, 0xf6dfd0]; // dark brown, light brown, almost white
export const HAIR = [0xa63c18, 0x1c1714, 0xead39a]; // red, black, light blond
const EYE_BROWN = 0x5b3416;
/** outfits: [overalls colour, plaid shirt base, wide band, thin line] */
export const OUTFITS: [number, string, string, string][] = [
  [0x3e5f9a, '#e2679c', '#f8c6dc', '#8a2856'], // blue overalls, pink shirt
  [0x25262b, '#f1ede6', '#c9262d', '#7a1419'], // black overalls, white-red shirt
  [0x4d7a33, '#b9dc66', '#f3e25a', '#5b8a2a'], // green overalls, light green-yellow shirt
];
const BOOT = 0x2e5530;

interface FaceP { w: number; h: number; jaw: number; chin: number; cheek: number; top: number; sq: number; nose: [number, number, number, number]; ear: number }
const FACE: FaceP = { w: .98, h: 1.02, jaw: .8, chin: .05, cheek: .08, top: .99, sq: 0, nose: [.026, .021, .2, 0], ear: 1 };
interface BodyP { sh: number; ch: number; wa: number; hip: number; dep: number; belly: number; h: number; legH: number; arm: number; leg: number }
const BODY: BodyP = { sh: .176, ch: .14, wa: .12, hip: .13, dep: .094, belly: .012, h: 1, legH: 1, arm: 1, leg: 1 };
const HR = { x: .119, y: .143, z: .127 }; // base head radii

// ---------------- textures (canvas, cached) ----------------
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  let t = texCache.get(key); if (t) return t;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t); return t;
}
function noise(c: CanvasRenderingContext2D, w: number, h: number, amt: number, f?: (x: number, y: number) => number) {
  const d = c.getImageData(0, 0, w, h), p = d.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, n = (Math.random() - .5) * amt + (f ? f(x, y) : 0);
    p[i] += n; p[i + 1] += n; p[i + 2] += n;
  }
  c.putImageData(d, 0, 0);
}
function drawPlaid(c: CanvasRenderingContext2D, i: number, S: number) {
  const [, base, band, line] = OUTFITS[i];
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  const k = S / 128;
  const bands = (col: string, a: number, list: [number, number][]) => {
    c.globalAlpha = a; c.fillStyle = col;
    for (const [p, w] of list) { c.fillRect(p * k, 0, w * k, S); c.fillRect(0, p * k, S, w * k); }
  };
  bands(band, .55, [[14, 40], [86, 12]]);
  bands(line, .75, [[68, 4], [110, 3]]);
  c.globalAlpha = 1;
}
export function plaidTex(i: number) {
  return canvasTex('plaid' + i, 128, 128, c => { drawPlaid(c, i, 128); noise(c, 128, 128, 18, (x, y) => ((x + y) % 4 < 2 ? 6 : -6)); });
}
/** small plaid swatch for the editor */
export function plaidSwatch(i: number) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; drawPlaid(cv.getContext('2d')!, i, 64); return cv.toDataURL();
}
function denimTex(i: number, stitched: boolean) {
  return canvasTex('denim' + i + stitched, 128, 128, c => {
    c.fillStyle = '#' + new THREE.Color(OUTFITS[i][0]).getHexString(); c.fillRect(0, 0, 128, 128);
    noise(c, 128, 128, 22, (x, y) => ((x + y * 2) % 5 < 2 ? 9 : -5));
    if (stitched) { c.strokeStyle = '#d8a24a'; c.lineWidth = 2; c.setLineDash([5, 4]); c.strokeRect(7, 7, 114, 114); }
  });
}
const hairTex = () => canvasTex('hair', 64, 128, c => {
  c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, 64, 128);
  for (let x = 0; x < 64; x++) { const b = 150 + Math.random() * 105; c.fillStyle = `rgb(${b},${b},${b})`; c.fillRect(x, 0, 1, 128); }
  noise(c, 64, 128, 25);
});
function eyeTex() {
  return canvasTex('eye', 128, 64, c => {
    c.fillStyle = '#f1ece4'; c.fillRect(0, 0, 128, 64);
    const col = new THREE.Color(EYE_BROWN), g = c.createRadialGradient(32, 32, 2, 32, 32, 11);
    g.addColorStop(0, '#' + col.clone().multiplyScalar(.55).getHexString()); g.addColorStop(.55, '#' + col.getHexString()); g.addColorStop(1, '#' + col.clone().multiplyScalar(.45).getHexString());
    c.fillStyle = g; c.beginPath(); c.arc(32, 32, 11, 0, 7); c.fill();
    c.fillStyle = '#0a0806'; c.beginPath(); c.arc(32, 32, 4.6, 0, 7); c.fill();
  });
}
// ---------------- geometry builders ----------------
interface Ring { y: number; rx: number; rz: number; cx?: number; cz?: number }
/** tube along +y through elliptical rings (a = 0 is the front, +z), optional arc for panels */
function tubeGeo(rings: Ring[], o: { seg?: number; arc?: [number, number]; tile?: number; fit?: boolean; capBot?: boolean; capTop?: boolean } = {}) {
  const seg = o.seg ?? 28, [a0, a1] = o.arc ?? [-Math.PI, Math.PI], full = !o.arc, tile = o.tile ?? .2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const circ = rings.reduce((s, r) => s + Math.PI * (r.rx + r.rz), 0) / rings.length * (a1 - a0) / (Math.PI * 2);
  let len = 0; const total = rings.reduce((s, r, i) => s + (i ? Math.hypot(r.y - rings[i - 1].y, r.rx - rings[i - 1].rx) : 0), 0);
  rings.forEach((r, i) => {
    if (i) len += Math.hypot(r.y - rings[i - 1].y, r.rx - rings[i - 1].rx);
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (a1 - a0) * k / seg;
      pos.push((r.cx ?? 0) + r.rx * Math.sin(a), r.y, (r.cz ?? 0) + r.rz * Math.cos(a));
      if (o.fit) uv.push(k / seg, len / (total || 1)); else uv.push(k / seg * circ / tile, len / tile);
    }
  });
  const W = seg + 1;
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * W + k, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const cap = (ri: number, top: boolean) => {
    const r = rings[ri], ci = pos.length / 3; pos.push(r.cx ?? 0, r.y, r.cz ?? 0); uv.push(.5, top ? 1 : 0);
    for (let k = 0; k < seg; k++) { const p = ri * W + k; if (top) idx.push(ci, p, p + 1); else idx.push(ci, p + 1, p); }
  };
  if (o.capBot) cap(0, false); if (o.capTop) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); if (full) fixSeam(g, rings.length, W);
  return g;
}
/** average the normals of the duplicated seam column so closed tubes have no crease */
function fixSeam(g: THREE.BufferGeometry, rows: number, W: number) {
  const n = g.getAttribute('normal') as THREE.BufferAttribute, t = V3();
  for (let i = 0; i < rows; i++) {
    const a = i * W, b = a + W - 1;
    t.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, t.x, t.y, t.z); n.setXYZ(b, t.x, t.y, t.z);
  }
}
/** sweep an elliptical cross-section along points; w across (T x up), h along up */
function sweepGeo(pts: THREE.Vector3[], rad: (t: number) => [number, number], up: (i: number) => THREE.Vector3, seg = 10, tile = .1) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], n = pts.length;
  const T = V3(), B = V3(), N = V3(); let len = 0;
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    B.crossVectors(T, up(i)).normalize(); N.crossVectors(B, T);
    const [w, h] = rad(i / (n - 1)); if (i) len += pts[i].distanceTo(pts[i - 1]);
    for (let k = 0; k <= seg; k++) {
      const a = k / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(pts[i].x + B.x * w * c + N.x * h * s, pts[i].y + B.y * w * c + N.y * h * s, pts[i].z + B.z * w * c + N.z * h * s);
      uv.push(k / seg, len / tile);
    }
  }
  const W = seg + 1;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * W + k, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); fixSeam(g, n, W); return g;
}
const dirOf = (az: number, el: number) => V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
/** surface point of the head for a unit direction, shaped by the face type */
function headSurf(n: THREE.Vector3, F: FaceP, out = V3()) {
  let x = n.x; const y = n.y, z = n.z;
  const low = sstep(-y, -.1, .95);
  let sx = F.w * (1 - low * (1 - F.jaw)); if (y > 0) sx *= 1 + (F.top - 1) * y;
  if (F.sq > 0 && y < 0) { const ax = Math.abs(x); x = Math.sign(x) * Math.pow(ax, 1 - .45 * F.sq * low); }
  const ck = F.cheek * Math.exp(-(((y + .3) / .28) ** 2)) * Math.max(0, z) * Math.abs(x) * 2;
  let pz = z * HR.z * (z < 0 ? 1.08 : .95) * (1 + ck * .4);
  if (y < -.5 && z > 0) pz += F.chin * HR.z * ((-y - .5) / .5) * z;
  return out.set(x * HR.x * sx * (1 + ck * .6), y * HR.y * F.h, pz);
}
/** hair shell over the head between minEl(az) and maxEl, thickness fading to 0 at the edges */
function capGeo(F: FaceP, minEl: (az: number) => number, maxEl: number, thick: number, az0 = -Math.PI, az1 = Math.PI, fadeTop = false, o: { bottom?: number; drop?: number } = {}) {
  const C = 48, R = 16, pos: number[] = [], uv: number[] = [], idx: number[] = [], p = V3();
  for (let j = 0; j <= R; j++) for (let k = 0; k <= C; k++) {
    const az = lerp(az0, az1, k / C), lo = minEl(az), el = lerp(lo, maxEl, j / R), n = dirOf(az, el);
    const t = j / R, th = thick * (fadeTop ? Math.pow(Math.sin(Math.PI * t), .5) : lerp(o.bottom ?? 0, 1, sstep(t, 0, .35))) + .0015 + (o.drop ?? 0) * Math.max(0, .15 - el);
    headSurf(n, F, p).addScaledVector(n, th); pos.push(p.x, p.y, p.z); uv.push(k / C * 3, t * 1.4);
  }
  const W = C + 1;
  for (let j = 0; j < R; j++) for (let k = 0; k < C; k++) { const a = j * W + k, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); if (az1 - az0 > 6.28) fixSeam(g, R + 1, W); return g;
}
function lathe(pts: [number, number][], seg = 40) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

// ---------------- materials ----------------
function mat(color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .8, ...o }); }

/** merge all meshes below src into one mesh per material, added to dst (src must be detached, identity transform) */
function bake(src: THREE.Object3D, dst: THREE.Object3D) {
  src.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  src.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (!g.index) g = mergeVertices(g);
    const k = m.material as THREE.Material; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(g);
  });
  for (const [k, list] of groups) {
    const hasCol = list.some(g => g.getAttribute('color'));
    for (const g of list) {
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      if (hasCol && !g.getAttribute('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
      if (!hasCol && g.getAttribute('color')) g.deleteAttribute('color');
    }
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0];
    const mesh = new THREE.Mesh(merged, k); mesh.castShadow = true; dst.add(mesh);
  }
}
const add = (g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, p?: THREE.Vector3, s?: number[] | number, r?: THREE.Euler | THREE.Quaternion) => {
  const me = new THREE.Mesh(geo, m); if (p) me.position.copy(p);
  if (s !== undefined) { if (typeof s === 'number') me.scale.setScalar(s); else me.scale.set(s[0], s[1], s[2]); }
  if (r) { if (r instanceof THREE.Quaternion) me.quaternion.copy(r); else me.rotation.copy(r); }
  g.add(me); return me;
};
const SPH = new THREE.SphereGeometry(1, 20, 14), SPH_LO = new THREE.SphereGeometry(1, 12, 8);

// ---------------- rig ----------------
export interface Arm { sh: THREE.Group; el: THREE.Group; side: number; qs: THREE.Quaternion; qe: THREE.Quaternion }
export interface Leg { hip: THREE.Group; knee: THREE.Group }
/** th = thigh, sh = shin down to the sole, legLen = hip height standing */
export interface Rig { root: THREE.Group; pelvis: THREE.Group; torso: THREE.Group; head: THREE.Group; arms: [Arm, Arm]; legs: [Leg, Leg]; ua: number; fa: number; walk: number; t: number; th: number; sh: number; legLen: number }

/** build the figure; returns the root group (feet on y = 0, facing +z) and its rig */
export function buildFarmer(L: Look): Rig {
  const F = FACE, B = BODY;
  const skinC = SKIN[L.skin] ?? SKIN[0], hairC = HAIR[L.hairCol] ?? HAIR[0];
  const M = {
    skin: mat(skinC, { roughness: .62 }),
    head: mat(skinC, { roughness: .6, vertexColors: true }),
    shirt: mat(0xffffff, { map: plaidTex(L.outfit), roughness: .9 }),
    denim: mat(0xffffff, { map: denimTex(L.outfit, false), roughness: .95, side: THREE.DoubleSide }),
    denimP: mat(0xffffff, { map: denimTex(L.outfit, true), roughness: .95, side: THREE.DoubleSide }),
    boot: mat(BOOT, { roughness: .32 }),
    sole: mat(0x1a1714, { roughness: .9 }),
    brass: mat(0xc9a046, { metalness: .7, roughness: .35 }),
    hair: mat(hairC, { map: hairTex(), roughness: .55, side: THREE.DoubleSide }),
    brow: mat(new THREE.Color(hairC).multiplyScalar(.8).getHex(), { roughness: .7 }),
    eye: mat(0xffffff, { map: eyeTex(), roughness: .12 }),
    lip: mat(new THREE.Color(skinC).lerp(new THREE.Color(0x9a3a3a), .45).getHex(), { roughness: .5 }),
    metal: mat(0xdcdce2, { metalness: .65, roughness: .28, emissive: 0x222226 }),
  };
  const root = new THREE.Group();
  const hL = B.legH, th = .24 * hL, si = .22 * hL, legLen = th + si + .06, T = .42 * B.h, ua = .21 * B.h, fa = .18 * B.h;

  // ---- pelvis + legs ----
  const pelvis = new THREE.Group(); pelvis.position.y = legLen; root.add(pelvis);
  const legs: Leg[] = [];
  for (const side of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(side * B.hip * .5, 0, 0); pelvis.add(hip);
    const s1 = new THREE.Group(), lg = B.leg;
    add(s1, tubeGeo([{ y: .04, rx: .07 * lg, rz: .072 * lg }, { y: -.05, rx: .07 * lg, rz: .07 * lg }, { y: -th * .55, rx: .061 * lg, rz: .062 * lg }, { y: -th, rx: .053 * lg, rz: .055 * lg }, { y: -th - .035, rx: .05 * lg, rz: .052 * lg }], { seg: 20 }), M.denim);
    bake(s1, hip);
    const knee = new THREE.Group(); knee.position.y = -th; hip.add(knee);
    const s2 = new THREE.Group();
    add(s2, tubeGeo([{ y: .01, rx: .052 * lg, rz: .054 * lg }, { y: -.07, rx: .049 * lg, rz: .05 * lg }], { seg: 20 }), M.denim);
    // rubber boot: flared shaft, rim, foot, sole
    add(s2, tubeGeo([{ y: -.045, rx: .052 * lg, rz: .054 * lg }, { y: -.05, rx: .062 * lg, rz: .064 * lg }, { y: -.075, rx: .058 * lg, rz: .06 * lg }, { y: -si * .6, rx: .05 * lg, rz: .052 * lg }, { y: -si, rx: .047 * lg, rz: .05 * lg }, { y: -si - .03, rx: .048 * lg, rz: .056 * lg }], { seg: 22 }), M.boot);
    add(s2, new THREE.TorusGeometry(.061 * lg, .006, 8, 26), M.boot, V3(0, -.05, 0), undefined, new THREE.Euler(Math.PI / 2, 0, 0));
    add(s2, SPH, M.boot, V3(0, -si - .028, .03), [.05 * lg, .036, .095 * lg]);
    add(s2, SPH, M.boot, V3(0, -si - .034, .085 * lg), [.043 * lg, .03, .045 * lg]);
    add(s2, tubeGeo([{ y: -.012, rx: .049 * lg, rz: .118 * lg, cz: .028 }, { y: 0, rx: .052 * lg, rz: .122 * lg, cz: .028 }, { y: .012, rx: .05 * lg, rz: .118 * lg, cz: .028 }], { seg: 24, capBot: true, capTop: true }), M.sole, V3(0, -si - .048, 0));
    bake(s2, knee);
    legs.push({ hip, knee });
  }

  // ---- torso: plaid shirt, overalls (pants part + bib + straps + buttons + pocket) ----
  const torso = new THREE.Group(); pelvis.add(torso);
  const rings: Ring[] = [
    { y: -.075, rx: B.hip * .55, rz: B.dep * .6 },
    { y: -.05, rx: B.hip * .93, rz: B.dep * .93 },
    { y: 0, rx: B.hip, rz: B.dep },
    { y: .08, rx: lerp(B.hip, B.wa, .6) + B.belly * .2, rz: B.dep + B.belly * .5, cz: B.belly * .4 },
    { y: .16, rx: B.wa + B.belly * .25, rz: B.dep + B.belly, cz: B.belly * .7 },
    { y: .24, rx: B.ch, rz: B.dep * 1.03 + B.belly * .4, cz: B.belly * .3 },
    { y: T - .08, rx: B.ch * 1.04, rz: B.dep * 1.02 },
    { y: T - .03, rx: B.sh * .96, rz: B.dep * .92 },
    { y: T, rx: B.sh * .8, rz: B.dep * .76 },
    { y: T + .02, rx: B.sh * .45, rz: B.dep * .56 },
    { y: T + .03, rx: .055, rz: .05 },
  ];
  const ringAt = (y: number): Ring => {
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i], b = rings[i + 1];
      if (y <= b.y || i === rings.length - 2) { const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y))); return { y, rx: lerp(a.rx, b.rx, t), rz: lerp(a.rz, b.rz, t), cz: lerp(a.cz ?? 0, b.cz ?? 0, t) }; }
    }
    return rings[0];
  };
  const surf = (y: number, a: number, s = 1) => { const r = ringAt(y); return V3(r.rx * s * Math.sin(a), y, (r.cz ?? 0) + r.rz * s * Math.cos(a)); };
  const surfN = (y: number, a: number) => { const pa = surf(y, a + .01).sub(surf(y, a - .01)), py = surf(y + .01, a).sub(surf(y - .01, a)); return pa.cross(py).normalize(); };
  const scaled = (lo: number, hi: number, s: number, step = .04) => { const out: Ring[] = []; for (let y = lo; y < hi - 1e-4; y += step) out.push(ringAt(y)); out.push(ringAt(hi)); return out.map(r => ({ ...r, rx: r.rx * s, rz: r.rz * s, cz: (r.cz ?? 0) * s })); };
  const st = new THREE.Group();
  add(st, tubeGeo(rings, { seg: 32, tile: .16 }), M.shirt);
  add(st, tubeGeo(scaled(-.075, .11, 1.04, .025), { seg: 32, tile: .14 }), M.denim);
  add(st, tubeGeo(scaled(.08, .31, 1.032, .03), { seg: 18, arc: [-.95, .95], tile: .14 }), M.denim);
  add(st, tubeGeo(scaled(.165, .255, 1.045, .03), { seg: 10, arc: [-.4, .4], fit: true }), M.denimP); // bib pocket
  // straps: front bib corners, over the shoulders, down the back
  for (const sd of [1, -1]) {
    const ctrl: [number, number][] = [[.3, .78], [T - .05, .8], [T + .012, Math.PI / 2], [T - .05, Math.PI - .82], [.28, Math.PI - .62], [.09, Math.PI - .4]];
    const pts: THREE.Vector3[] = [], nrm: THREE.Vector3[] = [];
    for (let i = 0; i < ctrl.length - 1; i++) for (let k = 0; k < 6; k++) {
      const t = k / 6, y = lerp(ctrl[i][0], ctrl[i + 1][0], t), a = sd * lerp(ctrl[i][1], ctrl[i + 1][1], t);
      pts.push(surf(y, a, 1.05)); nrm.push(surfN(y, a));
    }
    pts.push(surf(.09, sd * (Math.PI - .4), 1.05)); nrm.push(surfN(.09, sd * (Math.PI - .4)));
    add(st, sweepGeo(pts, () => [.017, .0045], i => nrm[i], 8), M.denim);
    const bp = surf(.3, sd * .78, 1.075), bq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), surfN(.3, sd * .78));
    add(st, new THREE.CylinderGeometry(.012, .012, .007, 14), M.brass, bp, undefined, bq);
    const sp = surf(.06, sd * 1.45, 1.06), sq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), surfN(.06, sd * 1.45));
    add(st, new THREE.CylinderGeometry(.009, .009, .006, 12), M.brass, sp, undefined, sq);
  }
  // shirt collar: two pointed flaps at the neck
  for (const sd of [1, -1]) {
    const a = V3(sd * .05, T + .028, .012), b = V3(sd * .018, T - .02, B.dep * .72 + .01), c = V3(sd * .07, T - .005, B.dep * .55);
    const g = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, b]); g.setIndex(null); g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0], 2));
    add(st, mergeVertices(g), M.shirt);
  }
  add(st, tubeGeo([{ y: T - .02, rx: .052, rz: .048, cz: -.004 }, { y: T + .05, rx: .044, rz: .042, cz: .0 }, { y: T + .1, rx: .042, rz: .04, cz: .006 }], { seg: 18 }), M.skin); // neck
  bake(st, torso);

  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, T + .14, .012); torso.add(head);
  const sh = new THREE.Group();
  const hg = new THREE.SphereGeometry(1, 56, 40); hg.deleteAttribute('uv'); hg.deleteAttribute('normal');
  const hp = hg.getAttribute('position') as THREE.BufferAttribute, n = V3(), p = V3(), cols: number[] = [];
  for (let i = 0; i < hp.count; i++) {
    n.fromBufferAttribute(hp, i).normalize(); headSurf(n, F, p); hp.setXYZ(i, p.x, p.y, p.z);
    const blush = Math.exp(-(((n.y + .22) / .16) ** 2)) * Math.exp(-(((Math.abs(n.x) - .62) / .2) ** 2)) * Math.max(0, n.z);
    const shade = 1 - .12 * sstep(-n.y, .55, 1) * Math.max(0, -n.z + .3);
    cols.push(shade, shade * (1 - .2 * blush), shade * (1 - .22 * blush));
  }
  hg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const headGeo = mergeVertices(hg); headGeo.computeVertexNormals();
  const headMesh = add(sh, headGeo, M.head);
  const surfAt = (az: number, el: number, out = 0) => { const d = dirOf(az, el); return headSurf(d, F).addScaledVector(d, out); };
  // eyes with lids and brows
  const er = .021;
  for (const sd of [1, -1]) {
    const d = dirOf(sd * .37, .02), c = headSurf(d, F).addScaledVector(d, -er * .45);
    const look = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), V3(sd * .12, .0, 1).normalize());
    add(sh, SPH, M.eye, c, er, look);
    const lid = add(sh, new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI * .3), M.skin, c, er * 1.09);
    lid.rotation.set(.15, sd * .2, 0);
    const lower = add(sh, new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, Math.PI * .78, Math.PI * .22), M.skin, c, er * 1.06); lower.rotation.set(-.35, 0, 0);
    const bp: THREE.Vector3[] = [], bn: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, az = sd * lerp(.18, .58, t), el = .2 + .05 * Math.sin(Math.PI * t) - .03 * t; bp.push(surfAt(az, el, .004)); bn.push(dirOf(az, el)); }
    add(sh, sweepGeo(bp, t => [.0055 * (1 - .5 * t) + .002, .003], i => bn[i], 6), M.brow);
  }
  // nose: bridge sweep, tip, nostril wings
  const [nl, nw, nu, bump] = F.nose;
  const nb = surfAt(0, .06), nt = surfAt(0, -.24).add(V3(0, nu * .012, nl));
  const np: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, q = nb.clone().lerp(nt, t); q.z += Math.sin(Math.PI * t) * bump * .008; np.push(q); }
  add(sh, sweepGeo(np, t => [lerp(.007, nw * .75, t), lerp(.005, .012, t)], () => V3(0, 0, 1), 10), M.skin);
  add(sh, SPH, M.skin, nt, [nw * .7, nw * .62, nw * .6]);
  for (const sd of [1, -1]) add(sh, SPH, M.skin, nt.clone().add(V3(sd * nw * .75, -.006, -.012)), [nw * .45, nw * .4, nw * .45]);
  // mouth: soft smile
  const mp = surfAt(0, -.5, .001), arcA = Math.PI * .55;
  add(sh, new THREE.TorusGeometry(.02, .0035, 6, 16, arcA), M.lip, mp.clone().add(V3(0, .012, -.004)), [1, .6, 1], new THREE.Euler(0, 0, -Math.PI / 2 - arcA / 2));
  // ears
  for (const sd of [1, -1]) {
    const ep = surfAt(sd * Math.PI / 2, -.06, -.002);
    add(sh, SPH, M.skin, ep, [.012 * F.ear, .03 * F.ear, .019 * F.ear], new THREE.Euler(0, sd * -.3, 0));
  }
  // hair
  buildHair(L.hair, F, M.hair, sh, L.hairCol);
  bake(sh, head);

  // ---- arms: plaid sleeve rolled up at the elbow, bare forearm, hand ----
  const arms: Arm[] = [];
  for (const side of [1, -1]) {
    const shG = new THREE.Group(); shG.position.set(side * (B.sh - .03), T - .05, -.005); torso.add(shG);
    const a1 = new THREE.Group(), k = B.arm;
    add(a1, SPH, M.shirt, V3(0, -.012, 0), [.048 * k, .05 * k, .048 * k]);
    add(a1, tubeGeo([{ y: .0, rx: .052 * k, rz: .052 * k }, { y: -ua * .5, rx: .045 * k, rz: .046 * k }, { y: -ua + .02, rx: .042 * k, rz: .043 * k }], { seg: 18, tile: .12 }), M.shirt);
    add(a1, new THREE.TorusGeometry(.042 * k, .014, 10, 22), M.shirt, V3(0, -ua + .022, 0), [1, 1, 1.1], new THREE.Euler(Math.PI / 2, 0, 0));
    bake(a1, shG);
    const el = new THREE.Group(); el.position.y = -ua; shG.add(el);
    const a2 = new THREE.Group();
    add(a2, SPH, M.skin, V3(0, 0, 0), .034 * k);
    add(a2, tubeGeo([{ y: 0, rx: .034 * k, rz: .033 * k }, { y: -fa * .35, rx: .033 * k, rz: .03 * k }, { y: -fa, rx: .024 * k, rz: .02 * k }], { seg: 16 }), M.skin);
    // hand: palm, curled fingers, thumb (thumb to the front)
    add(a2, SPH, M.skin, V3(0, -fa - .03, 0), [.022 * k, .036, .028 * k]);
    add(a2, SPH, M.skin, V3(-side * .004, -fa - .058, .002), [.02 * k, .024, .026 * k]);
    const th2 = add(a2, new THREE.CapsuleGeometry(.008, .022, 4, 8), M.skin, V3(-side * .006, -fa - .03, .024 * k)); th2.rotation.set(.5, 0, 0);
    bake(a2, el);
    const qs = new THREE.Quaternion(), qe = new THREE.Quaternion();
    arms.push({ sh: shG, el, side, qs, qe });
  }
  return { root, pelvis, torso, head, arms: arms as [Arm, Arm], legs: legs as [Leg, Leg], ua, fa: fa + .035, walk: 0, t: Math.random() * 10, th, sh: si + .06, legLen };
}

/** hair styles: Pippi braids sticking out, bob, tonsure, afro */
function buildHair(style: number, F: FaceP, m: THREE.Material, g: THREE.Group, _col: number) {
  const rnd = mulberry(11 + style);
  const minEl = (front: number, side: number, back: number) => (az: number) => { const c = Math.cos(az); return c > 0 ? lerp(side, front, c) : lerp(side, back, -c); };
  const tie = mat(0x3f8a3a, { roughness: .5 });
  if (style === 0) { // Pippi: fringe, two stiff braids sticking out sideways and a bit up
    add(g, capGeo(F, minEl(.4, -.12, -.4), Math.PI / 2, .012), m);
    for (const sd of [1, -1]) {
      const d = dirOf(sd * Math.PI / 2 * .96, .02), s0 = headSurf(d, F).addScaledVector(d, .006);
      const dir = V3(sd, .42, -.12).normalize(), up = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
      for (let i = 0; i < 8; i++) {
        const t = i / 7, r = lerp(.026, .017, t), p = s0.clone().addScaledVector(dir, .02 + t * .17);
        const q = up.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), i % 2 ? .5 : -.5));
        add(g, SPH, m, p, [r, r * 1.35, r * .9], q);
      }
      const end = s0.clone().addScaledVector(dir, .205);
      add(g, new THREE.TorusGeometry(.014, .006, 8, 16), tie, end, undefined, new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir));
      const tuft = add(g, new THREE.ConeGeometry(.02, .045, 10), m, end.clone().addScaledVector(dir, .028)); tuft.quaternion.setFromUnitVectors(V3(0, -1, 0), dir);
    }
  } else if (style === 1) { // bob: straight fringe, hangs to the jaw
    const lo = (az: number) => lerp(.36, -.62, sstep(Math.abs(az), .85, 1.2));
    add(g, capGeo(F, lo, Math.PI / 2, .018, -Math.PI, Math.PI, false, { bottom: .75, drop: .05 }), m);
  } else if (style === 2) { // tonsure: ring of hair, bald crown
    add(g, capGeo(F, minEl(.3, -.12, -.4), .74, .017, -Math.PI, Math.PI, true), m);
  } else { // afro: big round volume covered with curls
    const lo = minEl(.42, -.12, -.36), T = .08, thAt = (t: number) => T * sstep(t, 0, .35);
    add(g, capGeo(F, lo, Math.PI / 2, T), m);
    const N = 150;
    for (let i = 0; i < N; i++) {
      const az = (i * 2.39996) % (Math.PI * 2) - Math.PI, l = lo(az), t = Math.sqrt((i + .5) / N), el = lerp(l + .05, Math.PI / 2, t);
      const d = dirOf(az, el), r = .028 + rnd() * .016;
      add(g, SPH_LO, m, headSurf(d, F).addScaledVector(d, thAt(t) + .004 + rnd() * .008), r);
    }
  }
}

function mulberry(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------- animation ----------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = V3(), _w = V3(), _S = V3(), _E = V3(), _P = V3();
const DOWN = V3(0, -1, 0);
/** legs, torso sway; wk = walk phase (rad), walk = 0..1 how much the figure is walking */
/**
 * 2-bone leg in the side plane: hip angle + knee bend so the sole lands at (fz forward, fy down) from the hip.
 * Angles like the rig: hip.rotation.x < 0 swings the leg forward, knee.rotation.x > 0 bends the shin back.
 */
function legIK(R: Rig, fz: number, fy: number): [number, number] {
  const a = R.th, b = R.sh, U = -fz, W = -fy, D = Math.min(a + b - 1e-3, Math.max(.05, Math.hypot(U, W)));
  const al = Math.atan2(U, W), be = Math.acos(Math.max(-1, Math.min(1, (a * a + D * D - b * b) / (2 * a * D))));
  const p1 = al - be, kx = Math.sin(p1) * a, ky = Math.cos(p1) * a, p2 = Math.atan2(U - kx, W - ky); // knee points forward
  return [p1, Math.max(0, p2 - p1)];
}
/**
 * legs + torso. low (21.11.2026): k = 0 standing .. 1 down; kneel = 1 on one knee (working on the ground) .. 0 deep crouch
 * (waddling with the action button held: short quick steps, the body rocks from side to side).
 */
export function animateLegs(R: Rig, dt: number, wk: number, walk: number, low?: { k: number; kneel: number }) {
  R.t += dt; R.walk = walk;
  const k = low ? Math.max(0, Math.min(1, low.k)) : 0, kn = low ? low.kneel : 0;
  // kneel: pelvis just above the knee on the ground; crouch: a little higher, feet under the body
  const hK = R.th * .92 + .055, hC = R.th * .55 + R.sh * .62, h = hK * kn + hC * (1 - kn);
  for (let i = 0; i < 2; i++) {
    const ph = wk + (i ? Math.PI : 0), s = Math.sin(ph);
    let hip = -s * .5 * walk, knee = Math.max(0, Math.sin(ph + 1.3)) * .85 * walk + .03;
    if (k > 0) {
      // crouch step: the foot swings forward/back under the body, lifted while it moves forward
      const st = .11 * walk, cz = .05 + (i ? -.03 : .07), lift = Math.max(0, Math.cos(ph)) * .055 * walk;
      const [ch, ck] = legIK(R, cz + s * st, -h + lift);
      // kneel: leg 0 in front (foot flat, shin upright), leg 1 kneels (knee on the ground, shin back, toes tucked)
      let kh: number, kk: number;
      if (i === 0) [kh, kk] = legIK(R, .19, -h);
      else { kh = -Math.acos(Math.max(-1, Math.min(1, (h - .055) / R.th))); kk = 1.42 - kh; } // shin falls a little towards the foot: toes on the ground
      const lh = kh * kn + ch * (1 - kn), lk = kk * kn + ck * (1 - kn);
      hip = hip + (lh - hip) * k; knee = knee + (lk - knee) * k;
    }
    R.legs[i].hip.rotation.x = hip;
    R.legs[i].knee.rotation.x = knee;
  }
  R.pelvis.position.y = R.legLen + (h - R.legLen) * k;
  // waddle: the body rocks over the stepping foot
  R.pelvis.rotation.z = Math.sin(wk) * .13 * walk * k * (1 - kn);
  R.pelvis.position.x = Math.sin(wk) * .025 * walk * k * (1 - kn);
  R.torso.rotation.y = Math.sin(wk) * .07 * walk * (1 - k * .6);
  R.torso.rotation.x = .04 * walk + Math.sin(R.t * 1.6) * .008 * (1 - walk); // slight lean when walking, breathing at rest
  R.torso.rotation.z = -R.pelvis.rotation.z * .7;                           // the head stays fairly level while waddling
  R.head.rotation.x = -.03 * walk;
}
/**
 * arms: target = world point for the hand (2-bone IK, elbow towards pole) or null for a relaxed swing.
 * Call after the root's world matrices are up to date.
 */
export function animateArms(R: Rig, dt: number, wk: number, targets: [THREE.Vector3 | null, THREE.Vector3 | null], instant = false) {
  const k = instant ? 1 : 1 - Math.exp(-dt * 16);
  R.torso.getWorldQuaternion(_q2);
  for (let i = 0; i < 2; i++) {
    const A = R.arms[i], T = targets[i];
    let qs: THREE.Quaternion, qe: THREE.Quaternion;
    if (!T) {
      const sw = -Math.sin(wk + (i ? 0 : Math.PI)) * .45 * R.walk;
      qs = new THREE.Quaternion().setFromEuler(_e.set(sw - .05, 0, A.side * (.1 + .02 * Math.sin(R.t * 1.6))));
      qe = new THREE.Quaternion().setFromEuler(_e.set(-.3 - .25 * R.walk, 0, 0));
    } else {
      const a = R.ua, b = R.fa;
      A.sh.getWorldPosition(_S); _v.subVectors(T, _S);
      const dist = Math.max(.05, Math.min(a + b - .002, _v.length())); _v.normalize();
      const cosA = (a * a + dist * dist - b * b) / (2 * a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      _P.set(A.side * .9, -.7, -.45).applyQuaternion(_q2); _P.addScaledVector(_v, -_P.dot(_v)).normalize();
      _E.copy(_S).addScaledVector(_v, a * cosA).addScaledVector(_P, a * sinA);
      const qU = new THREE.Quaternion().setFromUnitVectors(DOWN, _w.subVectors(_E, _S).normalize());
      const hand = _S.clone().addScaledVector(_v, dist);
      const qF = new THREE.Quaternion().setFromUnitVectors(DOWN, _w.subVectors(hand, _E).normalize());
      qs = _q2.clone().invert().multiply(qU); qe = qU.clone().invert().multiply(qF);
    }
    A.qs.slerp(qs, k); A.qe.slerp(qe, k);
    A.sh.quaternion.copy(A.qs); A.el.quaternion.copy(A.qe);
  }
}

/** dispose geometries + materials of a figure (textures are shared and kept) */
export function disposeFarmer(R: Rig) {
  R.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); } });
}
