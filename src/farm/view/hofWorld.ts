// The farm's ground and surroundings: lawn with trodden yard paths (juliovii textures, no visible tiling), a forest ring
// around the clearing with five gaps (Quaternius Nature MegaKit), single trees on the farm, grass and flowers.
// Also provides the hooks the day-night module drives (fog look, torch level, eyes: not used on the farm by day).
import * as THREE from 'three';
import { gfx, rand, scene } from '../../view/core';
import { groundMaterial } from '../../view/textures';
import { Inst, instance, loadNature } from '../../view/nature';
import type { FarmCfg } from '../config';
import type { Hof } from '../hof';

const SIZE = 110; // ground plane (m)
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);
function group<T>(names: string[], list: T[]) { const m = new Map<string, T[]>(); for (const it of list) { const n = pick(names); if (!m.has(n)) m.set(n, []); m.get(n)!.push(it); } return m; }

// day-night hooks (daynight.ts): the farm has no night yet
export function setEyeNight(_n: number) { /* no eyes on the farm */ }
export function setFogLook(_c: THREE.Color, _m: number, _n = 1) { /* no drifting fog by day */ }
export function setTorchLevel(_l: number) { /* house lamps follow the lantern */ }

/** control map for the ground shader: r = bare dirt (yard + paths), g = worn patches, b = brightness */
function control(cfg: FarmCfg, hof: Hof) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const px = (v: number) => (v / SIZE + .5) * S, m = S / SIZE;
  g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 700; i++) { const x = Math.random() * S, y = Math.random() * S, r = rand(6, 26); const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(0,110,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  // trodden yard + paths (red)
  const H = cfg.hof, B = H.buildings;
  g.strokeStyle = 'rgba(170,0,0,1)'; g.lineCap = 'round'; g.lineJoin = 'round'; g.filter = 'blur(5px)';
  const path = (pts: { x: number; z: number }[], w: number) => { g.lineWidth = w * m; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(px(p.x), px(p.z)) : g.moveTo(px(p.x), px(p.z))); g.stroke(); };
  const yard = { x: 3, z: -5.6 };
  path([{ x: -6, z: -6.2 }, yard, { x: 11, z: -5.4 }], 3.2);                       // yard in front of the house
  path([yard, { x: H.door.x, z: H.door.z }], 2);
  for (const gp of hof.gaps) { const e = hof.edge(gp.a, 1.15); path([yard, { x: (yard.x + e.x) / 2 + Math.sin(gp.a) * 1.5, z: (yard.z + e.z) / 2 }, e], 1.6); }
  path([yard, { x: B.mill.x, z: B.mill.z + 2 }], 1.4); path([yard, { x: B.bakery.x + 1, z: B.bakery.z + 2 }], 1.4);
  path([{ x: 0, z: 6.5 }, { x: B.silo.x, z: B.silo.z - 1.5 }, { x: B.chickens.x, z: B.chickens.z - 2 }], 1.4);
  path([{ x: 0, z: 6.5 }, { x: B.cows.x, z: B.cows.z - 2 }, { x: B.dairy.x + 1, z: B.dairy.z - 1.5 }], 1.4);
  path([{ x: -7.5, z: -5 }, { x: B.carpentry.x + 1.5, z: B.carpentry.z + 1.5 }], 1.4);
  path([{ x: -7.5, z: 4 }, { x: B.workshop.x + 1.5, z: B.workshop.z - 1.2 }], 1.4);
  path([{ x: 8, z: -2 }, { x: B.juicer.x - 1.5, z: B.juicer.z }], 1.4);
  g.filter = 'none';
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
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), groundMaterial(control(cfg, hof)));
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
      { names: [1, 3, 5].map(i => 'CommonTree_' + i), s: .7, n: 60, d: 3, k0: 1.06, k1: 1.9, col: () => hsl(rand(.22, .3), rand(.5, .65), rand(.34, .42)) },
      { names: [1, 2, 4, 5].map(i => 'Pine_' + i), s: .8, n: 70, d: 2.6, k0: 1.04, k1: 2, col: () => hsl(rand(.22, .3), rand(.3, .45), rand(.62, .78)) },
      { names: [1, 2, 3, 4, 5].map(i => 'TwistedTree_' + i), s: .4, n: 14, d: 4, k0: 1.2, k1: 1.9, col: () => hsl(rand(.2, .28), rand(.5, .65), rand(.36, .44)) },
    ];
    for (const T of trees) for (const [name, list] of group(T.names, ring(N(T.n), T.k0, T.k1, T.d, taken)))
      add(name, list.map(p => ({ x: p.x, z: p.z, y: -.1, s: T.s * rand(.8, 1.25) * (p.k > 1.4 ? 1.15 : 1), col: T.col(), shade: rand(.8, 1.05) })), { shadow: true, scale: T.s, gapPad: 1.4 });
    // bushes along the forest edge (the animals come out of here)
    const bushes = ring(N(110), .97, 1.12, 1.1).map(p => ({ x: p.x, z: p.z, s: rand(.65, 1.1), col: hsl(rand(.25, .33), rand(.5, .62), rand(.3, .38)) }));
    const fl = bushes.filter(() => Math.random() < .3);
    add('Bush_Common', bushes.filter(b => !fl.includes(b)), { shadow: true, gapPad: .2 });
    add('Bush_Common_Flowers', fl, { shadow: true, gapPad: .2 });
    // rocks, ferns, tall grass in the forest
    add('Rock_Medium_1', ring(N(10), 1.05, 1.8).map(p => ({ x: p.x, z: p.z, y: -.15, s: rand(.4, .8), tilt: .3, shade: rand(.75, 1) })), { shadow: true, gapPad: .5 });
    add('Rock_Medium_2', ring(N(8), 1.05, 1.8).map(p => ({ x: p.x, z: p.z, y: -.1, s: rand(.35, .7), tilt: .3, shade: rand(.75, 1) })), { shadow: true, gapPad: .5 });
    add('Fern_1', ring(N(90), 1.0, 1.8).map(p => ({ x: p.x, z: p.z, s: rand(.18, .3), tilt: .25, col: hsl(rand(.25, .35), rand(.35, .5), rand(.55, .68)) })), { gapPad: -.5 });
    add('Grass_Wispy_Tall', ring(N(70), .95, 1.6).map(p => ({ x: p.x, z: p.z, s: rand(.5, .8), col: hsl(rand(.2, .3), rand(.3, .45), rand(.6, .72)) })), { gapPad: -.5 });
    // single trees on the farm (Bastis brown circles)
    add('CommonTree_1', this.cfg.hof.trees.filter((_, i) => i % 2 === 0).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    add('CommonTree_3', this.cfg.hof.trees.filter((_, i) => i % 2 === 1).map(t => ({ x: t.x, z: t.z, y: -.05, s: .55 * rand(.9, 1.1), col: hsl(rand(.23, .3), .6, rand(.36, .42)), shade: 1 })), { shadow: true, scale: .55 });
    // lawn on the farm: grass tufts, clover, flowers, pebbles; never on plots, buildings or paths
    const inside = (n: number, pad: number) => ring(n * 3, .05, .97).filter(p => this.free(p.x, p.z, pad)).slice(0, n);
    const grassCol = () => hsl(rand(.2, .3), rand(.35, .5), rand(.58, .7));
    for (const [name, list] of group(['Grass_Common_Short', 'Grass_Common_Short', 'Grass_Common_Tall'], inside(N(420), .5)))
      add(name, list.map(p => ({ x: p.x, z: p.z, s: rand(.32, .55), col: grassCol() })));
    for (const [name, list] of group(['Clover_1', 'Clover_2'], inside(N(80), .4))) add(name, list.map(p => ({ x: p.x, z: p.z, s: rand(.3, .45), col: hsl(rand(.24, .32), .4, rand(.6, .7)) })));
    for (const [name, list] of group(['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single', 'Flower_4_Single'], inside(N(60), .4)))
      add(name, list.map(p => ({ x: p.x, z: p.z, s: rand(.22, .34), col: hsl(rand(.08, .15), .3, .95) })));
    for (const [name, list] of group(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3'], inside(N(40), .3)))
      add(name, list.map(p => ({ x: p.x, z: p.z, y: -.02, s: rand(.6, 1.1), tilt: .3, shade: rand(.85, 1.1) })));
  }
}
