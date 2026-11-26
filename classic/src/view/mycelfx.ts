// 26.11.2026 (Basti) Myzel: XP orbs of killed animals (glowing yellow-purple), the shimmer of fields with Myzellen,
// the auto-harvest lightning (yellow bolt with a purple glow on the plant, then the fruit pops out) and the Myzelle
// unlock burst. Everything additive / unlit (no lights: shader prewarm rule), one instanced draw for all orbs.
import * as THREE from 'three';
import { PART, V, burst, decal, lightning, rand } from './core';

export const MYC_YELLOW = 0xffcf1a, MYC_PURPLE = 0x9a3ff0;
const MAX_ORBS = 400;

const shimVert = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const shimFrag = `uniform float uT; uniform float uK; uniform float uR; varying vec2 vP;
void main(){
  float r = length(vP) / uR, a = atan(vP.y, vP.x);
  float band = .5 + .5 * sin(a * 3.0 + uT * 1.3 + r * 7.0) * cos(a * 2.0 - uT * .9 + r * 4.0);
  vec3 col = mix(vec3(.5, .12, .95), vec3(1.0, .72, .08), band * band);
  float pulse = .55 + .45 * sin(uT * 2.2 - r * 6.0);
  float edge = smoothstep(1.0, .55, r) * (.35 + .65 * smoothstep(.15, .7, r));
  gl_FragColor = vec4(col * uK * .75 * pulse * edge, 1.0);
}`;

export class MycelFx {
  readonly g = new THREE.Group();
  private core: THREE.InstancedMesh; private halo: THREE.InstancedMesh;
  private orbs = new Map<number, { x: number; y: number; z: number; ph: number; seen: number }>();
  private frameN = 0; private t = 0;
  private shim = new Map<number, { m: THREE.Mesh; k: number; want: number; mote: number; x: number; z: number }>();
  private shimGeo: THREE.CircleGeometry | null = null; private shimR = 1;
  private dummy = new THREE.Object3D();
  /** glow on a plant while the bolt covers it (purple shell + yellow core), t s of life */
  private glows: { o: THREE.Group; t: number; life: number; mats: THREE.MeshBasicMaterial[] }[] = [];
  private glowGeo = new THREE.SphereGeometry(1, 14, 10);

  constructor(scene: THREE.Scene) {
    const cm = new THREE.MeshBasicMaterial({ color: MYC_YELLOW, toneMapped: false });
    const hm = new THREE.MeshBasicMaterial({ color: MYC_PURPLE, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.core = new THREE.InstancedMesh(new THREE.SphereGeometry(.085, 10, 8), cm, MAX_ORBS);
    this.halo = new THREE.InstancedMesh(new THREE.SphereGeometry(.15, 12, 10), hm, MAX_ORBS);
    for (const m of [this.core, this.halo]) { m.count = 0; m.frustumCulled = false; m.renderOrder = 6; this.g.add(m); }
    scene.add(this.g);
  }
  setHex(H: number) { if (this.shimGeo && Math.abs(this.shimR - H) < 1e-6) return; this.shimGeo?.dispose(); this.shimR = H * .96; this.shimGeo = new THREE.CircleGeometry(this.shimR, 6, Math.PI / 2); }

  /** XP orbs from the snapshot ([id, x, y, z]); smoothed towards the new positions */
  syncOrbs(xo: number[][] | undefined, k: number) {
    const n = ++this.frameN;
    for (const o of xo ?? []) {
      let v = this.orbs.get(o[0]);
      if (!v) { v = { x: o[1], y: o[2], z: o[3], ph: rand(0, 7), seen: n }; this.orbs.set(o[0], v); }
      v.x += (o[1] - v.x) * k; v.y += (o[2] - v.y) * k; v.z += (o[3] - v.z) * k; v.seen = n;
    }
    for (const [id, v] of this.orbs) if (v.seen !== n) this.orbs.delete(id);
  }
  /** a field's Myzellen (0 = no shimmer); strength grows with the count */
  setField(slot: number, x: number, z: number, myc: number, max: number) {
    let s = this.shim.get(slot);
    if (!myc) { if (s) s.want = 0; return; }
    if (!s) {
      if (!this.shimGeo) this.setHex(1.4);
      const mat = new THREE.ShaderMaterial({ vertexShader: shimVert, fragmentShader: shimFrag, uniforms: { uT: { value: 0 }, uK: { value: 0 }, uR: { value: this.shimR } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const m = new THREE.Mesh(this.shimGeo!, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, .075, z); m.renderOrder = 3; this.g.add(m);
      s = { m, k: 0, want: 0, mote: 0, x, z }; this.shim.set(slot, s);
    }
    s.x = x; s.z = z; s.m.position.set(x, .075, z);
    s.want = .18 + .32 * Math.min(1, myc / Math.max(1, max));
  }
  dropField(slot: number) { const s = this.shim.get(slot); if (s) { this.g.remove(s.m); (s.m.material as THREE.Material).dispose(); this.shim.delete(slot); } }
  clear() {
    for (const G of this.glows) { this.g.remove(G.o); for (const m of G.mats) m.dispose(); } this.glows.length = 0;
    for (const s of this.shim.values()) { this.g.remove(s.m); (s.m.material as THREE.Material).dispose(); }
    this.shim.clear(); this.orbs.clear(); this.core.count = this.halo.count = 0;
  }
  /** one invisible orb + one shimmer for the next frame (shader prewarm) */
  warm() { this.orbs.set(-1, { x: 0, y: -5, z: 0, ph: 0, seen: this.frameN }); this.setField(-1, 0, -50, 1, 5); }
  unwarm() { this.orbs.delete(-1); this.dropField(-1); }

  frame(dt: number) {
    this.t += dt; const d = this.dummy, t = this.t;
    let i = 0;
    for (const v of this.orbs.values()) {
      if (i >= MAX_ORBS) break;
      const bob = Math.sin(t * 3 + v.ph) * .04, pu = 1 + Math.sin(t * 7 + v.ph) * .12;
      d.position.set(v.x, v.y + bob, v.z); d.rotation.set(0, 0, 0);
      d.scale.setScalar(pu); d.updateMatrix(); this.core.setMatrixAt(i, d.matrix);
      d.scale.setScalar(pu * (1 + Math.sin(t * 4.3 + v.ph * 2) * .18)); d.updateMatrix(); this.halo.setMatrixAt(i, d.matrix);
      i++;
    }
    this.core.count = this.halo.count = i;
    this.core.instanceMatrix.needsUpdate = this.halo.instanceMatrix.needsUpdate = true;
    for (let k = this.glows.length - 1; k >= 0; k--) {
      const G = this.glows[k]; G.t += dt; const u = G.t / G.life;
      if (u >= 1) { this.g.remove(G.o); for (const m of G.mats) m.dispose(); this.glows.splice(k, 1); continue; }
      const f = Math.min(1, G.t / .06) * (1 - Math.pow(u, 3)) * (.8 + .2 * Math.sin(t * 40 + k));
      G.o.children.forEach((c, i) => { G.mats[i].opacity = (c.userData.op as number) * f; });
      G.o.scale.setScalar(.9 + .25 * u);
    }
    for (const [slot, s] of this.shim) {
      s.k += (s.want - s.k) * Math.min(1, dt * 2.5);
      const U = (s.m.material as THREE.ShaderMaterial).uniforms; U.uT.value = t + slot * 1.7; U.uK.value = s.k;
      if (s.want <= 0 && s.k < .01) { this.dropField(slot); continue; }
      // a few motes rise out of the bed, more with more Myzellen
      s.mote -= dt * s.k * 9;
      if (s.mote <= 0 && slot >= 0) {
        s.mote += 1; const a = rand(0, 7), r = rand(0, this.shimR * .8);
        PART.spawn(V(s.x + Math.cos(a) * r, .1, s.z + Math.sin(a) * r), V(rand(-.05, .05), rand(.25, .5), rand(-.05, .05)), Math.random() < .5 ? MYC_YELLOW : 0xc070ff, rand(.03, .05), rand(.9, 1.5), { a: .9, s1: .01 });
      }
    }
  }
  /** auto harvest of one plant: a yellow bolt with a purple glow comes down onto it (d s, then the fruit pops out) */
  zap(x: number, z: number, d: number) {
    const top = V(x + rand(-.25, .25), 1.9, z + rand(-.25, .25)), hit = V(x, .42, z);
    lightning([[top, hit, 0]], { fork: 2, width: .05, life: Math.max(.25, d), core: 0xffc000, halo: 0x7a20d8, gain: 1.8 });
    // the plant is covered in the glow for d s
    const o = new THREE.Group(), mats: THREE.MeshBasicMaterial[] = [];
    for (const [c, r, op] of [[MYC_PURPLE, .3, .5], [0xb060ff, .2, .7], [MYC_YELLOW, .1, .9]] as const) {
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const s = new THREE.Mesh(this.glowGeo, m); s.scale.set(r, r * 1.25, r); s.userData.op = op; o.add(s); mats.push(m);
    }
    o.position.set(x, .3, z); o.renderOrder = 6; this.g.add(o); this.glows.push({ o, t: 0, life: Math.max(.25, d), mats });
    burst(hit, MYC_YELLOW, 8, 1.4, .06, .3); burst(hit, 0xb060ff, 10, 1, .12, .5);
    decal(x, z, 0xb060ff, .1, .5, { ring: true, add: true, grow: .55, op: .55 });
  }
  /** a Myzelle goes into a field */
  inField(x: number, z: number) {
    burst(V(x, .5, z), MYC_YELLOW, 30, 2.4, .1, .7); burst(V(x, .5, z), 0xb060ff, 30, 2, .16, .9);
    decal(x, z, 0xb060ff, .2, .8, { ring: true, add: true, grow: 1.6, op: .8 });
  }
  /** a Myzelle was won (level-up): sparks swirl up around the player */
  gain(x: number, z: number) {
    for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2, r = rand(.4, .8); PART.spawn(V(x + Math.cos(a) * r, rand(.2, 1.2), z + Math.sin(a) * r), V(-Math.sin(a) * 1.2, rand(1, 2.2), Math.cos(a) * 1.2), k % 2 ? MYC_YELLOW : 0xb060ff, rand(.06, .1), rand(.7, 1.1), { a: 1, drag: 1.5, s1: .02 }); }
    decal(x, z, MYC_YELLOW, .3, .8, { ring: true, add: true, grow: 2.2, op: .9 });
  }
}
