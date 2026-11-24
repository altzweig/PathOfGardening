// Spielstände (24.11.2026, Basti: "ich möchte Spielstand nicht immer neustarten müssen").
// The whole simulation is plain data, so a save is the Sim object graph written as JSON:
// shared / circular references (combo partners, enemy targets, carried fruit, hit sets) are kept as
// {$r: id}, Sets and Maps get their own tags. cfg is not saved: a loaded game always uses the current
// balancing.yaml. Fields added to the code later are filled in from a fresh Sim / player on load.
import type { Balancing } from './config';
import { Sim } from './sim/sim';
import type { Look } from './look';

const INDEX = 'pog-classic.saves';
const KEY = (id: string) => 'pog-classic.save.' + id;
/** a few runs are kept, the oldest one goes */
const KEEP = 3;
const VERSION = 1;

export interface SaveInfo { id: string; wave: number; level: number; t: number; name: string; started: number }

type Enc = unknown;
/** keys that are never written: config (taken from balancing.yaml), events of the current frame */
const SKIP = new Set(['cfg', 'events']);

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
export function saveGame(id: string, started: number, sim: Sim, look: Look): boolean {
  const info: SaveInfo = { id, wave: sim.wave, level: sim.level, t: Date.now(), name: look?.name ?? '', started };
  let json: string;
  try { json = JSON.stringify({ v: VERSION, info, look, sim: encode(sim) }); } catch (e) { console.warn('save: encode', e); return false; }
  const put = () => { localStorage.setItem(KEY(id), json); writeIndex([info, ...listSaves().filter(s => s.id !== id)]); };
  try { put(); }
  catch {
    // full: drop the other saves and try once more
    try { for (const s of listSaves()) if (s.id !== id) deleteSave(s.id); put(); } catch (e) { console.warn('save: storage', e); return false; }
  }
  for (const s of listSaves().slice(KEEP)) deleteSave(s.id);
  return true;
}

export function loadGame(id: string, cfg: Balancing): { sim: Sim; look: Look | null; info: SaveInfo } | null {
  let raw: any;
  try { raw = JSON.parse(localStorage.getItem(KEY(id)) || 'null'); } catch { return null; }
  if (!raw || raw.v !== VERSION || !raw.sim) return null;
  try {
    const data = decode(raw.sim);
    const sim = new Sim(cfg);
    const tmpl = new Sim(cfg); const pDef = tmpl.addPlayer(0, 0);
    for (const p of (data.players ?? []) as any[]) fillMissing(p, pDef);
    for (const k of Object.keys(data)) (sim as any)[k] = data[k];
    sim.cfg = cfg; sim.events = []; sim.paused = false; sim.tutPause = false;
    for (const p of sim.players) p.fresh = true; // input counters of the old session are not presses
    return { sim, look: raw.look ?? null, info: raw.info };
  } catch (e) { console.warn('load', e); return null; }
}
