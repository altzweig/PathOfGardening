// Host-authoritative game simulation. Pure data, no rendering: the view and the network
// only ever see Snap objects + events produced here.
import { Balancing, coopF, ENEMIES, EnemyType, FRUITS, FruitType, isWeaponFruit, SKILLS, SkillId, Weapon, WEAPONS } from '../config';
import { emptyIntent, EF, ESnap, Ev, Intent, Offer, Priv, Snap } from './snap';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()); // standard normal (Box-Muller)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const SQ3 = Math.sqrt(3);
const FRUIT_BURST: Record<FruitType, number> = { blue: 0x4a6cff, asp: 0x9cff60, cran: 0xd0203a, cab: 0x6fbf3a, lemon: 0xffe040, chili: 0xff3a10, nut: 0xb07a3a };
// ---------- hex field grid (pointy-top axial, fields touch each other) ----------
/** forest: slot outside the garden (in the forest), only for forest field types (nut tree) */
export interface Slot { q: number; r: number; x: number; z: number; forest?: boolean }
export const hexR = (cfg: Balancing) => cfg.arena.fieldSize / 2; // corner radius
export function slotPositions(cfg: Balancing): Slot[] {
  const H = hexR(cfg), out: Slot[] = [];
  for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > 5) continue;
    out.push({ q, r, x: H * SQ3 * (q + r / 2), z: H * 1.5 * r });
  }
  // innermost slots first (ties broken by angle so it is deterministic)
  out.sort((a, b) => (Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)) || (Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)));
  const all: Slot[] = out.slice(0, cfg.arena.fieldSlots);
  // forest slots: evenly around the garden in the forest belt (not on the hex grid)
  const F = cfg.forest;
  if (F) for (let i = 0; i < F.slots; i++) {
    const a = (F.angleOffset * Math.PI / 180) + i / F.slots * Math.PI * 2;
    all.push({ q: 1000 + i, r: 0, x: Math.cos(a) * F.radius, z: Math.sin(a) * F.radius, forest: true });
  }
  return all;
}
/** forest slots take only forest types (nut tree), garden slots everything else */
export const forestType = (cfg: Balancing, t: FruitType) => !!cfg.forest?.types.includes(t);
export const slotFits = (cfg: Balancing, s: Slot | undefined, t: FruitType) => !!s && !!s.forest === forestType(cfg, t);
/** index of the slot whose hexagon contains the point, or -1 */
export function slotAt(cfg: Balancing, slots: Slot[], x: number, z: number) {
  const H = hexR(cfg);
  for (let i = 0; i < slots.length; i++) if (slots[i].forest && Math.hypot(slots[i].x - x, slots[i].z - z) < H * .9) return i;
  const fq = (SQ3 / 3 * x - z / 3) / H, fr = (2 / 3 * z) / H, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return slots.findIndex(sl => sl.q === q && sl.r === r);
}
/** corner k of a pointy-top hex; increasing k = clockwise as seen from the camera (top = -z) */
export const cornerAngle = (k: number) => -Math.PI / 2 + k * Math.PI / 3;
export const hexDist =(a: Slot, b: Slot) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

interface SkillState { learned: boolean; lvDmg: number; lvRange: number; lvCd: number; pierce: number; pierceBonus: number; extraPel: number; mineLv: number; minis: number; sizeLv: number; tgtLv: number; xferLv: number; sweepLv: number; tickLv: number; cdT: number; firing: boolean; burst: number; burstT: number }
interface Poison { t: number; ticks: number }
export interface Player {
  id: number; color: number; x: number; z: number; face: number; hp: number; alive: boolean; deaths: number; respawnT: number;
  stun: number; stunMax: number; kb: { dx: number; dz: number; left: number } | null; poison: Poison[]; swing: number; swingDir: number; walk: number; flash: number; tillT: number;
  ammo: Record<SkillId, number>; collected: Record<SkillId, number>; skills: Record<SkillId, SkillState>;
  rakeCd: number; aimX: number; aimZ: number; active: Weapon; intent: Intent; lastTap: number; lastCycle: number;
  offers: Offer[] | null; picked: boolean; fresh: boolean; placing: FruitType | null;
  slots: SkillId[]; // learned weapons in the order they were learned (HUD positions)
  fieldLock: number; taken: Record<string, number>; rakeLv: { dmg: number; rng: number; wid: number; cd: number };
  /** flamethrower: sweep phase 0..1 (back and forth), spin angle (circle mode, rad), s the flame stays visible, last flame angle (rad) */
  xbT: number; flPh: number; flSpin: number; flOn: number; flAng: number; flPrevSpin: number; flHit: number; flBase: number;
  /** collected nuts (nut trees in the forest) */
  nuts: number;
}
interface Field { slot: number; type: FruitType; x: number; z: number; hp: number; maxHp: number; alive: boolean; t: number; shake: number; poison: Poison[]; rarity: number; prog: number; edge: number; tilledT: number; tilledBy: number; starter: boolean; goneT?: number }
interface BossState { st: 'collect' | 'charge' | 'attack'; t: number; berries: number; atk: number; spawned: number; next: number; hx: number; hz: number; hdx: number; hdz: number }
interface BerryBomb { id: number; fx: number; fz: number; x: number; z: number; flight: number; t: number; fuse: number; rain: boolean; dmg: number; r: number }
interface Pool { id: number; x: number; z: number; r: number; t: number; tickT: number; ticks: number; dmg: number }
interface Fruit {
  id: number; type: FruitType; tier: number; val: number; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  state: 'fly' | 'ground' | 'collect' | 'merge' | 'carried'; src: number; born: number; bounce: number; r: number;
  ct: number; fx: number; fz: number; fy: number; collector: Player | null; tx: number; tz: number; mt: number;
}
type Target = { kind: 'player'; p: Player } | { kind: 'fruit'; fr: Fruit } | { kind: 'field'; f: Field } | { kind: 'flee' } | { kind: 'wander'; x: number; z: number } | null;
interface Enemy {
  id: number; type: EnemyType; x: number; z: number; hp: number; maxHp: number; shield: number; shieldMax: number; shieldT: number; r: number; speed: number;
  stun: number; stunMax: number; bleed: number; bleedT: number; flash: number; atkT: number; think: number; target: Target; carry: Fruit[]; fleeing: boolean; face: number;
  walk: number; hop: number; state: 'approach' | 'windup' | 'charge' | 'rest' | 'climb' | 'perch' | 'jump'; st: number; cdx: number; cdz: number; hitThisCharge: boolean;
  tongueT: number; tongueCd: number; tongueLen: number; lunge: number; dead: boolean; hurtOnce: boolean; kbx: number; kbz: number; kbLeft: number; laughT: number; elite: boolean; dmgMul: number; boss?: BossState; wv: number;
  burn: number; burnT: number; burnTick: number; burnDmg: number; burnLeft: number; burnSum: number; burnNum: number; // flamethrower fire: stacks, s to next tick, tick interval, damage multiplier
  puff: number; // hedgehog: s into the current puff cycle
  /** squirrel: home tree, crown spot, landing spot, height above the ground */
  hx: number; hz: number; cx: number; cz: number; lx: number; lz: number; y: number;
}
interface Proj { id: number; kind: 'asp' | 'cran'; x: number; y: number; z: number; dx: number; dz: number; speed: number; left: number; total: number; dmg: number; pierceLeft: number; pf: number; mine: number; w: number; hit: Set<Enemy> }
interface Bomb { id: number; fx: number; fy: number; fz: number; tx: number; tz: number; x: number; y: number; z: number; t: number; flight: number; fuse: number; radius: number; dmg: number; minis: number; mini: boolean }
interface Mine { id: number; x: number; z: number; dmg: number; t: number } // missed cranberry lying on the ground until it pops
interface PendingSpawn { at: number; type: EnemyType; angle: number }
interface PlannedWave { dirs: number[]; groups: EnemyType[][] }

export interface SkillStats { dmg: number; dmgPct: number; range: number; cd: number; cost: number; need: number; shots: number; gap: number; pierce: number; pf: number; pellets: number; splash: number; minis: number; throwDist: number; width: number; size: number;
  cone: number; sweep: number; circle: boolean; spin: number; tick: number; sweepMax: boolean } // flamethrower: cone/sweep deg, spin deg/s, fire tick s

export class Sim {
  cfg: Balancing;
  time = 0; lvRound = 0; level = 1; xp = 0; pendingLv = 0; kills = 0; collectedXP = 0;
  phase: 'play' | 'lvl' | 'over' = 'play';
  paused = false;
  /** 0..1 progress of the slow-motion ramp into / out of a pause (1 = full speed) */
  ramp = 1;
  players: Player[] = [];
  fields: Field[] = []; fruits: Fruit[] = []; enemies: Enemy[] = []; projs: Proj[] = []; bombs: Bomb[] = []; mines: Mine[] = []; pools: Pool[] = []; berryBombs: BerryBomb[] = [];
  yieldLv: Record<FruitType, number> = { blue: 0, asp: 0, cran: 0, cab: 0, lemon: 0, chili: 0, nut: 0 };
  tillHealLv = 0;
  events: Ev[] = [];
  private nid = 1;
  private mergeT = 0;
  private waveT: number; private planned: PlannedWave | null = null; private spawnQueue: PendingSpawn[] = [];
  private slots: Slot[];

  constructor(cfg: Balancing) {
    this.cfg = cfg;
    this.slots = slotPositions(cfg);
    this.waveT = cfg.waves.firstWave; // countdown to wave 1 (we start "in a pause" before wave 1)
    // start fields: every second slot of the first ring around the centre, then outwards
    const ring1 = [[1, 0], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, -1]];
    const order = [...ring1.map(([q, r]) => this.slots.findIndex(s => s.q === q && s.r === r)), ...this.slots.map((_, i) => i)].filter(i => i >= 0);
    for (const i of order) { if (this.fields.length >= cfg.arena.startFields) break; if (!this.fieldAt(i)) { const sf = this.placeField(i, 'blue'); if (sf) sf.starter = true; } }
  }

  // ---------- coop scaling ----------
  get n() { return Math.max(1, this.players.length); }
  f(exp: number) { return coopF(this.n, exp); }
  need(L: number) { const X = this.cfg.xp; return Math.round((X.base * Math.pow(X.growth, L - 1) + X.linear * (L - 1)) * this.f(this.cfg.coop.xpNeedExponent)); }

  emit(e: Ev) { this.events.push(e); }
  snd(n: string, extra: Record<string, any> = {}) { this.emit({ k: 'snd', n, ...extra }); }
  /** sample sound from sounds.yaml, positioned in the world */
  sfx(s: string, x: number, z: number) { this.emit({ k: 'sfx', s, x: r2(x), z: r2(z) }); }
  burst(x: number, y: number, z: number, c: number, n: number, sp = 2, sz = .15, lf = .5, o: Record<string, number> = {}) { this.emit({ k: 'burst', x: r2(x), y: r2(y), z: r2(z), c, n, sp, sz, lf, ...o }); }
  num(x: number, z: number, v: number, c: string, big = false) { this.emit({ k: 'num', x: r2(x), z: r2(z), v: Math.round(v * 10) / 10, c, b: big ? 1 : 0 }); }

  // ---------- players ----------
  addPlayer(id: number, color: number) {
    const P = this.cfg.player, a = this.players.length * Math.PI / 2;
    const mk = (): SkillState => ({ learned: false, lvDmg: 0, lvRange: 0, lvCd: 0, pierce: this.cfg.skills.asp.pierce, pierceBonus: 0, extraPel: 0, mineLv: 0, minis: 0, sizeLv: 0, tgtLv: 0, xferLv: 0, sweepLv: 0, tickLv: 0, cdT: 0, firing: false, burst: 0, burstT: 0 });
    const p: Player = {
      id, color, x: this.players.length ? Math.cos(a) * .6 : 0, z: this.players.length ? Math.sin(a) * .6 : 0, face: 0, hp: P.hp, alive: true, deaths: 0, respawnT: 0,
      stun: 0, stunMax: 0, kb: null, poison: [], swing: 0, swingDir: 0, walk: 0, flash: 0, tillT: 0,
      ammo: { asp: 0, cran: 0, cab: 0, lemon: 0, chili: 0 }, collected: { asp: 0, cran: 0, cab: 0, lemon: 0, chili: 0 }, skills: { asp: mk(), cran: mk(), cab: mk(), lemon: mk(), chili: mk() },
      rakeCd: 0, aimX: 0, aimZ: 1, active: 'rake', intent: emptyIntent(), lastTap: 0, lastCycle: 0, offers: null, picked: false, fresh: true, placing: null, slots: [], fieldLock: 0, taken: {}, rakeLv: { dmg: 0, rng: 0, wid: 0, cd: 0 }, xbT: 0, flPh: 0, flSpin: 0, flOn: 0, flAng: 0, flPrevSpin: 0, flHit: 0, flBase: 0, nuts: 0,
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
  setIntent(id: number, it: Intent) {
    const p = this.player(id); if (!p) return;
    if (p.fresh) { p.fresh = false; p.lastTap = it.tapSeq; p.lastCycle = it.cycle; } // counters from a previous round are not presses
    p.intent = it;
  }

  // ---------- fields & fruit ----------
  fieldAt(slot: number) { return this.fields.find(f => f.slot === slot); }
  /** nut trees stand in the forest outside the garden: enemies leave them alone, they do not count for game over */
  isForest(f: Field) { return !!this.slots[f.slot]?.forest; }
  /** build on a slot: empty -> new field, same type -> rarity progress, other type (or dead) -> replace */
  placeField(slot: number, type: FruitType) {
    const s = this.slots[slot]; if (!s) return null;
    const F = this.cfg.fields; let f = this.fieldAt(slot);
    if (f && f.type === type && f.alive) {
      if (f.rarity < F.rarityCost.length) {
        f.prog++;
        if (f.prog >= F.rarityCost[f.rarity]) { f.rarity++; f.prog = 0; f.maxHp = F.hp * Math.pow(F.rarityHp, f.rarity); this.emit({ k: 'rarity', s: slot, r: f.rarity }); this.emit({ k: 'sfx', s: 'ui.rarity' }); }
      }
      f.hp = f.maxHp;
      this.burst(s.x, .4, s.z, 0xffe08a, 30, 2.5, .2, .8);
      return f;
    }
    if (f) this.fields.splice(this.fields.indexOf(f), 1);
    f = { slot, type, x: s.x, z: s.z, hp: F.hp, maxHp: F.hp, alive: true, t: rand(0, this.cfg.plants[type].interval), shake: 0, poison: [], rarity: 0, prog: 0, edge: Math.floor(rand(0, 6)), tilledT: 0, tilledBy: -1, starter: false };
    this.fields.push(f);
    this.burst(s.x, .4, s.z, 0x8fe36a, 30, 2.5, .2, .8);
    return f;
  }
  /** production multiplier: x1.5 per own rarity level, +10 % per rarity level of each adjacent field */
  prodMult(f: Field) {
    const F = this.cfg.fields, me = this.slots[f.slot];
    let nb = 0;
    for (const o of this.fields) if (o !== f && o.alive && hexDist(me, this.slots[o.slot]) === 1) nb += o.rarity;
    return Math.pow(F.rarityProduction, f.rarity) * (1 + F.neighborBonus * nb);
  }
  /** average fruit per second of a field (rarity, neighbours, double harvest, coop blueberries; without tilling) */
  rate(f: Field) {
    if (!f.alive) return 0;
    const dbl = Math.min(1, this.cfg.upgrades.doubleHarvest.step * this.yieldLv[f.type]);
    let n = (this.cfg.plants[f.type].amount || 1) * (1 + dbl);
    if (f.type === 'blue') n += this.f(this.cfg.coop.xpYieldExponent) - 1;
    return n * this.prodMult(f) / this.cfg.plants[f.type].interval;
  }
  /** types that were ever on the board (a dead field disappears, but its type still counts as owned) */
  lost = new Set<FruitType>();
  fieldOf(type: FruitType) { return !!(this.fields.find(f => f.type === type) || this.lost.has(type)); }
  place(id: number, slot: number) {
    const p = this.player(id); if (!p || !p.placing || this.phase !== 'lvl' || !slotFits(this.cfg, this.slots[slot], p.placing)) return;
    this.placeField(slot, p.placing); p.placing = null; p.picked = true;
    this.checkAllPicked();
  }
  hurtField(f: Field, dmg: number) {
    if (!f.alive || this.phase === 'over') return;
    // the starting fields only become vulnerable once every other field is gone
    if (f.starter && this.fields.some(o => !o.starter && o.alive && !this.isForest(o))) { f.shake = .12; this.emit({ k: 'imm', x: r2(f.x), z: r2(f.z) }); return; }
    f.hp -= dmg; f.shake = .25; this.sfx('plants.eaten.' + f.type, f.x, f.z);
    this.num(f.x, f.z, dmg, 'f');
    if (f.hp <= 0) {
      f.hp = 0; f.alive = false;
      this.burst(f.x, .5, f.z, 0x8a6a3a, 40, 3, .25, 1, { g: 6 });
      this.emit({ k: 'fieldDead', s: f.slot }); this.sfx('plants.die.' + f.type, f.x, f.z);
      if (this.fields.every(x => !x.alive || this.isForest(x))) { this.gameOver(); return; }
      this.deathGift(f);
    }
  }
  /** a field died: a share of the XP to the next level drops as blueberries onto the bed; the dead plant vanishes after a moment, the slot is free again */
  deathGift(f: Field) {
    const F = this.cfg.fields, tv = this.cfg.fruit.tierValue;
    f.goneT = F.deathRemoveDelay ?? 1.2;
    let v = Math.round((F.deathXpShare ?? 1 / 3) * this.need(this.level) / ((this.cfg.xp.gain ?? 1) * this.f(this.cfg.coop.xpValueExponent)));
    const H = hexR(this.cfg) * .6;
    for (let tier = tv.length - 1; tier >= 0 && v > 0; tier--) while (v >= tv[tier] || (tier === 0 && v > 0)) {
      v -= tv[tier]; const a = rand(0, 7), d = Math.sqrt(Math.random()) * H;
      this.spawnFruit('blue', tier, f.x, .7, f.z, f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, -1);
    }
    this.emit({ k: 'deathGift', s: f.slot, x: r2(f.x), z: r2(f.z) });
  }
  spawnFruit(type: FruitType, tier: number, fx: number, fy: number, fz: number, tx: number, tz: number, src: number) {
    const T = .55;
    const fr: Fruit = {
      id: this.nid++, type, tier, val: this.cfg.fruit.tierValue[tier], x: fx, y: fy, z: fz,
      vx: (tx - fx) / T, vy: (0 - fy + .5 * 9.8 * T * T) / T, vz: (tz - fz) / T,
      state: 'fly', src, born: this.time, bounce: 0, r: (type === 'cab' ? .14 : type === 'nut' ? .07 : .08) * this.cfg.fruit.tierScale[tier],
      ct: 0, fx: 0, fy: 0, fz: 0, collector: null, tx: 0, tz: 0, mt: 0,
    };
    this.fruits.push(fr); return fr;
  }
  /** harvest of a field; fromBush = shaken loose by the rake: falls out of one of the bushes instead of at the rim corner */
  produce(f: Field, fromBush = false) {
    const dbl = Math.min(1, this.cfg.upgrades.doubleHarvest.step * this.yieldLv[f.type]);
    let n = (this.cfg.plants[f.type].amount || 1) * (Math.random() < dbl ? 2 : 1);
    if (f.type === 'lemon') this.emit({ k: 'lemonZap', s: f.slot }); // lightning jumps between the lemons
    if (f.type === 'chili') this.emit({ k: 'chiliGlow', s: f.slot }); // the bed glows up like lava (breathing)
    if (f.type === 'blue') { // coop: more blueberries
      const extra = this.f(this.cfg.coop.xpYieldExponent) - 1;
      n += Math.floor(extra) + (Math.random() < extra % 1 ? 1 : 0);
    }
    // the energy pulse on the rim reached the next corner: the harvest drops there
    f.edge = (f.edge + 1) % 6;
    const H = hexR(this.cfg);
    if (this.isForest(f)) { // tree: nuts drop out of the crown and roll a bit around the trunk (no magnet: walk there to pick them up)
      const [r0, r1] = this.cfg.plants[f.type].dropRadius || [.5, 1.6];
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), d = rand(r0, r1);
        const [tx, tz] = this.clampArena(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d); // never out of reach behind the forest edge
        this.spawnFruit(f.type, 0, f.x + Math.cos(a) * d * .5, 2.2, f.z + Math.sin(a) * d * .5, tx, tz, f.slot);
      }
    } else if (fromBush) { // same clump layout as the view (3 clumps at 0.42 H)
      for (let i = 0; i < n; i++) {
        const k = Math.floor(rand(0, 3)), ba = k / 3 * Math.PI * 2 + .5, bx = f.x + Math.cos(ba) * H * .42, bz = f.z + Math.sin(ba) * H * .42;
        const a = rand(0, Math.PI * 2), d = rand(.25, .7);
        this.spawnFruit(f.type, 0, bx + rand(-.2, .2), .75, bz + rand(-.2, .2), bx + Math.cos(a) * d, bz + Math.sin(a) * d, f.slot);
      }
    } else {
      const ca = cornerAngle(f.edge), cx = f.x + Math.cos(ca) * H, cz = f.z + Math.sin(ca) * H;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), d = rand(0, this.cfg.fruit.cornerScatter);
        this.spawnFruit(f.type, 0, cx, .5, cz, cx + Math.cos(a) * d, cz + Math.sin(a) * d, f.slot);
      }
    }
    f.shake = .18; this.sfx('plants.produce.' + f.type, f.x, f.z);
  }
  collectFruit(fr: Fruit, p: Player) {
    const v = fr.val;
    if (fr.type === 'blue') { const xv = v * (this.cfg.xp.gain ?? 1) * this.f(this.cfg.coop.xpValueExponent); this.collectedXP += v; this.addXP(xv); }
    else if (fr.type === 'nut') p.nuts += v;
    else if (isWeaponFruit(fr.type)) { p.ammo[fr.type] += v; p.collected[fr.type] += v; }
    this.emit({ k: 'collect', p: p.id, t: FRUITS.indexOf(fr.type), tier: fr.tier, x: r2(p.x), z: r2(p.z) });
  }
  mergeFruit() {
    const M = this.cfg.fruit.mergeCount;
    for (const f of this.fields) for (let tier = 0; tier < this.cfg.fruit.tierValue.length - 1; tier++) {
      const list = this.fruits.filter(x => x.src === f.slot && x.type === f.type && x.state === 'ground' && x.tier === tier);
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
    this.phase = 'lvl'; this.lvRound++; this.emit({ k: 'sfx', s: 'ui.levelup' });
    for (const p of this.players) { p.offers = this.offers(p); p.picked = false; p.intent = { ...emptyIntent(), tapSeq: p.lastTap, cycle: p.lastCycle }; for (const id of SKILLS) p.skills[id].firing = false; }
    this.emit({ k: 'lvl' });
  }
  pick(id: number, key: string) {
    const p = this.player(id); if (!p || this.phase !== 'lvl' || p.picked || !p.offers) return;
    const o = p.offers.find(x => x.key === key); if (!o) return;
    p.taken[key] = (p.taken[key] || 0) + 1;
    this.applyOffer(p, key);
    if (p.placing) return; // field card: player now chooses where to build (see place())
    p.picked = true;
    this.checkAllPicked();
  }
  private checkAllPicked() {
    if (this.players.some(p => !p.picked)) return;
    this.pendingLv--;
    if (this.pendingLv > 0) { this.lvRound++; for (const p of this.players) { p.offers = this.offers(p); p.picked = false; } this.emit({ k: 'lvl' }); }
    else { this.phase = 'play'; for (const p of this.players) { p.offers = null; p.picked = false; } }
  }

  // ---------- skill stats ----------
  stats(id: SkillId, s: SkillState): SkillStats {
    const S = this.cfg.skills, U = this.cfg.upgrades;
    const B = S[id] as any;
    const dm = 1 + U.damagePerLevel * s.lvDmg, rm = 1 + U.rangePerLevel * s.lvRange, cd = B.cooldown * Math.pow(1 - U.cooldownPerLevel, s.lvCd);
    const range = (id === 'cab' ? S.cab.radius : B.range) * rm; // lemon: range to the first target
    const shots = id === 'asp' ? Math.max(1, S.asp.burstShots || 1) : 1; // crossbow: cd = one whole salvo
    const size = 1 + U.aspSize.step * s.sizeLv;
    const fl = this.chiliGeom(s.sweepLv), C = S.chili, tick = Math.max(U.chiliTick.min, C.burnTick * Math.pow(U.chiliTick.factor, s.tickLv));
    return {
      ...fl, tick,
      dmg: B.damage * dm, dmgPct: dm, range, cd, cost: B.ammoPerShot,
      need: Math.ceil(S.readySeconds / cd - 1e-9) * B.ammoPerShot * shots, shots, gap: S.asp.burstGap * cd / S.asp.cooldown,
      pierce: s.pierce, pf: Math.min(1, S.asp.pierceFactor + U.aspPierceBonus.step * s.pierceBonus),
      // shotgun: random spread (normal distribution, cut at the max cone), +1 pellet per upgrade; missed berries pop for splash x damage
      pellets: S.cran.pellets + U.cranPellets.step * s.extraPel, splash: Math.min(1, S.cran.splashDamage + U.cranSplash.step * s.mineLv),
      minis: s.minis, throwDist: S.cab.throwDistance, width: S.asp.width * size, size,
    };
  }
  /** flamethrower geometry for a sweep level: oscillating sweep (+30 deg / +5 deg cone per level, one sweep always takes sweepPeriod),
   *  from 360 deg on it spins in a circle (+50 % speed), then +10 deg cone / +10 % speed per level until the cone is 360 deg */
  chiliGeom(lv: number) {
    const C = this.cfg.skills.chili, U = this.cfg.upgrades.chiliSweep;
    const k0 = Math.max(0, Math.ceil((360 - C.sweep) / U.sweepStep - 1e-9)); // level at which the sweep reaches 360 deg
    if (lv < k0) { const sweep = C.sweep + U.sweepStep * lv; return { cone: C.cone + U.coneStep * lv, sweep, circle: false, spin: 2 * sweep / C.sweepPeriod, sweepMax: false }; }
    const n = lv - k0, cone = Math.min(U.maxCone, C.cone + U.coneStep * k0 + U.circleConeStep * n);
    return { cone, sweep: 360, circle: true, spin: 2 * 360 / C.sweepPeriod * (1 + U.circleSpeedBonus + U.circleSpeedStep * n), sweepMax: cone >= U.maxCone };
  }
  /** rake stats per player (rake upgrades) */
  rakeStats(p: Player) {
    const R = this.cfg.rake, U = this.cfg.upgrades;
    return { dmg: R.damage * (1 + U.rakeDamage.step * p.rakeLv.dmg), range: R.range + U.rakeRange.step * p.rakeLv.rng, width: R.width + (U.rakeWidth?.step ?? 0) * (p.rakeLv.wid || 0), kb: R.knockback, cd: R.cooldown * Math.pow(1 - (U.rakeSpeed?.step ?? 0), p.rakeLv.cd || 0) };
  }
  /** can fire whenever there is ammo for one shot ("ready" is only the HUD/weapon-cycle threshold) */
  /** at most weaponSlots.max weapons besides the rake; once reached, no other weapons, their fields or upgrades are offered */
  get maxWeapons() { return this.cfg.weaponSlots?.max ?? 3; }
  equipped(p: Player, id: SkillId) { return p.skills[id].learned; }
  private learn(p: Player, id: SkillId) { p.skills[id].learned = true; if (!p.slots.includes(id)) p.slots.push(id); }
  /** fruit type whose weapon this player can no longer take (weapon limit reached) */
  private closedType(p: Player, t: FruitType) { return isWeaponFruit(t) && !p.skills[t].learned && SKILLS.filter(id => p.skills[id].learned).length >= this.maxWeapons; }
  canFire(p: Player, id: SkillId) {
    const s = p.skills[id]; if (!this.equipped(p, id)) return false;
    return p.ammo[id] >= this.stats(id, s).cost;
  }
  isReady(p: Player, id: SkillId) { const s = p.skills[id]; return this.equipped(p, id) && p.ammo[id] >= this.stats(id, s).need; }
  isEmpty(p: Player, id: SkillId) { const s = p.skills[id]; return !this.equipped(p, id) || p.ammo[id] < this.stats(id, s).cost; }

  // ---------- combat ----------
  /** stunned: speed (movement and attacks) rises linearly from 0 back to normal over the stun duration */
  stunF(o: { stun: number; stunMax: number }) { return o.stun > 0 && o.stunMax > 0 ? clamp(1 - o.stun / o.stunMax, 0, 1) : 1; }
  /** a new stun restarts the ramp at 0 unless the current one lasts longer */
  applyStun(o: { stun: number; stunMax: number }, d: number) { if (d > 0 && d >= o.stun) { o.stun = d; o.stunMax = d; } }
  stunPlayer(p: Player, d: number) {
    this.applyStun(p, d);
    // attacks restart slowly: every cooldown has to run (at stunned speed) before the next attack
    p.rakeCd = Math.max(p.rakeCd, this.rakeStats(p).cd);
    for (const id of SKILLS) if (p.skills[id].learned) p.skills[id].cdT = Math.max(p.skills[id].cdT, this.stats(id, p.skills[id]).cd);
  }
  /** resistance: enemies take less damage from some weapon fruits */
  resistF(e: Enemy, src?: FruitType) { const R = this.cfg.enemies[e.type].resist; return src && R && R.includes(src) ? 1 - (this.cfg.enemies.resistance ?? .3) : 1; }
  airborne(e: Enemy) { return (e.type === 'toad' && e.state !== 'windup' && e.stun <= 0 && (e.hop % 1) < .5) || e.state === 'climb' || e.state === 'jump'; }
  /** squirrel still up in the tree (climbing out, waiting, jumping down) */
  inTree(e: Enemy) { return e.state === 'climb' || e.state === 'perch' || e.state === 'jump'; }
  /** squirrel spawn: it appears inside the crown of a nut tree (preferably one with nuts lying under it) */
  private squirrelStart(e: Enemy) {
    const trees = this.fields.filter(f => f.alive && f.type === 'nut' && this.isForest(f)); if (!trees.length) return false;
    const nutsAt = (f: Field) => this.fruits.filter(fr => fr.type === 'nut' && fr.state === 'ground' && dist(fr, f) < 3).length;
    const withNuts = trees.filter(f => nutsAt(f) > 0), pool = withNuts.length ? withNuts : trees, t = pool[Math.floor(Math.random() * pool.length)];
    const D = this.cfg.enemies.squirrel, l = Math.hypot(t.x, t.z) || 1, dx = -t.x / l, dz = -t.z / l, side = rand(-.6, .6); // towards the garden, a bit to the side
    const ox = dx * Math.cos(side) - dz * Math.sin(side), oz = dz * Math.cos(side) + dx * Math.sin(side);
    e.hx = t.x; e.hz = t.z; e.x = t.x + ox * .15; e.z = t.z + oz * .15; e.y = 2.2;
    e.cx = t.x + ox * .95; e.cz = t.z + oz * .95;
    const jd = D.jumpDistance ?? 1.4; e.lx = e.cx + ox * jd; e.lz = e.cz + oz * jd;
    e.state = 'climb'; e.st = D.climbTime ?? .8; e.face = Math.atan2(ox, oz);
    this.emit({ k: 'rustleTree', x: r2(t.x), z: r2(t.z) }); this.sfx('squirrel.wave', t.x, t.z);
    return true;
  }
  /** squirrel in the tree: climbs out of the crown, waits on its edge (can be hit), jumps down */
  private squirrelTree(e: Enemy, dt: number) {
    const D = this.cfg.enemies.squirrel; e.st -= dt;
    if (e.state === 'climb') {
      const T = D.climbTime ?? .8, k = clamp(1 - e.st / T, 0, 1), sx = e.hx + (e.cx - e.hx) * .15, sz = e.hz + (e.cz - e.hz) * .15;
      e.x = sx + (e.cx - sx) * k; e.z = sz + (e.cz - sz) * k; e.y = 2.2 + .45 * Math.sin(k * Math.PI / 2); e.walk += dt * 14;
      if (e.st <= 0) { e.state = 'perch'; e.st = D.perchTime ?? 1.5; this.sfx('squirrel.attack', e.x, e.z); }
    } else if (e.state === 'perch') {
      e.x = e.cx; e.z = e.cz; e.y = 2.65;
      if (e.fleeing) { const l = Math.hypot(e.cx, e.cz) || 1; e.lx = e.cx + e.cx / l * 1.4; e.lz = e.cz + e.cz / l * 1.4; e.st = 0; } // hit hard up there: jumps off to the outside
      e.face = Math.atan2(e.lx - e.cx, e.lz - e.cz);
      if (e.st <= 0) { e.state = 'jump'; e.st = D.jumpTime ?? .5; }
    } else {
      const T = D.jumpTime ?? .5, k = clamp(1 - e.st / T, 0, 1);
      e.x = e.cx + (e.lx - e.cx) * k; e.z = e.cz + (e.lz - e.cz) * k; e.y = 2.65 * (1 - k) + Math.sin(k * Math.PI) * .6;
      if (e.st <= 0) { e.state = 'approach'; e.y = 0; e.st = D.patience ?? 10; e.target = null; e.think = 0; this.emit({ k: 'dust', x: r2(e.x), z: r2(e.z) }); }
    }
  }
  hurtEnemy(e: Enemy, dmg: number, o: { color?: string; bleed?: boolean; stun?: number; punch?: boolean; silent?: boolean; dot?: boolean; src?: FruitType } = {}) {
    if (e.dead) return false;
    dmg *= this.resistF(e, o.src);
    if (!o.dot && this.airborne(e)) { this.emit({ k: 'imm', x: r2(e.x), z: r2(e.z) }); return false; }
    let left = dmg;
    if (e.shield > 0) { const a = Math.min(e.shield, left); e.shield -= a; left -= a; if (a > 0) this.burst(e.x, .45, e.z, 0x6fd0ff, 4, 1.5, .12, .3); }
    e.hp -= left; e.hurtOnce = true;
    if (!o.dot) { e.flash = .1; this.num(e.x, e.z, dmg, o.color || 'w', dmg >= 10); } // damage over time: no flash, numbers summed up by the caller
    if (o.punch) this.emit({ k: 'punch', x: r2(e.x), z: r2(e.z), e: e.id });
    else if (!o.silent) this.snd('hit');
    if (o.bleed) e.bleed = this.cfg.skills.cran.bleedDuration;
    if (o.stun) this.applyStun(e, o.stun);
    if (e.hp <= 0) this.killEnemy(e);
    else { const fb = this.cfg.enemies[e.type].fleeBelow; if (fb && !e.boss && !e.fleeing && e.hp < e.maxHp * fb) { e.fleeing = true; e.target = { kind: 'flee' }; e.laughT = rand(.3, .8); this.sfx(e.type + '.flee', e.x, e.z); } }
    return true;
  }
  killEnemy(e: Enemy) {
    if (e.burn > 0) { if (e.burnSum > 0) { this.num(e.x, e.z, e.burnSum, 'o'); e.burnSum = 0; } this.spreadFire(e); }
    e.dead = true; this.kills++; this.sfx(e.type + '.die', e.x, e.z);
    this.burst(e.x, .4, e.z, 0xffe0b0, 22, 2.6, .18, .6, { g: 4 });
    this.burst(e.x, .4, e.z, 0x404040, 10, 1.2, .5, .9, { a: .4 });
    for (const fr of e.carry) {
      fr.x = e.x; fr.y = .4; fr.z = e.z; const a = rand(0, 7);
      fr.vx = Math.cos(a) * 1.5; fr.vy = 3; fr.vz = Math.sin(a) * 1.5; fr.state = 'fly'; fr.bounce = 0; fr.src = -1;
    }
    e.carry = [];
    // every enemy drops XP (blueberries), elites more
    const E = this.cfg.enemies, n = e.boss ? E.boss.xpDrop : Math.round(E.xpDrop * (e.elite ? E.elite.xpMultiplier : 1));
    if (e.boss) this.emit({ k: 'bossDead', x: r2(e.x), z: r2(e.z) });
    for (let i = 0; i < n; i++) { const a = rand(0, 7), d = rand(.2, .8); this.spawnFruit('blue', 0, e.x, .5, e.z, e.x + Math.cos(a) * d, e.z + Math.sin(a) * d, -1); }
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
  /** the rake is laid down `range` m ahead and pulled back to the feet: it sweeps a rectangle (length range, width width) */
  private inRakeRect(p: Player, e: Enemy, dx: number, dz: number) {
    const RS = this.rakeStats(p), ex = e.x - p.x, ez = e.z - p.z;
    const u = ex * dx + ez * dz, v = ex * dz - ez * dx; // along / across the pull
    return u >= -e.r && u <= RS.range + e.r * .5 && Math.abs(v) <= RS.width / 2 + e.r * .5;
  }
  /** rake rectangle in world space (counter-clockwise): near edge at the player, far edge `range` ahead */
  rakeRect(p: Player, dx: number, dz: number): [number, number][] {
    const RS = this.rakeStats(p), L = RS.range, w = RS.width / 2, nx = -dz, nz = dx;
    return [[p.x + nx * w, p.z + nz * w], [p.x - nx * w, p.z - nz * w], [p.x - nx * w + dx * L, p.z - nz * w + dz * L], [p.x + nx * w + dx * L, p.z + nz * w + dz * L]];
  }
  /** area of the rake rectangle lying on a hex field (hex clipped by the 4 rectangle edges, Sutherland-Hodgman + shoelace) */
  rakeOverlap(f: Field, p: Player, dx: number, dz: number) {
    const RS = this.rakeStats(p), H = hexR(this.cfg);
    if (Math.hypot(f.x - p.x, f.z - p.z) > RS.range + RS.width + H) return 0;
    // hex corners in rake space: u along the pull (0..range), v across (-w/2..w/2)
    let poly: [number, number][] = [];
    for (let k = 0; k < 6; k++) { const a = cornerAngle(k), x = f.x + Math.cos(a) * H - p.x, z = f.z + Math.sin(a) * H - p.z; poly.push([x * dx + z * dz, x * dz - z * dx]); }
    const clip = (pl: [number, number][], ax: 0 | 1, lim: number, keepBelow: boolean) => {
      const out: [number, number][] = [], inside = (q: [number, number]) => keepBelow ? q[ax] <= lim : q[ax] >= lim;
      for (let i = 0; i < pl.length; i++) {
        const a = pl[i], b = pl[(i + 1) % pl.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) { const t = (lim - a[ax]) / (b[ax] - a[ax]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    };
    poly = clip(poly, 0, 0, false); poly = clip(poly, 0, RS.range, true); poly = clip(poly, 1, -RS.width / 2, false); poly = clip(poly, 1, RS.width / 2, true);
    let A = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(A) / 2;
  }
  rakeAttack(p: Player, dx: number, dz: number) {
    const R = this.cfg.rake;
    p.rakeCd = this.rakeStats(p).cd; p.aimX = dx; p.aimZ = dz; p.face = Math.atan2(dx, dz);
    // one stroke = lay the rake down `range` m ahead and pull it back: hits every enemy in the rectangle
    // and tills every field it covers (in proportion to the covered area)
    const targets = this.enemies.filter(e => !e.dead && this.inRakeRect(p, e, dx, dz));
    p.swing = R.swingTime; p.swingDir = p.face;
    this.snd('rake');
    const RS = this.rakeStats(p);
    this.emit({ k: 'swipe', x: r2(p.x), z: r2(p.z), a: r2(p.swingDir), p: p.id, r: r2(RS.range), w: r2(RS.width) });
    this.till(p, dx, dz);
    let hits = 0;
    for (const e of targets) if (this.hurtEnemy(e, RS.dmg, { color: 'r', punch: true })) {
      hits++;
      if (RS.kb > 0 && !e.dead && !e.boss) { const ex = e.x - p.x, ez = e.z - p.z, l = Math.hypot(ex, ez) || 1; e.kbx = ex / l; e.kbz = ez / l; e.kbLeft = RS.kb; }
    }
    if (hits) this.emit({ k: 'punches', n: hits, x: r2(p.x), z: r2(p.z) });
  }
  /** tilling: every field under the rake rectangle advances its harvest by tillStroke s x (covered area / area of the
   *  base rake). Raking a field with the base rake: harvest every (interval x rake cooldown); wider/longer rake and
   *  faster cooldown = more yield. A harvest completed by a stroke falls out of the bushes. */
  till(p: Player, dx: number, dz: number) {
    const F = this.cfg.fields, R = this.cfg.rake, A0 = R.range * R.width;
    let best: Field | null = null, bestA = 0, any = false;
    for (const f of this.fields) {
      if (!f.alive) continue;
      const A = this.rakeOverlap(f, p, dx, dz); if (A < .01) continue;
      any = true;
      if (A > bestA) { bestA = A; best = f; }
      f.tilledT = F.tillDuration; f.shake = Math.max(f.shake, .2);
      f.t -= F.tillStroke * (A / A0) * this.prodMult(f);
      while (f.t <= 0) { f.t += this.cfg.plants[f.type].interval; this.produce(f, true); }
      this.emit({ k: 'till', s: f.slot, a: r2(Math.min(1, A / A0)) }); // view: field flash, plant combed, leaves whirl, rustle
    }
    if (!any) return;
    // healing (Feldpflege) goes through the field covered most: one field per player
    for (const o of this.fields) if (o !== best && o.tilledBy === p.id) o.tilledBy = -1;
    if (best) best.tilledBy = p.id;
    const RS = this.rakeStats(p);
    this.sfx('player.till', p.x + dx * RS.range * .5, p.z + dz * RS.range * .5);
    this.burst(p.x + dx * RS.range * .4, .1, p.z + dz * RS.range * .4, 0x8a6a3a, 10, 1.2, .14, .4, { g: 4 });
  }
  /** while a field is being tilled it heals, and so do the tilling player and team mates standing on it */
  tillHeal(f: Field, dt: number) {
    const F = this.cfg.fields, up = this.cfg.upgrades.tillHeal.step * this.tillHealLv;
    if (f.alive) f.hp = Math.min(f.maxHp, f.hp + (F.tillHealField + up) * dt);
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.id === f.tilledBy || this.fieldAt(slotAt(this.cfg, this.slots, p.x, p.z)) === f) p.hp = Math.min(this.cfg.player.hp, p.hp + (F.tillHealPlayer + up) * dt);
    }
  }
  /** an enemy drops everything it carries (fruit flies off and can be picked up again) */
  dropCarry(e: Enemy) {
    for (const fr of e.carry) {
      fr.x = e.x; fr.y = .4; fr.z = e.z; const a = rand(0, 7);
      fr.vx = Math.cos(a) * 1.5; fr.vy = 3; fr.vz = Math.sin(a) * 1.5; fr.state = 'fly'; fr.bounce = 0; fr.src = -1;
    }
    if (e.carry.length) { e.carry = []; e.fleeing = false; e.target = null; }
  }
  /** Citrateaser chain: branch[0] main targets, each passes on to branch[d] neighbours at transfer^d damage */
  lemonZap(p: Player, dx: number, dz: number, st: SkillStats, s: SkillState) {
    const L = this.cfg.skills.lemon, U = this.cfg.upgrades;
    const branch = [...L.branch]; for (let i = 0; i < s.tgtLv; i++) { const k = U.lemonTargets.order[i]; if (k !== undefined) branch[k] = (branch[k] || 0) + 1; }
    const t = L.transfer + U.lemonTransfer.step * s.xferLv;
    const hit = new Set<Enemy>(), segs: number[][] = [];
    // main target(s): closest to the aim line within range
    const cand = this.enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) <= st.range + e.r)
      .map(e => { const ex = e.x - p.x, ez = e.z - p.z, d = Math.hypot(ex, ez) || 1; return { e, score: Math.acos(clamp((ex * dx + ez * dz) / d, -1, 1)) * 3 + d / st.range }; })
      .sort((a, b) => a.score - b.score).slice(0, branch[0]).map(c => c.e);
    let frontier: Enemy[] = [];
    for (const e of cand) {
      hit.add(e); segs.push([r2(p.x + dx * .4), r2(p.z + dz * .4), r2(e.x), r2(e.z), 0]);
      if (L.dropLoot) this.dropCarry(e);
      this.hurtEnemy(e, st.dmg, { color: 'z', silent: true, src: 'lemon' }); frontier.push(e);
    }
    if (!cand.length) segs.push([r2(p.x + dx * .4), r2(p.z + dz * .4), r2(p.x + dx * 1.6), r2(p.z + dz * 1.6), 2]); // miss: short fizzle
    for (let d = 1; d < branch.length; d++) {
      const next: Enemy[] = [];
      for (const src of frontier) {
        const near = this.enemies.filter(e => !e.dead && !hit.has(e) && Math.hypot(e.x - src.x, e.z - src.z) <= L.chainRadius + e.r)
          .sort((a, b) => Math.hypot(a.x - src.x, a.z - src.z) - Math.hypot(b.x - src.x, b.z - src.z)).slice(0, branch[d]);
        for (const e of near) { hit.add(e); segs.push([r2(src.x), r2(src.z), r2(e.x), r2(e.z), d]); this.hurtEnemy(e, st.dmg * Math.pow(t, d), { color: 'z', silent: true, src: 'lemon' }); next.push(e); }
      }
      frontier = next; if (!frontier.length) break;
    }
    this.emit({ k: 'zap', s: segs, p: p.id, a: r2(Math.atan2(dx, dz)) });
    this.sfx('weapons.lemon', p.x, p.z);
  }
  /** flamethrower burst: everything the cone swept over since the last burst catches fire (+1 stack) */
  flame(p: Player, dx: number, dz: number, st: SkillStats) {
    const TAU = Math.PI * 2, wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const base = Math.atan2(dx, dz), half = st.sweep * Math.PI / 360;
    // oscillation: triangle wave -1..1..-1 over one period (left -> right -> back); circle: free spin
    const tri = 1 - 4 * Math.abs(p.flPh - .5), a1 = st.circle ? p.flSpin : base + half * tri;
    const was = p.flOn > 0; let a0 = was ? p.flHit : a1, d = st.circle ? (was ? p.flSpin - p.flPrevSpin : 0) : wrap(a1 - a0);
    if (!st.circle && Math.abs(d) > Math.PI * .75) { a0 = a1; d = 0; } // aim jumped to another target: no sweep across the gap
    if (st.circle) a0 = a1 - d;
    p.flHit = p.flAng = a1; p.flBase = base; p.flPrevSpin = p.flSpin; p.flOn = st.cd * 1.6;
    const all = Math.abs(d) >= TAU - st.cone * Math.PI / 180, cone2 = st.cone * Math.PI / 360;
    const segDist = (x: number) => { // angular distance of x to the swept arc a0 -> a0 + d
      let r = ((d >= 0 ? x - a0 : a0 - x) % TAU + TAU) % TAU; const ad = Math.abs(d);
      return r <= ad ? 0 : Math.min(r - ad, TAU - r);
    };
    for (const e of this.enemies) {
      if (e.dead || this.airborne(e)) continue;
      const ex = e.x - p.x, ez = e.z - p.z, dd = Math.hypot(ex, ez);
      if (dd > st.range + e.r * .5) continue;
      if (!all && dd > e.r + .2 && segDist(Math.atan2(ex, ez)) > cone2 + Math.atan2(e.r, Math.max(dd, .01)) * .5) continue;
      this.ignite(e, st);
      e.burnSum += st.dmg; this.hurtEnemy(e, st.dmg, { silent: true, dot: true, src: 'chili' }); // direct hit, shown together with the burn numbers
    }
    // sound: start burst / roar loop / tail are played by the view from the player snapshot (fo)
  }
  ignite(e: Enemy, st: { tick: number; dmgPct: number }, stacks = 1) {
    const C = this.cfg.skills.chili;
    if (e.dead) return;
    if (e.burn <= 0) e.burnT = st.tick;
    e.burn = Math.min(C.burnStacks, e.burn + stacks); e.burnTick = st.tick; e.burnDmg = C.burnDamage * st.dmgPct; e.burnLeft = C.burnDuration;
  }
  /** wildfire: a burning enemy that dies passes part of its fire to enemies close by */
  private spreadFire(e: Enemy) {
    const C = this.cfg.skills.chili, n = Math.max(1, Math.round(e.burn * C.spreadShare));
    let any = false;
    for (const o of this.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < C.spreadRadius + o.r) { this.ignite(o, { tick: e.burnTick, dmgPct: e.burnDmg / C.burnDamage }, n); any = true; }
    this.emit({ k: 'wildfire', x: r2(e.x), z: r2(e.z), r: C.spreadRadius, a: any ? 1 : 0 });
  }
  /** fire ticks: stacks x burn damage of the weapon; goes out burnDuration s after the last hit */
  private tickBurn(e: Enemy, dt: number) {
    e.burnNum -= dt;
    // fire damage is shown as one summed number per second (and when the fire goes out / the enemy dies)
    const flush = () => { if (e.burnSum > 0) this.num(e.x, e.z, e.burnSum, 'o'); e.burnSum = 0; e.burnNum = 1; };
    if (e.burn <= 0) { if (e.burnSum > 0 && e.burnNum <= 0) flush(); return; }
    e.burnT -= dt; e.burnLeft -= dt;
    while (e.burnT <= 0 && e.burn > 0 && !e.dead) {
      e.burnT += e.burnTick;
      const dmg = e.burn * e.burnDmg * this.resistF(e, 'chili');
      e.burnSum += dmg;
      if (e.hp - dmg <= 0) flush();
      this.hurtEnemy(e, dmg, { color: 'o', silent: true, dot: true });
    }
    if (e.burnLeft <= 0) e.burn = 0;
    if (!e.dead && e.burnNum <= 0) flush();
  }
  // ---------- test mode: cheat menu ----------
  /** every tweakable value as [key, group, label, value]; +/- may exceed the normal limits */
  cheatRows(id: number): [string, string, string, number][] {
    const p = this.player(id); if (!p) return [];
    const N = this.cfg.names, rows: [string, string, string, number][] = [];
    rows.push(['level', 'Spieler', 'Stufe', this.level], ['hp', 'Spieler', 'Leben (− = 10 Schaden, + = voll)', Math.ceil(p.hp)]);
    rows.push(['rake.dmg', N.skills.rake, 'Schaden', p.rakeLv.dmg], ['rake.rng', N.skills.rake, 'Reichweite', p.rakeLv.rng], ['rake.wid', N.skills.rake, 'Breite', p.rakeLv.wid], ['rake.cd', N.skills.rake, 'Tempo', p.rakeLv.cd]);
    for (const sid of SKILLS) {
      const s = p.skills[sid], g = N.skills[sid];
      rows.push([`${sid}.learned`, g, 'Freigeschaltet', s.learned ? 1 : 0], [`${sid}.ammo`, g, 'Munition (±25)', p.ammo[sid]],
        [`${sid}.lvDmg`, g, 'Schaden', s.lvDmg], [`${sid}.lvRange`, g, sid === 'cab' ? 'Radius' : 'Reichweite', s.lvRange], [`${sid}.lvCd`, g, 'Abklingzeit', s.lvCd]);
      if (sid === 'asp') rows.push(['asp.pierce', g, 'Durchbohren (Ziele)', s.pierce], ['asp.pierceBonus', g, 'Durchbohr-Schaden', s.pierceBonus], ['asp.sizeLv', g, 'Geschossgröße', s.sizeLv]);
      if (sid === 'cran') rows.push(['cran.extraPel', g, '+Projektile', s.extraPel], ['cran.mineLv', g, 'Beeren-Platzschaden', s.mineLv]);
      if (sid === 'cab') rows.push(['cab.minis', g, 'Mini-Kohl', s.minis]);
      if (sid === 'lemon') rows.push(['lemon.tgtLv', g, '+1 Ziel', s.tgtLv], ['lemon.xferLv', g, 'Weiterleitung', s.xferLv]);
      if (sid === 'chili') rows.push(['chili.sweepLv', g, 'Schwenk + Flamme', s.sweepLv], ['chili.tickLv', g, 'Brand-Tick', s.tickLv]);
    }
    for (const f of FRUITS) {
      rows.push([`field.${f}`, 'Felder', `${N.fields[f]} (+ bauen/hochleveln, − entfernen)`, this.fields.filter(x => x.type === f).length]);
      rows.push([`yield.${f}`, 'Felder', `Doppelernte ${N.plants[f]}`, this.yieldLv[f]]);
    }
    rows.push(['care', 'Felder', N.care, this.tillHealLv]);
    return rows;
  }
  cheat(id: number, key: string, d: number) {
    const p = this.player(id); if (!p) return;
    const [a, b] = key.split('.');
    const lim0 = (v: number) => Math.max(0, v);
    if (key === 'level') { this.level = Math.max(1, this.level + d); this.xp = 0; return; }
    if (key === 'hp') { p.hp = d > 0 ? this.cfg.player.hp : Math.max(1, p.hp - 10); return; }
    if (a === 'rake') { (p.rakeLv as any)[b] = lim0((p.rakeLv as any)[b] + d); return; }
    if (a === 'care') { this.tillHealLv = lim0(this.tillHealLv + d); return; }
    if (a === 'yield') { this.yieldLv[b as FruitType] = lim0(this.yieldLv[b as FruitType] + d); return; }
    if (a === 'field') {
      const t = b as FruitType;
      if (d > 0) { // build: upgrade an existing field of this type or take a free slot
        const own = this.fields.find(f => f.type === t && f.alive), free = this.slots.findIndex((sl, i) => !this.fieldAt(i) && slotFits(this.cfg, sl, t));
        if (own && free < 0) this.placeField(own.slot, t); else if (free >= 0) this.placeField(free, t); else if (own) this.placeField(own.slot, t);
      } else { const list = this.fields.filter(f => f.type === t && !f.starter); const last = list[list.length - 1]; if (last) this.fields.splice(this.fields.indexOf(last), 1); }
      return;
    }
    if ((SKILLS as string[]).includes(a)) {
      const s = p.skills[a as SkillId] as any;
      if (b === 'learned') { if (d > 0) this.learn(p, a as SkillId); else { s.learned = false; p.slots = p.slots.filter(x => x !== a); if (p.active === a) p.active = 'rake'; } return; }
      if (b === 'ammo') { p.ammo[a as SkillId] = lim0(p.ammo[a as SkillId] + d * 25); return; }
      if (b in s) s[b] = lim0(s[b] + d);
    }
  }
  tryFire(p: Player, id: SkillId, dir?: [number, number]) {
    const s = p.skills[id];
    if (!p.alive || !this.canFire(p, id) || s.cdT > 0) return false;
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
    if (id !== 'chili') this.emit({ k: 'shot', p: p.id, w: id, x: r2(fx), z: r2(fz), a: r2(Math.atan2(dx, dz)) }); // flame: drawn continuously from the player snapshot
    if (id === 'asp') {
      this.aspBolt(p, dx, dz, st, false);
      s.burst = st.shots - 1; s.burstT = st.gap; // rest of the salvo follows in the player update
    } else if (id === 'cran') {
      this.snd('shot');
      this.burst(fx, fy, fz, 0xff4060, 8, 2.5, .15, .25);
      const half = S.cran.cone / 2, sig = S.cran.spreadSigma, base = Math.atan2(dx, dz);
      for (let i = 0; i < st.pellets; i++) {
        let g = 0; for (let k = 0; k < 8; k++) { g = gauss() * sig; if (Math.abs(g) <= half) break; g = clamp(g, -half, half); } // normal, cut at the cone edge
        const a = base + g * Math.PI / 180;
        this.projs.push({ id: this.nid++, kind: 'cran', x: fx, y: fy, z: fz, dx: Math.sin(a), dz: Math.cos(a), speed: rand(10, 12), left: st.range * rand(.85, 1), total: st.range, dmg: st.dmg, pierceLeft: 0, pf: 0, mine: st.splash, w: .1, hit: new Set() });
      }
    } else if (id === 'lemon') {
      this.lemonZap(p, dx, dz, st, s);
    } else if (id === 'chili') {
      this.flame(p, dx, dz, st);
    } else {
      this.snd('throw');
      const t = this.clampArena(p.x + dx * st.throwDist, p.z + dz * st.throwDist);
      this.spawnBomb(fx, fy, fz, t[0], t[1], st.range, st.dmg, st.minis, false);
    }
  }
  /** one asparagus bolt from the crossbow; follow = later bolt of a salvo (pays its own ammo, own muzzle event) */
  aspBolt(p: Player, dx: number, dz: number, st: SkillStats, follow: boolean) {
    if (follow) { p.ammo.asp -= st.cost; p.face = Math.atan2(dx, dz); p.aimX = dx; p.aimZ = dz; }
    const fx = p.x + dx * .35, fy = .75, fz = p.z + dz * .35;
    if (follow) this.emit({ k: 'shot', p: p.id, w: 'asp', x: r2(fx), z: r2(fz), a: r2(Math.atan2(dx, dz)) });
    this.snd('asp'); p.xbT = .9;
    this.projs.push({ id: this.nid++, kind: 'asp', x: fx, y: fy, z: fz, dx, dz, speed: this.cfg.skills.asp.speed, left: st.range, total: st.range, dmg: st.dmg, pierceLeft: st.pierce, pf: st.pf, mine: 0, w: st.width, hit: new Set() });
  }
  spawnBomb(fx: number, fy: number, fz: number, tx: number, tz: number, radius: number, dmg: number, minis: number, mini: boolean) {
    this.bombs.push({ id: this.nid++, fx, fy, fz, tx, tz, x: fx, y: fy, z: fz, t: 0, flight: mini ? .35 : .6, fuse: mini ? .45 : this.cfg.skills.cab.fuse, radius, dmg, minis, mini });
  }
  explode(b: Bomb) {
    const C = this.cfg.skills.cab;
    this.snd(b.mini ? 'boomS' : 'boom');
    this.emit({ k: 'boom', x: r2(b.tx), z: r2(b.tz), r: r2(b.radius), m: b.mini ? 1 : 0 });
    for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - b.tx, e.z - b.tz) < b.radius + e.r * .5) this.hurtEnemy(e, b.dmg, { color: 'c', src: 'cab' });
    // poison pool: ticks poolTicksPerSecond x poolDuration, each tick poolTickDamage x bomb damage, slows enemies inside
    this.sfx('effects.pool', b.tx, b.tz);
    this.pools.push({ id: this.nid++, x: b.tx, z: b.tz, r: b.radius, t: C.poolDuration, tickT: 1 / C.poolTicksPerSecond, ticks: Math.round(C.poolDuration * C.poolTicksPerSecond), dmg: b.dmg * C.poolTickDamage });
    for (let i = 0; i < b.minis; i++) {
      const a = rand(0, Math.PI * 2), t = this.clampArena(b.tx + Math.cos(a), b.tz + Math.sin(a));
      this.spawnBomb(b.tx, .3, b.tz, t[0], t[1], b.radius * C.miniRadiusFactor, b.dmg * C.miniDamageFactor, 0, true);
    }
  }
  clampArena(x: number, z: number): [number, number] { const R = this.cfg.arena.radius, r = Math.hypot(x, z); return r > R ? [x * R / r, z * R / r] : [x, z]; }

  // ---------- enemies ----------
  spawnEnemy(type: EnemyType, angle: number, elite = false) {
    const EL = this.cfg.enemies.elite, D = this.cfg.enemies[type], R = this.cfg.waves.spawnRadius, N = this.nightMul(), G = this.waveScale(), hpF = this.f(this.cfg.coop.enemyHpExponent) * (elite ? EL.hp : 1) * N.hp * G.hp;
    const e: Enemy = {
      id: this.nid++, type, x: Math.cos(angle) * R, z: Math.sin(angle) * R, hp: D.hp * hpF, maxHp: D.hp * hpF,
      shield: (D.shield || 0) * hpF, shieldMax: (D.shield || 0) * hpF, shieldT: D.shieldRegen || 3, r: D.radius * (elite ? EL.scale : 1), speed: D.speed,
      stun: 0, stunMax: 0, bleed: 0, bleedT: 1, flash: 0, atkT: 1, think: 0, target: null, carry: [], fleeing: false, face: angle + Math.PI,
      walk: rand(0, 7), hop: rand(0, 1), state: 'approach', st: 0, cdx: 0, cdz: 1, hitThisCharge: false,
      tongueT: 0, tongueCd: D.tongueCooldown || 1.5, tongueLen: 1, lunge: 0, dead: false, hurtOnce: false, kbx: 0, kbz: 0, kbLeft: 0, laughT: rand(2, 3.5), elite, dmgMul: (elite ? EL.damage : 1) * N.damage * G.damage, wv: this.wave,
      burn: 0, burnT: 0, burnTick: this.cfg.skills.chili.burnTick, burnDmg: 0, burnLeft: 0, burnSum: 0, burnNum: 0, puff: rand(0, D.puffEvery || 2),
      hx: 0, hz: 0, cx: 0, cz: 0, lx: 0, lz: 0, y: 0,
    };
    if (type === 'squirrel' && !this.squirrelStart(e)) return; // no nut tree (any more): nobody comes
    this.enemies.push(e); this.waveSpawned++;
  }
  nearestField(x: number, z: number) { let best: Field | null = null, bd = 1e9; for (const f of this.fields) if (f.alive && !this.isForest(f)) { const d = Math.hypot(x - f.x, z - f.z); if (d < bd) { bd = d; best = f; } } return best; }
  chooseTarget(e: Enemy): Target {
    if (e.fleeing) return { kind: 'flee' };
    const D = this.cfg.enemies[e.type];
    if (!D.peaceful) {
      let bp: Player | null = null, bd = this.cfg.enemies.aggroRadius;
      for (const p of this.players) if (p.alive) { const d = dist(e, p); if (d < bd) { bd = d; bp = p; } }
      if (bp) return { kind: 'player', p: bp };
    }
    // fruit: preferred kinds first, then everything else it takes (steals or eats)
    const want = D.eats || D.steals;
    if (want) {
      const near = (types: FruitType[]) => { let best: Fruit | null = null, b2 = 1e9; for (const fr of this.fruits) if (fr.state === 'ground' && types.includes(fr.type)) { const d = dist(e, fr); if (d < b2) { b2 = d; best = fr; } } return best; };
      const best = (D.prefers && near(D.prefers)) || near(want);
      if (best) return { kind: 'fruit', fr: best };
    }
    if (D.patience !== undefined) { // squirrel: no nuts lying around -> off with the loot (or out of patience), else it scurries around its tree
      if (e.carry.length || e.st <= 0) { e.fleeing = true; if (e.carry.length) { e.laughT = rand(.3, .8); this.sfx(e.type + '.flee', e.x, e.z); } return { kind: 'flee' }; }
      const t = e.target;
      if (t && t.kind === 'wander' && Math.hypot(t.x - e.x, t.z - e.z) > .4) return t;
      const a = rand(0, Math.PI * 2), r = rand(.7, 2.2);
      return { kind: 'wander', x: e.hx + Math.cos(a) * r, z: e.hz + Math.sin(a) * r };
    }
    if (D.peaceful) { // strolls around the garden until it finds something
      const t = e.target;
      if (t && t.kind === 'wander' && Math.hypot(t.x - e.x, t.z - e.z) > .5) return t;
      const f = this.fields.length ? this.fields[Math.floor(Math.random() * this.fields.length)] : null, a = rand(0, Math.PI * 2), r = rand(.5, 3);
      const [x, z] = this.clampArena((f ? f.x : 0) + Math.cos(a) * r, (f ? f.z : 0) + Math.sin(a) * r);
      return { kind: 'wander', x, z };
    }
    if (D.prefersFields) { let best: Field | null = null, bd = 1e9; for (const f of this.fields) if (f.alive && D.prefersFields.includes(f.type)) { const d = dist(e, f); if (d < bd) { bd = d; best = f; } } if (best) return { kind: 'field', f: best }; }
    const f = this.nearestField(e.x, e.z); return f ? { kind: 'field', f } : null;
  }
  inPool(x: number, z: number, r = 0) { return this.pools.some(p => Math.hypot(x - p.x, z - p.z) < p.r + r * .5); }
  slowF(e: Enemy) { return this.inPool(e.x, e.z, e.r) ? 1 - this.cfg.skills.cab.poolSlow : 1; }
  steer(e: Enemy, tx: number, tz: number, speed: number, dt: number, stop = 0) {
    speed *= this.slowF(e);
    let vx = tx - e.x, vz = tz - e.z; const d = Math.hypot(vx, vz); if (d < .001) return d;
    vx /= d; vz /= d; e.face = Math.atan2(vx, vz);
    if (d > stop) { const s = Math.min(speed * dt, d - stop); e.x += vx * s; e.z += vz * s; e.walk += dt * speed * 4; }
    return d;
  }
  targetPos(t: Target): { x: number; z: number } | null {
    if (!t) return null; if (t.kind === 'player') return t.p; if (t.kind === 'fruit') return t.fr; if (t.kind === 'field') return t.f; if (t.kind === 'wander') return t; return null;
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
      this.emit({ k: 'pdie', p: p.id }); this.sfx('player.die', p.x, p.z);
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
    if (D.shield) { e.shieldT -= dt; if (e.shieldT <= 0) { e.shieldT = D.shieldRegen!; if (e.shield < e.shieldMax) { e.shield = e.shieldMax; this.sfx('sheep.shield', e.x, e.z); this.burst(e.x, .45, e.z, 0x6fd0ff, 10, 1.2, .15, .4); } } }
    if (e.bleed > 0) {
      e.bleed -= dt; e.bleedT -= dt;
      if (e.bleedT <= 0) { e.bleedT = 1; this.snd('bleed'); this.emit({ k: 'bleed', x: r2(e.x), z: r2(e.z) }); this.hurtEnemy(e, this.cfg.skills.cran.bleedDps, { color: 'b', src: 'cran' }); if (e.dead) return; }
    } else e.bleedT = 1;
    this.tickBurn(e, dt); if (e.dead) return;
    if (e.kbLeft > 0) { const s = Math.min(e.kbLeft, 9 * dt); e.x += e.kbx * s; e.z += e.kbz * s; e.kbLeft -= s; } // rake knockback
    if (e.stun > 0) { // stunned: everything it does runs slower, ramping up from 0 to normal
      const sf = this.stunF(e); e.stun = Math.max(0, e.stun - dt); dt *= sf; if (dt <= 0) return;
    }
    if (e.boss) return this.bossAI(e, dt);
    if (e.type === 'squirrel') { if (this.inTree(e)) return this.squirrelTree(e, dt); e.st -= dt; }
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
      if (e.carry.length) { e.laughT -= dt; if (e.laughT <= 0) { e.laughT = rand(2.5, 4); this.sfx(e.type + '.laugh', e.x, e.z); } } // cackling away with the loot
      if (Math.hypot(e.x, e.z) > this.cfg.arena.radius + 3) {
        for (const fr of e.carry) { const i = this.fruits.indexOf(fr); if (i >= 0) this.fruits.splice(i, 1); }
        e.carry = []; this.removeEnemy(e);
      }
      return;
    }
    const tp = this.targetPos(t)!;
    const FR = hexR(this.cfg) * .7; // enemies walk onto the field to attack it
    const reach = t.kind === 'field' ? FR : t.kind === 'player' ? e.r + .5 : e.r * .6;
    if (e.type === 'toad') {
      e.hop += dt / D.hopPeriod!; const air = (e.hop % 1) < .5;
      const rng = t.kind === 'field' ? FR + .55 : t.kind === 'player' ? D.tongueRange! : .3;
      const d = dist(e, tp);
      if (air) { if (d > rng * .8) this.steer(e, tp.x, tp.z, e.speed * 2, dt, rng * .8); else e.face = Math.atan2(tp.x - e.x, tp.z - e.z); }
      else {
        e.tongueCd -= dt;
        if (d < rng && e.tongueCd <= 0 && (t.kind === 'player' || t.kind === 'field')) {
          // the tongue lashes out visibly onto the target (for a field: onto the plant in its middle)
          e.face = Math.atan2(tp.x - e.x, tp.z - e.z);
          e.tongueCd = D.tongueCooldown!; e.tongueT = .35; e.tongueLen = Math.max(.3, d - (t.kind === 'player' ? .15 : .3)); this.sfx(t.kind === 'player' ? 'toad.attack' : 'toad.fieldAttack', e.x, e.z);
          const L = e.tongueLen, hx = e.x + Math.sin(e.face) * L, hz = e.z + Math.cos(e.face) * L;
          this.emit({ k: 'lick', x: r2(hx), z: r2(hz), d: .14 }); // splat when the tip hits (view, slightly delayed)
          const ps = { t: D.poisonInterval!, ticks: D.poisonTicks! };
          for (let k = 0; k < Math.round(e.dmgMul); k++) { if (t.kind === 'player') t.p.poison.push({ ...ps }); else t.f.poison.push({ ...ps }); }
          if (t.kind === 'field') t.f.shake = Math.max(t.f.shake, .25);
        }
      }
      return;
    }
    if (D.puffEvery) this.puffTick(e, dt);
    if (t.kind === 'wander') { this.steer(e, tp.x, tp.z, D.wanderSpeed || e.speed * .7, dt); return; }
    const d = this.steer(e, tp.x, tp.z, e.speed, dt, t.kind === 'fruit' ? 0 : reach * .9);
    if (t.kind === 'fruit' && d < .35 + e.r) {
      const fr = t.fr; e.target = null;
      if (D.eats && D.eats.includes(fr.type)) { // eaten on the spot: gone for good
        fr.state = 'carried'; const i = this.fruits.indexOf(fr); if (i >= 0) this.fruits.splice(i, 1);
        this.sfx(e.type + '.steal', e.x, e.z); this.burst(fr.x, .2, fr.z, FRUIT_BURST[fr.type], 6, 1.2, .08, .3); e.lunge = .15;
      } else {
        fr.state = 'carried'; e.carry.push(fr); this.sfx(e.type + '.steal', e.x, e.z);
        if (e.carry.length >= (D.carryMax || 5)) { e.fleeing = true; e.laughT = rand(.3, .8); this.sfx(e.type + '.flee', e.x, e.z); }
      }
    } else if (t.kind !== 'fruit' && d <= reach && !D.puffEvery) { // hedgehogs only hurt by puffing up
      e.atkT -= dt;
      if (e.atkT <= 0) { e.atkT = E.meleeInterval; e.lunge = .2; if (t.kind === 'player') { this.sfx(e.type + '.attack', e.x, e.z); this.hurtPlayer(t.p, E.meleeDamage * e.dmgMul); } else if (t.kind === 'field') { this.sfx(e.type + '.fieldAttack', e.x, e.z); this.hurtField(t.f, E.meleeDamage * e.dmgMul); } }
    } else e.atkT = Math.min(e.atkT, .5);
  }
  /** hedgehog: puffs up with a jerk every puffEvery s, spines hurt players around it (and the field it stands on) */
  puffTick(e: Enemy, dt: number) {
    const D = this.cfg.enemies[e.type], P = D.puffEvery!;
    e.puff += dt; if (e.puff < P) return;
    e.puff -= P;
    const reach = e.r * (1 + D.puffScale!) + D.puffRadius!;
    for (const p of this.players) if (p.alive && dist(e, p) < reach + .25) this.hurtPlayer(p, D.puffDamage! * e.dmgMul);
    const f = this.fieldAt(slotAt(this.cfg, this.slots, e.x, e.z)); if (f && f.alive) this.hurtField(f, D.puffDamage! * e.dmgMul);
    this.sfx(e.type + '.attack', e.x, e.z);
  }
  sheepAI(e: Enemy, dt: number) {
    const D = this.cfg.enemies.sheep; e.st -= dt;
    if (e.state === 'approach') {
      if (!e.target) e.target = this.chooseTarget(e);
      const tp = this.targetPos(e.target); if (!tp) return;
      const d = this.steer(e, tp.x, tp.z, e.speed, dt, 1);
      if (d < D.chargeRange!) { // aim once: the charge direction is fixed now and not followed any more
        const dx = tp.x - e.x, dz = tp.z - e.z, l = Math.hypot(dx, dz) || 1; e.cdx = dx / l; e.cdz = dz / l; e.face = Math.atan2(e.cdx, e.cdz);
        e.state = 'windup'; e.st = D.windup!; this.sfx('sheep.charge', e.x, e.z);
      }
    } else if (e.state === 'windup') {
      if (e.st <= 0) { e.state = 'charge'; e.st = D.chargeTime!; e.hitThisCharge = false; }
    } else if (e.state === 'charge') {
      const s = D.chargeSpeed! * dt * this.slowF(e); e.x += e.cdx * s; e.z += e.cdz * s; e.walk += dt * 30;
      if (Math.random() < .6) this.emit({ k: 'dust', x: r2(e.x), z: r2(e.z) });
      if (!e.hitThisCharge) for (const p of this.players) if (p.alive && dist(e, p) < e.r + .4) {
        e.hitThisCharge = true; this.sfx('sheep.ram', e.x, e.z); this.hurtPlayer(p, D.ramDamage! * e.dmgMul); if (p.alive) this.stunPlayer(p, D.ramStun!); this.emit({ k: 'poof', x: r2(p.x), z: r2(p.z) });
        e.state = 'rest'; e.st = D.rest!; break;
      }
      for (const f of this.fields) if (f.alive && !e.hitThisCharge && dist(e, f) < hexR(this.cfg) * .8) { e.hitThisCharge = true; this.sfx('sheep.ram', e.x, e.z); this.hurtField(f, D.ramDamage! * e.dmgMul); e.state = 'rest'; e.st = D.rest!; }
      if (e.st <= 0 && e.state === 'charge') { e.state = 'rest'; e.st = D.rest!; }
    } else if (e.state === 'rest') {
      if (e.st <= 0) { e.state = 'approach'; e.target = null; }
    }
  }

  // ---------- raccoon boss ----------
  // Cycle: collect blueberries (5 s) -> charge (2 s) -> special attack (trail, carousel, rain in turn).
  // More collected berries = more bombs (+3 % each). Bombs land, glow as a circle, then explode.
  spawnBoss() {
    const B = this.cfg.enemies.boss, a = rand(0, Math.PI * 2);
    this.spawnEnemy('raccoon', a);
    const e = this.enemies[this.enemies.length - 1];
    const firstBoss = this.bossEvery(), G = this.waveScale(), hp = this.cfg.enemies.raccoon.hp * B.hpEnemies * G.hp * (1 + (B.hpGrowthPerWave ?? 0) * Math.max(0, this.wave - firstBoss)) * this.f(this.cfg.coop.enemyHpExponent);
    e.hp = e.maxHp = hp; e.r = this.cfg.enemies.raccoon.radius * B.scale; e.speed = B.speed; e.dmgMul = B.meleeDamage / this.cfg.enemies.meleeDamage * G.damage;
    e.boss = { st: 'collect', t: B.collectTime, berries: 0, atk: 0, spawned: 0, next: 0, hx: 0, hz: 0, hdx: 0, hdz: 1 };
    this.emit({ k: 'boss', id: e.id }); this.sfx('raccoon.laugh', e.x, e.z);
  }
  private spitBomb(e: Enemy, x: number, z: number, rain = false) {
    const B = this.cfg.enemies.boss; [x, z] = this.clampArena(x, z);
    this.berryBombs.push({ id: this.nid++, fx: e.x, fz: e.z, x, z, flight: rain ? 0 : .35, t: 0, fuse: rain ? B.rain.warn : B.bombFuse, rain, dmg: B.bombDamage * this.waveScale().damage, r: B.bombRadius });
  }
  private bossAI(e: Enemy, dt: number) {
    const B = this.cfg.enemies.boss, S = e.boss!; S.t -= dt;
    const target = this.players.filter(p => p.alive).sort((a, b) => dist(a, e) - dist(b, e))[0];
    const mult = 1 + B.berryBonus * S.berries;
    if (S.st === 'collect') {
      let best: Fruit | null = null, bd = 1e9; // walk to the nearest blueberry on the ground and eat it
      for (const fr of this.fruits) if (fr.state === 'ground' && fr.type === 'blue') { const d = dist(e, fr); if (d < bd) { bd = d; best = fr; } }
      if (best) { this.steer(e, best.x, best.z, e.speed, dt); if (bd < e.r + .25) { this.fruits.splice(this.fruits.indexOf(best), 1); S.berries += best.val; this.emit({ k: 'bossEat', x: r2(best.x), z: r2(best.z) }); } }
      else if (target) this.steer(e, target.x, target.z, e.speed, dt, e.r + .6);
      if (target && dist(e, target) < e.r + .6) { e.atkT -= dt; if (e.atkT <= 0) { e.atkT = this.cfg.enemies.meleeInterval; e.lunge = .2; this.hurtPlayer(target, this.cfg.enemies.meleeDamage * e.dmgMul); } }
      if (S.t <= 0) { S.st = 'charge'; S.t = B.chargeTime; this.sfx('raccoon.attack', e.x, e.z); }
    } else if (S.st === 'charge') {
      if (target) e.face = Math.atan2(target.x - e.x, target.z - e.z);
      if (S.t <= 0) {
        S.st = 'attack'; S.spawned = 0; S.next = 0; S.hx = e.x; S.hz = e.z;
        if (target) { const dx = target.x - e.x, dz = target.z - e.z, l = Math.hypot(dx, dz) || 1; S.hdx = dx / l; S.hdz = dz / l; }
        S.t = S.atk === 1 ? B.carousel.duration : 30; // trail and rain end when all bombs are out
      }
    } else {
      S.next -= dt;
      if (S.atk === 0) { // chasing trail: a head that is fast when far away but turns slowly
        const T = B.trail, n = Math.round(T.count * mult);
        if (target) {
          const dx = target.x - S.hx, dz = target.z - S.hz, l = Math.hypot(dx, dz) || 1;
          const want = Math.atan2(dx, dz), cur = Math.atan2(S.hdx, S.hdz);
          let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
          const a = cur + clamp(d, -T.turnRate * dt, T.turnRate * dt); S.hdx = Math.sin(a); S.hdz = Math.cos(a);
          const sp = l > T.farDistance ? T.speedFar : T.speedNear; S.hx += S.hdx * sp * dt; S.hz += S.hdz * sp * dt;
        }
        if (S.next <= 0 && S.spawned < n) { S.next = T.interval; S.spawned++; this.spitBomb(e, S.hx, S.hz); this.sfx('boss.spit', e.x, e.z); }
        if (S.spawned >= n) S.t = 0;
      } else if (S.atk === 1) { // carousel: spinning, 3 trails in random directions every second
        const C = B.carousel; e.face += dt * 9;
        if (S.next <= 0) {
          S.next = C.every; const n = Math.round(C.count * mult);
          for (let k = 0; k < C.trails; k++) { const a = rand(0, Math.PI * 2); for (let i = 1; i <= n; i++) this.spitBomb(e, e.x + Math.sin(a) * (e.r + i * C.spacing), e.z + Math.cos(a) * (e.r + i * C.spacing)); }
          this.sfx('boss.spit', e.x, e.z);
        }
      } else { // rain: big blueberries fall at random spots, 0.5 s to dodge
        const Rn = B.rain, n = Math.round(Rn.count * mult);
        while (S.next <= 0 && S.spawned < n) {
          S.next += Rn.interval; S.spawned++;
          const p = Math.random() < .5 && target ? target : null; // half of them aimed near a player
          const a = rand(0, Math.PI * 2), r = p ? rand(0, 2.5) : Math.sqrt(Math.random()) * Rn.radius;
          this.spitBomb(e, (p ? p.x : 0) + Math.cos(a) * r, (p ? p.z : 0) + Math.sin(a) * r, true);
        }
        if (S.spawned >= n) S.t = 0;
      }
      if (S.t <= 0) { S.st = 'collect'; S.t = B.collectTime; S.berries = 0; S.atk = (S.atk + 1) % 3; }
    }
  }
  private updateBerryBombs(dt: number) {
    for (let i = this.berryBombs.length - 1; i >= 0; i--) {
      const b = this.berryBombs[i]; b.t += dt;
      if (b.t < b.flight + b.fuse) continue;
      this.berryBombs.splice(i, 1);
      this.emit({ k: 'berryBoom', x: r2(b.x), z: r2(b.z), r: b.r }); this.sfx('boss.boom', b.x, b.z);
      for (const p of this.players) if (p.alive && Math.hypot(p.x - b.x, p.z - b.z) < b.r) this.hurtPlayer(p, b.dmg);
      for (const f of this.fields) if (f.alive && Math.hypot(f.x - b.x, f.z - b.z) < b.r + hexR(this.cfg) * .5) this.hurtField(f, b.dmg * .5);
    }
  }

  // ---------- waves ----------
  // A wave is a schedule of groups (bursts). It ends when its last group has started and at least
  // waves.endKilled of its enemies are gone (killed or fled); then a fixed pause follows. Groups grow during a wave and the wave
  // closes with one big group.
  wave = 0; wavePause = true; won = false; private waveSpawned = 0;
  private waveGroups: { at: number; size: number; planned?: PlannedWave }[] = [];
  private pickType(): EnemyType {
    const W = this.cfg.waves, w = this.wave, table: [EnemyType, number][] = [];
    const early = !!(this.fieldOf('cran') || this.fieldOf('asp')) && w >= 2;
    for (const type of ENEMIES) {
      const T = W.types[type]; if (!T) continue;
      if (T.needs && !this.fields.some(f => f.alive && f.type === T.needs)) continue; // e.g. squirrels only once a nut tree stands
      if (w >= T.from) table.push([type, T.weight]);
      else if (T.early && early) table.push([type, T.early]);
    }
    if (!table.length) return 'raccoon';
    const tot = table.reduce((a, x) => a + x[1], 0); let r = Math.random() * tot;
    for (const [type, wt] of table) { r -= wt; if (r <= 0) return type; }
    return table[table.length - 1][0];
  }
  private planGroup(size: number): PlannedWave {
    const W = this.cfg.waves, w = this.wave;
    const dMax = Math.min(W.directionsMax, W.directionsStart + Math.floor((w - 1) / W.directionEveryWaves));
    const k = Math.max(1, Math.min(size, Math.floor(rand(Math.max(1, dMax - 1), dMax + .999))));
    const a0 = rand(0, Math.PI * 2), dirs: number[] = [], groups: EnemyType[][] = [];
    for (let i = 0; i < k; i++) { dirs.push(a0 + i * Math.PI * 2 / k + rand(-.35, .35)); groups.push([]); }
    for (let i = 0, g = 0; i < size; g++) { // some animals (hedgehogs) always come as a pack from one direction
      const type = w === 1 ? 'raccoon' : this.pickType(), G = this.cfg.waves.types[type]?.group;
      const n = G ? Math.floor(rand(G[0], G[1] + .999)) : 1;
      for (let j = 0; j < n; j++) groups[g % k].push(type);
      i += n;
    }
    return { dirs, groups };
  }
  // ---------- day / night ----------
  // A day-night cycle = dayWaves day waves + nightWaves night waves (16 + 8 like 16 h / 8 h). The boss comes in the
  // last night wave; after it the next day starts. Night waves are bigger and stronger (dayNight.night).
  private waveT0 = 0; private waveDur = 1; private pauseLen = 1; private dayEnd = .75;
  cycleLen() { const D = this.cfg.dayNight; return D ? D.dayWaves + D.nightWaves : 0; }
  isNight(w = this.wave) { const D = this.cfg.dayNight; return !!D && w >= 1 && (w - 1) % this.cycleLen() >= D.dayWaves; }
  bossEvery() { return this.cycleLen() || this.cfg.enemies.boss.every || 0; }
  /** enemies get stronger over the waves, same curve shape as the XP need: growth^(w-1) + linear*(w-1) (wave 1 = 1) */
  waveScale(w = this.wave) {
    const S = this.cfg.enemies.scaling, k = Math.max(0, w - 1);
    const c = (x?: { growth: number; linear: number }) => x ? Math.pow(x.growth, k) + x.linear * k : 1;
    return { hp: c(S?.hp), damage: c(S?.damage) };
  }
  nightMul(w = this.wave) { const N = this.cfg.dayNight?.night; return this.isNight(w) && N ? N : { size: 1, hp: 1, damage: 1 }; }
  /** share of the current wave "hour" that has passed (0..1): fighting covers the first 75 %, the pause the rest */
  private dayFrac() { return this.wavePause ? this.dayEnd + (1 - this.dayEnd) * (1 - Math.max(0, this.waveT) / Math.max(.1, this.pauseLen)) : .75 * Math.min(1, (this.time - this.waveT0) / Math.max(1, this.waveDur)); }
  /** hour of the cycle: 0 .. cycleLen (one hour per wave); 0 = morning of day 1 */
  dayHour() { if (this.wave < 1 || !this.cycleLen()) return 0; return (this.wave - 1) % this.cycleLen() + this.dayFrac(); }
  /** start wave w now: builds the group schedule */
  startWave(w: number) {
    const W = this.cfg.waves, cf = this.f(this.cfg.coop.enemyCountExponent);
    this.wave = w; this.wavePause = false; this.waveGroups = []; this.waveSpawned = 0;
    const D = W.durationStart + W.durationPerWave * (w - 1), base = Math.min(W.sizeMax, W.sizeStart + W.sizePerWave * (w - 1)) * cf * this.nightMul(w).size;
    const gap = Math.max(W.gapMin, W.gapStart - W.gapPerWave * (w - 1));
    const round = (v: number) => Math.max(1, Math.floor(v) + (Math.random() < v % 1 ? 1 : 0));
    let t = 0;
    while (t < D - gap * .5) { const x = t / D; this.waveGroups.push({ at: this.time + t, size: round(base * (W.rampFrom + (W.rampTo - W.rampFrom) * x)) }); t += gap * rand(1 - W.gapJitter, 1 + W.gapJitter); }
    this.waveGroups.push({ at: this.time + D, size: round(base * W.finalMultiplier) }); // big closing group
    if (w === 1) { // wave 1: exactly firstWaveEnemies raccoons, spread over the groups (growing)
      let left = Math.round(W.firstWaveEnemies * cf);
      const gs = this.waveGroups, n = Math.min(gs.length, left);
      this.waveGroups = gs.slice(gs.length - n);
      this.waveGroups.forEach((g, i) => { g.size = i === n - 1 ? left : 1; left -= g.size; });
    }
    this.waveT = 0; this.waveT0 = this.time; this.waveDur = D + 4;
    this.emit({ k: 'waveStart', w });
    const be = this.bossEvery(); if (be > 0 && w % be === 0) this.spawnBoss(); // boss wave: last wave of every night
  }
  /** test mode: jump to wave w */
  jumpToWave(w: number) { this.spawnQueue.length = 0; this.time = Math.max(this.time, 0); this.startWave(Math.max(1, Math.round(w))); }
  private waves(dt: number) {
    const W = this.cfg.waves;
    if (this.wavePause) {
      this.waveT -= dt;
      if (this.waveT <= 0) { if (this.wave >= W.total) { this.won = true; this.gameOver(); return; } this.startWave(this.wave + 1); }
    } else {
      const R = W.spawnRadius, spread = W.directionSpread * Math.PI / 180;
      for (const g of this.waveGroups) {
        if (!g.planned && this.time >= g.at - W.warnTime) { // eyes + calls warn of the coming group
          g.planned = this.planGroup(g.size);
          this.emit({ k: 'warn', d: g.planned.dirs.map(r2), ty: g.planned.groups.map(x => x.map(t => ENEMIES.indexOf(t))), w: W.warnTime });
          g.planned.dirs.forEach((a, i) => { const t = g.planned!.groups[i][0]; if (t) this.sfx(t + '.wave', Math.cos(a) * R, Math.sin(a) * R); });
        }
      }
      while (this.waveGroups.length && this.time >= this.waveGroups[0].at && this.waveGroups[0].planned) {
        const g = this.waveGroups.shift()!;
        g.planned!.dirs.forEach((a, i) => {
          let at = this.time;
          for (const type of g.planned!.groups[i]) { this.spawnQueue.push({ at, type, angle: a + rand(-spread, spread) }); at += rand(W.staggerMin, W.staggerMax); }
        });
      }
      const alive = this.enemies.reduce((n, e) => n + (e.wv === this.wave && !e.dead ? 1 : 0), 0);
      if (!this.waveGroups.length && !this.spawnQueue.length && alive <= this.waveSpawned * (1 - (W.endKilled ?? 0))) { // all groups out and enough of them gone: pause begins
        this.wavePause = true; this.waveT = this.pauseLen = W.pauseStart + W.pausePerWave * (this.wave - 1); this.dayEnd = this.dayFrac();
        this.emit({ k: 'waveEnd', w: this.wave });
      }
    }
    const cap = this.cfg.enemies.maxAlive * this.f(this.cfg.coop.enemyCountExponent);
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i]; if (s.at > this.time) continue;
      this.spawnQueue.splice(i, 1);
      if (this.enemies.length < cap) {
        const lim = this.cfg.enemies[s.type].maxAlive; // e.g. at most 5 sheep at once
        const type = lim !== undefined && this.enemies.filter(e => e.type === s.type).length >= lim ? 'raccoon' : s.type;
        const EL = this.cfg.enemies.elite, ch = this.wave >= EL.fromWave ? Math.min(EL.chanceMax, EL.chanceStart + EL.chancePerWave * (this.wave - EL.fromWave)) : 0;
        this.spawnEnemy(type, s.angle, Math.random() < ch);
      }
    }
  }

  // ---------- per-player control ----------
  private updatePlayer(p: Player, dt: number) {
    const P = this.cfg.player, it = p.intent;
    p.flash -= dt; p.swing -= dt; p.tillT -= dt;
    if (!p.alive) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) { p.alive = true; p.hp = P.hp; p.x = 0; p.z = 0; this.burst(0, .6, 0, 0xffe0a0, 40, 3, .2, .8); this.sfx('player.spawn', 0, 0); }
      return;
    }
    let mx = it.mx, mz = it.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const sf = this.stunF(p); // stunned: movement and attacks ramp up from 0 to normal
    if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
    this.tickPoison(p, dt, d => this.hurtPlayer(p, d, 'v'));
    if (!p.alive) return;
    if (p.kb) { const s = Math.min(p.kb.left, 12 * dt); p.x += p.kb.dx * s; p.z += p.kb.dz * s; p.kb.left -= s; if (p.kb.left <= 0) p.kb = null; }
    else if (ml > .05 && sf > 0) { p.x += mx * P.speed * sf * dt; p.z += mz * P.speed * sf * dt; p.walk += dt * sf * 10 * Math.min(1, ml); if (!it.aim && !it.fire) p.face = Math.atan2(mx, mz); }
    [p.x, p.z] = this.clampArena(p.x, p.z);
    // standing (with the centre) on a field heals it
    const under = this.fieldAt(slotAt(this.cfg, this.slots, p.x, p.z));
    if (under && under.alive && under.hp < under.maxHp) under.hp = Math.min(under.maxHp, under.hp + this.cfg.fields.healPerSecond * dt);

    p.rakeCd -= dt * sf; for (const id of SKILLS) p.skills[id].cdT = Math.max(0, p.skills[id].cdT - dt * sf);
    p.xbT = Math.max(0, p.xbT - dt);
    const xa = p.skills.asp; // crossbow salvo: remaining bolts follow at burstGap, re-aimed each time
    if (xa.burst > 0) {
      xa.burstT -= dt * sf;
      if (xa.burstT <= 0) {
        if (!p.alive || !this.canFire(p, 'asp')) xa.burst = 0;
        else { const st = this.stats('asp', xa), d = this.aimDir(p, st.range); this.aspBolt(p, d[0], d[1], st, true); xa.burst--; xa.burstT += st.gap; }
      }
    }
    if (p.flOn > 0) { // flame keeps sweeping while it burns
      p.flOn -= dt; const fs = this.stats('chili', p.skills.chili);
      p.flPh = (p.flPh + dt / this.cfg.skills.chili.sweepPeriod) % 1; p.flSpin += fs.spin * Math.PI / 180 * dt;
      p.flAng = fs.circle ? p.flSpin : p.flBase + fs.sweep * Math.PI / 360 * (1 - 4 * Math.abs(p.flPh - .5)); // smooth angle for the view
    }
    // active weapon: auto-switch when empty, cycle on request
    if (p.active !== 'rake' && this.isEmpty(p, p.active)) p.active = this.nextAvailable(p, p.active, true);
    if (it.cycle !== p.lastCycle) { p.lastCycle = it.cycle; p.active = this.nextAvailable(p, p.active, false); this.emit({ k: 'cycle', p: p.id }); }
    const fw: Weapon | null = it.fire === 'active' ? p.active : it.fire;
    for (const id of SKILLS) if (fw !== id) p.skills[id].firing = false;
    if (it.aim && Math.hypot(it.ax, it.az) > .01) { const l = Math.hypot(it.ax, it.az); p.aimX = it.ax / l; p.aimZ = it.az / l; p.face = Math.atan2(p.aimX, p.aimZ); }
    if (fw) {
      if (fw === 'rake') { if (p.rakeCd <= 0) { const d = this.aimDir(p, this.rakeStats(p).range); this.rakeAttack(p, d[0], d[1]); } }
      else this.tryFire(p, fw);
    }
    if (it.tapSeq !== p.lastTap) {
      p.lastTap = it.tapSeq;
      const w = it.tapW;
      if (w === 'rake') { if (p.rakeCd <= 0) { const d = this.aimDir(p, this.rakeStats(p).range, false); this.rakeAttack(p, d[0], d[1]); } }
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
  update(rdt: number) {
    // pauses are eased: the game slows to a stop / speeds up again instead of jumping
    const want = this.phase === 'play' && !this.paused ? 1 : 0, T = Math.max(.01, this.cfg.transitions?.slow ?? .5);
    this.ramp = want ? Math.min(1, this.ramp + rdt / T) : Math.max(0, this.ramp - rdt / T);
    const scale = this.ramp * this.ramp * (3 - 2 * this.ramp);
    if (scale <= 0) return;
    const dt = rdt * scale;
    this.time += dt;
    for (const p of this.players) this.updatePlayer(p, dt);
    // fields
    for (const f of this.fields) {
      this.tickPoison(f, dt, d => this.hurtField(f, d));
      if (f.tilledT > 0) { f.tilledT -= dt; this.tillHeal(f, dt); if (f.tilledT <= 0) f.tilledBy = -1; }
      if (f.alive) { f.t -= dt * this.prodMult(f); if (f.t <= 0) { f.t += this.cfg.plants[f.type].interval; this.produce(f); } }
      f.shake = Math.max(0, f.shake - dt);
    }
    // dead fields vanish (their type stays known for offers)
    for (const f of [...this.fields]) if (!f.alive && f.goneT !== undefined && (f.goneT -= dt) <= 0) { this.lost.add(f.type); this.fields.splice(this.fields.indexOf(f), 1); }
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
          else if (bd < PL.magnetRadius && this.cfg.plants[fr.type].magnet !== false) { fr.x += (best.x - fr.x) / bd * PL.magnetSpeed * dt; fr.z += (best.z - fr.z) / bd * PL.magnetSpeed * dt; }
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
      const a = en[i], b = en[j]; if (this.inTree(a) || this.inTree(b)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r + b.r;
      if (d < m && d > .001) { const k = (m - d) / d * .5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
    // cabbage poison pools
    const C = this.cfg.skills.cab;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pl = this.pools[i]; pl.t -= dt; pl.tickT -= dt;
      while (pl.tickT <= 1e-6 && pl.ticks > 0) {
        pl.ticks--;
        pl.tickT += 1 / C.poolTicksPerSecond;
        for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - pl.x, e.z - pl.z) < pl.r + e.r * .5) this.hurtEnemy(e, pl.dmg, { color: 'v', silent: true, src: 'cab' });
      }
      if (pl.ticks <= 0 || pl.t < -.1) this.pools.splice(i, 1);
    }
    this.updateProjs(dt);
    this.updateBerryBombs(dt);
  }
  private updateProjs(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i]; const step = Math.min(pr.speed * dt, pr.left);
      const ax = pr.x, az = pr.z; let done = false; const hits: [number, Enemy][] = [];
      for (const e of this.enemies) {
        if (e.dead || pr.hit.has(e)) continue;
        const ex = e.x - ax, ez = e.z - az; const tp = clamp(ex * pr.dx + ez * pr.dz, 0, step);
        if (Math.hypot(e.x - (ax + pr.dx * tp), e.z - (az + pr.dz * tp)) < e.r + pr.w && !this.airborne(e)) hits.push([tp, e]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (const [, e] of hits) {
        pr.hit.add(e);
        if (pr.kind === 'asp') {
          this.hurtEnemy(e, pr.dmg, { color: 'g', src: 'asp' }); this.burst(e.x, .4, e.z, 0x9cff60, 6, 2, .1, .3); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 0 });
          if (pr.pierceLeft > 0) { pr.pierceLeft--; pr.dmg *= pr.pf; } else { done = true; break; }
        } else {
          this.hurtEnemy(e, pr.dmg, { bleed: true, color: 'p', src: 'cran' });
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
          this.mines.push({ id: this.nid++, x: pr.x, z: pr.z, dmg: pr.dmg * pr.mine, t: this.cfg.skills.cran.splashDelay }); // missed: lies, then pops
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
      if (mn.t > 0) continue;
      const C = this.cfg.skills.cran;
      for (const e of [...this.enemies]) if (!e.dead && !this.airborne(e) && dist(e, mn) < C.splashRadius + e.r * .5) this.hurtEnemy(e, mn.dmg, { color: 'p', src: 'cran' });
      this.emit({ k: 'berryPop', x: r2(mn.x), z: r2(mn.z), r: C.splashRadius });
      this.snd('berryPop');
      this.mines.splice(i, 1);
    }
  }
  gameOver() { if (this.phase === 'over') return; this.phase = 'over'; this.emit({ k: 'over' }); }

  // ---------- level-up offers ----------
  offers(p: Player): Offer[] {
    // short explanation line under upgrade values (names.hints): full key, then the part after "_", then the part before
    const out = this.drawOffers(p), H = this.cfg.names.hints || {};
    for (const o of out) if (!o.wp) { const [k0, k1] = o.key.split('_'); const h = H[o.key] ?? H[k1] ?? H[k0]; if (h) o.hint = h; }
    return out;
  }
  private drawOffers(p: Player): Offer[] {
    const N = this.cfg.names, U = this.cfg.upgrades, PL = this.cfg.plants;
    const pool: (Offer & { w: number })[] = [], prio: Offer[] = [];
    // guaranteed openers: 1st level-up = new field, 2nd level-up = its weapon (or rake upgrades)
    const first = !!U.firstUpgradeNewField && this.lvRound === 1, second = !!U.secondUpgradeWeapon && this.lvRound === 2;
    const nf = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    for (const id of SKILLS) {
      const s = p.skills[id];
      if (this.fieldOf(id) && !s.learned && !this.closedType(p, id) && (second || p.collected[id] >= (PL[id].unlockAt || 0))) {
        // weapon unlock card: every stat as an icon chip, special effect named briefly
        const st = this.stats(id, s), C = this.cfg.skills, ammo = `${nf(st.cost * st.shots)} {${id}}`;
        const lines = id === 'chili' ? [`{dmg} ${nf(st.dmg, 1)}`, `{fire} ${nf(C.chili.burnDamage * st.dmgPct, 1)} × ${C.chili.burnStacks}`, `{range} ${nf(st.range, 1)} m`, `{sweep} ${nf(st.sweep)}°`, `{arc} ${nf(st.cone)}°`, `${nf(st.cost / st.cd)} {chili} / s`]
          : id === 'cab' ? [`{dmg} ${nf(st.dmg)}`, `{radius} ${nf(st.range * 100)} cm`, `{cd} ${nf(st.cd, 2)} s`, ammo]
          : [`{dmg} ${nf(st.dmg)}${id === 'cran' ? ' × ' + st.pellets : ''}`, `{range} ${nf(st.range, 1)} m`, `{cd} ${nf(st.cd, 2)} s`, ammo, ...(id === 'asp' ? [`{pierce} ${st.pierce}`] : id === 'lemon' ? [`{chain} ${nf(C.lemon.chainRadius, 1)} m`] : [])];
        prio.push({ key: 'learn_' + id, cat: 'skill', pic: 'skill_' + id, title: N.skills[id], lines, wp: id, fx: N.effects?.[id] });
      }
    }
    // field cards: types already on the board (build / raise rarity) vs. new types (offered every newFieldTypeEvery levels)
    const owned = new Set([...this.fields.map(f => f.type), ...this.lost]), fieldPool: (Offer & { w: number })[] = [], newTypes: Offer[] = [];
    for (const id of FRUITS) {
      if (this.closedType(p, id)) continue;
      const lines = [`${PL[id].amount || 1} {${id}} / ${nf(PL[id].interval, PL[id].interval % 1 ? 1 : 0)} s`];
      if (isWeaponFruit(id) && !p.skills[id].learned) lines.push(`Unlock: ${N.skills[id]}`);
      const card = { key: 'field_' + id, cat: 'field' as const, w: 1, pic: 'field_' + id, title: N.fields[id], lines };
      if (owned.has(id)) fieldPool.push(card); else if (this.level - this.pendingLv + 1 >= (PL[id].minLevel || 0)) newTypes.push(card); // lemon tree only from level 10
    }
    for (const id of SKILLS) {
      const s = p.skills[id]; if (!s.learned) continue;
      const a = this.stats(id, s);
      const mk = (key: string, mut: (x: SkillState) => void, line: (b: SkillStats) => string) => {
        const s2 = { ...s }; mut(s2); const b = this.stats(id, s2);
        pool.push({ key, cat: 'skill', w: 1, pic: 'skill_' + id, title: N.skills[id], lines: [line(b)] });
      };
      mk(id + '_dmg', x => x.lvDmg++, b => id === 'chili' ? `{dmg} ${nf(a.dmg, 1)} → ${nf(b.dmg, 1)} · {fire} ${nf(this.cfg.skills.chili.burnDamage * a.dmgPct, 1)} → ${nf(this.cfg.skills.chili.burnDamage * b.dmgPct, 1)}` : `{dmg} ${nf(a.dmg, 1)} → ${nf(b.dmg, 1)}`);
      mk(id + '_rng', x => x.lvRange++, b => id === 'cab' ? `{radius} ${nf(a.range * 100)} → ${nf(b.range * 100)} cm` : `{range} ${nf(a.range, 1)} → ${nf(b.range, 1)} m`);
      if (id !== 'chili') mk(id + '_cd', x => x.lvCd++, b => `{cd} ${nf(a.cd, 2)} → ${nf(b.cd, 2)} s`); // flamethrower: fixed 8 chilis/s
      if (id === 'chili') {
        // "circle": sweep + cone grow together; from 360 deg the flame spins (U/s = turns per second)
        if (!a.sweepMax) {
          const b = this.chiliGeom(s.sweepLv + 1), card = (l1: string, l2: string) => pool.push({ key: 'chili_sweep', cat: 'skill', w: 1, pic: 'skill_chili', title: N.skills.chili, lines: [l1, l2] });
          if (!a.circle) card(`{sweep} ${nf(a.sweep)}° → ${nf(b.sweep)}°`, `{arc} ${nf(a.cone)}° → ${nf(b.cone)}°`);
          else card(`{arc} ${nf(a.cone)}° → ${nf(b.cone)}°`, `{spin} ${nf(a.spin / 360, 1)} → ${nf(b.spin / 360, 1)} U/s`);
        }
        const T = this.cfg.upgrades.chiliTick;
        if (a.tick > T.min + 1e-6) mk('chili_tick', x => x.tickLv++, b => `{fire} {cd} ${nf(a.tick, 2)} → ${nf(b.tick, 2)} s`);
      }
      if (id === 'asp') {
        if (s.pierce < (U.aspPierce.max || 4)) mk('asp_pierce', x => x.pierce += U.aspPierce.step, b => `{pierce} ${a.pierce} → ${b.pierce}`);
        if (s.pierceBonus < (U.aspPierceBonus.maxLevel || 5)) mk('asp_pb', x => x.pierceBonus++, b => `{pierce} ${nf(a.pf * 100)} → ${nf(b.pf * 100)} %`);
        if (s.sizeLv < (U.aspSize.maxLevel || 5)) mk('asp_size', x => x.sizeLv++, b => `{size} ${nf(a.width * 100)} → ${nf(b.width * 100)} cm`);
      }
      if (id === 'cran') {
        if (s.extraPel < (U.cranPellets.maxLevel || 3)) mk('cran_pel', x => x.extraPel++, b => `{pellet} ${a.pellets} → ${b.pellets}`);
        if (s.mineLv < (U.cranSplash.maxLevel || 5) && a.splash < 1) mk('cran_mine', x => x.mineLv++, b => `{mine} ${nf(a.splash * 100)} → ${nf(b.splash * 100)} %`);
      }
      if (id === 'lemon') {
        const tierName = ['Hauptziel', '2. Glied', '3. Glied'];
        if (s.tgtLv < U.lemonTargets.maxLevel) { const k = U.lemonTargets.order[s.tgtLv]; mk('lemon_tgt', x => x.tgtLv++, () => `{chain} +1 · ${tierName[k] ?? ''}`); }
        if (s.xferLv < (U.lemonTransfer.maxLevel || 4)) { const t0 = this.cfg.skills.lemon.transfer + U.lemonTransfer.step * s.xferLv, t1 = t0 + U.lemonTransfer.step; mk('lemon_xfer', x => x.xferLv++, () => `{chain} ${nf(t0 * 100)} → ${nf(t1 * 100)} %`); }
      }
      if (id === 'cab' && s.minis < (U.cabMini.maxLevel || 5)) mk('cab_mini', x => x.minis += U.cabMini.step, b => `{mini} ${a.minis} → ${b.minis}`);
    }
    // starting weapon (rake) upgrades: always available until maxed
    { const RL = p.rakeLv, RS = this.rakeStats(p), mkR = (key: string, lv: number, max: number | undefined, line: string) => { if (lv < (max || 10)) pool.push({ key, cat: 'skill', w: 1, pic: 'skill_rake', title: N.skills.rake, lines: [line] }); };
      const nx = { ...p, rakeLv: { ...RL } } as Player;
      nx.rakeLv = { ...RL, wid: RL.wid + 1 }; if (U.rakeWidth) mkR('rake_wid', RL.wid, U.rakeWidth.maxLevel, `{arc} ${nf(RS.width * 100)} → ${nf(this.rakeStats(nx).width * 100)} cm`);
      nx.rakeLv = { ...RL, rng: RL.rng + 1 }; mkR('rake_rng', RL.rng, U.rakeRange.maxLevel, `{range} ${nf(RS.range * 100)} → ${nf(this.rakeStats(nx).range * 100)} cm`);
      nx.rakeLv = { ...RL, dmg: RL.dmg + 1 }; mkR('rake_dmg', RL.dmg, U.rakeDamage.maxLevel, `{dmg} ${nf(RS.dmg, 1)} → ${nf(this.rakeStats(nx).dmg, 1)}`);
      nx.rakeLv = { ...RL, cd: RL.cd + 1 }; if (U.rakeSpeed) mkR('rake_cd', RL.cd, U.rakeSpeed.maxLevel, `{cd} ${nf(RS.cd, 2)} → ${nf(this.rakeStats(nx).cd, 2)} s`); }
    // field care: tilling heals the tilled field
    if (this.tillHealLv < (U.tillHeal.maxLevel || 5)) { const st = U.tillHeal.step; fieldPool.push({ key: 'care_till', cat: 'plant', w: U.tillHeal.weight ?? 1, pic: 'care', title: N.care, lines: [`{rake} {fieldhp} ${nf(this.tillHealLv * st)} → ${nf((this.tillHealLv + 1) * st)} /s`] }); }
    for (const f of FRUITS) if (this.fieldOf(f) && !this.closedType(p, f) && this.yieldLv[f] < (U.doubleHarvest.maxLevel || 6)) {
      const lv = this.yieldLv[f], st = U.doubleHarvest.step;
      fieldPool.push({ key: 'yield_' + f, cat: 'plant', w: 1, pic: 'plant_' + f, title: N.plants[f], lines: [`{x2} ${nf(lv * st * 100)} → ${nf((lv + 1) * st * 100)} %`] });
    }
    // cards you already took come up a bit more often
    for (const o of [...pool, ...fieldPool]) o.w *= 1 + U.repeatWeight * (p.taken[o.key] || 0);
    const draw = (from: (Offer & { w: number })[]): Offer | null => {
      if (!from.length) return null;
      const tot = from.reduce((a, o) => a + o.w, 0); let r = Math.random() * tot, k = 0;
      for (; k < from.length; k++) { r -= from[k].w; if (r <= 0) break; }
      const { w, ...o } = from.splice(Math.min(k, from.length - 1), 1)[0]; void w; return o;
    };
    if (first && newTypes.length) { // 2 new field types + another blueberry field as alternative
      const nt = newTypes.map(o => ({ ...o, w: 1 })), out: Offer[] = [];
      while (out.length < U.newFieldTypeChoices && nt.length) out.push(draw(nt)!);
      const bl = fieldPool.find(o => o.key === 'field_blue'); if (bl) { const { w, ...o } = bl; void w; out.push(o); }
      return out.slice(0, U.offersPerLevel);
    }
    if (second) { // weapon of the new field (no collect condition), rest rake upgrades
      const out: Offer[] = prio.slice(0, U.offersPerLevel), rk = pool.filter(o => o.key.startsWith('rake_'));
      while (out.length < U.offersPerLevel) { const o = draw(rk); if (!o) break; out.push(o); }
      if (out.length) return out;
    }
    // 1) field slot: every newFieldTypeEvery levels a choice of new field types, otherwise 1 field/plant card
    const lvNow = this.level - this.pendingLv + 1, fieldOut: Offer[] = [];
    if (U.newFieldTypeEvery > 0 && lvNow % U.newFieldTypeEvery === 0 && newTypes.length) {
      const nt = newTypes.map(o => ({ ...o, w: 1 }));
      while (fieldOut.length < U.newFieldTypeChoices && nt.length) fieldOut.push(draw(nt)!);
    } else for (let i = 0; i < U.fieldCardsPerLevel; i++) { const o = draw(fieldPool); if (o) fieldOut.push(o); }
    // 2) weapons: unlock cards first, then upgrades, at most weaponCardsMax
    const weaponOut: Offer[] = prio.slice(0, U.weaponCardsMax);
    while (weaponOut.length < U.weaponCardsMax && fieldOut.length + weaponOut.length < U.offersPerLevel) { const o = draw(pool); if (!o) break; weaponOut.push(o); }
    const out: Offer[] = [...fieldOut, ...weaponOut].slice(0, U.offersPerLevel);
    // 3) still room: more field/plant cards, herbal tea only if nothing else can be drawn
    while (out.length < U.offersPerLevel) { const o = draw(fieldPool); if (!o) break; out.push(o); }
    const T = U.herbalTea;
    while (out.length < U.offersPerLevel) out.push({ key: 'tea_' + out.length, cat: 'misc', pic: 'tea', title: N.tea, lines: [`{heart} +${T.playerHeal} · {fieldhp} +${T.fieldHeal}`] });
    return out;
  }
  applyOffer(p: Player, key: string) {
    const U = this.cfg.upgrades;
    const [a, b] = key.split('_') as [string, string];
    const tea = () => { p.hp = Math.min(this.cfg.player.hp, p.hp + U.herbalTea.playerHeal); this.fields.forEach(f => f.alive && (f.hp = Math.min(f.maxHp, f.hp + U.herbalTea.fieldHeal))); };
    if (a === 'learn') { this.learn(p, b as SkillId); return; }
    if (a === 'field') { p.placing = b as FruitType; return; }
    if (a === 'yield') { if (this.yieldLv[b as FruitType] < (U.doubleHarvest.maxLevel || 6)) this.yieldLv[b as FruitType]++; else tea(); return; }
    if (a === 'tea') { tea(); return; }
    if (a === 'rake') { if (b === 'rng') p.rakeLv.rng++; else if (b === 'dmg') p.rakeLv.dmg++; else if (b === 'wid') p.rakeLv.wid++; else if (b === 'cd') p.rakeLv.cd++; return; }
    if (a === 'care') { this.tillHealLv++; return; }
    const s = p.skills[a as SkillId];
    switch (key) {
      case 'asp_dmg': case 'cran_dmg': case 'cab_dmg': case 'lemon_dmg': s.lvDmg++; break;
      case 'asp_rng': case 'cran_rng': case 'cab_rng': case 'lemon_rng': s.lvRange++; break;
      case 'asp_cd': case 'cran_cd': case 'cab_cd': case 'lemon_cd': s.lvCd++; break;
      case 'lemon_tgt': s.tgtLv++; break;
      case 'lemon_xfer': s.xferLv++; break;
      case 'chili_dmg': s.lvDmg++; break;
      case 'chili_rng': s.lvRange++; break;
      case 'chili_sweep': s.sweepLv++; break;
      case 'chili_tick': s.tickLv++; break;
      case 'asp_pierce': s.pierce += U.aspPierce.step; break;
      case 'asp_pb': s.pierceBonus++; break;
      case 'asp_size': s.sizeLv++; break;
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
        nd: st.map(s => s.need), co: st.map(s => s.cost), rg: st.map(s => r2(s.range)), cs: st.map(s => r2(s.cd / s.shots)), cd: SKILLS.map((id, i) => r2(p.skills[id].cdT / st[i].cd)),
        ac: WEAPONS.indexOf(p.active), sl: p.slots.map(w => SKILLS.indexOf(w)), rk: r2(Math.max(0, p.rakeCd / this.rakeStats(p).cd)), rr: r2(this.rakeStats(p).range),
        of: p.offers, pk: p.picked ? 1 : 0, pc: p.placing ? FRUITS.indexOf(p.placing) : -1, nu: p.nuts,
      };
    }
    const sw = this.cfg.rake.swingTime;
    return {
      t: r2(this.time), ph: this.phase, ts: r2(this.ramp), wv: this.wave, wn: this.cfg.waves.total, dh: r2(this.dayHour()), dc: this.cycleLen(), wp: this.wavePause ? 1 : 0, won: this.won ? 1 : 0, lr: this.lvRound, lv: this.level, xp: Math.floor(this.xp), nx: this.need(this.level), ki: this.kills, cx: this.collectedXP, n: this.n,
      pl: this.players.map(p => ({
        id: p.id, c: p.color, x: r2(p.x), z: r2(p.z), f: r2(p.face), hp: Math.ceil(p.hp), mhp: this.cfg.player.hp, al: p.alive ? 1 : 0, st: p.stun > 0 ? 1 : 0,
        sw: p.swing > 0 ? r2(1 - p.swing / sw) : 0, sd: r2(p.swingDir), wk: r2(p.walk), rs: Math.ceil(p.respawnT), po: p.poison.length, fl: p.flash > 0 ? 1 : 0, ti: p.tillT > 0 ? r2(1 - p.tillT / (this.cfg.rake.swingTime * 1.6)) : 0, rr: r2(this.rakeStats(p).range), ra: r2(this.rakeStats(p).width),
        ...(() => { const fs = this.stats('chili', p.skills.chili); return { xb: p.xbT > 0 || p.active === 'asp' ? 1 : 0, fo: p.flOn > 0 ? 1 : 0, fa: r2(p.flAng), fc: fs.cone, fw: fs.sweep, fr: r2(fs.range) } as const; })(),
        lw: this.equipped(p, 'lemon') ? 1 : 0,
      })),
      en: this.enemies.map(e => {
        let fl = 0, aux = 0, aux2 = 0;
        if (e.stun > 0) fl |= EF.stun; if (e.bleed > 0) fl |= EF.bleed; if (e.burn > 0) fl |= EF.burn; if (e.flash > 0) fl |= EF.flash;
        if (this.airborne(e)) fl |= EF.air; if (e.fleeing) fl |= EF.flee; if (e.lunge > 0) fl |= EF.lunge; if (e.elite) fl |= EF.elite;
        if (e.boss) { fl |= EF.boss; aux = e.boss.st === 'collect' ? 0 : e.boss.st === 'charge' ? 1 : 2; aux2 = e.boss.st === 'charge' ? r2(1 - e.boss.t / this.cfg.enemies.boss.chargeTime) : e.boss.atk; }
        if (e.hurtOnce || (e.shieldMax && e.shield < e.shieldMax)) fl |= EF.bar;
        if (e.type === 'toad') { aux = r2(e.hop % 1); if (e.tongueT > 0) { fl |= EF.tongue; aux2 = r2(Math.sin(clamp(e.tongueT / .35, 0, 1) * Math.PI) * e.tongueLen); } }
        if (e.type === 'hedgehog') aux = r2(e.puff / (this.cfg.enemies.hedgehog.puffEvery || 2));
        if (e.type === 'squirrel') { aux = e.state === 'climb' ? 1 : e.state === 'perch' ? 2 : e.state === 'jump' ? 3 : 0; aux2 = r2(e.y); }
        if (e.type === 'sheep') { if (e.state === 'windup') { fl |= EF.windup; aux = r2(1 - e.st / this.cfg.enemies.sheep.windup!); aux2 = r2(Math.atan2(e.cdx, e.cdz)); } if (e.state === 'charge') fl |= EF.charge; }
        return [e.id, ENEMIES.indexOf(e.type), r2(e.x), r2(e.z), r2(e.face), r2(e.hp / e.maxHp), e.shieldMax ? r2(e.shield / e.shieldMax) : -1, fl, e.carry.map(f => FRUITS.indexOf(f.type)).join(''), aux, aux2] as ESnap;
      }),
      fr: this.fruits.filter(f => f.state !== 'carried').map(f => [f.id, FRUITS.indexOf(f.type), f.tier, r2(f.x), r2(f.y), r2(f.z)]),
      pj: this.projs.map(p => [p.id, p.kind === 'asp' ? 0 : 1, r2(p.x), r2(p.y), r2(p.z), r2(Math.atan2(p.dx, p.dz)), r2(p.kind === 'asp' ? p.w / this.cfg.skills.asp.width : 1)]),
      bo: this.bombs.map(b => [b.id, r2(b.x), r2(b.y), r2(b.z), b.mini ? 1 : 0, b.t >= b.flight ? 1 : 0]),
      mi: this.mines.map(m => [m.id, r2(m.x), r2(m.z), r2(clamp(1 - m.t / this.cfg.skills.cran.splashDelay, 0, 1))]),
      fi: this.fields.map(f => [f.slot, FRUITS.indexOf(f.type), r2(f.hp / f.maxHp), f.alive ? 1 : 0, r2(f.shake), f.rarity, f.prog, f.edge, r2(clamp(1 - f.t / this.cfg.plants[f.type].interval, 0, 1)), f.tilledT > 0 ? 1 : 0, Math.round(this.rate(f) * 1000) / 1000]),
      pu: this.pools.map(p => [p.id, r2(p.x), r2(p.z), r2(p.r), r2(Math.max(0, p.t / this.cfg.skills.cab.poolDuration))]),
      bb: this.berryBombs.map(b => { const fl = b.flight > 0 ? Math.min(1, b.t / b.flight) : 1, armed = b.t >= b.flight; const x = armed ? b.x : b.fx + (b.x - b.fx) * fl, z = armed ? b.z : b.fz + (b.z - b.fz) * fl, y = b.rain ? Math.max(0, 7 * (1 - b.t / b.fuse)) + .15 : armed ? .15 : .6 + Math.sin(fl * Math.PI) * 1.2; return [b.id, r2(x), r2(y), r2(z), armed ? 1 : 0, r2(armed ? (b.t - b.flight) / b.fuse : fl), b.rain ? 1 : 0, r2(b.r)]; }),
      bs: (() => { const b = this.enemies.find(e => e.boss); return b ? r2(b.hp / b.maxHp) : -1; })(),
      me, ev,
    };
  }
  slotPos() { return this.slots; }
}
