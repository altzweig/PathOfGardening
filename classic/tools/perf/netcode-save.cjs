// Koop-Spielstand test (25.11.2026): host + 1 guest play, the host saves, both leave; the host loads the co-op save
// (lobby opens again with a new code), the guest joins and must get its own figure back (same id, same bag/ammo).
// Needs vite on :5174 and a PeerJS server on 127.0.0.1:9000 (see netcode-browser.cjs).
const { chromium } = require('playwright');
const URL = 'http://localhost:5174/?peer=127.0.0.1:9000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clk = (pg, sel) => pg.evaluate(s => document.querySelector(s).click(), sel);
(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [];
  for (let i = 0; i < 2; i++) { const ctx = await b.newContext({ viewport: { width: 400, height: 240 } }); await ctx.addInitScript(() => { try { localStorage.setItem('pog-classic.tutorial', '0'); } catch {} }); const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('ERR p' + i, e.message)); await pg.goto(URL); pages.push(pg); }
  for (const pg of pages) await pg.waitForSelector('#menu:not([hidden])', { timeout: 120000 });
  const [H, G] = pages;
  const host = async () => { await H.waitForFunction(() => document.querySelector('#lobbyCode')?.textContent?.length === 5, null, { timeout: 20000 }); return H.textContent('#lobbyCode'); };
  await clk(H, '#coopBtn'); await clk(H, '#hostBtn'); let code = await host();
  await clk(G, '#coopBtn'); await G.evaluate(c => { document.querySelector('#codeIn').value = c; document.querySelector('#joinBtn').click(); }, code);
  await G.waitForSelector('#lobby:not([hidden])', { timeout: 60000 }); await sleep(800); await clk(H, '#lobbyStart'); await sleep(3000);
  // both take their start field, the guest gets something into its bag
  for (let k = 0; k < 6; k++) { await H.evaluate(() => { const g = window.__pog; for (const p of g.sim.players) if (g.sim.phase === 'lvl' && p.offers && !p.picked) g.sim.pick(p.id, p.offers[0].key); }); await sleep(500); }
  const gid = await G.evaluate(() => window.__pog.me);
  const before = await H.evaluate(id => { const p = window.__pog.sim.player(id); p.nuts = 7; p.ammo.blue = 42; p.x = 2.5; return { nuts: p.nuts, blue: p.ammo.blue, x: p.x }; }, gid);
  const saved = await H.evaluate(() => window.__pog.autosave(true));
  const info = await H.evaluate(() => JSON.parse(localStorage.getItem('pog-classic.saves'))[0]);
  console.log('gespeichert:', saved, 'Koop-Spieler im Stand:', info.coop, 'Gast-id', gid);
  await G.evaluate(() => window.__pog.leave()); await H.evaluate(() => window.__pog.leave()); await sleep(1000);
  await H.evaluate(id => window.__pog.loadSave(id), info.id); code = await host();
  console.log('geladen, neue Lobby', code);
  await clk(G, '#coopBtn'); await G.evaluate(c => { document.querySelector('#codeIn').value = c; document.querySelector('#joinBtn').click(); }, code);
  await G.waitForSelector('#lobby:not([hidden])', { timeout: 60000 }); await sleep(800); await clk(H, '#lobbyStart'); await sleep(3000);
  const after = await H.evaluate(id => { const p = window.__pog.sim.player(id); return p ? { nuts: p.nuts, blue: p.ammo.blue, x: +p.x.toFixed(2), wave: window.__pog.sim.wave } : null; }, gid);
  const gme = await G.evaluate(() => ({ me: window.__pog.me, mode: window.__pog.mode, hash: window.__pog.gsync.stats.hashOk }));
  console.log('nach dem Laden: Gast-id', gme.me, 'Modus', gme.mode, 'Figur', JSON.stringify(after), 'vorher', JSON.stringify(before));
  console.log(gme.me === gid && after && after.nuts === 7 && after.blue === before.blue ? 'OK: Gast hat seine Figur zurück' : 'FEHLER');
  await b.close();
})();
