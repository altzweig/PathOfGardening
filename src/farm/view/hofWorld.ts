// The farm's ground and surroundings: splatmap ground (FreeStylized texture concept, no visible tiling), a forest ring
// around the clearing with five gaps (Quaternius Nature MegaKit), single trees on the farm and wild grass patches where
// nobody walks or mows (behind the well, behind buildings, along closed fences, at the forest edge, low under fruit trees).
// Also provides the hooks the day-night module drives (fog look, torch level, eyes: not used on the farm by day).
import * as THREE from 'three';
import { gfx, rand, scene } from '../../view/core';
import { groundMaterial } from '../../view/textures';
import { SplatMap } from './splat';
import { Inst, instance, loadNature, modelNames, plantMaterial } from '../../view/nature';
import type { FarmCfg } from '../config';
import type { Hof, Patch } from '../hof';
import { seeded } from '../hof';
import type { PropRec } from '../../world/data';
import { MODEL, syncCatalog } from '../../world/catalog';
import { registerCustomModels } from '../../world/custom';
import { PropLayer, thin } from '../../world/props';
import type { WorldPaint, Rect } from '../../world/paint';
import { GroundWeights, layeredGround } from '../../view/terrain';
import { appleTreeShape, buildAppleTree, yardMid } from './appleTree';

export const SIZE = 170; // ground plane (m): clearing (rx 32) + forest that fills the view at the widest zoom
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);

// day-night hooks (daynight.ts): the farm has no night yet
export function setEyeNight(_n: number) { /* no eyes on the farm */ }
export function setFogLook(_c: THREE.Color, _m: number, _n = 1) { /* no drifting fog by day */ }
export function setTorchLevel(_l: number) { /* house lamps follow the lantern */ }

/** splatmap from the hof layout (texture concept 20.11.2026): moss on the forest floor and in damp spots, field earth around
 *  the plots, trodden paths, cobblestone in the yard in front of the house. The world editor paints on top (HofWorld.splat). */
function buildSplat(hof: Hof, cfg: FarmCfg) {
  const sp = new SplatMap(SIZE), S = 1024, px = (v: number) => (v / SIZE + .5) * S, m = S / SIZE;
  const layer = (paint: (g: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter'; paint(g); return cv;
  };
  const blob = (g: CanvasRenderingContext2D, x: number, z: number, rx: number, rz: number, a: number, k: number) => {
    g.save(); g.translate(px(x), px(z)); g.rotate(a); g.scale(rx * m, rz * m);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(.6, `rgba(255,255,255,${k * .75})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
  };
  const line = (g: CanvasRenderingContext2D, list: typeof hof.paths, blur: number) => {
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.filter = `blur(${blur}px)`;
    for (const p of list) { g.lineWidth = p.w * m; g.beginPath(); p.pts.forEach((q, i) => i ? g.lineTo(px(q.x), px(q.z)) : g.moveTo(px(q.x), px(q.z))); g.stroke(); }
    g.filter = 'none';
  };
  const rnd = seeded(77);
  // moss: the forest floor (soft rise from the edge outwards), damp patches (behind the well) and loose spots along the edge
  sp.fromCanvas('moos', layer(g => {
    g.save(); g.translate(S / 2, S / 2); g.scale(hof.rx * m, hof.rz * m);
    const f = g.createRadialGradient(0, 0, .93, 0, 0, 1.12); f.addColorStop(0, 'rgba(255,255,255,0)'); f.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = f; g.fillRect(-4, -4, 8, 8); g.restore();
    for (const pa of hof.patches) if (pa.wet) for (const b of pa.blobs) blob(g, b.x, b.z, b.rx * 1.2, b.rz * 1.2, b.a, .8);
    for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, e = hof.edge(a, .8 + rnd() * .18); blob(g, e.x, e.z, 1.2 + rnd() * 2.5, 1 + rnd() * 1.8, rnd() * 3, .55 + rnd() * .4); }
  }));
  // field earth: a little wider than each plot (also the ones not laid out yet), worn rather than bare, so the raked bed
  // decals sit on matching soil and the garden still reads as part of the lawn
  const half = (cfg.plots?.size ?? 3) / 2 + .45;
  sp.fromCanvas('feld', layer(g => { g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,255,255,.62)'; g.globalCompositeOperation = 'lighten'; for (const p of cfg.hof.plots) { g.beginPath(); g.roundRect(px(p.x - half), px(p.z - half), half * 2 * m, half * 2 * m, 1.2 * m); g.fill(); } g.filter = 'none'; }));
  // trodden paths everywhere except the yard; the yard in front of the house and the way to the door are paved
  const paved = hof.paths.slice(0, 2), trodden = hof.paths.slice(2);
  sp.fromCanvas('pfad', layer(g => line(g, trodden, 4)));
  sp.fromCanvas('pflaster', layer(g => line(g, paved, 3)));
  return sp;
}
/** where the ground is pure grass_01 (512 px is plenty for these soft blobs): under the wild grass patches (a bit wider than the grass), never on paths */
function lushMap(hof: Hof) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const px = (v: number) => (v / SIZE + .5) * S, m = S / SIZE;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
  for (const pa of hof.patches) for (const b of pa.blobs) {
    g.save(); g.translate(px(b.x), px(b.z)); g.rotate(b.a); g.scale(b.rx * m * 1.35, b.rz * m * 1.35);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1), k = Math.min(1, b.d) * (pa.low ? .8 : 1);
    gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(.55, `rgba(255,255,255,${k * .7})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
  }
  g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round'; g.filter = 'blur(2px)';
  for (const p of hof.paths) { g.lineWidth = p.w * m; g.beginPath(); p.pts.forEach((q, i) => i ? g.lineTo(px(q.x), px(q.z)) : g.moveTo(px(q.x), px(q.z))); g.stroke(); }
  g.filter = 'none';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

export class HofWorld {
  ground: THREE.Mesh;
  /** paintable ground layers for the world editor (r moss, g field, b path, a pavement), see splat.ts */
  splat: SplatMap;
  nature: THREE.Group | null = null;
  /** placed objects (forest, bushes, plants, stones): from the world editor file, or generated */
  props: PropLayer | null = null;
  /** the full object list before thinning for lower quality (the editor works on this) */
  propList: PropRec[] = [];
  /** painted ground (world editor, with a logic): texture layers -> weight maps of the ground shader */
  paint: WorldPaint | null = null; weights: GroundWeights | null = null; private layered: ReturnType<typeof layeredGround> | null = null;
  /** edge length of the ground (m): the map of the world editor, else SIZE */
  extent = SIZE;
  /** resolves once the forest, buildings' surroundings and trees are built (loading screen waits for it) */
  ready: Promise<void>;
  constructor(public cfg: FarmCfg, public hof: Hof, private free: (x: number, z: number, pad: number) => boolean) {
    void this.free;
    const P = hof.logic ? cfg.world?.paint ?? null : null;
    if (P) {
      // world editor: painted layers on a base texture, the map size of the logic (+ a darkening margin around it)
      this.paint = P; this.extent = P.extent; this.splat = new SplatMap(8, 2);
      this.weights = new GroundWeights(P); this.weights.compose(P.full(), false);
      this.layered = layeredGround(this.weights);
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(P.extent + 140, P.extent + 140), this.layered.mat);
    } else {
      this.splat = buildSplat(hof, cfg);
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), groundMaterial(this.splat.tex, lushMap(hof), hof));
    }
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; scene.add(this.ground);
    this.ready = loadNature().then(() => this.build()).catch(e => console.error('nature models', e));
  }
  /** after painting: recompute + upload the weights of a texel rect (layers added/removed/reordered: slots first) */
  paintChanged(R?: Rect) {
    if (!this.weights || !this.layered) return;
    if (this.weights.updateSlots()) { void this.layered.setSlots(); R = undefined; }
    this.weights.compose(R ?? this.paint!.full());
  }
  /** the editor changed the map size: new paint object, new ground plane */
  setPaint(P: WorldPaint) {
    this.paint = P; this.extent = P.extent; if (this.cfg.world) this.cfg.world.paint = P;
    this.weights = new GroundWeights(P); this.weights.compose(P.full(), false);
    const old = this.layered; this.layered = layeredGround(this.weights); this.ground.material = this.layered.mat; old?.mat.dispose();
    this.ground.geometry.dispose(); this.ground.geometry = new THREE.PlaneGeometry(P.extent + 140, P.extent + 140);
  }
  private build() {
    registerCustomModels(); syncCatalog(modelNames());
    const W = this.nature = new THREE.Group(); W.name = 'nature'; scene.add(W);
    const hof = this.hof;
    this.propList = this.cfg.world?.props ?? (hof.logic ? [] : this.generate());
    this.props = new PropLayer(W);
    this.props.set(this.visibleProps());
    // single trees on the farm (Bastis brown circles; gameplay: apples to shake)
    const add = (name: string, list: Inst[], o: { shadow?: boolean; scale?: number } = {}) => instance(W, name, list, o);
    add('CommonTree_1', this.cfg.hof.trees.filter((t, i) => i % 2 === 0 && !t.big).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    add('CommonTree_3', this.cfg.hof.trees.filter((t, i) => i % 2 === 1 && !t.big).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    // the big apple tree in the middle of the yard (22.11.2026): wide, round crowns, the lanterns hang from it
    const mid = yardMid(this.cfg.hof);
    for (const t of this.cfg.hof.trees) if (t.big) W.add(buildAppleTree(appleTreeShape(t.x, t.z, mid)));
    this.grassDens = gfx.quality === 'niedrig' ? .3 : gfx.quality === 'mittel' ? .55 : 1;
    this.rebuildGrass();
  }
  /** props shown: thinned for lower quality, without the ones under a standing building (world editor) */
  private visibleProps() {
    const hof = this.hof, dens = gfx.quality === 'niedrig' ? .5 : gfx.quality === 'mittel' ? .75 : 1;
    // lanterns are built by lanterns.ts (they sit on fence posts / rocks and glow at night); the editor shows them as plain props
    const list = (hof.hideUnbuilt ? this.propList.filter(p => !hof.underBuilding(p.x, p.z, .1)) : this.propList).filter(p => p.m !== 'Laterne');
    return thin(list, dens, p => hof.ellipse(p.x, p.z) < (hof.logic ? 1.05 : .97));
  }
  /** a building went up (or a save with other buildings was loaded): props + grass under it go */
  buildingsChanged() {
    if (!this.hof.hideUnbuilt || !this.props) return;
    this.props.set(this.visibleProps()); this.rebuildGrass();
  }
  /** the generated layout (no world file yet): forest ring with gaps, edge bushes, rocks, ferns, tall grass, bushes beside the brambles */
  generate(): PropRec[] { return this.generateFor(this.hof); }
  /** forest/deco props of the generated farm around a given hof (editor template) */
  generateFor(hof: Hof): PropRec[] {
    const out: PropRec[] = [];
    /** random points in the ellipse ring k0..k1 (k = 1 forest edge) */
    const ring = (n: number, k0: number, k1: number, minD = 0, taken: { x: number; z: number; d: number }[] = []) => {
      const res: { x: number; z: number; k: number; a: number }[] = [];
      for (let tries = 0; res.length < n && tries < n * 40; tries++) {
        const a = rand(0, Math.PI * 2), k = Math.sqrt(rand(k0 * k0, k1 * k1)), x = Math.cos(a) * hof.rx * k, z = Math.sin(a) * hof.rz * k;
        if (minD && taken.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (minD + t.d) ** 2 / 4)) continue;
        if (minD) taken.push({ x, z, d: minD });
        res.push({ x, z, k, a });
      }
      return res;
    };
    const hex = (c: THREE.Color) => '#' + c.getHexString();
    const add = (name: string | string[], list: (Inst & { tilt?: number })[], gapPad?: number) => {
      for (const p of list) {
        if (gapPad !== undefined && hof.inGap(p.x, p.z, gapPad)) continue;
        const m = Array.isArray(name) ? pick(name) : name, t = p.tilt ?? 0;
        out.push({ m, x: p.x, z: p.z, y: p.y ?? MODEL.get(m)?.y, ry: rand(0, Math.PI * 2), s: p.s, tx: t ? t * (Math.random() - .5) : undefined, tz: t ? t * (Math.random() - .5) : undefined,
          c: p.col ? hex(p.col) : undefined, sh: p.col ? undefined : p.shade });
      }
    };
    // --- forest ring: a dense wall right at the edge, bigger trees behind; the gaps stay open
    const taken: { x: number; z: number; d: number }[] = [];
    const trees = [
      { names: [1, 3, 5].map(i => 'CommonTree_' + i), s: .7, n: 120, d: 3, k0: 1.06, k1: 1.75, col: () => hsl(rand(.22, .3), rand(.5, .65), rand(.34, .42)) },
      { names: [1, 2, 4, 5].map(i => 'Pine_' + i), s: .8, n: 140, d: 2.6, k0: 1.04, k1: 1.8, col: () => hsl(rand(.22, .3), rand(.3, .45), rand(.62, .78)) },
      { names: [1, 2, 3, 4, 5].map(i => 'TwistedTree_' + i), s: .4, n: 26, d: 4, k0: 1.2, k1: 1.75, col: () => hsl(rand(.2, .28), rand(.5, .65), rand(.36, .44)) },
    ];
    for (const T of trees) add(T.names, ring(T.n, T.k0, T.k1, T.d, taken).map(p => ({ x: p.x, z: p.z, y: -.1, s: T.s * rand(.8, 1.25) * (p.k > 1.4 ? 1.15 : 1), col: T.col() })), 1.4);
    // bushes along the forest edge (the animals come out of here)
    for (const p of ring(170, .97, 1.12, 1.1)) add(Math.random() < .3 ? 'Bush_Common_Flowers' : 'Bush_Common', [{ x: p.x, z: p.z, s: rand(.65, 1.1), col: hsl(rand(.25, .33), rand(.5, .62), rand(.3, .38)) }], .2);
    // rocks, ferns, tall grass in the forest
    add('Rock_Medium_1', ring(18, 1.05, 1.7).map(p => ({ x: p.x, z: p.z, y: -.15, s: rand(.4, .8), tilt: .3, shade: rand(.75, 1) })), .5);
    add('Rock_Medium_2', ring(14, 1.05, 1.7).map(p => ({ x: p.x, z: p.z, y: -.1, s: rand(.35, .7), tilt: .3, shade: rand(.75, 1) })), .5);
    add('Fern_1', ring(160, 1.0, 1.7).map(p => ({ x: p.x, z: p.z, s: rand(.18, .3), tilt: .25, col: hsl(rand(.25, .35), rand(.35, .5), rand(.55, .68)) })), -.5);
    add('Grass_Wispy_Tall', ring(70, 1.08, 1.6).map(p => ({ x: p.x, z: p.z, s: rand(.5, .8), col: hsl(rand(.2, .3), rand(.3, .45), rand(.6, .72)) })), -.5);
    // a few common bushes right next to each wild bramble, so the brambles grow among the edge bushes
    const rb = seeded(31);
    for (const b of hof.brambles) {
      const a = Math.atan2(b.z / hof.rz, b.x / hof.rx), n = 2 + Math.floor(rb() * 2);
      for (let i = 0; i < n; i++) { const da = (i % 2 ? 1 : -1) * (.045 + rb() * .04), e = hof.edge(a + da, hof.ellipse(b.x, b.z) + .02 + rb() * .07); add('Bush_Common', [{ x: e.x, z: e.z, s: .7 + rb() * .45, col: hsl(.25 + rb() * .08, .55, .3 + rb() * .08) }]); }
    }
    return out;
  }
  /** wild grass patches (hof.patches) + painted wild grass: dense and tall inside, thinner and lower outwards, ragged border;
   *  low = short grass only. Cheap tufts: 4 crossed quads (16 triangles, both sides) with a painted blade texture, one
   *  InstancedMesh per 10 m tile so the camera only draws the tiles it sees (and the editor rebuilds only touched tiles). */
  private grassDens = 1;
  private tiles = new Map<string, THREE.InstancedMesh>();
  private tuft: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
  /** rebuild the grass tiles in a world rectangle (default: everything) */
  rebuildGrass(x0 = -this.extent / 2, z0 = -this.extent / 2, x1 = this.extent / 2, z1 = this.extent / 2) {
    const T = 10, i0 = Math.floor(x0 / T), i1 = Math.floor(x1 / T), j0 = Math.floor(z0 / T), j1 = Math.floor(z1 / T);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.grassTile(i, j);
  }
  private grassTile(ti: number, tj: number) {
    const T = 10, key = ti + ',' + tj, W = this.nature!, hof = this.hof, P = this.paint;
    const old = this.tiles.get(key); if (old) { W.remove(old); old.dispose(); this.tiles.delete(key); }
    const x0 = ti * T, z0 = tj * T, x1 = x0 + T, z1 = z0 + T;
    const near: Patch[] = hof.patches.filter(p => { const b = hof.patchBox(p); return b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0; });
    const pmax = P ? P.grassMax(x0, z0, x1, z1) : 0;
    if (!near.length && pmax <= .01) return;
    const rnd = seeded(((ti + 100) * 7919) ^ ((tj + 100) * 104729)), R = (a: number, b: number) => a + rnd() * (b - a);
    // painted grass can be up to 3x as dense: more candidates in such tiles
    const mx = Math.max(1, Math.ceil(pmax - .001)), per = (this.cfg.grass?.perM2 ?? 24) * this.grassDens, n = Math.round(T * T * per * mx);
    const list: { x: number; z: number; w: number; h: number; ry: number; col: THREE.Color }[] = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * T, z = z0 + rnd() * T, ry = rnd() * Math.PI, pr = rnd();
      const g = hof.grassAt(x, z, undefined, near), d = Math.min(1, g.d);
      if (g.d <= .02 || pr * mx > Math.pow(g.d, .9)) continue;
      const wet = g.wet ? .06 : 0, col = hsl(R(.2, .27) + wet * .5, R(.4, .52) + wet, R(.52, .62) - d * .1);
      const h = (g.low ? R(.18, .3) * (.7 + .3 * d) : (.2 + .8 * d) * R(.8, 1.2)) * g.h;   // height (m): low at the rim, tall inside; painted height factor
      const w = g.low ? R(.35, .5) : R(.4, .6) * (.8 + .4 * d);
      list.push({ x, z, w, h, ry, col });
    }
    if (!list.length) return;
    this.tuft ??= { geo: tuftGeo(), mat: plantMaterial(bladeTex(), 'tuft', .07, THREE.FrontSide) };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const im = new THREE.InstancedMesh(this.tuft.geo, this.tuft.mat, list.length);
    list.forEach((t, i) => { m4.compose(v.set(t.x, 0, t.z), q.setFromEuler(e.set(0, t.ry, 0)), sc.set(t.w, t.h, t.w)); im.setMatrixAt(i, m4); im.setColorAt(i, t.col); });
    im.receiveShadow = true; im.castShadow = false; im.computeBoundingSphere(); W.add(im); this.tiles.set(key, im);
  }
}

/** grass tuft (16 triangles): 4 vertical quads crossed around the centre, slightly leaning out; 1 m high, 1 m wide (scaled per instance).
 *  Normals point up so the tuft is lit evenly from every side. */
function tuftGeo() {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI + (i % 2) * .2, c = Math.cos(a) * .5, s = Math.sin(a) * .5, lean = (i % 2 ? .08 : -.06), lx = -s * lean * 2, lz = c * lean * 2;
    const o = pos.length / 3;
    pos.push(-c, 0, -s, c, 0, s, c + lx, 1, s + lz, -c + lx, 1, -s + lz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3, o, o + 2, o + 1, o, o + 3, o + 2); // both windings: the back keeps the up-normal (DoubleSide would flip it and turn black)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}
/** painted blades (alpha): tapered, slightly bent, dark at the root and light at the tip; tinted per instance */
function bladeTex() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const rb = seeded(5), R = (a: number, b: number) => a + rb() * (b - a);
  for (let i = 0; i < 16; i++) {
    const x0 = R(.12, .88) * S, top = R(.05, .45) * S, bend = R(-.22, .22) * S, w = R(5, 10);
    const grd = g.createLinearGradient(0, S, 0, top); const l = R(.75, 1);
    grd.addColorStop(0, `rgb(${40 * l},${55 * l},${30 * l})`); grd.addColorStop(.3, `rgb(${90 * l},${115 * l},${65 * l})`); grd.addColorStop(.65, `rgb(${170 * l},${200 * l},${130 * l})`); grd.addColorStop(1, `rgb(${225 * l},${238 * l},${180 * l})`);
    g.fillStyle = grd; g.beginPath();
    g.moveTo(x0 - w, S); g.quadraticCurveTo(x0 - w * .6 + bend * .3, (S + top) / 2, x0 + bend, top);
    g.quadraticCurveTo(x0 + w * .6 + bend * .3, (S + top) / 2, x0 + w, S); g.closePath(); g.fill();
  }
  // transparent pixels get a blade colour instead of black, so the mipmaps don't draw dark seams around the blades
  const img = g.getImageData(0, 0, S, S), a = img.data;
  for (let i = 0; i < a.length; i += 4) if (a[i + 3] === 0) { a[i] = 110; a[i + 1] = 135; a[i + 2] = 80; }
  const t = new THREE.DataTexture(a, S, S, THREE.RGBAFormat); t.flipY = true; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}
