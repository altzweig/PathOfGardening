// Holz hacken, Werkbank, Zäune (22.11.2026): node tools/perf/holz-test.cjs [pc|handy] [outdir]
const { launch, openGame, sleep, DEV } = require('./run.cjs');
(async () => {
  const dev = process.argv[2] || 'pc', out = process.argv[3] || __dirname + '/out';
  const b = await launch(); const { p } = await openGame(b, dev, DEV);
  if (dev === 'pc') await p.setViewportSize({ width: 1280, height: 720 });
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(2500);
  await p.evaluate(() => { const g = window.__pog; setInterval(() => { g.paused = false; }, 200); g.sim.player.maxHp = g.sim.player.hp = 1e6; g.sim.spawns = false; g.sim.animals.length = 0; });
  const st = () => p.evaluate(() => { const g = window.__pog, s = g.s, L = s.lumber; return { t: +g.sim.t.toFixed(1), wood: s.items.wood ?? 0, fence: s.items.fence ?? 0, tree0: L.trees[0], loot: g.sim.loot.filter(l => l.item === 'wood').length, fences: L.fences.length, hp: L.fences.map(f => +f.hp.toFixed(1)).join(','), act: g.sim.player.action?.info.kind ?? null, an: g.sim.animals.filter(a => !a.gone).map(a => ({ t: a.type, x: +a.x.toFixed(1), z: +a.z.toFixed(1), st: a.state, fence: a.fence })) }; });
  const waitT = async dt => { await p.evaluate(d => window.__pog.fast(d), dt); await sleep(dev === 'pc' ? 1500 : 2500); };
  const press = async () => { if (dev === 'pc') await p.keyboard.down('e'); else { const r = await (await p.$('#bAct')).boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); } };
  const release = async () => { if (dev === 'pc') await p.keyboard.up('e'); };
  // --- 1. chopping the first yard tree
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player, t = g.cfg.lumber.trees[0], a0 = -2.2; P.x = t.x + Math.sin(a0) * .95; P.z = t.z + Math.cos(a0) * .95; P.f = Math.atan2(t.x - P.x, t.z - P.z); g.view.camYaw = a0 + 1.0; g.view.camInit = false; window.__cam = setInterval(() => { g.view.camYaw = a0 + 1.0; }, 50); });
  await sleep(1500);
  console.log('start', await st());
  await p.screenshot({ path: `${out}/${dev}_h0_baum.png` });
  await press();
  await waitT(dev === 'pc' ? 4 : .1);
  if (dev !== 'pc') { await waitT(4); }
  console.log('chopping', await st());
  await p.screenshot({ path: `${out}/${dev}_h1_kerbe.png` });
  await waitT(5.6); console.log('almost', await st());
  await p.screenshot({ path: `${out}/${dev}_h2_tiefe_kerbe.png` });
  await waitT(.6); console.log('falls', await st());
  await p.evaluate(() => window.__pog.fast(.8)); await sleep(300);
  await p.screenshot({ path: `${out}/${dev}_h3_faellt.png` });
  await release();
  await waitT(1.4); console.log('down', await st());
  await p.screenshot({ path: `${out}/${dev}_h4_gespalten.png` });
  // collect the wood: walk round the fallen tree
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player, t = g.cfg.lumber.trees[0]; P.x = t.x + 1.8; P.z = t.z; });
  await waitT(.5);
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player, t = g.cfg.lumber.trees[0]; P.x = t.x; P.z = t.z + 1.8; g.fast(.5); P.x = t.x - 1.8; P.z = t.z; g.fast(.5); P.x = t.x; P.z = t.z - 1.8; g.fast(.5); });
  console.log('collected', await st());
  await waitT(30); console.log('sapling half', await st());
  await p.screenshot({ path: `${out}/${dev}_h5_setzling.png` });
  // --- 2. workbench
  await p.evaluate(() => clearInterval(window.__cam));
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player, B = g.cfg.lumber.bench; P.x = B.x + .2; P.z = B.z + 1.2; P.f = Math.PI; });
  await sleep(800);
  await press(); await waitT(5.2);
  console.log('crafted', await st());
  await p.screenshot({ path: `${out}/${dev}_h6_werkbank.png` });
  await release(); await waitT(.3);
  // --- 3. fences with F (in a row, the next one snaps on)
  await p.evaluate(() => { const g = window.__pog, P = g.sim.player; P.x = -2; P.z = -4.2; P.f = Math.PI / 2; });
  const F = async () => { if (dev === 'pc') await p.keyboard.press('f'); else { const r = await (await p.$('#bFence')).boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); } await sleep(250); await p.evaluate(() => window.__pog.fast(.1)); };
  for (let i = 0; i < 3; i++) { await F(); await p.evaluate(() => { const P = window.__pog.sim.player; P.z += 1.6; }); }
  await waitT(.2); console.log('placed', await st());
  await p.screenshot({ path: `${out}/${dev}_h7_zaun.png` });
  // --- 4. animals: a short wall = walk round, a closed ring = bite through
  const ring = await p.evaluate(() => {
    const g = window.__pog, sim = g.sim, s = g.s, L = s.lumber, P = sim.player, C = g.cfg.lumber.fence;
    L.fences.length = 0; P.x = 9; P.z = -1; // in the open yard
    const R = 2.2, n = Math.ceil(2 * Math.PI * R / (C.length * .97));
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; L.fences.push({ id: L.seq++, x: P.x + Math.cos(a) * R, z: P.z + Math.sin(a) * R, a: -Math.PI / 2 - a, hp: C.hp }); }
    L.rev++; sim.hof.syncLumber(L);
    const a = sim.spawn('raccoon', 0, { x: P.x + 7, z: P.z, night: true, state: 'attack', hp: 99, maxHp: 99 }); window.__ra = a;
    return n;
  });
  console.log('ring of', ring);
  await waitT(.1);
  for (let k = 0; k < 6; k++) await p.evaluate(() => window.__pog.fast(1.5));
  console.log('ring bitten', await st());
  await p.screenshot({ path: `${out}/${dev}_h8_ring_angriff.png` });
  // short wall: goes round
  await p.evaluate(() => {
    const g = window.__pog, sim = g.sim, s = g.s, L = s.lumber, P = sim.player, C = g.cfg.lumber.fence;
    sim.animals.length = 0; L.fences.length = 0;
    for (let k = -1; k <= 1; k++) L.fences.push({ id: L.seq++, x: P.x + 2, z: P.z + k * C.length, a: 0 + Math.PI / 2 * 0, hp: C.hp });
    // fence along z: angle so that the long side runs along z
    for (const f of L.fences) f.a = Math.PI / 2;
    L.rev++; sim.hof.syncLumber(L);
    window.__rb = sim.spawn('raccoon', 0, { x: P.x + 6, z: P.z, night: true, state: 'attack', hp: 99, maxHp: 99 });
  });
  for (let k = 0; k < 3; k++) await p.evaluate(() => window.__pog.fast(1));
  console.log('wall', await st(), await p.evaluate(() => { const a = window.__rb, P = window.__pog.sim.player; return { d: +Math.hypot(a.x - P.x, a.z - P.z).toFixed(2) }; }));
  await sleep(1200);
  await p.screenshot({ path: `${out}/${dev}_h9_wand_umweg.png` });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
