// Farm buildings, procedural: half-timbered main house with the Lager door, mill with sails, bakery with oven,
// farm shop with awning, sheds, silo, enclosures, well (broken / repaired) and construction sites (Baustelle).
// Each building is built in local space: front (door side) = +z, width along x, feet on y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BuildingId, RectCfg } from '../config';
import { propMaterial } from '../../view/textures';

// ---------------- painted textures ----------------
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const R = (a: number, b: number) => a + rnd() * (b - a);
function canvasTex(W: number, H: number, paint: (g: CanvasRenderingContext2D) => void, rep: [number, number] = [1, 1]) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const TEX = {
  plaster: () => canvasTex(256, 256, g => {
    g.fillStyle = '#e6dcc6'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) { const x = R(0, 256), y = R(0, 256), r = R(10, 40), grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, rnd() < .5 ? 'rgba(160,140,110,.18)' : 'rgba(255,250,235,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  }),
};
const MAT: Record<string, THREE.Material> = {};
function mat(key: string): THREE.MeshStandardMaterial {
  if (MAT[key]) return MAT[key] as THREE.MeshStandardMaterial;
  const S = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: .85, ...o });
  const m = ({
    plaster: () => S({ map: TEX.plaster(), color: 0xffffff }),
    timber: () => S({ color: 0x3e2a1c, roughness: .8 }),
    // texture concept 20.11.2026 (FreeStylized, KTX2): planks, thatch and the stone base are tri-planar PBR materials
    wood: () => propMaterial('wood_planks_20', 'holz'),
    woodGrey: () => propMaterial('wood_planks_13', 'holzSchuppen', { color: 0xd8d2c8 }),
    woodRed: () => propMaterial('wood_planks_20', 'holz', { color: 0xe07a68 }),
    fence: () => propMaterial('wood_planks_13', 'holzSchuppen'),
    tiles: () => propMaterial('hay_roof_01', 'dach', { roughness: .95 }),
    shingles: () => propMaterial('hay_roof_01', 'dach', { color: 0xd0c4b0, roughness: .95 }),
    stone: () => propMaterial('stone_bricks_wall_03', 'stein', { roughness: .95 }),
    window: () => S({ color: 0x2a3440, roughness: .2, metalness: .1, emissive: 0xffb860, emissiveIntensity: 0 }),
    frame: () => S({ color: 0xece4d0 }),
    door: () => S({ color: 0x5a2e1c }),
    green: () => S({ color: 0x4a6a3a }),
    sail: () => S({ color: 0xe8e0c8, side: THREE.DoubleSide, roughness: .9 }),
    iron: () => S({ color: 0x45484c, metalness: .6, roughness: .45 }),
    awningA: () => S({ color: 0xc23a2e }), awningB: () => S({ color: 0xf0e6d0 }),
    straw: () => S({ color: 0xd8b860, roughness: 1 }),
    water: () => S({ color: 0x2a5a78, roughness: .1, metalness: .2 }),
    rope: () => S({ color: 0xb59a6a }),
    sign: () => S({ color: 0x8a6a40 }),
    tarp: () => S({ color: 0x6a7a5a, side: THREE.DoubleSide }),
  } as Record<string, () => THREE.MeshStandardMaterial>)[key]();
  MAT[key] = m; return m;
}
/** warm light that spills out of the windows at night (21.11.2026): a soft halo around the pane (blooms), a faint light shaft and a
 *  warm pool on the ground in front of it. All additive, no real lights (cheap on phones). Shared materials, faded by setWindowGlow. */
const softTex = (W: number, H: number, paint: (g: CanvasRenderingContext2D) => void) => { const t = canvasTex(W, H, paint); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
const GLOW = {
  halo: new THREE.MeshBasicMaterial({ map: softTex(128, 128, g => { const r = g.createRadialGradient(64, 64, 6, 64, 64, 64); r.addColorStop(0, 'rgba(255,214,150,1)'); r.addColorStop(.35, 'rgba(255,170,90,.55)'); r.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }),
    color: 0xffb070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  pool: new THREE.MeshBasicMaterial({ map: softTex(128, 128, g => { const r = g.createRadialGradient(64, 40, 4, 64, 56, 64); r.addColorStop(0, 'rgba(255,190,120,.9)'); r.addColorStop(.5, 'rgba(255,150,80,.35)'); r.addColorStop(1, 'rgba(255,120,60,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }),
    color: 0xffa860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  shaft: new THREE.MeshBasicMaterial({ map: softTex(64, 128, g => { const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, 'rgba(255,190,120,.8)'); r.addColorStop(1, 'rgba(255,150,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 128);
    const e = g.createLinearGradient(0, 0, 64, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(.25, 'rgba(0,0,0,0)'); e.addColorStop(.75, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = e; g.fillRect(0, 0, 64, 128); }),
    color: 0xffb070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
};
const PLANE = new THREE.PlaneGeometry(1, 1);
/** windows glow at dusk; k = darkness 0..1 */
export function setWindowGlow(k: number) {
  mat('window').emissiveIntensity = k * 2.4;
  GLOW.halo.opacity = k * .55; GLOW.pool.opacity = k * .5; GLOW.shaft.opacity = k * .16;
  const on = k > .02; GLOW.halo.visible = GLOW.pool.visible = GLOW.shaft.visible = on;
}
/** world points of every lit window (cutscene: the lights of the house) */
export const WINDOWS: THREE.Object3D[] = [];
function windowLight(g: THREE.Group, y: number, w: number, h: number) {
  const halo = new THREE.Mesh(PLANE, GLOW.halo); halo.scale.set(w * 2.6, h * 2.4, 1); halo.position.z = .07; halo.renderOrder = 5;
  const pool = new THREE.Mesh(PLANE, GLOW.pool); pool.rotation.x = -Math.PI / 2; pool.scale.set(w * 3.2, 3.2, 1); pool.position.set(0, -y + .04, 1.55);
  // shaft: from the pane down and out to the pool
  const len = Math.hypot(y, 1.5), shaft = new THREE.Mesh(PLANE, GLOW.shaft); shaft.scale.set(w * 1.15, len, 1);
  shaft.position.set(0, -y / 2, .78); shaft.rotation.x = -Math.atan2(1.5, y); shaft.renderOrder = 4;
  for (const m of [halo, pool, shaft]) { m.castShadow = false; m.receiveShadow = false; g.add(m); }
  WINDOWS.push(g);
}

// ---------------- primitives ----------------
const box = (p: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, round = 0) => {
  const g = round ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
};
const cyl = (p: THREE.Object3D, m: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 16) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
};
/** gable roof: ridge along x, slopes towards ±z, overhang o, pitch h; UVs scaled to metres */
function gable(p: THREE.Object3D, m: THREE.Material, w: number, d: number, h: number, y: number, o = .35) {
  const W = w / 2 + o, D = d / 2 + o, g = new THREE.BufferGeometry();
  const v = [-W, 0, D, W, 0, D, W, h, 0, -W, h, 0, /* back */ W, 0, -D, -W, 0, -D, -W, h, 0, W, h, 0];
  const sl = Math.hypot(D, h), uv = [0, 0, w, 0, w, sl, 0, sl, 0, 0, w, 0, w, sl, 0, sl].map(x => x / 2);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); g.computeVertexNormals();
  const r = new THREE.Mesh(g, m); r.position.y = y; r.castShadow = true; r.receiveShadow = true; p.add(r);
  // thickness: dark fascia boards along the eaves
  box(p, mat('timber'), w + o * 2, .08, .1, 0, y - .02, D - .02); box(p, mat('timber'), w + o * 2, .08, .1, 0, y - .02, -D + .02);
  return r;
}
/** triangular gable walls closing the roof ends */
function gableEnds(p: THREE.Object3D, m: THREE.Material, w: number, d: number, h: number, y: number) {
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ShapeGeometry(s); const o = new THREE.Mesh(g, m); o.rotation.y = sx * Math.PI / 2; o.position.set(sx * w / 2, y, 0); o.castShadow = true; p.add(o);
  }
}
function windowAt(p: THREE.Object3D, x: number, y: number, z: number, w = .7, h = .8, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  box(g, mat('frame'), w + .12, h + .12, .06, 0, 0, 0); box(g, mat('window'), w, h, .07, 0, 0, .01);
  box(g, mat('frame'), .05, h, .08, 0, 0, .02); box(g, mat('frame'), w, .05, .08, 0, 0, .02);
  box(g, mat('green'), .3, h + .1, .04, -w / 2 - .2, 0, .02); box(g, mat('green'), .3, h + .1, .04, w / 2 + .2, 0, .02); // shutters
  windowLight(g, y, w, h);
  return g;
}
function doorAt(p: THREE.Object3D, x: number, z: number, w = 1, h = 2, m = mat('door')) {
  box(p, mat('timber'), w + .16, h + .1, .1, x, h / 2, z); box(p, m, w, h, .12, x, h / 2, z + .02);
}
/** half-timbering on one wall face (front at +z) */
function timbering(p: THREE.Object3D, w: number, h: number, z: number, y0: number) {
  const T = mat('timber');
  box(p, T, w, .14, .06, 0, y0 + .07, z); box(p, T, w, .14, .06, 0, y0 + h - .07, z);
  const n = Math.max(2, Math.round(w / 1.6));
  for (let i = 0; i <= n; i++) box(p, T, .14, h, .06, -w / 2 + w * i / n, y0 + h / 2, z);
}

// ---------------- buildings ----------------
function house(g: THREE.Group, w: number, d: number) {
  const H = 2.8;
  box(g, mat('stone'), w + .2, .5, d + .2, 0, .25, 0);
  box(g, mat('plaster'), w, H - .5, d, 0, .5 + (H - .5) / 2, 0);
  for (const z of [d / 2 + .01, -d / 2 - .01]) { const t = new THREE.Group(); g.add(t); timbering(t, w, H - .5, 0, .5); t.position.z = z; }
  gableEnds(g, mat('plaster'), w, d, 1.9, H); gable(g, mat('tiles'), w, d, 1.9, H);
  box(g, mat('stone'), .6, 1.6, .6, w * .28, H + 1.2, -.4); // chimney
  // front: door, windows, Lager barn door on the left end
  doorAt(g, w * .14, d / 2 + .04, 1.05, 2.05);
  box(g, mat('timber'), 1.6, .12, .9, w * .14, 2.35, d / 2 + .4); // little porch roof
  windowAt(g, w * .36, 1.7, d / 2 + .04); windowAt(g, -w * .08, 1.7, d / 2 + .04);
  // Lager: wide plank double door with a cross brace
  const lx = -w * .34; box(g, mat('timber'), 2.1, 2.3, .1, lx, 1.15, d / 2 + .04);
  for (const sx of [-1, 1]) { const dg = new THREE.Group(); dg.position.set(lx + sx * .48, 1.1, d / 2 + .1); g.add(dg); box(dg, mat('woodRed'), .94, 2.1, .08, 0, 0, 0); const b = box(dg, mat('frame'), 1.2, .1, .04, 0, 0, .05); b.rotation.z = sx * .95; }
  windowAt(g, 0, 1.7, -d / 2 - .04, .7, .8, Math.PI);
  return { lamp: new THREE.Vector3(w * .14, 2.45, d / 2 + .25) };
}
function shed(g: THREE.Group, w: number, d: number, o: { wall?: string; roof?: string; h?: number; pitch?: number; door?: number; windows?: boolean } = {}) {
  const H = o.h ?? 2.3;
  box(g, mat('stone'), w + .12, .3, d + .12, 0, .15, 0);
  box(g, mat(o.wall ?? 'wood'), w, H - .3, d, 0, .3 + (H - .3) / 2, 0);
  gableEnds(g, mat(o.wall ?? 'wood'), w, d, o.pitch ?? 1.2, H); gable(g, mat(o.roof ?? 'shingles'), w, d, o.pitch ?? 1.2, H, .28);
  doorAt(g, o.door ?? 0, d / 2 + .03, .95, 1.9, mat('door'));
  if (o.windows !== false && w > 3) windowAt(g, (o.door ?? 0) > 0 ? -w * .28 : w * .28, 1.5, d / 2 + .04, .55, .6);
}
function mill(g: THREE.Group, w: number, d: number) {
  const H = 4.2;
  box(g, mat('stone'), w + .1, 1.2, d + .1, 0, .6, 0);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(w * .36, w * .48, H - 1.2, 8), mat('woodGrey')); body.position.y = 1.2 + (H - 1.2) / 2; body.castShadow = true; g.add(body);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(w * .46, 1.4, 8), mat('shingles')); cap.position.y = H + .7; cap.castShadow = true; g.add(cap);
  doorAt(g, 0, d / 2 + .02, .9, 1.7);
  const hub = new THREE.Group(); hub.position.set(0, H - .2, w * .42 + .2); g.add(hub);
  cyl(hub, mat('timber'), .14, .14, .4, 0, 0, 0).rotation.x = Math.PI / 2;
  const sails = new THREE.Group(); sails.position.z = .22; hub.add(sails);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; sails.add(arm);
    box(arm, mat('timber'), .1, 2.6, .08, 0, 1.3, 0);
    box(arm, mat('sail'), .7, 2.0, .02, .42, 1.5, .02);
  }
  return { sails };
}
function silo(g: THREE.Group, r: number) {
  const H = 5;
  cyl(g, mat('stone'), r + .05, r + .1, .4, 0, .2, 0, 24);
  const body = cyl(g, new THREE.MeshStandardMaterial({ color: 0xa8b0b4, metalness: .45, roughness: .5 }), r, r, H, 0, .4 + H / 2, 0, 28);
  void body;
  for (let i = 1; i < 6; i++) cyl(g, mat('iron'), r + .02, r + .02, .06, 0, .4 + i * H / 6, 0, 28);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r + .15, 1.1, 28), mat('iron')); cap.position.y = H + .95; cap.castShadow = true; g.add(cap);
}
function enclosure(g: THREE.Group, w: number, d: number, animal: 'chickens' | 'cows') {
  const post = (x: number, z: number) => box(g, mat('fence'), .1, .9, .1, x, .45, z);
  const rail = (x0: number, z0: number, x1: number, z1: number) => { for (const y of [.35, .75]) { const l = Math.hypot(x1 - x0, z1 - z0), b = box(g, mat('fence'), l, .06, .05, (x0 + x1) / 2, y, (z0 + z1) / 2); b.rotation.y = -Math.atan2(z1 - z0, x1 - x0); } };
  const W = w / 2, D = d / 2, pts: [number, number][] = [[-W, -D], [W, -D], [W, D], [-W, D]];
  for (let i = 0; i < 4; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % 4], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.2); for (let k = 0; k < n; k++) post(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); if (i !== 2) rail(x0, z0, x1, z1); else { rail(x0, z0, x0 + (x1 - x0) * .4, z0); rail(x0 + (x1 - x0) * .6, z0, x1, z1); } }
  const s = new THREE.Group(); s.position.set(-W + 1.1, 0, -D + .9); g.add(s);
  if (animal === 'chickens') { box(s, mat('woodRed'), 1.4, .9, 1, 0, .65, 0); const r = new THREE.Group(); s.add(r); gable(r, mat('shingles'), 1.4, 1, .5, 1.1, .12); for (const x of [-.4, .4]) box(s, mat('timber'), .08, .3, .08, x, .1, .3); }
  else { for (const [x, z] of [[-.9, -.6], [.9, -.6], [-.9, .6], [.9, .6]]) box(s, mat('timber'), .12, 1.8, .12, x, .9, z); const r = new THREE.Group(); s.add(r); gable(r, mat('shingles'), 2, 1.4, .5, 1.8, .15); box(s, mat('straw'), 1.2, .4, .8, 0, .2, 0, .1); }
}
/** well: stone ring, roof on two posts with a crank (repaired) or broken: ring half collapsed, beams down, no roof */
function well(g: THREE.Group, r: number, broken: boolean) {
  const ring = new THREE.Group(); g.add(ring);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, h = broken && (i < 5 || i === 9) ? R(.15, .35) : .8;
    const b = box(ring, mat('stone'), .5, h, .32, Math.cos(a) * r * .85, h / 2, Math.sin(a) * r * .85, .06); b.rotation.y = -a + Math.PI / 2;
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(r * .7, 20), mat('water')); water.rotation.x = -Math.PI / 2; water.position.y = broken ? .1 : .5; g.add(water);
  if (broken) {
    for (let i = 0; i < 6; i++) { const b = box(g, mat('stone'), R(.25, .45), R(.15, .25), R(.2, .3), R(-1.4, 1.4), .1, R(-1.4, 1.4), .05); b.rotation.set(R(-.3, .3), R(0, 3), R(-.3, .3)); }
    const beam = box(g, mat('timber'), .14, 2.2, .14, r * .9, .25, r * .2); beam.rotation.z = Math.PI / 2 - .15; beam.rotation.y = .5;
    const beam2 = box(g, mat('timber'), .14, 1.9, .14, -r * .7, .9, -r * .3); beam2.rotation.z = .6;
    return { crank: null as THREE.Object3D | null };
  }
  for (const sx of [-1, 1]) box(g, mat('timber'), .14, 2.2, .14, sx * r * .95, 1.1, 0);
  const roof = new THREE.Group(); g.add(roof); gable(roof, mat('shingles'), r * 2.3, 1.4, .6, 2.15, .1);
  const crank = new THREE.Group(); crank.position.y = 1.55; g.add(crank);
  cyl(crank, mat('timber'), .09, .09, r * 2, 0, 0, 0).rotation.z = Math.PI / 2;
  cyl(crank, mat('rope'), .1, .1, .3, 0, 0, 0).rotation.z = Math.PI / 2;
  const bucket = cyl(g, mat('wood'), .16, .13, .22, 0, 1.05, 0); void bucket;
  return { crank };
}
/** construction site: stone foundation outline, scaffold poles, plank stack, tarp and a sign with the level */
function site(g: THREE.Group, r: RectCfg, level: number) {
  const round = r.r !== undefined, w = round ? r.r! * 2 : r.w ?? 3, d = round ? r.r! * 2 : r.d ?? 3;
  if (round) { for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = box(g, mat('stone'), .45, .25, .3, Math.cos(a) * r.r!, .12, Math.sin(a) * r.r!, .05); b.rotation.y = -a + Math.PI / 2; } }
  else { box(g, mat('stone'), w, .25, .3, 0, .12, -d / 2 + .15); box(g, mat('stone'), w, .25, .3, 0, .12, d / 2 - .15); box(g, mat('stone'), .3, .25, d, -w / 2 + .15, .12, 0); box(g, mat('stone'), .3, .25, d * .55, w / 2 - .15, .12, -d * .22); }
  const pole = (x: number, z: number, h: number) => box(g, mat('wood'), .09, h, .09, x, h / 2, z);
  const W = w / 2 - .2, D = d / 2 - .2;
  pole(-W, -D, 2.2); pole(W, -D, 1.8); pole(-W, D, 1.4);
  box(g, mat('wood'), w - .3, .07, .07, 0, 1.3, -D).rotation.z = .04;
  for (let i = 0; i < 4; i++) box(g, mat('wood'), 1.8, .06, .24, W * .3, .05 + i * .07, D * .2 + R(-.05, .05)).rotation.y = R(-.08, .08); // plank stack
  const tarp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), mat('tarp')); tarp.rotation.set(-Math.PI / 2 + .3, 0, .2); tarp.position.set(-W * .4, .3, D * .2); tarp.castShadow = true; g.add(tarp);
  // sign: post + board with a level number (hidden for the well)
  const s = new THREE.Group(); s.position.set(W * .7, 0, D + .5); g.add(s);
  box(s, mat('wood'), .08, 1.2, .08, 0, .6, 0);
  if (level > 0) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 80; const x = cv.getContext('2d')!;
    x.fillStyle = '#7a5a34'; x.fillRect(0, 0, 128, 80); x.strokeStyle = '#3a2614'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 74);
    x.fillStyle = '#f4e6c4'; x.font = '700 40px "Alegreya Sans", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('★' + level, 64, 42);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    box(s, new THREE.MeshStandardMaterial({ map: t, roughness: .8 }), .7, .44, .05, 0, 1.15, .03);
  }
}

export interface BuildingView { id: BuildingId; site: THREE.Group; built: THREE.Group; root: THREE.Group; sails?: THREE.Object3D; lamp?: THREE.Vector3; crank?: THREE.Object3D | null; broken?: THREE.Group }
export function buildBuilding(id: BuildingId, r: RectCfg, level: number): BuildingView {
  seed = 3 + id.length * 17;
  const root = new THREE.Group(); root.position.set(r.x, 0, r.z); root.rotation.y = -(r.rot ?? 0) * Math.PI / 180;
  const built = new THREE.Group(), siteG = new THREE.Group(); root.add(built, siteG);
  const w = r.w ?? 3, d = r.d ?? 3, v: BuildingView = { id, site: siteG, built, root };
  switch (id) {
    case 'house': v.lamp = house(built, w, d).lamp; break;
    case 'mill': v.sails = mill(built, w, d).sails; break;
    case 'bakery': shed(built, w, d, { wall: 'plaster', roof: 'tiles', door: -w * .2 }); box(built, mat('stone'), .7, 2, .7, w * .32, 3.2, -.3); { const o = new THREE.Mesh(new THREE.SphereGeometry(.8, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('stone')); o.position.set(w / 2 + .6, .2, 0); o.castShadow = true; built.add(o); } break;
    case 'shop': shed(built, w, d, { wall: 'woodRed', roof: 'tiles', windows: false }); for (let i = 0; i < 6; i++) { const s = box(built, mat(i % 2 ? 'awningA' : 'awningB'), w / 6, .04, 1, -w / 2 + w / 12 + i * w / 6, 2.1, d / 2 + .5); s.rotation.x = .35; } box(built, mat('wood'), w * .8, .8, .5, 0, .4, d / 2 + .9); break;
    case 'juicer': shed(built, w, d, { wall: 'woodGrey', windows: false }); cyl(built, mat('wood'), .4, .45, .9, w / 2 + .5, .45, .4); cyl(built, mat('iron'), .42, .42, .06, w / 2 + .5, .7, .4); break;
    case 'carpentry': shed(built, w, d, { wall: 'wood' }); for (let i = 0; i < 5; i++) cyl(built, mat('wood'), .15, .15, 1.6, -w / 2 - .4, .15 + (i % 3) * .28, -.6 + i * .3).rotation.x = Math.PI / 2; break;
    case 'workshop': shed(built, w, d, { wall: 'woodGrey', roof: 'tiles' }); box(built, mat('stone'), .6, 1.6, .6, -w * .3, 3, -.3); box(built, mat('iron'), .5, .35, .25, w / 2 + .5, .55, .6); box(built, mat('timber'), .3, .4, .3, w / 2 + .5, .2, .6); break;
    case 'dairy': shed(built, w, d, { wall: 'plaster', roof: 'shingles' }); { const t = new THREE.Group(); built.add(t); timbering(t, w, 2, 0, .3); t.position.z = d / 2 + .01; } for (const x of [-.4, .4]) cyl(built, new THREE.MeshStandardMaterial({ color: 0xb8c0c4, metalness: .6, roughness: .3 }), .18, .18, .6, w / 2 + .5 + x, .3, .6); break;
    case 'silo': silo(built, r.r ?? 1.8); break;
    case 'chickens': enclosure(built, w, d, 'chickens'); break;
    case 'cows': enclosure(built, w, d, 'cows'); break;
    case 'sheep': enclosure(built, w, d, 'cows'); break;
    case 'well': { v.crank = well(built, r.r ?? .9, false).crank; const b = new THREE.Group(); root.add(b); well(b, r.r ?? .9, true); v.broken = b; break; }
  }
  if (id !== 'house' && id !== 'well') site(siteG, r, level);
  return v;
}
