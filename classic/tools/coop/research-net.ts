// Koop-Test Werkbank-Techtree (26.11.2026): host Sim + one guest over the real co-op sync (src/net/sync.ts + proto.ts),
// simulated network (ping, jitter, loss). The guest walks to the Werkbank, opens the panel, chooses an idea (as the
// ToHost rsChoose/rsOpen/rsFinish messages do via Host.onResearch), hammers until it is done, picks it up and places
// the field; then builds a Steinkohle wall. Checks after every step that the guest's decoded snapshot shows the same
// research state (rs, rd, rp, bn), its own hammering (pl.bw), its own UI (me.ro) and the posts (wl) as the host.
// Usage (in classic/):
//   npx esbuild tools/coop/research-net.ts --bundle --platform=node --format=cjs --outfile=tools/coop/research-net.cjs
//   node tools/coop/research-net.cjs [ping ms] [loss %]
import * as fs from 'fs';
import YAML from 'yaml';
import { Sim } from '../../src/sim/sim';
import { GuestSync, HostPeer, MV, guestQ, netCfg, sharedQ } from '../../src/net/sync';
import { emptyIntent, Intent, Snap } from '../../src/sim/snap';
import { rIndex } from '../../src/sim/research';

const PING = +(process.argv[2] ?? 120), LOSS = +(process.argv[3] ?? 5) / 100;
let seed = 11; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
cfg.waves.firstWave = 1e5; // no enemies: this is about the research sync
const NC = netCfg(cfg), DT = 1 / NC.simHz;
let now = 0; const wire: { at: number; to: (b: Uint8Array) => void; b: Uint8Array }[] = [];
const delay = () => PING / 2000 + Math.random() * .02;
const unrel = (to: (b: Uint8Array) => void) => (b: Uint8Array) => { if (Math.random() < LOSS) return; wire.push({ at: now + delay(), to, b }); };
const rel = (to: (b: Uint8Array) => void) => { let last = 0; return (b: Uint8Array) => { const at = Math.max(last, now + delay()); last = at; wire.push({ at, to, b }); }; };
const deliver = () => { wire.sort((a, b) => a.at - b.at); while (wire.length && wire[0].at <= now) { const p = wire.shift()!; p.to(p.b); } };

const sim = new Sim(cfg); sim.addPlayer(0, 0); const GID = 1; sim.addPlayer(GID, 1);
let g!: GuestSync; const h = new HostPeer(GID, NC, { u: unrel(b => g.onMessage(b)), r: rel(b => g.onMessage(b)) });
g = new GuestSync(cfg, NC, GID, unrel(b => h.onMessage(b)), () => now);
let it: Intent = emptyIntent(), tick = 0, acc = 0, guestSnap: Snap | null = null, hostSnap: Snap | null = null;
const evSeen = new Set<string>();
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    const hi = h.nextIntent(); if (hi) sim.setIntent(GID, hi);
    sim.update(DT); tick++; now += DT;
    const s = sim.snapshot(); hostSnap = s; if (s.ev.length) h.queueEvents(tick, s.ev);
    acc += DT; if (acc >= 1 / NC.sendHz - 1e-9) { acc -= 1 / NC.sendHz; const p = sim.player(GID)!;
      const mv: MV = [p.x, p.z, p.face, p.walk, p.sta, p.staT, p.staX ? 1 : 0, p.sprint ? 1 : 0, sim.stunF(p), p.kb ? 1 : 0, p.alive ? 1 : 0];
      h.sendSnap(tick, guestQ(sharedQ(s), s.me, GID, mv)); }
    deliver(); g.tick(it, g.renderTick); const gs = g.sample(); if (gs) { guestSnap = gs; for (const e of gs.ev) evSeen.add(e.k); }
  }
}
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const settle = () => step(Math.ceil(.6 * NC.simHz)); // > ping + interpolation delay
const gp = () => guestSnap!.pl.find(p => p.id === GID)!;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

step(30); settle();
const bench = sim.benchCircle()!;
ok(!!guestSnap && guestSnap.bn === hostSnap!.bn && (guestSnap.bn ?? -1) >= 0, `Werkbank-Slot bn beim Gast ${guestSnap?.bn} = Host ${hostSnap?.bn}`);
ok(same(guestSnap!.rd, hostSnap!.rd), 'rd (erforscht) gleich');
// walk into the bench: the panel opens by itself (nothing chosen yet) -> me.ro = 1, world paused (only player with UI? host has none -> not paused)
const walkTo = (x: number, z: number, stop: number, maxT = 15) => { for (let t = 0; t < maxT * NC.simHz; t++) { const p = sim.player(GID)!; const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d < stop) break; it = { ...it, mx: dx / d, mz: dz / d }; step(); } it = { ...it, mx: 0, mz: 0 }; };
walkTo(bench.x, bench.z, .2, 6); settle();
const own = g.ownPos(it, 0, 0)!, hp = sim.player(GID)!;
ok(Math.hypot(own.x - bench.x, own.z - bench.z) >= bench.r - .02, `Vorhersage: Gast läuft nicht in die Werkbank (Abstand ${Math.hypot(own.x - bench.x, own.z - bench.z).toFixed(2)} m, Radius ${bench.r}), Host-Abweichung ${Math.hypot(own.x - hp.x, own.z - hp.z).toFixed(3)} m, Korrekturen ${g.stats.corrections}, gesprungen ${g.stats.snapsTo}`);
ok(guestSnap!.me[GID]?.ro === 1, `Panel offen beim Gast (m.ro = ${guestSnap!.me[GID]?.ro})`);
// rsChoose (Host.onResearch -> sim.chooseResearch)
const node = rIndex(cfg, 'f_wheat'); sim.chooseResearch(GID, node); settle();
ok(guestSnap!.rs?.[0] === node && guestSnap!.me[GID]?.ro === 0, `Gast sieht gewählte Idee (rs[0] = ${guestSnap!.rs?.[0]}), Panel zu`);
// hammer: hold the action at the bench
it = { ...it, fire: 'rake' }; step(NC.simHz * 3); settle();
ok(gp().bw === 1, `Hammer beim Gast (pl.bw = ${gp().bw})`);
ok((guestSnap!.rp?.[node] ?? 0) > 0 && Math.abs((guestSnap!.rp![node]) - (hostSnap!.rp![node])) < .05, `Fortschritt beim Gast rp = ${guestSnap!.rp?.[node]} (Host ${hostSnap!.rp?.[node]})`);
for (let t = 0; t < 200 * NC.simHz && !sim.rs.ready; t++) step();
it = { ...it, fire: null }; settle();
ok(guestSnap!.rs?.[1] === 1, 'Idee fertig (rs[1]) beim Gast');
// walk away and back in: pickup popup (ro 2), pause, rs[5] = guest
walkTo(bench.x + 3, bench.z, .2); walkTo(bench.x, bench.z, .2); settle();
ok(guestSnap!.me[GID]?.ro === 2 && guestSnap!.rs?.[5] === GID, `Abhol-Popup beim Gast (m.ro = ${guestSnap!.me[GID]?.ro}, rs[5] = ${guestSnap!.rs?.[5]}) – Mitspieler sieht Glühbirne + Name`);
ok(sim.rsPause, 'Spiel pausiert');
sim.finishIdea(GID); settle();
ok(guestSnap!.ph === 'lvl' && (guestSnap!.me[GID]?.pc ?? -1) >= 0 && (guestSnap!.me[GID]?.ps?.length ?? 0) > 0, `Fertigstellen -> Platzier-Modus beim Gast (ph ${guestSnap!.ph}, pc ${guestSnap!.me[GID]?.pc}, ${guestSnap!.me[GID]?.ps?.length} Plätze)`);
// connection lost while placing: the field waits at the bench (rsPend), the game goes on
sim.rsDrop(GID); step(3);
ok(sim.phase === 'play' && sim.rsPend.length === 1, `Verbindungsabbruch beim Platzieren: Spiel läuft weiter, Feld wartet (rsPend ${sim.rsPend})`);
walkTo(bench.x + 3, bench.z, .2); walkTo(bench.x, bench.z, .2); settle();
ok(guestSnap!.ph === 'lvl' && (guestSnap!.me[GID]?.pc ?? -1) >= 0, 'Werkbank anlaufen -> Feld wieder im Platzier-Modus');
sim.place(GID, guestSnap!.me[GID]!.ps![0]); settle();
ok(guestSnap!.ph === 'play' && same(guestSnap!.rd, hostSnap!.rd) && guestSnap!.fi.length === hostSnap!.fi.length, `Feld steht (Felder ${guestSnap!.fi.length}), rd gleich, Panel offen (m.ro ${guestSnap!.me[GID]?.ro})`);
sim.closeResearch(GID); settle();
// Steinkohle: give the wall, sprint a line
sim.cheat(GID, 'research.all', 1); settle();
ok(same(guestSnap!.rd, hostSnap!.rd) && gp().aw !== undefined, `Alles erforscht: rd gleich (${guestSnap!.rd?.filter(Boolean).length} Knoten)`);
const p = sim.player(GID)!; p.ammo[('cab') as 'cab'] = 999;
walkTo(-6, -6, .3); it = { ...it, fire: 'wall', mx: 1, mz: 0, sprint: true }; step(NC.simHz * 2); it = { ...it, fire: null, mx: 0, mz: 0, sprint: false }; settle();
ok((hostSnap!.wl?.length ?? 0) > 3 && same(guestSnap!.wl, hostSnap!.wl), `Mauer beim Gast: ${guestSnap!.wl?.length} Pfosten (Host ${hostSnap!.wl?.length}), gleich`);
sim.walls[0].hp = 7; step(2); settle();
ok(same(guestSnap!.wl, hostSnap!.wl), 'Mauer-Schaden kommt an (hp)');
ok(g.stats.hashBad === 0, `Hash-Prüfung: ${g.stats.hashOk} gleich, ${g.stats.hashBad} abweichend; Ereignisse beim Gast: ${[...evSeen].filter(k => k.startsWith('rs') || k.startsWith('wall')).join(' ')}`);
console.log(`Bytes an den Gast: ${((h.bytesU + h.bytesR) / now / 1024).toFixed(2)} KB/s über ${now.toFixed(0)} s`);
process.exit(fails ? 1 : 0);
