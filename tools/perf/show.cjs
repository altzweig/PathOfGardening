const f = process.argv[2]; const o = require('./out/' + f + '.json');
const a = o.async; console.log('ASYNC fps', a.fps.toFixed(1), 'iv', a.ivMean.toFixed(1), 'p95', a.ivP95.toFixed(1), 'cpu', a.cpuMean.toFixed(2), 'cpuP95', a.cpuP95.toFixed(2), 'calls', a.calls, 'tris', a.tris);
console.log(Object.entries(a.acc).sort((x, y) => y[1] - x[1]).map(([k, v]) => k + ' ' + v.toFixed(2)).join('\n'));
if (o.sync) console.log('SYNC gpu', o.sync.gpuMean.toFixed(0), 'p95', o.sync.gpuP95.toFixed(0), 'n', o.sync.n);
if (o.prof) { const P = o.prof; console.log('PROF active%', P.activePct, 'gc% of active', P.gcPct, 'alloc KB/s', P.allocKBs);
  for (const r of P.selfTop.slice(0, +process.env.N || 30)) console.log(' ', r[1], r[0]);
  console.log('FILES'); for (const r of P.fileTop.slice(0, 14)) console.log(' ', r[1], r[0]);
  console.log('ALLOC KB/s'); for (const r of P.allocTop.slice(0, 14)) console.log(' ', r[1], r[0]); }
if (o.heap) console.log('heap', o.heap);
