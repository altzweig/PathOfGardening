// node run.mjs '<json job>' -> runs split over 4 processes, prints summary
import { execFile } from 'child_process';
const job = JSON.parse(process.argv[2]); const P = 4, per = Math.ceil(job.runs / P);
const W = process.env.POG_WORKER || new URL('./worker.cjs', import.meta.url).pathname;
const parts = await Promise.all([...Array(P)].map(() => new Promise((res, rej) => execFile('node', [W, JSON.stringify({ ...job, runs: per })], { cwd: process.env.POG_CWD, maxBuffer: 1e8 }, (e, out) => e ? rej(e) : res(JSON.parse(out))))));
const rs = parts.flat();
const avg = a => a.reduce((x, y) => x + y, 0) / a.length, med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
const waves = rs.map(r => r.wave), lvAt = w => avg(rs.map(r => r.lvAtWave[w] ?? r.level));
const sum = { n: rs.length, win: avg(rs.map(r => r.won ? 1 : 0)), waveMed: med(waves), waveAvg: +avg(waves).toFixed(1), waveMin: Math.min(...waves), lv: [8, 16, 24, 32, 40, 48].map(w => +lvAt(w).toFixed(1)), deaths: +avg(rs.map(r => r.deaths)).toFixed(1), noAmmo: +avg(rs.map(r => r.noAmmoShare)).toFixed(2), wasted: +avg(rs.map(r => r.wasted)).toFixed(1), bossEnd: +avg(rs.map(r => r.bossEnd ? 1 : 0)).toFixed(2), boss1: +avg(rs.map(r => r.bossAt[0] ?? 0)).toFixed(1), q: [.1,.25,.75,.9].map(k => [...waves].sort((a,b)=>a-b)[Math.floor(k*waves.length)]) };
if (job.bySecond) { const g = {}; for (const r of rs) (g[r.second] ??= []).push(r); sum.bySecond = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, +avg(v.map(r => r.wave)).toFixed(1) + "/" + avg(v.map(r => r.noAmmoShare)).toFixed(2)])); }
if (job.picks) { const pk = {}; for (const r of rs) for (const [k, v] of Object.entries(r.picks)) pk[k] = (pk[k] || 0) + v; sum.picks = Object.entries(pk).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ':' + (v / rs.length).toFixed(1)).join(' '); }
console.log(JSON.stringify({ label: job.label ?? '', ...sum }));
