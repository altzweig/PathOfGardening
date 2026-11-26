// Spielstand-Test Werkbank-Techtree (26.11.2026): speichern -> laden -> Forschung, Mauer, Werkbank gleich; Laden während
// des Feld-Platzierens verliert das Feld nicht; alter Spielstand (Version 1, XP-Modus mit Beeren-Start) wird als Forschungsspiel geladen.
// Usage (in classic/):
//   npx esbuild tools/save/save-test.ts --bundle --platform=node --format=cjs --outfile=tools/save/save-test.cjs && node tools/save/save-test.cjs
import * as fs from 'fs';
import YAML from 'yaml';
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
import { Sim } from '../../src/sim/sim';
import { saveGame, loadGame } from '../../src/save';
import { runBot } from '../balance/bot';
import { rIndex } from '../../src/sim/research';

let seed = 5; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const look = { name: 'Test' } as any;

// 1) research game: the bot plays a few waves, then walls and a running research
let sim!: Sim; const P: any = Sim.prototype, up = P.update; P.update = function (dt: number) { sim = this; up.call(this, dt); };
runBot(cfg, { weapons: 2, stopWave: 6 }); P.update = up;
const p = sim.players[0];
sim.cheat(p.id, 'research.all', 1); p.ammo.cab = 999; sim.phase = 'play';
p.x = -6; p.z = -6; for (let i = 0; i < 60; i++) { sim.setIntent(p.id, { mx: 1, mz: 0, ax: 0, az: 1, aim: false, fire: 'wall', tapSeq: p.lastTap, tapW: null, cycle: p.lastCycle, sprint: true }); sim.update(1 / 30); }
sim.rs.speedLv = 2; sim.rs.cur = 'speed'; sim.rs.work.speed = 3.5; sim.walls[0].hp = 11;
const before = JSON.stringify({ rs: sim.rs, walls: sim.walls, bench: sim.benchSlot, fields: sim.fields.map(f => [f.slot, f.type]), wave: sim.wave });
ok(sim.walls.length > 5, `Mauer gebaut: ${sim.walls.length} Pfosten`);
ok(saveGame('a', 0, sim, look), 'gespeichert (' + (store.get('pog-classic.save.a')!.length / 1024).toFixed(0) + ' KB)');
ok(!store.get('pog-classic.save.a')!.includes('wallGrid'), 'wallGrid / wallLinks nicht im Spielstand');
let L = loadGame('a', cfg)!; ok(!!L, 'geladen');
const after = JSON.stringify({ rs: L.sim.rs, walls: L.sim.walls, bench: L.sim.benchSlot, fields: L.sim.fields.map(f => [f.slot, f.type]), wave: L.sim.wave });
ok(before === after, 'Forschung, Mauer, Werkbank, Felder gleich');
const s0 = L.sim.snapshot(); ok(JSON.stringify(s0.rs) === JSON.stringify(sim.snapshot().rs) && JSON.stringify(s0.wl) === JSON.stringify(sim.snapshot().wl), 'Snapshot rs / wl gleich');
// walls still block after loading (lookup tables rebuilt)
L.sim.update(1 / 30); ok((L.sim as any).wallGrid.size > 0, `Mauer-Raster nach dem Laden neu aufgebaut (${(L.sim as any).wallGrid.size} Zellen)`);

// 2) saved while a researched field is being placed -> loaded: not lost, waits at the bench
const s2 = new Sim(cfg); const q = s2.addPlayer(0, 0); s2.update(.1);
const b = s2.benchCircle()!; q.x = b.x + 1.6; q.z = b.z; s2.update(.05); s2.rs.trees.push('wheat'); /* 26.11.2026 trees start locked (seed search) */ s2.openResearch(q.id); s2.chooseResearch(q.id, 'f_wheat'); s2.rs.work.f_wheat = 999; s2.rs.ready = true;
q.x = b.x + b.r + .1; q.z = b.z; q.rsLock = 0; s2.update(.05); ok(q.rsUi === 2, 'Abhol-Popup offen'); s2.finishIdea(q.id);
ok(s2.phase === 'lvl' && q.placing === 'wheat', 'Platzier-Modus läuft');
saveGame('b', 0, s2, look); L = loadGame('b', cfg)!;
const lq = L.sim.players[0];
ok(L.sim.phase === 'play' && lq.rsUi === 0 && L.sim.rsPend.join() === 'wheat', `geladen: kein Hänger (Phase ${L.sim.phase}, UI ${lq.rsUi}), Feld wartet an der Werkbank (${L.sim.rsPend})`);
lq.x = b.x + b.r + .1; lq.z = b.z; L.sim.update(.05);
ok(L.sim.phase === 'lvl' && lq.placing === 'wheat', 'Werkbank berühren -> Feld wieder im Platzier-Modus');
const fs0 = L.sim.fields.length; L.sim.place(lq.id, L.sim.slots.findIndex((_, i) => L.sim.canPlace(lq, i)));
ok(L.sim.fields.length === fs0 + 1 && L.sim.phase === 'play', 'Feld platziert');

// 3) old save (version 1, XP mode with berry start, several fields, weapons, a level-up open)
const xcfg = { ...structuredClone(cfg), progression: 'xp' };
let xs!: Sim; P.update = function (dt: number) { xs = this; up.call(this, dt); };
runBot(xcfg, { weapons: 2, stopWave: 8 }); P.update = up;
saveGame('c', 0, xs, look);
const raw = JSON.parse(store.get('pog-classic.save.c')!); raw.v = 1;
for (const k of ['rs', 'rsLvl', 'rsPend', 'benchSlot', 'walls', 'wallDirty']) delete raw.sim.$o[k];
for (const pl of raw.sim.$o.players.$a) for (const k of ['rsUi', 'rsLock', 'rsPlace', 'benchWork']) delete pl.$o?.[k];
store.set('pog-classic.save.c', JSON.stringify(raw));
const types = xs.fields.filter(f => f.alive).map(f => f.type), learned = Object.keys(xs.players[0].skills).filter(k => (xs.players[0].skills as any)[k].learned);
L = loadGame('c', cfg)!; ok(!!L && L.sim.rsMode, `alter Stand (v1, Welle ${xs.wave}, Felder ${types}, Waffen ${learned}) als Forschungsspiel geladen`);
const m = L.sim; ok(m.benchSlot >= 0 && !m.fieldAt(m.benchSlot) && m.slots[m.benchSlot].bench === true, `Werkbank auf Slot ${m.benchSlot} frei`);
ok(m.fields.length === xs.fields.length, 'keine Felder verloren');
ok(m.rs.done.length > 0 && m.rs.n === m.rs.done.length, `erforscht: ${m.rs.done}`);
ok(m.players[0].skills.pea.learned && m.players[0].ammo.pea > 0, 'Erbsenpistole bekommen');
ok(m.rsPend.join() === 'pea', 'Erbsenfeld wartet an der Werkbank');
ok(m.phase === 'play' && !m.players[0].offers, 'keine Level-up-Karten offen');
for (let i = 0; i < 30 * 20; i++) m.update(1 / 30); ok(m.phase !== 'lvl' || m.rsLvl, 'läuft 20 s ohne Level-up-Karten weiter');
const mb = m.benchCircle()!, mp = m.players[0]; if (mp.alive) { mp.x = mb.x + mb.r + .1; mp.z = mb.z; mp.rsLock = 0; m.phase = 'play'; m.update(.05); ok(mp.placing === 'pea', 'Werkbank -> Erbsenfeld platzieren'); }
ok(rIndex(cfg, 'f_pea') >= 0, 'Techtree vorhanden');
process.exit(fails ? 1 : 0);
