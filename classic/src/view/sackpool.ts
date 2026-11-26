// Mehlsäcke (26.11.2026): three long burlap flour sacks stacked like sandbags along one tile edge (a sack is a field side long),
// tied at both ends, a faded mill stripe in the middle. Like wallpool.ts: fixed InstancedMesh pools that stay in the scene for the
// whole game (sacks, flour puff bits) + one translucent ghost stack (aim preview of the local player). Coming / going only changes
// matrices, colours and instance counts: no new meshes or shader compiles.
// Per stack: drop-in (the sacks fall onto each other one after another), damage (darker, top sack slumps, from 2/3 HP down the top
// sack is gone, from 1/3 the middle one too), wobble + a little flour on every bite, bursting (flour puff, sacks sink away).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SACK_CAP = 200, BIT_CAP = 160;
export interface SackPiece { id: number; x: number; z: number; ang: number; hp: number; maxHp: number }
export interface SackPool {
  /** current stacks (snapshot sk); len = length of one sack (field side); instant = no drop-in (loading a save, joining) */
  sync(pieces: SackPiece[], len: number, instant?: boolean): void;
  /** aim preview: null = hidden; ok = enough flour (white) or not (red) */
  ghost(at: { x: number; z: number; ang: number; ok: boolean } | null, len: number): void;
  update(dt: number): void;
  warm(): void;
  clear(): void;
}

const C = (h: number) => new THREE.Color(h);
const BURLAP = C(0xd9c497), BURLAP_DK = C(0xb79d6c), STRIPE = C(0x9b5a3c), TIE = C(0x8a6a3e);
function paint(g: THREE.BufferGeometry, col: (cx: number) => THREE.Color, jit = .05) {
  const g2 = g.index ? g.toNonIndexed() : g, n = g2.attributes.position.count, a = new Float32Array(n * 3), p = g2.attributes.position;
  for (let i = 0; i < n; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, c = col(cx), j = 1 + (Math.random() - .5) * jit * 2;
    for (let k = 0; k < 3; k++) a.set([c.r * j, c.g * j, c.b * j], (i + k) * 3);
  }
  g2.setAttribute('color', new THREE.BufferAttribute(a, 3)); g2.deleteAttribute('uv'); return g2;
}
/** one sack along x from -.5 to .5: a fat pillow pinched at both ends (tied), flat at the bottom, slightly saggy on top */
function sackGeo() {
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x);
    const pinch = 1 - .62 * Math.pow(ax, 6), bulge = 1 + .05 * Math.sin(x * 13 + z * 4) * (1 - ax);
    let yy = y * pinch * bulge; if (yy < -.55) yy = -.55 - (yy + .55) * .15; // flat bottom where it rests
    p.setXYZ(i, x * .47, yy * .13 + .02 * (1 - x * x), z * pinch * bulge * .2);
  }
  const body = paint(g, cx => Math.abs(cx) < .05 ? STRIPE : Math.abs(cx) > .4 ? BURLAP_DK : BURLAP, .06);
  const tie = (sx: number) => paint(new THREE.CylinderGeometry(.035, .05, .07, 6).rotateZ(Math.PI / 2).translate(sx * .47, 0, 0), () => TIE, .1);
  const ear = (sx: number) => paint(new THREE.ConeGeometry(.06, .08, 5).rotateZ(-sx * Math.PI / 2).translate(sx * .53, .01, 0), () => BURLAP_DK, .1);
  return mergeGeometries([body, tie(-1), tie(1), ear(-1), ear(1)])!;
}
function bitGeo() { return paint(new THREE.IcosahedronGeometry(1, 0).scale(.06, .05, .06), () => new THREE.Color(1, 1, 1), 0); }

/** the three sacks of a stack: [offset across the edge, height, length share, yaw jitter] */
const LAYERS: [number, number, number, number][] = [[0, .12, 1, 0], [.03, .34, .97, .03], [-.02, .55, .92, -.04]];
interface View { id: number; x: number; z: number; ang: number; hp: number; max: number; born: number; wob: number; seen: number; dying: number; j: number }
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const DROP = .16, DIE = .4;
const HURT = new THREE.Color(.55, .45, .35), WHITE = new THREE.Color(1, 1, 1);

export function createSackPool(scene: THREE.Object3D): SackPool {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .92 });
  const mk = (g: THREE.BufferGeometry, n: number, shadow: boolean) => {
    const m = new THREE.InstancedMesh(g, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, WHITE); m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m;
  };
  const geo = sackGeo(), sacks = mk(geo, SACK_CAP * 3 + 12, true), bits = mk(bitGeo(), BIT_CAP, false);
  // ghost: the same three sacks, translucent, always in the scene (scaled to nothing while hidden: no visible toggles)
  const gMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .38, depthWrite: false });
  const ghostM = new THREE.InstancedMesh(geo, gMat, 3); ghostM.frustumCulled = false; ghostM.renderOrder = 5; scene.add(ghostM);
  for (let i = 0; i < 3; i++) ghostM.setMatrixAt(i, new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -2, 0)); gMat.opacity = 0;
  const views = new Map<number, View>(); let frame = 0, now = 0, warmN = 0, L = 1.4;
  let gAt: { x: number; z: number; ang: number; ok: boolean } | null = null, gK = 0;
  const B: { p: THREE.Vector3; v: THREE.Vector3; life: number; s: number }[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color(), GOK = new THREE.Color(1, 1, 1), GNO = new THREE.Color(1, .35, .3);
  const puff = (v: View, n: number, sp = 1) => {
    for (let i = 0; i < n; i++) {
      if (B.length >= BIT_CAP) B.shift();
      const t = (Math.random() - .5) * L, ux = Math.sin(v.ang), uz = Math.cos(v.ang), a = Math.random() * Math.PI * 2, r = (.3 + Math.random() * .9) * sp;
      B.push({ p: new THREE.Vector3(v.x + ux * t, .25 + Math.random() * .4, v.z + uz * t), v: new THREE.Vector3(Math.cos(a) * r, .4 + Math.random() * 1.2 * sp, Math.sin(a) * r), life: .6 + Math.random() * .7, s: .6 + Math.random() * .9 });
    }
  };
  const dmg = (v: View) => 1 - Math.max(0, Math.min(1, v.hp / Math.max(1, v.max)));
  const place = (m: THREE.InstancedMesh, i: number, x: number, z: number, ang: number, layer: number, drop: number, d: number, wob: number, sink: number) => {
    const [off, y, ls, yj] = LAYERS[layer], ux = Math.cos(ang - Math.PI / 2), uz = -Math.sin(ang - Math.PI / 2); // across the edge
    const fall = drop < 1 ? (1 - drop) * (1 - drop) * .9 : 0, slump = layer === 2 ? d * .06 : 0, w = Math.sin(wob * 22) * wob * .05;
    e.set(w * (layer + 1) * .5, ang - Math.PI / 2 + yj, 0); q.setFromEuler(e);
    s.set(L * ls * (1 + wob * .04), 1 - slump * 2 - wob * .06, 1 + slump);
    m.setMatrixAt(i, m4.compose(p.set(x + ux * off, y + fall - slump - sink, z + uz * off), q, s));
  };
  return {
    sync(pieces, len, instant = false) {
      const id = ++frame; L = len * .98;
      for (const pc of pieces) {
        let v = views.get(pc.id);
        if (!v || v.dying >= 0) {
          if (!v && views.size >= SACK_CAP + 12) continue;
          v = { id: pc.id, x: pc.x, z: pc.z, ang: pc.ang, hp: pc.hp, max: pc.maxHp, born: instant ? -9 : now, wob: 0, seen: id, dying: -1, j: hash(pc.id) };
          views.set(pc.id, v); if (!instant) puff(v, 6, .5);
        }
        if (pc.hp < v.hp - 1e-3) { v.wob = 1; puff(v, 2, .4); }
        v.x = pc.x; v.z = pc.z; v.ang = pc.ang; v.hp = pc.hp; v.max = pc.maxHp; v.seen = id;
      }
      for (const v of views.values()) if (v.seen !== id && v.dying < 0) { v.dying = now; puff(v, v.hp <= 0 ? 26 : 8, v.hp <= 0 ? 1.3 : .6); }
    },
    ghost(at, len) { gAt = at; L = len * .98; },
    update(dt) {
      now += dt;
      if (warmN > 0) { warmN--; return; }
      let n = 0;
      for (const v of [...views.values()]) {
        if (v.dying >= 0 && now - v.dying > DIE) { views.delete(v.id); continue; }
        v.wob = Math.max(0, v.wob - dt * 3);
        const d = dmg(v), sink = v.dying >= 0 ? (now - v.dying) / DIE * .6 : 0, layers = v.dying >= 0 ? 3 : d > 2 / 3 ? 1 : d > 1 / 3 ? 2 : 3;
        col.copy(WHITE).lerp(HURT, Math.pow(d, .8));
        for (let k = 0; k < layers; k++) {
          const drop = (now - v.born - k * DROP) / DROP; if (drop < 0) continue;
          place(sacks, n, v.x, v.z, v.ang, k, Math.min(1, drop), d, v.wob, sink); sacks.setColorAt(n, col); n++;
        }
      }
      sacks.count = n;
      let k = 0;
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i]; b.life -= dt; if (b.life <= 0) { B.splice(i, 1); continue; }
        b.v.y -= 1.2 * dt; b.v.multiplyScalar(1 - dt * 2.5); b.p.addScaledVector(b.v, dt); if (b.p.y < .03) { b.p.y = .03; b.v.y = 0; }
        const g = b.s * (1 + (1 - b.life) * 1.5) * Math.min(1, b.life * 2);
        bits.setMatrixAt(k, m4.compose(b.p, q.identity(), s.setScalar(g))); bits.setColorAt(k, WHITE); k++;
      }
      bits.count = k;
      for (const m of [sacks, bits]) if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; }
      // ghost: fades in, breathes a little
      gK = Math.max(0, Math.min(1, gK + (gAt ? dt * 6 : -dt * 8)));
      if (gAt) { gMat.color.copy(gAt.ok ? GOK : GNO); }
      gMat.opacity = (.26 + .1 * Math.sin(now * 5)) * gK;
      for (let i = 0; i < 3; i++) { if (gAt && gK > 0) place(ghostM, i, gAt.x, gAt.z, gAt.ang, i, 1, 0, 0, 0); else ghostM.setMatrixAt(i, m4.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -2, 0)); }
      ghostM.instanceMatrix.needsUpdate = true;
    },
    warm() {
      for (const m of [sacks, bits]) { m.setMatrixAt(0, m4.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -.5, 0)); m.setColorAt(0, WHITE); m.count = 1; m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; }
      gMat.opacity = .01; warmN = 1;
    },
    clear() { views.clear(); B.length = 0; sacks.count = 0; bits.count = 0; gAt = null; gK = 0; },
  };
}
