// Welt-Editor (welt.html), version 2 (21.11.2026). Three tabs:
//   Objekte  place, move, turn, scale, delete and spray every model of the Nature MegaKit (+ fence, hay, logs)
//   Boden    paint terrain textures in layers (like an image editor) on a base texture, with round, mask and noise brushes,
//            and paint wild grass (density + height)
//   Logik    map size, walk area + build area (splines), hexagon field spots, numbered raccoon spawns, main house,
//            interaction objects (well, basket, blueberry bush, fruit trees, brambles)
// Saves public/world/welt.json (download, or straight into the repo on GitHub); the game reads that file at start and
// plays its logic. Work in progress stays in the browser (draft), ?welt=entwurf plays it.
import './editor.css';
import * as THREE from 'three';
import { applyQuality, camera, envU, gfx, isTouch, renderer, scene, GEO } from '../view/core';
import { loadFarmCfg, FarmCfg } from '../farm/config';
import { Hof } from '../farm/hof';
import { newState } from '../farm/state';
import { FarmView } from '../farm/view/farmView';
import { instance, modelBox } from '../view/nature';
import { CATS, Cat, MODEL, MODELS, ModelDef } from '../world/catalog';
import { PropRec, World, WorldFile, decodeWorld, encodeWorld, fetchWorldFile, loadDraft, saveDraft } from '../world/data';
import { Rect, TexLayer, WorldPaint, grassHeightByte, unionRect } from '../world/paint';
import { toInst } from '../world/props';
import { HEX_STEP, Logic, LogicObj, MAP_MAX, MAP_MIN, ObjKind, Pt, SINGLE, applyLogic, defaultLogic, hexSnap, inPoly, logicFromCfg, splinePoly } from '../world/logic';
import { MAX_TEX, TerrainInfo, swatchUrl, terrainList } from '../view/terrain';
import { BrushShape, loadBrushes, stampOf } from './brushes';
import { LogicOverlay, OBJ_LABEL, Sel, Show } from './overlay';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const BASE = import.meta.env.BASE_URL;
const DEG = Math.PI / 180;

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
  logic: I('<path d="M4 6h10M4 12h16M4 18h7"/><circle cx="17" cy="6" r="2"/><circle cx="14" cy="18" r="2"/>'),
  down: I('<path d="M12 4v12M6 11l6 6 6-6M4 21h16"/>'),
  up: I('<path d="M12 20V8M6 13l6-6 6 6M4 3h16"/>'),
  git: I('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 5-6 4-11 8"/>'),
  reset: I('<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-7 3L3 8"/><path d="M3 3v5h5"/>'),
  trash: I('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  dup: I('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V4a1 1 0 011-1h11"/>'),
  dice: I('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/>'),
  level: I('<path d="M3 20h18M12 4v12M8 12l4 4 4-4"/>'),
  eye: I('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: I('<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 005.4-1.6"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  arrowUp: I('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  paint: I('<path d="M4 20c4 0 6-2 6-5l9-9-3-3-9 9c-3 0-5 2-5 6z"/>'),
  grass: I('<path d="M4 21c1-6 0-10-2-13M9 21c0-7 1-12 4-16M14 21c0-5 2-9 6-12M19 21c0-3 1-5 3-6"/>'),
  nograss: I('<path d="M4 21c1-6 0-10-2-13M9 21c0-7 1-12 4-16M14 21c0-5 2-9 6-12"/><path d="M3 3l18 18"/>'),
  spline: I('<path d="M3 17c3-9 6 3 9-6s6 3 9-6"/><circle cx="3" cy="17" r="1.5"/><circle cx="12" cy="11" r="1.5"/><circle cx="21" cy="5" r="1.5"/>'),
  hex: I('<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/>'),
  spawn: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'),
  house: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  well: I('<path d="M5 10h14M7 10v10h10V10M6 10l6-6 6 6M12 4v4"/>'),
  basket: I('<path d="M4 10h16l-2 10H6z"/><path d="M8 10l4-6 4 6"/>'),
  bush: I('<circle cx="8" cy="13" r="5"/><circle cx="16" cy="13" r="5"/><circle cx="12" cy="8" r="5"/>'),
  tree: I('<circle cx="12" cy="9" r="6"/><path d="M12 15v7"/>'),
  bramble: I('<path d="M4 20c4-2 6-8 8-14M12 6c2 6 4 12 8 14"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="13" r="1.5"/><circle cx="12" cy="17" r="1.5"/>'),
  draw: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
  check: I('<path d="M4 12l5 5L20 6"/>'),
};

type Mode = 'props' | 'paint' | 'logic';
type Tool = 'select' | 'place' | 'scatter' | 'erase';
type PTool = 'paint' | 'erase' | 'grass' | 'nograss';
type LTool = 'select' | 'walk' | 'build' | 'field' | 'spawn' | 'house' | ObjKind;
type Snap = { base: string; layers: TexLayer[] };
type Hist =
  | { k: 'props'; before: string; after: string }
  | { k: 'logic'; before: string; after: string }
  | { k: 'plane'; layer: number | 'gd' | 'gh'; r: Rect; before: Uint8Array; after: Uint8Array }
  | { k: 'layers'; before: Snap; after: Snap }
  | { k: 'world'; before: { paint: WorldPaint; logic: string; props: string }; after: { paint: WorldPaint; logic: string; props: string } };

/** slider with a typed value field, optional log scale and reset-to-normal button */
interface SlOpt { min: number; max: number; log?: boolean; step?: number; get: () => number; set: (v: number) => void; fmt?: (v: number) => string; unit?: string; reset?: number; end?: () => void; parse?: (s: string) => number; id?: string }

class Editor {
  rawCfg!: FarmCfg; cfg!: FarmCfg; vcfg!: FarmCfg; hof!: Hof; view!: FarmView; paint!: WorldPaint; logic!: Logic;
  list: PropRec[] = [];
  overlay!: LogicOverlay;
  terrains: TerrainInfo[] = []; brushes: BrushShape[] = [];
  mode: Mode = 'logic'; tool: Tool = 'select'; ptool: PTool = 'paint'; ltool: LTool = 'select';
  cat: Cat = 'Bäume'; tcat = 'Alle';
  /** chosen models in the palette (place: the first, scatter: all of them mixed) */
  chosen: string[] = ['CommonTree_1'];
  // ground painting
  activeLayer = 0; baseMode = false; shape = 'kreis'; texChoice = 'grass_01';
  size = { props: 3, paint: 2.5 }; strength = .5; hard = .35; spacing = .2; jitter = 0; rotRandom = true; rotAngle = 0;
  grassDens = 1; grassH = 1;
  // objects
  density = .6; overlap = false; scaleMul = 1; scaleVar = .15; scatterRotRandom = true; scatterRot = 0; placeRotRandom = true; placeRot = 0;
  // logic
  snap = true; drawing: 'walk' | 'build' | null = null; lsel: Sel | null = null;
  show: Show = { bounds: true, fields: true, spawns: true, labels: true };
  sel = new Set<PropRec>();
  source = '';
  // camera
  cx = 0; cz = 0; yaw = 0; pitch = 1.0; zoom = 1.6;
  private hist: Hist[] = []; private redoStack: Hist[] = [];
  private keys = new Set<string>();
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: null | { kind: 'pan' | 'orbit' | 'move' | 'box' | 'paint' | 'scatter' | 'erase' | 'fence' | 'gesture' | 'logic'; x: number; y: number; [k: string]: any } = null;
  private propsBefore = ''; private logicBefore = '';
  private ghost = new THREE.Group(); private ghostModel = ''; private ghostRy = 0; private ghostS = 1;
  private ring: THREE.Mesh; private selRings: THREE.Mesh[] = [];
  private rings = new THREE.Group();
  private hover: { x: number; z: number } | null = null;
  private thumbs = new Map<string, string>();
  private dirtyGrass: { x0: number; z0: number; x1: number; z1: number } | null = null; private grassT = 0;
  private dirtyPaint: Rect | null = null;
  private saveT = 0; private hofT = 0;
  private ray = new THREE.Raycaster();

  constructor() {
    const rm = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: .85, depthTest: false, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(GEO.ring, rm); this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 999; this.ring.visible = false;
  }

  // ---------------- start ----------------
  async boot() {
    this.rawCfg = await loadFarmCfg({ world: false });
    const fileF = await fetchWorldFile(), draftF = await loadDraft();
    let w: World | null = null; this.source = 'Neue Welt';
    if (fileF) { try { w = await decodeWorld(fileF); this.source = 'Stand im Spiel'; } catch (e) { console.error(e); } }
    if (draftF) { try { w = await decodeWorld(draftF); this.source = 'Entwurf'; } catch (e) { console.error(e); } }
    const start = this.fromWorld(w);
    this.logic = start.logic; this.list = start.props; this.paint = start.paint;
    [this.terrains, this.brushes] = await Promise.all([terrainList(), loadBrushes()]);
    const q = new URLSearchParams(location.search).get('q'); // ?q=niedrig for slow devices
    gfx.quality = q === 'hoch' || q === 'mittel' || q === 'niedrig' ? q : isTouch ? 'mittel' : 'hoch'; gfx.auto = false; applyQuality();
    // the game's farm with this logic; the view gets a copy without the logic objects (the overlay draws those, movable)
    this.cfg = structuredClone(this.rawCfg); this.cfg.world = { props: this.list, paint: this.paint, logic: this.logic };
    applyLogic(this.cfg, this.logic); this.hof = new Hof(this.cfg);
    this.vcfg = { ...this.cfg, hof: { ...this.cfg.hof, buildings: {} as FarmCfg['hof']['buildings'], plots: [], trees: [], bush: { x: 1e4, z: 1e4 } }, world: { ...this.cfg.world, logic: { ...this.logic, objects: [] } } };
    this.view = new FarmView(this.vcfg, new Hof(this.vcfg), newState(this.vcfg));
    this.view.world.hof = this.hof;
    this.view.hour = 8; (this.view as unknown as { actBar: THREE.Object3D }).actBar.visible = false;
    await this.view.world.ready;
    this.applyProps();
    const sc = this.view.world.nature!.parent!; sc.add(this.ghost, this.ring, this.rings);
    this.overlay = new LogicOverlay(sc, this.cfg.plots.size / 2);
    this.syncLogic();
    this.activeLayer = this.paint.layers.slice(-1)[0]?.id ?? 0;
    await this.makeThumbs();
    this.ui(); this.wire();
    let last = performance.now();
    const loop = (now: number) => { requestAnimationFrame(loop); const dt = clamp((now - last) / 1000, 0, .05); last = now; this.frame(dt); };
    requestAnimationFrame(loop);
    $('#ed-load').classList.add('out');
    (window as any).__ed = this;
  }
  /** the world the editor works on (always with logic): a file without logic gets the old farm as logic */
  private fromWorld(w: World | null): { logic: Logic; props: PropRec[]; paint: WorldPaint } {
    if (w?.logic) return { logic: w.logic, props: w.props ?? [], paint: w.paint ?? new WorldPaint(1024, w.logic.size) };
    if (w) { const t = this.template(); return { logic: { ...t.logic, size: w.paint?.extent ?? t.logic.size }, props: w.props ?? t.props, paint: w.paint ?? t.paint }; }
    const logic = defaultLogic(); return { logic, props: [], paint: new WorldPaint(1024, logic.size) };
  }
  /** the farm of balancing.yaml as a starting point: its clearing, gaps, plots, forest and ground */
  private template(): { logic: Logic; props: PropRec[]; paint: WorldPaint } {
    const c = structuredClone(this.rawCfg); c.world = null;
    const hof = new Hof(c), logic = logicFromCfg(c, hof.gaps.map((_, i) => hof.gapOut(i)), hof.brambles);
    const props = this.view ? this.view.world.generateFor(hof) : [];
    const paint = new WorldPaint(1024, logic.size); paint.base = 'grass_01';
    return { logic, props, paint };
  }

  // ---------------- props ----------------
  applyProps() { const L = this.view.world.props!; L.list = this.list; L.touchAll(); L.flush(); this.syncRings(); }
  touch(...models: string[]) { const L = this.view.world.props!; L.list = this.list; for (const m of models) L.touch(m); }
  newRec(m: string, x: number, z: number, ry?: number, sMul = 1): PropRec {
    const d = MODEL.get(m)!, s = d.s * sMul;
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
    this.push({ k: 'props', before: this.propsBefore, after }); this.hofLater();
  }
  /** a field spot: nothing else goes there */
  onField(x: number, z: number) { return this.overlay.fieldAt(this.logic, x, z) >= 0; }

  // ---------------- history ----------------
  private push(e: Hist) { this.hist.push(e); if (this.hist.length > 80) this.hist.shift(); this.redoStack.length = 0; this.changed(); }
  undo(redo = false) {
    const e = (redo ? this.redoStack : this.hist).pop(); if (!e) return;
    (redo ? this.hist : this.redoStack).push(e);
    switch (e.k) {
      case 'props': this.list = JSON.parse(redo ? e.after : e.before); this.cfg.world!.props = this.list; this.sel.clear(); this.applyProps(); this.updInsp(); this.hofLater(); break;
      case 'logic': this.logic = JSON.parse(redo ? e.after : e.before); this.lsel = null; this.logicChanged(); this.updInsp(); break;
      case 'plane': {
        const a = this.planeArr(e.layer); if (a) this.paint.put(a, e.r, redo ? e.after : e.before);
        if (typeof e.layer === 'number') this.view.world.paintChanged(e.r);
        else { const P = this.paint; this.grassDirty(P.wx(e.r.i0), P.wz(e.r.j1), P.wx(e.r.i1), P.wz(e.r.j0)); this.flushGrass(); }
        break;
      }
      case 'layers': { const s = redo ? e.after : e.before; this.paint.base = s.base; this.paint.layers = [...s.layers]; this.view.world.paintChanged(); if (this.mode === 'paint') this.panel(); break; }
      case 'world': { const s = redo ? e.after : e.before; this.list = JSON.parse(s.props); this.logic = JSON.parse(s.logic); this.setPaint(s.paint); this.applyProps(); this.logicChanged(); if (this.mode !== 'props') this.panel(); break; }
    }
    this.changed();
  }
  private planeArr(l: number | 'gd' | 'gh') { return l === 'gd' ? this.paint.gd : l === 'gh' ? this.paint.gh : this.paint.layers.find(L => L.id === l)?.m ?? null; }
  /** something changed: save the draft soon */
  changed() { this.source = 'Entwurf'; const s = document.getElementById('ed-src'); if (s) s.textContent = this.source; this.saveT = 1.2; this.updUndo(); }
  updUndo() { const u = document.getElementById('ed-undo') as HTMLButtonElement | null; if (!u) return; u.disabled = !this.hist.length; ($('#ed-redo') as HTMLButtonElement).disabled = !this.redoStack.length; }
  async world(): Promise<WorldFile> { return encodeWorld({ props: this.list, paint: this.paint, logic: this.logic }); }

  // ---------------- selection (objects) ----------------
  select(list: PropRec[], add = false) { if (!add) this.sel.clear(); for (const p of list) this.sel.add(p); this.syncRings(); this.updInsp(); }
  syncRings() {
    const want = [...this.sel].filter(p => this.list.includes(p));
    while (this.selRings.length < want.length) { const m = new THREE.Mesh(GEO.ring, this.ring.material); m.rotation.x = -Math.PI / 2; m.renderOrder = 999; this.rings.add(m); this.selRings.push(m); }
    this.selRings.forEach((m, i) => { const p = want[i]; m.visible = !!p; if (p) { m.position.set(p.x, .06, p.z); m.scale.setScalar(this.radius(p) + .15); } });
  }
  deleteSel() { if (!this.sel.size) return; this.beginProps(); const ms = new Set([...this.sel].map(p => p.m)); this.list = this.list.filter(p => !this.sel.has(p)); this.cfg.world!.props = this.list; this.sel.clear(); this.touch(...ms); this.endProps(); this.syncRings(); this.updInsp(); }
  dupSel() {
    if (!this.sel.size) return; this.beginProps();
    const copies = [...this.sel].map(p => ({ ...p, x: p.x + 1.2, z: p.z + 1.2 })); this.list.push(...copies); this.touch(...copies.map(p => p.m));
    this.endProps(); this.select(copies);
  }
  editSel(f: (p: PropRec, o: PropRec) => void, base: Map<PropRec, PropRec>) { for (const p of this.sel) { const o = base.get(p); if (o) f(p, o); } this.touch(...[...this.sel].map(p => p.m)); this.syncRings(); }

  // ---------------- ground painting ----------------
  get layer(): TexLayer | null { return this.paint.layers.find(L => L.id === this.activeLayer) ?? null; }
  private stroke: { plane: number | 'gd' | 'gh'; before: Uint8Array; r: Rect | null }[] = [];
  private lastDab: { x: number; z: number } | null = null;
  private beginStroke() {
    if (this.ptool === 'paint' && !this.layer) this.addLayer(this.texChoice);
    const planes: (number | 'gd' | 'gh')[] = this.ptool === 'grass' ? ['gd', 'gh'] : this.ptool === 'nograss' ? ['gd'] : this.layer ? [this.layer.id] : [];
    this.stroke = planes.map(p => ({ plane: p, before: this.planeArr(p)!.slice(), r: null }));
  }
  paintAt(x: number, z: number, first: boolean) {
    if (!this.stroke.length) return;
    const r = this.size.paint, step = Math.max(this.paint.m * .7, r * 2 * this.spacing), shape = this.brushes.find(b => b.id === this.shape) ?? this.brushes[0];
    const stamp = stampOf(shape, this.hard), k = this.strength * (this.ptool === 'grass' || this.ptool === 'nograss' ? .6 : .5);
    const dab = (px: number, pz: number) => {
      if (this.jitter > 0) { const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r * this.jitter; px += Math.cos(a) * d; pz += Math.sin(a) * d; }
      const rot = this.rotRandom ? rand(0, Math.PI * 2) : this.rotAngle * DEG;
      for (const s of this.stroke) {
        const tgt = s.plane === 'gd' ? { plane: 'gd' as const, v: this.ptool === 'nograss' ? 0 : Math.round(this.grassDens / 3 * 255) }
          : s.plane === 'gh' ? { plane: 'gh' as const, v: grassHeightByte(this.grassH) }
          : { L: this.layer!, erase: this.ptool === 'erase' };
        const rc = this.paint.dab(px, pz, r, k, stamp, rot, tgt); s.r = unionRect(s.r, rc);
        if (typeof s.plane === 'number') this.dirtyPaint = unionRect(this.dirtyPaint, rc);
      }
      if (this.ptool === 'grass' || this.ptool === 'nograss') this.grassDirty(px - r, pz - r, px + r, pz + r);
    };
    if (first || !this.lastDab) { dab(x, z); this.lastDab = { x, z }; return; }
    const L = this.lastDab, d = Math.hypot(x - L.x, z - L.z); if (d < step) return;
    const n = Math.floor(d / step);
    for (let i = 1; i <= n; i++) dab(L.x + (x - L.x) * i * step / d, L.z + (z - L.z) * i * step / d);
    this.lastDab = { x: L.x + (x - L.x) * n * step / d, z: L.z + (z - L.z) * n * step / d };
  }
  endStroke() {
    for (const s of this.stroke) if (s.r) {
      const tmp = this.planeArr(s.plane)!, before = this.paint.grab(s.before, s.r);
      this.push({ k: 'plane', layer: s.plane, r: s.r, before, after: this.paint.grab(tmp, s.r) });
    }
    this.stroke = []; this.lastDab = null;
    this.flushPaint(); this.flushGrass();
  }
  private flushPaint() { if (this.dirtyPaint) { this.view.world.paintChanged(this.dirtyPaint); this.dirtyPaint = null; } }
  grassDirty(x0: number, z0: number, x1: number, z1: number) {
    const D = this.dirtyGrass; this.dirtyGrass = D ? { x0: Math.min(D.x0, x0), z0: Math.min(D.z0, z0), x1: Math.max(D.x1, x1), z1: Math.max(D.z1, z1) } : { x0, z0, x1, z1 };
  }
  flushGrass() { const D = this.dirtyGrass; if (!D) return; this.dirtyGrass = null; this.view.world.rebuildGrass(D.x0, D.z0, D.x1, D.z1); }
  // layers
  private snapLayers(): Snap { return { base: this.paint.base, layers: [...this.paint.layers] }; }
  private layerOp(f: () => void) {
    const before = this.snapLayers(); f(); const after = this.snapLayers();
    this.push({ k: 'layers', before, after }); this.view.world.paintChanged(); this.panel();
  }
  texCount(extra?: string) { const s = new Set([this.paint.base, ...this.paint.layers.map(L => L.tex)]); if (extra) s.add(extra); return s.size; }
  addLayer(tex: string) {
    if (this.texCount(tex) > MAX_TEX) { this.toast(`Höchstens ${MAX_TEX} verschiedene Texturen pro Welt`); return; }
    this.layerOp(() => { const i = this.layer ? this.paint.layers.indexOf(this.layer) + 1 : this.paint.layers.length; this.activeLayer = this.paint.newLayer(tex, i).id; });
  }
  chooseTex(tex: string) {
    this.texChoice = tex;
    if (this.baseMode) { this.layerOp(() => { this.paint.base = tex; this.baseMode = false; }); return; }
    const L = this.layer;
    if (L && L.tex === tex) { this.panel(); return; }
    if (L && !L.m.some(v => v > 0)) { if (this.texCount(tex) - (this.paint.layers.some(o => o !== L && o.tex === L.tex) || this.paint.base === L.tex ? 0 : 1) > MAX_TEX) { this.toast(`Höchstens ${MAX_TEX} verschiedene Texturen pro Welt`); return; } this.layerOp(() => { L.tex = tex; }); return; }
    this.addLayer(tex);
  }

  // ---------------- spray / erase brush for objects ----------------
  scatterAt(x: number, z: number) {
    const r = this.size.props, models = this.chosen; if (!models.length) return;
    const set = new Set(models), near = this.list.filter(p => set.has(p.m) && (p.x - x) ** 2 + (p.z - z) ** 2 < (r + 2) ** 2);
    const target = Math.max(1, Math.round(this.density * Math.PI * r * r)), have = near.filter(p => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r).length;
    const minD = this.overlap ? 0 : .75 / Math.sqrt(this.density);
    const added: PropRec[] = [];
    for (let t = 0; t < (target - have) * 12 && added.length < target - have; t++) {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (minD && near.some(p => (p.x - px) ** 2 + (p.z - pz) ** 2 < minD * minD)) continue;
      if (this.onField(px, pz)) continue;
      const ry = this.scatterRotRandom ? undefined : this.scatterRot * DEG, sm = this.scaleMul * (1 + rand(-this.scaleVar, this.scaleVar));
      const rec = this.newRec(models[Math.floor(Math.random() * models.length)], px, pz, ry, sm); near.push(rec); added.push(rec);
    }
    if (added.length) { this.list.push(...added); this.touch(...new Set(added.map(p => p.m))); }
  }
  eraseAt(x: number, z: number) {
    const r = this.size.props, only = this.chosen.length && this.drag?.onlyChosen ? new Set(this.chosen) : null;
    const gone = this.list.filter(p => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r && (!only || only.has(p.m)));
    if (!gone.length) return; const g = new Set(gone);
    this.list = this.list.filter(p => !g.has(p)); this.cfg.world!.props = this.list; for (const p of gone) this.sel.delete(p); this.touch(...new Set(gone.map(p => p.m)));
  }
  fenceRecs(a: { x: number; z: number }, b: { x: number; z: number }, m: string): PropRec[] {
    const L = Math.hypot(b.x - a.x, b.z - a.z), d = MODEL.get(m)!, seg = (d.wall?.[0] ?? 1) * 2;
    if (L < .3) return [this.newRec(m, a.x, a.z, this.ghostRy)];
    const n = Math.max(1, Math.round(L / seg)), s = clamp(L / n / seg, .6, 1.5), ry = Math.atan2(-(b.z - a.z), b.x - a.x);
    return Array.from({ length: n }, (_, i) => { const t = (i + .5) / n, r = this.newRec(m, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, ry); r.s = s; return r; });
  }

  // ---------------- logic ----------------
  beginLogic() { this.logicBefore = JSON.stringify(this.logic); }
  endLogic() { const after = JSON.stringify(this.logic); if (after === this.logicBefore) return; this.push({ k: 'logic', before: this.logicBefore, after }); this.logicChanged(); }
  /** redraw the overlay; the farm (collisions, grass under fields) follows a moment later */
  syncLogic() { this.overlay.sync(this.logic, this.show, this.mode === 'logic' ? this.lsel : null, this.mode === 'logic' && (this.ltool === 'walk' || this.ltool === 'build') ? this.ltool : null); }
  logicChanged() { this.syncLogic(); this.hofLater(); if (this.mode === 'logic') this.updWarn(); }
  private hofLater() { this.hofT = .35; }
  /** new farm geometry from the logic (grass is cut out of fields, house, objects) */
  private rehof() {
    this.cfg.world = { props: this.list, paint: this.paint, logic: this.logic };
    applyLogic(this.cfg, this.logic); this.hof = new Hof(this.cfg); this.view.world.hof = this.hof;
    if (this.paint.grassMax(-this.paint.extent / 2, -this.paint.extent / 2, this.paint.extent / 2, this.paint.extent / 2) > .01) this.view.world.rebuildGrass();
  }
  /** handles under the pointer (screen distance), most specific first */
  pickLogic(sx: number, sy: number, only?: LTool): Sel | null {
    const L = this.logic, g = this.ground(sx, sy), near = (p: Pt, px: number) => { const s = this.view.screen(p.x, .1, p.z); return s.on && Math.hypot(s.x - sx, s.y - sy) < px; };
    const want = (t: LTool) => !only || only === t || only === 'select';
    for (const k of ['walk', 'build'] as const) if ((only === k || (!only || only === 'select') && this.show.bounds)) { const i = L[k].findIndex(p => near(p, 16)); if (i >= 0) return { k, i }; }
    if (want('spawn') && this.show.spawns) { const i = L.spawns.findIndex(p => near(p, 26)); if (i >= 0) return { k: 'spawn', i }; }
    const oi = L.objects.findIndex(o => (want(o.k) || only === o.k) && near(o, o.k === 'tree' ? 30 : 22)); if (oi >= 0) return { k: 'obj', i: oi };
    if (g && (want('field')) && this.show.fields) { const i = this.overlay.fieldAt(L, g.x, g.z); if (i >= 0) return { k: 'field', i }; }
    if (g && want('house')) { const H = L.house, a = H.rot * DEG, dx = g.x - H.x, dz = g.z - H.z, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a); if (Math.abs(lx) < 4.4 && Math.abs(lz) < 2.8) return { k: 'house' }; }
    return null;
  }
  selPt(s: Sel): Pt & { rot?: number } {
    const L = this.logic; return s.k === 'house' ? L.house : s.k === 'walk' || s.k === 'build' ? L[s.k][s.i] : s.k === 'field' ? L.fields[s.i] : s.k === 'spawn' ? L.spawns[s.i] : L.objects[s.i];
  }
  /** insert a control point where the spline was clicked (segment nearest to the click) */
  insertPoint(k: 'walk' | 'build', g: Pt): number {
    const c = this.logic[k]; let best = 0, bd = 1e9;
    for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = clamp(((g.x - a.x) * dx + (g.z - a.z) * dz) / l2, 0, 1), d = Math.hypot(g.x - a.x - dx * t, g.z - a.z - dz * t); if (d < bd) { bd = d; best = i; } }
    c.splice(best + 1, 0, { x: g.x, z: g.z }); return best + 1;
  }
  /** distance (screen px) from a screen point to a drawn spline */
  splineDist(k: 'walk' | 'build', sx: number, sy: number) {
    let d = 1e9; for (const p of splinePoly(this.logic[k], 6)) { const s = this.view.screen(p.x, .06, p.z); if (s.on) d = Math.min(d, Math.hypot(s.x - sx, s.y - sy)); }
    return d;
  }
  deleteLogicSel() {
    const s = this.lsel; if (!s) return; const L = this.logic;
    if ((s.k === 'walk' || s.k === 'build') && L[s.k].length <= 3) { this.toast('Eine Fläche braucht mindestens 3 Punkte'); return; }
    if (s.k === 'house') { this.toast('Das Haupthaus kann nur verschoben werden'); return; }
    this.beginLogic();
    if (s.k === 'walk' || s.k === 'build') L[s.k].splice(s.i, 1); else if (s.k === 'field') L.fields.splice(s.i, 1); else if (s.k === 'spawn') L.spawns.splice(s.i, 1); else L.objects.splice(s.i, 1);
    this.lsel = null; this.endLogic(); this.updInsp();
  }
  private logicDown(x: number, y: number, g: Pt) {
    const t = this.ltool, L = this.logic;
    const grab = (s: Sel, snapField = false) => { this.lsel = s; const p = this.selPt(s); this.drag = { kind: 'logic', x, y, sel: s, off: { x: p.x - g.x, z: p.z - g.z }, snapField }; this.syncLogic(); this.updInsp(); };
    this.beginLogic();
    if (t === 'walk' || t === 'build') {
      if (this.drawing === t) {
        const c = L[t]; if (c.length >= 3) { const f = this.view.screen(c[0].x, .1, c[0].z); if (f.on && Math.hypot(f.x - x, f.y - y) < 18) { this.drawing = null; this.endLogic(); this.panel(); return; } }
        c.push({ x: g.x, z: g.z }); this.syncLogic(); this.drag = { kind: 'pan', x, y, noClear: true, click: false }; return;
      }
      const hit = this.pickLogic(x, y, t); if (hit && hit.k === t) { grab(hit); return; }
      if (this.splineDist(t, x, y) < 16) { const i = this.insertPoint(t, g); grab({ k: t, i }); return; }
      this.drag = { kind: 'pan', x, y, click: true }; return;
    }
    if (t === 'select') { const hit = this.pickLogic(x, y); if (hit) { grab(hit, hit.k === 'field'); return; } this.lsel = null; this.syncLogic(); this.updInsp(); this.drag = { kind: 'pan', x, y, click: true }; return; }
    if (t === 'house') { const hit = this.pickLogic(x, y, 'house'); if (hit) { grab(hit); return; } L.house.x = g.x; L.house.z = g.z; grab({ k: 'house' }); return; }
    if (t === 'field') {
      const i = this.overlay.fieldAt(L, g.x, g.z); if (i >= 0) { grab({ k: 'field', i }, true); return; }
      const p = this.snap ? hexSnap(g.x, g.z) : { x: g.x, z: g.z };
      if (L.fields.some(q => Math.hypot(q.x - p.x, q.z - p.z) < HEX_STEP * .8)) { this.drag = { kind: 'pan', x, y, click: true }; return; }
      L.fields.push(p); grab({ k: 'field', i: L.fields.length - 1 }, true); return;
    }
    if (t === 'spawn') { const hit = this.pickLogic(x, y, 'spawn'); if (hit?.k === 'spawn') { grab(hit); return; } L.spawns.push({ x: g.x, z: g.z }); grab({ k: 'spawn', i: L.spawns.length - 1 }); return; }
    // interaction objects: the single ones move, the others are added
    const hit = this.pickLogic(x, y, t); if (hit && hit.k === 'obj' && L.objects[hit.i].k === t) { grab(hit); return; }
    if (SINGLE.includes(t)) { let i = L.objects.findIndex(o => o.k === t); if (i < 0) { L.objects.push({ k: t, x: g.x, z: g.z }); i = L.objects.length - 1; } else { L.objects[i].x = g.x; L.objects[i].z = g.z; } grab({ k: 'obj', i }); return; }
    L.objects.push({ k: t, x: g.x, z: g.z }); grab({ k: 'obj', i: L.objects.length - 1 });
  }
  private logicMove(D: NonNullable<Editor['drag']>, g: Pt) {
    const p = this.selPt(D.sel); let x = g.x + D.off.x, z = g.z + D.off.z;
    if (D.snapField && this.snap) { const s = hexSnap(x, z); x = s.x; z = s.z; }
    p.x = x; p.z = z; this.syncLogic();
  }
  /** problems with the logic, shown in the logic panel */
  warnings(): string[] {
    const L = this.logic, b = splinePoly(L.build), w = splinePoly(L.walk), out: string[] = [];
    if (!L.spawns.length) out.push('Kein Spawn gesetzt: es kommen keine Tiere.');
    if (!L.fields.length) out.push('Keine Feldplätze.');
    const fo = L.fields.filter(p => !inPoly(b, p.x, p.z)).length; if (fo) out.push(`${fo} Feld${fo > 1 ? 'er' : ''} außerhalb des Baubereichs.`);
    if (!inPoly(b, L.house.x, L.house.z)) out.push('Haupthaus außerhalb des Baubereichs.');
    if (!inPoly(w, L.house.x, L.house.z)) out.push('Haupthaus außerhalb des begehbaren Bereichs.');
    for (const k of SINGLE) { const o = L.objects.find(q => q.k === k); if (!o) out.push(`${OBJ_LABEL[k]} fehlt.`); else if (!inPoly(w, o.x, o.z)) out.push(`${OBJ_LABEL[k]} ist nicht erreichbar.`); }
    if (!L.objects.some(o => o.k === 'well')) out.push('Ohne Brunnen kann die Gießkanne nicht gefüllt werden.');
    const half = L.size / 2; if (w.some(p => Math.abs(p.x) > half || Math.abs(p.z) > half)) out.push('Begehbarer Bereich ragt über den Kartenrand.');
    return [...new Set(out)];
  }
  updWarn() { const el = document.getElementById('ed-warn'); if (!el) return; const W = this.warnings(); el.innerHTML = W.map(t => `<div>⚠ ${t}</div>`).join(''); el.hidden = !W.length; }
  /** map size: the painted ground keeps its place in the world */
  setMapSize(v: number) {
    v = Math.round(clamp(v, MAP_MIN, MAP_MAX)); if (v === this.paint.extent) return;
    const before = { paint: this.paint, logic: JSON.stringify(this.logic), props: JSON.stringify(this.list) };
    this.logic.size = v; const np = this.paint.resized(v); this.setPaint(np);
    this.push({ k: 'world', before, after: { paint: np, logic: JSON.stringify(this.logic), props: before.props } }); this.logicChanged();
  }
  setPaint(P: WorldPaint) {
    this.paint = P; this.cfg.world!.paint = P; this.vcfg.world!.paint = P; this.view.world.setPaint(P);
    if (!this.layer) this.activeLayer = P.layers.slice(-1)[0]?.id ?? 0;
    this.view.world.rebuildGrass(-MAP_MAX, -MAP_MAX, MAP_MAX, MAP_MAX);
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
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey && (this.mode === 'paint' || this.tool === 'scatter' || this.tool === 'erase')) { this.setSize(this.curSize() * Math.pow(1.002, -e.deltaY)); return; }
      this.zoom = clamp(this.zoom * Math.pow(1.0012, e.deltaY), .04, this.maxZoom());
    }, { passive: false });
    addEventListener('keydown', e => this.key(e, true)); addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => this.keys.clear());
  }
  maxZoom() { return Math.max(4.5, this.paint.extent / 16.4 * .95); }
  private key(e: KeyboardEvent, down: boolean) {
    const tg = e.target as HTMLElement; if ((tg.tagName === 'INPUT' && (tg as HTMLInputElement).type !== 'range' && (tg as HTMLInputElement).type !== 'checkbox') || tg.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (!down) { this.keys.delete(k); return; }
    this.keys.add(k);
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') { e.preventDefault(); this.undo(e.shiftKey); return; }
    if (ctrl && k === 'y') { e.preventDefault(); this.undo(true); return; }
    if (ctrl && k === 'd') { e.preventDefault(); this.dupSel(); return; }
    if (ctrl && k === 's') { e.preventDefault(); this.download(); return; }
    if (k === 'delete' || k === 'backspace') { if (this.mode === 'logic') this.deleteLogicSel(); else this.deleteSel(); return; }
    if (k === 'escape') { if (this.drawing) { this.drawing = null; this.endLogic(); this.panel(); return; } this.select([]); this.lsel = null; this.syncLogic(); this.updInsp(); this.setTool('select'); return; }
    if (k === 'enter' && this.drawing) { this.drawing = null; this.endLogic(); this.panel(); return; }
    if (k === 'q' || k === 'e') {
      const d = (k === 'q' ? 1 : -1) * Math.PI / 12;
      if (this.mode === 'logic' && this.lsel && (this.lsel.k === 'house' || this.lsel.k === 'obj')) { this.beginLogic(); const p = this.selPt(this.lsel); p.rot = ((p.rot ?? 0) - d / DEG + 360) % 360; this.endLogic(); this.updInsp(); return; }
      if (this.tool === 'place') { this.ghostRy += d; this.placeRotRandom = false; this.placeRot = ((this.ghostRy / DEG) % 360 + 360) % 360; }
      else if (this.sel.size) { this.beginProps(); for (const p of this.sel) p.ry += d; this.touch(...[...this.sel].map(p => p.m)); this.endProps(); this.updInsp(); }
      return;
    }
    if (k === '+' || k === '-') {
      const f = k === '+' ? 1.1 : 1 / 1.1;
      if (this.sel.size) { this.beginProps(); for (const p of this.sel) p.s *= f; this.touch(...[...this.sel].map(p => p.m)); this.endProps(); this.syncRings(); this.updInsp(); }
      return;
    }
    if (k === '[' || k === ']') { this.setSize(this.curSize() * (k === ']' ? 1.15 : 1 / 1.15)); return; }
    if (k === 'tab') { e.preventDefault(); this.setMode(this.mode === 'logic' ? 'props' : this.mode === 'props' ? 'paint' : 'logic'); return; }
    if (!ctrl && this.mode === 'props') { const t = ({ '1': 'select', '2': 'place', '3': 'scatter', '4': 'erase' } as Record<string, Tool>)[k]; if (t) this.setTool(t); }
  }
  private down(e: PointerEvent) {
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* synthetic / already gone */ }
    document.querySelector('.ed-menu')?.remove();
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) { this.cancelDrag(); const [a, b] = [...this.ptrs.values()]; this.drag = { kind: 'gesture', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; return; }
    if (this.ptrs.size > 2) return;
    const x = e.clientX, y = e.clientY;
    if (e.button === 2) { this.drag = { kind: 'orbit', x, y }; return; }
    if (e.button === 1) { e.preventDefault(); this.drag = { kind: 'pan', x, y }; return; }
    if (e.button !== 0) return;
    const g = this.ground(x, y); if (!g) { this.drag = { kind: 'pan', x, y }; return; }
    if (this.mode === 'logic') { this.logicDown(x, y, g); return; }
    if (this.mode === 'paint') { this.beginStroke(); this.drag = { kind: 'paint', x, y }; this.paintAt(g.x, g.z, true); return; }
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
      if (this.onField(g.x, g.z)) { this.toast('Hier ist ein Feldplatz'); this.drag = { kind: 'pan', x, y, noClear: true }; return; }
      this.beginProps();
      if (MODEL.get(m)?.wall) { const recs = this.fenceRecs(g, g, m); this.list.push(...recs); this.touch(m); this.drag = { kind: 'fence', x, y, a: g, recs, m }; return; }
      const r = this.newRec(m, g.x, g.z, this.ghostRy, this.ghostS); this.list.push(r); this.touch(m); this.endProps();
      this.nextGhost();
      this.drag = { kind: 'pan', x, y, click: false, noClear: true }; return;
    }
    if (this.tool === 'scatter') { this.beginProps(); this.drag = { kind: 'scatter', x, y }; this.scatterAt(g.x, g.z); return; }
    if (this.tool === 'erase') { this.beginProps(); this.drag = { kind: 'erase', x, y, onlyChosen: e.shiftKey || this.eraseOnly }; this.eraseAt(g.x, g.z); return; }
  }
  eraseOnly = false;
  /** rotation + size of the next object to place */
  nextGhost() { const d = MODEL.get(this.chosen[0] ?? ''); this.ghostRy = this.placeRotRandom ? rand(0, Math.PI * 2) : this.placeRot * DEG; this.ghostS = this.scaleMul * (d && !this.placeRotRandom ? 1 : 1 + rand(-this.scaleVar, this.scaleVar)); }
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
        this.panBy(mx - D.x, my - D.y); this.zoom = clamp(this.zoom * D.d / Math.max(20, d), .04, this.maxZoom()); this.yaw += ang - D.ang;
        D.x = mx; D.y = my; D.d = d; D.ang = ang; return;
      }
      case 'orbit': this.yaw -= dx * .006; this.pitch = clamp(this.pitch + dy * .005, .3, 1.5); break;
      case 'pan': D.moved = (D.moved ?? 0) + Math.abs(dx) + Math.abs(dy); this.panBy(dx, dy); break;
      case 'move': { const g = this.ground(x, y); if (!g) break; const ox = g.x - D.g.x, oz = g.z - D.g.z; this.editSel((p, o) => { p.x = o.x + ox; p.z = o.z + oz; }, D.base); break; }
      case 'logic': { const g = this.ground(x, y); if (g) this.logicMove(D, g); return; }
      case 'box': { const b = $('#ed-box'); b.style.display = 'block'; Object.assign(b.style, { left: Math.min(x, D.x) + 'px', top: Math.min(y, D.y) + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' }); return; }
      case 'paint': { const g = this.ground(x, y); if (g) this.paintAt(g.x, g.z, false); return; }
      case 'scatter': { const g = this.ground(x, y); if (g) this.scatterAt(g.x, g.z); return; }
      case 'erase': { const g = this.ground(x, y); if (g) this.eraseAt(g.x, g.z); return; }
      case 'fence': {
        const g = this.ground(x, y); if (!g) return;
        const old = new Set(D.recs as PropRec[]); this.list = this.list.filter(p => !old.has(p)); this.cfg.world!.props = this.list;
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
    if (D.kind === 'pan' && D.click && (D.moved ?? 0) < 6 && !D.noClear) { this.select([]); if (this.mode === 'logic' && !this.drawing) { this.lsel = null; this.syncLogic(); this.updInsp(); } }
    if (this.mode === 'logic' && !this.drawing && (D.kind === 'logic' || D.kind === 'pan')) { this.endLogic(); this.updInsp(); }
    if (D.kind === 'move' || D.kind === 'scatter' || D.kind === 'erase' || D.kind === 'fence') { this.cfg.world!.props = this.list; this.endProps(); this.syncRings(); this.updInsp(); }
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
    else if (D.kind === 'logic') this.endLogic();
    $('#ed-box').style.display = 'none';
  }
  /** move the view by a screen drag (the ground follows the finger) */
  panBy(dx: number, dy: number) {
    const dist = camera.position.distanceTo(new THREE.Vector3(this.cx, 0, this.cz));
    const mpp = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = -fz, rz = fx, k = 1 / Math.max(.45, Math.sin(this.pitch));
    this.cx += -rx * dx * mpp + fx * dy * mpp * k; this.cz += -rz * dx * mpp + fz * dy * mpp * k;
    const lim = this.paint.extent / 2; this.cx = clamp(this.cx, -lim, lim); this.cz = clamp(this.cz, -lim, lim);
  }

  // ---------------- per frame ----------------
  frame(dt: number) {
    const kx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const kz = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    if (kx || kz) this.panBy(-kx * dt * 900 * Math.min(1.5, this.zoom), -kz * dt * 900 * Math.min(1.5, this.zoom));
    const v = this.view; v.focus = { x: this.cx, z: this.cz }; v.snapCamera(this.cx, this.cz); v.camYaw = this.yaw; v.camPitch = this.pitch; v.zoom = this.zoom; v.camZoom = this.zoom;
    this.view.world.props!.flush();
    this.flushPaint();
    if (this.dirtyGrass && this.drag?.kind === 'paint') { this.grassT -= dt; if (this.grassT <= 0) { this.grassT = .2; this.flushGrass(); } }
    if (this.hofT > 0 && !this.drag) { this.hofT -= dt; if (this.hofT <= 0) this.rehof(); }
    if (this.saveT > 0) { this.saveT -= dt; if (this.saveT <= 0 && !this.drag) this.world().then(saveDraft).catch(e => console.error('draft', e)); else if (this.saveT <= 0) this.saveT = .5; }
    this.updCursor();
    v.frame(dt, null, 'day');
    // far view over a big map: no fog, a far clipping plane
    const D = 16.4 * this.zoom, f = scene.fog as THREE.Fog;
    if (camera.far < D * 5 || camera.far > Math.max(120, D * 6)) { camera.far = Math.max(120, D * 5.5); camera.near = Math.max(.05, D * .004); camera.updateProjectionMatrix(); }
    f.near = Math.max(f.near, D * 2); f.far = Math.max(f.far, D * 5); envU.uFogNear.value = f.near; envU.uFogFar.value = f.far;
  }
  private curSize() { return this.mode === 'paint' ? this.size.paint : this.size.props; }
  private updCursor() {
    const g = this.hover, brush = this.mode === 'paint' || (this.mode === 'props' && (this.tool === 'scatter' || this.tool === 'erase'));
    this.ring.visible = !!g && brush && !(this.drag && this.drag.kind === 'gesture');
    if (g && brush) {
      this.ring.position.set(g.x, .07, g.z); this.ring.scale.setScalar(this.curSize());
      const red = (this.mode === 'props' && this.tool === 'erase') || (this.mode === 'paint' && (this.ptool === 'erase' || this.ptool === 'nograss'));
      (this.ring.material as THREE.MeshBasicMaterial).color.setHex(red ? 0xff9a80 : 0xfff2c0);
    }
    const m = this.mode === 'props' && this.tool === 'place' ? this.chosen[0] ?? '' : '';
    if (m !== this.ghostModel) {
      for (const c of [...this.ghost.children]) { this.ghost.remove(c); (c as THREE.InstancedMesh).dispose?.(); }
      this.ghostModel = m;
      if (m) { const d = MODEL.get(m)!; instance(this.ghost, m, [toInst({ m, x: 0, z: 0, ry: 0, s: 1, c: d.tint ? '#' + new THREE.Color().setHSL((d.tint[0][0] + d.tint[0][1]) / 2, (d.tint[1][0] + d.tint[1][1]) / 2, (d.tint[2][0] + d.tint[2][1]) / 2).getHexString() : undefined })], { shadow: false, scale: d.wind ?? 1 }); }
    }
    this.ghost.visible = !!m && !!g && !this.drag;
    if (m && g) { const d = MODEL.get(m)!; this.ghost.position.set(g.x, d.y ?? 0, g.z); this.ghost.rotation.y = this.ghostRy; this.ghost.scale.setScalar(d.s * this.ghostS); }
  }

  // ---------------- UI ----------------
  private ui() {
    const top = h('div'); top.id = 'ed-top';
    top.innerHTML = `<span id="ed-title">Welt-Editor</span>
      <span class="ed-seg"><button class="ed-btn" id="ed-m-logic">${IC.logic}<span class="lbl">Logik</span></button><button class="ed-btn" id="ed-m-props">${IC.obj}<span class="lbl">Objekte</span></button><button class="ed-btn" id="ed-m-paint">${IC.brush}<span class="lbl">Boden</span></button></span>
      <span id="ed-src"></span><span class="ed-grow"></span>
      <button class="ed-btn" id="ed-view" title="Was auf der Karte angezeigt wird">${IC.eye}<span class="lbl">Ansicht</span></button>
      <button class="ed-btn" id="ed-undo" title="Rückgängig (Strg+Z)">${IC.undo}</button><button class="ed-btn" id="ed-redo" title="Wiederholen (Strg+Y)">${IC.redo}</button>
      <button class="ed-btn" id="ed-play" title="Entwurf im Spiel ausprobieren">${IC.play}<span class="lbl">Im Spiel testen</span></button>
      <button class="ed-btn" id="ed-save">${IC.save}<span class="lbl">Speichern</span></button>`;
    document.body.append(top);
    const panel = h('div'); panel.id = 'ed-panel'; document.body.append(panel);
    const insp = h('div'); insp.id = 'ed-insp'; insp.hidden = true; document.body.append(insp);
    const box = h('div'); box.id = 'ed-box'; document.body.append(box);
    const toast = h('div'); toast.id = 'ed-toast'; document.body.append(toast);
    if (!isTouch) { const help = h('div'); help.id = 'ed-help'; document.body.append(help); }
    $('#ed-src').textContent = this.source;
    $('#ed-m-props').onclick = () => this.setMode('props'); $('#ed-m-paint').onclick = () => this.setMode('paint'); $('#ed-m-logic').onclick = () => this.setMode('logic');
    $('#ed-undo').onclick = () => this.undo(); $('#ed-redo').onclick = () => this.undo(true);
    $('#ed-play').onclick = () => this.playTest(); $('#ed-save').onclick = e => { e.stopPropagation(); this.saveMenu(); };
    $('#ed-view').onclick = e => { e.stopPropagation(); this.viewMenu(); };
    this.setMode(this.mode); this.updUndo();
  }
  setMode(m: Mode) {
    if (this.drawing) { this.drawing = null; this.endLogic(); }
    this.mode = m; this.cancelDrag();
    for (const k of ['props', 'paint', 'logic']) $('#ed-m-' + k).classList.toggle('on', m === k);
    if (m !== 'props') this.select([]);
    this.syncLogic(); this.panel(); this.updInsp();
  }
  setTool(t: Tool) {
    this.tool = t; if (t === 'place' && this.chosen.length > 1) this.chosen = [this.chosen[0]];
    if (t === 'place') this.nextGhost();
    if (t !== 'select') this.select([]);
    if (this.mode !== 'props') this.setMode('props'); else this.panel();
  }
  setSize(v: number) {
    if (this.mode === 'paint') this.size.paint = clamp(v, .1, 40); else this.size.props = clamp(v, .2, 40);
    const el = document.getElementById('ed-sl-size') as HTMLInputElement | null; if (el) el.dispatchEvent(new Event('sync'));
  }
  /** slider row: [label] [range] [value field] [reset] */
  private slider(label: string, o: SlOpt) {
    const row = h('div', 'ed-sl' + (o.reset !== undefined ? ' rs' : ''));
    row.innerHTML = `<span>${label}</span><input type="range" min="0" max="1000" step="1" ${o.id ? `id="${o.id}"` : ''}><input class="ed-val" type="text" inputmode="decimal">` + (o.reset !== undefined ? `<button class="ed-rs" title="Zurücksetzen">${IC.reset}</button>` : '');
    const r = row.querySelector('input[type=range]') as HTMLInputElement, val = row.querySelector('.ed-val') as HTMLInputElement;
    const fmt = o.fmt ?? ((v: number) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)) + (o.unit ?? ''));
    const to = (v: number) => o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) * 1000 : (v - o.min) / (o.max - o.min) * 1000;
    const from = (t: number) => { let v = o.log ? o.min * Math.pow(o.max / o.min, t / 1000) : o.min + (o.max - o.min) * t / 1000; if (o.step) v = Math.round(v / o.step) * o.step; return v; };
    const show = () => { const v = o.get(); r.value = String(to(v)); if (document.activeElement !== val) val.value = fmt(v); };
    show();
    r.oninput = () => { o.set(from(+r.value)); val.value = fmt(o.get()); };
    r.onchange = () => o.end?.();
    val.onchange = () => { const v = o.parse ? o.parse(val.value) : parseFloat(val.value.replace(',', '.').replace(/[^\d.+-]/g, '')); if (isFinite(v)) { o.set(clamp(v, Math.min(o.min, o.max), Math.max(o.min, o.max))); o.end?.(); } show(); };
    val.onfocus = () => val.select();
    r.addEventListener('sync', show);
    const rs = row.querySelector('.ed-rs') as HTMLButtonElement | null; if (rs) rs.onclick = () => { o.set(o.reset!); o.end?.(); show(); };
    return row;
  }
  private check(label: string, get: () => boolean, set: (v: boolean) => void) {
    const r = h('label', 'ed-ck', `<input type="checkbox" ${get() ? 'checked' : ''}><span>${label}</span>`);
    (r.querySelector('input') as HTMLInputElement).onchange = ev => { set((ev.target as HTMLInputElement).checked); };
    return r;
  }
  private toolRow(list: [string, string, string][], cur: string, set: (t: string) => void, cols = 4) {
    const tools = h('div', 'ed-tools'); tools.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (const [t, l, ic] of list) { const b = h('button', 'ed-btn' + (cur === t ? ' on' : ''), `${ic}<span>${l}</span>`); b.onclick = () => set(t); tools.append(b); }
    return tools;
  }
  private sec(title: string) { return h('div', 'ed-sec', title); }
  private panel() {
    const P = $('#ed-panel'); P.innerHTML = '';
    if (isTouch) { const hd = h('button', 'ed-handle'); hd.onclick = () => P.classList.toggle('min'); P.append(hd); }
    if (this.mode === 'props') this.propsPanel(P); else if (this.mode === 'paint') this.paintPanel(P); else this.logicPanel(P);
    const help = document.getElementById('ed-help');
    if (help) help.innerHTML = this.mode === 'paint'
      ? '<b>Linke Maus</b> malen · <b>Strg+Rad</b> / <b>[ ]</b> Pinselgröße<br><b>Rechte Maus</b> drehen · <b>Mitte</b>/<b>WASD</b> schieben · <b>Rad</b> zoomen · <b>Tab</b> Reiter'
      : this.mode === 'logic' ? (this.drawing ? '<b>Klick</b> setzt Punkte · <b>Klick auf den ersten Punkt</b> / <b>Enter</b> schließt die Fläche · <b>Esc</b> fertig'
        : this.ltool === 'walk' || this.ltool === 'build' ? '<b>Punkt ziehen</b> verschieben · <b>Klick auf die Linie</b> neuer Punkt · <b>Entf</b> Punkt löschen<br><b>Rechte Maus</b> drehen · <b>Rad</b> zoomen'
        : '<b>Klick</b> setzen / wählen · <b>Ziehen</b> verschieben · <b>Q/E</b> drehen · <b>Entf</b> löschen<br><b>Rechte Maus</b> drehen · <b>Ziehen ins Leere</b>/<b>WASD</b> schieben · <b>Rad</b> zoomen')
      : this.tool === 'select' ? '<b>Klick</b> wählen · <b>Shift</b> mehrere / Rahmen · <b>Ziehen</b> verschieben<br><b>Q/E</b> drehen · <b>+/−</b> Größe · <b>Entf</b> löschen · <b>Strg+D</b> kopieren<br><b>Rechte Maus</b> drehen · <b>Ziehen ins Leere</b>/<b>WASD</b> schieben · <b>Rad</b> zoomen'
      : this.tool === 'place' ? '<b>Klick</b> setzen · <b>Q/E</b> drehen · Zaun: <b>ziehen</b> für eine Reihe<br><b>Esc</b> zurück zu Auswählen · <b>Rechte Maus</b> Kamera drehen'
      : this.tool === 'scatter' ? '<b>Malen</b> sprüht die gewählten Objekte (mehrere anklicken = Mischung)<br><b>[ ]</b> Pinselgröße · <b>Rechte Maus</b> Kamera drehen'
      : '<b>Malen</b> entfernt Objekte · <b>Shift</b> nur die gewählten Arten<br><b>[ ]</b> Pinselgröße · <b>Rechte Maus</b> Kamera drehen';
  }
  private propsPanel(P: HTMLElement) {
    P.append(this.toolRow([['select', 'Auswählen', IC.select], ['place', 'Setzen', IC.place], ['scatter', 'Sprühen', IC.scatter], ['erase', 'Entfernen', IC.erase]], this.tool, t => this.setTool(t as Tool)));
    const sc = h('div', 'ed-scroll'); P.append(sc);
    if (this.tool !== 'select') {
      const sl = h('div', 'ed-sliders');
      if (this.tool === 'scatter' || this.tool === 'erase') sl.append(this.slider('Pinsel', { min: .2, max: 40, log: true, get: () => this.size.props, set: v => this.size.props = v, unit: ' m', id: 'ed-sl-size' }));
      if (this.tool === 'scatter') {
        sl.append(this.slider('Dichte', { min: .02, max: 40, log: true, get: () => this.density, set: v => this.density = v, unit: '/m²', reset: .6 }));
        sl.append(this.check('Überlappen erlaubt', () => this.overlap, v => this.overlap = v));
      }
      if (this.tool === 'scatter' || this.tool === 'place') {
        sl.append(this.slider('Größe', { min: .1, max: 6, log: true, get: () => this.scaleMul, set: v => { this.scaleMul = v; this.nextGhost(); }, fmt: v => '×' + v.toFixed(2), reset: 1 }));
        sl.append(this.slider('Streuung', { min: 0, max: .6, get: () => this.scaleVar, set: v => { this.scaleVar = v; }, fmt: v => '±' + Math.round(v * 100) + ' %', reset: .15 }));
        const rr = this.tool === 'scatter' ? () => this.scatterRotRandom : () => this.placeRotRandom;
        sl.append(this.check('Drehung zufällig', rr, v => { if (this.tool === 'scatter') this.scatterRotRandom = v; else this.placeRotRandom = v; this.nextGhost(); this.panel(); }));
        if (!rr()) sl.append(this.slider('Drehung', { min: 0, max: 360, step: 1, get: () => this.tool === 'scatter' ? this.scatterRot : this.placeRot, set: v => { if (this.tool === 'scatter') this.scatterRot = v; else { this.placeRot = v; this.ghostRy = v * DEG; } }, fmt: v => Math.round(v) + '°', reset: 0 }));
      }
      if (this.tool === 'erase') sl.append(this.check('Nur gewählte Arten', () => this.eraseOnly, v => this.eraseOnly = v));
      sc.append(sl);
    }
    const cats = h('div', 'ed-cats');
    for (const c of CATS) { const b = h('button', 'ed-chip' + (c === this.cat ? ' on' : ''), c); b.onclick = () => { this.cat = c; this.panel(); }; cats.append(b); }
    sc.append(cats);
    const grid = h('div', 'ed-grid');
    for (const d of MODELS.filter(d => d.cat === this.cat)) {
      const it = h('button', 'ed-item' + (this.chosen.includes(d.m) ? ' on' : ''), `<img alt="" src="${this.thumbs.get(d.m) ?? ''}"><span>${d.label}</span>`);
      it.onclick = () => this.choose(d); grid.append(it);
    }
    sc.append(grid);
  }
  private paintPanel(P: HTMLElement) {
    P.append(this.toolRow([['paint', 'Malen', IC.paint], ['erase', 'Radieren', IC.erase], ['grass', 'Wildgras', IC.grass], ['nograss', 'Gras weg', IC.nograss]], this.ptool, t => { this.ptool = t as PTool; this.panel(); }));
    const sc = h('div', 'ed-scroll'); P.append(sc);
    const sl = h('div', 'ed-sliders');
    sl.append(this.slider('Größe', { min: .1, max: 40, log: true, get: () => this.size.paint, set: v => this.size.paint = v, unit: ' m', id: 'ed-sl-size' }));
    sl.append(this.slider('Stärke', { min: .01, max: 1, log: true, get: () => this.strength, set: v => this.strength = v, fmt: v => Math.round(v * 100) + ' %', reset: .5 }));
    if (this.ptool === 'grass') {
      sl.append(this.slider('Dichte', { min: .05, max: 3, log: true, get: () => this.grassDens, set: v => this.grassDens = v, fmt: v => Math.round(v * 100) + ' %', reset: 1 }));
      sl.append(this.slider('Höhe', { min: .3, max: 3, log: true, get: () => this.grassH, set: v => this.grassH = v, fmt: v => '×' + v.toFixed(2), reset: 1 }));
    }
    sl.append(this.slider('Härte', { min: 0, max: .95, get: () => this.hard, set: v => this.hard = v, fmt: v => Math.round(v * 100) + ' %', reset: .35 }));
    sl.append(this.slider('Abstand', { min: .03, max: 2, log: true, get: () => this.spacing, set: v => this.spacing = v, fmt: v => Math.round(v * 100) + ' %', reset: .2 }));
    sl.append(this.slider('Streuung', { min: 0, max: 2, get: () => this.jitter, set: v => this.jitter = v, fmt: v => Math.round(v * 100) + ' %', reset: 0 }));
    sl.append(this.check('Drehung zufällig', () => this.rotRandom, v => { this.rotRandom = v; this.panel(); }));
    if (!this.rotRandom) sl.append(this.slider('Drehung', { min: 0, max: 360, step: 1, get: () => this.rotAngle, set: v => this.rotAngle = v, fmt: v => Math.round(v) + '°', reset: 0 }));
    sc.append(sl);
    // brush shapes
    sc.append(this.sec('Pinselform'));
    const shapes = h('div', 'ed-shapes');
    for (const b of this.brushes) { const it = h('button', 'ed-shape' + (b.id === this.shape ? ' on' : ''), `<img alt="" src="${b.thumb}"><span>${b.label}</span>`); it.title = b.label; it.onclick = () => { this.shape = b.id; this.panel(); }; shapes.append(it); }
    sc.append(shapes);
    if (this.ptool === 'paint' || this.ptool === 'erase') {
      // layers (top first), base at the bottom
      sc.append(this.sec('Ebenen'));
      const box = h('div', 'ed-layers');
      const info = (t: string) => this.terrains.find(x => x.id === t);
      [...this.paint.layers].reverse().forEach(L => {
        const row = h('div', 'ed-layer' + (L.id === this.activeLayer && !this.baseMode ? ' on' : '') + (L.vis ? '' : ' off'));
        row.innerHTML = `<button class="vis" title="Ein/aus">${L.vis ? IC.eye : IC.eyeOff}</button><span class="sw" style="background-image:url(${swatchUrl(L.tex)})"></span><span class="nm">${info(L.tex)?.label ?? L.tex}</span>
          <button class="up" title="Nach oben">${IC.arrowUp}</button><button class="dn" title="Nach unten">${IC.arrowDown}</button><button class="del" title="Ebene löschen">${IC.trash}</button>`;
        row.onclick = () => { this.activeLayer = L.id; this.baseMode = false; this.texChoice = L.tex; this.panel(); };
        const q = (s: string) => row.querySelector(s) as HTMLButtonElement;
        q('.vis').onclick = ev => { ev.stopPropagation(); this.layerOp(() => { L.vis = !L.vis; }); };
        q('.up').onclick = ev => { ev.stopPropagation(); const a = this.paint.layers, i = a.indexOf(L); if (i < a.length - 1) this.layerOp(() => { a.splice(i, 1); a.splice(i + 1, 0, L); }); };
        q('.dn').onclick = ev => { ev.stopPropagation(); const a = this.paint.layers, i = a.indexOf(L); if (i > 0) this.layerOp(() => { a.splice(i, 1); a.splice(i - 1, 0, L); }); };
        q('.del').onclick = ev => { ev.stopPropagation(); this.layerOp(() => { this.paint.layers = this.paint.layers.filter(o => o !== L); if (this.activeLayer === L.id) this.activeLayer = this.paint.layers.slice(-1)[0]?.id ?? 0; }); this.toast('Ebene gelöscht (Rückgängig geht)'); };
        box.append(row);
      });
      const base = h('div', 'ed-layer base' + (this.baseMode ? ' on' : ''), `<span class="vis"></span><span class="sw" style="background-image:url(${swatchUrl(this.paint.base)})"></span><span class="nm">Grundboden: ${info(this.paint.base)?.label ?? this.paint.base}</span><span class="hint">${this.baseMode ? 'Textur wählen' : 'ändern'}</span>`);
      base.onclick = () => { this.baseMode = !this.baseMode; this.panel(); };
      box.append(base);
      const add = h('button', 'ed-btn', `${IC.plus}<span>Neue Ebene</span>`); add.onclick = () => this.addLayer(this.layer?.tex ?? this.texChoice);
      const fill = h('button', 'ed-btn', `${IC.paint}<span>Ebene füllen</span>`); fill.onclick = () => { const L = this.layer; if (!L) return; const before = L.m.slice(), R = this.paint.full(); this.paint.fill(L, 1); this.push({ k: 'plane', layer: L.id, r: R, before, after: L.m.slice() }); this.view.world.paintChanged(); };
      const row = h('div', 'ed-row'); row.append(add, fill); box.append(row);
      sc.append(box);
      if (this.ptool === 'paint' || this.baseMode) {
        sc.append(this.sec(this.baseMode ? 'Grundboden wählen' : 'Textur (neue Ebene, wenn die aktive schon bemalt ist)'));
        const tc = h('div', 'ed-cats'), cats = ['Alle', ...new Set(this.terrains.map(t => t.cat))];
        for (const c of cats) { const b = h('button', 'ed-chip' + (c === this.tcat ? ' on' : ''), c); b.onclick = () => { this.tcat = c; this.panel(); }; tc.append(b); }
        if (cats.length > 2) sc.append(tc);
        const grid = h('div', 'ed-grid');
        const cur = this.baseMode ? this.paint.base : this.layer?.tex;
        for (const t of this.terrains.filter(t => this.tcat === 'Alle' || t.cat === this.tcat)) {
          const it = h('button', 'ed-item' + (t.id === cur ? ' on' : ''), `<div class="sw" style="background-image:url(${swatchUrl(t.id)})"></div><span>${t.label}</span>`);
          it.onclick = () => this.chooseTex(t.id); grid.append(it);
        }
        sc.append(grid);
      }
    }
  }
  private logicPanel(P: HTMLElement) {
    const tools: [string, string, string][] = [['select', 'Auswählen', IC.select], ['walk', 'Begehbar', IC.spline], ['build', 'Baubereich', IC.spline], ['field', 'Feld', IC.hex],
      ['spawn', 'Spawn', IC.spawn], ['house', 'Haupthaus', IC.house], ['well', 'Brunnen', IC.well], ['basket', 'Korb', IC.basket], ['bush', 'Blaubeeren', IC.bush], ['tree', 'Obstbaum', IC.tree], ['bramble', 'Brombeere', IC.bramble]];
    P.append(this.toolRow(tools, this.ltool, t => { if (this.drawing) { this.drawing = null; this.endLogic(); } this.ltool = t as LTool; this.lsel = null; this.syncLogic(); this.updInsp(); this.panel(); }, 4));
    const sc = h('div', 'ed-scroll'); P.append(sc);
    const sl = h('div', 'ed-sliders');
    sl.append(this.slider('Kartengröße', { min: MAP_MIN, max: MAP_MAX, step: 1, get: () => this.logic.size, set: v => { this.logic.size = Math.round(v); }, end: () => { const v = this.logic.size; this.logic.size = this.paint.extent; this.setMapSize(v); }, fmt: v => Math.round(v) + ' m', reset: 128 }));
    if (this.ltool === 'walk' || this.ltool === 'build') {
      const k = this.ltool, b = h('button', 'ed-btn' + (this.drawing === k ? ' on' : ''), this.drawing === k ? `${IC.check}<span>Fertig</span>` : `${IC.draw}<span>Neu zeichnen</span>`);
      b.onclick = () => { if (this.drawing === k) { this.drawing = null; this.endLogic(); } else { this.beginLogic(); this.logic[k] = []; this.drawing = k; this.lsel = null; this.syncLogic(); } this.panel(); };
      const row = h('div', 'ed-row'); row.append(b); sl.append(row);
    }
    if (this.ltool === 'field' || this.ltool === 'select') sl.append(this.check('Felder am Sechseck-Raster ausrichten', () => this.snap, v => this.snap = v));
    sc.append(sl);
    sc.append(this.sec('Anzeigen'));
    const vis = h('div', 'ed-sliders');
    vis.append(this.check('Grenzen', () => this.show.bounds, v => { this.show.bounds = v; this.syncLogic(); }), this.check('Felder', () => this.show.fields, v => { this.show.fields = v; this.syncLogic(); }),
      this.check('Spawns', () => this.show.spawns, v => { this.show.spawns = v; this.syncLogic(); }), this.check('Namen und Nummern', () => this.show.labels, v => { this.show.labels = v; this.syncLogic(); }));
    sc.append(vis);
    const L = this.logic, cnt = (k: ObjKind) => L.objects.filter(o => o.k === k).length;
    sc.append(h('div', 'ed-stats', `${L.fields.length} Felder · ${L.spawns.length} Spawns · ${cnt('tree')} Obstbäume · ${cnt('bramble')} Brombeeren`));
    const warn = h('div', 'ed-warn'); warn.id = 'ed-warn'; sc.append(warn); this.updWarn();
  }
  private viewMenu() {
    document.querySelector('.ed-menu')?.remove();
    const m = h('div', 'ed-menu');
    const it = (k: keyof Show, l: string) => { const r = this.check(l, () => this.show[k], v => { this.show[k] = v; this.syncLogic(); if (this.mode === 'logic') this.panel(); }); m.append(r); };
    it('bounds', 'Grenzen (begehbar, Baubereich)'); it('fields', 'Feldplätze'); it('spawns', 'Spawns'); it('labels', 'Namen und Nummern');
    document.body.append(m);
    setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target as Node)) { m.remove(); removeEventListener('pointerdown', off); } }), 0);
  }
  private choose(d: ModelDef) {
    if (this.tool === 'scatter' || this.tool === 'erase') {
      const i = this.chosen.indexOf(d.m); if (i >= 0) this.chosen.splice(i, 1); else this.chosen.push(d.m);
    } else { this.chosen = [d.m]; if (this.tool === 'select') this.tool = 'place'; this.nextGhost(); }
    this.panel();
  }
  updInsp() {
    const el = $('#ed-insp');
    if (this.mode === 'logic') { this.logicInsp(el); return; }
    const sel = [...this.sel].filter(p => this.list.includes(p));
    el.hidden = !sel.length || this.mode !== 'props'; if (el.hidden) return;
    const names = new Set(sel.map(p => MODEL.get(p.m)?.label ?? p.m)), f = sel[0], d0 = MODEL.get(f.m);
    el.innerHTML = `<h3>${sel.length === 1 ? [...names][0] : sel.length + ' Objekte'}</h3>`;
    // absolute values (of the first selected object), set on all selected; ↺ = normal
    let open = false;
    const edit = (apply: (p: PropRec) => void) => { if (!open) { this.beginProps(); open = true; } for (const p of sel) apply(p); this.touch(...sel.map(p => p.m)); this.syncRings(); };
    const end = () => { if (open) { open = false; this.endProps(); } };
    const def = (p: PropRec) => MODEL.get(p.m)?.s ?? 1;
    el.append(this.slider('Größe', { min: .05, max: 8, log: true, get: () => f.s / def(f), set: v => edit(p => p.s = def(p) * v), fmt: v => '×' + v.toFixed(2), reset: 1, end }));
    el.append(this.slider('Drehung', { min: 0, max: 360, step: 1, get: () => ((-f.ry / DEG) % 360 + 360) % 360, set: v => edit(p => p.ry = -v * DEG), fmt: v => Math.round(v) + '°', reset: 0, end }));
    el.append(this.slider('Neigen', { min: -40, max: 40, step: .5, get: () => (f.tx ?? 0) / DEG, set: v => edit(p => p.tx = v * DEG), fmt: v => v.toFixed(1) + '°', reset: 0, end }));
    el.append(this.slider('Höhe', { min: -2, max: 2, step: .01, get: () => f.y ?? d0?.y ?? 0, set: v => edit(p => p.y = v), fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' m', reset: d0?.y ?? 0, end }));
    const row = h('div', 'row');
    const btn = (ic: string, l: string, fn: () => void, cls = '') => { const b = h('button', 'ed-btn ' + cls, `${ic}${l}`); b.onclick = fn; row.append(b); };
    btn(IC.dice, 'Farbe', () => { this.beginProps(); for (const p of sel) this.recolor(p); this.touch(...sel.map(p => p.m)); this.endProps(); });
    btn(IC.level, 'Gerade', () => { this.beginProps(); for (const p of sel) { delete p.tx; delete p.tz; delete p.y; } this.touch(...sel.map(p => p.m)); this.endProps(); this.updInsp(); });
    btn(IC.dup, 'Kopie', () => this.dupSel());
    btn(IC.trash, 'Löschen', () => this.deleteSel(), 'warn');
    el.append(row);
  }
  private logicInsp(el: HTMLElement) {
    const s = this.lsel; el.hidden = !s; if (!s) return;
    const L = this.logic;
    const title = s.k === 'walk' ? `Begehbarer Bereich, Punkt ${s.i + 1}` : s.k === 'build' ? `Baubereich, Punkt ${s.i + 1}` : s.k === 'field' ? `Feld ${s.i + 1}` : s.k === 'spawn' ? `Spawn ${s.i + 1}` : s.k === 'house' ? 'Haupthaus' : OBJ_LABEL[L.objects[s.i].k];
    el.innerHTML = `<h3>${title}</h3>`;
    let open = false;
    const edit = (f: () => void) => { if (!open) { this.beginLogic(); open = true; } f(); this.syncLogic(); };
    const end = () => { if (open) { open = false; this.endLogic(); } };
    if (s.k === 'spawn') el.append(this.slider('Häufigkeit', { min: 0, max: 5, step: .1, get: () => L.spawns[s.i].w ?? 1, set: v => edit(() => { L.spawns[s.i].w = v; }), fmt: v => '×' + v.toFixed(1), reset: 1, end }));
    if (s.k === 'house' || s.k === 'obj') {
      const p = (s.k === 'house' ? L.house : L.objects[s.i]) as Pt & { rot?: number };
      el.append(this.slider('Drehung', { min: 0, max: 360, step: 1, get: () => p.rot ?? 0, set: v => edit(() => { p.rot = v; }), fmt: v => Math.round(v) + '°', reset: 0, end }));
    }
    const row = h('div', 'row');
    const btn = (ic: string, l: string, fn: () => void, cls = '') => { const b = h('button', 'ed-btn ' + cls, `${ic}${l}`); b.onclick = fn; row.append(b); };
    if (s.k === 'field' || s.k === 'spawn') {
      const arr = s.k === 'field' ? L.fields : L.spawns;
      btn(IC.arrowUp, 'Früher', () => { if (s.i > 0) { this.beginLogic(); [arr[s.i - 1], arr[s.i]] = [arr[s.i], arr[s.i - 1]]; s.i--; this.endLogic(); this.updInsp(); } });
      btn(IC.arrowDown, 'Später', () => { if (s.i < arr.length - 1) { this.beginLogic(); [arr[s.i + 1], arr[s.i]] = [arr[s.i], arr[s.i + 1]]; s.i++; this.endLogic(); this.updInsp(); } });
    }
    if (s.k !== 'house') btn(IC.trash, 'Löschen', () => this.deleteLogicSel(), 'warn');
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
    it(IC.plus, 'Neue leere Welt (Trockenrasen)', () => this.resetTo('new'));
    it(IC.dice, 'Vorlage: bisheriger Hof', () => this.resetTo('old'));
    document.body.append(m);
    setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target as Node)) { m.remove(); removeEventListener('pointerdown', off); } }), 0);
  }
  /** JSON with one object per line (readable diffs in git) */
  async fileText() {
    const f = await this.world(), L = f.logic!;
    const arr = (a: unknown[]) => '[' + a.map(p => JSON.stringify(p)).join(', ') + ']';
    const logic = `{"size":${L.size},\n  "walk":${arr(L.walk)},\n  "build":${arr(L.build)},\n  "fields":${arr(L.fields)},\n  "spawns":${arr(L.spawns)},\n  "house":${JSON.stringify(L.house)},\n  "objects":${arr(L.objects)}}`;
    const props = '[\n' + (f.props ?? []).map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n]';
    return `{"version":2,"saved":${JSON.stringify(f.saved)},\n"logic":${logic},\n"paint":${JSON.stringify(f.paint)},\n"props":${props}}\n`;
  }
  async download() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await this.fileText()], { type: 'application/json' })); a.download = 'welt.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); this.toast('welt.json heruntergeladen');
  }
  private openFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; try { await this.load(await decodeWorld(JSON.parse(await f.text()) as WorldFile)); this.toast(f.name + ' geladen'); } catch (e) { this.toast('Datei kaputt: ' + (e as Error).message, 4000); } };
    inp.click();
  }
  /** replace the whole world (undo goes back) */
  async load(w: World | null, start?: { logic: Logic; props: PropRec[]; paint: WorldPaint }) {
    const s = start ?? this.fromWorld(w);
    const before = { paint: this.paint, logic: JSON.stringify(this.logic), props: JSON.stringify(this.list) };
    this.list = s.props; this.logic = s.logic; this.sel.clear(); this.lsel = null;
    this.setPaint(s.paint); this.activeLayer = s.paint.layers.slice(-1)[0]?.id ?? 0;
    this.applyProps(); this.logicChanged(); this.rehof(); this.panel(); this.updInsp();
    this.push({ k: 'world', before, after: { paint: s.paint, logic: JSON.stringify(this.logic), props: JSON.stringify(this.list) } });
  }
  private async resetTo(what: 'game' | 'new' | 'old') {
    if (what === 'game') { const f = await fetchWorldFile(); await this.load(f ? await decodeWorld(f) : null); await saveDraft(null); this.source = f ? 'Stand im Spiel' : 'Neue Welt'; $('#ed-src').textContent = this.source; this.saveT = 0; this.toast('Entwurf verworfen'); }
    else if (what === 'new') { await this.load(null); this.toast('Neue leere Welt (Rückgängig geht)'); }
    else { await this.load(null, this.template()); this.toast('Bisheriger Hof als Vorlage (Rückgängig geht)'); }
  }
  private async playTest() {
    const W = this.warnings().filter(t => /Spawn|fehlt/.test(t)); if (W.length) this.toast(W[0], 3500);
    await saveDraft(await this.world()); window.open(BASE + 'index.html?welt=entwurf', '_blank');
  }
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
