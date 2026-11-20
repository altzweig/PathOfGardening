// The farm's ground and surroundings: lawn with trodden yard paths (juliovii textures, no visible tiling), a forest ring
// around the clearing with five gaps (Quaternius Nature MegaKit), single trees on the farm and wild grass patches where
// nobody walks or mows (behind the well, behind buildings, along closed fences, at the forest edge, low under fruit trees).
// Also provides the hooks the day-night module drives (fog look, torch level, eyes: not used on the farm by day).
import * as THREE from 'three';
import { gfx, rand, scene } from '../../view/core';
import { groundMaterial } from '../../view/textures';
import { Inst, instance, loadNature, plantMaterial } from '../../view/nature';
import type { FarmCfg } from '../config';
import type { Hof, Patch } from '../hof';
import { seeded } from '../hof';
import type { PropRec } from '../../world/data';
import { MODEL } from '../../world/catalog';
import { registerCustomModels } from '../../world/custom';
import { PropLayer, thin } from '../../world/props';
import type { WorldPaint } from '../../world/paint';

export const SIZE = 170; // ground plane (m): clearing (rx 32) + forest that fills the view at the widest zoom
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);

// day-night hooks (daynight.ts): the farm has no night yet
export function setEyeNight(_n: number) { /* no eyes on the farm */ }
export function setFogLook(_c: THREE.Color, _m: number, _n = 1) { /* no drifting fog by day */ }
export function setTorchLevel(_l: number) { /* house lamps follow the lantern */ }

/** control map for the ground shader: r = bare dirt (yard + paths), g = worn patches, b = brightness */
function control(hof: Hof) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const px = (v: number) => (v / SIZE + .5) * S, m = S / SIZE;
  g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 700; i++) { const x = Math.random() * S, y = Math.random() * S, r = rand(6, 26); const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(0,110,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  // trodden yard + paths (red)
  g.strokeStyle = 'rgba(170,0,0,1)'; g.lineCap = 'round'; g.lineJoin = 'round'; g.filter = 'blur(5px)';
  for (const p of hof.paths) { g.lineWidth = p.w * m; g.beginPath(); p.pts.forEach((q, i) => i ? g.lineTo(px(q.x), px(q.z)) : g.moveTo(px(q.x), px(q.z))); g.stroke(); }
  g.filter = 'none';
  // under the wild grass patches the lawn stays lush (no worn spots)
  g.globalCompositeOperation = 'multiply';
  for (const pa of hof.patches) for (const b of pa.blobs) {
    g.save(); g.translate(px(b.x), px(b.z)); g.rotate(b.a); g.scale(b.rx * m * 1.3, b.rz * m * 1.3);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(255,0,255,${Math.min(1, b.d)})`); gr.addColorStop(1, 'rgba(255,0,255,0)');
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
  }
  // brightness (blue): full light on the farm, a little darker deep in the forest
  g.globalCompositeOperation = 'lighter';
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 1);
  void grd;
  g.save(); g.translate(S / 2, S / 2); g.scale(hof.rx * m, hof.rz * m);
  const b = g.createRadialGradient(0, 0, .9, 0, 0, 2.2); b.addColorStop(0, 'rgba(0,0,255,1)'); b.addColorStop(1, 'rgba(0,0,120,1)');
  g.fillStyle = b; g.fillRect(-4, -4, 8, 8); g.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

/** where the ground is pure green lawn: under the wild grass patches (a bit wider than the grass), never on paths */
function lushMap(hof: Hof) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const px = (v: number) => (v / SIZE + .5) * S, m = S / SIZE;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
  for (const pa of hof.patches) for (const b of pa.blobs) {
    g.save(); g.translate(px(b.x), px(b.z)); g.rotate(b.a); g.scale(b.rx * m * 1.35, b.rz * m * 1.35);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1), k = Math.min(1, b.d) * (pa.low ? .8 : 1);
    gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(.55, `rgba(255,255,255,${k * .7})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
  }
  g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round'; g.filter = 'blur(4px)';
  for (const p of hof.paths) { g.lineWidth = p.w * m; g.beginPath(); p.pts.forEach((q, i) => i ? g.lineTo(px(q.x), px(q.z)) : g.moveTo(px(q.x), px(q.z))); g.stroke(); }
  g.filter = 'none';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

export class HofWorld {
  ground: THREE.Mesh;
  nature: THREE.Group | null = null;
  /** placed objects (forest, bushes, plants, stones): from the world editor file, or generated */
  props: PropLayer | null = null;
  /** the full object list before thinning for lower quality (the editor works on this) */
  propList: PropRec[] = [];
  /** painted ground (world editor) and its two shader textures */
  paint: WorldPaint | null; paintTex: { a: THREE.DataTexture; b: THREE.DataTexture } | null = null;
  /** resolves once the forest, buildings' surroundings and trees are built (loading screen waits for it) */
  ready: Promise<void>;
  constructor(public cfg: FarmCfg, public hof: Hof, private free: (x: number, z: number, pad: number) => boolean) {
    void this.free;
    this.paint = cfg.world?.paint ?? null;
    if (this.paint) {
      const P = this.paint, T = (d: Uint8Array) => { const t = new THREE.DataTexture(d, P.size, P.size, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
      P.sync(); this.paintTex = { a: T(P.a), b: T(P.b) };
    }
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), groundMaterial(control(hof), lushMap(hof), this.paintTex ?? undefined));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; scene.add(this.ground);
    this.ready = loadNature().then(() => this.build()).catch(e => console.error('nature models', e));
  }
  /** after painting: upload the changed paint maps */
  paintChanged() { if (this.paintTex) { this.paintTex.a.needsUpdate = true; this.paintTex.b.needsUpdate = true; } }
  private build() {
    registerCustomModels();
    const W = this.nature = new THREE.Group(); W.name = 'nature'; scene.add(W);
    const hof = this.hof, dens = gfx.quality === 'niedrig' ? .5 : gfx.quality === 'mittel' ? .75 : 1;
    this.propList = this.cfg.world?.props ?? this.generate();
    this.props = new PropLayer(W);
    this.props.set(thin(this.propList, dens, p => hof.ellipse(p.x, p.z) < .97));
    // single trees on the farm (Bastis brown circles; gameplay: apples to shake)
    const add = (name: string, list: Inst[], o: { shadow?: boolean; scale?: number } = {}) => instance(W, name, list, o);
    add('CommonTree_1', this.cfg.hof.trees.filter((_, i) => i % 2 === 0).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    add('CommonTree_3', this.cfg.hof.trees.filter((_, i) => i % 2 === 1).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    this.grassDens = gfx.quality === 'niedrig' ? .3 : gfx.quality === 'mittel' ? .55 : 1;
    this.rebuildGrass();
  }
  /** the generated layout (no world file yet): forest ring with gaps, edge bushes, rocks, ferns, tall grass, bushes beside the brambles */
  generate(): PropRec[] {
    const hof = this.hof, out: PropRec[] = [];
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
  rebuildGrass(x0 = -SIZE / 2, z0 = -SIZE / 2, x1 = SIZE / 2, z1 = SIZE / 2) {
    const T = 10, i0 = Math.floor(x0 / T), i1 = Math.floor(x1 / T), j0 = Math.floor(z0 / T), j1 = Math.floor(z1 / T);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.grassTile(i, j);
  }
  private grassTile(ti: number, tj: number) {
    const T = 10, key = ti + ',' + tj, W = this.nature!, hof = this.hof, P = this.paint;
    const old = this.tiles.get(key); if (old) { W.remove(old); old.dispose(); this.tiles.delete(key); }
    const x0 = ti * T, z0 = tj * T, x1 = x0 + T, z1 = z0 + T;
    const near: Patch[] = hof.patches.filter(p => { const b = hof.patchBox(p); return b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0; });
    if (!near.length && !(P && P.maxIn(6, x0, z0, x1, z1) > .01)) return;
    const rnd = seeded(((ti + 100) * 7919) ^ ((tj + 100) * 104729)), R = (a: number, b: number) => a + rnd() * (b - a);
    const per = (this.cfg.grass?.perM2 ?? 24) * this.grassDens, n = Math.round(T * T * per);
    const list: { x: number; z: number; w: number; h: number; ry: number; col: THREE.Color }[] = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * T, z = z0 + rnd() * T, ry = rnd() * Math.PI, pr = rnd();
      const g = hof.grassAt(x, z, undefined, near), d = g.d;
      if (d <= .02 || pr > Math.pow(d, .9)) continue;
      const wet = g.wet ? .06 : 0, col = hsl(R(.2, .27) + wet * .5, R(.4, .52) + wet, R(.52, .62) - d * .1);
      const h = g.low ? R(.18, .3) * (.7 + .3 * d) : (.2 + .8 * d) * R(.8, 1.2);   // height (m): low at the rim, tall inside
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
