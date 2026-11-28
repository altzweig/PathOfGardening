// 27.11.2026 Wildpilze + Kompostierer (Dünger) + Truhen-Ausbau: headless checks, incl. save / load and an old save (version 3).
// Usage (in classic/):
//   npx esbuild tools/save/duenger-test.ts --bundle --platform=node --format=cjs --outfile=/tmp/duenger.cjs && node /tmp/duenger.cjs
import * as fs from 'fs';
import YAML from 'yaml';
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
import { Sim } from '../../src/sim/sim';
import { saveGame, loadGame } from '../../src/save';
import { MUSHROOMS } from '../../src/config';
import { fertCost, fertRecipe, fertTarget, nodeAvailable, rNodes, rsFromSnap, treeOpen } from '../../src/sim/research';

let seed = 11; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a: number, b: number, e = .05) => Math.abs(a - b) < e;
const S: any = new Sim(cfg); const p = S.addPlayer(0, 0); S.update(.1);
const it = (fire: string | null) => S.setIntent(p.id, { mx: 0, mz: 0, ax: 0, az: 1, aim: false, fire, tapSeq: p.lastTap, tapW: null, cycle: p.lastCycle });
const hold = (x: number, z: number, s: number) => { for (let i = 0; i < s * 30; i++) { p.x = x; p.z = z; it('rake'); S.update(1 / 30); for (const e of S.enemies.slice()) S.removeEnemy(e); } }; // no animals: only the new parts are tested
const M = cfg.mushrooms, C = cfg.compost;

// whole seconds everywhere
const whole = (a: number[]) => a.every(v => Number.isInteger(v));
ok(whole(cfg.research.times.upgradeList) && whole(cfg.research.times.fieldUpList) && whole(C.times) && whole(cfg.chest.upgrade.times), 'alle Zeiten sind ganze Sekunden');
const flat = (a: number[]) => a.every((v, i) => i < 2 || v - a[i - 1] <= a[i - 1] - a[i - 2]);
ok(flat(cfg.research.times.upgradeList) && flat(cfg.research.times.fieldUpList) && flat(C.times) && flat(cfg.chest.upgrade.times), 'Zeiten flachen nach hinten ab');

// mushrooms: start set in the ring, new ones pop up, old ones go, the rake picks them
ok(S.shrooms.length === M.start, `${S.shrooms.length} Pilze zum Start`);
ok(S.shrooms.every((m: any) => { const d = Math.hypot(m.x, m.z); return d >= M.ring[0] - .01 && d <= M.ring[1] + .01; }), 'alle im äußeren Ring');
p.x = 0; p.z = 3; it(null); for (let i = 0; i < 30 * (M.interval * 3 + 1); i++) S.update(1 / 30);
ok(S.shrooms.length >= M.start + 2 && S.shrooms.length <= M.max, `nach ${M.interval * 3} s: ${S.shrooms.length} Pilze (max ${M.max})`);
const m0 = S.shrooms[0], k0 = m0.k, n0 = S.shStock[k0] ?? 0, d0 = Math.hypot(m0.x, m0.z);
hold(m0.x * (1 - 1.1 / d0), m0.z * (1 - 1.1 / d0), .8); ok(S.shrooms.includes(m0) && m0.pk > .7 && S.snapshot().pl[0].pk === 1 && S.snapshot().sh.find((r: number[]) => r[0] === m0.id)[5] > .7, `28.11.2026 nach 0,8 s aus 1,1 m: noch nicht geerntet, Balken ${(m0.pk ?? 0).toFixed(2)}`);
hold(m0.x * (1 - 1.1 / d0), m0.z * (1 - 1.1 / d0), .3);
ok(!S.shrooms.includes(m0) && S.shStock[k0] === n0 + 1, `1 s Halten erntet ${cfg.names.mushrooms[MUSHROOMS[k0]]} (Vorrat ${n0} -> ${S.shStock[k0]})`);
const cnt = MUSHROOMS.map(() => 0); for (let i = 0; i < 4000; i++) { S.shrooms.length = 0; S.spawnShroom(); if (S.shrooms[0]) cnt[S.shrooms[0].k]++; }
ok(cnt[0] > cnt[3] && cnt[3] > cnt[6] && cnt[6] > cnt[9] && cnt[9] > 0, `Seltenheit: ${cnt.join(' ')}`);
S.shrooms.length = 0;

// composter: researched in the first tree, placed, then fertilizer by work
const nc = rNodes(cfg).find(n => n.ref === 'compost')!;
ok(!!nc && nc.tree === 'pea' && nodeAvailable(cfg, S.rs, nc.id), 'Kompostierer im Erbsenbaum erforschbar');
ok(!treeOpen(cfg, S.rs, 'wheat') && !nodeAvailable(cfg, S.rs, 'f_wheat'), 'Weizenbaum gesperrt ohne Dünger');
S.rs.done.push(nc.id); const slot = S.placeSlots('compost')[0]; S.placeField(slot, 'compost'); const cf = S.fields.find((f: any) => f.type === 'compost');
ok(!!cf && S.compostField() === cf, 'Kompostierer steht');
ok(fertTarget(cfg, S.rs) === 'wheat', `ohne Wahl: nächster gesperrter Baum (${fertTarget(cfg, S.rs)})`);
p.rsLock = 4; hold(cf.x + 1.2, cf.z, 2); ok(S.rs.sw === 0 && !p.compWork, 'ohne Pilze keine Arbeit');
for (const [i, n] of fertRecipe(cfg, 'wheat')) S.shStock[i] = n + 1;
const t0 = fertCost(cfg, S.rs, 'wheat'); hold(cf.x + 1.2, cf.z, t0 - 1); ok(p.compWork && S.rs.sw > t0 - 1.6 && !treeOpen(cfg, S.rs, 'wheat'), `Arbeit läuft (${S.rs.sw.toFixed(1)} / ${t0} s)`);
const sn = S.snapshot(); ok(sn.pl[0].bw === 3 && sn.rs[6] === cfg.research.trees.findIndex((t: any) => t.id === 'wheat') && sn.rs[7] > .8 && rsFromSnap(cfg, sn).fertT === 'wheat', 'Snapshot: Arbeit am Kompostierer + Fortschritt');
hold(cf.x + 1.2, cf.z, 1.5);
ok(S.rs.fert.wheat === 1 && treeOpen(cfg, S.rs, 'wheat') && nodeAvailable(cfg, S.rs, 'f_wheat'), 'Dünger 1 öffnet den Weizenbaum');
ok(fertRecipe(cfg, 'wheat').every(([i]) => S.shStock[i] === 1), 'Pilze verbraucht');
ok(rsFromSnap(cfg, S.snapshot()).fert.wheat === 1, 'Snapshot zeigt den Dünger');
// choice + yield
const pi = cfg.research.trees.findIndex((t: any) => t.id === 'pea');
p.rsUi = 1; ok(S.chooseSeed(p.id, pi) && S.rs.seed === 'pea' && p.rsUi === 0, 'Dünger gewählt, Panel zu');
const pea = S.fields.find((f: any) => f.type === 'pea'), y0 = S.doubleChance(pea), r0 = S.baseRate('pea');
for (const [i, n] of fertRecipe(cfg, 'pea')) S.shStock[i] = n * 5;
for (let l = 0; l < C.max; l++) { ok(near(fertCost(cfg, S.rs, 'pea'), C.times[l], 1e-6), `Erbsen-Dünger ${l + 1}: ${fertCost(cfg, S.rs, 'pea')} s`); S.rs.seed = 'pea'; p.rsLock = 4; hold(cf.x + 1.2, cf.z, C.times[l] + .5); }
ok(S.rs.fert.pea === C.max && near(S.doubleChance(pea) - y0, C.yield * C.max, 1e-6) && S.baseRate('pea') > r0, `Ertrag +${Math.round((S.doubleChance(pea) - y0) * 100)} % bei Stufe ${C.max}`);
ok(!S.chooseSeed(p.id, pi), 'volle Stufe ist nicht mehr wählbar');

// chest: no regen, repair by work, Ausbau bar + 25 % of the base
const hp = cfg.chest.hp; S.chestHp = hp - 50; p.x = 5; p.z = 5; it(null); for (let i = 0; i < 60; i++) S.update(1 / 30);
ok(near(S.chestHp, hp - 50, .01), 'Truhe heilt nicht von selbst');
hold(0, 1, 50 / cfg.chest.heal + .3); ok(near(S.chestHp, hp, .01) && S.chestLv === 0, 'Reparatur durch Arbeit');
for (let l = 0; l < 3; l++) { const c = S.chestUpCost(); hold(0, 1, c + .2); ok(S.chestLv === l + 1 && near(S.chestMax, hp * (1 + .25 * (l + 1)), .01) && near(S.chestHp, S.chestMax, .01), `Ausbau ${l + 1} nach ${c} s: ${S.chestMax} Leben`); S.chestUp = 0; }
const cv = S.snapshot().cv; ok(cv[1] === Math.round(S.chestMax) && cv[2] === 3 && cv[3] >= 0, 'Snapshot: Truhenstufe + Leiste');

// save / load
S.spawnShroom(); S.spawnShroom(); S.chestUp = 3; S.update(0);
ok(saveGame('d', 0, S, { name: 'T' } as any), 'gespeichert');
const L: any = loadGame('d', cfg)!.sim;
ok(L.rs.fert.wheat === 1 && L.rs.fert.pea === C.max && L.chestLv === 3 && L.chestUp === 3 && L.shrooms.length === S.shrooms.length && S.shrooms.length > 0 && L.shStock.join() === S.shStock.join() && near(L.chestMax, S.chestMax), 'Dünger, Truhenstufe, Pilze, Vorrat geladen');
// old save (version 3): found trees get their first Dünger
const raw = JSON.parse(store.get('pog-classic.save.d')!); raw.v = 3; const o = raw.sim.$o;
delete o.chestLv; delete o.chestUp; delete o.shrooms; delete o.shStock; delete o.shT; delete o.rs.$o.fert; o.rs.$o.trees = { $i: 999999, $a: ['cab'] };
store.set('pog-classic.save.d', JSON.stringify(raw));
const O: any = loadGame('d', cfg)!.sim;
ok(O.rs.fert.cab === 1 && treeOpen(cfg, O.rs, 'cab') && O.chestLv === 0 && O.shStock.length === MUSHROOMS.length && O.shStock.every((v: number) => v === 0), 'alter Spielstand: gefundener Baum bleibt offen, Rest startet frisch');
for (let i = 0; i < 300; i++) O.update(1 / 30); ok(O.shrooms.length > 0, 'alter Spielstand läuft weiter (Pilze wachsen)');

console.log(fails ? `${fails} FEHLER` : 'alles ok'); process.exit(fails ? 1 : 0);
