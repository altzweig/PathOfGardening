// Flamethrower fire: procedural shader flame (scrolling fbm noise in polar coordinates, heat colour ramp,
// tongues that break up towards the tip), several stacked layers for volume, plus a flickering point light.
import * as THREE from 'three';

/** fan in the XZ plane centred on +Z; uv.x = across the flame (0..1), uv.y = along it (0 nozzle .. 1 tip) */
export function flameGeo(arc: number, segA = 28, segR = 18) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= segR; j++) {
    const r = j / segR;
    for (let i = 0; i <= segA; i++) {
      const u = i / segA, a = -arc / 2 + arc * u;
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); uv.push(u, r);
    }
  }
  const W = segA + 1;
  for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime, uSeed, uArc, uLen, uFull, uPower, uLayer;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= .5; } return v; }
vec3 ramp(float t){ // black-body-ish: deep red -> orange -> yellow -> pale white
  vec3 c = mix(vec3(.45, .03, .0), vec3(1., .28, .02), smoothstep(.0, .35, t));
  c = mix(c, vec3(1., .62, .12), smoothstep(.3, .6, t));
  c = mix(c, vec3(1., .78, .3), smoothstep(.6, .85, t));
  return mix(c, vec3(1., .93, .7), smoothstep(.85, 1., t));
}
void main(){
  float r = vUv.y, a = (vUv.x - .5) * 2.;
  float across = a * uArc * .5 * max(r, .08) * uLen;   // metres across the flame at this distance
  float along = r * uLen;
  float t = uTime * (1. + uLayer * .15);
  // domain warp: the flame curls and licks forward
  vec2 q = vec2(across * 2.2 + uSeed, along * 1.6 - t * 5.5);
  vec2 w = vec2(fbm(q + vec2(0., t * .7)), fbm(q + vec2(5.2, 1.3) - t * .4));
  float n = fbm(q * 1.4 + w * 1.8 - vec2(0., t * 2.));
  // shape: hot near the nozzle, widening, edges eaten away by the noise
  float edge = uFull > .5 ? 1. : 1. - smoothstep(.45 + .25 * r, 1., abs(a));
  float body = edge * pow(1. - r, .55) * smoothstep(0., .07, r);
  float heat = body * 1.05 + (n - .5) * (1. + r * .9) - r * .3;
  heat = clamp(heat, 0., 1.);
  float alpha = smoothstep(.05, .45, heat);
  vec3 col = ramp(heat);
  // blue-white core right at the nozzle
  float core = (1. - smoothstep(.0, .12, r)) * (1. - smoothstep(.0, .35, abs(a))) * (uFull > .5 ? 0. : 1.);
  col = mix(col, vec3(.55, .7, 1.), core * .6);
  gl_FragColor = vec4(col * alpha * alpha * uPower * .16 * (.65 + .35 * smoothstep(.0, .25, r)), 1.);
}`;

export function flameMaterial(seed: number, layer: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uArc: { value: .5 }, uLen: { value: 3.5 }, uFull: { value: 0 }, uPower: { value: 0 }, uLayer: { value: layer } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

export interface FlameFx { g: THREE.Group; layers: THREE.Mesh[]; arc: number; power: number }
/** 23.11.2026: ONE flame light shared by every flamethrower, always in the scene (intensity 0 when nobody fires).
 *  A light that appears (or becomes visible) changes the light count, and three.js then recompiles the shader of
 *  every lit material in the scene: that was the second-long freeze on the first chili shot. Strongest flame gets it. */
export const flameLight = new THREE.PointLight(0xff7a2a, 0, 7, 1.6);
let flameLightPow = 0;
/** once per frame before the flames update */
export function resetFlameLight() { flameLightPow = 0; flameLight.intensity = 0; }
const _lp = new THREE.Vector3();
const LAYERS = [{ y: .42, s: .95, tilt: .05 }]; // soft shader base under the sprite fire
export function makeFlame(): FlameFx {
  const g = new THREE.Group(), layers: THREE.Mesh[] = [];
  LAYERS.forEach((L, i) => { const m = new THREE.Mesh(flameGeo(1), flameMaterial(Math.random() * 50, i)); m.position.y = L.y; m.rotation.x = -L.tilt; m.renderOrder = 6 + i; m.frustumCulled = false; g.add(m); layers.push(m); });
  return { g, layers, arc: -1, power: 0 };
}
/** cone in degrees, range in m, on = flame burning; power fades in/out for ignition and tail */
export function updateFlame(F: FlameFx, dt: number, cone: number, range: number, on: boolean, time: number) {
  F.power += ((on ? 1 : 0) - F.power) * Math.min(1, dt * (on ? 14 : 7));
  F.g.visible = F.power > .01;
  if (!F.g.visible) return;
  const arc = Math.min(359.9, cone) * Math.PI / 180, full = cone >= 359;
  if (Math.abs(arc - F.arc) > 1e-3) { F.arc = arc; for (const m of F.layers) { m.geometry.dispose(); m.geometry = flameGeo(arc); } }
  // ignition: the flame shoots out to full length, the tail shrinks back
  const len = range * (.35 + .65 * Math.min(1, F.power * 1.25));
  F.layers.forEach((m, i) => {
    const s = len * LAYERS[i].s; m.scale.set(s, 1, s);
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = time; u.uArc.value = arc; u.uLen.value = s; u.uFull.value = full ? 1 : 0; u.uPower.value = F.power;
  });
  const flick = .75 + .15 * Math.sin(time * 31) + .1 * Math.sin(time * 17.3);
  if (F.power > flameLightPow) { // the strongest flame this frame drives the shared light
    flameLightPow = F.power;
    flameLight.intensity = 4 * F.power * flick; flameLight.distance = range * 2 + 2;
    F.g.updateMatrixWorld(); flameLight.position.copy(F.g.localToWorld(_lp.set(0, .9, full ? 0 : range * .35)));
  }
}

// ---------------- glowing ground under the flame ----------------
// Pooled heat spots (instanced): fresh spots glow white-yellow with lava cracks, cool down over a few seconds
// through orange and red to dark; a dark scorch mark stays a while longer. Cracks use world coordinates,
// so overlapping spots form one continuous crack pattern.
const HEAT_N = 384, HEAT_LIFE = 12;
const heatVert = `
attribute float aAge; attribute float aSeed; attribute float aSize;
varying vec2 vUv; varying vec2 vW; varying float vAge; varying float vSeed;
void main(){ vUv = uv; vAge = aAge; vSeed = aSeed;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.); vW = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const heatCommon = `
varying vec2 vUv; varying vec2 vW; varying float vAge; varying float vSeed;
uniform float uCool, uTime;
vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float cracks(vec2 p){ // distance to the nearest voronoi cell border
  vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = h2(i + g); float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }
float blob(){ float d = length(vUv - .5) * 2.; return smoothstep(1., .15, d); }`;
const heatGlowFrag = heatCommon + `
vec3 ramp(float t){ vec3 c = mix(vec3(.35, .02, .0), vec3(1., .2, .02), smoothstep(.0, .3, t));
  c = mix(c, vec3(1., .55, .1), smoothstep(.3, .65, t)); return mix(c, vec3(1., .9, .55), smoothstep(.65, 1., t)); }
void main(){
  float heat = exp(-vAge / uCool) * smoothstep(0., .12, vAge + .02);
  float b = blob(); if (b <= 0.) discard;
  float c = cracks(vW * 2.6) , c2 = cracks(vW * 6.3 + 7.);
  float line = 1. - smoothstep(.0, .09, c), fine = 1. - smoothstep(.0, .06, c2);
  float flick = .85 + .15 * sin(uTime * 7. + vSeed * 40. + vW.x * 3.);
  float t = clamp(heat * b * (.55 + .9 * line + .35 * fine) * flick, 0., 1.);
  float glow = heat * b * (.12 + .9 * line + .35 * fine);
  gl_FragColor = vec4(ramp(t) * glow * .7, 1.);
}`;
const heatScorchFrag = heatCommon + `
void main(){
  float a = blob() * .35 * smoothstep(0., .4, vAge) * (1. - smoothstep(${(HEAT_LIFE * .5).toFixed(1)}, ${HEAT_LIFE.toFixed(1)}, vAge));
  if (a <= .003) discard;
  float c = cracks(vW * 2.6);
  gl_FragColor = vec4(vec3(.05, .03, .02), a * (.75 + .25 * smoothstep(.0, .1, c)));
}`;
export class GroundHeat {
  private glow: THREE.InstancedMesh; private scorch: THREE.InstancedMesh;
  private age = new Float32Array(HEAT_N).fill(HEAT_LIFE); private seed = new Float32Array(HEAT_N); private size = new Float32Array(HEAT_N);
  private head = 0; private m = new THREE.Matrix4(); private uni = { uCool: { value: 1.8 }, uTime: { value: 0 } };
  constructor(parent: THREE.Object3D) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    geo.setAttribute('aAge', new THREE.InstancedBufferAttribute(this.age, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 1));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.size, 1));
    const mk = (frag: string, add: boolean) => new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: heatVert, fragmentShader: frag, transparent: true, depthWrite: false, toneMapped: false,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.scorch = new THREE.InstancedMesh(geo, mk(heatScorchFrag, false), HEAT_N);
    this.glow = new THREE.InstancedMesh(geo, mk(heatGlowFrag, true), HEAT_N);
    for (const im of [this.scorch, this.glow]) { im.frustumCulled = false; im.count = HEAT_N; parent.add(im); }
    this.scorch.renderOrder = 1; this.glow.renderOrder = 2;
    this.m.makeScale(0, 0, 0); for (let i = 0; i < HEAT_N; i++) { this.scorch.setMatrixAt(i, this.m); this.glow.setMatrixAt(i, this.m); }
  }
  /** heat up the ground at x,z (radius r) */
  add(x: number, z: number, r: number) {
    const i = this.head; this.head = (this.head + 1) % HEAT_N;
    this.age[i] = 0; this.seed[i] = Math.random(); this.size[i] = r;
    this.m.makeRotationY(Math.random() * 6.3); this.m.scale(new THREE.Vector3(r * 2, 1, r * 2)); this.m.setPosition(x, .035 + (i % 7) * .0006, z);
    this.scorch.setMatrixAt(i, this.m); this.glow.setMatrixAt(i, this.m);
    this.scorch.instanceMatrix.needsUpdate = this.glow.instanceMatrix.needsUpdate = true;
  }
  update(dt: number, time: number) {
    this.uni.uTime.value = time;
    for (let i = 0; i < HEAT_N; i++) if (this.age[i] < HEAT_LIFE) this.age[i] += dt;
    (this.glow.geometry.getAttribute('aAge') as THREE.BufferAttribute).needsUpdate = true;
  }
  clear() { this.age.fill(HEAT_LIFE); (this.glow.geometry.getAttribute('aAge') as THREE.BufferAttribute).needsUpdate = true; }
}

// ---------------- stylised sprite fire (Kenney Particle Pack, CC0) ----------------
// Atlas public/textures/fx_fire.png (4x2 greyscale): flame_01..04, fire_01, fire_02, smoke_02, smoke_05.
// Flame sprites are additive and coloured over their life: white-yellow core -> orange -> hot magenta-red rim;
// smoke sprites are drawn normally (dark, rising) so the fire has contrast.
const fireTex = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'textures/fx_fire.png');
fireTex.colorSpace = THREE.NoColorSpace;
const spriteVert = `
attribute float aSize; attribute float aRot; attribute float aT; attribute float aTile; attribute float aHeat;
varying float vRot; varying float vT; varying float vTile; varying float vHeat; uniform float uScale;
void main(){ vRot = aRot; vT = aT; vTile = aTile; vHeat = aHeat;
  vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aT >= 1. ? 0. : aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const spriteHead = `
uniform sampler2D uTex; varying float vRot; varying float vT; varying float vTile; varying float vHeat;
float tex(){ vec2 p = gl_PointCoord - .5; float c = cos(vRot), s = sin(vRot); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + .5;
  if (p.x < 0. || p.y < 0. || p.x > 1. || p.y > 1.) return 0.;
  float tx = mod(vTile, 4.), ty = floor(vTile / 4.); return texture2D(uTex, vec2((tx + p.x) / 4., 1. - (ty + p.y) / 2.)).r; }`;
const flameFrag = spriteHead + `
void main(){
  float v = tex(); if (v < .01) discard;
  float life = 1. - vT;                                   // 1 fresh .. 0 dying
  float hot = clamp(v * (.35 + .85 * life), 0., 1.);
  vec3 rim = mix(vec3(.75, .02, .25), vec3(1., .12, .05), life);   // magenta-red edges
  vec3 c = mix(rim, vec3(1., .45, .05), smoothstep(.15, .5, hot)); // orange body
  c = mix(c, vec3(1., .85, .35), smoothstep(.5, .8, hot));         // yellow
  c = mix(c, vec3(1., .98, .85), smoothstep(.8, 1., hot));         // white-hot core
  float a = v * smoothstep(0., .08, vT) * (1. - smoothstep(.55, 1., vT));
  gl_FragColor = vec4(c * a * vHeat * .42, 1.);
}`;
const smokeFrag = spriteHead + `
void main(){
  float v = tex(); if (v < .01) discard;
  float a = v * .45 * smoothstep(0., .25, vT) * (1. - smoothstep(.5, 1., vT));
  gl_FragColor = vec4(mix(vec3(.25, .08, .04), vec3(.06, .05, .05), smoothstep(0., .5, vT)), a);
}`;
class SpritePool {
  pts: THREE.Points; private n: number; private head = 0;
  pos: Float32Array; vel: Float32Array; size: Float32Array; s0: Float32Array; s1: Float32Array; rot: Float32Array; spin: Float32Array; t: Float32Array; life: Float32Array; tile: Float32Array; heat: Float32Array; rise: Float32Array; drag: Float32Array;
  constructor(n: number, frag: string, add: boolean, uScale: { value: number }) {
    this.n = n; const g = new THREE.BufferGeometry();
    const A = (k: number) => new Float32Array(n * k);
    this.pos = A(3); this.vel = A(3); this.size = A(1); this.s0 = A(1); this.s1 = A(1); this.rot = A(1); this.spin = A(1); this.t = A(1).fill(1); this.life = A(1).fill(1); this.tile = A(1); this.heat = A(1); this.rise = A(1); this.drag = A(1);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1)); g.setAttribute('aT', new THREE.BufferAttribute(this.t, 1));
    g.setAttribute('aTile', new THREE.BufferAttribute(this.tile, 1)); g.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: fireTex }, uScale }, vertexShader: spriteVert, fragmentShader: frag,
      transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
    this.pts = new THREE.Points(g, mat); this.pts.frustumCulled = false;
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, s0: number, s1: number, life: number, tile: number, heat = 1, rise = 0, drag = 1.5) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.s0[i] = s0; this.s1[i] = s1; this.size[i] = s0; this.life[i] = life; this.t[i] = 0; this.tile[i] = tile; this.heat[i] = heat; this.rise[i] = rise; this.drag[i] = drag;
    this.rot[i] = Math.random() * 6.28; this.spin[i] = (Math.random() - .5) * 4;
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.t[i] >= 1) continue;
      this.t[i] = Math.min(1, this.t[i] + dt / this.life[i]);
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.rise[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const e = this.t[i]; this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - e) * (1 - e)); this.rot[i] += this.spin[i] * dt;
    }
    const g = this.pts.geometry; for (const a of ['position', 'aSize', 'aRot', 'aT', 'aTile', 'aHeat']) (g.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
  }
  clear() { this.t.fill(1); }
}
export class FireSprites {
  private flame: SpritePool; private smoke: SpritePool; private uScale = { value: 500 };
  constructor(parent: THREE.Object3D) {
    this.flame = new SpritePool(1400, flameFrag, true, this.uScale); this.smoke = new SpritePool(360, smokeFrag, false, this.uScale);
    this.smoke.pts.renderOrder = 5; this.flame.pts.renderOrder = 7; parent.add(this.smoke.pts, this.flame.pts);
  }
  setScale(px: number) { this.uScale.value = px; }
  /** one frame of flamethrower emission: from (x,z) at angle a (rad), cone half-width half (rad), range r (m), power 0..1 */
  emit(dt: number, x: number, z: number, a: number, half: number, r: number, power: number) {
    const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    const n = Math.min(24, Math.round(dt * (55 + 90 * Math.min(1, half * 2)) * power + Math.random()));
    const dens = Math.min(1, .38 + half * .9); // narrow flames overlap a lot: keep them from blowing out to white
    for (let i = 0; i < n; i++) {
      const b = a + rnd(-half, half) * .85, life = rnd(.38, .55), sp = r / life * rnd(1.25, 1.6), j = Math.random() * .03;
      const tile = Math.floor(Math.random() * 6); // flames + fire blobs
      this.flame.spawn(x + Math.sin(b) * j, rnd(.55, .75), z + Math.cos(b) * j, Math.sin(b) * sp, rnd(-.2, .4), Math.cos(b) * sp, rnd(.25, .4), rnd(1.1, 1.7) * (.6 + r / 9), life, tile, rnd(.8, 1.15) * dens, 1.6, 2.2);
    }
    // bright tight core at the nozzle
    if (Math.random() < dt * 40 * power) this.flame.spawn(x, .7, z, Math.sin(a) * 4, 0, Math.cos(a) * 4, .3, .55, .16, 4, .9, 0, 6);
    // smoke rising off the end of the flame
    if (Math.random() < dt * 14 * power) {
      const b = a + rnd(-half, half) * .7, d = r * rnd(.75, 1.05);
      this.smoke.spawn(x + Math.sin(b) * d, rnd(.8, 1.1), z + Math.cos(b) * d, Math.sin(b) * .6, rnd(.6, 1.1), Math.cos(b) * .6, .6, rnd(1.4, 2.2), rnd(1.1, 1.6), 6 + Math.floor(Math.random() * 2), 1, .3, 1);
    }
  }
  /** small fire on a burning enemy */
  burn(x: number, y: number, z: number, s: number) {
    const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    this.flame.spawn(x + rnd(-.15, .15) * s, y, z + rnd(-.15, .15) * s, rnd(-.1, .1), rnd(.8, 1.4), rnd(-.1, .1), .25 * s, .55 * s, rnd(.35, .55), Math.floor(Math.random() * 4), rnd(.7, 1), 1.2, 1.5);
  }
  update(dt: number) { this.flame.update(dt); this.smoke.update(dt); }
  clear() { this.flame.clear(); this.smoke.clear(); }
}
