// Static garden + the dark rim: black bush/tree silhouettes with a faint cold edge,
// and blinking eye pairs behind them (more of them where the next wave comes from).
import * as THREE from 'three';
import { GEO, LANT, M, gfx, part, rand, scene, windU } from './core';
import { groundMaterial } from './textures';
import { Inst, instance, loadNature } from './nature';

const ARENA = 15;
/** trodden paths from the forest into the garden: quadratic curves, also carry stepping stones */
let PATHS = Array.from({ length: 7 }, (_, k) => ({ a: k / 7 * Math.PI * 2 + rand(-.2, .2), w: rand(7, 12), bend: .3 }));
function pathPoint(a: number, t: number, bend = .3) {
  const u = 1 - t, p0 = [Math.cos(a) * 26, Math.sin(a) * 26], p1 = [Math.cos(a + bend) * 12, Math.sin(a + bend) * 12], p2 = [Math.cos(a) * 4.5, Math.sin(a) * 4.5];
  return { x: u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], z: u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1] };
}

/** control map for the ground shader: r = bare dirt (garden + trodden paths), g = worn patches, b = brightness (falls to black at the rim) */
function groundControl() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const W = 64; const toPx = (x: number) => (x / W + .5) * S;
  g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  // worn patches (green channel)
  for (let i = 0; i < 260; i++) { const x = Math.random() * S, y = Math.random() * S, r = rand(4, 16); const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(0,120,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  // trodden paths from the dark into the garden (red channel)
  g.strokeStyle = 'rgba(150,0,0,1)'; g.lineCap = 'round'; g.filter = 'blur(3px)';
  for (const P of PATHS) {
    const a = P.a; g.lineWidth = P.w; g.beginPath();
    g.moveTo(toPx(Math.cos(a) * 26), toPx(Math.sin(a) * 26));
    g.quadraticCurveTo(toPx(Math.cos(a + P.bend) * 12), toPx(Math.sin(a + P.bend) * 12), toPx(Math.cos(a) * 4.5), toPx(Math.sin(a) * 4.5)); g.stroke();
  }
  g.filter = 'none';
  // the garden itself: bare earth (red channel)
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 10.2 / W);
  grd.addColorStop(0, 'rgba(255,0,0,1)'); grd.addColorStop(.85, 'rgba(255,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S * 10.2 / W, 0, 7); g.fill();
  // brightness (blue channel): lit garden, dimmer lawn, total darkness at the edge
  const b = g.createRadialGradient(S / 2, S / 2, S * 9 / W, S / 2, S / 2, S * 18.5 / W);
  b.addColorStop(0, 'rgba(0,0,255,1)'); b.addColorStop(.55, 'rgba(0,0,150,1)'); b.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = b; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

/** weapon test room: plain earth everywhere, bright inside the room, dark far outside */
function bareControl() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  g.fillStyle = 'rgb(255,0,0)'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) { const x = Math.random() * S, y = Math.random() * S, r = rand(3, 9); const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(0,90,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const b = g.createRadialGradient(S / 2, S / 2, S * 15 / 64, S / 2, S / 2, S * 30 / 64);
  b.addColorStop(0, 'rgba(0,0,255,1)'); b.addColorStop(1, 'rgba(0,0,40,1)');
  g.fillStyle = b; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}
let ground: THREE.Mesh, post: THREE.Group, gardenMat: THREE.Material, bareMat: THREE.Material | null = null, bare = false;
/** weapon test room on/off: only earth, no forest, deco, lantern, fog banks or wisps */
export function setBareRoom(on: boolean) {
  bare = on;
  if (on && !bareMat) bareMat = groundMaterial(bareControl());
  ground.material = on ? bareMat! : gardenMat;
  for (const o of [post, natureGroup, gardenDeco, mistMesh, ...spirits.map(w => w.s)]) if (o) o.visible = !on;
  if (on) clearEyes();
}
export const isBareRoom = () => bare;

export function buildWorld() {
  gardenMat = groundMaterial(groundControl());
  ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), gardenMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  buildFog(); buildWisps();
  post = new THREE.Group(); part(post, GEO.cyl, M(0x3a2a1c), .06, 2.2, .06, 0, 1.1, 0); part(post, GEO.box, M(0x2a2a2a, { m: .6, r: .4 }), .22, .3, .22, 0, 2.3, 0);
  part(post, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffc070 }), .09, .12, .09, 0, 2.3, 0, false);
  post.position.copy(LANT); scene.add(post);
  loadNature().then(buildNature).catch(e => console.error('nature models', e));
}

// ---------------- nature: forest, bushes, undergrowth, stones (Quaternius MegaKit) ----------------
const white = new THREE.Color(1, 1, 1);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);
/** random point in a ring, optionally rejecting points too close to earlier ones */
function ringPts(n: number, r0: number, r1: number, minD = 0, taken: { x: number; z: number; d: number }[] = [], avoidLantern = 0) {
  const out: { x: number; z: number; r: number; a: number }[] = [];
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(r0 * r0, r1 * r1)), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (minD && taken.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (minD + t.d) ** 2 / 4)) continue;
    if (avoidLantern && (x - LANT.x) ** 2 + (z - LANT.z) ** 2 < avoidLantern ** 2) continue;
    if (minD) taken.push({ x, z, d: minD });
    out.push({ x, z, r, a });
  }
  return out;
}
// inside the garden only the band between the field slots and the lawn gets decoration (fields can be built on every slot)
let freeSpot: ((x: number, z: number) => boolean) | null = null, natureReady = false, gardenDeco: THREE.Group | null = null;
export function setGardenSlots(free: (x: number, z: number) => boolean) { freeSpot = free; if (natureReady) buildGardenDeco(); }
function buildGardenDeco() {
  if (!freeSpot) return;
  if (gardenDeco) scene.remove(gardenDeco);
  const G = gardenDeco = new THREE.Group(); G.visible = !bare; scene.add(G);
  const ok = (x: number, z: number) => [0, 1, 2, 3, 4, 5].every(k => freeSpot!(x + Math.cos(k * 1.047) * .45, z + Math.sin(k * 1.047) * .45)) && freeSpot!(x, z) && (x - LANT.x) ** 2 + (z - LANT.z) ** 2 > 1.2;
  const pts = (n: number, r0: number, r1: number) => ringPts(n * 3, r0, r1).filter(p => ok(p.x, p.z)).slice(0, n);
  const pebbles = pts(26, 6, 9.8).map(p => ({ x: p.x, z: p.z, y: -.02, s: rand(.6, 1.2), tilt: .3, shade: rand(.85, 1.1) }));
  for (const [name, list] of group(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5'], pebbles)) instance(G, name, list);
  // a few fallen petals near the lawn
  for (const [name, list] of group(['Petal_1', 'Petal_2', 'Petal_3', 'Petal_5'], pts(18, 7.2, 10)))
    instance(G, name, list.map(p => ({ x: p.x, z: p.z, y: .01, s: rand(.25, .4), tilt: .3, col: hsl(rand(.6, .85), .2, .6) })));
  // grass creeping in from the lawn, and a few glowing mushrooms
  for (const [name, list] of group(['Grass_Common_Short', 'Clover_1', 'Clover_2'], pts(34, 8.4, 10)))
    instance(G, name, list.map(p => ({ x: p.x, z: p.z, s: rand(.25, .4), col: hsl(rand(.22, .35), .25, rand(.6, .72)) })));
  const sh: Inst[] = [];
  for (const p of pts(5, 7, 9.8)) for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) { const x = p.x + rand(-.25, .25), z = p.z + rand(-.25, .25); if (ok(x, z)) sh.push({ x, z, s: rand(.3, .5), tilt: .3 }); }
  instance(G, 'Mushroom_Common', sh);
}
function group<T>(names: string[], list: T[]) { const m = new Map<string, T[]>(); for (const it of list) { const n = pick(names); if (!m.has(n)) m.set(n, []); m.get(n)!.push(it); } return m; }

// gaps in the forest ring (layout.gaps, Basti's sketch 18.11.2026): no trees, bushes or rocks there, a trodden path leads in
let gaps: { a: number; w: number }[] = [];
const GAP_KEEP = /^(RockPath|Grass_Common_Short|Clover|Pebble)/;
const inGap = (x: number, z: number, pad = 0) => {
  const r = Math.hypot(x, z); if (r < 10.5) return false;
  return gaps.some(g => { const along = x * Math.cos(g.a) + z * Math.sin(g.a), side = Math.abs(-x * Math.sin(g.a) + z * Math.cos(g.a));
    return along > 0 && side < g.w / 2 + pad + Math.max(0, r - 17) * .35; }); // opens up a little towards the outside like a funnel
};
export function setForestGaps(deg: number[], width: number) {
  const list = deg.map(d => ({ a: d * Math.PI / 180, w: width }));
  if (JSON.stringify(list) === JSON.stringify(gaps)) return;
  gaps = list;
  PATHS = list.map(g => ({ a: g.a, w: rand(8, 11), bend: rand(-.12, .12) }));
  gardenMat = groundMaterial(groundControl()); if (!bare) ground.material = gardenMat;
  if (natureReady && natureGroup) { scene.remove(natureGroup); natureGroup = null; buildNature(); }
}
// clearings in the forest belt where nut trees can be planted: no bushes, rocks or undergrowth there
let clearings: { x: number; z: number; r: number }[] = [], natureGroup: THREE.Group | null = null;
const inClearing = (x: number, z: number) => clearings.some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r);
export function setForestClearings(list: { x: number; z: number; r: number }[]) {
  const key = (l: typeof list) => l.map(c => `${c.x.toFixed(2)},${c.z.toFixed(2)},${c.r}`).join(';');
  if (key(list) === key(clearings)) return;
  clearings = list;
  if (natureReady && natureGroup) { scene.remove(natureGroup); natureGroup = null; buildNature(); } // models already there: rebuild with the clearings
}
function buildNature() {
  const W = natureGroup = new THREE.Group(); W.name = 'nature'; W.visible = !bare; scene.add(W);
  const dens = gfx.quality === 'niedrig' ? .45 : gfx.quality === 'mittel' ? .7 : 1, N = (n: number) => Math.max(1, Math.round(n * dens));
  const add = (name: string, list: Inst[], o: { shadow?: boolean; receive?: boolean; scale?: number } = {}) => instance(W, name, list.filter(p => !inClearing(p.x, p.z) && !(GAP_KEEP.test(name) ? false : inGap(p.x, p.z, name.includes('Tree') || name.startsWith('Pine') ? 1.2 : o.shadow ? .3 : -.6))), o); // gaps: only short grass, clover and stepping stones

  // --- forest: twisted giants, dead trees, dark pines, a few broadleaf trees; a dense wall close in, thinner behind
  const taken: { x: number; z: number; d: number }[] = [];
  const trees: { name: string; s: number; col: () => THREE.Color; d: number; n: number; r0: number; r1: number }[] = [
    { name: 'Twisted', s: .38, n: 15, d: 4, r0: 15.6, r1: 23, col: () => Math.random() < .25 ? hsl(rand(.07, .12), rand(.65, .8), rand(.42, .5)) : hsl(rand(.22, .3), rand(.55, .7), rand(.34, .42)) },
    { name: 'Pine', s: .72, n: 42, d: 2.2, r0: 15.4, r1: 26, col: () => hsl(rand(.2, .28), rand(.25, .4), rand(.78, .9)) },
    { name: 'Dead', s: .42, n: 11, d: 2.6, r0: 15.4, r1: 25, col: () => white },
    { name: 'Common', s: .62, n: 20, d: 2.6, r0: 15.8, r1: 25, col: () => hsl(rand(.24, .32), rand(.55, .7), rand(.32, .4)) },
  ];
  const variants: Record<string, string[]> = {
    Twisted: [1, 2, 3, 4, 5].map(i => 'TwistedTree_' + i), Dead: [1, 2, 3, 4, 5].map(i => 'DeadTree_' + i),
    Pine: [1, 2, 4, 5].map(i => 'Pine_' + i), Common: [1, 3, 5].map(i => 'CommonTree_' + i),
  };
  for (const T of trees) {
    const pts = ringPts(N(T.n), T.r0, T.r1, T.d, taken, 2.5);
    for (const [name, list] of group(variants[T.name], pts)) add(name, list.map(p => {
      const s = T.s * rand(.8, 1.2) * (p.r > 21 ? 1.15 : 1);
      // giants lean their crowns toward the garden a little
      return { x: p.x, z: p.z, y: -.1, s, col: T.col(), shade: rand(.75, 1.05), ry: T.name === 'Twisted' ? -p.a + rand(-.8, .8) : undefined };
    }), { shadow: true, scale: T.s });
  }

  // --- bushes on the rim (the eyes sit in them); some flowering
  const bushPts = ringPts(N(90), 13, 15.3, 1.1, [], 1.6).filter(p => !inClearing(p.x, p.z) && !inGap(p.x, p.z));
  BUSHES.length = 0;
  const bushList = bushPts.map(p => { const s = rand(.6, 1.05); BUSHES.push({ x: p.x, y: s * .6, z: p.z, r: s * .9, a: p.a }); return { x: p.x, z: p.z, s, col: hsl(rand(.25, .34), rand(.5, .65), rand(.28, .36)) }; });
  const fl = bushList.filter(() => Math.random() < .25);
  add('Bush_Common', bushList.filter(b => !fl.includes(b)), { shadow: true });
  add('Bush_Common_Flowers', fl.map(b => ({ ...b, col: hsl(rand(.27, .33), .55, .34) })), { shadow: true });

  // --- boulders: rim + forest floor, mossy cool grey
  add('Rock_Medium_1', ringPts(N(7), 12.6, 22).map(p => ({ x: p.x, z: p.z, y: -.15, s: rand(.35, .8), tilt: .3, shade: rand(.7, 1) })), { shadow: true });
  add('Rock_Medium_2', ringPts(N(7), 12.6, 22).map(p => ({ x: p.x, z: p.z, y: -.1, s: rand(.3, .7), tilt: .3, shade: rand(.7, 1) })), { shadow: true });
  add('Rock_Medium_3', ringPts(N(6), 14, 24).map(p => ({ x: p.x, z: p.z, y: -.15, s: rand(.4, .9), tilt: .3, shade: rand(.7, 1) })), { shadow: true });

  // --- undergrowth: ferns and big leaves under the trees, grass + clover on the lawn
  const fern = (n: number, r0: number, r1: number) => ringPts(N(n), r0, r1).map(p => ({ x: p.x, z: p.z, s: rand(.15, .26), tilt: .25, col: hsl(rand(.4, .5), rand(.2, .35), rand(.62, .75)) }));
  add('Fern_1', fern(70, 13.4, 23));
  add('Plant_1_Big', ringPts(N(26), 13.5, 22).map(p => ({ x: p.x, z: p.z, s: rand(.3, .45), col: hsl(rand(.42, .52), .3, rand(.6, .72)) })));
  add('Plant_1', ringPts(N(30), 11.5, 16).map(p => ({ x: p.x, z: p.z, s: rand(.35, .55), col: hsl(rand(.38, .5), .25, rand(.62, .75)) })));
  for (const [name, list] of group(['Clover_1', 'Clover_2'], ringPts(N(30), 10.6, 15))) add(name, list.map(p => ({ x: p.x, z: p.z, s: rand(.3, .45), col: hsl(rand(.22, .32), .35, rand(.7, .8)) })));
  const grassCol = () => hsl(rand(.2, .32), rand(.2, .35), rand(.58, .72));
  for (const [name, list] of group(['Grass_Common_Short', 'Grass_Common_Short', 'Grass_Common_Tall'], ringPts(N(260), 10.3, 17.5)))
    add(name, list.map(p => ({ x: p.x, z: p.z, s: rand(.32, .55) * (p.r > 13 ? 1.25 : 1), col: grassCol() })));
  add('Grass_Wispy_Tall', ringPts(N(40), 14.5, 22).map(p => ({ x: p.x, z: p.z, s: rand(.5, .8), col: grassCol() })));
  for (const [name, list] of group(['Clover_1', 'Clover_2'], ringPts(N(36), 10.2, 14))) add(name, list.map(p => ({ x: p.x, z: p.z, s: rand(.28, .42), col: hsl(rand(.3, .45), .3, rand(.65, .78)) })));

  // --- flowers that glow faintly at night
  for (const [name, list] of group(['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single', 'Flower_4_Single'], ringPts(N(34), 10.8, 15.5)))
    add(name, list.map(p => ({ x: p.x, z: p.z, s: rand(.22, .34), col: hsl(rand(.08, .15), .2, .95) })));

  // --- glowing mushrooms: two fairy rings on the lawn, clusters at the tree feet
  const shrooms: Inst[] = [], bracket: Inst[] = [];
  for (let k = 0; k < 2; k++) {
    const a = rand(0, Math.PI * 2), r = rand(11.2, 12.6), cx = Math.cos(a) * r, cz = Math.sin(a) * r, rr = rand(.7, 1), n = 11;
    for (let i = 0; i < n; i++) { const b = i / n * Math.PI * 2 + rand(-.15, .15); shrooms.push({ x: cx + Math.cos(b) * rr, z: cz + Math.sin(b) * rr, s: rand(.4, .65), tilt: .3 }); }
  }
  for (const p of ringPts(N(10), 13.5, 20)) for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) shrooms.push({ x: p.x + rand(-.4, .4), z: p.z + rand(-.4, .4), s: rand(.35, .7), tilt: .3 });
  for (const p of ringPts(N(10), 15, 20)) bracket.push({ x: p.x, z: p.z, s: rand(.5, .8), tilt: .2 });
  add('Mushroom_Common', shrooms); add('Mushroom_Laetiporus', bracket);

  // --- stepping stones along the trodden paths, pebbles along the garden border
  const stones: Inst[] = [];
  for (const P of PATHS) for (let t = 0; t < 1; t += .028) {
    const q = pathPoint(P.a, t, P.bend), r = Math.hypot(q.x, q.z); if (r < 10.4 || r > 21 || Math.random() < .25) continue;
    stones.push({ x: q.x + rand(-.35, .35), z: q.z + rand(-.35, .35), y: -.02, s: rand(.5, .75), shade: rand(.75, 1) });
  }
  for (const [name, list] of group(['RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Small_3'], stones)) add(name, list, { receive: true });
  const pebbles = [...ringPts(N(34), 9.7, 10.8), ...ringPts(N(30), 10.8, 18)].map(p => ({ x: p.x, z: p.z, y: -.02, s: rand(.8, 1.5), tilt: .3, shade: rand(.85, 1.1) }));
  for (const [name, list] of group(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5'], pebbles)) add(name, list, { shadow: gfx.quality === 'hoch' });
  natureReady = true; buildGardenDeco();
}

// ---------------- eyes on the bushes ----------------
// Small dark-blue to purple eye pairs sit on the bush silhouettes, 2-3 pairs per bush.
// They are self-lit (no light source, below the bloom threshold) and blink with quick lids.
// Before a wave, bushes in that direction fill up with eyes.
const BUSHES: { x: number; y: number; z: number; r: number; a: number }[] = [];
interface Pair { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; mat: THREE.MeshBasicMaterial; size: number; y0: number; blink: number; ph: number }
interface EyeBush { b: number; pairs: Pair[]; life: number; t: number }
const eyeBushes: EyeBush[] = [];
const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
const BASE_BUSHES = 14, EYE_SIZE = .032;
function eyeColor() { return new THREE.Color().setHSL(rand(.64, .78), rand(.6, .8), rand(.28, .36)); }
function activateBush(b: number, life: number) {
  if (b < 0 || eyeBushes.some(e => e.b === b) || eyeBushes.length > 40) return;
  const B = BUSHES[b], pairs: Pair[] = [], n = Math.random() < .5 ? 2 : 3;
  // face the garden: put the pairs on the inner side of the bush
  const ix = -Math.cos(B.a), iz = -Math.sin(B.a), tx = -iz, tz = ix;
  for (let k = 0; k < n; k++) {
    const size = EYE_SIZE * rand(.9, 1.1), gap = size * 2.7;
    const mat = new THREE.MeshBasicMaterial({ color: eyeColor(), transparent: true, opacity: 0, fog: false, depthWrite: false, depthTest: false });
    const g = new THREE.Group(), l = new THREE.Mesh(eyeGeo, mat), rr = new THREE.Mesh(eyeGeo, mat);
    l.scale.setScalar(size); rr.scale.setScalar(size); l.position.x = -gap / 2; rr.position.x = gap / 2; // always horizontal
    l.renderOrder = rr.renderOrder = 20; g.add(l, rr);
    const side = rand(-.6, .6) * B.r, up = rand(-.15, .45) * B.r;
    g.position.set(B.x + ix * B.r * .8 + tx * side, B.y + up, B.z + iz * B.r * .8 + tz * side);
    scene.add(g); pairs.push({ g, l, r: rr, mat, size, y0: 0, blink: rand(.3, 4), ph: rand(0, 7) });
  }
  eyeBushes.push({ b, pairs, life, t: 0 });
}
const nearestBushes = (angle: number, count: number) => BUSHES.map((B, i) => ({ i, d: Math.abs(Math.atan2(Math.sin(B.a - angle), Math.cos(B.a - angle))) })).sort((p, q) => p.d - q.d).slice(0, count).map(p => p.i);
export function warnEyes(dirs: number[], _types: number[][], warnTime: number) {
  for (const a of dirs) for (const b of nearestBushes(a + rand(-.1, .1), 3)) activateBush(b, warnTime + rand(1, 2));
}
let eyeCount = BASE_BUSHES;
/** night share 0..1: idle eyes in the bushes mostly at night */
export function setEyeNight(n: number) { eyeCount = Math.round(BASE_BUSHES * (.2 + .8 * n)); }
export function updateEyes(dt: number) {
  if (bare) return;
  if (BUSHES.length && eyeBushes.length < eyeCount) activateBush(Math.floor(Math.random() * BUSHES.length), rand(7, 16));
  for (let i = eyeBushes.length - 1; i >= 0; i--) {
    const E = eyeBushes[i]; E.t += dt;
    if (E.t >= E.life) { for (const p of E.pairs) { scene.remove(p.g); p.mat.dispose(); } eyeBushes.splice(i, 1); continue; }
    const fade = Math.min(1, E.t / .8, (E.life - E.t) / .8);
    for (const p of E.pairs) {
      p.mat.opacity = fade; p.ph += dt;
      // quick lid: closes from the top (bottom edge stays), opens again
      p.blink -= dt; let open = 1;
      if (p.blink < 0) { const b = -p.blink; open = b < .05 ? 1 - b / .05 : b < .12 ? (b - .05) / .07 : 1; if (b >= .12) p.blink = Math.random() < .18 ? .1 : rand(1.5, 6); }
      open = Math.max(.06, open);
      for (const m of [p.l, p.r]) { m.scale.set(p.size, p.size * open, p.size); m.position.y = -p.size * (1 - open); }
      p.g.position.y += Math.sin(p.ph * 1.1) * .0006; // barely moving
    }
  }
}
export function clearEyes() { for (const E of eyeBushes) for (const p of E.pairs) scene.remove(p.g); eyeBushes.length = 0; }

// ---------------- fog banks drifting in from the forest ----------------
// Finely animated mist: flat, ground-hugging strips (one instanced draw call) that are born between the trees,
// creep slowly towards the garden while their noise texture churns, and dissolve before they reach the beds.
const MIST = 30;
const mistU = { uTime: windU, uCol: { value: new THREE.Color(0x8aa0c8) }, uOp: { value: 1 } };
interface Mist { a: number; r: number; v: number; turn: number; len: number; wid: number; t: number; life: number; y: number }
const mists: Mist[] = [];
let mistMesh: THREE.InstancedMesh | null = null, mistFade: THREE.InstancedBufferAttribute, mistSeed: THREE.InstancedBufferAttribute;
function newMist(m: Partial<Mist> = {}, age = 0): Mist {
  const life = rand(22, 38);
  return Object.assign(m, { a: rand(0, Math.PI * 2), r: rand(18, 22), v: rand(.25, .5), turn: rand(-.012, .012), len: rand(5, 9), wid: rand(2.2, 3.6), t: age * life, life, y: rand(.25, .7) }) as Mist;
}
function buildFog() {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aFade; attribute float aSeed; varying vec2 vUv; varying float vF; varying float vS; varying vec2 vW;
      void main(){ vUv=uv; vF=aFade; vS=aSeed; vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.); vW=wp.xz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uCol; uniform float uOp; varying vec2 vUv; varying float vF; varying float vS; varying vec2 vW;
      float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        // world-space noise (strips blend seamlessly where they overlap), two layers moving against each other = churning
        vec2 p=vW*.55+vS*17.;
        float a=n(p+vec2(uTime*.07,uTime*.03))*.55+n(p*2.1-vec2(uTime*.11,-uTime*.05))*.3+n(p*4.3+vec2(uTime*.17,0.))*.15;
        float b=n(p*.7-vec2(uTime*.04,uTime*.06));
        float m=smoothstep(.38,.8,a*.75+b*.4);
        vec2 e=abs(vUv-.5)*2.; float edge=(1.-smoothstep(.35,1.,e.x))*(1.-smoothstep(.15,1.,e.y)); // soft, elongated strip
        float al=m*edge*vF*uOp*.65; if(al<.003) discard;
        gl_FragColor=vec4(uCol,al); }`,
  });
  mistMesh = new THREE.InstancedMesh(geo, mat, MIST); mistMesh.frustumCulled = false; mistMesh.renderOrder = 5;
  mistFade = new THREE.InstancedBufferAttribute(new Float32Array(MIST), 1); mistSeed = new THREE.InstancedBufferAttribute(new Float32Array(MIST), 1);
  geo.setAttribute('aFade', mistFade); geo.setAttribute('aSeed', mistSeed);
  for (let i = 0; i < MIST; i++) { mists.push(newMist({}, Math.random())); mistSeed.setX(i, Math.random()); }
  scene.add(mistMesh);
}
const mistM4 = new THREE.Matrix4(), mistQ = new THREE.Quaternion(), mistUp = new THREE.Vector3(0, 1, 0), mistP = new THREE.Vector3(), mistS = new THREE.Vector3();
function updateMist(dt: number) {
  if (!mistMesh) return;
  for (let i = 0; i < MIST; i++) {
    const m = mists[i]; m.t += dt;
    if (m.t >= m.life || m.r < 9.5) { newMist(m); mistSeed.setX(i, Math.random()); }
    m.r -= m.v * dt; m.a += m.turn * dt; // creeps inwards, curving slightly
    const k = m.t / m.life, inner = Math.min(1, Math.max(0, (m.r - 10) / 3)); // dissolves before the garden
    mistFade.setX(i, Math.min(1, k / .25, (1 - k) / .25) * inner);
    const x = Math.cos(m.a) * m.r, z = Math.sin(m.a) * m.r;
    // long side along the drift direction (towards the garden), stretching a bit while it creeps in
    mistQ.setFromAxisAngle(mistUp, -m.a); mistP.set(x, m.y, z); mistS.set(m.len * (1 + k * .3), 1, m.wid);
    mistMesh.setMatrixAt(i, mistM4.compose(mistP, mistQ, mistS));
  }
  mistMesh.instanceMatrix.needsUpdate = true; mistFade.needsUpdate = true;
}
// will-o'-wisps: small cold lights wandering between the trees, mostly at night
const wispTex = (() => {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.18, 'rgba(255,255,255,.75)'); grd.addColorStop(.45, 'rgba(255,255,255,.14)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(cv);
})();
interface Spirit { s: THREE.Sprite; a: number; r: number; y: number; da: number; ph: number; sp: number }
const spirits: Spirit[] = [];
function buildWisps() {
  for (let i = 0; i < 16; i++) {
    const col = new THREE.Color().setHSL(Math.random() < .6 ? rand(.47, .53) : rand(.72, .8), .9, .62);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wispTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    s.scale.setScalar(rand(.35, .55)); scene.add(s);
    spirits.push({ s, a: rand(0, Math.PI * 2), r: rand(10.5, 18), y: rand(.5, 2.2), da: rand(.02, .06) * (Math.random() < .5 ? -1 : 1), ph: rand(0, 7), sp: rand(.6, 1.4) });
  }
}
function updateWisps(dt: number, night: number) {
  for (const w of spirits) {
    w.a += w.da * dt; w.ph += dt * w.sp;
    w.s.position.set(Math.cos(w.a) * (w.r + Math.sin(w.ph * .4) * 1.2), w.y + Math.sin(w.ph) * .35, Math.sin(w.a) * (w.r + Math.sin(w.ph * .4) * 1.2));
    const flick = .65 + .35 * Math.sin(w.ph * 3.1) * Math.sin(w.ph * 1.7);
    (w.s.material as THREE.SpriteMaterial).opacity = (.12 + .88 * night) * flick;
  }
}
const fogLook = { col: new THREE.Color(0x8aa0c8), mul: 1, night: 1 };
/** colour + strength of the drifting fog (day-night) */
export function setFogLook(col: THREE.Color, mul: number, night = 1) { fogLook.col.copy(col); fogLook.mul = mul; fogLook.night = night; }
export function updateFog(dt: number) {
  updateWisps(dt, fogLook.night);
  mistU.uCol.value.copy(fogLook.col); mistU.uOp.value = Math.min(1.4, fogLook.mul);
  updateMist(dt);
}

// ---------------- small torches at the field corners ----------------
const glowTex = (() => {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(255,190,110,1)'); grd.addColorStop(.35, 'rgba(255,140,60,.35)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(cv);
})();
interface Torch { g: THREE.Group; flame: THREE.Sprite; glow: THREE.Mesh; ph: number }
const torches: Torch[] = [];
const torchGroup = new THREE.Group();
const stickMat = M(0x3a2a1c), headMat = M(0x221a12);
/** one torch per unique corner of the existing fields (shared corners get one torch) */
export function syncTorches(fields: { x: number; z: number }[], H: number) {
  if (!torchGroup.parent) scene.add(torchGroup);
  for (const t of torches) torchGroup.remove(t.g); torches.length = 0;
  const seen = new Set<string>();
  for (const f of fields) for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + i * Math.PI / 3; // pointy-top: corners at ±z
    const x = f.x + Math.cos(a) * H, z = f.z + Math.sin(a) * H, key = Math.round(x * 4) + ',' + Math.round(z * 4);
    if (seen.has(key)) continue; seen.add(key);
    const g = new THREE.Group(); g.position.set(x, 0, z);
    part(g, GEO.cyl, stickMat, .025, .55, .025, 0, .275, 0, false);
    part(g, GEO.cyl, headMat, .045, .08, .045, 0, .58, 0, false);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    flame.position.y = .7; flame.scale.set(.32, .45, 1); g.add(flame);
    const glow = new THREE.Mesh(GEO.circle, new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa050, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = .052; glow.scale.setScalar(1.25); g.add(glow);
    torchGroup.add(g); torches.push({ g, flame, glow, ph: rand(0, 7) });
  }
}
let torchLevel = 1;
/** 1 = full night flame, lower by day (small flame, no ground glow) */
export function setTorchLevel(l: number) { torchLevel = l; }
export function updateTorches(dt: number) {
  for (const t of torches) {
    t.ph += dt * rand(6, 11);
    const f = .85 + Math.sin(t.ph) * .08 + Math.sin(t.ph * 2.3) * .06, k = .55 + .45 * torchLevel;
    t.flame.scale.set(.3 * f * k, .44 * (2 - f) * k, 1);
    (t.glow.material as THREE.MeshBasicMaterial).opacity = .2 * f * torchLevel;
  }
}
export { ARENA };
