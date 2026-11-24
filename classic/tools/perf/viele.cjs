// 24.11.2026: Kosten von bis zu 100 Kohlminen + 100 Mehlwolken (Classic). Dev-Server: cd classic && npx vite --port 5174
// node tools/perf/viele.cjs [pc|handy] [N]  -> ms pro Frame (JS-Teil + gesamt), Draw Calls, Programme, Spawn-Spitze
const { chromium } = require('playwright');
const DEV = { pc: { viewport: { width: 640, height: 360 } }, handy: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } };
(async () => {
  const dev = process.argv[2] || 'pc', N = +(process.argv[3] || 100);
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await (await b.newContext(DEV[dev])).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:5174/?perf', { timeout: 600000 });
  await p.waitForFunction(() => window.__pog && window.__core && !document.querySelector('#menu').hidden, null, { timeout: 600000, polling: 200 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { // count draw calls of all passes, optional noDraw = only CPU cost (JS + three.js)
    const gl = window.__core.renderer.getContext(); window.__pc = { calls: 0, noDraw: false };
    for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const f = gl[m].bind(gl); gl[m] = (...a) => { window.__pc.calls++; if (!window.__pc.noDraw) f(...a); }; }
  });
  const measure = async (label) => { const r = [];
    for (const noDraw of [true, false]) r.push(await measure1(label, noDraw));
    return { label, cpuFrameMs: r[0].frameMs, gpuFrameMs: r[1].frameMs, viewJsMs: r[0].viewJsMs, worstApplyMs: r[0].worstApplyMs, calls: r[1].calls, programs: r[1].programs }; };
  const measure1 = (label, noDraw) => p.evaluate(async ([label, noDraw]) => { window.__pc.noDraw = noDraw;
    const R = window.__core.renderer, G = window.__pog, v = G.view, ap = v.apply.bind(v), fr = v.frame.bind(v);
    let js = 0, n = 0, worst = 0; v.apply = s => { const t = performance.now(); ap(s); const d = performance.now() - t; js += d; worst = Math.max(worst, d); }; v.frame = dt => { const t = performance.now(); fr(dt); js += performance.now() - t; n++; };
    await new Promise(r => setTimeout(r, 300)); js = 0; n = 0; worst = 0; window.__pc.calls = 0;
    const t0 = performance.now(); let frames = 0; await new Promise(r => { const f = () => { frames++; if (performance.now() - t0 < (noDraw ? 3000 : 5000)) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    const tot = (performance.now() - t0) / frames; v.apply = ap; v.frame = fr; R.info.autoReset = true;
    return { label, frameMs: +tot.toFixed(1), viewJsMs: +(js / n).toFixed(2), worstApplyMs: +worst.toFixed(1), calls: Math.round(window.__pc.calls / frames), programs: R.info.programs.length };
  }, [label, noDraw]);
  const out = [];
  out.push(await measure('leer'));
  const spawn = (kind, burning) => p.evaluate(([kind, N, burning]) => {
    const s = window.__pog.sim;
    for (let i = 0; i < N; i++) {
      const a = i * 2.39996, r = 1 + Math.sqrt(i / N) * 7, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (kind === 'kohl') s.bombs.push({ id: s.nid++, fx: x, fy: .5, fz: z, tx: x, tz: z, x, y: .14, z, t: 1, flight: .2, fuse: 1e9, radius: 1.9, dmg: 5, minis: 0, mini: false, kind: 'cab', gen: 0, mine: true });
      else s.clouds.push({ id: s.nid++, x, z, r: 1.04, age: 2, life: 1e9, ign: burning ? 1.9 : -1, ix: x, iz: z, front: 0, dmg: 30, hit: new Set() });
    }
  }, [kind, N, burning]);
  const clear = () => p.evaluate(() => { const s = window.__pog.sim; s.bombs.length = 0; s.clouds.length = 0; });
  await spawn('kohl'); out.push(await measure(N + ' Kohlminen'));
  await clear(); await p.waitForTimeout(300);
  await spawn('mehl'); out.push(await measure(N + ' Mehlwolken'));
  await clear(); await p.waitForTimeout(300);
  await spawn('mehl', true); out.push(await measure(N + ' brennende Mehlwolken'));
  await clear(); await p.waitForTimeout(300);
  await spawn('kohl'); await spawn('mehl'); out.push(await measure(N + ' Kohl + ' + N + ' Mehl'));
  console.table(out);
  await b.close();
})();
