// Welt-Editor (welt.html): place, move, turn, scale and delete objects (Nature MegaKit + fences, hay, logs) and paint the
// ground textures and wild grass on the real farm. Saves public/world/welt.json (download, or straight into the repo on
// GitHub); the game reads that file at start. Work in progress stays in the browser (draft), ?welt=entwurf plays it.
import './editor.css';
import * as THREE from 'three';
import { applyQuality, camera, gfx, isTouch, renderer, GEO } from '../view/core';
import { loadFarmCfg, FarmCfg } from '../farm/config';
import { Hof } from '../farm/hof';
import { newState } from '../farm/state';
import { FarmView } from '../farm/view/farmView';
import { SIZE } from '../farm/view/hofWorld';
import { instance, modelBox } from '../view/nature';
import { CATS, Cat, MODEL, MODELS, ModelDef } from '../world/catalog';
import { PropRec, World, WorldFile, decodeWorld, encodeWorld, fetchWorldFile, loadDraft, saveDraft } from '../world/data';
import { WorldPaint } from '../world/paint';
import { toInst } from '../world/props';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const BASE = import.meta.env.BASE_URL;

// ---------------- icons ----------------
const I = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  select: I('<path d="M5 3l14 8-6 2-3 6z"/>'),
  place: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  scatter: I('<circle cx="6" cy="7" r="1.6"/><circle cx="14" cy="5" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="9" cy="14" r="1.6"/><circle cx="15" cy="19" r="1.6"/><circle cx="5" cy="19" r="1.6"/>'),
  erase: I('<path d="M20 20H9L4 15a2 2 0 010-3l9-9a2 2 0 013 0l5 5a2 2 0 010 3l-8 8"/><path d="M8 11l6 6"/>'),
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
  redo: I('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>'),
  save: I('<path d="M5 3h11l4 4v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>'),
  play: I('<path d="M7 4l13 8-13 8z"/>'),
  obj: I('<path d="M12 2l3 6h-2l3 5h-2l3 6H7l3-6H8l3-5H9z"/><path d="M12 19v3"/>'),
  brush: I('<path d="M18 2l4 4-10 10-4-4z"/><path d="M8 12c-3 0-5 2-5 5 0 2-1 3-1 3s5 1 7-1c1.5-1.5 1-4 1-4"/>'),
  down: I('<path d="M12 4v12M6 11l6 6 6-6M4 21h16"/>'),
  up: I('<path d="M12 20V8M6 13l6-6 6 6M4 3h16"/>'),
  git: I('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 5-6 4-11 8"/>'),
  reset: I('<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-7 3L3 8"/><path d="M3 3v5h5"/>'),
  trash: I('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  dup: I('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V4a1 1 0 011-1h11"/>'),
  dice: I('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/>'),
  level: I('<path d="M3 20h18M12 4v12M8 12l4 4 4-4"/>'),
};

// ---------------- ground brushes ----------------
type Brush = number | 'wild' | 'nowild' | 'erase';
const BRUSHES: { id: Brush; label: string; tex?: string; css?: string }[] = [
  // the six terrain layers of the texture concept (src/view/textures.ts TERRAIN_LAYERS), preview = swatch/<layer>.jpg
  { id: 0, label: 'Gras', tex: 'swatch/grass_01' },
  { id: 1, label: 'Moos', tex: 'swatch/moss_ground_02' },
  { id: 2, label: 'Feldboden', tex: 'swatch/ground_02' },
  { id: 3, label: 'Pfad', tex: 'swatch/ground_06' },
  { id: 4, label: 'Trockenrasen', tex: 'swatch/grass_04' },
  { id: 5, label: 'Pflaster', tex: 'swatch/cobblestone_01' },
  { id: 'wild', label: 'Wildgras' },
  { id: 'nowild', label: 'Kein Wildgras' },
  { id: 'erase', label: 'Original' },
];

type Mode = 'props' | 'paint';
type Tool = 'select' | 'place' | 'scatter' | 'erase';
type Hist = { k: 'props'; before: string; after: string } | { k: 'paint'; r: { i0: number; j0: number; i1: number; j1: number }; before: Float32Array; after: Float32Array };

class Editor {
  cfg!: FarmCfg; hof!: Hof; view!: FarmView; paint!: WorldPaint;
  list: PropRec[] = [];
  mode: Mode = 'props'; tool: Tool = 'select';
  cat: Cat = 'Bäume';
  /** chosen models in the palette (place: the first, scatter: all of them mixed) */
  chosen: string[] = ['CommonTree_1'];
  brush: Brush = 0;
  size = { props: 3, paint: 2.5 }; strength = .5; hard = .35; density = .6;
  sel = new Set<PropRec>();
  source = '';
  // camera
  cx = 0; cz = 0; yaw = 0; pitch = 1.0; zoom = 1.25;
  private hist: Hist[] = []; private redoStack: Hist[] = [];
  private keys = new Set<string>();
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: null | { kind: 'pan' | 'orbit' | 'move' | 'box' | 'paint' | 'scatter' | 'erase' | 'fence' | 'gesture'; x: number; y: number; [k: string]: any } = null;
  private propsBefore = '';
  private ghost = new THREE.Group(); private ghostModel = ''; private ghostRy = 0; private ghostS = 1;
  private ring: THREE.Mesh; private selRings: THREE.Mesh[] = [];
  private rings = new THREE.Group();
  private hover: { x: number; z: number } | null = null;
  private thumbs = new Map<string, string>();
  private dirtyGrass: { x0: number; z0: number; x1: number; z1: number } | null = null; private grassT = 0;
  private saveT = 0;
  private ray = new THREE.Raycaster();

  constructor() {
    const rm = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: .85, depthTest: false, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(GEO.ring, rm); this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 999; this.ring.visible = false;
  }

  async boot() {
    const cfg = this.cfg = await loadFarmCfg();
    // start from the browser draft if there is one, otherwise the file of the game
    const draft = await loadDraft();
    let w: World | null = cfg.world ?? null; this.source = w ? 'Stand im Spiel' : 'Generiert';
    if (draft) { try { w = await decodeWorld(draft); this.source = 'Entwurf'; } catch (e) { console.error(e); } }
    cfg.world = { props: w?.props ?? null, paint: w?.paint ?? new WorldPaint() };
    this.paint = cfg.world.paint!;
    const q = new URLSearchParams(location.search).get('q'); // ?q=niedrig for slow devices
    gfx.quality = q === 'hoch' || q === 'mittel' || q === 'niedrig' ? q : isTouch ? 'mittel' : 'hoch'; gfx.auto = false; applyQuality();
    this.hof = new Hof(cfg);
    this.view = new FarmView(cfg, this.hof, newState(cfg));
    this.view.hour = 8; (this.view as unknown as { actBar: THREE.Object3D }).actBar.visible = false;
    await this.view.world.ready;
    this.list = this.view.world.propList.map(p => ({ ...p }));
    this.applyProps();
    const sc = this.view.world.nature!.parent!; sc.add(this.ghost, this.ring, this.rings);
    await this.makeThumbs();
    this.ui(); this.wire();
    let last = performance.now();
    const loop = (now: number) => { requestAnimationFrame(loop); const dt = clamp((now - last) / 1000, 0, .05); last = now; this.frame(dt); };
    requestAnimationFrame(loop);
    $('#ed-load').classList.add('out');
    (window as any).__ed = this;
  }

  // ---------------- props ----------------
  applyProps() { const L = this.view.world.props!; L.list = this.list; L.touchAll(); L.flush(); this.syncRings(); }
  touch(...models: string[]) { const L = this.view.world.props!; L.list = this.list; for (const m of models) L.touch(m); }
  newRec(m: string, x: number, z: number, ry?: number): PropRec {
    const d = MODEL.get(m)!, s = d.s * rand(d.vary[0], d.vary[1]);
    const r: PropRec = { m, x, z, ry: ry ?? rand(0, Math.PI * 2), s };
    if (d.tilt) { r.tx = d.tilt * (Math.random() - .5); r.tz = d.tilt * (Math.random() - .5); }
    this.recolor(r); return r;
  }
  recolor(r: PropRec) {
    const d = MODEL.get(r.m); if (!d) return;
    if (d.tint) { const [H, S, L] = d.tint; r.c = '#' + new THREE.Color().setHSL(rand(H[0], H[1]), rand(S[0], S[1]), rand(L[0], L[1])).getHexString(); delete r.sh; }
    else { const sh = d.shade ?? [1, 1]; r.sh = rand(sh[0], sh[1]); delete r.c; }
  }
  /** radius of an object on the ground (for rings, spacing) */
  radius(r: PropRec) { const b = modelBox(r.m); return Math.max(.25, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * .5 * r.s); }
  beginProps() { this.propsBefore = JSON.stringify(this.list); }
  endProps() {
    const after = JSON.stringify(this.list); if (after === this.propsBefore) return;
    this.push({ k: 'props', before: this.propsBefore, after });
  }
  private push(e: Hist) { this.hist.push(e); if (this.hist.length > 80) this.hist.shift(); this.redoStack.length = 0; this.changed(); }
  undo(redo = false) {
    const e = (redo ? this.redoStack : this.hist).pop(); if (!e) return;
    (redo ? this.hist : this.redoStack).push(e);
    if (e.k === 'props') { this.list = JSON.parse(redo ? e.after : e.before); this.sel.clear(); this.applyProps(); this.updInsp(); }
    else { const { i0, j0, i1, j1 } = e.r; this.paint.put(i0, j0, i1, j1, redo ? e.after : e.before); this.view.world.paintChanged(); this.grassDirty(this.paint.wx(i0), this.paint.wz(j1), this.paint.wx(i1), this.paint.wz(j0)); }
    this.changed();
  }
  /** something changed: save the draft soon */
  changed() { this.source = 'Entwurf'; $('#ed-src').textContent = this.source; this.saveT = 1.2; this.updUndo(); }
  updUndo() { ($('#ed-undo') as HTMLButtonElement).disabled = !this.hist.length; ($('#ed-redo') as HTMLButtonElement).disabled = !this.redoStack.length; }
  async world(): Promise<WorldFile> { return encodeWorld({ props: this.list, paint: this.paint }); }

  // ---------------- selection ----------------
  select(list: PropRec[], add = false) { if (!add) this.sel.clear(); for (const p of list) this.sel.add(p); this.syncRings(); this.updInsp(); }
  syncRings() {
    const want = [...this.sel].filter(p => this.list.includes(p));
    while (this.selRings.length < want.length) { const m = new THREE.Mesh(GEO.ring, this.ring.material); m.rotation.x = -Math.PI / 2; m.renderOrder = 999; this.rings.add(m); this.selRings.push(m); }
    this.selRings.forEach((m, i) => { const p = want[i]; m.visible = !!p; if (p) { m.position.set(p.x, .06, p.z); m.scale.setScalar(this.radius(p) + .15); } });
  }
  deleteSel() { if (!this.sel.size) return; this.beginProps(); const ms = new Set([...this.sel].map(p => p.m)); this.list = this.list.filter(p => !this.sel.has(p)); this.sel.clear(); this.touch(...ms); this.endProps(); this.syncRings(); this.updInsp(); }
  dupSel() {
    if (!this.sel.size) return; this.beginProps();
    const copies = [...this.sel].map(p => ({ ...p, x: p.x + 1.2, z: p.z + 1.2 })); this.list.push(...copies); this.touch(...copies.map(p => p.m));
    this.endProps(); this.select(copies);
  }
  /** change all selected objects (f gets the object and its state before the gesture) */
  editSel(f: (p: PropRec, o: PropRec) => void, base: Map<PropRec, PropRec>) { for (const p of this.sel) { const o = base.get(p); if (o) f(p, o); } this.touch(...[...this.sel].map(p => p.m)); this.syncRings(); }

  // ---------------- painting ----------------
  private strokeBefore: Float32Array | null = null; private strokeRect: { i0: number; j0: number; i1: number; j1: number } | null = null; private lastDab: { x: number; z: number } | null = null;
  paintAt(x: number, z: number, first: boolean) {
    const r = this.size.paint, step = Math.max(.15, r * .22);
    const dab = (px: number, pz: number) => {
      const rc = this.paint.dab(px, pz, r, this.strength * .45, this.hard, this.brush);
      const R = this.strokeRect; this.strokeRect = R ? { i0: Math.min(R.i0, rc.i0), j0: Math.min(R.j0, rc.j0), i1: Math.max(R.i1, rc.i1), j1: Math.max(R.j1, rc.j1) } : rc;
      if (this.brush === 'wild' || this.brush === 'nowild' || this.brush === 'erase') this.grassDirty(px - r, pz - r, px + r, pz + r);
    };
    if (first || !this.lastDab) { dab(x, z); this.lastDab = { x, z }; }
    else {
      const L = this.lastDab, d = Math.hypot(x - L.x, z - L.z); if (d < step) return;
      const n = Math.floor(d / step); for (let i = 1; i <= n; i++) dab(L.x + (x - L.x) * i / n * (n * step / d), L.z + (z - L.z) * i / n * (n * step / d));
      this.lastDab = { x: L.x + (x - L.x) * (n * step / d), z: L.z + (z - L.z) * (n * step / d) };
    }
    this.view.world.paintChanged();
  }
  endStroke() {
    const R = this.strokeRect, B = this.strokeBefore; this.strokeRect = null; this.strokeBefore = null; this.lastDab = null;
    if (!R || !B) return;
    const tmp = new WorldPaint(this.paint.size, this.paint.extent); tmp.f = B;
    this.push({ k: 'paint', r: R, before: tmp.grab(R.i0, R.j0, R.i1, R.j1), after: this.paint.grab(R.i0, R.j0, R.i1, R.j1) });
    this.flushGrass();
  }
  grassDirty(x0: number, z0: number, x1: number, z1: number) {
    const D = this.dirtyGrass; this.dirtyGrass = D ? { x0: Math.min(D.x0, x0), z0: Math.min(D.z0, z0), x1: Math.max(D.x1, x1), z1: Math.max(D.z1, z1) } : { x0, z0, x1, z1 };
  }
  flushGrass() { const D = this.dirtyGrass; if (!D) return; this.dirtyGrass = null; this.view.world.rebuildGrass(D.x0, D.z0, D.x1, D.z1); }

  // ---------------- scatter / erase brush for objects ----------------
  scatterAt(x: number, z: number) {
    const r = this.size.props, models = this.chosen.length ? this.chosen : [];
    if (!models.length) return;
    const set = new Set(models), near = this.list.filter(p => set.has(p.m) && (p.x - x) ** 2 + (p.z - z) ** 2 < (r + 2) ** 2);
    const target = Math.round(this.density * Math.PI * r * r), have = near.filter(p => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r).length;
    const minD = .75 / Math.sqrt(this.density);
    const added: PropRec[] = [];
    for (let t = 0; t < (target - have) * 12 && added.length < target - have; t++) {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (near.some(p => (p.x - px) ** 2 + (p.z - pz) ** 2 < minD * minD)) continue;
      const rec = this.newRec(models[Math.floor(Math.random() * models.length)], px, pz); near.push(rec); added.push(rec);
    }
    if (added.length) { this.list.push(...added); this.touch(...new Set(added.map(p => p.m))); }
  }
  eraseAt(x: number, z: number) {
    const r = this.size.props, only = this.chosen.length && this.tool === 'erase' && (this.drag?.onlyChosen) ? new Set(this.chosen) : null;
    const gone = this.list.filter(p => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r && (!only || only.has(p.m)));
    if (!gone.length) return; const g = new Set(gone);
    this.list = this.list.filter(p => !g.has(p)); for (const p of gone) this.sel.delete(p); this.touch(...new Set(gone.map(p => p.m)));
  }

  // ---------------- fence line ----------------
  fenceRecs(a: { x: number; z: number }, b: { x: number; z: number }, m: string): PropRec[] {
    const L = Math.hypot(b.x - a.x, b.z - a.z), d = MODEL.get(m)!, seg = (d.wall?.[0] ?? 1) * 2;
    if (L < .3) return [this.newRec(m, a.x, a.z, this.ghostRy)];
    const n = Math.max(1, Math.round(L / seg)), s = clamp(L / n / seg, .6, 1.5), ry = Math.atan2(-(b.z - a.z), b.x - a.x);
    return Array.from({ length: n }, (_, i) => { const t = (i + .5) / n, r = this.newRec(m, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, ry); r.s = s; return r; });
  }

  // ---------------- input ----------------
  ground(x: number, y: number) { return this.view.ground(x, y); }
  pickAt(x: number, y: number): PropRec | null {
    this.ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    return this.view.world.props!.pick(this.ray);
  }
  private wire() {
    const cv = renderer.domElement;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e)); addEventListener('pointercancel', e => this.up(e));
    cv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey && this.mode === 'paint') { this.setSize(this.size.paint * Math.pow(1.002, -e.deltaY)); return; } this.zoom = clamp(this.zoom * Math.pow(1.0012, e.deltaY), .22, 4.5); }, { passive: false });
    addEventListener('keydown', e => this.key(e, true)); addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => this.keys.clear());
  }
  private key(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
    const k = e.key.toLowerCase();
    if (!down) { this.keys.delete(k); return; }
    this.keys.add(k);
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') { e.preventDefault(); this.undo(e.shiftKey); return; }
    if (ctrl && k === 'y') { e.preventDefault(); this.undo(true); return; }
    if (ctrl && k === 'd') { e.preventDefault(); this.dupSel(); return; }
    if (ctrl && k === 's') { e.preventDefault(); this.download(); return; }
    if (k === 'delete' || k === 'backspace') { this.deleteSel(); return; }
    if (k === 'escape') { this.select([]); this.setTool('select'); return; }
    if (k === 'q' || k === 'e') {
      const d = (k === 'q' ? 1 : -1) * Math.PI / 12;
      if (this.tool === 'place') this.ghostRy += d;
      else if (this.sel.size) { this.beginProps(); for (const p of this.sel) p.ry += d; this.touch(...[...this.sel].map(p => p.m)); this.endProps(); }
      return;
    }
    if (k === '+' || k === '-' ) {
      const f = k === '+' ? 1.1 : 1 / 1.1;
      if (this.sel.size) { this.beginProps(); for (const p of this.sel) p.s *= f; this.touch(...[...this.sel].map(p => p.m)); this.endProps(); this.syncRings(); }
      return;
    }
    if (k === '[' || k === ']') { const f = k === ']' ? 1.15 : 1 / 1.15; if (this.mode === 'paint') this.setSize(this.size.paint * f); else this.setSize(this.size.props * f); return; }
    if (k === 'tab') { e.preventDefault(); this.setMode(this.mode === 'props' ? 'paint' : 'props'); return; }
    if (!ctrl && this.mode === 'props') { const t = ({ '1': 'select', '2': 'place', '3': 'scatter', '4': 'erase' } as Record<string, Tool>)[k]; if (t) this.setTool(t); }
  }
  private down(e: PointerEvent) {
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* synthetic / already gone */ }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) { this.cancelDrag(); const [a, b] = [...this.ptrs.values()]; this.drag = { kind: 'gesture', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; return; }
    if (this.ptrs.size > 2) return;
    const x = e.clientX, y = e.clientY;
    if (e.button === 2) { this.drag = { kind: 'orbit', x, y }; return; }
    if (e.button === 1) { e.preventDefault(); this.drag = { kind: 'pan', x, y }; return; }
    if (e.button !== 0) return;
    const g = this.ground(x, y); if (!g) { this.drag = { kind: 'pan', x, y }; return; }
    if (this.mode === 'paint') {
      this.strokeBefore = this.paint.f.slice(); this.drag = { kind: 'paint', x, y }; this.paintAt(g.x, g.z, true); return;
    }
    if (this.tool === 'select') {
      const hit = this.pickAt(x, y);
      if (hit) {
        if (e.shiftKey && this.sel.has(hit)) { this.sel.delete(hit); this.syncRings(); this.updInsp(); return; }
        if (!this.sel.has(hit)) this.select([hit], e.shiftKey);
        this.beginProps();
        this.drag = { kind: 'move', x, y, g, base: new Map([...this.sel].map(p => [p, { ...p }])) }; return;
      }
      if (e.shiftKey) { this.drag = { kind: 'box', x, y }; return; }
      this.drag = { kind: 'pan', x, y, click: true }; return;
    }
    if (this.tool === 'place') {
      const m = this.chosen[0]; if (!m) return;
      this.beginProps();
      if (MODEL.get(m)?.wall) { const recs = this.fenceRecs(g, g, m); this.list.push(...recs); this.touch(m); this.drag = { kind: 'fence', x, y, a: g, recs, m }; return; }
      const r = this.newRec(m, g.x, g.z, MODEL.get(m)?.cat === 'Hof' ? this.ghostRy : this.ghostRy); r.s = MODEL.get(m)!.s * this.ghostS;
      this.list.push(r); this.touch(m); this.endProps();
      this.ghostRy = MODEL.get(m)?.cat === 'Hof' ? this.ghostRy : rand(0, Math.PI * 2); this.ghostS = rand(...MODEL.get(m)!.vary);
      this.drag = { kind: 'pan', x, y, click: false, noClear: true }; return;
    }
    if (this.tool === 'scatter') { this.beginProps(); this.drag = { kind: 'scatter', x, y }; this.scatterAt(g.x, g.z); return; }
    if (this.tool === 'erase') { this.beginProps(); this.drag = { kind: 'erase', x, y, onlyChosen: e.shiftKey || this.eraseOnly }; this.eraseAt(g.x, g.z); return; }
  }
  eraseOnly = false;
  private move(e: PointerEvent) {
    const prev = this.ptrs.get(e.pointerId); if (prev) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const x = e.clientX, y = e.clientY, D = this.drag;
    if (e.target === renderer.domElement || D) this.hover = this.ground(x, y);
    if (!D) return;
    const dx = x - D.x, dy = y - D.y;
    switch (D.kind) {
      case 'gesture': {
        if (this.ptrs.size < 2) return; const [a, b] = [...this.ptrs.values()];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        this.panBy(mx - D.x, my - D.y); this.zoom = clamp(this.zoom * D.d / Math.max(20, d), .22, 4.5); this.yaw += ang - D.ang;
        D.x = mx; D.y = my; D.d = d; D.ang = ang; return;
      }
      case 'orbit': this.yaw -= dx * .006; this.pitch = clamp(this.pitch + dy * .005, .3, 1.5); break;
      case 'pan': D.moved = (D.moved ?? 0) + Math.abs(dx) + Math.abs(dy); this.panBy(dx, dy); break;
      case 'move': {
        const g = this.ground(x, y); if (!g) break;
        const ox = g.x - D.g.x, oz = g.z - D.g.z;
        this.editSel((p, o) => { p.x = o.x + ox; p.z = o.z + oz; }, D.base); break;
      }
      case 'box': { const b = $('#ed-box'); b.style.display = 'block'; Object.assign(b.style, { left: Math.min(x, D.x) + 'px', top: Math.min(y, D.y) + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' }); return; }
      case 'paint': { const g = this.ground(x, y); if (g) this.paintAt(g.x, g.z, false); return; }
      case 'scatter': { const g = this.ground(x, y); if (g) this.scatterAt(g.x, g.z); return; }
      case 'erase': { const g = this.ground(x, y); if (g) this.eraseAt(g.x, g.z); return; }
      case 'fence': {
        const g = this.ground(x, y); if (!g) return;
        const old = new Set(D.recs as PropRec[]); this.list = this.list.filter(p => !old.has(p));
        D.recs = this.fenceRecs(D.a, g, D.m); this.list.push(...D.recs); this.touch(D.m); return;
      }
    }
    D.x = x; D.y = y;
  }
  private up(e: PointerEvent) {
    this.ptrs.delete(e.pointerId);
    const D = this.drag; if (!D) return;
    if (D.kind === 'gesture') { if (this.ptrs.size === 0) this.drag = null; return; }
    this.drag = null;
    if (D.kind === 'pan' && D.click && (D.moved ?? 0) < 6 && !D.noClear) this.select([]);
    if (D.kind === 'move' || D.kind === 'scatter' || D.kind === 'erase' || D.kind === 'fence') { this.endProps(); this.syncRings(); this.updInsp(); }
    if (D.kind === 'paint') this.endStroke();
    if (D.kind === 'box') {
      $('#ed-box').style.display = 'none';
      const x0 = Math.min(D.x, e.clientX), x1 = Math.max(D.x, e.clientX), y0 = Math.min(D.y, e.clientY), y1 = Math.max(D.y, e.clientY);
      const inside = this.list.filter(p => { const s = this.view.screen(p.x, .2, p.z); return s.on && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; });
      this.select(inside, true);
    }
  }
  private cancelDrag() {
    const D = this.drag; if (!D) return; this.drag = null;
    if (D.kind === 'paint') this.endStroke();
    else if (D.kind === 'move' || D.kind === 'scatter' || D.kind === 'erase' || D.kind === 'fence') this.endProps();
    $('#ed-box').style.display = 'none';
  }
  /** move the view by a screen drag (the ground follows the finger) */
  panBy(dx: number, dy: number) {
    const dist = camera.position.distanceTo(new THREE.Vector3(this.cx, 0, this.cz));
    const mpp = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = -fz, rz = fx, k = 1 / Math.max(.45, Math.sin(this.pitch));
    this.cx += -rx * dx * mpp + fx * dy * mpp * k; this.cz += -rz * dx * mpp + fz * dy * mpp * k;
    const lim = SIZE / 2 - 10; this.cx = clamp(this.cx, -lim, lim); this.cz = clamp(this.cz, -lim, lim);
  }

  // ---------------- per frame ----------------
  frame(dt: number) {
    // WASD / arrows move the view
    const kx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const kz = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    if (kx || kz) this.panBy(-kx * dt * 900 * Math.min(1.5, this.zoom), -kz * dt * 900 * Math.min(1.5, this.zoom));
    const v = this.view; v.focus = { x: this.cx, z: this.cz }; v.snapCamera(this.cx, this.cz); v.camYaw = this.yaw; v.camPitch = this.pitch; v.zoom = this.zoom; v.camZoom = this.zoom;
    this.view.world.props!.flush();
    if (this.dirtyGrass && this.drag?.kind === 'paint') { this.grassT -= dt; if (this.grassT <= 0) { this.grassT = .2; this.flushGrass(); } }
    if (this.saveT > 0) { this.saveT -= dt; if (this.saveT <= 0 && !this.drag) this.world().then(saveDraft).catch(e => console.error('draft', e)); else if (this.saveT <= 0) this.saveT = .5; }
    this.updCursor();
    v.frame(dt, null, 'day');
  }
  private updCursor() {
    const g = this.hover, brush = this.mode === 'paint' || this.tool === 'scatter' || this.tool === 'erase';
    this.ring.visible = !!g && brush && !(this.drag && this.drag.kind === 'gesture');
    if (g && brush) { const r = this.mode === 'paint' ? this.size.paint : this.size.props; this.ring.position.set(g.x, .07, g.z); this.ring.scale.setScalar(r); (this.ring.material as THREE.MeshBasicMaterial).color.setHex(this.tool === 'erase' && this.mode === 'props' || this.brush === 'erase' || this.brush === 'nowild' ? 0xff9a80 : 0xfff2c0); }
    const m = this.mode === 'props' && this.tool === 'place' ? this.chosen[0] ?? '' : '';
    if (m !== this.ghostModel) {
      for (const c of [...this.ghost.children]) { this.ghost.remove(c); (c as THREE.InstancedMesh).dispose?.(); }
      this.ghostModel = m;
      if (m) { const d = MODEL.get(m)!; instance(this.ghost, m, [toInst({ m, x: 0, z: 0, ry: 0, s: 1, c: d.tint ? '#' + new THREE.Color().setHSL((d.tint[0][0] + d.tint[0][1]) / 2, (d.tint[1][0] + d.tint[1][1]) / 2, (d.tint[2][0] + d.tint[2][1]) / 2).getHexString() : undefined })], { shadow: false, scale: d.wind ?? 1 }); this.ghostS = 1; }
    }
    this.ghost.visible = !!m && !!g && !this.drag;
    if (m && g) { const d = MODEL.get(m)!; this.ghost.position.set(g.x, d.y ?? 0, g.z); this.ghost.rotation.y = this.ghostRy; this.ghost.scale.setScalar(d.s * this.ghostS); }
  }

  // ---------------- UI ----------------
  private ui() {
    const top = h('div', '', ''); top.id = 'ed-top';
    top.innerHTML = `<span id="ed-title">Welt-Editor</span>
      <span class="ed-seg"><button class="ed-btn" id="ed-m-props">${IC.obj}<span class="lbl">Objekte</span></button><button class="ed-btn" id="ed-m-paint">${IC.brush}<span class="lbl">Boden</span></button></span>
      <span id="ed-src"></span><span class="ed-grow"></span>
      <button class="ed-btn" id="ed-undo" title="Rückgängig (Strg+Z)">${IC.undo}</button><button class="ed-btn" id="ed-redo" title="Wiederholen (Strg+Y)">${IC.redo}</button>
      <button class="ed-btn" id="ed-play" title="Entwurf im Spiel ausprobieren">${IC.play}<span class="lbl">Im Spiel testen</span></button>
      <button class="ed-btn" id="ed-save">${IC.save}<span class="lbl">Speichern</span></button>`;
    document.body.append(top);
    const panel = h('div'); panel.id = 'ed-panel'; document.body.append(panel);
    const insp = h('div'); insp.id = 'ed-insp'; insp.hidden = true; document.body.append(insp);
    const box = h('div'); box.id = 'ed-box'; document.body.append(box);
    const toast = h('div'); toast.id = 'ed-toast'; document.body.append(toast);
    if (!isTouch) { const help = h('div', '', ''); help.id = 'ed-help'; document.body.append(help); }
    $('#ed-src').textContent = this.source;
    $('#ed-m-props').onclick = () => this.setMode('props'); $('#ed-m-paint').onclick = () => this.setMode('paint');
    $('#ed-undo').onclick = () => this.undo(); $('#ed-redo').onclick = () => this.undo(true);
    $('#ed-play').onclick = () => this.playTest(); $('#ed-save').onclick = e => { e.stopPropagation(); this.saveMenu(); };
    this.setMode('props'); this.updUndo();
  }
  setMode(m: Mode) {
    this.mode = m; this.cancelDrag();
    $('#ed-m-props').classList.toggle('on', m === 'props'); $('#ed-m-paint').classList.toggle('on', m === 'paint');
    if (m === 'paint') this.select([]);
    this.panel();
  }
  setTool(t: Tool) {
    this.tool = t; if (t === 'place' && this.chosen.length > 1) this.chosen = [this.chosen[0]];
    if (t !== 'select') this.select([]);
    if (this.mode !== 'props') this.setMode('props'); else this.panel();
  }
  setSize(v: number) {
    if (this.mode === 'paint') this.size.paint = clamp(v, .3, 14); else this.size.props = clamp(v, .5, 14);
    const el = $('#ed-sl-size') as HTMLInputElement | null; if (el) { el.value = String(this.mode === 'paint' ? this.size.paint : this.size.props); el.dispatchEvent(new Event('sync')); }
  }
  private slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt = (v: number) => v.toFixed(1), id = '') {
    const row = h('label', 'ed-sl'); row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" ${id ? `id="${id}"` : ''}><span></span>`;
    const inp = row.querySelector('input')!, out = row.lastElementChild as HTMLElement;
    inp.value = String(get()); out.textContent = fmt(get());
    inp.oninput = () => { set(+inp.value); out.textContent = fmt(+inp.value); };
    inp.addEventListener('sync', () => { out.textContent = fmt(+inp.value); });
    return row;
  }
  private panel() {
    const P = $('#ed-panel'); P.innerHTML = '';
    if (isTouch) { const hd = h('button', 'ed-handle'); hd.onclick = () => P.classList.toggle('min'); P.append(hd); }
    if (this.mode === 'props') {
      const tools = h('div', 'ed-tools');
      const T: [Tool, string, string][] = [['select', 'Auswählen', IC.select], ['place', 'Setzen', IC.place], ['scatter', 'Streuen', IC.scatter], ['erase', 'Entfernen', IC.erase]];
      for (const [t, l, ic] of T) { const b = h('button', 'ed-btn' + (this.tool === t ? ' on' : ''), `${ic}<span>${l}</span>`); b.onclick = () => this.setTool(t); tools.append(b); }
      P.append(tools);
      const cats = h('div', 'ed-cats');
      for (const c of CATS) { const b = h('button', 'ed-chip' + (c === this.cat ? ' on' : ''), c); b.onclick = () => { this.cat = c; this.panel(); }; cats.append(b); }
      P.append(cats);
      const grid = h('div', 'ed-grid');
      for (const d of MODELS.filter(d => d.cat === this.cat)) {
        const it = h('button', 'ed-item' + (this.chosen.includes(d.m) ? ' on' : ''), `<img alt="" src="${this.thumbs.get(d.m) ?? ''}"><span>${d.label}</span>`);
        it.onclick = () => this.choose(d);
        grid.append(it);
      }
      P.append(grid);
      if (this.tool === 'scatter' || this.tool === 'erase') {
        const sl = h('div', 'ed-sliders');
        sl.append(this.slider('Pinsel', .5, 14, .1, () => this.size.props, v => this.size.props = v, v => v.toFixed(1) + ' m', 'ed-sl-size'));
        if (this.tool === 'scatter') sl.append(this.slider('Dichte', .05, 3, .05, () => this.density, v => this.density = v, v => v.toFixed(2)));
        else { const r = h('label', 'ed-sl', `<span>Nur Auswahl</span><input type="checkbox" ${this.eraseOnly ? 'checked' : ''}><span></span>`); (r.querySelector('input') as HTMLInputElement).onchange = ev => this.eraseOnly = (ev.target as HTMLInputElement).checked; sl.append(r); }
        P.append(sl);
      }
    } else {
      const grid = h('div', 'ed-grid'); grid.style.paddingTop = '10px';
      for (const b of BRUSHES) {
        const sw = b.tex ? `<div class="sw" style="background-image:url(${BASE}textures/${b.tex}.jpg);${b.css ?? ''}"></div>`
          : b.id === 'wild' ? `<img alt="" src="${this.thumbs.get('Grass_Common_Tall') ?? ''}">` : b.id === 'nowild' ? `<div class="sw" style="background:#3a2e22;display:grid;place-items:center;font-size:40px;color:#ff9a80">✕</div>`
          : `<div class="sw" style="background:#26301e;display:grid;place-items:center;color:var(--gold)">${IC.reset}</div>`;
        const it = h('button', 'ed-item' + (this.brush === b.id ? ' on' : ''), `${sw}<span>${b.label}</span>`);
        it.onclick = () => { this.brush = b.id; this.panel(); }; grid.append(it);
      }
      P.append(grid);
      const sl = h('div', 'ed-sliders');
      sl.append(this.slider('Größe', .3, 14, .1, () => this.size.paint, v => this.size.paint = v, v => v.toFixed(1) + ' m', 'ed-sl-size'));
      sl.append(this.slider('Stärke', .05, 1, .05, () => this.strength, v => this.strength = v, v => Math.round(v * 100) + ' %'));
      sl.append(this.slider('Härte', 0, .9, .05, () => this.hard, v => this.hard = v, v => Math.round(v * 100) + ' %'));
      P.append(sl);
    }
    const help = document.getElementById('ed-help');
    if (help) help.innerHTML = this.mode === 'paint'
      ? '<b>Linke Maus</b> malen · <b>Strg+Rad</b> / <b>[ ]</b> Pinselgröße<br><b>Rechte Maus</b> drehen · <b>Mitte</b>/<b>WASD</b> schieben · <b>Rad</b> zoomen · <b>Tab</b> Objekte'
      : this.tool === 'select' ? '<b>Klick</b> wählen · <b>Shift</b> mehrere / Rahmen · <b>Ziehen</b> verschieben<br><b>Q/E</b> drehen · <b>+/−</b> Größe · <b>Entf</b> löschen · <b>Strg+D</b> kopieren<br><b>Rechte Maus</b> drehen · <b>Ziehen ins Leere</b>/<b>WASD</b> schieben · <b>Rad</b> zoomen'
      : this.tool === 'place' ? '<b>Klick</b> setzen · <b>Q/E</b> drehen · Zaun: <b>ziehen</b> für eine Reihe<br><b>Esc</b> zurück zu Auswählen · <b>Rechte Maus</b> Kamera drehen'
      : this.tool === 'scatter' ? '<b>Malen</b> streut die gewählten Objekte (mehrere anklicken = Mischung)<br><b>[ ]</b> Pinselgröße · <b>Rechte Maus</b> Kamera drehen'
      : '<b>Malen</b> entfernt Objekte · <b>Shift</b> nur die gewählten Arten<br><b>[ ]</b> Pinselgröße · <b>Rechte Maus</b> Kamera drehen';
  }
  private choose(d: ModelDef) {
    if (this.tool === 'scatter' || this.tool === 'erase') {
      const i = this.chosen.indexOf(d.m); if (i >= 0) this.chosen.splice(i, 1); else this.chosen.push(d.m);
    } else { this.chosen = [d.m]; if (this.tool === 'select') this.tool = 'place'; this.ghostRy = d.cat === 'Hof' ? 0 : rand(0, Math.PI * 2); this.ghostS = 1; }
    this.panel();
  }
  updInsp() {
    const el = $('#ed-insp'), sel = [...this.sel].filter(p => this.list.includes(p));
    el.hidden = !sel.length || this.mode !== 'props'; if (el.hidden) return;
    const names = new Set(sel.map(p => MODEL.get(p.m)?.label ?? p.m));
    el.innerHTML = `<h3>${sel.length === 1 ? [...names][0] : sel.length + ' Objekte'}</h3>`;
    // relative sliders: they act from the state at the start of the gesture and spring back afterwards
    const rel = (label: string, min: number, max: number, step: number, apply: (p: PropRec, o: PropRec, v: number) => void, fmt: (v: number) => string, zero = 0) => {
      let base: Map<PropRec, PropRec> | null = null;
      const row = this.slider(label, min, max, step, () => zero, v => {
        if (!base) { this.beginProps(); base = new Map(sel.map(p => [p, { ...p }])); }
        this.editSel((p, o) => apply(p, o, v), base);
      }, fmt);
      const inp = row.querySelector('input')!;
      inp.onchange = () => { base = null; this.endProps(); inp.value = String(zero); inp.dispatchEvent(new Event('sync')); };
      return row;
    };
    el.append(rel('Drehen', -180, 180, 1, (p, o, v) => p.ry = o.ry - v * Math.PI / 180, v => Math.round(v) + '°'));
    el.append(rel('Größe', -1, 1, .01, (p, o, v) => p.s = o.s * Math.pow(3, v), v => '×' + Math.pow(3, v).toFixed(2)));
    el.append(rel('Neigen', -40, 40, 1, (p, o, v) => p.tx = (o.tx ?? 0) + v * Math.PI / 180, v => Math.round(v) + '°'));
    el.append(rel('Höhe', -1, 1, .01, (p, o, v) => p.y = (o.y ?? MODEL.get(o.m)?.y ?? 0) + v, v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' m'));
    const row = h('div', 'row');
    const btn = (ic: string, l: string, f: () => void, cls = '') => { const b = h('button', 'ed-btn ' + cls, `${ic}${l}`); b.onclick = f; row.append(b); };
    btn(IC.dice, 'Farbe', () => { this.beginProps(); for (const p of sel) this.recolor(p); this.touch(...sel.map(p => p.m)); this.endProps(); });
    btn(IC.level, 'Gerade', () => { this.beginProps(); for (const p of sel) { delete p.tx; delete p.tz; delete p.y; } this.touch(...sel.map(p => p.m)); this.endProps(); });
    btn(IC.dup, 'Kopie', () => this.dupSel());
    btn(IC.trash, 'Löschen', () => this.deleteSel(), 'warn');
    el.append(row);
  }

  // ---------------- saving ----------------
  toast(t: string, ms = 2600) { const e = $('#ed-toast'); e.textContent = t; e.classList.add('in'); clearTimeout((e as any)._t); (e as any)._t = setTimeout(() => e.classList.remove('in'), ms); }
  private saveMenu() {
    document.querySelector('.ed-menu')?.remove();
    const m = h('div', 'ed-menu');
    const it = (ic: string, l: string, f: () => void) => { const b = h('button', '', `${ic}${l}`); b.onclick = () => { m.remove(); f(); }; m.append(b); };
    it(IC.git, 'Ins Spiel übernehmen (GitHub)', () => this.githubDlg());
    it(IC.down, 'Datei herunterladen (welt.json)', () => this.download());
    it(IC.up, 'Datei öffnen …', () => this.openFile());
    m.append(h('hr'));
    it(IC.reset, 'Entwurf verwerfen (Stand im Spiel)', () => this.resetTo('game'));
    it(IC.dice, 'Alles neu generieren', () => this.resetTo('gen'));
    document.body.append(m);
    setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target as Node)) { m.remove(); removeEventListener('pointerdown', off); } }), 0);
  }
  /** JSON with one object per line (readable diffs in git) */
  async fileText() {
    const f = await this.world();
    const props = f.props ? '[\n' + f.props.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n]' : 'null';
    return `{"version":1,"saved":${JSON.stringify(f.saved)},\n"paint":${JSON.stringify(f.paint)},\n"props":${props}}\n`;
  }
  async download() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await this.fileText()], { type: 'application/json' })); a.download = 'welt.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); this.toast('welt.json heruntergeladen');
  }
  private openFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; try { await this.load(JSON.parse(await f.text()) as WorldFile); this.toast(f.name + ' geladen'); } catch (e) { this.toast('Datei kaputt: ' + (e as Error).message, 4000); } };
    inp.click();
  }
  async load(f: WorldFile | null) {
    const w = f ? await decodeWorld(f) : null;
    this.beginProps();
    this.list = w?.props ? w.props.map(p => ({ ...p })) : this.view.world.generate();
    this.sel.clear(); this.applyProps(); this.updInsp(); this.endProps();
    const before = this.paint.f.slice();
    if (w?.paint && w.paint.size === this.paint.size) this.paint.f.set(w.paint.f); else this.paint.f.fill(0);
    this.paint.sync(); this.view.world.paintChanged();
    const S = this.paint.size - 1; this.push({ k: 'paint', r: { i0: 0, j0: 0, i1: S, j1: S }, before, after: this.paint.f.slice() });
    this.view.world.rebuildGrass();
  }
  private async resetTo(what: 'game' | 'gen') {
    if (what === 'game') { await this.load(await fetchWorldFile()); await saveDraft(null); this.source = 'Stand im Spiel'; $('#ed-src').textContent = this.source; this.saveT = 0; this.toast('Entwurf verworfen'); }
    else { await this.load(null); this.toast('Neu generiert (Rückgängig geht)'); }
  }
  private async playTest() { await saveDraft(await this.world()); window.open(BASE + 'index.html?welt=entwurf', '_blank'); }
  private githubDlg() {
    const ls = (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    const back = h('div', 'ed-dlg-back'), dl = h('div', 'ed-dlg'); back.append(dl);
    dl.innerHTML = `<h2>Ins Spiel übernehmen</h2>
      <div>Speichert <b>public/world/welt.json</b> direkt im Repo. Ein Push auf <b>main</b> geht sofort live (GitHub Pages, ca. 1–2 Minuten).</div>
      <label>GitHub-Token (fine-grained, nur dieses Repo, „Contents: Read and write“) – bleibt nur in diesem Browser
        <input type="password" id="gh-tok" autocomplete="off" value="${ls('pog-gh-token')}"></label>
      <label>Repo <input type="text" id="gh-repo" value="${ls('pog-gh-repo', 'altzweig/PathOfGardening')}"></label>
      <label>Branch <input type="text" id="gh-branch" value="${ls('pog-gh-branch', 'main')}"></label>
      <label>Nachricht <input type="text" id="gh-msg" value="Welt im Editor bearbeitet"></label>
      <div class="msg" id="gh-out"></div>
      <div class="row"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="margin-right:auto;align-self:center">Token erstellen</a>
        <button class="ed-btn" id="gh-no">Abbrechen</button><button class="ed-btn on" id="gh-go">${IC.git}Speichern</button></div>`;
    document.body.append(back);
    const v = (id: string) => (dl.querySelector('#' + id) as HTMLInputElement).value.trim(), out = dl.querySelector('#gh-out') as HTMLElement;
    (dl.querySelector('#gh-no') as HTMLElement).onclick = () => back.remove();
    (dl.querySelector('#gh-go') as HTMLButtonElement).onclick = async () => {
      const tok = v('gh-tok'), repo = v('gh-repo'), branch = v('gh-branch') || 'main', msg = v('gh-msg') || 'Welt im Editor bearbeitet';
      try { localStorage.setItem('pog-gh-token', tok); localStorage.setItem('pog-gh-repo', repo); localStorage.setItem('pog-gh-branch', branch); } catch { /* private mode */ }
      if (!tok || !/^[\w.-]+\/[\w.-]+$/.test(repo)) { out.className = 'msg err'; out.textContent = 'Token und Repo (besitzer/name) angeben.'; return; }
      out.className = 'msg'; out.textContent = 'Speichere …';
      try { const url = await saveToGithub(tok, repo, branch, 'public/world/welt.json', await this.fileText(), msg); out.className = 'msg ok'; out.innerHTML = `Gespeichert. <a href="${url}" target="_blank" rel="noopener">Commit ansehen</a>`; this.toast('Auf GitHub gespeichert'); }
      catch (e) { out.className = 'msg err'; out.textContent = (e as Error).message; }
    };
  }

  // ---------------- palette pictures ----------------
  private async makeThumbs() {
    // first create every model once (that starts loading their textures), wait until the pictures are there, then render
    const pre = new THREE.Group(); for (const d of MODELS) instance(pre, d.m, [{ x: 0, z: 0, s: 1, ry: 0 }]);
    const maps: THREE.Texture[] = []; pre.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.map) maps.push(m.map); });
    for (let t = 0; t < 60 && maps.some(m => !(m.image && (m.image as HTMLImageElement).complete !== false && (m.image as HTMLImageElement).width)); t++) await new Promise(r => setTimeout(r, 150));
    pre.traverse(o => (o as THREE.InstancedMesh).dispose?.());
    const S = 128, rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 }), sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .01, 200);
    sc.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3020, 1.6)); const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(3, 5, 4); sc.add(sun);
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!, px = new Uint8Array(S * S * 4), img = g.createImageData(S, S);
    const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    for (const d of MODELS) {
      const grp = new THREE.Group(); sc.add(grp);
      const mid = d.tint ? new THREE.Color().setHSL((d.tint[0][0] + d.tint[0][1]) / 2, (d.tint[1][0] + d.tint[1][1]) / 2, (d.tint[2][0] + d.tint[2][1]) / 2).getHexString() : undefined;
      const ms = instance(grp, d.m, [toInst({ m: d.m, x: 0, z: 0, y: 0, ry: .6, s: 1, c: mid ? '#' + mid : undefined })], {});
      const b = modelBox(d.m), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() * .5;
      const dist = r / Math.sin(THREE.MathUtils.degToRad(15)) * .92;
      cam.position.set(c.x + dist * .55, c.y + dist * .45, c.z + dist * .7); cam.lookAt(c);
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = ((S - 1 - y) * S + x) * 4, o = (y * S + x) * 4; for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(Math.pow(px[i + k] / 255, 1 / 2.2) * 255); img.data[o + 3] = px[i + 3]; }
      g.putImageData(img, 0, 0); this.thumbs.set(d.m, cv.toDataURL());
      sc.remove(grp); for (const m of ms) m.dispose();
    }
    renderer.setRenderTarget(null); renderer.toneMapping = tm; rt.dispose();
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
  if (status === 409) return 'Konflikt (409): Datei wurde inzwischen geändert, bitte nochmal speichern.';
  return `GitHub-Fehler ${status} ${body.slice(0, 160)}`;
}

new Editor().boot().catch(e => { console.error(e); const l = document.getElementById('ed-load'); if (l) l.textContent = 'Fehler: ' + (e as Error).message; });
