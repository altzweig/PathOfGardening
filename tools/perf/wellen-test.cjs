// Kürzere Tage mit Wellen-Nächten (22.11.2026): node tools/perf/wellen-test.cjs [pc|handy] [outdir] [level] [bots]
const { launch, openGame, sleep, DEV } = require('./run.cjs');
(async () => {
  const dev = process.argv[2] || 'pc', out = process.argv[3] || __dirname + '/out', lv = +(process.argv[4] || 1), bots = +(process.argv[5] || 0);
  const b = await launch(); const { p } = await openGame(b, dev, DEV);
  if (dev === 'pc') await p.setViewportSize({ width: 1280, height: 720 });
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(2500);
  await p.evaluate(([lv, bots]) => { const g = window.__pog; setInterval(() => { g.paused = false; }, 200); g.s.level = lv; if (bots) g.bot(bots); for (const P of g.sim.players) P.maxHp = P.hp = 1e6; }, [lv, bots]);
  console.log('day', await p.evaluate(() => ({ length: window.__pog.sim.length, night: window.__pog.sim.nightLen })));
  await p.evaluate(() => { const g = window.__pog; g.fast(g.sim.length - g.sim.t + .1); });
  const info = await p.evaluate(() => { const g = window.__pog, s = g.sim; return { lv: s.nightLv, waves: s.waves.map(w => +(w - s.length).toFixed(1)), plan: s.plan.filter(x => x.night).map(x => [+(x.at - s.length).toFixed(1), x.type[0], x.wave]) }; });
  console.log('waves', info.waves, 'lv', info.lv, 'animals', info.plan.length);
  // histogram: animals per 6 s
  const h = Array(30).fill(0); for (const [t] of info.plan) h[Math.min(29, Math.floor(t / 6))]++;
  console.log(h.map((n, i) => `${String(i * 6).padStart(3)}s ${'#'.repeat(n)}`).join('\n'));
  // to the middle of the 2nd wave, keep the farmer alive, screenshot
  const peak = info.waves[1] + 10;
  for (let t = 0; t < peak; t += 5) { await p.evaluate(() => { const g = window.__pog; for (const P of g.sim.players) P.hp = P.maxHp; g.fast(5); }); }
  await sleep(6000);
  console.log('on farm', await p.evaluate(() => window.__pog.sim.animals.filter(a => a.night && !a.gone).length), 'dots', await p.evaluate(() => document.querySelector('#fCd')?.innerText));
  await p.screenshot({ path: `${out}/${dev}_welle2.png` });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
