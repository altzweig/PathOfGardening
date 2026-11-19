// Persistent farm state (save game in localStorage): goods, money, XP, plots, bush, buildings, quests, loadout.
// Everything that survives from one day to the next lives here; the running day is in sim.ts.
import { BUILDING_IDS, BuildingId, Cost, FarmCfg, ItemId, QuestPoolEntry, WeaponId, levelFor, plotsAllowed } from './config';

export type PlotStage = 'wild' | 'empty' | 'raked' | 'sown' | 'ripe';
export interface PlotState { open: boolean; stage: PlotStage; crop: string | null; days: number; watered: boolean; bites: number; yieldLeft: number }
export type BushPhase = 'dry' | 'growing' | 'ripe' | 'empty';
export interface BushState { phase: BushPhase; t: number; berries: number; picked: number }
export interface Quest { id: string; need: Record<ItemId, number>; reward: { money: number; xp: number; items?: Record<ItemId, number> }; start?: boolean }
export interface Production { recipe: number; doneDay: number }
export interface BuildingState { built: boolean; prod: Production | null }
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
  const plots: PlotState[] = cfg.hof.plots.map((_, i) => ({ open: i < cfg.start.plots, stage: i < cfg.start.plots ? 'empty' : 'wild', crop: null, days: 0, watered: false, bites: 0, yieldLeft: 0 }));
  const buildings = {} as Record<BuildingId, BuildingState>;
  for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) buildings[id] = { built: !!cfg.buildings[id]?.built, prod: null };
  const s: FarmState = {
    v: 1, day: 1, tutorialDone: false, money: cfg.start.money, xp: 0, level: 1, items: { ...cfg.start.items }, water: cfg.can.start,
    plots, bush: { phase: 'dry', t: 0, berries: 0, picked: 0 }, buildings,
    quests: { active: [{ id: 'start', need: { ...cfg.quests.start.need }, reward: { ...cfg.quests.start.reward }, start: true }], offers: [], seq: 1 },
    weapon: null, ammo: null, ammoCount: 0, phase: 'day', summary: null, levelUps: [],
  };
  return s;
}
export function loadState(cfg: FarmCfg): FarmState | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const s = JSON.parse(raw) as FarmState; if (s.v !== 1) return null;
    // new plots / buildings from a changed layout
    while (s.plots.length < cfg.hof.plots.length) s.plots.push({ open: false, stage: 'wild', crop: null, days: 0, watered: false, bites: 0, yieldLeft: 0 });
    s.plots.length = cfg.hof.plots.length;
    for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) s.buildings[id] ??= { built: !!cfg.buildings[id]?.built, prod: null };
    s.levelUps ??= [];
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
  if (p.item === 'blue' || p.item === 'wheat' || p.item === 'straw') return true;
  for (const id of BUILDING_IDS) for (const r of cfg.buildings[id]?.recipes ?? []) if (r.out[p.item] && (s.buildings[id].built || (cfg.buildings[id].level ?? 99) <= s.level)) return true;
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
  const p = s.plots.find(q => !q.open); if (!p) return false;
  s.money -= cfg.plots.cost; Object.assign(p, { open: true, stage: 'empty', crop: null, days: 0, watered: false, bites: 0 }); return true;
}
/** production: start in the evening, ready `days` evenings later */
export function startProduction(cfg: FarmCfg, s: FarmState, id: BuildingId, recipe: number) {
  const r = cfg.buildings[id].recipes?.[recipe], b = s.buildings[id];
  if (!r || !b.built || b.prod) return false;
  if (!Object.entries(r.in).every(([k, v]) => count(s, k) >= v)) return false;
  for (const [k, v] of Object.entries(r.in)) addItem(cfg, s, k, -v);
  b.prod = { recipe, doneDay: s.day + r.days }; return true;
}
export function collectProduction(cfg: FarmCfg, s: FarmState, id: BuildingId) {
  const b = s.buildings[id]; if (!b.prod || b.prod.doneDay > s.day) return false;
  const r = cfg.buildings[id].recipes![b.prod.recipe];
  for (const [k, v] of Object.entries(r.out)) addItem(cfg, s, k, v);
  b.prod = null; return true;
}

// ---------------- day transitions ----------------
/** evening: plots that were watered grow one day, the bush resets, unused ammo goes back into the storage */
export function endDay(cfg: FarmCfg, s: FarmState) {
  for (const p of s.plots) {
    if (p.open && p.stage === 'sown' && p.crop && p.watered) { p.days++; if (p.days >= cfg.crops[p.crop].days) { const C = cfg.crops[p.crop]; p.stage = 'ripe'; p.bites = 0; p.yieldLeft = C.yield[C.seed] ?? 0; } }
    p.watered = false;
  }
  if (s.ammo && s.ammoCount > 0) addItem(cfg, s, s.ammo, s.ammoCount);
  s.ammoCount = 0; s.phase = 'evening';
  rollOffers(cfg, s);
}
/** next morning */
export function nextDay(cfg: FarmCfg, s: FarmState) {
  s.day++; s.bush = { phase: 'dry', t: 0, berries: 0, picked: 0 }; s.phase = 'morning'; s.summary = null; s.levelUps = [];
}
/** morning: take weapon + ammo for the day */
export function takeLoadout(cfg: FarmCfg, s: FarmState, weapon: WeaponId | null, ammo: ItemId | null, n: number) {
  s.weapon = weapon; s.ammo = weapon ? ammo : null;
  s.ammoCount = s.ammo ? Math.max(0, Math.min(count(s, s.ammo), Math.floor(n))) : 0;
  if (s.ammo && s.ammoCount) addItem(cfg, s, s.ammo, -s.ammoCount);
  s.phase = 'day';
}
