// Koop-Netcode measurement (25.11.2026): a real host simulation (the balancing bot plays player 0) with 1-3 guests
// that walk and shoot by script. Everything goes through the real co-op sync code (src/net/sync.ts + proto.ts) over a
// simulated network with latency, jitter and loss. Reports bandwidth per guest, host time per tick, desync checks
// (host and guest hash of the state every second), prediction corrections and interpolation error.
// Usage (in classic/):
//   npx esbuild tools/perf/netcode.ts --bundle --platform=node --format=cjs --outfile=tools/perf/netcode.cjs
//   node tools/perf/netcode.cjs [players 2-4] [waves] [ping ms] [jitter ms] [loss %]      OLD=1: also the old JSON size
import * as fs from 'fs';
import YAML from 'yaml';
import { Sim } from '../../src/sim/sim';
import { runBot } from '../balance/bot';
import { GuestSync, HostPeer, MV, Rewind, guestQ, netCfg, sharedQ } from '../../src/net/sync';
import { emptyIntent, Intent } from '../../src/sim/snap';

const N = +(process.argv[2] || 4), WAVES = +(process.argv[3] || 30), PING = +(process.argv[4] ?? 150), JIT = +(process.argv[5] ?? 20), LOSS = +(process.argv[6] ?? 5) / 100;
// deterministic run: seeded Math.random (same numbers every run)
let seed = +(process.env.SEED || 7); Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
const NC = netCfg(cfg), DT = 1 / NC.simHz;

// ---------------- simulated network ----------------
let now = 0; // virtual seconds
interface Pkt { at: number; to: (b: Uint8Array) => void; b: Uint8Array }
const wire: Pkt[] = [];
const rnd = () => Math.random();
const delay = () => PING / 2000 + rnd() * JIT / 1000;
function unreliable(to: (b: Uint8Array) => void) { return (b: Uint8Array) => { if (rnd() < LOSS) return; wire.push({ at: now + delay(), to, b }); }; }
function reliable(to: (b: Uint8Array) => void) {
  let last = 0;
  return (b: Uint8Array) => { let d = delay(); while (rnd() < LOSS) d += PING / 1000 + .05; const at = Math.max(last, now + d); last = at; wire.push({ at, to, b }); };
}
function deliver() { wire.sort((a, b) => a.at - b.at); while (wire.length && wire[0].at <= now) { const p = wire.shift()!; p.to(p.b); } }

// ---------------- host + guests ----------------
// ENDLESS=1 (default): no game over, so the run really goes through all waves even if the bot's garden falls
if (process.env.ENDLESS !== '0') (Sim.prototype as any).gameOver = function () {};
const P: any = Sim.prototype, up = P.update, ad = P.addPlayer, pk = P.pick, pl = P.place;
const peers = new Map<number, HostPeer>(), guests = new Map<number, GuestSync>();
const rewind = new Rewind(NC);
let sim: any = null, tick = 0, sendAcc = 0;
const tickEv: [number, any[]][] = [];
const guestIds: number[] = [];
for (let i = 1; i < N; i++) guestIds.push(100 + i);
function extras(s: any) {
  for (const p of s.players) if (p.id >= 100 && s.phase === 'lvl') {
    if (p.offers && !p.picked && !p.placing) pk.call(s, p.id, p.offers[0].key);
    if (p.placing) { const sl = s.slots.findIndex((_: any, i: number) => s.canPlace(p, i)); if (sl >= 0) pl.call(s, p.id, sl); else { p.placing = null; p.picked = true; s.checkAllPicked(); } }
  }
}
P.addPlayer = function (id: number, c: number) {
  const r = ad.call(this, id, c);
  if (id < 100) {
    sim = this;
    this.rewindFor = (p: any) => { const h = peers.get(p.id); return h ? rewind.apply(h.view, tick, this.enemies) : null; };
    for (const gid of guestIds) {
      ad.call(this, gid, gid - 100);
      let g!: GuestSync;
      const h = new HostPeer(gid, NC, { u: unreliable(b => g.onMessage(b)), r: reliable(b => g.onMessage(b)) });
      g = new GuestSync(cfg, NC, gid, unreliable(b => h.onMessage(b)), () => now);
      peers.set(gid, h); guests.set(gid, g);
    }
  }
  return r;
};
P.pick = function (id: number, k: string) { pk.call(this, id, k); extras(this); };
P.place = function (id: number, s: number) { pl.call(this, id, s); extras(this); };

// guest script: walks in a direction for 0.5-2.5 s (sometimes stands, sometimes sprints), shoots now and then
interface Script { it: Intent; left: number; changed: boolean }
const scripts = new Map<number, Script>();
function script(id: number): Script {
  let s = scripts.get(id); if (!s) { s = { it: emptyIntent(), left: 0, changed: false }; scripts.set(id, s); }
  s.left -= DT; s.changed = false;
  if (s.left <= 0) {
    const a = rnd() * Math.PI * 2, stand = rnd() < .2, p = sim.player(id);
    const home = p && Math.hypot(p.x, p.z) > cfg.arena.radius * .7; // keep near the garden
    const ang = home ? Math.atan2(-p.x, -p.z) : a;
    s.it = { ...s.it, mx: stand ? 0 : Math.sin(ang), mz: stand ? 0 : Math.cos(ang), sprint: rnd() < .25, fire: rnd() < .4 ? 'active' : null, aim: false };
    s.left = .5 + rnd() * 2; s.changed = true;
  }
  return s;
}

// ---------------- measurement ----------------
const M = { ticks: 0, hostMs: 0, hostMax: 0, simMs: 0, react: 0, reactN: 0, interpErr: 0, interpN: 0, interpMax: 0, oldBytes: 0, oldN: 0 };
const tms: number[] = [];
const win = new Map<number, number[]>(); // bytes per guest per whole second
const trueHist: { tick: number; pos: Map<number, [number, number]> }[] = [];
let lastSecond = 0; const secBytes = new Map<number, number>();
const ownPrev = new Map<number, { x: number; z: number }>();

P.update = function (dt: number) {
  extras(this);
  const t0 = performance.now();
  for (const [id, h] of peers) { const it = h.nextIntent(); if (it) this.setIntent(id, it); }
  const ts = performance.now();
  up.call(this, dt);
  M.simMs += performance.now() - ts;
  tick++; now += dt;
  rewind.record(tick, this.enemies);
  const snap = this.snapshot(); if (snap.ev.length) tickEv.push([tick, snap.ev]);
  sendAcc += dt;
  if (sendAcc >= 1 / NC.sendHz - 1e-9) {
    sendAcc -= 1 / NC.sendHz;
    const sh = sharedQ(snap);
    for (const [id, h] of peers) {
      const p = this.player(id);
      const mv: MV | null = p ? [p.x, p.z, p.face, p.walk, p.sta, p.staT, p.staX ? 1 : 0, p.sprint ? 1 : 0, this.stunF(p), p.kb ? 1 : 0, p.alive ? 1 : 0] : null;
      for (const [tk, ev] of tickEv) h.queueEvents(tk, ev);
      h.sendSnap(tick, guestQ(sh, snap.me, id, mv));
    }
    tickEv.length = 0;
    if (process.env.OLD) { // the old way (PR #122): JSON snapshot with this guest's private part, 20 per second
      const others: any = {}; for (const k in snap.me) others[k] = { pk: snap.me[k].pk }; const id = guestIds[0];
      M.oldBytes += JSON.stringify({ t: 's', s: { ...snap, me: { ...others, [id]: snap.me[id] } } }).length; M.oldN++;
    }
  }
  const ms = performance.now() - t0; tms.push(ms); M.hostMs += ms; M.hostMax = Math.max(M.hostMax, ms); M.ticks++;
  // true enemy positions by tick (interpolation error)
  const m = new Map<number, [number, number]>(); for (const e of this.enemies) if (!e.dead) m.set(e.id, [e.x, e.z]);
  trueHist.push({ tick, pos: m }); if (trueHist.length > 60) trueHist.shift();
  // network + guests
  deliver();
  for (const [id, g] of guests) {
    const sc = script(id);
    g.tick(sc.it, g.renderTick);
    const own = g.ownPos(sc.it, 0, dt);
    // reaction: the frame right after a new direction already moves that way (no waiting for the host)
    if (own && sc.changed && Math.hypot(sc.it.mx, sc.it.mz) > .5 && g.ready) {
      const pv = ownPrev.get(id); const p = sim.player(id);
      if (pv && p?.alive && !p.kb && sim.stunF(p) >= 1 && sim.phase === 'play' && sim.ramp >= 1) { M.reactN++; const d = (own.x - pv.x) * sc.it.mx + (own.z - pv.z) * sc.it.mz; if (d > 0) M.react++; }
    }
    if (own) ownPrev.set(id, own);
    const s = g.sample();
    if (s && tick % 3 === 0) { // interpolation error: drawn enemy vs where it really was at the drawn tick
      const rt = g.renderTick, i = trueHist.findIndex(h => h.tick >= rt);
      if (i > 0) { const a = trueHist[i - 1], b = trueHist[i], k = (rt - a.tick) / (b.tick - a.tick);
        for (const e of s.en) { const pa = a.pos.get(e[0]), pb = b.pos.get(e[0]); if (!pa || !pb) continue; const x = pa[0] + (pb[0] - pa[0]) * k, z = pa[1] + (pb[1] - pa[1]) * k, d = Math.hypot(e[2] - x, e[3] - z); if (d > 3) continue; M.interpErr += d; M.interpN++; M.interpMax = Math.max(M.interpMax, d); } }
    }
  }
  if (Math.floor(now) > lastSecond) {
    lastSecond = Math.floor(now);
    for (const [id, h] of peers) { const tot = h.bytesU + h.bytesR, prev = secBytes.get(id) ?? 0; (win.get(id) ?? win.set(id, []).get(id)!).push(tot - prev); secBytes.set(id, tot); }
  }
};

const t0 = Date.now();
const r = runBot(cfg, { weapons: 2, stopWave: WAVES, dt: DT });
const secs = [...win.values()].flat().filter(x => x > 0);
const avg = secs.reduce((a, b) => a + b, 0) / Math.max(1, secs.length) / 1024, peak = Math.max(...secs) / 1024;
const G = [...guests.values()].map(g => g.stats);
const sum = (k: keyof typeof G[0]) => G.reduce((a, s) => a + (s[k] as number), 0);
console.log(`Koop-Netcode: ${N} Spieler, Welle ${r.wave} erreicht (Level ${r.level}), ${(now / 60).toFixed(1)} min Spielzeit, Netz: Ping ${PING} ms, Jitter ${JIT} ms, Verlust ${LOSS * 100} %  (${((Date.now() - t0) / 1000).toFixed(0)} s Rechenzeit)`);
console.log(`Bandbreite pro Gast: Mittel ${avg.toFixed(1)} KB/s, Spitze (1-s-Fenster) ${peak.toFixed(1)} KB/s` + (M.oldN ? `   | alt (JSON, PR #122): ${(M.oldBytes / M.oldN * NC.sendHz / 1024).toFixed(1)} KB/s` : ''));
console.log(`Host-Logik pro Tick (Sim + Snapshot + Kodieren für ${N - 1} Gäste): Mittel ${(M.hostMs / M.ticks).toFixed(2)} ms, 99 % unter ${tms.sort((a, b) => a - b)[Math.floor(tms.length * .99)].toFixed(2)} ms, max ${M.hostMax.toFixed(1)} ms (davon Sim ${(M.simMs / M.ticks).toFixed(2)} ms)`);
console.log(`Desync-Prüfung (Hash jede Sekunde): ${sum('hashOk')} gleich, ${sum('hashBad')} abweichend   Snapshots ${sum('snaps')} (voll ${sum('full')}), Basis fehlte ${sum('lost')}, verspätet ${sum('late')}`);
console.log(`Vorhersage: Reaktion im selben Frame ${M.reactN ? (M.react / M.reactN * 100).toFixed(1) : '-'} % (${M.reactN} Richtungswechsel), Korrekturen ${sum('corrections')}, davon gesprungen (> ${NC.snapDist} m) ${sum('snapsTo')}, größter Fehler ${Math.max(...G.map(s => s.maxErr)).toFixed(2)} m`);
console.log(`Interpolation Gegner: mittlerer Fehler ${(M.interpErr / Math.max(1, M.interpN) * 100).toFixed(1)} cm, max ${(M.interpMax * 100).toFixed(0)} cm, extrapoliert ${sum('extrap')} Frames`);
