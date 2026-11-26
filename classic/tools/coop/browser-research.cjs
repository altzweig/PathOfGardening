// Koop-Browsertest Werkbank-Techtree (26.11.2026): Host + Gast in zwei Headless-Chromium über einen lokalen PeerJS-Broker.
// Prüft beim Gast: Werkbank (bn), Panel (m.ro 1) über rsOpen, Idee wählen (rsChoose), Hämmern mit gehaltener Ernte-Taste
// (eigenes bw, Fortschritt rp), Abhol-Popup (m.ro 2) mit Glühbirne + Name beim Host, Fertigstellen per Knopf (rsFinish),
// Platzieren des Feldes, Mauer (wl) und Screenshots.
// Needs: vite dev on :5174 (classic/) and a PeerJS server on 127.0.0.1:9000 (npm i peer; PeerServer({port:9000,path:'/',host:'127.0.0.1'})).
// Usage: node tools/coop/browser-research.cjs [out dir]
const { chromium } = require(process.env.PW || 'playwright');
const OUT = process.argv[2] || '.';
const URL = 'http://localhost:5174/?peer=127.0.0.1:9000';
const clk = (pg, sel) => pg.evaluate(s => document.querySelector(s).click(), sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (pg, name) => { try { await pg.screenshot({ path: OUT + '/' + name, timeout: 90000 }); } catch { console.log('     (Screenshot ' + name + ' zu langsam, übersprungen)'); } };
const errs = [];
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
// expanded node index (upgrade chains count N entries), as the snapshot uses it
const XI = `(id => { let i = 0; for (const n of window.__pog.view.cfg.research.nodes) { if (n.id === id) return i; i += n.kind === 'upgrade' ? Math.max(1, n.count ?? 1) : 1; } return -1; })`;
const until = async (pg, fn, arg, ms = 20000) => { try { await pg.waitForFunction(fn, arg, { timeout: ms, polling: 200 }); return true; } catch { return false; } };
(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('pog-classic.tutorial', '0'); } catch {} });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(`[p${i}] ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error' || /peer|net|join/i.test(m.text())) errs.push(`[p${i}] console ${m.type()}: ${m.text().slice(0, 200)}`); });
    await pg.goto(URL); pages.push(pg);
  }
  const [H, G] = pages;
  for (const pg of pages) await pg.waitForSelector('#menu:not([hidden])', { timeout: 120000 });
  await clk(H, '#coopBtn'); await clk(H, '#hostBtn');
  await H.waitForFunction(() => document.querySelector('#lobbyCode')?.textContent?.length === 5, null, { timeout: 90000 });
  const code = await H.textContent('#lobbyCode');
  await clk(G, '#coopBtn'); await sleep(1500); await G.evaluate(c => { document.querySelector('#codeIn').value = c; document.querySelector('#joinBtn').click(); }, code);
  await G.waitForSelector('#lobby:not([hidden])', { timeout: 150000 });
  await sleep(1000); await clk(H, '#lobbyStart');
  ok(await until(G, () => !!window.__pog.view.snap && window.__pog.view.snap.ph === 'play', null, 60000), 'Spiel läuft beim Gast');
  const gid = await G.evaluate(() => window.__pog.me);
  await H.evaluate(() => { const s = window.__pog.sim; s.waveT = 1e5; }); // no wave during the test
  const gs = f => G.evaluate(f);
  ok(await gs(() => { const s = window.__pog.view.snap; return s.bn >= 0 && !!s.rs && !!s.rd; }), 'Gast: Werkbank-Slot, rs, rd im Snapshot');
  // panel via the techtree button / F (ToHost rsOpen)
  await G.evaluate(() => window.__pog.client.send({ t: 'rsOpen' }));
  ok(await until(G, () => window.__pog.view.snap.me[window.__pog.me]?.ro === 1 && !document.querySelector('#rsTree').hidden), 'Gast: Techtree-Panel offen (m.ro 1)');
  await shot(G, 'coop-gast-panel.png');
  // choose Weizenfeld (click its node)
  await G.evaluate(xi => { const i = eval(xi)('f_wheat'); document.querySelector(`#rsTree .rtNode[data-i="${i}"]`).dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); document.querySelector(`#rsTree .rtNode[data-i="${i}"]`).click(); }, XI);
  let chosen = await until(G, () => window.__pog.view.snap.rs[0] >= 0, null, 8000);
  if (!chosen) { await G.evaluate(xi => window.__pog.client.send({ t: 'rsChoose', node: eval(xi)('f_wheat') }), XI); chosen = await until(G, () => window.__pog.view.snap.rs[0] >= 0); console.log('     (Knoten per rsChoose-Nachricht gewählt, Klick kam nicht an)'); }
  ok(chosen, 'Gast: Idee gewählt (rs[0])');
  // stand at the bench and hold the harvest key
  await H.evaluate(id => { const s = window.__pog.sim, b = s.benchCircle(), p = s.player(id); p.x = b.x + 1.2; p.z = b.z; }, gid);
  await sleep(800); await G.keyboard.down('Space');
  ok(await until(G, () => { const s = window.__pog.view.snap; return s.pl.find(p => p.id === window.__pog.me)?.bw === 1; }), 'Gast: Hammer (eigenes bw = 1)');
  ok(await until(G, () => { const s = window.__pog.view.snap; return (s.rp[s.rs[0]] ?? 0) > 0.05; }), 'Gast: Fortschritt rp steigt');
  ok(await until(H, gid => window.__pog.view.snap.pl.find(p => p.id === gid)?.bw === 1, gid), 'Host sieht den hämmernden Gast (bw)');
  await shot(G, 'coop-gast-haemmern.png'); await shot(H, 'coop-host-sieht-gast.png');
  await G.keyboard.up('Space');
  // finish it (cheat on the host), then the guest walks into the bench -> popup
  await H.evaluate(() => window.__pog.sim.cheat(0, 'research.next', 1));
  ok(await until(G, () => window.__pog.view.snap.rs[1] === 1), 'Gast: Idee fertig (rs[1])');
  await H.evaluate(id => { const s = window.__pog.sim, b = s.benchCircle(), p = s.player(id); p.rsLock = 0; p.x = b.x + b.r + .1; p.z = b.z; }, gid);
  ok(await until(G, () => window.__pog.view.snap.me[window.__pog.me]?.ro === 2 && !document.querySelector('#rsPop').hidden), 'Gast: Abhol-Popup (m.ro 2)');
  ok(await until(H, () => !document.querySelector('#rsWho').hidden), 'Host: Glühbirne + Name des Gastes während der Pause');
  console.log('     Host-Anzeige:', await H.evaluate(() => document.querySelector('#rsWho').textContent));
  ok(await H.evaluate(() => window.__pog.sim.rsPause), 'Spiel pausiert');
  await shot(G, 'coop-gast-popup.png'); await shot(H, 'coop-host-pause.png');
  await G.evaluate(() => document.querySelector('#rsPop .rpGo').click());
  ok(await until(G, () => { const s = window.__pog.view.snap, pr = s.me[window.__pog.me]; return s.ph === 'lvl' && pr.pc >= 0 && pr.ps?.length > 0; }), 'Gast: Fertigstellen -> Feld platzieren');
  await G.evaluate(() => { const pr = window.__pog.view.snap.me[window.__pog.me]; window.__pog.client.send({ t: 'place', slot: pr.ps[0] }); });
  ok(await until(G, () => { const s = window.__pog.view.snap; return s.ph === 'play' && s.fi.length >= 2; }), 'Gast: Feld steht, Spiel läuft');
  // wall: host gives everything, the guest's post line comes through wl
  await H.evaluate(() => { const s = window.__pog.sim; s.cheat(0, 'research.all', 1); for (const p of s.players) { p.ammo.cab = 500; p.x = -6; p.z = -6 + p.id; p.intent = { ...p.intent, mx: 1, mz: 0 }; for (let i = 0; i < 12; i++) { p.x += .7; s.layWall(p); } } });
  ok(await until(G, () => (window.__pog.view.snap.wl?.length ?? 0) >= 10), 'Gast: Mauer (wl) kommt an');
  const [hw, gw] = [await H.evaluate(() => JSON.stringify(window.__pog.sim.snapshot().wl)), await G.evaluate(() => JSON.stringify(window.__pog.view.snap.wl))];
  ok(hw === gw, 'Mauer beim Gast = Host');
  await G.evaluate(() => window.__pog.client.send({ t: 'rsClose' }));
  await sleep(1500); await shot(G, 'coop-gast-mauer.png');
  console.log('errors:', errs.slice(0, 20).join('\n') || '-');
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); console.log('errors:', errs.slice(0, 20).join('\n') || '-'); process.exit(1); });
