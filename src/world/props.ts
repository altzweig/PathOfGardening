// Placed objects of the world (forest, bushes, plants, stones, fences): one InstancedMesh per model and material,
// rebuilt per model when something changes (editor). Picking maps a ray hit back to its PropRec.
import * as THREE from 'three';
import { Inst, instance } from '../view/nature';
import { MODEL } from './catalog';
import type { PropRec } from './data';

const col = new Map<string, THREE.Color>();
const color = (c: string) => { let v = col.get(c); if (!v) col.set(c, v = new THREE.Color(c)); return v; };
export function toInst(p: PropRec): Inst {
  const d = MODEL.get(p.m);
  return { x: p.x, z: p.z, y: p.y ?? d?.y ?? 0, s: p.s, ry: p.ry, tx: p.tx ?? 0, tz: p.tz ?? 0, col: p.c ? color(p.c) : undefined, shade: p.sh ?? 1 };
}

export class PropLayer {
  root = new THREE.Group();
  list: PropRec[] = [];
  private groups = new Map<string, { recs: PropRec[]; meshes: THREE.InstancedMesh[] }>();
  private dirty = new Set<string>();
  constructor(parent: THREE.Object3D) { this.root.name = 'props'; parent.add(this.root); }
  set(list: PropRec[]) {
    this.list = list;
    for (const m of this.groups.keys()) this.dirty.add(m);
    for (const p of list) this.dirty.add(p.m);
    this.flush();
  }
  touch(m: string) { this.dirty.add(m); }
  touchAll() { for (const m of this.groups.keys()) this.dirty.add(m); for (const p of this.list) this.dirty.add(p.m); }
  /** rebuild the models that changed */
  flush() {
    if (!this.dirty.size) return;
    const by = new Map<string, PropRec[]>();
    for (const p of this.list) if (this.dirty.has(p.m)) { let l = by.get(p.m); if (!l) by.set(p.m, l = []); l.push(p); }
    for (const m of this.dirty) {
      const old = this.groups.get(m);
      if (old) for (const im of old.meshes) { this.root.remove(im); im.dispose(); }
      const recs = by.get(m) ?? [], d = MODEL.get(m);
      if (!recs.length) { this.groups.delete(m); continue; }
      const meshes = instance(this.root, m, recs.map(toInst), { shadow: d?.shadow ?? false, scale: d?.wind ?? 1 });
      for (const im of meshes) im.userData.model = m;
      this.groups.set(m, { recs, meshes });
    }
    this.dirty.clear();
  }
  /** nearest placed object under the ray */
  pick(ray: THREE.Raycaster): PropRec | null {
    const hits = ray.intersectObjects(this.root.children, false);
    for (const h of hits) {
      const g = this.groups.get(h.object.userData.model); if (g && h.instanceId !== undefined && g.recs[h.instanceId]) return g.recs[h.instanceId];
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
