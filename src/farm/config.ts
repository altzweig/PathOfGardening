// Balancing of the farming game loop (19.11.2026). Read from "Game Design & Balancing/balancing.yaml" at every start.
import YAML from 'yaml';
import type { TexCfg } from '../view/textures';
import { World, loadWorld } from '../world/data';
import type { LanternCfg } from './view/lanterns';
import { applyLogic } from '../world/logic';

export type ItemId = string;
export type WeaponId = 'rake' | 'shotgun' | 'crossbow' | 'sling' | 'mace' | 'cannon';
export const WEAPON_IDS: WeaponId[] = ['shotgun', 'crossbow', 'sling', 'mace', 'cannon'];
export type BuildingId = 'house' | 'well' | 'shop' | 'mill' | 'bakery' | 'carpentry' | 'workshop' | 'dairy' | 'juicer' | 'silo' | 'chickens' | 'cows' | 'sheep';
export const BUILDING_IDS: BuildingId[] = ['well', 'mill', 'shop', 'juicer', 'bakery', 'carpentry', 'workshop', 'cows', 'sheep', 'dairy', 'chickens', 'silo'];
export type StallId = 'cows' | 'sheep' | 'chickens';
export const STALL_IDS: StallId[] = ['cows', 'sheep', 'chickens'];
export type Livestock = 'cow' | 'sheep' | 'goat' | 'chicken';
export type AnimalType = 'raccoon' | 'hare';
export type ActionKind = 'repair' | 'water' | 'sow' | 'weed' | 'fertilize' | 'harvestPlot' | 'harvestBush' | 'refill' | 'draw' | 'gather' | 'weedHof' | 'pickWild' | 'shake' | 'feed' | 'straw' | 'milk' | 'eggs' | 'produce';
/** handrake = kleine einhändige Handharke (Jäten, Notwaffe), 21.11.2026 */
export type Tool = 'can' | 'handrake' | 'seed' | 'hands' | 'sickle' | 'bucket';
export interface ActionCfg { time: number; label: string; repeat?: boolean }

/** Taler + goods */
export type Cost = { money?: number } & Record<string, number | undefined>;
export interface Recipe { in: Record<ItemId, number>; out: Record<ItemId, number> }
export interface BuildingCfg { built?: boolean; broken?: boolean; level?: number; cost?: Cost; needs?: BuildingId; recipes?: Recipe[]; action?: { label: string; time: number } }
export interface StallCfg { animals: Livestock[]; feed: ItemId; feedCost: number; maxFed: number; collect: 'milk' | 'eggs'; yield: Record<ItemId, number> }
export interface RectCfg { x: number; z: number; w?: number; d?: number; r?: number; rot?: number; fence?: boolean }
export interface GunCfg { available: boolean; level: number; ammo: ItemId[]; ammoPerShot?: number; cooldown?: number; pellets?: number; cone?: number; range?: number; speed?: number; damage?: number }
export interface AnimalCfg { hp: number; speed: number; fleeSpeed: number; radius: number; scare: number; xp: number; run?: number; away?: number;
  stealInterval?: number; carryMax?: number; shy?: number; aggro?: number; damage?: number; biteInterval?: number; biteRange?: number;
  eatInterval?: number; plotBites?: number }
/** a field crop (annual): level = sowable from, grow = s after watering, cuts = harvest passes, yield = per pass */
export type Rarity = 'Common' | 'Uncommon' | 'Rare';
export interface CropCfg { /** shown over the field (21.11.2026) */ name?: string; rarity: Rarity; grow: number; cuts: number; yield: Record<ItemId, number> }
/** a section of the storage page in the house book (balancing.yaml storage.sections) */
export interface StoreSection { id: string; title: string; items: ItemId[] }
export interface HarvestXpCfg { pause: number; sow: number; water: number; cut: number; workWeight: number; div: number; rarity: Record<Rarity, number>; other: Record<ItemId, { rarity: Rarity; water?: boolean }> }
/** Wildkräuter (Basti 21.11.2026): roll 1 = 1 weed (green) or, with `pair`, 2 equal random herbs; then `rolls` more, each `chance` per herb */
export interface HerbsCfg { kinds: ItemId[]; pair: number; rolls: number; chance: number; xpPicks: number }
/** what one weeding of a wild herb tuft yields */
export function rollHerbs(H: HerbsCfg | undefined, r: () => number = Math.random): Record<ItemId, number> {
  const out: Record<ItemId, number> = {}, add = (k: ItemId, n = 1) => { out[k] = (out[k] ?? 0) + n; };
  if (!H?.kinds.length) { add('green'); return out; }
  if (r() < H.pair) add(H.kinds[Math.floor(r() * H.kinds.length)], 2); else add('green');
  for (let i = 0; i < H.rolls; i++) { const x = r(); const j = Math.floor(x / H.chance); if (j < H.kinds.length) add(H.kinds[j]); }
  return out;
}
/** perennial wild harvest (trees, brambles): ripe every `every` days, `picks` passes with `shake`/`pick` pieces */
export interface PerennialCfg { every: number; picks: number; shake: number }
export type TreeKind = 'apple' | 'nut';
/** night attack after every day (Basti 21.11.2026): waves of aggressive hares (eat the fields) and raccoons (rob the player) */
export interface NightWave { at: number; hare?: number; raccoon?: number }
export interface NightCfg {
  length: number; dusk: number; warn: number; light: [number, number]; flee: number;
  waves: NightWave[]; grow: number; max: { base: number; perLevel: number };
  hare: { hp: number; speed: number; biteInterval: number; plotDamage: number; xp: number };
  raccoon: { hp: number; speed: number; damage: number; biteInterval: number; steal: number; bites: number; xp: number };
  plotHp: number; brokenShow: number;
}
/** slots: open orders per day (Basti 22.11.2026): from `level` (default 1) `start` slots, +1 at level `first` and every `every` levels after it, at most max */
export interface SlotCfg { level?: number; start: number; first: number; every: number; max: number }
export interface DailyQuestCfg { slots: SlotCfg; load: number; cycle: number; objectives: number[]; blue: { max: number; min: number; sec: number }; daysPerLevel: number; xpShare?: number; money: number; moneyLevel: number; minMoney: number }

/** farm shop: sale slots, price per piece = field seconds x rate (products: ingredients x craft, others: prices), demand per slot and day */
export interface ShopCfg { slots: SlotCfg; rate: number; craft: number; demand: number; spread: number; sale: { price: number; demand: number }; premium: { price: number; demand: number }; prices: Record<ItemId, number>; base: number }
export interface FarmCfg {
  names: { items: Record<ItemId, string>; weapons: Record<WeaponId, string>; buildings: Record<BuildingId | 'plot', string>; animals: Record<AnimalType, string>; livestock: Record<Livestock, string> };
  day: { length: number; clock: [number, number]; light: [number, number]; fade: number; rain: { chance: number; duration: [number, number] } };
  player: { hp: number; speed: number; radius: number; reach: number; kneel: number; leave: number; actionSpeed: number; crouchSpeed: number; actionGap?: number; turnWithCam?: number; hover: number; /** interaction zone m from the edge / of small things (forage, weeds) from their middle */ zone?: number; zoneSmall?: number; pickupRadius: number; magnetRadius: number; magnetSpeed: number; hurtStun: number };
  actions: Record<Exclude<ActionKind, 'produce'>, ActionCfg>;
  can: { capacity: number; start: number; perFill: number };
  bush: { ripen: number; picks: number; berries: number; radius: number; barDelay: number; almostAt: number };
  crops: Record<string, CropCfg>;
  harvestXp: HarvestXpCfg;
  plots: { size: number; /** m from the middle: interaction zone of a field (overlaps the neighbours a little) */ zone?: number; /** field info (bar, time, name) only close by: m full / m gone / s fade */ info?: { near: number; far: number; fade: number }; sprout: number; clear: number; fertBonus: number; weeds: { max: number; morning: number[]; slow: number[] }; };
  wild: { weeds: { start: number; max: number; every: [number, number] }; /** wild herbs: weeds, wild garlic, dandelion, sorrel in one tuft (the yard weeds) */ herbs?: HerbsCfg; forage: { start: number; max: number; every: [number, number]; band: [number, number]; items: Record<ItemId, number>; plants?: Record<ItemId, { spawn: number; picks: number }>; where?: Record<ItemId, ('edge' | 'wet' | 'grass')[]> };
    brambles: { count: number; every: number; picks: number; pick: number }; trees?: TreeKind[]; apples: PerennialCfg; nuts?: PerennialCfg; barrel: number };
  /** wild grass patches (view + where weeds grow): perM2 = blades per m² at full density, well/back = size factors, edge = patches along the forest edge */
  grass?: { perM2: number; well: number; back: number; edge: number };
  stalls: { strawBonus: number; strawCost: number } & Record<StallId, StallCfg>;
  camera: { rotate: number; /** PC mouse turn factor (x rotate per px) */ mouse?: number; /** phone: how fast the camera swings behind the walking direction (1/s) */ follow?: number; /** see-through spot around the farmer: m at the farmer, x pc / x mobile */ occlusion?: { inner: number; outer: number; pc?: number; mobile?: number }; pitch: [number, number];
    /** 22.11.2026: third person near..far m, top = top-down height, push / back = wheel units against a detent (into / out of fp/td) */ zoom?: { near: number; far: number; top: number; topMax?: number; push: number; back: number } };
  storage: { capacity: number; sections?: StoreSection[]; rarity?: Record<ItemId, Rarity>; perennials?: Record<ItemId, { every: number; picks: number; pick: number }>; history?: number };
  saves: { autosave: number; nameMax: number };
  start: { money: number; items: Record<ItemId, number>; plots: string[] };
  weapons: { rake: { damage: number; range: number; arc: number; cooldown: number; swing: number; knockback: number; stun: number } } & Record<Exclude<WeaponId, 'rake'>, GunCfg>;
  ammo: Record<ItemId, { damage: number; freeze?: number }>;
  animals: Record<AnimalType, AnimalCfg>;
  spawns: { wanderers: [number, number]; wanderTypes: Partial<Record<AnimalType, number>>; raid: { from: number; to: number; raccoons: number; perLevel: number }; scaling: { hp: number; damage: number; speed: number } };
  /** 0 HP: the worst case of the night (Basti 21.11.2026): the harvest of the day is gone, every field is broken */
  faint: { loseHarvest: boolean; breakFields: boolean };
  night: NightCfg;
  /** co-op visits (Basti 22.11.2026): guests help on the farm, the yield goes to the farm, XP to whoever does the work */
  coop?: { maxPlayers: number; koTime: number; hostShare: number; nightCountExp: number; messages?: string[] };
  levels: { xp: number[]; unlocks: Record<number, BuildingId[]> };
  quests: { daily: DailyQuestCfg; titles: { one: string[]; many: string[] } };
  /** farm shop in the house book (Basti 22.11.2026) */
  shop: ShopCfg;
  buildings: Record<BuildingId, BuildingCfg>;
  loading: { minTime: number; tipEvery: number; fade: number; tips: string[] };
  tutorial: { raccoonHp: number; raccoonSteal: number; raccoonSpeed: number; raccoonStart: number; fieldHint: number; texts: Record<string, string> };
  /** texture concept (20.11.2026): tile sizes, blend sharpness etc. (src/view/textures.ts) */
  texturen?: TexCfg;
  hof: { clearing: { rx: number; rz: number }; gaps: number[]; gapWidth: number; door: { x: number; z: number }; basket: { x: number; z: number }; bush: { x: number; z: number };
    buildings: Record<BuildingId, RectCfg>; plots: { x: number; z: number }[]; trees: { x: number; z: number }[] };
  /** world editor (welt.html): placed objects + painted ground from public/world/welt.json; null = generated as before */
  world?: World | null;
  /** night lanterns (yard tree + entrances) and the night bloom, see lanterns.ts */
  laternen?: Partial<LanternCfg> & { baum?: Partial<LanternCfg['baum']> };
  nachtlicht?: { bloom: [number, number]; fenster: number; hauslampe?: number };
}

export async function loadFarmCfg(o: { world?: boolean } = {}): Promise<FarmCfg> {
  const res = await fetch('./design/balancing.yaml', { cache: 'no-store' });
  if (!res.ok) throw new Error('balancing.yaml: HTTP ' + res.status);
  const cfg = YAML.parse(await res.text()) as FarmCfg;
  if (o.world === false) return cfg;
  cfg.world = await loadWorld();
  // performance plan 2.1: objects that are never seen in play (tools/perf/hidden.cjs) are left out; the world editor shows all
  if (cfg.world?.props) try {
    const r = await fetch('./world/hidden.json'), h = r.ok ? await r.json() as { props?: { m: string; x: number; z: number }[] } : null;
    const hid = h?.props ?? [];
    if (hid.length) cfg.world.props = cfg.world.props.filter(p => !hid.some(q => q.m === p.m && Math.abs(q.x - p.x) < .006 && Math.abs(q.z - p.z) < .006));
  } catch { /* no list: show everything */ }
  // a world from the editor with its own logic replaces the farm layout (hof:) of the yaml
  if (cfg.world?.logic) applyLogic(cfg, cfg.world.logic);
  return cfg;
}
export async function loadSounds(): Promise<any> {
  try { const res = await fetch('./design/sounds.yaml', { cache: 'no-store' }); return res.ok ? YAML.parse(await res.text()) : null; } catch { return null; }
}

/** level for an XP total (1-based) */
export function levelFor(cfg: FarmCfg, xp: number) { let l = 1; cfg.levels.xp.forEach((need, i) => { if (xp >= need) l = i + 1; }); return l; }
/** XP needed for the level after `level` (null = max) */
export function nextLevelXp(cfg: FarmCfg, level: number): number | null { return cfg.levels.xp[level] ?? null; }
/** hof rotation (deg clockwise seen from above, z down) -> three.js rotation.y */
export const rotY = (deg = 0) => -deg * Math.PI / 180;
/** crops that can be sown on a level, in the order of the yaml */
/** field crops of one rarity (21.11.2026: only commons can be planted for now) */
export const cropsOf = (cfg: FarmCfg, r: Rarity = 'Common') => Object.keys(cfg.crops).filter(id => cfg.crops[id].rarity === r);
/** XP per harvest pass (Basti 21.11.2026): rarity x (field time + workWeight x work time) / div, rounded to whole XP per pass */
function passXp(X: HarvestXpCfg, rarity: Rarity, field: number, work: number, cuts: number) {
  return Math.max(1, Math.round((X.rarity[rarity] ?? 1) * (field + X.workWeight * work) / X.div / Math.max(1, cuts)));
}
export const cropXp = (cfg: FarmCfg, id: string) => {
  const X = cfg.harvestXp, C = cfg.crops[id]; if (!C || !X) return 0;
  return passXp(X, C.rarity, C.grow + X.pause, X.sow + X.water + C.cuts * X.cut, C.cuts);
};
/** harvests without a field (bush, trees, brambles, wild plants): field time = pause only */
export const otherXp = (cfg: FarmCfg, item: ItemId, cuts: number) => {
  const X = cfg.harvestXp, O = X?.other[item]; if (!O) return 0;
  return passXp(X, O.rarity, X.pause, (O.water ? X.water : 0) + cuts * X.cut, cuts);
};
/** kind of the i-th farm tree (wild.trees repeats) */
export const treeKind = (cfg: FarmCfg, i: number): TreeKind => { const t = cfg.wild.trees?.length ? cfg.wild.trees : ['apple' as TreeKind]; return t[i % t.length]; };
export const treeCfg = (cfg: FarmCfg, i: number): PerennialCfg => treeKind(cfg, i) === 'nut' ? (cfg.wild.nuts ?? cfg.wild.apples) : cfg.wild.apples;

/** the animals of one night: waves of night 1 from the yaml, every further night `grow` more per wave (raccoon, hare, raccoon ...),
 *  but never more than max.base + max.perLevel x (level - 1) in the whole night, so a low level never gets too hard */
export function nightPlan(cfg: FarmCfg, night: number, level: number): { at: number; hare: number; raccoon: number }[] {
  const N = cfg.night, extra = Math.max(0, Math.round(N.grow * (Math.max(1, night) - 1)));
  const waves = N.waves.map(w => ({ at: w.at, hare: (w.hare ?? 0) + Math.floor(extra / 2), raccoon: (w.raccoon ?? 0) + Math.ceil(extra / 2) }));
  const cap = Math.max(waves.length, N.max.base + N.max.perLevel * Math.max(0, level - 1));
  let total = waves.reduce((n, w) => n + w.hare + w.raccoon, 0);
  while (total > cap) { // take from the biggest wave (the type it has more of), every wave keeps at least one animal
    const w = waves.reduce((a, b) => (b.hare + b.raccoon >= a.hare + a.raccoon ? b : a));
    if (w.hare + w.raccoon <= 1) break;
    if (w.raccoon > w.hare) w.raccoon--; else w.hare--;
    total--;
  }
  return waves;
}

/** open slots at a level: none below slots.level (default 1), then start, +1 at first, first + every, ... (Basti 22.11.2026) */
export function slotsAt(S: SlotCfg, level: number): number {
  if (level < (S.level ?? 1)) return 0;
  return Math.min(S.max, S.start + (level >= S.first ? 1 + Math.floor((level - S.first) / S.every) : 0));
}
/** levels at which the next slots open (shown on the locked slots) */
export function slotLevels(S: SlotCfg): number[] { return Array.from({ length: Math.max(0, S.max - S.start) }, (_, k) => S.first + k * S.every); }
