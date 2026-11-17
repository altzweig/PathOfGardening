// Renders Snap objects. Same path for host (snap every frame) and clients (snaps at net rate,
// smoothed here). Events trigger particles, sounds and hit effects.
import * as THREE from 'three';
import { Balancing, ENEMIES, EnemyType, FRUITS, FruitType, SKILLS, SkillId, Weapon } from '../config';
import { Slot, cornerAngle, hexDist, hexR, triPlant, slotAt, slotFits, slotPositions } from '../sim/sim';
// soft round glow for the rim pulse
const pulseTex = (() => { const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!; const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.3, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(cv); })();
import { EF, ESnap, Ev, PSnap, Snap } from '../sim/snap';
// glowing lava cracks under the chili bed (white, tinted by the material)
const lavaTex = (() => {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(255,255,255,.4)'); grd.addColorStop(.8, 'rgba(255,255,255,.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,.35)'; g.lineWidth = pass ? 2.2 : 7;
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 16; i++) {
      let x = S / 2 + (rnd() - .5) * S * .7, y = S / 2 + (rnd() - .5) * S * .7, a = rnd() * 7;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { a += (rnd() - .5) * 1.4; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
      g.stroke();
    }
  }
  return new THREE.CanvasTexture(cv);
})();
import { loopSfx, play, setListener, sfx, stopAllLoops } from '../audio';
import { FireSprites, FlameFx, GroundHeat, makeFlame, updateFlame } from './flame';
import { fruitIcon, skillIcon } from '../ui/icons';
import {
  GEO, M, PART, V, addMat, lightning, updateBolts, clearBolts, barGroup, burst, camera, clamp, clearFx, composer, decal, gradePass, lerp, lerpAngle, makeBar, moon,
  part, punchStar, dustCloud, pxScale, rand, rakeSweep, rectGeo, scene, sectorGeo, setBar, torch, updateFx, windU, lantern, gardenLight,
} from './core';
import { ASP_TIP_BUSH, BUSH_MAT, CHILI_STEM, EYE_COL, FRUIT_COL, FRUIT_HEX, PLAYER_RING, PROJ_ASP, PROJ_ASP_TIP, PlantMats, ELITE_COL, addOutline, buildEnemy, buildPlant, buildPlayer, fruitMesh, EnemyParts } from './models';
import { loadNature, natureMesh } from './nature';
import { setBareRoom } from './world';
import { buildWorld, setForestClearings, setGardenSlots, clearEyes, updateEyes, warnEyes, updateFog, syncTorches, updateTorches } from './world';
import { GROUND_MAT, rakeHead } from './models';
import { dayNow, updateDayNight } from './daynight';
import { lavaBedMaterial } from './textures';
import { buildBed } from './beds';
import { Rig, animateArms, animateLegs, disposeFarmer } from './farmer';
import { Look, cleanLook, lookKey } from '../look';
import { Held, animBomb, animHeld, animNode, animProj, bombMesh, buildHeld, clearComboFx, comboEvent, comboOf, nodeMesh, projMesh, updateComboFx } from './combos';
const DBG_CAM = import.meta.env.DEV ? new URLSearchParams(location.search).get('cam')?.split(',').map(Number) ?? null : null;

const NUM_COL: Record<string, string> = { w: '#fff4d6', r: '#ffe3a0', g: '#c8ff9a', p: '#ff8090', b: '#ff6b7a', c: '#c8ff80', f: '#ffb35c', h: '#ff6b5a', v: '#9cff60', z: '#bfe4ff', o: '#ffa040' };

interface PView { cw?: Held; cwT?: number; heatT?: number; twist?: number; xbow?: { g: THREE.Group; bolt: THREE.Group }; flame?: { fx: FlameFx; gun: THREE.Group; ang: number; was: boolean }; rig: Rig; lookKey: string; walk: number; label?: THREE.Sprite; wandGrip: THREE.Object3D; stepN?: number; g: THREE.Group; body: THREE.Group; rake: THREE.Group; head: THREE.Group; wand: THREE.Group; wandTip: THREE.Object3D; lemonMat: THREE.MeshStandardMaterial; stars: THREE.Group; ring: THREE.Mesh; bar: THREE.Group; s: PSnap; x: number; z: number; rot: number; recoil: number }
interface EView { g: THREE.Group; P: EnemyParts; type: EnemyType; bar: THREE.Group; s: ESnap; x: number; z: number; squash: number; carry: string; ind?: THREE.Mesh; ph?: number }
interface FView { g: THREE.Group; tier: number; type: FruitType; x: number; y: number; z: number; tx: number; ty: number; tz: number; seen: number }
interface JView { m: THREE.Object3D; kind: number; x: number; y: number; z: number; tx: number; ty: number; tz: number; seen: number }
/** nature-pack broadleaf tree (about 7 units tall) scaled to a ~3.5 m nut tree */
const NUT_TREE_SCALE = .5;
const BADGE = 1.0;
const EDGE_T = .38; // synergy chips sit on the line to each neighbour, this far from the hovered field's centre // badge diameter in hex radii
const BADGES: Record<string, THREE.CanvasTexture> = {};
function badgeTex(t: FruitType, rarity = 0) {
  const key = t + rarity, have = BADGES[key]; if (have) return have;
  const rim = '#' + (RARITY_COL[rarity] ?? 0xe3b964).toString(16).padStart(6, '0');
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d')!;
  const plate = () => {
    x.clearRect(0, 0, S, S);
    const g = x.createRadialGradient(S * .42, S * .36, S * .05, S / 2, S / 2, S * .47); g.addColorStop(0, '#2c353e'); g.addColorStop(1, '#0c1014');
    x.beginPath(); x.arc(S / 2, S / 2, S * .44, 0, Math.PI * 2); x.fillStyle = g; x.globalAlpha = .88; x.fill(); x.globalAlpha = 1;
    x.lineWidth = S * .05; x.strokeStyle = rim; x.stroke();
  };
  plate();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; BADGES[key] = tex;
  const img = new Image();
  img.onload = () => { plate(); x.drawImage(img, S * .14, S * .14, S * .72, S * .72); tex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fruitIcon(t).replace('<svg ', `<svg width="${S}" height="${S}" `));
  return tex;
}
interface FieldView { bedMat: THREE.MeshStandardMaterial; g: THREE.Group; plant: THREE.Group; fruits: THREE.Mesh[]; mats: PlantMats; rim: THREE.Mesh; bar: THREE.Group; alive: boolean; type: number; rarity: number; prog: number; pulse: THREE.Sprite[]; edge: number; ep: number; pos: number; tilled: boolean; x: number; z: number; shake: number; glow: number; hit: number; comb: number; combs: number[]; bmats: THREE.MeshStandardMaterial[]; bglow: number[]; ftype: FruitType; lava?: THREE.Mesh; lavaT: number; lv: number; rate: number }
/** purely visual debris of a rake stroke: fruit shaken off the bush and whirling leaves */
interface Bit { m: THREE.Object3D; vx: number; vy: number; vz: number; t: number; life: number; leaf: boolean; spin: number; s0: number; landed: boolean }
const LEAF_GEO = (() => { const g = new THREE.PlaneGeometry(.11, .07); g.translate(0, 0, 0); return g; })();
const leafMats = new Map<number, THREE.MeshLambertMaterial>();
/** bed outline: a hexagon rounded towards a circle with a ragged, noisy edge; inner part opaque, outer fringe fades out
 *  (vertex alpha) so the bed blends into the ground. Flat in XZ, facing up. */
function softBedGeo(H: number, seed: number) {
  const N = 72, pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const hexR = (a: number) => { const t = ((a + Math.PI / 2) % (Math.PI / 3) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6; return Math.cos(Math.PI / 6) / Math.cos(t); };
  const nz = (a: number, f: number) => Math.sin(a * f + seed) * .5 + Math.sin(a * (f * 2.3) + seed * 1.7) * .3 + Math.sin(a * (f * 5.1) + seed * .3) * .2;
  const v = (x: number, z: number, al: number) => { pos.push(x, 0, z); col.push(1, 1, 1, al); uv.push(x / (2 * H) + .5, z / (2 * H) + .5); return pos.length / 3 - 1; };
  const c = v(0, 0, 1), ring: number[][] = [[], [], []];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, r = H * (hexR(a) * .55 + .45 * .93) * (1 + nz(a, 7) * .05), ca = Math.cos(a), sa = Math.sin(a);
    ring[0].push(v(ca * r * .8, sa * r * .8, 1));
    ring[1].push(v(ca * r * (.98 + nz(a, 11) * .04), sa * r * (.98 + nz(a, 11) * .04), .8));
    const ro = r * (1.1 + Math.max(0, nz(a, 13)) * .08); ring[2].push(v(ca * ro, sa * ro, 0));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N; idx.push(c, ring[0][j], ring[0][i]);
    for (let k = 0; k < 2; k++) { const a0 = ring[k][i], a1 = ring[k][j], b0 = ring[k + 1][i], b1 = ring[k + 1][j]; idx.push(a0, a1, b1, a0, b1, b0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function leafMat(c: THREE.Color) { const k = c.getHex(); let m = leafMats.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(1.5), side: THREE.DoubleSide }); leafMats.set(k, m); } return m; }
// common, uncommon, rare, epic, legendary
export const RARITY_COL = [0x9a9488, 0x5fd35f, 0x4a8cff, 0xb05cff, 0xffa020];

export interface LocalAim { weapon: Weapon | null; x: number; z: number; show: boolean }

export class GameView {
  cfg!: Balancing;
  me = 0;
  smooth = false; // clients interpolate
  snap: Snap | null = null;
  private dyn = new THREE.Group();
  private players = new Map<number, PView>();
  private enemies = new Map<number, EView>();
  private fruits = new Map<number, FView>();
  private projs = new Map<number, JView>();
  private bombs = new Map<number, JView>();
  private mines = new Map<number, JView>();
  private fields = new Map<number, FieldView>();
  private pools = new Map<number, JView>();
  private bbombs = new Map<number, JView>();
  private snodes = new Map<number, JView>();
  private slots: Slot[] = [];
  // build mode (top-down strategy view)
  placing: FruitType | null = null;
  private slotOverlay = new THREE.Group();
  private hoverSlot = -1;
  private placeT = 0;
  private aimInd: Record<string, THREE.Mesh> = {};
  private aggro: THREE.Mesh;
  private nums: { el: HTMLElement; p: THREE.Vector3; t: number }[] = [];
  private dmgLayer = document.getElementById('dmg')!;
  private shake = 0; private dtLast = .016;
  private heat!: GroundHeat; private fire!: FireSprites;
  private bits: Bit[] = [];
  hurtT = 0;
  zoom = 1;
  /** mouse wheel: + zooms out, - zooms in */
  zoomBy(dy: number) { this.zoom = clamp(this.zoom * Math.pow(1.0015, dy), .55, 1.7); }
  private berryT = 0;
  private lowHp = 0;
  /** low-HP warning for the local player: red screen edges (life itself shows in the HUD bar + bars over the mates) */
  private lowHpWarn(v: PView, frac: number) {
    const H = this.cfg.hud.hat, now = performance.now() / 1000; frac = clamp(frac, 0, 1);
    if (v.s.id === this.me) this.lowHp = v.s.al && frac <= H.vignetteBelow ? H.vignetteStrength * (.8 + .2 * Math.sin(now * 3)) : 0;
  }
  /** player looks (character editor), by player id; a changed look rebuilds that figure */
  private looks = new Map<number, Look>();
  setLooks(list: { id: number; look?: Look }[]) { for (const p of list) if (p.look) this.looks.set(p.id, cleanLook(p.look)); }
  private lookFor(id: number, c: number) { return this.looks.get(id) ?? cleanLook({ name: '', face: c % 5, body: (c + 1) % 5, hair: c % 5, hairCol: (c * 2) % 5, skin: (c * 3) % 5, shirt: c % 5, pants: c % 5, hat: 'straw' }); }
  private nameLabel(name: string, c: number) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const x = cv.getContext('2d')!;
    x.font = '700 30px "Alegreya Sans", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(name, 128, 25);
    x.fillStyle = '#' + new THREE.Color(PLAYER_RING[c % 4]).getHexString(); x.fillText(name, 128, 25);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(1.2, .225, 1); sp.renderOrder = 5;
    return sp;
  }
  /** lying blueberries glow and pulse more the closer the team is to the next level */
  private berryGlow(dt: number) {
    const s = this.snap; const k = s && s.nx ? clamp(s.xp / s.nx, 0, 1) : 0;
    this.berryT += dt * (1.5 + k * k * 9);
    const pulse = .5 + .5 * Math.sin(this.berryT * Math.PI * 2);
    // a soft base glow so they can be spotted by day, swelling gently towards the next level-up
    GROUND_MAT.blue.emissiveIntensity = .45 + k * k * .35 + pulse * k * k * k * .2;
  }
  private fieldKey = '';
  private frameId = 0;
  localAim: LocalAim = { weapon: null, x: 0, z: 1, show: false };
  onEvent: (e: Ev) => void = () => {};

  constructor() {
    buildWorld();
    this.heat = new GroundHeat(scene); this.fire = new FireSprites(scene);
    scene.add(this.dyn);
    this.aggro = new THREE.Mesh(GEO.ring, addMat(0xe3b964, .006)); this.aggro.rotation.x = -Math.PI / 2; this.aggro.position.y = .03; scene.add(this.aggro);
  }
  // ---------------- build mode ----------------
  setPlacing(type: FruitType | null) {
    if (this.placing === type) return;
    this.placing = type; this.hoverSlot = -1;
    for (const c of [...this.slotOverlay.children]) this.slotOverlay.remove(c);
    this.infoLayer.innerHTML = ''; this.infoEls = []; this.infoKey = []; this.edgeEls = [];
    if (!type || !this.cfg) return;
    const H = hexR(this.cfg);
    for (const s of this.slots) {
      const g = new THREE.Group(); g.position.set(s.x, .06, s.z); g.visible = slotFits(this.cfg, s, type); // nut trees only in the forest, everything else only in the garden
      const fill = new THREE.Mesh(new THREE.CircleGeometry(H * .93, 6, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .06, depthWrite: false }));
      const line = new THREE.Mesh(new THREE.RingGeometry(H * .86, H * .95, 6, 1, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, depthWrite: false }));
      fill.rotation.x = line.rotation.x = -Math.PI / 2;
      if (s.forest) for (const m of [fill, line]) (m.material as THREE.MeshBasicMaterial).depthTest = false; // forest slots sit between the bushes: draw them on top
      // big fruit badge in the middle: what grows here (top-down: instantly visible what would be overbuilt)
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex('blue'), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
      badge.position.set(0, .4, -H * .1); badge.scale.setScalar(H * BADGE); badge.renderOrder = 20; badge.visible = false;
      g.add(fill, line, badge); g.renderOrder = 5; this.slotOverlay.add(g);
      // field info (HTML): level gems on top, below: fruit per second and the step bar to the next rarity
      const el = document.createElement('div'); el.className = 'fInfo'; el.hidden = true;
      el.innerHTML = `<div class="fLv"></div><div class="fBot"><div class="fRate"></div><div class="fBar"></div></div>`;
      this.infoLayer.appendChild(el); this.infoEls.push(el);
    }
  }
  private infoLayer = (() => { const d = document.createElement('div'); d.id = 'fieldInfo'; document.getElementById('dmg')!.after(d); return d; })();
  private infoEls: HTMLElement[] = [];
  private infoKey: string[] = [];
  /** synergy chips on the edges between the hovered slot and its neighbours */
  private edgeEls: HTMLElement[] = [];
  private edgeChip(k: number) {
    let el = this.edgeEls[k];
    if (!el || !el.isConnected) { el = document.createElement('div'); el.className = 'fEdge'; this.infoLayer.appendChild(el); this.edgeEls[k] = el; }
    return el;
  }
  setHover(cx: number, cy: number) { this.hoverSlot = this.slotFromScreen(cx, cy); }
  /** slot kept highlighted while the overbuild confirmation is open */
  confirmSlot = -1;
  /** type of the living field on a slot (null = free or dead) */
  fieldTypeAt(slot: number): FruitType | null { const v = this.fields.get(slot); return v && v.alive ? FRUITS[v.type] : null; }
  slotFromScreen(cx: number, cy: number) {
    const nx = cx / innerWidth * 2 - 1, ny = -(cy / innerHeight) * 2 + 1;
    const o = camera.position, d = V(nx, ny, .5).unproject(camera).sub(o).normalize(); if (d.y >= 0) return -1;
    const t = -o.y / d.y;
    const i = slotAt(this.cfg, this.slots, o.x + d.x * t, o.z + d.z * t);
    return i >= 0 && this.placing && !slotFits(this.cfg, this.slots[i], this.placing) ? -1 : i;
  }
  private updateOverlay() {
    if (!this.placing) return;
    const type = FRUITS.indexOf(this.placing), cost = this.cfg.fields.rarityCost;
    // screen scale of one hex (for the HTML labels)
    const H = hexR(this.cfg), s0 = this.slots[0], pa = V(s0.x, 0, s0.z).project(camera), pb = V(s0.x + H, 0, s0.z).project(camera);
    const px = Math.abs(pb.x - pa.x) * innerWidth / 2; // pixels per H
    const pv = this.buildPreview(type);
    this.slotOverlay.children.forEach((g, i) => {
      if (!g.visible) { this.fieldInfo(i, null, false, false, px, pv); return; }
      const [fill, line, badge] = g.children as [THREE.Mesh, THREE.Mesh, THREE.Sprite];
      const f = this.fields.get(i), same = !!f && f.alive && f.type === type, maxed = same && f!.rarity >= cost.length;
      const col = !f ? 0xffffff : same ? (maxed ? 0x777777 : 0xffd860) : 0xff6a5a;
      const hov = i === this.hoverSlot || i === this.confirmSlot;
      const bm = badge.material as THREE.SpriteMaterial; badge.visible = !!f && f.alive;
      const ghost = hov && pv.slot === i && (!f || !f.alive);
      if (ghost) { // preview of the new field on a free spot
        badge.visible = true; const t = badgeTex(this.placing!, 0); if (bm.map !== t) { bm.map = t; bm.needsUpdate = true; }
        badge.scale.setScalar(hexR(this.cfg) * BADGE * (.96 + .04 * Math.sin(performance.now() / 160))); bm.color.set(0xffffff); bm.opacity = .85;
      } else if (f && f.alive) {
        const t = badgeTex(FRUITS[f.type], f.rarity); if (bm.map !== t) { bm.map = t; bm.needsUpdate = true; }
        const over = !same && hov, now = performance.now() / 1000;
        badge.scale.setScalar(hexR(this.cfg) * BADGE * (hov ? 1.1 : 1) * (over ? 1 + .05 * Math.sin(now * 10) : 1));
        bm.color.set(over ? 0xffb0a0 : 0xffffff); bm.opacity = hov ? 1 : .92;
      }
      (fill.material as THREE.MeshBasicMaterial).color.set(col); (fill.material as THREE.MeshBasicMaterial).opacity = hov ? (f && f.alive ? .38 : .16) : .07;
      (line.material as THREE.MeshBasicMaterial).color.set(col); (line.material as THREE.MeshBasicMaterial).opacity = hov ? .95 : .45;
      this.fieldInfo(i, f && f.alive ? f : null, same, hov, px, pv);
    });
    this.edgeInfo(pv, px);
  }

  /** what the build under the pointer would change: new rarity on the hovered slot, rates before/after for every field */
  private buildPreview(type: number) {
    const F = this.cfg.fields, cost = F.rarityCost, br = this.snap?.br ?? [];
    const cur = new Map<number, { t: number; r: number }>();
    for (const [slot, v] of this.fields) if (v.alive) cur.set(slot, { t: v.type, r: v.rarity });
    const h = this.confirmSlot >= 0 ? this.confirmSlot : this.hoverSlot;
    const g = h >= 0 ? this.slotOverlay.children[h] : null;
    const next = new Map(cur);
    let slot = -1;
    if (g && g.visible) {
      slot = h; const c = cur.get(h), v = this.fields.get(h);
      if (c && c.t === type && v) next.set(h, { t: type, r: c.r < cost.length && v.prog + 1 >= cost[c.r] ? c.r + 1 : c.r });
      else next.set(h, { t: type, r: 0 });
    }
    const nbSum = (m: Map<number, { t: number; r: number }>, i: number) => { let n = 0; for (const [o, x] of m) if (o !== i && hexDist(this.slots[i], this.slots[o]) === 1) n += x.r; return n; };
    const rate = (m: Map<number, { t: number; r: number }>, i: number) => { const x = m.get(i); return x ? (br[x.t] ?? 0) * Math.pow(F.rarityProduction, x.r) * (1 + F.neighborBonus * nbSum(m, i)) : 0; };
    return { slot, cur, next, bonus: (i: number) => F.neighborBonus * nbSum(cur, i), bonusNext: (i: number) => F.neighborBonus * nbSum(next, i), rateNow: (i: number) => rate(cur, i), rateNext: (i: number) => rate(next, i), nb: F.neighborBonus };
  }
  /** chips on the shared edges: how much the hovered field gets from each neighbour and gives to it (arrow = direction) */
  private edgeInfo(pv: ReturnType<GameView['buildPreview']>, px: number) {
    let k = 0;
    if (pv.slot >= 0) {
      const h = pv.slot, sh = this.slots[h], me = pv.next.get(h)!, before = pv.cur.get(h);
      const gaveBefore = before ? before.r : 0;
      const ph = V(sh.x, 0, sh.z).project(camera);
      for (const [o, x] of pv.next) {
        if (o === h || hexDist(sh, this.slots[o]) !== 1) continue;
        const inc = x.r * pv.nb, out = (me.r - gaveBefore) * pv.nb, keep = me.r * pv.nb;
        if (!inc && !out && !keep) continue;
        const so = this.slots[o], po = V(so.x, 0, so.z).project(camera);
        const ax = (ph.x + 1) / 2 * innerWidth, ay = (1 - ph.y) / 2 * innerHeight, bx = (po.x + 1) / 2 * innerWidth, by = (1 - po.y) / 2 * innerHeight;
        const ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
        const pct = (v: number) => (v > 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + ' %';
        const arrow = (deg: number, cls: string) => `<svg class="${cls}" viewBox="0 0 20 12" style="transform:rotate(${deg.toFixed(0)}deg)"><path d="M1 6h14M11 1.5l6 4.5-6 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        // arrows only (numbers are in the rate chips): green = neighbour feeds the hovered field, gold = hovered feeds the neighbour, red = the neighbour loses its bonus
        let html = '';
        if (inc) html += arrow(ang + 180, 'in');
        if (out) html += arrow(ang, out > 0 ? 'out' : 'loss');
        else if (keep) html += arrow(ang, 'out');
        void pct;
        const el = this.edgeChip(k++); el.hidden = false; el.innerHTML = html;
        el.style.setProperty('--u', (px / 60).toFixed(3) + 'px');
        el.style.transform = `translate(${ax + (bx - ax) * EDGE_T}px,${ay + (by - ay) * EDGE_T}px) translate(-50%,-50%)`;
      }
    }
    for (; k < this.edgeEls.length; k++) if (this.edgeEls[k]) this.edgeEls[k].hidden = true;
  }

  /** HTML label of one slot: level (gems in rarity colours), fruit per second, step bar to the next rarity (only for the type being built) */
  private fieldInfo(i: number, f: FieldView | null, same: boolean, hov: boolean, px: number, pv: ReturnType<GameView['buildPreview']>) {
    const el = this.infoEls[i]; if (!el) return;
    const ghost = !f && pv.slot === i; // free spot under the pointer: preview of the new field
    el.hidden = !f && !ghost; if (el.hidden) { this.infoKey[i] = ''; return; }
    el.classList.toggle('ghost', ghost);
    const cost = this.cfg.fields.rarityCost, maxR = cost.length, r = f ? f.rarity : 0, maxed = r >= maxR, prog = f ? f.prog : 0;
    const ftype = f ? FRUITS[f.type] : this.placing!;
    const now = f ? f.rate : 0, nxt = pv.slot >= 0 ? pv.rateNext(i) : now, bonus = pv.slot >= 0 ? pv.bonusNext(i) : pv.bonus(i), bonusUp = pv.slot >= 0 && bonus !== pv.bonus(i);
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
    const s = this.slots[i], p = V(s.x, 0, s.z).project(camera);
    el.style.transform = `translate(${(p.x + 1) / 2 * innerWidth}px,${(1 - p.y) / 2 * innerHeight}px) translate(-50%,-50%)`;
    el.style.setProperty('--u', (px / 60).toFixed(3) + 'px');
    el.classList.toggle('hov', hov);
    const changes = pv.slot >= 0 && Math.abs(nxt - now) > .0005;
    const key = [ghost ? 'g' : '', ftype, r, prog, now, nxt.toFixed(3), bonus, bonusUp ? 1 : 0, same ? 1 : 0, hov ? 1 : 0].join('|'); if (this.infoKey[i] === key) return; this.infoKey[i] = key;
    const lv = el.children[0] as HTMLElement, rate = el.querySelector('.fRate') as HTMLElement, bar = el.querySelector('.fBar') as HTMLElement;
    // level: one gem per rarity reached, coloured like that rarity; on hover the gem that the next build completes blinks
    const n = !maxed ? cost[r] : 0, completes = same && hov && !maxed && prog + 1 >= n;
    let h = '';
    for (let k = 0; k <= maxR; k++) h += `<i class="${k <= r ? 'on' : ''}${k === r + 1 && completes ? ' nx' : ''}" style="--c:${hex(RARITY_COL[k])}"></i>`;
    lv.innerHTML = h;
    const num = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: v < 1 ? 2 : 1 });
    // fruit per second; while building: current -> after the build (green up, red down); neighbour bonus as hex chip
    const nbChip = bonus > 0 ? `<em class="nb${bonusUp && !ghost ? ' chg' : ''}"><svg viewBox="0 0 24 20"><path d="M6 1.5l5 2.9v5.8L6 13.1 1 10.2V4.4z M18 6.9l5 2.9v5.8l-5 2.9-5-2.9V9.8z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>+${Math.round(bonus * 100)}%</em>` : '';
    rate.classList.toggle('up', changes && nxt > now); rate.classList.toggle('down', changes && nxt < now);
    rate.innerHTML = `${fruitIcon(ftype)}<span>${ghost ? '' : changes ? num(now) + '<b>→</b>' : ''}${num(ghost || changes ? nxt : now)}/s</span>${nbChip}`;
    // step bar: one segment per field still needed for the next rarity, filled in the next rarity's colour
    bar.hidden = !same || maxed;
    if (same && !maxed) {
      let b = '';
      for (let k = 0; k < n; k++) b += `<i class="${k < prog ? 'on' : ''}${hov && k === prog ? ' nx' : ''}"></i>`;
      bar.innerHTML = b + `<b></b>`; bar.style.setProperty('--c', hex(RARITY_COL[r + 1])); bar.style.setProperty('--c0', hex(RARITY_COL[r]));
    }
  }

  private rakeW = 0;
  setConfig(cfg: Balancing) {
    this.rakeW = cfg.rake.width;
    this.cfg = cfg;
    this.slots = slotPositions(cfg);
    setGardenSlots((x, z) => slotAt(cfg, this.slots, x, z) < 0);
    setForestClearings(this.slots.filter(sl => sl.forest && !cfg.plants.nut?.disabled).map(sl => ({ x: sl.x, z: sl.z, r: hexR(cfg) * 1.25 })));
    if (!this.slotOverlay.parent) scene.add(this.slotOverlay);
    for (const k in this.aimInd) scene.remove(this.aimInd[k]);
    this.aimInd = {
      rake: new THREE.Mesh(rectGeo(1, 1), addMat(0xffe3a0, .12)),
      cran: new THREE.Mesh(sectorGeo(1, cfg.skills.cran.cone * Math.PI / 180), addMat(0xff8090, .12)),
      asp: new THREE.Mesh(GEO.plane, addMat(0x9cff70, .2)),
      cab: new THREE.Mesh(GEO.circle, addMat(0xb8f070, .14)),
      chili: new THREE.Mesh(sectorGeo(1, 1), addMat(0xff7a30, .12)),
    };
    for (const k of ['asp', 'cab']) this.aimInd[k].rotation.x = -Math.PI / 2;
    for (const k in this.aimInd) { const m = this.aimInd[k]; (m.material as THREE.Material).side = THREE.DoubleSide; m.position.y = .045; m.visible = false; scene.add(m); }
    this.aggro.scale.setScalar(cfg.enemies.aggroRadius);
  }
  reset() {
    for (const c of [...this.dyn.children]) this.dyn.remove(c);
    for (const c of [...barGroup.children]) barGroup.remove(c);
    for (const n of this.nums) n.el.remove(); this.nums.length = 0;
    [this.players, this.enemies, this.fruits, this.projs, this.bombs, this.mines, this.fields, this.pools, this.bbombs, this.snodes].forEach(m => m.clear()); clearComboFx();
    this.setPlacing(null);
    this.vanishing.length = 0; this.confirmSlot = -1;
    stopAllLoops(); this.heat.clear(); this.fire.clear(); PART.clear(); clearFx(); clearBolts(); clearEyes(); this.snap = null; this.fieldKey = ''; this.bits.length = 0;
  }

  // ---------------- state ----------------
  apply(s: Snap) {
    this.snap = s; const id = ++this.frameId;
    // players
    const seenP = new Set<number>();
    for (const ps of s.pl) {
      seenP.add(ps.id); let v = this.players.get(ps.id);
      const look = this.lookFor(ps.id, ps.c), lk = lookKey(look);
      if (v && v.lookKey !== lk) { // look changed (co-op: arrived after the figure was built) -> rebuild the figure
        this.dyn.remove(v.g); disposeFarmer(v.rig); if (v.label) this.dyn.remove(v.label);
        const b = buildPlayer(look, this.cfg.rake.range, ps.ra || this.cfg.rake.width); this.dyn.add(b.g);
        Object.assign(v, b, { lookKey: lk, xbow: undefined, label: undefined, cw: undefined });
      }
      if (!v) {
        const b = buildPlayer(look, this.cfg.rake.range, ps.ra || this.cfg.rake.width); this.dyn.add(b.g);
        const ring = new THREE.Mesh(GEO.ring, addMat(PLAYER_RING[ps.c % 4], .4)); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(.5); ring.position.y = .035; this.dyn.add(ring);
        v = { ...b, ring, bar: makeBar(.7, .07, 0x6fcf4a), s: ps, x: ps.x, z: ps.z, rot: ps.f, recoil: 0, lookKey: lk, walk: 0 };
        this.players.set(ps.id, v);
      }
      if (!v.label && ps.id !== this.me && look.name) { v.label = this.nameLabel(look.name, ps.c); this.dyn.add(v.label); }
      if (!this.smooth || Math.hypot(ps.x - v.x, ps.z - v.z) > 3) { v.x = ps.x; v.z = ps.z; }
      v.s = ps;
    }
    for (const [pid, v] of this.players) if (!seenP.has(pid)) { this.dyn.remove(v.g, v.ring); if (v.label) this.dyn.remove(v.label); disposeFarmer(v.rig); if (v.flame) { this.dyn.remove(v.flame.fx.g, v.flame.gun); loopSfx('flame' + pid, 'weapons.chiliLoop', false); } barGroup.remove(v.bar); this.players.delete(pid); }
    // fields
    const slots = this.slots;
    const seenF = new Set<number>();
    for (const f of s.fi) {
      seenF.add(f[0]);
      let v = this.fields.get(f[0]);
      if (v && (v.type !== f[1] || (!v.alive && f[3]))) { this.removeField(f[0], v); v = undefined; } // overbuilt
      if (!v) v = this.makeField(f[0], FRUITS[f[1]], slots[f[0]]);
      if (v.alive && !f[3]) this.killField(v);
      v.alive = !!f[3];
      if (v.rarity !== f[5]) { v.rarity = f[5]; (v.rim.material as THREE.MeshBasicMaterial).color.set(RARITY_COL[f[5]] ?? RARITY_COL[0]); v.plant.scale.setScalar(1 + f[5] * .08); }
      v.prog = f[6]; v.rate = f[10] ?? 0; v.edge = f[7]; v.ep = f[8]; v.tilled = !!f[9];
      setBar(v.bar, f[2]); v.bar.visible = v.alive && f[2] < 1; (v.bar.userData.fg.material as THREE.MeshBasicMaterial).color.set(f[2] > .5 ? 0x6fcf4a : f[2] > .25 ? 0xe3b964 : 0xd23a2e);
      v.shake = f[4]; v.plant.scale.y = (v.alive ? 1 + v.rarity * .08 : .55) * (v.ftype === 'nut' ? 1 : 1 + f[4] * .4); // a tree only sways
    }
    for (const [slot, v] of this.fields) if (!seenF.has(slot)) { if (v.alive) this.removeField(slot, v); else this.vanishField(slot, v); }
    const fk = s.fi.map(f => f[0]).sort((a, b) => a - b).join(','); if (fk !== this.fieldKey) { this.fieldKey = fk; syncTorches([], hexR(this.cfg)); } // no torches at the beds any more
    // cabbage poison pools
    this.sync(this.pools, s.pu || [], id, p => p[0], (p) => {
      const m = new THREE.Mesh(GEO.circle, p[5] ? addMat(0xff5a10, .3) : new THREE.MeshBasicMaterial({ color: 0x3f9a22, transparent: true, opacity: .3, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.scale.setScalar(p[3]); return m;
    }, (v, p) => {
      v.tx = p[1]; v.ty = .04; v.tz = p[2];
      if (p[5]) { // Kimchi: burning pool, flickering, embers and glowing ground
        ((v.m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (.22 + .08 * Math.sin(performance.now() / 60 + p[0])) * Math.min(1, p[4] * 3);
        if (Math.random() < .6) { const a = rand(0, 7), r = Math.sqrt(Math.random()) * p[3]; PART.spawn(V(p[1] + Math.cos(a) * r, .05, p[2] + Math.sin(a) * r), V(rand(-.1, .1), rand(.6, 1.4), rand(-.1, .1)), Math.random() < .5 ? 0xff6a18 : 0xffc040, rand(.12, .26), rand(.3, .6), { a: .9, s1: .1 }); }
        if (Math.random() < .15) { const a = rand(0, 7), r = Math.sqrt(Math.random()) * p[3]; this.heat.add(p[1] + Math.cos(a) * r, p[2] + Math.sin(a) * r, .25); }
        return;
      }
      ((v.m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = .38 * Math.min(1, p[4] * 3);
      if (Math.random() < .5) { const a = rand(0, 7), r = Math.sqrt(Math.random()) * p[3]; PART.spawn(V(p[1] + Math.cos(a) * r, .05, p[2] + Math.sin(a) * r), V(0, rand(.3, .7), 0), 0x7dff4a, rand(.08, .16), rand(.4, .8), { a: .7 }); }
    });
    // enemies
    for (const e of s.en) {
      let v = this.enemies.get(e[0]);
      if (!v) {
        const type = ENEMIES[e[1]], b = buildEnemy(type); this.dyn.add(b.g);
        if (e[7] & EF.elite) { b.g.scale.setScalar(this.cfg.enemies.elite.scale); addOutline(b.P.body, ELITE_COL[type]); } // elite: bigger, outline glowing in its colour
        if (e[7] & EF.boss) { b.g.scale.setScalar(this.cfg.enemies.boss.scale); addOutline(b.P.body, 0x8a4cff, .04); } // boss: huge, violet outline
        v = { g: b.g, P: b.P, type, bar: makeBar(.6, .07, 0xd23a2e), s: e, x: e[2], z: e[3], squash: 0, carry: '' };
        v.g.position.set(e[2], 0, e[3]); v.g.rotation.y = e[4]; this.enemies.set(e[0], v);
      }
      if (!this.smooth) { v.x = e[2]; v.z = e[3]; }
      v.s = e; (v as any).f = id;
      if (v.carry !== e[8]) this.setCarry(v, e[8]);
    }
    for (const [eid, v] of this.enemies) if ((v as any).f !== id) { this.dyn.remove(v.g); if (v.ind) this.dyn.remove(v.ind); barGroup.remove(v.bar); this.enemies.delete(eid); }
    // fruit
    for (const f of s.fr) {
      let v = this.fruits.get(f[0]);
      if (!v) {
        const type = FRUITS[f[1]]; const g = fruitMesh(type, this.cfg.fruit.tierScale[f[2]] || 1); g.traverse(o => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
        this.dyn.add(g); v = { g, tier: f[2], type, x: f[3], y: f[4], z: f[5], tx: f[3], ty: f[4], tz: f[5], seen: id }; this.fruits.set(f[0], v);
      }
      v.tx = f[3]; v.ty = f[4]; v.tz = f[5]; v.seen = id; if (!this.smooth) { v.x = v.tx; v.y = v.ty; v.z = v.tz; }
    }
    for (const [fid, v] of this.fruits) if (v.seen !== id) { this.dyn.remove(v.g); this.fruits.delete(fid); }
    // boss berry bombs: big blueberry in flight / falling, glowing violet-blue circle on the ground until it explodes
    this.sync(this.bbombs, s.bb || [], id, b => b[0], (b) => {
      const g = new THREE.Group(); const berry = fruitMesh('blue', b[6] ? 3.4 : 2.4); g.add(berry);
      const ring = new THREE.Mesh(GEO.circle, new THREE.MeshBasicMaterial({ color: 0x7a5cff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(b[7]); g.add(ring); g.userData = { berry, ring }; return g;
    }, (v, b) => {
      v.tx = b[1]; v.ty = 0; v.tz = b[3]; const { berry, ring } = v.m.userData;
      berry.position.y = b[2]; ring.position.y = .06;
      const warn = b[4] || b[6] ? b[5] : 0; (ring.material as THREE.MeshBasicMaterial).opacity = warn ? .15 + .35 * warn * (.6 + .4 * Math.sin(performance.now() / 40)) : 0;
    });
    // projectiles / bombs / mines
    this.sync(this.projs, s.pj, id, p => p[0], (p) => {
      if (p[1] >= 2) return projMesh(p[1]);
      if (p[1] !== 0) return fruitMesh('cran', .9, false, true);
      const m = new THREE.Group();
      const st = part(m, GEO.cyl, PROJ_ASP, .035, .45, .035, 0, 0, 0, false); st.rotation.x = Math.PI / 2;
      const tp = part(m, GEO.cone, PROJ_ASP_TIP, .05, .14, .05, 0, 0, .28, false); tp.rotation.x = Math.PI / 2;
      return m;
    }, (v, p) => { v.tx = p[2]; v.ty = p[3]; v.tz = p[4]; v.m.rotation.y = p[5]; if (p[1] === 0 || p[1] === 4) { const w = p[6] || 1; v.m.scale.set(w, w, 1); } if (p[1] >= 2) animProj(p[1], v.m, v.x, v.y, v.z, p[5], p[6], this.dtLast); });
    this.sync(this.bombs, s.bo, id, b => b[0], (b) => b[6] ? bombMesh(b[6], b[8]) : fruitMesh('cab', b[4] ? .6 : 1, false, true), (v, b) => {
      v.tx = b[1]; v.ty = b[2]; v.tz = b[3];
      if (b[6]) { animBomb(v.m, b[6], !!b[5], b[7]); return; }
      v.m.rotation.x += .13;
      if (b[5]) v.m.scale.setScalar((b[4] ? .6 : 1) * (1 + Math.sin(performance.now() / 33) * .12));
    });
    // missed cranberries lying on the ground: swell and pulse faster until they pop
    this.sync(this.mines, s.mi, id, m => m[0], (m) => { const m2 = new THREE.Mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: m[5] ? 0xff7a20 : 0xff2040, emissive: m[5] ? 0xff4a00 : 0xff1030, emissiveIntensity: 1.6 })); return m2; },
      (v, m) => { const k = m[3] || 0, mat = (v.m as THREE.Mesh).material as THREE.MeshStandardMaterial; v.tx = m[1]; v.ty = .06 + (m[4] || 0); v.tz = m[2];
        if (m[5] && Math.random() < .2) PART.spawn(V(v.x, .12, v.z), V(rand(-.1, .1), .7, rand(-.1, .1)), 0xff8a20, .08, .3, { a: .9 }); v.m.scale.setScalar(.065 * (1 + k * .5) * (1 + Math.sin(performance.now() / (160 - k * 110) + m[0]) * (.08 + k * .14))); mat.emissiveIntensity = 1.2 + k * k * 2.6; });
    // Shockgun berries lying on the ground
    this.sync(this.snodes, s.sn || [], id, n => n[0], () => nodeMesh(), (v, n) => { v.tx = n[1]; v.ty = .08; v.tz = n[2]; animNode(v.m, n[1], n[2], n[3]); });
    for (const e of s.ev) this.event(e);
  }
  private sync<T>(map: Map<number, JView>, arr: T[], id: number, key: (t: T) => number, make: (t: T) => THREE.Object3D, upd: (v: JView, t: T) => void) {
    for (const t of arr) {
      let v = map.get(key(t));
      if (!v) { const m = make(t); this.dyn.add(m); v = { m, kind: 0, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, seen: id }; upd(v, t); v.x = v.tx; v.y = v.ty; v.z = v.tz; map.set(key(t), v); }
      upd(v, t); v.seen = id; if (!this.smooth) { v.x = v.tx; v.y = v.ty; v.z = v.tz; }
    }
    for (const [k, v] of map) if (v.seen !== id) { this.dyn.remove(v.m); map.delete(k); }
  }
  private makeField(slot: number, type: FruitType, p: { x: number; z: number }) {
    const H = hexR(this.cfg);
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); this.dyn.add(g);
    // flat bed, flush with the ground: walkable, no collider
    // soft bed: hexagon only hinted (rounded, ragged outline) and fading out into the surrounding ground
    // earth: chili = soft lava rock bed; every other bed = overlapping raked-earth decals + wet earth around the plants
    let bedMat: THREE.MeshStandardMaterial;
    if (type === 'chili') {
      const bm = lavaBedMaterial(); bm.vertexColors = true; bm.transparent = true; bm.depthWrite = false; bedMat = bm;
      const bed = new THREE.Mesh(softBedGeo(H, rand(0, 99)), bm); bed.position.y = .015; bed.renderOrder = -1; // decals sit above at .03+
      bed.receiveShadow = true; g.add(bed);
    } else {
      const spots: [number, number][] = type === 'nut' ? [[0, 0]] : [0, 1, 2, 3, 4, 5].map(k => triPlant(0, 0, H, k));
      const bed = buildBed(H, spots); g.add(bed); bedMat = (bed.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    }
    // rim kept only as data holder for the rarity colour (no visible UI line any more)
    const rim = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: RARITY_COL[0] })); rim.visible = false;
    const mats = { leaf: M(type === 'blue' ? 0x2f5a34 : type === 'asp' ? 0x6aa83c : type === 'cran' ? 0x335a2a : type === 'lemon' ? 0x3d6a2a : type === 'chili' ? 0x2c6328 : type === 'nut' ? 0x3f6a2c : 0x4f8a35), head: M(type === 'lemon' ? 0x5a4026 : type === 'chili' ? 0x3f7a2a : type === 'nut' ? 0x4a3220 : 0x9ad870) };
    const plant = new THREE.Group(); g.add(plant); const fruits: THREE.Mesh[] = [];
    if (type === 'nut') { // one broadleaf tree from the nature pack in the middle (loaded async), nuts hanging in its crown
      const tree = new THREE.Group(); tree.rotation.y = rand(0, 7); plant.add(tree);
      const ch = this.cfg.enemies.squirrel?.crownHeight ?? 2.4;
      for (let i = 0; i < 16; i++) { const a = rand(0, 7), y = ch + rand(-.45, .45), r = rand(.75, 1.05) - Math.abs(y - ch) * .3; fruits.push(part(tree, GEO.sph, BUSH_MAT.nut, .06, .055, .06, Math.cos(a) * r, y, Math.sin(a) * r, false)); }
      const name = Math.random() < .5 ? 'CommonTree_1' : 'CommonTree_5';
      loadNature().then(() => { const m = natureMesh(name, NUT_TREE_SCALE * (ch / 2.4), new THREE.Color().setHSL(rand(.25, .32), .5, .3)); if (m) tree.add(m); }).catch(() => {});
    }
    else for (let k = 0; k < 6; k++) { // one low plant per triangle of the hex (the rake works per triangle)
      const b = buildPlant(type, mats), [px, pz] = triPlant(0, 0, H, k);
      b.g.position.set(px, 0, pz); b.g.scale.set(.56, .5, .56); b.g.userData.sy = .5; b.g.rotation.y = rand(0, 7);
      plant.add(b.g); fruits.push(...b.fruits);
    }
    // own fruit material per plant, so the berries of a raked plant can light up on their own
    const bmats = plant.children.map(c => {
      const m = BUSH_MAT[type].clone(); if (type !== 'lemon') m.emissive.set(FRUIT_HEX[type]); m.emissiveIntensity = 0;
      c.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh && me.material === BUSH_MAT[type]) me.material = m; });
      return m;
    });
    const pulse: THREE.Sprite[] = [];
    // (no wandering markers on the field edge any more: they only irritated, 17.11.2026)
    let lava: THREE.Mesh | undefined;
    if (type === 'chili') { // the bed glows like lava at every harvest, as if it was breathing
      lava = new THREE.Mesh(softBedGeo(H * .92, rand(0, 99)), new THREE.MeshBasicMaterial({ map: lavaTex, vertexColors: true, color: 0xff5a10, transparent: true, opacity: .05, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      lava.position.y = .03; lava.rotation.y = rand(0, 7); lava.renderOrder = 2; g.add(lava);
    }
    const v: FieldView = { bedMat, g, plant, fruits, mats, rim, bar: makeBar(1.1, .09, 0x6fcf4a), alive: true, type: FRUITS.indexOf(type), rarity: 0, prog: 0, pulse, edge: 0, ep: 0, pos: -1, tilled: false, x: p.x, z: p.z, shake: 0, glow: 0, hit: 0, comb: 0, combs: [0, 0, 0, 0, 0, 0], bmats, bglow: [0, 0, 0, 0, 0, 0], ftype: type, lava, lavaT: 9, lv: 0, rate: 0 };
    v.bar.position.set(p.x, 1.1, p.z);
    this.fields.set(slot, v);
    burst(V(p.x, .4, p.z), 0x8fe36a, 30, 2.5, .2, .8);
    return v;
  }
  /** rim = loading bar: an energy pulse runs clockwise, one edge per harvest; tilled fields glow and wiggle */
  private animField(v: FieldView, dt: number) {
    const H = hexR(this.cfg) * .935, now = performance.now() / 1000;
    const target = v.edge + v.ep; // 0..6 around the rim
    if (v.pos < 0 || !this.smooth) v.pos = target;
    else { let d = target - v.pos; if (d < -3) d += 6; if (d > 3) d -= 6; v.pos += d * Math.min(1, dt * 10); if (v.pos >= 6) v.pos -= 6; if (v.pos < 0) v.pos += 6; }
    v.glow = lerp(v.glow, v.tilled ? 1 : 0, Math.min(1, dt * 6));
    const at = (pp: number) => { pp = ((pp % 6) + 6) % 6; const k = Math.floor(pp), t = pp - k; const a0 = cornerAngle(k), a1 = cornerAngle(k + 1);
      return [v.x + lerp(Math.cos(a0), Math.cos(a1), t) * H, v.z + lerp(Math.sin(a0), Math.sin(a1), t) * H]; };
    v.pulse.forEach((s, i) => {
      s.visible = v.alive; if (!v.alive) return;
      const [x, z] = at(v.pos - i * .05); s.position.set(x, .12, z);
      const head = 1 - i / v.pulse.length, sz = .3 * head;
      s.scale.set(sz, sz, 1); (s.material as THREE.SpriteMaterial).opacity = .35 * head;
    });
    // raked plants: their fruit lights up with the strength of the stroke there, then fades
    const oneB = v.bmats.length === 1, base = v.ftype === 'lemon' ? BUSH_MAT.lemon.emissiveIntensity : 0;
    for (let k = 0; k < 6; k++) v.bglow[k] = Math.max(0, v.bglow[k] - dt * 1.6);
    v.bmats.forEach((m, i) => { const gl = oneB ? Math.max(...v.bglow) : v.bglow[i]; m.emissiveIntensity = base + gl * gl * .55; });
    if (v.lava) { // lava breath: swells up quickly after a harvest, then sinks back slowly
      v.lavaT += dt; const t = v.lavaT, want = !v.alive ? 0 : t < .25 ? Math.sin(t / .25 * Math.PI / 2) : Math.exp(-(t - .25) * 2.2);
      v.lv = lerp(v.lv, want, Math.min(1, dt * 5));
      const m = v.lava.material as THREE.MeshBasicMaterial; m.opacity = v.alive ? .05 + v.lv * .5 : 0;
      m.color.setRGB(1, .16 + v.lv * .22, .02);
      v.bedMat.emissiveIntensity = v.alive ? .15 + v.lv * 2.2 : 0;
      if (v.alive && Math.random() < dt * v.lv * 10) { const a = rand(0, 7), r = Math.sqrt(Math.random()) * hexR(this.cfg) * .8; PART.spawn(V(v.x + Math.cos(a) * r, .05, v.z + Math.sin(a) * r), V(rand(-.1, .1), rand(.4, .9), rand(-.1, .1)), Math.random() < .5 ? 0xff6a10 : 0xffb030, rand(.05, .1), rand(.6, 1.1)); }
    }
    // shake on hits/harvest, gentle wiggle while tilled
    v.plant.rotation.z = Math.sin(now * 50) * v.shake * .25 + Math.sin(now * 11) * .06 * v.glow;
    v.plant.rotation.x = Math.sin(now * 9 + 1) * .04 * v.glow;
    // combed through: every clump is yanked and rattles out with a decaying wobble
    v.comb = Math.max(0, v.comb - dt * 2.2);
    for (let k = 0; k < 6; k++) v.combs[k] = Math.max(0, v.combs[k] - dt * 2.2);
    const one = v.plant.children.length === 1; // nut tree: one tree for all 6 triangles
    v.plant.children.forEach((c, i) => {
      const cv = Math.max(v.comb, one ? Math.max(...v.combs) : v.combs[i] || 0), cb = cv * cv;
      c.rotation.x = Math.sin(now * 31 + i * 2.1) * .28 * cb;
      c.rotation.z = Math.cos(now * 27 + i * 1.3) * .28 * cb;
      c.scale.y = (c.userData.sy ?? 1) * (1 - (one ? .05 : .18) * cb + Math.sin(now * 38 + i) * .08 * cb);
    });
  }
  /** feedback for one rake stroke on a field: flash, comb the plants, shake off fruit, whirl leaves, rustle */
  private rakeStroke(slot: number, a: number, mask: number, w?: number[]) {
    const v = this.fields.get(slot); if (!v || !v.alive) return;
    const hitK: number[] = []; for (let k = 0; k < 6; k++) if (mask & (1 << k)) { v.combs[k] = 1; hitK.push(k); v.bglow[k] = Math.max(v.bglow[k], .35 + .65 * (w?.[k] ?? a)); }
    if (!hitK.length) return;
    play('rustle');
    const lm = leafMat(v.mats.leaf.color), clumps = v.plant.children;
    // (the real harvest shaken loose by the stroke falls out of the raked plants as normal fruit, see sim produce)
    // leaves whirl up out of the raked plants only and flutter down
    const n = Math.max(2, Math.round(hitK.length * rand(2, 3)));
    for (let i = 0; i < n; i++) {
      const k = hitK[i % hitK.length], c = clumps.length === 1 ? clumps[0] : clumps[k], p = c ? c.getWorldPosition(V()) : V(v.x, 0, v.z);
      const m = new THREE.Mesh(LEAF_GEO, lm); m.position.set(p.x + rand(-.25, .25), rand(.3, .6), p.z + rand(-.25, .25)); m.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7)); this.dyn.add(m);
      const a = rand(0, 7), sp = rand(.6, 1.6);
      this.bits.push({ m, vx: Math.cos(a) * sp, vy: rand(1.6, 3), vz: Math.sin(a) * sp, t: 0, life: rand(1, 1.6), leaf: true, spin: rand(6, 14) * (Math.random() < .5 ? -1 : 1), s0: rand(.8, 1.4), landed: false });
    }
  }
  private updateBits(dt: number) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i], m = b.m; b.t += dt; const k = b.t / b.life;
      if (k >= 1) { this.dyn.remove(m); this.bits.splice(i, 1); continue; }
      if (b.leaf) { // flutter: strong drag, slow fall, swirl sideways
        b.vy -= 4.5 * dt; const drag = Math.exp(-dt * 3); b.vx *= drag; b.vz *= drag; b.vy = Math.max(b.vy * drag, -.7);
        m.position.x += (b.vx + Math.sin(b.t * 9 + i) * .5) * dt; m.position.z += (b.vz + Math.cos(b.t * 8 + i) * .5) * dt; m.position.y += b.vy * dt;
        if (m.position.y < .04) { m.position.y = .04; b.vy = 0; b.vx *= .5; b.vz *= .5; } else { m.rotation.x += b.spin * dt; m.rotation.y += b.spin * .6 * dt; }
      } else if (!b.landed) {
        b.vy -= 9.8 * dt; m.position.x += b.vx * dt; m.position.y += b.vy * dt; m.position.z += b.vz * dt; m.rotation.z += b.spin * dt;
        if (m.position.y < .06) { m.position.y = .06; if (b.vy < -1.2) { b.vy *= -.35; b.vx *= .5; b.vz *= .5; } else b.landed = true; }
      }
      m.scale.setScalar(b.s0 * (k < .7 ? 1 : 1 - (k - .7) / .3));
    }
  }
  /** dead plant sinks into the ground and crumbles to dust, then the slot is empty */
  private vanishing: { g: THREE.Group; pl: THREE.Group; t: number }[] = [];
  private vanishField(slot: number, v: FieldView) {
    this.dyn.remove(...v.pulse); barGroup.remove(v.bar); this.fields.delete(slot);
    burst(V(v.x, .3, v.z), 0x6a5236, 26, 1.6, .22, .9, { g: 3 });
    this.vanishing.push({ g: v.g, pl: v.plant, t: 0 });
  }
  private animVanish(dt: number) {
    for (let i = this.vanishing.length - 1; i >= 0; i--) {
      const q = this.vanishing[i]; q.t += dt; const k = Math.min(1, q.t / .6);
      q.pl.scale.set(1 - k * .6, Math.max(.01, (1 - k) * .55), 1 - k * .6); q.pl.position.y = -k * .15;
      if (k >= 1) { this.dyn.remove(q.g); this.vanishing.splice(i, 1); }
    }
  }
  private removeField(slot: number, v: FieldView) { this.dyn.remove(v.g, ...v.pulse); barGroup.remove(v.bar); this.fields.delete(slot); }
  private killField(v: FieldView) {
    v.mats.leaf.color.set(0x4a3a24); v.mats.head.color.set(0x5a4a2a); v.plant.scale.set(1, .55, 1);
    v.fruits.forEach(f => f.visible = false);
  }
  private setCarry(v: EView, carry: string) {
    v.carry = carry; const c = v.P.carry; for (const ch of [...c.children]) c.remove(ch);
    for (let i = 0; i < carry.length; i++) { const m = fruitMesh(FRUITS[+carry[i]], .8); m.position.set(rand(-.12, .12), .62 + i * .08, rand(-.2, 0)); c.add(m); }
  }

  // ---------------- events ----------------
  private comboCtx = {
    shake: (n: number) => { this.shake = Math.min(.45, this.shake + n); },
    recoil: (pid: number) => { const pv = this.players.get(pid); if (pv) { pv.recoil = .12; pv.cwT = 0; } },
    heat: (x: number, z: number, v: number) => this.heat.add(x, z, v),
  };
  private event(e: Ev) {
    if (comboEvent(e, this.comboCtx)) return;
    switch (e.k) {
      case 'snd': play(e.n); break;
      case 'sfx': sfx(e.s, e.x, e.z); break;
      case 'deathGift': burst(V(e.x, .6, e.z), 0x7a90ff, 36, 2.4, .14, .9, { g: 2 }); decal(e.x, e.z, 0x8fa4ff, hexR(this.cfg) * .3, .5, { ring: true, add: true, grow: hexR(this.cfg), op: .7 }); break;
      case 'burst': burst(V(e.x, e.y, e.z), e.c, e.n, e.sp, e.sz, e.lf, { g: e.g, a: e.a }); break;
      case 'num': this.floatNum(e.x, e.z, String(Number.isInteger(e.v) ? e.v : e.v.toLocaleString('de-DE', { maximumFractionDigits: 1 })), NUM_COL[e.c] || '#fff', !!e.b); break;
      case 'punch': {
        punchStar(e.x, e.z);
        const v = this.enemies.get(e.e); if (v) v.squash = .14;
        break;
      }
      case 'punches': play('punches', e.n); this.shake = Math.min(.22, this.shake + .05 + e.n * .03); break;
      case 'impact': punchStar(e.x, e.z, .45); break;
      case 'swipe': {
        rakeSweep(e.x, e.z, e.a, e.r || this.cfg.rake.range, e.w || this.cfg.rake.width);
        break;
      }
      case 'shot': {
        const col = e.w === 'asp' ? 0xb8ff70 : e.w === 'cran' ? 0xff4060 : e.w === 'chili' ? 0xff7a20 : 0xc8ff90;
        burst(V(e.x, .75, e.z), col, 10, 2.2, .2, .22); PART.spawn(V(e.x, .75, e.z), V(0, 0, 0), col, .9, .12);
        const pv = this.players.get(e.p); if (pv) pv.recoil = .12;
        break;
      }
      case 'boom': {
        const r = e.r, mini = !!e.m;
        decal(e.x, e.z, 0x9cff60, .2, .45, { ring: true, add: true, grow: r, op: .8 });
        decal(e.x, e.z, 0x2a3a18, r * .7, 4, { op: .5 });
        for (let i = 0; i < (mini ? 14 : 34); i++) { const a = rand(0, 7), sp = rand(.4, 1.6) * r * 1.3; PART.spawn(V(e.x, rand(.1, .5), e.z), V(Math.cos(a) * sp, rand(.2, 1), Math.sin(a) * sp), i % 3 ? 0x5fb030 : 0xb8f070, rand(.35, .7) * (mini ? .6 : 1), rand(.8, 1.4), { drag: 2.5, a: .35, s1: .9 }); }
        burst(V(e.x, .3, e.z), 0xd8ff90, 12, 3, .12, .4);
        this.shake = Math.min(.25, this.shake + (mini ? .03 : .08));
        break;
      }
      case 'decal': decal(e.x, e.z, e.c, e.r, e.l, { op: e.op, ring: !!e.ring, add: !!e.add, grow: e.grow }); break;
      case 'splat': {
        decal(e.x, e.z, 0x8a0a1a, rand(.1, .2), 5, { op: .8 });
        for (let k = 0; k < 4; k++) decal(e.x + rand(-.15, .15), e.z + rand(-.15, .15), 0xa01020, rand(.03, .06), 5, { op: .8 });
        break;
      }
      case 'berryPop': { // lying cranberry pops into a red stain
        burst(V(e.x, .15, e.z), 0xff2040, 12, 1.8, .12, .35, { g: 5 });
        decal(e.x, e.z, 0xff3050, .05, .25, { ring: true, add: true, grow: e.r, op: .7 });
        decal(e.x, e.z, 0x8a0a1a, e.r * rand(.55, .7), 3.5, { op: .6 });
        for (let k = 0; k < 4; k++) decal(e.x + rand(-1, 1) * e.r * .8, e.z + rand(-1, 1) * e.r * .8, 0xa01020, rand(.04, .08), 3.5, { op: .7 });
        break;
      }
      case 'bleed': PART.spawn(V(e.x, .4, e.z), V(rand(-.3, .3), 1, rand(-.3, .3)), 0xff2030, .12, .5, { g: 5 }); break;
      case 'poof': dustCloud(e.x, e.z); this.shake = Math.min(.25, this.shake + .07); break; // sheep ram hit: comic dust cloud around the player
      case 'lick': setTimeout(() => { burst(V(e.x, .3, e.z), 0xff5a80, 8, 1.4, .1, .3); decal(e.x, e.z, 0xff4070, .12, .6, { op: .5 }); }, (e.d || 0) * 1000); break;
      case 'dust': PART.spawn(V(e.x, .1, e.z), V(rand(-.5, .5), .6, rand(-.5, .5)), 0x8a7050, .3, .5, { a: .45 }); break;
      case 'imm': play('imm'); break;
      case 'berryBoom': { burst(V(e.x, .3, e.z), 0x6a5cff, 26, 3, .2, .5); burst(V(e.x, .3, e.z), 0x3550e0, 14, 2, .3, .6, { g: 4 }); decal(e.x, e.z, 0x7a5cff, .2, .45, { ring: true, add: true, grow: e.r, op: .9 }); decal(e.x, e.z, 0x221a50, e.r * .6, 3, { op: .5 }); this.shake = Math.min(.25, this.shake + .04); break; }
      case 'bossEat': burst(V(e.x, .5, e.z), 0x5a74ff, 6, 1.5, .12, .3); break;
      case 'bossDead': burst(V(e.x, .8, e.z), 0x8a4cff, 80, 5, .3, 1.2); burst(V(e.x, .8, e.z), 0xffe0b0, 40, 4, .2, .8); this.shake = .35; break;
      case 'zap': { // Citrateaser: fine, realistic lightning out of the lemon on the wand; more targets = more forks
        const sgs = e.s as number[][], pv = this.players.get(e.p);
        let tip: THREE.Vector3 | null = null;
        if (pv && e.a !== undefined) { pv.rot = e.a; pv.g.rotation.y = e.a; pv.wand.visible = true; pv.g.updateMatrixWorld(true); tip = pv.wandTip.getWorldPosition(V()); pv.lemonMat.emissiveIntensity = .55; }
        const miss = sgs.length === 1 && sgs[0][4] === 2, hits = sgs.length;
        const list: [THREE.Vector3, THREE.Vector3, number][] = sgs.map(sg => {
          const d = miss ? 0 : sg[4], from = d === 0 && tip ? tip.clone() : V(sg[0], .5, sg[1]);
          return [from, V(sg[2], miss ? .2 : .42, sg[3]), d];
        });
        lightning(list, { fork: miss ? 1 : hits, width: miss ? .014 : .022 });
        if (!miss) for (const sg of sgs) { burst(V(sg[2], .42, sg[3]), 0xc8d8ff, 5, 1.6, .06, .18); decal(sg[2], sg[3], 0x9fb8ff, .12, .25, { ring: true, add: true, grow: .45, op: .3 }); }
        this.shake = Math.min(.2, this.shake + .02); break;
      }
      case 'till': this.rakeStroke(e.s, e.a ?? 1, e.m ?? 63, e.w); break;
      case 'rustleTree': { // squirrel appears in the crown of a nut tree: leaves fall, the crown shakes
        for (const v of this.fields.values()) if (Math.hypot(v.x - e.x, v.z - e.z) < .5) { v.comb = Math.max(v.comb, .6); v.shake = Math.max(v.shake, .3); }
        for (let i = 0; i < 10; i++) { const a = rand(0, 7), r = rand(.3, 1.1); PART.spawn(V(e.x + Math.cos(a) * r, rand(2, 2.8), e.z + Math.sin(a) * r), V(rand(-.4, .4), rand(-.2, .3), rand(-.4, .4)), Math.random() < .5 ? 0x5a8a3a : 0x8aa840, rand(.06, .1), rand(.8, 1.4), { g: 1.5 }); }
        break;
      }
      case 'lemonZap': { // harvest: lightning jumps between the lemons of the tree
        const v = this.fields.get(e.s); if (!v) break;
        const ps = v.fruits.filter(m => m.visible).sort(() => Math.random() - .5).slice(0, 4).map(m => m.getWorldPosition(V()));
        if (ps.length > 1) lightning(ps.slice(1).map((q, i) => [ps[i], q, 1] as [THREE.Vector3, THREE.Vector3, number]), { fork: 1, width: .008, life: .22 });
        BUSH_MAT.lemon.emissiveIntensity = 2.6; break;
      }
      case 'wildfire': { // a burning enemy died: fire jumps to the enemies around it
        decal(e.x, e.z, 0xff6a10, .2, .5, { ring: true, add: true, grow: e.r, op: e.a ? .9 : .4 });
        for (let i = 0; i < (e.a ? 26 : 10); i++) { const b = rand(0, 7), sp = rand(1, 3) * e.r; PART.spawn(V(e.x, rand(.2, .5), e.z), V(Math.cos(b) * sp, rand(.5, 1.4), Math.sin(b) * sp), i % 3 ? 0xff7a18 : 0xffc040, rand(.15, .3), rand(.35, .6), { drag: 2.5, a: .8, s1: .05 }); }
        break;
      }
      case 'chiliGlow': { const v = this.fields.get(e.s); if (v) v.lavaT = 0; break; }
      case 'rarity': { const sl = this.slots[e.s]; if (sl) { burst(V(sl.x, .3, sl.z), RARITY_COL[e.r] ?? 0xffffff, 60, 3.5, .25, 1.1); decal(sl.x, sl.z, RARITY_COL[e.r] ?? 0xffffff, .3, .7, { ring: true, add: true, grow: hexR(this.cfg) * 1.2, op: .9 }); } break; }
      case 'merge': burst(V(e.x, .3, e.z), FRUIT_HEX[FRUITS[e.t]], 18, 2, .18, .6); sfx('collect.merge', e.x, e.z); break;
      case 'collect': {
        burst(V(e.x, .9, e.z), FRUIT_HEX[FRUITS[e.t]], 6 + e.tier * 6, 1.8, .12, .35);
        if (e.p === this.me) sfx(e.tier > 0 ? 'collect.big' : e.t === 0 ? 'collect.xp' : 'collect.ammo');
        break;
      }
      case 'hurt': if (e.p === this.me) { sfx('player.hurt'); this.hurtT = .35; this.shake = Math.min(.2, this.shake + .06); } break;
      case 'warn': warnEyes(e.d, e.ty, e.w); play('warn'); break;
      case 'cycle': if (e.p === this.me) sfx('ui.weaponCycle'); break;
      case 'over': sfx('ui.gameOver'); break;
    }
    this.onEvent(e);
  }
  floatNum(x: number, z: number, txt: string, color = '#fff', big = false) {
    if (this.nums.length > 40) { const o = this.nums.shift()!; o.el.remove(); }
    const el = document.createElement('b'); el.textContent = txt; el.style.color = color; if (big) el.style.fontSize = '19px';
    this.dmgLayer.appendChild(el); this.nums.push({ el, p: V(x + rand(-.15, .15), 1.1, z), t: 0 });
  }

  // ---------------- per frame ----------------
  frame(dt: number) {
    windU.value += dt;
    this.heat.update(dt, performance.now() / 1000); this.fire.setScale(pxScale); this.fire.update(dt);
    const s = this.snap, k = this.smooth ? 1 - Math.exp(-dt * 16) : 1, now = performance.now() / 1000;
    if (s) {
      for (const v of this.players.values()) this.animPlayer(v, dt, k);
      for (const v of this.enemies.values()) this.animEnemy(v, dt, k, now);
      for (const v of this.fruits.values()) {
        v.x = lerp(v.x, v.tx, k); v.y = lerp(v.y, v.ty, k); v.z = lerp(v.z, v.tz, k); v.g.position.set(v.x, v.y, v.z);
        if (v.tier > 0) { v.g.rotation.y += dt; if (Math.random() < dt * v.tier * 2) PART.spawn(V(v.x + rand(-.15, .15), v.y + .1, v.z + rand(-.15, .15)), V(0, .6, 0), FRUIT_HEX[v.type], .1, .8); }
        else v.g.rotation.y += dt * (v.ty > .25 ? 5 : 0);
      }
      for (const v of this.projs.values()) {
        v.x = lerp(v.x, v.tx, k); v.y = lerp(v.y, v.ty, k); v.z = lerp(v.z, v.tz, k); v.m.position.set(v.x, v.y, v.z);
        if (Math.random() < .7) PART.spawn(v.m.position, V(0, .15, 0), v.m.children.length > 1 ? 0x9cff60 : 0xff3050, .14, .22);
      }
      for (const map of [this.bombs, this.mines, this.pools, this.bbombs]) for (const v of map.values()) { v.x = lerp(v.x, v.tx, k); v.y = lerp(v.y, v.ty, k); v.z = lerp(v.z, v.tz, k); v.m.position.set(v.x, v.y, v.z); }
      for (const [, f] of this.fields) { f.bar.quaternion.copy(camera.quaternion); this.animField(f, dt); }
    }
    this.animVanish(dt);
    this.updateOverlay();
    this.updateAim();
    updateDayNight(dt, s ? s.dh ?? 0 : 0, s?.dc || 24, this.cfg.dayNight?.dayWaves ?? 16);
    updateEyes(dt); updateFog(dt); updateTorches(dt);
    this.berryGlow(dt);
    BUSH_MAT.lemon.emissiveIntensity = Math.max(0, BUSH_MAT.lemon.emissiveIntensity - dt * 5); // lemon flash after a harvest bolt
    const night = 1 - dayNow().day;
    if (Math.random() < dt * 5 * night) { const a = rand(0, 7), r = rand(2, 13); PART.spawn(V(Math.cos(a) * r, rand(.3, 1.6), Math.sin(a) * r), V(rand(-.2, .2), rand(-.05, .15), rand(-.2, .2)), Math.random() < .5 ? 0xd8ff70 : 0xffd070, .07, rand(3, 6), { a: .8 }); } // fireflies
    else if (Math.random() < dt * 2.5 * (1 - night)) { const a = rand(0, 7), r = rand(2, 15); PART.spawn(V(Math.cos(a) * r, rand(.4, 2), Math.sin(a) * r), V(rand(.15, .4), rand(-.03, .08), rand(-.1, .1)), 0xfff4d0, .05, rand(4, 7), { a: .35 }); } // pollen drifting in the sun
    this.dtLast = dt; updateComboFx(dt); PART.update(dt); updateFx(dt); updateBolts(dt); this.updateBits(dt); this.updateNums(dt);
    this.updateCamera(dt);
    const meV = this.players.get(this.me);
    this.hurtT = Math.max(0, this.hurtT - dt);
    gradePass.uniforms.uHurt.value = meV ? this.hurtT * .7 + (meV.s.al ? 0 : .3) : 0;
    gradePass.uniforms.uLow.value = meV ? this.lowHp : 0;
    (document.getElementById('hurt') as HTMLElement).style.opacity = (this.hurtT * 1.2).toFixed(2);
    composer.render();
  }
  private animPlayer(v: PView, dt: number, k: number) {
    const s = v.s, ox = v.x, oz = v.z;
    v.x = lerp(v.x, s.x, k); v.z = lerp(v.z, s.z, k);
    const spd = dt > 0 ? Math.hypot(v.x - ox, v.z - oz) / dt : 0;
    v.walk = lerp(v.walk, s.al ? clamp(spd / 2.2, 0, 1) : 0, 1 - Math.exp(-dt * 10));
    v.g.position.set(v.x, 0, v.z); v.g.visible = !!s.al; v.ring.visible = !!s.al; v.ring.position.set(v.x, .035, v.z);
    const swinging = s.sw > 0;
    v.rot = lerpAngle(v.rot, swinging ? s.sd : s.f, swinging ? .55 : .25); // a running stroke turns with the player at once
    v.g.rotation.y = v.rot;
    v.body.position.y = s.al ? Math.abs(Math.sin(s.wk)) * .05 : 0;
    const stepN = Math.floor(s.wk / Math.PI); if (stepN !== v.stepN) { if (v.stepN !== undefined && s.al) sfx('player.step', v.x, v.z, s.id === this.me ? 1 : .6); v.stepN = stepN; }
    v.recoil = Math.max(0, v.recoil - dt); v.body.position.z = -v.recoil * .6;
    // rake model: handle from the hands (pivot .62 m up) to the head; head distance d and height y set length + tilt
    const R = this.cfg.rake, reach = s.rr || R.range, L0 = R.range - .12, HY = .62;
    const rw = s.ra || R.width; // width upgrade: rebuild the head with more tines (nothing stretched)
    if (v.head.userData.w !== rw) { const h = rakeHead(rw); h.position.copy(v.head.position); v.rake.remove(v.head); v.rake.add(h); v.head = h; }
    v.rake.position.z = 0;
    const aimRake = (d: number, y: number) => { v.rake.scale.z = Math.hypot(HY - y, d) / L0; v.rake.rotation.x = Math.atan2(HY - y, d); };
    if (swinging) { // one stroke, always the same: pull from the front to the left back in one swing, then shove forward
      const RC = this.cfg.rake, P = RC.pullTime / (RC.pullTime + RC.pushTime), k = s.sw, BACK = 1.75, NEAR = .5;
      let yaw: number, d: number, y: number, lean: number;
      if (k < P) { // pull: head drags over the ground, sweeps round to the left back and lifts off at the end (swing)
        const t = k / P, e = t * t * (3 - 2 * t);
        yaw = BACK * e; d = lerp(reach, NEAR, e); y = .02 + .3 * Math.pow(t, 4); lean = .2 * (1 - e);
      } else { // push: swings round to the front and shoots forward, accelerating, slams down at the impact
        const t = (k - P) / (1 - P), e = t * t, r = 1 - Math.pow(1 - Math.min(1, t * 1.5), 2);
        yaw = BACK * (1 - r); d = lerp(NEAR, reach, e); y = .32 * (1 - e) + .02; lean = .28 * e;
      }
      v.rake.rotation.y = yaw; aimRake(d, y); v.body.rotation.x = lean; v.twist = yaw * .3;
    } else {
      v.rake.rotation.y = lerp(v.rake.rotation.y, -.55, .2); v.body.rotation.x = lerp(v.body.rotation.x, 0, .2); v.twist = lerp(v.twist || 0, 0, .2);
      const L = reach - .12; v.rake.scale.z = lerp(v.rake.scale.z, L / L0, .2); v.rake.rotation.x = lerp(v.rake.rotation.x, Math.atan2(.5, L), .2);
    }
    v.head.scale.z = 1 / Math.max(.05, v.rake.scale.z); // the handle stretches with the reach, the head keeps its shape
    v.wand.visible = !!s.lw && !!s.al; v.lemonMat.emissiveIntensity = Math.max(0, v.lemonMat.emissiveIntensity - dt * 3);
    v.stars.visible = !!s.st; v.stars.rotation.y += dt * 6;
    this.lowHpWarn(v, s.hp / s.mhp);
    this.animFlame(v, dt);
    this.animXbow(v);
    this.animCombo(v, dt);
    // the rake goes away while another weapon is in the hand (wand, crossbow, flamethrower)
    v.rake.visible = !!s.rh && (s.sw > 0 || !(v.wand.visible || v.xbow?.g.visible || v.flame?.gun.visible || v.cw?.g.visible));
    this.poseFarmer(v, dt);
    const other = s.id !== this.me;
    if (v.label) { v.label.visible = other && !!s.al; v.label.position.set(v.x, 1.86, v.z); }
    v.bar.visible = other && !!s.al; v.bar.position.set(v.x, 1.6, v.z); v.bar.quaternion.copy(camera.quaternion); setBar(v.bar, s.hp / s.mhp);
  }
  /** legs walk with the walk phase; hands grip whatever is in use (rake handle, wand, crossbow, flamethrower) via IK */
  private poseFarmer(v: PView, dt: number) {
    if (!v.g.visible) return;
    const R = v.rig, s = v.s;
    animateLegs(R, dt, s.wk, v.walk);
    R.torso.rotation.y += v.twist || 0; // rake stroke: upper body turns with the swing
    v.g.updateMatrixWorld(true);
    let t0: THREE.Vector3 | null = null, t1: THREE.Vector3 | null = null; // t0: hand on the +x side, t1: -x side
    const F = v.flame;
    if (v.cw && v.cw.g.visible) { v.cw.anim.updateMatrixWorld(true); t0 = v.cw.anim.localToWorld(v.cw.t0.clone()); t1 = v.cw.anim.localToWorld(v.cw.t1.clone()); }
    else if (F && F.gun.visible) { F.gun.updateMatrixWorld(true); t0 = F.gun.localToWorld(V(.02, -.035, -.1)); t1 = F.gun.localToWorld(V(-.02, -.04, .07)); }
    else if (v.xbow && v.xbow.g.visible) { t0 = v.xbow.g.localToWorld(V(0, -.075, -.17)); t1 = v.xbow.g.localToWorld(V(0, -.035, .1)); }
    else if (v.rake.visible) {
      const sz = Math.max(.05, v.rake.scale.z);
      t0 = v.rake.localToWorld(V(0, 0, .2 / sz)); t1 = v.rake.localToWorld(V(0, 0, .44 / sz));
    }
    if (v.wand.visible && !(F && F.gun.visible) && !(v.xbow && v.xbow.g.visible) && !(v.cw && v.cw.g.visible)) t1 = v.wandGrip.localToWorld(V(0, -.01, .0));
    animateArms(R, dt, s.wk, [t0, t1]);
  }
  /** combo weapon in the hand (rebuilt when the combo changes), recoil / slam animation */
  private animCombo(v: PView, dt: number) {
    const cid = comboOf(v.s.cw ?? -1), on = !!cid && !!v.s.al;
    v.cwT = (v.cwT ?? 9) + dt;
    if (v.cw && (!on || v.cw.cid !== cid)) { v.g.remove(v.cw.g); v.cw = undefined; }
    if (!on || !cid) return;
    if (!v.cw) { v.cw = buildHeld(cid); v.g.add(v.cw.g); }
    v.cw.g.visible = true; animHeld(v.cw, v.cwT);
  }
  /** asparagus crossbow in the hand: wooden stock, asparagus bow, string, an asparagus bolt loaded on top */
  private animXbow(v: PView) {
    const on = !!v.s.xb && !!v.s.al;
    if (!on && !v.xbow) return;
    if (!v.xbow) {
      const g = new THREE.Group(), wood = M(0x6a4528), dark = M(0x3d2a18), str = new THREE.MeshBasicMaterial({ color: 0xe8dcc0 });
      const stock = part(g, GEO.box, wood, .07, .06, .5, 0, 0, -.02, false);
      part(g, GEO.box, dark, .05, .1, .06, 0, -.07, -.18, false); // grip
      const seg = (mat: THREE.Material, r: number, a: number[], b: number[]) => { // cylinder from a to b
        const d = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = part(g, GEO.cyl, mat, r, d.length(), r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, false);
        m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m;
      };
      for (const sd of [-1, 1]) { // bow limbs: asparagus spears swept back, purple tips, string to the nut
        seg(BUSH_MAT.asp, .025, [0, 0, .24], [sd * .28, 0, .13]);
        const tip = part(g, GEO.sph, ASP_TIP_BUSH, .03, .03, .03, sd * .28, 0, .13, false); void tip;
        seg(str, .006, [sd * .28, 0, .13], [0, .02, -.02]);
      }
      const bolt = new THREE.Group(); g.add(bolt); // loaded asparagus bolt
      const sh = part(bolt, GEO.cyl, PROJ_ASP, .02, .36, .02, 0, .05, .08, false); sh.rotation.x = Math.PI / 2;
      const bt = part(bolt, GEO.cone, PROJ_ASP_TIP, .03, .08, .03, 0, .05, .29, false); bt.rotation.x = Math.PI / 2;
      void stock; v.g.add(g); g.position.set(.2, .78, .22);
      v.xbow = { g, bolt };
    }
    const X = v.xbow; X.g.visible = on; if (!on) return;
    X.bolt.visible = v.recoil < .04; // bolt gone right after the shot, reloaded before the next one
    X.g.position.z = .22 - v.recoil * .5; X.g.rotation.x = -v.recoil * 1.2;
  }
  /** flamethrower: chili-shaped nozzle at the hand, shader flame (flame.ts), embers, light; start burst / roar loop / tail sounds */
  private animFlame(v: PView, dt: number) {
    const s = v.s, playing = !!this.snap && this.snap.ph === 'play' && (this.snap.ts ?? 1) > .5;
    const on = !!s.fo && !!s.al && playing;
    if (!on && !v.flame) return;
    if (!v.flame) {
      const fx = makeFlame(); this.dyn.add(fx.g);
      const gun = new THREE.Group(); // chili-shaped flamethrower pointing along +z
      const body = part(gun, GEO.capsule, BUSH_MAT.chili, .055, .16, .055, 0, 0, 0, false); body.rotation.x = Math.PI / 2;
      const tip = part(gun, GEO.cone, BUSH_MAT.chili, .05, .14, .05, 0, .02, .18, false); tip.rotation.x = Math.PI / 2 - .3;
      const cap = part(gun, GEO.cyl, CHILI_STEM, .06, .04, .06, 0, 0, -.14, false); cap.rotation.x = Math.PI / 2;
      part(gun, GEO.cyl, CHILI_STEM, .015, .1, .015, 0, .04, -.2, false).rotation.x = 1;
      this.dyn.add(gun);
      v.flame = { fx, gun, ang: s.fa, was: false };
    }
    const F = v.flame;
    if (on !== F.was) { // ignition / tail
      F.was = on;
      sfx(on ? 'weapons.chiliStart' : 'weapons.chiliEnd', v.x, v.z, s.id === this.me ? 1 : .7);
    }
    loopSfx('flame' + s.id, 'weapons.chiliLoop', on, v.x, v.z);
    F.ang = this.smooth ? lerpAngle(F.ang, s.fa, Math.min(1, dt * 20)) : s.fa;
    const a = F.ang, dx = Math.sin(a), dz = Math.cos(a), r = s.fr || 3.5, half0 = Math.min(Math.PI, (s.fc || 30) * Math.PI / 360);
    F.gun.visible = !!s.al && (on || F.fx.power > .05);
    F.gun.position.set(v.x + dx * .32, .72, v.z + dz * .32); F.gun.rotation.set(0, a, 0);
    F.fx.g.position.set(v.x + dx * .4, 0, v.z + dz * .4); F.fx.g.rotation.y = a;
    updateFlame(F.fx, dt, s.fc || 30, r, on, performance.now() / 1000);
    if (!on) return;
    // the ground under the flame starts to glow (and cools down slowly, see GroundHeat)
    v.heatT = (v.heatT || 0) - dt;
    while (v.heatT <= 0) {
      v.heatT += .045;
      const b = a + rand(-half0, half0) * .9, d = rand(.35, 1) * r * F.fx.power;
      const hx = v.x + dx * .4 + Math.sin(b) * d, hz = v.z + dz * .4 + Math.cos(b) * d;
      if (Math.hypot(hx, hz) < (this.cfg.arena.radius + 1)) this.heat.add(hx, hz, rand(.3, .5) + d * .08);
    }
    this.fire.emit(dt, v.x + dx * .45, v.z + dz * .45, a, half0, r, F.fx.power);
    // a few embers drift out of the flame and rise
    const half = Math.min(Math.PI, (s.fc || 30) * Math.PI / 360);
    if (Math.random() < dt * 40) {
      const b = a + rand(-half, half) * .8, d = rand(.3, 1) * r;
      PART.spawn(V(v.x + Math.sin(b) * d, rand(.4, .9), v.z + Math.cos(b) * d), V(Math.sin(b) * rand(.5, 1.5), rand(.6, 1.6), Math.cos(b) * rand(.5, 1.5)), Math.random() < .5 ? 0xff8a20 : 0xffc040, rand(.04, .08), rand(.5, 1), { drag: 1, a: .9 });
    }
  }
  private animEnemy(v: EView, dt: number, k: number, now: number) {
    const e = v.s, fl = e[7];
    v.x = lerp(v.x, e[2], k); v.z = lerp(v.z, e[3], k);
    const sq = v.type === 'squirrel', hy = sq ? (this.smooth ? lerp(v.g.position.y, e[10], k) : e[10]) : 0;
    v.g.position.set(v.x, hy, v.z);
    v.g.rotation.y = lerpAngle(v.g.rotation.y, e[4], .2);
    if (sq && v.P.tail) { // hopping: body pitches up on take-off and down on landing, tail streams behind; climbing: upright on the trunk
      const climb = e[9] === 1, h = e[10] / ((this.cfg.enemies.squirrel?.hopHeight ?? .22) || .22);
      v.P.body.rotation.x = climb ? -1.3 : -.35 * h + .15;
      v.P.tail.rotation.x = climb ? .4 : -.5 * h + Math.sin(now * 6 + e[0]) * .08;
    }
    const stun = fl & EF.stun;
    v.P.stars.visible = !!stun; if (stun) { v.P.stars.rotation.y += dt * 6; v.P.body.rotation.z = Math.sin(now * 18) * .08; } else v.P.body.rotation.z = 0;
    if (v.type === 'toad') {
      const air = !!(fl & EF.air); v.P.body.position.y = air ? Math.sin(e[9] / .5 * Math.PI) * .55 : 0;
      for (const m of v.P.mats) m.opacity = air ? .4 : 1;
      if (fl & EF.tongue) { v.P.tongue!.visible = true; v.P.tongue!.scale.z = Math.max(.01, e[10]); } else v.P.tongue!.visible = false;
      if (!air && Math.random() < dt * 6) PART.spawn(V(v.x + rand(-.25, .25), rand(.15, .4), v.z + rand(-.25, .25)), V(0, .5, 0), 0xb8ffb0, rand(.06, .1), .5, { a: .8 }); // shimmer while sitting
    }
    if (v.type === 'hedgehog') { // jerky puff up, slow contraction; the spines flash once
      const H = this.cfg.enemies.hedgehog, up = (H.puffUp ?? .12) / (H.puffEvery || 2), ph = e[9];
      const k2 = ph < up ? ph / up : 1 - (ph - up) / (1 - up);
      v.P.puff!.scale.setScalar(1 + (H.puffScale ?? .3) * (ph < up ? k2 : k2 * k2));
      v.P.spines!.emissiveIntensity = ph < .15 ? (1 - ph / .15) * 1.6 : 0;
      if (v.ph !== undefined && ph < v.ph - .3) { burst(V(v.x, .35, v.z), 0xfff0c0, 10, 1.6, .07, .25); decal(v.x, v.z, 0xffe0a0, .3, .25, { ring: true, add: true, grow: (H.radius * (1 + (H.puffScale ?? .3)) + (H.puffRadius ?? .5)) * v.g.scale.x, op: .5 }); }
      v.ph = ph;
    } else if (!(fl & EF.windup)) v.P.body.position.y = Math.abs(Math.sin(now * 9 + e[0])) * .06 * (stun ? 0 : 1);
    v.P.body.position.z = fl & EF.lunge ? .12 : 0;
    if (v.type === 'sheep') {
      const wind = !!(fl & EF.windup);
      v.P.body.position.x = wind ? Math.sin(now * 40) * .03 * e[9] : 0;
      v.P.eyes!.forEach(m => (m.material as THREE.MeshBasicMaterial).color.setRGB(1, wind ? 1 - e[9] : 1, wind ? 1 - e[9] : 1));
      if (wind) {
        if (!v.ind) { v.ind = new THREE.Mesh(GEO.plane, addMat(0xff4030, 0)); v.ind.rotation.x = -Math.PI / 2; this.dyn.add(v.ind); }
        const a = e[10], dx = Math.sin(a), dz = Math.cos(a);
        v.ind.visible = true; v.ind.scale.set(.6, 7, 1); (v.ind.material as THREE.MeshBasicMaterial).opacity = .08 + e[9] * .25;
        v.ind.position.set(v.x + dx * 3.5, .05, v.z + dz * 3.5); v.ind.rotation.set(-Math.PI / 2, 0, Math.atan2(-dx, -dz));
        if (Math.random() < .3) PART.spawn(V(v.x + rand(-.2, .2), .05, v.z + rand(-.2, .2)), V(rand(-.5, .5), .8, rand(-.5, .5)), 0x8a7050, .25, .5, { a: .5 });
      } else if (v.ind) v.ind.visible = false;
      const sk = e[6]; v.P.shield!.visible = sk > 0; ((v.P.shield!.material as THREE.ShaderMaterial).uniforms.uStr.value = .1 + Math.max(0, sk) * .22); // faint shield, no bloom
    }
    // punch squash
    v.squash = Math.max(0, v.squash - dt); const q = v.squash / .14;
    v.P.body.scale.set(1 + q * .25, 1 - q * .3, 1 + q * .25);
    const bleedGlow = fl & EF.bleed ? (.5 + .5 * Math.sin(now * 12)) * .9 : 0;
    if (fl & EF.boss && e[9] === 1) { // boss charging: shakes and glows violet
      v.P.body.position.x = Math.sin(now * 45) * .04 * e[10]; for (const m of v.P.mats) m.emissive.setRGB(.25 * e[10], .1 * e[10], .5 * e[10]);
      if (Math.random() < .4) PART.spawn(V(v.x + rand(-.6, .6), rand(.3, 1.2), v.z + rand(-.6, .6)), V(0, .8, 0), 0x8a4cff, .2, .5); return;
    }
    const burning = fl & EF.burn, fire = burning ? .5 + .3 * Math.sin(now * 23 + e[0]) + .15 * Math.sin(now * 37) : 0;
    // toad: glows brighter and shimmers while sitting, the glow goes out when it jumps off
    const tg = v.type === 'toad' && !(fl & EF.air) ? (.22 + .1 * Math.sin(now * 17 + e[0]) + .06 * Math.sin(now * 29)) * Math.min(1, (e[9] - .5) * 12) : 0;
    for (const m of v.P.mats) { if (fl & EF.flash) m.emissive.setRGB(.42, .42, .42); else if (burning) m.emissive.setRGB(fire * .55, fire * .16, 0); else m.emissive.setRGB(bleedGlow + tg * .45, tg, bleedGlow * .05 + tg * .55); }
    if (burning && Math.random() < dt * 9) { const sc = v.g.scale.x; this.fire.burn(v.x, .35 * sc, v.z, sc); }
    if (burning && Math.random() < dt * 14) { const sc = v.g.scale.x; PART.spawn(V(v.x + rand(-.2, .2) * sc, rand(.3, .6) * sc, v.z + rand(-.2, .2) * sc), V(rand(-.15, .15), rand(1, 1.8), rand(-.15, .15)), Math.random() < .5 ? 0xff7a18 : 0xffc040, rand(.16, .26) * sc, rand(.3, .5), { s1: .05, a: .9 }); }
    if (fl & EF.shock) { // under current: white-yellow crackle around the body
      const sc = v.g.scale.x; if (Math.random() < dt * 22) PART.spawn(V(v.x + rand(-.25, .25) * sc, rand(.2, .7) * sc, v.z + rand(-.25, .25) * sc), V(rand(-1.2, 1.2), rand(-.2, 1.2), rand(-1.2, 1.2)), Math.random() < .5 ? 0xfff6c0 : 0x9fd0ff, rand(.04, .08), rand(.08, .16), { a: 1 });
      if (!burning) for (const m of v.P.mats) m.emissive.setRGB(.25 + .2 * Math.random(), .25 + .2 * Math.random(), .12);
    }
    v.bar.visible = !!(fl & EF.bar); v.bar.position.set(v.x, (v.type === 'toad' || v.type === 'squirrel' ? .85 : 1.05) + hy, v.z); v.bar.quaternion.copy(camera.quaternion);
    setBar(v.bar, e[5], e[6]);
  }
  private updateNums(dt: number) {
    const w = innerWidth, h = innerHeight, tv = V();
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.t += dt; if (n.t > .8) { n.el.remove(); this.nums.splice(i, 1); continue; }
      tv.copy(n.p); tv.y += n.t * 1.2; tv.project(camera);
      n.el.style.transform = `translate(${(tv.x * .5 + .5) * w}px,${(-tv.y * .5 + .5) * h}px) translate(-50%,-50%) scale(${n.t < .1 ? .6 + n.t * 4 : 1})`;
      n.el.style.opacity = String(n.t < .55 ? 1 : 1 - (n.t - .55) / .25);
    }
  }
  private updateAim() {
    for (const k in this.aimInd) this.aimInd[k].visible = false;
    const me = this.players.get(this.me), a = this.localAim;
    if (!me || !me.s.al || !a.show || !a.weapon || !this.snap) return;
    const w = a.weapon, ang = Math.atan2(a.x, a.z), px = me.x, pz = me.z, priv = this.snap.me[this.me];
    const rng = (id: SkillId) => priv ? priv.rg[SKILLS.indexOf(id)] : 1;
    const cid = w !== 'rake' && priv ? comboOf(priv.cb?.[SKILLS.indexOf(w)] ?? -1) : '';
    if (cid === 'chilight') { // lightning wave: long strip as wide as the wave
      const m = this.aimInd.asp, r = rng('chili'), C = this.cfg.combos!.list.chilight;
      m.visible = true; m.scale.set(C.width, r, 1); m.position.set(px + a.x * r / 2, .045, pz + a.z * r / 2); m.rotation.set(-Math.PI / 2, 0, ang + Math.PI); return;
    }
    if (w === 'rake' || w === 'cran') {
      const m = this.aimInd[w], r = w === 'rake' ? (priv?.rr || this.cfg.rake.range) : rng('cran');
      if (w === 'rake') return; // no marker: the scratches of the stroke show where the rake worked
      m.visible = true; m.scale.set(r, 1, r); m.position.set(px, .045, pz); m.rotation.y = ang;
    } else if (w === 'asp' || w === 'lemon') {
      const m = this.aimInd.asp, r = rng(w);
      m.visible = true; m.scale.set(.12, r, 1); m.position.set(px + a.x * r / 2, .045, pz + a.z * r / 2); m.rotation.set(-Math.PI / 2, 0, ang + Math.PI);
    } else if (w === 'chili') { // whole swept area (sweep + flame width), a full circle once it spins
      const m = this.aimInd.chili, arc = Math.min(359.9, (me.s.fw || 40) + (me.s.fc || 30));
      if (m.userData.arc !== arc) { m.userData.arc = arc; m.geometry.dispose(); m.geometry = sectorGeo(1, arc * Math.PI / 180, 32); }
      const r = me.s.fr || rng('chili'); m.visible = true; m.scale.set(r, 1, r); m.position.set(px, .045, pz); m.rotation.y = ang;
    } else if (w === 'cab') {
      const m = this.aimInd.cab, d = cid ? this.cfg.combos!.list[cid].throwDistance ?? 1 : this.cfg.skills.cab.throwDistance;
      m.visible = true; m.scale.setScalar(rng('cab')); m.position.set(px + a.x * d, .045, pz + a.z * d);
    }
  }

  /** weapon test room: bare earth, no lantern, player on the left side of the screen */
  sandbox = false; sbSheet = false;
  setSandbox(on: boolean) { this.sandbox = on; setBareRoom(on); lantern.visible = !on; }
  private camX = 0; private camZ = 0;
  private updateCamera(dt: number) {
    const portrait = innerHeight > innerWidth;
    const z = this.zoom, off = V(0, (portrait ? 18 : 13.5) * z, (portrait ? 11.6 : 9.3) * z);
    const me = this.players.get(this.me);
    let tx = me ? me.x : 0, tz = me ? me.z : 0;
    if (DBG_CAM) { tx = DBG_CAM[0]; tz = DBG_CAM[1]; } // dev only: ?cam=x,z looks at that spot (screenshots)
    let follow = .92;
    if (this.sandbox) { // look a bit to the right of the player, so the room in front of him (where enemies come from) is in view
      const halfW = off.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      tx += Math.min(9, halfW * .48); follow = 1;
      if (this.sbSheet && portrait) tz += off.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .62; // settings sheet covers the lower half: player moves up
    }
    this.camX = lerp(this.camX, tx * follow, 1 - Math.pow(.001, dt)); this.camZ = lerp(this.camZ, tz * .92 + (portrait ? 0 : .6), 1 - Math.pow(.001, dt));
    this.shake = Math.max(0, this.shake - dt * 1.2);
    const sx = this.shake ? rand(-1, 1) * this.shake * .5 : 0, sz = this.shake ? rand(-1, 1) * this.shake * .5 : 0;
    // build mode: blend to a top-down view of the whole garden
    this.placeT = clamp(this.placeT + (this.placing ? dt : -dt) * 3, 0, 1);
    const k = this.placeT * this.placeT * (3 - 2 * this.placeT);
    const ext = this.slots.filter(s => !s.forest || (this.placing && slotFits(this.cfg, s, this.placing))).reduce((m, s) => Math.max(m, Math.hypot(s.x, s.z)), 0) + hexR(this.cfg) + .8;
    const topH = ext / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
    camera.position.set(lerp(this.camX + off.x + sx, 0, k), lerp(off.y, topH, k), lerp(this.camZ + off.z + sz, .01, k));
    camera.lookAt(lerp(this.camX + sx, 0, k), 0, lerp(this.camZ + sz, 0, k));
    if (this.sandbox) gardenLight.position.set(this.camX - 2, 6, this.camZ + 1); // test room: the night light hangs over the action
    else gardenLight.position.set(0, 6, 1);
    const px = me ? me.x : tx, pz = me ? me.z : tz;
    torch.position.set(px, 3, pz + .6); setListener(px, pz);
    this.aggro.position.set(px, .03, pz); this.aggro.visible = !!(me && me.s.al) && !this.sandbox;
    moon.position.set(camera.position.x - 9, 18, camera.position.z - 2); moon.target.position.set(camera.position.x, 0, camera.position.z - 8);
  }
  /** screen position (px) of a point above the local player's head, or null */
  playerScreen(): { x: number; y: number } | null {
    const me = this.players.get(this.me); if (!me || !me.s.al) return null;
    const v = V(me.x, 1.75, me.z).project(camera);
    return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight };
  }
  /** screen point -> ground direction from local player (for mouse aim) */
  groundDir(cx: number, cy: number): [number, number] | null {
    const me = this.players.get(this.me); if (!me) return null;
    const nx = cx / innerWidth * 2 - 1, ny = -(cy / innerHeight) * 2 + 1;
    const o = camera.position, d = V(nx, ny, .5).unproject(camera).sub(o).normalize(); if (d.y >= 0) return null;
    const t = -o.y / d.y; const px = o.x + d.x * t, pz = o.z + d.z * t;
    const vx = px - me.x, vz = pz - me.z, l = Math.hypot(vx, vz); if (l < .05) return null; return [vx / l, vz / l];
  }
}
export { FRUIT_COL, EYE_COL, clamp };
