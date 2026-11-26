// Co-op over WebRTC (PeerJS). Works from a static host like GitHub Pages: the public PeerJS
// broker only does the handshake, game data flows peer-to-peer. The host runs the simulation;
// clients send inputs and render the host's snapshots.
//
// 25.11.2026 Koop-Netcode: three channels per guest on the same WebRTC connection.
//  - PeerJS JSON (reliable): lobby, welcome, level-up picks, shop (rare, may be big)
//  - "u" (unordered, no resend): snapshots as binary deltas host -> guest, inputs guest -> host (net/sync.ts)
//  - "r" (reliable, ordered): events host -> guest (sounds, particles, hits)
// A guest that loses the connection comes back within net.reconnectWindow s as the same player (token).
import Peer, { DataConnection, PeerOptions } from 'peerjs';
import type { Balancing } from '../config';
import type { Snap } from '../sim/snap';
import { Look, cleanLook } from '../look';
import { HostPeer, Link, netCfg } from './sync';

const PREFIX = 'pathofgardening-v1-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** tests without the public broker: ?peer=127.0.0.1:9000 uses a local PeerJS server (no STUN, as in the farm game) */
function peerOpts(): PeerOptions {
  const o: PeerOptions = { debug: 0 };
  const p = new URLSearchParams(location.search).get('peer');
  if (p) { const [host, port] = p.split(':'); Object.assign(o, { host, port: +(port || 9000), path: '/', secure: false, config: { iceServers: [] } }); }
  return o;
}
/** PeerJS refuses JSON messages above 16300 bytes ("Message too big for JSON channel") and drops them: the welcome
 *  (whole balancing, ~60 KB) is bigger. It goes as ordered pieces and is put together again. */
const LIMIT = 16000, PART = 7000, enc = new TextEncoder();
/** bytes of a message as PeerJS sends it (quotes inside a piece get escaped, umlauts take 2 bytes) */
const bytes = (js: string) => js.length * 3 < LIMIT ? js.length : enc.encode(js).length;
function sendJson(c: DataConnection, m: unknown, js = JSON.stringify(m)) {
  if (!c.open) return;
  if (bytes(js) <= LIMIT) { c.send(m); return; }
  const parts: string[] = [];
  const cut = (str: string) => { // pieces of at most PART chars, halved until the escaped piece fits
    if (str.length > 64 && bytes(JSON.stringify(str)) > LIMIT - 64) { const h = str.length >> 1; cut(str.slice(0, h)); cut(str.slice(h)); }
    else parts.push(str);
  };
  for (let i = 0; i < js.length; i += PART) cut(js.slice(i, i + PART));
  parts.forEach((p, i) => c.send({ t: 'part', i, n: parts.length, p }));
}
/** collects the pieces of one big message (the channel is reliable + ordered); returns the message when complete */
function joiner() {
  let buf: string[] = [];
  return (d: any): any => {
    if (!d || d.t !== 'part') return d;
    if (d.i === 0) buf = [];
    buf.push(d.p);
    if (d.i < d.n - 1) return null;
    const js = buf.join(''); buf = [];
    try { return JSON.parse(js); } catch { return null; }
  };
}
export const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

// ---------------- binary channels ----------------
const b64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
const unb64 = (s: string) => { const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; };
/** test network: ?netsim=ping,jitter,loss (ms, ms, %) delays / drops what this side sends */
function netSim(): { ping: number; jit: number; loss: number } | null {
  const v = new URLSearchParams(location.search).get('netsim'); if (!v) return null;
  const [ping, jit, loss] = v.split(',').map(Number); return { ping: ping || 0, jit: jit || 0, loss: (loss || 0) / 100 };
}
/** two extra data channels on the PeerJS connection, agreed on both sides by id (no extra signalling) */
function binaryChannels(c: DataConnection, onData: (b: Uint8Array) => void, unreliable: boolean) {
  const pc = c.peerConnection;
  const mk = (label: string, id: number, o: RTCDataChannelInit) => { try { const ch = pc.createDataChannel(label, { ...o, negotiated: true, id }); ch.binaryType = 'arraybuffer'; ch.onmessage = e => onData(new Uint8Array(e.data as ArrayBuffer)); return ch; } catch { return null; } };
  const u = mk('pog-u', 10, unreliable ? { ordered: false, maxRetransmits: 0 } : { ordered: true });
  const r = mk('pog-r', 11, { ordered: true });
  const sim = netSim(); let lastR = 0;
  const go = (ch: RTCDataChannel | null, b: Uint8Array, rel: boolean) => {
    if (ch && ch.readyState === 'open') { if (ch.bufferedAmount < 1 << 20 || rel) ch.send(b); return; } // a stuck unreliable channel drops instead of piling up
    if (c.open) c.send({ t: 'b', d: b64(b) }); // channel not open (yet / not supported): over the JSON connection
  };
  const send = (ch: RTCDataChannel | null, rel: boolean) => (b: Uint8Array) => {
    if (!sim) return go(ch, b, rel);
    if (!rel && Math.random() < sim.loss) return;
    let d = sim.ping / 2 + Math.random() * sim.jit; if (rel) { while (Math.random() < sim.loss) d += sim.ping + 50; const at = Math.max(lastR, performance.now() + d); lastR = at; d = at - performance.now(); }
    setTimeout(() => go(ch, b, rel), d);
  };
  const link: Link = { u: send(u, false), r: send(r, true) };
  const close = () => { try { u?.close(); r?.close(); } catch { /* ignore */ } };
  return { link, close };
}

export type ToHost = { t: 'pick'; key: string } | { t: 'place'; slot: number } | { t: 'hello'; look?: Look; tok?: string } | { t: 'buy'; i: number } | { t: 'shopClose' } | { t: 'reroll' } | { t: 'b'; d: string }
  /** 25.11.2026 Werkbank-Techtree: choose an idea (node index), "Fertigstellen", close the panel / popup, open the panel from anywhere */
  | { t: 'rsChoose'; node: number } | { t: 'rsFinish' } | { t: 'rsClose' } | { t: 'rsOpen' } | { t: 'rsSeed'; tree: number };
export type ToClient =
  | { t: 'welcome'; id: number; color: number; cfg: Balancing; again?: boolean }
  | { t: 'lobby'; players: { id: number; color: number; look?: Look }[] }
  | { t: 'start' } | { t: 'full' } | { t: 'bye' } | { t: 'b'; d: string };

export interface LobbyPlayer { id: number; color: number; conn: DataConnection | null; look?: Look; tok?: string; net?: HostPeer; close?: () => void; /** lost connection at (ms), waiting for it to come back */ gone?: number }

export class Host {
  peer: Peer | null = null;
  code = '';
  players: LobbyPlayer[] = [{ id: 0, color: 0, conn: null }];
  private nextId = 1;
  /** saved co-op game: token -> player id / colour it had (it gets that figure back) */
  reserved = new Map<string, { id: number; color: number }>();
  onChange: () => void = () => {};
  onPick: (id: number, key: string) => void = () => {};
  onPlace: (id: number, slot: number) => void = () => {};
  onBuy: (id: number, i: number) => void = () => {};
  onShopClose: (id: number) => void = () => {};
  onReroll: (id: number) => void = () => {};
  /** 25.11.2026 Werkbank-Techtree messages (rsChoose / rsFinish / rsClose / rsOpen) */
  onResearch: (id: number, m: Extract<ToHost, { t: 'rsChoose' | 'rsFinish' | 'rsClose' | 'rsOpen' | 'rsSeed' }>) => void = () => {};
  /** again = came back within the reconnect window (still in the game) */
  onJoin: (p: LobbyPlayer, again: boolean) => void = () => {};
  /** connection lost (gone = still waiting for it), or finally removed */
  onLeave: (id: number, gone: boolean) => void = () => {};
  onError: (msg: string) => void = () => {};
  started = false;

  constructor(private cfg: Balancing) {}
  open(): Promise<string> {
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt: number) => {
        this.code = newCode();
        const peer = new Peer(PREFIX + this.code, peerOpts());
        peer.on('open', () => { this.peer = peer; resolve(this.code); });
        peer.on('error', (err: any) => {
          if (err?.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
          if (!this.peer) reject(err); else this.onError(String(err?.type || err));
        });
        peer.on('connection', c => this.accept(c));
        peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
      };
      tryOpen(0);
    });
  }
  reserveIds(min: number) { this.nextId = Math.max(this.nextId, min); }
  private freeColor() { for (let c = 0; c < 4; c++) if (!this.players.some(p => p.color === c)) return c; return 0; }
  private accept(c: DataConnection) {
    c.on('open', () => {
      const join = joiner(); let p: LobbyPlayer | null = null;
      c.on('data', (d: any) => {
        const m = join(d) as ToHost; if (!m) return;
        if (!p) { if (m.t === 'hello') p = this.admit(c, m); return; } // the guest says who it is first
        if (m.t === 'b') { p.net?.onMessage(unb64(m.d)); return; }
        if (m.t === 'pick') this.onPick(p.id, m.key);
        else if (m.t === 'place') this.onPlace(p.id, m.slot);
        else if (m.t === 'buy') this.onBuy(p.id, m.i);
        else if (m.t === 'shopClose') this.onShopClose(p.id);
        else if (m.t === 'reroll') this.onReroll(p.id);
        else if (m.t === 'rsChoose' || m.t === 'rsFinish' || m.t === 'rsClose' || m.t === 'rsOpen' || m.t === 'rsSeed') this.onResearch(p.id, m);
        else if (m.t === 'hello' && m.look) { p.look = cleanLook(m.look); this.broadcastLobby(); this.onChange(); }
      });
      const gone = () => { if (p && p.conn === c) this.lost(p); };
      c.on('close', gone); c.on('error', gone);
    });
  }
  private admit(c: DataConnection, m: { look?: Look; tok?: string }): LobbyPlayer | null {
    const tok = typeof m.tok === 'string' ? m.tok.slice(0, 40) : undefined;
    let p = tok ? this.players.find(q => q.tok === tok && q.id !== 0) : undefined;
    const again = !!p;
    if (p) { p.close?.(); p.conn = c; p.gone = undefined; } // came back: same player
    else {
      if (this.players.length >= this.cfg.coop.maxPlayers) { c.send({ t: 'full' } as ToClient); setTimeout(() => c.close(), 300); return null; }
      const res = tok ? this.reserved.get(tok) : undefined;
      const id = res && !this.players.some(q => q.id === res.id) ? res.id : this.nextId++;
      const color = res && !this.players.some(q => q.color === res.color) ? res.color : this.freeColor();
      p = { id, color, conn: c, tok }; this.players.push(p);
    }
    if (m.look) p.look = cleanLook(m.look);
    const pp = p;
    const bc = binaryChannels(c, b => pp.net?.onMessage(b), netCfg(this.cfg).unreliable);
    p.net = new HostPeer(p.id, netCfg(this.cfg), bc.link); p.close = bc.close;
    sendJson(c, { t: 'welcome', id: p.id, color: p.color, cfg: this.cfg, again } as ToClient);
    if (this.started) c.send({ t: 'start' } as ToClient);
    this.broadcastLobby(); this.onJoin(p, again); this.onChange();
    return p;
  }
  /** connection gone: in the game the player waits net.reconnectWindow s for it to come back */
  private lost(p: LobbyPlayer) {
    p.conn = null; p.close?.(); p.net = undefined;
    if (!this.started) { this.drop(p); return; }
    p.gone = Date.now(); this.onLeave(p.id, true); this.onChange();
    setTimeout(() => { if (p.gone && Date.now() - p.gone >= netCfg(this.cfg).reconnectWindow * 1000 - 50) this.drop(p); }, netCfg(this.cfg).reconnectWindow * 1000);
  }
  private drop(p: LobbyPlayer) {
    const i = this.players.indexOf(p); if (i < 0) return;
    this.players.splice(i, 1); this.broadcastLobby(); this.onLeave(p.id, false); this.onChange();
  }
  broadcastLobby() { this.broadcast({ t: 'lobby', players: this.players.filter(p => !p.gone).map(p => ({ id: p.id, color: p.color, look: p.look })) }); }
  broadcast(m: ToClient) {
    const js = JSON.stringify(m), big = bytes(js) > LIMIT;
    for (const p of this.players) if (p.conn && p.conn.open) { if (big) sendJson(p.conn, m, js); else p.conn.send(m); }
  }
  /** guests that are connected now, with their sync state */
  get peers() { return this.players.filter(p => p.net && p.conn?.open) as (LobbyPlayer & { net: HostPeer })[]; }
  start() { this.started = true; for (const p of this.players) p.net?.reset(); this.broadcast({ t: 'start' }); }
  close() { this.broadcast({ t: 'bye' }); setTimeout(() => { for (const p of this.players) p.close?.(); this.peer?.destroy(); this.peer = null; }, 200); }
}

/** a guest's token: the host recognises it when it comes back (same tab or reload within the window) */
export function guestToken() {
  try { let t = sessionStorage.getItem('pog-classic.tok'); if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('pog-classic.tok', t); } return t; }
  catch { return Math.random().toString(36).slice(2); }
}

export class Client {
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  id = -1; color = 0; cfg: Balancing | null = null;
  lobby: { id: number; color: number; look?: Look }[] = [];
  look: Look | undefined; tok = guestToken();
  onWelcome: (again: boolean) => void = () => {};
  onLobby: () => void = () => {};
  onStart: () => void = () => {};
  /** binary game data (snapshots, events) for net/sync.ts */
  onData: (b: Uint8Array) => void = () => {};
  /** connection lost in the game, trying to come back */
  onRetry: () => void = () => {};
  onClose: (reason: 'full' | 'lost' | 'notfound' | 'bye') => void = () => {};
  private closed = false; private code = ''; private started = false; private retryUntil = 0; private bin: ReturnType<typeof binaryChannels> | null = null;
  link: Link = { u: () => {}, r: () => {} };

  join(code: string) { this.code = code.toUpperCase().trim(); this.connect(); }
  private connect() {
    const peer = new Peer(peerOpts()); this.peer = peer; let opened = false;
    const fail = (r: 'full' | 'lost' | 'notfound' | 'bye') => {
      if (this.closed || this.peer !== peer) return;
      try { this.bin?.close(); peer.destroy(); } catch { /* ignore */ }
      // in the game: try again for net.reconnectWindow s (the host keeps the figure)
      if (r === 'lost' || (r === 'notfound' && this.retryUntil)) {
        if (this.started && !this.retryUntil) { this.retryUntil = Date.now() + netCfg(this.cfg!).reconnectWindow * 1000; this.onRetry(); }
        if (this.retryUntil && Date.now() < this.retryUntil) { setTimeout(() => { if (!this.closed) this.connect(); }, 1500); return; }
      }
      this.closed = true; this.onClose(r);
    };
    peer.on('error', (err: any) => fail(err?.type === 'peer-unavailable' ? 'notfound' : 'lost'));
    peer.on('open', () => {
      const c = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      this.conn = c;
      const join = joiner();
      c.on('open', () => { opened = true; c.send({ t: 'hello', look: this.look, tok: this.tok } as ToHost); });
      c.on('data', (d: any) => {
        const m = join(d) as ToClient; if (!m) return;
        if (m.t === 'welcome') {
          this.id = m.id; this.color = m.color; this.cfg = m.cfg; this.retryUntil = 0;
          this.bin = binaryChannels(c, b => this.onData(b), netCfg(m.cfg).unreliable); this.link = this.bin.link;
          this.onWelcome(!!m.again);
        }
        else if (m.t === 'b') this.onData(unb64(m.d));
        else if (m.t === 'lobby') { this.lobby = m.players; this.onLobby(); }
        else if (m.t === 'start') { this.started = true; this.onStart(); }
        else if (m.t === 'full') fail('full');
        else if (m.t === 'bye') fail('bye');
      });
      c.on('close', () => fail('lost'));
      c.on('error', () => fail('lost'));
      setTimeout(() => { if (!opened) fail('lost'); }, 12000);
    });
  }
  send(m: ToHost) { if (this.conn && this.conn.open) sendJson(this.conn, m); }
  close() { this.closed = true; try { this.bin?.close(); this.conn?.close(); this.peer?.destroy(); } catch { /* ignore */ } }
}
export type { Snap };
