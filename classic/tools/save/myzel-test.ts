// 26.11.2026 Truhe + Samen-Suche + Myzel-XP + Myzellen + Feld-Upgrades: headless checks, incl. save/load.
// Usage (in classic/):
//   npx esbuild tools/save/myzel-test.ts --bundle --platform=node --format=cjs --outfile=/tmp/myzel.cjs && node /tmp/myzel.cjs
import * as fs from 'fs';
import YAML from 'yaml';
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
import { Sim } from '../../src/sim/sim';
import { saveGame, loadGame } from '../../src/save';
import { rNodes, treeOpen } from '../../src/sim/research';

let seed = 7; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a: number, b: number, e = .05) => Math.abs(a - b) < e;
const S: any = new Sim(cfg); const p = S.addPlayer(0, 0); S.update(.1);
const hold = (x: number, z: number, s: number) => { for (let i = 0; i < s * 30; i++) { p.x = x; p.z = z; S.setIntent(p.id, { mx: 0, mz: 0, ax: 0, az: 1, aim: false, fire: 'rake', tapSeq: p.lastTap, tapW: null, cycle: p.lastCycle }); S.update(1 / 30); } };

// fixed research times
const T = cfg.research.times, cost = (id: string) => S.rsCostOf(id); // level 1, Forschungstempo 0
ok(near(cost('f_wheat'), T.field), `neues Feld ${cost('f_wheat')} s`);
ok(near(cost('w_wheat'), T.weapon), `neue Waffe ${cost('w_wheat')} s`);
ok(near(cost('u_fld_pea.1'), T.fieldUpList[0]) && near(cost('u_fld_pea.3'), T.fieldUpList[2]), `Feld-Upgrade 1 / 3: ${cost('u_fld_pea.1')} / ${cost('u_fld_pea.3')} s`);
const wu = rNodes(cfg).find(n => n.id.startsWith('u_pea_dmg'))!.id; ok(near(cost(wu), T.upgradeList[0]), `Waffen-Upgrade Stufe 0: ${cost(wu)} s`);

// trees start locked (27.11.2026: opened by Dünger, see duenger-test.ts); the chest only heals by work
ok(!treeOpen(cfg, S.rs, 'wheat') && treeOpen(cfg, S.rs, 'pea'), 'nur Startbaum offen');
const idle = () => S.setIntent(p.id, { mx: 0, mz: 0, ax: 0, az: 1, aim: false, fire: null, tapSeq: p.lastTap, tapW: null, cycle: p.lastCycle });
idle(); S.update(1 / 30); S.chestHp = 100; S.update(1); ok(near(S.chestHp, 100, .01), `Truhe heilt nicht von selbst (${S.chestHp.toFixed(1)})`);
const h0 = S.chestHp; hold(0, 1, 1); ok(S.chestHp - h0 > cfg.chest.heal * .9, `Arbeit heilt die Truhe (+${(S.chestHp - h0).toFixed(1)}/s)`);
ok(S.chestUp === 0, 'kein Ausbau, solange die Truhe kaputt ist');
S.rs.fert.wheat = 1; S.rs.trees.push('wheat');

// field upgrade: cycle x0.8
const pea = S.fields.find((f: any) => f.type === 'pea'); const c0 = S.cycOf(pea);
S.rsUpgrade('fld_pea'); const c1 = S.cycOf(pea);
ok(near(c1.grow / c0.grow, cfg.fields.upgrade.factor, 1e-6) && near(c1.harvest / c0.harvest, cfg.fields.upgrade.factor, 1e-6), `Feld-Upgrade: Wachstum ${c0.grow.toFixed(1)} -> ${c1.grow.toFixed(1)} s, Ernte ${c0.harvest.toFixed(2)} -> ${c1.harvest.toFixed(2)} s`);

// Myzel-XP + level: HP up, Myzelle every 3 levels -> top-down place mode -> into a field
const hp0 = S.maxHp;
for (let i = 0; i < 3; i++) S.cheat(p.id, 'level', 1);
ok(S.level === 4 && S.maxHp === hp0 + 3 * cfg.xp.hpPerLevel, `Stufe ${S.level}, Leben ${hp0} -> ${S.maxHp}`);
ok(S.rs.lv === 4, 'Forschungstempo folgt der Stufe');
S.update(1 / 30);
let sn = S.snapshot();
ok(sn.ph === 'lvl' && sn.me[p.id].my === 1 && sn.me[p.id].ps.length > 0, `Myzelle: Platzier-Ansicht (${sn.me[p.id].ps?.length} Felder)`);
S.place(p.id, pea.slot); S.update(1 / 30);
ok(S.phase === 'play' && pea.myc === 1 && S.mycPend === 0, `Myzelle im Erbsenfeld (${pea.myc})`);
sn = S.snapshot(); const fs0 = sn.fi.find((f: any) => f[0] === pea.slot); ok(fs0?.[14] === 1, 'Snapshot zeigt die Myzelle');

// auto harvest: ripe field harvests itself one plant at a time, a lightning (myz) before each fruit
pea.cyc = 0; pea.ct = 0; pea.at = 0; let zaps = 0, fruits0 = S.fruits.length, t = 0; const ev = S.emit.bind(S);
S.emit = (e: any) => { if (e.k === 'myz' && e.s === pea.slot) zaps++; ev(e); };
p.x = 6; p.z = 6;
while (pea.cyc === 0 && t < 60) { S.setIntent(p.id, { mx: 0, mz: 0, ax: 0, az: 1, aim: false, fire: null, tapSeq: p.lastTap, tapW: null, cycle: p.lastCycle }); S.update(1 / 30); t += 1 / 30; }
S.emit = ev;
const want = cfg.mycel.times[0] * cfg.fields.upgrade.factor;
ok(pea.cyc === 1 && near(t, want, 1.5), `Autoernte mit 1 Myzelle in ${t.toFixed(1)} s (Soll ${want.toFixed(1)} s)`);
ok(zaps > 1, `${zaps} Blitze, Früchte ${fruits0} -> ${S.fruits.length}`);

// kill -> orbs -> XP
const xp0 = S.xp, lv0 = S.level; const e = S.spawnEnemy ? null : null; void e;
S.dropOrbs({ x: 1, z: 1, boss: false, elite: false, type: 'raccoon' }); ok(S.xorbs.length > 0, `${S.xorbs.length} Myzel-XP-Kugeln`);
p.x = 1; p.z = 1; for (let i = 0; i < 90; i++) S.update(1 / 30);
ok(S.xorbs.length === 0 && (S.xp > xp0 || S.level > lv0), `Kugeln eingesammelt (XP ${xp0} -> ${S.xp})`);

// chest at 0 = lost
const S2: any = new Sim(cfg); S2.addPlayer(0, 0); S2.update(.1); S2.hurtChest({ lunge: 0, id: 1 }, 1e9); ok(S2.phase === 'over', 'Truhe zerstört = verloren');

// save / load
S.chestHp = 333; S.mycPend = 1; S.update(0);
ok(saveGame('m', 0, S, { name: 'T' } as any), 'gespeichert');
const L: any = loadGame('m', cfg)!.sim;
ok(L.chestHp === 333 && L.fieldLv.pea === 1 && L.fields.find((f: any) => f.slot === pea.slot).myc === 1 && L.rs.trees.length === 1 && L.level === S.level, 'Truhe, Feld-Upgrade, Myzelle, Bäume, Stufe geladen');

console.log(fails ? `${fails} FEHLER` : 'alles ok'); process.exit(fails ? 1 : 0);
