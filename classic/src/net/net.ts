// Co-op over WebRTC (PeerJS). Works from a static host like GitHub Pages: the public PeerJS
// broker only does the handshake, game data flows peer-to-peer. The host runs the simulation;
// clients send inputs and render the host's snapshots.
import Peer, { DataConnection, PeerOptions } from 'peerjs';
import type { Balancing } from '../config';
import type { Intent, Snap } from '../sim/snap';
import { Look, cleanLook } from '../look';

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
 *  (whole balancing, ~60 KB) and late-game snapshots are bigger. They go as ordered pieces and are put together again. */
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

export type ToHost = { t: 'in'; i: Intent } | { t: 'pick'; key: string } | { t: 'place'; slot: number } | { t: 'hello'; look?: Look } | { t: 'buy'; i: number } | { t: 'shopClose' } | { t: 'reroll' };
export type ToClient =
  | { t: 'welcome'; id: number; color: number; cfg: Balancing }
  | { t: 'lobby'; players: { id: number; color: number; look?: Look }[] }
  | { t: 'start' } | { t: 's'; s: Snap } | { t: 'full' } | { t: 'bye' };

export interface LobbyPlayer { id: number; color: number; conn: DataConnection | null; look?: Look }

export class Host {
  peer: Peer | null = null;
  code = '';
  players: LobbyPlayer[] = [{ id: 0, color: 0, conn: null }];
  private nextId = 1;
  onChange: () => void = () => {};
  onIntent: (id: number, it: Intent) => void = () => {};
  onPick: (id: number, key: string) => void = () => {};
  onPlace: (id: number, slot: number) => void = () => {};
  onBuy: (id: number, i: number) => void = () => {};
  onShopClose: (id: number) => void = () => {};
  onReroll: (id: number) => void = () => {};
  onJoin: (p: LobbyPlayer) => void = () => {};
  onLeave: (id: number) => void = () => {};
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
  private freeColor() { for (let c = 0; c < 4; c++) if (!this.players.some(p => p.color === c)) return c; return 0; }
  private accept(c: DataConnection) {
    c.on('open', () => {
      if (this.players.length >= this.cfg.coop.maxPlayers) { c.send({ t: 'full' } as ToClient); setTimeout(() => c.close(), 300); return; }
      const p: LobbyPlayer = { id: this.nextId++, color: this.freeColor(), conn: c };
      this.players.push(p);
      sendJson(c, { t: 'welcome', id: p.id, color: p.color, cfg: this.cfg } as ToClient);
      if (this.started) c.send({ t: 'start' } as ToClient);
      this.broadcastLobby(); this.onJoin(p); this.onChange();
      const join = joiner();
      c.on('data', (d: any) => {
        const m = join(d) as ToHost; if (!m) return;
        if (m.t === 'in') this.onIntent(p.id, m.i);
        else if (m.t === 'pick') this.onPick(p.id, m.key);
        else if (m.t === 'place') this.onPlace(p.id, m.slot);
        else if (m.t === 'buy') this.onBuy(p.id, m.i);
        else if (m.t === 'shopClose') this.onShopClose(p.id);
        else if (m.t === 'reroll') this.onReroll(p.id);
        else if (m.t === 'hello' && m.look) { p.look = cleanLook(m.look); this.broadcastLobby(); this.onChange(); }
      });
      const gone = () => {
        const i = this.players.indexOf(p); if (i < 0) return;
        this.players.splice(i, 1); this.broadcastLobby(); this.onLeave(p.id); this.onChange();
      };
      c.on('close', gone); c.on('error', gone);
    });
  }
  broadcastLobby() { this.broadcast({ t: 'lobby', players: this.players.map(p => ({ id: p.id, color: p.color, look: p.look })) }); }
  broadcast(m: ToClient) {
    const js = JSON.stringify(m), big = bytes(js) > LIMIT;
    for (const p of this.players) if (p.conn && p.conn.open) { if (big) sendJson(p.conn, m, js); else p.conn.send(m); }
  }
  start() { this.started = true; this.broadcast({ t: 'start' }); }
  close() { this.broadcast({ t: 'bye' }); setTimeout(() => { this.peer?.destroy(); this.peer = null; }, 200); }
}

export class Client {
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  id = -1; color = 0; cfg: Balancing | null = null;
  lobby: { id: number; color: number; look?: Look }[] = [];
  onWelcome: () => void = () => {};
  onLobby: () => void = () => {};
  onStart: () => void = () => {};
  onSnap: (s: Snap) => void = () => {};
  onClose: (reason: 'full' | 'lost' | 'notfound' | 'bye') => void = () => {};
  private closed = false;

  join(code: string) {
    const peer = new Peer(peerOpts()); this.peer = peer;
    const fail = (r: 'full' | 'lost' | 'notfound' | 'bye') => { if (this.closed) return; this.closed = true; this.onClose(r); try { peer.destroy(); } catch { /* ignore */ } };
    peer.on('error', (err: any) => fail(err?.type === 'peer-unavailable' ? 'notfound' : 'lost'));
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
      this.conn = c;
      const join = joiner();
      c.on('data', (d: any) => {
        const m = join(d) as ToClient; if (!m) return;
        if (m.t === 'welcome') { this.id = m.id; this.color = m.color; this.cfg = m.cfg; this.onWelcome(); }
        else if (m.t === 'lobby') { this.lobby = m.players; this.onLobby(); }
        else if (m.t === 'start') this.onStart();
        else if (m.t === 's') this.onSnap(m.s);
        else if (m.t === 'full') fail('full');
        else if (m.t === 'bye') fail('bye');
      });
      c.on('close', () => fail('lost'));
      c.on('error', () => fail('lost'));
    });
  }
  send(m: ToHost) { if (this.conn && this.conn.open) sendJson(this.conn, m); }
  close() { this.closed = true; try { this.conn?.close(); this.peer?.destroy(); } catch { /* ignore */ } }
}
