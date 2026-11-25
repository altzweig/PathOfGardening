// Koop-Netcode browser test (25.11.2026): host + guests in headless Chromium over a local PeerJS broker, with the
// in-game network simulator (?netsim=ping,jitter,loss on both sides). Checks: joining, binary channels, desync hash,
// bandwidth, own movement reaction (frames from key press to the figure moving), reconnect of a guest.
// Needs: vite dev on :5174 (classic/) and a PeerJS server on 127.0.0.1:9000 (npm i peer; PeerServer({port:9000,path:'/',host:'127.0.0.1'})).
// Usage: node tools/perf/netcode-browser.cjs [players 2-4] [seconds] [ping] [jitter] [loss %]
const { chromium } = require('playwright');
const N = +(process.argv[2] || 2), SECS = +(process.argv[3] || 40), PING = +(process.argv[4] ?? 100), JIT = +(process.argv[5] ?? 20), LOSS = +(process.argv[6] ?? 5);
const URL = `http://localhost:5174/?peer=127.0.0.1:9000&netsim=${PING},${JIT},${LOSS}`;
const clk = (pg, sel) => pg.evaluate(s => document.querySelector(s).click(), sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [], errs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('pog-classic.tutorial', '0'); } catch {} });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(`[p${i}] ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[p${i}] ${m.type()}: ${m.text().slice(0, 200)}`); });
    await pg.goto(URL); pages.push(pg);
  }
  for (const pg of pages) await pg.waitForSelector('#menu:not([hidden])', { timeout: 120000 });
  for (const pg of pages) await pg.evaluate(() => { const b = document.querySelector('#qualBtn'); b.click(); b.click(); });
  const H = pages[0], G = pages.slice(1);
  await clk(H, '#coopBtn'); await clk(H, '#hostBtn');
  await H.waitForFunction(() => document.querySelector('#lobbyCode')?.textContent?.length === 5, null, { timeout: 20000 });
  const code = await H.textContent('#lobbyCode'); console.log('Code', code);
  for (const pg of G) { await clk(pg, '#coopBtn'); await pg.evaluate(c => { document.querySelector('#codeIn').value = c; document.querySelector('#joinBtn').click(); }, code); }
  for (const pg of G) await pg.waitForSelector('#lobby:not([hidden])', { timeout: 150000 });
  await sleep(1500);
  console.log('Lobby beim Host:', await H.$$eval('#lobbyPlayers .lp', l => l.length), 'Spieler');
  await clk(H, '#lobbyStart');
  // auto play: cards, fields, shop (the guests answer through their client)
  const auto = pg => pg.evaluate(() => {
    const g = window.__pog, s = g.view.snap; if (!s) return 'nosnap'; const pr = s.me[g.me]; if (!pr) return 'nopriv';
    const send = m => g.client ? g.client.send(m) : null;
    if (s.ph === 'lvl' && pr.of && !pr.pk && pr.pc < 0) { const k = pr.of[0].key; if (g.client) send({ t: 'pick', key: k }); else g.sim.pick(g.me, k); return 'pick'; }
    if (s.ph === 'lvl' && pr.pc >= 0 && pr.ps?.length) { const sl = pr.ps[0]; if (g.client) send({ t: 'place', slot: sl }); else g.sim.place(g.me, sl); return 'place'; }
    if (pr.so) { if (g.client) send({ t: 'shopClose' }); else g.sim.closeShop(g.me); return 'shop'; }
    return s.ph;
  });
  const t0 = Date.now();
  // frame log on the first guest: own drawn position every frame
  await G[0].evaluate(() => {
    window.__fl = []; const g = window.__pog;
    const loop = () => { const v = g.view.players.get(g.me); window.__fl.push(v ? [performance.now(), v.x, v.z] : null); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  });
  const reacts = [];
  let half = false;
  while (Date.now() - t0 < SECS * 1000) {
    for (const pg of pages) await auto(pg);
    // reaction test on guest 1: press a direction, count frames until the drawn figure moves that way
    const ph = await G[0].evaluate(() => window.__pog.view.snap?.ph);
    if (ph === 'play') {
      const k = ['d', 'a'][reacts.length % 2], sgn = k === 'd' ? 1 : -1;
      const n0 = await G[0].evaluate(() => window.__fl.length);
      await G[0].keyboard.down(k); await sleep(700);
      const fr = await G[0].evaluate(n0 => window.__fl.slice(n0 - 1), n0);
      await G[0].keyboard.up(k);
      // screen-right in world terms: compare against the movement direction over the whole press
      const a = fr[0], z = fr[fr.length - 1];
      if (a && z) { const dx = z[1] - a[1], dz = z[2] - a[2], L = Math.hypot(dx, dz);
        if (L > .3) { let f = -1; for (let i = 1; i < fr.length; i++) { const p = fr[i]; if (!p) continue; if (((p[1] - a[1]) * dx + (p[2] - a[2]) * dz) / L > .005) { f = i; break; } } reacts.push(f); } }
      void sgn;
    }
    if (!half && Date.now() - t0 > SECS * 500 && G.length) { // reconnect: the first guest's connection drops
      half = true;
      const before = await G[0].evaluate(() => ({ id: window.__pog.me, snaps: window.__pog.gsync.stats.snaps }));
      await G[0].evaluate(() => window.__pog.client.conn.peerConnection.close());
      console.log('Verbindung von Gast 1 getrennt (id ' + before.id + ')');
      const tr = Date.now(); let back = null;
      while (Date.now() - tr < 30000) { await sleep(1000); back = await G[0].evaluate(() => ({ id: window.__pog.me, cid: window.__pog.client?.id, mode: window.__pog.mode, snaps: window.__pog.gsync?.stats.snaps ?? 0 })); if (back.snaps > 20 && back.cid === before.id) break; }
      console.log(`Reconnect: nach ${((Date.now() - tr) / 1000).toFixed(1)} s wieder da, gleiche Figur: ${back?.cid === before.id}, Modus ${back?.mode}, Snapshots seitdem ${back?.snaps}`);
    }
    await sleep(300);
  }
  const host = await H.evaluate(() => { const g = window.__pog, h = g.host; return { secs: 0, peers: h.players.filter(p => p.net).map(p => ({ id: p.id, u: p.net.bytesU, r: p.net.bytesR })), wave: g.sim.wave, tick: g.netTick, players: g.sim.players.length }; });
  const st = [];
  for (const pg of G) st.push(await pg.evaluate(() => ({ ...window.__pog.gsync.stats, me: window.__pog.me, pl: window.__pog.view.snap?.pl.length })));
  const fps = await G[0].evaluate(() => { const f = window.__fl.filter(Boolean); return f.length / ((f[f.length - 1][0] - f[0][0]) / 1000); });
  console.log(`Host: Welle ${host.wave}, Tick ${host.tick}, ${host.players} Spieler in der Sim`);
  for (const p of host.peers) console.log(`  an Gast ${p.id}: unzuverlässig ${(p.u / 1024).toFixed(0)} KB, zuverlässig ${(p.r / 1024).toFixed(0)} KB (seit dem letzten Verbinden)`);
  st.forEach((s, i) => console.log(`Gast ${i + 1} (id ${s.me}): Snapshots ${s.snaps} (voll ${s.full}), Hash gleich ${s.hashOk} / abweichend ${s.hashBad}, Basis fehlte ${s.lost}, verspätet ${s.late}, extrapoliert ${s.extrap}, Korrekturen ${s.corrections} (gesprungen ${s.snapsTo}, max ${s.maxErr.toFixed(2)} m), Empfang gesamt ${(s.bytes / 1024).toFixed(0)} KB, sieht ${s.pl} Spieler`));
  console.log(`Reaktion eigene Figur (Frames von Tastendruck bis Bewegung, ${fps.toFixed(1)} fps im Test): ${JSON.stringify(reacts)}`);
  console.log('Fehler/Warnungen:', errs.length ? errs.slice(0, 12).join('\n  ') : 'keine');
  await browser.close();
})();
