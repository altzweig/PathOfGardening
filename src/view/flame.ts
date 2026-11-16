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
  gl_FragColor = vec4(col * alpha * alpha * uPower * (.3 - uLayer * .07) * (.65 + .35 * smoothstep(.0, .25, r)), 1.);
}`;

export function flameMaterial(seed: number, layer: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uArc: { value: .5 }, uLen: { value: 3.5 }, uFull: { value: 0 }, uPower: { value: 0 }, uLayer: { value: layer } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

export interface FlameFx { g: THREE.Group; layers: THREE.Mesh[]; light: THREE.PointLight; arc: number; power: number }
const LAYERS = [{ y: .42, s: 1, tilt: .05 }, { y: .62, s: .88, tilt: .1 }, { y: .82, s: .7, tilt: .16 }];
export function makeFlame(): FlameFx {
  const g = new THREE.Group(), layers: THREE.Mesh[] = [];
  LAYERS.forEach((L, i) => { const m = new THREE.Mesh(flameGeo(1), flameMaterial(Math.random() * 50, i)); m.position.y = L.y; m.rotation.x = -L.tilt; m.renderOrder = 6 + i; m.frustumCulled = false; g.add(m); layers.push(m); });
  const light = new THREE.PointLight(0xff7a2a, 0, 7, 1.6); light.position.y = .9; g.add(light);
  return { g, layers, light, arc: -1, power: 0 };
}
/** cone in degrees, range in m, on = flame burning; power fades in/out for ignition and tail */
export function updateFlame(F: FlameFx, dt: number, cone: number, range: number, on: boolean, time: number) {
  F.power += ((on ? 1 : 0) - F.power) * Math.min(1, dt * (on ? 14 : 7));
  F.g.visible = F.power > .01;
  if (!F.g.visible) { F.light.intensity = 0; return; }
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
  F.light.intensity = 4 * F.power * flick; F.light.distance = range * 2 + 2;
  F.light.position.set(0, .9, full ? 0 : range * .35);
}
