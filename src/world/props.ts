// Placed objects of the world (forest, bushes, plants, stones, fences): one InstancedMesh per model and material,
// rebuilt per model when something changes (editor). Picking maps a ray hit back to its PropRec.
import * as THREE from 'three';
import { Inst, hasModel, instance } from '../view/nature';
import { MODEL } from './catalog';
import type { PropRec } from './data';
import { Blob, blobMesh } from '../view/blobShadow';

const col = new Map<string, THREE.Color>();
const color = (c: string) => { let v = col.get(c); if (!v) col.set(c, v = new THREE.Color(c)); return v; };
export function toInst(p: PropRec): Inst {
  const d = MODEL.get(p.m);
  return { x: p.x, z: p.z, y: p.y ?? d?.y ?? 0, s: p.s, ry: p.ry, tx: p.tx ?? 0, tz: p.tz ?? 0, col: p.c ? color(p.c) : undefined, shade: p.sh ?? 1 };
}

/** forest tiles (performance plan 2.2): one InstancedMesh per model, material AND tile, each with a tight bounding sphere,
 *  so three.js culls the tiles outside the view and outside the shadow camera (before: one mesh per model for the whole map) */
export const PROP_TILE = 16;
/** far versions of the forest models (the game turns it on; the world editor shows the full models) */
export const propOpts = { lod: false };
const tileOf = (p: PropRec) => Math.floor(p.x / PROP_TILE) + ',' + Math.floor(p.z / PROP_TILE);

export class PropLayer {
  root = new THREE.Group();
  list: PropRec[] = [];
  /** key = model@tile */
  private groups = new Map<string, { m: string; recs: PropRec[]; meshes: THREE.InstancedMesh[]; far: THREE.InstancedMesh[]; cx: number; cz: number; lod: number }>();
  private dirty = new Set<string>();
  /** soft contact shadows under the props, one mesh per tile (blobShadow.ts) */
  private blobRoot = new THREE.Group(); private blobR = new Map<string, number>();
  constructor(parent: THREE.Object3D) { this.root.name = 'props'; this.root.matrixAutoUpdate = false; parent.add(this.root); this.blobRoot.name = 'blobs'; parent.add(this.blobRoot); }
  set(list: PropRec[]) {
    this.list = list;
    for (const g of this.groups.values()) this.dirty.add(g.m);
    for (const p of list) this.dirty.add(p.m);
    this.flush();
  }
  touch(m: string) { this.dirty.add(m); }
  touchAll() { for (const g of this.groups.values()) this.dirty.add(g.m); for (const p of this.list) this.dirty.add(p.m); }
  /** rebuild the models that changed */
  flush() {
    if (!this.dirty.size) return;
    const by = new Map<string, PropRec[]>();
    for (const p of this.list) if (this.dirty.has(p.m)) { const k = p.m + '@' + tileOf(p); let l = by.get(k); if (!l) by.set(k, l = []); l.push(p); }
    for (const [k, g] of this.groups) if (this.dirty.has(g.m)) { for (const im of [...g.meshes, ...g.far]) { this.root.remove(im); im.dispose(); } this.groups.delete(k); }
    for (const [k, recs] of by) {
      const m = recs[0].m, d = MODEL.get(m);
      const inst = recs.map(toInst), o = { shadow: d?.shadow ?? false, scale: d?.wind ?? 1 };
      const meshes = instance(this.root, m, inst, o), far = this.lodOn && hasModel(m + '__lod1') ? instance(this.root, m + '__lod1', inst, o) : [];
      for (const im of [...meshes, ...far]) { im.userData.model = m; im.userData.key = k; im.matrixAutoUpdate = false; im.userData.leafCast = im.castShadow && (im.material as THREE.Material).type === 'MeshLambertMaterial' && (im.material as THREE.MeshLambertMaterial).alphaTest > 0; }
      for (const im of far) im.visible = false;
      const [ti, tj] = k.slice(k.indexOf('@') + 1).split(',').map(Number);
      this.groups.set(k, { m, recs, meshes, far, cx: (ti + .5) * PROP_TILE, cz: (tj + .5) * PROP_TILE, lod: 0 });
    }
    this.dirty.clear();
    this.rebuildBlobs();
  }
  /** footprint radius of a model at scale 1 (trees: around the trunk only) */
  private footprint(m: string, meshes: THREE.InstancedMesh[]) {
    let r = this.blobR.get(m); if (r !== undefined) return r;
    const d = MODEL.get(m);
    if (!d || d.cat === 'Gras' || d.cat === 'Blumen' || d.wall || m === 'Laterne' || /Pebble|RockPath/.test(m)) r = 0;
    else if (d.cat === 'Bäume') r = (d.solid ?? .6) * 2.1;
    else {
      const b = new THREE.Box3(); for (const im of meshes) { im.geometry.computeBoundingBox(); b.union(im.geometry.boundingBox!); }
      r = b.isEmpty() ? 0 : Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * .5 * 1.2;
    }
    this.blobR.set(m, r); return r;
  }
  private rebuildBlobs() {
    for (const c of [...this.blobRoot.children]) { this.blobRoot.remove(c); (c as THREE.InstancedMesh).dispose(); }
    const by = new Map<string, Blob[]>();
    for (const g of this.groups.values()) {
      const r0 = this.footprint(g.m, g.meshes); if (!r0) continue;
      const k = tileOf(g.recs[0]); let l = by.get(k); if (!l) by.set(k, l = []);
      for (const p of g.recs) l.push({ x: p.x, z: p.z, r: r0 * p.s });
    }
    for (const l of by.values()) { const im = blobMesh(l); if (im) this.blobRoot.add(im); }
  }
  /** leaf crowns cast shadows only in tiles near the player (performance plan 2.5: leaf shadows were 17 % of the GPU time);
   *  trunks, rocks and bushes keep theirs. r = distance from the point to the nearest edge of a tile */
  shadowNear(x: number, z: number, r: number) {
    const T = PROP_TILE;
    for (const g of this.groups.values()) {
      const k = g.meshes[0]?.userData.key as string | undefined; if (!k) continue;
      const [i, j] = k.slice(k.indexOf('@') + 1).split(',').map(Number);
      const dx = Math.max(i * T - x, 0, x - (i + 1) * T), dz = Math.max(j * T - z, 0, z - (j + 1) * T), near = dx * dx + dz * dz < r * r;
      for (const im of g.meshes) if (im.userData.leafCast) im.castShadow = near;
      for (const im of g.far) if (im.userData.leafCast) im.castShadow = near;
    }
  }
  /** far versions on (game); the world editor keeps the full models */
  lodOn = propOpts.lod;
  /** distance (camera -> tile centre, m) from which a tile shows the far version (tools/build-lod.mjs); 2 m hysteresis */
  lodDist = 24;
  /** per frame (cheap): near tiles full models, far tiles the far version (performance plan 2.3) */
  updateLod(cx: number, cz: number) {
    const D = this.lodDist;
    for (const g of this.groups.values()) {
      if (!g.far.length) continue;
      const d = Math.hypot(g.cx - cx, g.cz - cz), lod = g.lod ? (d > D - 2 ? 1 : 0) : (d > D + 2 ? 1 : 0);
      if (lod === g.lod) continue; g.lod = lod;
      for (const im of g.meshes) im.visible = !lod;
      for (const im of g.far) im.visible = !!lod;
    }
  }
  /** nearest placed object under the ray */
  pick(ray: THREE.Raycaster): PropRec | null {
    const hits = ray.intersectObjects(this.root.children, false);
    for (const h of hits) {
      const g = this.groups.get(h.object.userData.key); if (g && h.instanceId !== undefined && g.recs[h.instanceId]) return g.recs[h.instanceId];
    }
    return null;
  }
}

/** lower graphics quality: fewer objects in the forest, everything on the farm itself stays */
export function thin(list: PropRec[], dens: number, onFarm: (p: PropRec) => boolean) {
  if (dens >= 1) return list;
  return list.filter(p => {
    if (MODEL.get(p.m)?.cat === 'Hof' || onFarm(p)) return true;
    const h = Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1;
    return h < dens;
  });
}
