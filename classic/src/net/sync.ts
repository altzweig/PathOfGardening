// Co-op state sync (25.11.2026, Koop-Netcode), independent of the transport so the same code runs in the browser
// (WebRTC) and in the Node measurement (tools/perf/netcode.ts, simulated network).
//
// Host, per guest: quantized snapshots are kept by tick; each one goes as a delta against the newest snapshot the
// guest confirmed. The guest's inputs come with sequence numbers, the host uses one per simulation tick.
// Guest: rebuilds the snapshots, shows the others 100 ms in the past (interpolated, short extrapolation on loss)
// and its own figure at once (prediction, corrected by the host's answer and the inputs it has not answered yet).
import type { Balancing } from '../config';
import type { Intent, Priv, Snap } from '../sim/snap';
import { MoveCtx, MoveState, predictStep } from '../sim/move';
import { Q, R, TABLES, decEvents, decInput, decSnapHead, encEvents, encInput, encSnap, hashQ, quantIntent, readDelta, toQ, fromQ, MSG, msgType } from './proto';

/** network parameters (balancing.yaml -> net) */
export interface NetCfg {
  simHz: number; sendHz: number; interpDelay: number; maxExtrapolate: number; fullEvery: number; hashEvery: number;
  ringTicks: number; inputRedundancy: number; maxInputQueue: number; snapDist: number; smoothTime: number; rewindMax: number;
  reconnectWindow: number; unreliable: boolean;
}
export const NET_DEFAULT: NetCfg = { simHz: 30, sendHz: 20, interpDelay: .1, maxExtrapolate: .25, fullEvery: 2, hashEvery: 1, ringTicks: 96, inputRedundancy: 5, maxInputQueue: 4, snapDist: .5, smoothTime: .1, rewindMax: .2, reconnectWindow: 30, unreliable: true };
export const netCfg = (cfg: Balancing): NetCfg => ({ ...NET_DEFAULT, ...((cfg as any).net ?? {}) });

export interface Link { u(b: Uint8Array): void; r(b: Uint8Array): void }

/** movement state of a player for the guest's reconciliation (exact numbers) */
export type MV = [number, number, number, number, number, number, number, number, number, number, number];

// ---------------------------------------------------------------- host side
export class HostPeer {
  private sent = new Map<number, Q>();
  acked = 0; private lastFull = -1e9; private wantFull = true;
  /** inputs not used yet, newest seq received, seq used last (sent back as ACK) */
  private queue: { seq: number; it: Intent }[] = []; private gotSeq = 0; applied = 0;
  last: Intent | null = null; view = 0;
  bytesU = 0; bytesR = 0; private evBuf: [number, Snap['ev']][] = [];
  constructor(public id: number, private nc: NetCfg, public link: Link) {}
  reset() { this.sent.clear(); this.acked = 0; this.wantFull = true; this.queue = []; this.evBuf = []; }
  onMessage(b: Uint8Array) {
    if (msgType(b) !== MSG.input) return;
    const p = decInput(b);
    if (p.ack > this.acked && this.sent.has(p.ack)) this.acked = p.ack;
    if (p.full) this.wantFull = true;
    this.view = p.view;
    p.ins.forEach((it, i) => { const seq = p.first + i; if (seq > this.gotSeq) { this.gotSeq = seq; this.queue.push({ seq, it }); } });
  }
  /** the intent for this simulation tick: one input per tick; none there -> stands (keeps what it holds) */
  nextIntent(): Intent | null {
    while (this.queue.length > this.nc.maxInputQueue) { const x = this.queue.shift()!; this.applied = x.seq; this.last = x.it; } // far behind (lag spike): skip ahead
    const x = this.queue.shift();
    if (x) { this.applied = x.seq; this.last = x.it; return x.it; }
    return this.last ? { ...this.last, mx: 0, mz: 0 } : null;
  }
  queueEvents(tick: number, ev: Snap['ev']) { if (ev.length) this.evBuf.push([tick, ev]); }
  /** one snapshot for this guest: delta against its newest confirmed one, a full one every fullEvery s or on request */
  sendSnap(tick: number, q: Q) {
    if (this.evBuf.length) { const e = encEvents(this.evBuf); this.evBuf = []; this.bytesR += e.length; this.link.r(e); }
    const full = this.wantFull || tick - this.lastFull >= this.nc.fullEvery * this.nc.simHz;
    const base = full ? null : this.sent.get(this.acked) ?? null;
    if (!base) { this.lastFull = tick; this.wantFull = false; }
    const hash = tick - this.hashTick >= this.nc.hashEvery * this.nc.simHz ? hashQ(q) || 1 : 0;
    if (hash) this.hashTick = tick;
    const b = encSnap(tick, base ? this.acked : 0, this.applied, hash, q, base);
    this.sent.set(tick, q);
    for (const k of this.sent.keys()) if (k < tick - this.nc.ringTicks) this.sent.delete(k); else break;
    this.bytesU += b.length; this.link.u(b);
  }
  private hashTick = -1e9;
}

/** quantized snapshot of the shared part (computed once per send), then per guest with its private part */
export function sharedQ(s: Snap): Q { return toQ({ ...s, me: {} as any, ev: [] }); }
export function guestQ(shared: Q, me: Record<number, Priv>, id: number, mv: MV | null): Q {
  const sc: Record<string, any> = { ...shared.sc }; delete sc.me;
  const mine = me[id] as any;
  if (mine) for (const k of Object.keys(mine)) if (mine[k] !== undefined) sc['m.' + k] = mine[k];
  const mo: Record<number, number> = {}; for (const k of Object.keys(me)) if (+k !== id) mo[+k] = me[+k].pk;
  sc.mo = mo; sc.mid = id; if (mv) sc.mv = mv;
  return { sc, tb: shared.tb };
}

// ---------------------------------------------------------------- guest side
interface Buffered { tick: number; s: Snap }
export interface GuestStats { snaps: number; lost: number; full: number; hashOk: number; hashBad: number; bytes: number; late: number; extrap: number; corrections: number; snapsTo: number; maxErr: number }

export class GuestSync {
  private got = new Map<number, Q>();
  newest = 0; private needFull = true;
  private buf: Buffered[] = [];
  private evq: [number, Snap['ev']][] = [];
  private evDone = 0;
  /** host tick estimate: tick = now * simHz + off (max filter: the least delayed packet sets it) */
  private off = -1e9; private offT = 0;
  stats: GuestStats = { snaps: 0, lost: 0, full: 0, hashOk: 0, hashBad: 0, bytes: 0, late: 0, extrap: 0, corrections: 0, snapsTo: 0, maxErr: 0 };
  // prediction
  seq = 0; private pending: { seq: number; it: Intent }[] = [];
  pred: MoveState | null = null; private ackSeq = 0; private mv: MV | null = null;
  /** visual correction left (eases out over smoothTime) */
  private ex = 0; private ez = 0; private eT = 0;
  renderTick = 0;
  onSnap: () => void = () => {};

  constructor(private cfg: Balancing, private nc: NetCfg, public id: number, private send: (b: Uint8Array) => void, private clock: () => number) {}

  reset() { this.got.clear(); this.newest = 0; this.needFull = true; this.buf = []; this.evq = []; this.evDone = 0; this.off = -1e9; this.pending = []; this.pred = null; this.mv = null; }
  onMessage(b: Uint8Array) {
    this.stats.bytes += b.length;
    const t = msgType(b);
    if (t === MSG.events) { for (const x of decEvents(b)) if (x[0] > this.evDone) this.evq.push(x); this.evq.sort((a, c) => a[0] - c[0]); return; }
    if (t !== MSG.snap) return;
    const h = decSnapHead(b);
    if (this.got.has(h.tick)) return;
    const base = h.base ? this.got.get(h.base) : null;
    if (h.base && !base) { this.needFull = true; this.stats.lost++; return; } // baseline gone: ask for a full one
    let q: Q; try { q = readDelta(h.r as R, base ?? null); } catch { this.needFull = true; return; }
    if (!h.base) { this.stats.full++; this.needFull = false; }
    this.stats.snaps++;
    if (h.hash) { if (hashQ(q) === h.hash) this.stats.hashOk++; else { this.stats.hashBad++; this.needFull = true; } }
    this.got.set(h.tick, q);
    for (const k of [...this.got.keys()]) if (k < h.tick - this.nc.ringTicks) this.got.delete(k);
    // clock
    const now = this.clock(), sample = h.tick - now * this.nc.simHz;
    if (sample > this.off || now - this.offT > 4) { this.off = sample; this.offT = now; } else this.off -= .02 / this.nc.sendHz; // slow drift so a jump in delay does not freeze the view
    if (h.tick <= this.newest) { this.stats.late++; } else {
      this.newest = h.tick;
      this.reconcile(h.ack, q.sc.mv as MV | undefined);
    }
    const s = fromQ(q);
    let i = this.buf.length; while (i > 0 && this.buf[i - 1].tick > h.tick) i--;
    this.buf.splice(i, 0, { tick: h.tick, s });
    while (this.buf.length > 2 && this.buf[1].tick < this.renderTick - 2) this.buf.shift();
    this.onSnap();
  }
  get ready() { return this.buf.length > 0; }
  /** current host tick as the guest believes it */
  hostTick(now = this.clock()) { return now * this.nc.simHz + this.off; }

  // ---------- own figure ----------
  private ctx(): MoveCtx { const m = this.mv; return { sf: m ? m[8] : 1, kb: m ? !!m[9] : false, chest: !!this.cfg.chest, sb: null }; }
  private canPredict() { const m = this.mv; return !!m && !!m[10] && !m[9]; }
  private fromMV(m: MV): MoveState { return { x: m[0], z: m[1], face: m[2], walk: m[3], sta: m[4], staT: m[5], staX: !!m[6], sprint: !!m[7] }; }
  /** host answered up to input ack: start from its state, replay the inputs it has not used yet */
  private reconcile(ack: number, mv: MV | undefined) {
    if (!mv) return;
    const was = this.mv; this.mv = mv; this.ackSeq = ack;
    this.pending = this.pending.filter(p => p.seq > ack);
    const st = this.fromMV(mv), c = this.ctx(), dt = 1 / this.nc.simHz;
    if (this.canPredict()) for (const p of this.pending) predictStep(this.cfg, st, p.it, dt, c);
    if (this.pred && was && was[10] && mv[10] && !was[9] && !mv[9]) { // (respawn / knock-back are the host's moves, no error)
      const dx = this.pred.x + this.ex - st.x, dz = this.pred.z + this.ez - st.z, d = Math.hypot(dx, dz);
      const raw = Math.hypot(this.pred.x - st.x, this.pred.z - st.z); this.stats.maxErr = Math.max(this.stats.maxErr, raw);
      if (raw > 1e-3) this.stats.corrections++;
      if (d > this.nc.snapDist) { this.ex = this.ez = 0; this.stats.snapsTo++; } // big error: jump
      else { this.ex = dx; this.ez = dz; this.eT = this.nc.smoothTime; } // small: ease out over smoothTime
    } else if (this.pred) { const dx = this.pred.x + this.ex - st.x, dz = this.pred.z + this.ez - st.z; if (Math.hypot(dx, dz) < this.nc.snapDist * 4) { this.ex = dx; this.ez = dz; this.eT = this.nc.smoothTime; } else this.ex = this.ez = 0; }
    this.pred = st;
  }
  /** one fixed tick of input: predict it and send it (with the last few, against loss) */
  tick(it: Intent, view: number) {
    const q = quantIntent(it); this.seq++;
    this.pending.push({ seq: this.seq, it: q });
    if (this.pred && this.canPredict()) predictStep(this.cfg, this.pred, q, 1 / this.nc.simHz, this.ctx());
    const ins = this.pending.slice(-this.nc.inputRedundancy);
    this.send(encInput({ ack: this.newest, view, full: this.needFull, first: ins.length ? ins[0].seq : this.seq, ins: ins.map(x => x.it) }));
    if (this.pending.length > 120) this.pending.splice(0, this.pending.length - 120);
  }
  /** where the own figure is drawn: prediction + the part of the tick since + the easing correction */
  ownPos(it: Intent, part: number, dt: number): { x: number; z: number; face: number; walk: number } | null {
    if (!this.pred) return null;
    if (this.eT > 0) { const k = Math.max(0, this.eT - dt) / this.eT; this.ex *= k; this.ez *= k; this.eT = Math.max(0, this.eT - dt); } else { this.ex = this.ez = 0; }
    const st = { ...this.pred };
    if (this.canPredict() && part > 0) predictStep(this.cfg, st, quantIntent(it), part / this.nc.simHz, this.ctx());
    return { x: st.x + this.ex, z: st.z + this.ez, face: st.face, walk: st.walk };
  }

  // ---------- the others: interpolation ----------
  /** snapshot to draw now (interpolated at hostTick - interpDelay), events that became due; null until the first one */
  sample(now = this.clock()): Snap | null {
    if (!this.buf.length) return null;
    const rt = this.hostTick(now) - this.nc.interpDelay * this.nc.simHz;
    this.renderTick = rt;
    const B = this.buf;
    let s: Snap;
    if (rt <= B[0].tick) s = B[0].s;
    else {
      let i = 0; while (i < B.length - 1 && B[i + 1].tick < rt) i++;
      if (i < B.length - 1) { const a = B[i], b = B[i + 1]; s = lerpSnap(a.s, b.s, (rt - a.tick) / (b.tick - a.tick)); }
      else { // no newer one yet: extrapolate a little from the last two, then hold
        const b = B[B.length - 1], a = B.length > 1 ? B[B.length - 2] : null;
        const ex = Math.min(rt - b.tick, this.nc.maxExtrapolate * this.nc.simHz);
        if (a && ex > 0) { s = lerpSnap(a.s, b.s, 1 + ex / (b.tick - a.tick), true); this.stats.extrap++; } else s = b.s;
      }
    }
    const ev: Snap['ev'] = [];
    while (this.evq.length && this.evq[0][0] <= rt) { const [t, e] = this.evq.shift()!; this.evDone = Math.max(this.evDone, t); ev.push(...e); }
    if (this.evq.length > 0 && this.evq[0][0] < rt - this.nc.simHz) { for (const [, e] of this.evq) ev.push(...e); this.evq = []; }
    return { ...s, ev };
  }
}

// ---------------------------------------------------------------- interpolation
const TAU = Math.PI * 2;
const lerpA = (a: number, b: number, t: number) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
/** fields that move smoothly: positions and angles always, fractions only between two snapshots (not extrapolated) */
const SMOOTH: Record<string, string> = {};
for (const k of Object.keys(TABLES)) SMOOTH[k] = TABLES[k];
const PL_SMOOTH: Record<string, 'p' | 'a' | 'f'> = { x: 'p', z: 'p', f: 'a', fa: 'a', dk: 'f', sp: 'f', sw: 'f', ti: 'f', wk: 'p', sa: 'f' };
/** snapshot between a and b (t 0..1; t > 1 with ext = extrapolation of positions past b). Discrete values come from
 *  a (between) or b (past b), only rows in both move. */
export function lerpSnap(a: Snap, b: Snap, t: number, ext = false): Snap {
  if (t <= 0) return a;
  const base = ext ? b : a, other = ext ? a : b, o: any = { ...base };
  for (const k of Object.keys(TABLES)) {
    const Bs = (base as any)[k] as any[] | undefined, Os = (other as any)[k] as any[] | undefined;
    if (!Bs || !Os) continue;
    const om = new Map<number, any>(); for (const r of Os) om.set(k === 'pl' ? r.id : r[0], r);
    const pair = (r: any, id: number) => { const q = om.get(id); return q ? (ext ? [q, r] : [r, q]) : null; }; // [at a, at b]
    if (k === 'pl') {
      o.pl = Bs.map(p => { const pr = pair(p, p.id); if (!pr) return p; const [x0, y0] = pr, n = { ...p };
        for (const key in PL_SMOOTH) { const ty = PL_SMOOTH[key], x = x0[key], y = y0[key]; if (typeof x !== 'number' || typeof y !== 'number') continue; if (ext && ty !== 'p') continue;
          if (ty === 'p' && key !== 'wk' && Math.abs(y - x) > 4) continue;
          n[key] = ty === 'a' ? lerpA(x, y, t) : x + (y - x) * t; }
        return n; });
      continue;
    }
    const ty = SMOOTH[k];
    o[k] = Bs.map(r => {
      const pr = pair(r, r[0]); if (!pr) return r; const [ra, rb] = pr;
      let n: any[] | null = null;
      for (let i = 1; i < ty.length && i < r.length; i++) {
        const c = ty[i]; if (c !== 'p' && c !== 'a' && c !== 'f') continue; if (ext && c === 'f') continue;
        const x = ra[i], y = rb[i]; if (typeof x !== 'number' || typeof y !== 'number' || x === y) continue;
        if (c === 'p' && Math.abs(y - x) > 4) continue; // teleport (respawn, new spot): no sliding across the garden
        (n ??= r.slice())[i] = c === 'a' ? lerpA(x, y, t) : x + (y - x) * t;
      }
      return n ?? r;
    });
  }
  return o as Snap;
}

// ---------------------------------------------------------------- lag compensation (host)
/** enemy positions of the last ticks: a guest's attack is checked against where the guest saw the animals */
export class Rewind {
  private hist: { tick: number; pos: Map<number, [number, number]> }[] = [];
  constructor(private nc: NetCfg) {}
  record(tick: number, enemies: { id: number; x: number; z: number; dead: boolean }[]) {
    const m = new Map<number, [number, number]>(); for (const e of enemies) if (!e.dead) m.set(e.id, [e.x, e.z]);
    this.hist.push({ tick, pos: m }); const keep = Math.ceil(this.nc.rewindMax * this.nc.simHz) + 2;
    while (this.hist.length > keep) this.hist.shift();
  }
  /** moves the enemies back to tick (fractional), returns the function that puts them forward again */
  apply(tick: number, now: number, enemies: { id: number; x: number; z: number; dead: boolean }[]): (() => void) | null {
    const min = now - this.nc.rewindMax * this.nc.simHz; tick = Math.max(min, Math.min(now, tick));
    if (now - tick < .5 || !this.hist.length) return null;
    let i = this.hist.length - 1; while (i > 0 && this.hist[i].tick > tick) i--;
    const a = this.hist[i], b = this.hist[Math.min(i + 1, this.hist.length - 1)], t = b.tick > a.tick ? Math.max(0, Math.min(1, (tick - a.tick) / (b.tick - a.tick))) : 0;
    const moved: [any, number, number, number, number][] = [];
    for (const e of enemies) {
      if (e.dead) continue; const pa = a.pos.get(e.id), pb = b.pos.get(e.id) ?? pa; if (!pa || !pb) continue;
      const x = pa[0] + (pb[0] - pa[0]) * t, z = pa[1] + (pb[1] - pa[1]) * t;
      moved.push([e, e.x, e.z, x, z]); e.x = x; e.z = z;
    }
    return () => { for (const [e, x0, z0, x, z] of moved) { e.x = x0 + (e.x - x); e.z = z0 + (e.z - z); } }; // keeps any push it got meanwhile
  }
}
