import * as fs from 'fs'; import YAML from 'yaml'; import { Sim } from '../../src/sim/sim'; import { runBot } from './bot';
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
const P: any = Sim.prototype; const hf = P.hurtField, ue = P.updateEnemy, se = P.spawnEnemy; let curE: any = null;
const W: Record<number, any> = {};
const w = (s: any) => { if (W[s.wave - 1]) W[s.wave - 1].k1 ??= s.kills; return W[s.wave] ??= { sp: 0, fdmg: {} as Record<string, number>, kills0: s.kills, fields: 0 }; };
const sb = P.spawnBoss; P.spawnBoss = function (...a: any[]) { console.log('BOSS at wave', this.wave, 'level', this.level); return sb.apply(this, a); };
P.updateEnemy = function (e: any, dt: number) { curE = e; const r = ue.call(this, e, dt); curE = null; return r; };
P.spawnEnemy = function (...a: any[]) { const n = this.enemies.length; const r = se.apply(this, a); if (this.enemies.length > n) w(this).sp++; return r; };
P.hurtField = function (f: any, d: number) { const k = curE ? curE.type : 'poison'; const o = w(this).fdmg; o[k] = Math.round((o[k] || 0) + d); return hf.call(this, f, d); };
const ov = JSON.parse(process.argv[4] || '{}'); for (const [k, v] of Object.entries(ov)) { const ks = k.split('.'); let c: any = cfg; for (const x of ks.slice(0, -1)) c = c[x]; c[ks.at(-1)!] = v; }
const r = runBot(cfg, { weapons: +(process.argv[3] || 1) as 1, infAmmo: process.argv[2] === 'inf' });
for (const [k, v] of Object.entries(W)) console.log('wave', k, 'spawned', v.sp, 'kills', v.k1 - v.kills0, 'fieldDmg', JSON.stringify(v.fdmg));
console.log(JSON.stringify({ wave: r.wave, deaths: r.deaths, kills: r.kills, picks: r.picks, lv: r.lvAtWave }));
