// Ernte-Experiment (22.11.2026): durchgehend ernten, einsammeln, verschmelzen; Screenshots PC + Handy
// node tools/perf/ernte-test.cjs [pc|handy] [outdir]
const { launch, openGame, sleep, DEV } = require('./run.cjs');
(async () => {
  const dev = process.argv[2] || 'pc', out = process.argv[3] || __dirname + '/out';
  const b = await launch();
  const { p } = await openGame(b, dev, DEV);
  if (dev === 'pc') await p.setViewportSize({ width: 1280, height: 720 });
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(2500);
  const st = () => p.evaluate(() => { const g = window.__pog, s = g.s, pl = s.plots[0]; return { t: +g.sim.t.toFixed(1), stage: pl.stage, crop: pl.crop, grow: +pl.grow.toFixed(1), left: pl.yieldLeft, loot: g.sim.loot.length, big: g.sim.loot.filter(l => (l.n ?? 1) > 1).map(l => l.n), wheat: s.items.wheat ?? 0, straw: s.items.straw ?? 0, xp: s.xp, act: g.sim.player.action?.info.kind ?? null, q: s.quests.active.map(q => JSON.stringify(q.need)) }; });
  console.log('start', await st());
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player, c = g.cfg.hof.plots[0]; P.maxHp = P.hp = 1e6; P.x = c.x; P.z = c.z + 1.6; g.view.camInit = false; g.paused = false; setInterval(() => { g.paused = false; }, 200); });
  await p.evaluate(() => window.__pog.fast(6.5));
  console.log('ripe', await st());
  await sleep(1500);
  await p.screenshot({ path: `${out}/${dev}_1_reif.png` });
  if (dev === 'pc') await p.keyboard.down('e');
  else { const bb = await p.$('#bAct'); const r = await bb.boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); }
  // simulated-time based waits (swiftshader is slow)
  // SwiftShader renders only a few frames per second: the simulation is run ahead with __pog.fast (input is still read), then rendered
  const waitT = async dt => { await p.evaluate(d => window.__pog.fast(d), dt); await sleep(2500); };
  await waitT(2.5); console.log('harvesting', await st());
  await p.screenshot({ path: `${out}/${dev}_2_ernten.png` });
  await waitT(2.5); console.log('harvesting2', await st());
  await p.screenshot({ path: `${out}/${dev}_3_ernten.png` });
  if (dev === 'pc') await p.keyboard.up('e');
  await waitT(1); console.log('released', await st());
  await p.screenshot({ path: `${out}/${dev}_4_boden.png` });
  // walk around the field to collect
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player, c = g.cfg.hof.plots[0]; P.x = c.x + 1.5; P.z = c.z; });
  await waitT(.6); console.log('collect', await st());
  await p.screenshot({ path: `${out}/${dev}_5_einsammeln.png` });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
