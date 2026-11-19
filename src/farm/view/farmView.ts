// 3D view of the farm: buildings, plots, the blueberry bush, the basket at the Lager, the farmer with automatic tools,
// raccoons + hares, pellets, loot, effects, highlight of the hovered target, camera (follow + cutscene shots).
// Reads FarmState + DaySim; never changes them.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  GEO, PART, V, burst, camera, clamp, composer, decal, gardenLight, gradePass, hemi, lantern, lerp, lerpAngle, makeBar, moon, punchStar,
  rand, renderer, scene, setBar, slashSmear, torch, updateFx, windU,
} from '../../view/core';
import { updateDayNight, dayNow, resetDayNight } from '../../view/daynight';
import { updateSeasons } from '../../view/seasons';
import { bedMaterial } from '../../view/textures';
import { BUSH_MAT, buildPlant, fruitMesh, PROJ_BLUE } from '../../view/models';
import { animate, makeAnimal, Animal as AView } from '../../view/animals';
import { Rig, animateArms, animateLegs, buildFarmer, disposeFarmer } from '../../view/farmer';
import { basket, cranGun, rakeTool, seedBag, setArsenalEnv, setArsenalLight, sickle, wateringCan } from '../../view/arsenal';
import { play, setListener, sfx } from '../../audio';
import type { Look } from '../../look';
import type { BuildingId, FarmCfg, ItemId } from '../config';
import { BUILDING_IDS } from '../config';
import type { FarmState } from '../state';
import type { Hof } from '../hof';
import type { Animal, DaySim, Ev, Target } from '../sim';
import { HofWorld } from './hofWorld';
import { BuildingView, buildBuilding, setWindowGlow } from './buildings';

const ITEM_HEX: Record<string, number> = { blue: 0x4a64f0, wheat: 0xe0b850, straw: 0xe8d488, nut: 0xc08a4a, garlic: 0xf0ead8, flour: 0xf4f0e6, bread: 0xb8782e, juice: 0x6a3cc0, milk: 0xf8f8f0, cheese: 0xf0c850, egg: 0xf4e8d0, plank: 0xa87a48 };
export const itemHex = (id: ItemId) => ITEM_HEX[id] ?? 0xcccccc;
const itemMats = new Map<string, THREE.MeshStandardMaterial>();
function itemMat(id: ItemId) { let m = itemMats.get(id); if (!m) { m = new THREE.MeshStandardMaterial({ color: itemHex(id), roughness: .55, emissive: itemHex(id), emissiveIntensity: .15 }); itemMats.set(id, m); } return m; }
/** small world model of a good (loot, carry pile, basket) */
function itemMesh(id: ItemId, s = 1): THREE.Object3D {
  if (id === 'blue') return fruitMesh('blue', .9 * s);
  const g = new THREE.Group();
  if (id === 'wheat' || id === 'straw') { const m = new THREE.Mesh(GEO.capsule, itemMat(id)); m.scale.set(.035 * s, .05 * s, .035 * s); m.rotation.z = Math.PI / 2; g.add(m); }
  else { const m = new THREE.Mesh(GEO.sph, itemMat(id)); m.scale.setScalar(.075 * s); g.add(m); }
  return g;
}

// ---------------- plots ----------------
const STEMS = 96;
const stemGeo = (() => { const g = new THREE.CylinderGeometry(.012, .016, 1, 5); g.translate(0, .5, 0); return g; })();
const earGeo = (() => { const g = new THREE.CapsuleGeometry(.022, .11, 3, 6); g.translate(0, .06, 0); return g; })();
const stemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 });
const earMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5634, roughness: .9 });
const clodMat = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
const weedMat = new THREE.MeshStandardMaterial({ color: 0x6a9a3a, roughness: .9, flatShading: true });
const seedMat = new THREE.MeshStandardMaterial({ color: 0xd8b060, roughness: .8 });
const G_GREEN = new THREE.Color(0x5e9a38), G_GOLD = new THREE.Color(0xe0b448), G_EAR = new THREE.Color(0xf0c860);
interface PlotView { g: THREE.Group; soil: THREE.Mesh; soilMat: THREE.MeshStandardMaterial; edge: THREE.Group; wild: THREE.Group; furrows: THREE.Group; weeds: THREE.Group; seeds: THREE.Group;
  stems: THREE.InstancedMesh; ears: THREE.InstancedMesh; spots: { x: number; z: number; r: number; s: number }[]; key: string; drop: THREE.Sprite; wet: number }

// ---------------- sprites ----------------
function canvasSprite(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, sw: number) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false, color: 0xc8c8c8 })); // below the bloom threshold
  s.scale.set(sw, sw * h / w, 1); s.renderOrder = 990; return s;
}
const dropSprite = () => canvasSprite(64, 80, g => {
  g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(50, 32, 58, 44, 58, 54); g.arc(32, 54, 26, 0, Math.PI); g.bezierCurveTo(6, 44, 14, 32, 32, 6); g.closePath();
  g.fillStyle = '#1b3b66'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#5ab8ff'; g.beginPath(); g.arc(32, 55, 17, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(25, 49, 5, 0, Math.PI * 2); g.fill();
}, .42);
function bubbleSprite(text: string) {
  return canvasSprite(320, 220, g => {
    const blobs: [number, number, number][] = [[160, 90, 70], [95, 95, 50], [225, 95, 52], [130, 55, 46], [195, 55, 44], [160, 125, 48]];
    for (const [pass, grow, col] of [[0, 6, '#1a1410'], [1, 0, '#fffaf0']] as const) { void pass; g.fillStyle = col; for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + grow, 0, Math.PI * 2); g.fill(); } }
    for (const [x, y, r] of [[118, 182, 14], [92, 206, 8]] as const) { g.fillStyle = '#1a1410'; g.beginPath(); g.arc(x, y, r + 4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2a1a10'; g.font = '800 44px "Alegreya Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 160, 92);
  }, 1.6);
}

// ---------------- player ----------------
interface PlayerView {
  rig: Rig; g: THREE.Group; body: THREE.Group; rake: THREE.Group; rakeIn: THREE.Group; can: ReturnType<typeof wateringCan>; canG: THREE.Group; bag: THREE.Group; sick: THREE.Group;
  gun: ReturnType<typeof cranGun>; rot: number; walk: number; stepN: number; twist: number; recoil: number; lookKey: string; actT: number;
}
interface AnimalView { v: AView; bar: THREE.Group; key: string; frozen: number }

export type CamShot = { x: number; z: number; zoom?: number } | null;

export class FarmView {
  world: HofWorld;
  buildings = new Map<BuildingId, BuildingView>();
  plots: PlotView[] = [];
  bush: { g: THREE.Group; fruits: THREE.Mesh[]; bar: THREE.Group; leaf: THREE.MeshStandardMaterial; unripe: THREE.MeshStandardMaterial; drop: THREE.Sprite };
  basketG: THREE.Group; basketPile = new THREE.Group(); private pileKey = '';
  player: PlayerView | null = null;
  animals = new Map<number, AnimalView>();
  private pelletPool: THREE.Mesh[] = []; private lootViews = new Map<number, THREE.Object3D>();
  private hl: { ring: THREE.Mesh; square: THREE.Group; mat: THREE.MeshBasicMaterial };
  private arrow: THREE.Group; arrowAt: { x: number; z: number; y?: number } | null = null;
  private bubble: { s: THREE.Sprite; id: number; text: string } | null = null;
  private actBar = makeBar(.8, .08, 0xffe08a);
  camX = 0; camZ = 0; zoom = 1; shot: CamShot = null; private shotK = 0; shake = 0;
  hover: Target | null = null; hoverOk = true;
  hurtT = 0;
  private dyn = new THREE.Group();

  constructor(public cfg: FarmCfg, public hof: Hof, public s: FarmState) {
    setArsenalEnv(new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture);
    const H = cfg.hof, half = cfg.plots.size / 2 + .35;
    const free = (x: number, z: number, pad: number) => {
      for (const p of H.plots) if (Math.abs(x - p.x) < half + pad && Math.abs(z - p.z) < half + pad) return false;
      for (const o of hof.obstacles) {
        if (o.kind === 'circle') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad + .3) return false; }
        else { const dx = x - o.x, dz = z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw + pad + .6 && Math.abs(lz) < o.hd + pad + 1.2) return false; }
      }
      return Math.hypot(x - H.door.x, z - H.door.z) > 1.5 + pad;
    };
    this.world = new HofWorld(cfg, hof, free);
    scene.add(this.dyn);
    // buildings
    for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) {
      const r = H.buildings[id]; if (!r) continue;
      const v = buildBuilding(id, r, cfg.buildings[id]?.level ?? 0); scene.add(v.root); this.buildings.set(id, v);
    }
    const house = this.buildings.get('house');
    if (house?.lamp) { house.root.updateMatrixWorld(true); const p = house.root.localToWorld(house.lamp.clone()); lantern.position.copy(p); lantern.distance = 10; }
    // plots
    H.plots.forEach((p, i) => this.plots.push(this.makePlot(p.x, p.z, i)));
    // bush
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: .85, flatShading: true }), head = new THREE.MeshStandardMaterial({ color: 0x5a3a20 });
    const bp = buildPlant('blue', { leaf, head }); bp.g.scale.setScalar(1.25); bp.g.position.set(H.bush.x, 0, H.bush.z); scene.add(bp.g);
    bp.g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const unripe = new THREE.MeshStandardMaterial({ color: 0x9ab860, roughness: .6 });
    const bdrop = dropSprite(); scene.add(bdrop); bdrop.position.set(H.bush.x, 1.75, H.bush.z);
    this.bush = { g: bp.g, fruits: bp.fruits, bar: makeBar(.9, .09, 0x6a7cff), leaf, unripe, drop: bdrop };
    // harvest basket at the Lager
    this.basketG = basket(.34, .24); this.basketG.position.set(H.basket.x, 0, H.basket.z); this.basketG.add(this.basketPile); scene.add(this.basketG);
    this.basketG.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    // highlight
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: .7, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(GEO.ring, mat); ring.rotation.x = -Math.PI / 2; scene.add(ring);
    const square = new THREE.Group(); const S = cfg.plots.size + .2;
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(GEO.plane, mat); b.rotation.x = -Math.PI / 2; const hz = i < 2; b.scale.set(hz ? S + .1 : .1, hz ? .1 : S + .1, 1); b.position.set(hz ? 0 : (i === 2 ? -S / 2 : S / 2), .14, hz ? (i === 0 ? -S / 2 : S / 2) : 0); square.add(b); }
    scene.add(square);
    this.hl = { ring, square, mat };
    // world arrow (tutorial): a billboard pointing down at the spot
    this.arrow = new THREE.Group();
    const arr = canvasSprite(96, 128, g => {
      g.beginPath(); g.moveTo(30, 6); g.lineTo(66, 6); g.lineTo(66, 62); g.lineTo(90, 62); g.lineTo(48, 120); g.lineTo(6, 62); g.lineTo(30, 62); g.closePath();
      g.fillStyle = '#ffb21e'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#3a2008'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(36, 12, 10, 50);
    }, .55);
    (arr.material as THREE.SpriteMaterial).color.setScalar(.85); arr.center.set(.5, 0); this.arrow.add(arr);
    this.arrow.visible = false; scene.add(this.arrow);
    this.syncBuildings();
  }

  // ---------------- plots ----------------
  private makePlot(x: number, z: number, i: number): PlotView {
    const S = this.cfg.plots.size, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const soilMat = bedMaterial() as THREE.MeshStandardMaterial;
    const soil = new THREE.Mesh(new THREE.BoxGeometry(S, .12, S, 8, 1, 8), soilMat); soil.position.y = .01; soil.receiveShadow = true;
    { const p = soil.geometry.attributes.position; for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) p.setY(k, p.getY(k) + rand(-.012, .02)); soil.geometry.computeVertexNormals(); }
    g.add(soil);
    const edge = new THREE.Group(); g.add(edge);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(GEO.box, woodMat), hz = k < 2; b.scale.set(hz ? S + .16 : .08, .16, hz ? .08 : S + .16); b.position.set(hz ? 0 : (k === 2 ? -1 : 1) * (S / 2 + .04), .06, hz ? (k === 0 ? -1 : 1) * (S / 2 + .04) : 0); b.castShadow = true; b.receiveShadow = true; edge.add(b); }
    // closed plot: four stakes with a twine
    const wild = new THREE.Group(); g.add(wild);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = new THREE.Mesh(GEO.box, woodMat); p.scale.set(.06, .45, .06); p.position.set(sx * S / 2, .22, sz * S / 2); p.castShadow = true; wild.add(p); }
    const tw = new THREE.MeshStandardMaterial({ color: 0xd8c89a, roughness: .9 });
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(GEO.box, tw), hz = k < 2; b.scale.set(hz ? S : .015, .015, hz ? .015 : S); b.position.set(hz ? 0 : (k === 2 ? -1 : 1) * S / 2, .36, hz ? (k === 0 ? -1 : 1) * S / 2 : 0); wild.add(b); }
    // furrows (raked), weeds (untouched), seeds
    const furrows = new THREE.Group(); g.add(furrows);
    for (let r = 0; r < 5; r++) { const b = new THREE.Mesh(GEO.box, clodMat); b.scale.set(S - .2, .05, .16); b.position.set(0, .085, -S / 2 + .3 + r * (S - .6) / 4); b.receiveShadow = true; furrows.add(b); }
    const weeds = new THREE.Group(); g.add(weeds);
    for (let k = 0; k < 14; k++) { const w = new THREE.Mesh(GEO.lo, Math.random() < .5 ? weedMat : clodMat); w.scale.set(rand(.06, .14), rand(.04, .09), rand(.06, .14)); w.position.set(rand(-S / 2 + .2, S / 2 - .2), .08, rand(-S / 2 + .2, S / 2 - .2)); weeds.add(w); }
    const seeds = new THREE.Group(); g.add(seeds);
    for (let k = 0; k < 24; k++) { const w = new THREE.Mesh(GEO.sph, seedMat); w.scale.setScalar(.022); w.position.set(rand(-S / 2 + .2, S / 2 - .2), .11, -S / 2 + .3 + (k % 5) * (S - .6) / 4 + rand(-.03, .03)); seeds.add(w); }
    // wheat
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, STEMS), ears = new THREE.InstancedMesh(earGeo, earMat, STEMS);
    stems.castShadow = true; ears.castShadow = true; g.add(stems, ears);
    const spots: PlotView['spots'] = [];
    for (let k = 0; k < STEMS; k++) { const row = k % 5; spots.push({ x: rand(-S / 2 + .18, S / 2 - .18), z: -S / 2 + .3 + row * (S - .6) / 4 + rand(-.09, .09), r: rand(0, 7), s: rand(.85, 1.15) }); }
    const drop = dropSprite(); drop.position.set(x, 1.1, z); drop.visible = false; scene.add(drop);
    void i;
    return { g, soil, soilMat, edge, wild, furrows, weeds, seeds, stems, ears, spots, key: '', drop, wet: 0 };
  }
  private updatePlot(v: PlotView, i: number, dt: number, day: boolean) {
    const p = this.s.plots[i], C = p.crop ? this.cfg.crops[p.crop] : null;
    const key = `${p.open}|${p.stage}|${p.days}|${p.yieldLeft}`;
    v.wet = lerp(v.wet, p.open && p.watered ? 1 : 0, 1 - Math.exp(-dt * 3));
    v.soilMat.color.setHex(0x5c4436).lerp(new THREE.Color(0x2e2018), v.wet);
    v.drop.visible = day && p.open && p.stage === 'sown' && !p.watered;
    if (v.drop.visible) v.drop.position.y = 1 + Math.sin(performance.now() / 300 + i) * .06;
    if (key === v.key) return; v.key = key;
    v.soil.visible = v.edge.visible = p.open; v.wild.visible = !p.open;
    v.weeds.visible = p.open && p.stage === 'empty';
    v.furrows.visible = p.open && (p.stage === 'raked' || p.stage === 'sown' || p.stage === 'ripe');
    v.seeds.visible = p.open && p.stage === 'sown' && p.days === 0;
    const grow = !p.open ? 0 : p.stage === 'sown' ? (p.days + 1) / ((C?.days ?? 3) + 1) : p.stage === 'ripe' ? 1 : 0;
    const ripe = p.stage === 'ripe', left = ripe && C ? clamp(p.yieldLeft / Math.max(1, C.yield[C.seed] ?? 1), 0, 1) : 1;
    const n = grow <= 0 ? 0 : Math.round(STEMS * (ripe ? .35 + .65 * left : 1));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const h = .1 + .75 * grow;
    for (let k = 0; k < STEMS; k++) {
      const sp = v.spots[k], on = k < n;
      e.set(Math.sin(sp.r * 3) * .1, sp.r, Math.cos(sp.r * 5) * .1); q.setFromEuler(e);
      m.compose(pos.set(sp.x, .08, sp.z), q, sc.set(on ? 1 : 0, on ? h * sp.s : 0, on ? 1 : 0)); v.stems.setMatrixAt(k, m);
      col.copy(G_GREEN).lerp(G_GOLD, ripe ? 1 : grow > .7 ? .25 : 0); v.stems.setColorAt(k, col);
      const earOn = on && grow > .6, top = new THREE.Vector3(0, h * sp.s, 0).applyQuaternion(q);
      pos.set(sp.x + top.x, .08 + top.y - .02, sp.z + top.z); m.compose(pos, q, sc.setScalar(earOn ? (ripe ? 1 : .75) : 0)); v.ears.setMatrixAt(k, m);
      col.copy(G_GREEN).lerp(G_EAR, ripe ? 1 : .2); v.ears.setColorAt(k, col);
    }
    v.stems.instanceMatrix.needsUpdate = true; v.ears.instanceMatrix.needsUpdate = true;
    if (v.stems.instanceColor) v.stems.instanceColor.needsUpdate = true; if (v.ears.instanceColor) v.ears.instanceColor.needsUpdate = true;
  }

  // ---------------- buildings ----------------
  syncBuildings() {
    for (const [id, v] of this.buildings) {
      const b = this.s.buildings[id]; const built = !!b?.built || id === 'house';
      v.built.visible = built; v.site.visible = !built; if (v.broken) v.broken.visible = !built;
    }
  }
  setState(s: FarmState) { this.s = s; this.syncBuildings(); for (const p of this.plots) p.key = ''; this.pileKey = ''; }

  // ---------------- player ----------------
  setLook(look: Look) {
    const key = JSON.stringify(look);
    if (this.player && this.player.lookKey === key) return;
    if (this.player) { this.dyn.remove(this.player.g); disposeFarmer(this.player.rig); }
    const rig = buildFarmer(look), g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.add(rig.root);
    rig.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    const rake = new THREE.Group(), rakeIn = rakeTool(1.55); rake.add(rakeIn); body.add(rake);
    const canG = new THREE.Group(), can = wateringCan(); canG.add(can.g); body.add(canG);
    const bag = seedBag(); body.add(bag); const sick = sickle(); body.add(sick);
    const gun = cranGun(true); gun.g.position.set(.2, .78, .22); body.add(gun.g);
    for (const o of [rakeIn, can.g, bag, sick, gun.g]) o.traverse(c => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
    this.dyn.add(g);
    this.player = { rig, g, body, rake, rakeIn, can, canG, bag, sick, gun, rot: 0, walk: 0, stepN: 0, twist: 0, recoil: 0, lookKey: key, actT: 0 };
  }
  private animPlayer(sim: DaySim | null, dt: number) {
    const v = this.player; if (!v) return;
    const P = sim?.player, H = this.cfg.hof;
    const px = P ? P.x : H.door.x, pz = P ? P.z : H.door.z + .4;
    v.g.visible = !!sim && !sim.finished;
    const spd = P ? P.speed : 0;
    v.walk = lerp(v.walk, clamp(spd / 2.2, 0, 1), 1 - Math.exp(-dt * 10));
    v.g.position.set(px, 0, pz);
    const swing = P?.swing, act = P?.action;
    v.rot = lerpAngle(v.rot, P ? P.f : 0, swing ? .6 : .25); v.g.rotation.y = v.rot;
    const wk = P ? P.walk : 0;
    v.body.position.y = Math.abs(Math.sin(wk)) * .04 * v.walk;
    const stepN = Math.floor(wk / Math.PI); if (stepN !== v.stepN) { if (v.walk > .2) sfx('player.step', px, pz); v.stepN = stepN; }
    v.recoil = Math.max(0, v.recoil - dt);
    const gunDay = !!sim && sim.canShoot(), tool = act?.info.tool ?? null;
    v.actT = act ? v.actT + dt : 0;
    v.gun.g.visible = gunDay && !act && !swing; v.gun.anim.position.z = -v.recoil * .5; v.gun.anim.rotation.x = -v.recoil * 2;
    v.canG.visible = tool === 'can'; v.bag.visible = tool === 'seed'; v.sick.visible = tool === 'sickle';
    v.rake.visible = tool === 'rake' || !!swing || (!gunDay && !act);
    const R = v.rake, t = v.actT;
    let twist = 0, lean = 0;
    // --- rake
    if (swing) { // sword-like slash from right to left
      const W = this.cfg.weapons.rake, e = 1 - Math.pow(1 - clamp(swing.t / W.swing, 0, 1), 2), yaw = lerp(1.25, -1.25, e);
      R.position.set(.04, .9, .16); R.rotation.set(.12, yaw, 0, 'YXZ'); v.rakeIn.position.z = .1; twist = yaw * .35; lean = .12;
    } else if (tool === 'rake') { // pull the rake through the soil
      const ph = Math.sin(t * 4.2), th = .66;
      R.position.set(.02, .8 + ph * .05, .22 + ph * .16); R.rotation.set(th, 0, 0, 'YXZ'); v.rakeIn.position.z = 0; lean = .18 + ph * .06;
      if (Math.random() < dt * 14) { const hx = px + Math.sin(v.rot) * 1.3, hz = pz + Math.cos(v.rot) * 1.3; PART.spawn(V(hx + rand(-.2, .2), .1, hz + rand(-.2, .2)), V(rand(-.5, .5), rand(.5, 1.2), rand(-.5, .5)), 0x5a3e2a, .07, .5, { g: 6, a: .9 }); }
    } else { // carried diagonally
      const q = .2; R.position.lerp(V(.16, .74, .14), q); R.rotation.x = lerp(R.rotation.x, .62, q); R.rotation.y = lerp(R.rotation.y, -.45, q); v.rakeIn.position.z = lerp(v.rakeIn.position.z, -.15, q);
    }
    // --- watering can (water + refill)
    if (tool === 'can' && act) {
      const refill = act.info.kind === 'refill', tilt = refill ? -.2 : .8;
      v.canG.position.set(.12, refill ? .55 : .78, .38); v.canG.rotation.set(0, 0, 0);
      v.can.g.rotation.x = lerp(v.can.g.rotation.x, tilt, Math.min(1, dt * 6));
      const tp = sim!.targetPos(act.target);
      if (!refill && v.actT > .25) {
        const p0 = v.can.spout.getWorldPosition(V()), T = .3, n = Math.max(1, Math.round(dt * 80));
        for (let i = 0; i < n; i++) { const tx = tp.x + rand(-.45, .45), tz = tp.z + rand(-.45, .45), tt = T * rand(.9, 1.1); PART.spawn(p0, V((tx - p0.x) / tt, (-p0.y + .5 * 9.8 * tt * tt) / tt, (tz - p0.z) / tt), Math.random() < .5 ? 0x4aa8ff : 0x9ad8ff, rand(.07, .11), tt, { g: 9.8, a: .8, s1: .05 }); }
        play('pour');
      } else if (refill && Math.random() < dt * 30) { const p0 = v.can.g.getWorldPosition(V()); PART.spawn(V(p0.x, p0.y + .45, p0.z), V(rand(-.1, .1), -2, rand(-.1, .1)), 0x8ad0ff, .08, .25, { g: 4, a: .8 }); if (Math.random() < .2) play('pour'); }
      lean = .1;
    }
    // --- sowing: bag in the left hand, the right hand throws seeds
    let throwHand: THREE.Vector3 | null = null;
    if (tool === 'seed' && act) {
      v.bag.position.set(-.18, .72, .3);
      const ph = (t * 1.6) % 1, k = Math.sin(ph * Math.PI);
      throwHand = v.g.localToWorld(V(.25 - k * .1, .78 + k * .25, .25 + k * .25));
      if (ph > .45 && ph < .55 && Math.random() < .6) { const tp = sim!.targetPos(act.target); for (let i = 0; i < 6; i++) { const tx = tp.x + rand(-1, 1), tz = tp.z + rand(-1, 1), tt = .45; PART.spawn(throwHand, V((tx - throwHand.x) / tt, (-throwHand.y + .5 * 9.8 * tt * tt) / tt, (tz - throwHand.z) / tt), 0xd8b060, .06, tt, { g: 9.8 }); } play('throw'); }
    }
    // --- sickle: horizontal cuts
    if (tool === 'sickle' && act) {
      const ph = Math.sin(t * 6); v.sick.position.set(.15 + ph * .25, .45, .45); v.sick.rotation.set(0, ph * 1.1, -.3); lean = .4;
      if (Math.random() < dt * 10) { const tp = sim!.targetPos(act.target); PART.spawn(V(tp.x + rand(-1, 1), .5, tp.z + rand(-1, 1)), V(rand(-.6, .6), rand(.5, 1.5), rand(-.6, .6)), 0xe8c860, .08, .7, { g: 4 }); }
      if (Math.random() < dt * 3) play('rustle');
    }
    // --- picking berries: both hands into the bush
    let pick: [THREE.Vector3, THREE.Vector3] | null = null;
    if (tool === 'hands' && act) {
      const b = H.bush, ph = t * 3;
      pick = [V(b.x + Math.sin(ph) * .3 + .15, .55 + Math.sin(ph * 1.3) * .15, b.z + Math.cos(ph) * .2), V(b.x - Math.sin(ph + 1) * .3 - .15, .6 + Math.cos(ph) * .15, b.z - Math.cos(ph) * .2)];
      lean = .3; if (Math.random() < dt * 2) play('rustle');
    }
    v.twist = lerp(v.twist, twist, .4);
    const R0 = v.rig;
    animateLegs(R0, dt, wk, v.walk);
    R0.torso.rotation.y += v.twist; R0.torso.rotation.x += lean;
    v.g.updateMatrixWorld(true);
    let t0: THREE.Vector3 | null = null, t1: THREE.Vector3 | null = null;
    if (pick) { t0 = pick[0]; t1 = pick[1]; }
    else if (v.gun.g.visible) { t0 = v.gun.anim.localToWorld(V(0, -.09, -.165)); t1 = v.gun.anim.localToWorld(V(0, -.01, .12)); }
    else if (v.canG.visible) { t0 = v.can.grip.getWorldPosition(V()); }
    else if (v.bag.visible) { t1 = v.bag.localToWorld(V(0, .05, 0)); t0 = throwHand; }
    else if (v.sick.visible) { t0 = v.sick.localToWorld(V(0, 0, 0)); }
    else if (v.rake.visible) { t0 = v.rake.localToWorld(V(0, 0, .02)); t1 = v.rake.localToWorld(V(0, 0, -.32)); }
    animateArms(R0, dt, wk, [t0, t1]);
    // action progress bar over the head (not for the berry picking: it runs until the bush is empty)
    const showBar = !!act && act.info.kind !== 'harvestBush';
    this.actBar.visible = showBar; if (showBar) { this.actBar.position.set(px, 2.05, pz); this.actBar.quaternion.copy(camera.quaternion); setBar(this.actBar, act!.t / act!.info.dur); }
  }

  // ---------------- animals ----------------
  private animAnimals(sim: DaySim | null, dt: number, now: number) {
    const live = new Set<number>();
    for (const a of sim?.animals ?? []) {
      live.add(a.id);
      let v = this.animals.get(a.id);
      if (!v) {
        const av = makeAnimal(a.type);
        if (a.type === 'raccoon') av.eyes.material = new THREE.MeshBasicMaterial({ color: 0x14100c, vertexColors: true });
        this.dyn.add(av.g); v = { v: av, bar: makeBar(.55, .06, 0xff6a4a), key: '', frozen: 0 }; this.animals.set(a.id, v);
      }
      const C = this.cfg.animals[a.type];
      animate(v.v, { x: a.x, z: a.z, yaw: a.f, dt, now, stun: a.stun > 0 || a.freeze > 0, flee: a.state === 'flee', flash: a.flash > 0, lunge: a.state === 'attack' && a.bite > (C.biteInterval ?? 1.2) - .3, carry: a.carryN });
      v.v.g.position.set(a.x, 0, a.z);
      this.setCarry(v, a);
      v.frozen = lerp(v.frozen, a.freeze > 0 ? 1 : 0, 1 - Math.exp(-dt * 8));
      v.v.mat.emissive.setRGB(.15 * v.frozen + (a.flash > 0 ? .5 : 0), .35 * v.frozen + (a.flash > 0 ? .5 : 0), .7 * v.frozen + (a.flash > 0 ? .5 : 0));
      const showBar = a.hp < a.maxHp && a.state !== 'script' && !a.driven;
      v.bar.visible = showBar; if (showBar) { v.bar.position.set(a.x, (a.type === 'hare' ? .8 : 1) , a.z); v.bar.quaternion.copy(camera.quaternion); setBar(v.bar, a.hp / a.maxHp); }
      if (a.freeze > 0 && Math.random() < dt * 8) PART.spawn(V(a.x + rand(-.3, .3), rand(.2, .6), a.z + rand(-.3, .3)), V(0, .3, 0), 0xbfe4ff, .08, .6);
    }
    for (const [id, v] of this.animals) if (!live.has(id)) { this.dyn.remove(v.v.g); v.bar.visible = false; this.animals.delete(id); }
  }
  private setCarry(v: AnimalView, a: Animal) {
    const key = Object.entries(a.carry).map(([k, n]) => k + n).join(',');
    if (key === v.key) return; v.key = key;
    v.v.carry.clear();
    let i = 0;
    for (const [item, n] of Object.entries(a.carry)) for (let k = 0; k < n; k++, i++) {
      const L = Math.floor(i / 6), an = (i % 6) / 6 * Math.PI * 2 + L * .5, rr = L ? .07 : .1;
      const m = itemMesh(item, .8); m.position.set(Math.cos(an) * rr, .62 + L * .075, -.1 + Math.sin(an) * rr); v.v.carry.add(m);
    }
  }

  // ---------------- pellets + loot ----------------
  private animShots(sim: DaySim | null, dt: number) {
    const list = sim?.pellets ?? [];
    while (this.pelletPool.length < list.length) { const m = new THREE.Mesh(GEO.sph, PROJ_BLUE); m.scale.setScalar(.07); this.dyn.add(m); this.pelletPool.push(m); }
    this.pelletPool.forEach((m, i) => { const p = list[i]; m.visible = !!p; if (p) { m.position.set(p.x, .75, p.z); m.material = p.ammo === 'blue' ? PROJ_BLUE : itemMat(p.ammo); if (Math.random() < .5) PART.spawn(m.position, V(0, .1, 0), itemHex(p.ammo), .1, .2); } });
    const live = new Set<number>();
    for (const l of sim?.loot ?? []) {
      live.add(l.id); let m = this.lootViews.get(l.id);
      if (!m) { m = itemMesh(l.item, 1.1); this.dyn.add(m); this.lootViews.set(l.id, m); }
      m.position.set(l.x, .1 + l.y + Math.sin(l.t * 5) * .03, l.z); m.rotation.y += dt * 3;
    }
    for (const [id, m] of this.lootViews) if (!live.has(id)) { this.dyn.remove(m); this.lootViews.delete(id); }
  }

  // ---------------- bush + basket ----------------
  private animBush(dt: number, day: boolean) {
    const b = this.s.bush, B = this.cfg.bush, fr = this.bush.fruits;
    const growK = b.phase === 'growing' ? clamp(b.t / B.ripen, 0, 1) : 0;
    const shown = b.phase === 'ripe' ? Math.ceil(fr.length * b.berries / B.berries) : b.phase === 'growing' ? fr.length : 0;
    fr.forEach((f, i) => {
      f.visible = i < shown;
      if (b.phase === 'growing') { f.material = this.bush.unripe; this.bush.unripe.color.setHex(0x9ab860).lerp(new THREE.Color(0x5a64c0), growK * growK); f.scale.setScalar(.03 + .025 * growK); }
      else { f.material = BUSH_MAT.blue; f.scale.setScalar(.055); }
    });
    this.bush.leaf.color.setHex(b.phase === 'dry' ? 0x587a3c : 0x3f7a34);
    const bar = this.bush.bar, showBar = b.phase === 'growing' && b.t >= B.barDelay;
    bar.visible = showBar; if (showBar) { bar.position.set(this.cfg.hof.bush.x, 1.55, this.cfg.hof.bush.z); bar.quaternion.copy(camera.quaternion); setBar(bar, growK); }
    this.bush.drop.visible = day && b.phase === 'dry' && this.s.tutorialDone;
    void dt;
    // basket pile: berries + grain (what is in the Lager)
    const nb = Math.min(24, this.s.items.blue ?? 0), nw = Math.min(12, (this.s.items.wheat ?? 0)), key = nb + '|' + nw;
    if (key !== this.pileKey) {
      this.pileKey = key; this.basketPile.clear();
      const put = (id: ItemId, n: number, off: number) => { for (let i = 0; i < n; i++) { const L = Math.floor(i / 8), a = i / 8 * Math.PI * 2 + off, r = .2 - L * .06; const m = itemMesh(id, .75); m.position.set(Math.cos(a) * r, .18 + L * .06, Math.sin(a) * r); this.basketPile.add(m); } };
      put('blue', nb, 0); put('wheat', nw, .3);
    }
  }

  // ---------------- tutorial helpers ----------------
  setArrow(p: { x: number; z: number; y?: number } | null) { this.arrowAt = p; }
  setBubble(id: number | null, text = '') {
    if (this.bubble && (id === null || this.bubble.id !== id || this.bubble.text !== text)) { scene.remove(this.bubble.s); this.bubble = null; }
    if (id !== null && !this.bubble) { const s = bubbleSprite(text); scene.add(s); this.bubble = { s, id, text }; }
  }

  // ---------------- events: effects + sounds ----------------
  event(e: Ev, sim: DaySim) {
    const P = sim.player;
    switch (e.k) {
      case 'act': if (e.kind === 'rake') sfx('player.till', P.x, P.z); break;
      case 'actDone':
        if (e.kind === 'rake' || e.kind === 'sow') { const p = sim.targetPos(e.target); burst(V(p.x, .2, p.z), 0x6a4a30, 16, 1.6, .12, .6, { g: 6 }); sfx('player.till', p.x, p.z); }
        if (e.kind === 'harvestPlot') { const p = sim.targetPos(e.target); burst(V(p.x, .5, p.z), 0xe8c860, 30, 2.4, .12, .8, { g: 5 }); sfx('collect.ammo', p.x, p.z); }
        if (e.kind === 'water') { const p = sim.targetPos(e.target); decal(p.x, p.z, 0x10161e, 1.2, 3, { op: .3 }); }
        if (e.kind === 'refill') sfx('ui.confirm');
        break;
      case 'berry': { const B = this.cfg.hof.bush, K = this.cfg.hof.basket; for (let i = 0; i < 3; i++) PART.spawn(V(B.x + rand(-.3, .3), .7, B.z + rand(-.3, .3)), V((K.x - B.x) * 1.4, 3, (K.z - B.z) * 1.4), 0x4a64f0, .12, .7, { g: 9 }); sfx('plants.produce.blue', B.x, B.z); sfx('collect.xp', B.x, B.z); break; }
      case 'swing': sfx('player.slash', e.x, e.z); slashSmear(e.x, e.z, e.dir, this.cfg.weapons.rake.range, this.cfg.weapons.rake.arc * Math.PI / 180, .2); break;
      case 'rakeHit': if (e.n) { punchStar(e.x, e.z, 1); play('punches', e.n); this.shake = Math.max(this.shake, .25); } break;
      case 'shot': { this.player && (this.player.recoil = .18); play('shot'); const dx = Math.sin(e.dir), dz = Math.cos(e.dir); burst(V(e.x + dx * .9, .8, e.z + dz * .9), itemHex(e.ammo), 10, 3, .1, .25); this.shake = Math.max(this.shake, .15); break; }
      case 'pelletHit': burst(V(e.x, .6, e.z), itemHex(e.ammo), 6, 1.5, .1, .35); play('hit'); break;
      case 'hit': punchStar(e.x, e.z, .7); if (e.frozen) burst(V(e.x, .5, e.z), 0xbfe4ff, 10, 1.5, .12, .5); break;
      case 'driven': this.floatXp?.(e.x, e.z, e.xp); break;
      case 'flee': sfx(e.type === 'hare' ? 'squirrel.flee' : 'raccoon.flee', e.x, e.z); if (e.carry && e.type === 'raccoon') sfx('raccoon.laugh', e.x, e.z); break;
      case 'steal': sfx('raccoon.steal', e.x, e.z); break;
      case 'eat': sfx(e.from === 'bush' ? 'plants.eaten.blue' : 'plants.eaten.straw', e.x, e.z); break;
      case 'spawn': if (e.type === 'raccoon') sfx('raccoon.wave', e.x, e.z); else sfx('squirrel.wave', e.x, e.z); break;
      case 'drop': burst(V(e.x, .5, e.z), 0xffffff, 8, 1.5, .1, .4); break;
      case 'pickup': sfx('collect.xp', e.x, e.z); break;
      case 'hurt': this.hurtT = .4; this.shake = Math.max(this.shake, .3); sfx('player.hurt'); break;
      case 'ripe': { const B = this.cfg.hof.bush; burst(V(B.x, .8, B.z), 0x8a9cff, 20, 1.5, .12, .8, { g: -1 }); play('ready'); break; }
      case 'deny': play('imm'); break;
    }
  }
  floatXp: ((x: number, z: number, xp: number) => void) | null = null;

  // ---------------- per frame ----------------
  /** mode: menu = slow orbit, day = follow the player, evening = in front of the house at dusk */
  frame(dt: number, sim: DaySim | null, mode: 'menu' | 'day' | 'evening') {
    windU.value += dt;
    const now = performance.now() / 1000, day = mode === 'day';
    if (sim) for (const e of sim.ev) this.event(e, sim);
    this.plots.forEach((v, i) => this.updatePlot(v, i, dt, day));
    this.animBush(dt, day);
    this.animPlayer(day ? sim : null, dt);
    this.animAnimals(day ? sim : null, dt, now);
    this.animShots(day ? sim : null, dt);
    // highlight of the hovered target
    const h = day && sim && !sim.inputLocked ? this.hover : null;
    this.hl.ring.visible = !!h && h.k !== 'plot'; this.hl.square.visible = !!h && h.k === 'plot';
    if (h && sim) {
      const p = sim.targetPos(h), pulse = .55 + .25 * Math.sin(now * 6);
      this.hl.mat.color.setHex(this.hoverOk ? 0xfff2c0 : 0xff8a70); this.hl.mat.opacity = pulse;
      if (h.k === 'plot') this.hl.square.position.set(p.x, 0, p.z);
      else { const r = h.k === 'well' ? (this.cfg.hof.buildings.well.r ?? 1) + .35 : .95; this.hl.ring.scale.setScalar(r); this.hl.ring.position.set(p.x, .05, p.z); }
    }
    // arrow + bubble
    this.arrow.visible = !!this.arrowAt;
    if (this.arrowAt) this.arrow.position.set(this.arrowAt.x, (this.arrowAt.y ?? 1.9) - .3 + Math.abs(Math.sin(now * 3)) * .3, this.arrowAt.z);
    if (this.bubble) { const a = sim?.animals.find(x => x.id === this.bubble!.id); if (a) this.bubble.s.position.set(a.x + .5, 1.55, a.z); else this.setBubble(null); }
    // buildings: mill sails, well crank, window glow at dusk
    const mill = this.buildings.get('mill'); if (mill?.sails && this.s.buildings.mill.built) mill.sails.rotation.z += dt * .6;
    // light: hour from the clock (light[0] in the morning .. light[1] at the end of the day)
    const L = this.cfg.day.light, hour = mode === 'menu' ? 10.5 : mode === 'evening' ? 16.45 : lerp(L[0], L[1], sim ? sim.k : 0);
    updateDayNight(dt, hour, 24, 16);
    updateSeasons(dt, 7, !!sim?.raining && day);
    const dn = dayNow().day; setWindowGlow(1 - dn); setArsenalLight(dn);
    gardenLight.intensity = 0;
    if (Math.random() < dt * 2.5 * dn) { const a = rand(0, 7), r = rand(2, 15); PART.spawn(V(this.camX + Math.cos(a) * r, rand(.4, 2), this.camZ + Math.sin(a) * r), V(rand(.15, .4), rand(-.03, .08), rand(-.1, .1)), 0xfff4d0, .05, rand(4, 7), { a: .35 }); }
    PART.update(dt); updateFx(dt);
    this.updateCamera(dt, sim, mode);
    this.hurtT = Math.max(0, this.hurtT - dt);
    gradePass.uniforms.uHurt.value = this.hurtT * .7;
    gradePass.uniforms.uLow.value = sim && day ? clamp(1 - sim.player.hp / sim.player.maxHp - .6, 0, .4) : 0;
    composer.render();
  }
  private updateCamera(dt: number, sim: DaySim | null, mode: 'menu' | 'day' | 'evening') {
    const portrait = innerHeight > innerWidth;
    if (mode === 'menu') {
      const t = performance.now() / 1000 * .03 + .7, R = portrait ? 22 : 18, Hh = portrait ? 14 : 9;
      camera.position.set(Math.sin(t) * R, Hh, Math.cos(t) * R); camera.lookAt(0, 0, -2);
      this.sun(0, -2); return;
    }
    let tx: number, tz: number, z = this.zoom;
    const P = sim?.player, door = this.cfg.hof.door;
    if (mode === 'evening') { tx = door.x - 1; tz = door.z + 2; z = .8; }
    else { tx = P ? P.x : door.x; tz = P ? P.z : door.z; }
    this.shotK = clamp(this.shotK + (this.shot ? dt : -dt) * 1.4, 0, 1);
    const k = this.shotK * this.shotK * (3 - 2 * this.shotK);
    if (this.shot) { this.lastShot = this.shot; }
    if (this.lastShot && k > 0) { tx = lerp(tx, this.lastShot.x, k); tz = lerp(tz, this.lastShot.z, k); z = lerp(z, this.lastShot.zoom ?? z, k); }
    const f = 1 - Math.pow(.002, dt);
    this.camX = lerp(this.camX, tx, f); this.camZ = lerp(this.camZ, tz, f); this.camZoom = lerp(this.camZoom, z, f);
    const off = V(0, (portrait ? 18 : 13.5) * this.camZoom, (portrait ? 11.6 : 9.3) * this.camZoom);
    this.shake = Math.max(0, this.shake - dt * 1.2);
    const sx = this.shake ? rand(-1, 1) * this.shake * .4 : 0, sz = this.shake ? rand(-1, 1) * this.shake * .4 : 0;
    camera.position.set(this.camX + off.x + sx, off.y, this.camZ + off.z + sz);
    camera.lookAt(this.camX + sx, 0, this.camZ + sz + (portrait ? 0 : .4));
    torch.position.set(this.camX, 3, this.camZ + .6);
    setListener(P ? P.x : this.camX, P ? P.z : this.camZ);
    this.sun(this.camX, this.camZ);
  }
  private lastShot: CamShot = null; private camZoom = 1;
  /** directional light follows the view so the shadow map stays sharp */
  private sun(x: number, z: number) {
    const d = moon.position.clone(); // set by daynight around the origin
    moon.target.position.set(x, 0, z); moon.position.set(x + d.x, d.y, z + d.z);
    Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 }); moon.shadow.camera.updateProjectionMatrix();
    void hemi;
  }
  /** screen point -> ground point */
  ground(cx: number, cy: number): { x: number; z: number } | null {
    const nx = cx / innerWidth * 2 - 1, ny = -(cy / innerHeight) * 2 + 1;
    const o = camera.position, d = V(nx, ny, .5).unproject(camera).sub(o).normalize(); if (d.y >= -1e-3) return null;
    const t = -o.y / d.y; return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  /** world -> screen px (null when behind the camera) */
  screen(x: number, y: number, z: number): { x: number; y: number; on: boolean } {
    const v = V(x, y, z).project(camera);
    return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight, on: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  }
  /** jump to the light of the new time of day (after a fade) */
  resetLight() { resetDayNight(); }
  zoomBy(dy: number) { this.zoom = clamp(this.zoom * Math.pow(1.0015, dy), .6, 1.6); }
  /** hard cut of the camera (after a fade) */
  snapCamera(x: number, z: number) { this.camX = x; this.camZ = z; }
  clearDynamic() { for (const [, v] of this.animals) { this.dyn.remove(v.v.g); v.bar.visible = false; } this.animals.clear(); for (const [, m] of this.lootViews) this.dyn.remove(m); this.lootViews.clear(); this.setBubble(null); this.setArrow(null); this.shot = null; this.lastShot = null; this.shotK = 0; }
}
