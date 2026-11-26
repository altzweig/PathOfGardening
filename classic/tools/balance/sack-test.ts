// 26.11.2026 Mehlsäcke: headless check. Research the wheat tree, build the mill, lay sacks round the garden,
// let a wave run and count how many animals get onto the fields through the sacks.
// npx esbuild tools/balance/sack-test.ts --bundle --platform=node --format=cjs --outfile=/tmp/sack.cjs && node /tmp/sack.cjs
import * as fs from 'fs'; import YAML from 'yaml';
const store = new Map<string, string>(); (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
import { saveGame, loadGame } from '../../src/save'; import { Sim } from '../../src/sim/sim'; import { emptyIntent } from '../../src/sim/snap';
import { freeEdges } from '../../src/sim/sacks';
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
const sim = new Sim(cfg); const p = sim.addPlayer(0, 0);
const ok = (c: boolean, m: string) => console.log((c ? 'ok   ' : 'FEHLER ') + m);
(sim as any).cheat(0, 'research.all', 1);
ok(p.skills.sack.learned, 'Mehlsäcke erforscht');
ok(sim.fields.some(f => f.type === 'mill') && sim.fields.some(f => f.type === 'bakery'), 'Mühle + Bäckerei stehen (Felder ' + sim.fields.map(f => f.type).join(',') + ')');
ok(!p.skills.flour.learned, 'Mehlstaub-Angriff nicht im Forschungsspiel');
{ // the mill grinds wheat into flour, the bakery bakes bread from flour alone (research mode)
  const mill = sim.fields.find(f => f.type === 'mill')!, bak = sim.fields.find(f => f.type === 'bakery')!;
  mill.inb.wheat = 30; bak.inb.flour = 10; let fl = 0, br = 0;
  for (let i = 0; i < 200; i++) { mill.tilledT = bak.tilledT = 1; (sim as any).tickBuilding(mill, .05); (sim as any).tickBuilding(bak, .05); }
  fl = sim.fruits.filter(f => f.type === 'flour').length; br = sim.fruits.filter(f => f.type === 'bread').length;
  ok(fl > 0 && br > 0, `Mühle macht Mehl (${fl}), Bäckerei Brot ohne Brunnen (${br})`);
}
p.ammo.sack = 5000;
const slots = (sim as any).slots;
const edges = freeEdges(cfg, slots, sim.builtSlot);
console.log('freie Kanten', edges.length);
// lay a sack on every free edge: walk to the edge midpoint, face outwards, fire
let laid = 0;
for (const e of edges) {
  const s = slots[e.a]; p.x = s.x + (e.mx - s.x) * .6; p.z = s.z + (e.mz - s.z) * .6; p.face = Math.atan2(e.mx - s.x, e.mz - s.z);
  p.skills.sack.cdT = 0; if (sim.tryFire(p, 'sack')) laid++;
}
ok(laid === edges.length && sim.sacks.length === laid, `Säcke an allen Kanten: ${laid}/${edges.length}, Kosten je Stapel ${sim.stats('sack', p.skills.sack).cost}`);
const am0 = p.ammo.sack; p.skills.sack.cdT = 0; ok(!sim.tryFire(p, 'sack') && p.ammo.sack === am0, 'keine Kante frei -> kein Sack, kein Mehl');
// save + load keeps the stacks and the upgrades
{ saveGame('t', 0, sim, null as any); const L = loadGame('t', cfg)!; ok(!!L && L.sim.sacks.length === sim.sacks.length && L.sim.players[0].skills.sack.lvDmg === 5 && L.sim.rs.done.length === sim.rs.done.length, `Spielstand: ${L?.sim.sacks.length} Stapel, Upgrades und ${L?.sim.rs.done.length} Ideen wieder da`); }
// upgrades
const hp0 = sim.sacks[0].maxHp; ok(hp0 === 100 + 5 * 20, 'Leben je Stapel mit 5x +20 = ' + hp0);
ok(sim.stats('sack', p.skills.sack).cost === 5, 'Kosten 5 x -1 = ' + sim.stats('sack', p.skills.sack).cost);
sim.sacks[0].hp = 10; for (let i = 0; i < 60 * 20; i++) (sim as any).tickSacks(.05); ok(Math.abs(sim.sacks[0].hp - (10 + 25)) < 1, 'Selbstreparatur 25/min: ' + sim.sacks[0].hp.toFixed(1));
// a new field beyond one sack edge removes that sack
const e0 = sim.sacks.find(k => k.b >= 0 && !slots[k.b].forest)!; const n0 = sim.sacks.length;
sim.placeField(e0.b, 'pea' as any); ok(!sim.sacks.includes(e0), `Feld auf der anderen Seite -> Säcke weg (${n0} -> ${sim.sacks.length})`);
sim.fields.splice(sim.fields.findIndex(f => f.slot === e0.b), 1);
for (const e of freeEdges(cfg, slots, sim.builtSlot)) { const s = slots[e.a]; p.x = s.x + (e.mx - s.x) * .6; p.z = s.z + (e.mz - s.z) * .6; p.face = Math.atan2(e.mx - s.x, e.mz - s.z); p.skills.sack.cdT = 0; sim.tryFire(p, 'sack'); }
ok(sim.sacks.length === edges.length, 'wieder geschlossen: ' + sim.sacks.length);
// wave: enemies against the closed garden
p.x = 0; p.z = 0; p.alive = true; for (const k of Object.keys(p.skills)) p.skills[k as never as 'pea'].learned = false; // the player does not fight
p.hp = 1e9; (cfg.player as any).hp = 1e9;

const inside = new Set<number>(), byType: Record<string, number> = {}, onField: Record<string, number> = {};
let gnaw = 0, broke = 0;
const t0 = sim.time; sim.waveT = 0;
for (let i = 0; i < 20 * +(process.env.SECS ?? 240); i++) {
  sim.setIntent(p.id, { ...emptyIntent() });
  sim.update(.05);
  for (const ev of (sim as any).events) { if (ev.k === 'sackHit') gnaw++; if (ev.k === 'sackBreak') { broke++; if (broke === 1) console.log('erster Stapel zerrissen nach', (sim.time - t0).toFixed(1), 's'); } }
  (sim as any).events = [];
  for (const e of sim.enemies) { if (e.dead) continue; byType[e.type] = 1; const sl = (sim as any).slotAtPos?.(e.x, e.z); void sl;
    const i2 = slots.findIndex((s: any, k: number) => sim.builtSlot(k) && !s.chest && !s.bench && Math.hypot(s.x - e.x, s.z - e.z) < 1.0);
    if (i2 >= 0 && !inside.has(e.id)) { inside.add(e.id); if (inside.size <= 3) console.log('Tier auf Feld', e.type, (sim.time - t0).toFixed(1), 's', e.fleeing ? 'flieht' : '', e.leave > 0 ? 'geht' : ''); onField[e.type] = (onField[e.type] ?? 0) + 1; } }
}
console.log('Welle', sim.wave, 'Zeit', (sim.time - t0).toFixed(0), 's, Tiere', Object.keys(byType).join(','), '| auf Feldern:', JSON.stringify(onField), '| Nagen', gnaw, 'zerrissen', broke, 'Stapel übrig', sim.sacks.length);
