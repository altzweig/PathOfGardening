// Soft look (Basti 22.11.2026, from the look analysis): the last colour step of the frame, in display colours (after tone mapping).
// One pass does: colour grade (day warm/cool, night cool + a little desaturated, vignette, hurt + low-HP red),
// Orton glow (blurred bright parts, screen-blended), lifted night, split toning, slight softening and a tilt-shift depth
// blur (only in the menu and in cutscenes). The blur is drawn at 1/4 resolution (1 copy + 2x2 blur passes of 1/16 of the pixels);
// it replaces the former grade pass, so it adds no full-screen pass. Without bloom (quality Niedrig) the blur is skipped.
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const blurMat = (dir: THREE.Vector2) => new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uDir: { value: dir }, uTexel: { value: new THREE.Vector2() } }, vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec2 o=uDir*uTexel; vec4 c=texture2D(tDiffuse,vUv)*.227;
      c+=(texture2D(tDiffuse,vUv+o*1.385)+texture2D(tDiffuse,vUv-o*1.385))*.316;
      c+=(texture2D(tDiffuse,vUv+o*3.231)+texture2D(tDiffuse,vUv-o*3.231))*.070; gl_FragColor=c; }`,
  depthTest: false, depthWrite: false,
});

export class SoftLookPass extends Pass {
  /** uHurt / uLow are set by the farm view; uTilt is eased towards 1 in the menu and in cutscenes */
  uniforms: Record<string, THREE.IUniform>;
  /** false = no blur at all (quality Niedrig): grade, vignette and night lift only */
  blur = true;
  private a = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private b = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private copy = new FullScreenQuad(new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }));
  private bh = blurMat(new THREE.Vector2(1, 0)); private bv = blurMat(new THREE.Vector2(0, 1));
  private q = new FullScreenQuad(); private comp: THREE.ShaderMaterial;
  private black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  constructor(uDay: THREE.IUniform) {
    super();
    this.black.needsUpdate = true;
    this.uniforms = { tDiffuse: { value: null }, tBlur: { value: null }, uDay, uTexel: { value: new THREE.Vector2() },
      uGlow: { value: 1 }, uTilt: { value: 0 }, uPortrait: { value: 0 }, uHurt: { value: 0 }, uLow: { value: 0 } };
    this.comp = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBlur; uniform float uDay; uniform vec2 uTexel;
        uniform float uGlow; uniform float uTilt; uniform float uPortrait; uniform float uHurt; uniform float uLow; varying vec2 vUv;
        const float G=1./2.2;
        void main(){
          vec3 c=texture2D(tDiffuse,vUv).rgb; float night=1.-uDay;
          // slight softening: 4 taps around the pixel (takes the edge off the low-poly steps)
          vec3 s=(texture2D(tDiffuse,vUv+uTexel*vec2(.75,.75)).rgb+texture2D(tDiffuse,vUv+uTexel*vec2(-.75,.75)).rgb
                 +texture2D(tDiffuse,vUv+uTexel*vec2(.75,-.75)).rgb+texture2D(tDiffuse,vUv+uTexel*vec2(-.75,-.75)).rgb)*.25;
          c=mix(c,s,.3);
          // colour grade (was the grade pass in linear light; here in display colours, factors raised to 1/2.2)
          float l=dot(c,vec3(.299,.587,.114));
          vec3 nt=mix(c*pow(vec3(.8,.95,1.15),vec3(G)), c*pow(vec3(1.06,1.,.9),vec3(G)), smoothstep(.2,.8,l));
          nt=mix(vec3(l)*pow(vec3(.82,.95,1.2),vec3(G)), nt, .8);
          vec3 dt=mix(c*pow(vec3(.96,1.,1.04),vec3(G)), c*pow(vec3(1.04,1.01,.95),vec3(G)), smoothstep(.3,.85,l));
          c=mix(nt,dt,uDay);
          // lifted night: the fields do not sink into black
          c=mix(c,pow(max(c,0.),vec3(.86)),night);
          // Orton glow: bright parts of the blurred image, screen-blended (stronger at night: lanterns, windows)
          vec3 b=texture2D(tBlur,vUv).rgb;
          float thr=mix(.5,.24,night), k=mix(.26,.6,night);
          vec3 g=clamp((b-thr)/(1.-thr),0.,1.)*b; c=1.-(1.-c)*(1.-g*k*uGlow);
          // tilt-shift (menu, cutscenes): far top and nearest bottom take the blurred image
          float top=mix(.45,.38,uPortrait), y=1.-vUv.y;
          float m=pow(clamp((top-y)/top,0.,1.),1.3)*.9+pow(clamp((y-.86)/.14,0.,1.),1.5)*.6;
          c=mix(c,b,m*uTilt*uGlow);
          // split toning: cool shadows, warm lights; a little more colour; blacks lifted a touch
          l=dot(c,vec3(.299,.587,.114)); float w=clamp(l*1.4,0.,1.);
          vec3 tone=mix(mix(vec3(.93,.98,1.08),vec3(1.05,1.,.94),w), mix(vec3(.98,1.,1.02),vec3(1.03,1.005,.965),w), uDay);
          c*=tone; l=dot(c,vec3(.299,.587,.114)); c=l+(c-l)*mix(1.04,1.05,uDay);
          float lift=mix(.012,.02,uDay); c=lift+c*(1.-lift);
          // vignette + hurt + low HP (like before)
          vec2 d=vUv-.5; d.x*=1.2; float r=length(d);
          float vig=mix(smoothstep(.85,.18,r), mix(1.,smoothstep(1.,.25,r),.6), uDay); c*=pow(vig,G);
          c=mix(c, vec3(.79,.17,.17), uHurt*smoothstep(.25,.75,r));
          c+=vec3(.67,.0,.2)*uLow*smoothstep(.42,.8,r);
          gl_FragColor=vec4(c,1.); }`,
    });
  }
  setSize(w: number, h: number) {
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    this.a.setSize(qw, qh); this.b.setSize(qw, qh);
    for (const m of [this.bh, this.bv]) m.uniforms.uTexel.value.set(1 / qw, 1 / qh);
    this.uniforms.uTexel.value.set(1 / w, 1 / h); this.uniforms.uPortrait.value = h > w ? 1 : 0;
  }
  render(r: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const U = this.uniforms;
    if (this.blur) {
      (this.copy.material as THREE.MeshBasicMaterial).map = read.texture;
      r.setRenderTarget(this.a); this.copy.render(r);
      for (let i = 0; i < 2; i++) {
        this.q.material = this.bh; this.bh.uniforms.tDiffuse.value = this.a.texture; r.setRenderTarget(this.b); this.q.render(r);
        this.q.material = this.bv; this.bv.uniforms.tDiffuse.value = this.b.texture; r.setRenderTarget(this.a); this.q.render(r);
      }
      U.tBlur.value = this.a.texture; U.uGlow.value = 1;
    } else { U.tBlur.value = this.black; U.uGlow.value = 0; }
    U.tDiffuse.value = read.texture;
    this.q.material = this.comp; r.setRenderTarget(this.renderToScreen ? null : write); this.q.render(r);
  }
  dispose() { this.a.dispose(); this.b.dispose(); this.comp.dispose(); this.bh.dispose(); this.bv.dispose(); this.copy.dispose(); this.q.dispose(); }
}
