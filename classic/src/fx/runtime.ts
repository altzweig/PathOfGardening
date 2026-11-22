// Runtime of the data-driven effect system. new FxSystem(scene, topScene) once, then
// new FxInstance(def, system) per effect; call instance.update(dt, ctx) every frame and instance.trigger() for bursts.
// Every layer reads its parameters live from the def object, so editing the JSON changes the effect immediately;
// only parameters marked `rebuild` in PARAMS need a rebuild of the layer (instance.rebuildLayer(i)).
import * as THREE from 'three';
import { fxAtlas, ATLAS_COLS } from './atlas';
import { BoltLayer, CrystalLayer, DecalLayer, EffectDef, Layer, LightLayer, ParticleLayer, RingLayer, SPRITES } from './schema';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rr = (r: [number, number]) => rnd(r[0], r[1]);
const DEG = Math.PI / 180;

/** where the effect is right now. origin: source point (hand / centre), dir: horizontal aim, targets: ground points of the targets */
export interface FxCtx { origin: THREE.Vector3; dir: THREE.Vector3; targets: THREE.Vector3[]; range: number; time: number }

export class FxSystem {
  atlas = fxAtlas();
  res = { value: new THREE.Vector2(1, 1) };
  constructor(public scene: THREE.Scene, public top: THREE.Scene) {}
  setResolution(w: number, h: number) { this.res.value.set(w, h); }
}

interface LayerRT {
  update(dt: number, ctx: FxCtx, emit: number): void; // emit: emission strength 0..1 for continuous emission this frame
  trigger(ctx: FxCtx): void;
  alive(): number;
  clear(): void;
  dispose(): void;
}

// world positions a layer acts at
const _b: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
function bases(l: { at: string; along?: [number, number] }, ctx: FxCtx, random = true): THREE.Vector3[] {
  if (l.at === 'ziele') { const n = Math.min(ctx.targets.length, 16); const out = _b.slice(0, n); for (let i = 0; i < n; i++) out[i].copy(ctx.targets[i]); return out; }
  if (l.at === 'strahl') { const a = l.along ?? [0, 1], t = random ? rnd(a[0], a[1]) : (a[0] + a[1]) / 2; _b[0].set(ctx.origin.x + ctx.dir.x * ctx.range * t, 0, ctx.origin.z + ctx.dir.z * ctx.range * t); return [_b[0]]; }
  return [_b[0].copy(ctx.origin)];
}

// ======================================================================================
// particles: instanced camera-facing quads, one draw call per layer, CPU simulation without per-frame allocation
// ======================================================================================
const PVERT = `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iA; attribute vec2 iB;
uniform float uFadeIn, uFadeOut, uOpacity, uStretch;
varying vec2 vUv; varying float vT; varying float vA; varying float vBr;
void main(){
  float size = iA.x, rot = iA.y, t = iA.z, tile = iB.x;
  vec4 mv = viewMatrix * vec4(iPos, 1.);
  vec2 c = position.xy, q;
  vec3 vv = (viewMatrix * vec4(iVel, 0.)).xyz; float l = length(vv.xy);
  if (uStretch > 0. && l > 1e-3) {
    vec2 ax = vv.xy / l, ay = vec2(-ax.y, ax.x);
    q = ax * c.x * (size + uStretch * l * .06) + ay * c.y * size;   // streak: length grows with the speed
  } else { float cs = cos(rot), sn = sin(rot); q = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) * size; }
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  float tx = mod(tile, ${ATLAS_COLS}.), ty = floor(tile / ${ATLAS_COLS}.);
  vUv = vec2((tx + c.x + .5) / ${ATLAS_COLS}., (${ATLAS_COLS - 1}. - ty + c.y + .5) / ${ATLAS_COLS}.);
  float fi = uFadeIn > 0. ? smoothstep(0., uFadeIn, t) : 1.;
  float fo = uFadeOut > 0. ? 1. - smoothstep(1. - uFadeOut, 1., t) : 1.;
  vA = uOpacity * fi * fo; vT = t; vBr = iB.y;
}`;
// colour = gradient over the lifetime; texHeat > 0 also shifts dim texture parts towards the end of the gradient
// (flame look: bright cores stay white-yellow, thin edges turn red), like the game's flamethrower
const PFRAG = `
uniform sampler2D uTex; uniform float uAdd, uIntensity, uTexHeat;
uniform vec3 uCol[6]; uniform float uPos[6]; uniform float uN;
varying vec2 vUv; varying float vT; varying float vA; varying float vBr;
vec3 grad(float t){
  vec3 c = uCol[0];
  for (int i = 1; i < 6; i++) { if (float(i) >= uN) break; float a = uPos[i - 1], b = uPos[i]; c = mix(c, uCol[i], clamp((t - a) / max(b - a, 1e-4), 0., 1.)); }
  return c; }
void main(){
  float tx = texture2D(uTex, vUv).r, v = tx * vA; if (v < .003) discard;
  float t = mix(vT, 1. - clamp(tx * (.35 + .85 * (1. - vT)), 0., 1.), uTexHeat);
  vec3 col = grad(t) * uIntensity * vBr;
  gl_FragColor = vec4(col * v, uAdd > .5 ? 0. : v);
}`;

class ParticleRT implements LayerRT {
  mesh: THREE.Mesh; private geo = new THREE.InstancedBufferGeometry(); private mat: THREE.ShaderMaterial;
  private n = 0; private max: number; private acc = 0;
  private p: Float32Array; private v: Float32Array; private age: Float32Array; private life: Float32Array; private s0: Float32Array; private s1: Float32Array;
  private rot: Float32Array; private spin: Float32Array; private tile: Float32Array; private br: Float32Array; private seed: Float32Array; private c: Float32Array; private bi: Uint8Array;
  private gPos: Float32Array; private gVel: Float32Array; private gA: Float32Array; private gB: Float32Array;
  private aPos: THREE.InstancedBufferAttribute; private aVel: THREE.InstancedBufferAttribute; private aA: THREE.InstancedBufferAttribute; private aB: THREE.InstancedBufferAttribute;
  private lastBases: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
  constructor(private L: ParticleLayer, sys: FxSystem, parent: THREE.Object3D, budget: number) {
    const m = this.max = Math.max(1, Math.round(L.max * budget)), F = (k: number) => new Float32Array(m * k);
    this.p = F(3); this.v = F(3); this.age = F(1); this.life = F(1); this.s0 = F(1); this.s1 = F(1); this.rot = F(1); this.spin = F(1); this.tile = F(1); this.br = F(1); this.seed = F(1); this.c = F(3); this.bi = new Uint8Array(m);
    this.gPos = F(3); this.gVel = F(3); this.gA = F(4); this.gB = F(2);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index; this.geo.setAttribute('position', quad.getAttribute('position'));
    const mk = (a: Float32Array, k: number) => { const at = new THREE.InstancedBufferAttribute(a, k); at.setUsage(THREE.DynamicDrawUsage); return at; };
    this.geo.setAttribute('iPos', this.aPos = mk(this.gPos, 3)); this.geo.setAttribute('iVel', this.aVel = mk(this.gVel, 3));
    this.geo.setAttribute('iA', this.aA = mk(this.gA, 4)); this.geo.setAttribute('iB', this.aB = mk(this.gB, 2));
    this.geo.instanceCount = 0;
    const add = L.blend === 'add';
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: sys.atlas }, uAdd: { value: add ? 1 : 0 }, uCol: { value: Array.from({ length: 6 }, () => new THREE.Color()) }, uPos: { value: new Array(6).fill(1) }, uN: { value: 2 },
        uFadeIn: { value: 0 }, uFadeOut: { value: 0 }, uOpacity: { value: 1 }, uIntensity: { value: 1 }, uStretch: { value: 0 }, uTexHeat: { value: 0 } },
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = add ? 20 : 10;
    parent.add(this.mesh);
  }
  private spawn(base: THREE.Vector3, bi: number, ctx: FxCtx) {
    if (this.n >= this.max) return;
    const L = this.L, i = this.n++, i3 = i * 3;
    // position on the emitter shape
    let ox = 0, oy = 0, oz = 0; const r = L.radius;
    switch (L.shape) {
      case 'kugel': { const u = Math.cbrt(Math.random()) * r, th = rnd(0, 6.283), ph = Math.acos(rnd(-1, 1)); ox = Math.sin(ph) * Math.cos(th) * u; oy = Math.cos(ph) * u; oz = Math.sin(ph) * Math.sin(th) * u; break; }
      case 'scheibe': { const u = Math.sqrt(Math.random()) * r, th = rnd(0, 6.283); ox = Math.cos(th) * u; oz = Math.sin(th) * u; break; }
      case 'ring': { const th = rnd(0, 6.283); ox = Math.cos(th) * r; oz = Math.sin(th) * r; break; }
      case 'kegel': { const d = Math.random() * r, a = rnd(-.5, .5) * L.spread * DEG; ox = (ctx.dir.x * Math.cos(a) - ctx.dir.z * Math.sin(a)) * d; oz = (ctx.dir.x * Math.sin(a) + ctx.dir.z * Math.cos(a)) * d; break; }
    }
    // direction + spread
    let dx = 0, dy = 1, dz = 0;
    switch (L.dir) {
      case 'vorne': dx = ctx.dir.x; dy = 0; dz = ctx.dir.z; break;
      case 'unten': dy = -1; break;
      case 'aussen': { const l = Math.hypot(ox, oy, oz); if (l > 1e-4) { dx = ox / l; dy = oy / l; dz = oz / l; } else { const th = rnd(0, 6.283); dx = Math.cos(th); dy = 0; dz = Math.sin(th); } break; }
      case 'zufall': { const th = rnd(0, 6.283), z = rnd(-1, 1), s = Math.sqrt(1 - z * z); dx = s * Math.cos(th); dy = z; dz = s * Math.sin(th); break; }
    }
    const half = L.spread * DEG / 2;
    if (half > 0) {
      if (L.flat) { const a = rnd(-half, half), cs = Math.cos(a), sn = Math.sin(a); const nx = dx * cs - dz * sn, nz = dx * sn + dz * cs; dx = nx; dz = nz; }
      else { // random direction inside a cone around (dx,dy,dz)
        const ct = rnd(Math.cos(half), 1), st = Math.sqrt(1 - ct * ct), ph = rnd(0, 6.283);
        let ax = Math.abs(dy) < .9 ? 0 : 1, ay = Math.abs(dy) < .9 ? 1 : 0, az = 0; // helper axis
        let ux = ay * dz - az * dy, uy = az * dx - ax * dz, uz = ax * dy - ay * dx; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
        const wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
        ax = st * Math.cos(ph); ay = st * Math.sin(ph);
        dx = dx * ct + ux * ax + wx * ay; dy = dy * ct + uy * ax + wy * ay; dz = dz * ct + uz * ax + wz * ay;
      }
    }
    const sp = rr(L.speed);
    this.p[i3] = (L.local ? 0 : base.x) + ox; this.p[i3 + 1] = (L.local ? 0 : base.y) + L.height + oy; this.p[i3 + 2] = (L.local ? 0 : base.z) + oz;
    this.c[i3] = L.local ? 0 : base.x; this.c[i3 + 1] = 0; this.c[i3 + 2] = L.local ? 0 : base.z;
    this.v[i3] = dx * sp; this.v[i3 + 1] = dy * sp; this.v[i3 + 2] = dz * sp;
    this.age[i] = 0; this.life[i] = Math.max(.02, rr(L.life));
    const f = 1 + rnd(-1, 1) * L.sizeVar; this.s0[i] = L.size[0] * f; this.s1[i] = L.size[1] * f;
    this.rot[i] = rnd(0, 6.283); this.spin[i] = rnd(-1, 1) * L.spin;
    const sp2 = SPRITES[L.sprite] ?? SPRITES.glow; this.tile[i] = sp2.tiles[0] + Math.floor(Math.random() * sp2.tiles[1]);
    this.br[i] = 1 + rnd(-1, 1) * L.brightVar; this.seed[i] = Math.random(); this.bi[i] = bi;
  }
  trigger(ctx: FxCtx) {
    const B = bases(this.L, ctx, false);
    for (let k = 0; k < this.L.burst; k++) { const bi = k % B.length; const b = this.L.at === 'strahl' ? bases(this.L, ctx)[0] : B[bi]; this.spawn(b, bi, ctx); }
  }
  update(dt: number, ctx: FxCtx, emit: number) {
    const L = this.L;
    if (emit > 0 && L.rate > 0) {
      this.acc += L.rate * dt * emit;
      const B = bases(L, ctx, false), nb = B.length;
      while (this.acc >= 1) { this.acc -= 1; if (!nb) continue;
        const bi = Math.floor(Math.random() * nb); const b = L.at === 'strahl' ? bases(L, ctx)[0] : B[bi]; this.spawn(b, bi, ctx); }
    } else this.acc = 0;
    for (let k = 0; k < 16; k++) { const b = L.at === 'ziele' ? ctx.targets[k] : ctx.origin; if (b) this.lastBases[k].copy(b); }
    // simulate + compact (dead particles are swapped with the last alive one)
    const g = L.gravity, drag = Math.max(0, 1 - L.drag * dt), tb = L.turb, tf = L.turbFreq, orb = L.orbit * dt, co = Math.cos(orb), so = Math.sin(orb), t = ctx.time;
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.copy(--this.n, i); continue; }
      const i3 = i * 3; let px = this.p[i3], py = this.p[i3 + 1], pz = this.p[i3 + 2], vx = this.v[i3], vy = this.v[i3 + 1], vz = this.v[i3 + 2];
      if (tb > 0) { const s = this.seed[i] * 6.28;
        vx += Math.sin(py * tf * 1.7 + t * 1.3 + s) * tb * dt; vy += Math.sin(pz * tf * 1.3 + t * 1.7 + s * 1.3) * tb * .5 * dt; vz += Math.cos(px * tf * 1.5 + t * 1.1 + s * .7) * tb * dt; }
      vy -= g * dt; vx *= drag; vy *= drag; vz *= drag;
      px += vx * dt; py += vy * dt; pz += vz * dt;
      if (orb !== 0) { const cx = this.c[i3], cz = this.c[i3 + 2], rx = px - cx, rz = pz - cz; px = cx + rx * co - rz * so; pz = cz + rx * so + rz * co;
        const nvx = vx * co - vz * so; vz = vx * so + vz * co; vx = nvx; }
      if (L.floor && py < .03 + (L.local ? -this.lastBases[this.bi[i]].y : 0)) { py = .03; vy = Math.abs(vy) * .35; vx *= .7; vz *= .7; this.spin[i] *= .5; }
      this.p[i3] = px; this.p[i3 + 1] = py; this.p[i3 + 2] = pz; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
    // upload
    for (let j = 0; j < this.n; j++) {
      const j3 = j * 3, e = this.age[j] / this.life[j], b = L.local ? this.lastBases[this.bi[j]] : null;
      this.gPos[j3] = this.p[j3] + (b ? b.x : 0); this.gPos[j3 + 1] = this.p[j3 + 1] + (b ? b.y : 0); this.gPos[j3 + 2] = this.p[j3 + 2] + (b ? b.z : 0);
      this.gVel[j3] = this.v[j3]; this.gVel[j3 + 1] = this.v[j3 + 1]; this.gVel[j3 + 2] = this.v[j3 + 2];
      if (L.orbit !== 0) { const rx = this.p[j3] - this.c[j3], rz = this.p[j3 + 2] - this.c[j3 + 2]; this.gVel[j3] -= rz * L.orbit; this.gVel[j3 + 2] += rx * L.orbit; } // swirl: streaks follow the circle
      this.gA[j * 4] = this.s0[j] + (this.s1[j] - this.s0[j]) * (1 - (1 - e) * (1 - e)); this.gA[j * 4 + 1] = this.rot[j]; this.gA[j * 4 + 2] = e; this.gA[j * 4 + 3] = this.seed[j];
      this.gB[j * 2] = this.tile[j]; this.gB[j * 2 + 1] = this.br[j];
    }
    for (const [a, k] of [[this.aPos, 3], [this.aVel, 3], [this.aA, 4], [this.aB, 2]] as [THREE.InstancedBufferAttribute, number][]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, this.n) * k); a.needsUpdate = true;
    }
    this.geo.instanceCount = this.n;
    // uniforms
    const U = this.mat.uniforms, stops = L.colors.length ? L.colors : [[0, '#ffffff']] as [number, string][];
    const sorted = [...stops].sort((a, b) => a[0] - b[0]).slice(0, 6);
    sorted.forEach(([p, c], k) => { (U.uCol.value as THREE.Color[])[k].set(c); U.uPos.value[k] = p; });
    U.uN.value = sorted.length;
    U.uFadeIn.value = L.fadeIn; U.uFadeOut.value = L.fadeOut; U.uOpacity.value = L.opacity; U.uIntensity.value = L.intensity; U.uStretch.value = L.stretch; U.uTexHeat.value = L.texHeat;
  }
  private copy(from: number, to: number) {
    if (from === to) return;
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) { this.p[t3 + k] = this.p[f3 + k]; this.v[t3 + k] = this.v[f3 + k]; this.c[t3 + k] = this.c[f3 + k]; }
    this.age[to] = this.age[from]; this.life[to] = this.life[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.rot[to] = this.rot[from]; this.spin[to] = this.spin[from];
    this.tile[to] = this.tile[from]; this.br[to] = this.br[from]; this.seed[to] = this.seed[from]; this.bi[to] = this.bi[from];
  }
  alive() { return this.n; }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

// ======================================================================================
// ground decals: instanced quads with an age per spot; one shader per style
// ======================================================================================
const DVERT = `
attribute vec4 aD; // age, life, seed, grow
varying vec2 vUv; varying vec2 vW; varying float vAge; varying float vLife; varying float vSeed;
void main(){ vUv = uv; vAge = aD.x; vLife = aD.y; vSeed = aD.z;
  float g = aD.w > 0. ? smoothstep(0., aD.w, aD.x) : 1.; g = .35 + .65 * g;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position * vec3(g, 1., g), 1.); vW = wp.xz;
  gl_Position = (aD.x >= aD.y) ? vec4(2., 2., 2., 1.) : projectionMatrix * viewMatrix * wp; }`;
const DHEAD = `
varying vec2 vUv; varying vec2 vW; varying float vAge; varying float vLife; varying float vSeed;
uniform vec3 uA, uB; uniform float uInt, uOp, uNoise, uPulse, uTime;
vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 1.7; a *= .5; } return v; }
float cracks(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = h2(i + g); float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }
float blob(float soft){ vec2 c = vUv - .5; float a = atan(c.y, c.x);
  float d = length(c) * 2. + (vnoise(vec2(a * 2.5 + vSeed * 20., vSeed * 7.)) - .5) * .35; return smoothstep(1., 1. - soft, d); }
float life(){ float k = vAge / vLife; return 1. - smoothstep(.7, 1., k); }
float pulse(){ return 1. + uPulse * .5 * sin(uTime * 5. + vSeed * 30.); }`;
const DFRAG: Record<DecalLayer['style'], string> = {
  glut: `void main(){
    float b = blob(.75); if (b <= 0.) discard;
    float heat = exp(-vAge / max(.05, vLife * .3)) * smoothstep(0., .1, vAge + .02);
    float c = cracks(vW * uNoise * 1.3), c2 = cracks(vW * uNoise * 3.1 + 7.);
    float line = 1. - smoothstep(0., .09, c), fine = 1. - smoothstep(0., .06, c2);
    float t = clamp(heat * b * (.5 + .9 * line + .35 * fine) * pulse(), 0., 1.);
    vec3 col = mix(uB * .4, uB, smoothstep(0., .35, t)); col = mix(col, uA, smoothstep(.35, 1., t));
    float glow = heat * b * (.12 + .9 * line + .35 * fine) * life();
    gl_FragColor = vec4(col * glow * uInt * uOp, 0.); }`,
  frost: `void main(){
    float b = blob(.5); if (b <= 0.) discard;
    float n = fbm(vW * uNoise);
    float c = cracks(vW * uNoise * 1.6 + 3.), line = 1. - smoothstep(0., .05, c);
    float k = life() * b;
    float a = k * (.2 + .5 * n * n + .35 * line) * uOp;
    vec3 col = mix(uB, uA, clamp(line * .9 + n * .4, 0., 1.));
    float spark = step(.985, hash(floor(vW * 40.) + floor(uTime * 3.))) * k;
    gl_FragColor = vec4(col * a * uInt + uA * (line * .35 + spark) * k * uInt, a); }`,
  gift: `void main(){
    float b = blob(.35); if (b <= 0.) discard;
    float n = fbm(vW * uNoise + vec2(uTime * .15, -uTime * .1));
    vec2 cell = vW * uNoise * 2.2; vec2 id = floor(cell), f = fract(cell) - .5;
    float ph = fract(uTime * (.4 + hash(id) * .6) + hash(id + 3.));
    float bub = (1. - smoothstep(.0, .06, abs(length(f) - ph * .35))) * (1. - ph) * step(.55, hash(id + 9.));
    float k = life() * b;
    float a = k * (.65 + .35 * n) * uOp;
    vec3 col = mix(uB, uA, n * n * 1.6) ;
    gl_FragColor = vec4(col * a * uInt * .6 + uA * (bub * 1.2 + smoothstep(.6, .9, n) * .4) * k * uInt * pulse(), a); }`,
  brand: `void main(){
    float b = blob(.8); if (b <= 0.) discard;
    float n = fbm(vW * uNoise);
    float a = b * life() * (.55 + .45 * n) * uOp * smoothstep(0., .3, vAge);
    gl_FragColor = vec4(mix(uA, uB, n) * a, a); }`,
  heil: `void main(){
    vec2 c = vUv - .5; float d = length(c) * 2., a = atan(c.y, c.x);
    float rot = uTime * .6;
    float ring = (1. - smoothstep(0., .035, abs(d - .92))) + (1. - smoothstep(0., .02, abs(d - .72))) * .7;
    float ticks = (1. - smoothstep(0., .03, abs(d - .82))) * step(.55, fract((a + rot) * 12. / 6.283));
    float inner = smoothstep(1., 0., d) * .25;
    float k = life() * pulse();
    vec3 col = mix(uA, uB, d);
    gl_FragColor = vec4(col * (ring + ticks + inner) * k * uInt * uOp, 0.); }`,
  schein: `void main(){
    vec2 c = vUv - .5; float d = length(c) * 2.; if (d > 1.) discard;
    float g = pow(1. - d, 1.6); float k = life() * pulse();
    gl_FragColor = vec4(mix(uB, uA, g) * g * k * uInt * uOp, 0.); }`,
};

class DecalRT implements LayerRT {
  private im: THREE.InstancedMesh; private D: Float32Array; private head = 0; private acc = 0; private m = new THREE.Matrix4(); private mat: THREE.ShaderMaterial; private n: number;
  constructor(private L: DecalLayer, parent: THREE.Object3D) {
    const n = this.n = Math.max(1, L.max), geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.D = new Float32Array(n * 4); for (let i = 0; i < n; i++) { this.D[i * 4] = 1; this.D[i * 4 + 1] = 1; }
    geo.setAttribute('aD', new THREE.InstancedBufferAttribute(this.D, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uInt: { value: 1 }, uOp: { value: 1 }, uNoise: { value: 2 }, uPulse: { value: 0 }, uTime: { value: 0 } },
      vertexShader: DVERT, fragmentShader: DHEAD + DFRAG[L.style], transparent: true, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.im = new THREE.InstancedMesh(geo, this.mat, n); this.im.frustumCulled = false; this.im.renderOrder = 2;
    this.m.makeScale(0, 0, 0); for (let i = 0; i < n; i++) this.im.setMatrixAt(i, this.m);
    parent.add(this.im);
  }
  private spot(ctx: FxCtx) {
    const L = this.L, B = bases(L, ctx);
    for (const b of (L.at === 'ziele' ? B : [B[0]])) {
      const i = this.head; this.head = (this.head + 1) % this.n;
      const r = rr(L.radius), a = rnd(0, 6.283), s = Math.sqrt(Math.random()) * L.scatter;
      this.D[i * 4] = 0; this.D[i * 4 + 1] = rr(L.life); this.D[i * 4 + 2] = Math.random(); this.D[i * 4 + 3] = L.grow;
      this.m.makeRotationY(rnd(0, 6.283)); this.m.scale(new THREE.Vector3(r * 2, 1, r * 2));
      this.m.setPosition(b.x + Math.cos(a) * s, .02 + (i % 9) * .0007, b.z + Math.sin(a) * s);
      this.im.setMatrixAt(i, this.m); this.im.instanceMatrix.needsUpdate = true;
    }
  }
  trigger(ctx: FxCtx) { for (let k = 0; k < this.L.count; k++) this.spot(ctx); }
  update(dt: number, ctx: FxCtx, emit: number) {
    const L = this.L;
    if (emit > 0 && L.rate > 0) { this.acc += L.rate * dt * emit; while (this.acc >= 1) { this.acc -= 1; this.spot(ctx); } } else this.acc = 0;
    for (let i = 0; i < this.n; i++) if (this.D[i * 4] < this.D[i * 4 + 1]) this.D[i * 4] += dt;
    (this.im.geometry.getAttribute('aD') as THREE.BufferAttribute).needsUpdate = true;
    const U = this.mat.uniforms; U.uA.value.set(L.colorA); U.uB.value.set(L.colorB); U.uInt.value = L.intensity; U.uOp.value = L.opacity; U.uNoise.value = L.noise; U.uPulse.value = L.pulse; U.uTime.value = ctx.time;
  }
  alive() { let k = 0; for (let i = 0; i < this.n; i++) if (this.D[i * 4] < this.D[i * 4 + 1]) k++; return k; }
  clear() { for (let i = 0; i < this.n; i++) this.D[i * 4] = this.D[i * 4 + 1]; }
  dispose() { this.im.removeFromParent(); this.im.geometry.dispose(); this.mat.dispose(); }
}

// ======================================================================================
// lightning (from the game's lemon bolt): fractal channel by midpoint displacement + forking side arms,
// drawn as screen-space ribbons with a minimum width of ~1 px
// ======================================================================================
const BVERT = `attribute vec3 pOther; attribute vec4 wi; uniform vec2 uRes; uniform float uK; varying float vS; varying float vI;
void main(){
  vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.), c1 = projectionMatrix * modelViewMatrix * vec4(pOther, 1.);
  vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * uRes; float l = length(d); d = l > 1e-4 ? d / l : vec2(1., 0.);
  if (wi.w < 0.) d = -d;
  vec2 n = vec2(-d.y, d.x);
  float px = wi.x * projectionMatrix[1][1] * .5 * uRes.y / c0.w, pw = max(px, 1.3);
  float side = sign(wi.w) * (abs(wi.w) > 1.5 ? 1. : -1.);
  c0.xy += n * side * pw * 4. * c0.w / uRes;
  vS = side; vI = wi.y * (px / pw) * pow(max(0., 1. - uK), 1. + wi.z * 1.8);
  gl_Position = c0; }`;
const BFRAG = `uniform float uOp; uniform vec3 uCore; uniform vec3 uHalo; varying float vS; varying float vI;
void main(){ float s = abs(vS) * 4.; float core = exp(-s * s * 1.6); float halo = exp(-s * s * .16) * .16;
  gl_FragColor = vec4((uCore * core + uHalo * halo) * vI * uOp, 1.); }`;
type P3 = THREE.Vector3;
function channel(a: P3, b: P3, rough: number, step: number) {
  let pts = [a.clone(), b.clone()];
  const dir = b.clone().sub(a), len = dir.length() || 1; dir.divideScalar(len);
  const h = new THREE.Vector3(-dir.z, 0, dir.x); if (h.lengthSq() < 1e-6) h.set(1, 0, 0); h.normalize();
  const v = new THREE.Vector3().crossVectors(dir, h).normalize();
  let off = len * rough;
  while (pts.length < 129 && len / (pts.length - 1) > step) {
    const n: P3[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) { const m = pts[i - 1].clone().lerp(pts[i], .5).addScaledVector(h, rnd(-off, off)).addScaledVector(v, rnd(-off, off) * .55); n.push(m, pts[i]); }
    pts = n; off *= .52;
  }
  return pts;
}
class BoltRT implements LayerRT {
  private bolts: { m: THREE.Mesh; t: number; life: number; restrike: number }[] = []; private acc = 0; private parent: THREE.Object3D;
  onStrike: (() => void) | null = null;
  constructor(private L: BoltLayer, private sys: FxSystem) { this.parent = L.bloom ? sys.scene : sys.top; }
  strike(ctx: FxCtx) {
    const L = this.L, T = ctx.targets.slice(0, Math.max(1, L.count)), segs: [P3, P3, number][] = [];
    const hit = (t: P3) => new THREE.Vector3(t.x, L.hitY, t.z);
    if (L.path === 'himmel' || !T.length) {
      for (const t of (T.length ? T : [ctx.origin])) segs.push([new THREE.Vector3(t.x + rnd(-1.5, 1.5), L.startY, t.z + rnd(-1.5, 1.5)), hit(t), 0]);
    } else if (L.path === 'faecher') for (const t of T) segs.push([ctx.origin.clone(), hit(t), 0]);
    else { // chain: origin -> nearest target -> next nearest ...
      const left = [...T]; let from = ctx.origin.clone(), d = 0;
      while (left.length) { left.sort((a, b) => a.distanceToSquared(from) - b.distanceToSquared(from)); const t = hit(left.shift()!); segs.push([from, t, d++]); from = t; }
    }
    this.build(segs);
    this.onStrike?.();
  }
  private build(segs: [P3, P3, number][]) {
    const L = this.L, N = segs.length, W = L.width;
    const pBranch = L.branch, maxGen = L.depth, budget = 260 + N * 90;
    const strands: { pts: P3[]; w0: number; w1: number; i0: number; i1: number; gen: number }[] = []; let used = 0;
    const grow = (s: typeof strands[0], dirHint: P3, lenRef: number) => {
      strands.push(s); used += s.pts.length;
      if (s.gen >= maxGen) return;
      const n = s.pts.length, p = pBranch * Math.pow(.62, s.gen);
      for (let i = 2; i < n - 3; i++) {
        if (used > budget || Math.random() > p) continue;
        const t = i / (n - 1), a = s.pts[i];
        const loc = s.pts[Math.min(n - 1, i + 2)].clone().sub(s.pts[Math.max(0, i - 2)]).normalize().lerp(dirHint, .5).normalize();
        const ang = (Math.random() < .5 ? -1 : 1) * rnd(.3, .95), c = Math.cos(ang), sn = Math.sin(ang);
        const d = new THREE.Vector3(loc.x * c - loc.z * sn, loc.y - rnd(0, .35), loc.x * sn + loc.z * c).normalize();
        const Ln = lenRef * rnd(.14, .42) * (1 - t * .5) * (1 + Math.min(N, 10) * .05);
        const w = (s.w0 + (s.w1 - s.w0) * t) * rnd(.45, .62), it = (s.i0 + (s.i1 - s.i0) * t) * rnd(.5, .7);
        grow({ pts: channel(a, a.clone().addScaledVector(d, Ln), rnd(.16, .26), .045), w0: w, w1: 0, i0: it, i1: it * .15, gen: s.gen + 1 }, d, Ln);
      }
    };
    for (const [a, b, depth] of segs) {
      const len = a.distanceTo(b), w = W * Math.pow(.85, depth), it = Math.pow(.9, depth), dir = b.clone().sub(a).normalize();
      grow({ pts: channel(a, b, L.rough * rnd(.8, 1.2), .05), w0: w, w1: w * .7, i0: it, i1: it * .85, gen: 0 }, dir, len);
      for (let k = 0; k < L.twigs && used < budget * 1.2; k++) {
        const an = rnd(0, 6.283), Ln = rnd(.15, .35), e = b.clone().add(new THREE.Vector3(Math.cos(an) * Ln, -rnd(.1, .35), Math.sin(an) * Ln)); e.y = Math.max(.02, e.y);
        strands.push({ pts: channel(b, e, .25, .04), w0: w * .5, w1: 0, i0: it * .6, i1: .05, gen: 1 }); used += 8;
      }
    }
    let nSeg = 0; for (const s of strands) nSeg += s.pts.length - 1;
    const pos = new Float32Array(nSeg * 12), oth = new Float32Array(nSeg * 12), wi = new Float32Array(nSeg * 16), idx = new Uint32Array(nSeg * 6);
    let v = 0, q = 0;
    for (const s of strands) {
      const n = s.pts.length;
      for (let i = 0; i < n - 1; i++) {
        const a = s.pts[i], b = s.pts[i + 1], ta = i / (n - 1), tb = (i + 1) / (n - 1);
        const wa = s.w0 + (s.w1 - s.w0) * ta, wb = s.w0 + (s.w1 - s.w0) * tb, ia = s.i0 + (s.i1 - s.i0) * ta, ib = s.i0 + (s.i1 - s.i0) * tb;
        const verts: [P3, P3, number, number, number][] = [[a, b, wa, ia, 1], [a, b, wa, ia, 2], [b, a, wb, ib, -2], [b, a, wb, ib, -1]];
        for (const [p, o, w, it, code] of verts) { pos.set([p.x, p.y, p.z], v * 3); oth.set([o.x, o.y, o.z], v * 3); wi.set([w, it, s.gen, code], v * 4); v++; }
        const k = v - 4; idx.set([k, k + 1, k + 2, k, k + 2, k + 3], q); q += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('pOther', new THREE.BufferAttribute(oth, 3)); g.setAttribute('wi', new THREE.BufferAttribute(wi, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uRes: this.sys.res, uOp: { value: 1 }, uK: { value: 0 }, uCore: { value: new THREE.Color(L.core).multiplyScalar(1.5) }, uHalo: { value: new THREE.Color(L.halo).multiplyScalar(1.2) } },
      vertexShader: BVERT, fragmentShader: BFRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 30; this.parent.add(m);
    this.bolts.push({ m, t: 0, life: L.life, restrike: rnd(.07, .11) });
  }
  trigger(ctx: FxCtx) { this.strike(ctx); }
  update(dt: number, ctx: FxCtx, emit: number) {
    if (emit > .5) { this.acc += dt; if (this.acc >= this.L.interval) { this.acc = 0; this.strike(ctx); } } else this.acc = this.L.interval;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t += dt; const k = b.t / b.life, mat = b.m.material as THREE.ShaderMaterial;
      if (k >= 1) { b.m.removeFromParent(); b.m.geometry.dispose(); mat.dispose(); this.bolts.splice(i, 1); continue; }
      const dip = this.L.restrike && b.t > b.restrike * .55 && b.t < b.restrike ? .25 : 1;
      mat.uniforms.uK.value = k; mat.uniforms.uOp.value = this.L.intensity * dip * (.82 + Math.random() * .18) * (k < .1 ? 1.25 : 1);
    }
  }
  alive() { return this.bolts.length; }
  clear() { for (const b of this.bolts) { b.m.removeFromParent(); b.m.geometry.dispose(); (b.m.material as THREE.Material).dispose(); } this.bolts.length = 0; }
  dispose() { this.clear(); }
}

// ======================================================================================
// shockwave rings
// ======================================================================================
const RFRAG = `varying vec2 vUv; uniform float uR, uTh, uSoft, uA; uniform vec3 uC; uniform float uAdd;
void main(){ float d = length(vUv - .5) * 2.; // 0..1 = outer radius of the quad
  float x = abs(d - uR) / max(uTh, 1e-3); float v = 1. - smoothstep(1. - uSoft, 1., x); v *= smoothstep(0., .02, uR);
  if (v <= .002) discard; float a = v * uA; gl_FragColor = vec4(uC * a, uAdd > .5 ? 0. : a); }`;
class RingRT implements LayerRT {
  private rings: { m: THREE.Mesh; t: number; x: number; z: number }[] = []; private queue: { at: number; x: number; z: number }[] = []; private clock = 0; private loopT = 0;
  private geo = new THREE.PlaneGeometry(1, 1);
  constructor(private L: RingLayer, private parent: THREE.Object3D) { this.geo.rotateX(-Math.PI / 2); }
  trigger(ctx: FxCtx) {
    const B = bases(this.L, ctx, false);
    for (const b of B) for (let k = 0; k < this.L.count; k++) this.queue.push({ at: this.clock + k * this.L.interval, x: b.x, z: b.z });
  }
  update(dt: number, ctx: FxCtx, emit: number) {
    const L = this.L; this.clock += dt;
    if (emit > .5 && L.loopEvery > 0) { this.loopT += dt; if (this.loopT >= L.loopEvery) { this.loopT = 0; this.trigger(ctx); } }
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].at <= this.clock) {
      const q = this.queue.splice(i, 1)[0], add = L.blend === 'add';
      const mat = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0 }, uTh: { value: .1 }, uSoft: { value: .5 }, uA: { value: 1 }, uC: { value: new THREE.Color() }, uAdd: { value: add ? 1 : 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`, fragmentShader: RFRAG,
        transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor });
      const m = new THREE.Mesh(this.geo, mat); m.renderOrder = 15; m.frustumCulled = false; this.parent.add(m); this.rings.push({ m, t: 0, x: q.x, z: q.z });
    }
    const cA = new THREE.Color(L.colorA), cB = new THREE.Color(L.colorB);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / L.life, mat = r.m.material as THREE.ShaderMaterial;
      if (k >= 1) { r.m.removeFromParent(); mat.dispose(); this.rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 2.2), rad = L.radius[0] + (L.radius[1] - L.radius[0]) * e, outer = Math.max(L.radius[0], L.radius[1]) + L.thick;
      r.m.position.set(r.x, L.y + .03, r.z); r.m.scale.setScalar(outer * 2);
      const U = mat.uniforms; U.uR.value = rad / outer; U.uTh.value = L.thick / outer * (1 - k * .5); U.uSoft.value = L.soft;
      U.uA.value = L.intensity * (1 - k) * (1 - k * .3); U.uC.value.copy(cA).lerp(cB, k);
    }
  }
  alive() { return this.rings.length; }
  clear() { for (const r of this.rings) { r.m.removeFromParent(); (r.m.material as THREE.Material).dispose(); } this.rings.length = 0; this.queue.length = 0; }
  dispose() { this.clear(); this.geo.dispose(); }
}

// ======================================================================================
// ice crystals: instanced shards that grow out of the ground, hold and break apart
// ======================================================================================
function shardGeo() {
  const g = new THREE.CylinderGeometry(.5, .5, 1, 6, 1); g.translate(0, .5, 0);
  const tip = new THREE.ConeGeometry(.5, .6, 6, 1); tip.translate(0, 1.3, 0);
  const pos = [...(g.toNonIndexed().getAttribute('position').array as Float32Array), ...(tip.toNonIndexed().getAttribute('position').array as Float32Array)];
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.scale(1, 1 / 1.6, 1); out.computeVertexNormals();
  return out;
}
const CVERT = `varying vec3 vN; varying vec3 vV; varying float vH;
void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.); vH = position.y;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const CFRAG = `varying vec3 vN; varying vec3 vV; varying float vH; uniform vec3 uC, uRim; uniform float uInt, uOp;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float fr = pow(1. - abs(dot(n, vV)), 2.2); float l = .55 + .45 * max(0., dot(n, normalize(vec3(.4, .8, .3))));
  vec3 col = uC * l * (.6 + .4 * vH) + uRim * fr * 1.4;
  float a = clamp(uOp * (.55 + .45 * fr), 0., 1.);
  gl_FragColor = vec4(col * uInt * a, a); }`;
class CrystalRT implements LayerRT {
  private im: THREE.InstancedMesh; private mat: THREE.ShaderMaterial; private t = -1; private loopT = 0; private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private s = new THREE.Vector3();
  private seeds: { x: number; z: number; h: number; w: number; yaw: number; tilt: number; d: number }[] = [];
  constructor(private L: CrystalLayer, parent: THREE.Object3D) {
    this.mat = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uInt: { value: 1 }, uOp: { value: 1 } }, vertexShader: CVERT, fragmentShader: CFRAG,
      transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.im = new THREE.InstancedMesh(shardGeo(), this.mat, Math.max(1, L.count)); this.im.frustumCulled = false; this.im.count = 0; this.im.renderOrder = 12;
    parent.add(this.im);
  }
  trigger(ctx: FxCtx) {
    const L = this.L, B = bases(L, ctx, false); this.seeds = [];
    const per = Math.max(1, Math.floor(L.count / B.length));
    for (const b of B) for (let k = 0; k < per && this.seeds.length < L.count; k++) {
      const a = (k / per) * 6.283 + rnd(-.3, .3), r = rnd(L.radius[0], L.radius[1]);
      this.seeds.push({ x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r, h: rr(L.height), w: L.width * rnd(.7, 1.3), yaw: a, tilt: L.tilt * DEG * rnd(.6, 1.2), d: (r - L.radius[0]) / Math.max(.01, L.radius[1] - L.radius[0]) * L.grow * .8 });
    }
    this.t = 0;
  }
  update(dt: number, ctx: FxCtx, emit: number) {
    const L = this.L;
    if (emit > .5 && L.loopEvery > 0) { this.loopT += dt; if (this.loopT >= L.loopEvery) { this.loopT = 0; this.trigger(ctx); } }
    const U = this.mat.uniforms; U.uC.value.set(L.color); U.uRim.value.set(L.rim); U.uInt.value = L.intensity; U.uOp.value = L.opacity;
    if (this.t < 0) { this.im.count = 0; return; }
    this.t += dt; let any = false;
    this.seeds.forEach((s, i) => {
      const t = this.t - s.d; let sy = 0, sx = 1, sink = 0;
      if (t > 0) {
        if (t < L.grow) { const k = t / L.grow; sy = 1 + Math.sin(k * Math.PI) * .15 - (1 - k) * (1 - k); sy = Math.max(0, Math.min(1.15, sy)); }
        else if (t < L.grow + L.hold) sy = 1;
        else { const k = (t - L.grow - L.hold) / L.shatter; if (k < 1) { sy = 1 - k * .4; sx = 1 - k; sink = k * s.h * .5; } }
      }
      if (sy > 0 && sx > 0) any = true;
      // lean outwards: yaw towards the shard's direction, then tilt around the local X axis
      this.q.setFromEuler(this.e.set(s.tilt, -s.yaw + Math.PI / 2, 0, 'YXZ'));
      this.p.set(s.x, -sink, s.z); this.s.set(s.w * sx, s.h * sy + 1e-4, s.w * sx);
      this.m.compose(this.p, this.q, this.s);
      this.im.setMatrixAt(i, this.m);
    });
    this.im.count = this.seeds.length; this.im.instanceMatrix.needsUpdate = true;
    if (!any && this.t > L.grow + L.hold + L.shatter + 2) this.t = -1;
  }
  alive() { return this.t >= 0 ? this.seeds.length : 0; }
  clear() { this.t = -1; this.im.count = 0; }
  dispose() { this.im.removeFromParent(); this.im.geometry.dispose(); this.mat.dispose(); }
}

// ======================================================================================
// point light: steady (life 0) with flicker, or a flash that decays after each trigger
// ======================================================================================
class LightRT implements LayerRT {
  light: THREE.PointLight; private flash = 0; private on = 0;
  constructor(private L: LightLayer, parent: THREE.Object3D) { this.light = new THREE.PointLight(L.color, 0, L.distance, 1.6); parent.add(this.light); }
  trigger() { this.flash = 1; }
  update(dt: number, ctx: FxCtx, emit: number) {
    const L = this.L, B = bases(L, ctx, false);
    // several targets: light sits in their middle
    const c = new THREE.Vector3(); for (const b of B) c.add(b); c.divideScalar(Math.max(1, B.length));
    this.light.position.set(c.x, L.y, c.z); // y = height above the ground
    const target = L.life > 0 ? 0 : emit;
    this.on += (target - this.on) * Math.min(1, L.fadeIn > 0 ? dt / L.fadeIn : 1);
    if (L.life > 0) this.flash = Math.max(0, this.flash - dt / L.life);
    const t = ctx.time * L.flickerSpeed, fl = 1 - L.flicker * (.5 + .3 * Math.sin(t) * Math.sin(t * 1.73 + 1) + .2 * Math.sin(t * 3.1));
    const k = L.life > 0 ? this.flash * this.flash : this.on;
    this.light.color.set(L.color); this.light.distance = L.distance; this.light.intensity = L.intensity * k * fl;
  }
  alive() { return this.light.intensity > .01 ? 1 : 0; }
  clear() { this.flash = 0; this.on = 0; this.light.intensity = 0; }
  dispose() { this.light.removeFromParent(); this.light.dispose(); }
}

// ======================================================================================
// effect instance
// ======================================================================================
export class FxInstance {
  group = new THREE.Group();
  private rts: (LayerRT | null)[] = [];
  private pending: { at: number; i: number }[] = [];
  private clock = 0; private sinceTrig = 1e9; private power = 0; private cycle = 0;
  active = false; budget = 1;
  constructor(public def: EffectDef, private sys: FxSystem) {
    sys.scene.add(this.group);
    this.rebuildAll();
  }
  private make(L: Layer): LayerRT {
    switch (L.type) {
      case 'particles': return new ParticleRT(L, this.sys, this.group, this.budget);
      case 'decal': return new DecalRT(L, this.group);
      case 'bolt': { const b = new BoltRT(L, this.sys); b.onStrike = () => this.onStrike(b); return b; }
      case 'ring': return new RingRT(L, this.group);
      case 'crystals': return new CrystalRT(L, this.group);
      case 'light': return new LightRT(L, this.group);
    }
  }
  /** loop effects: every bolt strike fires the burst parts of the other layers (impact sparks, rings, light flashes) */
  private onStrike(src: BoltRT) {
    if (this.def.mode !== 'loop' || !this.lastCtx) return;
    this.def.layers.forEach((L, i) => { const rt = this.rts[i]; if (rt && rt !== src && L.on && L.type !== 'bolt' && L.type !== 'crystals') this.pending.push({ at: this.clock + L.delay, i }); });
  }
  private lastCtx: FxCtx | null = null;
  rebuildAll() { for (const r of this.rts) r?.dispose(); this.rts = this.def.layers.map(L => this.make(L)); this.pending = []; }
  rebuildLayer(i: number) { this.rts[i]?.dispose(); this.rts[i] = this.def.layers[i] ? this.make(this.def.layers[i]) : null; }
  /** layers were added / removed / reordered */
  syncLayers() { this.rebuildAll(); }
  setBudget(b: number) { if (b !== this.budget) { this.budget = b; this.rebuildAll(); } }
  trigger() {
    this.sinceTrig = 0;
    this.def.layers.forEach((L, i) => { if (L.on) this.pending.push({ at: this.clock + L.delay, i }); });
  }
  setActive(on: boolean) { if (on && !this.active) { this.cycle = 0; this.trigger(); } this.active = on; }
  update(dt: number, ctx: FxCtx) {
    this.lastCtx = ctx; this.clock += dt; this.sinceTrig += dt;
    const D = this.def;
    if (D.mode === 'burst') {
      if (this.active && D.repeat > 0 && this.sinceTrig >= D.repeat) this.trigger();
    } else {
      // loop: on for `repeat` s, then off for `offTime` s (both 0 = always on)
      let want = this.active;
      if (this.active && D.repeat > 0 && D.offTime > 0) { this.cycle += dt; const c = this.cycle % (D.repeat + D.offTime); want = c < D.repeat; if (want && this.power < .02 && c < dt * 1.5) this.trigger(); }
      const target = want ? 1 : 0, r = D.ramp > 0 ? dt / D.ramp : 1;
      this.power = target > this.power ? Math.min(1, this.power + r) : Math.max(0, this.power - r);
    }
    for (let k = this.pending.length - 1; k >= 0; k--) if (this.pending[k].at <= this.clock) { const p = this.pending.splice(k, 1)[0]; this.rts[p.i]?.trigger(ctx); }
    D.layers.forEach((L, i) => {
      const rt = this.rts[i]; if (!rt) return;
      let emit = 0;
      if (L.on) {
        if (D.mode === 'loop') emit = this.power;
        else if (L.type === 'particles' || L.type === 'decal') emit = this.sinceTrig >= L.delay && this.sinceTrig < L.delay + (L.type === 'particles' ? L.emitTime : 0) ? 1 : 0;
      }
      rt.update(dt, ctx, emit);
      if (!L.on && L.type !== 'light') { /* let existing particles die out */ }
    });
  }
  /** number of live particles / spots / bolts */
  count() { let n = 0; for (const r of this.rts) n += r?.alive() ?? 0; return n; }
  clear() { for (const r of this.rts) r?.clear(); this.pending = []; this.power = 0; }
  dispose() { for (const r of this.rts) r?.dispose(); this.group.removeFromParent(); }
}
