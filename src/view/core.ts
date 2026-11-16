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
export const isTouch =matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

// ---------------- renderer ----------------
export const canvas = document.getElementById('c') as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.03);
export const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

// darker night than the prototype: dim moon, faint sky
export const hemi = new THREE.HemisphereLight(0x7b95c8, 0x120d06, 0.5); scene.add(hemi);
export const moon = new THREE.DirectionalLight(0x9db6ff, 1.25); // slightly cool moonlight
moon.position.set(-9, 18, 7); moon.castShadow = true;
Object.assign(moon.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 50 });
moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.03;
scene.add(moon); scene.add(moon.target);
export const LANT = new THREE.Vector3(Math.cos(Math.PI / 6) * 10.8, 0, Math.sin(Math.PI / 6) * 10.8);
const lantern = new THREE.PointLight(0xffa04a, 22, 14, 1.6); lantern.position.set(LANT.x, 2.3, LANT.z); scene.add(lantern);
export const torch = new THREE.PointLight(0xffc27a, 3.5, 7.5, 1.6); scene.add(torch);
// soft light over the garden so the fields read a bit brighter than the rest of the night
const gardenLight = new THREE.PointLight(0xc8d4ff, 70, 16, 1.3); gardenLight.position.set(0, 6, 1); scene.add(gardenLight);

export type Quality = 'hoch' | 'mittel' | 'niedrig';
const QUAL: Record<Quality, { pr: number; shadow: number; bloom: boolean }> = {
  hoch: { pr: Math.min(devicePixelRatio, 2), shadow: 2048, bloom: true },
  mittel: { pr: Math.min(devicePixelRatio, 1.5), shadow: 1024, bloom: true },
  niedrig: { pr: 1, shadow: 0, bloom: false },
};
export const gfx = { quality: (isTouch ? 'mittel' : 'hoch') as Quality, auto: true };

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 1.15, 0.6, 0.72);
composer.addPass(bloom);
export const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uHurt: { value: 0 }, uLow: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uHurt; uniform float uLow; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 d=vUv-.5; d.x*=1.2; float r=length(d);
      float l=dot(c.rgb,vec3(.299,.587,.114));
      c.rgb=mix(c.rgb*vec3(.8,.95,1.15), c.rgb*vec3(1.06,1.,.9), smoothstep(.05,.6,l));
      c.rgb=mix(c.rgb, vec3(.6,.02,.02), uHurt*smoothstep(.25,.75,r));
      float vig=smoothstep(.8,.2,r); c.rgb*=vig;
      c.rgb+=vec3(.42,.0,.03)*uLow*smoothstep(.42,.8,r); // low-HP: soft red glow on the screen edges, centre stays clear
      gl_FragColor=c; }`,
});
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

/** jagged lightning ribbon through the given points (world space), fades out */
export function bolt(pts: { x: number; y: number; z: number }[], color = 0xbfe4ff, width = .05, life = .18, jag = .12) {
  const path: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = 5;
    for (let k = 0; k < n; k++) {
      const t = k / n, j = k === 0 ? 0 : jag;
      path.push(new THREE.Vector3(lerp(a.x, b.x, t) + rand(-j, j), lerp(a.y, b.y, t) + rand(-j, j) * .6, lerp(a.z, b.z, t) + rand(-j, j)));
    }
  }
  const last = pts[pts.length - 1]; path.push(new THREE.Vector3(last.x, last.y, last.z));
  // 3 layers: wide soft glow, colored body, white-hot core. Colors above 1 (no tone mapping) feed the bloom.
  const layer = (w: number, c: THREE.Color, op: number, ro: number) => {
    const pos: number[] = [];
    for (let i = 0; i < path.length - 1; i++) { // flat strip, thick enough to read from the top-down camera
      const a = path[i], b = path[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
      pos.push(a.x - nx, a.y, a.z - nz, a.x + nx, a.y, a.z + nz, b.x + nx, b.y, b.z + nz, a.x - nx, a.y, a.z - nz, b.x + nx, b.y, b.z + nz, b.x - nx, b.y, b.z - nz);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.renderOrder = ro; scene.add(m);
    fx.push({ m, t: 0, life, r0: 1, r1: 1, op, own: true });
  };
  const c = new THREE.Color(color);
  layer(width * 4, c.clone().multiplyScalar(1.4), .35, 5);
  layer(width * 1.6, c.clone().multiplyScalar(2.6), .9, 6);
  layer(width * .55, new THREE.Color(1, 1, 1).multiplyScalar(3), 1, 7);
}
