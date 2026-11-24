// Händler (24.11.2026, Basti): runtime of the merchant and his cart in the game (model: merchantModel.ts).
// Follows the snapshot, walk cycle, rolling wheels, dust, tarp dissolve, golden sweep / ring / sparkles, sound hooks.
import * as THREE from 'three';
import { PART, V, rand, scene } from './core';
import { BED_Z, U, WHEEL_R, WHEEL_X, buildMerchant, type MerchantView } from './merchantModel';
export { merchantReset, merchantWarm } from './merchantModel';

// ---------------- dust behind the cart (soft, not additive) ----------------
const DN = 90;
const dGeo = new THREE.BufferGeometry(), dPos = new Float32Array(DN * 3), dA = new Float32Array(DN), dS = new Float32Array(DN);
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dGeo.setAttribute('alpha', new THREE.BufferAttribute(dA, 1)); dGeo.setAttribute('size', new THREE.BufferAttribute(dS, 1));
const dMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 500 } }, transparent: true, depthWrite: false,
  vertexShader: `attribute float alpha; attribute float size; varying float vA; uniform float uScale; void main(){ vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.1,d); gl_FragColor=vec4(vec3(.62,.52,.38), a*a*vA); }`,
});
const dust = new THREE.Points(dGeo, dMat); dust.frustumCulled = false; dust.renderOrder = 1;
const dVel = new Float32Array(DN * 3), dLife = new Float32Array(DN), dMax = new Float32Array(DN); let dHead = 0;
function puff(x: number, z: number, vx: number, vz: number) {
  const i = dHead; dHead = (dHead + 1) % DN;
  dPos[i * 3] = x; dPos[i * 3 + 1] = .08; dPos[i * 3 + 2] = z; dVel[i * 3] = vx; dVel[i * 3 + 1] = rand(.15, .4); dVel[i * 3 + 2] = vz;
  dLife[i] = dMax[i] = rand(.9, 1.6); dS[i] = rand(.25, .4);
}
function updateDust(dt: number) {
  for (let i = 0; i < DN; i++) {
    if (dLife[i] <= 0) { dA[i] = 0; continue; }
    dLife[i] -= dt; const t = 1 - dLife[i] / dMax[i];
    for (let c = 0; c < 3; c++) { dPos[i * 3 + c] += dVel[i * 3 + c] * dt; dVel[i * 3 + c] *= 1 - dt * 1.8; }
    dS[i] += dt * .55; dA[i] = .5 * (t < .15 ? t / .15 : 1 - (t - .15) / .85);
  }
  for (const a of ['position', 'alpha', 'size']) (dGeo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
}

// ---------------- runtime: one merchant at a time ----------------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export class MerchantFx {
  private v: MerchantView | null = null;
  private x = 0; private z = 0; private face = 0; private st = -1; private walk = 0; private wheelA = 0;
  private sweepT = -1; private sat = .45; private dis = 0; private squeak = 0; private roll = 0; private ringA = 0;
  /** sound hooks (view -> audio) */
  onSqueak: (x: number, z: number, v: number) => void = () => {};
  onRoll: (x: number, z: number, v: number) => void = () => {};
  constructor(private parent: THREE.Object3D, private talk = 2) { scene.add(dust); }
  setTalk(r: number) { this.talk = r; }
  get view() { return this.v; }
  /** state from the snapshot: [x, z, face, state, t, readyLeft] or undefined */
  sync(mc: number[] | undefined, dt: number, pxScale: number) {
    dMat.uniforms.uScale.value = pxScale; updateDust(dt); U.uTime.value += dt;
    if (!mc) { if (this.v) { this.parent.remove(this.v.g, this.v.ring); this.v = null; this.st = -1; } return; }
    if (!this.v) {
      this.v = buildMerchant(); this.parent.add(this.v.g, this.v.ring);
      this.x = mc[0]; this.z = mc[1]; this.face = mc[2]; this.sat = .45; this.dis = 0; this.sweepT = -1;
      if (mc[3] === 1) { this.dis = 1; this.sat = 1; }
    }
    const [tx, tz, tf, st] = mc, v = this.v;
    if (st !== this.st) {
      if (st === 1 && this.st >= 0) { this.sweepT = 0; for (let i = 0; i < 40; i++) { const a = rand(0, 7), r = rand(.4, 1.6); PART.spawn(V(this.x + Math.cos(a) * r, rand(.1, 1.6), this.z + Math.sin(a) * r), V(Math.cos(a) * rand(.3, 1), rand(.6, 1.8), Math.sin(a) * rand(.3, 1)), 0xffd060, rand(.08, .16), rand(.7, 1.4), { g: .6, drag: 1.5 }); } }
      this.st = st;
    }
    const ox = this.x, oz = this.z;
    const k = 1 - Math.exp(-dt * 12);
    this.x = lerp(this.x, tx, k); this.z = lerp(this.z, tz, k);
    let d = ((tf - this.face + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; this.face += d * k;
    const moved = Math.hypot(this.x - ox, this.z - oz), spd = moved / Math.max(1e-4, dt);
    v.g.position.set(this.x, 0, this.z); v.g.rotation.y = this.face;
    // walk cycle: legs swing, body bobs and leans into the pull, the wheels roll
    this.walk += moved * 4.2; const sw = Math.sin(this.walk), go = Math.min(1, spd / 1.5);
    v.man.legs[0].rotation.x = sw * .55 * go; v.man.legs[1].rotation.x = -sw * .55 * go;
    v.man.body.position.y = Math.abs(Math.cos(this.walk)) * .045 * go; v.man.body.rotation.x = .1 * go + .02;
    v.man.body.rotation.z = Math.sin(this.walk) * .03 * go;
    this.wheelA += moved / WHEEL_R; for (const w of v.wheels) w.rotation.x = this.wheelA;
    v.cart.rotation.x = Math.sin(this.wheelA * 2.3) * .006 * go; v.cart.position.y = Math.abs(Math.sin(this.wheelA * 1.7)) * .012 * go;
    if (spd > .3) { // dust behind the feet and the wheels
      const fx = Math.sin(this.face), fz = Math.cos(this.face), rx = fz, rz = -fx;
      if (Math.random() < dt * 14 * go) puff(this.x - fx * .2 + rand(-.15, .15) * rx, this.z - fz * .2 + rand(-.15, .15) * rz, -fx * .4 + rand(-.2, .2), -fz * .4 + rand(-.2, .2));
      for (const s of [-1, 1]) if (Math.random() < dt * 9 * go) puff(this.x + fx * (BED_Z - .25) + s * rx * WHEEL_X, this.z + fz * (BED_Z - .25) + s * rz * WHEEL_X, -fx * .5 + s * rx * .3, -fz * .5 + s * rz * .3);
      this.squeak += moved / (WHEEL_R * Math.PI); // squeak twice per wheel turn
      if (this.squeak >= 1) { this.squeak -= 1; this.onSqueak(this.x, this.z, go); }
      this.roll -= dt; if (this.roll <= 0) { this.roll = .22; this.onRoll(this.x, this.z, go); }
    }
    // ready: tarp dissolves, colours full, golden ring + sparkles; otherwise pale and covered
    const ready = st === 1;
    if (this.sweepT >= 0) { this.sweepT += dt; const T = 1.2; U.uSweepY.value = -.3 + this.sweepT / T * 2.8; U.uSweepA.value = this.sweepT < T ? Math.sin(Math.PI * this.sweepT / T) : 0; if (this.sweepT > T) this.sweepT = -1; }
    else U.uSweepA.value = 0;
    const disT = ready ? (this.sweepT < 0 || this.sweepT > .25 ? 1 : 0) : 0;
    this.dis = disT > this.dis ? Math.min(1, this.dis + dt / 1.3) : Math.max(0, this.dis - dt / .9);
    this.sat = ready ? Math.min(1, this.sat + dt / .8) : Math.max(.45, this.sat - dt / 1.2);
    U.uDis.value = this.dis; U.uSat.value = this.sat; v.tarp.visible = this.dis < .999;
    this.ringA = ready ? Math.min(1, this.ringA + dt * 2) : Math.max(0, this.ringA - dt * 3);
    v.ring.position.set(this.x, .03, this.z); v.ring.scale.setScalar(this.talk);
    const pulse = .5 + .5 * Math.sin(U.uTime.value * 3);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = this.ringA * (.75 + .25 * pulse);
    ((v.ring.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = this.ringA * (.1 + .12 * pulse); v.ring.visible = this.ringA > .01;
    if (ready && Math.random() < dt * 16) { const a = rand(0, 7), fx = Math.sin(this.face), fz = Math.cos(this.face), back = rand(0, 3.2); PART.spawn(V(this.x - fx * back + Math.cos(a) * rand(.2, .8), rand(.2, 1.4), this.z - fz * back + Math.sin(a) * rand(.2, .8)), V(0, rand(.3, .7), 0), 0xffd36a, rand(.05, .1), rand(1, 1.8), { a: .8 }); }
  }
  clear() { if (this.v) { this.parent.remove(this.v.g, this.v.ring); this.v = null; } this.st = -1; dLife.fill(0); }
}
