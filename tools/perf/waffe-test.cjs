// Beeren-Schrotflinte, Doom-Balken, Munitions-Karussell, Aussaatplan (22.11.2026): node tools/perf/waffe-test.cjs [pc|handy] [outdir]
const { launch, openGame, sleep, DEV } = require('./run.cjs');
(async () => {
  const dev = process.argv[2] || 'pc', out = process.argv[3] || __dirname + '/out';
  const b = await launch(); const { p } = await openGame(b, dev, DEV);
  if (dev === 'pc') await p.setViewportSize({ width: 1280, height: 720 });
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(2500);
  await p.evaluate(() => { const g = window.__pog; setInterval(() => { g.paused = false; }, 200); g.sim.player.maxHp = g.sim.player.hp = 1e6; g.s.items.strawb = 15; });
  const st = () => p.evaluate(() => { const g = window.__pog, s = g.s; return { ammo: s.ammo, blue: s.items.blue, bramble: s.items.bramble, strawb: s.items.strawb, pellets: g.sim.pellets.length, an: g.sim.animals.filter(a => !a.gone).map(a => ({ t: a.type, hp: +a.hp.toFixed(1), doom: a.doom, bleed: a.bleed && +a.bleed.toFixed(1), fz: +a.freeze.toFixed(1), driven: a.driven })) }; });
  // a hare 6 m in front of the farmer, then shoot brambles at it (Tab twice: blue -> strawb -> bramble)
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player; g.sim.spawns = false; g.sim.animals.length = 0; const a = g.sim.spawn ? null : null; });
  if (dev === 'pc') { await p.keyboard.press('Tab'); await sleep(300); await p.keyboard.press('Tab'); }
  else { const r = await (await p.$('#bSeed')).boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await sleep(300); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); }
  await sleep(1500); console.log('after tab', await st());
  await p.screenshot({ path: `${out}/${dev}_w1_karussell.png` });
  // a raccoon 7 m in front of the farmer, held in place; shots go through the real attack (auto aim like on the phone)
  await p.evaluate(() => {
    const g = window.__pog, sim = g.sim, P = sim.player;
    const a = sim.spawn('raccoon', 0, { x: P.x, z: P.z - 5.5, hp: 40, maxHp: 40, state: 'wander' }); window.__tA = a;
    setInterval(() => { a.x = P.x; a.z = P.z - 5.5; }, 30);
    window.__shoot = () => { P.cd = 0; sim.as(P, () => sim.attack({ mx: 0, mz: 0, aimX: a.x, aimZ: a.z, aimAuto: true, act: null, hold: false, holdAt: null, attack: true })); };
    g.view.camYaw = 0; g.view.camPitch = .45; g.view.camInit = false;
  });
  for (let i = 0; i < 3; i++) { await p.evaluate(() => { window.__shoot(); window.__pog.fast(.45); }); }
  console.log('3 bramble shots', await st());
  await p.evaluate(() => window.__shoot()); await sleep(dev === "pc" ? 500 : 900);
  await p.screenshot({ path: `${out}/${dev}_w2_schuss_doom.png` });
  await p.evaluate(() => window.__pog.fast(1)); console.log('4th', await st());
  // strawberries: bleeding
  await p.evaluate(() => { window.__pog.hud.nextSeed(-1); }); await sleep(300);
  await p.evaluate(() => { window.__shoot(); window.__pog.fast(.4); }); console.log('strawb', await st());
  await p.evaluate(() => window.__pog.fast(3)); console.log('bleed 3s', await st());
  // more doom until it goes
  await p.evaluate(() => { window.__pog.hud.nextSeed(1); }); for (let i = 0; i < 6; i++) await p.evaluate(() => { window.__shoot(); window.__pog.fast(.7); });
  console.log('doom end', await st());
  // evening: sowing plan page
  await p.evaluate(() => { const g = window.__pog; g.sim = null; g.view.clearDynamic(); g.hud.show(false); g.s.phase = 'evening'; g.toEvening(false); });
  await sleep(2500);
  await p.evaluate(() => { const lv = document.querySelector('#lvClose, .lvClose'); if (lv) lv.click(); const b = document.querySelector('.bm[data-tab=plan]'); b && b.click(); });
  await sleep(2500);
  await p.evaluate(() => { document.querySelector('.plF[data-plot="1"]')?.click(); }); await sleep(400);
  await p.evaluate(() => { document.querySelector('.plS[data-plan="onion"]')?.click(); }); await sleep(800);
  await p.screenshot({ path: `${out}/${dev}_w3_aussaatplan.png` });
  console.log('plan', await p.evaluate(() => window.__pog.s.plots.filter(p => p.open).map(p => [p.crop, p.plan])));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
