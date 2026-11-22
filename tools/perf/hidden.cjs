// Liste dauerhaft unsichtbarer Welt-Objekte für das Spiel (Plan 2.1): nie sichtbar (out/pvs.json) + komplett im Fels
// (out/inrock.json) -> public/world/hidden.json. Das Spiel lässt diese Objekte beim Laden weg, der Welt-Editor zeigt weiter alle.
// Erst pvs.cjs und inrock.cjs laufen lassen, dann: node hidden.cjs   (Dev-Server auf :5173)
const { launch, openGame, sleep, DEV } = require('./run.cjs');
const fs = require('fs');
(async () => {
  const pvs = JSON.parse(fs.readFileSync(__dirname + '/out/pvs.json', 'utf8')), rock = JSON.parse(fs.readFileSync(__dirname + '/out/inrock.json', 'utf8'));
  const b = await launch();
  const { p } = await openGame(b, 'pc', DEV);
  await p.evaluate(() => { document.querySelector('#newBtn').click(); document.querySelector('#newForm').requestSubmit(); });
  await sleep(2500);
  // the list the PVS run indexed (same start state: new game)
  const list = await p.evaluate(() => window.__pog.view.world.props.list.map(r => ({ m: r.m, x: r.x, z: r.z })));
  await b.close();
  if (list.length !== pvs.total) throw new Error(`Objektliste ${list.length} != PVS ${pvs.total}: pvs.cjs neu laufen lassen`);
  const r2 = v => Math.round(v * 100) / 100;
  const out = [
    ...pvs.never.map(i => ({ m: list[i].m, x: r2(list[i].x), z: r2(list[i].z), why: 'nie sichtbar' })),
    ...rock.full.map(r => ({ m: r.m, x: r.x, z: r.z, why: 'im Fels' })),
  ];
  const f = __dirname + '/../../public/world/hidden.json';
  fs.writeFileSync(f, JSON.stringify({ note: 'tools/perf/hidden.cjs: Objekte, die das Spiel weglässt (Editor zeigt alle)', props: out }, null, 1) + '\n');
  console.log('hidden.json:', out.length, 'Objekte', out.map(o => o.m + ' (' + o.why + ')').join(', '));
})().catch(e => { console.error(e); process.exit(1); });
