// Test scene of the VFX lab: ground, gardener as source, training dummies as targets, day-night light, bloom.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneSettings {
  daytime: number; autoBloom: boolean; bloomStrength: number; bloomRadius: number; bloomThreshold: number; exposure: number;
  dummies: number; distance: number; layout: 'bogen' | 'reihe' | 'kreis'; wander: boolean; sweep: boolean; showPlayer: boolean;
  pixelRatio: number; budget: number; bloom: boolean; shadows: boolean;
}
export const SCENE_DEFAULT: SceneSettings = {
  daytime: .15, autoBloom: true, bloomStrength: 1.15, bloomRadius: .6, bloomThreshold: .72, exposure: 1.05,
  dummies: 3, distance: 4.5, layout: 'bogen', wander: false, sweep: false, showPlayer: true,
  pixelRatio: Math.min(devicePixelRatio, matchMedia('(pointer:coarse)').matches ? 1.5 : 2), budget: 1, bloom: true, shadows: true,
};

const C = (h: number) => new THREE.Color(h);
const PAL = {
  sky: { n: C(0x060910), w: C(0x8a6a74), d: C(0x9fc2c9) },
  hemiS: { n: C(0x7b95c8), w: C(0xffc3a0), d: C(0xc4dcff) },
  hemiG: { n: C(0x140f08), w: C(0x3a2a1a), d: C(0x4d4028) },
  light: { n: C(0x9db6ff), w: C(0xffa868), d: C(0xffeccb) },
};
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class LabScene {
  canvas = document.getElementById('c') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
  scene = new THREE.Scene(); top = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, .1, 150);
  controls: OrbitControls;
  composer: EffectComposer; bloom: UnrealBloomPass;
  hemi = new THREE.HemisphereLight(0x7b95c8, 0x120d06, .5); sun = new THREE.DirectionalLight(0x9db6ff, 1.25); lantern = new THREE.PointLight(0xffa04a, 0, 12, 1.6);
  player = new THREE.Group(); wandTip = new THREE.Object3D(); dummies: THREE.Group[] = [];
  aim = 0; private t = 0;
  constructor(public S: SceneSettings) {
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0); this.scene.fog = new THREE.FogExp2(0, .028);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.lantern);
    this.sun.castShadow = true; Object.assign(this.sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
    this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.bias = -.0006; this.sun.shadow.normalBias = .03;
    this.lantern.position.set(-3.5, 2.2, 1.5);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 1.15, .6, .72); this.composer.addPass(this.bloom);
    const topPass = new RenderPass(this.top, this.camera); topPass.clear = false; this.composer.addPass(topPass); // crisp lightning after bloom (like the game)
    this.composer.addPass(new OutputPass());
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * .495; this.controls.minDistance = 1.5; this.controls.maxDistance = 40;
    this.view('spiel');
    this.buildGround(); this.buildPlayer(); this.layoutDummies();
    addEventListener('resize', () => this.resize()); this.resize();
  }
  view(v: 'spiel' | 'nah' | 'seite' | 'oben') {
    const d = this.S.distance, tgt = new THREE.Vector3(0, .5, d * .55);
    // spiel = game camera (landscape 13.5 m up / 9.3 m behind, portrait 18 / 11.6)
    const P: Record<string, [number, number, number]> = { spiel: innerHeight > innerWidth ? [0, 18, tgt.z - 11.6] : [0, 13.5, tgt.z - 9.3], nah: [3.2, 2.6, tgt.z - 4.2], seite: [d + 4, 2.2, tgt.z], oben: [0, 16, tgt.z + .01] };
    this.camera.position.set(...P[v]); this.controls.target.copy(tgt); this.controls.update();
  }
  resize() {
    const w = innerWidth, h = innerHeight, pr = this.S.pixelRatio;
    this.renderer.setPixelRatio(pr); this.composer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  drawingSize(v: THREE.Vector2) { return this.renderer.getDrawingBufferSize(v); }
  private buildGround() {
    const L = new THREE.TextureLoader(), B = import.meta.env.BASE_URL + 'textures/';
    const tex = (n: string) => { const t = L.load(B + n + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff });
    const U = { tG: { value: tex('grass') }, tD: { value: tex('dirt') }, tGD: { value: tex('grassdirt') } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vWP; uniform sampler2D tG, tD, tGD;
float h1(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
float fb(vec2 p){ return n1(p) * .55 + n1(p * 2.13 + 7.1) * .3 + n1(p * 4.37 + 3.3) * .15; }
vec3 noTile(sampler2D T, vec2 uv, float k){ vec2 dx = dFdx(uv), dy = dFdy(uv); float l = k * 8., ia = floor(l), f = fract(l);
  vec3 a = textureGrad(T, uv + sin(vec2(3., 7.) * ia), dx, dy).rgb, b = textureGrad(T, uv + sin(vec2(3., 7.) * (ia + 1.)), dx, dy).rgb;
  return mix(a, b, smoothstep(.2, .8, f - .1 * dot(a - b, vec3(1.)))); }
` + sh.fragmentShader.replace('#include <map_fragment>', `
  vec2 p = vWP.xz; float k = n1(p * .35);
  vec3 grass = mix(noTile(tG, p * .25, k), noTile(tGD, p * .22 + 3., k), smoothstep(.45, .75, fb(p * .15)));
  vec3 dirt = noTile(tD, p * .3, k);
  float r = length(p - vec2(0., 2.6)) + (fb(p * .5) - .5) * 2.2;
  diffuseColor.rgb *= mix(dirt, grass, smoothstep(4.2, 5.4, r)) * (.85 + .3 * fb(p * .9));`);
    };
    const g = new THREE.Mesh(new THREE.CircleGeometry(60, 64), mat); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; this.scene.add(g);
    // a few stones as scale reference
    const stone = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: .9, flatShading: true });
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + Math.random() * .3, rr = 7.5 + Math.random() * 3; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.25 + Math.random() * .35, 0), stone);
      m.position.set(Math.cos(a) * rr, .1, Math.sin(a) * rr + 2.5); m.scale.y = .6; m.rotation.set(Math.random(), Math.random() * 6, 0); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
  }
  private buildPlayer() {
    const P = this.player, M = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .85, flatShading: true, ...o });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number], sc: [number, number, number] = [1, 1, 1], parent: THREE.Object3D = P) => {
      const x = new THREE.Mesh(geo, m); x.position.set(...pos); x.scale.set(...sc); x.castShadow = true; parent.add(x); return x; };
    add(new THREE.CapsuleGeometry(.22, .45, 4, 10), M(0x3f6a3a), [0, .62, 0]);                 // coat
    add(new THREE.SphereGeometry(.17, 14, 10), M(0xe0b090), [0, 1.18, 0]);                     // head
    add(new THREE.CylinderGeometry(.36, .36, .03, 20), M(0xd8b860), [0, 1.3, 0]);               // straw hat brim
    add(new THREE.ConeGeometry(.2, .26, 16), M(0xd8b860), [0, 1.44, 0]);
    const arm = new THREE.Group(); arm.position.set(.24, .92, .05); P.add(arm);
    add(new THREE.CapsuleGeometry(.06, .3, 3, 8), M(0x3f6a3a), [0, 0, .15], [1, 1, 1], arm).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(.015, .02, .5, 6), M(0x6a4a2a), [0, 0, .5], [1, 1, 1], arm).rotation.x = Math.PI / 2; // wand
    add(new THREE.SphereGeometry(.05, 10, 8), M(0xf0cf2a, { emissive: 0xffe46a, emissiveIntensity: .3 }), [0, 0, .77], [1, 1, 1.35], arm);
    this.wandTip.position.set(0, 0, .8); arm.add(this.wandTip);
    this.scene.add(P);
  }
  private makeDummy() {
    const g = new THREE.Group(), M = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: .95, flatShading: true });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number], sc: [number, number, number] = [1, 1, 1]) => {
      const x = new THREE.Mesh(geo, m); x.position.set(...pos); x.scale.set(...sc); x.castShadow = true; x.receiveShadow = true; g.add(x); return x; };
    const wood = M(0x6a4a2c), sack = M(0xb59a68), straw = M(0xd8c070), dark = M(0x2a1e14);
    add(new THREE.CylinderGeometry(.05, .06, 1.5, 7), wood, [0, .75, 0]);
    add(new THREE.CylinderGeometry(.08, .2, .08, 8), wood, [0, .04, 0]);
    add(new THREE.CylinderGeometry(.24, .2, .62, 10), sack, [0, .72, 0]);
    add(new THREE.BoxGeometry(.9, .06, .06), wood, [0, .95, 0]);
    add(new THREE.SphereGeometry(.2, 12, 10), sack, [0, 1.26, 0], [1, .95, .95]);
    for (const x of [-.07, .07]) { const e = add(new THREE.BoxGeometry(.07, .015, .01), dark, [x, 1.3, .19]); e.rotation.z = .8; const e2 = add(new THREE.BoxGeometry(.07, .015, .01), dark, [x, 1.3, .19]); e2.rotation.z = -.8; }
    for (const s of [-1, 1]) { const t = add(new THREE.ConeGeometry(.06, .2, 5), straw, [s * .5, .95, 0]); t.rotation.z = s * Math.PI / 2; }
    add(new THREE.ConeGeometry(.12, .16, 6), straw, [0, 1.47, 0]);
    return g;
  }
  layoutDummies() {
    for (const d of this.dummies) this.scene.remove(d);
    this.dummies = [];
    const n = this.S.dummies, D = this.S.distance;
    for (let i = 0; i < n; i++) {
      const d = this.makeDummy(); let x = 0, z = D;
      if (this.S.layout === 'bogen') { const a = n === 1 ? 0 : (i / (n - 1) - .5) * Math.min(1.6, .45 * n); x = Math.sin(a) * D; z = Math.cos(a) * D; }
      else if (this.S.layout === 'reihe') { x = (i % 2 ? 1 : -1) * .25; z = D * .55 + i * 1.3; }
      else { const a = i / n * 6.283; x = Math.cos(a) * 1.6; z = D + Math.sin(a) * 1.6; }
      d.userData.home = new THREE.Vector3(x, 0, z); d.position.copy(d.userData.home); d.rotation.y = Math.atan2(-x, -z) + Math.PI;
      this.scene.add(d); this.dummies.push(d);
    }
  }
  /** ground points of the dummies, nearest first */
  targets(out: THREE.Vector3[]) { out.length = 0; for (const d of this.dummies) out.push(d.position); return out.sort((a, b) => a.lengthSq() - b.lengthSq()); }
  update(dt: number) {
    this.t += dt;
    if (this.S.wander) this.dummies.forEach((d, i) => { const h = d.userData.home as THREE.Vector3; d.position.set(h.x + Math.sin(this.t * .7 + i * 2) * .9, 0, h.z + Math.sin(this.t * .5 + i) * .6); });
    // aim at the middle of the dummies (optionally sweeping left / right)
    const c = new THREE.Vector3(); for (const d of this.dummies) c.add(d.position); if (this.dummies.length) c.divideScalar(this.dummies.length); else c.set(0, 0, 1);
    this.aim = Math.atan2(c.x, c.z) + (this.S.sweep ? Math.sin(this.t * 1.1) * .7 : 0);
    this.player.rotation.y = this.aim; this.player.visible = this.S.showPlayer;
    this.controls.update();
  }
  applyLight() {
    const S = this.S, x = S.daytime, day = sm(.35, .7, x), warm = Math.max(0, 1 - Math.abs(x - .5) * 4.5), night = 1 - day;
    const pick = (o: { n: THREE.Color; w: THREE.Color; d: THREE.Color }, out: THREE.Color) => out.copy(o.n).lerp(o.d, day).lerp(o.w, warm * (.45 + .3 * day));
    pick(PAL.sky, this.scene.background as THREE.Color); (this.scene.fog as THREE.FogExp2).color.copy(this.scene.background as THREE.Color);
    (this.scene.fog as THREE.FogExp2).density = .024 * night + .012 * day + warm * .006;
    pick(PAL.hemiS, this.hemi.color); pick(PAL.hemiG, this.hemi.groundColor); this.hemi.intensity = .62 * night + 1.25 * day;
    pick(PAL.light, this.sun.color); const elev = .25 + .75 * day;
    this.sun.position.set(-9, 6 + 14 * elev, 7 - 4 * warm); this.sun.intensity = night * 1.45 + day * (2.2 + 1.8 * elev) - warm * .6;
    this.lantern.intensity = 18 * Math.max(night, warm * .4);
    this.renderer.toneMappingExposure = S.autoBloom ? 1.05 * night + 1.22 * day : S.exposure;
    if (S.autoBloom) { S.bloomStrength = +(1.15 * night + .5 * day).toFixed(2); S.bloomThreshold = +(.72 * night + .9 * day).toFixed(2); S.bloomRadius = .6; S.exposure = +this.renderer.toneMappingExposure.toFixed(2); }
    this.bloom.strength = S.bloomStrength; this.bloom.radius = S.bloomRadius; this.bloom.threshold = S.bloomThreshold; this.bloom.enabled = S.bloom;
    if (this.sun.castShadow !== S.shadows) { this.sun.castShadow = S.shadows; this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material; if (m) m.needsUpdate = true; }); }
  }
  render() { this.composer.render(); }
}
