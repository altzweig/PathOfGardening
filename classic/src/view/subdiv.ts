// Box-modelling cage + Catmull-Clark subdivision (21.11.2026, animal player figures).
// A character is authored like in a modelling package: a low quad cage (rings that are extruded into limbs,
// head, snout, ears, tail), each cage vertex carries skin weights + extra channels, edges can be creased
// (hems). Subdividing twice gives a smooth, all-quad surface with clean edge flow; weights and channels are
// subdivided with the same masks, so the skinning is as smooth as the surface.
import * as THREE from 'three';

export type Vec = [number, number, number];
export interface Face { v: number[]; tag: number }

/** quad cage with per-vertex attribute vectors: [x, y, z, ...weights (nb), ...extra (nx)] */
export class Cage {
  A: number[][] = [];
  F: Face[] = [];
  crease = new Map<string, number>();
  constructor(public nb: number, public nx: number) {}
  get D() { return 3 + this.nb + this.nx; }
  /** add a vertex; w = {bone: weight}, x = {channel: value} */
  v(p: Vec, w: Record<number, number> = {}, x: Record<number, number> = {}) {
    const a = new Array(this.D).fill(0); a[0] = p[0]; a[1] = p[1]; a[2] = p[2];
    for (const k in w) a[3 + +k] = w[k];
    for (const k in x) a[3 + this.nb + +k] = x[k];
    this.A.push(a); return this.A.length - 1;
  }
  f(v: number[], tag: number) { this.F.push({ v, tag }); return this.F.length - 1; }
  pos(i: number) { const a = this.A[i]; return new THREE.Vector3(a[0], a[1], a[2]); }
  set(i: number, p: THREE.Vector3 | Vec) { const a = this.A[i]; if (Array.isArray(p)) { a[0] = p[0]; a[1] = p[1]; a[2] = p[2]; } else { a[0] = p.x; a[1] = p.y; a[2] = p.z; } }
  setW(i: number, w: Record<number, number>) { const a = this.A[i]; for (let k = 0; k < this.nb; k++) a[3 + k] = 0; for (const k in w) a[3 + +k] = w[k]; }
  setX(i: number, ch: number, val: number) { this.A[i][3 + this.nb + ch] = val; }
  getX(i: number, ch: number) { return this.A[i][3 + this.nb + ch]; }
  creaseEdge(a: number, b: number, s: number) { this.crease.set(a < b ? a + ',' + b : b + ',' + a, s); }

  /** ordered boundary loop of a face region (first loop if several) */
  loop(faces: number[]) {
    const dir = new Set<string>(), nxt = new Map<number, number>();
    for (const fi of faces) { const v = this.F[fi].v; for (let k = 0; k < v.length; k++) dir.add(v[k] + ',' + v[(k + 1) % v.length]); }
    for (const fi of faces) { const v = this.F[fi].v; for (let k = 0; k < v.length; k++) { const a = v[k], b = v[(k + 1) % v.length]; if (!dir.has(b + ',' + a)) nxt.set(a, b); } }
    const start = nxt.keys().next().value as number, out = [start];
    for (let c = nxt.get(start)!; c !== start && out.length <= nxt.size; c = nxt.get(c)!) out.push(c);
    return out;
  }
  /** all vertices of a face region */
  verts(faces: number[]) { const s = new Set<number>(); for (const fi of faces) for (const v of this.F[fi].v) s.add(v); return [...s]; }

  /**
   * extrude a face region: its vertices are duplicated (the region faces move onto the copies), each boundary
   * edge gets a side quad. Returns the new boundary loop (same order as loop()) and all new vertices.
   */
  extrude(faces: number[], tag?: number) {
    const map = new Map<number, number>();
    for (const v of this.verts(faces)) { map.set(v, this.A.length); this.A.push(this.A[v].slice()); }
    const dir = new Set<string>();
    for (const fi of faces) { const v = this.F[fi].v; for (let k = 0; k < v.length; k++) dir.add(v[k] + ',' + v[(k + 1) % v.length]); }
    for (const fi of faces) {
      const F = this.F[fi], v = F.v;
      for (let k = 0; k < v.length; k++) {
        const a = v[k], b = v[(k + 1) % v.length];
        if (!dir.has(b + ',' + a)) this.f([a, b, map.get(b)!, map.get(a)!], tag ?? F.tag);
      }
    }
    for (const fi of faces) this.F[fi].v = this.F[fi].v.map(v => map.get(v)!);
    return { loop: this.loop(faces), all: [...map.values()] };
  }

  /**
   * put a loop of vertices onto an ellipse: centre c, normal n (loop axis), u = direction of radius ru
   * (v = n x u gets rv); each vertex keeps its angle around the loop's current centre. Optional per-vertex
   * radial factor (shape(angle) -> scale) for non-elliptic sections.
   */
  place(loop: number[], c: Vec, n: Vec, u: Vec, ru: number, rv: number, shape?: (a: number) => number) {
    const N = new THREE.Vector3(...n).normalize(), U = new THREE.Vector3(...u); U.addScaledVector(N, -U.dot(N)).normalize();
    const Vv = new THREE.Vector3().crossVectors(N, U), C0 = new THREE.Vector3();
    for (const i of loop) C0.add(this.pos(i)); C0.divideScalar(loop.length);
    const C = new THREE.Vector3(...c), d = new THREE.Vector3();
    for (const i of loop) {
      d.subVectors(this.pos(i), C0); const a = Math.atan2(d.dot(Vv), d.dot(U)), k = shape ? shape(a) : 1;
      this.set(i, C.clone().addScaledVector(U, Math.cos(a) * ru * k).addScaledVector(Vv, Math.sin(a) * rv * k));
    }
  }
  /** move interior (non-loop) vertices of a region to the loop centre + offset along n */
  centre(all: number[], loop: number[], n: Vec, out: number) {
    const C = new THREE.Vector3(); for (const i of loop) C.add(this.pos(i)); C.divideScalar(loop.length);
    const L = new Set(loop), N = new THREE.Vector3(...n).normalize();
    for (const i of all) if (!L.has(i)) this.set(i, C.clone().addScaledVector(N, out));
  }

  /** consistency check: every directed edge once, its reverse once (closed, consistently oriented) */
  check() {
    const cnt = new Map<string, number>(); let bad = 0;
    for (const F of this.F) for (let k = 0; k < F.v.length; k++) { const key = F.v[k] + ',' + F.v[(k + 1) % F.v.length]; cnt.set(key, (cnt.get(key) ?? 0) + 1); }
    for (const [k, n] of cnt) { const [a, b] = k.split(','); if (n !== 1 || cnt.get(b + ',' + a) !== 1) bad++; }
    return bad;
  }

  /** one Catmull-Clark step (creases: sharp edges keep their line, sharpness drops by 1 per step) */
  subdivide() {
    const D = this.D, A = this.A, out = new Cage(this.nb, this.nx), nv = A.length;
    // vertex points first (same indices), then face points, then edge points
    const ek = (a: number, b: number) => a < b ? a + ',' + b : b + ',' + a;
    interface E { a: number; b: number; f: number[]; s: number; id: number }
    const edges = new Map<string, E>();
    this.F.forEach((F, fi) => { const v = F.v; for (let k = 0; k < v.length; k++) { const a = v[k], b = v[(k + 1) % v.length], key = ek(a, b); let e = edges.get(key); if (!e) { e = { a, b, f: [], s: this.crease.get(key) ?? 0, id: -1 }; edges.set(key, e); } e.f.push(fi); } });
    const fp = this.F.map(F => { const p = new Array(D).fill(0); for (const v of F.v) for (let d = 0; d < D; d++) p[d] += A[v][d]; return p.map(x => x / F.v.length); });
    const vFaces: number[][] = Array.from({ length: nv }, () => []), vEdges: E[][] = Array.from({ length: nv }, () => []);
    this.F.forEach((F, fi) => F.v.forEach(v => vFaces[v].push(fi)));
    for (const e of edges.values()) { vEdges[e.a].push(e); vEdges[e.b].push(e); }
    // vertex points
    for (let i = 0; i < nv; i++) {
      const P = A[i], es = vEdges[i], sharp = es.filter(e => e.s > 0 || e.f.length < 2), n = es.length;
      let q: number[];
      if (sharp.length > 2 || n === 0) q = P.slice();
      else if (sharp.length === 2) {
        const o0 = A[sharp[0].a === i ? sharp[0].b : sharp[0].a], o1 = A[sharp[1].a === i ? sharp[1].b : sharp[1].a];
        q = P.map((x, d) => (o0[d] + 6 * x + o1[d]) / 8);
      } else {
        const Fa = new Array(D).fill(0), Ra = new Array(D).fill(0), fs = vFaces[i];
        for (const f of fs) for (let d = 0; d < D; d++) Fa[d] += fp[f][d] / fs.length;
        for (const e of es) for (let d = 0; d < D; d++) Ra[d] += (A[e.a][d] + A[e.b][d]) / 2 / n;
        q = P.map((x, d) => (Fa[d] + 2 * Ra[d] + (n - 3) * x) / n);
      }
      out.A.push(q);
    }
    const fBase = out.A.length; for (const p of fp) out.A.push(p);
    for (const e of edges.values()) {
      const a = A[e.a], b = A[e.b];
      e.id = out.A.length;
      if (e.s > 0 || e.f.length < 2) out.A.push(a.map((x, d) => (x + b[d]) / 2));
      else { const f0 = fp[e.f[0]], f1 = fp[e.f[1]]; out.A.push(a.map((x, d) => (x + b[d] + f0[d] + f1[d]) / 4)); }
      if (e.s > 1) { out.crease.set(ek(e.a, e.id), e.s - 1); out.crease.set(ek(e.id, e.b), e.s - 1); }
    }
    this.F.forEach((F, fi) => {
      const v = F.v, n = v.length, c = fBase + fi;
      for (let k = 0; k < n; k++) {
        const prev = v[(k + n - 1) % n], cur = v[k], next = v[(k + 1) % n];
        out.F.push({ v: [cur, edges.get(ek(cur, next))!.id, c, edges.get(ek(prev, cur))!.id], tag: F.tag });
      }
    });
    return out;
  }
}

export interface BuiltMesh { geo: THREE.BufferGeometry; tris: number }
/**
 * cage -> skinned BufferGeometry. Faces are grouped by tag -> material index (tagMat). Vertices on a material
 * border are split, normals are computed before the split (no shading seam). color(p, x, tag) gives vertex colours.
 */
export function toGeometry(c: Cage, tagMat: (tag: number) => number, color: (p: THREE.Vector3, x: number[], tag: number, n: THREE.Vector3) => [number, number, number], displace?: (p: THREE.Vector3, x: number[], tag: number, n: THREE.Vector3) => void): BuiltMesh {
  const nv = c.A.length, P = new Float32Array(nv * 3);
  c.A.forEach((a, i) => { P[i * 3] = a[0]; P[i * 3 + 1] = a[1]; P[i * 3 + 2] = a[2]; });
  // triangulate quads along the shorter diagonal
  const tris: number[][] = [], ftag: number[] = [];
  const d2 = (a: number, b: number) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
  for (const F of c.F) {
    const v = F.v;
    if (v.length === 4) {
      if (d2(v[0], v[2]) <= d2(v[1], v[3])) { tris.push([v[0], v[1], v[2]], [v[0], v[2], v[3]]); }
      else { tris.push([v[0], v[1], v[3]], [v[1], v[2], v[3]]); }
      ftag.push(F.tag, F.tag);
    } else for (let k = 1; k < v.length - 1; k++) { tris.push([v[0], v[k], v[k + 1]]); ftag.push(F.tag); }
  }
  const smoothN = () => {
    const N = new Float32Array(nv * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), cr = new THREE.Vector3();
    for (const t of tris) {
      a.set(P[t[1] * 3] - P[t[0] * 3], P[t[1] * 3 + 1] - P[t[0] * 3 + 1], P[t[1] * 3 + 2] - P[t[0] * 3 + 2]);
      b.set(P[t[2] * 3] - P[t[0] * 3], P[t[2] * 3 + 1] - P[t[0] * 3 + 1], P[t[2] * 3 + 2] - P[t[0] * 3 + 2]);
      cr.crossVectors(a, b); for (const i of t) { N[i * 3] += cr.x; N[i * 3 + 1] += cr.y; N[i * 3 + 2] += cr.z; }
    }
    for (let i = 0; i < nv; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    return N;
  };
  let N = smoothN();
  // sculpt pass (fur clumps, eye sockets, ...) along the smooth normals, then fresh normals
  if (displace) {
    const p = new THREE.Vector3(), n = new THREE.Vector3(), tag = new Int32Array(nv).fill(-1);
    tris.forEach((t, i) => t.forEach(v => { if (tag[v] < 0) tag[v] = ftag[i]; }));
    for (let i = 0; i < nv; i++) {
      p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      displace(p, c.A[i].slice(3 + c.nb), tag[i], n); P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
    }
    N = smoothN();
  }
  // split by material
  const groups = new Map<number, number[]>();
  tris.forEach((t, i) => { const m = tagMat(ftag[i]); if (!groups.has(m)) groups.set(m, []); groups.get(m)!.push(i); });
  const pos: number[] = [], nor: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const geo = new THREE.BufferGeometry(); let start = 0;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (const m of [...groups.keys()].sort((a, b) => a - b)) {
    const remap = new Map<number, number>();
    for (const ti of groups.get(m)!) for (const v of tris[ti]) {
      let j = remap.get(v);
      if (j === undefined) {
        j = pos.length / 3; remap.set(v, j);
        p.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); n.set(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
        const a = c.A[v], cc = color(p, a.slice(3 + c.nb), ftag[ti], n); col.push(cc[0], cc[1], cc[2]);
        // 4 strongest weights
        const w: [number, number][] = [];
        for (let k = 0; k < c.nb; k++) if (a[3 + k] > 1e-4) w.push([k, a[3 + k]]);
        w.sort((x, y) => y[1] - x[1]); const top = w.slice(0, 4), s = top.reduce((t, x) => t + x[1], 0) || 1;
        for (let k = 0; k < 4; k++) { si.push(top[k]?.[0] ?? 0); sw.push(top[k] ? top[k][1] / s : 0); }
      }
      idx.push(j);
    }
    const cnt = groups.get(m)!.length * 3; geo.addGroup(start, cnt, m); start += cnt;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  return { geo, tris: tris.length };
}
