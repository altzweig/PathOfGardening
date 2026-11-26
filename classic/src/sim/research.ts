// Werkbank-Techtree (25.11.2026): pure rules of the research tree, shared by the simulation (host) and the UI (any client,
// rebuilt from the snapshot with rsFromSnap). The tree itself lives in balancing.yaml (research.nodes / research.segments).
// 26.11.2026 Einzelbäume: one small tree per fruit (research.trees = tabs), buildings and weapon upgrades as nodes. An upgrade entry
// with count N becomes a chain of N nodes (id.1 .. id.N, each needs the one before): same upgrades one after another, different ones side by side.
import type { Balancing, BuildingType, ResearchNode } from '../config';
import type { Snap } from './snap';

/** team-wide research state (one per game): idea being researched, s of work per node (kept when switching), researched node ids
 *  (start nodes are not listed), Forschungstempo level, current idea complete (waits at the bench), researched ideas (cost exponent, upgrades count upgradeCount) */
export interface RState { cur: string | null; work: Record<string, number>; done: string[]; speedLv: number; ready: boolean; n: number }
export const newRState = (): RState => ({ cur: null, work: {}, done: [], speedLv: 0, ready: false, n: 0 });

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
export const rNode = (cfg: Balancing, id: string | null | undefined) => id ? rNodes(cfg).find(n => n.id === id) ?? null : null;
export const rIndex = (cfg: Balancing, id: string | null | undefined) => id ? rNodes(cfg).findIndex(n => n.id === id) : -1;
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
  return !!n.start || st.done.includes(id);
}
/** segment open: its rule (research.segments) is met by researched non-start nodes of the segments in `from` */
export function segmentOpen(cfg: Balancing, st: RState, seg: number) {
  const R = (cfg.research?.segments ?? []).find(s => s.id === seg); if (!R) return true;
  const from = R.from ?? [], got = (fields: boolean) => rNodes(cfg).filter(n => (fields ? isPlaceNode(n) : n.kind === 'weapon') && !n.start && from.includes(n.segment) && st.done.includes(n.id)).length;
  return got(true) >= (R.needFields ?? 0) && got(false) >= (R.needWeapons ?? 0);
}
/** can be chosen now: not researched yet (Forschungstempo: always), its segment is open and every node in needs is researched */
export function nodeAvailable(cfg: Balancing, st: RState, id: string) {
  const n = rNode(cfg, id); if (!n) return false;
  if (n.kind !== 'speed' && nodeDone(cfg, st, id)) return false;
  if (!segmentOpen(cfg, st, n.segment)) return false;
  return (n.needs ?? []).every(k => nodeDone(cfg, st, k));
}
/** s of active work (1 worker) an idea costs now: baseTime x (1 + costGrowth)^researched / (1 + speedPerLevel)^speedLv x players^coopExponent
 *  (= the snapshot's base cost), x upgradeCost x (1 + upgradeGrowth)^(lv - 1) for an upgrade node */
export function researchCost(cfg: Balancing, st: RState, players = 1) {
  const R = cfg.research; if (!R) return 1;
  return Math.max(.1, R.baseTime * Math.pow(1 + R.costGrowth, st.n) / Math.pow(1 + R.speedPerLevel, st.speedLv) * Math.pow(Math.max(1, players), R.coopExponent ?? 0));
}
/** cost factor of one node on top of the base cost (1 for fields, buildings, weapons, Forschungstempo) */
export function nodeMul(cfg: Balancing, n: ResearchNode | null | undefined) {
  if (!n || n.kind !== 'upgrade') return 1;
  const R = cfg.research!; return (R.upgradeCost ?? 1) * Math.pow(1 + (R.upgradeGrowth ?? 0), (n.lv ?? 1) - 1);
}
export const nodeCost = (cfg: Balancing, st: RState, id: string | null | undefined, players = 1) => researchCost(cfg, st, players) * nodeMul(cfg, rNode(cfg, id));
/** progress 0..1 of a node towards its current cost */
export const nodeProgress = (cfg: Balancing, st: RState, id: string, players = 1) => Math.min(1, (st.work[id] ?? 0) / nodeCost(cfg, st, id, players));
/** what a finished node adds to the cost exponent (upgrades less, Forschungstempo per speedCounts) */
export function nodeCount(cfg: Balancing, n: ResearchNode) {
  const R = cfg.research!;
  return n.kind === 'upgrade' ? R.upgradeCount ?? 1 : n.kind === 'speed' ? (R.speedCounts !== false ? 1 : 0) : 1;
}

/** UI side (25.11.2026): the research state as far as the snapshot carries it (work rebuilt from the progress fractions); cost = base cost */
export function rsFromSnap(cfg: Balancing, s: Snap): RState & { popup: number; cost: number } {
  const ns = rNodes(cfg), rs = s.rs ?? [-1, 0, 0, 0, 1, -1], cost = rs[4] || 1;
  const work: Record<string, number> = {}, done: string[] = [];
  ns.forEach((n, i) => { const p = s.rp?.[i] ?? 0; if (p > 0) work[n.id] = p * cost * nodeMul(cfg, n); if (s.rd?.[i] && !n.start && n.kind !== 'speed') done.push(n.id); });
  return { cur: rs[0] >= 0 ? ns[rs[0]]?.id ?? null : null, work, done, speedLv: rs[2] ?? 0, ready: !!rs[1], n: rs[3] ?? 0, popup: rs[5] ?? -1, cost };
}
