// Things that grow on the farm by themselves: weed tufts (yard + plots), forage at the forest edge (wild garlic,
// sorrel, mushrooms, firewood, stones), wild bramble bushes and the apples in the farm's trees. Instanced, cheap.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scene, windU } from '../../view/core';
import { buildPlant } from '../../view/models';
import type { FarmCfg, ItemId } from '../config';
import { treeCfg, treeKind } from '../config';
import type { FarmState } from '../state';
import type { Hof } from '../hof';
import { seeded } from '../hof';
import type { DaySim } from '../sim';

/** colour a geometry (vertex colours) so several parts merge into one instanced mesh */
function tint(g: THREE.BufferGeometry, hex: number) {
  const g2 = g.index ? g.toNonIndexed() : g, c = new THREE.Color(hex), n = g2.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g2.setAttribute('color', new THREE.BufferAttribute(a, 3)); g2.deleteAttribute('uv'); return g2;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) => {
  g.scale(...s); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;
};
const merge = (parts: THREE.BufferGeometry[]) => { const m = mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; if (!q.attributes.normal) q.computeVertexNormals(); return q; })); m.computeVertexNormals(); return m; };

/** weed tuft: a few spiky blades and a broad leaf */
function weedGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; parts.push(tint(at(new THREE.ConeGeometry(.035, .32, 4), Math.cos(a) * .06, .15, Math.sin(a) * .06, Math.sin(a) * .35, 0, -Math.cos(a) * .35), i % 2 ? 0x5e8e2c : 0x7aa83a)); }
  parts.push(tint(at(new THREE.SphereGeometry(.1, 6, 4), 0, .04, 0, 0, 0, 0, [1.3, .35, 1]), 0x4f7a26));
  return merge(parts);
}
const FORAGE: Record<string, () => THREE.BufferGeometry> = {
  baerlauch: () => { const p: THREE.BufferGeometry[] = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; p.push(tint(at(new THREE.SphereGeometry(.06, 5, 3), Math.cos(a) * .07, .12, Math.sin(a) * .07, 0, -a, .5, [.6, 2.4, .25]), 0x3f8a2a)); }
    for (let i = 0; i < 3; i++) p.push(tint(at(new THREE.SphereGeometry(.03, 5, 4), (i - 1) * .05, .3, (i % 2) * .04), 0xf8f8f0)); p.push(tint(at(new THREE.CylinderGeometry(.008, .008, .28, 4), 0, .14, 0), 0x5a9a3a)); return merge(p); },
  sorrel: () => { const p: THREE.BufferGeometry[] = []; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; p.push(tint(at(new THREE.SphereGeometry(.07, 5, 3), Math.cos(a) * .08, .09, Math.sin(a) * .08, 0, -a, .9, [.5, 1.8, .25]), i % 2 ? 0x6a9a2a : 0x8a5a2a)); }
    p.push(tint(at(new THREE.CylinderGeometry(.01, .012, .32, 4), 0, .16, 0), 0x9a3a2a)); for (let i = 0; i < 4; i++) p.push(tint(at(new THREE.SphereGeometry(.018, 4, 3), 0, .2 + i * .04, 0), 0xb83a2a)); return merge(p); },
  mushroom: () => { const p: THREE.BufferGeometry[] = []; for (const [x, z, s] of [[0, 0, 1], [.1, .06, .7], [-.07, .09, .55]] as const) {
    p.push(tint(at(new THREE.CylinderGeometry(.025 * s, .03 * s, .12 * s, 6), x, .06 * s, z), 0xf0e8d8));
    p.push(tint(at(new THREE.SphereGeometry(.07 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), x, .11 * s, z, 0, 0, 0, [1, .7, 1]), 0xa0522d)); } return merge(p); },
  // Löwenzahn (20.11.2026): flat serrated rosette + two yellow flowers on stalks
  dandel: () => { const p: THREE.BufferGeometry[] = []; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; p.push(tint(at(new THREE.SphereGeometry(.06, 5, 3), Math.cos(a) * .09, .03, Math.sin(a) * .09, 0, -a, 1.3, [.45, 2.2, .2]), 0x4f8a2a)); }
    for (const [x, z, h] of [[0, 0, .22], [.05, .04, .16]] as const) { p.push(tint(at(new THREE.CylinderGeometry(.008, .009, h, 4), x, h / 2, z), 0x6a9a3a)); p.push(tint(at(new THREE.SphereGeometry(.045, 7, 4), x, h, z, 0, 0, 0, [1, .55, 1]), 0xf8d020)); }
    return merge(p); },
  wood: () => merge([0, 1, 2].map(i => tint(at(new THREE.CylinderGeometry(.045, .05, .5, 7), (i - 1) * .1, .05 + (i === 1 ? .07 : 0), 0, Math.PI / 2, (i - 1) * .25), i === 1 ? 0x7a5432 : 0x6a4428))),
  stone: () => merge([[0, 0, .1], [.12, .04, .07], [-.08, .1, .06]].map(([x, z, r], i) => tint(at(new THREE.DodecahedronGeometry(r, 0), x, r * .6, z, i, i * 2, 0, [1, .7, 1]), i ? 0x9a948a : 0x86827a))),
};

// ---------------- sparkling outline for everything that can be picked up ----------------
/** inverted hull: smooth normals (welded vertices), pushed outwards, drawn back-faced behind the object */
function hullGeo(g: THREE.BufferGeometry) {
  const p = new THREE.BufferGeometry(); p.setAttribute('position', g.getAttribute('position').clone());
  const m = mergeVertices(p, 1e-3); m.computeVertexNormals(); return m;
}
const outlineMats = new Map<string, THREE.MeshBasicMaterial>();
/** soft warm rim; a glint runs over it now and then (different phase per instance / object) */
function outlineMat(width: number, opacity = .45) {
  const key = width + ':' + opacity; let m = outlineMats.get(key); if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: 0xffe8b0, side: THREE.BackSide, transparent: true, opacity, depthWrite: false });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\nvarying float vPh;\nvarying float vH;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += normal * ${width.toFixed(4)};
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = (modelMatrix * vec4(0., 0., 0., 1.)).xyz;
      #endif
      vPh = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;
      vH = position.y + position.x * .6;`);
    sh.fragmentShader = 'uniform float uTime;\nvarying float vPh;\nvarying float vH;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float cyc = fract(uTime * .28 + vPh * .159);                 // one glint every ~3.5 s
        float glint = smoothstep(.09, 0., abs(vH * 1.6 - (cyc * 2.2 - .5))) * step(cyc, .55);
        float breathe = .75 + .25 * sin(uTime * 2.1 + vPh);
        diffuseColor.rgb *= 1. + glint * 1.4;
        diffuseColor.a *= clamp(breathe + glint * 1.2, 0., 1.); }`);
  };
  m.customProgramCacheKey = () => 'outline' + key;
  outlineMats.set(key, m); return m;
}
/** an outline twin of an instanced mesh: shares its instance matrices (count must be copied after updates) */
function outlineFor(im: THREE.InstancedMesh, width: number) {
  const o = new THREE.InstancedMesh(hullGeo(im.geometry), outlineMat(width), 1);
  o.instanceMatrix = im.instanceMatrix; o.count = 0; o.frustumCulled = false; o.renderOrder = -1; scene.add(o); return o;
}
/** outline meshes as children of the given meshes (brambles); returns them so they can be hidden when empty */
function outlineGroup(g: THREE.Object3D, width: number, opacity: number) {
  const out: THREE.Mesh[] = [], list: THREE.Mesh[] = [];
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) list.push(o as THREE.Mesh); });
  for (const mesh of list) { const o = new THREE.Mesh(hullGeo(mesh.geometry), outlineMat(width, opacity)); o.renderOrder = -1; mesh.add(o); out.push(o); }
  return out;
}

export class WildView {
  private weeds: THREE.InstancedMesh;
  private forage = new Map<string, THREE.InstancedMesh>();
  private brambles: { g: THREE.Group; fruits: THREE.Mesh[]; rim: THREE.Mesh[] }[] = [];
  private apples: THREE.InstancedMesh;
  /** outline twins (weeds, forage kinds, apples) */
  private rims = new Map<THREE.InstancedMesh, THREE.InstancedMesh>();
  private appleSpots: THREE.Vector3[][] = [];
  private key = ''; private aKey = ''; private bKey = '';
  constructor(public cfg: FarmCfg, public hof: Hof) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true });
    const capW = cfg.wild.weeds.max + cfg.hof.plots.length * cfg.plots.weeds.max;
    this.weeds = new THREE.InstancedMesh(weedGeo(), mat, capW); this.weeds.count = 0; this.weeds.castShadow = true; this.weeds.frustumCulled = false; scene.add(this.weeds);
    this.rims.set(this.weeds, outlineFor(this.weeds, .022));
    for (const [k, mk] of Object.entries(FORAGE)) { const m = new THREE.InstancedMesh(mk(), mat, cfg.wild.forage.max); m.count = 0; m.castShadow = true; m.frustumCulled = false; scene.add(m); this.forage.set(k, m); this.rims.set(m, outlineFor(m, .02)); }
    const rnd = seeded(11);
    // brambles: dark leaves, black-purple berries
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: .9, flatShading: true }), head = new THREE.MeshStandardMaterial({ color: 0x4a2a1a });
    const berry = new THREE.MeshStandardMaterial({ color: 0x2a1030, roughness: .35, emissive: 0x200818, emissiveIntensity: .3 });
    for (const b of hof.brambles) {
      const p = buildPlant('blue', { leaf, head }); p.g.position.set(b.x, 0, b.z); p.g.scale.set(1.4, 1.15, 1.4); p.g.rotation.y = rnd() * 7; scene.add(p.g);
      p.g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      for (const f of p.fruits) { f.material = berry; f.scale.setScalar(.06); }
      const rim = outlineGroup(p.g, .03, .32);
      this.brambles.push({ g: p.g, fruits: p.fruits, rim });
    }
    // apples in the crowns of the farm's trees
    // 20.11.2026: one fruit per shake x loot (apples red, nuts brown), coloured per instance
    const amat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .45, emissive: 0x200808, emissiveIntensity: .25 });
    const per = Math.max(...cfg.hof.trees.map((_, i) => treeCfg(cfg, i).picks * treeCfg(cfg, i).shake), 1);
    this.apples = new THREE.InstancedMesh(new THREE.SphereGeometry(.09, 8, 6), amat, cfg.hof.trees.length * per); this.apples.count = 0; this.apples.castShadow = true; this.apples.frustumCulled = false; scene.add(this.apples);
    this.rims.set(this.apples, outlineFor(this.apples, .018));
    this.appleSpots = cfg.hof.trees.map(t => Array.from({ length: per }, () => { const a = rnd() * Math.PI * 2, r = .7 + rnd() * .45, y = 1.7 + rnd() * .8; return new THREE.Vector3(t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r); }));
  }
  update(s: FarmState, sim: DaySim | null, now: number) {
    const W = s.wild, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    // weeds + forage: only rebuilt when something changed
    const key = W.weeds.length + ':' + (W.weeds[W.weeds.length - 1]?.id ?? 0) + ':' + W.forage.length + ':' + (W.forage[W.forage.length - 1]?.id ?? 0) + ':' + s.plots.map(x => x.open ? x.weeds : '-').join('');
    if (key !== this.key) {
      this.key = key;
      let n = 0;
      const put = (x: number, z: number, r: number, k: number) => { e.set(0, r, 0); q.setFromEuler(e); m4.compose(p.set(x, 0, z), q, sc.setScalar(k)); this.weeds.setMatrixAt(n, m4); this.weeds.setColorAt(n, col.setHSL(.24 + (r % 1) * .06, .5, .55 + (r * 7 % 1) * .2)); n++; };
      for (const w of W.weeds) put(w.x, w.z, w.id * 1.7, 1.05 + (w.id * .37 % 1) * .6);
      s.plots.forEach((pl, i) => { if (!pl.open) return; const P = this.cfg.hof.plots[i]; for (let k = 0; k < pl.weeds; k++) { const sp = this.hof.plotWeeds[i][k]; put(P.x + sp.x, P.z + sp.z, sp.r, 1.1); } });
      this.weeds.count = n; this.weeds.instanceMatrix.needsUpdate = true; if (this.weeds.instanceColor) this.weeds.instanceColor.needsUpdate = true;
      const counts = new Map<string, number>();
      for (const f of W.forage) {
        const m = this.forage.get(f.k); if (!m) continue; const i = counts.get(f.k) ?? 0; counts.set(f.k, i + 1);
        e.set(0, f.id * 2.3, 0); q.setFromEuler(e); m4.compose(p.set(f.x, 0, f.z), q, sc.setScalar(1.5 + (f.id * .41 % 1) * .5)); m.setMatrixAt(i, m4);
      }
      for (const [k, m] of this.forage) { m.count = counts.get(k) ?? 0; m.instanceMatrix.needsUpdate = true; }
    }
    // bramble berries + apples (day state)
    const max = this.cfg.wild.brambles.picks, ready = (d?: number) => (d ?? 0) <= s.day;
    const bN = this.brambles.map((_, i) => sim ? sim.brambles[i]?.n ?? 0 : ready(s.perennial.brambles[i]) ? max : 0);
    const bKey = bN.join(',');
    if (bKey !== this.bKey) {
      this.bKey = bKey;
      this.brambles.forEach((b, i) => { const n = bN[i]; const shown = Math.ceil(b.fruits.length * n / max); b.fruits.forEach((f, k) => f.visible = k < shown); b.rim.forEach(r => r.visible = n > 0); });
    }
    const aN = this.appleSpots.map((_, i) => sim ? sim.apples[i] ?? 0 : ready(s.perennial.trees[i]) ? treeCfg(this.cfg, i).picks : 0);
    const aKey = aN.join(',');
    if (aKey !== this.aKey) {
      this.aKey = aKey; let n = 0;
      this.appleSpots.forEach((list, i) => { const T = treeCfg(this.cfg, i), have = Math.min(list.length, aN[i] * T.shake); col.setHex(treeKind(this.cfg, i) === 'nut' ? 0x9a6a3a : 0xd8382a);
        for (let k = 0; k < have; k++) { m4.makeTranslation(list[k].x, list[k].y, list[k].z); this.apples.setColorAt(n, col); this.apples.setMatrixAt(n++, m4); } });
      this.apples.count = n; this.apples.instanceMatrix.needsUpdate = true; if (this.apples.instanceColor) this.apples.instanceColor.needsUpdate = true;
    }
    for (const [m, r] of this.rims) r.count = m.count;
    void now;
  }
  /** a random pickable thing for a little sparkle (x, y, z) or null */
  sparkle(s: FarmState): THREE.Vector3 | null {
    const W = s.wild, n = W.forage.length + W.weeds.length; if (!n) return null;
    const i = Math.floor(Math.random() * n), f = i < W.forage.length ? W.forage[i] : W.weeds[i - W.forage.length];
    return new THREE.Vector3(f.x + (Math.random() - .5) * .3, .15 + Math.random() * .3, f.z + (Math.random() - .5) * .3);
  }
  /** the bush that was picked shakes a little */
  bramble(i: number) { const b = this.brambles[i]; return b?.g ?? null; }
}
export const forageKinds = Object.keys(FORAGE) as ItemId[];
