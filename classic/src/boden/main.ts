// Boden-Editor für Classic (boden.html, 23.11.2026), recycled from the Hof world editor (welt.html, "Boden" tab):
// paint the FreeStylized nature ground textures in layers (like an image editor) on a base texture, with round, mask and
// noise brushes. The view is the game's own ground (same shader, fog, day/night), with the hex field grid and the wet
// earth that the game puts around the fields. Saves public/world/boden.json (download, or straight into the repo on
// GitHub); the game reads that file at start. "Im Spiel testen" opens the game with the browser draft (?boden=entwurf).
import './editor.css';
import * as THREE from 'three';
import { applyQuality, camera, composer, isTouch, renderer, resize, scene, setPreset } from '../view/core';
import { buildWorld, setBoden, setEarthSpots, updateFog, updateGround, BodenHandle } from '../view/world';
import { updateDayNight } from '../view/daynight';
import { MAX_TEX, TerrainInfo, swatchUrl, terrainList } from '../view/terrain';
import { loadBalancing } from '../config';
import { hexR, slotPositions } from '../sim/sim';
import { BodenFile, BodenPaint, Rect, TexLayer, fetchBodenFile, loadDraft, saveDraft, unionRect } from './paint';
import { BrushShape, loadBrushes, stampOf } from './brushes';

(window as { __bodenEditor?: boolean }).__bodenEditor = true; // the world must not load boden.json on its own

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const BASE = import.meta.env.BASE_URL;
const DEG = Math.PI / 180;
const FILE = 'classic/public/world/boden.json';

const I = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  erase: I('<path d="M20 20H9L4 15a2 2 0 010-3l9-9a2 2 0 013 0l5 5a2 2 0 010 3l-8 8"/><path d="M8 11l6 6"/>'),
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
  redo: I('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>'),
  save: I('<path d="M5 3h11l4 4v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>'),
  play: I('<path d="M7 4l13 8-13 8z"/>'),
  down: I('<path d="M12 4v12M6 11l6 6 6-6M4 21h16"/>'),
  up: I('<path d="M12 20V8M6 13l6-6 6 6M4 3h16"/>'),
  git: I('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 5-6 4-11 8"/>'),
  reset: I('<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-7 3L3 8"/><path d="M3 3v5h5"/>'),
  trash: I('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  eye: I('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: I('<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 005.4-1.6"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  arrowUp: I('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  paint: I('<path d="M4 20c4 0 6-2 6-5l9-9-3-3-9 9c-3 0-5 2-5 6z"/>'),
};

type PTool = 'paint' | 'erase';
type Snap = { base: string; layers: TexLayer[] };
type Hist = { k: 'plane'; layer: number; r: Rect; before: Uint8Array; after: Uint8Array } | { k: 'layers'; before: Snap; after: Snap } | { k: 'all'; before: BodenPaint; after: BodenPaint };
interface SlOpt { min: number; max: number; log?: boolean; step?: number; get: () => number; set: (v: number) => void; fmt?: (v: number) => string; unit?: string; reset?: number; id?: string }

class Editor {
  paint!: BodenPaint; B!: BodenHandle;
  terrains: TerrainInfo[] = []; brushes: BrushShape[] = [];
  ptool: PTool = 'paint'; tcat = 'Alle';
  activeLayer = 0; baseMode = false; shape = 'kreis'; texChoice = 'moss_ground_02';
  size = 1.5; strength = .5; hard = .35; spacing = .2; jitter = 0; rotRandom = true; rotAngle = 0;
  /** view: hex grid, how many fields get wet earth (preview), day or night */
  grid = true; fields = 7; night = false;
  source = '';
  cx = 0; cz = 0; yaw = 0; pitch = 1.05; dist = innerWidth < innerHeight ? 42 : 26;
  private slots: { x: number; z: number; forest?: boolean; chest?: boolean }[] = []; private H = 1;
  private gridGroup = new THREE.Group();
  private hist: Hist[] = []; private redoStack: Hist[] = [];
  private keys = new Set<string>();
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: null | { kind: 'pan' | 'orbit' | 'paint' | 'gesture'; x: number; y: number; [k: string]: any } = null;
  private hover: { x: number; z: number } | null = null;
  private ring: THREE.Mesh;
  private dirty: Rect | null = null;
  private saveT = 0;

  constructor() {
    const rm = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: .85, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 64), rm); this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 999; this.ring.visible = false;
  }

  async boot() {
    const q = new URLSearchParams(location.search).get('q');
    setPreset(q === 'hoch' || q === 'mittel' || q === 'niedrig' ? q : isTouch ? 'mittel' : 'hoch'); applyQuality();
    const cfg = await loadBalancing();
    this.H = hexR(cfg); this.slots = slotPositions(cfg).filter(s => !s.forest);
    buildWorld();
    const fileF = await fetchBodenFile(), draftF = await loadDraft();
    let P: BodenPaint | null = null; this.source = 'Neuer Boden';
    if (fileF) { try { P = await BodenPaint.decode(fileF); this.source = 'Stand im Spiel'; } catch (e) { console.error(e); } }
    if (draftF) { try { P = await BodenPaint.decode(draftF); this.source = 'Arbeitsstand im Browser'; } catch (e) { console.error(e); } }
    [this.terrains, this.brushes] = await Promise.all([terrainList(), loadBrushes()]);
    this.paint = P ?? this.fresh();
    this.B = await setBoden(this.paint);
    this.activeLayer = this.paint.layers.slice(-1)[0]?.id ?? 0;
    scene.add(this.ring, this.gridGroup); this.buildGrid(); this.syncEarth();
    this.ui(); this.wire(); resize();
    let last = performance.now();
    const loop = (now: number) => { requestAnimationFrame(loop); const dt = clamp((now - last) / 1000, 0, .05); last = now; this.frame(dt); };
    requestAnimationFrame(loop);
    $('#ed-load').classList.add('out');
    (window as any).__ed = this;
  }
  /** a new ground: the game's meadow look (grass with dry patches) */
  private fresh() { return BodenPaint.meadow(); }

  // ---------------- view helpers ----------------
  private buildGrid() {
    const mat = new THREE.LineBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: .35, depthTest: false, fog: false, toneMapped: false });
    const pts: THREE.Vector3[] = [];
    for (const s of this.slots) for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 3, b = a + Math.PI / 3, r = this.H * .97;
      pts.push(new THREE.Vector3(s.x + Math.cos(a) * r, .03, s.z + Math.sin(a) * r), new THREE.Vector3(s.x + Math.cos(b) * r, .03, s.z + Math.sin(b) * r));
    }
    const ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat); ls.renderOrder = 998; this.gridGroup.add(ls);
    this.gridGroup.visible = this.grid;
  }
  /** wet earth like in the game: the chest in the middle + the first fields */
  private syncEarth() {
    const n = Math.min(this.fields, this.slots.length);
    setEarthSpots(this.slots.slice(0, n).map(s => ({ x: s.x, z: s.z, r: this.H * 1.3 })));
  }

  // ---------------- history ----------------
  private push(e: Hist) { this.hist.push(e); if (this.hist.length > 80) this.hist.shift(); this.redoStack.length = 0; this.changed(); }
  undo(redo = false) {
    const e = (redo ? this.redoStack : this.hist).pop(); if (!e) return;
    (redo ? this.hist : this.redoStack).push(e);
    if (e.k === 'plane') { const L = this.paint.layers.find(L => L.id === e.layer); if (L) { this.paint.put(L.m, e.r, redo ? e.after : e.before); this.B.changed(e.r); } }
    else if (e.k === 'layers') { const s = redo ? e.after : e.before; this.paint.base = s.base; this.paint.layers = [...s.layers]; void this.B.layersChanged(); this.panel(); }
    else void this.setPaint(redo ? e.after : e.before);
    this.changed();
  }
  changed() { if (!this.source.endsWith('(geändert)')) this.setSource(this.source + ' (geändert)'); this.saveT = 1.2; this.updUndo(); }
  updUndo() { const u = document.getElementById('ed-undo') as HTMLButtonElement | null; if (!u) return; u.disabled = !this.hist.length; ($('#ed-redo') as HTMLButtonElement).disabled = !this.redoStack.length; }
  setSource(t: string) { this.source = t; const s = document.getElementById('ed-src'); if (s) s.textContent = t; }
  async setPaint(P: BodenPaint) {
    this.paint = P; this.B = await setBoden(P);
    if (!this.layer) this.activeLayer = P.layers.slice(-1)[0]?.id ?? 0;
    this.panel();
  }

  // ---------------- painting ----------------
  get layer(): TexLayer | null { return this.paint.layers.find(L => L.id === this.activeLayer) ?? null; }
  private stroke: { L: TexLayer; before: Uint8Array; r: Rect | null } | null = null;
  private lastDab: { x: number; z: number } | null = null;
  private beginStroke() {
    if (this.ptool === 'paint' && !this.layer) this.addLayer(this.texChoice);
    const L = this.layer; this.stroke = L ? { L, before: L.m.slice(), r: null } : null;
  }
  paintAt(x: number, z: number, first: boolean) {
    const S = this.stroke; if (!S) return;
    const r = this.size, step = Math.max(this.paint.m * .7, r * 2 * this.spacing), shape = this.brushes.find(b => b.id === this.shape) ?? this.brushes[0];
    const stamp = stampOf(shape, this.hard), k = this.strength * .5;
    const dab = (px: number, pz: number) => {
      if (this.jitter > 0) { const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r * this.jitter; px += Math.cos(a) * d; pz += Math.sin(a) * d; }
      const rot = this.rotRandom ? rand(0, Math.PI * 2) : this.rotAngle * DEG;
      const rc = this.paint.dab(px, pz, r, k, stamp, rot, S.L, this.ptool === 'erase');
      S.r = unionRect(S.r, rc); this.dirty = unionRect(this.dirty, rc);
    };
    if (first || !this.lastDab) { dab(x, z); this.lastDab = { x, z }; return; }
    const L = this.lastDab, d = Math.hypot(x - L.x, z - L.z); if (d < step) return;
    const n = Math.floor(d / step);
    for (let i = 1; i <= n; i++) dab(L.x + (x - L.x) * i * step / d, L.z + (z - L.z) * i * step / d);
    this.lastDab = { x: L.x + (x - L.x) * n * step / d, z: L.z + (z - L.z) * n * step / d };
  }
  endStroke() {
    const S = this.stroke; this.stroke = null; this.lastDab = null; this.flush();
    if (S?.r) this.push({ k: 'plane', layer: S.L.id, r: S.r, before: this.paint.grab(S.before, S.r), after: this.paint.grab(S.L.m, S.r) });
  }
  private flush() { if (this.dirty) { this.B.changed(this.dirty); this.dirty = null; } }
  // layers
  private snapLayers(): Snap { return { base: this.paint.base, layers: [...this.paint.layers] }; }
  private layerOp(f: () => void) {
    const before = this.snapLayers(); f(); const after = this.snapLayers();
    this.push({ k: 'layers', before, after }); void this.B.layersChanged(); this.panel();
  }
  texCount(extra?: string) { const s = new Set(['ground_02', 'ground_06', ...this.paint.textures()]); if (extra) s.add(extra); return s.size; }
  private tooMany(tex: string) { if (this.texCount(tex) <= MAX_TEX) return false; this.toast(`Höchstens ${MAX_TEX - 2} verschiedene Texturen`); return true; }
  addLayer(tex: string) {
    if (this.tooMany(tex)) return;
    this.layerOp(() => { const i = this.layer ? this.paint.layers.indexOf(this.layer) + 1 : this.paint.layers.length; this.activeLayer = this.paint.newLayer(tex, i).id; });
  }
  chooseTex(tex: string) {
    this.texChoice = tex;
    if (this.baseMode) { if (this.tooMany(tex)) return; this.layerOp(() => { this.paint.base = tex; this.baseMode = false; }); return; }
    const L = this.layer;
    if (L && L.tex === tex) { this.panel(); return; }
    if (L && !L.m.some(v => v > 0)) { if (this.tooMany(tex)) return; this.layerOp(() => { L.tex = tex; }); return; }
    this.addLayer(tex);
  }

  // ---------------- input ----------------
  ground(x: number, y: number) {
    const v = new THREE.Vector3(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1, .5).unproject(camera), o = camera.position, d = v.sub(o).normalize();
    if (d.y >= -1e-4) return null; const t = -o.y / d.y; return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  private wire() {
    const cv = renderer.domElement;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e)); addEventListener('pointercancel', e => this.up(e));
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) { this.setSize(this.size * Math.pow(1.002, -e.deltaY)); return; }
      this.dist = clamp(this.dist * Math.pow(1.0012, e.deltaY), 3, 60);
    }, { passive: false });
    addEventListener('keydown', e => this.key(e, true)); addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => this.keys.clear());
  }
  private key(e: KeyboardEvent, down: boolean) {
    const tg = e.target as HTMLElement; if ((tg.tagName === 'INPUT' && (tg as HTMLInputElement).type !== 'range' && (tg as HTMLInputElement).type !== 'checkbox') || tg.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (!down) { this.keys.delete(k); return; }
    this.keys.add(k);
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') { e.preventDefault(); this.undo(e.shiftKey); return; }
    if (ctrl && k === 'y') { e.preventDefault(); this.undo(true); return; }
    if (ctrl && k === 's') { e.preventDefault(); void this.download(); return; }
    if (k === '[' || k === ']') { this.setSize(this.size * (k === ']' ? 1.15 : 1 / 1.15)); return; }
    if (k === 'x' && !ctrl) { this.ptool = this.ptool === 'paint' ? 'erase' : 'paint'; this.panel(); return; }
    if (k === 'g' && !ctrl) { this.grid = !this.grid; this.gridGroup.visible = this.grid; return; }
    if (k === 'n' && !ctrl) { this.night = !this.night; return; }
  }
  private down(e: PointerEvent) {
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    document.querySelector('.ed-menu')?.remove();
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) { this.cancelDrag(); const [a, b] = [...this.ptrs.values()]; this.drag = { kind: 'gesture', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; return; }
    if (this.ptrs.size > 2) return;
    const x = e.clientX, y = e.clientY;
    if (e.button === 2) { this.drag = { kind: 'orbit', x, y }; return; }
    if (e.button === 1) { e.preventDefault(); this.drag = { kind: 'pan', x, y }; return; }
    if (e.button !== 0) return;
    const g = this.ground(x, y); if (!g) { this.drag = { kind: 'pan', x, y }; return; }
    this.beginStroke(); this.drag = { kind: 'paint', x, y }; this.paintAt(g.x, g.z, true);
  }
  private move(e: PointerEvent) {
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const x = e.clientX, y = e.clientY, D = this.drag;
    if (e.target === renderer.domElement || D) this.hover = this.ground(x, y);
    if (!D) return;
    const dx = x - D.x, dy = y - D.y;
    switch (D.kind) {
      case 'gesture': {
        if (this.ptrs.size < 2) return; const [a, b] = [...this.ptrs.values()];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        this.panBy(mx - D.x, my - D.y); this.dist = clamp(this.dist * D.d / Math.max(20, d), 3, 60); this.yaw += ang - D.ang;
        D.x = mx; D.y = my; D.d = d; D.ang = ang; return;
      }
      case 'orbit': this.yaw -= dx * .006; this.pitch = clamp(this.pitch + dy * .005, .3, 1.5); break;
      case 'pan': this.panBy(dx, dy); break;
      case 'paint': { const g = this.ground(x, y); if (g) this.paintAt(g.x, g.z, false); return; }
    }
    D.x = x; D.y = y;
  }
  private up(e: PointerEvent) {
    this.ptrs.delete(e.pointerId);
    const D = this.drag; if (!D) return;
    if (D.kind === 'gesture') { if (this.ptrs.size === 0) this.drag = null; return; }
    this.drag = null;
    if (D.kind === 'paint') this.endStroke();
  }
  private cancelDrag() { const D = this.drag; if (!D) return; this.drag = null; if (D.kind === 'paint') this.endStroke(); }
  panBy(dx: number, dy: number) {
    const mpp = 2 * this.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = -fz, rz = fx, k = 1 / Math.max(.45, Math.sin(this.pitch));
    this.cx += -rx * dx * mpp + fx * dy * mpp * k; this.cz += -rz * dx * mpp + fz * dy * mpp * k;
    const lim = this.paint.extent / 2; this.cx = clamp(this.cx, -lim, lim); this.cz = clamp(this.cz, -lim, lim);
  }
  setSize(v: number) { this.size = clamp(v, .1, 20); document.getElementById('ed-sl-size')?.dispatchEvent(new Event('sync')); }

  // ---------------- per frame ----------------
  frame(dt: number) {
    const kx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const kz = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    if (kx || kz) this.panBy(-kx * dt * 700, -kz * dt * 700);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    camera.position.set(this.cx + Math.sin(this.yaw) * cp * this.dist, sp * this.dist, this.cz + Math.cos(this.yaw) * cp * this.dist);
    camera.lookAt(this.cx, 0, this.cz);
    this.flush();
    if (this.saveT > 0) { this.saveT -= dt; if (this.saveT <= 0 && !this.drag) this.paint.encode().then(saveDraft).catch(e => console.error('draft', e)); else if (this.saveT <= 0) this.saveT = .5; }
    const g = this.hover;
    this.ring.visible = !!g && !(this.drag && this.drag.kind === 'gesture');
    if (g) { this.ring.position.set(g.x, .05, g.z); this.ring.scale.setScalar(this.size); (this.ring.material as THREE.MeshBasicMaterial).color.setHex(this.ptool === 'erase' ? 0xff9a80 : 0xfff2c0); }
    updateDayNight(dt, this.night ? 20 : 8); updateGround(dt); updateFog(dt);
    composer.render();
  }

  // ---------------- UI ----------------
  private ui() {
    const top = h('div'); top.id = 'ed-top';
    top.innerHTML = `<span id="ed-title">Boden · Classic</span>
      <span id="ed-src"></span><span class="ed-grow"></span>
      <button class="ed-btn" id="ed-view">${IC.eye}<span class="lbl">Ansicht</span></button>
      <button class="ed-btn" id="ed-undo" title="Strg+Z">${IC.undo}</button><button class="ed-btn" id="ed-redo" title="Strg+Y">${IC.redo}</button>
      <button class="ed-btn" id="ed-play">${IC.play}<span class="lbl">Im Spiel testen</span></button>
      <button class="ed-btn" id="ed-save">${IC.save}<span class="lbl">Speichern</span></button>`;
    document.body.append(top);
    const panel = h('div'); panel.id = 'ed-panel'; document.body.append(panel);
    const toast = h('div'); toast.id = 'ed-toast'; document.body.append(toast);
    if (!isTouch) {
      const help = h('div'); help.id = 'ed-help'; document.body.append(help);
      help.innerHTML = '<b>Linke Maus</b> malen · <b>X</b> Malen/Radieren · <b>Strg+Rad</b> / <b>[ ]</b> Pinselgröße<br><b>Rechte Maus</b> drehen · <b>Mitte</b>/<b>WASD</b> schieben · <b>Rad</b> zoomen<br><b>G</b> Feldraster · <b>N</b> Tag/Nacht';
    }
    $('#ed-src').textContent = this.source;
    $('#ed-undo').onclick = () => this.undo(); $('#ed-redo').onclick = () => this.undo(true);
    $('#ed-play').onclick = () => void this.playTest(); $('#ed-save').onclick = e => { e.stopPropagation(); this.saveMenu(); };
    $('#ed-view').onclick = e => { e.stopPropagation(); this.viewMenu(); };
    this.panel(); this.updUndo();
  }
  private slider(label: string, o: SlOpt) {
    const row = h('div', 'ed-sl' + (o.reset !== undefined ? ' rs' : ''));
    row.innerHTML = `<span>${label}</span><input type="range" min="0" max="1000" step="1" ${o.id ? `id="${o.id}"` : ''}><input class="ed-val" type="text" inputmode="decimal">` + (o.reset !== undefined ? `<button class="ed-rs">${IC.reset}</button>` : '');
    const r = row.querySelector('input[type=range]') as HTMLInputElement, val = row.querySelector('.ed-val') as HTMLInputElement;
    const fmt = o.fmt ?? ((v: number) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)) + (o.unit ?? ''));
    const to = (v: number) => o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) * 1000 : (v - o.min) / (o.max - o.min) * 1000;
    const from = (t: number) => { let v = o.log ? o.min * Math.pow(o.max / o.min, t / 1000) : o.min + (o.max - o.min) * t / 1000; if (o.step) v = Math.round(v / o.step) * o.step; return v; };
    const show = () => { const v = o.get(); r.value = String(to(v)); if (document.activeElement !== val) val.value = fmt(v); };
    show();
    r.oninput = () => { o.set(from(+r.value)); val.value = fmt(o.get()); };
    val.onchange = () => { const v = parseFloat(val.value.replace(',', '.').replace(/[^\d.+-]/g, '')); if (isFinite(v)) o.set(clamp(v, Math.min(o.min, o.max), Math.max(o.min, o.max))); show(); };
    val.onfocus = () => val.select();
    r.addEventListener('sync', show);
    const rs = row.querySelector('.ed-rs') as HTMLButtonElement | null; if (rs) rs.onclick = () => { o.set(o.reset!); show(); };
    return row;
  }
  private check(label: string, get: () => boolean, set: (v: boolean) => void) {
    const r = h('label', 'ed-ck', `<input type="checkbox" ${get() ? 'checked' : ''}><span>${label}</span>`);
    (r.querySelector('input') as HTMLInputElement).onchange = ev => { set((ev.target as HTMLInputElement).checked); };
    return r;
  }
  private sec(title: string) { return h('div', 'ed-sec', title); }
  panel() {
    const P = $('#ed-panel'); if (!P) return; P.innerHTML = '';
    if (isTouch) { const hd = h('button', 'ed-handle'); hd.onclick = () => P.classList.toggle('min'); P.append(hd); }
    const tools = h('div', 'ed-tools'); tools.style.gridTemplateColumns = 'repeat(2, 1fr)';
    for (const [t, l, ic] of [['paint', 'Malen', IC.paint], ['erase', 'Radieren', IC.erase]] as [PTool, string, string][]) {
      const b = h('button', 'ed-btn' + (this.ptool === t ? ' on' : ''), `${ic}<span>${l}</span>`); b.onclick = () => { this.ptool = t; this.panel(); }; tools.append(b);
    }
    P.append(tools);
    const sc = h('div', 'ed-scroll'); P.append(sc);
    const sl = h('div', 'ed-sliders');
    sl.append(this.slider('Größe', { min: .1, max: 20, log: true, get: () => this.size, set: v => this.size = v, unit: ' m', id: 'ed-sl-size' }));
    sl.append(this.slider('Stärke', { min: .01, max: 1, log: true, get: () => this.strength, set: v => this.strength = v, fmt: v => Math.round(v * 100) + ' %', reset: .5 }));
    sl.append(this.slider('Härte', { min: 0, max: .95, get: () => this.hard, set: v => this.hard = v, fmt: v => Math.round(v * 100) + ' %', reset: .35 }));
    sl.append(this.slider('Abstand', { min: .03, max: 2, log: true, get: () => this.spacing, set: v => this.spacing = v, fmt: v => Math.round(v * 100) + ' %', reset: .2 }));
    sl.append(this.slider('Streuung', { min: 0, max: 2, get: () => this.jitter, set: v => this.jitter = v, fmt: v => Math.round(v * 100) + ' %', reset: 0 }));
    sl.append(this.check('Drehung zufällig', () => this.rotRandom, v => { this.rotRandom = v; this.panel(); }));
    if (!this.rotRandom) sl.append(this.slider('Drehung', { min: 0, max: 360, step: 1, get: () => this.rotAngle, set: v => this.rotAngle = v, fmt: v => Math.round(v) + '°', reset: 0 }));
    sc.append(sl);
    sc.append(this.sec('Pinselform'));
    const shapes = h('div', 'ed-shapes');
    for (const b of this.brushes) { const it = h('button', 'ed-shape' + (b.id === this.shape ? ' on' : ''), `<img alt="" src="${b.thumb}"><span>${b.label}</span>`); it.title = b.label; it.onclick = () => { this.shape = b.id; this.panel(); }; shapes.append(it); }
    sc.append(shapes);
    // layers (top first), base at the bottom
    sc.append(this.sec('Ebenen'));
    const box = h('div', 'ed-layers');
    const info = (t: string) => this.terrains.find(x => x.id === t);
    [...this.paint.layers].reverse().forEach(L => {
      const row = h('div', 'ed-layer' + (L.id === this.activeLayer && !this.baseMode ? ' on' : '') + (L.vis ? '' : ' off'));
      row.innerHTML = `<button class="vis">${L.vis ? IC.eye : IC.eyeOff}</button><span class="sw" style="background-image:url(${swatchUrl(L.tex)})"></span><span class="nm">${info(L.tex)?.label ?? L.tex}</span>
        <button class="up">${IC.arrowUp}</button><button class="dn">${IC.arrowDown}</button><button class="del">${IC.trash}</button>`;
      row.onclick = () => { this.activeLayer = L.id; this.baseMode = false; this.texChoice = L.tex; this.panel(); };
      const q = (s: string) => row.querySelector(s) as HTMLButtonElement;
      q('.vis').onclick = ev => { ev.stopPropagation(); this.layerOp(() => { L.vis = !L.vis; }); };
      q('.up').onclick = ev => { ev.stopPropagation(); const a = this.paint.layers, i = a.indexOf(L); if (i < a.length - 1) this.layerOp(() => { a.splice(i, 1); a.splice(i + 1, 0, L); }); };
      q('.dn').onclick = ev => { ev.stopPropagation(); const a = this.paint.layers, i = a.indexOf(L); if (i > 0) this.layerOp(() => { a.splice(i, 1); a.splice(i - 1, 0, L); }); };
      q('.del').onclick = ev => { ev.stopPropagation(); this.layerOp(() => { this.paint.layers = this.paint.layers.filter(o => o !== L); if (this.activeLayer === L.id) this.activeLayer = this.paint.layers.slice(-1)[0]?.id ?? 0; }); this.toast('Ebene gelöscht'); };
      box.append(row);
    });
    const base = h('div', 'ed-layer base' + (this.baseMode ? ' on' : ''), `<span class="vis"></span><span class="sw" style="background-image:url(${swatchUrl(this.paint.base)})"></span><span class="nm">Grundboden: ${info(this.paint.base)?.label ?? this.paint.base}</span><span class="hint">${this.baseMode ? 'Textur wählen' : 'ändern'}</span>`);
    base.onclick = () => { this.baseMode = !this.baseMode; this.panel(); };
    box.append(base);
    const add = h('button', 'ed-btn', `${IC.plus}<span>Neue Ebene</span>`); add.onclick = () => this.addLayer(this.layer?.tex ?? this.texChoice);
    const fill = h('button', 'ed-btn', `${IC.paint}<span>Ebene füllen</span>`); fill.onclick = () => { const L = this.layer; if (!L) return; const before = L.m.slice(), R = this.paint.full(); this.paint.fill(L, 1); this.push({ k: 'plane', layer: L.id, r: R, before, after: L.m.slice() }); this.B.changed(); };
    const row = h('div', 'ed-row'); row.append(add, fill); box.append(row);
    sc.append(box);
    if (this.ptool === 'paint' || this.baseMode) {
      sc.append(this.sec(this.baseMode ? 'Grundboden' : 'Textur'));
      const tc = h('div', 'ed-cats'), cats = ['Alle', ...new Set(this.terrains.map(t => t.cat))];
      for (const c of cats) { const b = h('button', 'ed-chip' + (c === this.tcat ? ' on' : ''), c); b.onclick = () => { this.tcat = c; this.panel(); }; tc.append(b); }
      sc.append(tc);
      const grid = h('div', 'ed-grid');
      const cur = this.baseMode ? this.paint.base : this.layer?.tex;
      for (const t of this.terrains.filter(t => this.tcat === 'Alle' || t.cat === this.tcat)) {
        const it = h('button', 'ed-item' + (t.id === cur ? ' on' : ''), `<div class="sw" style="background-image:url(${swatchUrl(t.id)})"></div><span>${t.label}</span>`);
        it.onclick = () => this.chooseTex(t.id); grid.append(it);
      }
      sc.append(grid);
    }
  }
  private menu() { document.querySelector('.ed-menu')?.remove(); const m = h('div', 'ed-menu'); document.body.append(m); setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target as Node)) { m.remove(); removeEventListener('pointerdown', off); } }), 0); return m; }
  private viewMenu() {
    const m = this.menu();
    m.append(this.check('Feldraster (G)', () => this.grid, v => { this.grid = v; this.gridGroup.visible = v; }));
    m.append(this.check('Nacht (N)', () => this.night, v => { this.night = v; }));
    m.append(this.slider('Felder', { min: 0, max: this.slots.length, step: 1, get: () => this.fields, set: v => { this.fields = Math.round(v); this.syncEarth(); }, fmt: v => String(Math.round(v)), reset: 7 }));
  }

  // ---------------- saving ----------------
  toast(t: string, ms = 2600) { const e = $('#ed-toast'); e.textContent = t; e.classList.add('in'); clearTimeout((e as any)._t); (e as any)._t = setTimeout(() => e.classList.remove('in'), ms); }
  private saveMenu() {
    const m = this.menu();
    const it = (ic: string, l: string, f: () => void) => { const b = h('button', '', `${ic}${l}`); b.onclick = () => { m.remove(); f(); }; m.append(b); };
    it(IC.git, 'Ins Spiel übernehmen (GitHub)', () => this.githubDlg());
    m.append(h('hr'));
    it(IC.down, 'Datei herunterladen (boden.json)', () => void this.download());
    it(IC.up, 'Datei öffnen …', () => this.openFile());
    m.append(h('hr'));
    it(IC.reset, 'Änderungen verwerfen (Stand im Spiel)', () => void this.resetTo(true));
    it(IC.plus, 'Neuer Boden', () => void this.resetTo(false));
  }
  async fileText() { return JSON.stringify(await this.paint.encode()) + '\n'; }
  async download() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await this.fileText()], { type: 'application/json' })); a.download = 'boden.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); this.toast('boden.json heruntergeladen');
  }
  private openFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; try { await this.load(await BodenPaint.decode(JSON.parse(await f.text()) as BodenFile)); this.toast(f.name + ' geladen'); } catch (e) { this.toast('Datei kaputt: ' + (e as Error).message, 4000); } };
    inp.click();
  }
  /** replace the whole ground (undo goes back) */
  async load(P: BodenPaint) {
    const before = this.paint; this.activeLayer = P.layers.slice(-1)[0]?.id ?? 0;
    await this.setPaint(P); this.push({ k: 'all', before, after: P });
  }
  private async resetTo(game: boolean) {
    if (game) { const f = await fetchBodenFile(); await this.load(f ? await BodenPaint.decode(f) : this.fresh()); await saveDraft(null); this.setSource(f ? 'Stand im Spiel' : 'Neuer Boden'); this.saveT = 0; this.toast('Änderungen verworfen'); }
    else { await this.load(this.fresh()); this.toast('Neuer Boden (Rückgängig geht)'); }
  }
  private async playTest() { await saveDraft(await this.paint.encode()); window.open(BASE + 'index.html?boden=entwurf', '_blank'); }
  private githubDlg() {
    const ls = (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    const G = { tok: ls('pog-gh-token'), repo: ls('pog-gh-repo', 'altzweig/PathOfGardening'), branch: ls('pog-gh-branch', 'main') };
    const back = h('div', 'ed-dlg-back'), dl = h('div', 'ed-dlg'); back.append(dl);
    dl.innerHTML = `<h2>Ins Spiel übernehmen</h2>
      <div><b>${FILE}</b> → GitHub</div>
      <label>GitHub-Token <input type="password" id="gh-tok" autocomplete="off" value="${G.tok}"></label>
      <label>Repo <input type="text" id="gh-repo" value="${G.repo}"></label>
      <label>Branch <input type="text" id="gh-branch" value="${G.branch}"></label>
      <label>Nachricht <input type="text" id="gh-msg" value="Classic: Boden im Editor bemalt"></label>
      <div class="msg" id="gh-out"></div>
      <div class="row"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="margin-right:auto;align-self:center">Token erstellen</a>
        <button class="ed-btn" id="gh-no">Abbrechen</button><button class="ed-btn on" id="gh-go">${IC.git}Speichern</button></div>`;
    document.body.append(back);
    const v = (id: string) => (dl.querySelector('#' + id) as HTMLInputElement | null)?.value.trim() ?? '', out = dl.querySelector('#gh-out') as HTMLElement;
    (dl.querySelector('#gh-no') as HTMLElement).onclick = () => back.remove();
    (dl.querySelector('#gh-go') as HTMLButtonElement).onclick = async () => {
      const tok = v('gh-tok'), repo = v('gh-repo'), branch = v('gh-branch') || 'main', msg = v('gh-msg') || 'Classic: Boden im Editor bemalt';
      try { localStorage.setItem('pog-gh-token', tok); localStorage.setItem('pog-gh-repo', repo); localStorage.setItem('pog-gh-branch', branch); } catch { /* private mode */ }
      if (!tok || !/^[\w.-]+\/[\w.-]+$/.test(repo)) { out.className = 'msg err'; out.textContent = 'Token und Repo (besitzer/name) angeben.'; return; }
      out.className = 'msg'; out.textContent = 'Speichere …';
      try {
        const url = await saveToGithub(tok, repo, branch, FILE, await this.fileText(), msg);
        out.className = 'msg ok'; out.innerHTML = `Gespeichert. <a href="${url}" target="_blank" rel="noopener">Commit ansehen</a>`;
        this.setSource('Stand im Spiel'); this.toast('Auf GitHub gespeichert');
      } catch (e) { out.className = 'msg err'; out.textContent = (e as Error).message; }
    };
  }
}

/** create or update a file on GitHub (contents API); returns the commit URL */
async function saveToGithub(token: string, repo: string, branch: string, path: string, text: string, message: string) {
  const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  let sha: string | undefined;
  const cur = await fetch(api + '?ref=' + encodeURIComponent(branch), { headers: H, cache: 'no-store' });
  if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error(ghErr(cur.status));
  const u8 = new TextEncoder().encode(text); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  const r = await fetch(api, { method: 'PUT', headers: H, body: JSON.stringify({ message, content: btoa(bin), branch, sha }) });
  if (!r.ok) throw new Error(ghErr(r.status, await r.text()));
  return (await r.json()).commit?.html_url as string;
}
function ghErr(status: number, body = '') {
  if (status === 401) return 'Token ungültig oder abgelaufen (401).';
  if (status === 403 || status === 404) return `Kein Zugriff (${status}): Token braucht „Contents: Read and write“ für dieses Repo.`;
  if (status === 409) return 'Konflikt (409): bitte nochmal speichern.';
  return `GitHub-Fehler ${status} ${body.slice(0, 160)}`;
}

new Editor().boot().catch(e => { console.error(e); const l = document.getElementById('ed-load'); if (l) l.textContent = 'Fehler: ' + (e as Error).message; });
