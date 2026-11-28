// Co-op wire format (25.11.2026, Koop-Netcode). Snapshots go as binary deltas against a snapshot the guest
// confirmed (baseline ACK), entity positions quantized (int16, 1 cm), angles as uint8, fractions as uint8.
// Everything else is written lossless with a small tagged encoder (msgpack-like), so nothing changes meaning.
//
// The host first turns a Snap into its quantized form ("Q"): exactly the values the guest will decode. Deltas compare
// Q values, the hash (desync check) runs over the full encoding of Q on both sides.
import type { Intent, Snap } from '../sim/snap';
import { WEAPONS } from '../config';

// ---------------- byte writer / reader ----------------
const te = new TextEncoder(), td = new TextDecoder();
export class W {
  buf = new Uint8Array(4096); dv = new DataView(this.buf.buffer); n = 0;
  private strs = new Map<string, number>();
  private room(k: number) {
    if (this.n + k <= this.buf.length) return;
    let l = this.buf.length * 2; while (l < this.n + k) l *= 2;
    const b = new Uint8Array(l); b.set(this.buf.subarray(0, this.n)); this.buf = b; this.dv = new DataView(b.buffer);
  }
  u8(v: number) { this.room(1); this.buf[this.n++] = v & 255; }
  u16(v: number) { this.room(2); this.dv.setUint16(this.n, v, true); this.n += 2; }
  i16(v: number) { this.room(2); this.dv.setInt16(this.n, v, true); this.n += 2; }
  u32(v: number) { this.room(4); this.dv.setUint32(this.n, v >>> 0, true); this.n += 4; }
  f32(v: number) { this.room(4); this.dv.setFloat32(this.n, v, true); this.n += 4; }
  f64(v: number) { this.room(8); this.dv.setFloat64(this.n, v, true); this.n += 8; }
  /** unsigned varint up to 2^53 */
  vu(v: number) { this.room(8); while (v >= 128) { this.buf[this.n++] = (v % 128) | 128; v = Math.floor(v / 128); } this.buf[this.n++] = v; }
  vi(v: number) { this.vu(v >= 0 ? v * 2 : -v * 2 - 1); }
  str(s: string) {
    const k = this.strs.get(s);
    if (k !== undefined) { this.vu(k * 2 + 1); return; } // seen in this message: index
    this.strs.set(s, this.strs.size);
    const b = te.encode(s); this.vu(b.length * 2); this.room(b.length); this.buf.set(b, this.n); this.n += b.length;
  }
  out() { return this.buf.slice(0, this.n); }
}
export class R {
  dv: DataView; n = 0; private strs: string[] = [];
  constructor(public buf: Uint8Array) { this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  get left() { return this.buf.length - this.n; }
  u8() { return this.buf[this.n++]; }
  u16() { const v = this.dv.getUint16(this.n, true); this.n += 2; return v; }
  i16() { const v = this.dv.getInt16(this.n, true); this.n += 2; return v; }
  u32() { const v = this.dv.getUint32(this.n, true); this.n += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.n, true); this.n += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.n, true); this.n += 8; return v; }
  vu() { let v = 0, m = 1, b: number; do { b = this.buf[this.n++]; v += (b & 127) * m; m *= 128; } while (b & 128); return v; }
  vi() { const u = this.vu(); return u % 2 ? -(u + 1) / 2 : u / 2; }
  str() {
    const h = this.vu(); if (h % 2) return this.strs[(h - 1) / 2];
    const l = h / 2, s = td.decode(this.buf.subarray(this.n, this.n + l)); this.n += l; this.strs.push(s); return s;
  }
}

// ---------------- lossless tagged values ----------------
const T = { undef: 0, nul: 1, no: 2, yes: 3, uint: 4, neg: 5, centi: 6, f32: 7, f64: 8, str: 9, arr: 10, obj: 11 } as const;
export function wAny(w: W, v: unknown) {
  if (v === undefined) return w.u8(T.undef);
  if (v === null) return w.u8(T.nul);
  if (v === false) return w.u8(T.no);
  if (v === true) return w.u8(T.yes);
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 2 ** 52) { if (v >= 0) { w.u8(T.uint); w.vu(v); } else { w.u8(T.neg); w.vu(-v); } return; }
    const c = Math.round(v * 100);
    if (Number.isFinite(v) && Math.abs(c) < 2 ** 40 && c / 100 === v) { w.u8(T.centi); w.vi(c); return; } // r2() values: 1-3 bytes
    if (Math.fround(v) === v) { w.u8(T.f32); w.f32(v); return; }
    w.u8(T.f64); w.f64(v); return;
  }
  if (typeof v === 'string') { w.u8(T.str); w.str(v); return; }
  if (Array.isArray(v)) { w.u8(T.arr); w.vu(v.length); for (const x of v) wAny(w, x); return; }
  if (typeof v === 'object') {
    const ks = Object.keys(v as object); w.u8(T.obj); w.vu(ks.length);
    for (const k of ks) { w.str(k); wAny(w, (v as any)[k]); }
    return;
  }
  w.u8(T.undef);
}
export function rAny(r: R): any {
  const t = r.u8();
  switch (t) {
    case T.undef: return undefined; case T.nul: return null; case T.no: return false; case T.yes: return true;
    case T.uint: return r.vu(); case T.neg: return -r.vu(); case T.centi: return r.vi() / 100;
    case T.f32: return r.f32(); case T.f64: return r.f64(); case T.str: return r.str();
    case T.arr: { const n = r.vu(), a = new Array(n); for (let i = 0; i < n; i++) a[i] = rAny(r); return a; }
    case T.obj: { const n = r.vu(), o: any = {}; for (let i = 0; i < n; i++) { const k = r.str(); o[k] = rAny(r); } return o; }
  }
  throw new Error('net: bad tag ' + t);
}

// ---------------- quantized field types ----------------
// u unsigned int, p position (int16, 1 cm), a angle (uint8), f fraction 0..1 (uint8), s string, g anything (lossless)
type FT = 'u' | 'p' | 'a' | 'f' | 's' | 'g';
const TAU = Math.PI * 2;
const qp = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * 100))) / 100;
// Fractions use 0..254 (254 = 1.0) so that 255 can mark "not a fraction"; angles use 0..254 of 256 steps likewise
// (index 255 = 358.6° is folded onto 0). Both sides go through the same functions, so Q values match.
const qf2 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 254) / 254;
const qa2 = (v: number) => { const i = ((Math.round(v / TAU * 256) % 256) + 256) % 256; return (i === 255 ? 0 : i) * TAU / 256; };
function quant2(t: FT, v: any): any {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  if (t === 'p') return Math.abs(v) <= 327.67 ? qp(v) : v;
  if (t === 'a') return qa2(v);
  if (t === 'f') return v >= 0 && v <= 1 ? qf2(v) : v;
  return v;
}
function wField2(w: W, t: FT, v: any) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (t === 'p' && Math.abs(v) <= 327.67) { w.i16(Math.round(v * 100)); return; }
    if (t === 'a') { w.u8(Math.round(v / TAU * 256) % 256); return; } // v is already qa2'd: index 0..254
    if (t === 'f' && v >= 0 && v <= 1) { w.u8(Math.round(v * 254)); return; }
    if (t === 'u' && Number.isInteger(v) && v >= 0) { w.vu(v + 1); return; }
  }
  if (t === 'p') { w.i16(-32768); wAny(w, v); return; }
  if (t === 'a' || t === 'f') { w.u8(255); wAny(w, v); return; }
  if (t === 'u') { w.vu(0); wAny(w, v); return; }
  if (t === 's' && typeof v === 'string') { w.u8(1); w.str(v); return; }
  if (t === 's') { w.u8(0); wAny(w, v); return; }
  wAny(w, v);
}
function rField2(r: R, t: FT): any {
  if (t === 'p') { const i = r.i16(); return i === -32768 ? rAny(r) : i / 100; }
  if (t === 'a') { const i = r.u8(); return i === 255 ? rAny(r) : i * TAU / 256; }
  if (t === 'f') { const i = r.u8(); return i === 255 ? rAny(r) : i / 254; }
  if (t === 'u') { const i = r.vu(); return i === 0 ? rAny(r) : i - 1; }
  if (t === 's') return r.u8() ? r.str() : rAny(r);
  return rAny(r);
}

// ---------------- snapshot schema ----------------
/** entity tables: field types per index (beyond the list: lossless). Index 0 is the id. */
export const TABLES: Record<string, string> = {
  pl: '', // players: objects, see PL_KEYS
  en: 'uupp' + 'af' + 'gusgg',              // id type x z face hp shield flags carry aux aux2
  fr: 'uuuppp' + 'gg',                      // id type tier x y z stacked bottle
  pj: 'uuppp' + 'ag',                       // id kind x y z angle width
  bo: 'uppp' + 'ggu' + 'f' + 'ggg',         // id x y z mini armed kind fuse gen mine rotAt
  mi: 'upp' + 'fgg',                        // id x z fuse height burning
  fi: 'uu' + 'f' + 'gfggg' + 'f' + 'gggsg', // slot type hp alive shake rarity prog edge edgeProg tilled rate flags stock cycle
  pu: 'upp' + 'gfg',                        // id x z r life burning
  bb: 'uppp' + 'gfgg',                      // id x y z armed frac rain radius
  sn: 'upp' + 'f',                          // id x z ticks
  eg: 'uppp' + 'gfggg',                     // id x y z landed left out lure eaters
  cl: 'upp' + 'gggg' + 'pp',                // id x z r birth life ign ix iz
  wl: 'upp' + 'uu',                         // 26.11.2026 Steinkohle posts: id x z hp maxHp (a post costs bytes once, then only hp changes)
  sk: 'upp' + 'a' + 'uu',                   // 26.11.2026 Mehlsäcke stacks: id x z angle hp maxHp
  xo: 'uppp',                               // 26.11.2026 Myzel-XP orbs: id x y z
};
export const TABLE_KEYS = Object.keys(TABLES) as (keyof Snap & string)[];
/** player object keys in a fixed order (row index = position here) */
export const PL_KEYS = ['id', 'c', 'x', 'z', 'f', 'be', 'hp', 'mhp', 'al', 'st', 'sa', 'sx', 'sh', 'ms', 'sw', 'sd', 'wk', 'rs', 'po', 'fl', 'ti', 'rr', 'ra', 'xb', 'fo', 'fa', 'fc', 'fw', 'fr', 'lw', 'aw', 'sp', 'sk', 'dk', 'rh', 'cw', 'ch', 'ht', 'bw', 'pk'] as const; // 28.11.2026 pk (picking a mushroom) appended; // 26.11.2026 bw (Werkbank hammering) appended
const PL_T = 'uuppa' + 'g'.repeat(5) + 'f' + 'g'.repeat(3) + 'fgg' + 'g'.repeat(3) + 'f' + 'g'.repeat(4) + 'a' + 'g'.repeat(5) + 'f' + 'g'.repeat(6) + 'u' + 'u'; // ... sk dk rh cw ch ht, bw, pk
const typeOf = (tb: string, i: number): FT => ((tb === 'pl' ? PL_T : TABLES[tb])[i] ?? 'g') as FT;

export type Row = any[];
/** quantized snapshot: scalars (everything that is not an entity table, including the private part) + tables of rows sorted by id */
export interface Q { sc: Record<string, any>; tb: Record<string, Row[] | undefined> }

/** times that grow every tick are sent as fixed points in time instead (cloud age -> birth, mine rot timer -> rot time):
 *  a lying mine or a drifting cloud then costs nothing after its first appearance */
const STEP = 20; // 1/20 s
const qt = (v: number) => Math.round(v * STEP) / STEP;

export function toQ(s: Snap): Q {
  const sc: Record<string, any> = {}, tb: Record<string, Row[] | undefined> = {};
  for (const k of Object.keys(s)) if (!(k in TABLES) && k !== 'ev' && (s as any)[k] !== undefined) sc[k] = (s as any)[k]; // absent = undefined (as after decoding)
  // 26.11.2026 research progress per node (0..1, 3 decimals) as integer per mille: 1-2 bytes each instead of a float64
  if (Array.isArray(sc.rp)) sc.rp = sc.rp.map((v: number) => typeof v === 'number' ? Math.round(v * 1000) : v);
  const t = s.t;
  for (const k of TABLE_KEYS) {
    const a = (s as any)[k] as any[] | undefined;
    if (!a) { tb[k] = undefined; continue; }
    const rows: Row[] = a.map(x => {
      let row: Row = k === 'pl' ? PL_KEYS.map(key => x[key]) : x.slice();
      if (k === 'cl') row[4] = qt(t - row[4]);
      if (k === 'bo' && row.length > 10) row[10] = qt(t + row[10]);
      if (k === 'pl') { let n = row.length; while (n > 0 && row[n - 1] === undefined) n--; row.length = n; }
      for (let i = 0; i < row.length; i++) row[i] = quant2(typeOf(k, i), row[i]);
      return row;
    });
    rows.sort((x, y) => x[0] - y[0]);
    tb[k] = rows;
  }
  return { sc, tb };
}
/** back to a Snap for the view (times rebuilt from the snapshot time) */
export function fromQ(q: Q, ev: Snap['ev'] = []): Snap {
  const s: any = { ...q.sc, ev };
  if (Array.isArray(s.rp)) s.rp = s.rp.map((v: number) => typeof v === 'number' ? v / 1000 : v);
  const t = q.sc.t as number;
  for (const k of TABLE_KEYS) {
    const rows = q.tb[k]; if (!rows) { s[k] = undefined; continue; }
    if (k === 'pl') { s.pl = rows.map(r => { const o: any = {}; PL_KEYS.forEach((key, i) => { if (r[i] !== undefined) o[key] = r[i]; }); return o; }); continue; }
    s[k] = rows.map(r => {
      if (k === 'cl') { const c = r.slice(); c[4] = Math.max(0, t - r[4]); return c; }
      if (k === 'bo' && r.length > 10) { const c = r.slice(); c[10] = Math.max(0, r[10] - t); return c; }
      return r;
    });
  }
  // private part: flattened by the host (m.<key> = this guest, mo = "has picked" of the others, mid = guest id)
  if (s.mid !== undefined) {
    const me: Record<number, any> = {}, mine: any = {};
    for (const k of Object.keys(s)) if (k.startsWith('m.')) { mine[k.slice(2)] = s[k]; delete s[k]; }
    if (s.mo) for (const id of Object.keys(s.mo)) me[+id] = { pk: s.mo[id] };
    me[s.mid] = mine; s.me = me; delete s.mo; delete s.mid;
  }
  if (!s.me) s.me = {};
  return s as Snap;
}

// ---------------- delta encoding ----------------
const EMPTY: Q = { sc: {}, tb: {} };
const scKey = (v: any) => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
/** private parts (me) change rarely but are big: cached JSON per Q object */
const jsCache = new WeakMap<object, Map<string, any>>();
function scVal(q: Q, k: string) {
  const v = q.sc[k]; if (v === null || typeof v !== 'object') return v;
  let m = jsCache.get(q); if (!m) { m = new Map(); jsCache.set(q, m); }
  let j = m.get(k); if (j === undefined) { j = scKey(v); m.set(k, j); } return j;
}
const same = (a: any, b: any) => a === b || (a !== a && b !== b);

/** writes q as a delta against base (base = null: full) */
export function writeDelta(w: W, q: Q, base: Q | null) {
  const b = base ?? EMPTY;
  // scalars: changed keys with their new value, removed keys as undefined
  const keys = new Set([...Object.keys(q.sc), ...Object.keys(b.sc)]), ch: string[] = [];
  for (const k of [...keys].sort()) if (!(k in b.sc) || !(k in q.sc) || scVal(q, k) !== scVal(b, k)) ch.push(k);
  w.vu(ch.length); for (const k of ch) { w.str(k); wAny(w, q.sc[k]); }
  // tables
  for (const k of TABLE_KEYS) {
    const rows = q.tb[k], old = b.tb[k];
    if (!rows) { w.u8(old ? 2 : 0); continue; }
    const om = new Map<number, Row>(); if (old) for (const r of old) om.set(r[0], r);
    const nm = new Set<number>(); for (const r of rows) nm.add(r[0]);
    const gone: number[] = []; if (old) for (const r of old) if (!nm.has(r[0])) gone.push(r[0]);
    const up: Row[] = []; for (const r of rows) { const o = om.get(r[0]); if (!o || o.length !== r.length || r.some((v, i) => !same(v, o[i]))) up.push(r); }
    if (!gone.length && !up.length && old) { w.u8(0); continue; }
    w.u8(old ? 1 : 3); // 1 = changes, 3 = table appears (all rows new)
    w.vu(gone.length); let last = 0; for (const id of gone) { w.vu(id - last); last = id; } // ids ascending: gaps
    w.vu(up.length); last = 0;
    for (const r of up) {
      w.vu(r[0] - last); last = r[0];
      const o = old ? om.get(r[0]) : undefined;
      if (!o) { w.vu(r.length * 2); for (let i = 1; i < r.length; i++) wField2(w, typeOf(k, i), r[i]); continue; }
      // existing row: bit mask of the changed fields (and the new length if it changed)
      const L = r.length; w.vu(L * 2 + 1);
      const nb = Math.ceil(L / 8), mask = new Uint8Array(nb);
      for (let i = 1; i < L; i++) if (i >= o.length || !same(r[i], o[i])) mask[i >> 3] |= 1 << (i & 7);
      for (let i = 0; i < nb; i++) w.u8(mask[i]);
      for (let i = 1; i < L; i++) if (mask[i >> 3] & (1 << (i & 7))) wField2(w, typeOf(k, i), r[i]);
    }
  }
}
export function readDelta(r: R, base: Q | null): Q {
  const b = base ?? EMPTY;
  const sc: Record<string, any> = { ...b.sc };
  const n = r.vu(); for (let i = 0; i < n; i++) { const k = r.str(), v = rAny(r); if (v === undefined) delete sc[k]; else sc[k] = v; }
  const tb: Record<string, Row[] | undefined> = {};
  for (const k of TABLE_KEYS) {
    const mode = r.u8(), old = b.tb[k];
    if (mode === 2) { tb[k] = undefined; continue; }
    if (mode === 0) { tb[k] = old; continue; }
    const m = new Map<number, Row>(); if (mode === 1 && old) for (const x of old) m.set(x[0], x);
    const ng = r.vu(); let last = 0; for (let i = 0; i < ng; i++) { last += r.vu(); m.delete(last); }
    const nu = r.vu(); last = 0;
    for (let i = 0; i < nu; i++) {
      last += r.vu(); const id = last, h = r.vu(), L = h >> 1;
      if (!(h & 1)) { const row: Row = new Array(L); row[0] = id; for (let j = 1; j < L; j++) row[j] = rField2(r, typeOf(k, j)); m.set(id, row); continue; }
      const o = m.get(id) ?? [id], row: Row = o.slice(0, L); row.length = L;
      const nb = Math.ceil(L / 8), mask: number[] = []; for (let j = 0; j < nb; j++) mask.push(r.u8());
      for (let j = 1; j < L; j++) if (mask[j >> 3] & (1 << (j & 7))) row[j] = rField2(r, typeOf(k, j));
      m.set(id, row);
    }
    tb[k] = [...m.values()].sort((x, y) => x[0] - y[0]);
  }
  return { sc, tb };
}

/** FNV-1a over the full encoding: host and guest must get the same number for the same tick */
export function hashQ(q: Q): number {
  const w = new W(); writeDelta(w, q, null);
  let h = 0x811c9dc5; const b = w.buf;
  for (let i = 0; i < w.n; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// ---------------- messages ----------------
export const MSG = { snap: 1, input: 2, events: 3 } as const;
/** host -> guest (unreliable): tick, baseline tick (0 = full), last input seq of this guest the host has used,
 *  host time of this tick (ms, for the guest's clock), hash of this Q (0 = none), then the delta */
export function encSnap(tick: number, baseTick: number, ack: number, hash: number, q: Q, base: Q | null) {
  const w = new W(); w.u8(MSG.snap); w.u32(tick); w.u32(baseTick); w.u32(ack); w.u32(hash); writeDelta(w, q, base); return w.out();
}
export function decSnapHead(b: Uint8Array) { const r = new R(b); r.u8(); return { r, tick: r.u32(), base: r.u32(), ack: r.u32(), hash: r.u32() }; }

/** reliable: events of the ticks since the last send, [tick, events][] (the guest plays them when its view reaches the tick) */
export function encEvents(b: [number, Snap['ev']][]) { const w = new W(); w.u8(MSG.events); w.vu(b.length); for (const [t, ev] of b) { w.u32(t); wAny(w, ev); } return w.out(); }
export function decEvents(buf: Uint8Array): [number, Snap['ev']][] { const r = new R(buf); r.u8(); const n = r.vu(), out: [number, Snap['ev']][] = []; for (let i = 0; i < n; i++) { const t = r.u32(); out.push([t, rAny(r)]); } return out; }

// intent: movement as int8, aim as int16 (shots aim within 0.01°), the rest as small counters
const FIRE: (Intent['fire'])[] = [null, 'active', 'prim', 'sec', ...WEAPONS];
const q8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const q16 = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
function wIntent(w: W, it: Intent) {
  w.u8(q8(it.mx) & 255); w.u8(q8(it.mz) & 255); w.i16(q16(Math.max(-1, Math.min(1, it.ax)))); w.i16(q16(Math.max(-1, Math.min(1, it.az))));
  w.u8((it.aim ? 1 : 0) | (it.sprint ? 2 : 0) | (it.berry !== undefined ? 4 : 0) | (it.pick !== undefined ? 8 : 0) | (it.cycP !== undefined ? 16 : 0));
  w.u8(Math.max(0, FIRE.indexOf(it.fire))); w.vu(it.tapSeq); w.u8(it.tapW ? WEAPONS.indexOf(it.tapW) + 1 : 0); w.vu(it.cycle);
  if (it.berry !== undefined) w.vu(it.berry);
  if (it.pick !== undefined) { w.vu(it.pick); w.vu(it.pickS ?? 0); }
  if (it.cycP !== undefined) { w.vu(it.cycP); w.vu(it.cycS ?? 0); }
}
const s8 = (b: number) => (b > 127 ? b - 256 : b) / 127;
function rIntent(r: R): Intent {
  const mx = s8(r.u8()), mz = s8(r.u8()), ax = r.i16() / 32767, az = r.i16() / 32767, fl = r.u8();
  const it: Intent = { mx, mz, ax, az, aim: !!(fl & 1), fire: FIRE[r.u8()] ?? null, tapSeq: r.vu(), tapW: null, cycle: 0 };
  const tw = r.u8(); it.tapW = tw ? WEAPONS[tw - 1] : null; it.cycle = r.vu();
  if (fl & 2) it.sprint = true;
  if (fl & 4) it.berry = r.vu();
  if (fl & 8) { it.pick = r.vu(); it.pickS = r.vu(); }
  if (fl & 16) { it.cycP = r.vu(); it.cycS = r.vu(); }
  return it;
}
/** what the host will see of an intent (the guest predicts with exactly this) */
export function quantIntent(it: Intent): Intent { const w = new W(); wIntent(w, it); return rIntent(new R(w.out())); }

/** guest -> host (unreliable, 30 per second): newest snapshot tick it has (baseline ACK), the tick its view shows
 *  (lag compensation), "send me a full one", and its last few inputs (each packet repeats them: loss costs nothing) */
export interface InputPacket { ack: number; view: number; full: boolean; first: number; ins: Intent[] }
export function encInput(p: InputPacket) {
  const w = new W(); w.u8(MSG.input); w.u32(p.ack); w.f32(p.view); w.u8(p.full ? 1 : 0); w.u32(p.first); w.u8(p.ins.length);
  for (const it of p.ins) wIntent(w, it); return w.out();
}
export function decInput(b: Uint8Array): InputPacket {
  const r = new R(b); r.u8(); const ack = r.u32(), view = r.f32(), full = !!r.u8(), first = r.u32(), n = r.u8(), ins: Intent[] = [];
  for (let i = 0; i < n; i++) ins.push(rIntent(r));
  return { ack, view, full, first, ins };
}
export const msgType = (b: Uint8Array) => b[0];
