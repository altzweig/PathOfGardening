// World editor data (welt.html): placed objects + painted ground + game logic, saved as public/world/welt.json.
// The game reads the file at start; without it the farm is generated as before (balancing.yaml hof:).
// Version 2 (21.11.2026): logic (map size, boundaries, fields, spawns, house, objects) + layered ground.
// ?welt=entwurf (from the editor's "Im Spiel testen") loads the editor's browser draft instead.
import { WorldPaint } from './paint';
import { Logic, cleanLogic } from './logic';

/** one placed object: model, position, turn (rad), scale, fixed lean, tint (foliage) or shade (wood, stone) */
export interface PropRec { m: string; x: number; z: number; y?: number; ry: number; s: number; tx?: number; tz?: number; c?: string; sh?: number }
export interface WorldFile {
  version: 1 | 2; saved?: string;
  /** null = the forest is generated (procedural, version 1 only) */
  props: PropRec[] | null;
  /** painted ground, deflate + base64 of the raw bytes (see WorldPaint); version 2 adds base + layers */
  paint: ({ size: number; extent: number; data: string } & Partial<ReturnType<WorldPaint['meta']>>) | null;
  logic?: Logic;
}
/** logic null = an old file (version 1): the editor turns it into a world with the old farm as logic */
export interface World { props: PropRec[] | null; paint: WorldPaint | null; logic: Logic | null }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
export function cleanProp(p: PropRec): PropRec {
  const o: PropRec = { m: p.m, x: r3(p.x), z: r3(p.z), ry: r3(p.ry), s: r3(p.s) };
  if (p.y) o.y = r3(p.y); if (p.tx) o.tx = r3(p.tx); if (p.tz) o.tz = r3(p.tz);
  if (p.c) o.c = p.c; if (p.sh !== undefined && p.sh !== 1) o.sh = r3(p.sh);
  return o;
}

async function pipe(bytes: Uint8Array, s: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(s)); return new Uint8Array(await out.arrayBuffer());
}
function b64(u: Uint8Array) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s: string) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

export async function encodeWorld(w: { props: PropRec[]; paint: WorldPaint; logic: Logic }): Promise<WorldFile> {
  return {
    version: 2, saved: new Date().toISOString(),
    logic: cleanLogic(w.logic),
    props: w.props.map(cleanProp),
    paint: { ...w.paint.meta(), data: b64(await pipe(w.paint.toBytes(), new CompressionStream('deflate'))) },
  };
}
export async function decodeWorld(f: WorldFile): Promise<World> {
  let paint: WorldPaint | null = null;
  const raw = f.paint?.data ? await pipe(unb64(f.paint.data), new DecompressionStream('deflate')) : null;
  if (f.version === 2 && f.logic) {
    paint = raw && f.paint?.layers ? WorldPaint.fromBytes(f.paint as ReturnType<WorldPaint['meta']>, raw) : new WorldPaint(1024, f.logic.size);
    if (f.paint?.base) paint.base = f.paint.base;
    return { props: f.props ?? [], paint, logic: f.logic };
  }
  if (raw && f.paint) paint = WorldPaint.fromV1(f.paint.size, f.paint.extent, raw);
  return { props: f.props ?? null, paint, logic: null };
}

// ---------------- browser draft (IndexedDB: the file can be a few MB while painting) ----------------
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open('pog-welt', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function saveDraft(f: WorldFile | null) {
  const d = await db();
  await new Promise<void>((res, rej) => { const t = d.transaction('kv', 'readwrite'); if (f) t.objectStore('kv').put(f, 'draft'); else t.objectStore('kv').delete('draft'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function loadDraft(): Promise<WorldFile | null> {
  try {
    const d = await db();
    return await new Promise(res => { const r = d.transaction('kv').objectStore('kv').get('draft'); r.onsuccess = () => res((r.result as WorldFile) ?? null); r.onerror = () => res(null); });
  } catch { return null; }
}

/** the world file of the game (public/world/welt.json), null when there is none */
export async function fetchWorldFile(): Promise<WorldFile | null> {
  try { const r = await fetch('./world/welt.json', { cache: 'no-store' }); if (!r.ok) return null; const f = await r.json() as WorldFile; return f?.version ? f : null; }
  catch { return null; }
}
/** what the game plays on: the draft with ?welt=entwurf, otherwise the file in the repo */
export async function loadWorld(): Promise<World | null> {
  const draft = new URLSearchParams(location.search).get('welt') === 'entwurf';
  const f = draft ? (await loadDraft()) ?? await fetchWorldFile() : await fetchWorldFile();
  if (!f) return null;
  try { return await decodeWorld(f); } catch (e) { console.error('welt.json', e); return null; }
}
