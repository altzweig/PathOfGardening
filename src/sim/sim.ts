// Host-authoritative game simulation. Pure data, no rendering: the view and the network
// only ever see Snap objects + events produced here.
import { Balancing, coopF, ENEMIES, EnemyType, FRUITS, FruitType, SKILLS, SkillId, Weapon, WEAPONS } from '../config';
import { emptyIntent, EF, ESnap, Ev, Intent, Offer, Priv, Snap } from './snap';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const SQ3 = Math.sqrt(3);
const HEX = [[1, 0], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, -1], [2, 0], [-2, 2], [0, -2], [0, 2], [-2, 0], [2, -2]];
export function slotPositions(cfg: Balancing) {
  const H = cfg.arena.fieldSpacing;
  return HEX.slice(0, Math.min(HEX.length, cfg.arena.fieldSlots)).map(([q, r]) => ({ x: H * SQ3 * (q + r / 2), z: H * 1.5 * r }));
}

interface SkillState { learned: boolean; lvDmg: number; lvRange: number; lvCd: number; pierce: number; pierceBonus: number; extraPel: number; mineLv: number; minis: number; cdT: number; firing: boolean }
interface Poison { t: number; ticks: number }
export interface Player {
  id: number; color: number; x: number; z: number; face: number; hp: number; alive: boolean; deaths: number; respawnT: number;
  stun: number; kb: { dx: number; dz: number; left: number } | null; poison: Poison[]; swing: number; swingDir: number; walk: number; flash: number;
  ammo: Record<SkillId, number>; collected: Record<SkillId, number>; skills: Record<SkillId, SkillState>;
  rakeCd: number; aimX: number; aimZ: number; active: Weapon; intent: Intent; lastTap: number; lastCycle: number;
  offers: Offer[] | null; picked: boolean;
}
interface Field { slot: number; type: FruitType; x: number; z: number; hp: number; maxHp: number; alive: boolean; t: number; shake: number; poison: Poison[] }
interface Fruit {
  id: number; type: FruitType; tier: number; val: number; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  state: 'fly' | 'ground' | 'collect' | 'merge' | 'carried'; src: number; born: number; bounce: number; r: number;
  ct: number; fx: number; fz: number; fy: number; collector: Player | null; tx: number; tz: number; mt: number;
}
type Target = { kind: 'player'; p: Player } | { kind: 'fruit'; fr: Fruit } | { kind: 'field'; f: Field } | { kind: 'flee' } | null;
interface Enemy {
  id: number; type: EnemyType; x: number; z: number; hp: number; maxHp: number; shield: number; shieldMax: number; shieldT: number; r: number; speed: number;
  stun: number; bleed: number; bleedT: number; flash: number; atkT: number; think: number; target: Target; carry: Fruit[]; fleeing: boolean; face: number;
  walk: number; hop: number; state: 'approach' | 'windup' | 'charge' | 'rest'; st: number; cdx: number; cdz: number; hitThisCharge: boolean;
  tongueT: number; tongueCd: number; tongueLen: number; lunge: number; dead: boolean; hurtOnce: boolean;
}
interface Proj { id: number; kind: 'asp' | 'cran'; x: number; y: number; z: number; dx: number; dz: number; speed: number; left: number; total: number; dmg: number; pierceLeft: number; pf: number; mine: number; hit: Set<Enemy> }
interface Bomb { id: number; fx: number; fy: number; fz: number; tx: number; tz: number; x: number; y: number; z: number; t: number; flight: number; fuse: number; radius: number; dmg: number; minis: number; mini: boolean }
interface Mine { id: number; x: number; z: number; dmg: number; t: number }
interface PendingSpawn { at: number; type: EnemyType; angle: number }
interface PlannedWave { dirs: number[]; groups: EnemyType[][] }

export interface SkillStats { dmg: number; dmgPct: number; range: number; cd: number; cost: number; need: number; pierce: number; pf: number; pellets: number; mine: number; minis: number; throwDist: number }

export class Sim {
  cfg: Balancing;
  time = 0; level = 1; xp = 0; pendingLv = 0; kills = 0; collectedXP = 0;
  phase: 'play' | 'lvl' | 'over' = 'play';
  paused = false;
  players: Player[] = [];
  fields: Field[] = []; fruits: Fruit[] = []; enemies: Enemy[] = []; projs: Proj[] = []; bombs: Bomb[] = []; mines: Mine[] = [];
  yieldLv: Record<FruitType, number> = { blue: 0, asp: 0, cran: 0, cab: 0 };
  events: Ev[] = [];
  private nid = 1;
  private mergeT = 0;
  private waveT: number; private planned: PlannedWave | null = null; private spawnQueue: PendingSpawn[] = [];
  private slots: { x: number; z: number }[];

  constructor(cfg: Balancing) {
    this.cfg = cfg;
    this.slots = slotPositions(cfg);
    this.waveT = cfg.waves.firstWave;
    for (let i = 0; i < cfg.arena.startFields; i++) this.addField('blue');
  }

  // ---------- coop scaling ----------
  get n() { return Math.max(1, this.players.length); }
  f(exp: number) { return coopF(this.n, exp); }
  need(L: number) { const X = this.cfg.xp; return Math.round((X.base * Math.pow(X.growth, L - 1) + X.linear * (L - 1)) * this.f(this.cfg.coop.xpNeedExponent)); }

  emit(e: Ev) { this.events.push(e); }
  snd(n: string, extra: Record<string, any> = {}) { this.emit({ k: 'snd', n, ...extra }); }
  burst(x: number, y: number, z: number, c: number, n: number, sp = 2, sz = .15, lf = .5, o: Record<string, number> = {}) { this.emit({ k: 'burst', x: r2(x), y: r2(y), z: r2(z), c, n, sp, sz, lf, ...o }); }
  num(x: number, z: number, v: number, c: string, big = false) { this.emit({ k: 'num', x: r2(x), z: r2(z), v: Math.round(v * 10) / 10, c, b: big ? 1 : 0 }); }

  // ---------- players ----------
  addPlayer(id: number, color: number) {
    const P = this.cfg.player, a = this.players.length * Math.PI / 2;
    const mk = (): SkillState => ({ learned: false, lvDmg: 0, lvRange: 0, lvCd: 0, pierce: this.cfg.skills.asp.pierce, pierceBonus: 0, extraPel: 0, mineLv: 0, minis: 0, cdT: 0, firing: false });
    const p: Player = {
      id, color, x: this.players.length ? Math.cos(a) * .6 : 0, z: this.players.length ? Math.sin(a) * .6 : 0, face: 0, hp: P.hp, alive: true, deaths: 0, respawnT: 0,
      stun: 0, kb: null, poison: [], swing: 0, swingDir: 0, walk: 0, flash: 0,
      ammo: { asp: 0, cran: 0, cab: 0 }, collected: { asp: 0, cran: 0, cab: 0 }, skills: { asp: mk(), cran: mk(), cab: mk() },
      rakeCd: 0, aimX: 0, aimZ: 1, active: 'rake', intent: emptyIntent(), lastTap: 0, lastCycle: 0, offers: null, picked: false,
    };
    this.players.push(p);
    if (this.phase === 'lvl') { p.offers = this.offers(p); p.picked = false; }
    return p;
  }
  removePlayer(id: number) {
    const i = this.players.findIndex(p => p.id === id); if (i < 0) return;
    this.players.splice(i, 1);
    for (const e of this.enemies) if (e.target && e.target.kind === 'player' && e.target.p.id === id) e.target = null;
    if (this.phase === 'lvl') this.checkAllPicked();
  }
  player(id: number) { return this.players.find(p => p.id === id); }
  setIntent(id: number, it: Intent) { const p = this.player(id); if (p) p.intent = it; }

  // ---------- fields & fruit ----------
  addField(type: FruitType) {
    const slot = this.fields.length; if (slot >= this.slots.length) return null;
    const s = this.slots[slot];
    const f: Field = { slot, type, x: s.x, z: s.z, hp: this.cfg.fields.hp, maxHp: this.cfg.fields.hp, alive: true, t: rand(0, this.cfg.plants[type].interval), shake: 0, poison: [] };
    this.fields.push(f);
    this.burst(s.x, .5, s.z, 0x8fe36a, 30, 2.5, .2, .8);
    return f;
  }
  fieldOf(type: FruitType) { return this.fields.find(f => f.type === type); }
  hurtField(f: Field, dmg: number) {
    if (!f.alive || this.phase === 'over') return;
    f.hp -= dmg; f.shake = .25; this.snd('field');
    this.num(f.x, f.z, dmg, 'f');
    if (f.hp <= 0) {
      f.hp = 0; f.alive = false;
      this.burst(f.x, .5, f.z, 0x8a6a3a, 40, 3, .25, 1, { g: 6 });
      this.emit({ k: 'fieldDead', s: f.slot });
      if (this.fields.every(x => !x.alive)) this.gameOver();
    }
  }
  spawnFruit(type: FruitType, tier: number, fx: number, fy: number, fz: number, tx: number, tz: number, src: number) {
    const T = .55;
    const fr: Fruit = {
      id: this.nid++, type, tier, val: this.cfg.fruit.tierValue[tier], x: fx, y: fy, z: fz,
      vx: (tx - fx) / T, vy: (0 - fy + .5 * 9.8 * T * T) / T, vz: (tz - fz) / T,
      state: 'fly', src, born: this.time, bounce: 0, r: (type === 'cab' ? .14 : .08) * this.cfg.fruit.tierScale[tier],
      ct: 0, fx: 0, fy: 0, fz: 0, collector: null, tx: 0, tz: 0, mt: 0,
    };
    this.fruits.push(fr); return fr;
  }
  produce(f: Field) {
    const dbl = Math.min(1, this.cfg.upgrades.doubleHarvest.step * this.yieldLv[f.type]);
    let n = Math.random() < dbl ? 2 : 1;
    if (f.type === 'blue') { // coop: more blueberries
      const extra = this.f(this.cfg.coop.xpYieldExponent) - 1;
      n += Math.floor(extra) + (Math.random() < extra % 1 ? 1 : 0);
    }
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = rand(this.cfg.fruit.throwMin, this.cfg.fruit.throwMax);
      this.spawnFruit(f.type, 0, f.x, .8, f.z, f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, f.slot);
    }
    f.shake = .18;
  }
  collectFruit(fr: Fruit, p: Player) {
    const v = fr.val;
    if (fr.type === 'blue') { const xv = v * this.f(this.cfg.coop.xpValueExponent); this.collectedXP += v; this.addXP(xv); }
    else { p.ammo[fr.type] += v; p.collected[fr.type] += v; }
    this.emit({ k: 'collect', p: p.id, t: FRUITS.indexOf(fr.type), tier: fr.tier, x: r2(p.x), z: r2(p.z) });
  }
  mergeFruit() {
    const M = this.cfg.fruit.mergeCount;
    for (const f of this.fields) for (let tier = 0; tier < this.cfg.fruit.tierValue.length - 1; tier++) {
      const list = this.fruits.filter(x => x.src === f.slot && x.state === 'ground' && x.tier === tier);
      if (list.length < M) continue;
      list.sort((a, b) => a.born - b.born); const grp = list.slice(0, M), ax = grp[0].x, az = grp[0].z;
      for (const x of grp) { x.state = 'merge'; x.mt = 0; x.tx = ax; x.tz = az; }
      this.merges.push({ t: .28, f, tier: tier + 1, x: ax, z: az });
    }
  }
  private merges: { t: number; f: Field; tier: number; x: number; z: number }[] = [];

  // ---------- xp & level ----------
  addXP(v: number) {
    this.xp += v;
    while (this.xp >= this.need(this.level)) { this.xp -= this.need(this.level); this.level++; this.pendingLv++; }
    if (this.pendingLv > 0 && this.phase === 'play') this.openLevelUp();
  }
  openLevelUp() {
    this.phase = 'lvl'; this.snd('level');
    for (const p of this.players) { p.offers = this.offers(p); p.picked = false; p.intent = { ...emptyIntent(), tapSeq: p.lastTap, cycle: p.lastCycle }; for (const id of SKILLS) p.skills[id].firing = false; }
    this.emit({ k: 'lvl' });
  }
  pick(id: number, key: string) {
    const p = this.player(id); if (!p || this.phase !== 'lvl' || p.picked || !p.offers) return;
    const o = p.offers.find(x => x.key === key); if (!o) return;
    this.applyOffer(p, key); p.picked = true;
    this.checkAllPicked();
  }
  private checkAllPicked() {
    if (this.players.some(p => !p.picked)) return;
    this.pendingLv--;
    if (this.pendingLv > 0) { for (const p of this.players) { p.offers = this.offers(p); p.picked = false; } this.emit({ k: 'lvl' }); }
    else { this.phase = 'play'; for (const p of this.players) { p.offers = null; p.picked = false; } }
  }

  // ---------- skill stats ----------
  stats(id: SkillId, s: SkillState): SkillStats {
    const S = this.cfg.skills, U = this.cfg.upgrades;
    const B = S[id] as any;
    const dm = 1 + U.damagePerLevel * s.lvDmg, rm = 1 + U.rangePerLevel * s.lvRange, cd = B.cooldown * Math.pow(1 - U.cooldownPerLevel, s.lvCd);
    const range = (id === 'cab' ? S.cab.radius : B.range) * rm;
    return {
      dmg: B.damage * dm, dmgPct: dm, range, cd, cost: B.ammoPerShot,
      need: Math.ceil(S.readySeconds / cd - 1e-9) * B.ammoPerShot,
      pierce: s.pierce, pf: S.asp.pierceFactor + U.aspPierceBonus.step * s.pierceBonus,
      pellets: S.cran.pellets + U.cranPellets.step * s.extraPel, mine: U.cranMine.step * s.mineLv,
      minis: s.minis, throwDist: S.cab.throwDistance,
    };
  }
  /** can fire right now (ammo) — held weapons may dip below the "ready" threshold */
  canFire(p: Player, id: SkillId) {
    const s = p.skills[id]; if (!s.learned) return false; const st = this.stats(id, s);
    if (p.ammo[id] < st.cost) return false;
    return s.firing || p.ammo[id] >= st.need;
  }
  isReady(p: Player, id: SkillId) { const s = p.skills[id]; return s.learned && p.ammo[id] >= this.stats(id, s).need; }
  isEmpty(p: Player, id: SkillId) { const s = p.skills[id]; return !s.learned || p.ammo[id] < this.stats(id, s).cost; }

  // ---------- combat ----------
  airborne(e: Enemy) { return e.type === 'toad' && e.state !== 'windup' && e.stun <= 0 && (e.hop % 1) < .5; }
  hurtEnemy(e: Enemy, dmg: number, o: { color?: string; bleed?: boolean; stun?: number; punch?: boolean } = {}) {
    if (e.dead) return false;
    if (this.airborne(e)) { this.emit({ k: 'imm', x: r2(e.x), z: r2(e.z) }); return false; }
    let left = dmg;
    if (e.shield > 0) { const a = Math.min(e.shield, left); e.shield -= a; left -= a; if (a > 0) this.burst(e.x, .45, e.z, 0x6fd0ff, 4, 1.5, .12, .3); }
    e.hp -= left; e.flash = .1; e.hurtOnce = true;
    this.num(e.x, e.z, dmg, o.color || 'w', dmg >= 10);
    if (o.punch) this.emit({ k: 'punch', x: r2(e.x), z: r2(e.z), e: e.id });
    else this.snd('hit');
    if (o.bleed) e.bleed = this.cfg.skills.cran.bleedDuration;
    if (o.stun) e.stun = Math.max(e.stun, o.stun);
    if (e.hp <= 0) this.killEnemy(e);
    return true;
  }
  killEnemy(e: Enemy) {
    e.dead = true; this.kills++; this.snd('die');
    this.burst(e.x, .4, e.z, 0xffe0b0, 22, 2.6, .18, .6, { g: 4 });
    this.burst(e.x, .4, e.z, 0x404040, 10, 1.2, .5, .9, { a: .4 });
    for (const fr of e.carry) {
      fr.x = e.x; fr.y = .4; fr.z = e.z; const a = rand(0, 7);
      fr.vx = Math.cos(a) * 1.5; fr.vy = 3; fr.vz = Math.sin(a) * 1.5; fr.state = 'fly'; fr.bounce = 0; fr.src = -1;
    }
    e.carry = [];
    this.removeEnemy(e);
  }
  removeEnemy(e: Enemy) { e.dead = true; const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); }
  nearestEnemy(x: number, z: number, r: number) { let b: Enemy | null = null, bd = r; for (const e of this.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; b = e; } } return b; }

  aimDir(p: Player, range: number, useIntent = true): [number, number] {
    const it = p.intent;
    if (useIntent && it.aim) { const l = Math.hypot(it.ax, it.az); if (l > .01) return [it.ax / l, it.az / l]; }
    const n = this.nearestEnemy(p.x, p.z, range + 1.5);
    if (n) { const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
    return [p.aimX, p.aimZ];
  }
  rakeAttack(p: Player, dx: number, dz: number) {
    const R = this.cfg.rake, arc = R.arc * Math.PI / 180;
    p.rakeCd = R.cooldown; p.swing = R.swingTime; p.swingDir = Math.atan2(dx, dz); p.face = p.swingDir; p.aimX = dx; p.aimZ = dz;
    this.snd('rake');
    this.emit({ k: 'swipe', x: r2(p.x), z: r2(p.z), a: r2(p.swingDir), p: p.id });
    let hits = 0;
    for (const e of [...this.enemies]) {
      if (e.dead) continue; const ex = e.x - p.x, ez = e.z - p.z, d = Math.hypot(ex, ez);
      if (d > R.range + e.r * .5) continue;
      const da = Math.acos(clamp((ex * dx + ez * dz) / (d || 1), -1, 1));
      if (d < e.r + .2 || da <= arc / 2 + Math.atan2(e.r, Math.max(d, .01)) * .5) { if (this.hurtEnemy(e, R.damage, { color: 'r', punch: true })) hits++; }
    }
    if (hits) this.emit({ k: 'punches', n: hits, x: r2(p.x), z: r2(p.z) });
  }
  tryFire(p: Player, id: SkillId, dir?: [number, number]) {
    const s = p.skills[id];
    if (!p.alive || p.stun > 0 || !this.canFire(p, id) || s.cdT > 0) return false;
    const st = this.stats(id, s);
    const d = dir || this.aimDir(p, id === 'cab' ? st.throwDist : st.range);
    s.firing = true; p.aimX = d[0]; p.aimZ = d[1];
    this.fireSkill(p, id, d[0], d[1]);
    return true;
  }
  fireSkill(p: Player, id: SkillId, dx: number, dz: number) {
    const s = p.skills[id], st = this.stats(id, s), S = this.cfg.skills;
    p.ammo[id] -= st.cost; s.cdT = st.cd; p.face = Math.atan2(dx, dz);
    const fx = p.x + dx * .35, fy = .75, fz = p.z + dz * .35;
    this.emit({ k: 'shot', p: p.id, w: id, x: r2(fx), z: r2(fz), a: r2(Math.atan2(dx, dz)) });
    if (id === 'asp') {
      this.snd('asp');
      this.projs.push({ id: this.nid++, kind: 'asp', x: fx, y: fy, z: fz, dx, dz, speed: S.asp.speed, left: st.range, total: st.range, dmg: st.dmg, pierceLeft: st.pierce, pf: st.pf, mine: 0, hit: new Set() });
    } else if (id === 'cran') {
      this.snd('shot');
      this.burst(fx, fy, fz, 0xff4060, 8, 2.5, .15, .25);
      const half = S.cran.spread * Math.PI / 360;
      for (let i = 0; i < st.pellets; i++) {
        const a = Math.atan2(dx, dz) + rand(-half, half);
        this.projs.push({ id: this.nid++, kind: 'cran', x: fx, y: fy, z: fz, dx: Math.sin(a), dz: Math.cos(a), speed: rand(9, 12), left: st.range * rand(.75, 1), total: st.range, dmg: st.dmg, pierceLeft: 0, pf: 0, mine: st.mine, hit: new Set() });
      }
    } else {
      this.snd('throw');
      const t = this.clampArena(p.x + dx * st.throwDist, p.z + dz * st.throwDist);
      this.spawnBomb(fx, fy, fz, t[0], t[1], st.range, st.dmg, st.minis, false);
    }
  }
  spawnBomb(fx: number, fy: number, fz: number, tx: number, tz: number, radius: number, dmg: number, minis: number, mini: boolean) {
    this.bombs.push({ id: this.nid++, fx, fy, fz, tx, tz, x: fx, y: fy, z: fz, t: 0, flight: mini ? .35 : .6, fuse: mini ? .45 : this.cfg.skills.cab.fuse, radius, dmg, minis, mini });
  }
  explode(b: Bomb) {
    const C = this.cfg.skills.cab;
    this.snd(b.mini ? 'boomS' : 'boom');
    this.emit({ k: 'boom', x: r2(b.tx), z: r2(b.tz), r: r2(b.radius), m: b.mini ? 1 : 0 });
    let any = false;
    for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - b.tx, e.z - b.tz) < b.radius + e.r * .5) { if (this.hurtEnemy(e, b.dmg, { stun: C.stun, color: 'c' })) any = true; }
    if (any) this.snd('confuse');
    for (let i = 0; i < b.minis; i++) {
      const a = rand(0, Math.PI * 2), t = this.clampArena(b.tx + Math.cos(a), b.tz + Math.sin(a));
      this.spawnBomb(b.tx, .3, b.tz, t[0], t[1], b.radius * C.miniRadiusFactor, b.dmg * C.miniDamageFactor, 0, true);
    }
  }
  clampArena(x: number, z: number): [number, number] { const R = this.cfg.arena.radius, r = Math.hypot(x, z); return r > R ? [x * R / r, z * R / r] : [x, z]; }

  // ---------- enemies ----------
  spawnEnemy(type: EnemyType, angle: number) {
    const D = this.cfg.enemies[type], R = this.cfg.arena.radius + 2, hpF = this.f(this.cfg.coop.enemyHpExponent);
    const e: Enemy = {
      id: this.nid++, type, x: Math.cos(angle) * R, z: Math.sin(angle) * R, hp: D.hp * hpF, maxHp: D.hp * hpF,
      shield: (D.shield || 0) * hpF, shieldMax: (D.shield || 0) * hpF, shieldT: D.shieldRegen || 3, r: D.radius, speed: D.speed,
      stun: 0, bleed: 0, bleedT: 1, flash: 0, atkT: 1, think: 0, target: null, carry: [], fleeing: false, face: angle + Math.PI,
      walk: rand(0, 7), hop: rand(0, 1), state: 'approach', st: 0, cdx: 0, cdz: 1, hitThisCharge: false,
      tongueT: 0, tongueCd: D.tongueCooldown || 1.5, tongueLen: 1, lunge: 0, dead: false, hurtOnce: false,
    };
    this.enemies.push(e);
  }
  nearestField(x: number, z: number) { let best: Field | null = null, bd = 1e9; for (const f of this.fields) if (f.alive) { const d = Math.hypot(x - f.x, z - f.z); if (d < bd) { bd = d; best = f; } } return best; }
  chooseTarget(e: Enemy): Target {
    if (e.fleeing) return { kind: 'flee' };
    let bp: Player | null = null, bd = this.cfg.enemies.aggroRadius;
    for (const p of this.players) if (p.alive) { const d = dist(e, p); if (d < bd) { bd = d; bp = p; } }
    if (bp) return { kind: 'player', p: bp };
    const D = this.cfg.enemies[e.type];
    if (D.steals) {
      let best: Fruit | null = null, b2 = 1e9;
      for (const fr of this.fruits) if (fr.state === 'ground' && D.steals.includes(fr.type)) { const d = dist(e, fr); if (d < b2) { b2 = d; best = fr; } }
      if (best) return { kind: 'fruit', fr: best };
    }
    const f = this.nearestField(e.x, e.z); return f ? { kind: 'field', f } : null;
  }
  steer(e: Enemy, tx: number, tz: number, speed: number, dt: number, stop = 0) {
    let vx = tx - e.x, vz = tz - e.z; const d = Math.hypot(vx, vz); if (d < .001) return d;
    vx /= d; vz /= d; e.face = Math.atan2(vx, vz);
    if (d > stop) { const s = Math.min(speed * dt, d - stop); e.x += vx * s; e.z += vz * s; e.walk += dt * speed * 4; }
    return d;
  }
  targetPos(t: Target): { x: number; z: number } | null {
    if (!t) return null; if (t.kind === 'player') return t.p; if (t.kind === 'fruit') return t.fr; if (t.kind === 'field') return t.f; return null;
  }
  hurtPlayer(p: Player, dmg: number, color = 'h') {
    if (!p.alive || this.phase === 'over') return;
    dmg *= this.f(this.cfg.coop.enemyDamageExponent);
    p.hp -= dmg; p.flash = .35; this.emit({ k: 'hurt', p: p.id });
    this.num(p.x, p.z, dmg, color);
    if (p.hp <= 0) {
      const P = this.cfg.player;
      p.hp = 0; p.alive = false; p.deaths++; p.respawnT = P.respawnBase + P.respawnPerDeath * (p.deaths - 1); p.poison = []; p.stun = 0; p.kb = null;
      this.burst(p.x, .8, p.z, 0xffd890, 40, 3, .2, 1);
      this.emit({ k: 'pdie', p: p.id });
    }
  }
  tickPoison(obj: { poison: Poison[] }, dt: number, hurt: (d: number) => void) {
    const T = this.cfg.enemies.toad;
    for (let i = obj.poison.length - 1; i >= 0; i--) {
      const s = obj.poison[i]; s.t -= dt;
      if (s.t <= 0) { s.t += T.poisonInterval!; s.ticks--; hurt(T.poisonDamage!); if (s.ticks <= 0) obj.poison.splice(i, 1); }
    }
  }
  updateEnemy(e: Enemy, dt: number) {
    const D = this.cfg.enemies[e.type], E = this.cfg.enemies;
    e.flash -= dt; e.lunge -= dt; e.tongueT -= dt;
    if (D.shield) { e.shieldT -= dt; if (e.shieldT <= 0) { e.shieldT = D.shieldRegen!; if (e.shield < e.shieldMax) { e.shield = e.shieldMax; this.burst(e.x, .45, e.z, 0x6fd0ff, 10, 1.2, .15, .4); } } }
    if (e.bleed > 0) {
      e.bleed -= dt; e.bleedT -= dt;
      if (e.bleedT <= 0) { e.bleedT = 1; this.snd('bleed'); this.emit({ k: 'bleed', x: r2(e.x), z: r2(e.z) }); this.hurtEnemy(e, this.cfg.skills.cran.bleedDps, { color: 'b' }); if (e.dead) return; }
    } else e.bleedT = 1;
    if (e.stun > 0) { e.stun -= dt; return; }
    e.think -= dt;
    const t0 = e.target;
    if (e.think <= 0 || !t0 || (t0.kind === 'fruit' && t0.fr.state !== 'ground') || (t0.kind === 'field' && !t0.f.alive) || (t0.kind === 'player' && (!t0.p.alive || !this.players.includes(t0.p)))) {
      if (e.type !== 'sheep' || e.state === 'approach') e.target = this.chooseTarget(e);
      e.think = .3;
    }
    if (e.type === 'sheep') return this.sheepAI(e, dt);
    const t = e.target; if (!t) return;
    if (t.kind === 'flee') {
      const a = Math.atan2(e.z, e.x); this.steer(e, Math.cos(a) * 40, Math.sin(a) * 40, D.fleeSpeed!, dt);
      if (Math.hypot(e.x, e.z) > this.cfg.arena.radius + 3) {
        for (const fr of e.carry) { const i = this.fruits.indexOf(fr); if (i >= 0) this.fruits.splice(i, 1); }
        e.carry = []; this.removeEnemy(e);
      }
      return;
    }
    const tp = this.targetPos(t)!;
    const FR = this.cfg.fields.radius;
    const reach = t.kind === 'field' ? FR + e.r : t.kind === 'player' ? e.r + .5 : e.r * .6;
    if (e.type === 'toad') {
      e.hop += dt / D.hopPeriod!; const air = (e.hop % 1) < .5;
      const rng = t.kind === 'field' ? FR + .55 + e.r : t.kind === 'player' ? D.tongueRange! : .3;
      const d = dist(e, tp);
      if (air) { if (d > rng * .8) this.steer(e, tp.x, tp.z, e.speed * 2, dt, rng * .8); else e.face = Math.atan2(tp.x - e.x, tp.z - e.z); }
      else {
        e.tongueCd -= dt;
        if (d < rng && e.tongueCd <= 0 && t.kind !== 'fruit') {
          e.tongueCd = D.tongueCooldown!; e.tongueT = .35; e.tongueLen = d - .15; this.snd('tongue');
          const ps = { t: D.poisonInterval!, ticks: D.poisonTicks! };
          if (t.kind === 'player') t.p.poison.push(ps); else if (t.kind === 'field') t.f.poison.push(ps);
        }
      }
      return;
    }
    const d = this.steer(e, tp.x, tp.z, e.speed, dt, t.kind === 'fruit' ? 0 : reach * .9);
    if (t.kind === 'fruit' && d < .35 + e.r) {
      const fr = t.fr; fr.state = 'carried'; e.carry.push(fr); e.target = null;
      if (e.carry.length >= (D.carryMax || 5)) e.fleeing = true;
    } else if (t.kind !== 'fruit' && d <= reach) {
      e.atkT -= dt;
      if (e.atkT <= 0) { e.atkT = E.meleeInterval; e.lunge = .2; if (t.kind === 'player') this.hurtPlayer(t.p, E.meleeDamage); else if (t.kind === 'field') this.hurtField(t.f, E.meleeDamage); }
    } else e.atkT = Math.min(e.atkT, .5);
  }
  sheepAI(e: Enemy, dt: number) {
    const D = this.cfg.enemies.sheep; e.st -= dt;
    if (e.state === 'approach') {
      if (!e.target) e.target = this.chooseTarget(e);
      const tp = this.targetPos(e.target); if (!tp) return;
      const d = this.steer(e, tp.x, tp.z, e.speed, dt, 1);
      if (d < D.chargeRange!) { e.state = 'windup'; e.st = D.windup!; this.snd('baa'); }
    } else if (e.state === 'windup') {
      const tp = this.targetPos(e.target);
      if (tp && e.st > .4) { const dx = tp.x - e.x, dz = tp.z - e.z, l = Math.hypot(dx, dz) || 1; e.cdx = dx / l; e.cdz = dz / l; e.face = Math.atan2(e.cdx, e.cdz); }
      if (e.st <= 0) { e.state = 'charge'; e.st = D.chargeTime!; e.hitThisCharge = false; }
    } else if (e.state === 'charge') {
      const s = D.chargeSpeed! * dt; e.x += e.cdx * s; e.z += e.cdz * s; e.walk += dt * 30;
      if (Math.random() < .6) this.emit({ k: 'dust', x: r2(e.x), z: r2(e.z) });
      if (!e.hitThisCharge) for (const p of this.players) if (p.alive && dist(e, p) < e.r + .4) {
        e.hitThisCharge = true; this.snd('ram'); this.hurtPlayer(p, D.ramDamage!); p.stun = Math.max(p.stun, D.ramStun!); p.kb = { dx: e.cdx, dz: e.cdz, left: D.knockback! };
        e.state = 'rest'; e.st = D.rest!; break;
      }
      for (const f of this.fields) if (f.alive && !e.hitThisCharge && dist(e, f) < this.cfg.fields.radius + e.r) { e.hitThisCharge = true; this.snd('ram'); this.hurtField(f, D.ramDamage!); e.state = 'rest'; e.st = D.rest!; }
      if (e.st <= 0 && e.state === 'charge') { e.state = 'rest'; e.st = D.rest!; }
    } else if (e.state === 'rest') {
      if (e.st <= 0) { e.state = 'approach'; e.target = null; }
    }
  }

  // ---------- waves ----------
  private pickType(): EnemyType {
    const W = this.cfg.waves, t = this.time, table: [EnemyType, number][] = [];
    const early = !!(this.fieldOf('cran') || this.fieldOf('asp'));
    for (const type of ENEMIES) {
      const T = W.types[type]; if (!T) continue;
      if (t >= T.from) table.push([type, T.weight]);
      else if (T.early && early) table.push([type, T.early]);
    }
    if (!table.length) return 'raccoon';
    const tot = table.reduce((a, x) => a + x[1], 0); let r = Math.random() * tot;
    for (const [type, w] of table) { r -= w; if (r <= 0) return type; }
    return table[table.length - 1][0];
  }
  private planWave(): PlannedWave {
    const W = this.cfg.waves, t = this.time;
    const base = Math.min(W.sizeMax, W.sizeStart + W.sizePerMinute * t / 60) * this.f(this.cfg.coop.enemyCountExponent);
    const size = Math.max(1, Math.floor(base) + (Math.random() < base % 1 ? 1 : 0));
    const dMax = Math.min(W.directionsMax, W.directionsStart + Math.floor(t / W.directionEvery));
    const k = Math.max(1, Math.min(size, Math.floor(rand(Math.max(1, dMax - 1), dMax + .999))));
    const a0 = rand(0, Math.PI * 2), dirs: number[] = [], groups: EnemyType[][] = [];
    for (let i = 0; i < k; i++) { dirs.push(a0 + i * Math.PI * 2 / k + rand(-.35, .35)); groups.push([]); }
    for (let i = 0; i < size; i++) groups[i % k].push(this.pickType());
    return { dirs, groups };
  }
  private waves(dt: number) {
    const W = this.cfg.waves;
    this.waveT -= dt;
    if (!this.planned && this.waveT <= W.warnTime) {
      this.planned = this.planWave();
      this.emit({ k: 'warn', d: this.planned.dirs.map(r2), ty: this.planned.groups.map(g => g.map(t => ENEMIES.indexOf(t))), w: W.warnTime });
    }
    if (this.waveT <= 0 && this.planned) {
      const spread = W.directionSpread * Math.PI / 180;
      this.planned.dirs.forEach((a, i) => {
        let at = this.time;
        for (const type of this.planned!.groups[i]) { this.spawnQueue.push({ at, type, angle: a + rand(-spread, spread) }); at += rand(W.staggerMin, W.staggerMax); }
      });
      this.planned = null;
      const k = Math.min(1, this.time / W.rampTime);
      this.waveT = (W.gapStart + (W.gapEnd - W.gapStart) * k) * rand(1 - W.gapJitter, 1 + W.gapJitter);
    }
    const cap = this.cfg.enemies.maxAlive * this.f(this.cfg.coop.enemyCountExponent);
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i]; if (s.at > this.time) continue;
      this.spawnQueue.splice(i, 1);
      if (this.enemies.length < cap) this.spawnEnemy(s.type, s.angle);
    }
  }

  // ---------- per-player control ----------
  private updatePlayer(p: Player, dt: number) {
    const P = this.cfg.player, it = p.intent;
    p.flash -= dt; p.swing -= dt;
    if (!p.alive) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) { p.alive = true; p.hp = P.hp; p.x = 0; p.z = 0; this.burst(0, .6, 0, 0xffe0a0, 40, 3, .2, .8); this.snd('respawn'); }
      return;
    }
    let mx = it.mx, mz = it.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    p.stun -= dt;
    this.tickPoison(p, dt, d => this.hurtPlayer(p, d, 'v'));
    if (!p.alive) return;
    if (p.kb) { const s = Math.min(p.kb.left, 12 * dt); p.x += p.kb.dx * s; p.z += p.kb.dz * s; p.kb.left -= s; if (p.kb.left <= 0) p.kb = null; }
    else if (p.stun <= 0 && ml > .05) { p.x += mx * P.speed * dt; p.z += mz * P.speed * dt; p.walk += dt * 10 * Math.min(1, ml); if (!it.aim && !it.fire) p.face = Math.atan2(mx, mz); }
    [p.x, p.z] = this.clampArena(p.x, p.z);
    for (const f of this.fields) { const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < .75) { const k = (.75 - d) / (d || 1); p.x += (p.x - f.x) * k; p.z += (p.z - f.z) * k; } }

    p.rakeCd -= dt; for (const id of SKILLS) p.skills[id].cdT = Math.max(0, p.skills[id].cdT - dt);
    // active weapon: auto-switch when empty, cycle on request
    if (p.active !== 'rake' && this.isEmpty(p, p.active)) p.active = this.nextAvailable(p, p.active, true);
    if (it.cycle !== p.lastCycle) { p.lastCycle = it.cycle; p.active = this.nextAvailable(p, p.active, false); this.emit({ k: 'cycle', p: p.id }); }
    const fw: Weapon | null = it.fire === 'active' ? p.active : it.fire;
    for (const id of SKILLS) if (fw !== id) p.skills[id].firing = false;
    if (p.stun > 0) return;
    if (it.aim && Math.hypot(it.ax, it.az) > .01) { const l = Math.hypot(it.ax, it.az); p.aimX = it.ax / l; p.aimZ = it.az / l; p.face = Math.atan2(p.aimX, p.aimZ); }
    if (fw) {
      if (fw === 'rake') { if (p.rakeCd <= 0) { const d = this.aimDir(p, this.cfg.rake.range); this.rakeAttack(p, d[0], d[1]); } }
      else this.tryFire(p, fw);
    }
    if (it.tapSeq !== p.lastTap) {
      p.lastTap = it.tapSeq;
      const w = it.tapW;
      if (w === 'rake') { if (p.rakeCd <= 0) { const d = this.aimDir(p, this.cfg.rake.range, false); this.rakeAttack(p, d[0], d[1]); } }
      else if (w) { const s = this.stats(w, p.skills[w]); this.tryFire(p, w, this.aimDir(p, w === 'cab' ? s.throwDist : s.range, false)); }
    }
  }
  /** next weapon in order rake → asp → cran → cab that is available (skills: ready). */
  nextAvailable(p: Player, from: Weapon, skipRake: boolean): Weapon {
    const i0 = WEAPONS.indexOf(from);
    for (let k = 1; k <= WEAPONS.length; k++) {
      const w = WEAPONS[(i0 + k) % WEAPONS.length];
      if (w === 'rake') { if (!skipRake) return 'rake'; continue; }
      if (w !== from && this.isReady(p, w)) return w;
    }
    return 'rake';
  }

  // ---------- main update ----------
  update(dt: number) {
    if (this.phase !== 'play' || this.paused) return;
    this.time += dt;
    for (const p of this.players) this.updatePlayer(p, dt);
    // fields
    for (const f of this.fields) {
      this.tickPoison(f, dt, d => this.hurtField(f, d));
      if (f.alive) { f.t -= dt; if (f.t <= 0) { f.t += this.cfg.plants[f.type].interval; this.produce(f); } }
      f.shake = Math.max(0, f.shake - dt);
    }
    // fruit
    this.mergeT -= dt; if (this.mergeT <= 0) { this.mergeT = this.cfg.fruit.mergeCheck; this.mergeFruit(); }
    for (let i = this.merges.length - 1; i >= 0; i--) {
      const mg = this.merges[i]; mg.t -= dt; if (mg.t > 0) continue; this.merges.splice(i, 1);
      const fr = this.spawnFruit(mg.f.type, mg.tier, mg.x, .3, mg.z, mg.x, mg.z, mg.f.slot); fr.vx = fr.vz = 0; fr.vy = 3;
      this.emit({ k: 'merge', x: r2(mg.x), z: r2(mg.z), t: FRUITS.indexOf(mg.f.type) });
    }
    const PL = this.cfg.player;
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const fr = this.fruits[i];
      if (fr.state === 'fly') {
        fr.vy -= 9.8 * dt; fr.x += fr.vx * dt; fr.y += fr.vy * dt; fr.z += fr.vz * dt;
        if (fr.y <= fr.r && fr.vy < 0) { if (fr.bounce < 1) { fr.vy *= -.32; fr.vx *= .4; fr.vz *= .4; fr.bounce++; fr.y = fr.r; } else { fr.y = fr.r; fr.state = 'ground'; } }
      } else if (fr.state === 'ground') {
        let best: Player | null = null, bd = 1e9;
        for (const p of this.players) if (p.alive) { const d = dist(fr, p); if (d < bd) { bd = d; best = p; } }
        if (best) {
          if (bd < PL.pickupRadius + fr.tier * PL.pickupPerTier) { fr.state = 'collect'; fr.ct = 0; fr.fx = fr.x; fr.fy = fr.y; fr.fz = fr.z; fr.collector = best; }
          else if (bd < PL.magnetRadius) { fr.x += (best.x - fr.x) / bd * PL.magnetSpeed * dt; fr.z += (best.z - fr.z) / bd * PL.magnetSpeed * dt; }
        }
      } else if (fr.state === 'collect') {
        const p = fr.collector!; fr.ct += dt; const k = Math.min(1, fr.ct / .14);
        fr.x = fr.fx + (p.x - fr.fx) * k; fr.y = fr.fy + (.9 - fr.fy) * k; fr.z = fr.fz + (p.z - fr.fz) * k;
        if (k >= 1) { this.fruits.splice(i, 1); if (this.players.includes(p)) this.collectFruit(fr, p); }
      } else if (fr.state === 'merge') {
        fr.mt += dt; const k = Math.min(1, fr.mt / .25); fr.x += (fr.tx - fr.x) * k * .5; fr.z += (fr.tz - fr.z) * k * .5; fr.y = fr.r + Math.sin(k * Math.PI) * .4;
        if (k >= 1) this.fruits.splice(i, 1);
      }
    }
    // enemies
    this.waves(dt);
    for (const e of [...this.enemies]) if (!e.dead) this.updateEnemy(e, dt);
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) {
      const a = en[i], b = en[j]; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r + b.r;
      if (d < m && d > .001) { const k = (m - d) / d * .5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
    for (const e of en) if (e.type !== 'sheep' || e.state !== 'charge') for (const f of this.fields) {
      if (!f.alive) continue; const d = dist(e, f), m = 1.0 + e.r * .5;
      if (d < m && d > .001) { const k = (m - d) / d; e.x += (e.x - f.x) * k; e.z += (e.z - f.z) * k; }
    }
    this.updateProjs(dt);
  }
  private updateProjs(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i]; const step = Math.min(pr.speed * dt, pr.left);
      const ax = pr.x, az = pr.z; let done = false; const hits: [number, Enemy][] = [];
      for (const e of this.enemies) {
        if (e.dead || pr.hit.has(e)) continue;
        const ex = e.x - ax, ez = e.z - az; const tp = clamp(ex * pr.dx + ez * pr.dz, 0, step);
        if (Math.hypot(e.x - (ax + pr.dx * tp), e.z - (az + pr.dz * tp)) < e.r + .1 && !this.airborne(e)) hits.push([tp, e]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (const [, e] of hits) {
        pr.hit.add(e);
        if (pr.kind === 'asp') {
          this.hurtEnemy(e, pr.dmg, { color: 'g' }); this.burst(e.x, .4, e.z, 0x9cff60, 6, 2, .1, .3); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 0 });
          if (pr.pierceLeft > 0) { pr.pierceLeft--; pr.dmg *= pr.pf; } else { done = true; break; }
        } else {
          this.hurtEnemy(e, pr.dmg, { bleed: true, color: 'p' });
          this.emit({ k: 'decal', x: r2(e.x), z: r2(e.z), c: 0x7a0a14, r: r2(rand(.08, .16)), l: 5, op: .7 });
          this.burst(e.x, .35, e.z, 0xff2040, 5, 1.5, .1, .3, { g: 5 }); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 1 });
          done = true; break;
        }
      }
      pr.x = ax + pr.dx * step; pr.z = az + pr.dz * step; pr.left -= step;
      if (pr.kind === 'cran') { const k = 1 - pr.left / pr.total; pr.y = .75 * (1 - k) + Math.sin(k * Math.PI) * .25 + .03; }
      if (!done && pr.left <= 1e-4) {
        done = true;
        if (pr.kind === 'cran') {
          this.emit({ k: 'splat', x: r2(pr.x), z: r2(pr.z) });
          if (Math.random() < pr.mine) this.mines.push({ id: this.nid++, x: pr.x, z: pr.z, dmg: pr.dmg, t: this.cfg.skills.cran.mineLifetime });
        }
      }
      if (done) this.projs.splice(i, 1);
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]; b.t += dt; const k = Math.min(1, b.t / b.flight);
      b.x = b.fx + (b.tx - b.fx) * k; b.z = b.fz + (b.tz - b.fz) * k; b.y = b.fy + (.14 - b.fy) * k + Math.sin(k * Math.PI) * (b.mini ? .6 : 1.4);
      if (b.t >= b.fuse) { this.explode(b); this.bombs.splice(i, 1); }
    }
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mn = this.mines[i]; mn.t -= dt;
      const trig = mn.t <= 0 ? null : this.enemies.find(e => !e.dead && !this.airborne(e) && dist(e, mn) < .2 + e.r);
      if (trig) {
        for (const e of [...this.enemies]) if (!e.dead && dist(e, mn) < .2 + e.r) this.hurtEnemy(e, mn.dmg, { color: 'p' });
        this.burst(mn.x, .15, mn.z, 0xff3050, 14, 2, .14, .35);
        this.emit({ k: 'decal', x: r2(mn.x), z: r2(mn.z), c: 0xff3050, r: .05, l: .3, ring: 1, add: 1, grow: .3 });
        this.snd('boomS');
      }
      if (trig || mn.t <= 0) this.mines.splice(i, 1);
    }
  }
  gameOver() { this.phase = 'over'; this.emit({ k: 'over' }); }

  // ---------- level-up offers ----------
  offers(p: Player): Offer[] {
    const N = this.cfg.names, U = this.cfg.upgrades, PL = this.cfg.plants;
    const pool: (Offer & { w: number })[] = [], prio: Offer[] = [];
    const nf = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    for (const id of SKILLS) {
      const s = p.skills[id];
      if (this.fieldOf(id) && !s.learned && p.collected[id] >= (PL[id].unlockAt || 0)) {
        const st = this.stats(id, s);
        const l1 = id === 'cab' ? `{dmg} ${nf(st.dmg)} · {radius} ${nf(st.range * 100)} cm` : `{dmg} ${nf(st.dmg)}${id === 'cran' ? ' ×' + st.pellets : ''} · {range} ${nf(st.range, 0)} m`;
        prio.push({ key: 'learn_' + id, cat: 'skill', pic: 'skill_' + id, title: N.skills[id], lines: [l1, `${st.cost} {${id}} / {cd} ${nf(st.cd, 1)} s`] });
      }
    }
    const free = this.fields.length < this.slots.length;
    for (const id of SKILLS) if (free && !this.fieldOf(id)) {
      pool.push({ key: 'field_' + id, cat: 'field', w: U.newFieldWeight, pic: 'field_' + id, title: N.fields[id], lines: [`1 {${id}} / ${nf(PL[id].interval)} s`, `Unlock: ${N.skills[id]}`] });
    }
    for (const id of SKILLS) {
      const s = p.skills[id]; if (!s.learned) continue;
      const a = this.stats(id, s);
      const mk = (key: string, mut: (x: SkillState) => void, line: (b: SkillStats) => string) => {
        const s2 = { ...s }; mut(s2); const b = this.stats(id, s2);
        pool.push({ key, cat: 'skill', w: 1, pic: 'skill_' + id, title: N.skills[id], lines: [line(b)] });
      };
      mk(id + '_dmg', x => x.lvDmg++, b => `{dmg} ${nf(a.dmg, 1)} → ${nf(b.dmg, 1)}`);
      mk(id + '_rng', x => x.lvRange++, b => id === 'cab' ? `{radius} ${nf(a.range * 100)} → ${nf(b.range * 100)} cm` : `{range} ${nf(a.range, 1)} → ${nf(b.range, 1)} m`);
      mk(id + '_cd', x => x.lvCd++, b => `{cd} ${nf(a.cd, 2)} → ${nf(b.cd, 2)} s`);
      if (id === 'asp') {
        if (s.pierce < (U.aspPierce.max || 4)) mk('asp_pierce', x => x.pierce += U.aspPierce.step, b => `{pierce} ${a.pierce} → ${b.pierce}`);
        if (s.pierceBonus < (U.aspPierceBonus.maxLevel || 5)) mk('asp_pb', x => x.pierceBonus++, b => `{pierce} ${nf(a.pf * 100)} → ${nf(b.pf * 100)} %`);
      }
      if (id === 'cran') {
        if (s.extraPel < (U.cranPellets.maxLevel || 3)) mk('cran_pel', x => x.extraPel++, b => `{pellet} ${a.pellets} → ${b.pellets}`);
        if (s.mineLv < (U.cranMine.maxLevel || 5)) mk('cran_mine', x => x.mineLv++, b => `{mine} ${nf(a.mine * 100)} → ${nf(b.mine * 100)} %`);
      }
      if (id === 'cab' && s.minis < (U.cabMini.maxLevel || 5)) mk('cab_mini', x => x.minis += U.cabMini.step, b => `{mini} ${a.minis} → ${b.minis}`);
    }
    for (const f of FRUITS) if (this.fieldOf(f) && this.yieldLv[f] < (U.doubleHarvest.maxLevel || 6)) {
      const lv = this.yieldLv[f], st = U.doubleHarvest.step;
      pool.push({ key: 'yield_' + f, cat: 'plant', w: 1, pic: 'plant_' + f, title: N.plants[f], lines: [`{x2} ${nf(lv * st * 100)} → ${nf((lv + 1) * st * 100)} %`] });
    }
    const out: Offer[] = prio.slice(0, U.offersPerLevel);
    while (out.length < U.offersPerLevel && pool.length) {
      const tot = pool.reduce((a, o) => a + o.w, 0); let r = Math.random() * tot, k = 0;
      for (; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) break; }
      const { w, ...o } = pool.splice(Math.min(k, pool.length - 1), 1)[0]; void w; out.push(o);
    }
    const T = U.herbalTea;
    while (out.length < U.offersPerLevel) out.push({ key: 'tea_' + out.length, cat: 'misc', pic: 'tea', title: N.tea, lines: [`{heart} +${T.playerHeal} · {fieldhp} +${T.fieldHeal}`] });
    return out;
  }
  applyOffer(p: Player, key: string) {
    const U = this.cfg.upgrades;
    const [a, b] = key.split('_') as [string, string];
    const tea = () => { p.hp = Math.min(this.cfg.player.hp, p.hp + U.herbalTea.playerHeal); this.fields.forEach(f => f.alive && (f.hp = Math.min(f.maxHp, f.hp + U.herbalTea.fieldHeal))); };
    if (a === 'learn') { p.skills[b as SkillId].learned = true; return; }
    if (a === 'field') {
      const t = b as FruitType;
      if (!this.fieldOf(t) && this.fields.length < this.slots.length) this.addField(t);
      else if (this.yieldLv[t] < (U.doubleHarvest.maxLevel || 6)) this.yieldLv[t]++; // coop: someone else was faster
      else tea();
      return;
    }
    if (a === 'yield') { if (this.yieldLv[b as FruitType] < (U.doubleHarvest.maxLevel || 6)) this.yieldLv[b as FruitType]++; else tea(); return; }
    if (a === 'tea') { tea(); return; }
    const s = p.skills[a as SkillId];
    switch (key) {
      case 'asp_dmg': case 'cran_dmg': case 'cab_dmg': s.lvDmg++; break;
      case 'asp_rng': case 'cran_rng': case 'cab_rng': s.lvRange++; break;
      case 'asp_cd': case 'cran_cd': case 'cab_cd': s.lvCd++; break;
      case 'asp_pierce': s.pierce += U.aspPierce.step; break;
      case 'asp_pb': s.pierceBonus++; break;
      case 'cran_pel': s.extraPel++; break;
      case 'cran_mine': s.mineLv++; break;
      case 'cab_mini': s.minis += U.cabMini.step; break;
    }
  }

  // ---------- snapshot ----------
  snapshot(): Snap {
    const ev = this.events; this.events = [];
    const me: Record<number, Priv> = {};
    for (const p of this.players) {
      const st = SKILLS.map(id => this.stats(id, p.skills[id]));
      me[p.id] = {
        am: SKILLS.map(id => p.ammo[id]), ln: SKILLS.map(id => p.skills[id].learned ? 1 : 0),
        nd: st.map(s => s.need), co: st.map(s => s.cost), rg: st.map(s => r2(s.range)), cd: SKILLS.map((id, i) => r2(p.skills[id].cdT / st[i].cd)),
        ac: WEAPONS.indexOf(p.active), rk: r2(Math.max(0, p.rakeCd / this.cfg.rake.cooldown)),
        of: p.offers, pk: p.picked ? 1 : 0,
      };
    }
    const sw = this.cfg.rake.swingTime;
    return {
      t: r2(this.time), ph: this.phase, lv: this.level, xp: Math.floor(this.xp), nx: this.need(this.level), ki: this.kills, cx: this.collectedXP, n: this.n,
      pl: this.players.map(p => ({
        id: p.id, c: p.color, x: r2(p.x), z: r2(p.z), f: r2(p.face), hp: Math.ceil(p.hp), mhp: this.cfg.player.hp, al: p.alive ? 1 : 0, st: p.stun > 0 ? 1 : 0,
        sw: p.swing > 0 ? r2(1 - p.swing / sw) : 0, sd: r2(p.swingDir), wk: r2(p.walk), rs: Math.ceil(p.respawnT), po: p.poison.length, fl: p.flash > 0 ? 1 : 0,
      })),
      en: this.enemies.map(e => {
        let fl = 0, aux = 0, aux2 = 0;
        if (e.stun > 0) fl |= EF.stun; if (e.bleed > 0) fl |= EF.bleed; if (e.flash > 0) fl |= EF.flash;
        if (this.airborne(e)) fl |= EF.air; if (e.fleeing) fl |= EF.flee; if (e.lunge > 0) fl |= EF.lunge;
        if (e.hurtOnce || (e.shieldMax && e.shield < e.shieldMax)) fl |= EF.bar;
        if (e.type === 'toad') { aux = r2(e.hop % 1); if (e.tongueT > 0) { fl |= EF.tongue; aux2 = r2(Math.sin(clamp(e.tongueT / .35, 0, 1) * Math.PI) * e.tongueLen); } }
        if (e.type === 'sheep') { if (e.state === 'windup') { fl |= EF.windup; aux = r2(1 - e.st / this.cfg.enemies.sheep.windup!); aux2 = r2(Math.atan2(e.cdx, e.cdz)); } if (e.state === 'charge') fl |= EF.charge; }
        return [e.id, ENEMIES.indexOf(e.type), r2(e.x), r2(e.z), r2(e.face), r2(e.hp / e.maxHp), e.shieldMax ? r2(e.shield / e.shieldMax) : -1, fl, e.carry.map(f => FRUITS.indexOf(f.type)).join(''), aux, aux2] as ESnap;
      }),
      fr: this.fruits.filter(f => f.state !== 'carried').map(f => [f.id, FRUITS.indexOf(f.type), f.tier, r2(f.x), r2(f.y), r2(f.z)]),
      pj: this.projs.map(p => [p.id, p.kind === 'asp' ? 0 : 1, r2(p.x), r2(p.y), r2(p.z), r2(Math.atan2(p.dx, p.dz))]),
      bo: this.bombs.map(b => [b.id, r2(b.x), r2(b.y), r2(b.z), b.mini ? 1 : 0, b.t >= b.flight ? 1 : 0]),
      mi: this.mines.map(m => [m.id, r2(m.x), r2(m.z)]),
      fi: this.fields.map(f => [f.slot, FRUITS.indexOf(f.type), r2(f.hp / f.maxHp), f.alive ? 1 : 0, r2(f.shake)]),
      me, ev,
    };
  }
  slotPos() { return this.slots; }
}
