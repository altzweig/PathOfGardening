// 27.11.2026 one bot run: when mushrooms were picked, fertilizers made and trees researched (wave / time)
import * as fs from 'fs';
import YAML from 'yaml';
import { Sim } from '../../src/sim/sim';
import { runBot } from './bot';
import { MUSHROOMS } from '../../src/config';
let seed = +(process.argv[2] ?? 3); Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
const P: any = Sim.prototype, emit = P.emit; let lastW = 0;
P.emit = function (e: any) {
  if (this.wave !== lastW) { lastW = this.wave; console.log(`-- Welle ${this.wave} bei ${Math.round(this.time)} s, Pilze im Feld ${this.shrooms.map((m: any) => MUSHROOMS[m.k]).join(' ')}`); }
  if (e.k === 'shPick') console.log(`  ${Math.round(this.time)} s  Pilz ${MUSHROOMS[e.m]} -> Vorrat ${this.shStock.join(' ')}`);
  if (e.k === 'fert') console.log(`  ${Math.round(this.time)} s  Dünger ${cfg.research.trees[e.t].id} Stufe ${e.lv}`);
  if (e.k === 'chestUp') console.log(`  ${Math.round(this.time)} s  Truhe Stufe ${e.lv}`);
  if (e.k === 'rsDone' || e.k === 'rsFinish') console.log(`  ${Math.round(this.time)} s  Forschung ${e.n ?? ''}`);
  emit.call(this, e);
};
const r = runBot(cfg, { weapons: 1 } as any);
console.log(JSON.stringify({ wave: r.wave, rsAt: r.rsAt, act: Object.fromEntries(Object.entries(r.act).map(([k, v]) => [k, Math.round(v as number)])) }));
