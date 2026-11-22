// Look-Analyse (22.11.2026): Vorher/Nachher-Bilder + GPU-Kosten pro Effekt-Variante.
// Dev-Server auf :5173, dann: node tools/look-lab/lab.cjs pc|handy  -> tools/look-lab/out/
const { launch, sleep } = require('../perf/run.cjs');
const fs = require('fs');
const INPAGE = fs.readFileSync(__dirname + '/../perf/inpage.js', 'utf8');
const shots = JSON.parse(fs.readFileSync(__dirname + '/../loading-shots/shots.json', 'utf8'));
const VARIANTS = [
  ['a_vorher', { aa: 'none', soft: false, ao: false }],
  ['b_msaa', { aa: 'msaa', soft: false, ao: false }],
  ['c_fxaa', { aa: 'fxaa', soft: false, ao: false }],
  ['d_soft', { aa: 'none', soft: true, ao: false }],
  ['e_glow_grade', { aa: 'none', soft: true, ao: false, softOpts: { tilt: 0, soft: 0 } }],
  ['f_ao', { aa: 'none', soft: false, ao: true }],
  ['g_msaa_soft', { aa: 'msaa', soft: true, ao: false }],
];
(async () => {
  const dev = process.argv[2] || 'pc', views = (process.argv[3] || '2_mittag,3_abend,4_nacht_baum').split(',');
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  const b = await launch();
  const ctx = await b.newContext(dev === 'pc' ? { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }
    : { viewport: { width: 393, height: 852 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.addInitScript(INPAGE);
  await p.goto('http://localhost:5173/?q=' + (dev === 'pc' ? 'hoch' : 'mittel'), { timeout: 180000 });
  await p.waitForFunction(() => window.__pog && window.__pog.view && document.querySelector('#load')?.classList.contains('out'), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(3000);
  await p.addStyleTag({ content: '#app > :not(canvas){display:none!important} body > :not(#app){display:none!important}' });
  await p.evaluate(async () => {
    window.__lab = await import('/src/view/lookLab.ts'); window.__dn = await import('/src/view/daynight.ts');
    const g = window.__pog; g.sim.player.maxHp = g.sim.player.hp = 1e6;
  });
  const res = {};
  for (const S of shots.filter(s => views.includes(s.name))) {
    await p.evaluate((S) => {
      const g = window.__pog, v = g.view, s = g.s;
      for (const [i, [kind, stage, k]] of Object.entries(S.plots)) Object.assign(s.plots[i], { open: true, kind, crop: kind, stage, watered: false, t: 0, weeds: 0, yieldLeft: stage === 'ripe' ? 3 : 0, broken: false, hp: undefined, grow: stage === 'sown' ? (g.cfg.crops[kind]?.grow ?? 20) * k : 0 });
      g.sim.animals.length = 0; window.__dn.resetDayNight();
      const sh = S[innerWidth > innerHeight ? 'pc' : 'handy'];
      v.hour = S.hour; v.cine = { pos: new v.camPos.constructor(...sh.pos), look: new v.camPos.constructor(...sh.look), roll: 0, fov: sh.fov };
    }, S);
    for (const [vn, L] of VARIANTS) {
      await p.evaluate(L => window.__lab.setLook(L), L);
      const f0 = await p.evaluate(() => window.__pog.sim.t);
      await p.waitForFunction(t0 => window.__pog.sim.t > t0 + .6, f0, { timeout: 300000 });
      await p.evaluate(() => { window.__pog.sim.animals.length = 0; });
      await sleep(1500);
      await p.screenshot({ timeout: 300000, path: `${__dirname}/out/${dev}_${S.name}_${vn}.png` });
      const ms = await p.evaluate(() => { const g = window.__pog; g.paused = true; return window.__lab.timeFrames(5); });
      await p.evaluate(() => { window.__pog.paused = false; });
      (res[S.name] ??= {})[vn] = Math.round(ms);
      console.log(dev, S.name, vn, Math.round(ms), 'ms');
    }
  }
  fs.writeFileSync(`${__dirname}/out/${dev}_kosten.json`, JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
