// Host-authoritative game simulation. Pure data, no rendering: the view and the network
// only ever see Snap objects + events produced here.
import { Balancing, BuildingType, BUILDINGS, ComboId, COMBOS, coopF, ENEMIES, EnemyType, FRUITS, FruitType, isBuilding, isGun, isWeaponFruit, SKILLS, SkillId, Weapon, WEAPONS, AMMO_OF, SOURCE_OF, Berry, BERRIES, isBerry } from '../config';
import { emptyIntent, EF, ESnap, Ev, FiSnap, Intent, MSnap, Offer, Priv, Snap } from './snap';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()); // standard normal (Box-Muller)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const SQ3 = Math.sqrt(3);
/** asparagus pierce level "every target" */
const PIERCE_ALL = 999;
const FRUIT_BURST: Partial<Record<FruitType, number>> = { blue: 0x4a6cff, asp: 0x9cff60, cran: 0xd0203a, cab: 0x6fbf3a, lemon: 0xffe040, chili: 0xff3a10, nut: 0xb07a3a, wheat: 0xe8c060 };
/** tile types you can build: crops (except the forest nut tree) and buildings */
export const TILE_TYPES: FruitType[] = ['blue', 'black', 'asp', 'cran', 'cab', 'lemon', 'chili', 'nut', 'wheat', ...BUILDINGS];
/** neighbour bonus one tile gives to itself and every adjacent tile of the same type: bonusBase + upgrade bonus of its level
 *  (level 1: +5 %, 2: +8 %, 3: +12 %, 4: +17 %, 5: +23 % ... the step grows by 1 point per level) */
export function tileContrib(cfg: Balancing, level: number) {
  const T = cfg.tiles; let u = 0;
  for (let l = 1; l <= level; l++) u += l === 1 ? T.upgradeFirst : T.upgradeStep + T.upgradeStepGrowth * (l - 2);
  return T.bonusBase + u;
}
/** tiles needed on top for the next level: level 0 -> 1: 1, 1 -> 2: 2, 2 -> 3: 3 ... (total 2, 4, 7, 11 ...) */
export const tileCost = (cfg: Balancing, level: number) => cfg.tiles.costFirst + cfg.tiles.costGrowth * level;
/** does building b take this item as input? */
export function accepts(cfg: Balancing, b: FruitType, item: FruitType) {
  if (!isBuilding(b)) return false; const B = cfg.buildings[b];
  return !!(B.needs && B.needs[item]) || !!(B.needsAny && B.needsAny.includes(item));
}
/** egg pyramid (23.11.2026): square layers L x L, (L-1) x (L-1) ... 1, each layer in the hollows of the one below */
export const pyramidCount = (L: number) => { let n = 0; for (let k = 1; k <= L; k++) n += k * k; return n; };
/** Saftpresse (23.11.2026): where the bottle is filled (under the spout) and the row the full bottles stand in (relative to the tile) */
export const BOTTLE_SPOUT: [number, number] = [0, .62], BOTTLE_Y = .09;
export const BOTTLE_ROW: [number, number][] = [-.63, -.45, -.27, -.09, .09, .27, .45, .63].map(x => [x, .92 - Math.abs(x) * .1] as [number, number]);
export const EGG_SP = .1, EGG_LAYER = .085, EGG_POS: [number, number] = [.52, .42];
/** local position (x, height of the egg's centre, z) of stack slot i in a pyramid of L layers, next to the coop */
export function eggSlot(i: number, L: number): [number, number, number] {
  let layer = 0, n = L;
  while (i >= n * n && n > 1) { i -= n * n; n--; layer++; }
  const gx = i % n, gz = Math.floor(i / n), off = (n - 1) / 2;
  return [EGG_POS[0] + (gx - off) * EGG_SP, .11 + layer * EGG_LAYER, EGG_POS[1] + (gz - off) * EGG_SP];
}
/** item a tile puts out: crops their fruit, buildings their product */
export const outType = (cfg: Balancing, t: FruitType): FruitType => isBuilding(t) ? cfg.buildings[t].makes : t;
// ---------- hex field grid (pointy-top axial, fields touch each other) ----------
/** forest: slot outside the garden (in the forest), only for forest field types (nut tree) */
export interface Slot { q: number; r: number; x: number; z: number; forest?: boolean; /** Lager-Truhe (centre, 23.11.2026): nothing can be built here */ chest?: boolean }
export const hexR = (cfg: Balancing) => cfg.arena.fieldSize / 2; // corner radius
export function slotPositions(cfg: Balancing): Slot[] {
  const H = hexR(cfg), out: Slot[] = [];
  const RN = cfg.tiles?.rings ?? 5; // the centre field + RN rings around it
  for (let q = -RN; q <= RN; q++) for (let r = -RN; r <= RN; r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > RN) continue;
    out.push({ q, r, x: H * SQ3 * (q + r / 2), z: H * 1.5 * r });
  }
  // innermost slots first (ties broken by angle so it is deterministic)
  out.sort((a, b) => (Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)) || (Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)));
  const all: Slot[] = cfg.tiles?.rings ? out : out.slice(0, cfg.arena.fieldSlots);
  // forest slots: evenly around the garden in the forest belt (not on the hex grid)
  const F = cfg.forest;
  if (F) for (let i = 0; i < F.slots; i++) {
    const a = (F.angleOffset * Math.PI / 180) + i / F.slots * Math.PI * 2;
    all.push({ q: 1000 + i, r: 0, x: Math.cos(a) * F.radius, z: Math.sin(a) * F.radius, forest: true });
  }
  if (cfg.chest) { const c = all.find(sl => sl.q === 0 && sl.r === 0); if (c) c.chest = true; }
  return all;
}
/** forest slots take only forest types (nut tree), garden slots everything else */
export const forestType = (cfg: Balancing, t: FruitType) => !!cfg.forest?.types.includes(t);
export const slotFits = (cfg: Balancing, s: Slot | undefined, t: FruitType) => !!s && !s.chest && !!s.forest === forestType(cfg, t);
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
/** plant position in triangle k of a hex (centre, corner k, corner k+1): its centroid */
/** 24.11.2026 harvest order of the 6 plants of a field (same in sim and view): one plant per rake stroke */
export const plantOrder = (slot: number): number[] => { let a = (slot * 2654435761 + 7) >>> 0; const o = [0, 1, 2, 3, 4, 5]; for (let i = 5; i > 0; i--) { a = (Math.imul(a ^ a >>> 15, 2246822519) + 12345) >>> 0; const j = a % (i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; };
export const triPlant = (x: number, z: number, H: number, k: number): [number, number] => { const a = cornerAngle(k) + Math.PI / 6, r = H * .577; return [x + Math.cos(a) * r, z + Math.sin(a) * r]; };
export const hexDist =(a: Slot, b: Slot) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

interface SkillState { combo: ComboId | ''; merged: boolean; partner?: SkillState; learned: boolean; lvDmg: number; lvRange: number; lvCd: number; pierce: number; pierceBonus: number; extraPel: number; cranPierceLv: number; mineLv: number; minis: number; gasLv: number; poisLv: number; effLv: number; sizeLv: number; salvoLv: number; tgtLv: number; xferLv: number; sweepLv: number; tickLv: number; cdT: number; firing: boolean; burst: number; burstT: number; /** Körner-MP: heat 0..1, overheated (locked until cooled), fire-duration level, s since the last shot */ heat?: number; hot?: boolean; durLv?: number; idle?: number }
interface Poison { t: number; ticks: number }
export interface Player {
  id: number; color: number; x: number; z: number; face: number; hp: number; alive: boolean; deaths: number; respawnT: number;
  stun: number; stunMax: number; kb: { dx: number; dz: number; left: number } | null; poison: Poison[]; swing: number; swingDir: number; rakeHit: boolean; walk: number; flash: number; tillT: number;
  ammo: Record<SkillId, number>; collected: Record<SkillId, number>; skills: Record<SkillId, SkillState>;
  rakeCd: number; aimX: number; aimZ: number; active: Weapon; intent: Intent; lastTap: number; lastCycle: number;
  offers: Offer[] | null; picked: boolean; fresh: boolean; placing: FruitType | null; placeMode: 'new' | 'stack' | 'any';
  /** Werkstatt (23.11.2026): ideas (1 per level-up), the bench of this pause, open, must leave the chest before it opens again, s until it may open */
  ideas: number; shop: Offer[] | null; shopOpen: boolean; shopLock: boolean; shopDelay: number; shopWant?: boolean;
  /** bag: picked-up goods (wheat and products) to feed into buildings */
  inv: Partial<Record<FruitType, number>>;
  slots: SkillId[]; // learned weapons in the order they were learned (HUD positions)
  fieldLock: number; taken: Record<string, number>; rakeLv: { dmg: number; rng: number; dia: number; cd: number };
  /** flamethrower: sweep phase 0..1 (back and forth), spin angle (circle mode, rad), s the flame stays visible, last flame angle (rad) */
  xbT: number; handT: number; /** s left of the Mehlsack / Bratpfannen spin, its length, which weapon spins */ spinT: number; spinD: number; spinK: string; flPh: number; flSpin: number; flOn: number; flAng: number; flPrevSpin: number; flHit: number; flBase: number;
  /** collected nuts (nut trees in the forest) */
  nuts: number;
  /** combo weapon shown in the hand for cwT s after it fired */
  cwT: number; cwId: ComboId | '';
  /** charge throw (cabbage and thrown combos): weapon being charged, s held, charge 0..1 of the throw being fired */
  chW: SkillId | ''; chT: number; thrK: number; chAim: boolean;
  /** shotgun: berry it fires (23.11.2026), last berry-switch counter */
  berry: Berry; lastBerry: number;
}
interface Field { slot: number; type: FruitType; x: number; z: number; hp: number; maxHp: number; alive: boolean; t: number; shake: number; poison: Poison[]; rarity: number; prog: number; edge: number; tilledT: number; tilledBy: number; starter: boolean;
  /** buildings: input stock per item, s of work left on the running batch (0 = idle), broken (0 HP: stands still until repaired to full) */
  inb: Partial<Record<FruitType, number>>; work: number; broken: boolean; boost: number;
  /** Saftpresse: berry of the batch being pressed */ jb?: Berry;
  /** crop cycle (23.11.2026): cyc 0 = being harvested (harvest s), 1 = resting / growing back (rest s); ct = s into the phase */
  cyc: number; ct: number }
interface BossState { st: 'collect' | 'charge' | 'attack'; t: number; berries: number; atk: number; spawned: number; next: number; hx: number; hz: number; hdx: number; hdz: number; ph: number }
interface BerryBomb { id: number; fx: number; fz: number; x: number; z: number; flight: number; t: number; fuse: number; rain: boolean; dmg: number; r: number }
interface Pool { id: number; x: number; z: number; r: number; t: number; tickT: number; ticks: number; dmg: number; dur: number; iv: number; fire?: { tick: number; dmgPct: number } }
interface Fruit {
  id: number; type: FruitType; tier: number; val: number; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  state: 'fly' | 'ground' | 'collect' | 'merge' | 'carried'; src: number; born: number; bounce: number; r: number;
  ct: number; fx: number; fz: number; fy: number; collector: Player | null; tx: number; tz: number; mt: number;
  /** egg pyramid at the hens (23.11.2026): slot index in the stack, height it rests at */ sk?: number; gy?: number;
  /** loot a raccoon stole from the chest: gives no XP when picked up again */ nx?: boolean;
  /** 23.11.2026: XP multiplier of a berry dropped by an animal (enemy XP grows with the wave) */ xm?: number;
  /** juice bottle of the Saftpresse: berry (BERRIES index), XP it gives when picked up, resting spot relative to the press */ jb?: number; xv?: number; lx?: number; lz?: number;
}
type Target = { kind: 'player'; p: Player } | { kind: 'fruit'; fr: Fruit } | { kind: 'field'; f: Field } | { kind: 'flee' } | { kind: 'wander'; x: number; z: number } | { kind: 'chest' } | null;
interface Enemy {
  id: number; type: EnemyType; x: number; z: number; hp: number; maxHp: number; shield: number; shieldMax: number; shieldT: number; r: number; speed: number;
  /** frz: s left frozen solid (Blaubeer-Schrotflinte) */
  frz: number;
  stun: number; stunMax: number; bleed: number; bleedT: number; flash: number; atkT: number; think: number; target: Target; carry: Fruit[]; fleeing: boolean; face: number; /** s left until it is gone after the wave countdown ran out (0 = not leaving) */ leave: number;
  walk: number; hop: number; state: 'approach' | 'windup' | 'charge' | 'rest' | 'climb'; st: number; cdx: number; cdz: number; hitThisCharge: boolean;
  tongueT: number; tongueCd: number; tongueLen: number; lunge: number; dead: boolean; hurtOnce: boolean; kbx: number; kbz: number; kbLeft: number; laughT: number; elite: boolean; dmgMul: number; boss?: BossState; wv: number;
  burn: number; burnT: number; burnTick: number; burnDmg: number; burnLeft: number; burnSum: number; burnNum: number; // flamethrower fire: stacks, s to next tick, tick interval, damage multiplier
  shock: number; shockT: number; shockDmg: number; shockR: number; shockTk: number; // combo "unter Strom": s left, s to next tick, damage per tick, neighbour radius, tick interval
  pois: number; poisT: number; poisDmg: number; // cabbage poison: ticks left, s to next tick, damage per tick
  gasT: number; gasCh: number; gasDmg: number; // "Kohlgas" debuff: s left, chance to burst on death, blast damage for the poison it spreads
  puff: number; // hedgehog: s into the current puff cycle
  /** squirrel: home tree, where it started climbing, height above the ground (hops, climbing) */
  hx: number; hz: number; cx: number; cz: number; y: number;
  /** Spiegelei it is lured to (id, 0 = none), s spent eating so far */
  bait?: number; eat?: number;
  /** Dornenfessel (Brombeere): s left, s to next tick; bleeding: position at the last tick (only moving animals bleed) */
  thorn: number; thornT: number; bx: number; bz: number;
  /** raccoon at the chest: thief slot on the circle (-1 none), s to the next stolen item, items it can carry */
  cs: number; stealT: number; cmax: number;
  /** Körner-MP: grain damage not shown yet, time of the last number */ gs?: number; gt?: number;
}
/** projectile kinds (snapshot index = position): combo kinds after asp/cran */
export const PK = ['asp', 'cran', 'jam', 'spike', 'sour', 'lance', 'hot', 'rocket', 'shock', 'ball', 'blue', 'black', 'wheat'] as const;
type ProjKind = typeof PK[number];
interface Proj { id: number; kind: ProjKind; x: number; y: number; z: number; dx: number; dz: number; speed: number; left: number; total: number; dmg: number; pierceLeft: number; pf: number; mine: number; w: number; hit: Set<Enemy>;
  /** combo extras: blast radius / share (jam, rocket), burn stacks + tick (lance, hot), shock share (sour), stats of the shot */
  r?: number; b?: number; burn?: number; tick?: number; dmgPct?: number; shk?: number; cs?: ComboStats;
  /** lemon ball lightning: s to the next zap tick, chain targets, chance per chain target to jump back to the main target */
  zt?: number; ch?: number; rc?: number; cd?: number; tr?: number }
export const BK = ['cab', 'cole', 'cabboom', 'kimchi'] as const;
/** Mehlsack flour cloud (23.11.2026): hangs life s (fades the last fade s); fire ignites it at (ix, iz) -> burn front grows at frontSpeed */
/** Spiegelei bait (23.11.2026): waits delay s in the pan (spin), flies fl s from (sx, sz) to (x, z), then lures every animal within r m.
 *  left = s of eating left (all eaters together eat it up: 3 animals on 3 eggs 3 s, 9 animals 1 s); out = angle pointing away from the centre of the 3 */
interface Bait { id: number; x: number; z: number; sx: number; sz: number; y: number; delay: number; fl: number; t: number; left: number; total: number; r: number; age: number; out: number; eaters: number; /** animals heading for it */ n: number }
interface Cloud { id: number; x: number; z: number; r: number; age: number; life: number; ign: number; ix: number; iz: number; front: number; dmg: number; hit: Set<number> }
interface Bomb { /** cabbage contact mine lying on the ground */ mine?: boolean; id: number; fx: number; fy: number; fz: number; tx: number; tz: number; x: number; y: number; z: number; t: number; flight: number; fuse: number; radius: number; dmg: number; minis: number; mini: boolean; gas?: number; pm?: number;
  kind: typeof BK[number]; gen: number; cs?: ComboStats; tickT?: number }
interface Mine { id: number; x: number; z: number; dmg: number; t: number; r?: number; bleed?: boolean; fire?: { tick: number; dmgPct: number; n: number }; sx?: number; sz?: number; fl?: number; ft?: number } // missed cranberry lying on the ground until it pops (fl: flight time left of a scattered berry)
/** Shockgun berry on the ground: every tickInterval lightning jumps to the nearest berries */
interface SNode { id: number; x: number; z: number; t: number; ticks: number; dmg: number; links: number; lr: number; lw: number; tot: number }
/** Chillightning wave rushing forward along the ground */
interface LWave { ox: number; oz: number; dx: number; dz: number; d: number; len: number; w: number; sp: number; dmg: number; kb: number; cs: ComboStats; hit: Set<Enemy> }
/** stats of a combo weapon (all upgrades of both weapons folded in) */
export interface ComboStats { cid: ComboId; dmg: number; dmgPct: number; range: number; cd: number; cost: number; shots: number; gap: number; need: number; throwDist: number;
  count: number; pierce: number; pf: number; width: number; radius: number; blast: number; burn: number; tick: number; shock: number; shockR: number; shockTick: number;
  links: number; linkRange: number; minis: number; berryDmg: number; spikeDmg: number; splash: number }
interface PendingSpawn { at: number; type: EnemyType; angle: number }
interface PlannedWave { dirs: number[]; groups: EnemyType[][] }

export interface SkillStats { dmg: number; dmgPct: number; range: number; cd: number; cost: number; need: number; shots: number; gap: number; pierce: number; pf: number; pellets: number; cranPierce: number; gas: number; poisonMul: number; chains: number; chainReturn: number; chainDmg: number; ballR: number; tickR: number; splash: number; minis: number; throwDist: number; width: number; size: number; /** Spiegelei: s of eating per egg */ eat: number; /** Körner-MP: s of fire until it overheats */ dur: number;
  cone: number; sweep: number; circle: boolean; spin: number; tick: number; sweepMax: boolean } // flamethrower: cone/sweep deg, spin deg/s, fire tick s

export interface Sandbox { rate: number; type: EnemyType | 'random'; acc: number; hour: number; W: number; D: number; weapon: string; freeze: boolean }
/** enemies the weapon test room can send (the squirrel needs its nut tree) */
export const SB_ENEMIES: EnemyType[] = ENEMIES.filter(t => t !== 'squirrel');

export interface SbUp { key: string; w: SkillId | 'rake'; label: string; lv: number; max: number; cap: number }

const ALL6 = [1, 1, 1, 1, 1, 1];
export class Sim {
  cfg: Balancing;
  time = 0; lvRound = 0; level = 1; xp = 0; pendingLv = 0; kills = 0; collectedXP = 0;
  phase: 'play' | 'lvl' | 'over' = 'play';
  paused = false;
  /** 0..1 progress of the slow-motion ramp into / out of a pause (1 = full speed) */
  ramp = 1;
  players: Player[] = [];
  fields: Field[] = []; fruits: Fruit[] = []; enemies: Enemy[] = []; projs: Proj[] = []; bombs: Bomb[] = []; clouds: Cloud[] = []; baits: Bait[] = []; mines: Mine[] = []; pools: Pool[] = []; berryBombs: BerryBomb[] = []; snodes: SNode[] = []; lwaves: LWave[] = [];
  yieldLv: Record<FruitType, number> = Object.fromEntries(FRUITS.map(t => [t, 0])) as Record<FruitType, number>;
  tillHealLv = 0;
  events: Ev[] = [];
  private nid = 1;
  private mergeT = 0;
  private waveT: number; private planned: PlannedWave | null = null; private spawnQueue: PendingSpawn[] = [];
  private slots: Slot[];
  /** weapon test room (no garden, no waves): enemies per minute from the right edge, free daytime, endless ammo, player can't die */
  sb: Sandbox | null = null;
  /** start-field choice running (23.11.2026) / done */
  startPick = false; started = false;
  /** Werkstatt: the well was unlocked (golden idea) -> it joins the field pool; start fields chosen by the players */
  wellOpen = false; startTypes = new Set<FruitType>();
  /** Saftpresse (23.11.2026): per berry s of active pressing towards the next fill (w) and fills so far (lv): each fill = +juice.step debuff duration */
  juice: Record<Berry, { w: number; lv: number }> = { blue: { w: 0, lv: 0 }, black: { w: 0, lv: 0 }, cran: { w: 0, lv: 0 } };
  /** debuff duration factor of a berry (Freeze / Dornen / Bleeding) */
  juiceF(b: Berry) { return 1 + (this.cfg.juice?.step ?? 0) * this.juice[b].lv; }
  /** XP sources of the current wave (harvest, animals, juice) and of every wave so far (balancing) */
  xpNow = { h: 0, e: 0, j: 0 }; xpHist: { w: number; h: number; e: number; j: number; lv: number }[] = [];
  /** XP factor of berries dropped by animals in wave w: base * growth^(w-1) + linear*(w-1) */
  enemyXpMul(w = this.wave) { const S = this.cfg.enemies.xpScale; const k = Math.max(0, w - 1); return S ? (S.base ?? 1) * Math.pow(S.growth, k) + S.linear * k : 1; }

  constructor(cfg: Balancing, opts: { sandbox?: boolean } = {}) {
    this.cfg = cfg;
    this.slots = slotPositions(cfg);
    this.waveT = cfg.waves.firstWave; // countdown to wave 1 (we start "in a pause" before wave 1)
    if (opts.sandbox) { this.sb = { rate: 20, type: 'random', acc: .8, hour: 5, W: 13, D: 8.5, weapon: 'rake', freeze: false }; return; }
    // start fields: the centre first, then every second slot of the first ring around it, then outwards
    const ring1 = [[0, 0], [1, 0], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, -1]];
    const order = [...ring1.map(([q, r]) => this.slots.findIndex(s => s.q === q && s.r === r)), ...this.slots.map((_, i) => i)].filter(i => i >= 0);
    if (!cfg.arena.startChoice?.length) for (const i of order) { if (this.fields.length >= cfg.arena.startFields) break; if (!this.fieldAt(i) && !this.slots[i].chest) { const sf = this.placeField(i, 'blue'); if (sf) sf.starter = true; } }
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
    const mk = (): SkillState => ({ combo: '', merged: false, learned: false, lvDmg: 0, lvRange: 0, lvCd: 0, pierce: this.cfg.skills.asp.pierce, pierceBonus: 0, extraPel: 0, cranPierceLv: 0, mineLv: 0, minis: 0, gasLv: 0, poisLv: 0, effLv: 0, sizeLv: 0, salvoLv: 0, tgtLv: 0, xferLv: 0, sweepLv: 0, tickLv: 0, cdT: 0, firing: false, burst: 0, burstT: 0 });
    const p: Player = {
      id, color, x: this.players.length ? Math.cos(a) * .6 : 0, z: this.players.length ? Math.sin(a) * .6 : 0, face: 0, hp: P.hp, alive: true, deaths: 0, respawnT: 0,
      stun: 0, stunMax: 0, kb: null, poison: [], swing: 0, swingDir: 0, rakeHit: false, walk: 0, flash: 0, tillT: 0,
      cwT: 0, cwId: '', chW: '', chT: 0, thrK: 0, chAim: false,
      ammo: { asp: 0, cran: 0, cab: 0, lemon: 0, chili: 0, blue: 0, flour: 0, pan: 0, black: 0, wheat: 0 }, collected: { asp: 0, cran: 0, cab: 0, lemon: 0, chili: 0, blue: 0, flour: 0, pan: 0, black: 0, wheat: 0 }, skills: { asp: mk(), cran: mk(), cab: mk(), lemon: mk(), chili: mk(), blue: mk(), flour: mk(), pan: mk(), black: mk(), wheat: mk() }, berry: 'blue', lastBerry: 0,
      rakeCd: 0, aimX: 0, aimZ: 1, active: 'rake', intent: emptyIntent(), lastTap: 0, lastCycle: 0, offers: null, picked: false, fresh: true, placing: null, placeMode: 'new', inv: {}, slots: [], fieldLock: 0, taken: {}, rakeLv: { dmg: 0, rng: 0, dia: 0, cd: 0 }, ideas: 0, shop: null, shopOpen: false, shopLock: false, shopDelay: 0, xbT: 0, handT: 0, spinT: 0, spinD: 1, spinK: '', flPh: 0, flSpin: 0, flOn: 0, flAng: 0, flPrevSpin: 0, flHit: 0, flBase: 0, nuts: 0,
    };
    if (this.sb) { p.x = -this.sb.W * .62; p.z = 0; p.face = Math.PI / 2; p.aimX = 1; p.aimZ = 0; }
    this.learn(p, 'blue'); // the shotgun from the start (22.11.2026); fires the selected berry (23.11.2026)
    this.players.push(p);
    if (!this.sb && this.players.some(q => q !== p && (q.shopOpen || q.shopWant))) { this.genShop(p); p.shopWant = true; } // joined while the others shop
    // 23.11.2026: before the first wave every player picks one of three berry start fields
    if (!this.sb && !this.started && this.wave === 0 && this.cfg.arena.startChoice?.length && (this.phase === 'play' || this.startPick)) {
      this.startPick = true; this.phase = 'lvl'; p.offers = this.startOffers(); p.picked = false;
    } else if (this.phase === 'lvl') { p.offers = this.startPick ? this.startOffers() : this.offers(p); p.picked = false; }
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
    if (p.fresh) { p.fresh = false; p.lastTap = it.tapSeq; p.lastCycle = it.cycle; p.lastBerry = it.berry ?? 0; } // counters from a previous round are not presses
    p.intent = it;
  }

  // ---------- fields & fruit ----------
  fieldAt(slot: number) { return this.fields.find(f => f.slot === slot); }
  /** nut trees stand in the forest outside the garden: enemies leave them alone, they do not count for game over */
  isForest(f: Field) { return !!this.slots[f.slot]?.forest; }
  /** build on a slot: empty -> new tile, same type -> progress to the next level (level L needs L+1 more tiles), other type -> replace */
  placeField(slot: number, type: FruitType) {
    const s = this.slots[slot]; if (!s) return null;
    const F = this.cfg.fields, T = this.cfg.tiles; let f = this.fieldAt(slot);
    const hp0 = isBuilding(type) ? (this.cfg.buildings[type].hp ?? T.buildingHp) : F.hp;
    if (f && f.type === type && f.alive) {
      if (f.rarity >= this.maxR) return f; // 23.11.2026: level 3 is the top
      f.prog++;
      if (f.prog >= tileCost(this.cfg, f.rarity)) { f.rarity++; f.prog = 0; f.maxHp = hp0 * (1 + T.hpPerLevel * f.rarity); this.emit({ k: 'rarity', s: slot, r: f.rarity }); this.emit({ k: 'sfx', s: 'ui.rarity' }); }
      f.hp = f.maxHp; f.broken = false;
      this.burst(s.x, .4, s.z, 0xffe08a, 30, 2.5, .2, .8);
      return f;
    }
    if (f) this.fields.splice(this.fields.indexOf(f), 1);
    for (let i = this.bombs.length - 1; i >= 0; i--) { const b = this.bombs[i]; if (b.mine && slotAt(this.cfg, this.slots, b.x, b.z) === slot) { this.bombs.splice(i, 1); this.burst(b.x, .2, b.z, 0x6fbf3a, 8, 1, .1, .4); } } // a tile built on top removes the mine
    const iv = isBuilding(type) ? (this.cfg.buildings[type].interval ?? 0) : this.cfg.plants[type]?.interval ?? 1;
    f = { slot, type, x: s.x, z: s.z, hp: hp0, maxHp: hp0, alive: true, t: rand(0, iv), shake: 0, poison: [], rarity: 0, prog: 0, edge: Math.floor(rand(0, 6)), tilledT: 0, tilledBy: -1, starter: false, inb: {}, work: 0, broken: false, boost: 0, cyc: 0, ct: rand(0, 1.5) };
    this.fields.push(f);
    this.burst(s.x, .4, s.z, 0x8fe36a, 30, 2.5, .2, .8);
    return f;
  }
  /** adjacent living tiles */
  neighbours(f: Field) { const me = this.slots[f.slot]; return this.fields.filter(o => o !== f && o.alive && hexDist(me, this.slots[o.slot]) === 1); }
  /** neighbour bonus: the tile itself and every adjacent tile of the same type each add bonusBase + their upgrade bonus */
  tileBonus(f: Field) {
    let b = tileContrib(this.cfg, f.rarity);
    for (const o of this.neighbours(f)) if (o.type === f.type) b += tileContrib(this.cfg, o.rarity);
    return b;
  }
  /** production multiplier = 1 + neighbour bonus */
  prodMult(f: Field) { return 1 + this.tileBonus(f) + (isBuilding(f.type) || this.isForest(f) ? 0 : this.wellBonus()); }
  // ---------- 23.11.2026 tile rules: level 1..3, processing chains, well ----------
  /** highest rarity index (tiles.maxLevel 3 -> rarity 0..2) */
  get maxR() { return Math.max(0, (this.cfg.tiles.maxLevel ?? 99) - 1); }
  /** tiles that went into a field: 1 + all steps of reached levels + progress (level 3 = 4 tiles) */
  tilesOf(f: Field) { let n = 1 + f.prog; for (let k = 0; k < f.rarity; k++) n += tileCost(this.cfg, k); return n; }
  /** processing chain: tiles of type t that may still be built (Infinity = no chain) */
  chainLeft(t: FruitType) {
    const C = this.cfg.chains?.[t]; if (!C) return Infinity;
    const from = Array.isArray(C.from) ? C.from : [C.from];
    const top = this.fields.filter(f => f.alive && from.includes(f.type) && f.rarity >= this.maxR).length;
    const used = this.fields.filter(f => f.alive && f.type === t).reduce((a, f) => a + this.tilesOf(f), 0);
    return top - used;
  }
  /** can a tile of type t go onto this slot: free slot = new level-1 tile, same type below the top = next tile of it; never over another type */
  slotOK(t: FruitType, slot: number) {
    const s = this.slots[slot]; if (!slotFits(this.cfg, s, t)) return false;
    if (this.chainLeft(t) <= 0) return false;
    const f = this.fieldAt(slot);
    if (f) return f.alive && f.type === t && f.rarity < this.maxR;
    const nx = this.cfg.chains?.[t]?.nextTo; // stage 2 (Bäckerei): new tile only next to its secondary building (Brunnen)
    return !nx || this.fields.some(o => o.alive && o.type === nx && hexDist(s, this.slots[o.slot]) === 1);
  }
  placeSlots(t: FruitType) { const out: number[] = []; for (let i = 0; i < this.slots.length; i++) if (this.slotOK(t, i)) out.push(i); return out; }
  /** Brunnen: production bonus for every crop field, by the level of the best working well */
  wellBonus() {
    const B = this.cfg.buildings.well?.cropBonus; if (!B?.length) return 0;
    let r = -1; for (const f of this.fields) if (f.alive && f.type === 'well' && !f.broken) r = Math.max(r, f.rarity);
    return r < 0 ? 0 : B[Math.min(r, B.length - 1)];
  }
  /** crops produce in proportion to their HP; buildings run fully until they are broken (0 HP), then stand still until repaired */
  hpF(f: Field) { if (isBuilding(f.type)) return f.broken ? 0 : 1; return f.maxHp > 0 ? clamp(f.hp / f.maxHp, 0, 1) : 0; }
  /** average items per second of a tile (bonus, double harvest, coop blueberries, HP; without tilling); buildings: at full input */
  rate(f: Field) { return f.alive ? this.baseRate(f.type) * this.prodMult(f) * this.hpF(f) : 0; }
  /** items per second of a level-0 tile of this type without neighbours */
  baseRate(t: FruitType) {
    if (isBuilding(t)) { const B = this.cfg.buildings[t]; return 1 / Math.max(.1, B.interval ?? B.time ?? 1); }
    const P = this.cfg.plants[t]; if (!P) return 0;
    const dbl = Math.min(1, this.cfg.upgrades.doubleHarvest.step * this.yieldLv[t]);
    let n = (P.amount || 1) * (1 + dbl);
    if (isBerry(t)) n += this.f(this.cfg.coop.xpYieldExponent) - 1; // 24.11.2026: all three start berries alike
    return n / this.cropPeriod(t);
  }
  /** s per harvested item of a level-0 field: crop cycle (grow + all strokes at the base rake speed) / plants, else plants.x.interval */
  cropPeriod(t: FruitType) {
    const P = this.cfg.plants[t]!; if (!this.cycle || forestType(this.cfg, t)) return P.interval;
    const c = this.cycOf({ type: t } as Field), n = this.plantsPer;
    return (c.grow + n * this.strokesOf(t) * this.cfg.rake.cooldown) / n;
  }
  fieldOf(type: FruitType) { return !!this.fields.find(f => f.type === type); }
  /** can this player's current build card go on that slot? new tile: free slot or another type (overbuild); upgrade: a tile of that type */
  canPlace(p: Player, slot: number) {
    if (!p.placing || !slotFits(this.cfg, this.slots[slot], p.placing)) return false;
    if (p.placeMode === 'any') return this.slotOK(p.placing, slot);
    const f = this.fieldAt(slot), same = !!f && f.alive && f.type === p.placing;
    return p.placeMode === 'stack' ? same : !same;
  }
  place(id: number, slot: number) {
    const p = this.player(id); if (!p || !p.placing || this.phase !== 'lvl' || !this.canPlace(p, slot)) return;
    this.placeField(slot, p.placing); p.placing = null; p.picked = true;
    this.checkAllPicked();
  }
  hurtField(f: Field, dmg: number) {
    if (!f.alive || f.hp <= 0 || this.phase === 'over') return;
    // the starting fields only become vulnerable once every other garden field is down to 0 HP
    if (f.starter && this.fields.some(o => !o.starter && o.hp > 0 && !this.isForest(o))) { f.shake = .12; this.emit({ k: 'imm', x: r2(f.x), z: r2(f.z) }); return; }
    f.hp -= dmg; f.shake = .25; this.sfx('plants.eaten.' + f.type, f.x, f.z);
    this.num(f.x, f.z, dmg, 'f');
    if (f.hp <= 0 && isBuilding(f.type)) { // building: knocked out, stands still until it is repaired to full with the rake
      f.hp = 0; if (!f.broken) { f.broken = true; f.work = 0; this.burst(f.x, .8, f.z, 0x6a5a4a, 40, 3, .3, 1.2, { g: 3 }); this.emit({ k: 'broken', s: f.slot }); this.sfx('build.break', f.x, f.z); }
      if (this.fields.every(x => x.hp <= 0 || this.isForest(x))) this.gameOver();
    } else if (f.hp <= 0) { // fields do not break: they wilt at 0 HP, produce nothing and can be raked back to health (no XP)
      f.hp = 0;
      this.burst(f.x, .5, f.z, 0x8a6a3a, 40, 3, .25, 1, { g: 6 });
      this.emit({ k: 'fieldDead', s: f.slot }); this.sfx('plants.die.' + f.type, f.x, f.z);
      if (this.fields.every(x => x.hp <= 0 || this.isForest(x))) this.gameOver();
    }
  }
  spawnFruit(type: FruitType, tier: number, fx: number, fy: number, fz: number, tx: number, tz: number, src: number, ty = 0) {
    const T = .55;
    const fr: Fruit = {
      id: this.nid++, type, tier, val: this.cfg.fruit.tierValue[tier], x: fx, y: fy, z: fz,
      vx: (tx - fx) / T, vy: (ty - fy + .5 * 9.8 * T * T) / T, vz: (tz - fz) / T,
      state: 'fly', src, born: this.time, bounce: 0, r: (type === 'cab' ? .14 : type === 'nut' ? .07 : .08) * this.cfg.fruit.tierScale[tier],
      ct: 0, fx: 0, fy: 0, fz: 0, collector: null, tx: 0, tz: 0, mt: 0,
    };
    this.fruits.push(fr); return fr;
  }
  /** harvest of a field; fromBush = area raked per triangle: the harvest is shaken loose and falls out of the plants
   *  of the raked triangles (weighted by area) instead of at the rim corner */
  produce(f: Field, fromBush: number[] | null = null) {
    const crop = !!this.cycle && !this.isForest(f), dbl = crop ? this.doubleChance(f) : Math.min(1, this.cfg.upgrades.doubleHarvest.step * this.yieldLv[f.type]);
    let n = (this.cfg.plants[f.type]!.amount || 1) * (1 + Math.floor(dbl) + (Math.random() < dbl % 1 ? 1 : 0)); // 24.11.2026: bonus = chance of a double yield
    if (f.type === 'lemon') this.emit({ k: 'lemonZap', s: f.slot }); // lightning jumps between the lemons
    if (f.type === 'chili') this.emit({ k: 'chiliGlow', s: f.slot }); // the bed glows up like lava (breathing)
    if (isBerry(f.type)) { // coop: more berries (all three start berries alike, 24.11.2026)
      const extra = this.f(this.cfg.coop.xpYieldExponent) - 1;
      n += Math.floor(extra) + (Math.random() < extra % 1 ? 1 : 0);
    }
    n -= this.routeOut(f, f.type, n); // adjacent buildings that process this crop take it right away
    // the energy pulse on the rim reached the next corner: the harvest drops there
    f.edge = (f.edge + 1) % 6;
    const H = hexR(this.cfg);
    if (this.isForest(f)) { // tree: nuts drop out of the crown and roll a bit around the trunk (no magnet: walk there to pick them up)
      const [r0, r1] = this.cfg.plants[f.type]!.dropRadius || [.5, 1.6];
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), d = rand(r0, r1);
        const [tx, tz] = this.clampArena(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d); // never out of reach behind the forest edge
        const ch = this.cfg.enemies.squirrel?.crownHeight ?? 2.4;
        this.spawnFruit(f.type, 0, f.x + Math.cos(a) * Math.min(d * .5, 1.1), ch, f.z + Math.sin(a) * Math.min(d * .5, 1.1), tx, tz, f.slot);
      }
    } else if (fromBush) { // same plant layout as the view: one plant at the centroid of each triangle
      const tot = fromBush.reduce((s, x) => s + x, 0);
      for (let i = 0; i < n; i++) {
        let r = rand(0, tot), k = 0; while (k < 5 && r > fromBush[k]) { r -= fromBush[k]; k++; }
        const [bx, bz] = triPlant(f.x, f.z, H, k);
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
  /** crop cycle (23.11.2026 Basti): the field grows for grow s, then it is ripe and only yields when raked: no passive harvest.
   *  The harvest time only runs while the field is being raked (pauses allowed), up to harvest s in total; then it grows again.
   *  Raking while it grows speeds the growth up (rakeGrow x, 8 s -> 4 s). Trees (forest) keep producing steadily. */
  get cycle() { return this.cfg.fields.cycle; }
  /** grow / harvest s of a crop: per plant (plants.x.grow / harvest), else the default of fields.cycle */
  cycOf(f: Field) { const C = this.cycle!, P = this.cfg.plants[f.type]; return { grow: P?.grow ?? C.grow, harvest: P?.harvest ?? C.harvest }; }
  growField(f: Field, k: number, dt: number) {
    const C = this.cycle, iv = this.cfg.plants[f.type]!.interval;
    if (!C || this.isForest(f)) { f.t -= k; while (f.t <= 0) { f.t += iv; this.produce(f); } return; }
    if (f.cyc === 0) return; // ripe: waits for the rake (24.11.2026: one plant per stroke, see tillGrow)
    // 24.11.2026 (Basti): raking no longer speeds the growth up, production bonus = chance of a double yield instead of faster growth
    f.ct += dt * this.hpF(f); if (f.ct >= this.cycOf(f).grow) { f.cyc = 0; f.ct = 0; this.emit({ k: 'cropRipe', s: f.slot }); }
  }
  /** plants per field and rake strokes per plant (24.11.2026: every stroke harvests exactly one plant, plants with a longer harvest need strokes strokes) */
  get plantsPer() { return this.cycle?.plants ?? 6; }
  strokesOf(t: FruitType) { return this.cfg.plants[t]?.strokes ?? 1; }
  /** chance of a double yield per harvested plant: production bonus (neighbours, level, well) + Doppelernte, HP share no longer matters here */
  doubleChance(f: Field) { return this.prodMult(f) - 1 + Math.min(1, this.cfg.upgrades.doubleHarvest.step * this.yieldLv[f.type]); }
  /** rake stroke on a crop: the only way to harvest. Ripe field: every strokesOf strokes one plant is picked (in plantOrder), its fruit drops out of that plant;
   *  after the last plant the field grows again. While it grows, raking does nothing for the crop (24.11.2026). */
  tillGrow(f: Field, s: number, tri: number[]) {
    const C = this.cycle, iv = this.cfg.plants[f.type]!.interval;
    if (C && !this.isForest(f)) {
      if (f.cyc !== 0) return;
      const st = this.strokesOf(f.type), n = this.plantsPer * st;
      f.ct++;
      if (f.ct % st === 0) { const k = plantOrder(f.slot)[Math.floor(f.ct / st) - 1] ?? 0; const one = [0, 0, 0, 0, 0, 0]; one[k] = 1; this.produce(f, one); }
      if (f.ct >= n) { f.cyc = 1; f.ct = 0; this.emit({ k: 'cropDone', s: f.slot }); }
      void s; return;
    }
    f.t -= s; while (f.t <= 0) { f.t += iv; this.produce(f, tri); }
  }
  /** short card line of a tile type: crop "2 {asp} / 10 s", source "{water} / 4 s", processor "3 {wheat} → {flour}" */
  tileLine(t: FruitType) {
    const nf = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    if (!isBuilding(t)) { const P = this.cfg.plants[t]!; return `${P.amount || 1} {${t}} / ${nf(this.cropPeriod(t))} s`; }
    const B = this.cfg.buildings[t];
    if (B.interval) return `{${B.makes}} / ${nf(B.interval)} s`;
    const ins = B.needs ? Object.entries(B.needs).map(([k, v]) => `${v} {${k}}`).join(' + ') : `${B.count ?? 1} × ${(B.needsAny || []).map(k => `{${k}}`).join('')}`;
    return `${ins} → {${B.makes}}`;
  }
  /** room for one more of this item in building b's input stock */
  roomFor(b: Field, item: FruitType) {
    if (!isBuilding(b.type) || !b.alive || b.broken || !accepts(this.cfg, b.type, item)) return false;
    const B = this.cfg.buildings[b.type], buf = B.buffer ?? 3;
    if (B.needs && B.needs[item]) return (b.inb[item] || 0) < B.needs[item]! * buf;
    const tot = (B.needsAny || []).reduce((a, k) => a + (b.inb[k] || 0), 0);
    return tot < (B.count ?? 1) * buf;
  }
  /** hands up to n items of a tile's yield to adjacent buildings that process them (emptiest first); returns how many were taken */
  routeOut(f: Field, item: FruitType, n: number) {
    let k = 0;
    for (; k < n; k++) {
      let best: Field | null = null, bs = 1e9;
      for (const o of this.neighbours(f)) if (this.roomFor(o, item)) { const st = o.inb[item] || 0; if (st < bs) { bs = st; best = o; } }
      if (!best) break;
      best.inb[item] = (best.inb[item] || 0) + 1;
      this.emit({ k: 'feed', s: f.slot, b: best.slot, t: FRUITS.indexOf(item) });
    }
    return k;
  }
  /** inputs complete for one batch? then take them out of the stock */
  takeBatch(f: Field) {
    const B = this.cfg.buildings[f.type as BuildingType];
    if (B.needs) {
      for (const [k, v] of Object.entries(B.needs)) if ((f.inb[k as FruitType] || 0) < v!) return false;
      for (const [k, v] of Object.entries(B.needs)) f.inb[k as FruitType]! -= v!;
      return true;
    }
    const list = B.needsAny || [], need = B.count ?? 1;
    if (f.type === 'press') { // Saftpresse (23.11.2026): one berry per batch, the one with the largest stock, until it runs out
      const k = list.filter(x => (f.inb[x] || 0) >= need).sort((a, b) => (f.inb[b] || 0) - (f.inb[a] || 0))[0];
      if (!k) return false;
      f.inb[k]! -= need; f.jb = k as Berry; return true;
    }
    if (list.reduce((a, k) => a + (f.inb[k] || 0), 0) < need) return false;
    for (let i = 0; i < need; i++) { const k = list.reduce((m, x) => (f.inb[x] || 0) > (f.inb[m] || 0) ? x : m, list[0]); f.inb[k]!--; } // a bit of everything: largest stock first
    return true;
  }
  /** building finished one item: to an adjacent building that wants it, else it is put down in front of the building (pick up there) */
  buildingOut(f: Field) {
    const B = this.cfg.buildings[f.type as BuildingType], item = B.makes;
    this.emit({ k: 'bdone', s: f.slot, b: BUILDINGS.indexOf(f.type as BuildingType) });
    if (f.type === 'press' && this.cfg.juice) { // juice is drunk right away: XP, twice the XP rate of a crop field while pressing (faster with the press level)
      const J = this.cfg.juice, xv = J.xpFactor * (this.cfg.xp.fieldPerSecond ?? .5) * (B.time ?? 1) * (this.cfg.xp.gain ?? 1) * this.f(this.cfg.coop.xpValueExponent);
      // 23.11.2026 (Basti): the juice runs into a little bottle that hops onto the tile, the bottles stand in a row to be picked up
      const jb = BERRIES.indexOf(f.jb ?? 'blue'), used = new Set(this.fruits.filter(x => x.src === f.slot && x.sk !== undefined && x.state !== 'collect').map(x => x.sk!));
      for (let i = 0; i < BOTTLE_ROW.length; i++) if (!used.has(i)) {
        const [lx, lz] = BOTTLE_ROW[i], fr = this.spawnFruit('juice', 0, f.x + BOTTLE_SPOUT[0], .12, f.z + BOTTLE_SPOUT[1], f.x + lx, f.z + lz, f.slot, BOTTLE_Y);
        fr.sk = i; fr.gy = BOTTLE_Y; fr.lx = lx; fr.lz = lz; fr.r = .06; fr.jb = jb; fr.xv = xv; return;
      }
      this.xpNow.j += xv; this.addXP(xv); // the row is full: drunk right there
      this.emit({ k: 'juice', s: f.slot, b: jb, v: Math.round(xv * 10) / 10 });
      return;
    }
    for (let n = Math.max(1, B.amount ?? 1); n > 0; n--) this.putOut(f, item, B);
  }
  /** one finished item: to an adjacent building that wants it, onto the egg pyramid (hens), else down in front of the building */
  putOut(f: Field, item: FruitType, B: Balancing['buildings'][BuildingType]) {
    if (this.routeOut(f, item, 1)) return;
    if (B.stack) { // hens: the eggs are stacked neatly into a square pyramid next to the coop
      const used = new Set(this.fruits.filter(x => x.src === f.slot && x.sk !== undefined && x.state !== 'collect').map(x => x.sk!));
      const n = pyramidCount(B.stack);
      for (let i = 0; i < n; i++) if (!used.has(i)) {
        const [lx, ly, lz] = eggSlot(i, B.stack), fr = this.spawnFruit(item, 0, f.x + rand(-.3, .3), .5, f.z - .3, f.x + lx, f.z + lz, f.slot, ly);
        fr.sk = i; fr.gy = ly; fr.r = .06; return;
      }
    }
    if (item === 'flour') { // 24.11.2026 (Basti): the big flour sack flies out of the mill (audibly) and lands next to the player working there, then it is picked up
      const wk = this.players.filter(q => q.alive).sort((a, b) => (a.id === f.tilledBy ? -1 : 0) - (b.id === f.tilledBy ? -1 : 0) || dist(a, f) - dist(b, f))[0];
      if (wk) {
        const a = Math.atan2(wk.z - f.z, wk.x - f.x) + (Math.random() < .5 ? 1 : -1) * rand(1.1, 1.6), [tx, tz] = this.clampArena(wk.x + Math.cos(a) * 1.25, wk.z + Math.sin(a) * 1.25);
        const fr = this.spawnFruit(item, 0, f.x, 1.5, f.z, tx, tz, f.slot); fr.r = .17;
        this.emit({ k: 'sackFly', x: r2(f.x), z: r2(f.z) }); return;
      }
    }
    f.edge = (f.edge + 1) % 6;
    const H = hexR(this.cfg), ca = cornerAngle(f.edge), cx = f.x + Math.cos(ca) * H * .8, cz = f.z + Math.sin(ca) * H * .8;
    const a = rand(0, Math.PI * 2), d = rand(0, this.cfg.fruit.cornerScatter);
    this.spawnFruit(item, 0, f.x, .9, f.z, cx + Math.cos(a) * d, cz + Math.sin(a) * d, f.slot);
  }
  /** advance a building by s seconds of work: sources make one item every interval, processors work off one batch after another */
  workBuilding(f: Field, s: number) {
    const B = this.cfg.buildings[f.type as BuildingType];
    if (B.interval) { f.t -= s; let n = 0; while (f.t <= 0 && n++ < 8) { f.t += B.interval; this.buildingOut(f); } return; }
    let n = 0;
    while (s > 0 && n++ < 8) {
      if (f.work <= 0) { if (!this.takeBatch(f)) { f.work = 0; return; } f.work = B.time ?? 1; this.emit({ k: 'bwork', s: f.slot, b: BUILDINGS.indexOf(f.type as BuildingType), j: f.jb ? BERRIES.indexOf(f.jb) : -1 }); }
      const d = Math.min(s, f.work); f.work -= d; s -= d;
      if (f.work <= 1e-6) { f.work = 0; this.buildingOut(f); }
    }
  }
  /** 23.11.2026 (Basti): processing buildings only work while someone works at them (raking keeps them going for tillDuration s)
   *  and has the ingredients; sources (well, cow) keep running by themselves */
  tickBuilding(f: Field, dt: number) {
    if (!f.alive || f.broken) return;
    const B = this.cfg.buildings[f.type as BuildingType];
    if (!B.interval && f.tilledT <= 0) return;
    const pressing = f.type === 'press' && (f.work > 0 || this.batchReady(f));
    this.workBuilding(f, dt * this.prodMult(f));
    if (pressing && f.jb && this.cfg.juice) { // bar of this berry fills with active pressing time; each fill: +1 % debuff duration
      const J = this.juice[f.jb]; J.w += dt;
      if (J.w >= this.cfg.juice.fill) { J.w -= this.cfg.juice.fill; J.lv++; this.emit({ k: 'juiceUp', s: f.slot, b: BERRIES.indexOf(f.jb), lv: J.lv }); }
    }
  }
  /** a processor has the inputs for its next batch */
  batchReady(f: Field) {
    const B = this.cfg.buildings[f.type as BuildingType];
    if (B.needs) return Object.entries(B.needs).every(([k, v]) => (f.inb[k as FruitType] || 0) >= v!);
    const need = B.count ?? 1; return f.type === 'press' ? (B.needsAny || []).some(x => (f.inb[x] || 0) >= need) : (B.needsAny || []).reduce((a, k) => a + (f.inb[k] || 0), 0) >= need;
  }
  /** items in a player's bag (weapon fruit = their ammo) */
  bagCount(p: Player, t: FruitType) { return isWeaponFruit(t) ? p.ammo[t] : p.inv[t] || 0; }
  /** a rake stroke on a building: repair it if damaged, otherwise put matching goods from the bag in and speed up the work */
  tillBuilding(p: Player, f: Field, k: number) {
    const T = this.cfg.tiles;
    if (f.broken || f.hp < f.maxHp) {
      f.hp = Math.min(f.maxHp, f.hp + T.repairPerStroke * f.maxHp * k);
      if (f.hp >= f.maxHp && f.broken) { f.broken = false; this.emit({ k: 'repaired', s: f.slot }); this.sfx('build.repaired', f.x, f.z); }
      else this.emit({ k: 'repair', s: f.slot });
      return;
    }
    const B = this.cfg.buildings[f.type as BuildingType];
    let fed = 0;
    let feedList = [...Object.keys(B.needs || {}), ...(B.needsAny || [])] as FruitType[];
    if (f.type === 'press') feedList = [...feedList].sort((a, b) => this.bagCount(p, b) - this.bagCount(p, a)); // the berry there is most of first
    for (const it of feedList) {
      if (f.type === 'press' && fed > 0) break; // one berry at a time
      while (fed < T.feedPerStroke && this.bagCount(p, it) >= 1 && this.roomFor(f, it)) {
        if (isWeaponFruit(it)) p.ammo[it]--; else p.inv[it]!--;
        f.inb[it] = (f.inb[it] || 0) + 1; fed++;
        this.emit({ k: 'feed', s: -1, p: p.id, b: f.slot, t: FRUITS.indexOf(it) });
      }
    }
    void k; // 23.11.2026: no extra work per stroke any more - the building runs in real time while it is being worked (tickBuilding)
  }
  /** XP of one item: crops are balanced so every field gives the same XP per minute (xp.fieldPerSecond / items per second
   *  of a common field of that type); goods from buildings have their own value (items.<type>.xp) */
  itemXP(t: FruitType) {
    const P = this.cfg.plants[t], I = this.cfg.items[t];
    if (P && !isBuilding(t)) {
      // 24.11.2026: every harvested plant gives xp.perPlant XP per rake stroke it took, split over its fruit -> every stroke on a ripe field is worth the same
      if (this.cycle && !forestType(this.cfg, t) && this.cfg.xp.perPlant) return this.cfg.xp.perPlant * this.strokesOf(t) / (P.amount || 1);
      const ref = this.cfg.xp.fieldPerSecond ?? .5; return ref / ((P.amount || 1) / P.interval);
    }
    return I?.xp ?? 0;
  }
  collectFruit(fr: Fruit, p: Player) {
    if (fr.xv !== undefined) { // juice bottle: drunk right away = XP (not into the bag)
      const xv = fr.nx ? 0 : fr.xv; this.xpNow.j += xv; this.addXP(xv);
      this.emit({ k: 'collect', p: p.id, t: FRUITS.indexOf(fr.type), tier: 0, x: r2(p.x), z: r2(p.z) });
      this.emit({ k: 'juice', s: -1, p: p.id, b: fr.jb ?? 2, v: Math.round(xv * 10) / 10, x: r2(p.x), z: r2(p.z) });
      return;
    }
    const v = fr.val, xp = fr.nx ? 0 : this.itemXP(fr.type) * (fr.xm ?? 1);
    if (xp > 0) { const xv = v * xp * (this.cfg.xp.gain ?? 1) * this.f(this.cfg.coop.xpValueExponent); this.collectedXP += v * xp; if (fr.src === -1) this.xpNow.e += xv; else this.xpNow.h += xv; this.addXP(xv); }
    if (fr.type === 'nut') p.nuts += v;
    else if (SKILLS.some(k => AMMO_OF[k] === fr.type && p.skills[k].learned)) { const k = SKILLS.find(k => AMMO_OF[k] === fr.type && p.skills[k].learned)!; p.ammo[k] += v; p.collected[k] += v; } // Mehl / Spiegeleier: ammo once their weapon is learned
    else if (isWeaponFruit(fr.type)) { const o = this.comboOwner(p, fr.type); if (o) p.ammo[o.id] += v * o.f; else p.ammo[fr.type] += v; p.collected[fr.type] += v; } // merged sub weapon: its fruit feeds the combo
    else { // wheat and goods: into the bag (to feed buildings), healing right away
      const I = this.cfg.items[fr.type] ?? {}; p.inv[fr.type] = (p.inv[fr.type] || 0) + v;
      if (I.heal) p.hp = Math.min(this.cfg.player.hp, p.hp + I.heal * v);
    }
    this.emit({ k: 'collect', p: p.id, t: FRUITS.indexOf(fr.type), tier: fr.tier, x: r2(p.x), z: r2(p.z) });
  }
  mergeFruit() {
    const M = this.cfg.fruit.mergeCount;
    for (const f of this.fields) for (let tier = 0; tier < this.cfg.fruit.tierValue.length - 1; tier++) {
      const ot = outType(this.cfg, f.type), list = this.fruits.filter(x => x.src === f.slot && x.type === ot && x.state === 'ground' && x.tier === tier && x.sk === undefined);
      if (list.length < M) continue;
      list.sort((a, b) => a.born - b.born); const grp = list.slice(0, M), ax = grp[0].x, az = grp[0].z;
      for (const x of grp) { x.state = 'merge'; x.mt = 0; x.tx = ax; x.tz = az; }
      this.merges.push({ t: .28, f, tier: tier + 1, x: ax, z: az });
    }
  }
  private merges: { t: number; f: Field; tier: number; x: number; z: number }[] = [];

  // ---------- xp & level ----------
  addXP(v: number) {
    if (this.sb) return;
    this.xp += v;
    while (this.xp >= this.need(this.level)) { this.xp -= this.need(this.level); this.level++; this.pendingLv++; for (const p of this.players) p.ideas++; this.emit({ k: 'idea' }); } // 23.11.2026: every level-up = 1 idea (light bulb) per player
    if (this.pendingLv > 0 && this.phase === 'play') this.openLevelUp();
  }
  openLevelUp() {
    this.phase = 'lvl'; this.lvRound++; this.emit({ k: 'sfx', s: 'ui.levelup' });
    for (const p of this.players) { p.offers = this.offers(p); p.picked = false; p.intent = { ...emptyIntent(), tapSeq: p.lastTap, cycle: p.lastCycle, berry: p.lastBerry }; for (const id of SKILLS) p.skills[id].firing = false; }
    this.emit({ k: 'lvl' });
  }
  pick(id: number, key: string) {
    const p = this.player(id); if (!p || this.phase !== 'lvl' || p.picked || !p.offers) return;
    const o = p.offers.find(x => x.key === key); if (!o) return;
    if (key.startsWith('start_')) { this.startField(p, key.slice(6) as Berry); p.picked = true; this.checkAllPicked(); return; }
    p.taken[key] = (p.taken[key] || 0) + 1;
    this.applyOffer(p, key);
    if (p.placing) return; // field card: player now chooses where to build (see place())
    p.picked = true;
    this.checkAllPicked();
  }
  private checkAllPicked() {
    if (this.players.some(p => !p.picked)) return;
    if (this.startPick) { this.startPick = false; this.started = true; this.phase = 'play'; for (const p of this.players) { p.offers = null; p.picked = false; } return; }
    this.pendingLv--;
    if (this.pendingLv > 0) { this.lvRound++; for (const p of this.players) { p.offers = this.offers(p); p.picked = false; } this.emit({ k: 'lvl' }); }
    else { this.phase = 'play'; for (const p of this.players) { p.offers = null; p.picked = false; } }
  }

  /** start cards: one berry field each (field picture, its shotgun effect) */
  startOffers(): Offer[] {
    const N = this.cfg.names;
    return (this.cfg.arena.startChoice || []).map(t => ({ key: 'start_' + t, cat: 'field' as const, pic: 'field_' + t, title: N.fields[t] ?? t, lines: [`{${t}} ${N.effects?.[t] ?? ''}`] }));
  }
  /** the chosen start field goes onto the first free slot of the ring around the chest; the shotgun fires that berry */
  startField(p: Player, t: Berry) {
    const ring = this.slots.map((sl, i) => i).filter(i => !this.slots[i].forest && !this.slots[i].chest && !this.fieldAt(i)).sort((a, b) => Math.hypot(this.slots[a].x, this.slots[a].z) - Math.hypot(this.slots[b].x, this.slots[b].z));
    const i = ring[0]; if (i === undefined) return;
    const f = this.placeField(i, t); if (f) f.starter = true;
    p.berry = t; this.startTypes.add(t);
  }
  get chestOn() { return !!this.cfg.chest && !this.sb; }
  // ---------- skill stats ----------
  stats(id: SkillId, s: SkillState): SkillStats {
    const base = this.baseStats(id, s);
    if (!s.combo) return base;
    const c = this.comboStats(s); // combo weapon: the main weapon's slot shows/uses the combo numbers
    return { ...base, dmg: c.dmg, dmgPct: c.dmgPct, range: c.range, cd: c.cd, cost: c.cost, need: c.need, shots: c.shots, gap: c.gap, throwDist: c.throwDist };
  }
  baseStats(id: SkillId, s: SkillState): SkillStats {
    const S = this.cfg.skills, U = this.cfg.upgrades;
    const B = S[id] as any;
    const dm = 1 + U.damagePerLevel * s.lvDmg, rm = 1 + U.rangePerLevel * s.lvRange, cd = B.cooldown * Math.pow(1 - (id === 'pan' ? S.pan.cdStep : U.cooldownPerLevel), s.lvCd);
    const range = id === 'pan' ? B.range + S.pan.rangeStep * s.lvRange : id === 'lemon' ? B.range : (id === 'cab' ? S.cab.radius : B.range) * rm; // pan: lure radius +1 m per level // lemon: the range upgrade grows the ball instead (ballR)
    // crossbow: cd = one whole salvo; the salvo upgrade adds bolts that fit into the time the base salvo takes
    const shots0 = id === 'asp' ? Math.max(1, S.asp.burstShots || 1) : 1, shots = id === 'asp' && s.salvoLv > 0 ? U.aspSalvo.shots[Math.min(s.salvoLv, U.aspSalvo.shots.length) - 1] : shots0;
    const size = 1 + U.aspSize.step * s.sizeLv;
    const fl = this.chiliGeom(s.sweepLv), C = S.chili, tick = Math.max(U.chiliTick.min, C.burnTick * Math.pow(U.chiliTick.factor, s.tickLv));
    return {
      ...fl, tick,
      dmg: B.damage * dm, dmgPct: dm, range, cd, cost: B.ammoPerShot, dur: id === 'wheat' ? S.wheat.heatTime * (1 + (U.wheatDuration?.step ?? .25) * (s.durLv ?? 0)) : 0,
      need: Math.ceil(Math.ceil(S.readySeconds / cd - 1e-9) * B.ammoPerShot * shots - 1e-9), shots, gap: S.asp.burstGap * cd / S.asp.cooldown * (shots0 - 1) / Math.max(1, shots - 1),
      pierce: s.pierce, pf: Math.min(1, S.asp.pierceFactor + U.aspPierceBonus.step * s.pierceBonus),
      // shotgun: random spread (normal distribution, cut at the max cone), +1 pellet per upgrade; missed berries pop for splash x damage
      pellets: (id === 'blue' ? S.blue.pellets : S.cran.pellets) + U.cranPellets.step * s.extraPel, cranPierce: Math.min(1, U.cranPierce.step * s.cranPierceLv), splash: Math.min(1, S.cran.splashDamage + U.cranSplash.step * s.mineLv),
      minis: s.minis, gas: Math.min(1, U.cabGas.step * s.gasLv), chains: U.lemonTargets.step * s.tgtLv, chainReturn: Math.min(1, U.lemonTransfer.step * s.xferLv),
      eat: id === 'pan' ? S.pan.eat + S.pan.eatStep * s.lvDmg : 0,
      chainDmg: Math.min(1, S.lemon.chainDamage + U.lemonEfficiency.step * s.effLv), ballR: S.lemon.ballRadius * rm, tickR: S.lemon.tickRadius * rm, poisonMul: 1 + U.cabPoison.step * s.poisLv, throwDist: S.cab.throwMax, width: S.asp.width * size, size,
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
    const range = R.range + U.rakeRange.step * p.rakeLv.rng, dia = R.diameter + U.rakeDiameter.step * (p.rakeLv.dia || 0);
    // hit circle: its far edge is the full reach, its near edge where the pull ends -> centre (range - dia/2) ahead
    return { dmg: R.damage * (1 + U.rakeDamage.step * p.rakeLv.dmg), range, dia, centre: range - dia / 2, kb: R.knockback, cd: R.cooldown * Math.pow(1 - (U.rakeSpeed?.step ?? 0), p.rakeLv.cd || 0) };
  }
  /** can fire whenever there is ammo for one shot ("ready" is only the HUD/weapon-cycle threshold) */
  /** at most weaponSlots.max weapons besides the rake; once reached, no other weapons, their fields or upgrades are offered */
  get maxWeapons() { return this.cfg.weaponSlots?.max ?? 3; }
  equipped(p: Player, id: SkillId) { return p.skills[id].learned; }
  private learn(p: Player, id: SkillId) { p.skills[id].learned = true; if (!p.slots.includes(id)) p.slots.push(id); }
  /** fruit type whose weapon this player can no longer take (weapon limit reached) */
  private closedType(p: Player, t: FruitType) { return isWeaponFruit(t) && !isBerry(t) && !p.skills[t].learned && !p.skills[t].merged && SKILLS.filter(id => p.skills[id].learned).length >= this.maxWeapons; }
  /** ammo pool a weapon draws from: the shotgun uses the selected berry */
  ak(p: Player, id: SkillId): SkillId { return id === 'blue' ? p.berry : id; }
  canFire(p: Player, id: SkillId) {
    const s = p.skills[id]; if (!this.equipped(p, id)) return false;
    return p.ammo[this.ak(p, id)] >= this.stats(id, s).cost;
  }
  isReady(p: Player, id: SkillId) { const s = p.skills[id]; return this.equipped(p, id) && p.ammo[this.ak(p, id)] >= this.stats(id, s).need; }
  isEmpty(p: Player, id: SkillId) { const s = p.skills[id]; return !this.equipped(p, id) || p.ammo[this.ak(p, id)] < this.stats(id, s).cost; }
  /** next berry for the shotgun: manual = the next one that has ammo for a shot; auto (selected one empty) the same */
  nextBerry(p: Player) {
    const need = this.stats('blue', p.skills.blue).cost, i0 = BERRIES.indexOf(p.berry);
    for (let k = 1; k < BERRIES.length; k++) { const b = BERRIES[(i0 + k) % BERRIES.length]; if (p.ammo[b] >= need) { p.berry = b; this.emit({ k: 'berry', p: p.id }); return; } }
  }

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
  airborne(e: Enemy) { return e.type === 'toad' && e.state !== 'windup' && e.stun <= 0 && (e.hop % 1) < this.toadAir; }
  get toadAir() { return this.cfg.enemies.toad.airShare ?? .5; }
  /** squirrel climbing into its tree (gone soon) */
  inTree(e: Enemy) { return e.state === 'climb'; }
  /** squirrel spawn: a random spot on the far side of the garden (~90 deg opposite its nut tree); it hops in zigzag towards the tree */
  private squirrelStart(e: Enemy) {
    const trees = this.fields.filter(f => f.alive && f.type === 'nut' && this.isForest(f)); if (!trees.length) return false;
    const nutsAt = (f: Field) => this.fruits.filter(fr => fr.type === 'nut' && fr.state === 'ground' && dist(fr, f) < 4).length;
    const withNuts = trees.filter(f => nutsAt(f) > 0), pool = withNuts.length ? withNuts : trees, t = pool[Math.floor(Math.random() * pool.length)];
    const D = this.cfg.enemies.squirrel, half = (D.spawnArc ?? 90) * Math.PI / 360, a = Math.atan2(t.z, t.x) + Math.PI + rand(-half, half), R = this.cfg.waves.spawnRadius;
    e.hx = t.x; e.hz = t.z; e.x = Math.cos(a) * R; e.z = Math.sin(a) * R; e.y = 0;
    e.st = D.patience ?? 10; e.face = a + Math.PI;
    return true;
  }
  /** squirrel: hops in zigzag to its nut tree, grabs nuts lying around (up to carryMax) and vanishes into the crown with them.
   *  Players coming too close get attacked. Hurt badly (fleeBelow) it also escapes into the tree. */
  private squirrelAI(e: Enemy, dt: number) {
    const D = this.cfg.enemies.squirrel, E = this.cfg.enemies;
    if (e.state === 'climb') { // up the trunk into the crown, then gone (with the nuts)
      e.st -= dt; const T = D.climbTime ?? .8, k = clamp(1 - e.st / T, 0, 1);
      e.x = e.cx + (e.hx - e.cx) * k; e.z = e.cz + (e.hz - e.cz) * k; e.y = (D.crownHeight ?? 2.4) * k * k;
      if (e.st <= 0) {
        for (const fr of e.carry) { const i = this.fruits.indexOf(fr); if (i >= 0) this.fruits.splice(i, 1); }
        e.carry = []; this.emit({ k: 'rustleTree', x: r2(e.hx), z: r2(e.hz) }); this.removeEnemy(e);
      }
      return;
    }
    // home tree gone: take the nearest other nut tree, or run off into the forest
    if (!this.fields.some(f => f.alive && f.type === 'nut' && Math.abs(f.x - e.hx) + Math.abs(f.z - e.hz) < .1)) {
      let best: Field | null = null, bd = 1e9; for (const f of this.fields) if (f.alive && f.type === 'nut') { const d = dist(e, f); if (d < bd) { bd = d; best = f; } }
      if (best) { e.hx = best.x; e.hz = best.z; }
      else {
        const a = Math.atan2(e.z, e.x); this.steer(e, Math.cos(a) * 40, Math.sin(a) * 40, D.fleeSpeed!, dt);
        if (Math.hypot(e.x, e.z) > this.cfg.arena.radius + 3) { for (const fr of e.carry) { const i = this.fruits.indexOf(fr); if (i >= 0) this.fruits.splice(i, 1); } e.carry = []; this.removeEnemy(e); }
        return;
      }
    }
    const home = { x: e.hx, z: e.hz }, full = e.carry.length >= (D.carryMax || 3);
    e.think -= dt;
    if (e.think <= 0 || !e.target || (e.target.kind === 'fruit' && e.target.fr.state !== 'ground') || (e.target.kind === 'player' && !e.target.p.alive)) {
      e.think = .3; let t: Target = null;
      if (e.fleeing || full) t = { kind: 'wander', x: home.x, z: home.z };
      if (!t) { let bp: Player | null = null, bd = D.aggroRadius ?? 2.5; for (const p of this.players) if (p.alive) { const d = dist(e, p); if (d < bd) { bd = d; bp = p; } } if (bp) t = { kind: 'player', p: bp }; }
      if (!t) { let best: Fruit | null = null, bd = 1e9; for (const fr of this.fruits) if (fr.state === 'ground' && fr.type === 'nut') { const d = dist(e, fr); if (d < bd) { bd = d; best = fr; } } if (best) t = { kind: 'fruit', fr: best }; }
      if (!t) { // nothing lying around: back into the tree with the loot, or wait under it (scurrying around) until patience runs out
        const near = dist(e, home) < 2.6;
        if (e.carry.length || (near && e.st <= 0)) t = { kind: 'wander', x: home.x, z: home.z };
        else if (near) { const w = e.target; t = w && w.kind === 'wander' && Math.hypot(w.x - e.x, w.z - e.z) > .4 && Math.hypot(w.x - home.x, w.z - home.z) > .3 ? w : (() => { const a = rand(0, 7), r = rand(.8, 2.2); return { kind: 'wander' as const, x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r }; })(); }
        else t = { kind: 'wander', x: home.x, z: home.z };
      }
      e.target = t;
    }
    const t = e.target!, tp = this.targetPos(t)!, goHome = t.kind === 'wander' && Math.abs(t.x - home.x) + Math.abs(t.z - home.z) < .01;
    if (goHome || (t.kind === 'wander' && dist(e, home) < 2.6)) e.st -= dt; // patience only runs out at the tree
    // hopping in zigzag: every hop swings to the other side of the straight line
    e.hop += dt / (D.hopPeriod ?? .32);
    const ph = e.hop % 1; e.y = Math.sin(ph * Math.PI) * (D.hopHeight ?? .22);
    const dx = tp.x - e.x, dz = tp.z - e.z, d = Math.hypot(dx, dz);
    const zig = d > 1.2 ? (Math.floor(e.hop) % 2 ? 1 : -1) * (D.zigzag ?? 40) * Math.PI / 180 : 0;
    const base = Math.atan2(dx, dz) + zig, sp = (e.fleeing || full ? D.fleeSpeed! : t.kind === 'wander' && !goHome ? D.wanderSpeed || e.speed : e.speed) * this.slowF(e);
    const stop = t.kind === 'player' ? e.r + .45 : goHome ? .35 : t.kind === 'fruit' ? 0 : .1;
    if (d > stop) { const st = Math.min(sp * dt, d - stop); e.x += Math.sin(base) * st; e.z += Math.cos(base) * st; e.walk += dt * sp * 4; }
    e.face = base;
    if (t.kind === 'fruit' && d < .35 + e.r) {
      const fr = t.fr; fr.state = 'carried'; e.carry.push(fr); e.target = null; e.think = 0; this.sfx('squirrel.steal', e.x, e.z);
      if (e.carry.length >= (D.carryMax || 3)) { e.laughT = rand(.3, .8); this.sfx('squirrel.flee', e.x, e.z); }
    } else if (t.kind === 'player' && d <= e.r + .55) {
      e.atkT -= dt;
      if (e.atkT <= 0) { e.atkT = E.meleeInterval; e.lunge = .2; this.sfx('squirrel.attack', e.x, e.z); this.hurtPlayer(t.p, E.meleeDamage * e.dmgMul); }
    } else e.atkT = Math.min(e.atkT, .5);
    if (goHome && dist(e, home) < .45 && (e.carry.length || e.fleeing || full || e.st <= 0)) { // at the trunk: up it goes
      e.state = 'climb'; e.st = D.climbTime ?? .8; e.cx = e.x; e.cz = e.z; this.sfx('squirrel.flee', e.x, e.z);
    }
    if (e.carry.length) { e.laughT -= dt; if (e.laughT <= 0) { e.laughT = rand(2.5, 4); this.sfx('squirrel.laugh', e.x, e.z); } }
  }
  hurtEnemy(e: Enemy, dmg: number, o: { color?: string; bleed?: boolean; stun?: number; punch?: boolean; silent?: boolean; dot?: boolean; src?: FruitType; phys?: boolean } = {}) {
    if (e.dead) return false;
    dmg *= this.resistF(e, o.src);
    if (o.phys && e.frz > 0) dmg *= this.cfg.skills.blue.frozenBonus ?? 1; // frozen: physical hits do more (23.11.2026)
    if (!o.dot && this.airborne(e)) { this.emit({ k: 'imm', x: r2(e.x), z: r2(e.z) }); return false; }
    let left = dmg;
    if (e.shield > 0) { const a = Math.min(e.shield, left); e.shield -= a; left -= a; if (a > 0) this.burst(e.x, .45, e.z, 0x6fd0ff, 4, 1.5, .12, .3); }
    e.hp -= left; e.hurtOnce = true;
    if (!o.dot) { e.flash = .1; this.num(e.x, e.z, dmg, o.color || 'w', dmg >= 10); } // damage over time: no flash, numbers summed up by the caller
    if (o.punch) this.emit({ k: 'punch', x: r2(e.x), z: r2(e.z), e: e.id });
    else if (!o.silent) this.snd('hit');
    if (o.bleed) e.bleed = this.cfg.skills.cran.bleedDuration * this.juiceF('cran');
    if (o.stun) this.applyStun(e, o.stun);
    if (e.hp <= 0) this.killEnemy(e);
    else { const fb = this.cfg.enemies[e.type].fleeBelow; if (fb && !e.boss && !e.fleeing && e.hp < e.maxHp * fb) { e.fleeing = true; e.target = { kind: 'flee' }; e.laughT = rand(.3, .8); this.sfx(e.type + '.flee', e.x, e.z); } }
    return true;
  }
  killEnemy(e: Enemy) {
    if (e.burn > 0) { if (e.burnSum > 0) { this.num(e.x, e.z, e.burnSum, 'o'); e.burnSum = 0; } this.spreadFire(e); }
    e.dead = true; this.kills++; this.sfx(e.type + '.die', e.x, e.z); this.emit({ k: 'die', e: e.id }); // view plays the death animation
    if (e.gasT > 0 && Math.random() < e.gasCh) this.gasBurst(e);
    this.burst(e.x, .4, e.z, 0xffe0b0, 22, 2.6, .18, .6, { g: 4 });
    this.burst(e.x, .4, e.z, 0x404040, 10, 1.2, .5, .9, { a: .4 });
    for (const fr of e.carry) {
      fr.x = e.x; fr.y = .4; fr.z = e.z; const a = rand(0, 7);
      fr.vx = Math.cos(a) * 1.5; fr.vy = 3; fr.vz = Math.sin(a) * 1.5; fr.state = 'fly'; fr.bounce = 0; fr.src = -1; fr.sk = fr.gy = undefined; fr.r = .08;
    }
    e.carry = [];
    // every enemy drops XP (blueberries), elites more
    const E = this.cfg.enemies, n = this.sb ? 0 : e.boss ? E.boss.xpDrop : Math.round(E.xpDrop * (e.elite ? E.elite.xpMultiplier : 1));
    if (e.boss) this.emit({ k: 'bossDead', x: r2(e.x), z: r2(e.z) });
    if (n > 0) this.sfx('plants.produce.blue', e.x, e.z); // berries drop: same plop as from the bush
    // 23.11.2026: the drop is the berry the nearest player's shotgun is loaded with (was always blueberries), so all three start berries are equal
    let np: Player | null = null, nd = 1e9; for (const p of this.players) { const d = dist(p, e); if (d < nd) { nd = d; np = p; } }
    const drop: FruitType = np?.berry ?? 'blue';
    const xm = this.enemyXpMul();
    for (let i = 0; i < n; i++) { const a = rand(0, 7), d = rand(.2, .8); this.spawnFruit(drop, 0, e.x, .5, e.z, e.x + Math.cos(a) * d, e.z + Math.sin(a) * d, -1).xm = xm; }
    this.removeEnemy(e);
  }
  removeEnemy(e: Enemy) { e.dead = true; const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); for (const fr of e.carry) { const j = this.fruits.indexOf(fr); if (j >= 0) this.fruits.splice(j, 1); } e.carry = []; }
  nearestEnemy(x: number, z: number, r: number) { let b: Enemy | null = null, bd = r; for (const e of this.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; b = e; } } return b; }

  aimDir(p: Player, range: number, useIntent = true): [number, number] {
    const it = p.intent;
    if (useIntent && it.aim) { const l = Math.hypot(it.ax, it.az); if (l > .01) return [it.ax / l, it.az / l]; }
    const n = this.nearestEnemy(p.x, p.z, range + 1.5);
    if (n) { const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
    return [p.aimX, p.aimZ];
  }
  /** rake hit: a sphere overlap at the end of the push. The rake model is only the animation; the damage comes from a
   *  circle between the point where the pull ends and the full reach (diameter = that distance, upgradable) */
  private inRakeCircle(p: Player, e: Enemy, dx: number, dz: number) {
    const RS = this.rakeStats(p), cx = p.x + dx * RS.centre, cz = p.z + dz * RS.centre;
    return Math.hypot(e.x - cx, e.z - cz) <= RS.dia / 2 + e.r;
  }
  /** area of the rake circle on each of the 6 triangles of a hex field (triangle k: centre, corner k, corner k+1;
   *  one plant stands in each). The circle is a 32-gon; each triangle is clipped by its edges (Sutherland-Hodgman + shoelace). */
  rakeOverlap(f: Field, p: Player, dx: number, dz: number): number[] {
    const RS = this.rakeStats(p), H = hexR(this.cfg), out = [0, 0, 0, 0, 0, 0], r = RS.dia / 2;
    const cx = p.x + dx * RS.centre, cz = p.z + dz * RS.centre;
    if (Math.hypot(f.x - cx, f.z - cz) > r + H) return out;
    // points relative to the circle centre
    const c: [number, number] = [f.x - cx, f.z - cz], cs: [number, number][] = [];
    for (let k = 0; k < 6; k++) { const a = cornerAngle(k); cs.push([c[0] + Math.cos(a) * H, c[1] + Math.sin(a) * H]); }
    for (let k = 0; k < 6; k++) out[k] = this.clipCircle([c, cs[k], cs[(k + 1) % 6]], r);
    return out;
  }
  private clipCircle(tri: [number, number][], r: number) {
    const N = 32; // edges touch the circle from outside (area +0.3 %)
    let poly = tri;
    for (let i = 0; i < N && poly.length; i++) { // half plane: x*nx + z*nz <= r (tangent edge with outward normal n)
      const t = (i + .5) / N * Math.PI * 2, nx = Math.cos(t), nz = Math.sin(t), out: [number, number][] = [];
      const d = (q: [number, number]) => q[0] * nx + q[1] * nz - r;
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j], b = poly[(j + 1) % poly.length], da = d(a), db = d(b);
        if (da <= 0) out.push(a);
        if ((da <= 0) !== (db <= 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
      }
      poly = out;
    }
    let A = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(A) / 2;
  }
  /** rake stroke duration: pull (front -> left back, one swing) + push (quickly forward, impact); with the speed
   *  upgrade the stroke gets faster so it always ends before the next one (at most 90 % of the cooldown) */
  rakeTime(p: Player) { const R = this.cfg.rake, T = R.pullTime + R.pushTime; return Math.min(T, this.rakeStats(p).cd * .9); }
  /** starts a stroke. The direction is not fixed: it follows aim / movement live (rakeDir) until the impact. */
  rakeAttack(p: Player, dx: number, dz: number) {
    p.rakeCd = this.rakeStats(p).cd; p.aimX = dx; p.aimZ = dz; p.face = p.swingDir = Math.atan2(dx, dz);
    p.swing = this.rakeTime(p); p.rakeHit = true;
    this.snd('rake');
  }
  /** live stroke direction: explicit aim (mouse / aim stick) > nearest enemy in reach > movement > last direction */
  rakeDir(p: Player): [number, number] {
    const it = p.intent;
    if (it.aim) { const l = Math.hypot(it.ax, it.az); if (l > .01) return [it.ax / l, it.az / l]; }
    const n = this.nearestEnemy(p.x, p.z, this.rakeStats(p).range + 1.5);
    if (n) { const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
    const ml = Math.hypot(it.mx, it.mz); if (ml > .05) return [it.mx / ml, it.mz / ml];
    return [p.aimX, p.aimZ];
  }
  /** impact at the end of the push (rake fully extended): sphere overlap of the hit circle (see inRakeCircle):
   *  hits every enemy in it (damage, stun, knockback) and tills every field it covers (in proportion to the covered area) */
  rakeImpact(p: Player, dx: number, dz: number) {
    const R = this.cfg.rake, RS = this.rakeStats(p);
    const targets = this.enemies.filter(e => !e.dead && this.inRakeCircle(p, e, dx, dz));
    this.emit({ k: 'swipe', x: r2(p.x), z: r2(p.z), a: r2(Math.atan2(dx, dz)), p: p.id, r: r2(RS.range), w: r2(RS.dia) });
    this.till(p, dx, dz);
    let hits = 0;
    for (const e of targets) {
      const boss = !!e.boss; // bosses: damage only (a stun every stroke would lock them)
      if (!this.hurtEnemy(e, RS.dmg, { color: 'r', punch: true, stun: boss ? 0 : R.stun, phys: true })) continue;
      hits++;
      if (RS.kb > 0 && !e.dead && !boss) { const ex = e.x - p.x, ez = e.z - p.z, l = Math.hypot(ex, ez) || 1; e.kbx = ex / l; e.kbz = ez / l; e.kbLeft = RS.kb; }
    }
    if (hits) this.emit({ k: 'punches', n: hits, x: r2(p.x), z: r2(p.z) });
  }
  /** tilling: every field the rake circle touches advances its harvest by tillStroke s (hit or not, the covered area does not
   *  matter any more). A harvest completed by a stroke falls out of random bushes of the field. */
  till(p: Player, dx: number, dz: number) {
    const F = this.cfg.fields, R = this.cfg.rake, A0 = Math.PI * R.diameter * R.diameter / 4;
    let best: Field | null = null, bestA = 0, any = false;
    for (const f of this.fields) {
      if (!f.alive) continue;
      const tri = this.rakeOverlap(f, p, dx, dz), A = tri.reduce((s, x) => s + x, 0); if (A < .01) continue;
      any = true;
      if (A > bestA) { bestA = A; best = f; }
      f.tilledT = F.tillDuration; f.shake = Math.max(f.shake, .2);
      if (isBuilding(f.type)) { this.tillBuilding(p, f, Math.min(1, A / A0)); this.emit({ k: 'till', s: f.slot, a: r2(Math.min(1, A / A0)), m: 0, w: [] }); continue; }
      // 23.11.2026 (Basti): where the rake hits the field no longer matters, only hit or not; the harvest drops from random bushes
      this.tillGrow(f, F.tillStroke * this.prodMult(f) * this.hpF(f), ALL6); // crops: one plant per stroke (tillStroke only for trees)
      const m = 63, TA = 1;
      this.emit({ k: 'till', s: f.slot, a: r2(Math.min(1, A / A0)), m, w: ALL6.map(x => x / TA) });
    }
    if (!any) return;
    // healing (Feldpflege) goes through the field covered most: one field per player
    for (const o of this.fields) if (o !== best && o.tilledBy === p.id) o.tilledBy = -1;
    if (best) best.tilledBy = p.id;
    const RS = this.rakeStats(p);
    this.sfx('player.till', p.x + dx * RS.centre, p.z + dz * RS.centre);
    this.burst(p.x + dx * RS.centre, .1, p.z + dz * RS.centre, 0x8a6a3a, 10, 1.2, .14, .4, { g: 4 });
  }
  /** while a field is being tilled it heals (also back up from 0 HP), and so do the tilling player and team mates standing on it */
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
      fr.vx = Math.cos(a) * 1.5; fr.vy = 3; fr.vz = Math.sin(a) * 1.5; fr.state = 'fly'; fr.bounce = 0; fr.src = -1; fr.sk = fr.gy = undefined; fr.r = .08;
    }
    if (e.carry.length) { e.carry = []; e.fleeing = false; e.target = null; }
  }
  /** Citrateaser (17.11.2026): the lemon wand shoots a slow glowing ball lightning straight ahead */
  lemonBall(p: Player, dx: number, dz: number, st: SkillStats) {
    const L = this.cfg.skills.lemon;
    this.projs.push({ id: this.nid++, kind: 'ball', x: p.x + dx * .45, y: .6, z: p.z + dz * .45, dx, dz, speed: L.speed, left: st.range, total: st.range, dmg: st.dmg, pierceLeft: 0, pf: 1, mine: 0,
      w: st.ballR, hit: new Set(), zt: L.tickInterval, ch: st.chains, rc: st.chainReturn, cd: st.chainDmg, tr: st.tickR });
    this.sfx('weapons.lemon', p.x, p.z);
  }
  /** on its way the ball zaps the nearest enemy within tickRadius every tickInterval for tickDamage x damage */
  private ballTick(pr: Proj, dt: number) {
    const L = this.cfg.skills.lemon; pr.zt = (pr.zt ?? L.tickInterval) - dt;
    while (pr.zt <= 0) {
      pr.zt += L.tickInterval;
      let best: Enemy | null = null, bd = Infinity;
      for (const e of this.enemies) { if (e.dead || this.airborne(e)) continue; const d = Math.hypot(e.x - pr.x, e.z - pr.z) - e.r; if (d <= (pr.tr ?? L.tickRadius) && d < bd) { bd = d; best = e; } }
      if (!best) continue;
      this.hurtEnemy(best, pr.dmg * L.tickDamage, { color: 'z', silent: true, src: 'lemon' });
      this.emit({ k: 'zap', s: [[r2(pr.x), r2(pr.z), r2(best.x), r2(best.z), 1]], t: 1 });
    }
  }
  /** direct hit: full damage on the main target, then the lightning jumps on to `ch` further enemies (chainDamage each,
   *  always to the nearest one not hit yet within chainRadius of the last one); per chain target it jumps back to the
   *  main target with chance `rc` (chainDamage there again) */
  private ballHit(pr: Proj, main: Enemy) {
    const L = this.cfg.skills.lemon, segs: number[][] = [], hit = new Set<Enemy>([main]);
    if (L.dropLoot) this.dropCarry(main);
    this.hurtEnemy(main, pr.dmg, { color: 'z', src: 'lemon' });
    let last = main; const mx = main.x, mz = main.z;
    for (let i = 0; i < (pr.ch || 0); i++) {
      let nx: Enemy | null = null, bd = Infinity;
      for (const e of this.enemies) { if (e.dead || hit.has(e) || this.airborne(e)) continue; const d = Math.hypot(e.x - last.x, e.z - last.z); if (d <= L.chainRadius + e.r && d < bd) { bd = d; nx = e; } }
      if (!nx) break;
      hit.add(nx); segs.push([r2(last.x), r2(last.z), r2(nx.x), r2(nx.z), 1]);
      this.hurtEnemy(nx, pr.dmg * (pr.cd ?? L.chainDamage), { color: 'z', silent: true, src: 'lemon' });
      if (Math.random() < (pr.rc || 0)) { // back to the main target
        segs.push([r2(nx.x), r2(nx.z), r2(main.dead ? mx : main.x), r2(main.dead ? mz : main.z), 2]);
        if (!main.dead) this.hurtEnemy(main, pr.dmg * (pr.cd ?? L.chainDamage), { color: 'z', silent: true, src: 'lemon' });
      }
      last = nx;
    }
    this.emit({ k: 'zap', s: [[r2(pr.x), r2(pr.z), r2(main.x), r2(main.z), 1], ...segs], t: 1 });
    this.burst(pr.x, pr.y, pr.z, 0xfff0a0, 14, 2.4, .1, .3);
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
    this.flameIgnite(p.x, p.z, Math.sin(a1), Math.cos(a1), st.range);
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
    rows.push(['rake.dmg', N.skills.rake, 'Schaden', p.rakeLv.dmg], ['rake.rng', N.skills.rake, 'Reichweite', p.rakeLv.rng], ['rake.dia', N.skills.rake, 'Durchmesser', p.rakeLv.dia], ['rake.cd', N.skills.rake, 'Tempo', p.rakeLv.cd]);
    for (const sid of SKILLS) {
      const s = p.skills[sid], g = N.skills[sid];
      rows.push([`${sid}.learned`, g, 'Freigeschaltet', s.learned ? 1 : 0], [`${sid}.ammo`, g, 'Munition (±25)', p.ammo[sid]],
        [`${sid}.lvDmg`, g, 'Schaden', s.lvDmg], [`${sid}.lvRange`, g, sid === 'cab' ? 'Radius' : 'Reichweite', s.lvRange], [`${sid}.lvCd`, g, 'Abklingzeit', s.lvCd]);
      if (sid === 'asp') rows.push(['asp.pierce', g, 'Durchbohren (Ziele)', s.pierce], ['asp.pierceBonus', g, 'Durchbohr-Schaden', s.pierceBonus], ['asp.sizeLv', g, 'Geschossgröße', s.sizeLv], ['asp.salvoLv', g, 'Salve', s.salvoLv]);
      if (sid === 'cran') rows.push(['cran.extraPel', g, '+Projektile', s.extraPel], ['cran.cranPierceLv', g, 'Durchbohr-Chance', s.cranPierceLv], ['cran.mineLv', g, 'Beeren-Platzschaden', s.mineLv]);
      if (sid === 'cab') rows.push(['cab.minis', g, 'Mini-Kohl', s.minis], ['cab.gasLv', g, 'Kohlgas', s.gasLv], ['cab.poisLv', g, 'Giftschaden', s.poisLv]);
      if (sid === 'lemon') rows.push(['lemon.tgtLv', g, 'Kettenziele', s.tgtLv], ['lemon.xferLv', g, 'Rückblitz', s.xferLv], ['lemon.effLv', g, 'Schadenseffizienz', s.effLv]);
      if (sid === 'chili') rows.push(['chili.sweepLv', g, 'Schwenk + Flamme', s.sweepLv], ['chili.tickLv', g, 'Brand-Tick', s.tickLv]);
    }
    for (const f of TILE_TYPES) {
      rows.push([`field.${f}`, isBuilding(f) ? 'Gebäude' : 'Felder', `${N.fields[f]} (+ bauen/hochleveln, − entfernen)`, this.fields.filter(x => x.type === f).length]);
      if (!isBuilding(f)) rows.push([`yield.${f}`, 'Felder', `Doppelernte ${N.plants[f]}`, this.yieldLv[f]]);
    }
    rows.push(['care', 'Felder', N.care, this.tillHealLv]);
    if (this.cfg.combos) for (const cid of COMBOS) { const C = this.CB.list[cid]; rows.push([`combo.${cid}`, 'Kombiwaffen', `${N.combos?.[cid] ?? cid} (${N.skills[C.main]} + ${N.skills[C.sub]})`, p.skills[C.main].combo === cid ? 1 : 0]); }
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
    if (a === 'combo' && this.cfg.combos) {
      const cid = b as ComboId, C = this.CB.list[cid], m = p.skills[C.main], u = p.skills[C.sub];
      if (d > 0 && m.combo !== cid) {
        for (const w of [C.main, C.sub]) { const s = p.skills[w]; if (s.combo) this.cheat(id, `combo.${s.combo}`, -1); for (const o of SKILLS) if (p.skills[o].combo && p.skills[o].partner === s) this.cheat(id, `combo.${p.skills[o].combo}`, -1); }
        this.learn(p, C.main); this.learn(p, C.sub); this.mergeCombo(p, cid); p.ammo[C.main] += 60; p.active = C.main;
      } else if (d < 0 && m.combo === cid) { m.combo = ''; m.partner = undefined; u.merged = false; this.learn(p, C.sub); }
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
    // 24.11.2026 (Basti): the Körner-MP no longer overheats, it only gets less precise the longer it fires
    if (id === 'cab' && !s.combo && !this.canLayMine(p)) return false; // mines: not on tiles, not on top of each other
    const st = this.stats(id, s);
    const d = dir || this.aimDir(p, this.thrown(s, id) ? st.throwDist : st.range);
    s.firing = true; p.aimX = d[0]; p.aimZ = d[1];
    this.fireSkill(p, id, d[0], d[1]);
    return true;
  }
  fireSkill(p: Player, id: SkillId, dx: number, dz: number) {
    if (p.skills[id].combo) return this.fireCombo(p, id, dx, dz);
    const s = p.skills[id], st = this.stats(id, s), S = this.cfg.skills;
    p.ammo[this.ak(p, id)] -= st.cost; s.cdT = st.cd; p.face = Math.atan2(dx, dz); p.handT = .9; // another weapon in the hand: rake put away
    const fx = p.x + dx * .35, fy = .75, fz = p.z + dz * .35;
    if (id !== 'chili') this.emit({ k: 'shot', p: p.id, w: id, x: r2(fx), z: r2(fz), a: r2(Math.atan2(dx, dz)) }); // flame: drawn continuously from the player snapshot
    if (id === 'asp') {
      this.aspBolt(p, dx, dz, st, false);
      s.burst = st.shots - 1; s.burstT = st.gap; // rest of the salvo follows in the player update
    } else if (isGun(id)) {
      this.snd('shot');
      const kind: ProjKind = id === 'blue' ? p.berry : id;
      this.burst(fx, fy, fz, kind === 'blue' ? 0x5a7aff : kind === 'black' ? 0x6a3a8a : 0xff4060, 8, 2.5, .15, .25);
      const G = S[id], half = G.cone / 2, sig = G.spreadSigma, base = Math.atan2(dx, dz);
      for (let i = 0; i < st.pellets; i++) {
        let g = 0; for (let k = 0; k < 8; k++) { g = gauss() * sig; if (Math.abs(g) <= half) break; g = clamp(g, -half, half); } // normal, cut at the cone edge
        const a = base + g * Math.PI / 180;
        this.projs.push({ id: this.nid++, kind, x: fx, y: fy, z: fz, dx: Math.sin(a), dz: Math.cos(a), speed: rand(10, 12), left: st.range * rand(.85, 1), total: st.range, dmg: st.dmg, pierceLeft: Math.random() < st.cranPierce ? 1 : 0, pf: 1, mine: st.splash, w: .1, hit: new Set() }); // pierce chance: flies through one enemy
      }
    } else if (id === 'wheat') { // Körner-MP: one fast grain; the hotter the gun, the wider the spread
      const W = S.wheat, h = s.heat ?? 0, sig = W.spreadMin + (W.spreadMax - W.spreadMin) * h * h, a = Math.atan2(dx, dz) + clamp(gauss() * sig, -sig * 2, sig * 2) * Math.PI / 180;
      this.projs.push({ id: this.nid++, kind: 'wheat', x: fx, y: fy, z: fz, dx: Math.sin(a), dz: Math.cos(a), speed: W.speed, left: st.range, total: st.range, dmg: st.dmg, pierceLeft: 0, pf: 1, mine: 0, w: W.width ?? .07, hit: new Set() });
      this.sfx('weapons.grain', p.x, p.z);
      s.heat = Math.min(1, h + st.cd / st.dur); s.idle = 0;
    } else if (id === 'lemon') {
      this.lemonBall(p, dx, dz, st);
    } else if (id === 'chili') {
      this.flame(p, dx, dz, st);
    } else if (id === 'flour') {
      this.flourThrow(p, st);
    } else if (id === 'pan') {
      this.panThrow(p, dx, dz, st);
    } else { // cabbage: contact mine put down right where the player stands (see canLayMine)
      this.snd('throw');
      const b = this.spawnBomb(p.x, .5, p.z, p.x, p.z, st.range, st.dmg, st.minis, false, st.gas, st.poisonMul);
      b.flight = .2; b.fuse = 1e9; b.mine = true;
      const mines = this.bombs.filter(x => x.mine), max = S.cab.maxMines ?? 15;
      if (mines.length > max) { const old = mines[0]; this.bombs.splice(this.bombs.indexOf(old), 1); this.burst(old.x, .2, old.z, 0x6fbf3a, 8, 1, .1, .4); }
    }
  }
  /** Spiegeleischleuder: one fast turn with the pan, abrupt stop, then the fried eggs fly out sizzling to a point throw m ahead:
   *  each 0.2-0.3 m from that point, 120 deg (+-spreadJitter) apart, so their scent drifts outwards in three directions */
  panThrow(p: Player, dx: number, dz: number, st: SkillStats) {
    const P = this.cfg.skills.pan;
    p.spinT = p.spinD = P.spin; p.spinK = 'pan'; this.snd('pan');
    const cx = p.x + dx * P.throw, cz = p.z + dz * P.throw, [ax, az] = this.clampArena(cx, cz), a0 = rand(0, Math.PI * 2);
    let a = a0;
    for (let i = 0; i < P.eggs; i++) {
      const r = rand(P.ring[0], P.ring[1]), [x, z] = this.clampArena(ax + Math.cos(a) * r, az + Math.sin(a) * r);
      this.baits.push({ id: this.nid++, x, z, sx: p.x + dx * .4, sz: p.z + dz * .4, y: .9, delay: P.spin * .92 + i * .04, fl: P.flight * rand(.92, 1.08), t: 0, left: st.eat, total: st.eat, r: st.range, age: 0, out: a, eaters: 0, n: 0 });
      a += (P.spread + rand(-P.spreadJitter, P.spreadJitter)) * Math.PI / 180;
    }
  }
  /** fried eggs: in the pan during the spin, flying, then lying (eaten up by the animals around them, or gone after maxLife s) */
  updateBaits(dt: number) {
    const P = this.cfg.skills.pan;
    for (const b of this.baits) b.n = 0;
    for (const e of this.enemies) if (e.bait) { const b = this.baits.find(x => x.id === e.bait); if (b) b.n++; }
    for (const b of [...this.baits]) {
      b.left -= dt * b.eaters; b.eaters = 0;
      if (b.delay > 0) { b.delay -= dt; continue; }
      if (b.t < b.fl) {
        b.t += dt; const k = Math.min(1, b.t / b.fl);
        b.y = .9 * (1 - k) + .03 * k + Math.sin(k * Math.PI) * 1.5;
        if (k >= 1) { b.y = .03; this.emit({ k: 'eggLand', x: r2(b.x), z: r2(b.z) }); this.snd('eggLand'); }
        continue;
      }
      b.age += dt;
      if (b.left <= 0 || b.age > P.maxLife) { this.baits.splice(this.baits.indexOf(b), 1); this.emit({ k: 'eggGone', x: r2(b.x), z: r2(b.z), e: b.left <= 0 ? 1 : 0 }); }
    }
  }
  /** lured by a Spiegelei: runs to the nearest one whose scent reaches it (fewer eaters preferred) and eats instead of attacking */
  lure(e: Enemy, dt: number) {
    let b = e.bait ? this.baits.find(x => x.id === e.bait && x.left > 0 && x.t >= x.fl && x.delay <= 0) : undefined;
    if (!b || !e.eat) { // not eating yet: (re)pick the egg - nearest whose scent reaches it, spread over the eggs (eggs land a moment apart)
      let best: Bait | undefined, bd = 1e9;
      for (const x of this.baits) if (x.delay <= 0 && x.t >= x.fl && x.left > 0) { const d = Math.hypot(e.x - x.x, e.z - x.z), sc = d + (x.n - (x === b ? 1 : 0)) * 1.2; if (d <= x.r && sc < bd) { bd = sc; best = x; } }
      if (!best) { if (b) b.n--; e.bait = 0; e.eat = 0; return false; }
      if (best !== b) { if (b) b.n--; best.n++; b = best; e.bait = b.id; e.target = null; e.eat = 0; }
    }
    const reach = .25 + e.r * .6;
    const d = this.steer(e, b.x, b.z, e.speed * (e.type === 'toad' ? 1.6 : 1), dt, reach);
    if (e.type === 'toad') e.hop += dt / (this.cfg.enemies.toad.hopPeriod || .5);
    if (d <= reach + .35) { // close enough (others crowding round the same egg) // eating: nibbles, the egg shrinks
      b.eaters++; e.eat = (e.eat || 0) + dt + 1e-6; e.face = Math.atan2(b.x - e.x, b.z - e.z);
      if ((e.eat % .55) < dt) { e.lunge = .16; if (Math.random() < .5) this.burst(b.x, .08, b.z, Math.random() < .5 ? 0xfff6e8 : 0xffb030, 3, .7, .05, .25); }
    }
    return true;
  }
  /** Mehlsack: the player spins once and flings flour in every direction -> a cloud around him (max maxClouds, the oldest unlit one goes) */
  flourThrow(p: Player, st: SkillStats) {
    const F = this.cfg.skills.flour;
    p.spinT = p.spinD = F.spin; p.spinK = 'flour'; this.snd('flour');
    const c: Cloud = { id: this.nid++, x: p.x, z: p.z, r: st.range, age: 0, life: F.life, ign: -1, ix: 0, iz: 0, front: 0, dmg: st.dmg, hit: new Set() };
    this.clouds.push(c);
    const unlit = this.clouds.filter(x => x.ign < 0);
    if (unlit.length > (F.maxClouds ?? 4)) this.clouds.splice(this.clouds.indexOf(unlit[0]), 1);
  }
  /** fire touches a cloud at (x, z): it catches there and the flame front eats through it from that point */
  igniteCloud(c: Cloud, x: number, z: number) {
    if (c.ign >= 0) return;
    const d = Math.hypot(x - c.x, z - c.z), k = d > c.r * .95 ? c.r * .95 / d : 1; // start point inside the cloud
    c.ign = c.age; c.ix = c.x + (x - c.x) * k; c.iz = c.z + (z - c.z) * k; c.front = 0;
    this.emit({ k: 'flourFire', x: r2(c.ix), z: r2(c.iz), r: r2(c.r) }); this.snd('flourFire');
  }
  /** flamethrower ray from (x, z) in direction (dx, dz): lights every cloud it reaches */
  flameIgnite(x: number, z: number, dx: number, dz: number, range: number) {
    for (const c of this.clouds) if (c.ign < 0) for (let t = .3; t <= range; t += .25) { const px = x + dx * t, pz = z + dz * t; if (Math.hypot(px - c.x, pz - c.z) < c.r) { this.igniteCloud(c, px, pz); break; } }
  }
  /** clouds: unlit ones drift away after life s and catch fire from burning animals inside; lit ones burn outwards once and die */
  updateClouds(dt: number) {
    const F = this.cfg.skills.flour;
    for (const c of [...this.clouds]) {
      c.age += dt;
      if (c.ign < 0) {
        if (c.age >= c.life) { this.clouds.splice(this.clouds.indexOf(c), 1); continue; }
        const b = this.enemies.find(e => !e.dead && e.burn > 0 && Math.hypot(e.x - c.x, e.z - c.z) < c.r); // a burning animal walks in
        if (b) this.igniteCloud(c, b.x, b.z);
        continue;
      }
      c.front += F.frontSpeed * dt;
      for (const e of this.enemies) {
        if (e.dead || c.hit.has(e.id)) continue;
        if (Math.hypot(e.x - c.x, e.z - c.z) > c.r + e.r * .5 || Math.hypot(e.x - c.ix, e.z - c.iz) > c.front) continue;
        c.hit.add(e.id);
        this.flourBurn(e, F);
        e.burnSum += c.dmg; this.hurtEnemy(e, c.dmg, { silent: true, dot: true, src: 'chili' });
      }
      for (const o of this.clouds) { // the front jumps over to a cloud it touches
        if (o === c || o.ign >= 0) continue;
        const dd = Math.hypot(o.x - c.x, o.z - c.z); if (dd > o.r + c.r) continue;
        const k = dd > 0 ? (c.r - (dd - o.r) / 2) / dd : 0, px = c.x + (o.x - c.x) * k, pz = c.z + (o.z - c.z) * k; // middle of the overlap
        if (Math.hypot(px - c.ix, pz - c.iz) <= c.front) this.igniteCloud(o, px, pz);
      }
      const far = Math.hypot(c.ix - c.x, c.iz - c.z) + c.r;
      if (c.front > far + F.frontSpeed * .6) this.clouds.splice(this.clouds.indexOf(c), 1); // the carpet burns down right behind the front
    }
  }
  /** burns burnTime s at burnDps (one fire stack; a stronger chili fire on the same animal stays) */
  flourBurn(e: Enemy, F: Balancing['skills']['flour']) {
    if (e.dead) return;
    const tick = .5, dmg = F.burnDps * tick;
    if (e.burn <= 0) e.burnT = tick;
    e.burn = Math.max(1, e.burn); e.burnTick = Math.min(e.burnTick || tick, tick); e.burnDmg = Math.max(e.burnDmg || 0, dmg / e.burn); e.burnLeft = Math.max(e.burnLeft, F.burnTime);
  }
  /** one asparagus bolt from the crossbow; follow = later bolt of a salvo (pays its own ammo, own muzzle event) */
  aspBolt(p: Player, dx: number, dz: number, st: SkillStats, follow: boolean) {
    if (follow) { p.ammo.asp -= st.cost; p.face = Math.atan2(dx, dz); p.aimX = dx; p.aimZ = dz; }
    const fx = p.x + dx * .35, fy = .75, fz = p.z + dz * .35;
    if (follow) this.emit({ k: 'shot', p: p.id, w: 'asp', x: r2(fx), z: r2(fz), a: r2(Math.atan2(dx, dz)) });
    this.snd('asp'); p.xbT = .9;
    this.projs.push({ id: this.nid++, kind: 'asp', x: fx, y: fy, z: fz, dx, dz, speed: this.cfg.skills.asp.speed, left: st.range, total: st.range, dmg: st.dmg, pierceLeft: st.pierce, pf: st.pf, mine: 0, w: st.width, hit: new Set() });
  }
  /** charge of the throw being held, 0..1 (full after skills.cab.chargeTime) */
  chargeK(p: Player) { return clamp(p.chT / Math.max(.05, this.cfg.skills.cab.chargeTime), 0, 1); }
  /** flight time of a thrown cabbage: longer throws stay longer in the air */
  flightFor(d: number) { return clamp(.3 + d * .055, .35, .8); }
  /** charged throw distance: throwMin without charge, max at full charge (p.thrK) */
  throwAt(p: Player, max: number) { const mn = Math.min(this.cfg.skills.cab.throwMin, max); return mn + (max - mn) * clamp(p.thrK, 0, 1); }
  spawnBomb(fx: number, fy: number, fz: number, tx: number, tz: number, radius: number, dmg: number, minis: number, mini: boolean, gas = 0, pm = 1) {
    const flight = mini ? .35 : this.flightFor(Math.hypot(tx - fx, tz - fz)); // explodes the moment it lands
    const b: Bomb = { id: this.nid++, fx, fy, fz, tx, tz, x: fx, y: fy, z: fz, t: 0, flight, fuse: flight, radius, dmg, minis, mini, kind: 'cab', gen: 0, gas, pm };
    this.bombs.push(b); return b;
  }
  /** a cabbage mine may go down here: not on a tile (field / building), and not right on top of another mine (slight overlap of the blasts is fine) */
  canLayMine(p: Player) {
    const sl = slotAt(this.cfg, this.slots, p.x, p.z), f = sl >= 0 ? this.fieldAt(sl) : undefined;
    if (f && f.alive) return false;
    const gap = this.stats('cab', p.skills.cab).range * (this.cfg.skills.cab.mineSpacing ?? 1.6);
    return !this.bombs.some(b => b.mine && Math.hypot(b.x - p.x, b.z - p.z) < gap);
  }
  explode(b: Bomb) {
    const C = this.cfg.skills.cab;
    this.snd(b.mini ? 'boomS' : 'boom');
    this.emit({ k: 'boom', x: r2(b.tx), z: r2(b.tz), r: r2(b.radius), m: b.mini ? 1 : 0 });
    // no pool any more: everything hit is poisoned (poisonDuration, a tick every poisonTick of poisonTickDamage x blast damage, poisonSlow slower)
    for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - b.tx, e.z - b.tz) < b.radius + e.r * .5) { const pd = b.dmg * (b.pm ?? 1); this.poisonEnemy(e, pd); if (b.gas) this.gasEnemy(e, b.gas, pd); this.hurtEnemy(e, b.dmg, { color: 'c', src: 'cab' }); }
    for (let i = 0; i < b.minis; i++) {
      const a = rand(0, Math.PI * 2), t = this.clampArena(b.tx + Math.cos(a), b.tz + Math.sin(a));
      this.spawnBomb(b.tx, .3, b.tz, t[0], t[1], b.radius * C.miniRadiusFactor, b.dmg * C.miniDamageFactor, 0, true, b.gas, b.pm);
    }
  }
  /** cabbage poison debuff: a new hit restarts it (the stronger tick damage counts) */
  poisonEnemy(e: Enemy, blastDmg: number) {
    const C = this.cfg.skills.cab; if (e.dead || !C.poisonDuration) return;
    const iv = Math.max(.05, C.poisonTick), d = blastDmg * C.poisonTickDamage;
    if (e.pois <= 0) { e.poisT = iv; e.poisDmg = d; } else e.poisDmg = Math.max(e.poisDmg, d);
    e.pois = Math.max(1, Math.round(C.poisonDuration / iv));
  }
  /** "Kohlgas" upgrade: a cabbage hit leaves gas on the enemy (as long as the poison); dying with it = chance to burst */
  gasEnemy(e: Enemy, chance: number, blastDmg: number) {
    if (e.dead) return; const on = e.gasT > 0;
    e.gasCh = on ? Math.max(e.gasCh, chance) : chance; e.gasDmg = on ? Math.max(e.gasDmg, blastDmg) : blastDmg; e.gasT = this.cfg.skills.cab.poisonDuration;
  }
  /** gas burst on death: every enemy within gasRadius gets the cabbage poison debuff (no chain: they get no gas) */
  private gasBurst(e: Enemy) {
    const r = this.cfg.skills.cab.gasRadius ?? 1;
    this.snd('boomS'); this.emit({ k: 'boom', x: r2(e.x), z: r2(e.z), r: r2(r), m: 1 });
    for (const o of this.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < r + o.r) this.poisonEnemy(o, e.gasDmg);
  }
  private tickEnemyPoison(e: Enemy, dt: number) {
    if (e.gasT > 0) { e.gasT -= dt; if (e.gasT <= 0) { e.gasCh = 0; e.gasDmg = 0; } }
    if (e.pois <= 0) return;
    e.poisT -= dt;
    while (e.poisT <= 1e-6 && e.pois > 0 && !e.dead) { e.poisT += Math.max(.05, this.cfg.skills.cab.poisonTick); e.pois--; this.hurtEnemy(e, e.poisDmg, { color: 'v', silent: true, dot: true, src: 'cab' }); }
  }
  // ---------- combo weapons ----------
  get CB() { return this.cfg.combos!; }
  /** asparagus pierce upgrade: +step up to `max` targets, the last level pierces every target (PIERCE_ALL) */
  pierceLv(s: SkillState) { const U = this.cfg.upgrades.aspPierce, b = this.cfg.skills.asp.pierce, n = Math.round(((U.max ?? 4) - b) / U.step); return s.pierce >= PIERCE_ALL ? n + 1 : Math.round((s.pierce - b) / U.step); }
  pierceUp(s: SkillState) { const U = this.cfg.upgrades.aspPierce; s.pierce = s.pierce >= (U.max ?? 4) ? PIERCE_ALL : s.pierce + U.step; }
  /** upgrades taken for one weapon (all kinds) */
  upCount(id: SkillId, s: SkillState) {
    return s.lvDmg + s.lvRange + s.lvCd + (id === 'asp' ? this.pierceLv(s) : 0) + s.pierceBonus + s.sizeLv + s.salvoLv + s.extraPel + s.cranPierceLv + s.mineLv + s.minis + s.gasLv + s.poisLv + s.effLv + s.tgtLv + s.xferLv + s.sweepLv + s.tickLv;
  }
  /** special upgrade levels of a weapon by upgrade key (asp_pierce, cran_pel, ...) */
  private specials(id: SkillId, s: SkillState): Record<string, number> {
    const all: Record<string, number> = { asp_pierce: this.pierceLv(s), asp_pb: s.pierceBonus, asp_size: s.sizeLv, asp_salvo: s.salvoLv, cran_pel: s.extraPel, cran_pierce: s.cranPierceLv, cran_mine: s.mineLv, cab_mini: s.minis, cab_gas: s.gasLv, cab_pois: s.poisLv, lemon_eff: s.effLv, lemon_tgt: s.tgtLv, lemon_xfer: s.xferLv, chili_sweep: s.sweepLv, chili_tick: s.tickLv };
    const out: Record<string, number> = {}; for (const k in all) if (k.startsWith(id + '_')) out[k] = Math.max(0, all[k]); return out;
  }
  /** combo weapon owned by this main weapon state: every upgrade of both weapons folded into one set of numbers */
  comboStats(m: SkillState): ComboStats {
    const cid = m.combo as ComboId, CB = this.CB, C = CB.list[cid], u = m.partner!, U = this.cfg.upgrades, S = this.cfg.skills;
    const sp = { ...this.specials(C.main, m), ...this.specials(C.sub, u) }, keep = C.keep || [];
    let conv = 0; for (const k in sp) if (!keep.includes(k)) conv += sp[k];
    const k = (key: string) => keep.includes(key) ? (sp[key] || 0) : 0;
    const dm = 1 + U.damagePerLevel * (m.lvDmg + u.lvDmg) + CB.convertDamage * conv, rm = 1 + U.rangePerLevel * (m.lvRange + u.lvRange), cm = Math.pow(1 - U.cooldownPerLevel, m.lvCd + u.lvCd);
    const chTick = (t: number) => Math.max(U.chiliTick.min, t * Math.pow(U.chiliTick.factor, k('chili_tick')));
    const o: ComboStats = { cid, dmg: C.damage * dm, dmgPct: dm, range: (C.range ?? C.throwDistance ?? 3) * rm, cd: C.cooldown * cm, cost: C.ammoPerShot, shots: 1, gap: 0, need: 0, throwDist: C.throwDistance ?? 0,
      count: 1, pierce: 0, pf: 1, width: C.width ?? .3, radius: (C.radius ?? 0) * rm, blast: 0, burn: C.burnStacks ?? 0, tick: S.chili.burnTick, shock: C.shockDamage ?? 0, shockR: CB.shock.radius, shockTick: CB.shock.tick,
      links: 0, linkRange: 0, minis: 0, berryDmg: 0, spikeDmg: 0, splash: 0 };
    switch (cid) {
      case 'jam': o.shots = C.burstShots + k('cran_pel'); o.gap = C.burstGap * cm; o.width = C.width * (1 + U.aspSize.step * k('asp_size')); o.radius = C.blastRadius * (1 + .1 * k('cran_mine')); o.blast = C.blastDamage; break;
      case 'cole': o.range = C.throwDistance; o.count = C.spikes + 4 * k('cab_mini'); o.pierce = keep.includes('asp_pierce') && (C.main === 'asp' ? m : u).pierce >= PIERCE_ALL ? PIERCE_ALL : C.spikePierce + k('asp_pierce'); o.pf = Math.min(1, .7 + U.aspPierceBonus.step * k('asp_pb')); o.width = .22 * (1 + U.aspSize.step * k('asp_size')); o.spikeDmg = C.spikeDamage * dm; o.linkRange = C.spikeRange * rm; break;
      case 'sour': o.count = C.arrows + k('lemon_tgt'); o.width = C.width * (1 + U.aspSize.step * k('asp_size')); o.shock = C.shockDamage + .1 * k('lemon_xfer'); break;
      case 'lance': o.radius = C.radius * (1 + .3 * k('asp_size')); o.tick = chTick(S.chili.burnTick); break;
      case 'cabboom': o.range = C.throwDistance; o.count = C.berries + 2 * k('cran_pel'); o.berryDmg = C.berryDamage * dm * (1 + .1 * k('cran_mine')); o.minis = k('cab_mini'); break;
      case 'shock': o.count = C.pellets + k('cran_pel'); o.dmg *= 1 + .1 * k('cran_mine'); o.links = C.links + k('lemon_tgt'); o.linkRange = C.linkRange * (1 + .1 * k('lemon_xfer')); break;
      case 'hot': o.count = Math.round((S.cran.pellets + U.cranPellets.step * k('cran_pel')) * C.pelletFactor); o.range = S.cran.range * C.rangeFactor * rm; o.pierce = C.pierce; o.tick = chTick(S.chili.burnTick);
        o.splash = Math.min(1, S.cran.splashDamage + U.cranSplash.step * k('cran_mine')); break;
      case 'rocket': o.range = C.range * rm; o.minis = k('cab_mini'); o.width = C.size; break;
      case 'kimchi': o.range = C.throwDistance; o.tick = chTick(C.poolTick); break;
      case 'chilight': o.width = C.width * (1 + .2 * k('chili_sweep')); o.shock = C.shockDamage + .1 * k('lemon_xfer'); o.shockR = CB.shock.radius + .2 * k('lemon_tgt'); o.shockTick = chTick(CB.shock.tick); break;
    }
    o.need = Math.ceil(S.readySeconds / o.cd - 1e-9) * o.cost * o.shots;
    return o;
  }
  /** thrown weapons aim at a throw distance instead of their range */
  thrown(s: SkillState, id: SkillId) { void id; return s.combo ? !!this.CB.list[s.combo as ComboId].throwDistance : false; } // plain cabbage is a mine since 22.11.2026
  /** combo weapon whose sub weapon uses this fruit: ammo goes to the main weapon, x subAmmo */
  comboOwner(p: Player, t: SkillId): { id: SkillId; f: number } | null {
    if (!p.skills[t].merged) return null;
    for (const id of SKILLS) { const s = p.skills[id]; if (s.combo && s.partner === p.skills[t]) return { id, f: this.CB.list[s.combo as ComboId].subAmmo }; }
    return null;
  }
  /** combos this player could take now: both weapons learned, not merged, each with unlockUpgrades upgrades */
  comboReady(p: Player): ComboId[] {
    const CB = this.cfg.combos; if (!CB) return [];
    return COMBOS.filter(cid => {
      const C = CB.list[cid]; if (!C) return false; const m = p.skills[C.main], u = p.skills[C.sub];
      return m.learned && u.learned && !m.combo && !u.combo && !m.merged && !u.merged && this.upCount(C.main, m) >= CB.unlockUpgrades && this.upCount(C.sub, u) >= CB.unlockUpgrades;
    });
  }
  /** merge: the main weapon becomes the combo, the sub weapon's slot gets free, its ammo is converted */
  mergeCombo(p: Player, cid: ComboId) {
    const C = this.CB.list[cid], m = p.skills[C.main], u = p.skills[C.sub];
    m.combo = cid; m.partner = u; m.learned = true; if (!p.slots.includes(C.main)) p.slots.push(C.main);
    u.merged = true; u.learned = false; u.firing = false; p.slots = p.slots.filter(x => x !== C.sub);
    p.ammo[C.main] += Math.floor(p.ammo[C.sub] * C.subAmmo); p.ammo[C.sub] = 0;
    if (p.active === C.sub) p.active = C.main;
    this.emit({ k: 'combo', p: p.id, c: COMBOS.indexOf(cid), x: r2(p.x), z: r2(p.z) }); this.sfx('ui.rarity', p.x, p.z);
  }
  /** fire a combo weapon (called through fireSkill of its main weapon) */
  fireCombo(p: Player, id: SkillId, dx: number, dz: number) {
    const s = p.skills[id], cs = this.comboStats(s), C = this.CB.list[cs.cid], a = Math.atan2(dx, dz);
    p.ammo[id] -= cs.cost; s.cdT = cs.cd; p.face = a; p.handT = .9; p.cwT = 1.1; p.cwId = cs.cid;
    const fx = p.x + dx * .45, fy = .78, fz = p.z + dz * .45;
    this.emit({ k: 'cshot', p: p.id, c: COMBOS.indexOf(cs.cid), x: r2(fx), z: r2(fz), a: r2(a) });
    const proj = (kind: ProjKind, ang: number, o: Partial<Proj>) => this.projs.push({ id: this.nid++, kind, x: fx, y: fy, z: fz, dx: Math.sin(ang), dz: Math.cos(ang), speed: 12, left: cs.range, total: cs.range, dmg: cs.dmg, pierceLeft: 0, pf: 1, mine: 0, w: .1, hit: new Set(), cs, ...o });
    const bomb = (kind: Bomb['kind'], fuse: number) => { // charged throw like the cabbage; fuse counts from a 0.6 s flight, so the time on the ground stays the same
      const td = this.throwAt(p, cs.throwDist), t = this.clampArena(p.x + dx * td, p.z + dz * td), flight = this.flightFor(Math.hypot(t[0] - fx, t[1] - fz));
      this.snd('throw'); this.bombs.push({ id: this.nid++, fx, fy, fz, tx: t[0], tz: t[1], x: fx, y: fy, z: fz, t: 0, flight, fuse: Math.max(flight, fuse + flight - .6), radius: cs.radius, dmg: cs.dmg, minis: cs.minis, mini: false, kind, gen: 0, cs }); };
    switch (cs.cid) {
      case 'jam': this.jamBolt(p, dx, dz, cs, false); s.burst = cs.shots - 1; s.burstT = cs.gap; break;
      case 'cole': bomb('cole', C.fuse); break;
      case 'cabboom': bomb('cabboom', C.fuse + .6); break;
      case 'kimchi': bomb('kimchi', C.fuse + .5); break;
      case 'sour': { this.snd('asp'); const n = cs.count, arc = C.arc * Math.PI / 180; for (let i = 0; i < n; i++) proj('sour', a + (n > 1 ? (i / (n - 1) - .5) * arc : 0), { speed: C.speed, pierceLeft: 999, w: cs.width, shk: cs.shock }); break; }
      case 'lance': this.sfx('weapons.chiliStart', p.x, p.z); proj('lance', a, { speed: C.speed, pierceLeft: 999, w: cs.radius, r: cs.radius, burn: cs.burn, tick: cs.tick, dmgPct: cs.dmgPct }); break;
      case 'rocket': this.snd('boomS'); proj('rocket', a, { speed: C.speed, w: cs.width / 2, r: cs.radius, b: C.edge }); this.emit({ k: 'backblast', x: r2(p.x - dx * .5), z: r2(p.z - dz * .5), a: r2(a) }); break;
      case 'shock': case 'hot': {
        this.snd('shot'); const S = this.cfg.skills.cran, half = (cs.cid === 'shock' ? C.cone : S.cone) / 2, sig = S.spreadSigma;
        for (let i = 0; i < cs.count; i++) {
          let g = 0; for (let k = 0; k < 8; k++) { g = gauss() * sig; if (Math.abs(g) <= half) break; g = clamp(g, -half, half); }
          const an = a + g * Math.PI / 180, rr = cs.range * rand(.6, 1);
          if (cs.cid === 'shock') proj('shock', an, { speed: rand(9, 11), left: rr, total: rr });
          else proj('hot', an, { speed: rand(10, 12), left: rr, total: rr, pierceLeft: cs.pierce, mine: cs.splash, burn: cs.burn, tick: cs.tick, dmgPct: cs.dmgPct });
        }
        break;
      }
      case 'chilight': {
        this.snd('boom'); this.sfx('weapons.lemon', p.x, p.z);
        this.lwaves.push({ ox: p.x + dx * .7, oz: p.z + dz * .7, dx, dz, d: 0, len: cs.range, w: cs.width, sp: C.speed, dmg: cs.dmg, kb: C.knockback, cs, hit: new Set() });
        this.emit({ k: 'slam', x: r2(p.x + dx * .7), z: r2(p.z + dz * .7), a: r2(a), l: r2(cs.range), w: r2(cs.width), sp: C.speed });
        break;
      }
    }
  }
  /** Jam-Bow bolt (salvo like the crossbow) */
  jamBolt(p: Player, dx: number, dz: number, cs: ComboStats, follow: boolean) {
    if (follow) { p.ammo.asp -= cs.cost; p.face = Math.atan2(dx, dz); p.aimX = dx; p.aimZ = dz; p.cwT = 1.1; this.emit({ k: 'cshot', p: p.id, c: COMBOS.indexOf('jam'), x: r2(p.x + dx * .45), z: r2(p.z + dz * .45), a: r2(Math.atan2(dx, dz)) }); }
    this.snd('asp');
    const C = this.CB.list.jam;
    this.projs.push({ id: this.nid++, kind: 'jam', x: p.x + dx * .45, y: .78, z: p.z + dz * .45, dx, dz, speed: C.speed, left: cs.range, total: cs.range, dmg: cs.dmg, pierceLeft: 0, pf: 1, mine: 0, w: cs.width, hit: new Set(), r: cs.radius, b: cs.blast, cs });
  }
  /** "unter Strom": crackles, every tick hurts itself and its neighbours */
  applyShock(e: Enemy, dmg: number, cs: ComboStats) {
    if (e.dead) return;
    const S = this.CB.shock;
    if (e.shock <= 0) e.shockT = cs.shockTick * .5;
    e.shock = S.duration; e.shockDmg = Math.max(e.shock > 0 ? e.shockDmg : 0, dmg); e.shockR = cs.shockR; e.shockTk = cs.shockTick;
  }
  private tickShock(e: Enemy, dt: number) {
    if (e.shock <= 0) return;
    e.shock -= dt; e.shockT -= dt;
    if (e.shockT > 0) return;
    e.shockT += e.shockTk;
    const segs: number[][] = [], dmg = e.shockDmg;
    for (const o of this.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < e.shockR + o.r + e.r) { segs.push([r2(o.x), r2(o.z)]); this.hurtEnemy(o, dmg, { color: 'z', silent: true, src: 'lemon' }); }
    this.emit({ k: 'shockArc', x: r2(e.x), z: r2(e.z), s: segs });
    this.hurtEnemy(e, dmg, { color: 'z', silent: true, src: 'lemon' });
    if (e.shock <= 0) e.shockDmg = 0;
  }
  /** projectile of a combo weapon hits an enemy; true = projectile is used up */
  private comboHit(pr: Proj, e: Enemy): boolean {
    const cs = pr.cs!;
    switch (pr.kind) {
      case 'jam': this.jamPop(pr, pr.x, pr.z, e); return true;
      case 'spike':
        this.hurtEnemy(e, pr.dmg, { color: 'g', src: 'asp' }); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 0 });
        if (pr.pierceLeft > 0) { pr.pierceLeft--; pr.dmg *= pr.pf; return false; } return true;
      case 'sour':
        this.hurtEnemy(e, pr.dmg, { color: 'z', src: 'lemon' }); this.applyShock(e, pr.dmg * (pr.shk || 0), cs);
        this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 2 }); return false;
      case 'lance':
        this.ignite(e, { tick: pr.tick!, dmgPct: pr.dmgPct! }, pr.burn || 1); this.hurtEnemy(e, pr.dmg, { color: 'o', src: 'chili' }); return false;
      case 'hot':
        this.ignite(e, { tick: pr.tick!, dmgPct: pr.dmgPct! }, pr.burn || 1); this.hurtEnemy(e, pr.dmg, { bleed: true, color: 'o', src: 'cran' });
        this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 3 });
        if (pr.pierceLeft > 0) { pr.pierceLeft--; return false; } return true;
      case 'rocket': this.rocketBoom(pr, e.x, e.z); return true;
    }
    return true;
  }
  /** combo projectile reached the end of its flight */
  private comboLand(pr: Proj) {
    if (pr.kind === 'jam') this.jamPop(pr, pr.x, pr.z, null);
    else if (pr.kind === 'rocket') this.rocketBoom(pr, pr.x, pr.z);
    else if (pr.kind === 'hot') this.mines.push({ id: this.nid++, x: pr.x, z: pr.z, dmg: pr.dmg * pr.mine, t: this.cfg.skills.cran.splashDelay, fire: { tick: pr.tick!, dmgPct: pr.dmgPct!, n: 1 } });
    else if (pr.kind === 'shock') { const C = this.CB.list.shock, cs = pr.cs!; this.snodes.push({ id: this.nid++, x: pr.x, z: pr.z, t: .15, ticks: C.ticks, dmg: cs.dmg, links: cs.links, lr: cs.linkRange, lw: C.linkWidth, tot: C.ticks }); }
  }
  /** Jam-Bow: berry tip bursts, everything around bleeds */
  private jamPop(pr: Proj, x: number, z: number, first: Enemy | null) {
    const r = pr.r || .5;
    if (first) this.hurtEnemy(first, pr.dmg, { color: 'p', src: 'asp', bleed: true });
    for (const e of [...this.enemies]) if (e !== first && !e.dead && !this.airborne(e) && Math.hypot(e.x - x, e.z - z) < r + e.r) this.hurtEnemy(e, pr.dmg * (pr.b || .5), { color: 'p', src: 'cran', bleed: true });
    this.emit({ k: 'jamPop', x: r2(x), z: r2(z), r: r2(r) }); this.snd('berryPop');
  }
  /** Rocabblauncher: huge blast, damage falls off to the edge */
  private rocketBoom(pr: Proj, x: number, z: number) {
    const r = pr.r || 4, edge = pr.b ?? .5;
    for (const e of [...this.enemies]) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < r + e.r * .5) this.hurtEnemy(e, pr.dmg * (1 - (1 - edge) * clamp(d / r, 0, 1)), { color: 'z', src: 'lemon', dot: this.airborne(e) }); }
    const C = this.cfg.skills.cab;
    for (let i = 0; i < (pr.cs?.minis || 0); i++) { const a = rand(0, Math.PI * 2), t = this.clampArena(x + Math.cos(a) * rand(1.5, r), z + Math.sin(a) * rand(1.5, r)); this.spawnBomb(x, .3, z, t[0], t[1], C.radius * C.miniRadiusFactor, pr.dmg * .15, 0, true); }
    this.emit({ k: 'rocketBoom', x: r2(x), z: r2(z), r: r2(r) }); this.snd('boom'); this.snd('boom');
  }
  /** explosions of thrown combo weapons */
  private comboExplode(b: Bomb) {
    const cs = b.cs!, C = this.CB.list[cs.cid], x = b.tx, z = b.tz;
    const blast = (src: FruitType, color: string) => { for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - x, e.z - z) < b.radius + e.r * .5) this.hurtEnemy(e, b.dmg, { color, src }); };
    if (b.kind === 'cole') { // spiked time bomb: blast + asparagus in all directions
      blast('cab', 'c'); this.snd('boom');
      const n = cs.count, a0 = rand(0, Math.PI * 2);
      for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2; this.projs.push({ id: this.nid++, kind: 'spike', x, y: .45, z, dx: Math.sin(a), dz: Math.cos(a), speed: C.spikeSpeed, left: cs.linkRange, total: cs.linkRange, dmg: cs.spikeDmg, pierceLeft: cs.pierce - 1, pf: cs.pf, mine: 0, w: cs.width, hit: new Set(), cs }); }
      this.emit({ k: 'coleBoom', x: r2(x), z: r2(z), r: r2(b.radius) });
    } else if (b.kind === 'cabboom') { // cabbage full of berries: blast + poison debuff + berries in 5 directions
      this.explode(b);
      const n = cs.count, dirs = Math.max(1, C.directions), a0 = rand(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const dir = i % dirs, a = a0 + dir / dirs * Math.PI * 2 + rand(-.16, .16), d = rand(C.scatter[0], C.scatter[1]), t = this.clampArena(x + Math.sin(a) * d, z + Math.cos(a) * d), fl = .35 + d * .08;
        this.mines.push({ id: this.nid++, x: t[0], z: t[1], sx: x, sz: z, fl, ft: fl, dmg: cs.berryDmg, t: C.berryDelay + rand(0, .3), r: C.berryRadius, bleed: true });
      }
      this.emit({ k: 'cabboom', x: r2(x), z: r2(z), r: r2(b.radius) });
    } else if (b.kind === 'kimchi') { // splits 3 x 3, each blast leaves a burning pool
      blast('chili', 'o'); this.snd(b.gen ? 'boomS' : 'boom');
      const pr = b.radius * .9;
      this.pools.push({ id: this.nid++, x, z, r: pr, t: C.poolDuration, tickT: cs.tick, ticks: Math.round(C.poolDuration / cs.tick), dmg: b.dmg * C.poolDamage, dur: C.poolDuration, iv: cs.tick, fire: { tick: this.cfg.skills.chili.burnTick, dmgPct: cs.dmgPct } });
      const nSplit = C.splits[b.gen];
      if (nSplit) {
        const sc = C.splitScale, dist0 = C.splitDistance * Math.pow(sc, b.gen), a0 = rand(0, Math.PI * 2);
        for (let i = 0; i < nSplit; i++) {
          const a = a0 + i / nSplit * Math.PI * 2 + rand(-.25, .25), t = this.clampArena(x + Math.sin(a) * dist0, z + Math.cos(a) * dist0);
          this.bombs.push({ id: this.nid++, fx: x, fy: .3, fz: z, tx: t[0], tz: t[1], x, y: .3, z, t: 0, flight: .35, fuse: .45, radius: b.radius * sc, dmg: b.dmg * sc, minis: 0, mini: true, kind: 'kimchi', gen: b.gen + 1, cs });
        }
      }
      this.emit({ k: 'kimchiBoom', x: r2(x), z: r2(z), r: r2(b.radius), g: b.gen });
    }
  }
  /** Shockgun berries and Chillightning waves */
  private updateCombos(dt: number) {
    for (let i = this.snodes.length - 1; i >= 0; i--) {
      const n = this.snodes[i]; n.t -= dt; if (n.t > 0) continue;
      n.t += this.CB.list.shock.tickInterval; n.ticks--;
      // lightning to the nearest other berries; everything between gets hit
      const near = this.snodes.filter(o => o !== n && Math.hypot(o.x - n.x, o.z - n.z) <= n.lr).sort((a, b) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(b.x - n.x, b.z - n.z)).slice(0, n.links);
      const segs: number[][] = [];
      for (const o of near) {
        segs.push([r2(o.x), r2(o.z)]);
        const lx = o.x - n.x, lz = o.z - n.z, L = Math.hypot(lx, lz) || 1, ux = lx / L, uz = lz / L;
        for (const e of [...this.enemies]) {
          if (e.dead || this.airborne(e)) continue;
          const ex = e.x - n.x, ez = e.z - n.z, t = clamp(ex * ux + ez * uz, 0, L);
          if (Math.hypot(ex - ux * t, ez - uz * t) < n.lw + e.r) this.hurtEnemy(e, n.dmg, { color: 'z', silent: true, src: 'lemon' });
        }
      }
      this.emit({ k: 'arcs', x: r2(n.x), z: r2(n.z), s: segs });
      if (n.ticks <= 0) { this.snodes.splice(i, 1); this.emit({ k: 'berryPop', x: r2(n.x), z: r2(n.z), r: .25, s: 1 }); }
    }
    for (let i = this.lwaves.length - 1; i >= 0; i--) {
      const w = this.lwaves[i], d0 = w.d; w.d = Math.min(w.len, w.d + w.sp * dt);
      for (const e of this.enemies) {
        if (e.dead || w.hit.has(e)) continue;
        const ex = e.x - w.ox, ez = e.z - w.oz, along = ex * w.dx + ez * w.dz, perp = ex * -w.dz + ez * w.dx;
        if (along < d0 - e.r - .2 || along > w.d + e.r || Math.abs(perp) > w.w / 2 + e.r) continue;
        w.hit.add(e);
        this.hurtEnemy(e, w.dmg, { color: 'z', src: 'lemon', dot: this.airborne(e) }); this.applyShock(e, w.dmg * w.cs.shock, w.cs);
        if (!e.boss && !e.dead) { const sd = perp === 0 ? (Math.random() < .5 ? -1 : 1) : Math.sign(perp); e.kbx = -w.dz * sd; e.kbz = w.dx * sd; e.kbLeft = w.kb; }
      }
      if (w.d >= w.len) this.lwaves.splice(i, 1);
    }
  }
  clampArena(x: number, z: number): [number, number] { if (this.sb) return [clamp(x, -this.sb.W, this.sb.W), clamp(z, -this.sb.D, this.sb.D)]; const R = this.cfg.arena.radius, r = Math.hypot(x, z); return r > R ? [x * R / r, z * R / r] : [x, z]; }

  // ---------- enemies ----------
  spawnEnemy(type: EnemyType, angle: number, elite = false) {
    const EL = this.cfg.enemies.elite, D = this.cfg.enemies[type], R = this.cfg.waves.spawnRadius, N = this.nightMul(), G = this.waveScale(), hpF = this.f(this.cfg.coop.enemyHpExponent) * (elite ? EL.hp : 1) * N.hp * G.hp;
    const e: Enemy = {
      id: this.nid++, type, x: Math.cos(angle) * R, z: Math.sin(angle) * R, hp: D.hp * hpF, maxHp: D.hp * hpF,
      shield: (D.shield || 0) * hpF, shieldMax: (D.shield || 0) * hpF, shieldT: D.shieldRegen || 3, r: D.radius * (elite ? EL.scale : 1), speed: D.speed,
      frz: 0, stun: 0, stunMax: 0, bleed: 0, bleedT: 1, flash: 0, atkT: 1, think: 0, target: null, carry: [], fleeing: false, leave: 0, face: angle + Math.PI,
      walk: rand(0, 7), hop: rand(0, 1), state: 'approach', st: 0, cdx: 0, cdz: 1, hitThisCharge: false,
      tongueT: 0, tongueCd: D.tongueCooldown || 1.5, tongueLen: 1, lunge: 0, dead: false, hurtOnce: false, kbx: 0, kbz: 0, kbLeft: 0, laughT: rand(2, 3.5), elite, dmgMul: (elite ? EL.damage : 1) * N.damage * G.damage, wv: this.wave,
      burn: 0, burnT: 0, burnTick: this.cfg.skills.chili.burnTick, burnDmg: 0, burnLeft: 0, burnSum: 0, burnNum: 0, shock: 0, shockT: 0, shockDmg: 0, shockR: 0, shockTk: .5, pois: 0, poisT: 0, poisDmg: 0, gasT: 0, gasCh: 0, gasDmg: 0, puff: rand(0, D.puffEvery || 2),
      hx: 0, hz: 0, cx: 0, cz: 0, y: 0, thorn: 0, thornT: 0, bx: 0, bz: 0, cs: -1, stealT: 0, cmax: 0,
    };
    if (type === 'raccoon' && this.cfg.chest) e.cmax = Math.floor(this.cfg.chest.carryStart + this.cfg.chest.carryPerWave * Math.max(0, this.wave - 1));
    if (type === 'squirrel' && !this.squirrelStart(e)) return; // no nut tree (any more): nobody comes
    this.enemies.push(e); this.waveSpawned++;
  }
  /** place k on the circle around the chest */
  thiefPos(k: number): [number, number] { const C = this.cfg.chest!, a = k / C.maxThieves * Math.PI * 2 + Math.PI / C.maxThieves; return [Math.cos(a) * C.radius, Math.sin(a) * C.radius]; }
  private thiefAt(k: number, me: Enemy) { return this.enemies.some(o => o !== me && !o.dead && o.type === 'raccoon' && o.cs === k && !o.fleeing && o.leave <= 0); }
  /** the raccoon's place at the chest (keeps its own, else the free place farthest from the taken ones, near its way in); -1 = none */
  thiefSlot(e: Enemy) {
    if (!this.stealables().length) { e.cs = -1; return -1; }
    if (e.cs >= 0 && !this.thiefAt(e.cs, e)) return e.cs;
    const C = this.cfg.chest!, N = C.maxThieves, taken: number[] = [], free: number[] = [];
    for (let k = 0; k < N; k++) (this.thiefAt(k, e) ? taken : free).push(k);
    if (!free.length) { e.cs = -1; return -1; }
    const me = Math.atan2(e.z, e.x), gap = (k: number) => taken.length ? Math.min(...taken.map(t => Math.min(Math.abs(k - t), N - Math.abs(k - t)))) : N;
    const ang = (k: number) => { const [x, z] = this.thiefPos(k); let d = Math.abs(Math.atan2(z, x) - me); if (d > Math.PI) d = Math.PI * 2 - d; return d; };
    free.sort((a, b) => (gap(b) - gap(a)) || (ang(a) - ang(b)));
    e.cs = free[0]; e.stealT = C.stealInterval; return e.cs;
  }
  /** everything the players have: ammo (berries, weapon fruits, flour, fried eggs) and the bag, as [player, pool key, item type, count] */
  stealables(): [Player, string, FruitType, number][] {
    const out: [Player, string, FruitType, number][] = [];
    for (const p of this.players) {
      for (const k of SKILLS) if (p.ammo[k] >= 1) out.push([p, 'a:' + k, (AMMO_OF[k] ?? k) as FruitType, Math.floor(p.ammo[k])]);
      for (const [t, n] of Object.entries(p.inv)) if ((n || 0) >= 1) out.push([p, 'i:' + t, t as FruitType, Math.floor(n!)]);
    }
    return out;
  }
  /** one item out of the chest (random, weighted by stock) into the raccoon's arms; full -> runs away fast */
  stealFromChest(e: Enemy) {
    const all = this.stealables(), sum = all.reduce((a, x) => a + x[3], 0);
    if (!sum) { e.cs = -1; e.target = null; return; }
    let r = Math.random() * sum, pick = all[0];
    for (const x of all) { r -= x[3]; if (r <= 0) { pick = x; break; } }
    const [p, key, type] = pick, k = key.slice(2);
    if (key[0] === 'a') p.ammo[k as SkillId] = Math.max(0, p.ammo[k as SkillId] - 1); else p.inv[k as FruitType] = Math.max(0, (p.inv[k as FruitType] || 0) - 1);
    const fr = this.spawnFruit(type, 0, 0, .6, 0, 0, 0, -1); fr.state = 'carried'; fr.val = 1; fr.nx = true;
    e.carry.push(fr); e.lunge = .15; this.sfx('raccoon.steal', e.x, e.z); this.emit({ k: 'steal', e: e.id, t: FRUITS.indexOf(type) });
    if (e.carry.length >= e.cmax) { e.fleeing = true; e.cs = -1; e.target = { kind: 'flee' }; e.laughT = rand(.3, .8); this.sfx('raccoon.flee', e.x, e.z); }
  }
  nearestField(x: number, z: number) { let best: Field | null = null, bd = 1e9; for (const f of this.fields) if (f.alive && f.hp > 0 && !this.isForest(f)) { const d = Math.hypot(x - f.x, z - f.z); if (d < bd) { bd = d; best = f; } } return best; }
  chooseTarget(e: Enemy): Target {
    if (e.fleeing) return { kind: 'flee' };
    const D = this.cfg.enemies[e.type];
    if (e.type === 'raccoon' && this.chestOn) { // 23.11.2026: raccoons steal from the chest; whoever finds no place there attacks the nearest player
      if (this.thiefSlot(e) >= 0) return { kind: 'chest' };
      let bp: Player | null = null, bd = 1e9;
      for (const p of this.players) if (p.alive) { const d = dist(e, p); if (d < bd) { bd = d; bp = p; } }
      if (bp) return { kind: 'player', p: bp };
    }
    if (!D.peaceful) {
      let bp: Player | null = null, bd = this.sb ? 1e9 : this.cfg.enemies.aggroRadius; // test room: everyone goes for the player
      for (const p of this.players) if (p.alive) { const d = dist(e, p); if (d < bd) { bd = d; bp = p; } }
      if (bp) return { kind: 'player', p: bp };
    }
    // fruit: preferred kinds first, then everything else it takes (steals or eats)
    const want = D.eats || D.steals;
    if (want) {
      const near = (types: FruitType[]) => { let best: Fruit | null = null, b2 = 1e9; for (const fr of this.fruits) if (fr.state === 'ground' && types.includes(fr.type) && this.topOfStack(fr)) { const d = dist(e, fr); if (d < b2) { b2 = d; best = fr; } } return best; };
      const best = (D.prefers && near(D.prefers)) || near(want);
      if (best) return { kind: 'fruit', fr: best };
    }
    if (D.peaceful) { // strolls around the garden until it finds something
      const t = e.target;
      if (t && t.kind === 'wander' && Math.hypot(t.x - e.x, t.z - e.z) > .5) return t;
      const f = this.fields.length ? this.fields[Math.floor(Math.random() * this.fields.length)] : null, a = rand(0, Math.PI * 2), r = rand(.5, 3);
      const [x, z] = this.clampArena((f ? f.x : 0) + Math.cos(a) * r, (f ? f.z : 0) + Math.sin(a) * r);
      return { kind: 'wander', x, z };
    }
    if (D.prefersFields) { let best: Field | null = null, bd = 1e9; for (const f of this.fields) if (f.alive && f.hp > 0 && D.prefersFields.includes(f.type)) { const d = dist(e, f); if (d < bd) { bd = d; best = f; } } if (best) return { kind: 'field', f: best }; }
    const f = this.nearestField(e.x, e.z); return f ? { kind: 'field', f } : null;
  }
  /** a stacked egg can only be taken from the top of the pyramid */
  topOfStack(fr: Fruit) { return fr.sk === undefined || !this.fruits.some(o => o.src === fr.src && o.sk !== undefined && o.sk > fr.sk! && o.state === 'ground'); }
  /** poisoned (cabbage) enemies are slower */
  slowF(e: Enemy) { return (e.pois > 0 ? 1 - (this.cfg.skills.cab.poisonSlow ?? 0) : 1) * (e.thorn > 0 ? 1 - this.cfg.skills.black.slow : 1); }
  /** thorns wrap around the animal and (one attempt) around its nearest neighbour within radius m */
  thornBind(e: Enemy) {
    const K = this.cfg.skills.black, fresh = e.thorn <= 0;
    const dur = K.duration * this.juiceF('black');
    e.thorn = dur; if (fresh) e.thornT = K.tick;
    if (!fresh) return;
    let nb: Enemy | null = null, bd = K.radius;
    for (const o of this.enemies) { if (o === e || o.dead || this.airborne(o)) continue; const d = Math.hypot(o.x - e.x, o.z - e.z) - e.r - o.r; if (d < bd) { bd = d; nb = o; } }
    if (nb) { if (nb.thorn <= 0) nb.thornT = K.tick; nb.thorn = dur; this.emit({ k: 'thornLink', a: e.id, b: nb.id }); }
  }
  steer(e: Enemy, tx: number, tz: number, speed: number, dt: number, stop = 0) {
    speed *= this.slowF(e);
    let vx = tx - e.x, vz = tz - e.z; const d = Math.hypot(vx, vz); if (d < .001) return d;
    vx /= d; vz /= d; e.face = Math.atan2(vx, vz);
    if (d > stop) { const s = Math.min(speed * dt, d - stop); e.x += vx * s; e.z += vz * s; e.walk += dt * speed * 4; }
    return d;
  }
  targetPos(t: Target): { x: number; z: number } | null {
    if (!t) return null; if (t.kind === 'chest') return { x: 0, z: 0 }; if (t.kind === 'player') return t.p; if (t.kind === 'fruit') return t.fr; if (t.kind === 'field') return t.f; if (t.kind === 'wander') return t; return null;
  }
  hurtPlayer(p: Player, dmg: number, color = 'h') {
    if (!p.alive || this.phase === 'over') return;
    dmg *= this.f(this.cfg.coop.enemyDamageExponent);
    p.hp -= dmg; p.flash = .35; this.emit({ k: 'hurt', p: p.id });
    this.num(p.x, p.z, dmg, color);
    if (this.sb) { p.hp = this.cfg.player.hp; return; } // test room: hits show, nobody dies
    if (p.hp <= 0) {
      const P = this.cfg.player;
      p.hp = 0; p.alive = false; p.deaths++; p.respawnT = P.respawnBase + P.respawnPerDeath * (p.deaths - 1); p.poison = []; p.stun = 0; p.kb = null; p.swing = 0; p.rakeHit = false;
      this.burst(p.x, .8, p.z, 0xffd890, 40, 3, .2, 1);
      this.emit({ k: 'pdie', p: p.id }); this.sfx('player.die', p.x, p.z);
    }
  }
  tickPoison(obj: { poison: Poison[] }, dt: number, hurt: (d: number) => void) {
    const T = this.cfg.enemies.toad;
    for (let i = obj.poison.length - 1; i >= 0; i--) {
      const s = obj.poison[i]; if (!s) continue; s.t -= dt; // a lethal tick can clear the list (death)
      if (s.t <= 0) { s.t += T.poisonInterval!; s.ticks--; hurt(T.poisonDamage!); if (s.ticks <= 0 && obj.poison[i] === s) obj.poison.splice(i, 1); }
    }
  }
  /** test room with the settings open: enemies stand still, only damage over time keeps ticking */
  private frozenEnemy(e: Enemy, dt: number) {
    e.flash -= dt; e.lunge = 0; e.tongueT = 0;
    this.tickBurn(e, dt); if (e.dead) return;
    this.tickShock(e, dt); if (e.dead) return;
    this.tickEnemyPoison(e, dt);
  }
  updateEnemy(e: Enemy, dt: number) {
    const D = this.cfg.enemies[e.type], E = this.cfg.enemies;
    e.flash -= dt; e.lunge -= dt; e.tongueT -= dt;
    if (D.shield) { e.shieldT -= dt; if (e.shieldT <= 0) { e.shieldT = D.shieldRegen!; if (e.shield < e.shieldMax) { e.shield = e.shieldMax; this.sfx('sheep.shield', e.x, e.z); this.burst(e.x, .45, e.z, 0x6fd0ff, 10, 1.2, .15, .4); } } }
    // bleeding (Preiselbeere): ticks every bleedTick s, but only hurts while the animal moves (not frozen / stunned / standing)
    const CR = this.cfg.skills.cran, bt = CR.bleedTick ?? 1;
    if (e.bleed > 0) {
      e.bleed -= dt; e.bleedT -= dt;
      if (e.bleedT <= 0) {
        e.bleedT += bt; const moved = Math.hypot(e.x - e.bx, e.z - e.bz) > .04 && e.frz <= 0 && e.stun <= 0; e.bx = e.x; e.bz = e.z;
        if (moved) { this.snd('bleed'); this.emit({ k: 'bleed', x: r2(e.x), z: r2(e.z) }); this.hurtEnemy(e, CR.bleedDps * bt, { color: 'b', src: 'cran' }); if (e.dead) return; }
      }
    } else { e.bleedT = bt; e.bx = e.x; e.bz = e.z; }
    // Dornenfessel (Brombeere): physical damage in ticks, 20 % slower (slowF)
    if (e.thorn > 0) {
      const K = this.cfg.skills.black; e.thorn -= dt; e.thornT -= dt;
      if (e.thornT <= 0) { e.thornT += K.tick; this.hurtEnemy(e, K.dps * K.tick, { color: 't', src: 'black', phys: true, silent: true }); if (e.dead) return; }
    }
    this.tickBurn(e, dt); if (e.dead) return;
    this.tickShock(e, dt); if (e.dead) return;
    this.tickEnemyPoison(e, dt); if (e.dead) return;
    if (e.kbLeft > 0) { const s = Math.min(e.kbLeft, 9 * dt); e.x += e.kbx * s; e.z += e.kbz * s; e.kbLeft -= s; } // rake knockback
    if (e.leave > 0) { // wave over: turn round, walk back to the forest and vanish (no more attacks)
      e.leave -= dt; e.lunge = 0; e.tongueT = 0;
      if (e.leave <= 0 || Math.hypot(e.x, e.z) > this.cfg.arena.radius + 3) { this.removeEnemy(e); return; }
      const sf = e.stun > 0 ? this.stunF(e) : 1; e.stun = Math.max(0, e.stun - dt);
      const a = Math.atan2(e.z, e.x); this.steer(e, Math.cos(a) * 40, Math.sin(a) * 40, e.speed * (this.cfg.waves.leaveSpeed ?? 1.3) * this.slowF(e), dt * sf);
      if (e.type === 'toad') e.hop += dt * sf / (this.cfg.enemies.toad.hopPeriod || .5);
      return;
    }
    if (e.frz > 0) { e.frz -= dt; return; } // frozen: does nothing at all
    if (e.stun > 0) { // stunned: everything it does runs slower, ramping up from 0 to normal
      const sf = this.stunF(e); e.stun = Math.max(0, e.stun - dt); dt *= sf; if (dt <= 0) return;
    }
    if (this.baits.length && !e.fleeing && (!e.boss || this.cfg.skills.pan.boss) && e.state !== 'climb' && (e.type !== 'sheep' || e.state === 'approach') && this.lure(e, dt)) return;
    e.bait = 0;
    if (e.boss) return this.bossAI(e, dt);
    if (e.type === 'squirrel') return this.squirrelAI(e, dt);
    e.think -= dt;
    const t0 = e.target;
    if (e.think <= 0 || !t0 || (t0.kind === 'fruit' && t0.fr.state !== 'ground') || (t0.kind === 'field' && (!t0.f.alive || t0.f.hp <= 0)) || (t0.kind === 'player' && (!t0.p.alive || !this.players.includes(t0.p)))) {
      if (e.type !== 'sheep' || e.state === 'approach') e.target = this.chooseTarget(e);
      e.think = .3;
    }
    if (e.type === 'sheep') return this.sheepAI(e, dt);
    const t = e.target; if (!t) return;
    if (t.kind === 'flee') {
      const a = Math.atan2(e.z, e.x); this.steer(e, Math.cos(a) * 40, Math.sin(a) * 40, e.cmax > 0 && e.carry.length >= e.cmax ? this.cfg.chest!.fleeSpeed : D.fleeSpeed!, dt);
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
      e.hop += dt / D.hopPeriod!; const A = this.toadAir, air = (e.hop % 1) < A;
      const rng = t.kind === 'field' ? FR + .55 : t.kind === 'player' ? D.tongueRange! : .3;
      const d = dist(e, tp);
      if (air) { if (d > rng * .8) this.steer(e, tp.x, tp.z, e.speed / A, dt, rng * .8); else e.face = Math.atan2(tp.x - e.x, tp.z - e.z); }
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
    if (t.kind === 'chest') { // thief: walks to its place on the circle, then takes one item every stealInterval s
      const C = this.cfg.chest!, [sx, sz] = this.thiefPos(e.cs), d = this.steer(e, sx, sz, e.speed, dt, 0);
      if (d < .15) {
        e.face = Math.atan2(-e.x, -e.z); e.stealT -= dt;
        if (e.stealT <= 0) { e.stealT = C.stealInterval; this.stealFromChest(e); }
      } else e.stealT = C.stealInterval * .5;
      return;
    }
    const d = this.steer(e, tp.x, tp.z, e.speed, dt, t.kind === 'fruit' ? 0 : reach * .9);
    if (t.kind === 'fruit' && d < .35 + e.r) {
      const fr = t.fr; e.target = null;
      if (D.eats && D.eats.includes(fr.type)) { // eaten on the spot: gone for good
        fr.state = 'carried'; const i = this.fruits.indexOf(fr); if (i >= 0) this.fruits.splice(i, 1);
        this.sfx(e.type + '.steal', e.x, e.z); this.burst(fr.x, .2, fr.z, FRUIT_BURST[fr.type] ?? 0xe8c060, 6, 1.2, .08, .3); e.lunge = .15;
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
    e.boss = { st: 'collect', t: B.collectTime, berries: 0, atk: 0, spawned: 0, next: 0, hx: 0, hz: 0, hdx: 0, hdz: 1, ph: 0 };
    this.emit({ k: 'boss', id: e.id }); this.sfx('raccoon.laugh', e.x, e.z);
  }
  private spitBomb(e: Enemy, x: number, z: number, rain = false) {
    const B = this.cfg.enemies.boss; [x, z] = this.clampArena(x, z);
    this.berryBombs.push({ id: this.nid++, fx: e.x, fz: e.z, x, z, flight: rain ? 0 : .35, t: 0, fuse: rain ? B.rain.warn : B.bombFuse, rain, dmg: B.bombDamage * this.waveScale().damage, r: B.bombRadius });
  }
  private bossAI(e: Enemy, dt: number) {
    const B = this.cfg.enemies.boss, S = e.boss!;
    // HP is split into B.phases stages; after each lost stage the boss attacks phaseSpeedup faster (multiplicative)
    const nPh = Math.max(1, B.phases ?? 1), ph = Math.min(nPh - 1, Math.floor((1 - e.hp / e.maxHp) * nPh + 1e-6));
    if (ph > S.ph) { S.ph = ph; this.sfx('raccoon.laugh', e.x, e.z); this.emit({ k: 'poof', x: r2(e.x), z: r2(e.z) }); }
    const tdt = dt * Math.pow(1 + (B.phaseSpeedup ?? 0), S.ph); // attack timers run faster
    S.t -= tdt;
    const target = this.players.filter(p => p.alive).sort((a, b) => dist(a, e) - dist(b, e))[0];
    const mult = 1 + B.berryBonus * S.berries;
    if (S.st === 'collect') {
      let best: Fruit | null = null, bd = 1e9; // walk to the nearest blueberry on the ground and eat it
      for (const fr of this.fruits) if (fr.state === 'ground' && isBerry(fr.type)) { const d = dist(e, fr); if (d < bd) { bd = d; best = fr; } }
      if (best) { this.steer(e, best.x, best.z, e.speed, dt); if (bd < e.r + .25) { this.fruits.splice(this.fruits.indexOf(best), 1); S.berries += best.val; this.emit({ k: 'bossEat', x: r2(best.x), z: r2(best.z) }); } }
      else if (target) this.steer(e, target.x, target.z, e.speed, dt, e.r + .6);
      if (target && dist(e, target) < e.r + .6) { e.atkT -= tdt; if (e.atkT <= 0) { e.atkT = this.cfg.enemies.meleeInterval; e.lunge = .2; this.hurtPlayer(target, this.cfg.enemies.meleeDamage * e.dmgMul); } }
      if (S.t <= 0) { S.st = 'charge'; S.t = B.chargeTime; this.sfx('raccoon.attack', e.x, e.z); }
    } else if (S.st === 'charge') {
      if (target) e.face = Math.atan2(target.x - e.x, target.z - e.z);
      if (S.t <= 0) {
        S.st = 'attack'; S.spawned = 0; S.next = 0; S.hx = e.x; S.hz = e.z;
        if (target) { const dx = target.x - e.x, dz = target.z - e.z, l = Math.hypot(dx, dz) || 1; S.hdx = dx / l; S.hdz = dz / l; }
        S.t = S.atk === 1 ? B.carousel.duration : 30; // trail and rain end when all bombs are out
      }
    } else {
      S.next -= tdt;
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
        const C = B.carousel; e.face += tdt * 9;
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
  // A wave lasts a fixed countdown (group schedule + waves.countdownAfter); when it runs out every enemy except the boss
  // turns round and vanishes, then a fixed pause follows. Groups grow during a wave and the wave
  // closes with one big group.
  wave = 0; wavePause = true; won = false; private waveSpawned = 0; private bossCount = 0;
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
  private waveT0 = 0; private waveDur = 1; private waveEndAt = 0; private pauseLen = 1; private dayEnd = .75;
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
  dayHour() { if (this.sb) return this.sb.hour; if (this.wave < 1 || !this.cycleLen()) return 0; return (this.wave - 1) % this.cycleLen() + this.dayFrac(); }
  /** start wave w now: builds the group schedule */
  startWave(w: number) {
    const W = this.cfg.waves, cf = this.f(this.cfg.coop.enemyCountExponent);
    this.wave = w; this.wavePause = false; this.waveGroups = []; this.waveSpawned = 0;
    const D = W.durationStart + W.durationPerWave * (w - 1), base = Math.min(W.sizeMax, W.sizeStart + W.sizePerWave * (w - 1)) * cf * this.nightMul(w).size * (W.countMultiplier ?? 1);
    const gap = Math.max(W.gapMin, W.gapStart - W.gapPerWave * (w - 1));
    const round = (v: number) => Math.max(1, Math.floor(v) + (Math.random() < v % 1 ? 1 : 0));
    let t = 0;
    while (t < D - gap * .5) { const x = t / D; this.waveGroups.push({ at: this.time + t, size: round(base * (W.rampFrom + (W.rampTo - W.rampFrom) * x)) }); t += gap * rand(1 - W.gapJitter, 1 + W.gapJitter); }
    this.waveGroups.push({ at: this.time + D, size: round(base * W.finalMultiplier) }); // big closing group
    if (w === 1) { // wave 1: exactly firstWaveEnemies raccoons, spread over the groups (growing)
      let left = Math.round(W.firstWaveEnemies * cf * (W.countMultiplier ?? 1));
      const gs = this.waveGroups, n = Math.min(gs.length, left);
      this.waveGroups = gs.slice(gs.length - n);
      this.waveGroups.forEach((g, i) => { g.size = i === n - 1 ? left : 1; left -= g.size; });
    }
    this.waveT = 0; this.waveT0 = this.time; this.waveDur = D + (W.countdownAfter ?? 20); this.waveEndAt = this.time + this.waveDur;
    this.emit({ k: 'waveStart', w });
    const BL = this.cfg.enemies.boss.levels;
    if (BL) { // boss by player level: first wave after reaching level first, first+every, ... (one boss at a time)
      if (this.level >= BL.first + BL.every * this.bossCount && !this.enemies.some(e => e.boss && !e.dead)) { this.bossCount++; this.spawnBoss(); }
    } else { const be = this.bossEvery(); if (be > 0 && w % be === 0) this.spawnBoss(); } // boss wave: last wave of every night
  }
  // ---------- weapon test room ----------
  private sbUpdate(dt: number) {
    const B = this.sb!;
    if (B.rate <= 0) return;
    B.acc += dt * B.rate / 60;
    while (B.acc >= 1) {
      B.acc -= 1;
      if (this.enemies.length >= this.cfg.enemies.maxAlive) continue;
      const type = B.type === 'random' ? SB_ENEMIES[Math.floor(Math.random() * SB_ENEMIES.length)] : B.type, n = this.enemies.length;
      this.spawnEnemy(type, 0);
      const e = this.enemies[n]; if (!e) continue;
      e.x = B.W + .6; e.z = rand(-B.D + .8, B.D - .8); e.face = -Math.PI / 2; // right edge of the room
    }
  }
  /** test room: put weapon w in the hand (rake, a fruit weapon or a combo id); everything else is put away */
  sbSelect(id: number, w: string) {
    const p = this.player(id); if (!p || !this.sb) return;
    this.sb.weapon = w;
    for (const sid of SKILLS) { const s = p.skills[sid]; Object.assign(s, { combo: '', partner: undefined, merged: false, learned: false, burst: 0, firing: false, cdT: 0 }); }
    p.slots = []; p.flOn = 0; p.active = 'rake'; for (const sid of SKILLS) p.ammo[sid] = 9999;
    if ((SKILLS as string[]).includes(w)) { this.learn(p, w as SkillId); p.active = w as SkillId; }
    else if ((COMBOS as string[]).includes(w) && this.cfg.combos) { const C = this.CB.list[w as ComboId]; this.learn(p, C.main); this.learn(p, C.sub); this.mergeCombo(p, w as ComboId); p.active = C.main; }
  }
  /** test room: remove every enemy (e.g. after switching the enemy type) */
  sbClear() { for (const e of [...this.enemies]) this.removeEnemy(e); this.berryBombs.length = 0; }

  /** test room: every upgrade of weapon w (rake, fruit weapon, or both weapons of a combo) with its level,
   *  the regular maximum from the level-up cards (0 = none) and a hard cap where more levels change nothing */
  sbUps(id: number, w: string): SbUp[] {
    const p = this.player(id); if (!p) return [];
    const U = this.cfg.upgrades, out: SbUp[] = [];
    if (w === 'rake') {
      const L = p.rakeLv as any;
      for (const [k, label] of [['dmg', 'Schaden'], ['rng', 'Reichweite'], ['dia', 'Durchmesser'], ['cd', 'Tempo']]) out.push({ key: 'rake.' + k, w: 'rake', label, lv: L[k] || 0, max: 0, cap: 0 });
      return out;
    }
    const ids: SkillId[] = (SKILLS as string[]).includes(w) ? [w as SkillId] : this.cfg.combos && (COMBOS as string[]).includes(w) ? [this.CB.list[w as ComboId].main, this.CB.list[w as ComboId].sub] : [];
    let sweepMax = 0; while (sweepMax < 60 && !this.chiliGeom(sweepMax).sweepMax) sweepMax++;
    let tickMax = 0; while (tickMax < 60 && this.cfg.skills.chili.burnTick * Math.pow(U.chiliTick.factor, tickMax) > U.chiliTick.min + 1e-6) tickMax++;
    const pierceN = Math.round(((U.aspPierce.max ?? 4) - this.cfg.skills.asp.pierce) / U.aspPierce.step) + 1;
    for (const sid of ids) {
      const s = p.skills[sid], add = (k: string, label: string, lv: number, max: number, cap = 0) => out.push({ key: `${sid}.${k}`, w: sid, label, lv, max, cap });
      add('lvDmg', 'Schaden', s.lvDmg, 0);
      add('lvRange', sid === 'cab' ? 'Radius' : sid === 'lemon' ? 'Kugelgröße' : 'Reichweite', s.lvRange, 0);
      if (sid !== 'chili') add('lvCd', 'Abklingzeit', s.lvCd, 0); // flamethrower: fixed rate, no cooldown card
      if (sid === 'asp') { add('pierce', 'Durchbohren', this.pierceLv(s), pierceN, pierceN); add('pierceBonus', 'Durchbohr-Schaden', s.pierceBonus, U.aspPierceBonus.maxLevel || 5, U.aspPierceBonus.maxLevel || 5); add('sizeLv', 'Geschossgröße', s.sizeLv, U.aspSize.maxLevel || 4); add('salvoLv', 'Salve', s.salvoLv, U.aspSalvo.shots.length, U.aspSalvo.shots.length); }
      if (sid === 'cran') { add('extraPel', 'Projektile', s.extraPel, U.cranPellets.maxLevel || 5); add('cranPierceLv', 'Durchbohr-Chance', s.cranPierceLv, U.cranPierce.maxLevel || 5, Math.ceil(1 / U.cranPierce.step - 1e-9)); add('mineLv', 'Platzschaden', s.mineLv, U.cranSplash.maxLevel || 5, Math.ceil((1 - this.cfg.skills.cran.splashDamage) / U.cranSplash.step - 1e-9)); }
      if (sid === 'cab') { add('minis', 'Mini-Kohl', Math.round(s.minis / (U.cabMini.step || 1)), U.cabMini.maxLevel || 5); add('gasLv', 'Kohlgas', s.gasLv, U.cabGas.maxLevel || 5, Math.ceil(1 / U.cabGas.step - 1e-9)); add('poisLv', 'Giftschaden', s.poisLv, U.cabPoison.maxLevel || 5); }
      if (sid === 'lemon') { add('tgtLv', 'Kettenziele', s.tgtLv, U.lemonTargets.maxLevel || 5); add('xferLv', 'Rückblitz', s.xferLv, U.lemonTransfer.maxLevel || 5, Math.ceil(1 / U.lemonTransfer.step - 1e-9)); add('effLv', 'Schadenseffizienz', s.effLv, U.lemonEfficiency.maxLevel || 5, Math.ceil((1 - this.cfg.skills.lemon.chainDamage) / U.lemonEfficiency.step - 1e-9)); }
      if (sid === 'chili') { add('sweepLv', 'Schwenk + Flamme', s.sweepLv, sweepMax, sweepMax); add('tickLv', 'Brand-Tick', s.tickLv, tickMax, tickMax); }
    }
    return out;
  }
  /** test room: one upgrade level up (d = 1) or down (d = -1); stays between 0 and the hard cap */
  sbUp(id: number, w: string, key: string, d: number) {
    const p = this.player(id); if (!p) return;
    const r = this.sbUps(id, w).find(x => x.key === key); if (!r) return;
    const lv = Math.max(0, r.cap > 0 ? Math.min(r.cap, r.lv + d) : r.lv + d);
    const [a, b] = key.split('.');
    if (a === 'rake') { (p.rakeLv as any)[b] = lv; return; }
    const s = p.skills[a as SkillId] as any, U = this.cfg.upgrades;
    if (b === 'pierce') { const B = this.cfg.skills.asp.pierce; s.pierce = lv >= r.cap ? PIERCE_ALL : B + lv * U.aspPierce.step; }
    else if (b === 'minis') s.minis = lv * (U.cabMini.step || 1);
    else s[b] = lv;
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
      if (this.time >= this.waveEndAt) { // countdown ran out: every enemy except the boss turns round and vanishes, pause begins
        this.waveGroups.length = 0; this.spawnQueue.length = 0;
        for (const e of this.enemies) if (!e.boss && !e.dead && !e.leave) { this.dropCarry(e); e.fleeing = false; e.leave = W.leaveTime ?? 3; e.target = null; }
        this.wavePause = true; this.waveT = this.pauseLen = W.pauseStart + W.pausePerWave * (this.wave - 1); this.dayEnd = this.dayFrac();
        this.emit({ k: 'waveEnd', w: this.wave });
        this.xpHist.push({ w: this.wave, ...this.xpNow, lv: this.level }); this.xpNow = { h: 0, e: 0, j: 0 };
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
      p.chW = ''; p.chT = 0; // a held throw is lost when the player falls
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
    if (this.chestOn) { const d = Math.hypot(p.x, p.z), R = .75; if (d < R) { const k = d > 1e-3 ? R / d : 0; p.x = d > 1e-3 ? p.x * k : 0; p.z = d > 1e-3 ? p.z * k : R; } } // the chest is solid
    // standing (with the centre) on a field heals it
    const under = this.fieldAt(slotAt(this.cfg, this.slots, p.x, p.z));
    if (under && under.alive && under.hp < under.maxHp) under.hp = Math.min(under.maxHp, under.hp + this.cfg.fields.healPerSecond * dt);

    p.rakeCd -= dt * sf; for (const id of SKILLS) p.skills[id].cdT = Math.max(0, p.skills[id].cdT - dt * sf);
    { // Körner-MP: cools down coolDelay s after the last grain (full -> cold in coolTime s); overheated stays locked until cold
      const w = p.skills.wheat, W = this.cfg.skills.wheat;
      if (W && w.heat) { w.idle = (w.idle ?? 0) + dt; if (w.idle > W.coolDelay || w.hot) w.heat = Math.max(0, w.heat - dt / W.coolTime); if (w.hot && w.heat <= 0) { w.hot = false; this.sfx('weapons.cooled', p.x, p.z); } }
    }
    p.xbT = Math.max(0, p.xbT - dt); p.handT = Math.max(0, p.handT - dt); p.spinT = Math.max(0, p.spinT - dt); p.cwT = Math.max(0, p.cwT - dt);
    const xa = p.skills.asp; // crossbow salvo: remaining bolts follow at burstGap, re-aimed each time
    if (xa.burst > 0) {
      xa.burstT -= dt * sf;
      while (xa.burst > 0 && xa.burstT <= 0) { // several bolts per frame if the gap is shorter than a frame (big salvos)
        if (!p.alive || !this.canFire(p, 'asp')) xa.burst = 0;
        else if (xa.combo === 'jam') { const cs = this.comboStats(xa), d = this.aimDir(p, cs.range); this.jamBolt(p, d[0], d[1], cs, true); xa.burst--; xa.burstT += cs.gap; }
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
    // 23.11.2026: the rake has its own button (left click), so the active weapon is always a shooting weapon when there is one
    if (p.active === 'rake') { const n = this.nextAvailable(p, 'rake', true); if (n !== 'rake' && this.canFire(p, n as SkillId)) p.active = n; }
    if (it.cycle !== p.lastCycle) { p.lastCycle = it.cycle; p.active = this.nextAvailable(p, p.active, true); this.emit({ k: 'cycle', p: p.id }); }
    // shotgun berry: switch on request, and by itself when the selected berry is used up
    if ((it.berry ?? 0) !== p.lastBerry) { p.lastBerry = it.berry ?? 0; this.nextBerry(p); }
    else if (p.ammo[p.berry] < this.stats('blue', p.skills.blue).cost) this.nextBerry(p);
    const fw: Weapon | null = it.fire === 'active' ? p.active : it.fire;
    for (const id of SKILLS) if (fw !== id) p.skills[id].firing = false;
    if (it.aim && Math.hypot(it.ax, it.az) > .01) { const l = Math.hypot(it.ax, it.az); p.aimX = it.ax / l; p.aimZ = it.az / l; p.face = Math.atan2(p.aimX, p.aimZ); }
    if (p.swing > 0 || p.rakeHit) { // running stroke: turns with the player at once, impact at the end of the push
      const d = this.rakeDir(p); p.aimX = d[0]; p.aimZ = d[1]; p.face = p.swingDir = Math.atan2(d[0], d[1]);
      if (p.swing <= 0) { p.rakeHit = false; this.rakeImpact(p, d[0], d[1]); }
    }
    // thrown weapons (cabbage, Coleateral Bomb, Cabboomberry, Kimchi): hold to charge, the throw flies on release
    const chg = fw && fw !== 'rake' && this.thrown(p.skills[fw], fw) ? fw : null;
    if (p.chW && p.chW !== chg) {
      const w = p.chW, dir: [number, number] | undefined = p.chAim ? [p.aimX, p.aimZ] : undefined;
      p.thrK = this.chargeK(p); p.chW = ''; p.chT = 0; p.chAim = false;
      this.tryFire(p, w, dir); p.thrK = 0;
    }
    if (chg) {
      if (!p.chW) { if (this.canFire(p, chg) && p.skills[chg].cdT <= 0) { p.chW = chg; p.chT = 0; p.chAim = false; } }
      else p.chT += dt * sf;
      if (p.chW) { p.skills[chg].firing = true; if (it.aim) p.chAim = true; p.face = Math.atan2(p.aimX, p.aimZ); }
    } else if (fw) {
      if (fw === 'rake') { if (p.rakeCd <= 0) { const d = this.aimDir(p, this.rakeStats(p).range); this.rakeAttack(p, d[0], d[1]); } }
      else this.tryFire(p, fw);
    }
    if (it.tapSeq !== p.lastTap) {
      p.lastTap = it.tapSeq;
      const w = it.tapW;
      if (w === 'rake') { if (p.rakeCd <= 0) { const d = this.aimDir(p, this.rakeStats(p).range, false); this.rakeAttack(p, d[0], d[1]); } }
      else if (w) { const s = this.stats(w, p.skills[w]); this.tryFire(p, w, this.aimDir(p, this.thrown(p.skills[w], w) ? s.throwDist : s.range, false)); }
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
    this.tickShop(rdt);
    const want = this.phase === 'play' && !this.paused && !this.shopPause ? 1 : 0, T = Math.max(.01, this.cfg.transitions?.slow ?? .5);
    this.ramp = want ? Math.min(1, this.ramp + rdt / T) : Math.max(0, this.ramp - rdt / T);
    const scale = this.ramp * this.ramp * (3 - 2 * this.ramp);
    if (scale <= 0) return;
    const dt = rdt * scale;
    this.time += dt;
    if (this.sb) for (const p of this.players) { for (const id of SKILLS) p.ammo[id] = 9999; p.hp = this.cfg.player.hp; } // test room: endless ammo, full health
    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateClouds(dt); this.updateBaits(dt);
    // fields
    for (const f of this.fields) {
      this.tickPoison(f, dt, d => this.hurtField(f, d));
      if (f.tilledT > 0) { f.tilledT -= dt; this.tillHeal(f, dt); if (f.tilledT <= 0) f.tilledBy = -1; }
      if (isBuilding(f.type)) this.tickBuilding(f, dt);
      else if (f.alive) this.growField(f, dt * this.prodMult(f) * this.hpF(f), dt);
      f.shake = Math.max(0, f.shake - dt);
    }
    // fruit
    this.mergeT -= dt; if (this.mergeT <= 0) { this.mergeT = this.cfg.fruit.mergeCheck; this.mergeFruit(); }
    for (let i = this.merges.length - 1; i >= 0; i--) {
      const mg = this.merges[i]; mg.t -= dt; if (mg.t > 0) continue; this.merges.splice(i, 1);
      const ot = outType(this.cfg, mg.f.type), fr = this.spawnFruit(ot, mg.tier, mg.x, .3, mg.z, mg.x, mg.z, mg.f.slot); fr.vx = fr.vz = 0; fr.vy = 3;
      this.emit({ k: 'merge', x: r2(mg.x), z: r2(mg.z), t: FRUITS.indexOf(ot) });
    }
    const PL = this.cfg.player;
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const fr = this.fruits[i];
      if (fr.state === 'fly') {
        fr.vy -= 9.8 * dt; fr.x += fr.vx * dt; fr.y += fr.vy * dt; fr.z += fr.vz * dt;
        if (fr.gy !== undefined) { if (fr.y <= fr.gy && fr.vy < 0) { fr.y = fr.gy; fr.vx = fr.vy = fr.vz = 0; const [lx, , lz] = fr.lx !== undefined ? [fr.lx, 0, fr.lz!] : eggSlot(fr.sk!, this.cfg.buildings.hens.stack || 4), f = this.fields.find(q => q.slot === fr.src); fr.x = (f?.x ?? 0) + lx; fr.z = (f?.z ?? 0) + lz; fr.state = 'ground'; } }
        else if (fr.y <= fr.r && fr.vy < 0) { if (fr.bounce < 1) { fr.vy *= -.32; fr.vx *= .4; fr.vz *= .4; fr.bounce++; fr.y = fr.r; } else { fr.y = fr.r; fr.state = 'ground'; } }
      } else if (fr.state === 'ground') {
        let best: Player | null = null, bd = 1e9;
        for (const p of this.players) if (p.alive) { const d = dist(fr, p); if (d < bd) { bd = d; best = p; } }
        if (best) {
          if (bd < PL.pickupRadius + fr.tier * PL.pickupPerTier) {
            if (fr.sk !== undefined) { // egg pyramid: the whole stack is taken, top egg first
              const st = this.fruits.filter(x => x.src === fr.src && x.sk !== undefined && x.state === 'ground').sort((a, b) => b.sk! - a.sk!);
              st.forEach((x, k) => { x.state = 'collect'; x.ct = -k * .035; x.fx = x.x; x.fy = x.y; x.fz = x.z; x.collector = best; });
            } else { fr.state = 'collect'; fr.ct = 0; fr.fx = fr.x; fr.fy = fr.y; fr.fz = fr.z; fr.collector = best; }
          }
          else if (fr.sk === undefined && bd < PL.magnetRadius && this.cfg.plants[fr.type]?.magnet !== false) { fr.x += (best.x - fr.x) / bd * PL.magnetSpeed * dt; fr.z += (best.z - fr.z) / bd * PL.magnetSpeed * dt; }
        }
      } else if (fr.state === 'collect') {
        const p = fr.collector!; fr.ct += dt; const k = Math.max(0, Math.min(1, fr.ct / .14));
        fr.x = fr.fx + (p.x - fr.fx) * k; fr.y = fr.fy + (.9 - fr.fy) * k; fr.z = fr.fz + (p.z - fr.fz) * k;
        if (k >= 1) { this.fruits.splice(i, 1); if (this.players.includes(p)) this.collectFruit(fr, p); }
      } else if (fr.state === 'merge') {
        fr.mt += dt; const k = Math.min(1, fr.mt / .25); fr.x += (fr.tx - fr.x) * k * .5; fr.z += (fr.tz - fr.z) * k * .5; fr.y = fr.r + Math.sin(k * Math.PI) * .4;
        if (k >= 1) this.fruits.splice(i, 1);
      }
    }
    // enemies
    if (this.sb) { if (!this.sb.freeze) this.sbUpdate(dt); } else this.waves(dt);
    for (const e of [...this.enemies]) if (!e.dead) { if (this.sb?.freeze) this.frozenEnemy(e, dt); else this.updateEnemy(e, dt); }
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) {
      const a = en[i], b = en[j]; if (this.inTree(a) || this.inTree(b)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r + b.r;
      if (d < m && d > .001) { const k = (m - d) / d * .5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
    // burning pools (Kimchi)
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pl = this.pools[i]; pl.t -= dt; pl.tickT -= dt;
      while (pl.tickT <= 1e-6 && pl.ticks > 0) {
        pl.ticks--;
        pl.tickT += pl.iv;
        for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - pl.x, e.z - pl.z) < pl.r + e.r * .5) {
          if (pl.fire) { this.ignite(e, pl.fire, 1); e.burnSum += pl.dmg; this.hurtEnemy(e, pl.dmg, { silent: true, dot: true, src: 'chili' }); } // Kimchi: burning pool
        }
      }
      if (pl.ticks <= 0 || pl.t < -.1) this.pools.splice(i, 1);
    }
    this.updateProjs(dt);
    this.updateCombos(dt);
    this.updateBerryBombs(dt);
  }
  private updateProjs(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i]; const step = Math.min(pr.speed * dt, pr.left);
      const ax = pr.x, az = pr.z; let done = false; const hits: [number, Enemy][] = [];
      if (pr.kind === 'ball') this.ballTick(pr, dt);
      if (pr.kind !== 'shock') for (const e of this.enemies) { // Shockgun berries fly through enemies
        if (e.dead || pr.hit.has(e)) continue;
        const ex = e.x - ax, ez = e.z - az; const tp = clamp(ex * pr.dx + ez * pr.dz, 0, step);
        if (Math.hypot(e.x - (ax + pr.dx * tp), e.z - (az + pr.dz * tp)) < e.r + pr.w && !this.airborne(e)) hits.push([tp, e]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (const [, e] of hits) {
        pr.hit.add(e);
        if (pr.kind === 'asp') {
          this.hurtEnemy(e, pr.dmg, { color: 'g', src: 'asp', phys: true }); this.burst(e.x, .4, e.z, 0x9cff60, 6, 2, .1, .3); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 0 });
          if (pr.pierceLeft > 0) { pr.pierceLeft--; pr.dmg *= pr.pf; } else { done = true; break; }
        } else if (pr.kind === 'ball') {
          this.ballHit(pr, e); done = true; break;
        } else if (pr.kind === 'wheat') { // grain: small physical hit
          // 10 hits/s: no number per grain, the damage is summed up and shown every .35 s
          const d0 = e.hp; this.hurtEnemy(e, pr.dmg, { color: 'w', src: 'wheat', phys: true, silent: true, dot: true }); e.flash = .06;
          e.gs = (e.gs ?? 0) + Math.max(0, d0 - e.hp); if (this.time - (e.gt ?? -9) >= .35 || e.dead) { if (e.gs > 0) this.num(e.x, e.z, e.gs, 'w'); e.gs = 0; e.gt = this.time; }
          this.burst(e.x, .45, e.z, 0xe8c060, 3, 1.4, .05, .2);
          done = true; break;
        } else if (pr.kind === 'black') { // blackberry: thorn bind (and one neighbour)
          this.hurtEnemy(e, pr.dmg, { color: 't', src: 'black', phys: true });
          this.thornBind(e);
          this.burst(e.x, .4, e.z, 0x5a2a6a, 7, 1.5, .1, .35); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 1 });
          if (pr.pierceLeft > 0) { pr.pierceLeft--; continue; }
          done = true; break;
        } else if (pr.kind === 'blue') { // blueberry: freezes the animal solid for a moment (no bleeding, no popping)
          this.hurtEnemy(e, pr.dmg, { color: 'p', src: 'blue', phys: true });
          if (!e.boss) { e.frz = Math.max(e.frz, this.cfg.skills.blue.freeze * this.juiceF('blue')); this.emit({ k: 'freeze', x: r2(e.x), z: r2(e.z) }); }
          this.burst(e.x, .4, e.z, 0x9ad8ff, 8, 1.6, .1, .4); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 1 });
          if (pr.pierceLeft > 0) { pr.pierceLeft--; continue; }
          done = true; break;
        } else if (pr.kind !== 'cran') {
          if (this.comboHit(pr, e)) { done = true; break; }
        } else {
          this.hurtEnemy(e, pr.dmg, { bleed: true, color: 'p', src: 'cran', phys: true });
          this.emit({ k: 'decal', x: r2(e.x), z: r2(e.z), c: 0x7a0a14, r: r2(rand(.08, .16)), l: 5, op: .7 });
          this.burst(e.x, .35, e.z, 0xff2040, 5, 1.5, .1, .3, { g: 5 }); this.emit({ k: 'impact', x: r2(e.x), z: r2(e.z), c: 1 });
          if (pr.pierceLeft > 0) { pr.pierceLeft--; continue; } // pierce upgrade: this berry flies on through one enemy
          done = true; break;
        }
      }
      pr.x = ax + pr.dx * step; pr.z = az + pr.dz * step; pr.left -= step;
      if (pr.kind === 'cran' || pr.kind === 'blue' || pr.kind === 'black' || pr.kind === 'hot' || pr.kind === 'shock') { const k = 1 - pr.left / pr.total; pr.y = .75 * (1 - k) + Math.sin(k * Math.PI) * .25 + .03; }
      if (pr.kind === 'rocket' && pr.left > 1e-4) { pr.speed += 30 * dt; } // rocket picks up speed
      if (!done && pr.left <= 1e-4) {
        done = true;
        if (pr.kind === 'cran' && pr.mine > 0) {
          this.mines.push({ id: this.nid++, x: pr.x, z: pr.z, dmg: pr.dmg * pr.mine, t: this.cfg.skills.cran.splashDelay }); // missed: lies, then pops
        } else if (pr.kind === 'ball') this.burst(pr.x, pr.y, pr.z, 0xfff0a0, 10, 1.6, .08, .3); // fizzles out
        else if (pr.kind === 'blue') this.burst(pr.x, .1, pr.z, 0x4a64f0, 4, .8, .06, .3);
        else if (pr.kind === 'wheat') { if (Math.random() < .3) this.burst(pr.x, .1, pr.z, 0xd8b050, 2, .6, .04, .25); }
        else this.comboLand(pr);
      }
      if (done) this.projs.splice(i, 1);
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]; b.t += dt; const k = Math.min(1, b.t / b.flight);
      b.x = b.fx + (b.tx - b.fx) * k; b.z = b.fz + (b.tz - b.fz) * k; b.y = b.fy + (.14 - b.fy) * k + Math.sin(k * Math.PI) * (b.mini ? .6 : 1.4);
      if (b.kind === 'cole' && b.t >= b.flight) { // time bomb: ticks faster and faster
        b.tickT = (b.tickT ?? 0) - dt;
        if (b.tickT <= 0) { const k = clamp((b.t - b.flight) / Math.max(.01, b.fuse - b.flight), 0, 1); b.tickT = .34 * (1 - k) + .05; this.emit({ k: 'tick', x: r2(b.tx), z: r2(b.tz), f: r2(k) }); }
      }
      if (b.mine && b.t >= b.flight) { // cabbage mine: goes off as soon as an animal steps on it
        const R = this.cfg.skills.cab.mineTrigger ?? .45;
        if (this.enemies.some(e => !e.dead && !this.airborne(e) && !this.inTree(e) && dist(e, b) < R + e.r)) { this.bombs.splice(i, 1); this.explode(b); }
        continue;
      }
      if (b.t >= b.fuse) { this.bombs.splice(i, 1); if (b.kind === 'cab') this.explode(b); else this.comboExplode(b); }
    }
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mn = this.mines[i];
      if (mn.fl && mn.fl > 0) { mn.fl -= dt; continue; } // scattered berry still in the air
      mn.t -= dt;
      if (mn.t > 0) continue;
      const C = this.cfg.skills.cran, mr = mn.r ?? C.splashRadius;
      for (const e of [...this.enemies]) if (!e.dead && !this.airborne(e) && dist(e, mn) < mr + e.r * .5) {
        this.hurtEnemy(e, mn.dmg, { color: 'p', src: 'cran', bleed: mn.bleed });
        if (mn.fire) this.ignite(e, mn.fire, mn.fire.n);
      }
      this.emit({ k: 'berryPop', x: r2(mn.x), z: r2(mn.z), r: mr, f: mn.fire ? 1 : 0 });
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
  /** Werkstatt pool (23.11.2026): weapon upgrades (normal ideas) and weapon unlocks / combos (golden ideas) */
  upgradePool(p: Player): { normal: (Offer & { w: number })[]; golden: Offer[] } {
    const N = this.cfg.names, U = this.cfg.upgrades, PL = this.cfg.plants;
    const pool: (Offer & { w: number })[] = [], prio: Offer[] = [], learn: (Offer & { w: number })[] = [];
    // guaranteed openers: 1st level-up = new field, 2nd level-up = its weapon (or rake upgrades)
    const first = !!U.firstUpgradeNewField && this.lvRound === 1, second = !!U.secondUpgradeWeapon && this.lvRound === 2;
    const nf = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    // combo weapons: both weapons with unlockUpgrades upgrades each -> big unlock card (before everything else)
    for (const cid of this.comboReady(p)) {
      const C = this.CB.list[cid], m = p.skills[C.main], cs = this.comboStats({ ...m, combo: cid, partner: p.skills[C.sub] });
      const lines = [`{dmg} ${nf(cs.dmg, cs.dmg < 10 ? 1 : 0)}${cs.count > 1 && cid !== 'cole' && cid !== 'cabboom' ? ' × ' + cs.count : ''}`, cs.radius > 0 && cid !== 'lance' ? `{radius} ${nf(cs.radius, 1)} m` : `{range} ${nf(cs.range, 1)} m`, `{cd} ${nf(cs.cd, 2)} s`, `${nf(cs.cost * cs.shots)} {${C.main}}`];
      prio.push({ key: 'combo_' + cid, cat: 'skill', pic: 'combo_' + cid, title: N.combos?.[cid] ?? cid, lines, wp: C.main, fx: N.comboFx?.[cid], combo: cid });
    }
    for (const id of SKILLS) {
      const s = p.skills[id]; if (isBerry(id)) continue; // berries are shotgun ammo, no weapons of their own (23.11.2026)
      const src = SOURCE_OF[id], srcFull = !!src && SKILLS.filter(k => p.skills[k].learned).length >= this.maxWeapons;
      const early = (this.cfg.werkstatt?.firstLearn ?? []).includes(id) && this.shopTier >= 1; // 24.11.2026 Chili + Kohl: im Laden ab der ersten Werkstatt, ohne Feld
      if ((early || this.fieldOf((src ?? id) as FruitType)) && !srcFull && !s.learned && !s.merged && (src || !this.closedType(p, id as FruitType)) && (early || second || src || p.collected[id] >= (PL[id as FruitType]?.unlockAt || 0))) {
        // weapon unlock card: every stat as an icon chip, special effect named briefly
        const st = this.stats(id, s), C = this.cfg.skills, ammo = `${nf(st.cost * st.shots)} {${id}}`;
        const lines = id === 'chili' ? [`{dmg} ${nf(st.dmg, 1)}`, `{fire} ${nf(C.chili.burnDamage * st.dmgPct, 1)} × ${C.chili.burnStacks}`, `{range} ${nf(st.range, 1)} m`, `{sweep} ${nf(st.sweep)}°`, `{arc} ${nf(st.cone)}°`, `${nf(st.cost / st.cd)} {chili} / s`]
          : id === 'cab' ? [`{dmg} ${nf(st.dmg)}`, `{radius} ${nf(st.range * 100)} cm`, `{cd} ${nf(st.cd, 2)} s`, ammo]
          : id === 'pan' ? [`{range} ${nf(C.pan.throw, 1)} m`, `{radius} ${nf(st.range, 1)} m`, `{cd} ${nf(st.cd, 2)} s`, `${nf(st.eat, 1)} s / {fegg}`, `${nf(st.cost)} {fegg}`]
          : [`{dmg} ${nf(st.dmg)}`, `{range} ${nf(st.range, 1)} m`, `{cd} ${nf(st.cd, 2)} s`, ammo, ...(id === 'asp' ? [`{pierce} ${st.pierce}`] : id === 'lemon' ? [`{chain} ${nf(C.lemon.chainRadius, 1)} m`] : [])];
        // 23.11.2026: unlock card is no longer forced every level-up (it blocked all weapon upgrades while you did not want it): weighted draw instead
        learn.push({ key: 'learn_' + id, cat: 'skill', w: U.learnWeight ?? 4, pic: 'skill_' + id, title: N.skills[id], lines, wp: id, fx: N.effects?.[id] });
      }
    }
    for (const id of SKILLS) {
      const s = p.skills[id]; if (!s.learned) continue;
      if (s.combo) { this.comboCards(p, id, s, pool, nf); continue; }
      const a = this.stats(id, s);
      const mk = (key: string, mut: (x: SkillState) => void, line: (b: SkillStats) => string) => {
        const s2 = { ...s }; mut(s2); const b = this.stats(id, s2);
        pool.push({ key, cat: 'skill', w: 1, pic: 'skill_' + id, title: N.skills[id], lines: [line(b)] });
      };
      if (id === 'pan') { // Spiegeleischleuder: no damage, only faster / wider lure / longer eating
        mk('pan_cd', x => x.lvCd++, b => `{cd} ${nf(a.cd, 2)} → ${nf(b.cd, 2)} s`);
        mk('pan_rng', x => x.lvRange++, b => `{radius} ${nf(a.range, 1)} → ${nf(b.range, 1)} m`);
        mk('pan_eat', x => x.lvDmg++, b => `{fegg} ${nf(a.eat, 1)} → ${nf(b.eat, 1)} s`);
        continue;
      }
      mk(id + '_dmg', x => x.lvDmg++, b => id === 'chili' ? `{dmg} ${nf(a.dmg, 1)} → ${nf(b.dmg, 1)} · {fire} ${nf(this.cfg.skills.chili.burnDamage * a.dmgPct, 1)} → ${nf(this.cfg.skills.chili.burnDamage * b.dmgPct, 1)}` : `{dmg} ${nf(a.dmg, 1)} → ${nf(b.dmg, 1)}`);
      mk(id + '_rng', x => x.lvRange++, b => id === 'cab' ? `{radius} ${nf(a.range * 100)} → ${nf(b.range * 100)} cm` : id === 'lemon' ? `{radius} ${nf(a.ballR * 200)} → ${nf(b.ballR * 200)} cm` : `{range} ${nf(a.range, 1)} → ${nf(b.range, 1)} m`);
      if (id !== 'chili' && id !== 'wheat') mk(id + '_cd', x => x.lvCd++, b => `{cd} ${nf(a.cd, 2)} → ${nf(b.cd, 2)} s`); // flamethrower: fixed 8 chilis/s; Körner-MP: fixed 10 grains/s
      if (id === 'wheat' && (s.durLv ?? 0) < (U.wheatDuration?.maxLevel || 5)) mk('wheat_dur', x => x.durLv = (x.durLv ?? 0) + 1, b => `{heat} ${nf(a.dur, 1)} → ${nf(b.dur, 1)} s`);
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
        // [[...]] = golden increase on the card
        if (s.pierce < PIERCE_ALL) mk('asp_pierce', x => this.pierceUp(x), b => `{pierce} ${a.pierce} → ${b.pierce >= PIERCE_ALL ? 'alle' : b.pierce}`);
        if (s.pierceBonus < (U.aspPierceBonus.maxLevel || 5)) { const b = this.stats('asp', { ...s, pierceBonus: s.pierceBonus + 1 }); pool.push({ key: 'asp_pb', cat: 'skill', w: 1, pic: 'skill_asp', title: N.skills.asp, lines: ['Piercing Damage', `{pierce} ${nf(a.pf * 100)} % [[+${nf((b.pf - a.pf) * 100)} %]]`] }); }
        if (s.salvoLv < U.aspSalvo.shots.length) mk('asp_salvo', x => x.salvoLv++, b => `{pellet} ${a.shots} → ${b.shots}`);
        if (s.sizeLv < (U.aspSize.maxLevel || 4)) mk('asp_size', x => x.sizeLv++, b => `{size} ${nf(a.size * 100)} % [[+${nf((b.size - a.size) * 100)} %]]`);
      }
      if (isGun(id)) {
        if (s.extraPel < (U.cranPellets.maxLevel || 5)) mk(id + '_pel', x => x.extraPel++, b => `{pellet} ${a.pellets} [[+${b.pellets - a.pellets}]]`);
        if (s.cranPierceLv < (U.cranPierce.maxLevel || 5) && a.cranPierce < 1) mk(id + '_pierce', x => x.cranPierceLv++, b => `{pierce} ${nf(a.cranPierce * 100)} % [[+${nf((b.cranPierce - a.cranPierce) * 100)} %]]`);
        if (id === 'cran' && s.mineLv < (U.cranSplash.maxLevel || 5) && a.splash < 1) mk('cran_mine', x => x.mineLv++, b => `{mine} ${nf(a.splash * 100)} % [[+${nf((b.splash - a.splash) * 100)} %]]`);
      }
      if (id === 'lemon') {
        if (s.tgtLv < (U.lemonTargets.maxLevel || 5)) mk('lemon_tgt', x => x.tgtLv++, b => `{chain} ${a.chains} [[+${b.chains - a.chains}]]`);
        if (s.xferLv < (U.lemonTransfer.maxLevel || 5) && a.chainReturn < 1) { const b = this.stats('lemon', { ...s, xferLv: s.xferLv + 1 }); pool.push({ key: 'lemon_xfer', cat: 'skill', w: 1, pic: 'skill_lemon', title: N.skills.lemon, lines: ['Rückblitz', `{chain} ${nf(a.chainReturn * 100)} % [[+${nf((b.chainReturn - a.chainReturn) * 100)} %]]`] }); }
        if (s.effLv < (U.lemonEfficiency.maxLevel || 5) && a.chainDmg < 1) { const b = this.stats('lemon', { ...s, effLv: s.effLv + 1 }); pool.push({ key: 'lemon_eff', cat: 'skill', w: 1, pic: 'skill_lemon', title: N.skills.lemon, lines: ['Schadenseffizienz', `{chain} ${nf(a.chainDmg * 100)} % [[+${nf((b.chainDmg - a.chainDmg) * 100)} %]]`] }); }
      }
      if (id === 'cab' && s.minis < (U.cabMini.maxLevel || 5)) mk('cab_mini', x => x.minis += U.cabMini.step, b => `{mini} ${a.minis} → ${b.minis}`);
      if (id === 'cab' && s.gasLv < (U.cabGas.maxLevel || 5)) { const b = this.stats('cab', { ...s, gasLv: s.gasLv + 1 }); pool.push({ key: 'cab_gas', cat: 'skill', w: 1, pic: 'skill_cab', title: N.skills.cab, lines: ['Kohlgas', `{poison} ${nf(a.gas * 100)} % [[+${nf((b.gas - a.gas) * 100)} %]]`] }); }
      if (id === 'cab' && s.poisLv < (U.cabPoison.maxLevel || 5)) { const b = this.stats('cab', { ...s, poisLv: s.poisLv + 1 }); pool.push({ key: 'cab_pois', cat: 'skill', w: 1, pic: 'skill_cab', title: N.skills.cab, lines: ['Poison Damage', `{poison} ${nf(a.poisonMul * 100)} % [[+${nf((b.poisonMul - a.poisonMul) * 100)} %]]`] }); }
    }
    // starting weapon (rake) upgrades: always available, no limit
    { const RL = p.rakeLv, RS = this.rakeStats(p), mkR = (key: string, line: string) => pool.push({ key, cat: 'skill', w: p.slots.some(id => p.skills[id as SkillId]?.learned) ? (U.rakeWeight ?? 1) : 1, pic: 'skill_rake', title: N.skills.rake, lines: [line] });
      const nx = { ...p, rakeLv: { ...RL } } as Player;
      nx.rakeLv = { ...RL, dia: RL.dia + 1 }; mkR('rake_dia', `{radius} ${nf(RS.dia * 100)} → ${nf(this.rakeStats(nx).dia * 100)} cm`);
      nx.rakeLv = { ...RL, rng: RL.rng + 1 }; mkR('rake_rng', `{range} ${nf(RS.range * 100)} → ${nf(this.rakeStats(nx).range * 100)} cm`);
      nx.rakeLv = { ...RL, dmg: RL.dmg + 1 }; mkR('rake_dmg', `{dmg} ${nf(RS.dmg, 1)} → ${nf(this.rakeStats(nx).dmg, 1)}`);
      nx.rakeLv = { ...RL, cd: RL.cd + 1 }; if (U.rakeSpeed) mkR('rake_cd', `{cd} ${nf(RS.cd, 2)} → ${nf(this.rakeStats(nx).cd, 2)} s`); }
    for (const o of pool) o.w *= 1 + U.repeatWeight * (p.taken[o.key] || 0);
    void first; void second; void PL;
    return { normal: pool, golden: [...prio, ...learn.map(({ w, ...o }) => { void w; return o; })] };
  }
  // ---------- Werkstatt (23.11.2026) ----------
  /** the bench of one pause: werkstatt.slots normal ideas (weapon upgrades, cost 1) + one golden idea (cost 2):
   *  unlock the well, learn a weapon (Mehlsack once a mill stands), else a double upgrade ("Meisterstück") */
  genShop(p: Player) {
    const WS = this.cfg.werkstatt; if (!WS) { p.shop = null; return; }
    const N = this.cfg.names, H = WS.names || {}, { normal, golden } = this.upgradePool(p), out: Offer[] = [];
    const draw = (from: (Offer & { w: number })[]): Offer | null => {
      if (!from.length) return null;
      const tot = from.reduce((a, o) => a + o.w, 0); let r = Math.random() * tot, k = 0;
      for (; k < from.length - 1; k++) { r -= from[k].w; if (r <= 0) break; }
      const { w, ...o } = from.splice(k, 1)[0]; void w; return o;
    };
    const head = (key: string) => { const [a, b] = key.split('_'); return a === 'learn' ? H.learn ?? '' : H[b] ?? H[a] ?? ''; };
    // 24.11.2026 (Basti): the bench holds only upgrades of weapons the player already has (cost 1); at most ONE weapon,
    // always on the golden spot (cost 2). First Werkstatt (Level 5): that weapon is Flammenwerfer or Kohlmine (firstLearn).
    for (let k = 0; k < WS.slots; k++) { const o = draw(normal); if (!o) break; out.push({ ...o, hd: head(o.key), cost: WS.cost }); }
    const pickOne = <T,>(a: T[]) => a.length ? a[Math.floor(Math.random() * a.length)] : null;
    const first = this.shopTier <= 1 ? golden.filter(o => (WS.firstLearn ?? []).some(id => o.key === 'learn_' + id)) : [];
    const gold: Offer[] = [];
    if (!first.length && WS.golden.includes('well') && !this.wellOpen && this.cfg.buildings.well?.cropBonus) {
      const B = this.cfg.buildings.well.cropBonus!;
      gold.push({ key: 'gold_well', cat: 'field', pic: 'field_well', title: N.fields.well ?? 'Brunnen', hd: H.well ?? '', lines: [`{sprout} +${Math.round(B[0] * 100)} %`, B.map(b => Math.round(b * 100)).join(' · ') + ' %'] });
    }
    if (WS.golden.includes('learn')) for (const o of (first.length ? first : golden)) gold.push({ ...o, hd: head(o.key) });
    let g: Offer | null = pickOne(gold);
    if (g) g = { ...g, hd: head(g.key) || g.hd };
    if (!g) { const o = draw(normal); if (o) g = { ...o, key: 'x2_' + o.key, hd: H.x2 ?? '', x2: 1 }; }
    if (g) out.push({ ...g, cost: WS.goldenCost, gold: 1 });
    p.shop = out;
  }
  /** buy idea i of the bench (only while the Werkstatt is open) */
  buy(id: number, i: number) {
    const p = this.player(id); if (!p || !p.shopOpen || !p.shop) return;
    const o = p.shop[i], cost = o?.cost ?? 1; if (!o || o.sold || p.ideas < cost) return;
    p.ideas -= cost; o.sold = 1; p.taken[o.key] = (p.taken[o.key] || 0) + 1;
    if (o.key === 'gold_well') this.wellOpen = true;
    else if (o.key.startsWith('x2_')) { this.applyOffer(p, o.key.slice(3)); this.applyOffer(p, o.key.slice(3)); }
    else this.applyOffer(p, o.key);
    this.emit({ k: 'buy', p: p.id, i, g: o.gold ? 1 : 0 });
  }
  /** close the Werkstatt (until the next werkstatt.everyLevels levels) */
  closeShop(id: number) { const p = this.player(id); if (!p || !p.shopOpen) return; p.shopOpen = false; p.shopWant = false; p.shopLock = true; this.emit({ k: 'shopClose', p: p.id }); }
  /** everyone (alive) at the bench: the world stands still like during a level-up */
  get shopPause() { return !this.sb && this.players.some(p => p.shopOpen) && this.players.every(p => p.shopOpen || !p.alive); }
  /** shop tiers already opened (one every werkstatt.everyLevels levels) */
  shopTier = 0;
  /** 23.11.2026: every werkstatt.everyLevels levels the Werkstatt opens by itself for everyone (after the level-up card) */
  private tickShop(dt: number) {
    const WS = this.cfg.werkstatt; if (!WS || this.sb) return;
    const tier = Math.floor(this.level / Math.max(1, WS.everyLevels ?? 5));
    if (tier > this.shopTier && this.phase === 'play' && !this.won) {
      this.shopTier = tier;
      for (const p of this.players) { this.genShop(p); p.shopDelay = WS.openDelay; p.shopWant = true; p.shopLock = false; }
    }
    for (const p of this.players) {
      p.shopDelay = Math.max(0, p.shopDelay - dt);
      if (this.phase !== 'play' || this.won) { if (p.shopOpen) { p.shopOpen = false; p.shopWant = true; } continue; }
      if (p.shopWant && !p.shopOpen && p.alive && p.shopDelay <= 0 && p.shop) { p.shopOpen = true; this.emit({ k: 'shopOpen', p: p.id }); }
    }
  }
  /** level-up (23.11.2026): three hex fields out of the field pool (chosen start field + fieldPool.types; well once unlocked).
   *  Only types that can be built somewhere right now (free slot or a tile of that type below level 3, chain rules) */
  private drawOffers(p: Player): Offer[] {
    const FP = this.cfg.fieldPool, N = this.cfg.names, W = FP?.weights || {};
    const types: FruitType[] = [...this.startTypes, ...(FP?.types || []), ...(FP?.weaponTypes || []).filter(t => p.skills[t as SkillId]?.learned)].filter((t, i, a) => a.indexOf(t) === i && (t !== 'well' || this.wellOpen));
    const pool = types.filter(t => this.placeSlots(t).length > 0).map(t => ({ t, w: (this.startTypes.has(t) ? W.start : W[t]) ?? 1 }));
    const out: Offer[] = [], n = FP?.offers ?? 3;
    while (out.length < n && pool.length) {
      const tot = pool.reduce((a, o) => a + o.w, 0); let r = Math.random() * tot, k = 0;
      for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
      const { t } = pool.splice(k, 1)[0];
      out.push({ key: 'tile_' + t, cat: 'field', pic: 'field_' + t, title: N.fields[t] ?? t, lines: [] });
    }
    const T = this.cfg.upgrades.herbalTea;
    while (out.length < n) out.push({ key: 'tea_' + out.length, cat: 'misc', pic: 'tea', title: N.tea, lines: [`{heart} +${T.playerHeal} · {fieldhp} +${T.fieldHeal}`] });
    void p;
    return out;
  }
  /** level-up cards of a combo weapon: damage / range / cooldown of the combo + the special upgrades it keeps */
  private comboCards(p: Player, id: SkillId, s: SkillState, pool: (Offer & { w: number })[], nf: (n: number, d?: number) => string) {
    const cid = s.combo as ComboId, C = this.CB.list[cid], U = this.cfg.upgrades, title = this.cfg.names.combos?.[cid] ?? cid, a = this.comboStats(s);
    const icon: [keyof ComboStats, string, number, string][] = [['dmg', '{dmg}', 1, ''], ['spikeDmg', '{dmg}', 1, ''], ['berryDmg', '{dmg}', 1, ''], ['count', '{pellet}', 0, ''], ['shots', '{pellet}', 0, ''], ['pierce', '{pierce}', 0, ''], ['pf', '{pierce}', 0, ' %'],
      ['radius', '{radius}', 1, ' m'], ['width', '{size}', 0, ' cm'], ['links', '{chain}', 0, ''], ['linkRange', '{chain}', 1, ' m'], ['shock', '{chain}', 0, ' %'], ['shockR', '{radius}', 0, ' cm'], ['minis', '{mini}', 0, ''], ['tick', '{fire} {cd}', 2, ' s'], ['shockTick', '{chain} {cd}', 2, ' s'], ['range', '{range}', 1, ' m'], ['cd', '{cd}', 2, ' s']];
    const show = (k: keyof ComboStats, v: number): number | string => k === 'pierce' && v >= PIERCE_ALL ? 'alle' : k === 'pf' || k === 'shock' ? v * 100 : k === 'width' || k === 'shockR' ? v * 100 : v;
    const card = (key: string, mut: (m: SkillState, u: SkillState) => void) => {
      const fmt = (v: number | string) => typeof v === 'string' ? v : nf(v, d);
      const m2 = { ...s }, u2 = { ...s.partner! }; m2.partner = u2; mut(m2, u2); const b = this.comboStats(m2);
      const diff = icon.find(([k]) => Math.abs((b[k] as number) - (a[k] as number)) > 1e-6); if (!diff) return;
      const [k, ic, d, unit] = diff;
      pool.push({ key, cat: 'skill', w: 1, pic: 'combo_' + cid, title, lines: [`${ic} ${fmt(show(k, a[k] as number))} → ${fmt(show(k, b[k] as number))}${unit}`] });
    };
    card(id + '_dmg', m => m.lvDmg++);
    card(id + '_rng', m => m.lvRange++);
    card(id + '_cd', m => m.lvCd++);
    const lim: Record<string, [string, number]> = { asp_pierce: ['pierce', PIERCE_ALL], asp_pb: ['pierceBonus', U.aspPierceBonus.maxLevel || 5], asp_size: ['sizeLv', U.aspSize.maxLevel || 4], cran_pel: ['extraPel', U.cranPellets.maxLevel || 5], cran_mine: ['mineLv', U.cranSplash.maxLevel || 5],
      cab_mini: ['minis', U.cabMini.maxLevel || 5], lemon_tgt: ['tgtLv', U.lemonTargets.maxLevel || 5], lemon_xfer: ['xferLv', U.lemonTransfer.maxLevel || 5], chili_sweep: ['sweepLv', 8], chili_tick: ['tickLv', 8] };
    for (const key of C.keep || []) {
      const [sk] = key.split('_') as [SkillId], L = lim[key]; if (!L) continue;
      const st = sk === C.main ? s : s.partner!; if ((st as any)[L[0]] >= L[1]) continue;
      card(key, (m, u) => { const t: any = sk === C.main ? m : u; if (key === 'asp_pierce') this.pierceUp(t); else t[L[0]] += key === 'cab_mini' ? U.cabMini.step : 1; });
    }
  }
  applyOffer(p: Player, key: string) {
    const U = this.cfg.upgrades;
    const [a, b] = key.split('_') as [string, string];
    const tea = () => { p.hp = Math.min(this.cfg.player.hp, p.hp + U.herbalTea.playerHeal); this.fields.forEach(f => f.alive && (f.hp = Math.min(f.maxHp, f.hp + U.herbalTea.fieldHeal))); };
    if (a === 'learn') { this.learn(p, b as SkillId); return; }
    if (a === 'combo') { this.mergeCombo(p, b as ComboId); return; }
    if (a === 'tile') { p.placing = b as FruitType; p.placeMode = 'any'; if (!this.placeSlots(p.placing).length) { p.placing = null; tea(); } return; }
    if (a === 'field' || a === 'new') { p.placing = b as FruitType; p.placeMode = 'new'; return; }
    if (a === 'up') { p.placing = b as FruitType; p.placeMode = 'stack'; return; }
    if (a === 'yield') { if (this.yieldLv[b as FruitType] < (U.doubleHarvest.maxLevel || 6)) this.yieldLv[b as FruitType]++; else tea(); return; }
    if (a === 'tea') { tea(); return; }
    if (a === 'rake') { if (b === 'rng') p.rakeLv.rng++; else if (b === 'dmg') p.rakeLv.dmg++; else if (b === 'dia') p.rakeLv.dia++; else if (b === 'cd') p.rakeLv.cd++; return; }
    if (a === 'care') { this.tillHealLv++; return; }
    const s = p.skills[a as SkillId];
    switch (key) {
      case 'asp_dmg': case 'cran_dmg': case 'cab_dmg': case 'lemon_dmg': case 'blue_dmg': s.lvDmg++; break;
      case 'asp_rng': case 'cran_rng': case 'cab_rng': case 'lemon_rng': case 'blue_rng': s.lvRange++; break;
      case 'asp_cd': case 'cran_cd': case 'cab_cd': case 'lemon_cd': case 'blue_cd': s.lvCd++; break;
      case 'blue_pel': s.extraPel++; break;
      case 'blue_pierce': s.cranPierceLv++; break;
      case 'flour_dmg': s.lvDmg++; break;
      case 'flour_rng': s.lvRange++; break;
      case 'flour_cd': s.lvCd++; break;
      case 'pan_cd': s.lvCd++; break;
      case 'pan_rng': s.lvRange++; break;
      case 'pan_eat': s.lvDmg++; break;
      case 'lemon_tgt': s.tgtLv++; break;
      case 'lemon_xfer': s.xferLv++; break;
      case 'lemon_eff': s.effLv++; break;
      case 'chili_dmg': s.lvDmg++; break;
      case 'chili_rng': s.lvRange++; break;
      case 'chili_cd': s.lvCd++; break;
      case 'chili_sweep': s.sweepLv++; break;
      case 'chili_tick': s.tickLv++; break;
      case 'asp_pierce': this.pierceUp(s); break;
      case 'asp_pb': s.pierceBonus++; break;
      case 'asp_size': s.sizeLv++; break;
      case 'asp_salvo': s.salvoLv++; break;
      case 'cran_pel': s.extraPel++; break;
      case 'cran_pierce': s.cranPierceLv++; break;
      case 'cran_mine': s.mineLv++; break;
      case 'cab_mini': s.minis += U.cabMini.step; break;
      case 'cab_gas': s.gasLv++; break;
      case 'cab_pois': s.poisLv++; break;
    }
  }

  // ---------- snapshot ----------
  snapshot(): Snap {
    const ev = this.events; this.events = [];
    const me: Record<number, Priv> = {};
    for (const p of this.players) {
      const st = SKILLS.map(id => this.stats(id, p.skills[id]));
      me[p.id] = {
        am: SKILLS.map(id => Math.floor(p.ammo[id] + 1e-6)), ln: SKILLS.map(id => p.skills[id].learned ? 1 : 0),
        nd: st.map(s => s.need), co: st.map(s => s.cost), rg: st.map(s => r2(s.range)), cs: st.map(s => r2(s.cd / s.shots)), cd: SKILLS.map((id, i) => r2(p.skills[id].cdT / st[i].cd)),
        ac: WEAPONS.indexOf(p.active), sl: p.slots.map(w => SKILLS.indexOf(w)), rk: r2(Math.max(0, p.rakeCd / this.rakeStats(p).cd)), rr: r2(this.rakeStats(p).range),
        of: p.offers, pk: p.picked ? 1 : 0, pc: p.placing ? FRUITS.indexOf(p.placing) : -1, pm: p.placeMode === 'any' ? 2 : p.placeMode === 'stack' ? 1 : 0, iv: FRUITS.map(t => Math.floor(p.inv[t] || 0)), nu: p.nuts,
        id: p.ideas, sh: p.shop, so: p.shopOpen ? 1 : 0, ps: p.placing && p.placeMode === 'any' ? this.placeSlots(p.placing) : undefined,
        cb: SKILLS.map(id => p.skills[id].combo ? COMBOS.indexOf(p.skills[id].combo as ComboId) : -1),
      };
    }
    return {
      ch: this.chestOn ? this.enemies.filter(e => !e.dead && e.cs >= 0 && !e.fleeing && Math.hypot(e.x - this.thiefPos(e.cs)[0], e.z - this.thiefPos(e.cs)[1]) < .2).length : undefined,
      t: r2(this.time), ph: this.phase, ts: r2(this.ramp), wv: this.wave, wn: this.cfg.waves.total, dh: r2(this.dayHour()), dc: this.cycleLen(), wp: this.wavePause ? 1 : 0, wt: r2(Math.max(0, this.wavePause ? this.waveT : this.waveEndAt - this.time)), won: this.won ? 1 : 0, lr: this.lvRound, lv: this.level, xp: Math.floor(this.xp), nx: this.need(this.level), ki: this.kills, cx: this.collectedXP, n: this.n, wb: r2(this.wellBonus()), wo: this.wellOpen ? 1 : 0, jc: this.cfg.juice ? BERRIES.flatMap(b => [Math.round(this.juice[b].w / this.cfg.juice!.fill * 1000) / 1000, this.juice[b].lv]) : undefined,
      pl: this.players.map(p => ({
        id: p.id, c: p.color, be: BERRIES.indexOf(p.berry), x: r2(p.x), z: r2(p.z), f: r2(p.face), hp: Math.ceil(p.hp), mhp: this.cfg.player.hp, al: p.alive ? 1 : 0, st: p.stun > 0 ? 1 : 0,
        sw: p.swing > 0 ? r2(1 - p.swing / this.rakeTime(p)) : 0, sd: r2(p.swingDir), wk: r2(p.walk), rs: Math.ceil(p.respawnT), po: p.poison.length, fl: p.flash > 0 ? 1 : 0, ti: p.tillT > 0 ? r2(1 - p.tillT / (this.rakeTime(p) * 1.6)) : 0, rr: r2(this.rakeStats(p).range), ra: r2(this.rakeStats(p).dia),
        ...(() => { const fs = this.stats('chili', p.skills.chili); return { xb: (p.xbT > 0 || p.active === 'asp') && !p.skills.asp.combo ? 1 : 0, fo: p.flOn > 0 ? 1 : 0, fa: r2(p.flAng), fc: fs.cone, fw: fs.sweep, fr: r2(fs.range) } as const; })(),
        lw: this.equipped(p, 'lemon') && !p.skills.lemon.combo ? 1 : 0, aw: p.active === 'rake' || p.skills[p.active].combo ? 0 : WEAPONS.indexOf(p.active),
        ch: p.chW ? r2(this.chargeK(p)) : -1, // charging a throw
        ht: p.skills.wheat.heat ? r2(p.skills.wheat.heat) + (p.skills.wheat.hot ? 2 : 0) : undefined, // Körner-MP heat
        sp: p.spinT > 0 ? r2(1 - p.spinT / Math.max(.05, p.spinD)) : 0, sk: p.spinK === 'pan' ? 1 : 0, // Mehlsack / Bratpfanne spin progress 0..1
        // combo weapon in the hand: active weapon is a combo, or a combo fired just now
        cw: (() => { const ac = p.active !== 'rake' ? p.skills[p.active].combo : ''; const c = p.cwT > 0 && p.cwId ? p.cwId : ac; return c ? COMBOS.indexOf(c as ComboId) : -1; })(),
        // rake in the hand: active weapon is the rake and no other weapon fired just now, or a rake stroke is running
        rh: p.swing > 0 || (p.active === 'rake' && p.handT <= 0) ? 1 : 0,
      })),
      en: this.enemies.map(e => {
        let fl = 0, aux = 0, aux2 = 0;
        if (e.stun > 0) fl |= EF.stun; if (e.bleed > 0) fl |= EF.bleed; if (e.burn > 0) fl |= EF.burn; if (e.flash > 0) fl |= EF.flash;
        if (this.airborne(e)) fl |= EF.air; if (e.fleeing) fl |= EF.flee; if (e.lunge > 0) fl |= EF.lunge; if (e.leave > 0) { fl |= EF.leave; fl &= ~EF.flee; } if (e.elite) fl |= EF.elite;
        if (e.boss) { fl |= EF.boss; aux = e.boss.st === 'collect' ? 0 : e.boss.st === 'charge' ? 1 : 2; aux2 = e.boss.st === 'charge' ? r2(1 - e.boss.t / this.cfg.enemies.boss.chargeTime) : e.boss.atk; }
        if (e.hurtOnce || (e.shieldMax && e.shield < e.shieldMax)) fl |= EF.bar; if (e.shock > 0) fl |= EF.shock; if (e.pois > 0) fl |= EF.poison; if (e.frz > 0) fl |= EF.frozen; if (e.thorn > 0) fl |= EF.thorn;
        if (e.type === 'toad') { aux = r2(e.hop % 1); if (e.tongueT > 0) { fl |= EF.tongue; aux2 = r2(Math.sin(clamp(e.tongueT / .35, 0, 1) * Math.PI) * e.tongueLen); } }
        if (e.type === 'hedgehog') aux = r2(e.puff / (this.cfg.enemies.hedgehog.puffEvery || 2));
        if (e.type === 'squirrel') { aux = e.state === 'climb' ? 1 : 0; aux2 = r2(e.y); }
        if (e.type === 'sheep') { if (e.state === 'windup') { fl |= EF.windup; aux = r2(1 - e.st / this.cfg.enemies.sheep.windup!); aux2 = r2(Math.atan2(e.cdx, e.cdz)); } if (e.state === 'charge') fl |= EF.charge; }
        return [e.id, ENEMIES.indexOf(e.type), r2(e.x), r2(e.z), r2(e.face), r2(e.hp / e.maxHp), e.shieldMax ? r2(e.shield / e.shieldMax) : -1, fl, e.carry.map(f => FRUITS.indexOf(f.type)).join(','), aux, aux2] as ESnap;
      }),
      fr: this.fruits.filter(f => f.state !== 'carried').map(f => f.sk !== undefined ? (f.jb !== undefined ? [f.id, FRUITS.indexOf(f.type), f.tier, r2(f.x), r2(f.y), r2(f.z), 1, f.jb] : [f.id, FRUITS.indexOf(f.type), f.tier, r2(f.x), r2(f.y), r2(f.z), 1]) : [f.id, FRUITS.indexOf(f.type), f.tier, r2(f.x), r2(f.y), r2(f.z)]),
      eg: this.baits.filter(b => b.delay <= 0).map(b => [b.id, r2(b.x + (b.sx - b.x) * (1 - Math.min(1, b.t / b.fl))), r2(b.y), r2(b.z + (b.sz - b.z) * (1 - Math.min(1, b.t / b.fl))), b.t >= b.fl ? 1 : 0, r2(Math.max(0, b.left) / b.total), r2(b.out), r2(b.r), b.eaters]),
      pj: this.projs.map(p => [p.id, PK.indexOf(p.kind), r2(p.x), r2(p.y), r2(p.z), r2(Math.atan2(p.dx, p.dz)), r2(p.kind === 'asp' ? p.w / this.cfg.skills.asp.width : p.kind === 'ball' ? p.w / this.cfg.skills.lemon.ballRadius : p.kind === 'cran' ? 1 : p.kind === 'lance' || p.kind === 'rocket' ? p.w * 2 : p.w / .3)]),
      cl: this.clouds.map(c => [c.id, r2(c.x), r2(c.z), r2(c.r), r2(c.age), c.life, c.ign, r2(c.ix), r2(c.iz)]),
      bo: this.bombs.map(b => [b.id, r2(b.x), r2(b.y), r2(b.z), b.mini ? 1 : 0, b.t >= b.flight ? 1 : 0, BK.indexOf(b.kind), r2(clamp((b.t - b.flight) / Math.max(.01, b.fuse - b.flight), 0, 1)), b.gen, b.mine ? 1 : 0]),
      mi: this.mines.map(m => { const f = m.fl && m.fl > 0 && m.ft ? 1 - m.fl / m.ft : 1; const x = m.sx !== undefined && f < 1 ? m.sx + (m.x - m.sx) * f : m.x, z = m.sz !== undefined && f < 1 ? m.sz + (m.z - m.sz) * f : m.z;
        return [m.id, r2(x), r2(z), r2(clamp(1 - m.t / (m.r ? this.CB.list.cabboom.berryDelay : this.cfg.skills.cran.splashDelay), 0, 1)), f < 1 ? r2(.3 + Math.sin(f * Math.PI) * 1.1) : 0, m.fire ? 1 : 0] as MSnap; }),
      sn: this.snodes.map(n => [n.id, r2(n.x), r2(n.z), r2(n.ticks / n.tot)]),
      br: FRUITS.map(t => Math.round(this.baseRate(t) * 1000) / 1000),
      fi: this.fields.map(f => {
        const B = isBuilding(f.type) ? this.cfg.buildings[f.type] : null;
        const pr = B ? (B.interval ? 1 - f.t / B.interval : f.work > 0 ? 1 - f.work / (B.time ?? 1) : 0) : 1 - f.t / this.cfg.plants[f.type]!.interval;
        const fl = (f.broken ? 1 : 0) | (B && !f.broken && (B.interval || f.work > 0) ? 2 : 0);
        const st = B ? Object.entries(f.inb).filter(([, n]) => n! > 0).map(([k, n]) => FRUITS.indexOf(k as FruitType) + ':' + n).join(',') : '';
        return [f.slot, FRUITS.indexOf(f.type), r2(f.hp / f.maxHp), f.alive ? 1 : 0, r2(f.shake), f.rarity, f.prog, f.edge, r2(clamp(pr, 0, 1)), f.tilledT > 0 ? 1 : 0, Math.round(this.rate(f) * 1000) / 1000, fl, st, B || !this.cycle || this.isForest(f) ? 0 : r2(f.cyc === 0 ? Math.min(1, f.ct / (this.plantsPer * this.strokesOf(f.type))) : 1 + Math.min(1, f.ct / this.cycOf(f).grow))] as FiSnap;
      }),
      pu: this.pools.map(p => [p.id, r2(p.x), r2(p.z), r2(p.r), r2(Math.max(0, p.t / p.dur)), p.fire ? 1 : 0]),
      bb: this.berryBombs.map(b => { const fl = b.flight > 0 ? Math.min(1, b.t / b.flight) : 1, armed = b.t >= b.flight; const x = armed ? b.x : b.fx + (b.x - b.fx) * fl, z = armed ? b.z : b.fz + (b.z - b.fz) * fl, y = b.rain ? Math.max(0, 7 * (1 - b.t / b.fuse)) + .15 : armed ? .15 : .6 + Math.sin(fl * Math.PI) * 1.2; return [b.id, r2(x), r2(y), r2(z), armed ? 1 : 0, r2(armed ? (b.t - b.flight) / b.fuse : fl), b.rain ? 1 : 0, r2(b.r)]; }),
      bs: (() => { const b = this.enemies.find(e => e.boss); return b ? r2(b.hp / b.maxHp) : -1; })(),
      me, ev,
    };
  }
  slotPos() { return this.slots; }
}
