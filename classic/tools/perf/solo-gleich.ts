// Solo-Gleichheit (25.11.2026, Koop-Netcode): seeded bot run; the output must be the same on main and on a branch.
// npx esbuild tools/perf/solo-gleich.ts --bundle --platform=node --format=cjs --outfile=/tmp/sg.cjs && node /tmp/sg.cjs
import * as fs from 'fs'; import YAML from 'yaml';
import { runBot } from '../balance/bot';
let seed = 11; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
const r = runBot(cfg, { weapons: 2, stopWave: 15 });
console.log(JSON.stringify({ wave: r.wave, level: r.level, time: r.time, kills: r.kills, deaths: r.deaths, hurt: r.hurt, fieldLoss: r.fieldLoss, xp: r.xpHist.slice(-3) }));
