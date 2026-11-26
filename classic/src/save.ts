// Spielstände (24.11.2026, Basti: "ich möchte Spielstand nicht immer neustarten müssen").
// The whole simulation is plain data, so a save is the Sim object graph written as JSON:
// shared / circular references (combo partners, enemy targets, carried fruit, hit sets) are kept as
// {$r: id}, Sets and Maps get their own tags. cfg is not saved: a loaded game always uses the current
// balancing.yaml. Fields added to the code later are filled in from a fresh Sim / player on load.
import type { Balancing, FruitType, SkillId } from './config';
import { Sim } from './sim/sim';
import { newRState, rNodes } from './sim/research';
import type { Look } from './look';

const INDEX = 'pog-classic.saves';
const KEY = (id: string) => 'pog-classic.save.' + id;
/** a few runs are kept, the oldest one goes */
const KEEP = 3;
/** 2 (26.11.2026): Werkbank-Techtree (rs, walls, rsLvl, rsPend, benchSlot; Player rsUi, rsLock, rsPlace, benchWork). Version 1 is migrated, see migrateV1 */
const VERSION = 2;

export interface SaveInfo { id: string; wave: number; level: number; t: number; name: string; started: number; /** co-op game saved by the host: number of players */ coop?: number }
/** co-op save (25.11.2026): each guest's token, so it gets its own figure back when it joins the loaded game */
export interface CoopSeat { id: number; tok: string; color: number }

type Enc = unknown;
/** keys that are never written: config (taken from balancing.yaml), events of the current frame */
/** 26.11.2026 + the Steinkohle lookup tables (rebuilt from walls after loading: wallDirty) */
const SKIP = new Set(['cfg', 'events', 'wallGrid', 'wallLinks', 'wallBox']);

function encode(root: object): Enc {
  const ids = new Map<object, number>(); let next = 1;
  const enc = (v: unknown, key = ''): Enc => {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'symbol') return undefined;
      if (typeof v === 'number' && !Number.isFinite(v)) return { $n: String(v) };
      return v;
    }
    if (key && SKIP.has(key)) return undefined;
    const seen = ids.get(v); if (seen) return { $r: seen };
    const id = next++; ids.set(v, id);
    if (Array.isArray(v)) return { $i: id, $a: v.map(x => enc(x) ?? null) };
    if (v instanceof Set) return { $i: id, $s: [...v].map(x => enc(x)) };
    if (v instanceof Map) return { $i: id, $m: [...v].map(([k, x]) => [enc(k), enc(x)]) };
    const o: Record<string, Enc> = {};
    for (const k of Object.keys(v)) { const e = enc((v as any)[k], k); if (e !== undefined) o[k] = e; }
    return { $i: id, $o: o };
  };
  return enc(root);
}

function decode(data: Enc): any {
  const ids = new Map<number, any>();
  // pass 1: create every container so forward references resolve
  const make = (v: any) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    if (v.$i === undefined) return;
    if (v.$a) { ids.set(v.$i, []); v.$a.forEach(make); }
    else if (v.$s) { ids.set(v.$i, new Set()); v.$s.forEach(make); }
    else if (v.$m) { ids.set(v.$i, new Map()); v.$m.forEach((kv: any[]) => kv.forEach(make)); }
    else if (v.$o) { ids.set(v.$i, {}); Object.values(v.$o).forEach(make); }
  };
  make(data);
  const val = (v: any): any => {
    if (v === null || typeof v !== 'object') return v;
    if (v.$n !== undefined) return Number(v.$n);
    if (v.$r !== undefined) return ids.get(v.$r);
    return ids.get(v.$i);
  };
  // pass 2: fill them
  const fill = (v: any) => {
    if (!v || typeof v !== 'object' || v.$i === undefined) return;
    const t = ids.get(v.$i);
    if (v.$a) { for (const x of v.$a) { t.push(val(x)); fill(x); } }
    else if (v.$s) { for (const x of v.$s) { t.add(val(x)); fill(x); } }
    else if (v.$m) { for (const [k, x] of v.$m) { t.set(val(k), val(x)); fill(k); fill(x); } }
    else if (v.$o) { for (const k of Object.keys(v.$o)) { t[k] = val(v.$o[k]); fill(v.$o[k]); } }
  };
  fill(data);
  return val(data);
}

/** fill keys a newer version of the code added (plain objects only, one level into records of objects) */
function fillMissing(target: any, def: any, depth = 0) {
  if (!target || !def || typeof target !== 'object' || typeof def !== 'object' || Array.isArray(def) || def instanceof Set || def instanceof Map) return;
  for (const k of Object.keys(def)) {
    if (!(k in target)) target[k] = def[k];
    else if (depth < 2) fillMissing(target[k], def[k], depth + 1);
  }
}

export function listSaves(): SaveInfo[] {
  try { const l = JSON.parse(localStorage.getItem(INDEX) || '[]'); return Array.isArray(l) ? l.sort((a, b) => b.t - a.t) : []; }
  catch { return []; }
}
function writeIndex(l: SaveInfo[]) { try { localStorage.setItem(INDEX, JSON.stringify(l)); } catch { /* no storage */ } }

export function deleteSave(id: string) {
  try { localStorage.removeItem(KEY(id)); } catch { /* ignore */ }
  writeIndex(listSaves().filter(s => s.id !== id));
}

/** write the running game; returns false if the browser refused (storage full / private mode) */
export function saveGame(id: string, started: number, sim: Sim, look: Look, coop?: CoopSeat[]): boolean {
  const info: SaveInfo = { id, wave: sim.wave, level: sim.level, t: Date.now(), name: look?.name ?? '', started, ...(coop ? { coop: sim.players.length + coop.filter(c => !sim.player(c.id)).length } : {}) };
  let json: string;
  try { json = JSON.stringify({ v: VERSION, info, look, coop, sim: encode(sim) }); } catch (e) { console.warn('save: encode', e); return false; }
  const put = () => { localStorage.setItem(KEY(id), json); writeIndex([info, ...listSaves().filter(s => s.id !== id)]); };
  try { put(); }
  catch {
    // full: drop the other saves and try once more
    try { for (const s of listSaves()) if (s.id !== id) deleteSave(s.id); put(); } catch (e) { console.warn('save: storage', e); return false; }
  }
  for (const s of listSaves().slice(KEEP)) deleteSave(s.id);
  return true;
}

export function loadGame(id: string, cfg: Balancing): { sim: Sim; look: Look | null; info: SaveInfo; coop?: CoopSeat[] } | null {
  let raw: any;
  try { raw = JSON.parse(localStorage.getItem(KEY(id)) || 'null'); } catch { return null; }
  if (!raw || (raw.v !== VERSION && raw.v !== 1) || !raw.sim) return null;
  try {
    const data = decode(raw.sim);
    const sim = new Sim(cfg);
    const tmpl = new Sim(cfg); const pDef = tmpl.addPlayer(0, 0);
    for (const p of (data.players ?? []) as any[]) fillMissing(p, pDef);
    for (const k of Object.keys(data)) (sim as any)[k] = data[k];
    sim.cfg = cfg; sim.events = []; sim.paused = false; sim.tutPause = false;
    for (const p of sim.players) p.fresh = true; // input counters of the old session are not presses
    sim.rewindFor = null;
    (sim as any).wallDirty = true; (sim as any).wallGrid = new Map(); (sim as any).wallLinks = new Map(); // 26.11.2026 rebuilt from walls
    if (raw.v === 1 && !('rs' in data) && sim.rsMode) migrateV1(sim, cfg);
    // 26.11.2026 no research UI open after loading (the UI starts closed); a field that was being placed waits at the bench
    for (const p of sim.players) { sim.rsDrop(p.id); p.rsLock = 0; }
    return { sim, look: raw.look ?? null, info: raw.info, coop: Array.isArray(raw.coop) ? raw.coop : undefined };
  } catch (e) { console.warn('load', e); return null; }
}

/** 26.11.2026 version 1 (XP / level-up game with berry start) loaded while balancing.yaml says progression: research:
 *  the game goes on as a research game. Everything the save has stays (fields, weapons incl. their upgrades, buildings);
 *  the techtree marks every field type in the garden and every learned weapon as researched (they count for the price of
 *  the next idea), every player gets the Erbsenpistole, a missing Erbsenfeld waits at the bench (placed at the first touch).
 *  The Werkbank stands on its fixed slot; a field there moves to the nearest free garden slot. Level-up cards, the start
 *  choice and the merchant of the old game are closed. */
function migrateV1(sim: Sim, cfg: Balancing) {
  const R = cfg.research!, S = sim as any, slots = S.slots as { q: number; r: number; x: number; z: number; chest?: boolean; bench?: boolean; forest?: boolean }[];
  let bi = slots.findIndex(s => !s.forest && s.q === R.bench.slot[0] && s.r === R.bench.slot[1]);
  if (bi >= 0) {
    const f = sim.fieldAt(bi);
    if (f) { // its field moves out of the way (nearest free garden slot)
      const free = slots.map((_, i) => i).filter(i => !slots[i].forest && !slots[i].chest && i !== bi && !sim.fieldAt(i)).sort((a, b) => Math.hypot(slots[a].x - slots[bi].x, slots[a].z - slots[bi].z) - Math.hypot(slots[b].x - slots[bi].x, slots[b].z - slots[bi].z))[0];
      if (free === undefined) bi = -1; else { f.slot = free; f.x = slots[free].x; f.z = slots[free].z; }
    }
  }
  for (const s of slots) delete s.bench;
  if (bi >= 0) slots[bi].bench = true;
  sim.benchSlot = bi;
  const rs = newRState(), types = new Set(sim.fields.filter(f => f.alive).map(f => f.type as string)), learned = new Set<string>();
  for (const p of sim.players) for (const k of Object.keys(p.skills)) if (p.skills[k as SkillId].learned) learned.add(k);
  for (const n of rNodes(cfg)) if (!n.start && n.kind !== 'speed' && n.ref && ((n.kind === 'field' && types.has(n.ref)) || (n.kind === 'weapon' && learned.has(n.ref)))) rs.done.push(n.id);
  rs.n = rs.done.length; sim.rs = rs;
  for (const p of sim.players) { if (!p.skills.pea.learned) sim.giveWeapon(p, 'pea', R.startShots ?? 10); p.offers = null; p.placing = null; p.picked = false; p.shopOpen = false; p.shop = null; }
  const pea = cfg.arena.startField?.type ?? 'pea';
  sim.rsPend = types.has(pea) ? [] : [pea as FruitType];
  S.pendingLv = 0; S.startPick = false; S.started = true; S.merchant = null; sim.rsLvl = false;
  if (sim.phase === 'lvl') sim.phase = 'play';
}
