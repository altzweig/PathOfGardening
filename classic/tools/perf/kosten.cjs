// 25.11.2026: was kosten viele Gegner und welche Darstellungsdetails (Classic). Dev-Server: cd classic && npx vite --port 5174
// node tools/perf/kosten.cjs [pc|handy] [N] -> ms pro Frame (CPU ohne Draw / gesamt mit SwiftShader), Draw Calls, Dreiecke je Variante
const { chromium } = require('playwright');
const DEV = { pc: { viewport: { width: 640, height: 360 } }, handy: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } };
(async () => {
  const dev = process.argv[2] || 'pc', N = +(process.argv[3] || 117);
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await (await b.newContext(DEV[dev])).newPage();
  if (dev === 'handy') { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:5174/?perf', { timeout: 600000 });
  await p.waitForFunction(() => window.__pog && window.__core && !document.querySelector('#menu').hidden, null, { timeout: 600000, polling: 200 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const G = window.__pog; G.startSolo(false); }); await p.waitForTimeout(3000);
  await p.evaluate(() => { const G = window.__pog, s = G.sim, pl = s.players[0]; // start pick / tutorial away, no wave timer
    if (pl.offers) s.pick(pl.id, pl.offers[0].key); for (const el of document.querySelectorAll('#tutorial, .tut, #levelup')) el.hidden = true;
    s.waveT = 1e9; });
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => JSON.stringify({ ph: window.__pog.sim.phase, en: window.__pog.sim.enemies.length, wave: window.__pog.sim.wave })));
  await p.evaluate(() => {
    const gl = window.__core.renderer.getContext(); window.__pc = { calls: 0, tris: 0, noDraw: false };
    for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const f = gl[m].bind(gl); gl[m] = (...a) => { window.__pc.calls++; window.__pc.tris += (a[1] / 3) * (m.endsWith('Instanced') ? a[a.length - 1] : 1); if (!window.__pc.noDraw) f(...a); }; }
  });
  const measure1 = (label, noDraw) => p.evaluate(async ([label, noDraw]) => { window.__pc.noDraw = noDraw;
    const v = window.__pog.view, fr = v.frame.bind(v); let js = 0, n = 0; v.frame = dt => { const t = performance.now(); fr(dt); js += performance.now() - t; n++; };
    await new Promise(r => setTimeout(r, 400)); window.__pc.calls = 0; window.__pc.tris = 0; js = 0; n = 0;
    const t0 = performance.now(); let frames = 0; await new Promise(r => { const f = () => { frames++; if (performance.now() - t0 < (noDraw ? 3000 : 6000)) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    const tot = (performance.now() - t0) / frames; v.frame = fr; const viewJs = js / Math.max(1, n);
    return { viewJs: +viewJs.toFixed(2), frameMs: +tot.toFixed(1), calls: Math.round(window.__pc.calls / frames), ktris: Math.round(window.__pc.tris / frames / 1000), objs: (() => { let n = 0; window.__pog.view.dyn?.traverse(() => n++); return n; })() };
  }, [label, noDraw]);
  const measure = async label => { const a = await measure1(label, true), g = await measure1(label, false); return { label, viewJsMs: a.viewJs, cpuMs: a.frameMs, gpuMs: g.frameMs, calls: g.calls, ktris: g.ktris, dynObjs: g.objs }; };
  const out = [];
  out.push(await measure('0 Gegner'));
  await p.evaluate(N => { const s = window.__pog.sim, T = ['raccoon', 'hare', 'toad', 'sheep', 'panda', 'hedgehog'].filter(t => s.cfg.enemies[t]);
    for (let i = 0; i < N; i++) { s.spawnEnemy(T[i % T.length], i * 2.39996); const e = s.enemies[s.enemies.length - 1]; if (!e) continue; const r = 2 + Math.sqrt(i / N) * 7; e.x = Math.cos(i * 2.39996) * r; e.z = Math.sin(i * 2.39996) * r; e.maxHp = 1e9; e.hp = 6e8; e.hurtOnce = true; e.dmgMul = 0; e.speed = 0; }
  }, N);
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => { const r = {}; for (const v of window.__pog.view.enemies.values()) { if (r[v.type]) continue; let t = 0, k = 0; v.g.traverse(o => { if (o.isMesh && o.visible && o.renderOrder !== -1) { k++; t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); r[v.type] = { meshes: k, tris: t }; } return JSON.stringify(r); }));
  out.push(await measure(N + ' Gegner'));
  const C = 'window.__core', V = 'window.__pog.view';
  const toggle = js => p.evaluate(js);
  await toggle(`${V}.dyn.traverse(o => { if (o.renderOrder === -1 && o.isMesh) o.visible = false; })`); out.push(await measure('  ohne Outlines'));
  await toggle(`${V}.dyn.traverse(o => { if (o.renderOrder === -1 && o.isMesh) o.visible = true; }); ${C}.barGroup.visible = false`); out.push(await measure('  ohne Lebensbalken'));
  await toggle(`${C}.barGroup.visible = true; for (const v of ${V}.enemies.values()) v.g.traverse(o => o.castShadow = false)`); out.push(await measure('  Gegner ohne Schatten'));
  await toggle(`for (const v of ${V}.enemies.values()) v.g.traverse(o => o.castShadow = o.isMesh && o.renderOrder !== -1); ${C}.moon.castShadow = false`); out.push(await measure('  ganz ohne Schatten'));
  await toggle(`${C}.moon.castShadow = true; ${C}.bloom.enabled = false`); out.push(await measure('  ohne Bloom'));
  await toggle(`${C}.bloom.enabled = true; for (const v of ${V}.enemies.values()) v.g.visible = false`); out.push(await measure('  Gegner unsichtbar (nur Sim)'));
  await toggle(`for (const v of ${V}.enemies.values()) v.g.visible = true; ${C}.scene.traverse(o => { if (o.isPointLight) o.visible = false; })`); await p.waitForTimeout(3000); out.push(await measure('  ohne Punktlichter'));
  console.table(out);
  await b.close();
})();
