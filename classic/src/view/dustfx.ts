// Werkbank-Staub (P2 Werkbank-Paket, 25.11.2026): small grey dust cloud in front of a hammering figure, hides the spot
// where the hammer lands and puffs up with every blow. Same look as the flour cloud (flourfx.ts: stacked horizontal slices,
// value-noise billows, hard pixel specks) but greyer, smaller and without fire. ONE instanced draw call for all players:
// a fixed set of slots (DUST_CAP) whose values ride along as two instance attributes. The mesh stays in the scene for good;
// a cloud coming or going only changes floats + the instance count (no new meshes / materials / shader compiles).
// Prewarm: call warm() before renderer.compile(), it draws one invisible instance for one frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const DUST_CAP = 8; // 4 players + spare
const LAYERS = 5;

const NOISE = /* glsl */`
float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s/.875; }
`;
const VS = /* glsl */`
attribute vec4 aA, aB; attribute float aLayer;
uniform float uH;
varying vec3 vW; varying float vL; varying vec4 vA, vB;
void main(){
  vA=aA; vB=aB; vL=aLayer;
  float pulse=aB.z, r=aA.w*(1.+pulse*.35);
  vec3 w=vec3(aA.x+position.x*r, aA.y+.02+aLayer*uH*(1.+pulse*.45), aA.z+position.z*r);
  vW=w; gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;
const FS = /* glsl */`
${NOISE}
uniform float uTime, uDay, uDens, uSpeck, uSpkPx; uniform vec3 uCol, uSpkDark, uSpkLight;
varying vec3 vW; varying float vL; varying vec4 vA, vB;
void main(){
  vec2 c=vA.xz; float R=vA.w*(1.+vB.z*.35), alpha=vB.x, seed=vB.y, pulse=vB.z;
  vec2 d2=vW.xz-c; float r=length(d2)/R;
  float ang=(uTime*.9+seed)*(.5+vL)*(1.-r*.5);                          // slow swirl, faster inside and higher up
  float cs=cos(ang), sn=sin(ang); vec2 q=vec2(cs*d2.x-sn*d2.y, sn*d2.x+cs*d2.y);
  vec3 P=vec3(q.x*4., vL*1.6-uTime*.7, q.y*4.)+vec3(seed*7.1, 0., seed*3.3);
  float n=fbm(P+vec3(0.,-uTime*.4,0.)), n2=fbm(P*2.4+vec3(5.2,1.3,7.7)-vec3(0.,uTime*.9,0.));
  float prof=1.-vL*vL*.55;                                               // dome: lower slices wider
  float dens=smoothstep(1.,.2,r/prof+(n-.5)*.8);
  dens*=smoothstep(.28,.72,n*.8+n2*.5+.08-vL*.3+pulse*.15);
  dens*=.6+.8*fbm(P*3.7+vec3(0.,-uTime*.6,0.));
  vec3 col=uCol*(.7+.35*vL+.3*n)*mix(.45,1.,uDay);
  float a=dens*uDens*alpha*(1.+pulse*.6)*8./${LAYERS}.;
  // hard pixel specks (grit + chips), re-rolled 14x per second
  vec2 cell=floor(gl_FragCoord.xy/uSpkPx);
  float h=h21(cell+floor(uTime*14.)*vec2(.137,.711)+vL*17.+seed*31.);
  if(dens>.2 && h>1.-uSpeck*.07*dens*(.6+pulse)){ col=(h>1.-uSpeck*.025*dens ? uSpkLight : uSpkDark)*mix(.5,1.,uDay); a=min(1.,alpha*1.2); }
  if(a<.004) discard;
  gl_FragColor=vec4(col,clamp(a,0.,1.));
}`;

interface Slot { x: number; y: number; z: number; on: boolean; k: number; a: number; pulse: number; seed: number; r: number }
export interface DustFx {
  readonly mesh: THREE.Mesh;
  /** slot i (0..DUST_CAP-1, e.g. player index): cloud centre on the ground under the hammer spot (y = height of its base,
   *  e.g. the bench top), active = hammering, intensity 0..1 = how dense (more players / faster work) */
  set(i: number, x: number, y: number, z: number, active: boolean, intensity?: number): void;
  /** a hammer blow: the cloud puffs up (k = strength 0..1+) */
  pulse(i: number, k?: number): void;
  /** per frame (fades clouds in/out, decays the puffs, uploads the slots) */
  update(dt: number): void;
  /** one invisible instance for the next frame (shader prewarm) */
  warm(): void;
  clear(): void;
}
export interface DustOpts { radius?: number; height?: number; color?: number; density?: number; speckle?: number; speckleSize?: number; dayU?: { value: number } }

/** grey work dust. opts.dayU: pass core.ts envU.uDay so the cloud darkens at night like the flour cloud. */
export function createDust(scene: THREE.Object3D, opts: DustOpts = {}): DustFx {
  const R0 = opts.radius ?? .36, H = opts.height ?? .42;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < LAYERS; i++) {
    const k = i / (LAYERS - 1), g = new THREE.CircleGeometry(1.15, 28); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0);
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(k), 1)); g.deleteAttribute('normal'); g.deleteAttribute('uv'); parts.push(g);
  }
  const base = mergeGeometries(parts)!, geo = new THREE.InstancedBufferGeometry(); geo.index = base.index;
  for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
  const A = new THREE.InstancedBufferAttribute(new Float32Array(DUST_CAP * 4), 4), B = new THREE.InstancedBufferAttribute(new Float32Array(DUST_CAP * 4), 4);
  A.setUsage(THREE.DynamicDrawUsage); B.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aA', A); geo.setAttribute('aB', B); geo.instanceCount = 0; geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const U = {
    uTime: { value: 0 }, uDay: opts.dayU ?? { value: 1 }, uH: { value: H }, uDens: { value: opts.density ?? 1 }, uSpeck: { value: opts.speckle ?? .6 }, uSpkPx: { value: opts.speckleSize ?? 3 },
    uCol: { value: new THREE.Color(opts.color ?? 0xa29c92) }, uSpkDark: { value: new THREE.Color(0x4a4640) }, uSpkLight: { value: new THREE.Color(0xe8e4dc) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh); // stays in the scene for good
  const slots: Slot[] = Array.from({ length: DUST_CAP }, (_, i) => ({ x: 0, y: 0, z: 0, on: false, k: .7, a: 0, pulse: 0, seed: i * 1.37 + .3, r: R0 }));
  let warmN = 0;
  const upload = (n: number) => {
    for (const a of [A, B]) { a.clearUpdateRanges(); if (n) { a.addUpdateRange(0, n * 4); a.needsUpdate = true; } }
    geo.instanceCount = n;
  };
  return {
    mesh,
    set(i, x, y, z, active, intensity = .7) { const s = slots[i]; if (!s) return; s.x = x; s.y = y; s.z = z; s.on = active; s.k = Math.max(0, Math.min(1.5, intensity)); },
    pulse(i, k = 1) { const s = slots[i]; if (s) s.pulse = Math.min(1.4, Math.max(s.pulse, k)); },
    update(dt) {
      U.uTime.value = performance.now() / 1000;
      if (warmN > 0) { warmN--; return; }
      let n = 0;
      for (const s of slots) {
        s.a += ((s.on ? s.k : 0) - s.a) * Math.min(1, dt * (s.on ? 5 : 2.2)); // quick to appear, settles slowly
        s.pulse = Math.max(0, s.pulse - dt * 3.2);
        if (s.a < .01) continue;
        A.array.set([s.x, s.y, s.z, s.r], n * 4); B.array.set([s.a, s.seed, s.pulse, 0], n * 4); n++;
      }
      upload(n);
    },
    warm() { A.array.set([0, -.5, 0, .01], 0); B.array.set([.001, 0, 0, 0], 0); upload(1); warmN = 1; },
    clear() { for (const s of slots) { s.on = false; s.a = 0; s.pulse = 0; } upload(0); },
  };
}
