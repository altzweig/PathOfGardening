// 26.11.2026 one bot run with a line every 10 s of game time (wave, ammo, weapons, research, what the player holds)
import * as fs from 'fs'; import YAML from 'yaml'; import { Sim } from '../../src/sim/sim'; import { runBot } from './bot';
const cfg = YAML.parse(fs.readFileSync('Game Design & Balancing/balancing.yaml', 'utf8'));
const ov = JSON.parse(process.argv[2] || '{}'); for (const [k, v] of Object.entries(ov)) { const ks = k.split('.'); let c: any = cfg; for (const x of ks.slice(0, -1)) c = c[x] ??= {}; c[ks.at(-1)!] = v; }
const P: any = Sim.prototype, up = P.update; let next = 0;
P.update = function (dt: number) {
  up.call(this, dt);
  if (this.time >= next) { next += this.wave >= +(process.env.FROM || 99) ? 2 : 10; const p = this.players[0]; if (!p) return;
    const am = Object.entries(p.ammo).filter(([, v]) => (v as number) > 0).map(([k, v]) => k + ':' + Math.round(v as number)).join(' ');
    const ln = Object.keys(p.skills).filter(k => p.skills[k].learned).join(',');
    console.log(`t ${Math.round(this.time)} w ${this.wave}${this.wavePause ? 'p' : ''} en ${this.enemies.filter((e: any) => !e.dead).length} hp ${Math.round(p.hp)} ${p.alive ? '' : 'DEAD'} act ${p.active}/${p.intent.fire} bw ${p.benchWork ? 1 : 0} ammo[${am}] learned[${ln}] rs ${this.rs.cur}${this.rs.ready ? '!' : ''} ${Math.round(this.rs.work[this.rs.cur] ?? 0)}/${Math.round(this.rsCost())} done ${this.rs.done.length} fields ${this.fields.filter((f: any) => f.alive).map((f: any) => f.type + Math.round(f.hp)).join(',')} pos ${p.x.toFixed(1)},${p.z.toFixed(1)} eat ${this.enemies.filter((e: any) => !e.dead && e.target?.kind === 'field').map((e: any) => e.type[0] + e.target.f?.type).join(' ')}`); }
};
const r = runBot(cfg, { weapons: 2, maxTime: +(process.env.T || 3000) });
console.log(JSON.stringify({ wave: r.wave, deaths: r.deaths, kills: r.kills, noAmmo: r.noAmmoShare, picks: r.picks }));
