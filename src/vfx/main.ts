// VFX lab (vfx.html): edit the data-driven effects of src/fx live, save presets, export JSON for the game.
import './vfx.css';
import * as THREE from 'three';
import { FxCtx, FxInstance, FxSystem } from '../fx/runtime';
import { EFFECT_PARAMS, EffectDef, LAYER_LABEL, Layer, LayerType, PARAMS, ParamDesc, clone, newLayer, normalize } from '../fx/schema';
import { PRESETS } from '../fx/presets';
import { LabScene, SCENE_DEFAULT, SceneSettings } from './scene';
import { button, el, field } from './ui';

// ---------------- storage ----------------
const K_WORK = 'pog-vfx-work-v1', K_PRESETS = 'pog-vfx-presets-v1', K_SCENE = 'pog-vfx-scene-v1', K_UI = 'pog-vfx-ui-v1';
const load = <T>(k: string, def: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : def; } catch { return def; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const builtin = new Map(PRESETS.map(p => [p.id, p]));
let effects: EffectDef[] = (() => {
  const work = load<Record<string, EffectDef>>(K_WORK, {});
  const list = PRESETS.map(p => work[p.id] ? normalize(work[p.id]) : clone(p));
  for (const [id, d] of Object.entries(work)) if (!builtin.has(id)) list.push(normalize(d));
  return list;
})();
let named = load<Record<string, Record<string, EffectDef>>>(K_PRESETS, {});
const S: SceneSettings = { ...SCENE_DEFAULT, ...load<Partial<SceneSettings>>(K_SCENE, {}) };
const UI = { effect: effects[0].id, tab: 'effekt', open: !matchMedia('(max-width: 760px)').matches, speed: 1, paused: false, openLayers: {} as Record<string, boolean>, ...load(K_UI, {}) };
let saveT = 0;
const persist = () => { clearTimeout(saveT); saveT = window.setTimeout(() => {
  save(K_WORK, Object.fromEntries(effects.map(e => [e.id, e]))); save(K_SCENE, S); save(K_UI, { effect: UI.effect, tab: UI.tab, open: UI.open, openLayers: UI.openLayers });
}, 250); };

// ---------------- scene + effect ----------------
const lab = new LabScene(S);
lab.renderer.info.autoReset = false; // count draw calls of all passes per frame
const sys = new FxSystem(lab.scene, lab.top);
let def = effects.find(e => e.id === UI.effect) ?? effects[0];
let inst = new FxInstance(def, sys);
inst.setBudget(S.budget);
let loopOn = true;
function startEffect() {
  inst.dispose(); inst = new FxInstance(def, sys); inst.budget = S.budget; inst.rebuildAll();
  loopOn = true; inst.setActive(true);
}
startEffect();

const ctx: FxCtx = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), targets: [], range: 3, time: 0 };
function updateCtx() {
  lab.targets(ctx.targets); ctx.range = def.range;
  ctx.dir.set(Math.sin(lab.aim), 0, Math.cos(lab.aim));
  if (def.source === 'spieler') { lab.player.updateMatrixWorld(true); lab.wandTip.getWorldPosition(ctx.origin); }
  else if (def.source === 'ziel' && ctx.targets.length) ctx.origin.copy(ctx.targets[0]);
  else { // ground in front of the player, in the middle of the dummies
    ctx.origin.set(0, 0, 0); for (const t of ctx.targets) ctx.origin.add(t); if (ctx.targets.length) ctx.origin.divideScalar(ctx.targets.length); else ctx.origin.set(0, 0, S.distance); ctx.origin.y = 0;
  }
}

// ---------------- top bar ----------------
const top = document.getElementById('top')!, panel = document.getElementById('panel')!, stats = document.getElementById('stats')!;
const effSel = el('select', 'effsel');
const playBtn = button('', () => { if (def.mode === 'burst') inst.trigger(); else { loopOn = !loopOn; inst.setActive(loopOn); } refreshPlay(); }, 'btn primary');
const pauseBtn = button('', () => { UI.paused = !UI.paused; refreshPlay(); }, 'btn icon');
const stepBtn = button('⏭', () => { stepOnce = true; }, 'btn icon'); stepBtn.title = 'Ein Bild weiter (in der Pause)';
const clearBtn = button('🧹', () => inst.clear(), 'btn icon'); clearBtn.title = 'Alle Partikel entfernen';
const speedSel = el('select', 'speed'); for (const v of [.1, .25, .5, 1, 1.5, 2]) { const o = el('option'); o.value = String(v); o.textContent = v === 1 ? '1×' : `${String(v).replace('.', ',')}×`; speedSel.append(o); }
speedSel.value = '1'; speedSel.title = 'Zeitlupe'; speedSel.onchange = () => { UI.speed = +speedSel.value; };
const panelBtn = button('☰', () => { UI.open = !UI.open; document.body.classList.toggle('closed', !UI.open); persist(); }, 'btn icon'); panelBtn.title = 'Einstellungen ein-/ausblenden';
let stepOnce = false;
function refreshEffects() {
  effSel.innerHTML = ''; for (const e of effects) { const o = el('option'); o.value = e.id; o.textContent = e.name; effSel.append(o); }
  effSel.value = def.id;
}
effSel.onchange = () => { def = effects.find(e => e.id === effSel.value)!; UI.effect = def.id; startEffect(); renderPanel(); refreshPlay(); persist(); };
function refreshPlay() {
  playBtn.textContent = def.mode === 'burst' ? '▶ Auslösen' : loopOn ? '■ Aus' : '▶ An';
  pauseBtn.textContent = UI.paused ? '▶' : '❚❚'; pauseBtn.title = UI.paused ? 'Weiter' : 'Pause';
  stepBtn.hidden = !UI.paused;
}
top.append(effSel, playBtn, pauseBtn, stepBtn, speedSel, clearBtn, panelBtn);
refreshEffects(); refreshPlay();
document.body.classList.toggle('closed', !UI.open);

// ---------------- panel ----------------
const tabs = el('div', 'tabs'), body = el('div', 'pbody');
const grip = el('div', 'grip'); grip.onclick = () => { UI.open = !UI.open; document.body.classList.toggle('closed', !UI.open); persist(); };
panel.append(grip, tabs, body);
for (const [k, l] of [['effekt', 'Effekt'], ['szene', 'Szene'], ['presets', 'Presets & Export']]) {
  const b = button(l, () => { UI.tab = k; renderPanel(); persist(); }, 'tab'); b.dataset.tab = k; tabs.append(b);
}
function renderPanel() {
  for (const b of tabs.children) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.tab === UI.tab);
  const y = body.scrollTop; body.innerHTML = '';
  if (UI.tab === 'effekt') renderEffect(); else if (UI.tab === 'szene') renderScene(); else renderPresets();
  body.scrollTop = y;
}

function renderEffect() {
  const head = el('section', 'card');
  head.append(el('h3', '', 'Effekt'));
  for (const d of EFFECT_PARAMS) head.append(field(d, def as any, (p) => {
    if (p.key === 'name') refreshEffects();
    if (p.key === 'mode') { inst.clear(); loopOn = true; inst.setActive(true); refreshPlay(); }
    persist();
  }));
  body.append(head);
  body.append(el('div', 'hint pad', 'Ebenen: Schalter = an/aus. Aufklappen für alle Regler. Änderungen wirken sofort und werden automatisch gespeichert.'));
  def.layers.forEach((L, i) => body.append(layerCard(L, i)));
  // add layer
  const add = el('section', 'card addrow'), sel = el('select');
  for (const [k, l] of Object.entries(LAYER_LABEL)) { const o = el('option'); o.value = k; o.textContent = l; sel.append(o); }
  add.append(sel, button('+ Ebene hinzufügen', () => { def.layers.push(newLayer(sel.value as LayerType)); UI.openLayers[def.id + ':' + (def.layers.length - 1)] = true; inst.syncLayers(); renderPanel(); persist(); }));
  body.append(add);
}
function layerCard(L: Layer, i: number) {
  const key = def.id + ':' + i;
  const card = el('details', 'card layer' + (L.on ? '' : ' off')); card.open = !!UI.openLayers[key];
  card.ontoggle = () => { UI.openLayers[key] = card.open; persist(); };
  const sum = el('summary');
  const sw = el('label', 'switch'), c = el('input'); c.type = 'checkbox'; c.checked = L.on; sw.append(c, el('span'));
  sw.onclick = e => e.stopPropagation();
  c.onchange = () => { L.on = c.checked; card.classList.toggle('off', !L.on); persist(); };
  const nm = el('span', 'lname', L.name), ty = el('span', 'ltype', LAYER_LABEL[L.type]);
  const tools = el('span', 'ltools');
  const act = (lbl: string, title: string, f: () => void) => { const b = el('button', 'mini', lbl); b.title = title; b.onclick = e => { e.preventDefault(); e.stopPropagation(); f(); }; tools.append(b); };
  act('★', 'Solo: nur diese Ebene an (nochmal: alle an)', () => {
    const solo = def.layers.every((o, k) => o.on === (k === i));
    def.layers.forEach((o, k) => { o.on = solo ? true : k === i; }); renderPanel(); persist(); });
  act('↑', 'Nach oben', () => { if (i > 0) { [def.layers[i - 1], def.layers[i]] = [def.layers[i], def.layers[i - 1]]; inst.syncLayers(); renderPanel(); persist(); } });
  act('⧉', 'Duplizieren', () => { def.layers.splice(i + 1, 0, { ...clone(L), name: L.name + ' 2' }); inst.syncLayers(); renderPanel(); persist(); });
  act('✕', 'Ebene löschen', () => { if (confirmDel(L.name)) { def.layers.splice(i, 1); inst.syncLayers(); renderPanel(); persist(); } });
  sum.append(sw, nm, ty, tools); card.append(sum);
  const inner = el('div', 'lbody');
  inner.append(field({ key: 'name', label: 'Name', kind: 'text' }, L as any, () => { nm.textContent = L.name; persist(); }));
  const groups = new Map<string, HTMLElement>();
  for (const d of PARAMS[L.type]) {
    let parent: HTMLElement = inner;
    if (d.group) {
      if (!groups.has(d.group)) { const g = el('details', 'grp'); g.open = d.group === 'Ausstoß' || d.group === 'Aussehen'; g.append(el('summary', '', d.group)); inner.append(g); groups.set(d.group, g); }
      parent = groups.get(d.group)!;
    }
    parent.append(field(d, L as any, (p: ParamDesc) => { if (p.rebuild) inst.rebuildLayer(i); persist(); }));
  }
  card.append(inner);
  return card;
}
// small inline confirmation instead of a browser dialog: second click within 2 s deletes
let delArm = '', delT = 0;
function confirmDel(what: string) { const now = performance.now(); if (delArm === what && now - delT < 2500) { delArm = ''; return true; } delArm = what; delT = now; toast(`Nochmal tippen, um „${what}“ zu löschen`); return false; }

function renderScene() {
  const sec = (title: string, ds: ParamDesc[], obj: Record<string, any>, onC: (d: ParamDesc) => void) => {
    const c = el('section', 'card'); c.append(el('h3', '', title)); for (const d of ds) c.append(field(d, obj, onC)); body.append(c); };
  sec('Licht', [
    { key: 'daytime', label: 'Tageszeit (0 Nacht · 0,5 Dämmerung · 1 Tag)', kind: 'num', min: 0, max: 1, step: .01 },
    { key: 'autoBloom', label: 'Bloom + Belichtung wie im Spiel', kind: 'bool', hint: 'aus = Werte unten frei einstellbar' },
    { key: 'bloomStrength', label: 'Bloom Stärke', kind: 'num', min: 0, max: 3, step: .01 },
    { key: 'bloomRadius', label: 'Bloom Radius', kind: 'num', min: 0, max: 1.5, step: .01 },
    { key: 'bloomThreshold', label: 'Bloom Schwelle', kind: 'num', min: 0, max: 1.5, step: .01 },
    { key: 'exposure', label: 'Belichtung', kind: 'num', min: .3, max: 2.5, step: .01 },
  ], S, (d) => {
    // moving a bloom / exposure slider switches to manual values; re-render only when that switch flips (not while dragging)
    const was = S.autoBloom; if (d.key !== 'daytime' && d.key !== 'autoBloom') S.autoBloom = false;
    lab.applyLight(); if (d.key === 'autoBloom' || was !== S.autoBloom) renderPanel(); persist(); });
  sec('Dummies & Spieler', [
    { key: 'dummies', label: 'Anzahl Dummies', kind: 'num', min: 0, max: 6, step: 1 },
    { key: 'distance', label: 'Abstand (m)', kind: 'num', min: 1.5, max: 12, step: .1 },
    { key: 'layout', label: 'Anordnung', kind: 'select', options: [['bogen', 'Bogen'], ['reihe', 'Reihe (hintereinander)'], ['kreis', 'Kreis']] },
    { key: 'wander', label: 'Dummies bewegen sich', kind: 'bool' },
    { key: 'sweep', label: 'Spieler schwenkt hin und her', kind: 'bool' },
    { key: 'showPlayer', label: 'Spieler sichtbar', kind: 'bool' },
  ], S, () => { lab.layoutDummies(); persist(); });
  const cam = el('section', 'card'); cam.append(el('h3', '', 'Kamera'), el('div', 'hint', 'Ziehen = drehen, zwei Finger / Mausrad = zoomen, Rechtsklick / zwei Finger ziehen = verschieben.'));
  const row = el('div', 'btnrow');
  for (const [k, l] of [['spiel', 'Spielkamera'], ['nah', 'Nah'], ['seite', 'Seite'], ['oben', 'Von oben']] as const) row.append(button(l, () => lab.view(k)));
  cam.append(row); body.append(cam);
  sec('Leistung', [
    { key: 'pixelRatio', label: 'Pixeldichte', kind: 'select', options: [['0.75', '0,75 (sehr schnell)'], ['1', '1'], ['1.5', '1,5'], ['2', '2 (scharf)']] },
    { key: 'budget', label: 'Partikel-Budget', kind: 'select', options: [['0.25', '25 %'], ['0.5', '50 %'], ['1', '100 %']], hint: 'skaliert „Max. Partikel“ aller Ebenen, um schwache Handys zu testen' },
    { key: 'bloom', label: 'Bloom an', kind: 'bool' },
    { key: 'shadows', label: 'Schatten an', kind: 'bool' },
  ], { get pixelRatio() { return String(S.pixelRatio); }, set pixelRatio(v: string) { S.pixelRatio = +v; }, get budget() { return String(S.budget); }, set budget(v: string) { S.budget = +v; },
       get bloom() { return S.bloom; }, set bloom(v: boolean) { S.bloom = v; }, get shadows() { return S.shadows; }, set shadows(v: boolean) { S.shadows = v; } },
  (d) => { if (d.key === 'pixelRatio') lab.resize(); if (d.key === 'budget') { inst.setBudget(S.budget); inst.setActive(true); } lab.applyLight(); persist(); });
}

function renderPresets() {
  const cur = el('section', 'card'); cur.append(el('h3', '', `Presets für „${def.name}“`));
  cur.append(el('div', 'hint', 'Der Arbeitsstand jedes Effekts wird automatisch im Browser gespeichert. Hier kannst du benannte Versionen sichern und vergleichen.'));
  const nameIn = el('input', 'txt'); nameIn.placeholder = 'Name, z. B. „Flamme breiter“';
  const r = el('div', 'btnrow'); r.append(nameIn, button('Speichern', () => {
    const n = nameIn.value.trim() || new Date().toLocaleString('de-DE'); (named[def.id] ??= {})[n] = clone(def); save(K_PRESETS, named); toast(`Preset „${n}“ gespeichert`); renderPanel(); }, 'btn primary'));
  cur.append(r);
  const list = Object.entries(named[def.id] ?? {});
  if (!list.length) cur.append(el('div', 'hint', 'Noch keine Presets gespeichert.'));
  for (const [n, d] of list) {
    const row = el('div', 'prow'); row.append(el('span', 'pname', n));
    row.append(button('Laden', () => { replaceDef(normalize({ ...clone(d), id: def.id })); toast(`„${n}“ geladen`); }, 'btn small'));
    row.append(button('JSON', () => copyJson(d), 'btn small'));
    row.append(button('✕', () => { if (confirmDel(n)) { delete named[def.id][n]; save(K_PRESETS, named); renderPanel(); } }, 'btn small'));
    cur.append(row);
  }
  const reset = el('div', 'btnrow');
  if (builtin.has(def.id)) reset.append(button('Auf Standard zurücksetzen', () => { if (confirmDel('Arbeitsstand')) { replaceDef(clone(builtin.get(def.id)!)); toast('Standard wiederhergestellt'); } }));
  reset.append(button('Als neuen Effekt duplizieren', () => {
    const c = clone(def); c.id = def.id + '-' + Math.random().toString(36).slice(2, 6); c.name = def.name + ' (Kopie)'; effects.push(c); def = c; UI.effect = c.id; refreshEffects(); startEffect(); renderPanel(); persist(); }));
  if (!builtin.has(def.id)) reset.append(button('Effekt löschen', () => { if (confirmDel(def.name)) { effects = effects.filter(e => e !== def); def = effects[0]; UI.effect = def.id; refreshEffects(); startEffect(); renderPanel(); persist(); } }));
  cur.append(reset); body.append(cur);

  const ex = el('section', 'card'); ex.append(el('h3', '', 'Export (für das Spiel)'));
  ex.append(el('div', 'hint', 'Das JSON ist genau das Format, das das Effekt-System im Spiel lädt. Zum Übernehmen einfach das JSON in den Chat geben oder die Datei ins Repo legen.'));
  const er = el('div', 'btnrow');
  er.append(button('JSON kopieren', () => copyJson(def), 'btn primary'), button('Datei herunterladen', () => download(`vfx-${def.id}.json`, def)),
    button('Alle Effekte herunterladen', () => download('vfx-alle-effekte.json', { version: 1, effects })));
  ex.append(er); body.append(ex);

  const im = el('section', 'card'); im.append(el('h3', '', 'Import'));
  const ta = el('textarea', 'json'); ta.placeholder = 'JSON eines Effekts oder „alle Effekte“ hier einfügen';
  const file = el('input'); file.type = 'file'; file.accept = '.json,application/json';
  file.onchange = async () => { const f = file.files?.[0]; if (f) ta.value = await f.text(); };
  im.append(ta, el('div', 'btnrow'));
  (im.lastChild as HTMLElement).append(button('Importieren', () => importJson(ta.value), 'btn primary'), file);
  body.append(im);
}
function replaceDef(d: EffectDef) {
  const i = effects.indexOf(def); effects[i] = d; def = d; startEffect(); refreshEffects(); renderPanel(); persist();
}
function importJson(txt: string) {
  try {
    const j = JSON.parse(txt);
    const list: EffectDef[] = Array.isArray(j.effects) ? j.effects : [j];
    let n = 0;
    for (const d of list) {
      if (!d || !Array.isArray(d.layers)) continue;
      const nd = normalize({ ...(builtin.get(d.id) ?? PRESETS[0]), ...d, layers: d.layers } as EffectDef); nd.id = d.id || 'import-' + Math.random().toString(36).slice(2, 6);
      const i = effects.findIndex(e => e.id === nd.id); if (i >= 0) effects[i] = nd; else effects.push(nd); n++;
      def = nd;
    }
    if (!n) throw new Error('keine Effekte gefunden');
    UI.effect = def.id; refreshEffects(); startEffect(); renderPanel(); persist(); toast(`${n} Effekt${n > 1 ? 'e' : ''} importiert`);
  } catch (e) { toast('Import fehlgeschlagen: ' + (e as Error).message); }
}
function copyJson(d: unknown) {
  const s = JSON.stringify(d, null, 2);
  (navigator.clipboard?.writeText(s) ?? Promise.reject()).then(() => toast('JSON kopiert'), () => { download('vfx.json', d); });
}
function download(name: string, d: unknown) {
  const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
let toastT = 0;
function toast(msg: string) {
  let t = document.getElementById('toast'); if (!t) { t = el('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => t!.classList.remove('on'), 2200);
}
renderPanel();

// ---------------- loop ----------------
let last = performance.now(), fpsT = 0, frames = 0, fps = 0, ms = 0, time = 0;
const res = new THREE.Vector2();
lab.applyLight();
function frame(now: number) {
  requestAnimationFrame(frame);
  const real = Math.min(.05, (now - last) / 1000); last = now;
  let dt = UI.paused ? 0 : real * UI.speed;
  if (UI.paused && stepOnce) { dt = 1 / 60 * UI.speed; stepOnce = false; }
  const t0 = performance.now(); lab.renderer.info.reset();
  if (S.autoBloom) lab.applyLight();
  if (dt > 0) lab.update(dt); else lab.controls.update();
  time += dt; ctx.time = time; updateCtx();
  lab.drawingSize(res); sys.setResolution(res.x, res.y);
  if (dt > 0) inst.update(dt, ctx);
  lab.render();
  ms = ms * .9 + (performance.now() - t0) * .1;
  frames++; fpsT += real;
  if (fpsT >= .5) {
    fps = frames / fpsT; frames = 0; fpsT = 0;
    const info = lab.renderer.info.render;
    stats.innerHTML = `<b>${fps.toFixed(0)}</b> FPS · ${ms.toFixed(1)} ms<br>${inst.count()} Partikel · ${info.calls} Draw-Calls`;
    stats.classList.toggle('bad', fps < 45);
  }
}
requestAnimationFrame(frame);
