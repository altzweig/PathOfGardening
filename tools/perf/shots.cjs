// Sichtvergleich (Plan 22.11.2026): feste Kamerapositionen fotografieren, um vorher/nachher zu vergleichen.
// node shots.cjs [url=http://localhost:5173/] [prefix=now]  -> out/shots/<prefix>_<pose>.png
const { launch, openGame, sleep, DEV } = require('./run.cjs');
const fs = require('fs');
(async () => {
  const url = process.argv[2] || DEV, pre = process.argv[3] || 'now';
  const b = await launch();
  const { p } = await openGame(b, 'pc', url);
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(2500);
  const H = await p.evaluate(() => { const g = window.__pog; g.sim.player.maxHp = g.sim.player.hp = 1e6; return { plot: g.cfg.hof.plots[0], door: g.cfg.hof.door, half: (g.hof.logic?.size ?? 83) / 2 }; });
  const poses = [
    ['feld_nah', H.plot.x, H.plot.z + 1, 0.6, .45, 4, 11],
    ['feld_weit', H.plot.x, H.plot.z + 1, 2.2, .35, 10, 11],
    ['haus', H.door.x, H.door.z + 3, 0, .3, 9, 11],
    ['waldrand_n', 0, -H.half * .6, Math.PI, .2, 8, 11],
    ['waldrand_o', H.half * .6, 0, -Math.PI / 2, .15, 10, 11],
    ['flach_lang', 0, H.half * .3, 0, -.1, 10, 15],
    ['nacht', H.plot.x, H.plot.z + 1, 0.6, .45, 8, 1],
  ];
  fs.mkdirSync(__dirname + '/out/shots', { recursive: true });
  for (const [n, x, z, yaw, pitch, dist, hour] of poses) {
    await p.evaluate(([x, z, yaw, pitch, dist, hour]) => {
      const g = window.__pog, v = g.view, P = g.sim.player; P.x = x; P.z = z; P.vx = P.vz = 0;
      v.camYaw = yaw; v.camPitch = pitch; v.camDist = dist; v.hour = hour; g.paused = false; v.camX = x; v.camZ = z; v.camInit = false;
    }, [x, z, yaw, pitch, dist, hour]);
    // SwiftShader draws only a few frames per second: wait for a few frames after the jump (light, LOD, shadows)
    const f0 = await p.evaluate(() => window.__pog.sim.t);
    await p.waitForFunction(t0 => window.__pog.sim.t > t0 + .3, f0, { timeout: 120000 });
    await p.evaluate(([x, z]) => { const P = window.__pog.sim.player; P.x = x; P.z = z; window.__pog.view.camInit = false; }, [x, z]);
    await sleep(5000);
    await p.screenshot({ path: `${__dirname}/out/shots/${pre}_${n}.png` });
    console.log('shot', n);
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
