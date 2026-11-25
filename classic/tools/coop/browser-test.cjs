// Classic co-op browser test (25.11.2026): host + N-1 guests in headless Chromium over a local PeerJS broker.
// Needs: vite dev on :5174 (classic/) and a PeerJS server on 127.0.0.1:9000 (npm i peer; PeerServer({port:9000,path:'/',host:'127.0.0.1'})).
// Usage: node tools/coop/browser-test.cjs <players> <seconds>   (cloud machine renders ~1 fps: only checks flow + sync, not speed)
const { chromium } = require('playwright');
const N = +(process.argv[2] || 2), SECS = +(process.argv[3] || 60), PAR = process.argv[4] || '';
const URL = 'http://localhost:5174/?peer=127.0.0.1:9000' + PAR;
const clk = (pg, sel) => pg.evaluate(s => document.querySelector(s).click(), sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [];
  const errs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('pog-classic.tutorial', '0'); } catch {} });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(`[p${i}] ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error') errs.push(`[p${i}] console: ${m.text().slice(0, 200)}`); });
    await pg.goto(URL); pages.push(pg);
  }
  for (const pg of pages) await pg.waitForSelector('#menu:not([hidden])', { timeout: 90000 });
  for (const pg of pages) await pg.evaluate(() => { document.querySelector('#qualBtn').click(); document.querySelector('#qualBtn').click(); });
  const H = pages[0];
  await clk(H, '#coopBtn'); await clk(H, '#hostBtn');
  await H.waitForFunction(() => document.querySelector('#lobbyCode')?.textContent?.length === 5, null, { timeout: 20000 });
  const code = await H.textContent('#lobbyCode'); console.log('code', code);
  for (const pg of pages.slice(1)) { await clk(pg, '#coopBtn'); await pg.evaluate(c => { document.querySelector('#codeIn').value = c; document.querySelector('#joinBtn').click(); }, code); }
  for (const pg of pages.slice(1)) await pg.waitForSelector('#lobby:not([hidden])', { timeout: 150000 });
  await sleep(1000);
  console.log('lobby players host:', await H.$$eval('#lobbyPlayers .lp', l => l.length));
  // instrumentation
  await H.evaluate(() => {
    const g = window.__pog, h = g.host; window.__m = { sent: 0, bytes: 0, maxB: 0, simMs: 0, simN: 0, simMax: 0 };
    const ob = h.sendSnap.bind(h);
    h.sendSnap = s => { s._ts = Date.now(); const b = JSON.stringify(s).length; __m.sent++; __m.bytes += b; __m.maxB = Math.max(__m.maxB, b); ob(s); };
  });
  for (const pg of pages) await pg.evaluate(() => {
    window.__f = { n: 0, worst: 0, last: performance.now(), lat: [], gaps: [], lastSnap: 0, snaps: 0 };
    const loop = t => { const d = t - __f.last; __f.last = t; __f.n++; __f.worst = Math.max(__f.worst, d); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    const g = window.__pog;
    if (g.client) { const osd = g.client.send.bind(g.client); __f.sent = 0; g.client.send = m => { if (m.t === 'in') __f.sent++; osd(m); }; const os = g.client.onSnap; g.client.onSnap = s => { const now = Date.now(); __f.lat.push(now - s._ts); if (__f.lastSnap) __f.gaps.push(now - __f.lastSnap); __f.lastSnap = now; __f.snaps++; os(s); }; }
  });
  await clk(H, '#lobbyStart');
  // reconnect onSnap wrappers after joinGame closures: client.onSnap was replaced before start -> fine
  // auto-play helper: picks cards, places fields, closes shop
  const auto = async (pg, i) => pg.evaluate(i => {
    const g = window.__pog, s = g.view.snap; if (!s) return 'nosnap';
    const pr = s.me[g.me]; if (!pr) return 'nopriv';
    const send = m => g.client ? g.client.send(m) : null;
    if (s.ph === 'lvl' && pr.of && !pr.pk && pr.pc < 0) { const k = pr.of[0].key; if (g.client) send({ t: 'pick', key: k }); else g.sim.pick(g.me, k); return 'pick ' + k; }
    if (s.ph === 'lvl' && pr.pc >= 0 && pr.ps?.length) { const sl = pr.ps[0]; if (g.client) send({ t: 'place', slot: sl }); else g.sim.place(g.me, sl); return 'place ' + sl; }
    if (pr.so) { if (g.client) send({ t: 'shopClose' }); else g.sim.closeShop(g.me); return 'shopClose'; }
    return s.ph;
  }, i);
  const keys = ['w', 'a', 's', 'd'];
  const t0 = Date.now(); let lastLog = 0;
  const log = [];
  while (Date.now() - t0 < SECS * 1000) {
    for (let i = 0; i < N; i++) {
      const r = await auto(pages[i], i); if (r && !['play', 'over', 'lvl'].includes(r)) log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s p${i} ${r}`);
      const pg = pages[i];
      // wander + harvest + shoot
      const k = keys[Math.floor(Math.random() * 4)];
      await pg.keyboard.down(k); await pg.keyboard.down('Space');
      await pg.mouse.move(320 + Math.random() * 160 - 80, 180 + Math.random() * 120 - 60); await pg.mouse.down();
    }
    await sleep(500);
    for (const pg of pages) { for (const k of keys) await pg.keyboard.up(k); await pg.keyboard.up('Space'); await pg.mouse.up(); }
    if (Date.now() - lastLog > 10000) {
      lastLog = Date.now();
      const st = await H.evaluate(() => { const s = __pog.sim; return { t: s.time?.toFixed?.(1), ph: s.phase, wave: s.wave, lv: s.level, en: s.enemies.length, pl: s.players.map(p => `${p.id}:${p.hp.toFixed(0)}${p.alive ? '' : 'x'}@${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ') }; });
      console.log(JSON.stringify(st));
    }
  }
  // sync: compare positions client view vs host sim
  const hostPos = await H.evaluate(() => __pog.sim.players.map(p => [p.id, +p.x.toFixed(2), +p.z.toFixed(2)]));
  for (let i = 1; i < N; i++) console.log('client', i, 'sees', await pages[i].evaluate(() => __pog.view.snap.pl.map(p => [p.id, p.x, p.z])), 'host', JSON.stringify(hostPos));
  // stats
  const hm = await H.evaluate(() => __m);
  const secs = SECS;
  console.log(`host sent ${hm.sent} snaps (${(hm.sent / secs).toFixed(1)}/s), avg ${(hm.bytes / hm.sent / 1024).toFixed(1)} KB, max ${(hm.maxB / 1024).toFixed(1)} KB, => ${(hm.bytes / secs / 1024).toFixed(0)} KB/s per client upload (x${N - 1} = ${(hm.bytes * (N - 1) / secs / 1024).toFixed(0)} KB/s)`);
  for (let i = 0; i < N; i++) {
    const f = await pages[i].evaluate(() => { const l = __f.lat.slice().sort((a, b) => a - b), g = __f.gaps.slice().sort((a, b) => a - b), q = (a, p) => a.length ? a[Math.floor(a.length * p)] : null; return { sent: __f.sent, en: __pog.input.enabled, fps: __f.n, worst: __f.worst.toFixed(0), snaps: __f.snaps, latMed: q(l, .5), lat95: q(l, .95), latMax: l[l.length - 1], gapMed: q(g, .5), gap95: q(g, .95), gapMax: g[g.length - 1] }; });
    console.log(`p${i}: intents ${f.sent} inputEnabled ${f.en} fps ${(f.fps / secs).toFixed(1)} worstFrame ${f.worst}ms`, i ? `snaps ${f.snaps} lat med ${f.latMed} p95 ${f.lat95} max ${f.latMax} ms; gap med ${f.gapMed} p95 ${f.gap95} max ${f.gapMax}` : '');
  }
  console.log('events:', log.slice(0, 60).join('\n'));
  console.log('errors:', errs.slice(0, 30).join('\n'));
  await H.screenshot({ path: './host.png' });
  if (N > 1) await pages[1].screenshot({ path: './client1.png' });
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
