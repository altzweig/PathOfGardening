// Kohlminen (24.11.2026, bis zu 100 gleichzeitig): ONE InstancedMesh with a fixed pool of slots that lives on the GPU for the whole game.
// A mine coming or going only changes the instance count and a few matrices: no new meshes, materials or shader compiles, one draw call
// (+ one in the shadow pass) no matter how many lie around. The last 0.6 s of its life a mine shrinks into the ground.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GEO, PART, V, lerp, rand, scene } from './core';
import { BUSH_MAT } from './models';
import type { BSnap } from '../sim/snap';

export const MINE_CAP = 128;
const SHRINK = .6; // s
interface Slot { id: number; x: number; y: number; z: number; tx: number; ty: number; tz: number; left: number; landed: boolean; spin: number; seen: number }

/** cabbage as fruitMesh('cab') builds it, merged into one geometry */
function cabGeo() {
  const part = (g: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number) => g.clone().scale(sx, sy, sz).translate(x, y, z);
  return mergeGeometries([part(GEO.ico, .14, .13, .14, 0, 0, 0), part(GEO.lo, .1, .06, .12, .08, .03, 0), part(GEO.lo, .1, .06, .12, -.08, .03, .02)])!;
}

export class MinePool {
  readonly mesh = new THREE.InstancedMesh(cabGeo(), BUSH_MAT.cab, MINE_CAP);
  private slots = new Map<number, Slot>(); private frameId = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private s = new THREE.Vector3();
  constructor() {
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0;
    this.mesh.castShadow = true; this.mesh.frustumCulled = false; // all of them lie around the farm, culling would cost more than it saves
    scene.add(this.mesh); // stays in the scene for good (count 0 = nothing drawn)
  }
  /** snapshot rows of the mines (BSnap with [9] = 1) */
  sync(rows: BSnap[], smooth: boolean) {
    const id = ++this.frameId;
    for (const b of rows) {
      let v = this.slots.get(b[0]);
      if (!v) { if (this.slots.size >= MINE_CAP) continue; v = { id: b[0], x: b[1], y: b[2], z: b[3], tx: 0, ty: 0, tz: 0, left: 1e9, landed: false, spin: 0, seen: id }; this.slots.set(b[0], v); }
      v.landed = !!b[5]; v.tx = b[1]; v.ty = v.landed ? .14 : b[2]; v.tz = b[3]; v.left = b[10] ?? 1e9; v.seen = id;
      if (!smooth) { v.x = v.tx; v.y = v.ty; v.z = v.tz; }
    }
    for (const [k, v] of this.slots) if (v.seen !== id) this.slots.delete(k);
  }
  /** writes the instance matrices: smoothed position, slow breathing, rolling while it drops, shrinking at the end */
  frame(dt: number, k: number) {
    const now = performance.now(); let n = 0;
    for (const v of this.slots.values()) {
      v.x = lerp(v.x, v.tx, k); v.y = lerp(v.y, v.ty, k); v.z = lerp(v.z, v.tz, k); v.left -= dt;
      v.spin = v.landed ? lerp(v.spin % (Math.PI * 2), .35, .2) : v.spin + .13;
      const sc = .85 * (1 + Math.sin(now / 420 + v.id) * .04) * Math.min(1, Math.max(0, v.left / SHRINK));
      this.e.set(v.spin, 0, 0); this.q.setFromEuler(this.e);
      this.mesh.setMatrixAt(n++, this.m.compose(this.p.set(v.x, v.y - (1 - Math.min(1, Math.max(0, v.left / SHRINK))) * .1, v.z), this.q, this.s.setScalar(sc)));
      if (v.landed && Math.random() < dt * 1.2) PART.spawn(V(v.x, .32, v.z), V(rand(-.1, .1), .5, rand(-.1, .1)), 0xffd040, .05, .35, { a: .9 }); // fuse spark now and then
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** one tiny instance for the shader prewarm (instancing is its own shader variant) */
  warm() { this.mesh.setMatrixAt(0, this.m.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -.5, 0)); this.mesh.count = 1; this.mesh.instanceMatrix.needsUpdate = true; }
  clear() { this.slots.clear(); this.mesh.count = 0; }
}
