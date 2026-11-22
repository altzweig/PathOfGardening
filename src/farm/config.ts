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
export type ActionKind = 'repair' | 'water' | 'sow' | 'weed' | 'fertilize' | 'harvestPlot' | 'harvestBush' | 'refill' | 'draw' | 'gather' | 'weedHof' | 'pickWild' | 'shake' | 'feed' | 'straw' | 'milk' | 'eggs' | 'produce' | 'chop' | 'craft' | 'unfence';
/** handrake = kleine einhändige Handharke (Jäten, Notwaffe), 21.11.2026 */
export type Tool = 'can' | 'handrake' | 'seed' | 'hands' | 'sickle' | 'bucket' | 'axe';
export interface ActionCfg { time: number; label: string; repeat?: boolean }

/** Taler + goods */
export type Cost = { money?: number } & Record<string, number | undefined>;
export interface Recipe { in: Record<ItemId, number>; out: Record<ItemId, number> }
export interface BuildingCfg { built?: boolean; broken?: boolean; level?: number; cost?: Cost; needs?: BuildingId; recipes?: Recipe[]; action?: { label: string; time: number } }
export interface StallCfg { animals: Livestock[]; feed: ItemId; feedCost: number; maxFed: number; collect: 'milk' | 'eggs'; yield: Record<ItemId, number> }
export interface RectCfg { x: number; z: number; w?: number; d?: number; r?: number; rot?: number; fence?: boolean }
export interface GunCfg { available: boolean; level: number; ammo: ItemId[]; ammoPerShot?: number; cooldown?: number; pellets?: number; cone?: number; range?: number; speed?: number; damage?: number; /** s between the berries of one shot */ stagger?: number }
export interface AnimalCfg { hp: number; speed: number; fleeSpeed: number; radius: number; scare: number; xp: number; run?: number; away?: number;
  stealInterval?: number; carryMax?: number; shy?: number; aggro?: number; damage?: number; biteInterval?: number; biteRange?: number;
  eatInterval?: number; plotBites?: number }
/** a field crop (annual): level = sowable from, grow = s after watering, cuts = harvest passes, yield = per pass */
export type Rarity = 'Common' | 'Uncommon' | 'Rare';
/** harvest experiment (Basti 22.11.2026): grow = s until ripe (by itself), then harvest s (default grow) of continuous harvesting,
 *  one fruit every `every` s; yield = per fruit (fractions add up); sound = sound group (sounds.yaml harvest.pop.*) */
export interface CropCfg { /** shown over the field (21.11.2026) */ name?: string; rarity: Rarity; grow: number; every: number; harvest?: number; sound?: string; /** old (before the experiment) */ cuts?: number; yield: Record<ItemId, number> }
/** continuous harvest: collecting + merging of the fruits on the ground */
export interface HarvestCfg { tick: number; collect: number; settle: number; throw: [number, number]; up: [number, number]; merge: number; mergeRadius: number; xp: number; overhead: number }
/** wood + fences (Basti 22.11.2026): trees in the yard are chopped (continuous, wood drops like a harvest), notch -> fall ->
 *  the trunk splits, a sapling grows between the halves; fences are made at the workbench and placed with F */
export interface LumberCfg {
  trees: { x: number; z: number; s?: number }[]; radius: number;
  /** s of chopping until the tree falls, one piece of wood every `every` s */ chop: number; every: number; yield: Record<ItemId, number>;
  fall: number; sapling: number; xp: number;
  bench: { x: number; z: number; rot?: number; w: number; d: number; every: number; cost: Record<ItemId, number>; out: ItemId };
  fence: { length: number; depth: number; hp: number; place: number; snap: number; max: number; detour: number; bite: Record<string, number>; biteEvery: number };
}
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
/** pacing of the night (Basti 22.11.2026): calm start, then 3-5 waves that swell and ebb, every one stronger; single animals in between */
export interface NightWaves { count: [number, number]; countEvery: number; first: number; grow: number; perLevel: number; raccoon: number; end: number; gap: number; width: [number, number] }
export interface NightCfg {
  length: number; dusk: number; warn: number; light: [number, number]; flee: number;
  /** fields grow on at night (harvest between the waves) */ crops?: boolean; calm: number;
  waves: NightWaves; trickle: { every: [number, number]; raccoon: number };
  hare: { hp: number; speed: number; biteInterval: number; plotDamage: number; xp: number };
  raccoon: { hp: number; speed: number; damage: number; biteInterval: number; steal: number; bites: number; xp: number };
  plotHp: number; brokenShow: number;
}
/** slots: open orders per day (Basti 22.11.2026): from `level` (default 1) `start` slots, +1 at level `first` and every `every` levels after it, at most max */
export interface SlotCfg { level?: number; start: number; first: number; every: number; max: number }
/** from level on, chance per day that one order asks for wild herbs: kinds [min, max] different herbs, n [min, max] of each, sec = work s per herb */
export interface WildQuestCfg { level: number; chance: number; kinds: [number, number]; n: [number, number]; sec: number; titles: string[] }
export interface DailyQuestCfg { slots: SlotCfg; load: number; cycle: number; objectives: number[]; blue: { max: number; min: number; sec: number }; /** wild order (22.11.2026): herbs from the herb tufts */ wild?: WildQuestCfg; daysPerLevel: number; xpShare?: number; money: number; moneyLevel: number; minMoney: number }

/** farm shop: sale slots, price per piece = field seconds x rate (products: ingredients x craft, others: prices), demand per slot and day */
export interface ShopCfg { slots: SlotCfg; rate: number; craft: number; demand: number; spread: number; sale: { price: number; demand: number }; premium: { price: number; demand: number }; prices: Record<ItemId, number>; base: number }
export interface FarmCfg {
  names: { items: Record<ItemId, string>; weapons: Record<WeaponId, string>; buildings: Record<BuildingId | 'plot', string>; animals: Record<AnimalType, string>; livestock: Record<Livestock, string> };
  day: { length: number; /** s of harvest work per day (orders, yield per day): day + the quiet parts of the night */ work?: number; clock: [number, number]; light: [number, number]; fade: number; rain: { chance: number; duration: [number, number] } };
  player: { hp: number; speed: number; radius: number; reach: number; kneel: number; leave: number; actionSpeed: number; crouchSpeed: number; actionGap?: number; turnWithCam?: number; hover: number; /** interaction zone m from the edge / of small things (forage, weeds) from their middle */ zone?: number; zoneSmall?: number; pickupRadius: number; magnetRadius: number; magnetSpeed: number; hurtStun: number };
  actions: Record<Exclude<ActionKind, 'produce'>, ActionCfg>;
  can: { capacity: number; start: number; perFill: number };
  bush: { ripen: number; picks: number; berries: number; radius: number; barDelay: number; almostAt: number };
  crops: Record<string, CropCfg>;
  harvest: HarvestCfg;
  /** wood + fences (22.11.2026) */
  lumber: LumberCfg;
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
  /** open fields of a new farm (22.11.2026: fields have no fixed crop any more) */
  start: { money: number; items: Record<ItemId, number>; plots: number };
  /** seeds (Basti 22.11.2026): endless, start = the seeds of a new farm, offer = new seeds to choose from after a level-up */
  seeds: { start: string[]; offer: number };
  weapons: { rake: { damage: number; range: number; arc: number; cooldown: number; swing: number; knockback: number; stun: number } } & Record<Exclude<WeaponId, 'rake'>, GunCfg>;
  ammo: Record<ItemId, { damage: number; freeze?: number; /** strawberries: bleeding (see bleed) */ bleed?: number; /** brambles: HP added to the doom bar per hit */ doom?: number }>;
  /** bleeding from a strawberry shot: HP per s, s long */
  bleed?: { dps: number; time: number };
  animals: Record<AnimalType, AnimalCfg>;
  spawns: { wanderers: [number, number]; wanderTypes: Partial<Record<AnimalType, number>>; raid: { from: number; to: number; raccoons: number; perLevel: number }; scaling: { hp: number; damage: number; speed: number } };
  /** 0 HP: the worst case of the night (Basti 21.11.2026): the harvest of the day is gone, every field is broken */
  faint: { loseHarvest: boolean; breakFields: boolean };
  night: NightCfg;
  /** co-op visits (Basti 22.11.2026): guests help on the farm, the yield goes to the farm, XP to whoever does the work */
  coop?: { maxPlayers: number; koTime: number; hostShare: number; /** co-op: so many times the animals at night (Basti 22.11.2026: 2) */ nightFactor: number; messages?: string[] };
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
    buildings: Record<BuildingId, RectCfg>; plots: { x: number; z: number }[]; trees: { x: number; z: number; big?: boolean }[] };
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
/** harvest experiment: s of continuous harvesting of a ripe crop, fruits it gives, XP per fruit (fraction) and per whole harvest */
export const cropHarvestTime = (C: CropCfg) => C.harvest ?? C.grow;
export const cropPieces = (cfg: FarmCfg, id: string) => { const C = cfg.crops[id]; return C ? Math.max(1, Math.round(cropHarvestTime(C) / Math.max(.05, C.every))) : 0; };
export const cropXp = (cfg: FarmCfg, id: string) => {
  const C = cfg.crops[id]; if (!C) return 0;
  return (cfg.harvest?.xp ?? 1) * (cfg.harvestXp?.rarity[C.rarity] ?? 1) * C.every;
};
export const cropXpTotal = (cfg: FarmCfg, id: string) => Math.round(cropXp(cfg, id) * cropPieces(cfg, id));
/** main good of a crop (the biggest yield per fruit) */
export const cropMain = (C: CropCfg): ItemId => Object.entries(C.yield).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'wheat';
/** harvest work s per piece of the main good (orders, prices): every x (1 + overhead) */
export const cropSec = (cfg: FarmCfg, C: CropCfg) => C.every * (1 + (cfg.harvest?.overhead ?? .5)) / Math.max(.01, C.yield[cropMain(C)] ?? 1);
/** harvests without a field (bush, trees, brambles, wild plants): field time = pause only */
export const otherXp = (cfg: FarmCfg, item: ItemId, cuts: number) => {
  const X = cfg.harvestXp, O = X?.other[item]; if (!O) return 0;
  return passXp(X, O.rarity, X.pause, (O.water ? X.water : 0) + cuts * X.cut, cuts);
};
/** kind of the i-th farm tree (wild.trees repeats) */
export const treeKind = (cfg: FarmCfg, i: number): TreeKind => { const t = cfg.wild.trees?.length ? cfg.wild.trees : ['apple' as TreeKind]; return t[i % t.length]; };
export const treeCfg = (cfg: FarmCfg, i: number): PerennialCfg => treeKind(cfg, i) === 'nut' ? (cfg.wild.nuts ?? cfg.wild.apples) : cfg.wild.apples;

/** s of harvest work in one day (orders, yield per field and day): day.work, else the day length */
export const workSec = (cfg: FarmCfg) => cfg.day.work ?? cfg.day.length;

/** night pacing (Basti 22.11.2026): count of waves at a level (count[0], +1 every countEvery levels, at most count[1]) */
export const waveCount = (cfg: FarmCfg, level: number) => {
  const W = cfg.night.waves; return Math.min(W.count[1], W.count[0] + Math.floor(Math.max(0, level - 1) / Math.max(1, W.countEvery)));
};
/** time windows of the waves (s after nightfall): from `calm` to length - end, `gap` s quiet between two waves (single animals),
 *  the rest shared by weight width[0] (first wave) .. width[1] (last wave): later waves last longer */
export function waveWindows(cfg: FarmCfg, level: number): { from: number; to: number }[] {
  const N = cfg.night, W = N.waves, n = waveCount(cfg, level), a = N.calm, b = N.length - W.end;
  const wt = Array.from({ length: n }, (_, i) => W.width[0] + (W.width[1] - W.width[0]) * (n > 1 ? i / (n - 1) : 0));
  const k = Math.max(0, b - a - W.gap * (n - 1)) / wt.reduce((x, y) => x + y, 0);
  let t = a;
  return wt.map(w => { const r = { from: t, to: t + w * k }; t = r.to + W.gap; return r; });
}
/** where in a window the k-th of n animals comes: density sin^2 (swells, peaks in the middle, ebbs) - inverse of t - sin(2 pi t) / 2 pi */
export function swell(k: number, n: number) {
  const u = (k + .5) / n; let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (m - Math.sin(2 * Math.PI * m) / (2 * Math.PI) < u) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** the animals of one night: per wave first x (1 + grow x wave) x (1 + perLevel x (level - 1)) x co-op factor,
 *  a share raccoons, the rest hares; level = average level of all farmers */
export function nightPlan(cfg: FarmCfg, level: number, mul = 1): { from: number; to: number; hare: number; raccoon: number }[] {
  const W = cfg.night.waves, lv = 1 + W.perLevel * Math.max(0, level - 1);
  return waveWindows(cfg, level).map((win, i) => {
    const n = Math.max(1, Math.round(W.first * (1 + W.grow * i) * lv * mul)), raccoon = Math.round(n * W.raccoon);
    return { ...win, raccoon, hare: n - raccoon };
  });
}

/** open slots at a level: none below slots.level (default 1), then start, +1 at first, first + every, ... (Basti 22.11.2026) */
export function slotsAt(S: SlotCfg, level: number): number {
  if (level < (S.level ?? 1)) return 0;
  return Math.min(S.max, S.start + (level >= S.first ? 1 + Math.floor((level - S.first) / S.every) : 0));
}
/** levels at which the next slots open (shown on the locked slots) */
export function slotLevels(S: SlotCfg): number[] { return Array.from({ length: Math.max(0, S.max - S.start) }, (_, k) => S.first + k * S.every); }
