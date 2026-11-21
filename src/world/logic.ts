// Game logic of a world built in the editor (welt.html, tab "Logik"): map size, the area the player can walk in and the
// build area (closed splines), hexagon field spots, raccoon spawns (numbered), the main house and the interaction
// objects (well, basket, blueberry bush, fruit trees, brambles). With a logic the game ignores the farm layout of
// balancing.yaml (hof:) and plays this one: only the main house (+ well if placed), fields only on the hex spots.
import type { FarmCfg, RectCfg, BuildingId } from '../farm/config';
import { BUILDING_IDS } from '../farm/config';

export interface Pt { x: number; z: number }
/** raccoon / hare spawn: position; w = weight (how often animals come from here, 1 = normal) */
export interface Spawn extends Pt { w?: number }
export type ObjKind = 'well' | 'basket' | 'bush' | 'tree' | 'bramble';
export interface LogicObj extends Pt { k: ObjKind; rot?: number }
/** a building placed in the editor (21.11.2026): centre + rotation; not placed = does not exist in this world */
export interface LogicBld extends Pt { id: BuildingId; rot: number }
/** buildings that can be placed freely (house and well have their own tools) */
export const PLACEABLE: BuildingId[] = ['shop', 'mill', 'juicer', 'bakery', 'carpentry', 'workshop', 'cows', 'sheep', 'dairy', 'chickens', 'silo'];
export interface Logic {
  /** edge length of the square map (m), centred on 0,0 */
  size: number;
  /** closed spline (control points): where the player can walk */
  walk: Pt[];
  /** closed spline: build area (fields, buildings) */
  build: Pt[];
  /** hexagon field spots (centres); order = order in which fields are opened */
  fields: Pt[];
  /** spawn points, index + 1 = the number shown in the editor */
  spawns: Spawn[];
  /** main house: centre and rotation (degrees clockwise seen from above, like balancing.yaml) */
  house: Pt & { rot: number };
  objects: LogicObj[];
  /** placed buildings (21.11.2026); undefined = older file: the Hofladen stands next to the house as before */
  buildings?: LogicBld[];
  /** possible spots of the wild plants (21.11.2026): where they may grow, not how often (that stays in balancing.yaml) */
  wild?: Pt[];
}

export const MAP_MIN = 40, MAP_MAX = 256, MAP_DEFAULT = 128;
/** objects that exist once */
export const SINGLE: ObjKind[] = ['well', 'basket', 'bush'];

const ellipse = (rx: number, rz: number, n: number, cx = 0, cz = 0): Pt[] => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return { x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz }; });

/** a new, empty world: dry grass only, a small farm in the middle */
export function defaultLogic(): Logic {
  const fields: Pt[] = [];
  for (let q = -1; q <= 2; q++) for (let r = 0; r < 2; r++) fields.push(hexCenter(q, r + 1));
  return {
    size: MAP_DEFAULT,
    walk: ellipse(30, 24, 10),
    build: ellipse(19, 14, 8),
    fields,
    spawns: [{ x: -38, z: -6 }, { x: 34, z: -16 }, { x: 30, z: 22 }, { x: -24, z: 28 }],
    house: { x: 4, z: -8, rot: 0 },
    objects: [{ k: 'well', x: -5, z: -6 }, { k: 'basket', x: -.6, z: -5.4 }, { k: 'bush', x: -9, z: -1 }, { k: 'tree', x: -14, z: -8 }, { k: 'tree', x: 14, z: 6 }],
    buildings: [], wild: [],
  };
}

// ---------------- splines ----------------
/** closed centripetal Catmull-Rom through the control points, n samples per segment */
export function splinePoly(c: Pt[], n = 14): Pt[] {
  if (c.length < 3) return c.map(p => ({ ...p }));
  const out: Pt[] = [], L = c.length, P = (i: number) => c[((i % L) + L) % L];
  for (let i = 0; i < L; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const d = (a: Pt, b: Pt) => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < n; k++) {
      const t = t1 + (t2 - t1) * k / n;
      const lerp = (a: Pt, b: Pt, ta: number, tb: number) => { const u = (t - ta) / (tb - ta); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }; };
      const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
      const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
      out.push(lerp(B1, B2, t1, t2));
    }
  }
  return out;
}
export function inPoly(poly: Pt[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
/** nearest point on the polygon outline */
export function closestOnPoly(poly: Pt[], x: number, z: number) {
  let best = { x, z, d: 1e9 };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0, px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { x: px, z: pz, d };
  }
  return best;
}
export function centroid(poly: Pt[]) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const f = poly[j].x * poly[i].z - poly[i].x * poly[j].z; a += f; cx += (poly[j].x + poly[i].x) * f; cz += (poly[j].z + poly[i].z) * f; }
  if (Math.abs(a) < 1e-6) return { x: 0, z: 0 };
  return { x: cx / (3 * a), z: cz / (3 * a) };
}
/** "radius" of a polygon seen from c in every direction (360 steps): lets the farm code treat any outline like the old
 *  clearing ellipse (0 = centre, 1 = edge) */
export function radial(poly: Pt[], c: Pt, steps = 360) {
  const R = new Float32Array(steps);
  for (let s = 0; s < steps; s++) {
    const a = s / steps * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let best = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j], q = poly[i], ex = q.x - p.x, ez = q.z - p.z, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const wx = p.x - c.x, wz = p.z - c.z, t = (wx * ez - wz * ex) / den, u = (wx * dz - wz * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    R[s] = best || 1;
  }
  return R;
}

// ---------------- hexagon fields ----------------
/** distance between neighbouring field centres on the snap grid (beds are 2.6 m; ~0.45 m of lawn between them) */
export const HEX_STEP = 3.05;
/** centre of hex (q, r) on a pointy-top grid (axial coordinates) */
export function hexCenter(q: number, r: number): Pt { return { x: HEX_STEP * (q + r / 2), z: HEX_STEP * Math.sqrt(3) / 2 * r }; }
/** nearest grid centre */
export function hexSnap(x: number, z: number): Pt {
  const r = z / (HEX_STEP * Math.sqrt(3) / 2), q = x / HEX_STEP - r / 2;
  let rq = Math.round(q), rr = Math.round(r); const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - (-q - r));
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return hexCenter(rq, rr);
}
/** is (x, z) inside a pointy-top hexagon of radius H around c */
export function inHex(c: Pt, H: number, x: number, z: number) {
  const ax = Math.abs(x - c.x), az = Math.abs(z - c.z);
  return az <= H && ax <= H * .866 && az <= H - ax * .577;
}

// ---------------- house ----------------
/** local (house) -> world, rot in degrees as in balancing.yaml (clockwise seen from above) */
export function houseLocal(h: { x: number; z: number; rot: number }, lx: number, lz: number) {
  const a = -h.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c };
}

// ---------------- into the game config ----------------
/** the farm layout of the game from a logic: replaces cfg.hof (buildings, plots, door, basket, bush, trees) and keeps
 *  only the buildings that have a place (main house, well if placed) */
type Orig = { b: FarmCfg['hof']['buildings']; ids: BuildingId[]; unlocks: FarmCfg['levels']['unlocks']; plots: string[] };
const ORIG = new WeakMap<FarmCfg, Orig>();
export function applyLogic(cfg: FarmCfg, L: Logic) {
  // the editor applies its logic again after every change: always start from the yaml values
  let O = ORIG.get(cfg);
  if (!O) ORIG.set(cfg, O = { b: { ...cfg.hof.buildings }, ids: [...BUILDING_IDS], unlocks: structuredClone(cfg.levels.unlocks), plots: cfg.start.plots });
  const H = cfg.hof, h0 = O.b.house ?? { x: 0, z: 0, w: 8.4, d: 5.2 };
  const house: RectCfg = { x: L.house.x, z: L.house.z, w: h0.w ?? 8.4, d: h0.d ?? 5.2, rot: L.house.rot };
  const obj = (k: ObjKind) => L.objects.find(o => o.k === k);
  const bld: Partial<Record<BuildingId, RectCfg>> = { house };
  const well = obj('well'); if (well) bld.well = { x: well.x, z: well.z, r: O.b.well?.r ?? .9 };
  // placed buildings: footprint (w, d / r) from balancing.yaml, place from the editor. Older files without buildings: the
  // Hofladen keeps its old spot next to the house (PR #18)
  if (L.buildings) { for (const b of L.buildings) { const r = O.b[b.id]; if (r && b.id !== 'house' && b.id !== 'well') bld[b.id] = { ...r, x: b.x, z: b.z, rot: b.rot }; } }
  else { const sh = autoShop(O.b, L.house); if (sh) bld.shop = sh; }
  H.buildings = bld as Record<BuildingId, RectCfg>;
  // buildings without a place do not exist in this world (build menu, unlocks)
  const keep = O.ids.filter(id => bld[id]); BUILDING_IDS.length = 0; BUILDING_IDS.push(...keep);
  for (const k of Object.keys(O.unlocks)) cfg.levels.unlocks[+k] = (O.unlocks[+k] ?? []).filter(id => bld[id]);
  const d = (house.d ?? 5.2) / 2;
  H.door = houseLocal(L.house, -.4, d + .6);
  H.basket = obj('basket') ?? houseLocal(L.house, -4.4, d + .2);
  H.bush = obj('bush') ?? houseLocal(L.house, -6, d + 2.5);
  H.trees = L.objects.filter(o => o.k === 'tree').map(o => ({ x: o.x, z: o.z }));
  H.plots = L.fields.map(p => ({ x: p.x, z: p.z }));
  cfg.start.plots = O.plots.slice(0, H.plots.length);
}

/** the old automatic spot of the Hofladen: beside the house as in balancing.yaml, 2.5 m more room to the house wall */
export function autoShop(B: Partial<Record<BuildingId, RectCfg>>, house: Pt & { rot: number }): RectCfg | null {
  const sh = B.shop, h0 = B.house; if (!sh || !h0 || h0.rot === undefined) return null;
  const a0 = h0.rot * Math.PI / 180, dx = sh.x - h0.x, dz = sh.z - h0.z, c = Math.cos(a0), sn = Math.sin(-a0);
  const lz = dx * sn + dz * c, lx0 = dx * c - dz * sn, lx = lx0 + Math.sign(lx0) * 2.5, p = houseLocal(house, lx, lz);
  return { ...sh, x: p.x, z: p.z, rot: (sh.rot ?? 0) - h0.rot + house.rot };
}
/** footprint of a placed building (RectCfg with the size from balancing.yaml) */
export function bldRect(B: Partial<Record<BuildingId, RectCfg>>, b: LogicBld): RectCfg { const r = B[b.id] ?? { x: 0, z: 0, w: 3, d: 3 }; return { ...r, x: b.x, z: b.z, rot: b.rot }; }

/** a logic taken from the farm of balancing.yaml (template "bisheriger Hof"): clearing -> walk area, gaps -> spawns */
export function logicFromCfg(cfg: FarmCfg, gaps: Pt[], brambles: Pt[]): Logic {
  const H = cfg.hof, { rx, rz } = H.clearing, hs = H.buildings.house;
  const objects: LogicObj[] = [];
  if (H.buildings.well) objects.push({ k: 'well', x: H.buildings.well.x, z: H.buildings.well.z });
  objects.push({ k: 'basket', ...H.basket }, { k: 'bush', ...H.bush });
  for (const t of H.trees) objects.push({ k: 'tree', x: t.x, z: t.z });
  for (const b of brambles) objects.push({ k: 'bramble', x: b.x, z: b.z });
  return {
    size: 170, walk: ellipse(rx * .97, rz * .97, 12), build: ellipse(rx * .8, rz * .8, 10),
    fields: H.plots.map(p => ({ ...p })), spawns: gaps.map(g => ({ x: g.x, z: g.z })),
    house: { x: hs.x, z: hs.z, rot: hs.rot ?? 0 }, objects,
    buildings: PLACEABLE.filter(id => H.buildings[id]).map(id => ({ id, x: H.buildings[id].x, z: H.buildings[id].z, rot: H.buildings[id].rot ?? 0 })), wild: [],
  };
}
export function cleanLogic(L: Logic): Logic {
  const r = (v: number) => Math.round(v * 100) / 100, p = (q: Pt) => ({ x: r(q.x), z: r(q.z) });
  return {
    size: Math.round(L.size), walk: L.walk.map(p), build: L.build.map(p), fields: L.fields.map(p),
    spawns: L.spawns.map(s => (s.w !== undefined && s.w !== 1 ? { ...p(s), w: r(s.w) } : p(s))),
    house: { ...p(L.house), rot: r(L.house.rot) },
    objects: L.objects.map(o => (o.rot ? { k: o.k, ...p(o), rot: r(o.rot) } : { k: o.k, ...p(o) })),
    ...(L.buildings ? { buildings: L.buildings.map(b => ({ id: b.id, ...p(b), rot: r(b.rot) })) } : {}),
    ...(L.wild ? { wild: L.wild.map(q => ({ x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10 })) } : {}),
  };
}
