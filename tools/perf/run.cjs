const { chromium } = require('playwright');
const fs = require('fs');
const INPAGE = fs.readFileSync(__dirname + '/inpage.js', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEV = 'http://localhost:5173/';
const DEVICES = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  handy: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
async function launch() { return chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] }); }

async function openGame(b, dev, url) {
  const ctx = await b.newContext(DEVICES[dev]);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.addInitScript(INPAGE);
  await p.goto(url, { timeout: 180000 });
  const editor = url.includes('welt.html');
  if (editor) await p.waitForFunction(() => window.__ed, null, { timeout: 240000 });
  else await p.waitForFunction(() => window.__pog && window.__pog.view && document.querySelector('#load')?.classList.contains('out'), null, { timeout: 240000 });
  await p.evaluate(k => window.__perfSetup(k), editor ? 'editor' : 'game');
  const cdp = await ctx.newCDPSession(p);
  return { ctx, p, cdp, editor };
}
const SCENES = {
  menu: async p => {},
  day: async p => {
    await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
    await sleep(1500);
    await p.evaluate(() => { const g = window.__pog; g.sim.player.maxHp = g.sim.player.hp = 1e6; g.fast(60); });
  },
  night: async p => {
    await SCENES.day(p);
    await p.evaluate(() => { const g = window.__pog; g.fast(g.sim.length - g.sim.t + 86); });
  },
  buch: async p => { await SCENES.day(p); await p.evaluate(() => window.__pog.toggleBook()); },
  abend: async p => {
    await SCENES.day(p);
    await p.evaluate(() => { const g = window.__pog; g.sim = null; g.view.clearDynamic(); g.hud.show(false); g.s.phase = 'evening'; g.toEvening(false); });
  },
  editor: async p => {},
};
async function measure(p, sec, sync) {
  await p.evaluate(s => { const P = window.__perf; P.frames = []; P.sync = s; P.on = true; }, sync);
  await sleep(sec * 1000);
  return p.evaluate(() => { const P = window.__perf; P.on = false; return P.frames; });
}
function stats(frames) {
  frames = frames.slice(1);
  if (!frames.length) return null;
  const q = (a, k) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * k))]; };
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const iv = frames.map(f => f.interval), cpu = frames.map(f => f.cpu), gpu = frames.map(f => f.gpu);
  const acc = {}; for (const f of frames) for (const [k, v] of Object.entries(f.acc)) acc[k] = (acc[k] || 0) + v / frames.length;
  const last = frames[frames.length - 1];
  return { n: frames.length, fps: 1000 / mean(iv), ivMean: mean(iv), ivP95: q(iv, .95), cpuMean: mean(cpu), cpuP95: q(cpu, .95), gpuMean: mean(gpu), gpuP95: q(gpu, .95),
    calls: Math.round(mean(frames.map(f => f.calls))), tris: Math.round(mean(frames.map(f => f.tris))), points: Math.round(mean(frames.map(f => f.points))),
    geos: last.geos, texs: last.texs, progs: last.progs, acc };
}
async function cpuProfile(cdp, sec) {
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send('Profiler.start');
  await sleep(sec * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
  // self time per function
  const dtBy = new Map(); const tot = profile.endTime - profile.startTime;
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  const counts = new Map(); for (const s of profile.samples) counts.set(s, (counts.get(s) || 0) + 1);
  const nS = profile.samples.length;
  const self = {};
  for (const [id, c] of counts) { const n = nodes.get(id), cf = n.callFrame; const url = cf.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''); const k = `${cf.functionName || '(anon)'} @ ${url}:${cf.lineNumber + 1}`; self[k] = (self[k] || 0) + c; }
  const IDLE = ['(program)', '(idle)'];
  let idle = 0, gc = 0; for (const [k, c] of Object.entries(self)) { if (IDLE.some(x => k.startsWith(x))) idle += c; if (k.startsWith('(garbage collector)')) gc += c; }
  const act = nS - idle;
  for (const k of Object.keys(self)) if (IDLE.some(x => k.startsWith(x))) delete self[k];
  const selfTop = Object.entries(self).map(([k, c]) => [k, +(100 * c / act).toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 45);
  // by file
  const byFile = {}; for (const [k, c] of Object.entries(self)) { const f = k.split(' @ ')[1].replace(/:\d+$/, ''); byFile[f] = (byFile[f] || 0) + c; }
  const fileTop = Object.entries(byFile).map(([k, c]) => [k, +(100 * c / act).toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 25);
  // heap allocations
  const alloc = {}; let allocTot = 0;
  const walk = (n) => { const cf = n.callFrame; const url = cf.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''); const k = `${cf.functionName || '(anon)'} @ ${url}:${cf.lineNumber + 1}`; alloc[k] = (alloc[k] || 0) + n.selfSize; allocTot += n.selfSize; for (const c of n.children || []) walk(c); };
  walk(heap.head);
  const allocTop = Object.entries(alloc).map(([k, b]) => [k, +(b / sec / 1024).toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return { durMs: tot / 1000, activePct: +(100 * act / nS).toFixed(1), gcPct: +(100 * gc / Math.max(1, act)).toFixed(1), selfTop, fileTop, allocKBs: +(allocTot / sec / 1024).toFixed(1), allocTop };
}
module.exports = { launch, openGame, SCENES, measure, stats, cpuProfile, sleep, DEV };

if (require.main === module) (async () => {
  const [dev, scene, throttle = '1', mode = 'all'] = process.argv.slice(2);
  const b = await launch();
  const url = scene === 'editor' ? DEV + 'welt.html' : DEV;
  const t0 = Date.now();
  const { p, cdp } = await openGame(b, dev, url);
  const boot = Date.now() - t0;
  await SCENES[scene](p);
  await sleep(2500);
  if (+throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
  await sleep(1000);
  const out = { dev, scene, throttle: +throttle, bootMs: boot };
  await p.evaluate(() => { window.__perf.noDraw = true; });
  out.async = stats(await measure(p, 5, false));
  if (mode === 'all') {
    out.prof = await cpuProfile(cdp, 5);
    await p.evaluate(() => { window.__perf.noDraw = false; });
    await sleep(500);
    out.sync = stats(await measure(p, +process.env.SEC || 6, true));
    out.census = await p.evaluate(() => window.__census());
    out.heap = await p.evaluate(() => ({ used: performance.memory.usedJSHeapSize / 1048576, total: performance.memory.totalJSHeapSize / 1048576 }));
  }
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(`${__dirname}/out/${dev}_${scene}_x${throttle}.json`, JSON.stringify(out, null, 1));
  const a = out.async, s = out.sync;
  console.log(dev, scene, 'x' + throttle, 'fps', a.fps.toFixed(1), 'cpu', a.cpuMean.toFixed(1), 'p95', a.ivP95.toFixed(1), 'calls', a.calls, 'tris', a.tris, s ? 'gpu ' + s.gpuMean.toFixed(1) : '');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
