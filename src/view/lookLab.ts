// Look lab (22.11.2026, analysis only, not loaded by the game): switches candidate post effects on the running game
// for before/after screenshots and cost measurements. Used from tools/look-lab/ via import('/src/view/lookLab.ts').
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { camera, composer, envU, renderer, scene } from './core';

const VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const blurMat = (dir: THREE.Vector2) => new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uDir: { value: dir }, uTexel: { value: new THREE.Vector2() } }, vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec2 o=uDir*uTexel; vec4 c=texture2D(tDiffuse,vUv)*.227;
      c+=(texture2D(tDiffuse,vUv+o*1.385)+texture2D(tDiffuse,vUv-o*1.385))*.316;
      c+=(texture2D(tDiffuse,vUv+o*3.231)+texture2D(tDiffuse,vUv-o*3.231))*.070; gl_FragColor=c; }`,
});

/** "soft look": Orton glow + slight softening + tilt-shift depth blur + split toning per time of day + lifted night.
 *  Runs after OutputPass (display colours). Cost: 1 downsample + 2 blurs at 1/4 resolution + 1 full-res composite. */
export class SoftLookPass extends Pass {
  private a: THREE.WebGLRenderTarget; private b: THREE.WebGLRenderTarget;
  private copy = new FullScreenQuad(new THREE.MeshBasicMaterial());
  private bh = blurMat(new THREE.Vector2(1, 0)); private bv = blurMat(new THREE.Vector2(0, 1));
  private q = new FullScreenQuad(); private comp: THREE.ShaderMaterial;
  opts = { glow: 1, tilt: 1, grade: 1, soft: 1 };
  constructor() {
    super();
    const o = { type: THREE.HalfFloatType };
    this.a = new THREE.WebGLRenderTarget(1, 1, o); this.b = new THREE.WebGLRenderTarget(1, 1, o);
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tBlur: { value: null }, uDay: envU.uDay, uTexel: { value: new THREE.Vector2() },
        uGlow: { value: 1 }, uTilt: { value: 1 }, uGrade: { value: 1 }, uSoft: { value: 1 }, uPortrait: { value: 0 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBlur; uniform float uDay; uniform vec2 uTexel;
        uniform float uGlow; uniform float uTilt; uniform float uGrade; uniform float uSoft; uniform float uPortrait; varying vec2 vUv;
        void main(){
          vec3 c=texture2D(tDiffuse,vUv).rgb;
          // softening: 4 taps around the pixel
          vec3 s=(texture2D(tDiffuse,vUv+uTexel*vec2(.75,.75)).rgb+texture2D(tDiffuse,vUv+uTexel*vec2(-.75,.75)).rgb
                 +texture2D(tDiffuse,vUv+uTexel*vec2(.75,-.75)).rgb+texture2D(tDiffuse,vUv+uTexel*vec2(-.75,-.75)).rgb)*.25;
          c=mix(c,s,.4*uSoft);
          vec3 b=texture2D(tBlur,vUv).rgb; float night=1.-uDay;
          // lift the night a little (gamma), before the glow
          c=mix(c,pow(c,vec3(.86)),night*uGrade);
          // Orton glow: bright parts of the blurred image, screen-blended
          float thr=mix(.45,.22,night), k=mix(.3,.7,night);
          vec3 g=clamp((b-thr)/(1.-thr),0.,1.)*b; c=1.-(1.-c)*(1.-g*k*uGlow);
          // tilt-shift: far (top) and nearest (bottom) parts take the blurred image
          float top=mix(.45,.38,uPortrait), y=1.-vUv.y;
          float m=pow(clamp((top-y)/top,0.,1.),1.3)*.95+pow(clamp((y-.85)/.15,0.,1.),1.5)*.7;
          c=mix(c,b,m*uTilt);
          // split toning: shadows / highlights tinted, saturation, lifted blacks
          float l=dot(c,vec3(.299,.587,.114)), w=clamp(l*1.4,0.,1.);
          vec3 tone=mix(mix(vec3(.9,.97,1.12),vec3(1.06,1.,.92),w), mix(vec3(.97,1.,1.03),vec3(1.04,1.01,.95),w), uDay);
          vec3 gc=c*tone; l=dot(gc,vec3(.299,.587,.114)); gc=l+(gc-l)*mix(1.05,1.1,uDay); gc=mix(.015,.025,uDay)+gc*(1.-mix(.015,.025,uDay));
          c=mix(c,gc,uGrade);
          gl_FragColor=vec4(c,1.); }`,
    });
  }
  setSize(w: number, h: number) {
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    this.a.setSize(qw, qh); this.b.setSize(qw, qh);
    for (const m of [this.bh, this.bv]) m.uniforms.uTexel.value.set(1 / qw, 1 / qh);
    this.comp.uniforms.uTexel.value.set(1 / w, 1 / h); this.comp.uniforms.uPortrait.value = h > w ? 1 : 0;
  }
  render(r: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    (this.copy.material as THREE.MeshBasicMaterial).map = read.texture;
    r.setRenderTarget(this.a); this.copy.render(r);
    for (let i = 0; i < 2; i++) {
      this.q.material = this.bh; this.bh.uniforms.tDiffuse.value = this.a.texture; r.setRenderTarget(this.b); this.q.render(r);
      this.q.material = this.bv; this.bv.uniforms.tDiffuse.value = this.b.texture; r.setRenderTarget(this.a); this.q.render(r);
    }
    const U = this.comp.uniforms; U.tDiffuse.value = read.texture; U.tBlur.value = this.a.texture;
    U.uGlow.value = this.opts.glow; U.uTilt.value = this.opts.tilt; U.uGrade.value = this.opts.grade; U.uSoft.value = this.opts.soft;
    this.q.material = this.comp; r.setRenderTarget(this.renderToScreen ? null : write); this.q.render(r);
  }
}

const soft = new SoftLookPass();
const fxaa = new ShaderPass(FXAAShader);
let gtao: GTAOPass | null = null;
const out = composer.passes.find(p => p instanceof OutputPass)!;

export interface Look { aa: 'none' | 'msaa' | 'fxaa'; soft: boolean; ao: boolean; softOpts?: Partial<SoftLookPass['opts']> }
export function setLook(L: Look) {
  const P = composer.passes;
  for (const p of [soft, fxaa, gtao]) { if (!p) continue; const i = P.indexOf(p); if (i >= 0) P.splice(i, 1); }
  // MSAA: samples on the composer's two buffers (WebGL2)
  const n = L.aa === 'msaa' ? 4 : 0;
  for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.samples !== n) { t.samples = n; t.dispose(); }
  if (L.ao) {
    if (!gtao) { const s = new THREE.Vector2(); renderer.getDrawingBufferSize(s); gtao = new GTAOPass(scene, camera, s.x, s.y); gtao.blendIntensity = .9; gtao.updateGtaoMaterial({ radius: .5, distanceFallOff: 1, thickness: 1 }); }
    P.splice(1, 0, gtao); // right after the scene render
  }
  const oi = P.indexOf(out);
  if (L.soft) { Object.assign(soft.opts, { glow: 1, tilt: 1, grade: 1, soft: 1 }, L.softOpts ?? {}); P.splice(oi + 1, 0, soft); }
  if (L.aa === 'fxaa') P.push(fxaa);
  const s = new THREE.Vector2(); renderer.getSize(s); composer.setSize(s.x, s.y);
  const pr = renderer.getPixelRatio(); fxaa.uniforms.resolution.value.set(1 / (s.x * pr), 1 / (s.y * pr));
}

/** GPU time of one composer frame: renders n frames, each followed by a 1-pixel read (waits for the GPU) */
export function timeFrames(n = 4) {
  const gl = renderer.getContext(), px = new Uint8Array(4), t: number[] = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); composer.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b); return t[Math.floor(t.length / 2)];
}
