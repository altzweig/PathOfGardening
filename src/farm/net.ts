// Co-op visits over WebRTC (PeerJS), 22.11.2026. Works from a static host like GitHub Pages: the public PeerJS broker
// only introduces the two browsers (like a phone book), the game data then flows directly from device to device.
// The farm owner (host) runs the simulation; guests send their inputs and show what the host sends back.
// Tests without the public broker: ?peer=127.0.0.1:9000 uses a local PeerJS server.
import Peer, { DataConnection, PeerOptions } from 'peerjs';

const PREFIX = 'pathofgardening-hof-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

/** STUN finds the way through most home routers; strict networks (often mobile) need a TURN relay (22.11.2026, from Basti's
 *  co-op hand-over): set VITE_TURN_URL / VITE_TURN_USER / VITE_TURN_PASS at build time (e.g. Cloudflare or Metered) */
function iceServers(): RTCIceServer[] {
  const list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const env = (import.meta as any).env ?? {}, url = env.VITE_TURN_URL as string | undefined;
  if (url) list.push({ urls: url.split(',').map(u => u.trim()), username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS });
  return list;
}
/** messages a guest may send per second (it sends its input every frame); more is dropped */
const RATE = 120;

function peerOpts(): PeerOptions {
  const o: PeerOptions = { debug: 0, config: { iceServers: iceServers() } };
  const p = new URLSearchParams(location.search).get('peer');
  if (p) { const [host, port] = p.split(':'); Object.assign(o, { host, port: +(port || 9000), path: '/', secure: false }); }
  return o;
}

export type ToHost =
  | { t: 'hello'; v: string; name: string; look: unknown; level: number; xp: number; ticket?: string }
  | { t: 'in'; i: unknown }
  | { t: 'bye' };
export type ToGuest =
  | { t: 'wait' } | { t: 'welcome'; id: number; key: string } | { t: 'no'; why: 'full' | 'deny' | 'version' | 'gone' }
  | { t: 'st'; [k: string]: unknown } | { t: 'sn'; [k: string]: unknown } | { t: 'bye' };

export interface Visitor {
  id: number; conn: DataConnection; name: string; look: unknown; level: number; xp: number; ok: boolean;
  /** second, unordered connection for the snapshots (a lost packet does not hold up the newer ones); key pairs it with the guest */
  fast?: DataConnection; key: string;
  /** rate limit: messages in the current second */
  n: number; sec: number;
}

/** the farm owner: opens the farm under a code, guests ask to come in, the owner lets them in or not */
export class NetHost {
  peer: Peer | null = null;
  code = '';
  visitors: Visitor[] = [];
  private nextId = 1;
  onAsk: (v: Visitor) => void = () => {};
  /** a friend whose visit the owner already accepted in the friends list (ticket from src/online): comes in right away */
  onTicket: (v: Visitor) => void = () => {};
  tickets = new Set<string>();
  onIntent: (id: number, it: unknown) => void = () => {};
  onLeave: (v: Visitor) => void = () => {};
  onError: (msg: string) => void = () => {};
  constructor(private version: string, private max: number) {}
  get guests() { return this.visitors.filter(v => v.ok); }
  open(): Promise<string> {
    if (this.peer) return Promise.resolve(this.code);
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt: number) => {
        const code = newCode(), peer = new Peer(PREFIX + code, peerOpts());
        peer.on('open', () => { this.peer = peer; this.code = code; resolve(code); });
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
  private accept(c: DataConnection) {
    // the fast connection of a guest that is already in: only snapshots go out over it
    const meta = c.metadata as { fast?: string } | undefined;
    if (meta?.fast) {
      c.on('open', () => { const v = this.visitors.find(x => x.ok && x.key === meta.fast); if (v) v.fast = c; else c.close(); });
      return;
    }
    let v: Visitor | null = null;
    c.on('data', (d: any) => {
      const m = d as ToHost; if (!m || typeof m !== 'object') return;
      if (v) { const s = Math.floor(performance.now() / 1000); if (s !== v.sec) { v.sec = s; v.n = 0; } if (++v.n > RATE) return; }
      if (m.t === 'hello' && !v) {
        if (m.v !== this.version) { c.send({ t: 'no', why: 'version' }); setTimeout(() => c.close(), 300); return; }
        if (this.visitors.length + 1 >= this.max) { c.send({ t: 'no', why: 'full' }); setTimeout(() => c.close(), 300); return; }
        const name = String(m.name ?? '').replace(/[<>]/g, '').trim().slice(0, 28) || 'Gast';
        v = { id: this.nextId++, conn: c, name, look: m.look, level: Math.max(1, Math.min(99, Math.floor(+m.level || 1))), xp: Math.max(0, Math.floor(+m.xp || 0)), ok: false, key: newCode() + newCode(), n: 0, sec: 0 };
        this.visitors.push(v); c.send({ t: 'wait' });
        const tk = typeof m.ticket === 'string' ? m.ticket : '';
        if (tk && this.tickets.delete(tk)) this.onTicket(v); else this.onAsk(v);
      } else if (m.t === 'in' && v?.ok) this.onIntent(v.id, m.i);
      else if (m.t === 'bye') c.close();
    });
    const gone = () => { if (!v) return; const i = this.visitors.indexOf(v); if (i < 0) return; this.visitors.splice(i, 1); v.fast?.close(); if (v.ok) this.onLeave(v); };
    c.on('close', gone); c.on('error', gone);
  }
  /** the owner said yes */
  let(v: Visitor) { if (!this.visitors.includes(v)) return false; v.ok = true; v.conn.send({ t: 'welcome', id: v.id, key: v.key }); return true; }
  /** the owner said no (or sends a guest home) */
  deny(v: Visitor) { try { v.conn.send({ t: 'no', why: v.ok ? 'gone' : 'deny' }); } catch { /* closed */ } setTimeout(() => v.conn.close(), 300); }
  send(v: Visitor, m: ToGuest) { if (v.conn.open) v.conn.send(m); }
  broadcast(m: ToGuest) { for (const v of this.guests) this.send(v, m); }
  /** snapshots: over the fast connection when there is one */
  broadcastFast(m: ToGuest) { for (const v of this.guests) { if (v.fast?.open) v.fast.send(m); else this.send(v, m); } }
  close() {
    this.broadcast({ t: 'bye' });
    const p = this.peer; this.peer = null; this.visitors = []; this.code = '';
    setTimeout(() => p?.destroy(), 300);
  }
}

/** a guest: knocks at the farm under a code and plays there once the owner lets it in */
export class NetGuest {
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  fast: DataConnection | null = null;
  id = -1;
  onWait: () => void = () => {};
  onWelcome: (id: number) => void = () => {};
  onMsg: (m: ToGuest) => void = () => {};
  onClose: (why: 'full' | 'deny' | 'version' | 'gone' | 'lost' | 'notfound' | 'bye') => void = () => {};
  private closed = false;
  join(code: string, hello: Omit<Extract<ToHost, { t: 'hello' }>, 't'>) {
    const peer = new Peer(peerOpts()); this.peer = peer;
    const fail = (r: Parameters<NetGuest['onClose']>[0]) => { if (this.closed) return; this.closed = true; this.onClose(r); setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 100); };
    peer.on('error', (err: any) => fail(err?.type === 'peer-unavailable' ? 'notfound' : 'lost'));
    peer.on('open', () => {
      const c = peer.connect(PREFIX + cleanCode(code), { reliable: true, serialization: 'json' });
      this.conn = c;
      c.on('open', () => c.send({ t: 'hello', ...hello }));
      c.on('data', (d: any) => {
        const m = d as ToGuest; if (!m || typeof m !== 'object') return;
        if (m.t === 'wait') this.onWait();
        else if (m.t === 'welcome') {
          this.id = m.id; this.onWelcome(m.id);
          const f = peer.connect(PREFIX + cleanCode(code), { reliable: false, serialization: 'json', metadata: { fast: m.key } });
          this.fast = f; f.on('data', (d: any) => { if (d && typeof d === 'object') this.onMsg(d as ToGuest); });
        }
        else if (m.t === 'no') fail(m.why);
        else if (m.t === 'bye') fail('bye');
        else this.onMsg(m);
      });
      c.on('close', () => fail('lost'));
      c.on('error', () => fail('lost'));
    });
  }
  send(m: ToHost) { if (this.conn && this.conn.open) this.conn.send(m); }
  close() { if (this.closed) return; this.closed = true; this.send({ t: 'bye' }); setTimeout(() => { try { this.fast?.close(); this.conn?.close(); this.peer?.destroy(); } catch { /* ignore */ } }, 150); }
}
