// Sichtbarkeits-Bake (Plan 22.11.2026): welche Welt-Objekte (welt.json props) sind aus der Third-Person-Kamera jemals sichtbar?
// Kamera-Stichproben über die ganze begehbare Fläche (Lauffläche ∩ Kartenquadrat), mehrere Blickrichtungen und Neigungen, Abstand
// 3 und 10 m. Jedes Objekt wird mit seiner ID-Farbe gezeichnet (Blätter mit alphaTest), Gebäude verdecken. Ausgabe: out/pvs.json
// node pvs.cjs [Raster m=6] [Richtungen=8]   (Dev-Server auf :5173)
const { launch, openGame, sleep, DEV } = require('./run.cjs');
const fs = require('fs');
(async () => {
  const STEP = +(process.argv[2] || 6), YAWS = +(process.argv[3] || 8);
  const b = await launch();
  const { p } = await openGame(b, 'pc', DEV);
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(2500);
  const res = await p.evaluate(async ({ STEP, YAWS }) => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const logic = await import('/src/world/logic.ts');
    const g = window.__pog, c = window.__perf.core, R = c.renderer, W = g.view.world, layer = W.props;
    window.__perf.noDraw = false; g.paused = true;
    const list = layer.list, idx = new Map(list.map((r, i) => [r, i]));
    const ids = new THREE.Scene();
    const mats = new Map();
    const idMat = (m) => {
      let k = mats.get(m); if (k) return k;
      k = new THREE.MeshBasicMaterial({ map: m.map ?? null, alphaTest: m.alphaTest || 0, side: m.side, transparent: false });
      k.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n gl_FragColor = vec4(vColor, 1.); return;'); };
      k.customProgramCacheKey = () => 'pvsid' + (m.alphaTest ? 'a' : '') + m.side; mats.set(m, k); return k;
    };
    for (const [model, grp] of layer.groups) for (const im of grp.meshes) {
      const n = im.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const id = idx.get(grp.recs[i]) + 1; col[i * 3] = (id & 255) / 255; col[i * 3 + 1] = ((id >> 8) & 255) / 255; col[i * 3 + 2] = 1; }
      const k = new THREE.InstancedMesh(im.geometry, idMat(im.material), n); k.instanceMatrix = im.instanceMatrix; k.instanceColor = new THREE.InstancedBufferAttribute(col, 3); k.frustumCulled = false; ids.add(k);
    }
    // occluders: the buildings (black)
    const black = new THREE.MeshBasicMaterial({ color: 0 });
    for (const v of g.view.buildings.values()) { if (!v.root.visible) continue; v.root.updateMatrixWorld(true); v.root.traverse(o => { if (o.isMesh && o.visible) { const m = new THREE.Mesh(o.geometry, black); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); ids.add(m); } }); }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), black); ids.add(ground);
    ids.background = new THREE.Color(0);
    const rt = new THREE.WebGLRenderTarget(320, 180), buf = new Uint8Array(320 * 180 * 4);
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, .1, 70);
    const hof = g.hof, poly = hof.walkPoly, half = (hof.logic?.size ?? 83) / 2;
    const seen = new Map(); let shots = 0, pts = 0;
    const t0 = performance.now();
    R.toneMapping = THREE.NoToneMapping; const oldCS = R.outputColorSpace;
    for (let x = -half; x <= half; x += STEP) for (let z = -half; z <= half; z += STEP) {
      if (!logic.inPoly(poly, x, z)) continue; pts++;
      for (let yi = 0; yi < YAWS; yi++) for (const [pitch, dist] of [[-.15, 10], [.55, 10], [.35, 3]]) {
        const yaw = yi / YAWS * Math.PI * 2, head = new THREE.Vector3(x, 1.35, z);
        cam.position.set(x + Math.sin(yaw) * Math.cos(pitch) * dist, Math.max(.35, 1.35 + Math.sin(pitch) * dist), z + Math.cos(yaw) * Math.cos(pitch) * dist);
        cam.lookAt(head.x - Math.sin(yaw) * .3, head.y, head.z - Math.cos(yaw) * .3);
        R.setRenderTarget(rt); R.render(ids, cam); R.readRenderTargetPixels(rt, 0, 0, 320, 180, buf); shots++;
        for (let i = 0; i < buf.length; i += 4) { if (buf[i + 2] < 128) continue; const id = buf[i] + (buf[i + 1] << 8) - 1; if (id >= 0) seen.set(id, (seen.get(id) ?? 0) + 1); }
      }
    }
    R.setRenderTarget(null); R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = oldCS;
    // summary per model
    const by = {};
    list.forEach((r, i) => { const o = by[r.m] ??= { n: 0, seen: 0 }; o.n++; if (seen.has(i)) o.seen++; });
    const never = list.map((r, i) => seen.has(i) ? -1 : i).filter(i => i >= 0);
    return { pts, shots, ms: performance.now() - t0, total: list.length, seen: seen.size, never, by, pixels: [...seen.entries()] };
  }, { STEP, YAWS });
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(__dirname + '/out/pvs.json', JSON.stringify(res));
  console.log('Punkte', res.pts, 'Aufnahmen', res.shots, 'ms', res.ms.toFixed(0), 'Objekte', res.total, 'gesehen', res.seen, 'nie', res.never.length);
  for (const [m, o] of Object.entries(res.by).sort((a, b) => b[1].n - a[1].n)) console.log(m.padEnd(22), o.n, 'gesehen', o.seen);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
