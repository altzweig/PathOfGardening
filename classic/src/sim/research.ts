// Werkbank-Techtree (25.11.2026): pure rules of the research tree, shared by the simulation (host) and the UI (any client,
// rebuilt from the snapshot with rsFromSnap). The tree itself lives in balancing.yaml (research.nodes / research.segments).
// 26.11.2026 Einzelbäume: one small tree per fruit (research.trees = tabs), buildings and weapon upgrades as nodes. An upgrade entry
// with count N becomes a chain of N nodes (id.1 .. id.N, each needs the one before): same upgrades one after another, different ones side by side.
import { MUSHROOMS, type Balancing, type BuildingType, type MushId, type ResearchNode } from '../config';
import type { Snap } from './snap';

/** team-wide research state (one per game): idea being researched, s of work per node (kept when switching), researched node ids
 *  (start nodes are not listed), Forschungstempo level, current idea complete (waits at the bench), researched ideas (cost exponent, upgrades count upgradeCount) */
export interface RState { cur: string | null; work: Record<string, number>; done: string[]; speedLv: number; ready: boolean; n: number;
  /** 26.11.2026 Samen-Suche: trees found (start tree not listed), tree chosen for the search (null = next locked one), s of work done on it, character level (research speed) */
  trees: string[]; seed: string | null; sw: number; lv: number;
  /** 27.11.2026 Dünger: level per tree id (level 1 opens the tree, every level raises the yield of its plant); seed = fertilizer chosen at the composter, sw = s of work on it */
  fert: Record<string, number> }
export const newRState = (): RState => ({ cur: null, work: {}, done: [], speedLv: 0, ready: false, n: 0, trees: [], seed: null, sw: 0, lv: 1, fert: {} });

/** the yaml nodes with every upgrade chain expanded (cached per config object) */
const EXP = new WeakMap<object, ResearchNode[]>();
export function rNodes(cfg: Balancing): ResearchNode[] {
  const raw = cfg.research?.nodes; if (!raw) return [];
  let out = EXP.get(raw); if (out) return out;
  out = [];
  for (const n of raw) {
    if (n.kind !== 'upgrade') { out.push(n); continue; }
    const c = Math.max(1, n.count ?? 1);
    for (let k = 1; k <= c; k++) out.push({ ...n, id: `${n.id}.${k}`, col: n.col + k - 1, lv: k, count: c, chain: n.id, needs: k === 1 ? n.needs : [`${n.id}.${k - 1}`] });
  }
  EXP.set(raw, out); return out;
}
/** 28.11.2026 Koop-Lags: id -> node / index as a map (was a linear search per call, 248 nodes, many calls per snapshot) */
const IDX = new WeakMap<ResearchNode[], Map<string, number>>();
function idIndex(cfg: Balancing) {
  const ns = rNodes(cfg); let m = IDX.get(ns);
  if (!m) { m = new Map(); ns.forEach((n, i) => m!.set(n.id, i)); IDX.set(ns, m); }
  return m;
}
export const rNode = (cfg: Balancing, id: string | null | undefined) => { if (!id) return null; const i = idIndex(cfg).get(id); return i === undefined ? null : rNodes(cfg)[i]; };
export const rIndex = (cfg: Balancing, id: string | null | undefined) => id ? idIndex(cfg).get(id) ?? -1 : -1;
/** 28.11.2026 researched ids as a set + done weapon upgrades per weapon and chain, rebuilt only when st.done grows (it is only ever pushed to) */
interface DoneInfo { len: number; last: string | undefined; set: Set<string>; up: Map<string, { all: number; chain: Map<string, number> }> }
const DONE = new WeakMap<string[], DoneInfo>();
const weaponOf = (n: ResearchNode) => (n.ref ?? '').split('_')[0];
function doneInfo(cfg: Balancing, done: string[]): DoneInfo {
  let d = DONE.get(done);
  if (d && d.len === done.length && d.last === done[done.length - 1]) return d;
  d = { len: done.length, last: done[done.length - 1], set: new Set(done), up: new Map() };
  for (const id of d.set) {
    const n = rNode(cfg, id); if (!n || n.kind !== 'upgrade' || fieldUpOf(n)) continue;
    const w = weaponOf(n); let e = d.up.get(w); if (!e) d.up.set(w, e = { all: 0, chain: new Map() });
    e.all++; const c = n.chain ?? ''; e.chain.set(c, (e.chain.get(c) ?? 0) + 1);
  }
  DONE.set(done, d); return d;
}
export const isDone = (cfg: Balancing, st: RState, id: string) => doneInfo(cfg, st.done).set.has(id);
/** fields and buildings both count as "field" for the segment rules and are placed on a hex slot */
export const isPlaceNode = (n: ResearchNode) => n.kind === 'field' || n.kind === 'building';

/** 26.11.2026 research mode changes a few building recipes (balancing research.buildingNeeds, e.g. Bäckerei without the well). Idempotent. */
export function applyResearchCfg(cfg: Balancing) {
  if (cfg.progression !== 'research' || !cfg.research?.buildingNeeds) return;
  for (const [b, needs] of Object.entries(cfg.research.buildingNeeds)) { const B = cfg.buildings?.[b as BuildingType]; if (B && needs) { B.needs = { ...needs }; delete B.needsAny; } }
}

/** researched: start node or finished (Forschungstempo is never "done", it can always be researched again) */
export function nodeDone(cfg: Balancing, st: RState, id: string) {
  const n = rNode(cfg, id); if (!n || n.kind === 'speed') return false;
  return !!n.start || isDone(cfg, st, id);
}
/** segment open: its rule (research.segments) is met by researched non-start nodes of the segments in `from` */
export function segmentOpen(cfg: Balancing, st: RState, seg: number) {
  const R = (cfg.research?.segments ?? []).find(s => s.id === seg); if (!R) return true;
  const from = R.from ?? [], got = (fields: boolean) => rNodes(cfg).filter(n => (fields ? isPlaceNode(n) : n.kind === 'weapon') && !n.start && from.includes(n.segment) && st.done.includes(n.id)).length;
  return got(true) >= (R.needFields ?? 0) && got(false) >= (R.needWeapons ?? 0);
}
/** 26.11.2026 Samen-Suche on: trees are opened by finding seeds at the chest instead of the segment rules */
export const seedMode = (cfg: Balancing) => !!cfg.research?.seeds && !!cfg.research?.trees?.length;
/** 27.11.2026 Dünger: trees are opened by their fertilizer (made from wild mushrooms at the Kompostierer) */
export const fertMode = (cfg: Balancing) => !!cfg.compost && !!cfg.research?.trees?.length;
/** mushrooms one level of a tree's fertilizer costs, as [mushroom index, amount] */
export function fertRecipe(cfg: Balancing, tree: string): [number, number][] {
  const R = cfg.compost?.recipes?.[tree] ?? {};
  return (Object.entries(R) as [MushId, number][]).map(([k, n]) => [MUSHROOMS.indexOf(k), n] as [number, number]).filter(([i, n]) => i >= 0 && n > 0);
}
export const fertLv = (st: RState, tree: string) => st.fert?.[tree] ?? 0;
export const fertMax = (cfg: Balancing) => cfg.compost?.max ?? 1;
/** s of work the next level of a tree's fertilizer costs (compost.times, the last value repeats; not sped up by the level) */
export function fertCost(cfg: Balancing, st: RState, tree: string) { const T = cfg.compost?.times ?? [10]; return Math.max(.1, T[Math.min(fertLv(st, tree), T.length - 1)] ?? 10); }
/** the team has the mushrooms for the next level */
export const fertAfford = (cfg: Balancing, stock: number[], tree: string) => fertRecipe(cfg, tree).every(([i, n]) => (stock[i] ?? 0) >= n);
/** trees that have a recipe and are below the top level */
export const fertOpen = (cfg: Balancing, st: RState) => (cfg.research?.trees ?? []).filter(t => fertRecipe(cfg, t.id).length && fertLv(st, t.id) < fertMax(cfg)).map(t => t.id);
/** the fertilizer the composter makes next: the chosen one, else the first tree still locked, else none */
export function fertTarget(cfg: Balancing, st: RState) {
  if (!fertMode(cfg)) return null; const O = fertOpen(cfg, st);
  if (st.seed && O.includes(st.seed)) return st.seed;
  return O.find(t => !treeOpen(cfg, st, t)) ?? null;
}
/** the start tree (the one holding a start node, else the first) */
export function startTree(cfg: Balancing) { const T = cfg.research?.trees ?? []; return (T.find(t => rNodes(cfg).some(n => n.start && n.tree === t.id)) ?? T[0])?.id ?? ''; }
/** a tree (tab) is open: Samen-Suche -> start tree or found; else its segment rule */
export function treeOpen(cfg: Balancing, st: RState, id: string) {
  const t = cfg.research?.trees?.find(x => x.id === id); if (!t) return true;
  if (fertMode(cfg)) return id === startTree(cfg) || (st.fert?.[id] ?? 0) >= 1 || (st.trees ?? []).includes(id);
  if (seedMode(cfg)) return id === startTree(cfg) || (st.trees ?? []).includes(id);
  return segmentOpen(cfg, st, t.segment);
}
/** trees still locked, in yaml order */
export const lockedTrees = (cfg: Balancing, st: RState) => (cfg.research?.trees ?? []).filter(t => !treeOpen(cfg, st, t.id)).map(t => t.id);
/** the tree the next seed search opens: the chosen one if still locked, else the first locked one */
export function seedTarget(cfg: Balancing, st: RState) { const L = lockedTrees(cfg, st); return st.seed && L.includes(st.seed) ? st.seed : L[0] ?? null; }
/** research speed factor: Forschungstempo levels x character level (research.levelSpeed per level above 1) */
export function rSpeed(cfg: Balancing, st: RState) { const R = cfg.research!; return Math.pow(1 + R.speedPerLevel, st.speedLv) * (1 + (R.levelSpeed ?? 0) * Math.max(0, (st.lv ?? 1) - 1)); }
/** s of work the next seed costs now (whole team, 1 worker) */
export function seedCost(cfg: Balancing, st: RState) { const S = cfg.research?.seeds; if (!S) return 1; return Math.max(.1, (S.base + S.step * (st.trees ?? []).length) / rSpeed(cfg, st)); }
/** can be chosen now: not researched yet (Forschungstempo: always), its tree / segment is open and every node in needs is researched */
export function nodeAvailable(cfg: Balancing, st: RState, id: string) {
  const n = rNode(cfg, id); if (!n) return false;
  if (n.kind !== 'speed' && nodeDone(cfg, st, id)) return false;
  if ((seedMode(cfg) || fertMode(cfg)) && n.tree ? !treeOpen(cfg, st, n.tree) : !segmentOpen(cfg, st, n.segment)) return false;
  return (n.needs ?? []).every(k => nodeDone(cfg, st, k));
}
/** s of active work (1 worker) an idea costs now: baseTime x (1 + costGrowth)^researched / (1 + speedPerLevel)^speedLv x players^coopExponent
 *  (= the snapshot's base cost), x upgradeCost x (1 + upgradeGrowth)^(lv - 1) for an upgrade node */
export function researchCost(cfg: Balancing, st: RState, players = 1) {
  const R = cfg.research; if (!R) return 1;
  const coop = Math.pow(Math.max(1, players), R.coopExponent ?? 0);
  if (R.times) return coop / rSpeed(cfg, st); // 26.11.2026 fixed times: the "base cost" is only the speed divisor, nodeMul holds the seconds
  return Math.max(.1, R.baseTime * Math.pow(1 + R.costGrowth, st.n) / rSpeed(cfg, st) * coop);
}
/** 26.11.2026 field upgrade node (ref fld_<fruit>): the fruit, else null */
export const fieldUpOf = (n: ResearchNode | null | undefined) => n && n.kind === 'upgrade' && n.ref?.startsWith('fld_') ? n.ref.slice(4) : null;
/** cost factor of one node on top of the base cost. research.times: the fixed seconds of the node (weapon upgrades + upgradeStep per upgrade
 *  of that weapon already researched, field upgrades + fieldUpStep per level of the field); old flow: 1 for fields etc., upgrades cheaper */
export function nodeMul(cfg: Balancing, n: ResearchNode | null | undefined, st?: RState) {
  const R = cfg.research!, T = R?.times;
  if (T && n) {
    if (n.time && n.kind !== 'upgrade') return n.time;
    if (n.kind === 'weapon') return T.weapon;
    if (n.kind === 'field') return T.field;
    if (n.kind === 'building') return T.building;
    if (n.kind === 'upgrade') {
      const at = (L: number[] | undefined, k: number) => L?.length ? L[Math.min(k, L.length - 1)] : undefined; // 27.11.2026 flattening curves
      if (fieldUpOf(n)) return at(T.fieldUpList, (n.lv ?? 1) - 1) ?? T.fieldUp + T.fieldUpStep * ((n.lv ?? 1) - 1);
      // steps of this weapon before this one: its own chain below it + what other chains of the same weapon have done
      let other = 0;
      if (st) { const e = doneInfo(cfg, st.done).up.get(weaponOf(n)); if (e) other = e.all - (e.chain.get(n.chain ?? '') ?? 0); } // 28.11.2026 counted once per done list, not per node
      const done = other + (n.lv ?? 1) - 1;
      return at(T.upgradeList, done) ?? T.upgrade + T.upgradeStep * done;
    }
    return 1;
  }
  if (!n || n.kind !== 'upgrade') return 1;
  return (R.upgradeCost ?? 1) * Math.pow(1 + (R.upgradeGrowth ?? 0), (n.lv ?? 1) - 1);
}
export const nodeCost = (cfg: Balancing, st: RState, id: string | null | undefined, players = 1) => researchCost(cfg, st, players) * nodeMul(cfg, rNode(cfg, id), st);
/** progress 0..1 of a node towards its current cost */
export const nodeProgress = (cfg: Balancing, st: RState, id: string, players = 1) => Math.min(1, (st.work[id] ?? 0) / nodeCost(cfg, st, id, players));
/** what a finished node adds to the cost exponent (upgrades less, Forschungstempo per speedCounts) */
export function nodeCount(cfg: Balancing, n: ResearchNode) {
  const R = cfg.research!;
  return n.kind === 'upgrade' ? R.upgradeCount ?? 1 : n.kind === 'speed' ? (R.speedCounts !== false ? 1 : 0) : 1;
}

/** UI side (25.11.2026): the research state as far as the snapshot carries it (work rebuilt from the progress fractions); cost = base cost */
export function rsFromSnap(cfg: Balancing, s: Snap): RState & { popup: number; cost: number; seedP: number; seedCost: number; /** 27.11.2026 fertilizer in work (tree id), mushroom stock */ fertT: string | null; stock: number[] } {
  const ns = rNodes(cfg), rs = s.rs ?? [-1, 0, 0, 0, 1, -1], cost = rs[4] || 1, T = cfg.research?.trees ?? [];
  const work: Record<string, number> = {}, done: string[] = [];
  ns.forEach((n, i) => { if (s.rd?.[i] && !n.start && n.kind !== 'speed') done.push(n.id); });
  const trees = (s.rt ?? []).map(i => T[i]?.id).filter((x): x is string => !!x);
  const st: RState = { cur: rs[0] >= 0 ? ns[rs[0]]?.id ?? null : null, work, done, speedLv: rs[2] ?? 0, ready: !!rs[1], n: rs[3] ?? 0, trees, seed: (rs[6] ?? -1) >= 0 ? T[rs[6]]?.id ?? null : null, sw: 0, lv: s.lv ?? 1, fert: Object.fromEntries(T.map((t, i) => [t.id, s.fe?.[i] ?? 0])) };
  ns.forEach((n, i) => { const p = s.rp?.[i] ?? 0; if (p > 0) work[n.id] = p * cost * nodeMul(cfg, n, st); });
  const sc = fertMode(cfg) && st.seed ? fertCost(cfg, st, st.seed) : seedCost(cfg, st), sp = rs[7] ?? 0; st.sw = sp * sc;
  return { ...st, popup: rs[5] ?? -1, cost, seedP: sp, seedCost: sc, fertT: st.seed, stock: s.sm ?? [] };
}
