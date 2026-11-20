// Persistent farm state (save game in localStorage): goods, money, XP, plots, bush, buildings, quests, loadout.
// Everything that survives from one day to the next lives here; the running day is in sim.ts.
import { BUILDING_IDS, BuildingId, Cost, FarmCfg, ItemId, QuestPoolEntry, STALL_IDS, WeaponId, levelFor, plotsAllowed } from './config';

export type PlotStage = 'wild' | 'empty' | 'raked' | 'sown' | 'ripe';
/** yieldLeft = harvest passes left on a ripe plot; weeds 0..plots.weeds.max; fert = times fertilised (this crop), fertDay = day of the last time */
export interface PlotState { open: boolean; stage: PlotStage; crop: string | null; days: number; watered: boolean; bites: number; yieldLeft: number; weeds: number; fert: number; fertDay: number }
export type BushPhase = 'dry' | 'growing' | 'ripe' | 'empty';
/** berries = big berries left on the bush, small = small picks left after that */
export interface BushState { phase: BushPhase; t: number; berries: number; small: number; picked: number }
/** things that grow on the farm by themselves (kept from day to day) */
const WILD_V = 2;
export interface WildState { weeds: { id: number; x: number; z: number }[]; forage: { id: number; k: ItemId; x: number; z: number }[]; seq: number; init: boolean; /** placement version: older saves grow their weeds + forage anew */ v?: number }
export interface Quest { id: string; need: Record<ItemId, number>; reward: { money: number; xp: number; items?: Record<ItemId, number> }; start?: boolean }
export interface Production { recipe: number; doneDay: number }
export interface BuildingState { built: boolean; prod?: Production | null }
export interface DaySummary { day: number; got: Record<ItemId, number>; lost: Record<ItemId, number>; driven: number; xp: number; fainted: boolean }

export interface FarmState {
  v: 1;
  day: number;                 // 1 = tutorial day
  tutorialDone: boolean;
  money: number;
  xp: number;
  level: number;
  items: Record<ItemId, number>;
  water: number;               // fillings in the watering can
  plots: PlotState[];
  bush: BushState;
  wild: WildState;
  buildings: Record<BuildingId, BuildingState>;
  quests: { active: Quest[]; offers: Quest[]; seq: number };
  weapon: WeaponId | null;     // chosen in the morning (null = only the rake)
  ammo: ItemId | null;
  ammoCount: number;           // taken out of the storage for the day, the rest goes back in the evening
  phase: 'morning' | 'day' | 'evening';
  summary: DaySummary | null;
  levelUps: number[];          // levels reached since the last evening (shown once)
}

const KEY = 'pog-farm-v1';

export function newState(cfg: FarmCfg): FarmState {
  const plots: PlotState[] = cfg.hof.plots.map((_, i) => newPlot(i < cfg.start.plots));
  const buildings = {} as Record<BuildingId, BuildingState>;
  for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) buildings[id] = { built: !!cfg.buildings[id]?.built };
  const s: FarmState = {
    v: 1, day: 1, tutorialDone: false, money: cfg.start.money, xp: 0, level: 1, items: { ...cfg.start.items }, water: cfg.can.start,
    plots, bush: freshBush(), buildings, wild: { weeds: [], forage: [], seq: 1, init: false, v: WILD_V },
    quests: { active: [{ id: 'start', need: { ...cfg.quests.start.need }, reward: { ...cfg.quests.start.reward }, start: true }], offers: [], seq: 1 },
    weapon: null, ammo: null, ammoCount: 0, phase: 'day', summary: null, levelUps: [],
  };
  return s;
}
export const newPlot = (open: boolean): PlotState => ({ open, stage: open ? 'empty' : 'wild', crop: null, days: 0, watered: false, bites: 0, yieldLeft: 0, weeds: 0, fert: 0, fertDay: 0 });
export const freshBush = (): BushState => ({ phase: 'dry', t: 0, berries: 0, small: 0, picked: 0 });
export function loadState(cfg: FarmCfg): FarmState | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const s = JSON.parse(raw) as FarmState; if (s.v !== 1) return null;
    // new plots / buildings from a changed layout
    while (s.plots.length < cfg.hof.plots.length) s.plots.push(newPlot(false));
    s.plots.length = cfg.hof.plots.length;
    for (const p of s.plots) { p.weeds ??= 0; p.fert ??= 0; p.fertDay ??= 0; }
    for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) s.buildings[id] ??= { built: !!cfg.buildings[id]?.built };
    for (const id of BUILDING_IDS) delete s.buildings[id].prod; // production runs during the day now
    s.levelUps ??= [];
    s.wild ??= { weeds: [], forage: [], seq: 1, init: false };
    if (s.wild.v !== WILD_V) s.wild = { weeds: [], forage: [], seq: s.wild.seq, init: false, v: WILD_V }; // 20.11.2026: weeds + forage sit by theme now
    if (s.bush.small === undefined) s.bush = freshBush();
    return s;
  } catch { return null; }
}
export function saveState(s: FarmState) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: no save */ } }
export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

// ---------------- goods + money ----------------
export const count = (s: FarmState, id: ItemId) => s.items[id] ?? 0;
export function addItem(cfg: FarmCfg, s: FarmState, id: ItemId, n: number) {
  const have = count(s, id), next = Math.max(0, Math.min(cfg.storage.capacity, have + n));
  if (next) s.items[id] = next; else delete s.items[id];
  return next - have;
}
export function canPay(s: FarmState, c: Cost | undefined) {
  if (!c) return true;
  for (const [k, v] of Object.entries(c)) { if (!v) continue; if (k === 'money' ? s.money < v : count(s, k) < v) return false; }
  return true;
}
export function pay(cfg: FarmCfg, s: FarmState, c: Cost | undefined) {
  if (!c || !canPay(s, c)) return false;
  for (const [k, v] of Object.entries(c)) { if (!v) continue; if (k === 'money') s.money -= v; else addItem(cfg, s, k, -v); }
  return true;
}
/** XP + level-ups (remembered for the evening screen) */
export function gainXp(cfg: FarmCfg, s: FarmState, n: number) {
  s.xp += n; const lv = levelFor(cfg, s.xp);
  while (s.level < lv) { s.level++; s.levelUps.push(s.level); }
}

// ---------------- quests ----------------
export function questReady(s: FarmState, q: Quest) { return Object.entries(q.need).every(([k, v]) => count(s, k) >= v); }
export function completeQuest(cfg: FarmCfg, s: FarmState, q: Quest) {
  if (!questReady(s, q)) return false;
  for (const [k, v] of Object.entries(q.need)) addItem(cfg, s, k, -v);
  s.money += q.reward.money; gainXp(cfg, s, q.reward.xp);
  for (const [k, v] of Object.entries(q.reward.items ?? {})) addItem(cfg, s, k, v);
  s.quests.active = s.quests.active.filter(x => x !== q);
  return true;
}
export function acceptQuest(cfg: FarmCfg, s: FarmState, q: Quest) {
  if (s.quests.active.length >= cfg.quests.maxActive) return false;
  s.quests.offers = s.quests.offers.filter(x => x !== q); s.quests.active.push(q); return true;
}
/** fresh offers every evening (only goods the farm can make on this level) */
export function rollOffers(cfg: FarmCfg, s: FarmState) {
  const slots = cfg.quests.offers + (s.buildings.shop.built ? cfg.buildings.shop.questSlots ?? 0 : 0);
  const pool = cfg.quests.pool.filter(p => p.level <= s.level && producible(cfg, s, p));
  s.quests.offers = [];
  for (let i = 0; i < slots && pool.length; i++) {
    const p = pool[Math.floor(Math.random() * pool.length)];
    const n = p.amount[0] + Math.floor(Math.random() * (p.amount[1] - p.amount[0] + 1));
    s.quests.offers.push({ id: 'q' + s.quests.seq++, need: { [p.item]: n }, reward: { money: p.money * n, xp: p.xp * n } });
  }
}
function producible(cfg: FarmCfg, s: FarmState, p: QuestPoolEntry) {
  if (['blue', 'wheat', 'straw', 'green', 'apple', ...Object.keys(cfg.wild.forage.items)].includes(p.item)) return true;
  const reach = (id: BuildingId) => id === 'house' || s.buildings[id].built || (cfg.buildings[id].level ?? 99) <= s.level;
  for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) for (const r of cfg.buildings[id]?.recipes ?? []) if (r.out[p.item] && reach(id)) return true;
  for (const id of STALL_IDS) if (cfg.stalls[id].yield[p.item] && reach(id)) return true;
  return false;
}

// ---------------- buildings + plots ----------------
export type BuildStatus = 'built' | 'ok' | 'level' | 'money' | 'needs';
export function buildStatus(cfg: FarmCfg, s: FarmState, id: BuildingId): BuildStatus {
  const B = cfg.buildings[id];
  if (s.buildings[id].built) return 'built';
  if ((B.level ?? 1) > s.level) return 'level';
  if (B.needs && !s.buildings[B.needs].built) return 'needs';
  return canPay(s, B.cost) ? 'ok' : 'money';
}
export function build(cfg: FarmCfg, s: FarmState, id: BuildingId) {
  if (buildStatus(cfg, s, id) !== 'ok') return false;
  pay(cfg, s, cfg.buildings[id].cost); s.buildings[id].built = true; return true;
}
export const openPlots = (s: FarmState) => s.plots.filter(p => p.open).length;
export function canOpenPlot(cfg: FarmCfg, s: FarmState) { return openPlots(s) < Math.min(plotsAllowed(cfg, s.level), s.plots.length) && s.money >= cfg.plots.cost; }
export function openPlot(cfg: FarmCfg, s: FarmState) {
  if (!canOpenPlot(cfg, s)) return false;
  const i = s.plots.findIndex(q => !q.open); if (i < 0) return false;
  s.money -= cfg.plots.cost; s.plots[i] = newPlot(true); return true;
}
// ---------------- day transitions ----------------
/** evening: plots that were watered grow one day, the bush resets, unused ammo goes back into the storage */
export function endDay(cfg: FarmCfg, s: FarmState) {
  for (const p of s.plots) {
    if (p.open && p.stage === 'sown' && p.crop && p.watered) { p.days++; if (p.days >= cfg.crops[p.crop].days) { p.stage = 'ripe'; p.bites = 0; p.yieldLeft = ripeCuts(cfg, p); } }
    p.watered = false;
  }
  if (s.ammo && s.ammoCount > 0) addItem(cfg, s, s.ammo, s.ammoCount);
  s.ammoCount = 0; s.phase = 'evening';
  rollOffers(cfg, s);
}
/** harvest passes of a plot that just ripened (fertiliser: +fertBonus per time) */
export const ripeCuts = (cfg: FarmCfg, p: PlotState) => Math.round(cfg.plots.cuts * (1 + cfg.plots.fertBonus * p.fert));
/** next morning */
export function nextDay(cfg: FarmCfg, s: FarmState) {
  s.day++; s.bush = freshBush(); s.phase = 'morning'; s.summary = null; s.levelUps = [];
}
/** morning: take weapon + ammo for the day */
export function takeLoadout(cfg: FarmCfg, s: FarmState, weapon: WeaponId | null, ammo: ItemId | null, n: number) {
  s.weapon = weapon; s.ammo = weapon ? ammo : null;
  s.ammoCount = s.ammo ? Math.max(0, Math.min(count(s, s.ammo), Math.floor(n))) : 0;
  if (s.ammo && s.ammoCount) addItem(cfg, s, s.ammo, -s.ammoCount);
  s.phase = 'day';
}
