// What the "Logik" tab of the world editor shows in the world: the two boundary splines with their control points, the
// hexagon field spots (as the beds the game draws), numbered raccoon spawns (red circles with a raccoon), the main house
// and the interaction objects (well, basket, blueberry bush, fruit trees, brambles) with name labels.
import * as THREE from 'three';
import { buildBuilding, BuildingView } from '../farm/view/buildings';
import { buildBed } from '../farm/view/beds';
import { buildPlant } from '../view/models';
import { natureMesh } from '../view/nature';
import { ICONS } from './raccoon';
import { Logic, ObjKind, Pt, inHex, inPoly, splinePoly } from '../world/logic';

export type Sel = { k: 'walk' | 'build'; i: number } | { k: 'field' | 'spawn' | 'obj'; i: number } | { k: 'house' };
export const OBJ_LABEL: Record<ObjKind | 'house', string> = { house: 'Haupthaus', well: 'Brunnen', basket: 'Korb', bush: 'Blaubeerbusch', tree: 'Obstbaum', bramble: 'Brombeere' };
export interface Show { bounds: boolean; fields: boolean; spawns: boolean; labels: boolean }

const COL = { walk: 0x7fd0ff, build: 0xe3b964, bad: 0xff6a50, sel: 0xffffff };
const top = (m: THREE.Material) => { Object.assign(m, { depthTest: false, depthWrite: false, transparent: true, toneMapped: false }); return m; };
function label(text: string, scale = 1, color = '#fff2c0') {
  const cv = document.createElement('canvas'), g = cv.getContext('2d')!, f = 'bold 44px Alegreya Sans, system-ui, sans-serif';
  g.font = f; const w = Math.ceil(g.measureText(text).width) + 36; cv.width = w; cv.height = 64;
  g.font = f; g.fillStyle = 'rgba(12,10,6,.72)'; g.beginPath(); g.roundRect(0, 4, w, 56, 18); g.fill();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(top(new THREE.SpriteMaterial({ map: t })) as THREE.SpriteMaterial); s.scale.set(w / 64 * .55 * scale, .55 * scale, 1); s.renderOrder = 998; return s;
}
/** red spawn disc: transparent red fill, ring, raccoon, number badge */
function spawnTex(n: number, img: HTMLImageElement | null) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(210,40,30,.38)'; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fill();
  g.lineWidth = 12; g.strokeStyle = '#e8321e'; g.stroke();
  if (img?.complete) g.drawImage(img, 48, 40, 160, 160);
  g.fillStyle = '#e8321e'; g.beginPath(); g.arc(200, 200, 44, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 200, 203);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ribbon(poly: Pt[], w: number, color: number) {
  const pos: number[] = [], idx: number[] = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n], p = poly[i], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
    pos.push(p.x - nx, .06, p.z - nz, p.x + nx, .06, p.z + nz);
    const j = (i + 1) % n; idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, top(new THREE.MeshBasicMaterial({ color, opacity: .85, side: THREE.DoubleSide }))); m.renderOrder = 995; return m;
}
function hexLine(H: number, color: number) {
  const pts: THREE.Vector3[] = []; for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; pts.push(new THREE.Vector3(Math.cos(a) * H, .05, Math.sin(a) * H)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), top(new THREE.LineBasicMaterial({ color, opacity: .9 }))); l.renderOrder = 994; return l;
}

export class LogicOverlay {
  root = new THREE.Group();
  private bounds = new THREE.Group(); private fields = new THREE.Group(); private spawns = new THREE.Group(); private objs = new THREE.Group(); private labels = new THREE.Group();
  private beds: THREE.Group[] = [];
  private house: BuildingView | null = null; private well: BuildingView | null = null;
  private objCache = new Map<string, THREE.Object3D[]>();
  private spawnTexs: THREE.CanvasTexture[] = [];
  private img: HTMLImageElement | null = null;
  private selRing: THREE.Mesh;
  private dot = new THREE.CircleGeometry(.42, 20);
  constructor(parent: THREE.Object3D, private H: number) {
    this.root.add(this.bounds, this.fields, this.spawns, this.objs, this.labels); parent.add(this.root);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(.9, 1.05, 40), top(new THREE.MeshBasicMaterial({ color: COL.sel, side: THREE.DoubleSide })));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.renderOrder = 999; this.root.add(this.selRing);
    const img = new Image(); img.onload = () => { this.img = img; for (const [i, t] of this.spawnTexs.entries()) { const n = spawnTex(i + 1, img); t.image = n.image; t.needsUpdate = true; } };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICONS.raccoon);
  }
  /** free GPU memory of rebuilt helpers (shared dot geometry and spawn textures stay) */
  private drop(o: THREE.Object3D, keepMaps = false) {
    o.traverse(c => {
      const m = c as THREE.Mesh; if (!m.geometry && !m.material) return;
      if (m.geometry && m.geometry !== this.dot && !(c as THREE.Sprite).isSprite) m.geometry.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) { const map = (mat as THREE.MeshBasicMaterial).map; if (map && !keepMaps) map.dispose(); mat.dispose(); }
    });
  }
  private wipe(g: THREE.Object3D, keepMaps = false) { for (const c of [...g.children]) { this.drop(c, keepMaps); g.remove(c); } }
  /** redraw everything from the logic (cheap: a few dozen objects) */
  sync(L: Logic, show: Show, sel: Sel | null, edit: 'walk' | 'build' | null) {
    const buildPoly = splinePoly(L.build);
    // boundaries
    this.wipe(this.bounds);
    for (const k of ['walk', 'build'] as const) {
      const poly = splinePoly(L[k]); if (poly.length < 3) continue;
      this.bounds.add(ribbon(poly, edit === k ? .32 : .2, COL[k]));
      L[k].forEach((p, i) => {
        const on = sel && sel.k === k && sel.i === i, m = new THREE.Mesh(this.dot, top(new THREE.MeshBasicMaterial({ color: on ? COL.sel : COL[k], opacity: edit === k || on ? 1 : .55 })));
        m.rotation.x = -Math.PI / 2; m.position.set(p.x, .07, p.z); m.scale.setScalar(edit === k ? 1 : .6); m.renderOrder = 996; this.bounds.add(m);
      });
    }
    this.bounds.visible = show.bounds || !!edit;
    // fields: the bed the game draws (unploughed look) + hex outline + number
    while (this.beds.length < L.fields.length) {
      const H = this.H, spots: [number, number][] = Array.from({ length: 6 }, (_, k) => { const a = k / 6 * Math.PI * 2 + .5; return [Math.cos(a) * H * .5, Math.sin(a) * H * .5]; });
      const b = buildBed(H, spots), e = (b.children[0] as THREE.Mesh), w = (b.children[1] as THREE.Mesh);
      const em = (e.material as THREE.MeshStandardMaterial).clone(); em.opacity = .6; em.color.setHex(0xd8c8a0); e.material = em; (w.material as THREE.Material).visible = false;
      const g = new THREE.Group(); g.add(b); this.beds.push(g);
    }
    this.fields.clear();
    L.fields.forEach((p, i) => {
      const g = this.beds[i]; g.position.set(p.x, 0, p.z);
      const bad = !inPoly(buildPoly, p.x, p.z) || L.fields.some((q, j) => j !== i && Math.hypot(q.x - p.x, q.z - p.z) < this.H * 1.7);
      while (g.children.length > 1) { this.drop(g.children[1]); g.remove(g.children[1]); }
      g.add(hexLine(this.H * 1.02, bad ? COL.bad : 0xfff2c0));
      if (show.labels) { const s = label(String(i + 1), .8); s.position.set(0, .5, 0); g.add(s); }
      this.fields.add(g);
    });
    this.fields.visible = show.fields;
    // spawns
    for (const c of [...this.spawns.children]) { const keep = (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).map ? this.spawnTexs.includes(((c as THREE.Mesh).material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture) : false; this.drop(c, keep); this.spawns.remove(c); }
    L.spawns.forEach((p, i) => {
      if (!this.spawnTexs[i]) this.spawnTexs[i] = spawnTex(i + 1, this.img);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), top(new THREE.MeshBasicMaterial({ map: this.spawnTexs[i] })));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, .08, p.z); m.renderOrder = 997; this.spawns.add(m);
      const w = p.w ?? 1; if (w !== 1) { const s = label('×' + w.toFixed(1), .7, '#ffb0a0'); s.position.set(p.x, .9, p.z + 1.2); this.spawns.add(s); }
    });
    this.spawns.visible = show.spawns;
    // house + objects (they are real things in the game: always visible)
    if (!this.house) { this.house = buildBuilding('house', { x: 0, z: 0, w: 8.4, d: 5.2 }, 0); this.house.site.visible = false; this.objs.add(this.house.root); }
    this.house.root.position.set(L.house.x, 0, L.house.z); this.house.root.rotation.y = -L.house.rot * Math.PI / 180;
    const well = L.objects.find(o => o.k === 'well');
    if (well && !this.well) { this.well = buildBuilding('well', { x: 0, z: 0, r: .9 }, 0); if (this.well.broken) this.well.broken.visible = false; this.objs.add(this.well.root); }
    if (this.well) { this.well.root.visible = !!well; if (well) { this.well.root.position.set(well.x, 0, well.z); this.well.root.rotation.y = -(well.rot ?? 0) * Math.PI / 180; } }
    const used = new Map<string, number>();
    for (const list of this.objCache.values()) for (const o of list) o.visible = false;
    L.objects.forEach(o => {
      if (o.k === 'well') return;
      const n = used.get(o.k) ?? 0; used.set(o.k, n + 1);
      let list = this.objCache.get(o.k); if (!list) this.objCache.set(o.k, list = []);
      if (!list[n]) { const m = this.make(o.k); if (!m) return; list[n] = m; this.objs.add(m); }
      const m = list[n]; m.visible = true; m.position.set(o.x, 0, o.z); m.rotation.y = -(o.rot ?? 0) * Math.PI / 180;
    });
    this.wipe(this.labels);
    if (show.labels) {
      const add = (t: string, x: number, z: number, y: number) => { const s = label(t, .9); s.position.set(x, y, z); this.labels.add(s); };
      add(OBJ_LABEL.house, L.house.x, L.house.z, 5.6);
      for (const o of L.objects) add(OBJ_LABEL[o.k], o.x, o.z, o.k === 'tree' ? 4.2 : o.k === 'basket' ? 1.1 : 2.2);
    }
    // selection
    const sp = sel ? this.selPos(L, sel) : null;
    this.selRing.visible = !!sp; if (sp) { this.selRing.position.set(sp.x, .09, sp.z); this.selRing.scale.setScalar(sp.r); }
  }
  selPos(L: Logic, s: Sel): { x: number; z: number; r: number } | null {
    switch (s.k) {
      case 'walk': case 'build': { const p = L[s.k][s.i]; return p ? { ...p, r: .7 } : null; }
      case 'field': { const p = L.fields[s.i]; return p ? { ...p, r: this.H * 1.15 } : null; }
      case 'spawn': { const p = L.spawns[s.i]; return p ? { ...p, r: 1.5 } : null; }
      case 'obj': { const p = L.objects[s.i]; return p ? { ...p, r: p.k === 'tree' ? 1.6 : 1.1 } : null; }
      case 'house': return { ...L.house, r: 5.2 };
    }
  }
  /** is the point on a field (hex) */
  fieldAt(L: Logic, x: number, z: number) { return L.fields.findIndex(p => inHex(p, this.H * 1.05, x, z)); }
  private make(k: ObjKind): THREE.Object3D | null {
    if (k === 'tree') return natureMesh('CommonTree_1', .55, new THREE.Color().setHSL(.27, .6, .4));
    if (k === 'bramble') { const g = natureMesh('Bush_Common', .75, new THREE.Color().setHSL(.3, .45, .26)); if (!g) return null; for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a1030, roughness: .4 })); const a = i * 2.4; b.position.set(Math.cos(a) * .5, .5 + (i % 3) * .2, Math.sin(a) * .5); g.add(b); } return g; }
    if (k === 'bush') { const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: .85, flatShading: true }), head = new THREE.MeshStandardMaterial({ color: 0x5a3a20 }); const bp = buildPlant('blue', { leaf, head }); bp.g.scale.setScalar(1.25); return bp.g; }
    if (k === 'basket') {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x9a6a38, roughness: .9, flatShading: true });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(.34, .26, .24, 12, 1, true), m); c.position.y = .12; c.castShadow = true;
      const b = new THREE.Mesh(new THREE.CircleGeometry(.26, 12), m); b.rotation.x = -Math.PI / 2; b.position.y = .01; g.add(c, b); return g;
    }
    return null;
  }
}
