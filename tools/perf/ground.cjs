// Boden-Shader-Experimente (Plan 22.11.2026): welcher Teil des Shaders kostet? node ground.cjs [pc|handy]
const { launch, openGame, SCENES, measure, stats, sleep, DEV } = require('./run.cjs');
const fs = require('fs');
(async () => {
  const dev = process.argv[2] || 'pc';
  const b = await launch();
  const { p } = await openGame(b, dev, DEV);
  if (dev === 'pc') await p.setViewportSize({ width: 1280, height: 720 });
  await SCENES.day(p); await sleep(2500);
  console.log('Schichten pro Texel', JSON.stringify(await p.evaluate(() => window.__layerStats())));
  const res = [];
  for (const v of (process.env.VARS || 'base,noNoise,oneSample,maxLayers2,loop6,combo,noLight,base').split(',')) {
    await p.evaluate(v => window.__groundVar(v), v); await sleep(600); await measure(p, 1.5, true);
    const s = stats(await measure(p, +process.env.SEC || 7, true));
    res.push({ v, gpu: s.gpuMean, n: s.n }); console.log(v.padEnd(12), 'gpu', s.gpuMean.toFixed(0), 'n', s.n);
  }
  await p.evaluate(() => window.__abl2({ ground: false })); await sleep(600); await measure(p, 1.5, true);
  const s = stats(await measure(p, +process.env.SEC || 7, true)); res.push({ v: 'simple', gpu: s.gpuMean, n: s.n }); console.log('simple'.padEnd(12), 'gpu', s.gpuMean.toFixed(0), 'n', s.n);
  fs.mkdirSync(__dirname + '/out', { recursive: true }); fs.writeFileSync(`${__dirname}/out/ground_${dev}.json`, JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
