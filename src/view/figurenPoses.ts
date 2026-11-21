// The player poses of farmView.animPlayer, re-enacted without the game (dev page figuren.html).
// Keep in step with src/farm/view/farmView.ts (same targets, same timings).
import * as THREE from 'three';
import { animateArms, animateLegs, type Rig } from './farmer';
import { cranGun, handRake, seedBag, sickle, wateringCan } from './arsenal';

export const POSES = ['idle', 'walk', 'crouch', 'kneel', 'weed', 'water', 'refill', 'sow', 'sickle', 'pick', 'pickLow', 'tree', 'gun', 'swing'] as const;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export interface PoseProps { root: THREE.Group; hr: THREE.Object3D; can: ReturnType<typeof wateringCan>; canG: THREE.Group; bag: THREE.Object3D; sick: THREE.Object3D; gun: ReturnType<typeof cranGun> }
export function makeProps(): PoseProps {
  const root = new THREE.Group(), hr = handRake(), canG = new THREE.Group(), can = wateringCan(); canG.add(can.g);
  const bag = seedBag(), sick = sickle(), gun = cranGun(true); gun.g.position.set(.2, .78, .22);
  root.add(hr, canG, bag, sick, gun.g);
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { root, hr, can, canG, bag, sick, gun };
}
/** st: per figure state (smoothing) */
export function posePlayer(R: Rig, g: THREE.Group, body: THREE.Group, pr: PoseProps, pose: string, t: number, dt: number, st: any) {
  st.low ??= 0; st.kneel ??= 0; st.walk ??= 0; st.lean ??= 0; st.twist ??= 0; st.wk ??= 0;
  const px = g.position.x, pz = g.position.z, rot = g.rotation.y;
  const lowAct = ['weed', 'sow', 'kneel', 'pickLow'].includes(pose);
  const walking = pose === 'walk' || pose === 'crouch', crouch = lowAct || pose === 'crouch';
  st.low = lerp(st.low, crouch ? 1 : 0, 1 - Math.exp(-dt * 9));
  st.kneel = lerp(st.kneel, lowAct ? 1 : 0, 1 - Math.exp(-dt * 7));
  const spd = walking ? (pose === 'crouch' ? 1 : 2.2) : 0;
  st.walk = lerp(st.walk, clamp(spd / (st.low > .5 ? 1 : 2.2), 0, 1), 1 - Math.exp(-dt * 10));
  st.wk += spd * dt * (pose === 'crouch' ? 3.4 : 2.1); const wk = st.wk;
  body.position.y = Math.abs(Math.sin(wk)) * .04 * st.walk * (1 - st.low * .6);
  const act = !['idle', 'walk', 'crouch', 'gun', 'swing'].includes(pose);
  const tool = pose === 'weed' ? 'handrake' : pose === 'water' || pose === 'refill' ? 'can' : pose === 'sow' ? 'seed' : pose === 'sickle' ? 'sickle' : ['pick', 'pickLow', 'tree', 'kneel'].includes(pose) ? 'hands' : null;
  const swing = pose === 'swing' ? { t: (t % 1.1) } : null;
  pr.gun.g.visible = pose === 'gun'; pr.canG.visible = tool === 'can'; pr.bag.visible = tool === 'seed'; pr.sick.visible = tool === 'sickle';
  pr.hr.visible = !!swing || tool === 'handrake' || (!act && pose !== 'gun');
  let twist = 0, lean = st.low * (.25 + .45 * st.kneel);
  animateLegs(R, dt, wk, st.walk, { k: st.low, kneel: st.kneel });
  const fw = V(Math.sin(rot), 0, Math.cos(rot)), rt = V(-fw.z, 0, fw.x);
  const at = (r: number, y: number, f: number) => V(px + rt.x * r + fw.x * f, y, pz + rt.z * r + fw.z * f);
  const wp = act ? at(0, 0, lowAct ? .5 : .75) : null;
  let tR: THREE.Vector3 | null = null, tL: THREE.Vector3 | null = null;
  const HR = pr.hr;
  const holdHR = (grip: THREE.Vector3, yaw: number, pitch: number, roll = 0) => { body.updateMatrixWorld(true); HR.position.copy(body.worldToLocal(grip.clone())); HR.rotation.set(pitch, yaw, roll, 'YXZ'); };
  const at2 = t;
  if (swing) {
    const e = 1 - Math.pow(1 - clamp(swing.t / .35, 0, 1), 2.2), yaw = lerp(1.15, -1.15, e), r = .5, y = (1 - st.low) * .98 + st.low * .62;
    tR = at(-Math.sin(yaw) * r * .9 + .05, y, Math.cos(yaw) * r + .1); holdHR(tR, yaw, -.15, -1.35); twist = yaw * .45; lean = Math.max(lean, .12);
  } else if (tool === 'handrake' && wp) {
    const cyc = (at2 * 2.1) % 1, chop = cyc < .35 ? cyc / .35 : 1 - (cyc - .35) / .65;
    const dx = px - wp.x, dz = pz - wp.z, l = Math.hypot(dx, dz) || 1, toMe = V(dx / l, 0, dz / l), pull = cyc < .35 ? 0 : (cyc - .35) / .65 * .12;
    const grip = V(wp.x + toMe.x * (.2 + pull), .1 + chop * .16, wp.z + toMe.z * (.2 + pull));
    holdHR(grip, Math.atan2(-toMe.x, -toMe.z) - rot, .55 - chop * .7); tR = grip;
    const k = clamp(((at2 % 2) / 2 - .7) / .3, 0, 1); tL = k > 0 ? V(wp.x - toMe.z * .08, .06 + k * k * .35, wp.z + toMe.x * .08) : null;
  } else if (!act && pose !== 'gun') {
    const y = (1 - st.low) * .55 + st.low * .3;
    tR = at(.2, y + Math.sin(wk) * .02 * st.walk, .06 + Math.sin(wk + Math.PI) * .06 * st.walk); holdHR(tR, -.1, 1.05 + st.low * .3);
  }
  if (tool === 'can') {
    const refill = pose === 'refill', tilt = refill ? -.2 : .8;
    pr.canG.position.set(.12, refill ? .55 : .78, .38); pr.can.g.rotation.x = lerp(pr.can.g.rotation.x, tilt, Math.min(1, dt * 6)); lean = .1;
  }
  let throwHand: THREE.Vector3 | null = null;
  if (tool === 'seed') {
    const y0 = (1 - st.low) * .72 + st.low * .5; pr.bag.position.set(.18 * st.low - .18 * (1 - st.low), y0, .3 + st.low * .08);
    const ph = (at2 * 1.6) % 1, k = Math.sin(ph * Math.PI); throwHand = at(-.22 + k * .12, y0 + .06 + k * .2, .25 + k * .25);
  }
  if (tool === 'sickle') { const ph = Math.sin(at2 * 6), y = (1 - st.low) * .45 + st.low * .22; pr.sick.position.set(-.15 + ph * .25, y, .45); pr.sick.rotation.set(0, ph * 1.1, -.3); lean = Math.max(lean, .4); }
  let pick: [THREE.Vector3, THREE.Vector3] | null = null;
  if (tool === 'hands' && wp) {
    const high = pose === 'tree', fp = high ? at(0, 0, 1) : wp, dx = fp.x - px, dz = fp.z - pz, l = Math.hypot(dx, dz) || 1, reach = Math.min(l, lowAct ? .62 : .55);
    const hx = px + dx / l * reach, hz = pz + dz / l * reach, sx = -dz / l * .16, sz = dx / l * .16;
    const y = lowAct ? .14 : high ? 1.55 : .9, spd2 = high ? 9 : 3.4, ph = at2 * spd2, a0 = Math.sin(ph), a1 = Math.sin(ph + (high ? 0 : 1.4));
    pick = [V(hx - sx + a0 * .08, y + Math.max(0, a0) * (high ? .05 : .14), hz - sz), V(hx + sx + a1 * .08, y + Math.max(0, a1) * (high ? .05 : .14), hz + sz)]; // arm 0 (left, +x) takes the left point
    if (!lowAct) lean = high ? -.05 : .2;
  }
  st.twist = lerp(st.twist, twist, .4); st.lean = lerp(st.lean, lean, 1 - Math.exp(-dt * 10));
  R.torso.rotation.y += st.twist; R.torso.rotation.x += st.lean;
  g.updateMatrixWorld(true);
  let t0: THREE.Vector3 | null = tL, t1: THREE.Vector3 | null = tR;
  if (pick) { t0 = pick[0]; t1 = pick[1]; }
  else if (pr.gun.g.visible) { t1 = pr.gun.anim.localToWorld(V(0, -.09, -.165)); t0 = pr.gun.anim.localToWorld(V(0, -.01, .12)); }
  else if (pr.canG.visible) { t1 = pr.can.grip.getWorldPosition(V()); t0 = null; }
  else if (pr.bag.visible) { t0 = pr.bag.localToWorld(V(0, .05, 0)); t1 = throwHand; }
  else if (pr.sick.visible) { t1 = pr.sick.localToWorld(V(0, 0, 0)); t0 = null; }
  if (!t0 && st.kneel > .5 && st.low > .5) { const kp = R.legs[0].knee.getWorldPosition(V()); kp.y += .05; t0 = kp; }
  animateArms(R, dt, wk, [t0, t1]);
}
