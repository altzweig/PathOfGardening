// Co-op network load (25.11.2026): the balancing bot plays a real run, 1-3 extra players stand at the chest and take
// the first card of every level-up. Every tick the host's snapshot is measured as it goes over the wire (JSON).
// Usage (in classic/):
//   npx esbuild tools/coop/netsize.ts --bundle --platform=node --format=cjs --outfile=tools/coop/netsize.cjs
//   node tools/coop/netsize.cjs <players 1-4> [stopWave]      FULL=1: old snapshot (all private parts to everyone), BREAK=<wave>: bytes per key
import * as fs from 'fs';
import YAML from 'yaml';
import { Sim } from '../../src/sim/sim';
import { runBot } from '../balance/bot';
const N = +(process.argv[2] || 4), stop = +(process.argv[3] || 0) || undefined;
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
const P: any = Sim.prototype, up = P.update;
const W: Record<number, { n: number; bytes: number; max: number; en: number; ms: number; msMax: number }> = {};
let acc = 0;
function extras(sim: any) {
  for (const p of sim.players) if (p.id >= 100 && sim.phase === 'lvl') {
    if (p.offers && !p.picked && !p.placing) pk.call(sim, p.id, p.offers[0].key);
    if (p.placing) { const s = sim.slots.findIndex((_: any, i: number) => sim.canPlace(p, i)); if (s >= 0) pl.call(sim, p.id, s); else { p.placing = null; p.picked = true; sim.checkAllPicked(); } }
  }
}
const ad = P.addPlayer, pk = P.pick, pl = P.place;
P.addPlayer = function (id: number, c: number) { const r = ad.call(this, id, c); if (id < 100) for (let i = 1; i < N; i++) ad.call(this, 100 + i, i); return r; };
P.pick = function (id: number, k: string) { pk.call(this, id, k); extras(this); };
P.place = function (id: number, s: number) { pl.call(this, id, s); extras(this); };
P.update = function (dt: number) {
  extras(this);
  const t0 = performance.now();
  up.call(this, dt);
  acc += dt; if (acc < 1 / cfg.coop.snapshotRate - 1e-6) return; acc = 0;
  const s = this.snapshot(); const ms0 = performance.now() - t0;
  const me1: Record<number, any> = {}; for (const k in s.me) me1[k] = { pk: s.me[k].pk }; const id0 = this.players[N - 1]?.id ?? 0;
  const b = JSON.stringify({ t: 's', s: process.env.FULL ? s : { ...s, me: { ...me1, [id0]: s.me[id0] } } }).length; // as Host.sendSnap sends it (FULL=1: old way, everything to everyone)
  const w = W[this.wave] ??= { n: 0, bytes: 0, max: 0, en: 0, ms: 0, msMax: 0 };
  if (process.env.BREAK && this.wave === +process.env.BREAK && !this.__b) { this.__b = 1; for (const [k, v] of Object.entries(s)) console.log('  key', k, JSON.stringify(v ?? null).length); console.log('  me sample', JSON.stringify(s.me[Object.keys(s.me)[0] as any]).slice(0, 600)); console.log('  en sample', JSON.stringify(s.en.slice(0, 2)), 'fi sample', JSON.stringify(s.fi.slice(0, 2))); }
  w.n++; w.bytes += b; w.max = Math.max(w.max, b); w.en = Math.max(w.en, this.enemies.length); w.ms += ms0; w.msMax = Math.max(w.msMax, ms0);
};
const r = runBot(cfg, { weapons: 2, stopWave: stop });
console.log(`players ${N}, reached wave ${r.wave}, level ${r.level}, won ${r.won}`);
console.log('wave  KB/s/client  avgKB  maxKB  maxEnemies  sim+snap ms avg/max');
for (const [k, w] of Object.entries(W)) if (+k % 5 === 0 || +k === r.wave) console.log(String(k).padStart(4), (w.bytes / w.n * cfg.coop.snapshotRate / 1024).toFixed(0).padStart(10), (w.bytes / w.n / 1024).toFixed(1).padStart(7), (w.max / 1024).toFixed(1).padStart(6), String(w.en).padStart(10), (w.ms / w.n).toFixed(2).padStart(8), w.msMax.toFixed(1).padStart(6));
