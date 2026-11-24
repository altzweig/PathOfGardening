// Spiegeleischleuder FX (23.11.2026): fried egg model (crispy brown lace edge, glossy yolk), the frying pan in the hand,
// flying eggs that sizzle and pull steam behind them, and the scent: thin fuzzy wisps that curl outwards from every egg
// (wavy, turning by 15-25 deg now and then, sometimes a loop). All wisps share one ribbon mesh (one draw call).
import * as THREE from 'three';
import { GEO, M, PART, V, envU, part, rand, scene } from './core';

// ---------- fried egg ----------
const EGG_WHITE = new THREE.MeshLambertMaterial({ color: 0xc4bdad, vertexColors: true });
const YOLK = new THREE.MeshStandardMaterial({ color: 0xffa21a, roughness: .18, emissive: 0xff7a00, emissiveIntensity: .06 });
const YOLK_HI = new THREE.MeshBasicMaterial({ color: 0xfff0d8, transparent: true, opacity: .3 });

/** irregular blob of egg white: domed top, thin skirt, golden-brown crispy rim (vertex colours) */
function whiteGeo(seed: number) {
  const N = 28, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const rim = (a: number) => 1 + .13 * Math.sin(a * 3 + seed) + .07 * Math.sin(a * 5 + seed * 2.3) + .05 * Math.sin(a * 9 + seed * 4.1);
  const ox = Math.cos(seed) * .12, oz = Math.sin(seed) * .1; // the white runs out a bit to one side
  pos.push(0, .03, 0); col.push(1, 1, 1);
  for (let ring = 1; ring <= 3; ring++) for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, k = ring / 3, r = rim(a) * k, y = ring === 3 ? .006 : .03 * (1 - k * k) + .008;
    pos.push(Math.cos(a) * r + ox * k, y, Math.sin(a) * r + oz * k);
    const b = ring === 3 ? .72 : ring === 2 ? .97 : 1; col.push(1, b * (ring === 3 ? .92 : 1), b * (ring === 3 ? .7 : 1)); // golden lace at the edge
  }
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(0, 1 + j, 1 + i); }
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < N; i++) { const j = (i + 1) % N, a = 1 + ring * N, b = a + N; idx.push(a + i, a + j, b + i, a + j, b + j, b + i); }
  // skirt down to the ground
  const base = pos.length / 3;
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, r = rim(a) * 1.02; pos.push(Math.cos(a) * r + ox, 0, Math.sin(a) * r + oz); col.push(.85, .62, .36); }
  for (let i = 0; i < N; i++) { const j = (i + 1) % N, t = 1 + 2 * N; idx.push(t + i, t + j, base + i, t + j, base + j, base + i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
const WHITES = [0, 1, 2, 3].map(i => whiteGeo(i * 1.7 + .4));
/** one fried egg, radius ~s m, lying flat (y up) */
export function friedEgg(s = .12, seed = Math.floor(Math.random() * 4)) {
  const g = new THREE.Group();
  const w = new THREE.Mesh(WHITES[seed % 4], EGG_WHITE); w.scale.set(s, s, s); w.castShadow = true; w.receiveShadow = true; g.add(w);
  const y = part(g, GEO.sph, YOLK, s * .36, s * .22, s * .36, s * .05, s * .27, -s * .04); y.castShadow = false;
  part(g, GEO.sph, YOLK_HI, s * .09, s * .04, s * .07, -s * .06, s * .45, -s * .12, false);
  return g;
}

// ---------- frying pan (Spiegeleischleuder) ----------
const IRON = M(0x2e2c2e, { m: .55, r: .45, flat: false }), IRON_IN = M(0x1c1a1c, { m: .6, r: .3, flat: false }), WOOD = M(0x6a4428);
/** cast iron frying pan, handle along -z (towards the hand), 3 fried eggs inside */
export function fryingPan() {
  const g = new THREE.Group(), pan = new THREE.Group(); g.add(pan);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.19, .16, .045, 22, 1, true), IRON); (bowl.material as THREE.Material).side = THREE.DoubleSide; bowl.position.y = .022; bowl.castShadow = true; pan.add(bowl);
  part(pan, GEO.cyl, IRON_IN, .16, .01, .16, 0, .003, 0);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(.19, .008, 6, 26), IRON); lip.rotation.x = Math.PI / 2; lip.position.y = .045; pan.add(lip);
  part(pan, GEO.box, IRON, .03, .015, .12, 0, .035, -.24);
  part(pan, GEO.box, WOOD, .036, .03, .16, 0, .045, -.37);
  const eggs = new THREE.Group(); pan.add(eggs);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + .4, e = friedEgg(.06, i); e.position.set(Math.cos(a) * .075, .01, Math.sin(a) * .075); e.rotation.y = rand(0, 7); eggs.add(e); }
  return { g, pan, eggs };
}

// ---------- scent wisps ----------
const WN = 26, WMAX = 48; // points per wisp, wisps at once
interface Wisp { on: boolean; x: number; y: number; z: number; h: number; sp: number; age: number; life: number; turnT: number; loop: number; ph: number; fq: number; amp: number; pts: number[]; n: number; pushT: number; w: number }
const wispVS = /* glsl */`
attribute vec2 aUV; attribute float aA; varying vec2 vUV; varying float vA; varying vec3 vW;
void main(){ vUV=aUV; vA=aA; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const wispFS = /* glsl */`
uniform float uTime, uDay; varying vec2 vUV; varying float vA; varying vec3 vW;
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
void main(){
  float v=abs(vUV.y);
  float n=vn(vec2(vUV.x*38.-uTime*2.,vUV.y*3.+uTime))*.6+vn(vW.xz*26.+uTime*.7)*.4;   // fuzzy, slightly grainy edge like chalk
  float core=smoothstep(1.,.15,v+(n-.5)*.75);
  float grain=step(.18,h21(floor(gl_FragCoord.xy/1.5)+floor(uTime*14.)));              // tiny speckles break the ribbon up
  float ends=smoothstep(0.,.25,vUV.x)*smoothstep(1.,.82,vUV.x);                        // thin tail and soft head
  float a=core*ends*vA*(.55+.45*grain);
  if(a<.01) discard;
  gl_FragColor=vec4(vec3(1.,.985,.95)*mix(.6,1.,uDay),a*.75);
}`;

export class EggFX {
  private eggs = new Map<number, { g: THREE.Group; x: number; y: number; z: number; tx: number; ty: number; tz: number; landed: boolean; out: number; r: number; left: number; emitT: number; spin: THREE.Vector3; seen: number; eat: number }>();
  private wisps: Wisp[] = [];
  private mesh: THREE.Mesh; private geo = new THREE.BufferGeometry(); private mat: THREE.ShaderMaterial;
  private pos = new Float32Array(WMAX * WN * 2 * 3); private uv = new Float32Array(WMAX * WN * 2 * 2); private al = new Float32Array(WMAX * WN * 2);
  private frameN = 0; private time = 0;
  constructor() {
    const idx: number[] = [];
    for (let w = 0; w < WMAX; w++) for (let i = 0; i < WN - 1; i++) { const a = (w * WN + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aUV', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDay: envU.uDay }, vertexShader: wispVS, fragmentShader: wispFS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; scene.add(this.mesh);
    for (let i = 0; i < WMAX; i++) this.wisps.push({ on: false, x: 0, y: 0, z: 0, h: 0, sp: 0, age: 0, life: 1, turnT: 0, loop: 0, ph: 0, fq: 0, amp: 0, pts: new Array(WN * 3).fill(0), n: 0, pushT: 0, w: .08 });
  }
  clear() { for (const e of this.eggs.values()) scene.remove(e.g); this.eggs.clear(); for (const w of this.wisps) w.on = false; }
  /** snapshot rows: [id, x, y, z, landed, left 0..1, outward angle, lure radius, eaters] */
  sync(rows: number[][] | undefined) {
    const id = ++this.frameN;
    for (const r of rows || []) {
      let e = this.eggs.get(r[0]);
      if (!e) {
        const g = friedEgg(.13); scene.add(g);
        e = { g, x: r[1], y: r[2], z: r[3], tx: r[1], ty: r[2], tz: r[3], landed: false, out: r[6], r: r[7], left: 1, emitT: 0, spin: V(rand(6, 11), rand(-2, 2), rand(-3, 3)), seen: id, eat: 0 };
        this.eggs.set(r[0], e);
      }
      const was = e.landed;
      e.tx = r[1]; e.ty = r[2]; e.tz = r[3]; e.landed = !!r[4]; e.left = r[5]; e.out = r[6]; e.r = r[7]; e.eat = r[8] || 0; e.seen = id;
      if (e.landed && !was) { e.x = e.tx; e.y = e.ty; e.z = e.tz; this.land(e); }
    }
    for (const [k, e] of this.eggs) if (e.seen !== id) { // eaten up / gone: a last little puff
      for (let i = 0; i < 5; i++) PART.spawn(V(e.x + rand(-.08, .08), .08, e.z + rand(-.08, .08)), V(rand(-.2, .2), rand(.2, .5), rand(-.2, .2)), 0x5a5650, .14, rand(.6, 1), { s1: .3, a: .5 });
      scene.remove(e.g); this.eggs.delete(k);
    }
  }
  private land(e: { x: number; z: number; out: number; r: number }) {
    for (let i = 0; i < 10; i++) { const a = rand(0, 7); PART.spawn(V(e.x, .06, e.z), V(Math.cos(a) * rand(.4, 1.2), rand(.3, .9), Math.sin(a) * rand(.4, 1.2)), 0xffe8b0, .045, rand(.25, .5), { g: 4 }); } // fat spatters
    for (let i = 0; i < 6; i++) PART.spawn(V(e.x + rand(-.1, .1), .1, e.z + rand(-.1, .1)), V(rand(-.15, .15), rand(.4, .8), rand(-.15, .15)), 0x6a6864, .16, rand(.8, 1.3), { s1: .45, a: .55 });
    this.emit(e, 0); this.emit(e, .35);
  }
  /** a new scent wisp leaves the egg pointing outwards (away from the centre of the three eggs) */
  private emit(e: { x: number; z: number; out: number; r: number }, pre: number) {
    const w = this.wisps.find(x => !x.on) ?? this.wisps.reduce((m, x) => x.age / x.life > m.age / m.life ? x : m);
    const life = rand(2.6, 3.4);
    Object.assign(w, { on: true, x: e.x + Math.cos(e.out) * .1, y: rand(.12, .22), z: e.z + Math.sin(e.out) * .1, h: e.out + rand(-.45, .45), sp: Math.max(.8, e.r * .95 / life), age: -pre, life, turnT: rand(.3, .8), loop: 0, ph: rand(0, 7), fq: rand(.9, 1.6), amp: rand(.35, .7), n: 0, pushT: 0, w: rand(.08, .13) });
  }
  frame(dt: number) {
    this.time += dt; this.mat.uniforms.uTime.value = this.time;
    // eggs: fly tumbling (sizzling, steam trail), then lie, shrink while being eaten, keep sending scent out
    for (const e of this.eggs.values()) {
      const k = 1 - Math.exp(-dt * 18); e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k;
      e.g.position.set(e.x, e.y, e.z);
      if (!e.landed) {
        e.g.rotation.x += e.spin.x * dt * .35; e.g.rotation.z += e.spin.z * dt * .2; e.g.rotation.y += e.spin.y * dt;
        if (Math.random() < .9) PART.spawn(V(e.x + rand(-.05, .05), e.y + .02, e.z + rand(-.05, .05)), V(rand(-.1, .1), rand(.2, .5), rand(-.1, .1)), 0x8a8884, rand(.12, .2), rand(.5, .9), { s1: .4, a: .5, drag: 2 }); // steam trail
        if (Math.random() < .35) PART.spawn(V(e.x, e.y, e.z), V(rand(-.8, .8), rand(.2, 1), rand(-.8, .8)), 0xffd890, .035, .25, { g: 5 }); // sizzling fat
      } else {
        e.g.rotation.x *= .7; e.g.rotation.z *= .7;
        const s = .45 + .55 * e.left; e.g.scale.setScalar(s);
        e.emitT -= dt; if (e.emitT <= 0) { e.emitT = rand(.9, 1.3); this.emit(e, 0); }
        if (Math.random() < dt * 2.5) PART.spawn(V(e.x + rand(-.06, .06), .08, e.z + rand(-.06, .06)), V(rand(-.05, .05), rand(.25, .45), rand(-.05, .05)), 0x4a4846, .12, rand(.9, 1.4), { s1: .3, a: .5 }); // still steaming a bit
      }
    }
    // wisps: wavy heading, now and then a turn of 15-25 deg or a loop; trail of points -> flat ribbon
    let v = 0;
    for (let wi = 0; wi < WMAX; wi++) {
      const w = this.wisps[wi];
      if (w.on) {
        w.age += dt;
        if (w.age >= w.life) w.on = false;
        else if (w.age > 0) {
          w.turnT -= dt;
          if (w.turnT <= 0) { w.turnT = rand(.35, .9); if (Math.random() < .14 && !w.loop) w.loop = Math.PI * 2 * (Math.random() < .5 ? 1 : -1); else w.h += (Math.random() < .5 ? -1 : 1) * rand(15, 25) * Math.PI / 180; }
          let hd = w.h + Math.sin(w.age * w.fq * Math.PI * 2 + w.ph) * w.amp;
          if (w.loop) { const st = Math.sign(w.loop) * Math.min(Math.abs(w.loop), dt * 9); w.loop -= st; w.h += st; hd = w.h; }
          const sp = w.sp * (w.loop ? .6 : 1) * (1 - .35 * w.age / w.life);
          w.x += Math.cos(hd) * sp * dt; w.z += Math.sin(hd) * sp * dt; w.y += dt * .07;
          w.pushT -= dt;
          if (w.pushT <= 0 || w.n === 0) { w.pushT = .055; if (w.n < WN) w.n++; for (let i = w.n - 1; i > 0; i--) { w.pts[i * 3] = w.pts[(i - 1) * 3]; w.pts[i * 3 + 1] = w.pts[(i - 1) * 3 + 1]; w.pts[i * 3 + 2] = w.pts[(i - 1) * 3 + 2]; } }
          w.pts[0] = w.x; w.pts[1] = w.y; w.pts[2] = w.z;
        }
      }
      // write ribbon (hidden: alpha 0)
      const life = w.on && w.age > 0 && w.n > 1 ? Math.min(1, w.age / .3) * Math.min(1, (w.life - w.age) / .9) : 0;
      for (let i = 0; i < WN; i++) {
        const j = Math.min(i, Math.max(0, w.n - 1)), j2 = Math.min(j + 1, Math.max(0, w.n - 1)), j0 = Math.max(0, j - 1);
        const px = w.pts[j * 3], py = w.pts[j * 3 + 1], pz = w.pts[j * 3 + 2];
        let tx = w.pts[j0 * 3] - w.pts[j2 * 3], tz = w.pts[j0 * 3 + 2] - w.pts[j2 * 3 + 2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const u = w.n > 1 ? 1 - j / (w.n - 1) : 0, half = w.w * (.35 + .65 * Math.sin(Math.min(1, u * 1.15) * Math.PI * .9 + .2)) * .5;
        for (const sd of [-1, 1]) {
          this.pos[v * 3] = px - tz * half * sd; this.pos[v * 3 + 1] = py; this.pos[v * 3 + 2] = pz + tx * half * sd;
          this.uv[v * 2] = u; this.uv[v * 2 + 1] = sd; this.al[v] = life; v++;
        }
      }
    }
    for (const a of ['position', 'aUV', 'aA']) (this.geo.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------- raw egg (Eierschleuder shot) ----------
const RAW = new THREE.MeshStandardMaterial({ color: 0xf6e8cc, roughness: .4, emissive: 0xfff0d0, emissiveIntensity: .1 });
/** raw egg in flight, about 7 cm long (long axis along z) */
export function rawEgg() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), RAW); m.scale.set(.028, .028, .036); m.castShadow = true; g.add(m);
  return g;
}
