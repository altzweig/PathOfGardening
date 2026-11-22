// injected into the page (dev server): instrumentation of the game loop
window.__perfSetup = async function (kind) {
  const core = await import('/src/view/core.ts');
  const R = core.renderer;
  R.info.autoReset = false;
  const P = window.__perf = { on: false, sync: false, frames: [], acc: {}, cnt: {}, core };
  const wrapObj = (obj, name, label) => {
    const fn = obj[name]; if (typeof fn !== 'function' || fn.__w) return;
    const w = function (...a) {
      if (!P.on) return fn.apply(this, a);
      const t = performance.now();
      try { return fn.apply(this, a); } finally { const d = performance.now() - t; P.acc[label] = (P.acc[label] || 0) + d; P.cnt[label] = (P.cnt[label] || 0) + 1; }
    };
    w.__w = true; obj[name] = w;
  };
  P.wrapObj = wrapObj;
  // renderer.render (composer passes call it several times per frame)
  wrapObj(R, 'render', 'gl.render (alle Passes, CPU)');
  const gl = R.getContext(), px = new Uint8Array(4);
  for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
    const f = gl[m].bind(gl); gl[m] = (...a) => { if (P.noDraw) return; f(...a); };
  }
  const host = kind === 'editor' ? window.__ed : window.__pog;
  const view = host.view;
  for (const m of ['updatePlot', 'animBush', 'updateSleep', 'updateBits', 'animPens', 'animPlayer', 'animAnimals', 'animShots', 'updateCamera', 'sun', 'event'])
    wrapObj(view, m, 'view.' + m);
  wrapObj(view.wild, 'update', 'view.wild.update');
  if (kind !== 'editor') {
    wrapObj(host, 'tick', 'game.tick (Sim+HUD+Input)');
    wrapObj(host.hud, 'update', 'hud.update (DOM)');
    wrapObj(host.input, 'hover', 'input.hover');
    const simMod = await import('/src/farm/sim.ts');
    const SP = simMod.DaySim.prototype;
    for (const m of ['update', 'updatePlayer', 'updateAnimals', 'updatePlots', 'updateWild', 'updateLoot', 'updatePellets', 'updateSpawns', 'actionFor'])
      wrapObj(SP, m, 'sim.' + m);
  }
  // frame boundary
  const frameName = 'frame';
  const fr = host[frameName].bind(host);
  let lastStart = 0;
  host[frameName] = function (dt) {
    if (!P.on) return fr(dt);
    const t0 = performance.now();
    const interval = lastStart ? t0 - lastStart : 0; lastStart = t0;
    P.acc = {}; P.cnt = {};
    R.info.reset();
    fr(dt);
    const t1 = performance.now();
    let gpu = 0;
    if (P.sync) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gpu = performance.now() - t1; }
    const i = R.info;
    P.frames.push({ interval, cpu: t1 - t0, gpu, acc: P.acc, cnt: P.cnt, calls: i.render.calls, tris: i.render.triangles, points: i.render.points, lines: i.render.lines,
      geos: i.memory.geometries, texs: i.memory.textures, progs: i.programs ? i.programs.length : 0 });
  };
  return true;
};

window.__census = function () {
  const core = window.__perf.core, scene = core.scene, R = core.renderer;
  const rows = []; let casters = 0, casterTris = 0, transp = 0, sprites = 0, meshes = 0, inst = 0, instTotal = 0, skinned = 0;
  const camera = core.camera; camera.updateMatrixWorld();
  const visibleChain = o => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  const triOf = g => { if (!g) return 0; const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0); return Math.floor((g.drawRange.count === Infinity ? n : Math.min(n, g.drawRange.count)) / 3); };
  const groupOf = o => { let p = o, path = []; while (p && p !== scene) { if (p.name) path.push(p.name); p = p.parent; } return path.reverse().join('/') || '(root)'; };
  scene.traverse(o => {
    if (!o.isMesh && !o.isSprite && !o.isPoints) return;
    if (!visibleChain(o)) return;
    if (o.isSprite) { sprites++; return; }
    if (o.isPoints) return;
    meshes++;
    const n = o.isInstancedMesh ? o.count : 1, t = triOf(o.geometry) * n;
    if (o.isInstancedMesh) { inst++; instTotal += n; }
    if (o.isSkinnedMesh) skinned++;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some(m => m.transparent)) transp++;
    if (o.castShadow) { casters++; casterTris += t; }
    rows.push({ g: groupOf(o), model: o.userData.model || o.geometry?.type || '', mat: mats[0]?.type, inst: o.isInstancedMesh ? n : 0, tris: t, cast: o.castShadow, culled: o.frustumCulled, bsR: o.geometry?.boundingSphere?.radius ?? null });
  });
  // aggregate
  const agg = {};
  for (const r of rows) { const k = r.g + ' | ' + r.model; const a = agg[k] ??= { k, meshes: 0, tris: 0, inst: 0, cast: 0 }; a.meshes++; a.tris += r.tris; a.inst += r.inst; if (r.cast) a.cast += r.tris; }
  const top = Object.values(agg).sort((a, b) => b.tris - a.tris).slice(0, 25);
  const big = rows.filter(r => r.inst > 0).sort((a, b) => b.tris - a.tris).slice(0, 12);
  const totalTris = rows.reduce((s, r) => s + r.tris, 0);
  const lights = []; scene.traverse(o => { if (o.isLight && o.visible) lights.push({ t: o.type, i: +o.intensity.toFixed(2), sh: !!o.castShadow, map: o.shadow?.mapSize?.x }); });
  return { meshes, inst, instTotal, skinned, sprites, transp, casters, casterTris, totalTris, top, big, lights, pr: R.getPixelRatio(), size: [R.domElement.width, R.domElement.height], progs: R.info.programs.length, geos: R.info.memory.geometries, texs: R.info.memory.textures, shadowMap: R.shadowMap.enabled, shadowType: R.shadowMap.type };
};

window.__abl = function (o) {
  const c = window.__perf.core, scene = c.scene;
  const orig = window.__ablOrig ??= { render: c.composer.render.bind(c.composer) };
  c.moon.castShadow = o.shadow !== false;
  c.bloom.enabled = o.bloom !== false; c.cleanPass.enabled = o.bloom !== false;
  c.composer.render = o.post === false ? () => c.renderer.render(scene, c.camera) : orig.render;
  const nat = scene.getObjectByName('nature'), props = scene.getObjectByName('props');
  if (nat) for (const ch of nat.children) { if (ch === props) ch.visible = o.props !== false; else ch.visible = o.grass !== false; }
  if (o.pr !== undefined) { c.renderer.setPixelRatio(o.pr); c.composer.setPixelRatio(o.pr); c.resize(); }
  if (o.leafShadow === false && props) props.traverse(m => { if (m.isInstancedMesh && m.material.type === 'MeshLambertMaterial') m.castShadow = false; });
  if (o.leafShadow === true && props) props.traverse(m => { if (m.isInstancedMesh && m.material.type === 'MeshLambertMaterial') m.castShadow = true; });
  if (o.shadowSize) { c.moon.shadow.mapSize.set(o.shadowSize, o.shadowSize); if (c.moon.shadow.map) { c.moon.shadow.map.dispose(); c.moon.shadow.map = null; } }
  if (o.pcf !== undefined) { c.renderer.shadowMap.type = o.pcf; scene.traverse(m => { if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.needsUpdate = true); }); }
  return true;
};
window.__abl2 = function (o) {
  const c = window.__perf.core, scene = c.scene, w = window.__pog?.view?.world || window.__ed?.view?.world;
  if (w) { w.__mat ??= w.ground.material; w.__simple ??= new (c.lantern.constructor.prototype.constructor === undefined ? Object : Object)(); }
  if (w && o.ground === false) { window.__simpleMat ??= w.ground.material.clone(); window.__simpleMat.onBeforeCompile = () => {}; window.__simpleMat.customProgramCacheKey = () => 'simpleGround'; window.__simpleMat.map = null; window.__simpleMat.color.set(0x5a7a3a); window.__simpleMat.needsUpdate = true; w.ground.material = window.__simpleMat; }
  if (w && o.ground !== false && w.__mat) w.ground.material = w.__mat;
  for (const L of [c.lantern, c.torch, c.gardenLight]) L.visible = o.points !== false;
  return true;
};
window.__objCount = function () {
  const s = window.__perf.core.scene; let all = 0, hidden = 0, auto = 0;
  const vis = o => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  s.traverse(o => { all++; if (!vis(o)) hidden++; if (o.matrixAutoUpdate) auto++; });
  return { all, hidden, auto };
};

// ground shader experiments (plan 22.11.2026): variant = 'base' | 'noNoise' | 'oneSample' | 'maxLayers2' | 'noLight'
window.__groundVar = function (variant) {
  const w = window.__pog?.view?.world; const m = w.__mat ?? w.ground.material; w.__mat = m; w.ground.material = m;
  m.__orig ??= m.onBeforeCompile;
  const o = m.__orig;
  m.onBeforeCompile = (sh, r) => {
    o(sh, r);
    if (variant === 'noNoise') sh.fragmentShader = sh.fragmentShader.replace(/float tFbm\(vec2 p\)\{[^}]*\}/, 'float tFbm(vec2 p){ return .5; }');
    if (variant === 'oneSample') sh.fragmentShader = sh.fragmentShader.replace(/, cb = textureGrad\(C, [^;]*;/, ', cb = ca;').replace(/, nb = textureGrad\(N, [^;]*;/, ', nb = na;');
    if (variant === 'maxLayers2') sh.fragmentShader = sh.fragmentShader.replace('if (q > .003) layerS', 'if (q > .25) layerS');
    if (variant === 'loop6' || variant === 'combo') sh.fragmentShader = sh.fragmentShader.split('i < 16; i++').join('i < 6; i++');
    if (variant === 'combo') sh.fragmentShader = sh.fragmentShader.replace(/float tFbm\(vec2 p\)\{[^}]*\}/, 'float tFbm(vec2 p){ return tNoise(p); }').replace(/, cb = textureGrad\(C, [^;]*;/, ', cb = ca;').replace(/, nb = textureGrad\(N, [^;]*;/, ', nb = na;');
    if (variant === 'noLight') sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', '').replace('#include <lights_fragment_maps>', '').replace('#include <lights_fragment_end>', 'reflectedLight.directDiffuse = diffuseColor.rgb;');
  };
  const k = m.customProgramCacheKey; m.__k ??= k; m.customProgramCacheKey = () => m.__k() + variant;
  m.needsUpdate = true;
  return true;
};
window.__layerStats = function () {
  const w = window.__pog.view.world, G = w.weights; if (!G) return null;
  const T = G.tex.map(t => t.image.data), n = T[0].length / 4; const hist = new Array(17).fill(0); let sum = 0;
  for (let i = 0; i < n; i++) { let c = 0; for (const d of T) for (let k = 0; k < 4; k++) if (d[i * 4 + k] > 1) c++; hist[c]++; sum += c; }
  return { texels: n, size: T.length ? Math.sqrt(n) : 0, mean: sum / n, hist, slots: [...G.slots] };
};
