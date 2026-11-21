// Arsenal: hand-built weapon props (all 16 weapons), procedural but not low-poly.
// Smooth shading, turned (lathe) profiles, swept and tapered curves, bevelled boxes and extruded profiles,
// every surface with its own painted texture + bump (wood grain, brushed / worn metal, leather and twine wraps,
// asparagus fibres, cabbage veins, lemon pores, lacquered chili skin). Muted, natural palettes per weapon.
// Textures and materials are created once and shared; geometry is built once per player and weapon.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ComboId } from '../config';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const R = (a: number, b: number) => a + rnd() * (b - a);
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (c: number, a = 1) => `rgba(${c >> 16 & 255},${c >> 8 & 255},${c & 255},${a})`;
const mix = (a: number, b: number, t: number) => {
  const r = (a >> 16 & 255) + ((b >> 16 & 255) - (a >> 16 & 255)) * t, g = (a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * t, bb = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bb);
};

// ================= textures =================
type Paint = (g: CanvasRenderingContext2D, b: CanvasRenderingContext2D, W: number, H: number) => void;
/** paints colour + bump canvases in one go (same strokes, so relief matches the picture) */
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
/** wood: long wavy grain along x, a few knots; base / dark / light tones */
const woodPaint = (base: number, dark: number, light: number): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) blot(g, R(0, W), R(0, H), R(20, 70), hex(rnd() < .5 ? dark : light, .18));
  for (let i = 0; i < 140; i++) {
    const y0 = R(0, H), dark2 = rnd() < .62, a = R(.08, .32), w = R(.6, 2.2), amp = R(1, 5), f = R(.008, .03), ph = R(0, 7);
    g.strokeStyle = hex(dark2 ? dark : light, a); g.lineWidth = w; b.strokeStyle = dark2 ? `rgba(40,40,40,${a * 1.4})` : `rgba(200,200,200,${a})`; b.lineWidth = w;
    for (const c of [g, b]) { c.beginPath(); for (let x = -4; x <= W + 4; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * .3; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
  }
  for (let k = 0; k < 2; k++) { // knots
    const x = R(W * .2, W * .8), y = R(H * .2, H * .8);
    for (let r = 14; r > 2; r -= 3) { g.strokeStyle = hex(dark, .35); g.lineWidth = 1.4; g.beginPath(); g.ellipse(x, y, r * 1.8, r * .7, 0, 0, 7); g.stroke(); }
    blot(g, x, y, 6, hex(dark, .7)); blot(b, x, y, 8, 'rgba(60,60,60,.8)');
  }
};
/** metal: brushed along x, scratches, darker stains in the corners, brighter worn spots */
const metalPaint = (base: number, dark: number, light: number, patina = 0): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 500; i++) { const y = R(0, H), l = R(20, W), x = R(-20, W); g.fillStyle = hex(rnd() < .5 ? dark : light, R(.04, .12)); g.fillRect(x, y, l, 1); }
  for (let i = 0; i < 18; i++) blot(g, R(0, W), R(0, H), R(15, 50), hex(dark, .22));
  for (let i = 0; i < 10; i++) blot(g, R(0, W), R(0, H), R(10, 30), hex(light, .2));
  if (patina) for (let i = 0; i < 26; i++) blot(g, R(0, W), R(0, H), R(6, 26), hex(patina, R(.2, .45)));
  for (let i = 0; i < 40; i++) { // scratches
    const x = R(0, W), y = R(0, H), a = R(0, 7), l = R(4, 26);
    g.strokeStyle = hex(light, R(.2, .5)); g.lineWidth = .7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    b.strokeStyle = 'rgba(70,70,70,.7)'; b.lineWidth = .8; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke();
  }
  for (let i = 0; i < 300; i++) { const v = R(90, 170); b.fillStyle = `rgba(${v},${v},${v},.25)`; b.fillRect(R(0, W), R(0, H), 2, 2); } // fine pitting
};
/** diagonal wrap (leather strap or twine): bands with dark seams; twine adds fibre twist */
const wrapPaint = (base: number, dark: number, light: number, bands: number, twine: boolean): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  const step = H / bands;
  for (let i = -2; i < bands + 4; i++) {
    const y = i * step;
    // band body: lighter middle, dark seam at the edge (raised middle in the bump)
    const grd = g.createLinearGradient(0, y, 0, y + step); grd.addColorStop(0, hex(dark, .9)); grd.addColorStop(.18, hex(base, 1)); grd.addColorStop(.55, hex(light, .9)); grd.addColorStop(.92, hex(dark, .8));
    const bg = b.createLinearGradient(0, y, 0, y + step); bg.addColorStop(0, '#202020'); bg.addColorStop(.5, '#d8d8d8'); bg.addColorStop(1, '#303030');
    for (const [c, f] of [[g, grd], [b, bg]] as const) { c.save(); c.transform(1, -.35, 0, 1, 0, 0); c.fillStyle = f; c.fillRect(-W, y, W * 3, step); c.restore(); }
    if (twine) for (let k = 0; k < 16; k++) { g.save(); g.transform(1, -.35, 0, 1, 0, 0); g.strokeStyle = hex(rnd() < .5 ? dark : light, .35); g.lineWidth = 1; const x = R(-W, W * 2); g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + step * .8, y + step - 2); g.stroke(); g.restore(); }
  }
  for (let i = 0; i < 200; i++) { g.fillStyle = hex(dark, R(.05, .15)); g.fillRect(R(0, W), R(0, H), R(1, 3), R(1, 3)); }
};
/** asparagus: fibres along the spear (texture v = along), pale base, violet scales at the tip, scale rows along the shaft */
const aspPaint: Paint = (g, b, W, H) => {
  const grd = g.createLinearGradient(0, H, 0, 0); // v=0 at the bottom of the canvas (flipY) = base of the spear
  grd.addColorStop(0, '#c9cf9a'); grd.addColorStop(.18, '#8eab5a'); grd.addColorStop(.6, '#5f8a3a'); grd.addColorStop(.86, '#557a36'); grd.addColorStop(.93, '#6a4d74'); grd.addColorStop(1, '#4a3058');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) { const x = R(0, W), a = R(.05, .2); g.strokeStyle = rnd() < .5 ? `rgba(40,70,25,${a})` : `rgba(210,230,160,${a})`; g.lineWidth = R(.6, 1.6); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + R(-3, 3), H); g.stroke(); b.strokeStyle = `rgba(${rnd() < .5 ? 90 : 170},${rnd() < .5 ? 90 : 170},128,.4)`; b.beginPath(); b.moveTo(x, 0); b.lineTo(x, H); b.stroke(); }
  // scale rows (small triangular bracts) up the shaft, denser and violet towards the tip
  for (let row = 0; row < 9; row++) {
    const v = .25 + row * .085, y = H * (1 - v), tip = v > .82;
    for (let k = 0; k < 4; k++) {
      const x = (k + (row % 2) * .5) / 4 * W, w = W / 7, h = H * (tip ? .05 : .035);
      g.fillStyle = tip ? 'rgba(90,50,105,.85)' : 'rgba(70,95,45,.7)';
      g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x, y - h); g.lineTo(x + w / 2, y); g.closePath(); g.fill();
      g.strokeStyle = tip ? 'rgba(150,110,170,.6)' : 'rgba(170,200,120,.5)'; g.lineWidth = 1; g.stroke();
      b.fillStyle = '#d0d0d0'; b.beginPath(); b.moveTo(x - w / 2, y); b.lineTo(x, y - h); b.lineTo(x + w / 2, y); b.closePath(); b.fill();
    }
  }
};
/** cabbage leaf: veins branching from a pale midrib (texture u across the leaf, v along) */
const leafPaint = (base: number, dark: number, vein: number): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) blot(g, R(0, W), R(0, H), R(10, 40), hex(rnd() < .5 ? dark : mix(base, vein, .4), .25));
  const vein1 = (c: CanvasRenderingContext2D, col: string, w: number) => {
    c.strokeStyle = col; c.lineWidth = w * 2.2; c.beginPath(); c.moveTo(W / 2, H); c.lineTo(W / 2, 0); c.stroke();
    let sv = 5;
    for (let k = 0; k < 6; k++) for (const sd of [-1, 1]) {
      sv = (sv * 16807) % 2147483647; const j = (sv / 2147483647 - .5) * H * .06;
      const y = H * (k + .6) / 6 + j; c.lineWidth = w * (1 - k * .08); c.beginPath(); c.moveTo(W / 2, y);
      c.bezierCurveTo(W / 2 + sd * W * .12, y - H * .02, W / 2 + sd * W * .3, y - H * .12, W / 2 + sd * W * .5, y - H * .2); c.stroke();
    }
  };
  vein1(g, hex(vein, .38), 1.6); vein1(b, 'rgba(200,200,200,.7)', 2.2);
  for (let i = 0; i < 400; i++) { const x = R(0, W), y = R(0, H); b.fillStyle = `rgba(60,60,60,${R(.05, .2)})`; b.fillRect(x, y, 3, 3); } // crinkle
};
/** lemon peel: warm yellow with ochre mottling, pores as dents */
const lemonPaint: Paint = (g, b, W, H) => {
  g.fillStyle = '#dcb93a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) blot(g, R(0, W), R(0, H), R(8, 30), rnd() < .5 ? 'rgba(200,150,30,.3)' : 'rgba(240,215,110,.3)');
  for (let i = 0; i < 1400; i++) { const x = R(0, W), y = R(0, H), r = R(.6, 1.6); g.fillStyle = 'rgba(170,120,20,.35)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); b.fillStyle = 'rgba(40,40,40,.7)'; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill(); }
};
/** chili skin: deep red, long soft highlights and creases along the pod */
const chiliPaint = (base: number, dark: number, light: number): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) { const x = R(0, W); g.fillStyle = hex(rnd() < .55 ? dark : light, R(.12, .3)); g.fillRect(x, 0, R(2, 10), H); }
  for (let i = 0; i < 14; i++) { const x = R(0, W), w = R(1, 2.5); g.strokeStyle = hex(dark, .45); g.lineWidth = w; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * .05 + i) * 3, y); g.stroke(); b.strokeStyle = 'rgba(50,50,50,.8)'; b.lineWidth = w * 1.5; b.beginPath(); b.moveTo(x, 0); for (let y = 0; y <= H; y += 8) b.lineTo(x + Math.sin(y * .05 + i) * 3, y); b.stroke(); }
};
const berryPaint: Paint = (g, b, W, H) => {
  g.fillStyle = '#8a1424'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) blot(g, R(0, W), R(0, H), R(5, 22), rnd() < .5 ? 'rgba(60,8,20,.4)' : 'rgba(190,50,60,.3)');
  for (let i = 0; i < 200; i++) { b.fillStyle = `rgba(150,150,150,.3)`; b.fillRect(R(0, W), R(0, H), 2, 2); }
};
/** cloth / canvas wrap with a fine weave */
const canvasPaint = (base: number, dark: number): Paint => (g, b, W, H) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 3) { g.fillStyle = hex(dark, .12); g.fillRect(0, y, W, 1); b.fillStyle = 'rgba(60,60,60,.5)'; b.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { g.fillStyle = hex(dark, .08); g.fillRect(x, 0, 1, H); b.fillStyle = 'rgba(80,80,80,.4)'; b.fillRect(x, 0, 1, H); }
  for (let i = 0; i < 30; i++) blot(g, R(0, W), R(0, H), R(10, 40), hex(dark, .2));
};

// ================= materials =================
type MatOpt = { r?: number; m?: number; bs?: number; cc?: number; e?: number; ei?: number; side?: THREE.Side; op?: number; color?: number };
function std(tex: { map: THREE.Texture; bump: THREE.Texture } | null, o: MatOpt = {}) {
  const P = {
    map: tex?.map ?? null, bumpMap: tex?.bump ?? null, bumpScale: o.bs ?? 1.2, roughness: o.r ?? .6, metalness: o.m ?? 0, color: o.color ?? 0xffffff,
    emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide, transparent: o.op !== undefined, opacity: o.op ?? 1,
  };
  if (o.cc) return new THREE.MeshPhysicalMaterial({ ...P, clearcoat: o.cc, clearcoatRoughness: .25 });
  return new THREE.MeshStandardMaterial(P);
}
type Kit = ReturnType<typeof makeKit>;
let KIT: Kit | null = null, ENV: THREE.Texture | null = null, ENV_K = .5;
const kit = () => { if (!KIT) { KIT = makeKit(); applyEnv(); } return KIT; };
/** reflections for metal, lacquer and glossy fruit (the game has no scene environment); envMapIntensity follows the daylight */
function applyEnv() {
  if (!KIT) return;
  for (const m of Object.values(KIT) as THREE.MeshStandardMaterial[]) { if (!(m instanceof THREE.MeshStandardMaterial)) continue; m.envMap = ENV; m.envMapIntensity = ENV_K * (m.metalness > .3 ? 1 : .45); m.needsUpdate = true; }
}
export function setArsenalEnv(t: THREE.Texture) { ENV = t; applyEnv(); }
/** k: 0 (night) .. 1 (day) */
export function setArsenalLight(k: number) {
  const v = .12 + .5 * k; if (Math.abs(v - ENV_K) < .01 || !KIT) { ENV_K = v; return; } ENV_K = v;
  for (const m of Object.values(KIT) as THREE.MeshStandardMaterial[]) if (m instanceof THREE.MeshStandardMaterial) m.envMapIntensity = ENV_K * (m.metalness > .3 ? 1 : .45);
}
function makeKit() {
  seed = 11;
  const W = (base: number, dark: number, light: number, r = .55, rot = 0) => std(painted(256, 256, woodPaint(base, dark, light), [1, 1], rot), { r, bs: 1.4 });
  const Mt = (base: number, dark: number, light: number, r: number, m: number, patina = 0) => std(painted(256, 256, metalPaint(base, dark, light, patina)), { r, m, bs: .8 });
  const leather = painted(128, 256, wrapPaint(0x4a2e1c, 0x22140a, 0x6e4a2e, 7, false), [1, 2]);
  const twine = painted(128, 256, wrapPaint(0xb59a6a, 0x6e5a3a, 0xd8c49a, 12, true), [1, 3]);
  const asp = painted(128, 512, aspPaint);
  return {
    // woods (grain along the part: extruded parts use the default orientation, turned parts the rotated one)
    walnut: W(0x5a3a24, 0x2e1c10, 0x8a6040), walnutT: W(0x5a3a24, 0x2e1c10, 0x8a6040, .55, Math.PI / 2),
    ash: W(0xa88458, 0x6a4c2c, 0xd2b484, .6, Math.PI / 2), cherry: W(0x6e2e22, 0x3a140e, 0x9a4a36),
    oxblood: W(0x5e1a16, 0x30090a, 0x8c3328, .45), oxbloodT: W(0x5e1a16, 0x30090a, 0x8c3328, .45, Math.PI / 2),
    lemonWood: W(0xc8a644, 0x8a6a22, 0xe8d07a, .4), lemonWoodT: W(0xc8a644, 0x8a6a22, 0xe8d07a, .4, Math.PI / 2),
    darkWood: W(0x3a2618, 0x1c1009, 0x5a3e28, .5), darkWoodT: W(0x3a2618, 0x1c1009, 0x5a3e28, .5, Math.PI / 2),
    // metals
    iron: Mt(0x4a4f55, 0x24282c, 0x9aa2aa, .45, .85), brass: Mt(0xb08d4a, 0x5e4620, 0xe8cc88, .3, .9), copper: Mt(0xa8643a, 0x5a2e18, 0xe0a070, .35, .85, 0x4f8a72),
    oliveSteel: Mt(0x55603a, 0x2c3220, 0x8a9468, .55, .5), yellowSteel: Mt(0xc8a83a, 0x7a5e1a, 0xf0d888, .4, .45),
    // wraps
    leather: std(leather, { r: .75, bs: 2 }), twine: std(twine, { r: .9, bs: 2.5 }), linen: std(null, { color: 0xe8dcc0, r: .8 }),
    canvas: std(painted(128, 128, canvasPaint(0x6a6a44, 0x2e2e1a), [2, 2]), { r: .9, bs: 1.5 }),
    // fruit
    asp: std(asp, { r: .55, bs: 1.5 }), aspBright: std(asp, { r: .45, bs: 1.5, e: 0x6a9a30, ei: .35 }),
    leaf: std(painted(256, 256, leafPaint(0x6f8f4a, 0x3c5a28, 0xd8e8b0)), { r: .7, bs: 2, side: THREE.DoubleSide }),
    leafPale: std(painted(256, 256, leafPaint(0xa8c07a, 0x6a8a48, 0xeef4d8)), { r: .7, bs: 2, side: THREE.DoubleSide }),
    redLeaf: std(painted(256, 256, leafPaint(0x5e2a4c, 0x341630, 0xc8a0c0)), { r: .65, bs: 2, side: THREE.DoubleSide }),
    lemon: std(painted(256, 256, lemonPaint), { r: .5, bs: 1.6, cc: .4 }),
    chili: std(painted(256, 256, chiliPaint(0x9e2216, 0x5e0e08, 0xd85a3a)), { r: .32, bs: 1, cc: .8 }),
    chiliGold: std(painted(256, 256, chiliPaint(0xd88a22, 0x9a4a10, 0xf4c45a)), { r: .3, bs: 1, cc: .8 }),
    calyx: std(painted(128, 128, chiliPaint(0x4a6a2e, 0x24381a, 0x7a9a4a)), { r: .6, bs: 1 }),
    berry: std(painted(128, 128, berryPaint), { r: .3, bs: .6, cc: 1, e: 0x5a0a14, ei: .35 }),
    blueberry: std(null, { color: 0x3a4aa8, r: .35, cc: .6, e: 0x10183a, ei: .3 }),
    berryDark: std(null, { color: 0x2a0a0e, r: .7 }),
    glass: std(null, { color: 0xcfe6e0, r: .08, m: 0, op: .28 }), jam: std(null, { color: 0x7a0e1a, r: .2, e: 0x3a0408, ei: .6, op: .9 }),
    soot: std(null, { color: 0x1c1a18, r: .9 }), white: std(null, { color: 0xeae4d0, r: .5 }), ink: std(null, { color: 0x1a1612, r: .6 }),
    // energy: muted glow, only where power sits
    glowLemon: std(null, { color: 0xfff2a0, e: 0xffd640, ei: 1.6, r: .4 }), glowEmber: std(null, { color: 0xffb060, e: 0xff6a10, ei: 2, r: .5 }),
    glowBerry: std(null, { color: 0xff6070, e: 0xd01028, ei: 1.4, r: .4 }),
  };
}

// ================= geometry =================
/** turned part: profile [radius, z] along +z */
function lathe(prof: [number, number][], seg = 24) {
  const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(Math.max(1e-4, r), z)), seg); g.rotateX(Math.PI / 2); return g;
}
/** swept tube along a curve, radius per t (0..1), optional elliptic cross-section, end caps */
function sweep(pts: THREE.Vector3[], rf: (t: number) => number, o: { radial?: number; steps?: number; sx?: number; sy?: number; caps?: boolean; closed?: boolean } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), N = o.steps ?? 36, M = o.radial ?? 14, sx = o.sx ?? 1, sy = o.sy ?? 1;
  const P: THREE.Vector3[] = [], T: THREE.Vector3[] = [], Nn: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) { P.push(curve.getPointAt(i / N)); T.push(curve.getTangentAt(i / N).normalize()); }
  let n = Math.abs(T[0].y) > .9 ? V3(1, 0, 0) : V3(0, 1, 0); n.sub(T[0].clone().multiplyScalar(n.dot(T[0]))).normalize();
  for (let i = 0; i <= N; i++) { // parallel transport: no twisting, no flips
    if (i > 0) { const ax = V3().crossVectors(T[i - 1], T[i]), l = ax.length(); if (l > 1e-6) n.applyAxisAngle(ax.divideScalar(l), Math.asin(Math.min(1, l))); n.sub(T[i].clone().multiplyScalar(n.dot(T[i]))).normalize(); }
    Nn.push(n.clone()); B.push(V3().crossVectors(T[i], n).normalize());
  }
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const r = rf(i / N);
    for (let j = 0; j <= M; j++) {
      const a = j / M * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const p = P[i].clone().addScaledVector(B[i], c * r * sx).addScaledVector(Nn[i], s * r * sy);
      const nn = V3().addScaledVector(B[i], c / sx).addScaledVector(Nn[i], s / sy).normalize();
      pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(j / M, i / N);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  if (o.caps) for (const [i, sgn] of [[0, -1], [N, 1]] as const) {
    if (rf(i / N) < 1e-3) continue;
    const c0 = pos.length / 3; pos.push(P[i].x, P[i].y, P[i].z); nor.push(T[i].x * sgn, T[i].y * sgn, T[i].z * sgn); uv.push(.5, .5);
    for (let j = 0; j <= M; j++) { const k = (i * (M + 1) + j) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); nor.push(T[i].x * sgn, T[i].y * sgn, T[i].z * sgn); uv.push(.5 + Math.cos(j / M * 6.283) * .5, .5 + Math.sin(j / M * 6.283) * .5); }
    for (let j = 0; j < M; j++) sgn > 0 ? idx.push(c0, c0 + 1 + j, c0 + 2 + j) : idx.push(c0, c0 + 2 + j, c0 + 1 + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
/** side profile [z, y] extruded to the given width (x), bevelled edges */
function profile(pts: [number, number][], width: number, bevel = .008, uvScale = 3) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(.002, width - bevel * 2), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 });
  g.rotateY(-Math.PI / 2); g.computeBoundingBox(); const bb = g.boundingBox!; g.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  g.computeVertexNormals(); return g;
}
const sph = (ws = 20, hs = 14) => new THREE.SphereGeometry(1, ws, hs);
function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
}
/** short turned band (ring) around the z axis */
const band = (parent: THREE.Object3D, mat: THREE.Material, r: number, len: number, z: number, x = 0, y = 0) =>
  mesh(parent, lathe([[r * .9, -len / 2], [r, -len * .35], [r, len * .35], [r * .9, len / 2]], 20), mat, x, y, z);
/** wrap (leather/twine) as a slightly bulging tube section around the z axis */
const wrapZ = (parent: THREE.Object3D, mat: THREE.Material, r: number, z0: number, z1: number, x = 0, y = 0) =>
  mesh(parent, lathe([[r * .92, z0], [r, z0 + .006], [r * 1.03, (z0 + z1) / 2], [r, z1 - .006], [r * .92, z1]], 18), mat, x, y, 0);
/** cylinder (tube) between two points */
function rod(parent: THREE.Object3D, mat: THREE.Material, r: number, a: THREE.Vector3, b: THREE.Vector3, radial = 10) {
  return mesh(parent, sweep([a, b], () => r, { radial, steps: 2, caps: true }), mat);
}
const rivet = (parent: THREE.Object3D, mat: THREE.Material, r: number, x: number, y: number, z: number) => mesh(parent, sph(10, 6), mat, x, y, z, r, r * .6, r);

// ================= fruit =================
/** asparagus spear from a to b (bent by `bend` sideways), pale cut base, violet bud tip */
function asparagus(parent: THREE.Object3D, mat: THREE.Material, r: number, a: THREE.Vector3, b: THREE.Vector3, bend = V3()) {
  const mid = a.clone().lerp(b, .5).add(bend);
  const rf = (t: number) => r * (1 + .12 * sstep(.78, .9, t) - .12 * sstep(.9, 1, t)) * (t > .92 ? Math.pow(Math.max(0, (1 - t) / .08), .55) : 1);
  return mesh(parent, sweep([a, mid, b], rf, { radial: 12, steps: 28, caps: true }), mat);
}
/** round berry with a dark sunken crown */
function berryM(parent: THREE.Object3D, r: number, x: number, y: number, z: number, mat?: THREE.Material) {
  const K = kit(), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(R(-.6, .6), R(0, 7), R(-.6, .6)); parent.add(g);
  mesh(g, sph(18, 12), mat ?? K.berry, 0, 0, 0, r, r * .92, r);
  mesh(g, new THREE.ConeGeometry(1, 1, 5), K.berryDark, 0, r * .86, 0, r * .32, r * .18, r * .32).rotation.x = Math.PI;
  return g;
}
/** lemon along +z: elliptic body, pointed nubs at both ends */
function lemonGeo(r: number, len: number) {
  const prof: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, z = (t - .5) * len, e = Math.sin(t * Math.PI);
    let rr = r * Math.pow(e, .62);
    if (t < .08 || t > .92) rr = r * .18 * Math.sin(Math.min(t, 1 - t) / .08 * Math.PI / 2); // nubs
    prof.push([rr, z]);
  }
  prof[0][0] = 0; prof[24][0] = 0;
  return lathe(prof, 26);
}
/** chili pod: curved, tapering, glossy; calyx cap + stem at the start (a), pointed end at the tip */
function chiliM(parent: THREE.Object3D, mat: THREE.Material, len: number, r: number, curl = .3, stem = true) {
  const K = kit(), g = new THREE.Group(); parent.add(g);
  const pts = [V3(0, 0, 0), V3(0, 0, len * .3), V3(0, -curl * len * .15, len * .65), V3(0, -curl * len * .5, len * .98)];
  const rf = (t: number) => r * (.82 + .18 * sstep(0, .12, t)) * Math.pow(1 - sstep(.25, 1, t), .7) + r * .02;
  mesh(g, sweep(pts, rf, { radial: 16, steps: 40, sy: .9, caps: true }), mat);
  // calyx: a cup with five lobes folding over the shoulder
  mesh(g, lathe([[r * .5, -.004], [r * .95, .004], [r * .9, .02], [r * .6, .03], [r * .25, .035]], 18), K.calyx, 0, 0, -.012);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, l = mesh(g, sph(10, 8), K.calyx, Math.cos(a) * r * .7, Math.sin(a) * r * .7, .012, r * .32, r * .18, r * .5); l.rotation.set(-Math.sin(a) * .5, Math.cos(a) * .5, a); }
  if (stem) mesh(g, sweep([V3(0, 0, -.01), V3(0, r * .3, -r * .9), V3(0, r * 1.1, -r * 1.5)], t => r * (.2 - .05 * t), { radial: 8, steps: 10, caps: true }), K.calyx);
  return g;
}
/** cabbage head: crinkled core + overlapping leaf shells with veins, outer leaves curling out */
function cabbageM(parent: THREE.Object3D, r: number, leaf: THREE.Material, inner: THREE.Material) {
  const g = new THREE.Group(); parent.add(g);
  const core = sph(22, 16), p = core.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = V3(p.getX(i), p.getY(i), p.getZ(i)); v.multiplyScalar(1 + .06 * Math.sin(v.x * 9) * Math.sin(v.y * 7 + v.z * 5)); p.setXYZ(i, v.x, v.y, v.z); }
  core.computeVertexNormals(); mesh(g, core, inner, 0, 0, 0, r * .9, r * .86, r * .9);
  for (let k = 0; k < 7; k++) {
    const outer = k >= 3, ph = k * 2.39, len = outer ? 1.7 : 1.35;
    const sh = new THREE.SphereGeometry(1, 16, 12, -len / 2, len, outer ? .5 : .2, outer ? 2.1 : 1.9), q = sh.attributes.position;
    if (outer) for (let i = 0; i < q.count; i++) { const v = V3(q.getX(i), q.getY(i), q.getZ(i)), lip = sstep(.2, -.6, v.y); v.x *= 1 + lip * .25; v.z *= 1 + lip * .25; v.y += lip * .08; q.setXYZ(i, v.x, v.y, v.z); }
    sh.computeVertexNormals();
    const m = mesh(g, sh, outer ? leaf : inner, 0, 0, 0, r * (outer ? 1.05 : .97), r * (outer ? 1 : .94), r * (outer ? 1.05 : .97));
    m.rotation.set(R(-.25, .25), ph, R(-.2, .2));
  }
  return g;
}

// ================= crossbows (asp, jam, sour) =================
interface Bow { stock: THREE.Material; stockDk: THREE.Material; metal: THREE.Material; limb: THREE.Material; accent?: THREE.Material }
/** shared crossbow: extruded stock with pistol grip, brass rail and fittings, bundled asparagus limbs bound with twine, linen string */
function crossbow(a: THREE.Group, B: Bow) {
  const K = kit();
  mesh(a, profile([[-.3, .028], [-.12, .036], [.1, .034], [.3, .03], [.335, .016], [.335, -.016], [.12, -.026], [-.11, -.03], [-.135, -.06], [-.15, -.125], [-.19, -.135], [-.205, -.125], [-.196, -.05], [-.25, -.04], [-.305, -.03], [-.315, 0]], .056, .009), B.stock);
  mesh(a, profile([[-.31, .03], [-.33, .03], [-.33, -.035], [-.31, -.034]], .062, .006), B.stockDk); // butt plate
  mesh(a, rbox(.02, .008, .4, .003), B.metal, 0, .036, .1); // rail
  mesh(a, rbox(.064, .03, .05, .008), B.metal, 0, 0, .315); // nose cap
  const tg = mesh(a, new THREE.TorusGeometry(.028, .005, 8, 18, Math.PI), B.metal, 0, -.03, -.1); tg.rotation.set(Math.PI, Math.PI / 2, 0); // trigger guard
  mesh(a, rbox(.008, .03, .01, .003), B.metal, 0, -.045, -.1).rotation.x = .3; // trigger
  mesh(a, lathe([[.012, -.012], [.018, -.008], [.018, .008], [.012, .012]], 14), B.metal, 0, .04, -.02).rotation.y = Math.PI / 2; // nut / latch
  for (const z of [-.24, -.05, .2]) for (const sd of [-1, 1]) rivet(a, B.metal, .006, sd * .029, .005, z);
  const st = mesh(a, new THREE.TorusGeometry(.04, .006, 8, 20), B.metal, 0, -.01, .375); st.rotation.y = Math.PI / 2; st.scale.y = 1.3; // stirrup
  const tips: THREE.Vector3[] = [];
  for (const sd of [-1, 1]) { // limbs: two spears each, swept back, bound at the root
    const tip = V3(sd * .3, .005, .16); tips.push(tip);
    for (const dy of [-.011, .011]) asparagus(a, B.limb, .013, V3(sd * .02, dy, .3), tip.clone().add(V3(sd * .01, dy * .5, 0)), V3(sd * .02, 0, .04));
    mesh(a, lathe([[.018, -.02], [.021, -.012], [.022, 0], [.021, .012], [.018, .02]], 14), K.twine, sd * .04, 0, .285).rotation.y = sd * .5;
    if (B.accent) mesh(a, sph(12, 8), B.accent, tip.x, tip.y, tip.z, .016);
  }
  for (const t of tips) rod(a, K.linen, .0035, t, V3(0, .04, -.02), 6); // string to the latch
  mesh(a, lathe([[.02, -.02], [.026, 0], [.02, .02]], 14), B.stockDk, 0, -.09, -.17, 1, 1.4, 1).rotation.x = .2; // grip swell
}
/** asparagus bolt on the rail */
function boltM(parent: THREE.Object3D, len: number, r: number, tip: 'asp' | 'berry' | 'lemon', y = .05, z = .1) {
  const K = kit(), g = new THREE.Group(); g.position.set(0, y, z); parent.add(g);
  asparagus(g, K.aspBright, r, V3(0, 0, -len / 2), V3(0, 0, len / 2 - (tip === 'asp' ? 0 : r * 1.5)));
  for (const sd of [-1, 1]) { const f = mesh(g, profile([[0, 0], [.05, 0], [.06, .02], [.01, .018]], .003, .001), K.leafPale, 0, 0, -len / 2); f.rotation.z = sd * Math.PI / 2 + Math.PI / 2; } // fletching
  if (tip === 'berry') berryM(g, r * 2.2, 0, 0, len / 2 + r * .6);
  if (tip === 'lemon') mesh(g, lemonGeo(r * 1.9, r * 6), K.lemon, 0, 0, len / 2 + r * 1.8);
  return g;
}
/** asparagus crossbow (Spargel): walnut, brass, two-spear limbs */
export function aspCrossbow() {
  const K = kit(), g = new THREE.Group(), a = new THREE.Group(); g.add(a);
  crossbow(a, { stock: K.walnut, stockDk: K.darkWood, metal: K.brass, limb: K.asp, accent: undefined });
  const bolt = boltM(a, .34, .011, 'asp');
  return { g, bolt };
}
/** bean crossbow (Bohnen-Armbrust, 18.11.2026): same crossbow with green bean-pod limbs, three beans side by side on the rail */
export function beanCrossbow() {
  const K = kit(), g = new THREE.Group(), a = new THREE.Group(); g.add(a);
  crossbow(a, { stock: K.walnut, stockDk: K.darkWood, metal: K.brass, limb: K.leaf, accent: undefined });
  const bolt = new THREE.Group(); bolt.position.set(0, .05, .12); a.add(bolt);
  for (const i of [-1, 0, 1]) { const b = mesh(bolt, sph(12, 8), K.leaf, i * .022, 0, 0, .009, .009, .07); b.rotation.y = i * .17; }
  return { g, bolt };
}

// ================= base weapons =================
/** hoe (Hacke, 18.11.2026; the old rake is in archiv/harke/): lengths of the ash handle in front of / behind the hands,
 *  blade length and its tilt from the handle's "down" towards the front (rad) */
export const HOE = { front: .62, back: .5, blade: .15, tilt: .5 };
/** hoe: `g` = the handle (hands at z = 0, blade end at +z), slides through the hands via g.position.z; the forged iron
 *  blade hangs from a short goose neck at the front end, its edge `blade` m below the handle, tilted forward by `tilt` */
export function hoeModel() {
  const K = kit(), g = new THREE.Group(), L = HOE.front + HOE.back;
  mesh(g, lathe([[.019, 0], [.024, .012], [.025, L * .45], [.023, L - .03], [.021, L]], 14), K.ash, 0, 0, -HOE.back);
  wrapZ(g, K.leather, .0265, -.2, .06);
  band(g, K.brass, .029, .045, HOE.front - .03); band(g, K.brass, .028, .015, -HOE.back + .01);
  const head = new THREE.Group(); head.position.z = HOE.front; head.rotation.x = -HOE.tilt; g.add(head); // blade plane: local -y = edge direction
  mesh(head, sweep([V3(0, .01, -.04), V3(0, -.015, .005), V3(0, -.05, .01)], t => .013 * (1 - t * .35), { radial: 8, steps: 10, caps: true }), K.iron);
  const bl = mesh(head, rbox(.17, .11, .012, .005), K.iron, 0, -HOE.blade + .055, .012);
  bl.scale.set(1, 1, 1);
  mesh(head, rbox(.172, .02, .006, .002), K.brass, 0, -HOE.blade + .006, .012); // bright ground-worn cutting edge
  rivet(head, K.brass, .009, 0, -.05, .02);
  return g;
}
/** berry blunderbuss (shoots blueberries and cranberries): walnut stock, plain iron barrel with a flared bell, glass hopper with both berries on top */
export function cranGun(blue = false) {
  const K = kit(), g = new THREE.Group(), a = new THREE.Group(); g.add(a);
  mesh(a, profile([[-.3, .02], [-.05, .03], [.05, .025], [.05, -.03], [-.09, -.034], [-.12, -.07], [-.14, -.13], [-.18, -.135], [-.19, -.12], [-.18, -.05], [-.31, -.04], [-.32, -.005]], .06, .01), K.walnut);
  mesh(a, lathe([[.026, -.04], [.028, .1], [.026, .25], [.03, .3], [.045, .36], [.06, .395], [.056, .4], [.04, .39], [.022, .36]], 26), K.iron, 0, .012, 0);
  for (const z of [.02, .16, .29]) band(a, K.brass, .033, .018, z, 0, .012);
  const hop = new THREE.Group(); hop.position.set(0, .07, -.02); a.add(hop); // glass hopper of berries
  mesh(hop, sph(18, 12), K.glass, 0, 0, 0, .045, .04, .055);
  for (let i = 0; i < 8; i++) berryM(hop, .016, R(-.022, .022), R(-.025, .01), R(-.03, .03), blue ? K.blueberry : undefined); // Preiselbeeren or (blue) Blaubeeren
  mesh(hop, lathe([[.012, -.01], [.02, -.005], [.02, .005], [.012, .01]], 14), K.brass, 0, -.045, 0).rotation.x = Math.PI / 2;
  mesh(hop, lathe([[.01, 0], [.03, .006], [.028, .014], [0, .016]], 16), K.brass, 0, .04, 0).rotation.x = -Math.PI / 2;
  const tg = mesh(a, new THREE.TorusGeometry(.026, .005, 8, 18, Math.PI), K.brass, 0, -.034, -.1); tg.rotation.set(Math.PI, Math.PI / 2, 0);
  wrapZ(a, K.leather, .037, -.05, .0, 0, -.005).scale.set(1, .8, 1);
  return { g, anim: a };
}
/** cabbage bomb held in the hand: tied with twine, a short wooden pull handle */
export function cabHeld() {
  const K = kit(), g = new THREE.Group();
  cabbageM(g, .1, K.leaf, K.leafPale);
  for (const ry of [0, Math.PI / 2]) { const t = mesh(g, new THREE.TorusGeometry(.104, .006, 6, 28), K.twine); t.rotation.set(0, ry, 0); }
  mesh(g, sph(10, 8), K.twine, 0, .102, 0, .016, .012, .016); // knot on top, a loop to carry it
  mesh(g, new THREE.TorusGeometry(.02, .004, 6, 16), K.twine, 0, .125, 0);
  return g;
}
/** lemon wand: turned walnut with brass collars, a copper coil under a lemon; returns the lemon material (flashes on casting) */
export function lemonWand(stick: THREE.Object3D) {
  const K = kit();
  mesh(stick, lathe([[.0, -.1], [.018, -.095], [.022, -.075], [.017, -.06], [.02, -.02], [.016, .05], [.013, .2], [.011, .33], [.014, .36], [0, .37]], 18), K.darkWoodT);
  band(stick, K.brass, .022, .014, -.055); band(stick, K.brass, .02, .012, .02); band(stick, K.brass, .017, .02, .36);
  wrapZ(stick, K.leather, .021, -.045, .01);
  const coil = new THREE.Mesh(sweep(Array.from({ length: 30 }, (_, i) => V3(Math.cos(i * .9) * .018, Math.sin(i * .9) * .018, .27 + i * .003)), () => .0025, { radial: 6, steps: 90 }), K.copper); stick.add(coil);
  const lemonMat = (K.lemon as THREE.MeshStandardMaterial).clone(); lemonMat.emissive = new THREE.Color(0xffe46a); lemonMat.emissiveIntensity = 0;
  mesh(stick, lemonGeo(.05, .14), lemonMat, 0, 0, .44);
  mesh(stick, sweep([V3(0, 0, .37), V3(.004, .006, .385)], () => .006, { radial: 8, steps: 3, caps: true }), K.calyx);
  const lf = mesh(stick, sph(12, 8), K.leaf, .028, .018, .39, .036, .006, .015); lf.rotation.set(0, .6, .3);
  return lemonMat;
}
/** chili flamethrower: big glossy pod as tank and nozzle, brass nozzle ring, calyx cap, stem bent into a handle */
export function chiliThrower() {
  const K = kit(), g = new THREE.Group();
  const pod = chiliM(g, K.chili, .36, .06, .2, false); pod.position.z = -.14;
  mesh(g, lathe([[.03, 0], [.036, .01], [.034, .03], [.028, .04]], 18), K.brass, 0, -.018, .17);
  mesh(g, lathe([[.0, 0], [.022, .002], [.02, .02], [.0, .022]], 14), K.soot, 0, -.019, .21);
  mesh(g, sweep([V3(0, 0, -.15), V3(0, -.03, -.2), V3(0, -.12, -.22)], () => .016, { radial: 10, steps: 12, caps: true }), K.calyx);
  band(g, K.brass, .063, .02, -.09, 0, -.002); for (let i = 0; i < 6; i++) rivet(g, K.brass, .005, Math.cos(i) * .064, Math.sin(i) * .058, -.09);
  return g;
}

// ================= combo weapons =================
export interface ComboModel { t0: THREE.Vector3; t1: THREE.Vector3; muzzle: THREE.Vector3; base: THREE.Vector3; loaded?: THREE.Object3D }
/** fills `a` with the combo's model; grip points, muzzle and mount as the animations expect them */
export function comboModel(cid: ComboId, a: THREE.Group): ComboModel {
  const K = kit();
  let t0 = V3(0, -.07, -.17), t1 = V3(0, -.03, .1), muzzle = V3(0, .05, .4), base = V3(.2, .78, .22), loaded: THREE.Object3D | undefined;
  switch (cid) {
    case 'jam': { // oxblood crossbow, jam jar magazine, berry-tipped bolt
      crossbow(a, { stock: K.oxblood, stockDk: K.darkWood, metal: K.brass, limb: K.asp, accent: K.berry });
      loaded = boltM(a, .34, .011, 'berry');
      const jar = new THREE.Group(); jar.position.set(0, -.005, -.2); a.add(jar);
      mesh(jar, lathe([[.0, -.035], [.03, -.035], [.034, -.025], [.034, .02], [.028, .03], [.0, .03]], 20), K.glass).rotation.x = -Math.PI / 2;
      mesh(jar, lathe([[.0, -.03], [.03, -.03], [.03, .012], [.0, .012]], 18), K.jam).rotation.x = -Math.PI / 2;
      for (let i = 0; i < 4; i++) berryM(jar, .011, R(-.015, .015), R(-.01, .03), R(-.015, .015));
      mesh(jar, lathe([[.0, 0], [.03, 0], [.032, .008], [.03, .014], [.0, .014]], 18), K.brass, 0, .03, 0).rotation.x = -Math.PI / 2;
      jar.position.y = .055; jar.position.z = -.22;
      break;
    }
    case 'sour': { // pale lemon-lacquered crossbow, copper coil, three lemon-tipped bolts in a fan, lemon pommel
      crossbow(a, { stock: K.lemonWood, stockDk: K.darkWood, metal: K.copper, limb: K.asp, accent: K.glowLemon });
      const l = new THREE.Group(); a.add(l);
      for (const k of [-1, 0, 1]) { const b = boltM(l, .32, .01, 'lemon', .05, .06); b.rotation.y = k * .18; b.position.x = k * .018; }
      loaded = l;
      mesh(a, lemonGeo(.04, .1), K.lemon, 0, -.005, -.36);
      const coil = new THREE.Mesh(sweep(Array.from({ length: 40 }, (_, i) => V3(Math.cos(i * .8) * .034, Math.sin(i * .8) * .03, .02 + i * .004)), () => .003, { radial: 6, steps: 120 }), K.copper); a.add(coil);
      break;
    }
    case 'lance': { // asparagus staff with brass bands, chili bundle tied with twine, ember core
      base = V3(.22, .82, .1); t0 = V3(0, 0, -.25); t1 = V3(0, 0, .18); muzzle = V3(0, 0, .9);
      asparagus(a, K.asp, .024, V3(0, 0, -.42), V3(0, 0, .8), V3(0, .01, 0));
      for (const z of [-.4, -.1, .3, .62]) band(a, K.brass, .03, .022, z);
      wrapZ(a, K.leather, .028, -.32, -.14); wrapZ(a, K.leather, .028, .12, .26);
      for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2, c = chiliM(a, K.chili, .19, .022, .1); c.position.set(Math.cos(an) * .035, Math.sin(an) * .035, .7); c.rotation.set(-Math.sin(an) * .22, Math.cos(an) * .22, 0); }
      mesh(a, lathe([[.05, -.025], [.054, 0], [.05, .025]], 18), K.twine, 0, 0, .72);
      loaded = mesh(a, sph(16, 12), K.glowEmber, 0, 0, .98, .06);
      break;
    }
    case 'shock': { // lemon-yellow double barrel, copper coils, walnut stock, glass lemon cell
      t0 = V3(0, -.06, -.2); t1 = V3(0, -.02, .12); muzzle = V3(0, .02, .42);
      mesh(a, profile([[-.36, .02], [-.06, .03], [-.02, .03], [-.02, -.03], [-.12, -.034], [-.15, -.07], [-.17, -.13], [-.21, -.135], [-.22, -.12], [-.21, -.05], [-.36, -.04], [-.37, -.01]], .062, .01), K.walnut);
      for (const sd of [-1, 1]) mesh(a, lathe([[.022, -.02], [.024, 0], [.022, .38], [.026, .4], [.02, .41]], 20), K.yellowSteel, sd * .025, .018, 0);
      mesh(a, rbox(.08, .05, .1, .012), K.iron, 0, .01, -.03);
      for (const z of [.08, .2, .32]) mesh(a, new THREE.TorusGeometry(.05, .006, 8, 24), K.copper, 0, .018, z).scale.set(1.1, .7, 1);
      const cell = new THREE.Group(); cell.position.set(0, -.04, .14); a.add(cell);
      mesh(cell, lathe([[.0, -.06], [.024, -.06], [.026, .06], [.0, .06]], 18), K.glass);
      mesh(cell, lemonGeo(.018, .09), K.glowLemon);
      for (const z of [-.06, .06]) band(cell, K.brass, .028, .012, z);
      loaded = mesh(a, sph(10, 8), K.glowLemon, 0, .018, .42, .02);
      break;
    }
    case 'hot': { // chili-shaped shotgun: pod body over a dark iron barrel, calyx as stock, stem grip with leather wrap
      t0 = V3(0, -.06, -.2); t1 = V3(0, -.02, .12); muzzle = V3(0, .02, .42);
      const pod = chiliM(a, K.chili, .52, .07, .12, false); pod.position.set(0, .015, -.12);
      mesh(a, lathe([[.018, 0], [.02, .1], [.024, .12], [.02, .13]], 18), K.iron, 0, .025, .32);
      mesh(a, sweep([V3(0, 0, -.14), V3(0, -.04, -.18), V3(0, -.13, -.22)], () => .02, { radial: 12, steps: 12, caps: true }), K.calyx);
      mesh(a, sweep([V3(0, -.05, -.17), V3(0, -.1, -.2)], () => .024, { radial: 12, steps: 4, caps: true }), K.leather);
      const tg = mesh(a, new THREE.TorusGeometry(.024, .005, 8, 18, Math.PI), K.iron, 0, -.05, -.1); tg.rotation.set(Math.PI, Math.PI / 2, 0);
      loaded = mesh(a, sph(10, 8), K.glowEmber, 0, .025, .45, .022);
      break;
    }
    case 'rocket': { // bazooka: olive tube with canvas wrap, riveted bands, rear flare, iron grips, lemon warhead
      base = V3(.16, 1.2, .02); t0 = V3(0, -.1, -.12); t1 = V3(0, -.11, .2); muzzle = V3(0, 0, .62);
      mesh(a, lathe([[.06, -.46], [.075, -.5], [.085, -.53], [.07, -.53], [.062, -.48], [.062, .5], [.068, .52], [.068, .55], [.06, .55]], 28), K.oliveSteel, 0, 0, 0);
      wrapZ(a, K.canvas, .066, -.25, .08);
      for (const z of [-.42, .12, .45]) { band(a, K.iron, .072, .04, z); for (let i = 0; i < 6; i++) rivet(a, K.brass, .006, Math.cos(i) * .074, Math.sin(i) * .074, z); }
      mesh(a, rbox(.035, .14, .05, .01), K.darkWood, 0, -.11, -.1).rotation.x = .15;
      mesh(a, rbox(.03, .12, .045, .01), K.darkWood, 0, -.1, .2).rotation.x = -.1;
      mesh(a, rbox(.03, .05, .09, .006), K.iron, -.075, .07, .1); mesh(a, rbox(.004, .03, .004, .001), K.iron, -.075, .1, .14);
      const head = new THREE.Group(); head.position.set(0, 0, .6); a.add(head);
      mesh(head, lemonGeo(.075, .26), K.lemon, 0, 0, .08);
      band(head, K.brass, .065, .03, -.04);
      for (let i = 0; i < 4; i++) { const f = mesh(head, rbox(.004, .05, .06, .002), K.iron, 0, 0, -.06); f.rotation.z = i * Math.PI / 2; f.position.set(Math.cos(i * Math.PI / 2) * .05, Math.sin(i * Math.PI / 2) * .05, -.06); }
      loaded = head;
      break;
    }
    case 'cole': case 'cabboom': case 'kimchi': { // thrown cabbages held in the hand
      base = V3(.24, .86, .26); t0 = V3(.05, -.06, -.03); t1 = V3(-.05, -.06, .02); muzzle = V3(0, 0, .1);
      const c = new THREE.Group(); a.add(c);
      if (cid === 'kimchi') cabbageM(c, .105, K.redLeaf, K.redLeaf); else cabbageM(c, .105, K.leaf, K.leafPale);
      if (cid === 'cole') { // asparagus spikes + a brass timer strapped on with leather
        for (let i = 0; i < 14; i++) { const d = V3(R(-1, 1), R(-.5, 1), R(-1, 1)).normalize(); asparagus(c, K.asp, .009, d.clone().multiplyScalar(.08), d.clone().multiplyScalar(.19)); }
        const strap = mesh(c, new THREE.TorusGeometry(.108, .012, 8, 32), K.leather); strap.scale.set(1, 1, .5); strap.rotation.x = Math.PI / 2;
        const clk = new THREE.Group(); clk.position.set(0, .02, .11); c.add(clk);
        mesh(clk, lathe([[0, -.012], [.034, -.012], [.038, 0], [.034, .01], [0, .01]], 20), K.brass);
        mesh(clk, new THREE.CircleGeometry(.03, 20), K.white, 0, 0, .0105);
        mesh(clk, rbox(.003, .02, .002, .001), K.ink, 0, .008, .012); mesh(clk, rbox(.016, .003, .002, .001), K.ink, .006, 0, .012);
        mesh(clk, sph(8, 6), K.glowBerry, .03, .03, 0, .008);
      } else if (cid === 'cabboom') {
        for (let i = 0; i < 10; i++) { const d = V3(R(-1, 1), R(-.4, 1), R(-1, 1)).normalize(); berryM(c, .021, d.x * .105, d.y * .1, d.z * .105); }
        for (const ry of [.4, 1.97]) mesh(c, new THREE.TorusGeometry(.108, .005, 6, 30), K.twine).rotation.set(0, ry, 0);
      } else {
        for (let i = 0; i < 4; i++) { const p = chiliM(c, K.chili, .15, .02, .35); const an = i / 4 * Math.PI * 2 + .4; p.position.set(Math.cos(an) * .05, .088, Math.sin(an) * .05); p.rotation.set(0, Math.atan2(Math.cos(an), Math.sin(an)), 0); p.rotateX(.55); }
        for (const ry of [0, Math.PI / 2]) mesh(c, new THREE.TorusGeometry(.107, .005, 6, 30), K.twine).rotation.set(0, ry, 0);
      }
      loaded = c;
      break;
    }
    case 'chilight': { // chili blade: red spine, golden cutting edge, calyx guard, stem handle wrapped in leather
      base = V3(.2, .95, .18); t0 = V3(0, 0, -.32); t1 = V3(0, 0, -.18); muzzle = V3(0, 0, .9);
      const bl = new THREE.Group(); bl.scale.setScalar(.8); a.add(bl);
      const pts = [V3(0, 0, .02), V3(.01, 0, .35), V3(.03, 0, .7), V3(.1, 0, .98)];
      const rf = (t: number) => .11 * (.75 + .25 * sstep(0, .15, t)) * Math.pow(1 - sstep(.3, 1, t), .65) + .003;
      mesh(bl, sweep(pts, rf, { radial: 18, steps: 44, sy: .32, caps: true }), K.chili);
      const off = [.06, .055, .04, .004], edge = mesh(bl, sweep(pts.map((p, i) => p.clone().add(V3(off[i], 0, 0))), t => rf(t) * .55, { radial: 14, steps: 44, sy: .22, caps: true }), K.chiliGold);
      mesh(bl, lathe([[.03, -.03], [.11, -.01], [.12, .02], [.08, .04], [.03, .05]], 22), K.calyx, 0, 0, -.02).scale.set(1, .45, 1);
      for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2, l = mesh(bl, sph(10, 8), K.calyx, Math.cos(an) * .08, Math.sin(an) * .035, .03, .04, .014, .06); l.rotation.z = an; }
      mesh(bl, sweep([V3(0, 0, -.02), V3(0, .005, -.2), V3(0, 0, -.4)], t => .026 - t * .004, { radial: 12, steps: 14, caps: true }), K.calyx);
      wrapZ(bl, K.leather, .03, -.38, -.16);
      mesh(bl, lathe([[.0, -.43], [.03, -.42], [.034, -.405], [.028, -.39]], 16), K.brass);
      loaded = edge;
      break;
    }
  }
  return { t0, t1, muzzle, base, loaded };
}

// ================= farm tools (19.11.2026, Farming-Gameloop) =================
// All tools: hands at the origin, the working end along +z (like the hoe), so the IK can grip them the same way.
/** rake (Harke): ash pole, forged head with 10 tines at the +z end, tines pointing down (-y) */
export function rakeTool(L = 1.15) {
  const K = kit(), g = new THREE.Group(), back = .35;
  mesh(g, lathe([[.018, 0], [.024, .01], [.025, L * .5], [.023, L - .02], [.02, L]], 14), K.ash, 0, 0, -back); // lathe() already lies along +z
  const head = new THREE.Group(); head.position.z = L - back; g.add(head);
  const n = 10, w = .42;
  mesh(head, rbox(w + .02, .036, .045, .012), K.iron);
  mesh(head, rbox(.07, .05, .07, .015), K.iron, 0, .005, -.03);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + w * (i + .5) / n;
    mesh(head, sweep([V3(x, -.01, .01), V3(x, -.07, .03), V3(x, -.12, .05)], t => .008 * (1 - t * .7), { radial: 6, steps: 6, caps: true }), K.iron);
  }
  g.userData.head = head;
  return g;
}
/** hand rake (Handharke, 21.11.2026): one-handed garden claw for weeding and as the emergency weapon. Turned ash handle
 *  with a brass ferrule, a short forged neck and three claw tines that curve down (-y). Grip at the origin, tines along +z. */
export function handRake() {
  const K = kit(), g = new THREE.Group();
  mesh(g, lathe([[.006, -.075], [.016, -.072], [.019, -.055], [.0165, -.02], [.0175, .03], [.019, .07], [.0175, .085]], 16), K.ash);
  band(g, K.brass, .0195, .03, .095);
  mesh(g, sweep([V3(0, 0, .1), V3(0, .006, .145), V3(0, .002, .185)], t => .0075 - t * .0015, { radial: 8, steps: 8, caps: true }), K.iron);
  for (const sx of [-1, 0, 1]) {
    const pts = [V3(0, .002, .18), V3(sx * .022, .004, .205), V3(sx * .036, -.002, .238), V3(sx * .04, -.03, .27), V3(sx * .038, -.07, .274)];
    mesh(g, sweep(pts, t => .0068 * (1 - t * .55), { radial: 8, steps: 16, caps: true }), K.iron);
  }
  g.userData.tip = new THREE.Vector3(0, -.06, .27); // where the tines bite into the soil
  return g;
}
/** watering can (tin, rose spout along +z); `spout` = where the water comes out, `grip` = handle */
export function wateringCan() {
  const K = kit(), g = new THREE.Group();
  const tin = new THREE.MeshStandardMaterial({ color: 0x7fa6b8, metalness: .55, roughness: .35 }), dark = new THREE.MeshStandardMaterial({ color: 0x4f6f7e, metalness: .5, roughness: .4 });
  const up = (m: THREE.Mesh) => { m.rotation.x = -Math.PI / 2; return m; }; // lathe() lies along +z, these stand along +y
  up(mesh(g, lathe([[.0, -.09], [.085, -.09], [.09, -.07], [.09, .07], [.082, .085], [0, .085]], 22), tin));
  up(mesh(g, lathe([[.093, -.004], [.093, .004]], 22), dark, 0, .07, 0));
  const sp = new THREE.Group(); sp.position.set(0, -.04, .07); sp.rotation.x = .9; g.add(sp);
  up(mesh(sp, lathe([[.018, 0], [.014, .28]], 10), tin));
  up(mesh(sp, lathe([[.014, 0], [.036, .03], [.036, .04], [0, .042]], 14), dark, 0, .28, 0));
  const spout = new THREE.Object3D(); spout.position.set(0, .33, 0); sp.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.075, .011, 6, 14, Math.PI), dark); handle.position.set(0, .085, -.01); handle.rotation.y = Math.PI / 2; g.add(handle);
  const grip = new THREE.Object3D(); grip.position.set(0, .16, -.01); g.add(grip);
  void K;
  return { g, spout, grip };
}
/** sickle: short handle, crescent iron blade */
export function sickle() {
  const K = kit(), g = new THREE.Group();
  mesh(g, lathe([[.016, -.05], [.02, 0], [.018, .12], [.014, .14]], 12), K.darkWood); // along +z like the blade
  const pts: THREE.Vector3[] = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 1.1; pts.push(V3(Math.sin(a) * .14, 0, .15 + (1 - Math.cos(a)) * .02 + Math.sin(a) * .1)); }
  mesh(g, sweep(pts, t => .012 * (1 - t * .6), { radial: 6, steps: 18, sx: 2.2, sy: .25, caps: true }), K.iron);
  return g;
}
/** seed bag: linen sack tied with twine */
export function seedBag() {
  const K = kit(), g = new THREE.Group();
  mesh(g, sph(14, 10), K.linen, 0, -.06, 0, .085, .1, .075);
  mesh(g, lathe([[.03, 0], [.04, .03], [.05, .05]], 12), K.linen, 0, .02, 0).rotation.x = -Math.PI / 2;
  band(g, K.twine, .034, .015, 0).rotation.x = Math.PI / 2;
  return g;
}
