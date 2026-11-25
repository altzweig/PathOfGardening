// All enemies of one species in ONE draw call (25.11.2026, Basti: "Alle Tiere vorbacken").
// Each species = instanced body (+ eyes, + hedgehog spines) and an instanced ultra low poly shadow stand-in.
// The skinning reads baked bone matrices from a float texture (animals.ts bakeAnimal): per instance two motions
// (A, B), each between two frames, blended. AnimState turns what the simulation says (speed, stun, attack, puff ...)
// into those frame numbers, like animate() did with the bones, but without touching a single bone on the CPU.
import * as THREE from 'three';
import type { EnemyType } from '../config';
import { ANIMAL_EYE, GAIT, SHADOW_LAYER, SPINE_TEX, bakeAnimal, template, type AnimIn, type Baked, type Clip } from './animals';

const CAP: Record<string, number> = { boss: 8 };
const DEFAULT_CAP = 320;
const sst = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------------- shader pieces ----------------
const SKIN_HEAD = `uniform highp sampler2D uBones; attribute float boneIdx; attribute vec4 iA; attribute vec4 iB; attribute vec4 iEmis; attribute vec4 iRim;
varying vec4 vEmis; varying vec4 vRim;
mat4 boneAt(float row, float b) { int x = int(b + .5) * 4, y = int(row + .5);
  return mat4(texelFetch(uBones, ivec2(x, y), 0), texelFetch(uBones, ivec2(x + 1, y), 0), texelFetch(uBones, ivec2(x + 2, y), 0), texelFetch(uBones, ivec2(x + 3, y), 0)); }
mat4 skinM() {
  mat4 a = boneAt(iA.x, boneIdx) * (1. - iA.z) + boneAt(iA.y, boneIdx) * iA.z;
  if (iA.w <= 0.) return a;
  mat4 b = boneAt(iB.x, boneIdx) * (1. - iB.z) + boneAt(iB.y, boneIdx) * iB.z;
  return a * (1. - iA.w) + b * iA.w; }
`;
/** blink: eye vertices scaled in y around the eye line (bind space) */
function skinShader(sh: { vertexShader: string; uniforms: Record<string, THREE.IUniform> }, tex: THREE.Texture, eyeY?: number) {
  sh.uniforms.uBones = { value: tex };
  if (eyeY !== undefined) sh.uniforms.uEyeY = { value: eyeY };
  sh.vertexShader = sh.vertexShader.replace('void main() {', SKIN_HEAD + (eyeY !== undefined ? 'uniform float uEyeY;\n' : '') + 'void main() {\n  vEmis = iEmis; vRim = iRim;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = mat3(skinM()) * objectNormal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (eyeY !== undefined ? '  transformed.y = uEyeY + (transformed.y - uEyeY) * iB.w;\n' : '') + '  transformed = (skinM() * vec4(transformed, 1.)).xyz;');
}
function bodyMat(tex: THREE.Texture, map: THREE.Texture, toad: boolean) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: toad ? .5 : .92, metalness: 0, transparent: toad });
  mat.onBeforeCompile = sh => {
    skinShader(sh, tex);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec4 vEmis; varying vec4 vRim;\nvoid main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.a *= vEmis.a;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEmis.rgb;')
      // outline in the material (rim): where the surface turns away from the camera the colour goes to the ink
      .replace('#include <opaque_fragment>', `float rimK = 1.0 - abs(dot(normalize(normal), geometryViewDir));
        outgoingLight = mix(outgoingLight, vRim.rgb, smoothstep(vRim.w, vRim.w + .06, rimK));
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'herdBody' + (toad ? 't' : '');
  return mat;
}
function spineMat(tex: THREE.Texture, map: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .7 });
  mat.onBeforeCompile = sh => {
    skinShader(sh, tex);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec4 vEmis; varying vec4 vRim;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEmis.rgb;');
  };
  mat.customProgramCacheKey = () => 'herdSpines';
  return mat;
}
function eyeMat(tex: THREE.Texture, color: number, eyeY: number) {
  const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true, toneMapped: false });
  mat.onBeforeCompile = sh => {
    skinShader(sh, tex, eyeY);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec4 vEmis; varying vec4 vRim;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vEmis.rgb;');
  };
  mat.customProgramCacheKey = () => 'herdEyes';
  return mat;
}
function depthMat(tex: THREE.Texture) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = sh => skinShader(sh, tex);
  mat.customProgramCacheKey = () => 'herdDepth';
  return mat;
}
/** copy of a template geometry with the rigid bone index as a float attribute (skinIndex.x) */
function withBone(g: THREE.BufferGeometry, bone?: number, shift?: number[]) {
  const o = g.clone(), n = o.attributes.position.count, b = new Float32Array(n);
  if (bone !== undefined) b.fill(bone); else { const si = o.attributes.skinIndex; for (let i = 0; i < n; i++) b[i] = si.getX(i); }
  if (shift) o.translate(shift[0], shift[1], shift[2]);
  o.setAttribute('boneIdx', new THREE.BufferAttribute(b, 1));
  if (o.attributes.skinIndex) o.deleteAttribute('skinIndex'); if (o.attributes.skinWeight) o.deleteAttribute('skinWeight');
  return o;
}

// ---------------- one species ----------------
interface Part { mesh: THREE.InstancedMesh; emis?: THREE.InstancedBufferAttribute }
class Species {
  B: Baked; cap: number; n = 0;
  matrix: THREE.InstancedBufferAttribute; iA: THREE.InstancedBufferAttribute; iB: THREE.InstancedBufferAttribute; iEmis: THREE.InstancedBufferAttribute; iRim: THREE.InstancedBufferAttribute;
  eyeCol: THREE.InstancedBufferAttribute; spineEm?: THREE.InstancedBufferAttribute;
  parts: Part[] = [];
  constructor(public key: string, scene: THREE.Object3D, puffScale: number) {
    const type = (key === 'boss' ? 'raccoon' : key) as EnemyType, T = template(key);
    this.B = bakeAnimal(key, puffScale); this.cap = CAP[key] ?? DEFAULT_CAP;
    const N = this.cap, attr = (k: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.matrix = attr(16); this.iA = attr(4); this.iB = attr(4); this.iEmis = attr(4); this.iRim = attr(4); this.eyeCol = attr(4);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, emis = this.iEmis, shadow = false) => {
      geo.setAttribute('iA', this.iA); geo.setAttribute('iB', this.iB); geo.setAttribute('iEmis', emis); geo.setAttribute('iRim', this.iRim);
      const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.instanceMatrix = this.matrix; mesh.count = 0; mesh.frustumCulled = false;
      if (shadow) { mesh.castShadow = true; mesh.layers.set(SHADOW_LAYER); mesh.customDepthMaterial = depthMat(this.B.tex); }
      scene.add(mesh); this.parts.push({ mesh, emis }); return mesh;
    };
    add(withBone(T.geo), bodyMat(this.B.tex, T.tex, type === 'toad'));
    const eb = this.B.bi.eyes, ep = this.B.pivots[eb];
    add(withBone(T.eyes, eb, ep as number[]), eyeMat(this.B.tex, ANIMAL_EYE[type], ep[1]), this.eyeCol);
    if (T.spines) { this.spineEm = attr(4); const pb = this.B.bi.puff; add(withBone(T.spines, pb, this.B.pivots[pb] as number[]), spineMat(this.B.tex, SPINE_TEX), this.spineEm); }
    add(withBone(T.shadow), new THREE.MeshBasicMaterial({ color: 0 }), this.iEmis, true);
  }
  begin() { this.n = 0; }
  end() {
    for (const p of this.parts) { p.mesh.count = this.n; p.mesh.visible = this.n > 0; }
    for (const a of [this.matrix, this.iA, this.iB, this.iEmis, this.iRim, this.eyeCol, this.spineEm]) if (a) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
  }
}

// ---------------- per animal ----------------
/** two motions, each between two frames: rows + fraction, blend A -> B, eye blink */
export class AnimState {
  ph = Math.random() * 6; spd = 0; px = 0; pz = 0; init = false; atk = 0; hit = 0; lunge = false; flash = false;
  blinkT = 1 + Math.random() * 3; seed = Math.random() * 100; blink = 1;
  a0 = 0; a1 = 0; fa = 0; b0 = 0; b1 = 0; fb = 0; mix = 0;
  private set(slot: 'a' | 'b', c: Clip | undefined, u: number) {
    if (!c) return;
    let f: number, r0: number, r1: number;
    if (c.loop) { f = ((u % 1) + 1) % 1 * c.n; r0 = Math.floor(f); r1 = (r0 + 1) % c.n; f -= r0; }
    else { f = clamp(u, 0, 1) * (c.n - 1); r0 = Math.floor(f); r1 = Math.min(c.n - 1, r0 + 1); f -= r0; }
    if (slot === 'a') { this.a0 = c.start + r0; this.a1 = c.start + r1; this.fa = f; } else { this.b0 = c.start + r0; this.b1 = c.start + r1; this.fb = f; }
  }
  step(type: EnemyType, B: Baked, I: AnimIn) {
    const dt = Math.min(.05, I.dt), C = B.clips, G = GAIT[type];
    if (!this.init) { this.px = I.x; this.pz = I.z; this.init = true; }
    const v = dt > 0 ? Math.hypot(I.x - this.px, I.z - this.pz) / dt : 0; this.px = I.x; this.pz = I.z;
    this.spd += (Math.min(v, 12) - this.spd) * Math.min(1, dt * 10);
    if (I.flash && !this.flash) this.hit = 1; this.flash = !!I.flash;
    if (I.lunge && !this.lunge) this.atk = 1; this.lunge = !!I.lunge;
    this.hit = Math.max(0, this.hit - dt / .28); this.atk = Math.max(0, this.atk - dt / .4);
    this.blinkT -= dt; if (this.blinkT < -.12) this.blinkT = 1.5 + Math.random() * 3.5;
    this.blink = this.blinkT < 0 ? .12 : I.stun ? .45 : 1;
    const now = I.now + this.seed, T = (c: Clip) => now / c.dur;
    this.mix = 0;
    if (type === 'toad') {
      const air = I.air ?? 0;
      if (I.stun) this.set('a', C.stun, T(C.stun));
      else if (air > 0) this.set('a', C.jump, air);
      else if ((I.tongue ?? 0) > 0) this.set('a', C.tongue, 1);
      else this.set('a', C.idle, T(C.idle));
      if (this.hit > 0 && !air) { this.set('b', C.hit, 1 - this.hit); this.mix = 1; }
      return;
    }
    const w = clamp(this.spd / (G.ref * .5), 0, 1), run = type === 'hedgehog' ? 0 : sst(this.spd, G.ref * 1.05, G.ref * 1.9);
    const R = Math.max(run, I.charge ? 1 : 0), cad = this.spd <= G.ref ? this.spd / G.stride : G.ref / G.stride * (1 + .25 * run);
    this.ph += cad * Math.PI * 2 * dt;
    const pu = this.ph / (Math.PI * 2);
    if (I.stun) this.set('a', C.stun, T(C.stun));
    else if ((I.windup ?? 0) > 0 && C.windup) this.set('a', C.windup, T(C.windup));
    else if (I.charge && C.charge) this.set('a', C.charge, pu);
    else if (w < 1) { this.set('a', C.idle, T(C.idle)); this.set('b', C.walk, pu); this.mix = w; }
    else { this.set('a', C.walk, pu); this.set('b', C.run, pu); this.mix = R; }
    // one overlay at a time in the B slot: the base motion stays in A (the dominant of the two)
    const over = (c: Clip | undefined, u: number, k: number) => {
      if (!c || k <= 0) return;
      if (this.mix > .5) { this.a0 = this.b0; this.a1 = this.b1; this.fa = this.fb; }
      this.set('b', c, u); this.mix = clamp(k, 0, 1);
    };
    if (I.stun) return;
    if ((I.rear ?? 0) > 0) over(C.rear, T(C.rear ?? C.idle), I.rear!);
    else if (this.atk > 0) over(C.attack, 1 - this.atk, Math.sin((1 - this.atk) * Math.PI) * 2.5);
    else if (this.hit > 0) over(C.hit, 1 - this.hit, this.hit * 3);
    else if ((I.puff ?? 0) > 0) over(C.puff, I.puff!, I.puff! * 3);
  }
  death(B: Baked, t: number) { this.set('a', B.clips.death, t / B.clips.death.dur); this.mix = 0; this.blink = t > .15 ? .1 : 1; }
}

/** the stand-in values of one animal (copied into the instance) */
export interface HerdItem {
  key: string; st: AnimState; g: THREE.Object3D; body: THREE.Object3D; mat: THREE.MeshStandardMaterial; eyeMat: THREE.MeshBasicMaterial;
  spineMat?: THREE.MeshStandardMaterial; tongue?: THREE.Group;
}
export class Herd {
  private sp = new Map<string, Species>();
  private m = new THREE.Matrix4(); private mb = new THREE.Matrix4(); private mt = new THREE.Matrix4();
  constructor(private scene: THREE.Object3D, private puffScale = .3) {}
  species(key: string) { let s = this.sp.get(key); if (!s) { s = new Species(key, this.scene, this.puffScale); this.sp.set(key, s); } return s; }
  baked(key: string) { return this.species(key).B; }
  begin() { for (const s of this.sp.values()) s.begin(); }
  end() { for (const s of this.sp.values()) s.end(); }
  /** one instance of every species once (shader compile while the menu is open) */
  warm(keys: string[]) { for (const k of keys) { const s = this.species(k); s.begin(); this.m.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -.5, 0); this.m.toArray(s.matrix.array, 0); s.n = 1; s.end(); } }
  push(it: HerdItem) {
    const s = this.species(it.key); if (s.n >= s.cap) return;
    const i = s.n++, st = it.st;
    it.g.updateMatrix(); it.body.updateMatrix();
    this.m.multiplyMatrices(it.g.matrix, it.body.matrix); this.m.toArray(s.matrix.array, i * 16);
    const A = s.iA.array as Float32Array, Bv = s.iB.array as Float32Array, E = s.iEmis.array as Float32Array, Rm = s.iRim.array as Float32Array, Ec = s.eyeCol.array as Float32Array;
    A[i * 4] = st.a0; A[i * 4 + 1] = st.a1; A[i * 4 + 2] = st.fa; A[i * 4 + 3] = st.mix;
    Bv[i * 4] = st.b0; Bv[i * 4 + 1] = st.b1; Bv[i * 4 + 2] = st.fb; Bv[i * 4 + 3] = st.blink;
    const e = it.mat.emissive; E[i * 4] = e.r; E[i * 4 + 1] = e.g; E[i * 4 + 2] = e.b; E[i * 4 + 3] = it.mat.transparent ? it.mat.opacity : 1;
    const r = it.mat.userData.rim; Rm[i * 4] = r.uInk.value.r; Rm[i * 4 + 1] = r.uInk.value.g; Rm[i * 4 + 2] = r.uInk.value.b; Rm[i * 4 + 3] = r.uRim.value;
    const c = it.eyeMat.color; Ec[i * 4] = c.r; Ec[i * 4 + 1] = c.g; Ec[i * 4 + 2] = c.b; Ec[i * 4 + 3] = 1;
    if (s.spineEm) { const k = it.spineMat?.emissiveIntensity ?? 0, S = s.spineEm.array as Float32Array; S[i * 4] = k; S[i * 4 + 1] = k * .94; S[i * 4 + 2] = k * .75; S[i * 4 + 3] = 1; }
    if (it.tongue) this.placeTongue(s.B, st, it.tongue);
  }
  /** toad tongue at the baked head bone (frame A) */
  private placeTongue(B: Baked, st: AnimState, tongue: THREE.Group) {
    if (!tongue.visible) return;
    const h = B.bi.head, p = B.pivots[h];
    this.mb.fromArray(B.data, (st.a0 * B.nb + h) * 16);
    this.mt.makeTranslation(p[0], p[1] - .03, p[2] + .15);
    tongue.matrix.multiplyMatrices(this.mb, this.mt); tongue.matrixWorldNeedsUpdate = true;
  }
}
