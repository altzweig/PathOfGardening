// Werkbank-Paket (P2, 25.11.2026): small painted-texture kit for the pea pistol, the workbench and the hammer.
// Same approach as arsenal.ts (colour + bump canvases painted with the same strokes, smooth shading, muted natural
// palette), but standalone so the models work without the arsenal kit and without core.ts (preview page).
// Textures + materials are created once on first use and shared by every copy of a model.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let seed = 23;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const R = (a: number, b: number) => a + rnd() * (b - a);
const hex = (c: number, a = 1) => `rgba(${c >> 16 & 255},${c >> 8 & 255},${c & 255},${a})`;

type Paint = (g: CanvasRenderingContext2D, b: CanvasRenderingContext2D, W: number, H: number) => void;
function painted(W: number, H: number, paint: Paint, rep: [number, number] = [1, 1], rot = 0) {
  const c = document.createElement('canvas'), bc = document.createElement('canvas'); c.width = bc.width = W; c.height = bc.height = H;
  const g = c.getContext('2d')!, b = bc.getContext('2d')!;
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
  paint(g, b, W, H);
  const mk = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4;
    if (rot) { t.center.set(.5, .5); t.rotation = rot; }
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  };
  return { map: mk(c, true), bump: mk(bc, false) };
}
const blot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
  const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
};
/** wood: long wavy grain along x, a few knots */
const woodPaint = (base: number, dark: number, light: number, knots = 2): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) blot(g, R(0, W), R(0, H), R(20, 70), hex(rnd() < .5 ? dark : light, .18));
  for (let i = 0; i < 140; i++) {
    const y0 = R(0, H), dk = rnd() < .62, a = R(.08, .32), w = R(.6, 2.2), amp = R(1, 5), f = R(.008, .03), ph = R(0, 7);
    g.strokeStyle = hex(dk ? dark : light, a); g.lineWidth = w; b.strokeStyle = dk ? `rgba(40,40,40,${a * 1.4})` : `rgba(200,200,200,${a})`; b.lineWidth = w;
    for (const c of [g, b]) { c.beginPath(); for (let x = -4; x <= W + 4; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * .3; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
  }
  for (let k = 0; k < knots; k++) {
    const x = R(W * .2, W * .8), y = R(H * .2, H * .8);
    for (let r = 14; r > 2; r -= 3) { g.strokeStyle = hex(dark, .35); g.lineWidth = 1.4; g.beginPath(); g.ellipse(x, y, r * 1.8, r * .7, 0, 0, 7); g.stroke(); }
    blot(g, x, y, 6, hex(dark, .7)); blot(b, x, y, 8, 'rgba(60,60,60,.8)');
  }
};
/** planks: like wood, plus dark seams every H/n (top of the bench) */
const plankPaint = (base: number, dark: number, light: number, n: number): Paint => (g, b, W, H) => {
  woodPaint(base, dark, light, 3)(g, b, W, H);
  for (let i = 0; i < n; i++) { // every board a little lighter / darker
    const y = i * H / n; g.fillStyle = hex(rnd() < .5 ? dark : light, R(.05, .16)); g.fillRect(0, y, W, H / n);
    g.fillStyle = hex(dark, .85); g.fillRect(0, y, W, 2); b.fillStyle = '#202020'; b.fillRect(0, y, W, 3);
  }
  for (let i = 0; i < 18; i++) { const x = R(0, W), y = R(0, H); g.fillStyle = hex(dark, .5); g.fillRect(x, y, R(6, 30), 1); b.fillStyle = 'rgba(60,60,60,.8)'; b.fillRect(x, y, R(6, 30), 1); } // saw / knife marks
  for (let i = 0; i < 6; i++) blot(g, R(0, W), R(0, H), R(8, 22), 'rgba(30,20,10,.35)'); // stains (oil, glue)
};
/** metal: brushed along x, scratches, darker stains, brighter worn spots */
const metalPaint = (base: number, dark: number, light: number): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 500; i++) { const y = R(0, H), l = R(20, W), x = R(-20, W); g.fillStyle = hex(rnd() < .5 ? dark : light, R(.04, .12)); g.fillRect(x, y, l, 1); }
  for (let i = 0; i < 18; i++) blot(g, R(0, W), R(0, H), R(15, 50), hex(dark, .22));
  for (let i = 0; i < 10; i++) blot(g, R(0, W), R(0, H), R(10, 30), hex(light, .2));
  for (let i = 0; i < 40; i++) {
    const x = R(0, W), y = R(0, H), a = R(0, 7), l = R(4, 26);
    g.strokeStyle = hex(light, R(.2, .5)); g.lineWidth = .7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    b.strokeStyle = 'rgba(70,70,70,.7)'; b.lineWidth = .8; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke();
  }
  for (let i = 0; i < 300; i++) { const v = R(90, 170); b.fillStyle = `rgba(${v},${v},${v},.25)`; b.fillRect(R(0, W), R(0, H), 2, 2); }
};
/** pea-green lacquer: soft mottling, fine worn edges and a few chips showing the wood below */
const lacquerPaint = (base: number, dark: number, light: number): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 50; i++) blot(g, R(0, W), R(0, H), R(10, 40), hex(rnd() < .5 ? dark : light, .2));
  for (let i = 0; i < 60; i++) { const x = R(0, W); g.fillStyle = hex(light, R(.03, .08)); g.fillRect(x, 0, R(1, 3), H); } // brush strokes
  for (let i = 0; i < 14; i++) { const x = R(0, W), y = R(0, H), r = R(1.5, 4); g.fillStyle = 'rgba(120,80,40,.8)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); b.fillStyle = 'rgba(50,50,50,.8)'; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill(); }
  for (let i = 0; i < 200; i++) { b.fillStyle = `rgba(150,150,150,.25)`; b.fillRect(R(0, W), R(0, H), 2, 2); }
};
/** leather / twine wrap: diagonal bands with dark seams */
const wrapPaint = (base: number, dark: number, light: number, bands: number): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  const step = H / bands;
  for (let i = -2; i < bands + 4; i++) {
    const y = i * step;
    const grd = g.createLinearGradient(0, y, 0, y + step); grd.addColorStop(0, hex(dark, .9)); grd.addColorStop(.18, hex(base, 1)); grd.addColorStop(.55, hex(light, .9)); grd.addColorStop(.92, hex(dark, .8));
    const bg = b.createLinearGradient(0, y, 0, y + step); bg.addColorStop(0, '#202020'); bg.addColorStop(.5, '#d8d8d8'); bg.addColorStop(1, '#303030');
    for (const [c, f] of [[g, grd], [b, bg]] as const) { c.save(); c.transform(1, -.35, 0, 1, 0, 0); c.fillStyle = f; c.fillRect(-W, y, W * 3, step); c.restore(); }
  }
};
/** fine diamond checkering (pistol grip panels) */
const checkerPaint = (base: number, dark: number): Paint => (g, b, W, H) => {
  woodPaint(base, dark, base, 0)(g, b, W, H);
  for (let k = -H; k < W + H; k += 7) for (const s of [1, -1]) {
    g.strokeStyle = hex(dark, .55); g.lineWidth = 1.2; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + s * H, H); g.stroke();
    b.strokeStyle = 'rgba(40,40,40,.9)'; b.lineWidth = 1.6; b.beginPath(); b.moveTo(k, 0); b.lineTo(k + s * H, H); b.stroke();
  }
};

type MatOpt = { r?: number; m?: number; bs?: number; cc?: number; e?: number; ei?: number; side?: THREE.Side; color?: number };
function std(tex: { map: THREE.Texture; bump: THREE.Texture } | null, o: MatOpt = {}) {
  const P = { map: tex?.map ?? null, bumpMap: tex?.bump ?? null, bumpScale: o.bs ?? 1.2, roughness: o.r ?? .6, metalness: o.m ?? 0, color: o.color ?? 0xffffff, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide };
  if (o.cc) return new THREE.MeshPhysicalMaterial({ ...P, clearcoat: o.cc, clearcoatRoughness: .3 });
  return new THREE.MeshStandardMaterial(P);
}
function makeKit() {
  seed = 23;
  const W = (base: number, dark: number, light: number, r = .6, rot = 0) => std(painted(256, 256, woodPaint(base, dark, light), [1, 1], rot), { r, bs: 1.4 });
  const Mt = (base: number, dark: number, light: number, r: number, m: number) => std(painted(256, 256, metalPaint(base, dark, light)), { r, m, bs: .8 });
  return {
    // pistol: light beech frame, walnut grip panels, pea-green lacquered slide
    beech: W(0xb98a56, 0x7a5430, 0xdcb482, .55), beechT: W(0xb98a56, 0x7a5430, 0xdcb482, .55, Math.PI / 2),
    walnut: W(0x5a3a24, 0x2e1c10, 0x8a6040), walnutT: W(0x5a3a24, 0x2e1c10, 0x8a6040, .55, Math.PI / 2),
    gripPanel: std(painted(128, 128, checkerPaint(0x4e321e, 0x1e120a)), { r: .7, bs: 2.2 }),
    pea: std(painted(256, 256, lacquerPaint(0x6aa83a, 0x3e7420, 0xa6d470)), { r: .38, bs: .6, cc: .55 }),
    peaDark: std(null, { color: 0x3a6a22, r: .5 }),
    // bench: weathered oak planks, darker legs
    oakTop: std(painted(512, 256, plankPaint(0xa27a4c, 0x5e4226, 0xcaa676, 4)), { r: .78, bs: 1.6 }),
    oak: W(0x94704a, 0x5a3e22, 0xc09a6c, .8), oakT: W(0x94704a, 0x5a3e22, 0xc09a6c, .8, Math.PI / 2),
    pine: W(0xd4b07a, 0x9a7444, 0xf0d6a4, .8), pineT: W(0xd4b07a, 0x9a7444, 0xf0d6a4, .8, Math.PI / 2),
    darkWood: W(0x3a2618, 0x1c1009, 0x5a3e28, .6),
    // metals
    iron: Mt(0x4a4f55, 0x24282c, 0x9aa2aa, .45, .85), steel: Mt(0x8a9098, 0x4a5058, 0xd8dde2, .3, .9),
    brass: Mt(0xb08d4a, 0x5e4620, 0xe8cc88, .3, .9), paintRed: Mt(0x8a2a1c, 0x4a120a, 0xb8503a, .5, .35),
    leather: std(painted(128, 256, wrapPaint(0x4a2e1c, 0x22140a, 0x6e4a2e, 7), [1, 2]), { r: .75, bs: 2 }),
    twine: std(painted(128, 256, wrapPaint(0xb59a6a, 0x6e5a3a, 0xd8c49a, 12), [1, 3]), { r: .9, bs: 2.5 }),
    soot: std(null, { color: 0x1c1a18, r: .9 }),
    paper: std(null, { color: 0xe8dcc0, r: .85 }),
  };
}
export type CraftKit = ReturnType<typeof makeKit>;
let KIT: CraftKit | null = null, ENV: THREE.Texture | null = null, ENV_K = .5;
export const craftKit = () => { if (!KIT) { KIT = makeKit(); applyEnv(); } return KIT; };
function applyEnv() {
  if (!KIT) return;
  for (const m of Object.values(KIT) as THREE.MeshStandardMaterial[]) { m.envMap = ENV; m.envMapIntensity = ENV_K * (m.metalness > .3 ? 1 : .45); m.needsUpdate = true; }
}
/** same as setArsenalEnv: reflections for metal + lacquer (call with the same texture) */
export function setCraftEnv(t: THREE.Texture) { ENV = t; applyEnv(); }
/** same as setArsenalLight: k = 0 (night) .. 1 (day) */
export function setCraftLight(k: number) {
  const v = .12 + .5 * k; if (Math.abs(v - ENV_K) < .01 || !KIT) { ENV_K = v; return; } ENV_K = v;
  for (const m of Object.values(KIT) as THREE.MeshStandardMaterial[]) m.envMapIntensity = ENV_K * (m.metalness > .3 ? 1 : .45);
}

// ---------------- geometry helpers (as in arsenal.ts) ----------------
/** turned part: profile [radius, z] along +z */
export function lathe(prof: [number, number][], seg = 20) {
  const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(Math.max(1e-4, r), z)), seg); g.rotateX(Math.PI / 2); return g;
}
export const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
/** side profile [z, y] (optional holes) extruded to the given width (x), bevelled edges, centred on x = 0 */
export function profile(pts: [number, number][], width: number, bevel = .006, holes: [number, number][][] = [], uvScale = 3) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(.002, width - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 12 });
  g.rotateY(-Math.PI / 2); g.computeBoundingBox(); const bb = g.boundingBox!; g.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  g.computeVertexNormals(); return g;
}
export const sph = (ws = 16, hs = 12) => new THREE.SphereGeometry(1, ws, hs);
export function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
}
/** cylinder between two points */
export function rod(parent: THREE.Object3D, mat: THREE.Material, r: number, a: THREE.Vector3, b: THREE.Vector3, seg = 10) {
  const d = b.clone().sub(a), m = mesh(parent, new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return m;
}
