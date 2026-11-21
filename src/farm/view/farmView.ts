// 3D view of the farm: buildings, plots, the blueberry bush, the farmer with automatic tools (hand rake, kneeling at ground work),
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
import { setTexCfg } from '../../view/textures';
import { BUSH_MAT, buildPlant, fruitMesh, PROJ_BLUE } from '../../view/models';
import type { FruitType } from '../../config';
import { animate, makeAnimal, Animal as AView } from '../../view/animals';
import { Rig, animateArms, animateLegs, buildFarmer, disposeFarmer } from '../../view/farmer';
import { cranGun, handRake, seedBag, setArsenalEnv, setArsenalLight, sickle, wateringCan } from '../../view/arsenal';
import { play, setListener, sfx } from '../../audio';
import type { Look } from '../../look';
import type { BuildingId, FarmCfg, ItemId } from '../config';
import { BUILDING_IDS, STALL_IDS, StallId } from '../config';
import type { FarmState } from '../state';
import { growMul, ripeCuts } from '../state';
import type { Hof } from '../hof';
import type { Animal, DaySim, Ev, Target } from '../sim';
import { HofWorld } from './hofWorld';
import { BuildingView, buildBuilding, setWindowGlow } from './buildings';
import { buildBed } from './beds';
import { WildView } from './wild';
import { LivestockView, animateLivestock, makeLivestock } from './livestock';
import { toLocal } from '../hof';

const ITEM_HEX: Record<string, number> = { blue: 0x4a64f0, wheat: 0xe0b850, straw: 0xe8d488, nut: 0xc08a4a, garlic: 0xf0ead8, flour: 0xf4f0e6, bread: 0xb8782e, juice: 0x6a3cc0, milk: 0xf8f8f0, cheese: 0xf0c850, egg: 0xf4e8d0, plank: 0xa87a48, apple: 0xd8382a, bramble: 0x2a1030, green: 0x6a9a3a, mushroom: 0xa0522d, baerlauch: 0x3f8a2a, sorrel: 0x8a9a2a, wood: 0x7a5432, stone: 0x9a948a };
export const itemHex = (id: ItemId) => ITEM_HEX[id] ?? 0xcccccc;
const itemMats = new Map<string, THREE.MeshStandardMaterial>();
function itemMat(id: ItemId) { let m = itemMats.get(id); if (!m) { m = new THREE.MeshStandardMaterial({ color: itemHex(id), roughness: .55, emissive: itemHex(id), emissiveIntensity: .15 }); itemMats.set(id, m); } return m; }
/** small world model of a good (loot, carry pile) */
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
const seedMat = new THREE.MeshStandardMaterial({ color: 0xd8b060, roughness: .8 });
const G_GREEN = new THREE.Color(0x5e9a38), G_GOLD = new THREE.Color(0xe0b448), G_EAR = new THREE.Color(0xf0c860);
/** plot = natural hexagon bed (earth decals from the old game) + wet layer, seeds, wheat (weeds: wild.ts) */
interface PlotView { g: THREE.Group; bed: THREE.Group; earth: THREE.MeshStandardMaterial; wetMat: THREE.MeshStandardMaterial; seeds: THREE.Group;
  stems: THREE.InstancedMesh; ears: THREE.InstancedMesh; spots: { x: number; z: number; r: number; s: number }[]; key: string; drop: THREE.Sprite; wet: number; shake: number;
  /** plants of every crop except wheat (built when the crop is sown) */
  crop: { id: string; g: THREE.Group; plants: { g: THREE.Group; fruits: THREE.Mesh[] }[] } | null;
  /** growth timer over the field (21.11.2026): small bar + remaining time "0:00" after it */
  timer: { bar: THREE.Group; txt: THREE.Sprite; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; last: string } }
/** remaining seconds as "m:ss" */
export const clockText = (sec: number) => { const t = Math.max(0, Math.ceil(sec)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const TIMER_W = .9, TIMER_TXT = .62;
function timerText() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 52;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const txt = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false, color: 0xd8d8d8 }));
  txt.scale.set(TIMER_TXT, TIMER_TXT * 52 / 128, 1); txt.renderOrder = 999; txt.visible = false; scene.add(txt);
  return { txt, g: cv.getContext('2d')!, tex };
}
function drawTimer(g: CanvasRenderingContext2D, s: string) {
  g.clearRect(0, 0, 128, 52); g.font = '800 40px "Alegreya Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = 'rgba(20,14,8,.85)'; g.strokeText(s, 6, 28); g.fillStyle = '#fff'; g.fillText(s, 6, 28);
}
/** 20.11.2026 (Fruchttabelle): which existing plant model a field crop uses; tint = fruit colour, leaf = leaf colour for crops without their own model */
const CROP_MODEL: Record<string, { m: FruitType; tint?: number; leaf?: number }> = {
  carrot: { m: 'carrot' }, potato: { m: 'potato' }, onion: { m: 'onion' }, garlic: { m: 'garlic' }, pea: { m: 'pea' }, radish: { m: 'radish' },
  lettuce: { m: 'lettuce' }, leek: { m: 'leek' }, bean: { m: 'bean' }, corn: { m: 'corn' }, strawb: { m: 'straw' }, pepper: { m: 'pepper' },
  tomato: { m: 'tomato' }, rhubarb: { m: 'rhubarb' }, pumpkin: { m: 'pumpkin' }, cab: { m: 'cab' }, asp: { m: 'asp' }, chili: { m: 'chili' },
  celery: { m: 'leek', leaf: 0x7ab848 }, fennel: { m: 'leek', leaf: 0x9ac860 }, zucchini: { m: 'pumpkin', tint: 0x3f7a2a },
  eggplant: { m: 'pepper', tint: 0x4a2058 }, melon: { m: 'pumpkin', tint: 0x6a9a3a },
};
const tintMats = new Map<number, THREE.MeshStandardMaterial>();
const tintMat = (hex: number) => { let m = tintMats.get(hex); if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: .5 }); tintMats.set(hex, m); } return m; };
const CROP_UNRIPE = new THREE.MeshStandardMaterial({ color: 0x8ab858, roughness: .6 });
/** random point in a pointy-top hexagon of radius H */
function inHex(H: number) { for (;;) { const x = rand(-1, 1) * H, z = rand(-1, 1) * H, ax = Math.abs(x), az = Math.abs(z); if (az <= H && ax <= H * .866 && az <= H - ax * .577) return { x, z }; } }
/** what flies through the air: leaves whirling out of a shaken bush, berries on their way into the basket */
interface Bit { m: THREE.Object3D; vx: number; vy: number; vz: number; t: number; life: number; leaf: boolean; spin: number; s0: number; to?: THREE.Vector3; from?: THREE.Vector3; snd?: boolean }
const LEAF_GEO = new THREE.PlaneGeometry(.11, .07);
const leafBitMat = new THREE.MeshLambertMaterial({ color: 0x4f8a3a, side: THREE.DoubleSide });

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

/** hungry livestock: round bubble with an empty bowl and a grain ear */
const hungerSprite = () => canvasSprite(128, 140, g => {
  g.fillStyle = '#1a1410'; g.beginPath(); g.arc(64, 60, 56, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(46, 108); g.lineTo(64, 136); g.lineTo(82, 108); g.fill();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(64, 60, 50, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(52, 104); g.lineTo(64, 126); g.lineTo(76, 104); g.fill();
  // bowl
  g.fillStyle = '#8a5a30'; g.beginPath(); g.moveTo(28, 66); g.lineTo(100, 66); g.quadraticCurveTo(96, 96, 64, 96); g.quadraticCurveTo(32, 96, 28, 66); g.fill();
  g.fillStyle = '#5a3a1e'; g.fillRect(26, 62, 76, 7);
  // ear of grain above
  g.strokeStyle = '#c8962a'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 58); g.lineTo(64, 22); g.stroke();
  g.fillStyle = '#e8b840'; for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(64 + sx * 7, 28 + i * 8, 6, 4, sx * .6, 0, Math.PI * 2); g.fill(); }
}, .62);
/** asleep: "Zzz" */
const zzzSprite = () => canvasSprite(128, 96, g => {
  g.font = '900 44px "Alegreya Sans", sans-serif'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  for (const [t, x, y, sz] of [['Z', 18, 70, 44], ['z', 60, 46, 34], ['z', 92, 26, 26]] as const) { g.font = `900 ${sz}px "Alegreya Sans", sans-serif`; g.lineWidth = 8; g.strokeStyle = '#1a2a40'; g.strokeText(t, x, y); g.fillStyle = '#dceaff'; g.fillText(t, x, y); }
}, .7);

// ---------------- player ----------------
interface PlayerView {
  rig: Rig; g: THREE.Group; body: THREE.Group; hr: THREE.Group; can: ReturnType<typeof wateringCan>; canG: THREE.Group; bag: THREE.Group; sick: THREE.Group;
  gun: ReturnType<typeof cranGun>; rot: number; walk: number; stepN: number; twist: number; recoil: number; lookKey: string; actT: number;
  /** 0 standing .. 1 down (crouch / kneel), kneel 0 crouch (waddle) .. 1 on one knee; strike = last hand rake hit into the soil (dust) */
  low: number; kneel: number; strike: number; lean: number;
}
interface AnimalView { v: AView; bar: THREE.Group; key: string; frozen: number; rot?: number }

export type CamShot = { x: number; z: number; zoom?: number } | null;
/** screen points (NDC) whose view rays bound the shadow area: corners + edge middles */
const SHADOW_RAYS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1], [-1, 0], [1, 0]];

export class FarmView {
  world: HofWorld;
  buildings = new Map<BuildingId, BuildingView>();
  plots: PlotView[] = [];
  bush: { g: THREE.Group; fruits: THREE.Mesh[]; bar: THREE.Group; leaf: THREE.MeshStandardMaterial; unripe: THREE.MeshStandardMaterial; drop: THREE.Sprite; shake: number; sy: number[] };
  wild: WildView;
  /** livestock per stall: animals wander in the pen (local coordinates of the building), hunger bubble / Zzz above */
  pens = new Map<StallId, { list: LivestockView[]; hw: number; hd: number; hunger: THREE.Sprite; zzz: THREE.Sprite; root: THREE.Group }>();
  private bits: Bit[] = [];
  private brambleShake: { g: THREE.Object3D; t: number }[] = [];
  player: PlayerView | null = null;
  animals = new Map<number, AnimalView>();
  private pelletPool: THREE.Mesh[] = []; private lootViews = new Map<number, THREE.Object3D>();
  private hl: { ring: THREE.Mesh; square: THREE.Group; mat: THREE.MeshBasicMaterial };
  /** camera: yaw around the player (middle mouse / two-finger drag), pitch = angle over the ground */
  camYaw = 0; camPitch = .97;
  private arrow: THREE.Group; arrowAt: { x: number; z: number; y?: number } | null = null;
  private bubble: { s: THREE.Sprite; id: number; text: string } | null = null;
  private actBar = makeBar(.8, .08, 0xffe08a);
  camX = 0; camZ = 0; zoom = 1; shot: CamShot = null; private shotK = 0; shake = 0; private pourStop: (() => void) | undefined;
  hover: Target | null = null; hoverOk = true;
  hurtT = 0;
  private dyn = new THREE.Group();

  constructor(public cfg: FarmCfg, public hof: Hof, public s: FarmState) {
    setArsenalEnv(new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture);
    const H = cfg.hof, half = cfg.plots.size / 2 + .35;
    const free = (x: number, z: number, pad: number) => {
      for (const p of H.plots) if (Math.abs(x - p.x) < half + pad && Math.abs(z - p.z) < half + pad) return false;
      for (const o of hof.obstacles) {
        if (o.kind === 'circle' || o.kind === 'poly') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad + .3) return false; }
        else { const dx = x - o.x, dz = z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw + pad + .6 && Math.abs(lz) < o.hd + pad + 1.2) return false; }
      }
      return Math.hypot(x - H.door.x, z - H.door.z) > 1.5 + pad;
    };
    setTexCfg(cfg.texturen);
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
    this.bush = { g: bp.g, fruits: bp.fruits, bar: makeBar(.9, .09, 0x6a7cff), leaf, unripe, drop: bdrop, shake: 0, sy: bp.g.children.map(c => c.scale.y) };
    // weeds, forage, brambles, apples
    this.wild = new WildView(cfg, hof);
    // livestock in the pens (only seen when the stall is built: they live in its group)
    for (const id of STALL_IDS) {
      const v = this.buildings.get(id), r = H.buildings[id], C = cfg.stalls[id]; if (!v || !r || !C) continue;
      const root = new THREE.Group(); v.built.add(root);
      const hw = (r.w ?? 4) / 2, hd = (r.d ?? 3) / 2;
      const list = C.animals.map((t, k) => { const a = makeLivestock(t); a.x = rand(-hw + .8, hw - .8); a.z = rand(-hd + .8, hd - .8); a.tx = a.x; a.tz = a.z; a.f = k * 2.1; root.add(a.g); return a; });
      const hunger = hungerSprite(), zzz = zzzSprite(); hunger.visible = zzz.visible = false; scene.add(hunger, zzz);
      this.pens.set(id, { list, hw, hd, hunger, zzz, root });
    }
    // highlight
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: .7, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(GEO.ring, mat); ring.rotation.x = -Math.PI / 2; scene.add(ring);
    // rectangle around a building / stall (bars are placed per target)
    const square = new THREE.Group();
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(GEO.plane, mat); b.rotation.x = -Math.PI / 2; square.add(b); }
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
    const H = this.cfg.plots.size / 2, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const spots0: [number, number][] = Array.from({ length: 6 }, (_, k) => { const a = k / 6 * Math.PI * 2 + .5; return [Math.cos(a) * H * .5, Math.sin(a) * H * .5]; });
    const bed = buildBed(H, spots0); g.add(bed);
    const earthMesh = bed.children[0] as THREE.Mesh, wetMesh = bed.children[1] as THREE.Mesh;
    const earth = (earthMesh.material as THREE.MeshStandardMaterial).clone(); earthMesh.material = earth;
    const wetMat = wetMesh.material as THREE.MeshStandardMaterial; wetMat.opacity = 0;
    const seeds = new THREE.Group(); g.add(seeds);
    for (let k = 0; k < 30; k++) { const p = inHex(H * .85), w = new THREE.Mesh(GEO.sph, seedMat); w.scale.setScalar(.022); w.position.set(p.x, .04, p.z); seeds.add(w); }
    // wheat
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, STEMS), ears = new THREE.InstancedMesh(earGeo, earMat, STEMS);
    stems.castShadow = true; ears.castShadow = true; g.add(stems, ears);
    const spots: PlotView['spots'] = [];
    for (let k = 0; k < STEMS; k++) { const p = inHex(H * .88); spots.push({ x: p.x, z: p.z, r: rand(0, 7), s: rand(.85, 1.15) }); }
    const drop = dropSprite(); drop.position.set(x, 1.1, z); drop.visible = false; scene.add(drop);
    void i;
    const bar = makeBar(TIMER_W, .1, 0x9ad65a); bar.visible = false;
    const timer = { bar, ...timerText(), last: '' };
    return { g, bed, earth, wetMat, seeds, stems, ears, spots, key: '', drop, wet: 0, shake: 0, crop: null, timer };
  }
  private updatePlot(v: PlotView, i: number, dt: number, day: boolean) {
    const p = this.s.plots[i], C = p.crop ? this.cfg.crops[p.crop] : null;
    const C0 = C ? clamp(p.grow / Math.max(1, C.grow), 0, 1) : 0;
    const key = `${p.open}|${p.stage}|${p.crop}|${p.t > 0}|${Math.round(C0 * 20)}|${p.yieldLeft}`;
    v.wet = lerp(v.wet, p.open && p.watered ? 1 : 0, 1 - Math.exp(-dt * 3));
    v.wetMat.opacity = v.wet * .95;
    v.drop.visible = day && p.open && p.stage === 'sown' && !p.watered;
    if (v.drop.visible) v.drop.position.y = 1 + Math.sin(performance.now() / 300 + i) * .06;
    // growth timer: bar + time left while the crop grows (watered, after sprouting)
    const T = v.timer, growing = day && p.open && p.stage === 'sown' && p.watered && p.t <= 0 && !!C;
    T.bar.visible = T.txt.visible = growing;
    if (growing) {
      const pos = this.cfg.hof.plots[i], gm = growMul(this.cfg, p), left = gm > 0 ? (C!.grow - p.grow) / gm : C!.grow;
      // phone upright: everything is smaller on screen, so the timer grows a bit
      const k = innerHeight > innerWidth ? 1.5 : 1, y = 1.3, rx = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), off = TIMER_TXT * .5 * k, tx = (TIMER_W / 2 + TIMER_TXT / 2 + .04) * k - off;
      T.bar.position.set(pos.x - rx.x * off, y, pos.z - rx.z * off); T.bar.quaternion.copy(camera.quaternion); T.bar.scale.setScalar(k); setBar(T.bar, C0);
      T.txt.position.set(pos.x + rx.x * tx, y, pos.z + rx.z * tx); T.txt.scale.set(TIMER_TXT * k, TIMER_TXT * k * 52 / 128, 1);
      const txt = clockText(left); if (txt !== T.last) { T.last = txt; drawTimer(T.g, txt); T.tex.needsUpdate = true; }
    }
    v.shake = Math.max(0, v.shake - dt * 2.5);
    v.stems.rotation.z = Math.sin(performance.now() / 22) * v.shake * .06; v.ears.rotation.z = v.stems.rotation.z; if (v.crop) v.crop.g.rotation.z = v.stems.rotation.z;
    if (key === v.key) return; v.key = key;
    v.g.visible = p.open;
    v.earth.opacity = 1; // 21.11.2026: no ploughing any more, an open plot is always worked soil
    // sown: seeds while sprouting, then a little sprout that grows once it was watered (20.11.2026: growth in s, not in days)
    v.seeds.visible = p.open && p.stage === 'sown' && p.t > 0;
    const grow = !p.open ? 0 : p.stage === 'sown' ? (p.t > 0 ? 0 : .08 + .92 * C0) : p.stage === 'ripe' ? 1 : 0;
    const ripe = p.stage === 'ripe', left = ripe ? clamp(p.yieldLeft / Math.max(1, ripeCuts(this.cfg, p)), 0, 1) : 1;
    const wheat = !p.crop || p.crop === 'wheat';
    this.cropPlants(v, wheat || grow <= 0 ? null : p.crop, grow, ripe, left);
    const n = grow <= 0 || !wheat ? 0 : Math.round(STEMS * (ripe ? .3 + .7 * Math.min(1, left) : 1));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const h = .1 + .75 * grow;
    for (let k = 0; k < STEMS; k++) {
      const sp = v.spots[k], on = k < n;
      e.set(Math.sin(sp.r * 3) * .1, sp.r, Math.cos(sp.r * 5) * .1); q.setFromEuler(e);
      m.compose(pos.set(sp.x, .02, sp.z), q, sc.set(on ? 1 : 0, on ? h * sp.s : 0, on ? 1 : 0)); v.stems.setMatrixAt(k, m);
      col.copy(G_GREEN).lerp(G_GOLD, ripe ? 1 : grow > .7 ? .25 : 0); v.stems.setColorAt(k, col);
      const earOn = on && grow > .6, top = new THREE.Vector3(0, h * sp.s, 0).applyQuaternion(q);
      pos.set(sp.x + top.x, .02 + top.y - .02, sp.z + top.z); m.compose(pos, q, sc.setScalar(earOn ? (ripe ? 1 : .75) : 0)); v.ears.setMatrixAt(k, m);
      col.copy(G_GREEN).lerp(G_EAR, ripe ? 1 : .2); v.ears.setColorAt(k, col);
    }
    v.stems.instanceMatrix.needsUpdate = true; v.ears.instanceMatrix.needsUpdate = true;
    if (v.stems.instanceColor) v.stems.instanceColor.needsUpdate = true; if (v.ears.instanceColor) v.ears.instanceColor.needsUpdate = true;
  }

  /** non-wheat crops: three plants of the crop on the bed, growing with the crop; the fruits show when ripe and thin out pass by pass */
  private cropPlants(v: PlotView, id: string | null, grow: number, ripe: boolean, left: number) {
    if (v.crop && v.crop.id !== id) { v.g.remove(v.crop.g); v.crop = null; }
    if (!id) return;
    if (!v.crop) {
      const M = CROP_MODEL[id] ?? { m: 'lettuce' as FruitType }, g = new THREE.Group(), plants: { g: THREE.Group; fruits: THREE.Mesh[] }[] = [];
      const leaf = new THREE.MeshStandardMaterial({ color: M.leaf ?? 0x4f8a34, roughness: .85, flatShading: true }), head = new THREE.MeshStandardMaterial({ color: 0x6a5a30, roughness: .8 });
      const H = this.cfg.plots.size / 2, k = H / 1.6;
      for (let j = 0; j < 3; j++) {
        const a = j / 3 * Math.PI * 2 + .3, pl = buildPlant(M.m, { leaf, head });
        if (M.tint) for (const f of pl.fruits) f.material = tintMat(M.tint);
        const w = new THREE.Group(); w.add(pl.g); w.position.set(Math.cos(a) * H * .42, 0, Math.sin(a) * H * .42); w.rotation.y = rand(0, 7); w.scale.setScalar(.55 * k);
        w.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
        g.add(w); plants.push({ g: w, fruits: pl.fruits });
      }
      v.g.add(g); v.crop = { id, g, plants };
    }
    const H = this.cfg.plots.size / 2, k = H / 1.6, sc = .55 * k * (.25 + .75 * grow);
    for (const pl of v.crop.plants) {
      pl.g.scale.setScalar(sc);
      const fm = pl.fruits.map(f => f.userData.mat0 ??= f.material);
      const nOn = ripe ? Math.ceil(pl.fruits.length * left) : grow > .6 ? pl.fruits.length : 0;
      pl.fruits.forEach((f, i) => { f.visible = i < nOn; f.material = ripe ? fm[i] as THREE.Material : CROP_UNRIPE; });
    }
  }

  // ---------------- buildings ----------------
  syncBuildings() {
    for (const [id, v] of this.buildings) {
      const b = this.s.buildings[id]; const built = !!b?.built || id === 'house';
      v.built.visible = built; v.site.visible = !built; if (v.broken) v.broken.visible = !built;
    }
  }
  setState(s: FarmState) { this.s = s; this.syncBuildings(); for (const p of this.plots) p.key = ''; }

  // ---------------- player ----------------
  setLook(look: Look) {
    const key = JSON.stringify(look);
    if (this.player && this.player.lookKey === key) return;
    if (this.player) { this.dyn.remove(this.player.g); disposeFarmer(this.player.rig); }
    const rig = buildFarmer(look), g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.add(rig.root);
    rig.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    const hr = handRake(); body.add(hr);
    const canG = new THREE.Group(), can = wateringCan(); canG.add(can.g); body.add(canG);
    const bag = seedBag(); body.add(bag); const sick = sickle(); body.add(sick);
    const gun = cranGun(true); gun.g.position.set(.2, .78, .22); body.add(gun.g);
    for (const o of [hr, can.g, bag, sick, gun.g]) o.traverse(c => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
    this.dyn.add(g);
    this.player = { rig, g, body, hr, can, canG, bag, sick, gun, rot: 0, walk: 0, stepN: 0, twist: 0, recoil: 0, lookKey: key, actT: 0, low: 0, kneel: 0, strike: 0, lean: 0 };
  }
  private animPlayer(sim: DaySim | null, dt: number) {
    const v = this.player; if (!v) return;
    const P = sim?.player, H = this.cfg.hof, R0 = v.rig;
    const px = P ? P.x : H.door.x, pz = P ? P.z : H.door.z + .4;
    v.g.visible = !!sim && !sim.finished;
    const spd = P ? P.speed : 0, swing = P?.swing, act = P?.action;
    // down on the ground: kneeling while working, a deep crouch (waddle) while moving with the button held
    const lowAct = !!act && !!sim && sim.low(act.target, act.info);
    v.low = lerp(v.low, P?.crouch && !swing ? 1 : 0, 1 - Math.exp(-dt * 9));
    v.kneel = lerp(v.kneel, lowAct && spd < .25 ? 1 : 0, 1 - Math.exp(-dt * 7));
    const crouchSp = this.cfg.player.crouchSpeed;
    v.walk = lerp(v.walk, clamp(spd / (v.low > .5 ? crouchSp : 2.2), 0, 1), 1 - Math.exp(-dt * 10));
    v.g.position.set(px, 0, pz);
    v.rot = lerpAngle(v.rot, P ? P.f : 0, swing ? .6 : .25); v.g.rotation.y = v.rot;
    const wk = P ? P.walk : 0;
    v.body.position.y = Math.abs(Math.sin(wk)) * .04 * v.walk * (1 - v.low * .6);
    const stepN = Math.floor(wk / Math.PI); if (stepN !== v.stepN) { if (v.walk > .2) sfx('player.step', px, pz); v.stepN = stepN; }
    v.recoil = Math.max(0, v.recoil - dt);
    const gunDay = !!sim && sim.canShoot(), tool = act?.info.tool ?? null;
    v.actT = act ? v.actT + dt : 0;
    v.gun.g.visible = gunDay && !act && !swing; v.gun.anim.position.z = -v.recoil * .5; v.gun.anim.rotation.x = -v.recoil * 2;
    v.canG.visible = tool === 'can'; v.bag.visible = tool === 'seed'; v.sick.visible = tool === 'sickle';
    // the hand rake is always in the right hand, except while that hand needs to be free (can, seeds, sickle, picking)
    v.hr.visible = !!swing || tool === 'handrake' || (!act && !gunDay);
    const kind = act?.info.kind, t = v.actT;
    let twist = 0, lean = v.low * (.25 + .45 * v.kneel);
    // body pose first (legs, pelvis down), so the shoulders are where the hands are aimed from
    animateLegs(R0, dt, wk, v.walk, { k: v.low, kneel: v.kneel });
    const wp = act && sim ? (lowAct ? sim.workPoint(act.target, act.info.kind) : sim.facePoint(act.target)) : null;
    let tR: THREE.Vector3 | null = null, tL: THREE.Vector3 | null = null; // right hand (arm 1), left hand (arm 0)
    const HR = v.hr;
    // body frame helpers: world point from (right, up, forward) offsets around the player
    const fw = V(Math.sin(v.rot), 0, Math.cos(v.rot)), rt = V(-fw.z, 0, fw.x); // rt = the farmer's right (-x local)
    const at = (r: number, y: number, f: number) => V(px + rt.x * r + fw.x * f, y, pz + rt.z * r + fw.z * f);
    /** put the hand rake: grip at a world point, yaw (local), pitch (+ = tines down), roll */
    const holdHR = (grip: THREE.Vector3, yaw: number, pitch: number, roll = 0) => {
      v.body.updateMatrixWorld(true); HR.position.copy(v.body.worldToLocal(grip.clone())); HR.rotation.set(pitch, yaw, roll, 'YXZ');
    };
    if (swing) {
      // one-handed slash with the hand rake: a quick backhand from the left across to the right (120° cone), body turns along
      const W = this.cfg.weapons.rake, e = 1 - Math.pow(1 - clamp(swing.t / W.swing, 0, 1), 2.2), yaw = lerp(1.15, -1.15, e);
      const r = .5, y = (1 - v.low) * .98 + v.low * .62;
      tR = at(-Math.sin(yaw) * r * .9 + .05, y, Math.cos(yaw) * r + .1);
      holdHR(tR, yaw, -.15, -1.35);
      twist = yaw * .45; lean = Math.max(lean, .12);
    } else if (tool === 'handrake' && act && wp) {
      // weeding on one knee: lift, chop the claws into the soil, scratch back towards the body; the left hand pulls the weed out at the end
      const cyc = (t * 2.1) % 1, chop = cyc < .35 ? cyc / .35 : 1 - (cyc - .35) / .65; // 0 down .. 1 up
      const dx = px - wp.x, dz = pz - wp.z, l = Math.hypot(dx, dz) || 1, toMe = V(dx / l, 0, dz / l);
      const pull = cyc < .35 ? 0 : (cyc - .35) / .65 * .12;
      const grip = V(wp.x + toMe.x * (.2 + pull), .1 + chop * .16, wp.z + toMe.z * (.2 + pull));
      holdHR(grip, Math.atan2(-toMe.x, -toMe.z) - v.rot, .55 - chop * .7);
      tR = grip;
      if (cyc > .33 && v.strike < .33) { PART.spawn(V(wp.x, .06, wp.z), V(rand(-.4, .4), rand(.6, 1.1), rand(-.4, .4)), 0x5a3e2a, .07, .45, { g: 7 }); if (Math.random() < .5) play('rustle'); }
      v.strike = cyc;
      for (let i = 0; i < 2; i++) if (Math.random() < dt * 10) PART.spawn(V(wp.x + rand(-.12, .12), .05, wp.z + rand(-.12, .12)), V(rand(-.3, .3), rand(.3, .8), rand(-.3, .3)), 0x6a4a30, .05, .4, { g: 6 });
      const k = clamp((t / act.info.dur - .7) / .3, 0, 1);
      tL = k > 0 ? V(wp.x - toMe.z * .08, .06 + k * k * .35, wp.z + toMe.x * .08) : null;
    } else if (!act) {
      // carried in the right hand, claws down
      const y = (1 - v.low) * .55 + v.low * .3;
      tR = at(.2, y + Math.sin(wk) * .02 * v.walk, .06 + Math.sin(wk + Math.PI) * .06 * v.walk);
      holdHR(tR, -.1, 1.05 + v.low * .3);
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
      } else if (refill && Math.random() < dt * 30) { const p0 = v.can.g.getWorldPosition(V()); PART.spawn(V(p0.x, p0.y + .45, p0.z), V(rand(-.1, .1), -2, rand(-.1, .1)), 0x8ad0ff, .08, .25, { g: 4, a: .8 }); }
      lean = .1;
    }
    // --- sowing (on one knee): bag in the left hand, the right hand throws seeds over the plot
    let throwHand: THREE.Vector3 | null = null;
    if (tool === 'seed' && act) {
      const y0 = (1 - v.low) * .72 + v.low * .5;
      v.bag.position.set(.18 * v.low - .18 * (1 - v.low), y0, .3 + v.low * .08); // kneeling: held over the front knee
      const ph = (t * 1.6) % 1, k = Math.sin(ph * Math.PI);
      throwHand = at(-.22 + k * .12, y0 + .06 + k * .2, .25 + k * .25);
      if (ph > .45 && ph < .55 && Math.random() < .6) { const tp = sim!.targetPos(act.target); for (let i = 0; i < 6; i++) { const tx = tp.x + rand(-1, 1), tz = tp.z + rand(-1, 1), tt = .45; PART.spawn(throwHand, V((tx - throwHand.x) / tt, (-throwHand.y + .5 * 9.8 * tt * tt) / tt, (tz - throwHand.z) / tt), 0xd8b060, .06, tt, { g: 9.8 }); } play('throw'); }
    }
    // --- sickle: low horizontal cuts at the crop
    if (tool === 'sickle' && act) {
      const ph = Math.sin(t * 6), y = (1 - v.low) * .45 + v.low * .22;
      v.sick.position.set(-.15 + ph * .25, y, .45); v.sick.rotation.set(0, ph * 1.1, -.3); lean = Math.max(lean, .4);
      if (Math.random() < dt * 10) { const tp = wp ?? sim!.targetPos(act.target); PART.spawn(V(tp.x + rand(-.6, .6), .4, tp.z + rand(-.6, .6)), V(rand(-.6, .6), rand(.5, 1.5), rand(-.6, .6)), 0xe8c860, .08, .7, { g: 4 }); }
      if (Math.random() < dt * 3) play('rustle');
    }
    // --- hands: reach into the target (pick, gather, feed, shake a tree, work at a building), bucket at the well
    let pick: [THREE.Vector3, THREE.Vector3] | null = null;
    if ((tool === 'hands' || tool === 'bucket') && act && sim) {
      const fp = wp ?? sim.facePoint(act.target), dx = fp.x - px, dz = fp.z - pz, l = Math.hypot(dx, dz) || 1, reach = Math.min(l, lowAct ? .62 : .55);
      const hx = px + dx / l * reach, hz = pz + dz / l * reach, sx = -dz / l * .16, sz = dx / l * .16;
      const k0 = act.target.k, high = k0 === 'tree';
      const y = lowAct ? .14 : high ? 1.55 : kind === 'feed' || kind === 'straw' || kind === 'eggs' ? .7 : .9, sp = high ? 9 : tool === 'bucket' ? 2.6 : 3.4, ph = t * sp;
      const a0 = Math.sin(ph), a1 = Math.sin(ph + (high ? 0 : 1.4));
      pick = [V(hx + sx + a0 * .08, y + Math.max(0, a0) * (high ? .05 : .14), hz + sz), V(hx - sx + a1 * .08, y + Math.max(0, a1) * (high ? .05 : .14), hz - sz)];
      if (!lowAct) lean = high ? -.05 : .2;
      if (k0 === 'bush' || k0 === 'bramble' || k0 === 'weed' || k0 === 'plot') { if (Math.random() < dt * 2) play('rustle'); }
      if (tool === 'bucket') { const w = this.buildings.get('well'); if (w?.crank) w.crank.rotation.x += dt * 4; if (Math.random() < dt * 12) PART.spawn(V(fp.x + rand(-.3, .3), .55, fp.z + rand(-.3, .3)), V(rand(-.2, .2), rand(.4, .9), rand(-.2, .2)), 0x8ad0ff, .07, .4, { g: 6, a: .8 }); }
      if (kind === 'produce' && Math.random() < dt * 6) PART.spawn(V(fp.x + rand(-.3, .3), rand(.6, 1.1), fp.z + rand(-.3, .3)), V(rand(-.2, .2), rand(.3, .7), rand(-.2, .2)), 0xf4ead0, .06, .6, { a: .7 });
      if (high && Math.random() < dt * 5) { const tr = this.cfg.hof.trees[(act.target as { i: number }).i]; if (tr) this.leafAt(tr.x + rand(-.8, .8), rand(1.8, 2.6), tr.z + rand(-.8, .8), .4); }
    }
    v.twist = lerp(v.twist, twist, .4); v.lean = lerp(v.lean, lean, 1 - Math.exp(-dt * 10));
    R0.torso.rotation.y += v.twist; R0.torso.rotation.x += v.lean;
    v.g.updateMatrixWorld(true);
    // hands: arm 0 = left, arm 1 = right (the farmer faces +z, his right is -x)
    let t0: THREE.Vector3 | null = tL, t1: THREE.Vector3 | null = tR;
    if (pick) { t0 = pick[0]; t1 = pick[1]; }
    else if (v.gun.g.visible) { t1 = v.gun.anim.localToWorld(V(0, -.09, -.165)); t0 = v.gun.anim.localToWorld(V(0, -.01, .12)); }
    else if (v.canG.visible) { t1 = v.can.grip.getWorldPosition(V()); t0 = null; }
    else if (v.bag.visible) { t0 = v.bag.localToWorld(V(0, .05, 0)); t1 = throwHand; }
    else if (v.sick.visible) { t1 = v.sick.localToWorld(V(0, 0, 0)); t0 = null; }
    // the free left hand rests on the front knee while kneeling
    if (!t0 && v.kneel > .5 && v.low > .5) { const kp = R0.legs[0].knee.getWorldPosition(V()); kp.y += .05; t0 = kp; }
    animateArms(R0, dt, wk, [t0, t1]);
    // action progress bar over the head (lower while kneeling)
    const showBar = !!act;
    this.actBar.visible = showBar; if (showBar) { this.actBar.position.set(px, 2.05 - v.low * .55, pz); this.actBar.quaternion.copy(camera.quaternion); setBar(this.actBar, act!.t / act!.info.dur); }
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
        this.dyn.add(av.g); v = { v: av, bar: makeBar(.55, .06, 0xff6a4a), key: '', frozen: 0, rot: undefined }; this.animals.set(a.id, v);
      }
      const C = this.cfg.animals[a.type];
      animate(v.v, { x: a.x, z: a.z, yaw: a.f, dt, now, stun: a.stun > 0 || a.freeze > 0, flee: a.state === 'flee', flash: a.flash > 0, lunge: a.state === 'attack' && a.bite > (C.biteInterval ?? 1.2) - .3, carry: a.carryN });
      v.v.g.position.set(a.x, 0, a.z);
      // facing = direction of movement (sim yaw, 0 = +z = model forward), smoothed so turns are not instant
      v.rot = v.rot === undefined ? a.f : lerpAngle(v.rot, a.f, 1 - Math.exp(-dt * 12)); v.v.g.rotation.y = v.rot;
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
  private animBush(dt: number, day: boolean, sim: DaySim | null, now: number) {
    const b = this.s.bush, B = this.cfg.bush, fr = this.bush.fruits;
    const growK = b.phase === 'growing' ? clamp(b.t / B.ripen, 0, 1) : 0;
    // ripe: the berries thin out pick by pick (20.11.2026: picks x berries, no small rest any more)
    const nBig = b.phase === 'ripe' ? Math.ceil(fr.length * clamp(b.berries / Math.max(1, B.picks * B.berries), 0, 1)) : 0, nSmall = 0;
    fr.forEach((f, i) => {
      if (b.phase === 'growing') { f.visible = true; f.material = this.bush.unripe; this.bush.unripe.color.setHex(0x9ab860).lerp(new THREE.Color(0x5a64c0), growK * growK); f.scale.setScalar(.03 + .025 * growK); }
      else if (b.phase === 'ripe') { f.material = BUSH_MAT.blue; f.visible = nBig ? i < nBig : i < nSmall; f.scale.setScalar(nBig ? .068 : .036); }
      else f.visible = false;
    });
    this.bush.leaf.color.setHex(b.phase === 'dry' ? 0x587a3c : 0x3f7a34);
    // shaken while it is combed: wobble + a little squash
    this.bush.shake = Math.max(0, this.bush.shake - dt * 2.4);
    const k = this.bush.shake * this.bush.shake, g = this.bush.g;
    g.rotation.z = Math.sin(now * 38) * .12 * k; g.rotation.x = Math.cos(now * 31) * .1 * k; g.scale.set(1.25, 1.25 * (1 - .1 * k + Math.sin(now * 44) * .05 * k), 1.25);
    const bar = this.bush.bar, showBar = b.phase === 'growing' && b.t >= B.barDelay;
    bar.visible = showBar; if (showBar) { bar.position.set(this.cfg.hof.bush.x, 1.55, this.cfg.hof.bush.z); bar.quaternion.copy(camera.quaternion); setBar(bar, growK); }
    this.bush.drop.visible = day && b.phase === 'dry' && this.s.tutorialDone;
  }
  /** one leaf whirling out of a bush / crown */
  private leafAt(x: number, y: number, z: number, up = 1) {
    const m = new THREE.Mesh(LEAF_GEO, leafBitMat); m.position.set(x, y, z); m.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7)); this.dyn.add(m);
    const a = rand(0, 7), sp = rand(.6, 1.6);
    this.bits.push({ m, vx: Math.cos(a) * sp, vy: rand(1.6, 3) * up, vz: Math.sin(a) * sp, t: 0, life: rand(1, 1.6), leaf: true, spin: rand(6, 14) * (Math.random() < .5 ? -1 : 1), s0: rand(.8, 1.4) });
  }
  /** a berry flies on an arc from (x, z) to the farmer (into the Lager); the collect sound plays when it lands */
  private berryTo(x: number, z: number, to: { x: number; z: number }, small: boolean, delay: number) {
    const m = itemMesh('blue', small ? .6 : .95); m.visible = false; this.dyn.add(m);
    const from = V(x + rand(-.35, .35), rand(.4, .8), z + rand(-.35, .35));
    m.position.copy(from);
    this.bits.push({ m, vx: 0, vy: 0, vz: 0, t: -delay, life: rand(.45, .6), leaf: false, spin: 0, s0: 1, from, to: V(to.x + rand(-.08, .08), .9, to.z + rand(-.08, .08)) });
  }
  private updateBits(dt: number) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i], m = b.m; b.t += dt; if (b.t < 0) continue;
      const k = b.t / b.life;
      if (b.to && b.from) { // berry arc to the farmer
        m.visible = true; const e = Math.min(1, k);
        m.position.lerpVectors(b.from, b.to, e); m.position.y += Math.sin(e * Math.PI) * .9;
        if (k >= 1) { if (!b.snd) { b.snd = true; sfx('collect.xp', b.to.x, b.to.z); } this.dyn.remove(m); this.bits.splice(i, 1); }
        continue;
      }
      if (k >= 1) { this.dyn.remove(m); this.bits.splice(i, 1); continue; }
      // leaf: strong drag, slow fall, swirl sideways
      b.vy -= 4.5 * dt; const drag = Math.exp(-dt * 3); b.vx *= drag; b.vz *= drag; b.vy = Math.max(b.vy * drag, -.7);
      m.position.x += (b.vx + Math.sin(b.t * 9 + i) * .5) * dt; m.position.z += (b.vz + Math.cos(b.t * 8 + i) * .5) * dt; m.position.y += b.vy * dt;
      if (m.position.y < .04) { m.position.y = .04; b.vy = 0; b.vx *= .5; b.vz *= .5; } else { m.rotation.x += b.spin * dt; m.rotation.y += b.spin * .6 * dt; }
      m.scale.setScalar(b.s0 * (k < .7 ? 1 : 1 - (k - .7) / .3));
    }
    // apple trees + brambles that were shaken
    // (the farm's trees are instanced: shaking shows as falling leaves + apples)
    for (let i = this.brambleShake.length - 1; i >= 0; i--) { const q = this.brambleShake[i]; q.t -= dt; const k = Math.max(0, q.t) ** 2; q.g.rotation.z = Math.sin(performance.now() / 25) * .12 * k; if (q.t <= 0) this.brambleShake.splice(i, 1); }
  }

  // ---------------- livestock ----------------
  private animPens(dt: number, now: number, sim: DaySim | null, day: boolean) {
    for (const [id, p] of this.pens) {
      const built = !!this.s.buildings[id]?.built, C = this.cfg.stalls[id], st = sim?.stalls[id];
      p.hunger.visible = false; p.zzz.visible = false;
      if (!built) continue;
      // evening / menu: everyone sleeps; during the day they sleep once they are fully fed
      const asleep = !day || !!st && st.fed >= C.maxFed;
      for (const a of p.list) animateLivestock(a, dt, now, p.hw, p.hd, asleep);
      const b = this.hof.building(id); if (!b) continue;
      const bob = Math.sin(now * 3) * .06;
      if (day && st && st.fed < C.maxFed) { p.hunger.visible = true; p.hunger.position.set(b.x, 2.1 + bob, b.z); }
      else if (asleep && day) { p.zzz.visible = true; p.zzz.position.set(b.x + .3, 1.9 + bob, b.z); }
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
      case 'act':
        if (e.kind === 'weed' || e.kind === 'weedHof') sfx('player.till', P.x, P.z);
        if (e.kind === 'water') { this.pourStop?.(); this.pourStop = sfx('can.pour', P.x, P.z); } // sounds.yaml can.*: pouring, filling at the well
        if (e.kind === 'refill') sfx('can.fill', P.x, P.z);
        break;
      case 'actDone': {
        const p = sim.targetPos(e.target);
        if (e.kind === 'sow') { burst(V(p.x, .2, p.z), 0x6a4a30, 16, 1.6, .12, .6, { g: 6 }); sfx('player.till', p.x, p.z); }
        if (e.kind === 'weed' || e.kind === 'weedHof') { burst(V(p.x, .2, p.z), 0x5e8e2c, 12, 1.4, .1, .6, { g: 6 }); burst(V(p.x, .1, p.z), 0x6a4a30, 6, 1, .08, .5, { g: 6 }); play('rustle'); }
        if (e.kind === 'gather') { burst(V(P.x, .2, P.z), 0xd8d0a0, 8, 1.2, .08, .5, { g: 5 }); }
        if (e.kind === 'fertilize') { burst(V(p.x, .25, p.z), 0x4a3a20, 20, 1.6, .1, .6, { g: 6 }); play('throw'); }
        if (e.kind === 'straw') { const b = this.hof.building((e.target as { id: BuildingId }).id); if (b) burst(V(b.x, .3, b.z), 0xe8d488, 24, 2, .1, .7, { g: 5 }); play('rustle'); }
        if (e.kind === 'produce' || e.kind === 'milk' || e.kind === 'eggs') { const f = sim.facePoint(e.target); burst(V(f.x, 1, f.z), 0xfff4d0, 14, 1.6, .1, .6, { g: -1 }); play('ready'); }
        if (e.kind === 'draw') sfx('ui.confirm');
        if (e.kind === 'harvestPlot') { const b = this.plots[(e.target as { i: number }).i]; if (b) b.shake = 1; }
        if (e.kind === 'harvestPlot') {
          const p = sim.targetPos(e.target), pl = this.s.plots[(e.target as { i: number }).i];
          burst(V(p.x, .5, p.z), 0xe8c860, 30, 2.4, .12, .8, { g: 5 });
          sfx('harvest.ok', p.x, p.z); sfx('plants.produce.' + (pl?.crop ?? 'wheat'), p.x, p.z);
          if (pl && pl.stage !== 'ripe') sfx('harvest.done', p.x, p.z);
        }
        if (e.kind === 'gather') { sfx('harvest.ok', P.x, P.z); play('rustle'); }
        if (e.kind === 'water') { const p = sim.targetPos(e.target); decal(p.x, p.z, 0x10161e, 1.2, 3, { op: .3 }); }
        break;
      }
      // one pass through the bush: it wobbles, leaves whirl out, the berries hop into the farmer's hands (straight into the Lager)
      case 'berry': {
        const B = this.cfg.hof.bush, to = { x: P.x, z: P.z };
        this.bush.shake = 1; play('rustle');
        for (let i = 0; i < 5; i++) this.leafAt(B.x + rand(-.4, .4), rand(.4, .8), B.z + rand(-.4, .4));
        for (let i = 0; i < e.n; i++) this.berryTo(B.x, B.z, to, !!e.small, i * .09);
        sfx('plants.produce.blue', B.x, B.z); sfx('harvest.ok', B.x, B.z); if (e.small) sfx('harvest.done', B.x, B.z);
        break;
      }
      case 'bramble': { const g = this.wild.bramble(e.i); if (g) { this.brambleShake.push({ g, t: .7 }); const p = g.position; for (let i = 0; i < 3; i++) this.leafAt(p.x + rand(-.3, .3), rand(.4, .8), p.z + rand(-.3, .3)); sfx('harvest.ok', p.x, p.z); } play('rustle'); break; }
      case 'shake': for (let i = 0; i < 10; i++) this.leafAt(e.x + rand(-1, 1), rand(1.8, 2.6), e.z + rand(-1, 1), .3); play('rustle'); sfx('plants.produce.nut', e.x, e.z); sfx('harvest.ok', e.x, e.z); break;
      case 'fed': { const b = this.hof.building(e.id); if (b) { burst(V(b.x, .4, b.z), e.id === 'chickens' ? 0xe0b850 : 0x6a9a3a, 16, 1.6, .1, .6, { g: 5 }); if (e.id === 'sheep') sfx('sheep.wave', b.x, b.z); } play('throw'); break; }
      case 'hungry': if (this.s.buildings.sheep?.built) { const b = this.hof.building('sheep'); if (b) sfx('sheep.wave', b.x, b.z); } break;
      case 'swing': sfx('player.slash', e.x, e.z); slashSmear(e.x, e.z, e.dir, this.cfg.weapons.rake.range, this.cfg.weapons.rake.arc, .2); break; // arc in degrees (was passed in radians: the smear was a sliver)
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
      case 'ripe': { const B = this.cfg.hof.bush; burst(V(B.x, .8, B.z), 0x8a9cff, 20, 1.5, .12, .8, { g: -1 }); sfx('plants.ripe'); break; }
      // a field is fully grown: golden sparkle rising from the bed + a bright little bell (not positional: it may be off screen)
      case 'plotRipe': { const p = this.cfg.hof.plots[e.i]; if (p) burst(V(p.x, .6, p.z), 0xffe27a, 22, 1.6, .1, .9, { g: -1.5 }); sfx('plants.ripe'); break; }
      case 'actCancel': if (e.kind === 'water') { this.pourStop?.(); this.pourStop = undefined; } break;
      case 'deny': if (e.why === 'water') { sfx('can.empty', P.x, P.z); sfx('can.empty2', P.x, P.z); } else play('imm'); break; // empty can: tin flick, then a lower one
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
    this.animBush(dt, day, sim, now);
    this.updateBits(dt);
    this.wild.update(this.s, day ? sim : null, now);
    // pickable things twinkle now and then (tiny rising glints near the camera)
    if (day && Math.random() < dt * 9) { const p = this.wild.sparkle(this.s); if (p && Math.hypot(p.x - this.camX, p.z - this.camZ) < 15) PART.spawn(p, V(0, rand(.15, .3), 0), 0xfff4d0, .06, rand(.6, .9), { s1: 0, a: .9 }); }
    this.animPens(dt, now, day ? sim : null, day);
    this.animPlayer(day ? sim : null, dt);
    this.animAnimals(day ? sim : null, dt, now);
    this.animShots(day ? sim : null, dt);
    // highlight of the hovered target
    const h = day && sim && !sim.inputLocked ? this.hover : null;
    const box = h && (h.k === 'bld' || h.k === 'stall') ? this.hof.building(h.id) : null, rect = !!box && box.kind === 'box';
    this.hl.ring.visible = !!h && !rect; this.hl.square.visible = rect;
    if (h && sim) {
      const p = sim.targetPos(h), pulse = .55 + .25 * Math.sin(now * 6);
      this.hl.mat.color.setHex(this.hoverOk ? 0xfff2c0 : 0xff8a70); this.hl.mat.opacity = pulse;
      if (rect && box && box.kind === 'box') {
        const W = box.hw + .25, D = box.hd + .25, sq = this.hl.square; sq.position.set(box.x, .06, box.z); sq.rotation.y = Math.atan2(box.s, box.c);
        sq.children.forEach((b, i) => { const hz = i < 2; b.scale.set(hz ? W * 2 + .12 : .12, hz ? .12 : D * 2 + .12, 1); b.position.set(hz ? 0 : (i === 2 ? -W : W), 0, hz ? (i === 0 ? -D : D) : 0); });
      } else {
        const r = h.k === 'well' ? (this.cfg.hof.buildings.well.r ?? 1) + .35 : h.k === 'plot' ? this.cfg.plots.size / 2 + .15 : h.k === 'bush' ? this.cfg.bush.radius + .25 : h.k === 'tree' ? 1.1
          : h.k === 'bramble' ? .95 : h.k === 'bld' || h.k === 'stall' ? ((box && box.kind === 'circle' ? box.r : 1) + .3) : .45;
        this.hl.ring.scale.setScalar(r); this.hl.ring.position.set(p.x, .05, p.z);
      }
    }
    // arrow + bubble
    this.arrow.visible = !!this.arrowAt;
    if (this.arrowAt) this.arrow.position.set(this.arrowAt.x, (this.arrowAt.y ?? 1.9) - .3 + Math.abs(Math.sin(now * 3)) * .3, this.arrowAt.z);
    if (this.bubble) { const a = sim?.animals.find(x => x.id === this.bubble!.id); if (a) this.bubble.s.position.set(a.x + .5, 1.55, a.z); else this.setBubble(null); }
    // buildings: mill sails, well crank, window glow at dusk
    const mill = this.buildings.get('mill'); if (mill?.sails && this.s.buildings.mill.built) mill.sails.rotation.z += dt * .6;
    // light: hour from the clock (light[0] in the morning .. light[1] at the end of the day)
    const L = this.cfg.day.light, hour = this.hour ?? (mode === 'menu' ? 10.5 : mode === 'evening' ? 16.45 : lerp(L[0], L[1], sim ? sim.k : 0));
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
    else { tx = P ? P.x : this.focus?.x ?? door.x; tz = P ? P.z : this.focus?.z ?? door.z; }
    this.shotK = clamp(this.shotK + (this.shot ? dt : -dt) * 1.4, 0, 1);
    const k = this.shotK * this.shotK * (3 - 2 * this.shotK);
    if (this.shot) { this.lastShot = this.shot; }
    if (this.lastShot && k > 0) { tx = lerp(tx, this.lastShot.x, k); tz = lerp(tz, this.lastShot.z, k); z = lerp(z, this.lastShot.zoom ?? z, k); }
    const f = 1 - Math.pow(.002, dt);
    this.camX = lerp(this.camX, tx, f); this.camZ = lerp(this.camZ, tz, f); this.camZoom = lerp(this.camZoom, z, f);
    // orbit: yaw around the player, pitch over the ground (portrait looks down a little steeper and from further away)
    const D = (portrait ? 21.4 : 16.4) * this.camZoom, pitch = clamp(this.camPitch + (portrait ? .1 : 0), .3, 1.45), yaw = mode === 'evening' ? 0 : this.camYaw;
    const off = V(Math.sin(yaw) * Math.cos(pitch) * D, Math.sin(pitch) * D, Math.cos(yaw) * Math.cos(pitch) * D);
    this.shake = Math.max(0, this.shake - dt * 1.2);
    const sx = this.shake ? rand(-1, 1) * this.shake * .4 : 0, sz = this.shake ? rand(-1, 1) * this.shake * .4 : 0;
    camera.position.set(this.camX + off.x + sx, off.y, this.camZ + off.z + sz);
    const lo = portrait ? 0 : .4;
    camera.lookAt(this.camX + sx + Math.sin(yaw) * lo, 0, this.camZ + sz + Math.cos(yaw) * lo);
    torch.position.set(this.camX, 3, this.camZ + .6);
    setListener(P ? P.x : this.camX, P ? P.z : this.camZ);
    this.sun(this.camX, this.camZ);
  }
  private lastShot: CamShot = null; camZoom = 1;
  /** camera target without a player (world editor) */
  focus: { x: number; z: number } | null = null;
  /** fixed hour of the light (world editor) */
  hour: number | null = null;
  /**
   * shadow map fitted to what the camera sees (21.11.2026, Basti: "Schattenbereich zu klein"): the view rays through the
   * screen edges hit the ground (capped by the fog), those points and the same points a few metres up (trees, roofs) are
   * wrapped by the light's box. The box is square and snapped to whole shadow texels so the shadows do not shimmer.
   */
  private sun(x: number, z: number) {
    const L = moon.position.clone(); // direction to the light, set by daynight around the origin
    if (L.lengthSq() < 1e-6) L.set(0, 1, 0); L.normalize();
    camera.updateMatrixWorld();
    const o = camera.position, maxT = Math.min(70, (scene.fog as THREE.Fog | null)?.far ?? 60);
    const ax = new THREE.Vector3().crossVectors(V(0, 1, 0), L); if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0); ax.normalize();
    const ay = new THREE.Vector3().crossVectors(L, ax);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, d0 = 1e9, d1 = -1e9;
    const add = (px: number, py: number, pz: number) => {
      const lx = px * ax.x + py * ax.y + pz * ax.z, ly = px * ay.x + py * ay.y + pz * ay.z, ld = px * L.x + py * L.y + pz * L.z;
      x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); d0 = Math.min(d0, ld); d1 = Math.max(d1, ld);
    };
    const dir = new THREE.Vector3();
    for (const [nx, ny] of SHADOW_RAYS) {
      dir.set(nx, ny, .5).unproject(camera).sub(o).normalize();
      const t = Math.min(maxT, dir.y < -1e-3 ? -o.y / dir.y : maxT), gx = o.x + dir.x * t, gz = o.z + dir.z * t;
      add(gx, 0, gz); add(gx, 7, gz);
    }
    add(x, 0, z); // the player (camera target) always lies inside
    const S = moon.shadow.mapSize.x || 1024, size = Math.min(84, Math.max(x1 - x0, y1 - y0) + 3), texel = size / S;
    const cx = Math.round((x0 + x1) / 2 / texel) * texel, cy = Math.round((y0 + y1) / 2 / texel) * texel, back = d1 + 25;
    const c = ax.clone().multiplyScalar(cx).addScaledVector(ay, cy);
    moon.position.copy(c).addScaledVector(L, back); moon.target.position.copy(c).addScaledVector(L, back - 1);
    const h = size / 2;
    Object.assign(moon.shadow.camera, { left: -h, right: h, top: h, bottom: -h, near: .5, far: back - d0 + 6 }); moon.shadow.camera.updateProjectionMatrix();
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
  /** middle mouse / touch drag: turn around the player and tilt */
  rotateBy(dx: number, dy: number) {
    const C = this.cfg.camera; this.camYaw -= dx * C.rotate;
    this.camPitch = clamp(this.camPitch + dy * C.rotate, C.pitch[0], C.pitch[1]);
  }
  zoomBy(dy: number) { this.zoom = clamp(this.zoom * Math.pow(1.0015, dy), .6, 1.6); }
  /** hard cut of the camera (after a fade) */
  snapCamera(x: number, z: number) { this.camX = x; this.camZ = z; }
  clearDynamic() { for (const b of this.bits) this.dyn.remove(b.m); this.bits.length = 0; for (const [, v] of this.animals) { this.dyn.remove(v.v.g); v.bar.visible = false; } this.animals.clear(); for (const [, m] of this.lootViews) this.dyn.remove(m); this.lootViews.clear(); this.setBubble(null); this.setArrow(null); this.shot = null; this.lastShot = null; this.shotK = 0; }
}
