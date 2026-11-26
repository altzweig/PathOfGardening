// Werkbank-Techtree (25.11.2026): pure rules of the research tree, shared by the simulation (host) and the UI (any client,
// rebuilt from the snapshot with rsFromSnap). The tree itself lives in balancing.yaml (research.nodes / research.segments).
import type { Balancing, ResearchNode } from '../config';
import type { Snap } from './snap';

/** team-wide research state (one per game): idea being researched, s of work per node (kept when switching), researched node ids
 *  (fields / weapons; start nodes are not listed), Forschungstempo level, current idea complete (waits at the bench), researched ideas (cost exponent) */
export interface RState { cur: string | null; work: Record<string, number>; done: string[]; speedLv: number; ready: boolean; n: number }
export const newRState = (): RState => ({ cur: null, work: {}, done: [], speedLv: 0, ready: false, n: 0 });

export const rNodes = (cfg: Balancing): ResearchNode[] => cfg.research?.nodes ?? [];
export const rNode = (cfg: Balancing, id: string | null | undefined) => id ? rNodes(cfg).find(n => n.id === id) ?? null : null;
export const rIndex = (cfg: Balancing, id: string | null | undefined) => id ? rNodes(cfg).findIndex(n => n.id === id) : -1;

/** researched: start node or finished (Forschungstempo is never "done", it can always be researched again) */
export function nodeDone(cfg: Balancing, st: RState, id: string) {
  const n = rNode(cfg, id); if (!n || n.kind === 'speed') return false;
  return !!n.start || st.done.includes(id);
}
/** segment open: its rule (research.segments) is met by researched non-start nodes of the segments in `from` */
export function segmentOpen(cfg: Balancing, st: RState, seg: number) {
  const R = (cfg.research?.segments ?? []).find(s => s.id === seg); if (!R) return true;
  const from = R.from ?? [], got = (kind: string) => rNodes(cfg).filter(n => n.kind === kind && !n.start && from.includes(n.segment) && st.done.includes(n.id)).length;
  return got('field') >= (R.needFields ?? 0) && got('weapon') >= (R.needWeapons ?? 0);
}
/** can be chosen now: not researched yet (Forschungstempo: always), its segment is open and every node in needs is researched */
export function nodeAvailable(cfg: Balancing, st: RState, id: string) {
  const n = rNode(cfg, id); if (!n) return false;
  if (n.kind !== 'speed' && nodeDone(cfg, st, id)) return false;
  if (!segmentOpen(cfg, st, n.segment)) return false;
  return (n.needs ?? []).every(k => nodeDone(cfg, st, k));
}
/** s of active work (1 worker) the next idea costs: baseTime x (1 + costGrowth)^researched / (1 + speedPerLevel)^speedLv x players^coopExponent */
export function researchCost(cfg: Balancing, st: RState, players = 1) {
  const R = cfg.research; if (!R) return 1;
  return Math.max(.1, R.baseTime * Math.pow(1 + R.costGrowth, st.n) / Math.pow(1 + R.speedPerLevel, st.speedLv) * Math.pow(Math.max(1, players), R.coopExponent ?? 0));
}
/** progress 0..1 of a node towards the current cost */
export const nodeProgress = (cfg: Balancing, st: RState, id: string, players = 1) => Math.min(1, (st.work[id] ?? 0) / researchCost(cfg, st, players));

/** UI side (25.11.2026): the research state as far as the snapshot carries it (work rebuilt from the progress fractions) */
export function rsFromSnap(cfg: Balancing, s: Snap): RState & { popup: number; cost: number } {
  const ns = rNodes(cfg), rs = s.rs ?? [-1, 0, 0, 0, 1, -1], cost = rs[4] || 1;
  const work: Record<string, number> = {}, done: string[] = [];
  ns.forEach((n, i) => { const p = s.rp?.[i] ?? 0; if (p > 0) work[n.id] = p * cost; if (s.rd?.[i] && !n.start && n.kind !== 'speed') done.push(n.id); });
  return { cur: rs[0] >= 0 ? ns[rs[0]]?.id ?? null : null, work, done, speedLv: rs[2] ?? 0, ready: !!rs[1], n: rs[3] ?? 0, popup: rs[5] ?? -1, cost };
}
