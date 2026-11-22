// Welche Deko-Objekte (Pflanzen, Gras, Blumen, Pilze, Kiesel) stecken komplett in einem Felsen? (Plan 22.11.2026)
// Pro Objekt 13 Punkte seiner Bounding-Box (gedreht + skaliert wie im Spiel); ein Punkt ist "im Fels", wenn ein Strahl nach oben
// eine ungerade Zahl von Fels-Flächen trifft. Alle Punkte drin = komplett verdeckt, einige = streift nur. Ausgabe: out/inrock.json
const { launch, openGame, sleep, DEV } = require('./run.cjs');
const fs = require('fs');
(async () => {
  const b = await launch();
  const { p } = await openGame(b, 'pc', DEV);
  await p.setViewportSize({ width: 320, height: 180 });
  await sleep(1500);
  const res = await p.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const nat = await import('/src/view/nature.ts');
    const cat = await import('/src/world/catalog.ts');
    const { toInst } = await import('/src/world/props.ts');
    window.__perf.noDraw = true;
    const W = window.__pog.view.world, layer = W.props, list = layer.list;
    const ds = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const rocks = [];
    for (const [m, grp] of layer.groups) {
      if (!/^Rock_Medium/.test(m)) continue;
      for (const im of grp.meshes) { const k = new THREE.InstancedMesh(im.geometry, ds, im.count); k.instanceMatrix = im.instanceMatrix; k.updateMatrixWorld(true); k.computeBoundingSphere(); rocks.push(k); }
    }
    const ray = new THREE.Raycaster(); ray.far = 50;
    const inside = (pt) => { ray.set(pt, new THREE.Vector3(0, 1, 0)); const hits = ray.intersectObjects(rocks, false); return hits.length % 2 === 1; };
    const out = []; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
    list.forEach((r, i) => {
      const d = cat.MODEL.get(r.m); if (!d || !['Pflanzen', 'Gras', 'Blumen', 'Pilze'].includes(d.cat) && !/^Pebble/.test(r.m)) return;
      const it = toInst(r), box = nat.modelBox(r.m);
      e.set(it.tx ?? 0, it.ry ?? 0, it.tz ?? 0); m4.compose(v.set(it.x, it.y ?? 0, it.z), q.setFromEuler(e), new THREE.Vector3(it.s, it.s, it.s));
      const pts = []; const { min, max } = box, c = box.getCenter(new THREE.Vector3());
      for (const fy of [.25, .6, .95]) for (const [fx, fz] of [[.5, .5], [.15, .15], [.85, .15], [.15, .85], [.85, .85]]) { if (fy === .25 && fx !== .5) continue; pts.push(new THREE.Vector3(min.x + (max.x - min.x) * fx, min.y + (max.y - min.y) * fy, min.z + (max.z - min.z) * fz).applyMatrix4(m4)); }
      void c;
      const n = pts.filter(inside).length;
      if (n) out.push({ i, m: r.m, x: +r.x.toFixed(2), z: +r.z.toFixed(2), inside: n, of: pts.length });
    });
    return out;
  });
  const full = res.filter(r => r.inside === r.of), part = res.filter(r => r.inside < r.of);
  fs.mkdirSync(__dirname + '/out', { recursive: true });
  fs.writeFileSync(__dirname + '/out/inrock.json', JSON.stringify({ full, part }, null, 1));
  const cnt = a => Object.entries(a.reduce((o, r) => (o[r.m] = (o[r.m] || 0) + 1, o), {})).map(([k, v]) => k + ' ' + v).join(', ');
  console.log('komplett im Fels:', full.length, '|', cnt(full));
  console.log('teilweise (streift):', part.length, '|', cnt(part));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
