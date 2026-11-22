// node shoot.cjs <shots.json> <dev pc|handy> [scale]
const { launch, sleep } = require('../perf/run.cjs');
const fs = require('fs');
const INPAGE = fs.readFileSync(__dirname + '/../perf/inpage.js', 'utf8');
(async () => {
  const shots = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), dev = process.argv[3] || 'pc', pr = +(process.argv[4] || 1);
  const only = process.argv[5];
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  const b = await launch();
  const vp = dev === 'pc' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.addInitScript(INPAGE);
  await p.goto('http://localhost:5173/?q=hoch', { timeout: 180000 });
  await p.waitForFunction(() => window.__pog && window.__pog.view && document.querySelector('#load')?.classList.contains('out'), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(3000);
  await p.addStyleTag({ content: '#app > :not(canvas){display:none!important} body > :not(#app){display:none!important}' });
  await p.evaluate(async ([pr]) => {
    const core = await import('/src/view/core.ts'); window.__dn = await import('/src/view/daynight.ts'); core.renderer.setPixelRatio(pr); core.composer.setPixelRatio(pr); core.resize();
    const g = window.__pog; g.sim.player.maxHp = g.sim.player.hp = 1e6;
    window.__setup = (S) => {
      const g = window.__pog, s = g.s, kinds = Object.keys(g.cfg.crops);
      for (let i = 0; i < s.plots.length; i++) {
        const P = s.plots[i], o = S.plots[i];
        if (!o) continue;
        const [kind, stage, k] = o;
        Object.assign(P, { open: true, kind, crop: stage === 'empty' ? null : kind, stage, watered: false, t: 0, weeds: 0, yieldLeft: stage === 'ripe' ? 3 : 0, broken: false, hp: undefined,
          grow: stage === 'sown' ? (g.cfg.crops[kind]?.grow ?? 20) * k : 0 });
      }
      g.sim.animals.length = 0;
    };
  }, [pr]);
  for (const S of shots) {
    if (only && S.name !== only) continue;
    await p.evaluate((S) => {
      const g = window.__pog, v = g.view; window.__setup(S); window.__dn.resetDayNight();
      const sh = S[window.innerWidth > window.innerHeight ? 'pc' : 'handy'] || S.pc;
      g.sim.player.x = sh.px ?? 0; g.sim.player.z = sh.pz ?? 0;
      v.hour = S.hour; v.cine = { pos: new v.camPos.constructor(...sh.pos), look: new v.camPos.constructor(...sh.look), roll: 0, fov: sh.fov };
      g.sim.raining = !!S.rain;
    }, S);
    const f0 = await p.evaluate(() => window.__pog.sim.t);
    await p.waitForFunction(t0 => window.__pog.sim.t > t0 + 1.5, f0, { timeout: 300000 });
    await p.evaluate(() => { window.__pog.sim.animals.length = 0; });
    await sleep(4000);
    await p.screenshot({ timeout: 300000, path: `${__dirname}/out/${S.name}_${dev}.png` });
    console.log('shot', S.name, dev);
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
