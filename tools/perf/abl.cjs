const { launch, openGame, SCENES, measure, stats, sleep, DEV } = require('./run.cjs');
const fs = require('fs');
(async () => {
  const [dev = 'pc', scene = 'day', W = '1280', H = '720'] = process.argv.slice(2);
  const b = await launch();
  const { p, ctx } = await openGame(b, dev, scene === 'editor' ? DEV + 'welt.html' : DEV);
  if (dev === 'pc') await p.setViewportSize({ width: +W, height: +H });
  await SCENES[scene](p); await sleep(2500);
  const base = await p.evaluate(() => window.__perf.core.renderer.getPixelRatio());
  console.log('objects', JSON.stringify(await p.evaluate(() => window.__objCount())));
  const V = process.env.V2 ? [
    ['Basis', {}],
    ['Boden: einfaches Material', { ground: false }],
    ['ohne 3 Punktlichter (tagsüber Intensität 0)', { points: false }],
    ['Basis (Wiederholung)', {}],
  ] : [
    ['Basis', {}],
    ['ohne Schatten', { shadow: false }],
    ['ohne Bloom', { bloom: false }],
    ['ohne Post (direkt rendern)', { post: false, bloom: false }],
    ['ohne Wald/Props', { props: false }],
    ['ohne Gras', { grass: false }],
    ['Blätter werfen keinen Schatten', { leafShadow: false }],
    ['Shadow-Map 1024', { shadowSize: 1024 }],
    ['PCF statt PCFSoft', { pcf: 1 }],
    ['Pixel Ratio x0.5', { pr: base * .5 }],
    ['Pixel Ratio x0.1 (≈ nur Vertex/CPU)', { pr: base * .1 }],
    ['Niedrig-Kombi (pr1, ohne Schatten, ohne Bloom)', { pr: 1, shadow: false, bloom: false }],
  ];
  const res = [];
  const reset = { shadow: true, bloom: true, post: true, props: true, grass: true, leafShadow: true, shadowSize: dev === 'pc' ? 2048 : 1024, pcf: 2, pr: base };
  for (const [name, o] of V) {
    await p.evaluate(o => { window.__abl(o); window.__abl2(o); }, { ...reset, ...o });
    await sleep(400); await measure(p, 1.5, true);
    const s = stats(await measure(p, +process.env.SEC || 8, true));
    res.push({ name, gpu: s.gpuMean, cpu: s.cpuMean, calls: s.calls, tris: s.tris, n: s.n });
    console.log(name.padEnd(44), 'gpu', s.gpuMean.toFixed(0).padStart(6), 'cpu', s.cpuMean.toFixed(1).padStart(6), 'calls', s.calls, 'tris', s.tris, 'n', s.n);
  }
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(`${__dirname}/out/abl${process.env.V2?'2':''}_${dev}_${scene}.json`, JSON.stringify({ W, H, base, res }, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
