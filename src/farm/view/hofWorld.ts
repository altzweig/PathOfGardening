// The farm's ground and surroundings: lawn with trodden yard paths (juliovii textures, no visible tiling), a forest ring
// around the clearing with five gaps (Quaternius Nature MegaKit), single trees on the farm and wild grass patches where
// nobody walks or mows (behind the well, behind buildings, along closed fences, at the forest edge, low under fruit trees).
// Also provides the hooks the day-night module drives (fog look, torch level, eyes: not used on the farm by day).
import * as THREE from 'three';
import { gfx, rand, scene } from '../../view/core';
import { groundMaterial } from '../../view/textures';
import { Inst, instance, loadNature } from '../../view/nature';
import type { FarmCfg } from '../config';
import type { Hof } from '../hof';
import { seeded } from '../hof';

const SIZE = 170; // ground plane (m): clearing (rx 32) + forest that fills the view at the widest zoom
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);
function group<T>(names: string[], list: T[]) { const m = new Map<string, T[]>(); for (const it of list) { const n = pick(names); if (!m.has(n)) m.set(n, []); m.get(n)!.push(it); } return m; }

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

export class HofWorld {
  ground: THREE.Mesh;
  nature: THREE.Group | null = null;
  /** resolves once the forest, buildings' surroundings and trees are built (loading screen waits for it) */
  ready: Promise<void>;
  constructor(public cfg: FarmCfg, public hof: Hof, private free: (x: number, z: number, pad: number) => boolean) {
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), groundMaterial(control(hof)));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; scene.add(this.ground);
    this.ready = loadNature().then(() => this.build()).catch(e => console.error('nature models', e));
  }
  private build() {
    const W = this.nature = new THREE.Group(); W.name = 'nature'; scene.add(W);
    const hof = this.hof, dens = gfx.quality === 'niedrig' ? .5 : gfx.quality === 'mittel' ? .75 : 1, N = (n: number) => Math.max(1, Math.round(n * dens));
    /** random points in the ellipse ring k0..k1 (k = 1 forest edge) */
    const ring = (n: number, k0: number, k1: number, minD = 0, taken: { x: number; z: number; d: number }[] = []) => {
      const out: { x: number; z: number; k: number; a: number }[] = [];
      for (let tries = 0; out.length < n && tries < n * 40; tries++) {
        const a = rand(0, Math.PI * 2), k = Math.sqrt(rand(k0 * k0, k1 * k1)), x = Math.cos(a) * hof.rx * k, z = Math.sin(a) * hof.rz * k;
        if (minD && taken.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (minD + t.d) ** 2 / 4)) continue;
        if (minD) taken.push({ x, z, d: minD });
        out.push({ x, z, k, a });
      }
      return out;
    };
    const add = (name: string, list: Inst[], o: { shadow?: boolean; receive?: boolean; scale?: number; gapPad?: number } = {}) =>
      instance(W, name, list.filter(p => o.gapPad === undefined || !hof.inGap(p.x, p.z, o.gapPad)), o);
    // --- forest ring: a dense wall right at the edge, bigger trees behind; the gaps stay open
    const taken: { x: number; z: number; d: number }[] = [];
    const trees = [
      { names: [1, 3, 5].map(i => 'CommonTree_' + i), s: .7, n: 120, d: 3, k0: 1.06, k1: 1.75, col: () => hsl(rand(.22, .3), rand(.5, .65), rand(.34, .42)) },
      { names: [1, 2, 4, 5].map(i => 'Pine_' + i), s: .8, n: 140, d: 2.6, k0: 1.04, k1: 1.8, col: () => hsl(rand(.22, .3), rand(.3, .45), rand(.62, .78)) },
      { names: [1, 2, 3, 4, 5].map(i => 'TwistedTree_' + i), s: .4, n: 26, d: 4, k0: 1.2, k1: 1.75, col: () => hsl(rand(.2, .28), rand(.5, .65), rand(.36, .44)) },
    ];
    for (const T of trees) for (const [name, list] of group(T.names, ring(N(T.n), T.k0, T.k1, T.d, taken)))
      add(name, list.map(p => ({ x: p.x, z: p.z, y: -.1, s: T.s * rand(.8, 1.25) * (p.k > 1.4 ? 1.15 : 1), col: T.col(), shade: rand(.8, 1.05) })), { shadow: true, scale: T.s, gapPad: 1.4 });
    // bushes along the forest edge (the animals come out of here)
    const bushes = ring(N(170), .97, 1.12, 1.1).map(p => ({ x: p.x, z: p.z, s: rand(.65, 1.1), col: hsl(rand(.25, .33), rand(.5, .62), rand(.3, .38)) }));
    const fl = bushes.filter(() => Math.random() < .3);
    add('Bush_Common', bushes.filter(b => !fl.includes(b)), { shadow: true, gapPad: .2 });
    add('Bush_Common_Flowers', fl, { shadow: true, gapPad: .2 });
    // rocks, ferns, tall grass in the forest
    add('Rock_Medium_1', ring(N(18), 1.05, 1.7).map(p => ({ x: p.x, z: p.z, y: -.15, s: rand(.4, .8), tilt: .3, shade: rand(.75, 1) })), { shadow: true, gapPad: .5 });
    add('Rock_Medium_2', ring(N(14), 1.05, 1.7).map(p => ({ x: p.x, z: p.z, y: -.1, s: rand(.35, .7), tilt: .3, shade: rand(.75, 1) })), { shadow: true, gapPad: .5 });
    add('Fern_1', ring(N(160), 1.0, 1.7).map(p => ({ x: p.x, z: p.z, s: rand(.18, .3), tilt: .25, col: hsl(rand(.25, .35), rand(.35, .5), rand(.55, .68)) })), { gapPad: -.5 });
    add('Grass_Wispy_Tall', ring(N(70), 1.08, 1.6).map(p => ({ x: p.x, z: p.z, s: rand(.5, .8), col: hsl(rand(.2, .3), rand(.3, .45), rand(.6, .72)) })), { gapPad: -.5 });
    // single trees on the farm (Bastis brown circles)
    add('CommonTree_1', this.cfg.hof.trees.filter((_, i) => i % 2 === 0).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    add('CommonTree_3', this.cfg.hof.trees.filter((_, i) => i % 2 === 1).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    // a few common bushes right next to each wild bramble, so the brambles grow among the edge bushes
    const rb = seeded(31), beside: Inst[] = [];
    for (const b of hof.brambles) {
      const a = Math.atan2(b.z / hof.rz, b.x / hof.rx), n = 2 + Math.floor(rb() * 2);
      for (let i = 0; i < n; i++) { const da = (i % 2 ? 1 : -1) * (.045 + rb() * .04), e = hof.edge(a + da, hof.ellipse(b.x, b.z) + .02 + rb() * .07); beside.push({ x: e.x, z: e.z, s: .7 + rb() * .45, col: hsl(.25 + rb() * .08, .55, .3 + rb() * .08) }); }
    }
    add('Bush_Common', beside, { shadow: true });
    this.grass(W, gfx.quality === 'niedrig' ? .3 : gfx.quality === 'mittel' ? .55 : 1);
  }
  /** wild grass patches (hof.patches): dense and tall inside, thinner and lower outwards, ragged border; low = short grass only */
  private grass(W: THREE.Group, dens: number) {
    const hof = this.hof, rnd = seeded(41), R = (a: number, b: number) => a + rnd() * (b - a);
    const per = (this.cfg.grass?.perM2 ?? 20) * dens, out = new Map<string, Inst[]>();
    const put = (name: string, it: Inst) => { let l = out.get(name); if (!l) out.set(name, l = []); l.push(it); };
    for (const p of hof.patches) {
      const b = hof.patchBox(p), n = Math.round((b.x1 - b.x0) * (b.z1 - b.z0) * per);
      for (let i = 0; i < n; i++) {
        const x = R(b.x0, b.x1), z = R(b.z0, b.z1), d = hof.patchDensity(p, x, z) * hof.grassMask(x, z);
        if (d <= .02 || rnd() > Math.pow(d, .9)) continue;
        const wet = p.wet ? .06 : 0, col = hsl(R(.2, .27) + wet * .5, R(.38, .5) + wet, R(.64, .74) - d * .12);
        if (p.low) { put(rnd() < .8 ? 'Grass_Common_Short' : 'Grass_Wispy_Short', { x, z, s: R(.28, .42) * (.7 + .3 * d), col }); continue; }
        const h = (.3 + .75 * d) * R(.8, 1.15), r = rnd();
        if (d > .55) put(r < .6 ? 'Grass_Common_Tall' : r < .66 ? 'Grass_Wispy_Tall' : 'Grass_Common_Short', { x, z, s: h * (r < .66 ? .9 : 1.35), col });
        else if (d > .25) put(r < .25 ? 'Grass_Common_Tall' : r < .4 ? 'Grass_Wispy_Short' : 'Grass_Common_Short', { x, z, s: h * (r < .25 ? .8 : 1.15), col });
        else put(r < .3 ? 'Grass_Wispy_Short' : 'Grass_Common_Short', { x, z, s: h * R(.85, 1.1), col });
      }
    }
    for (const [name, list] of out) instance(W, name, list, { receive: true });
  }
}
