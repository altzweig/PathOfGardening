// Save games (20.11.2026): several named saves, kept locally in the browser (localStorage, nothing goes to a server).
// An index with name / day / level / time per save, the state of every save under its own key.
// A save made during the day also keeps the running day (clock, player, today's yield) so it resumes where it was.
import type { FarmCfg } from './config';
import { FarmState, loadState, normalizeState } from './state';
import type { DaySnap } from './sim';

export interface SaveMeta { id: string; name: string; created: number; updated: number; day: number; level: number; money: number }
export interface SaveData { s: FarmState; snap: DaySnap | null }

const INDEX = 'pog-saves-v1', SLOT = 'pog-save-', OLD = 'pog-farm-v1';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

/** all saves, newest first */
export function listSaves(): SaveMeta[] {
  try { const a = JSON.parse(get(INDEX) ?? '[]') as SaveMeta[]; return Array.isArray(a) ? a.sort((x, y) => y.updated - x.updated) : []; }
  catch { return []; }
}
const writeIndex = (a: SaveMeta[]) => set(INDEX, JSON.stringify(a));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** a name that is not taken yet ("Hof", "Hof 2", ...) */
export function freeName(base: string) {
  const taken = new Set(listSaves().map(m => m.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}
export function createSave(name: string, s: FarmState): SaveMeta {
  const now = Date.now(), m: SaveMeta = { id: newId(), name: name.trim().slice(0, 24) || freeName('Hof'), created: now, updated: now, day: s.day, level: s.level, money: s.money };
  writeSave(m.id, s, null, m);
  return m;
}
/** writes the state of a save (and its line in the index); false if the browser refused (full / private mode) */
export function writeSave(id: string, s: FarmState, snap: DaySnap | null, meta?: SaveMeta) {
  const all = listSaves(), m = meta ?? all.find(x => x.id === id); if (!m) return false;
  const ok = set(SLOT + id, JSON.stringify({ s, snap } satisfies SaveData));
  if (!ok) return false;
  Object.assign(m, { updated: Date.now(), day: s.day, level: s.level, money: s.money });
  writeIndex([m, ...all.filter(x => x.id !== id)]);
  return true;
}
export function readSave(cfg: FarmCfg, id: string): SaveData | null {
  try {
    const raw = get(SLOT + id); if (!raw) return null;
    const d = JSON.parse(raw) as SaveData; const s = normalizeState(cfg, d.s); if (!s) return null;
    return { s, snap: s.phase === 'day' ? d.snap ?? null : null };
  } catch { return null; }
}
export function deleteSave(id: string) { del(SLOT + id); writeIndex(listSaves().filter(x => x.id !== id)); }
export function renameSave(id: string, name: string) {
  const all = listSaves(), m = all.find(x => x.id === id), n = name.trim().slice(0, 24); if (!m || !n) return;
  m.name = n; writeIndex(all);
}

/** the single save of the first farm version becomes a named save once */
export function migrateOldSave(cfg: FarmCfg, name: string) {
  if (!get(OLD)) return;
  const s = loadState(cfg);
  if (s) { const m = createSave(freeName(name), s); m.created = m.updated; }
  del(OLD);
}
