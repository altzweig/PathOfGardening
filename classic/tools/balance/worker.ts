// node worker: argv[2] = JSON { runs, weapons, second?, overrides: { 'a.b.c': value } } -> prints JSON results
import * as fs from 'fs';
import YAML from 'yaml';
import { runBot } from './bot';
const job = JSON.parse(process.argv[2]);
const base = YAML.parse(fs.readFileSync(process.env.POG_YAML || 'Game Design & Balancing/balancing.yaml', 'utf8'));
const set = (o: any, path: string, v: any) => { const ks = path.split('.'); let c = o; for (const k of ks.slice(0, -1)) c = c[k] ??= {}; c[ks.at(-1)!] = v; };
const out = [];
// 24.11.2026 seed: same seeds for every config (paired comparison, much less noise): run i of part k uses seed + k * runs + i
const rng = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
for (let i = 0; i < job.runs; i++) {
  if (job.seed != null) Math.random = rng(job.seed + (job.part ?? 0) * job.runs + i);
  const cfg = structuredClone(base); for (const [k, v] of Object.entries(job.overrides || {})) set(cfg, k, v);
  out.push(runBot(cfg, { weapons: job.weapons, second: job.second, infAmmo: job.infAmmo, old: job.old, seconds: job.seconds, focus: job.focus, maxTime: job.maxTime, start: job.start, stopWave: job.stopWave }));
}
process.stdout.write(JSON.stringify(out));
