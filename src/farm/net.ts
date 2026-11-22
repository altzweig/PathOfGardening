// Co-op visits over WebRTC (PeerJS), 22.11.2026. Works from a static host like GitHub Pages: the public PeerJS broker
// only introduces the two browsers (like a phone book), the game data then flows directly from device to device.
// The farm owner (host) runs the simulation; guests send their inputs and show what the host sends back.
// Tests without the public broker: ?peer=127.0.0.1:9000 uses a local PeerJS server.
import Peer, { DataConnection, PeerOptions } from 'peerjs';

const PREFIX = 'pathofgardening-hof-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function peerOpts(): PeerOptions {
  const o: PeerOptions = { debug: 0 };
  const p = new URLSearchParams(location.search).get('peer');
  if (p) { const [host, port] = p.split(':'); Object.assign(o, { host, port: +(port || 9000), path: '/', secure: false }); }
  return o;
}

export type ToHost =
  | { t: 'hello'; v: string; name: string; look: unknown; level: number; xp: number }
  | { t: 'in'; i: unknown }
  | { t: 'bye' };
export type ToGuest =
  | { t: 'wait' } | { t: 'welcome'; id: number } | { t: 'no'; why: 'full' | 'deny' | 'version' | 'gone' }
  | { t: 'st'; [k: string]: unknown } | { t: 'sn'; [k: string]: unknown } | { t: 'bye' };

export interface Visitor { id: number; conn: DataConnection; name: string; look: unknown; level: number; xp: number; ok: boolean }

/** the farm owner: opens the farm under a code, guests ask to come in, the owner lets them in or not */
export class NetHost {
  peer: Peer | null = null;
  code = '';
  visitors: Visitor[] = [];
  private nextId = 1;
  onAsk: (v: Visitor) => void = () => {};
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
    let v: Visitor | null = null;
    c.on('data', (d: any) => {
      const m = d as ToHost; if (!m || typeof m !== 'object') return;
      if (m.t === 'hello' && !v) {
        if (m.v !== this.version) { c.send({ t: 'no', why: 'version' }); setTimeout(() => c.close(), 300); return; }
        if (this.visitors.length + 1 >= this.max) { c.send({ t: 'no', why: 'full' }); setTimeout(() => c.close(), 300); return; }
        const name = String(m.name ?? '').replace(/[<>]/g, '').trim().slice(0, 28) || 'Gast';
        v = { id: this.nextId++, conn: c, name, look: m.look, level: Math.max(1, Math.min(99, Math.floor(+m.level || 1))), xp: Math.max(0, Math.floor(+m.xp || 0)), ok: false };
        this.visitors.push(v); c.send({ t: 'wait' }); this.onAsk(v);
      } else if (m.t === 'in' && v?.ok) this.onIntent(v.id, m.i);
      else if (m.t === 'bye') c.close();
    });
    const gone = () => { if (!v) return; const i = this.visitors.indexOf(v); if (i < 0) return; this.visitors.splice(i, 1); if (v.ok) this.onLeave(v); };
    c.on('close', gone); c.on('error', gone);
  }
  /** the owner said yes */
  let(v: Visitor) { if (!this.visitors.includes(v)) return false; v.ok = true; v.conn.send({ t: 'welcome', id: v.id }); return true; }
  /** the owner said no (or sends a guest home) */
  deny(v: Visitor) { try { v.conn.send({ t: 'no', why: v.ok ? 'gone' : 'deny' }); } catch { /* closed */ } setTimeout(() => v.conn.close(), 300); }
  send(v: Visitor, m: ToGuest) { if (v.conn.open) v.conn.send(m); }
  broadcast(m: ToGuest) { for (const v of this.guests) this.send(v, m); }
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
        else if (m.t === 'welcome') { this.id = m.id; this.onWelcome(m.id); }
        else if (m.t === 'no') fail(m.why);
        else if (m.t === 'bye') fail('bye');
        else this.onMsg(m);
      });
      c.on('close', () => fail('lost'));
      c.on('error', () => fail('lost'));
    });
  }
  send(m: ToHost) { if (this.conn && this.conn.open) this.conn.send(m); }
  close() { if (this.closed) return; this.closed = true; this.send({ t: 'bye' }); setTimeout(() => { try { this.conn?.close(); this.peer?.destroy(); } catch { /* ignore */ } }, 150); }
}
