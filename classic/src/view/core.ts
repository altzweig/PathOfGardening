import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export function lerpAngle(a: number, b: number, t: number) { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }
export const windU = { value: 0 };
/** shared environment uniforms (day-night): uDay 0 = night .. 1 = day, uSun = direction to the main light */
export const envU = { uDay: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uFogCol: { value: new THREE.Color(0) }, uFogNear: { value: 20 }, uFogFar: { value: 60 } };
export const isTouch =matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

// ---------------- renderer ----------------
export const canvas = document.getElementById('c') as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 25.11.2026: layer 1 = low poly shadow stand-ins of the animals (animals.ts SHADOW_LAYER). three.js tests the layers of the
// VIEW camera in the shadow pass, so layer 1 is switched on only while the shadow maps are drawn (the visible pass has
// already collected its objects by then) -> the stand-ins cast shadows but are never drawn in the picture.
{ const sm = renderer.shadowMap, draw = sm.render.bind(sm);
  sm.render = (lights, sc, cam) => { cam.layers.enable(1); try { draw(lights, sc, cam); } finally { cam.layers.disable(1); } }; }
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 20, 60); // light distance fog only; near/far follow the camera distance (daynight.ts)
export const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

// darker night than the prototype: dim moon, faint sky
export const hemi = new THREE.HemisphereLight(0x7b95c8, 0x120d06, 0.5); scene.add(hemi);
export const moon = new THREE.DirectionalLight(0x9db6ff, 1.25); // slightly cool moonlight
moon.position.set(-9, 18, 7); moon.castShadow = true;
Object.assign(moon.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 50 });
moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.03;
scene.add(moon); scene.add(moon.target);
export const LANT = new THREE.Vector3(Math.cos(Math.PI / 6) * 10.8, 0, Math.sin(Math.PI / 6) * 10.8);
export const lantern = new THREE.PointLight(0xffa04a, 22, 14, 1.6); lantern.position.set(LANT.x, 2.3, LANT.z); scene.add(lantern);
export const torch = new THREE.PointLight(0xffc27a, 3.5, 7.5, 1.6); scene.add(torch);
// soft light over the garden so the fields read a bit brighter than the rest of the night
export const gardenLight = new THREE.PointLight(0xc8d4ff, 70, 16, 1.3); gardenLight.position.set(0, 6, 1); scene.add(gardenLight);

export type Quality = 'hoch' | 'mittel' | 'niedrig';
const QUAL: Record<Quality, { pr: number; shadow: number; bloom: boolean }> = {
  hoch: { pr: Math.min(devicePixelRatio, 2), shadow: 2048, bloom: true },
  mittel: { pr: Math.min(devicePixelRatio, 1.5), shadow: 1024, bloom: true },
  niedrig: { pr: 1, shadow: 0, bloom: false },
};
export const gfx = { quality: (isTouch ? 'mittel' : 'hoch') as Quality, auto: true };

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 1.15, 0.6, 0.72);
composer.addPass(bloom);
// lightning overlay: drawn after bloom (keeps scene depth) so bolts stay crisp
export const fxTop = new THREE.Scene();
const boltU = { uRes: { value: new THREE.Vector2(1, 1) } };
const topPass = new RenderPass(fxTop, camera); topPass.clear = false;
export const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uHurt: { value: 0 }, uLow: { value: 0 }, uDay: envU.uDay },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uHurt; uniform float uLow; uniform float uDay; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 d=vUv-.5; d.x*=1.2; float r=length(d);
      float l=dot(c.rgb,vec3(.299,.587,.114));
      vec3 night=mix(c.rgb*vec3(.8,.95,1.15), c.rgb*vec3(1.06,1.,.9), smoothstep(.05,.6,l));
      night=mix(vec3(l)*vec3(.82,.95,1.2), night, .78);                 // night: cooler, a little desaturated = gloomier
      vec3 day=mix(c.rgb*vec3(.96,1.,1.04), c.rgb*vec3(1.04,1.01,.95), smoothstep(.1,.7,l)); // day: warm lights, slightly cool shade
      c.rgb=mix(night, day, uDay);
      c.rgb=mix(c.rgb, vec3(.6,.02,.02), uHurt*smoothstep(.25,.75,r));
      float vig=mix(smoothstep(.85,.18,r), mix(1.,smoothstep(1.,.25,r),.6), uDay); c.rgb*=vig;
      c.rgb+=vec3(.42,.0,.03)*uLow*smoothstep(.42,.8,r); // low-HP: soft red glow on the screen edges, centre stays clear
      gl_FragColor=c; }`,
});
composer.addPass(topPass);
composer.addPass(gradePass);
composer.addPass(new OutputPass());

export let pxScale = 500;
const onResize: (() => void)[] = [];
export function addResize(f: () => void) { onResize.push(f); }
export function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pxScale = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  renderer.getDrawingBufferSize(boltU.uRes.value);
  onResize.forEach(f => f());
}
addEventListener('resize', resize);
export function applyQuality() {
  const q = QUAL[gfx.quality];
  renderer.setPixelRatio(q.pr); composer.setPixelRatio(q.pr);
  bloom.enabled = q.bloom;
  moon.castShadow = q.shadow > 0;
  if (q.shadow) { moon.shadow.mapSize.set(q.shadow, q.shadow); if (moon.shadow.map) { moon.shadow.map.dispose(); (moon.shadow as any).map = null; } }
  resize();
}

// ---------------- shared geometry / materials ----------------
export const GEO = {
  sph: new THREE.SphereGeometry(1, 14, 10), ico: new THREE.IcosahedronGeometry(1, 1), lo: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8), cone: new THREE.ConeGeometry(1, 1, 8), box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1), circle: new THREE.CircleGeometry(1, 28), ring: new THREE.RingGeometry(0.86, 1, 48),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
};
export function M(color: number, o: { r?: number; m?: number; flat?: boolean; e?: number; ei?: number; tr?: boolean; op?: number } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? .85, metalness: o.m ?? 0, flatShading: o.flat ?? true,
    emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.tr, opacity: o.op ?? 1 });
}
export function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = shadow; parent.add(m); return m;
}
export function addMat(c: number, op = .6) { return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }); }
/** flat sector in the XZ plane centred on +Z (rotate with rotation.y = aim angle) */
export function sectorGeo(radius: number, arc: number, seg = 24) {
  const pos: number[] = [];
  for (let i = 0; i < seg; i++) {
    const b1 = -arc / 2 + arc * i / seg, b2 = -arc / 2 + arc * (i + 1) / seg;
    pos.push(0, 0, 0, Math.sin(b1) * radius, 0, Math.cos(b1) * radius, Math.sin(b2) * radius, 0, Math.cos(b2) * radius);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}

// ---------------- particles ----------------
export const PART = (() => {
  const N = 2400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1)); geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); a*=a; gl_FragColor=vec4(vC*a*vA,1.); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), grav = new Float32Array(N), drag = new Float32Array(N), s0 = new Float32Array(N), s1 = new Float32Array(N), a0 = new Float32Array(N);
  let head = 0; const tc = new THREE.Color();
  function spawn(p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, color: number | THREE.Color, sz: number, lf: number, o: { g?: number; drag?: number; s1?: number; a?: number } = {}) {
    const i = head; head = (head + 1) % N;
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
    const c = (color as THREE.Color).isColor ? color as THREE.Color : tc.set(color as number); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    life[i] = max[i] = lf; grav[i] = o.g ?? 0; drag[i] = o.drag ?? 0; s0[i] = sz; s1[i] = o.s1 ?? sz; a0[i] = o.a ?? 1; size[i] = sz; alpha[i] = a0[i];
  }
  function update(dt: number) {
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt; const t = 1 - life[i] / max[i];
      vel[i * 3 + 1] -= grav[i] * dt; const k = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 1] *= k; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < .02) { pos[i * 3 + 1] = .02; vel[i * 3 + 1] *= -.3; }
      size[i] = lerp(s0[i], s1[i], t); alpha[i] = a0[i] * (t < .1 ? t / .1 : 1 - (t - .1) / .9);
    }
    for (const k of ['position', 'color', 'size', 'alpha']) (geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
  function clear() { life.fill(0); }
  addResize(() => { mat.uniforms.uScale.value = pxScale; });
  return { spawn, update, clear };
})();
export function burst(p: { x: number; y: number; z: number }, color: number, n: number, sp = 2, sz = .15, lf = .5, o: { g?: number; up?: number; a?: number; drag?: number; s1?: number } = {}) {
  for (let i = 0; i < n; i++) { const a = rand(0, 7); PART.spawn(p, V(Math.cos(a) * sp * rand(.3, 1), (o.up ?? 1) * sp * rand(.2, 1), Math.sin(a) * sp * rand(.3, 1)), color, sz * rand(.6, 1.3), lf * rand(.6, 1.2), o); }
}

// ---------------- pooled ground decals / swipes ----------------
interface Fx { m: THREE.Mesh; t: number; life: number; r0: number; r1: number; op: number; own: boolean; sprite?: boolean; rot?: number }
const fx: Fx[] = [];
export function decal(x: number, z: number, color: number, r: number, life: number, o: { ring?: boolean; add?: boolean; grow?: number; op?: number } = {}) {
  const mat = o.add ? addMat(color, o.op ?? .7) : new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o.op ?? .75, depthWrite: false });
  const m = new THREE.Mesh(o.ring ? GEO.ring : GEO.circle, mat);
  m.rotation.x = -Math.PI / 2; m.rotation.z = rand(0, 7); m.position.set(x, .03 + Math.random() * .008, z); m.scale.setScalar(r); scene.add(m);
  fx.push({ m, t: 0, life, r0: r, r1: o.grow ?? r, op: o.op ?? .75, own: false });
}
/** rake tines: fixed spacing, a wider rake gets more tines (and leaves more scratches), nothing is stretched */
export const TINE_GAP = .075;
export const rakeTines = (w: number) => Math.max(4, Math.round(w / TINE_GAP));
/** flat rectangle in the XZ plane: width along X, length along +Z from the origin (rotate with rotation.y = aim angle) */
export function rectGeo(w: number, l: number) { const g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2); g.translate(0, 0, l / 2); return g; }
/** rake stroke: scratch marks of the tines in the ground, one per tine (same spacing as the rake head), each slightly
 *  wavy, tapered and with ragged start/end (random length, short side scratches where the tines bite in and lift off).
 *  They fill the hit circle: diameter w, far edge `len` ahead; each tine scratches the chord of the circle it crosses. */
export function rakeSweep(x: number, z: number, angle: number, len: number, w: number) {
  const pos: number[] = [], n = rakeTines(w);
  const strip = (cx: number, z0: number, z1: number, hw: number, wob: number) => {
    const S = 10, ph = rand(0, 7), pts: [number, number, number][] = [];
    for (let i = 0; i <= S; i++) {
      const t = i / S, zz = lerp(z0, z1, t), taper = Math.pow(Math.sin(Math.PI * Math.min(1, .15 + t * .85)), .6);
      pts.push([cx + Math.sin(ph + t * 5) * wob + rand(-.004, .004), zz, hw * taper * rand(.6, 1.15)]);
    }
    for (let i = 0; i < S; i++) {
      const [ax, az, aw] = pts[i], [bx, bz, bw] = pts[i + 1];
      pos.push(ax - aw, 0, az, bx - bw, 0, bz, bx + bw, 0, bz, ax - aw, 0, az, bx + bw, 0, bz, ax + aw, 0, az);
    }
  };
  for (let i = 0; i < n; i++) {
    const r = w / 2, c = len - r, cx = -r + w * (i + .5) / n, h = Math.sqrt(Math.max(0, r * r - cx * cx));
    const z0 = c - h + 2 * h * rand(0, .12), z1 = c + h - 2 * h * rand(0, .15);
    strip(cx, z0, z1, .011, .012);
    // frayed ends: short skewed scratches where the tine bit in (far end) and lifted off (near end)
    if (Math.random() < .55) { const s = rand(-.03, .03); strip(cx + s, z1 - rand(.06, .16), z1 + rand(0, .05), .006, .01); }
    if (Math.random() < .45) { const s = rand(-.03, .03); strip(cx + s, Math.max(0, z0 - rand(0, .04)), z0 + rand(.05, .14), .006, .01); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x24170d, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.y = angle; m.position.set(x, .05, z); scene.add(m); fx.push({ m, t: 0, life: 1.2, r0: 1, r1: 1, op: .5, own: true });
}
/** rake swipe: exactly the hit cone (radius = range, arc) */
export function swipe(x: number, z: number, angle: number, radius: number, arc: number, color = 0xffe3a0) {
  const m = new THREE.Mesh(sectorGeo(radius, arc), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.y = angle; m.position.set(x, .06, z); scene.add(m);
  fx.push({ m, t: 0, life: .2, r0: .92, r1: 1.0, op: .5, own: true });
  // bright outer edge so the reach is readable
  const e = new THREE.Mesh(arcBandGeo(radius * .9, radius, arc), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  e.rotation.y = angle; e.position.set(x, .07, z); scene.add(e);
  fx.push({ m: e, t: 0, life: .16, r0: 1, r1: 1, op: .9, own: true });
}
export function arcBandGeo(r0: number, r1: number, arc: number, seg = 24) {
  const pos: number[] = [];
  for (let i = 0; i < seg; i++) {
    const b1 = -arc / 2 + arc * i / seg, b2 = -arc / 2 + arc * (i + 1) / seg;
    const a = [Math.sin(b1) * r0, 0, Math.cos(b1) * r0], b = [Math.sin(b1) * r1, 0, Math.cos(b1) * r1], c = [Math.sin(b2) * r1, 0, Math.cos(b2) * r1], d = [Math.sin(b2) * r0, 0, Math.cos(b2) * r0];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}

// comic punch star sprite
const punchTex = (() => {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const star = (r1: number, r2: number, n: number, rot: number) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n; g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); } g.closePath(); };
  star(60, 30, 9, .2); g.fillStyle = '#1a0d00'; g.fill();
  star(54, 27, 9, .2); g.fillStyle = '#ffcf33'; g.fill();
  star(36, 18, 9, .45); g.fillStyle = '#fff7d6'; g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export function punchStar(x: number, z: number, big = 1) {
  const mat = new THREE.SpriteMaterial({ map: punchTex, transparent: true, depthTest: false, depthWrite: false, rotation: rand(0, 7), toneMapped: false });
  const s = new THREE.Sprite(mat); s.position.set(x + rand(-.08, .08), .55 + rand(0, .15), z + rand(-.08, .08)); s.renderOrder = 1000; scene.add(s);
  fx.push({ m: s as any, t: 0, life: .24, r0: .1, r1: .75 * big, op: 1, own: false, sprite: true });
}
// comic dust cloud (sheep ram): round puffs with a dark outline, like a cartoon brawl
const cloudTex = (() => {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const blobs: [number, number, number][] = [[64, 70, 30], [40, 64, 22], [88, 62, 24], [54, 44, 22], [78, 44, 20], [64, 86, 22]];
  const draw = (grow: number, col: string) => { g.fillStyle = col; for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + grow, 0, Math.PI * 2); g.fill(); } };
  draw(5, '#2a2016'); draw(0, '#d8cdb4');
  g.globalAlpha = .7; g.fillStyle = '#fff8e8'; for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x - r * .3, y - r * .3, r * .45, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export function dustCloud(x: number, z: number) {
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, rotation: rand(0, 7), toneMapped: false });
    const s = new THREE.Sprite(mat), a = i / n * Math.PI * 2 + rand(-.2, .2), r = i === n ? 0 : rand(.45, .6);
    s.position.set(x + Math.cos(a) * r, i === n ? .5 : rand(.15, .55), z + Math.sin(a) * r); s.renderOrder = 999; scene.add(s);
    fx.push({ m: s as any, t: 0, life: rand(.45, .6), r0: .15, r1: i === n ? .9 : rand(.5, .7), op: 1, own: false, sprite: true });
  }
}
export function updateFx(dt: number) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1) {
      scene.remove(f.m);
      f.m.traverse((o: any) => { if (o.material) o.material.dispose(); if (f.own && o.geometry) o.geometry.dispose(); });
      fx.splice(i, 1); continue;
    }
    if (f.sprite) { const s = k < .25 ? lerp(f.r0, f.r1, k / .25) : f.r1 * (1 - (k - .25) * .25); f.m.scale.setScalar(s); }
    else if (f.r0 !== f.r1) f.m.scale.setScalar(lerp(f.r0, f.r1, 1 - Math.pow(1 - k, 3)));
    const op = f.op * (k < .7 ? 1 : 1 - (k - .7) / .3);
    f.m.traverse((o: any) => { if (o.material) o.material.opacity = op; });
  }
}
export function clearFx() { for (const f of fx) scene.remove(f.m); fx.length = 0; }

// ---------------- billboard bars ----------------
export const barGroup = new THREE.Group(); scene.add(barGroup);
export function makeBar(w: number, h: number, color: number) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .65, depthTest: false, toneMapped: false }));
  bg.scale.set(w + .04, h + .04, 1);
  const fg = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false }));
  fg.scale.set(w, h, 1); fg.position.z = .001;
  const sh = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, depthTest: false, toneMapped: false, transparent: true, opacity: .9 }));
  sh.scale.set(w, h * .45, 1); sh.position.set(0, h * .8, .002); sh.visible = false;
  bg.renderOrder = 998; fg.renderOrder = 999; sh.renderOrder = 999;
  g.add(bg, fg, sh); g.userData = { fg, sh, w }; barGroup.add(g); return g;
}
export function setBar(bar: THREE.Group, frac: number, shield = -1) {
  const { fg, sh, w } = bar.userData; frac = clamp(frac, 0, 1);
  fg.scale.x = Math.max(.0001, w * frac); fg.position.x = -w * (1 - frac) / 2;
  if (shield >= 0) { sh.visible = shield > 0; sh.scale.x = Math.max(.0001, w * shield); sh.position.x = -w * (1 - shield) / 2; }
}

// ---------------- lightning ----------------
// Fine, realistic lightning: fractal main channel (midpoint displacement) with side arms that fork again.
// Drawn as screen-space ribbons (min. ~1 px, soft edges = no aliasing) in an overlay scene that is
// rendered AFTER the bloom pass, so the bolts keep crisp contours and do not bloom.
const boltMat = (op: number) => new THREE.ShaderMaterial({
  uniforms: { uRes: boltU.uRes, uOp: { value: op }, uK: { value: 0 }, uCore: { value: new THREE.Color(1.5, 1.55, 1.7) }, uHalo: { value: new THREE.Color(.5, .6, 1.2) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  vertexShader: `attribute vec3 pOther; attribute vec4 wi; uniform vec2 uRes; uniform float uK; varying float vS; varying float vI;
    void main(){
      vec4 c0=projectionMatrix*modelViewMatrix*vec4(position,1.), c1=projectionMatrix*modelViewMatrix*vec4(pOther,1.);
      vec2 d=(c1.xy/c1.w-c0.xy/c0.w)*uRes; float l=length(d); d= l>1e-4 ? d/l : vec2(1.,0.);
      if(wi.w<0.) d=-d;
      vec2 n=vec2(-d.y,d.x);
      float px=wi.x*projectionMatrix[1][1]*.5*uRes.y/c0.w;      // core width in px
      float pw=max(px,1.3);                                    // never thinner than ~1 px: stays fine but does not flicker
      float side=sign(wi.w)*(abs(wi.w)>1.5?1.:-1.);
      c0.xy+=n*side*pw*4.*c0.w/uRes;                         // ribbon = 4x core width (faint halo)
      vS=side; vI=wi.y*(px/pw)*pow(max(0.,1.-uK),1.+wi.z*1.8); // side arms fade faster than the main channel
      gl_Position=c0; }`,
  fragmentShader: `uniform float uOp; uniform vec3 uCore; uniform vec3 uHalo; varying float vS; varying float vI;
    void main(){ float s=abs(vS)*4.; float core=exp(-s*s*1.6); float halo=exp(-s*s*.16)*.16;
      vec3 c=(uCore*core+uHalo*halo)*vI*uOp; gl_FragColor=vec4(c,1.); }`,
});
type P3 = THREE.Vector3;
/** jagged channel a→b by midpoint displacement; rough = first offset relative to the length */
function channel(a: P3, b: P3, rough: number, step: number) {
  let pts = [a.clone(), b.clone()];
  const dir = b.clone().sub(a), len = dir.length() || 1; dir.divideScalar(len);
  const h = V(-dir.z, 0, dir.x); if (h.lengthSq() < 1e-6) h.set(1, 0, 0); h.normalize();
  let off = len * rough;
  while (pts.length < 129 && len / (pts.length - 1) > step) {
    const n: P3[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const m = pts[i - 1].clone().lerp(pts[i], .5).addScaledVector(h, rand(-off, off)); m.y += rand(-off, off) * .55;
      n.push(m, pts[i]);
    }
    pts = n; off *= .52;
  }
  return pts;
}
interface Strand { pts: P3[]; w0: number; w1: number; i0: number; i1: number; gen: number }
/**
 * segs: [from, to, chainDepth]. More hit targets (segs.length) = more side arms, longer and forking deeper.
 */
export function lightning(segs: [P3, P3, number][], o: { width?: number; life?: number; fork?: number; core?: number; halo?: number } = {}) {
  if (!segs.length) return;
  const N = Math.max(1, o.fork ?? segs.length), W = o.width ?? .022;
  const pBranch = Math.min(.32, .05 + .035 * N), maxGen = N >= 6 ? 3 : N >= 3 ? 2 : 1, budget = 260 + N * 90;
  const strands: Strand[] = []; let used = 0;
  const grow = (s: Strand, dirHint: P3, lenRef: number) => {
    strands.push(s); used += s.pts.length;
    if (s.gen >= maxGen) return;
    const n = s.pts.length, p = pBranch * Math.pow(.62, s.gen);
    for (let i = 2; i < n - 3; i++) {
      if (used > budget || Math.random() > p) continue;
      const t = i / (n - 1), a = s.pts[i];
      const loc = s.pts[Math.min(n - 1, i + 2)].clone().sub(s.pts[Math.max(0, i - 2)]).normalize().lerp(dirHint, .5).normalize();
      const ang = (Math.random() < .5 ? -1 : 1) * rand(.3, .95), c = Math.cos(ang), sn = Math.sin(ang);
      const d = V(loc.x * c - loc.z * sn, loc.y - rand(0, .35), loc.x * sn + loc.z * c).normalize();
      const L = lenRef * rand(.14, .42) * (1 - t * .5) * (1 + Math.min(N, 10) * .05);
      const w = lerp(s.w0, s.w1, t) * rand(.45, .62), it = lerp(s.i0, s.i1, t) * rand(.5, .7);
      grow({ pts: channel(a, a.clone().addScaledVector(d, L), rand(.16, .26), .045), w0: w, w1: 0, i0: it, i1: it * .15, gen: s.gen + 1 }, d, L);
    }
  };
  for (const [a, b, depth] of segs) {
    const len = a.distanceTo(b), w = W * Math.pow(.85, depth), it = Math.pow(.9, depth);
    const dir = b.clone().sub(a).normalize();
    grow({ pts: channel(a, b, rand(.11, .17), .05), w0: w, w1: w * .7, i0: it, i1: it * .85, gen: 0 }, dir, len);
    // forks right at the impact: a few short twigs splaying out around the target
    const tw = Math.min(4, 1 + Math.floor(N / 2));
    for (let k = 0; k < tw && used < budget * 1.2; k++) {
      const an = rand(0, 7), L = rand(.15, .35), e = b.clone().add(V(Math.cos(an) * L, -rand(.1, .35), Math.sin(an) * L)); e.y = Math.max(.02, e.y);
      strands.push({ pts: channel(b, e, .25, .04), w0: w * .5, w1: 0, i0: it * .6, i1: .05, gen: 1 }); used += 8;
    }
  }
  // build one ribbon mesh for the whole strike (4 verts per piece, indexed)
  let nSeg = 0; for (const s of strands) nSeg += s.pts.length - 1;
  const pos = new Float32Array(nSeg * 12), oth = new Float32Array(nSeg * 12), wi = new Float32Array(nSeg * 16), idx: number[] = [];
  let v = 0;
  for (const s of strands) {
    const n = s.pts.length;
    for (let i = 0; i < n - 1; i++) {
      const a = s.pts[i], b = s.pts[i + 1], ta = i / (n - 1), tb = (i + 1) / (n - 1);
      const wa = lerp(s.w0, s.w1, ta), wb = lerp(s.w0, s.w1, tb), ia = lerp(s.i0, s.i1, ta), ib = lerp(s.i0, s.i1, tb);
      // wi.w encodes end + side: a-end ±1 (1 / 2), b-end ±1 (-1 / -2), b-end flips the direction
      const verts: [P3, P3, number, number, number][] = [[a, b, wa, ia, 1], [a, b, wa, ia, 2], [b, a, wb, ib, -2], [b, a, wb, ib, -1]];
      for (const [p, q, w, it, code] of verts) {
        pos.set([p.x, p.y, p.z], v * 3); oth.set([q.x, q.y, q.z], v * 3); wi.set([w, it, s.gen, code], v * 4); v++;
      }
      const k = v - 4; idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('pOther', new THREE.BufferAttribute(oth, 3)); g.setAttribute('wi', new THREE.BufferAttribute(wi, 4));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, boltMat(1)); m.frustumCulled = false;
  const U = (m.material as THREE.ShaderMaterial).uniforms;
  if (o.core !== undefined) U.uCore.value.setHex(o.core); if (o.halo !== undefined) U.uHalo.value.setHex(o.halo);
  fxTop.add(m);
  bolts.push({ m, t: 0, life: o.life ?? .28, restrike: rand(.07, .11) });
}
const bolts: { m: THREE.Mesh; t: number; life: number; restrike: number }[] = [];
/** flicker like a real strike: flash, short dip, re-strike along the same channel, then fade */
export function updateBolts(dt: number) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.t += dt; const k = b.t / b.life;
    const mat = b.m.material as THREE.ShaderMaterial;
    if (k >= 1) { fxTop.remove(b.m); b.m.geometry.dispose(); mat.dispose(); bolts.splice(i, 1); continue; }
    const dip = b.t > b.restrike * .55 && b.t < b.restrike ? .25 : 1;
    mat.uniforms.uK.value = k; mat.uniforms.uOp.value = dip * (.82 + Math.random() * .18) * (k < .1 ? 1.25 : 1);
  }
}
export function clearBolts() { for (const b of bolts) fxTop.remove(b.m); bolts.length = 0; }
