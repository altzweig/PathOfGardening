// Old-fashioned lanterns for the night (Basti 22.11.2026, instead of the glaring bloom): three hang from the yard tree
// (120° apart, slightly different heights, the chain hooked onto a branch), more stand at the entrances of the farm
// (on the fence post, else on a flat spot of a rock or on the ground). The entrance lanterns are world props ('Laterne',
// placed in the world editor), the tree lanterns are found from the tree itself.
// Cheap at night: the glass glows (emissive), each lantern has a soft halo and a warm pool of light on the ground (additive,
// no real lights); only the tree gets ONE real point light that lights the middle of the yard.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scene } from '../../view/core';
import { modelParts } from '../../view/nature';
import { MODEL } from '../../world/catalog';
import { toInst } from '../../world/props';
import type { PropRec } from '../../world/data';
import type { AppleTreeShape } from './appleTree';

/** look + layout values (balancing.yaml `laternen`) */
export interface LanternCfg {
  /** tree lanterns: how many, hook radius from the trunk (m) and lantern bottom heights over the ground (m), one per lantern */
  baum: { anzahl: number; radius: [number, number]; hoehen: number[]; drehung?: number; punkt?: [number, number] | null };
  /** glow of the glass, halo (size m, strength), ground pool (radius m, strength) */
  glas: number; halo: [number, number]; boden: [number, number];
  /** the one real light under the tree: strength, reach (m) */
  licht: [number, number];
  /** swing of the hanging lanterns (rad) */
  pendeln: number;
}
export const LANTERN_DEFAULT: LanternCfg = { baum: { anzahl: 3, radius: [.9, 2.6], hoehen: [1.75, 1.9, 1.6] }, glas: 2.2, halo: [1.1, .45], boden: [2.2, .32], licht: [9, 9], pendeln: .05 };

// ---------------- the lantern model (origin = bottom centre, 0.53 m high incl. the ring) ----------------
const iron = new THREE.MeshStandardMaterial({ color: 0x2e2822, metalness: .55, roughness: .5, flatShading: true });
/** glass: warm candle light inside, darker at the edges, thin lead bars; emissiveIntensity follows the night */
const glassTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 58, 2, 32, 54, 52); r.addColorStop(0, '#fff2c8'); r.addColorStop(.25, '#ffc870'); r.addColorStop(.7, '#d07a2a'); r.addColorStop(1, '#6a3410');
  g.fillStyle = r; g.fillRect(0, 0, 64, 96);
  g.fillStyle = 'rgba(40,24,12,.85)'; g.fillRect(30, 0, 4, 96); g.fillRect(0, 34, 64, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export const lanternGlass = new THREE.MeshStandardMaterial({ color: 0x5a3c1c, map: glassTex, emissive: 0xffb45a, emissiveMap: glassTex, emissiveIntensity: 0, roughness: .25, metalness: 0 });
export const LANTERN_TOP = .53;

function part(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0) {
  if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return g.index ? g.toNonIndexed() : g;
}
function lanternGeos() {
  const I: THREE.BufferGeometry[] = [];
  I.push(part(new THREE.BoxGeometry(.21, .03, .21), 0, .015, 0));                                      // base plate
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    I.push(part(new THREE.BoxGeometry(.03, .03, .03), x * .09, -.0, z * .09));                         // little feet
    I.push(part(new THREE.BoxGeometry(.024, .27, .024), x * .086, .165, z * .086));                    // corner posts
  }
  I.push(part(new THREE.BoxGeometry(.22, .022, .22), 0, .3, 0));                                       // top frame
  I.push(part(new THREE.ConeGeometry(.17, .13, 4, 1), 0, .375, 0, Math.PI / 4));                      // roof
  I.push(part(new THREE.CylinderGeometry(.03, .04, .05, 8), 0, .46, 0));                               // chimney cap
  I.push(part(new THREE.TorusGeometry(.04, .009, 6, 14), 0, .49, 0));                                  // ring
  const glass = part(new THREE.BoxGeometry(.16, .25, .16), 0, .155, 0);
  const merge = (l: THREE.BufferGeometry[]) => { const g = mergeGeometries(l); g.computeVertexNormals(); g.computeBoundingSphere(); return g; };
  return { iron: merge(I), glass: merge([glass]) };
}
let GEO: ReturnType<typeof lanternGeos> | null = null;
/** parts for the world editor model 'Laterne' */
export function lanternParts() { GEO ??= lanternGeos(); return [{ geo: GEO.iron, mat: 'custom', vc: false, m: iron }, { geo: GEO.glass, mat: 'custom', vc: false, m: lanternGlass }]; }

// ---------------- glow ----------------
const radial = (stops: [number, string][]) => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [k, col] of stops) r.addColorStop(k, col); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const haloMat = new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,226,170,1)'], [.18, 'rgba(255,180,100,.55)'], [.5, 'rgba(255,140,60,.14)'], [1, 'rgba(255,120,40,0)']]),
  color: 0xffb070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const poolMat = new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,196,120,1)'], [.35, 'rgba(255,160,80,.5)'], [1, 'rgba(255,120,50,0)']]),
  color: 0xffc07a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const chainMat = new THREE.MeshStandardMaterial({ color: 0x24201c, metalness: .5, roughness: .6 });
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

interface Lamp { g: THREE.Group; halo: THREE.Sprite; pivot?: THREE.Group; ph: number; f: number }
const down = new THREE.Vector3(0, -1, 0);

/** bark vertices of a placed tree model in world space (its branches) */
function barkPoints(tree: PropRec) {
  const it = toInst(tree), m4 = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y ?? 0, it.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(it.tx ?? 0, it.ry ?? 0, it.tz ?? 0)), new THREE.Vector3().setScalar(it.s));
  const pts: THREE.Vector3[] = [], v = new THREE.Vector3();
  for (const q of modelParts(tree.m)) if (q.mat.startsWith('Bark')) { const P = q.geo.getAttribute('position'); for (let i = 0; i < P.count; i++) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(m4).clone()); }
  return pts;
}

export class Lanterns {
  root = new THREE.Group();
  lamps: Lamp[] = [];
  light: THREE.PointLight | null = null;
  /** where the tree lanterns hang (debug / screenshots) */
  tree: { x: number; z: number } | null = null;
  private t = 0;
  constructor(public C: LanternCfg = LANTERN_DEFAULT) { this.root.name = 'lanterns'; scene.add(this.root); }

  /** build everything: props = all placed world objects, layer = the meshes of the placed objects (to stand on fence posts / rocks),
   *  near = the point the yard tree is closest to (centre of fields + house) */
  build(props: PropRec[], layer: THREE.Object3D, near: { x: number; z: number }, apple?: AppleTreeShape) {
    GEO ??= lanternGeos();
    for (const p of props) if (p.m === 'Laterne') this.stand(p, layer);
    // the big apple tree (22.11.2026): the lanterns hang from its three lantern branches
    if (apple) { this.hangOn(apple, apple.hookPts, near); return; }
    const P = this.C.baum.punkt ?? null, aim = P ? { x: P[0], z: P[1] } : near;
    let best: PropRec | null = null, bd = Infinity;
    for (const p of props) {
      if (MODEL.get(p.m)?.cat !== 'Bäume' || !modelParts(p.m).some(q => q.mat.startsWith('Bark'))) continue;
      const d = Math.hypot(p.x - aim.x, p.z - aim.z); if (d < bd) { bd = d; best = p; }
    }
    if (best && bd < 25) this.hangOn(best, barkPoints(best), near);
  }

  /** a standing lantern: on top of whatever is below (fence post, rock: a flat spot nearby), else on the ground */
  private stand(p: PropRec, layer: THREE.Object3D) {
    const ray = new THREE.Raycaster(), solid = layer.children.filter(o => { const c = MODEL.get(o.userData.model)?.cat; return c === 'Hof' || c === 'Steine'; });
    const o = new THREE.Vector3(), nm = new THREE.Matrix3(), im = new THREE.Matrix4(), n = new THREE.Vector3();
    let spot: { x: number; y: number; z: number } | null = null, score = -Infinity;
    // sample a small disc: the highest hit at the point itself wins if it is flat, otherwise the nearest flat spot
    for (let r = 0; r <= .45 && !(spot && r > 0 && score > -.01); r += .09) for (let a = 0; a < (r ? 12 : 1); a++) {
      const x = p.x + Math.cos(a / 12 * Math.PI * 2) * r, z = p.z + Math.sin(a / 12 * Math.PI * 2) * r;
      ray.set(o.set(x, 20, z), down);
      const h = ray.intersectObjects(solid, false).find(h => h.object.userData.model !== 'Laterne'); if (!h || !h.face) continue;
      const mesh = h.object as THREE.InstancedMesh;
      n.copy(h.face.normal); if (h.instanceId !== undefined) { mesh.getMatrixAt(h.instanceId, im); n.applyMatrix3(nm.getNormalMatrix(im)); }
      n.normalize(); if (n.y < .9) continue;
      const s = -r * 2 - (1 - n.y) * 3; if (s > score) { score = s; spot = { x, y: h.point.y, z }; }
    }
    const at = spot ?? { x: p.x, y: 0, z: p.z };
    const g = new THREE.Group(); g.position.set(at.x, at.y, at.z); g.rotation.y = p.ry ?? 0; g.scale.setScalar(p.s || 1);
    this.addLamp(g, false);
  }

  /** three lanterns 120° apart around the trunk, each on a chain from a branch */
  private hangOn(tree: { x: number; z: number }, pts: THREE.Vector3[], near: { x: number; z: number }) {
    const C = this.C.baum;
    this.tree = { x: tree.x, z: tree.z };
    // the first lantern faces the middle of the yard
    const a0 = Math.atan2(near.z - tree.z, near.x - tree.x) + (C.drehung ?? 0) * Math.PI / 180, n = Math.max(1, C.anzahl), hooks: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + k * Math.PI * 2 / n, bottom = C.hoehen[k % C.hoehen.length];
      let best: THREE.Vector3 | null = null, bs = -Infinity;
      for (const p of pts) {
        const dx = p.x - tree.x, dz = p.z - tree.z, r = Math.hypot(dx, dz); if (r < C.radius[0] || r > C.radius[1]) continue;
        const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - a), Math.cos(Math.atan2(dz, dx) - a))); if (da > .6) continue;
        const hy = p.y - bottom - LANTERN_TOP; if (hy < .15 || hy > 1.6) continue;   // chain length
        const s = r * .8 - da * 2 - Math.abs(hy - .45) * 1.2; if (s > bs) { bs = s; best = p; }
      }
      // no branch there: hang it at the edge of the hook radius, the chain goes up into the crown
      const hook = best ?? new THREE.Vector3(tree.x + Math.cos(a) * C.radius[0] * 1.3, bottom + LANTERN_TOP + .6, tree.z + Math.sin(a) * C.radius[0] * 1.3);
      hooks.push(hook);
      const pivot = new THREE.Group(); pivot.position.copy(hook); this.root.add(pivot);
      const len = hook.y - bottom - LANTERN_TOP;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, len + .05, 4), chainMat); chain.position.y = -len / 2 + .02; pivot.add(chain);
      const hk = new THREE.Mesh(new THREE.TorusGeometry(.03, .007, 4, 8, Math.PI * 1.3), chainMat); hk.rotation.set(0, a, Math.PI * .85); hk.position.y = .02; pivot.add(hk);
      const g = new THREE.Group(); g.position.y = -len - LANTERN_TOP; g.rotation.y = a; pivot.add(g);
      this.addLamp(g, true, pivot);
    }
    // one real light in the middle of the three, a little under the lanterns
    const c = hooks.reduce((s, h) => s.add(h), new THREE.Vector3()).multiplyScalar(1 / hooks.length);
    const L = this.light = new THREE.PointLight(0xffa452, 0, this.C.licht[1], 1.7);
    L.position.set(c.x, Math.min(...C.hoehen.slice(0, n)) + .3, c.z); this.root.add(L);
  }

  /** a lantern hanging from a hook of a building (house: under the porch roof); parent = building group, hook = local point;
   *  returns the world position of the glass (for the real light of the door lamp) */
  hangFrom(parent: THREE.Object3D, hook: THREE.Vector3, chain = .12) {
    GEO ??= lanternGeos();
    const pivot = new THREE.Group(); pivot.position.copy(hook); parent.add(pivot);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, chain + .02, 4), chainMat); c.position.y = -chain / 2; pivot.add(c);
    const g = new THREE.Group(); g.position.y = -chain - LANTERN_TOP; pivot.add(g);
    parent.updateWorldMatrix(true, true);
    this.addLamp(g, true, pivot);
    return g.localToWorld(new THREE.Vector3(0, .16, 0));
  }

  private addLamp(g: THREE.Group, high: boolean, pivot?: THREE.Group) {
    for (const [geo, m] of [[GEO!.iron, iron], [GEO!.glass, lanternGlass]] as const) { const o = new THREE.Mesh(geo, m); o.castShadow = m === iron; g.add(o); }
    const halo = new THREE.Sprite(haloMat); halo.position.y = .16; halo.scale.setScalar(this.C.halo[0]); halo.renderOrder = 5; g.add(halo);
    const pool = new THREE.Mesh(PLANE, poolMat); const r = this.C.boden[0] * (high ? 1.35 : 1); pool.scale.set(r * 2, 1, r * 2);
    if (!pivot) this.root.add(g);
    g.updateWorldMatrix(true, false); const w = g.getWorldPosition(new THREE.Vector3()); pool.position.set(w.x, .04, w.z); this.root.add(pool);
    this.lamps.push({ g, halo, pivot, ph: Math.random() * 6, f: .7 + Math.random() * .4 });
  }

  /** k = darkness 0..1 (0 by day: everything off) */
  update(dt: number, k: number) {
    this.t += dt; const on = k > .02, C = this.C;
    lanternGlass.emissiveIntensity = k * C.glas;
    haloMat.opacity = k * C.halo[1]; poolMat.opacity = k * C.boden[1]; haloMat.visible = poolMat.visible = on;
    if (this.light) { this.light.intensity = k * C.licht[0] * (1 + Math.sin(this.t * 9.1) * .03 + Math.sin(this.t * 23.7) * .02); this.light.visible = on; }
    for (const L of this.lamps) {
      L.halo.scale.setScalar(C.halo[0] * (1 + Math.sin(this.t * 7.3 + L.ph) * .04 + Math.sin(this.t * 17.9 + L.ph * 3) * .03));   // candle flicker
      if (L.pivot) L.pivot.rotation.set(Math.sin(this.t * L.f + L.ph) * C.pendeln, 0, Math.sin(this.t * L.f * .83 + L.ph * 2) * C.pendeln * .7);
    }
  }
}
