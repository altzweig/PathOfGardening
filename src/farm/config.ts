// Balancing of the farming game loop (19.11.2026). Read from "Game Design & Balancing/balancing.yaml" at every start.
import YAML from 'yaml';
import type { TexCfg } from '../view/textures';

export type ItemId = string;
export type WeaponId = 'rake' | 'shotgun' | 'crossbow' | 'sling' | 'mace' | 'cannon';
export const WEAPON_IDS: WeaponId[] = ['shotgun', 'crossbow', 'sling', 'mace', 'cannon'];
export type BuildingId = 'house' | 'well' | 'shop' | 'mill' | 'bakery' | 'carpentry' | 'workshop' | 'dairy' | 'juicer' | 'silo' | 'chickens' | 'cows' | 'sheep';
export const BUILDING_IDS: BuildingId[] = ['well', 'mill', 'shop', 'juicer', 'bakery', 'carpentry', 'workshop', 'cows', 'sheep', 'dairy', 'chickens', 'silo'];
export type StallId = 'cows' | 'sheep' | 'chickens';
export const STALL_IDS: StallId[] = ['cows', 'sheep', 'chickens'];
export type Livestock = 'cow' | 'sheep' | 'goat' | 'chicken';
export type AnimalType = 'raccoon' | 'hare';
export type ActionKind = 'water' | 'plow' | 'sow' | 'weed' | 'fertilize' | 'harvestPlot' | 'harvestBush' | 'refill' | 'draw' | 'gather' | 'weedHof' | 'pickWild' | 'shake' | 'feed' | 'straw' | 'milk' | 'eggs' | 'produce';
export type Tool = 'can' | 'rake' | 'seed' | 'hands' | 'sickle' | 'bucket';
export interface ActionCfg { time: number; label: string; repeat?: boolean }

/** Taler + goods */
export type Cost = { money?: number } & Record<string, number | undefined>;
export interface Recipe { in: Record<ItemId, number>; out: Record<ItemId, number> }
export interface BuildingCfg { built?: boolean; broken?: boolean; level?: number; cost?: Cost; needs?: BuildingId; recipes?: Recipe[]; questSlots?: number; action?: { label: string; time: number } }
export interface StallCfg { animals: Livestock[]; feed: ItemId; feedCost: number; maxFed: number; collect: 'milk' | 'eggs'; yield: Record<ItemId, number> }
export interface RectCfg { x: number; z: number; w?: number; d?: number; r?: number; rot?: number; fence?: boolean }
export interface GunCfg { available: boolean; level: number; ammo: ItemId[]; ammoPerShot?: number; cooldown?: number; pellets?: number; cone?: number; range?: number; speed?: number; damage?: number }
export interface AnimalCfg { hp: number; speed: number; fleeSpeed: number; radius: number; scare: number; xp: number;
  stealInterval?: number; carryMax?: number; shy?: number; aggro?: number; damage?: number; biteInterval?: number; biteRange?: number;
  eatInterval?: number; plotBites?: number }
export interface QuestPoolEntry { item: ItemId; amount: [number, number]; money: number; xp: number; level: number }

export interface FarmCfg {
  names: { items: Record<ItemId, string>; weapons: Record<WeaponId, string>; buildings: Record<BuildingId | 'plot', string>; animals: Record<AnimalType, string>; livestock: Record<Livestock, string> };
  day: { length: number; clock: [number, number]; light: [number, number]; fade: number; rain: { chance: number; duration: [number, number] } };
  player: { hp: number; speed: number; radius: number; reach: number; hover: number; pickupRadius: number; magnetRadius: number; magnetSpeed: number; hurtStun: number };
  actions: Record<Exclude<ActionKind, 'produce'>, ActionCfg>;
  can: { capacity: number; start: number };
  bush: { ripen: number; bigPicks: number; bigBerries: [number, number]; smallPicks: number; smallBerries: number; radius: number; barDelay: number; almostAt: number };
  crops: Record<string, { seed: ItemId; days: number; yield: Record<ItemId, number> }>;
  plots: { size: number; cuts: number; fertBonus: number; weeds: { max: number; every: [number, number]; blockAt: number }; byLevel: number[]; cost: number };
  wild: { weeds: { start: number; max: number; every: [number, number] }; forage: { start: number; max: number; every: [number, number]; band: [number, number]; items: Record<ItemId, number>; where?: Record<ItemId, ('edge' | 'wet' | 'grass')[]> };
    brambles: { count: number; berries: number; regrow: number; pick: [number, number] }; apples: { perTree: number; shake: [number, number] }; barrel: number };
  /** wild grass patches (view + where weeds grow): perM2 = blades per m² at full density, well/back = size factors, edge = patches along the forest edge */
  grass?: { perM2: number; well: number; back: number; edge: number };
  stalls: { strawBonus: number; strawCost: number } & Record<StallId, StallCfg>;
  camera: { rotate: number; pitch: [number, number] };
  storage: { capacity: number };
  start: { money: number; items: Record<ItemId, number>; plots: number };
  weapons: { rake: { damage: number; range: number; arc: number; cooldown: number; swing: number; knockback: number; stun: number } } & Record<Exclude<WeaponId, 'rake'>, GunCfg>;
  ammo: Record<ItemId, { damage: number; freeze?: number }>;
  animals: Record<AnimalType, AnimalCfg>;
  spawns: { wanderers: [number, number]; wanderTypes: Partial<Record<AnimalType, number>>; raid: { from: number; to: number; raccoons: number; perLevel: number }; scaling: { hp: number; damage: number; speed: number } };
  faint: { dryFields: boolean };
  levels: { xp: number[]; unlocks: Record<number, BuildingId[]> };
  quests: { offers: number; maxActive: number; start: { need: Record<ItemId, number>; reward: { money: number; xp: number; items?: Record<ItemId, number> } }; pool: QuestPoolEntry[] };
  buildings: Record<BuildingId, BuildingCfg>;
  loading: { minTime: number; tipEvery: number; fade: number; tips: string[] };
  tutorial: { raccoonHp: number; raccoonSteal: number; raccoonSpeed: number; raccoonStart: number; fieldHint: number; texts: Record<string, string> };
  /** texture concept (20.11.2026): tile sizes, blend sharpness etc. (src/view/textures.ts) */
  texturen?: TexCfg;
  hof: { clearing: { rx: number; rz: number }; gaps: number[]; gapWidth: number; door: { x: number; z: number }; basket: { x: number; z: number }; bush: { x: number; z: number };
    buildings: Record<BuildingId, RectCfg>; plots: { x: number; z: number }[]; trees: { x: number; z: number }[] };
}

export async function loadFarmCfg(): Promise<FarmCfg> {
  const res = await fetch('./design/balancing.yaml', { cache: 'no-store' });
  if (!res.ok) throw new Error('balancing.yaml: HTTP ' + res.status);
  return YAML.parse(await res.text()) as FarmCfg;
}
export async function loadSounds(): Promise<any> {
  try { const res = await fetch('./design/sounds.yaml', { cache: 'no-store' }); return res.ok ? YAML.parse(await res.text()) : null; } catch { return null; }
}

/** level for an XP total (1-based) */
export function levelFor(cfg: FarmCfg, xp: number) { let l = 1; cfg.levels.xp.forEach((need, i) => { if (xp >= need) l = i + 1; }); return l; }
/** XP needed for the level after `level` (null = max) */
export function nextLevelXp(cfg: FarmCfg, level: number): number | null { return cfg.levels.xp[level] ?? null; }
export const plotsAllowed = (cfg: FarmCfg, level: number) => cfg.plots.byLevel[Math.min(cfg.plots.byLevel.length - 1, level - 1)] ?? 1;
/** hof rotation (deg clockwise seen from above, z down) -> three.js rotation.y */
export const rotY = (deg = 0) => -deg * Math.PI / 180;
