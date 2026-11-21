// Persistent farm state (saved by saves.ts): goods, money, XP, plots, bush, buildings, quests, loadout.
// Everything that survives from one day to the next lives here; the running day is in sim.ts.
import { BUILDING_IDS, BuildingId, Cost, FarmCfg, ItemId, STALL_IDS, WeaponId, levelFor, plotsAllowed } from './config';

/** 21.11.2026: no ploughing / raking any more: an open plot is 'empty' (ready to sow) right away and again after the harvest */
export type PlotStage = 'wild' | 'empty' | 'sown' | 'ripe' | 'done';
/** yieldLeft = harvest passes left on a ripe plot; weeds 0..plots.weeds.max (grow only in the morning, slow the growth); fert = times fertilised (this crop), fertDay = day of the last time;
 *  t = s left of a short step (sprouting after sowing, clearing after the last harvest), grow = s grown since watering (20.11.2026) */
export interface PlotState { open: boolean; stage: PlotStage; crop: string | null; days: number; watered: boolean; bites: number; yieldLeft: number; weeds: number; fert: number; fertDay: number; t: number; grow: number }
export type BushPhase = 'dry' | 'growing' | 'ripe' | 'empty';
/** berries = big berries left on the bush, small = small picks left after that */
export interface BushState { phase: BushPhase; t: number; berries: number; small: number; picked: number }
/** things that grow on the farm by themselves (kept from day to day) */
const WILD_V = 2;
export interface WildState { weeds: { id: number; x: number; z: number }[]; forage: { id: number; k: ItemId; x: number; z: number; /** picks left (wild plants) */ n?: number }[]; seq: number; init: boolean; /** placement version: older saves grow their weeds + forage anew */ v?: number }
/** daily order (21.11.2026): taken in the morning, delivered by itself as soon as the goods are in the storage, expires in the evening */
export interface Quest { id: string; title?: string; need: Record<ItemId, number>; reward: { money: number; xp: number; items?: Record<ItemId, number> }; start?: boolean; done?: boolean; expired?: boolean; claimed?: boolean }
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
  weapon: WeaponId | null;     // null = only the hand rake (21.11.2026: no morning choice, the game starts without a weapon)
  ammo: ItemId | null;
  ammoCount: number;           // taken out of the storage for the day, the rest goes back in the evening
  phase: 'morning' | 'day' | 'evening';
  summary: DaySummary | null;
  levelUps: number[];          // levels reached since the last evening (shown once)
  seed: string;                // crop that is sown next (seed button in the HUD)
  /** perennial wild harvest: day from which each farm tree / bramble is ripe again */
  perennial: { trees: number[]; brambles: number[] };
  /** day whose morning weeds were rolled (once per day, also for a save made during the day) */
  weedDay?: number;
}

const KEY = 'pog-farm-v1';

export function newState(cfg: FarmCfg): FarmState {
  const plots: PlotState[] = cfg.hof.plots.map((_, i) => newPlot(i < cfg.start.plots));
  const buildings = {} as Record<BuildingId, BuildingState>;
  for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) buildings[id] = { built: !!cfg.buildings[id]?.built };
  const s: FarmState = {
    v: 1, day: 1, tutorialDone: false, money: cfg.start.money, xp: 0, level: 1, items: { ...cfg.start.items }, water: cfg.can.start,
    plots, bush: freshBush(), buildings, wild: { weeds: [], forage: [], seq: 1, init: false, v: WILD_V },
    quests: { active: [], offers: [], seq: 1 },
    weapon: null, ammo: null, ammoCount: 0, phase: 'day', summary: null, levelUps: [],
    seed: 'wheat', perennial: { trees: [], brambles: [] },
  };
  rollDaily(cfg, s);
  return s;
}
export const newPlot = (open: boolean): PlotState => ({ open, stage: open ? 'empty' : 'wild', crop: null, days: 0, watered: false, bites: 0, yieldLeft: 0, weeds: 0, fert: 0, fertDay: 0, t: 0, grow: 0 });
export const freshBush = (): BushState => ({ phase: 'dry', t: 0, berries: 0, small: 0, picked: 0 });
/** the save of the first farm version (single save, before named saves) */
export function loadState(cfg: FarmCfg): FarmState | null {
  try { const raw = localStorage.getItem(KEY); return raw ? normalizeState(cfg, JSON.parse(raw)) : null; } catch { return null; }
}
/** fills in what older saves do not have yet (changed layout, new fields) */
export function normalizeState(cfg: FarmCfg, s: FarmState | null | undefined): FarmState | null {
  if (!s || s.v !== 1) return null;
  // new plots / buildings from a changed layout
  while (s.plots.length < cfg.hof.plots.length) s.plots.push(newPlot(false));
  s.plots.length = cfg.hof.plots.length;
  for (const p of s.plots) {
    p.weeds ??= 0; p.fert ??= 0; p.fertDay ??= 0; p.t ??= 0; p.grow ??= 0;
    if (p.crop && !cfg.crops[p.crop]) Object.assign(p, { stage: 'empty', crop: null, watered: false, yieldLeft: 0 });
    if ((p.stage as string) === 'raked') p.stage = 'empty'; // 21.11.2026: ploughing is gone
    p.weeds = Math.min(p.weeds, cfg.plots.weeds.max);
  }
  if (!s.seed || !cfg.crops[s.seed]) s.seed = 'wheat';
  s.perennial ??= { trees: [], brambles: [] };
  for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) s.buildings[id] ??= { built: !!cfg.buildings[id]?.built };
  for (const id of BUILDING_IDS) delete s.buildings[id].prod; // production runs during the day now
  s.levelUps ??= [];
  // 21.11.2026: no weapon choice in the morning any more: ammo taken out goes back into the storage
  if (s.ammo && s.ammoCount > 0) addItem(cfg, s, s.ammo, s.ammoCount);
  s.weapon = null; s.ammo = null; s.ammoCount = 0;
  s.wild ??= { weeds: [], forage: [], seq: 1, init: false };
  if (s.wild.v !== WILD_V) s.wild = { weeds: [], forage: [], seq: s.wild.seq, init: false, v: WILD_V }; // 20.11.2026: weeds + forage sit by theme now
  if (s.bush.small === undefined) s.bush = freshBush();
  // 21.11.2026: daily orders instead of offers; older saves get today's orders
  s.quests.offers = [];
  if (s.quests.active.some(q => !q.title) || (!s.quests.active.length && s.phase !== 'evening')) rollDaily(cfg, s);
  return s;
}

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
/** goods of the storage counted towards the open orders, in order (an item counts for one order only) */
export function questProgress(s: FarmState): Map<Quest, Record<ItemId, number>> {
  const left: Record<ItemId, number> = {}, out = new Map<Quest, Record<ItemId, number>>();
  for (const q of s.quests.active) {
    const p: Record<ItemId, number> = {};
    for (const [k, v] of Object.entries(q.need)) {
      if (q.done) { p[k] = v; continue; }
      left[k] ??= count(s, k); p[k] = Math.min(v, left[k]); left[k] -= p[k];
    }
    out.set(q, p);
  }
  return out;
}
/** delivers an order during the day: the goods go out at once, the reward is collected in the evening (Basti 21.11.2026) */
export function completeQuest(cfg: FarmCfg, s: FarmState, q: Quest) {
  if (q.done || q.expired || !questReady(s, q)) return false;
  for (const [k, v] of Object.entries(q.need)) addItem(cfg, s, k, -v);
  q.done = true;
  return true;
}
/** evening: rewards of the delivered orders (XP + Gefallen of the village = money) */
export const unclaimed = (s: FarmState) => s.quests.active.filter(q => q.done && !q.claimed);
export function claimQuests(cfg: FarmCfg, s: FarmState) {
  for (const q of unclaimed(s)) {
    s.money += q.reward.money; gainXp(cfg, s, q.reward.xp);
    for (const [k, v] of Object.entries(q.reward.items ?? {})) addItem(cfg, s, k, v);
    q.claimed = true;
  }
}
/** during the day: every order whose goods are all there is delivered at once (returns the delivered ones) */
export function checkQuests(cfg: FarmCfg, s: FarmState) { return s.quests.active.filter(q => !q.done && !q.expired && completeQuest(cfg, s, q)); }

/** what the farm can grow for orders: main good of every unlocked field crop + field seconds per piece (growth + work, Basti's reference) */
export function questSources(cfg: FarmCfg, level: number) {
  const D = cfg.quests.daily, out: { item: ItemId; sec: number; per: number; level: number }[] = [];
  for (const [id, c] of Object.entries(cfg.crops)) {
    if (c.level > level) continue;
    const [item, n] = Object.entries(c.yield).sort((a, b) => b[1] - a[1])[0] ?? [id, 1];
    const per = n * c.cuts; out.push({ item, sec: (c.grow + D.cycle) / per, per, level: c.level });
  }
  return out;
}
const nice = (n: number) => n < 10 ? Math.max(1, Math.round(n)) : n < 50 ? Math.max(10, Math.round(n / 5) * 5) : Math.round(n / 10) * 10;
const pickW = <T>(list: T[], w: (x: T) => number) => { const ws = list.map(w), sum = ws.reduce((a, b) => a + b, 0); let r = Math.random() * sum; for (let i = 0; i < list.length; i++) if ((r -= ws[i]) <= 0) return list[i]; return list[list.length - 1]; };
/** morning: three new orders that together fit into one day on the open fields (only goods of unlocked crops, so no deadlock) */
export function rollDaily(cfg: FarmCfg, s: FarmState) {
  const D = cfg.quests.daily, L = s.level, T = cfg.quests.titles;
  const yesterday = new Set(s.quests.active.flatMap(q => Object.keys(q.need)));
  const fields = Math.max(1, s.plots.filter(p => p.open).length);
  const budget = fields * cfg.day.length * D.load, share = budget / D.count;
  // without a working well the can only holds a few fillings: every field pass needs one
  let water = s.buildings.well.built ? Infinity : Math.max(0, s.water - 1), blueLeft = D.blue.max; // one filling stays for the blueberry bush
  const src = questSources(cfg, L), maxObj = D.objectives[Math.min(D.objectives.length - 1, L - 1)] ?? 1;
  const xp = cfg.levels.xp, gap = (xp[L] ?? xp[xp.length - 1] * 1.3) - (xp[L - 1] ?? 0), xpQuest = gap / D.daysPerLevel / D.count;
  const name = (k: ItemId) => cfg.names.items[k] ?? k;
  s.quests.active = [];
  for (let q = 0; q < D.count; q++) {
    const want = share * (0.8 + Math.random() * 0.4), k = 1 + Math.floor(Math.random() * maxObj);
    const need: Record<ItemId, number> = {}; let sec = 0;
    const pool = [...src];
    for (let o = 0; o < k; o++) {
      const blueOk = blueLeft >= D.blue.min && !need.blue && !s.quests.active.some(x => x.need.blue);
      const opts: ({ item: ItemId; sec: number; per: number; level: number } | 'blue')[] = [...pool.filter(p => !need[p.item]), ...(blueOk ? ['blue' as const] : [])];
      if (!opts.length) break;
      const p = pickW(opts, x => x === 'blue' ? 1.2 : (yesterday.has(x.item) ? 1 : 3) * (x.level === L ? 2 : 1));
      if (p === 'blue') {
        const n = Math.min(blueLeft, D.blue.min + Math.floor(Math.random() * (D.blue.max - D.blue.min + 1)));
        need.blue = n; blueLeft -= n; sec += n * D.blue.sec; continue;
      }
      let n = nice(want / k / p.sec);
      const passes = Math.ceil(n / p.per);
      if (passes > water) n = Math.floor(water) * p.per;
      if (n <= 0) continue;
      need[p.item] = n; water -= Math.ceil(n / p.per); sec += n * p.sec;
    }
    if (!Object.keys(need).length) { // no water left: berries from the bush are always possible
      if (blueLeft >= D.blue.min && !s.quests.active.some(x => x.need.blue)) { need.blue = D.blue.min; blueLeft -= D.blue.min; sec += D.blue.min * D.blue.sec; } else continue;
    }
    const items = Object.keys(need), list = items.length > 1 ? T.many : T.one;
    // never two orders with the same title on one day
    const used = new Set(s.quests.active.map(x => x.title)), titles = list.map(t => t.replace('{item}', name(items[0])));
    const free = titles.filter(t => !used.has(t)), title = (free.length ? free : titles)[Math.floor(Math.random() * (free.length || titles.length))];
    const frac = sec / share;
    s.quests.active.push({ id: 'q' + s.quests.seq++, title, need,
      reward: { money: Math.max(D.minMoney, Math.round(sec * D.money * (1 + D.moneyLevel * (L - 1)))), xp: Math.max(1, Math.round(xpQuest * Math.max(.75, frac))) } });
  }
}
/** evening: open orders expire */
export function expireQuests(s: FarmState) { for (const q of s.quests.active) if (!q.done) q.expired = true; }

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
/** evening: crops keep their growth (they only grow during the day), short steps finish, unused ammo goes back into the storage */
export function endDay(cfg: FarmCfg, s: FarmState) {
  for (const p of s.plots) {
    if (p.stage === 'done') Object.assign(p, { stage: 'empty', crop: null, watered: false, grow: 0, yieldLeft: 0, fert: 0 });
    p.t = 0;
  }
  if (s.ammo && s.ammoCount > 0) addItem(cfg, s, s.ammo, s.ammoCount);
  s.ammoCount = 0; s.phase = 'evening';
  expireQuests(s);
}
/** harvest passes of a plot that just ripened (fertiliser: +fertBonus per time) */
export const ripeCuts = (cfg: FarmCfg, p: PlotState) => Math.round((cfg.crops[p.crop ?? 'wheat']?.cuts ?? 3) * (1 + cfg.plots.fertBonus * p.fert));
/** next morning */
export function nextDay(cfg: FarmCfg, s: FarmState) {
  claimQuests(cfg, s); s.day++; s.bush = freshBush(); s.phase = 'morning'; s.summary = null; s.levelUps = [];
  rollDaily(cfg, s);
}
/** growth speed of a plot: every weed slows it down (plots.weeds.slow, Basti 21.11.2026) */
export function growMul(cfg: FarmCfg, p: PlotState) {
  const sl = cfg.plots.weeds.slow; if (p.weeds <= 0 || !sl?.length) return 1;
  return Math.max(0, 1 - sl[Math.min(sl.length, p.weeds) - 1]);
}
/** morning: new weeds on every open plot (0/1/2 by plots.weeds.morning, at most max). Only once per day.
 *  tutorial: exactly one weed on the first plot, so weeding is shown once */
export function morningWeeds(cfg: FarmCfg, s: FarmState, tutorial = false) {
  if (s.weedDay === s.day) return; s.weedDay = s.day;
  const W = cfg.plots.weeds, ch = W.morning ?? [1];
  s.plots.forEach((p, i) => {
    if (!p.open) return;
    if (tutorial) { p.weeds = i === 0 ? 1 : 0; return; }
    let r = Math.random(), n = 0; for (; n < ch.length - 1; n++) { r -= ch[n]; if (r < 0) break; }
    p.weeds = Math.min(W.max, p.weeds + n);
  });
}
