// Renders Snap objects. Same path for host (snap every frame) and clients (snaps at net rate,
// smoothed here). Events trigger particles, sounds and hit effects.
import * as THREE from 'three';
import { Balancing, ENEMIES, EnemyType, FRUITS, FruitType, SkillId, Weapon } from '../config';
import { slotPositions } from '../sim/sim';
import { EF, ESnap, Ev, PSnap, Snap } from '../sim/snap';
import { play } from '../audio';
import {
  GEO, M, PART, V, addMat, barGroup, burst, camera, clamp, clearFx, composer, decal, gradePass, lerp, lerpAngle, makeBar, moon,
  part, punchStar, rand, scene, sectorGeo, setBar, swipe, torch, updateFx, windU,
} from './core';
import { EYE_COL, FRUIT_COL, FRUIT_HEX, PLAYER_RING, PROJ_ASP, PROJ_ASP_TIP, PlantMats, buildEnemy, buildPlant, buildPlayer, fruitMesh, EnemyParts } from './models';
import { buildWorld, clearEyes, updateEyes, warnEyes } from './world';

const NUM_COL: Record<string, string> = { w: '#fff4d6', r: '#ffe3a0', g: '#c8ff9a', p: '#ff8090', b: '#ff6b7a', c: '#c8ff80', f: '#ffb35c', h: '#ff6b5a', v: '#9cff60' };

interface PView { g: THREE.Group; body: THREE.Group; rake: THREE.Group; stars: THREE.Group; ring: THREE.Mesh; bar: THREE.Group; s: PSnap; x: number; z: number; rot: number; recoil: number }
interface EView { g: THREE.Group; P: EnemyParts; type: EnemyType; bar: THREE.Group; s: ESnap; x: number; z: number; squash: number; carry: string; ind?: THREE.Mesh }
interface FView { g: THREE.Group; tier: number; type: FruitType; x: number; y: number; z: number; tx: number; ty: number; tz: number; seen: number }
interface JView { m: THREE.Object3D; kind: number; x: number; y: number; z: number; tx: number; ty: number; tz: number; seen: number }
interface FieldView { g: THREE.Group; plant: THREE.Group; fruits: THREE.Mesh[]; mats: PlantMats; bar: THREE.Group; alive: boolean; type: number }

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
  private aimInd: Record<string, THREE.Mesh> = {};
  private aggro: THREE.Mesh;
  private nums: { el: HTMLElement; p: THREE.Vector3; t: number }[] = [];
  private dmgLayer = document.getElementById('dmg')!;
  private shake = 0;
  private frameId = 0;
  localAim: LocalAim = { weapon: null, x: 0, z: 1, show: false };
  onEvent: (e: Ev) => void = () => {};

  constructor() {
    buildWorld();
    scene.add(this.dyn);
    this.aggro = new THREE.Mesh(GEO.ring, addMat(0xe3b964, .05)); this.aggro.rotation.x = -Math.PI / 2; this.aggro.position.y = .03; scene.add(this.aggro);
  }
  setConfig(cfg: Balancing) {
    this.cfg = cfg;
    for (const k in this.aimInd) scene.remove(this.aimInd[k]);
    const arc = cfg.rake.arc * Math.PI / 180;
    this.aimInd = {
      rake: new THREE.Mesh(sectorGeo(1, arc), addMat(0xffe3a0, .12)),
      cran: new THREE.Mesh(sectorGeo(1, cfg.skills.cran.spread * Math.PI / 180), addMat(0xff8090, .12)),
      asp: new THREE.Mesh(GEO.plane, addMat(0x9cff70, .2)),
      cab: new THREE.Mesh(GEO.circle, addMat(0xb8f070, .14)),
    };
    for (const k of ['asp', 'cab']) this.aimInd[k].rotation.x = -Math.PI / 2;
    for (const k in this.aimInd) { const m = this.aimInd[k]; (m.material as THREE.Material).side = THREE.DoubleSide; m.position.y = .045; m.visible = false; scene.add(m); }
    this.aggro.scale.setScalar(cfg.enemies.aggroRadius);
  }
  reset() {
    for (const c of [...this.dyn.children]) this.dyn.remove(c);
    for (const c of [...barGroup.children]) barGroup.remove(c);
    for (const n of this.nums) n.el.remove(); this.nums.length = 0;
    [this.players, this.enemies, this.fruits, this.projs, this.bombs, this.mines, this.fields].forEach(m => m.clear());
    PART.clear(); clearFx(); clearEyes(); this.snap = null;
  }

  // ---------------- state ----------------
  apply(s: Snap) {
    this.snap = s; const id = ++this.frameId;
    // players
    const seenP = new Set<number>();
    for (const ps of s.pl) {
      seenP.add(ps.id); let v = this.players.get(ps.id);
      if (!v) {
        const b = buildPlayer(ps.c, this.cfg.rake.range); this.dyn.add(b.g);
        const ring = new THREE.Mesh(GEO.ring, addMat(PLAYER_RING[ps.c % 4], .4)); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(.5); ring.position.y = .035; this.dyn.add(ring);
        v = { ...b, ring, bar: makeBar(.7, .07, 0x6fcf4a), s: ps, x: ps.x, z: ps.z, rot: ps.f, recoil: 0 };
        this.players.set(ps.id, v);
      }
      if (!this.smooth || Math.hypot(ps.x - v.x, ps.z - v.z) > 3) { v.x = ps.x; v.z = ps.z; }
      v.s = ps;
    }
    for (const [pid, v] of this.players) if (!seenP.has(pid)) { this.dyn.remove(v.g, v.ring); barGroup.remove(v.bar); this.players.delete(pid); }
    // fields
    const slots = slotPositions(this.cfg);
    for (const f of s.fi) {
      let v = this.fields.get(f[0]);
      if (!v) v = this.makeField(f[0], FRUITS[f[1]], slots[f[0]]);
      if (v.alive && !f[3]) this.killField(v);
      v.alive = !!f[3];
      setBar(v.bar, f[2]); v.bar.visible = v.alive; (v.bar.userData.fg.material as THREE.MeshBasicMaterial).color.set(f[2] > .5 ? 0x6fcf4a : f[2] > .25 ? 0xe3b964 : 0xd23a2e);
      v.plant.rotation.z = Math.sin(performance.now() / 20) * f[4] * .25; v.plant.scale.y = (v.alive ? 1 : .55) * (1 + f[4] * .4);
    }
    // enemies
    for (const e of s.en) {
      let v = this.enemies.get(e[0]);
      if (!v) {
        const type = ENEMIES[e[1]], b = buildEnemy(type); this.dyn.add(b.g);
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
    // projectiles / bombs / mines
    this.sync(this.projs, s.pj, id, p => p[0], (p) => {
      if (p[1] !== 0) return fruitMesh('cran', .9, false, true);
      const m = new THREE.Group();
      const st = part(m, GEO.cyl, PROJ_ASP, .035, .45, .035, 0, 0, 0, false); st.rotation.x = Math.PI / 2;
      const tp = part(m, GEO.cone, PROJ_ASP_TIP, .05, .14, .05, 0, 0, .28, false); tp.rotation.x = Math.PI / 2;
      return m;
    }, (v, p) => { v.tx = p[2]; v.ty = p[3]; v.tz = p[4]; v.m.rotation.y = p[5]; });
    this.sync(this.bombs, s.bo, id, b => b[0], (b) => fruitMesh('cab', b[4] ? .6 : 1, false, true), (v, b) => {
      v.tx = b[1]; v.ty = b[2]; v.tz = b[3]; v.m.rotation.x += .13;
      if (b[5]) v.m.scale.setScalar((b[4] ? .6 : 1) * (1 + Math.sin(performance.now() / 33) * .12));
    });
    this.sync(this.mines, s.mi, id, m => m[0], () => { const m = new THREE.Mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: 0xff2040, emissive: 0xff1030, emissiveIntensity: 2.4 })); return m; },
      (v, m) => { v.tx = m[1]; v.ty = .07; v.tz = m[2]; v.m.scale.setScalar(.07 * (1 + Math.sin(performance.now() / 160 + m[0]) * .15)); });
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
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); this.dyn.add(g);
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.32, .16, 6), M(0x3a2818, { r: 1 })); bed.position.y = .02; bed.rotation.y = Math.PI / 6; bed.receiveShadow = true; g.add(bed);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.4, .12, 6, 1, true), M(0x5a5048)); rim.position.y = .04; rim.rotation.y = Math.PI / 6; rim.castShadow = true; g.add(rim);
    const mats = { leaf: M(type === 'blue' ? 0x2f5a34 : type === 'asp' ? 0x6aa83c : type === 'cran' ? 0x335a2a : 0x4f8a35), head: M(0x9ad870) };
    const { g: plant, fruits } = buildPlant(type, mats); g.add(plant);
    const v: FieldView = { g, plant, fruits, mats, bar: makeBar(1.1, .09, 0x6fcf4a), alive: true, type: FRUITS.indexOf(type) };
    v.bar.position.set(p.x, 1.45, p.z);
    this.fields.set(slot, v);
    burst(V(p.x, .5, p.z), 0x8fe36a, 30, 2.5, .2, .8);
    return v;
  }
  private killField(v: FieldView) {
    v.mats.leaf.color.set(0x4a3a24); v.mats.head.color.set(0x5a4a2a); v.plant.scale.set(1, .55, 1);
    v.fruits.forEach(f => f.visible = false);
  }
  private setCarry(v: EView, carry: string) {
    v.carry = carry; const c = v.P.carry; for (const ch of [...c.children]) c.remove(ch);
    for (let i = 0; i < carry.length; i++) { const m = fruitMesh(FRUITS[+carry[i]], .8); m.position.set(rand(-.12, .12), .62 + i * .08, rand(-.2, 0)); c.add(m); }
  }

  // ---------------- events ----------------
  private event(e: Ev) {
    switch (e.k) {
      case 'snd': play(e.n); break;
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
        const arc = this.cfg.rake.arc * Math.PI / 180; swipe(e.x, e.z, e.a, this.cfg.rake.range, arc);
        break;
      }
      case 'shot': {
        const col = e.w === 'asp' ? 0xb8ff70 : e.w === 'cran' ? 0xff4060 : 0xc8ff90;
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
      case 'bleed': PART.spawn(V(e.x, .4, e.z), V(rand(-.3, .3), 1, rand(-.3, .3)), 0xff2030, .12, .5, { g: 5 }); break;
      case 'dust': PART.spawn(V(e.x, .1, e.z), V(rand(-.5, .5), .6, rand(-.5, .5)), 0x8a7050, .3, .5, { a: .45 }); break;
      case 'imm': play('imm'); break;
      case 'merge': burst(V(e.x, .3, e.z), FRUIT_HEX[FRUITS[e.t]], 18, 2, .18, .6); play('merge'); break;
      case 'collect': {
        burst(V(e.x, .9, e.z), FRUIT_HEX[FRUITS[e.t]], 6 + e.tier * 6, 1.8, .12, .35);
        if (e.p === this.me) play('pop', e.tier > 0);
        break;
      }
      case 'hurt': if (e.p === this.me) { play('hurt'); this.shake = Math.min(.2, this.shake + .06); } break;
      case 'warn': warnEyes(e.d, e.ty, e.w); play('warn'); break;
      case 'cycle': if (e.p === this.me) play('cycle'); break;
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
      for (const map of [this.bombs, this.mines]) for (const v of map.values()) { v.x = lerp(v.x, v.tx, k); v.y = lerp(v.y, v.ty, k); v.z = lerp(v.z, v.tz, k); v.m.position.set(v.x, v.y, v.z); }
      for (const [, f] of this.fields) f.bar.quaternion.copy(camera.quaternion);
    }
    this.updateAim();
    updateEyes(dt);
    if (Math.random() < dt * 5) { const a = rand(0, 7), r = rand(2, 13); PART.spawn(V(Math.cos(a) * r, rand(.3, 1.6), Math.sin(a) * r), V(rand(-.2, .2), rand(-.05, .15), rand(-.2, .2)), Math.random() < .5 ? 0xd8ff70 : 0xffd070, .07, rand(3, 6), { a: .8 }); }
    PART.update(dt); updateFx(dt); this.updateNums(dt);
    this.updateCamera(dt);
    const meV = this.players.get(this.me);
    gradePass.uniforms.uHurt.value = meV ? (meV.s.fl ? .3 : 0) + (meV.s.al ? 0 : .35) : 0;
    composer.render();
  }
  private animPlayer(v: PView, dt: number, k: number) {
    const s = v.s;
    v.x = lerp(v.x, s.x, k); v.z = lerp(v.z, s.z, k);
    v.g.position.set(v.x, 0, v.z); v.g.visible = !!s.al; v.ring.visible = !!s.al; v.ring.position.set(v.x, .035, v.z);
    const swinging = s.sw > 0;
    v.rot = swinging ? s.sd : lerpAngle(v.rot, s.f, .25);
    v.g.rotation.y = v.rot;
    v.body.position.y = s.al ? Math.abs(Math.sin(s.wk)) * .05 : 0;
    v.recoil = Math.max(0, v.recoil - dt); v.body.position.z = -v.recoil * .6;
    const arc = this.cfg.rake.arc * Math.PI / 180, L = this.cfg.rake.range - .12;
    if (swinging) { v.rake.rotation.y = lerp(arc / 2, -arc / 2, s.sw); v.rake.rotation.x = Math.atan2(.56, L); }
    else { v.rake.rotation.y = lerp(v.rake.rotation.y, -.55, .2); v.rake.rotation.x = lerp(v.rake.rotation.x, Math.atan2(.5, L), .2); }
    v.stars.visible = !!s.st; v.stars.rotation.y += dt * 6;
    const other = s.id !== this.me;
    v.bar.visible = other && !!s.al; v.bar.position.set(v.x, 1.6, v.z); v.bar.quaternion.copy(camera.quaternion); setBar(v.bar, s.hp / s.mhp);
  }
  private animEnemy(v: EView, dt: number, k: number, now: number) {
    const e = v.s, fl = e[7];
    v.x = lerp(v.x, e[2], k); v.z = lerp(v.z, e[3], k);
    v.g.position.set(v.x, 0, v.z);
    v.g.rotation.y = lerpAngle(v.g.rotation.y, e[4], .2);
    const stun = fl & EF.stun;
    v.P.stars.visible = !!stun; if (stun) { v.P.stars.rotation.y += dt * 6; v.P.body.rotation.z = Math.sin(now * 18) * .08; } else v.P.body.rotation.z = 0;
    if (v.type === 'toad') {
      const air = !!(fl & EF.air); v.P.body.position.y = air ? Math.sin(e[9] / .5 * Math.PI) * .55 : 0;
      for (const m of v.P.mats) m.opacity = air ? .4 : 1;
      if (fl & EF.tongue) { v.P.tongue!.visible = true; v.P.tongue!.scale.z = Math.max(.01, e[10]); } else v.P.tongue!.visible = false;
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
      const sk = e[6]; v.P.shield!.visible = sk > 0; ((v.P.shield!.material as THREE.ShaderMaterial).uniforms.uStr.value = .35 + Math.max(0, sk) * .8);
    }
    // punch squash
    v.squash = Math.max(0, v.squash - dt); const q = v.squash / .14;
    v.P.body.scale.set(1 + q * .25, 1 - q * .3, 1 + q * .25);
    const bleedGlow = fl & EF.bleed ? (.5 + .5 * Math.sin(now * 12)) * .9 : 0;
    for (const m of v.P.mats) { if (fl & EF.flash) m.emissive.setRGB(.9, .9, .9); else m.emissive.setRGB(bleedGlow, 0, bleedGlow * .05); }
    v.bar.visible = !!(fl & EF.bar); v.bar.position.set(v.x, v.type === 'toad' ? .85 : 1.05, v.z); v.bar.quaternion.copy(camera.quaternion);
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
    const rng = (id: SkillId) => priv ? priv.rg[['asp', 'cran', 'cab'].indexOf(id)] : 1;
    if (w === 'rake' || w === 'cran') {
      const m = this.aimInd[w], r = w === 'rake' ? this.cfg.rake.range : rng('cran');
      m.visible = true; m.scale.set(r, 1, r); m.position.set(px, .045, pz); m.rotation.y = ang;
    } else if (w === 'asp') {
      const m = this.aimInd.asp, r = rng('asp');
      m.visible = true; m.scale.set(.12, r, 1); m.position.set(px + a.x * r / 2, .045, pz + a.z * r / 2); m.rotation.set(-Math.PI / 2, 0, ang + Math.PI);
    } else if (w === 'cab') {
      const m = this.aimInd.cab, d = this.cfg.skills.cab.throwDistance;
      m.visible = true; m.scale.setScalar(rng('cab')); m.position.set(px + a.x * d, .045, pz + a.z * d);
    }
  }

  private camX = 0; private camZ = 0;
  private updateCamera(dt: number) {
    const portrait = innerHeight > innerWidth;
    const off = V(0, portrait ? 18 : 13.5, portrait ? 11.6 : 9.3);
    const me = this.players.get(this.me);
    const tx = me ? me.x : 0, tz = me ? me.z : 0;
    this.camX = lerp(this.camX, tx * .92, 1 - Math.pow(.001, dt)); this.camZ = lerp(this.camZ, tz * .92 + (portrait ? 0 : .6), 1 - Math.pow(.001, dt));
    this.shake = Math.max(0, this.shake - dt * 1.2);
    const sx = this.shake ? rand(-1, 1) * this.shake * .5 : 0, sz = this.shake ? rand(-1, 1) * this.shake * .5 : 0;
    camera.position.set(this.camX + off.x + sx, off.y, this.camZ + off.z + sz);
    camera.lookAt(this.camX + sx, 0, this.camZ + sz);
    torch.position.set(tx, 2.2, tz + .4);
    this.aggro.position.set(tx, .03, tz); this.aggro.visible = !!(me && me.s.al);
    moon.position.set(camera.position.x - 9, 18, camera.position.z - 2); moon.target.position.set(camera.position.x, 0, camera.position.z - 8);
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
