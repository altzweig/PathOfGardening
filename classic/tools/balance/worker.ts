// node worker: argv[2] = JSON { runs, weapons, second?, overrides: { 'a.b.c': value } } -> prints JSON results
import * as fs from 'fs';
import YAML from 'yaml';
import { runBot } from './bot';
const job = JSON.parse(process.argv[2]);
const base = YAML.parse(fs.readFileSync(process.env.POG_YAML || 'Game Design & Balancing/balancing.yaml', 'utf8'));
const set = (o: any, path: string, v: any) => { const ks = path.split('.'); let c = o; for (const k of ks.slice(0, -1)) c = c[k] ??= {}; c[ks.at(-1)!] = v; };
const out = [];
for (let i = 0; i < job.runs; i++) {
  const cfg = structuredClone(base); for (const [k, v] of Object.entries(job.overrides || {})) set(cfg, k, v);
  out.push(runBot(cfg, { weapons: job.weapons, second: job.second, infAmmo: job.infAmmo, old: job.old, maxTime: job.maxTime }));
}
process.stdout.write(JSON.stringify(out));
