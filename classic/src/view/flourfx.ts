// Mehlsack FX (23.11.2026): flour cloud (sliced volume, noisy, hard white pixel specks), fire dissolve into a flame carpet
// that eats through the cloud concentrically from the ignition point (glowing edge, flame tongues, ember sparks, heat haze).
// All animation runs on the GPU from a handful of uniforms per cloud; one draw call per part. Parameters: balancing.yaml fx.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { camera, composer, gradePass, envU, gfx, scene, pxScale } from './core';
import type { Balancing } from '../config';

type P = Record<string, number>;
const DEF_CLOUD: P = { layers: 6, height: 1.5, noiseScale: 1.6, swirl: .35, density: .95, speckle: .55, speckleSize: 3, color: 0xf4efe4 };
const DEF_FIRE: P = { edgeWidth: .55, flameHeight: 1.1, flameSpeed: 1.6, intensity: 2.2, burnOut: .9, sparks: 220, haze: .004, hazeHeight: 2.2 };
const TONGUES = 56;

// value noise + fbm (3 octaves, cheap enough for mobile), hash for the pixel specks
const NOISE = /* glsl */`
float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s/.875; }
vec3 fireRamp(float k){ // 0 dark red .. 1 white-yellow (HDR, feeds the bloom)
  k=clamp(k,0.,1.);
  vec3 c=mix(vec3(.12,.006,.0), vec3(.85,.07,.0), smoothstep(0.,.35,k));
  c=mix(c, vec3(1.,.2,.008), smoothstep(.3,.72,k));
  return mix(c, vec3(1.,.48,.1), smoothstep(.78,1.,k)); }
`;
// per-cloud uniforms shared by all its parts
const COMMON = /* glsl */`
uniform vec2 uC; uniform float uR, uAge, uLife, uFade, uFS, uTime, uDay; uniform vec3 uIgn; // uIgn = (ix, iz, ignition age | -1)
uniform float uEdge, uBurnOut, uInt, uFlameH, uFlameSpeed;
float frontNow(){ return uIgn.z < 0. ? -1. : (uAge - uIgn.z) * uFS; }
`;

const cloudVS = /* glsl */`
attribute float aLayer; varying vec3 vW; varying float vL;
void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vL=aLayer; gl_Position=projectionMatrix*viewMatrix*w; }`;
const cloudFS = /* glsl */`
${NOISE}${COMMON}
uniform float uScale, uSwirl, uDens, uSpeck, uSpkPx, uLayers, uH; uniform vec3 uCol;
varying vec3 vW; varying float vL;
void main(){
  vec2 d2=vW.xz-uC; float r=length(d2)/uR;
  float grow=1.-pow(1.-clamp(uAge/.45,0.,1.),3.);                  // spin-out: flung outwards, ease-out
  float rr=r/mix(.2,1.,grow);
  float ang=uSwirl*(uAge*.7+(1.-clamp(rr,0.,1.))*1.1)*(.6+vL);      // slow vortex, faster inside and higher up
  float cs=cos(ang), sn=sin(ang); vec2 q=vec2(cs*d2.x-sn*d2.y, sn*d2.x+cs*d2.y);
  vec3 P=vec3(q.x, vL*uH*1.3 - uAge*.25*uSwirl, q.y)*uScale + vec3(uC*.37, 0.);
  float n=fbm(P+vec3(uTime*.05, -uTime*.09, uTime*.03)*uSwirl*3.);
  float n2=fbm(P*2.7+vec3(5.2,1.3,7.7)-vec3(0.,uTime*.2*uSwirl,0.));
  float prof=1.-vL*vL*.5;                                            // dome: lower slices wider
  float dens=smoothstep(1.02,.25,rr/prof+(n-.5)*.75);
  dens*=smoothstep(.3,.78,n*.8+n2*.5+.1-vL*.35);
  dens*=.55+.9*fbm(P*4.1+vec3(0.,-uTime*.3*uSwirl,0.));             // fine grain                  // billows with holes, thinner at the top
  float life=clamp((uLife-uAge)/max(.01,uFade),0.,1.);               // last fade s: thins out into wisps
  dens*=smoothstep(0.,.6,life)*smoothstep(1.-life-.05,1.-life+.25,n2);
  vec3 col=uCol*(.72+.38*vL+.28*n)*mix(.5,1.,uDay);
  float glow=0.;
  float fr=frontNow();
  if(fr>=0.){                                                        // dissolve: burnt away behind the front, glowing rim ahead of it
    float k=length(vW.xz-uIgn.xy)+(n-.5)*uEdge*1.6-fr;
    if(k<0.) discard;
    float t=k/uEdge;                                                 // 0 at the front .. 1 untouched
    float line=1.-smoothstep(.0,.22,t);                              // thin burning line
    float scorch=1.-smoothstep(.15,1.,t);                            // flour browns / heats up ahead of it
    glow=line;
    col=mix(col, col*vec3(.62,.42,.26), scorch*.85);
    col=mix(col, fireRamp(.55+line*.4)*uInt*.3, line);
    dens=max(dens, line*.9*smoothstep(1.1,.8,rr));
  }
  float a=dens*uDens*2.6/uLayers;
  // hard white pixel specks: whole screen pixels (uSpkPx), re-rolled 12x per second, only inside the cloud
  vec2 cell=floor(gl_FragCoord.xy/uSpkPx);
  float h=h21(cell+floor(uTime*12.)*vec2(.137,.711)+vL*17.);
  if(dens>.18 && glow<.3 && h>1.-uSpeck*.06*dens){ col=vec3(1.35); a=1.; }
  if(a<.004) discard;
  gl_FragColor=vec4(col,clamp(a,0.,1.));
}`;

// flame carpet on the ground: the band behind the front burns for burnOut s, then glows out as embers
const carpetVS = /* glsl */`varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const carpetFS = /* glsl */`
${NOISE}${COMMON}
varying vec3 vW;
void main(){
  float fr=frontNow(); if(fr<0.) discard;
  vec2 d2=vW.xz-uC; float r=length(d2)/uR;
  vec3 P=vec3(vW.xz*2.2, uTime*uFlameSpeed*.9);
  float w=fbm(P*.6);
  float n=fbm(P+vec3(w*1.8, -uTime*uFlameSpeed*1.3, 0.));
  float edge=smoothstep(1.08,.86,r+(w-.5)*.35);
  float behind=(fr-length(vW.xz-uIgn.xy)-(w-.5)*.6)/max(.01,uFS*uBurnOut); // 0 = front just passed, 1 = burnt out
  if(behind<0.||behind>2.2) discard;
  float fl=smoothstep(0.,.08,behind)*pow(clamp(1.-behind,0.,1.),1.3);
  float flame=fl*smoothstep(.42,.68,n+fl*.3);
  float ember=smoothstep(.9,2.2,2.2-behind)*step(.83,fbm(vec3(vW.xz*9.,uTime*.4)))*smoothstep(1.,2.2,2.2-behind+.3);
  vec3 col=fireRamp(flame*.85)*flame*uInt*.2 + vec3(.9,.12,.01)*ember*.25*smoothstep(2.2,1.,behind);
  float a=max(flame,ember*.8)*edge;
  if(a<.01) discard;
  gl_FragColor=vec4(col*edge,a);
}`;

// flame tongues: camera-facing quads scattered in the cloud, each lights up when the front reaches it
const tongueVS = /* glsl */`
${COMMON}
attribute vec3 aP; varying vec2 vUv; varying float vLife, vSeed;
void main(){
  vec2 c=uC+aP.xy*uR; float seed=aP.z; vSeed=seed; vUv=uv;
  float fr=frontNow(); float tOn=length(c-uIgn.xy)/max(.01,uFS);
  float l=uIgn.z<0. ? -1. : ((uAge-uIgn.z)-tOn)/max(.01,uBurnOut*(.7+seed*.6)); vLife=l;
  if(l<0.||l>1.){ gl_Position=vec4(2.,2.,2.,1.); return; }
  float hgt=uFlameH*(.55+seed*.8)*sin(3.14159*pow(l,.55)), wid=hgt*.55;
  vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]), up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vec3 wp=vec3(c.x,0.05,c.y)+right*(position.x*wid)+up*(position.y*hgt);   // faces the camera: tall flames even from above
  gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
}`;
const tongueFS = /* glsl */`
${NOISE}
uniform float uTime, uInt, uFlameSpeed; varying vec2 vUv; varying float vLife, vSeed;
void main(){
  vec2 uv=vUv; float t=uTime*uFlameSpeed;
  float n=fbm(vec3(uv.x*3.+vSeed*9., uv.y*2.2-t*2.4, t*.6+vSeed*5.));
  float x=(uv.x-.5)+(n-.5)*.42*uv.y;                                  // licks sideways more at the top
  float wdt=.5*pow(1.-uv.y,.65)*(.75+n*.5);
  float body=1.-smoothstep(wdt*.55,wdt,abs(x));
  body*=smoothstep(0.,.08,uv.y)*smoothstep(1.,.55,uv.y+n*.35);
  float core=1.-smoothstep(0.,wdt*.6,abs(x)); core*=smoothstep(.75,.0,uv.y);
  float k=clamp(body*.55+core*.6-uv.y*.25,0.,1.);
  float fade=smoothstep(1.,.65,vLife);
  float a=body*fade; if(a<.01) discard;
  gl_FragColor=vec4(fireRamp(k*.9)*uInt*.22*a, a);
}`;

// ember sparks: points flung up by the passing front, drag + buoyancy + flutter, all from time in the shader
const sparkVS = /* glsl */`
${COMMON}
attribute vec4 aS; attribute vec3 aV; uniform float uPx; varying float vA;
void main(){
  vec2 c=uC+aS.xy*uR; float seed=aS.z;
  float tOn=length(c-uIgn.xy)/max(.01,uFS)+seed*uBurnOut*.8;
  float a=uIgn.z<0. ? -1. : (uAge-uIgn.z)-tOn, L=.9+aS.w*.9;
  if(a<0.||a>L){ gl_Position=vec4(2.,2.,2.,1.); gl_PointSize=0.; return; }
  float k=a/L;
  vec3 p=vec3(c.x,.1,c.y)+aV*(1.-exp(-a*2.2))/2.2*1.6+vec3(0.,a*(1.2+seed)-.35*a*a,0.);
  p.xz+=vec2(sin(a*9.+seed*40.),cos(a*7.+seed*23.))*.09*a;
  vec4 mv=viewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=uPx*(.028+.02*seed)*(1.-k*.7)/max(.5,-mv.z);
  vA=(1.-k)*(1.-k)*(.6+.4*sin(a*30.+seed*60.));
}`;
const sparkFS = /* glsl */`
uniform float uInt; varying float vA;
void main(){ vec2 d=gl_PointCoord-.5; float r=length(d); if(r>.5) discard;
  float g=smoothstep(.5,.0,r); vec3 col=mix(vec3(1.,.25,.02),vec3(1.,.75,.35),g*g)*uInt*.6;
  gl_FragColor=vec4(col*g*vA, g*vA); }`;

interface CloudView {
  id: number; g: THREE.Group; U: Record<string, THREE.IUniform>; cloud: THREE.Mesh; carpet: THREE.Mesh; tongues: THREE.Mesh; sparks: THREE.Points;
  age: number; sAge: number; gone: boolean; far: number; heat: number;
}

/** haze: screen-space shimmer over burning areas (up to 4), off whenever nothing burns */
const hazePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uN: { value: 0 }, uH: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uTime: { value: 0 }, uAsp: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform int uN; uniform vec4 uH[4]; uniform float uTime, uAsp; varying vec2 vUv;
    void main(){
      vec2 off=vec2(0.);
      for(int i=0;i<4;i++){ if(i>=uN) break; vec4 h=uH[i];
        vec2 d=vUv-h.xy; d.x*=uAsp; float up=clamp(d.y/max(.001,h.z*1.6),-.4,1.);   // column rising above the fire
        float m=exp(-d.x*d.x/(h.z*h.z*.55))*smoothstep(-.4,0.,up)*smoothstep(1.,.2,up);
        float t=uTime*5.;
        vec2 w=vec2(sin(vUv.y*260.-t*2.3+sin(vUv.x*90.+t)*1.6), cos(vUv.x*210.+vUv.y*110.-t*2.7))*(.6+.4*sin(vUv.y*37.-t));
        off+=w*m*h.w; }
      gl_FragColor=texture2D(tDiffuse, vUv+off);
    }`,
});
hazePass.enabled = false;
{ const passes = composer.passes, i = passes.indexOf(gradePass); composer.insertPass(hazePass, i < 0 ? passes.length - 1 : i); }

export class FlourFX {
  private views = new Map<number, CloudView>();
  private cp: P = { ...DEF_CLOUD }; private fp: P = { ...DEF_FIRE }; private fs = 4; private life = 6; private fade = 2;
  private cloudGeo: THREE.BufferGeometry | null = null; private tongueGeo: THREE.InstancedBufferGeometry | null = null; private sparkGeo: THREE.BufferGeometry | null = null;
  private light = new THREE.PointLight(0xff7a22, 0, 9, 1.7);
  constructor() { this.light.position.set(0, 1.2, 0); scene.add(this.light); } // always in the scene (intensity 0): no shader recompile when a fire starts
  setConfig(cfg: Balancing) {
    this.cp = { ...DEF_CLOUD, ...(cfg.fx?.flour ?? {}) }; this.fp = { ...DEF_FIRE, ...(cfg.fx?.fire ?? {}) };
    const F = cfg.skills.flour; if (F) { this.fs = F.frontSpeed; this.life = F.life; this.fade = F.fade; }
    this.cloudGeo = this.tongueGeo = this.sparkGeo = null; this.clear();
  }
  clear() { for (const v of this.views.values()) this.drop(v); this.views.clear(); hazePass.enabled = false; this.light.intensity = 0; }
  private layers() { return gfx.quality === 'niedrig' ? Math.min(3, this.cp.layers) : this.cp.layers; }
  private geoCloud() {
    if (this.cloudGeo) return this.cloudGeo;
    const L = Math.max(1, Math.round(this.layers())), parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < L; i++) {
      const k = L === 1 ? 0 : i / (L - 1), g = new THREE.CircleGeometry(1.15, 40); g.rotateX(-Math.PI / 2); g.translate(0, .08 + k * this.cp.height, 0);
      g.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(k), 1)); parts.push(g);
    }
    return (this.cloudGeo = mergeGeometries(parts)!);
  }
  private geoTongues() {
    if (this.tongueGeo) return this.tongueGeo;
    const q = new THREE.PlaneGeometry(1, 1); q.translate(0, .5, 0);
    const g = new THREE.InstancedBufferGeometry(); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
    const a = new Float32Array(TONGUES * 3);
    for (let i = 0; i < TONGUES; i++) { const r = Math.sqrt((i + .5) / TONGUES) * .92, an = i * 2.39996; a[i * 3] = Math.cos(an) * r; a[i * 3 + 1] = Math.sin(an) * r; a[i * 3 + 2] = Math.random(); }
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 3)); g.instanceCount = TONGUES;
    return (this.tongueGeo = g);
  }
  private geoSparks() {
    if (this.sparkGeo) return this.sparkGeo;
    const N = Math.round(this.fp.sparks * (gfx.quality === 'niedrig' ? .4 : 1)), S = new Float32Array(N * 4), Vv = new Float32Array(N * 3), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(Math.random()), an = Math.random() * 6.283;
      S.set([Math.cos(an) * r, Math.sin(an) * r, Math.random(), Math.random()], i * 4);
      const va = Math.random() * 6.283, vs = .3 + Math.random() * 1.2; Vv.set([Math.cos(va) * vs, .5 + Math.random() * 2.2, Math.sin(va) * vs], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(S, 4)); g.setAttribute('aV', new THREE.BufferAttribute(Vv, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return (this.sparkGeo = g);
  }
  private make(id: number, c: number[]): CloudView {
    const cp = this.cp, fp = this.fp, L = Math.max(1, Math.round(this.layers()));
    const U: Record<string, THREE.IUniform> = {
      uC: { value: new THREE.Vector2(c[1], c[2]) }, uR: { value: c[3] }, uAge: { value: c[4] }, uLife: { value: c[5] || this.life }, uFade: { value: this.fade }, uFS: { value: this.fs },
      uTime: { value: 0 }, uDay: envU.uDay, uIgn: { value: new THREE.Vector3(0, 0, -1) },
      uEdge: { value: fp.edgeWidth }, uBurnOut: { value: fp.burnOut }, uInt: { value: fp.intensity }, uFlameH: { value: fp.flameHeight }, uFlameSpeed: { value: fp.flameSpeed },
      uScale: { value: cp.noiseScale }, uSwirl: { value: cp.swirl }, uDens: { value: cp.density }, uSpeck: { value: cp.speckle }, uSpkPx: { value: cp.speckleSize }, uLayers: { value: L }, uH: { value: cp.height },
      uCol: { value: new THREE.Color(cp.color) }, uPx: { value: pxScale },
    };
    const g = new THREE.Group();
    const cloud = new THREE.Mesh(this.geoCloud(), new THREE.ShaderMaterial({ uniforms: U, vertexShader: cloudVS, fragmentShader: cloudFS, transparent: true, depthWrite: false }));
    cloud.position.set(c[1], 0, c[2]); cloud.scale.set(c[3], 1, c[3]); cloud.renderOrder = 5; cloud.frustumCulled = false;
    const carpet = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: U, vertexShader: carpetVS, fragmentShader: carpetFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    carpet.position.set(c[1], .045, c[2]); carpet.scale.set(c[3], 1, c[3]); carpet.renderOrder = 4; carpet.visible = false;
    const tongues = new THREE.Mesh(this.geoTongues(), new THREE.ShaderMaterial({ uniforms: U, vertexShader: tongueVS, fragmentShader: tongueFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    tongues.frustumCulled = false; tongues.renderOrder = 6; tongues.visible = false;
    const sparks = new THREE.Points(this.geoSparks(), new THREE.ShaderMaterial({ uniforms: U, vertexShader: sparkVS, fragmentShader: sparkFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparks.frustumCulled = false; sparks.renderOrder = 7; sparks.visible = false;
    g.add(cloud, carpet, tongues, sparks); scene.add(g);
    return { id, g, U, cloud, carpet, tongues, sparks, age: c[4], sAge: c[4], gone: false, far: c[3], heat: 0 };
  }
  private drop(v: CloudView) {
    scene.remove(v.g);
    for (const m of [v.cloud, v.carpet, v.tongues, v.sparks]) (m.material as THREE.Material).dispose();
    v.carpet.geometry.dispose();
  }
  /** snapshot rows [id, x, z, r, age, life, ignAge, ix, iz] */
  sync(rows: number[][] | undefined) {
    const seen = new Set<number>();
    for (const c of rows ?? []) {
      seen.add(c[0]);
      let v = this.views.get(c[0]); if (!v) { v = this.make(c[0], c); this.views.set(c[0], v); }
      v.gone = false; v.sAge = c[4]; if (Math.abs(v.age - c[4]) > .25) v.age = c[4];
      (v.U.uC.value as THREE.Vector2).set(c[1], c[2]); v.U.uR.value = c[3];
      v.cloud.position.set(c[1], 0, c[2]); v.cloud.scale.set(c[3], 1, c[3]); v.carpet.position.set(c[1], .045, c[2]); v.carpet.scale.set(c[3], 1, c[3]);
      const ig = v.U.uIgn.value as THREE.Vector3;
      if (c[6] >= 0 && ig.z < 0) { ig.set(c[7], c[8], c[6]); v.far = Math.hypot(c[7] - c[1], c[8] - c[2]) + c[3]; v.carpet.visible = v.tongues.visible = v.sparks.visible = true; }
    }
    for (const v of this.views.values()) if (!seen.has(v.id)) {
      const ig = (v.U.uIgn.value as THREE.Vector3).z;
      if (ig < 0) { this.drop(v); this.views.delete(v.id); } // unlit: gone (faded / replaced)
      else v.gone = true;                                     // burning: the sim is done with it, let the flames finish here
    }
  }
  frame(dt: number) {
    const t = performance.now() / 1000, haze: THREE.Vector4[] = [];
    let best: CloudView | null = null;
    for (const v of [...this.views.values()]) {
      v.age += dt; v.U.uAge.value = v.age; v.U.uTime.value = t; v.U.uPx.value = pxScale;
      const ig = (v.U.uIgn.value as THREE.Vector3).z;
      if (ig >= 0) {
        const tf = v.age - ig, end = v.far / this.fs + this.fp.burnOut;
        v.cloud.visible = tf * this.fs < v.far + this.fp.edgeWidth;
        v.heat = tf < 0 ? 0 : Math.min(1, tf * 4) * Math.max(0, 1 - Math.max(0, tf - end + this.fp.burnOut) / (this.fp.burnOut + .6));
        if (v.gone && tf > end + 2.4) { this.drop(v); this.views.delete(v.id); continue; }
        if (v.heat > .02 && (!best || v.heat > best.heat)) best = v;
        if (v.heat > .02 && haze.length < 4 && this.fp.haze > 0 && gfx.quality !== 'niedrig') haze.push(this.hazeOf(v));
      }
    }
    // one flickering light at the strongest fire (stays in the scene at 0 so nothing recompiles)
    if (best) {
      const ig = best.U.uIgn.value as THREE.Vector3, c = best.U.uC.value as THREE.Vector2, k = Math.min(1, (best.age - ig.z) * this.fs / Math.max(.1, best.far));
      this.light.position.set(ig.x + (c.x - ig.x) * k, 1.1, ig.y + (c.y - ig.y) * k);
      this.light.intensity = 14 * best.heat * (.8 + .2 * Math.sin(t * 23) * Math.sin(t * 7.3));
    } else this.light.intensity = 0;
    const H = hazePass.uniforms;
    H.uN.value = haze.length; haze.forEach((h, i) => (H.uH.value[i] as THREE.Vector4).copy(h)); H.uTime.value = t; H.uAsp.value = camera.aspect;
    hazePass.enabled = haze.length > 0;
  }
  /** screen position / size of a fire for the haze pass: (u, v, radius in v units, strength) */
  private hazeOf(v: CloudView): THREE.Vector4 {
    const c = v.U.uC.value as THREE.Vector2, R = v.U.uR.value as number;
    const p0 = new THREE.Vector3(c.x, .3, c.y).project(camera), p1 = new THREE.Vector3(c.x, .3 + this.fp.hazeHeight, c.y).project(camera);
    const pr = new THREE.Vector3(c.x + R, .3, c.y).project(camera);
    const rad = Math.max(Math.abs(p1.y - p0.y) * .5, Math.hypot((pr.x - p0.x) * camera.aspect, pr.y - p0.y) * .5);
    return new THREE.Vector4(p0.x * .5 + .5, p0.y * .5 + .5, rad, this.fp.haze * v.heat);
  }
}
