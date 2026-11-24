// 24.11.2026 (Basti): the active weapon hangs diagonally on the back, fixed at its centre, until Space draws it;
// it goes back only when the rake is used again. The weapon turns around its own centre (bounding box centre) and
// flies over the right shoulder between back and hand. Tab only swaps the model: the new one follows the same progress.
import * as THREE from 'three';

interface CarryInfo { c: THREE.Vector3; qMap: THREE.Quaternion; half: number }
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _tq = new THREE.Quaternion();
const _cb = new THREE.Vector3(), _ch = new THREE.Vector3(), _p1 = new THREE.Vector3(), _qb = new THREE.Quaternion(), _s = new THREE.Vector3();
const BOX = new THREE.Box3(), CB = new THREE.Box3();

/** back of the torso (torso-local, see farmer.ts: back surface at z ≈ -.1, chest from y .08 to .4) */
const BACK = new THREE.Vector3(0, .25, -.105);
/** above / outside the +x shoulder (the hand that holds the grip is on the +x side) */
const SHOULDER = new THREE.Vector3(.3, .56, -.02);
const TILT = 40 * Math.PI / 180; // from the vertical

/** bounding box of the model in its own frame; long axis -> diagonal on the back, thin axis -> away from the back */
function info(o: THREE.Object3D): CarryInfo {
  let I = o.userData.carry as CarryInfo | undefined; if (I) return I;
  o.updateMatrixWorld(true); _mi.copy(o.matrixWorld).invert(); BOX.makeEmpty();
  o.traverse(x => {
    const g = (x as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!(x as THREE.Mesh).isMesh || !g || x.userData.outline) return;
    if (!g.boundingBox) g.computeBoundingBox();
    CB.copy(g.boundingBox!).applyMatrix4(_m.multiplyMatrices(_mi, x.matrixWorld)); BOX.union(CB);
  });
  const c = BOX.isEmpty() ? new THREE.Vector3() : BOX.getCenter(new THREE.Vector3()), sz = BOX.isEmpty() ? new THREE.Vector3(.1, .1, .3) : BOX.getSize(new THREE.Vector3());
  const d = [sz.x, sz.y, sz.z], ord = [0, 1, 2].sort((a, b) => d[b] - d[a]); // long, middle, thin
  const L = ord[0], M = ord[1], S = ord[2];
  const dL = new THREE.Vector3(-Math.sin(TILT), -Math.cos(TILT), 0); // muzzle / long end down towards the other hip, grip up at the +x shoulder
  const dS = new THREE.Vector3(0, 0, -1); // thin side flat against the back
  const dM = new THREE.Vector3().crossVectors(dL, dS);
  const cols: THREE.Vector3[] = []; cols[L] = dL; cols[S] = dS; cols[M] = dM;
  const R = new THREE.Matrix4().makeBasis(cols[0], cols[1], cols[2]);
  if (R.determinant() < 0) { cols[M].negate(); R.makeBasis(cols[0], cols[1], cols[2]); }
  I = { c, qMap: new THREE.Quaternion().setFromRotationMatrix(R), half: d[S] / 2 };
  o.userData.carry = I; return I;
}

/** remembers the hand pose that the weapon animations set (some set it only once when the model is built) */
export function carryRestore(objs: (THREE.Object3D | undefined)[]) {
  for (const o of objs) { const h = o?.userData.hand as { p: THREE.Vector3; q: THREE.Quaternion } | undefined; if (o && h) { o.position.copy(h.p); o.quaternion.copy(h.q); } }
}

/**
 * Moves every visible model of objs from its hand pose (as the animations left it) to the back.
 * b: 0 = in the hand, 1 = on the back. g = player group (parent of the models), torso = rig torso.
 * Call after the weapon animations and after the torso's world matrix is up to date.
 */
export function carryApply(objs: (THREE.Object3D | undefined)[], b: number, g: THREE.Object3D, torso: THREE.Object3D) {
  _mi.copy(g.matrixWorld).invert(); _m.multiplyMatrices(_mi, torso.matrixWorld); // torso in player-group space
  _m.decompose(_v, _tq, _s);
  for (const o of objs) {
    if (!o || !o.visible) continue;
    const H = (o.userData.hand ??= { p: new THREE.Vector3(), q: new THREE.Quaternion() }) as { p: THREE.Vector3; q: THREE.Quaternion };
    H.p.copy(o.position); H.q.copy(o.quaternion);
    if (b <= 0) continue;
    const I = info(o), sc = o.scale.x;
    // hand: centre = position + rotated centre offset
    _ch.copy(I.c).multiplyScalar(sc).applyQuaternion(H.q).add(H.p);
    // back: centre on the back, pushed out by (most of) half its thickness: lies on the back, sinks in only a little
    _cb.set(BACK.x, BACK.y, BACK.z - I.half * sc * .8 - .004).applyMatrix4(_m);
    _qb.copy(_tq).multiply(I.qMap);
    const t = 1 - b, e = t * t * (3 - 2 * t);
    // centre flies on a curve over the shoulder (quadratic Bézier), the model turns around its centre
    _p1.copy(SHOULDER).applyMatrix4(_m);
    const u = 1 - t;
    const cx = u * u * _cb.x + 2 * u * t * _p1.x + t * t * _ch.x, cy = u * u * _cb.y + 2 * u * t * _p1.y + t * t * _ch.y, cz = u * u * _cb.z + 2 * u * t * _p1.z + t * t * _ch.z;
    _q.copy(_qb).slerp(H.q, e); o.quaternion.copy(_q);
    o.position.set(cx, cy, cz).sub(_v.copy(I.c).multiplyScalar(sc).applyQuaternion(_q));
  }
}
