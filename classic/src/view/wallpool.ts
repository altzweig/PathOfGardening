// Steinkohl-Mauer (P2 Werkbank-Paket, 25.11.2026, Waffe "Steinkohle" / wall): low posts of two big cabbage heads stacked on
// each other (~0.7 m high, radius ~0.35 m) with a few stones at the foot. Posts closer than linkDist get a filler between
// them (a rolled-up cabbage-leaf bulge), so a drawn line reads as one continuous wall.
// Like the cabbage mines (minepool.ts): fixed pools of InstancedMesh slots that live in the scene for the whole game
// (posts, links, leaf bits). A piece coming or going only changes matrices / colours + the instance count: no new meshes,
// materials or shader compiles, three draw calls (+ shadow pass) for up to WALL_CAP pieces.
// Per piece: build pop (overshoot), damage (darker, brownish, leans and sags a little at low HP, wobbles on every hit),
// breaking (shrinks into the ground, cabbage leaf bits fly off).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const WALL_CAP = 200, LINK_CAP = 400, BIT_CAP = 192;
export interface WallPiece { id: number; x: number; z: number; hp: number; maxHp: number }
export interface WallPool {
  readonly posts: THREE.InstancedMesh; readonly links: THREE.InstancedMesh; readonly bits: THREE.InstancedMesh;
  /** current wall pieces (sim / snapshot); linkDist: posts closer than this get a filler (default 1.0 m).
   *  instant = no build pop for new pieces (loading a save, joining a game) */
  sync(pieces: WallPiece[], linkDist?: number, instant?: boolean): void;
  /** per frame: animations, matrices, colours */
  update(dt: number): void;
  /** one tiny instance in every pool for the next frame (shader prewarm: instancing + instance colour variant) */
  warm(): void;
  clear(): void;
}

// ---------------- geometry (low poly, flat shaded, vertex colours) ----------------
const C = (h: number) => new THREE.Color(h);
const LEAF = C(0x5c8a42), LEAF_DK = C(0x41683a), INNER = C(0xa6c878), STONE = C(0x77736c), VEIN = C(0xc8dca0);
function paint(g: THREE.BufferGeometry, col: THREE.Color, jit = .06, veins = 0) {
  const g2 = g.index ? g.toNonIndexed() : g, n = g2.attributes.position.count, a = new Float32Array(n * 3), p = g2.attributes.position;
  for (let i = 0; i < n; i += 3) { // per face: flat colour with a little variation; some faces get the pale vein colour
    const j = 1 + (Math.random() - .5) * jit * 2, c = veins && Math.random() < veins ? col.clone().lerp(VEIN, .45) : col;
    for (let k = 0; k < 3; k++) a.set([c.r * j, c.g * j, c.b * j], (i + k) * 3);
  }
  void p; g2.setAttribute('color', new THREE.BufferAttribute(a, 3)); g2.deleteAttribute('uv'); return g2;
}
/** one cabbage head: crinkled pale core + 6 outer leaf shells curling out at the lip (centre at the origin) */
function cabbageHead(r: number, sy: number) {
  const parts: THREE.BufferGeometry[] = [];
  const core = new THREE.IcosahedronGeometry(1, 1), cp = core.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), k = 1 + .07 * Math.sin(x * 9) * Math.sin(y * 7 + z * 5); cp.setXYZ(i, x * k, y * k, z * k); }
  parts.push(paint(core.scale(r * .9, r * .9 * sy, r * .9), INNER, .05, .1));
  for (let k = 0; k < 6; k++) { // outer leaves hug the lower two thirds of the head, their tips peel off outwards at the top
    const sh = new THREE.SphereGeometry(1, 6, 5, -.85, 1.7, 1.0, 1.9), q = sh.attributes.position;
    for (let i = 0; i < q.count; i++) { const v = new THREE.Vector3(q.getX(i), q.getY(i), q.getZ(i)), lip = Math.max(0, Math.min(1, (v.y - .1) / .45)); v.x *= 1.02 + lip * .18; v.z *= 1.02 + lip * .18; v.y -= lip * .05; q.setXYZ(i, v.x, v.y, v.z); }
    sh.scale(r, r * sy, r).rotateY(k / 6 * Math.PI * 2 + (k % 2) * .2).rotateX((k % 3 - 1) * .06);
    parts.push(paint(sh, k % 2 ? LEAF : LEAF_DK, .04, .08));
  }
  return mergeGeometries(parts)!;
}
function postGeo() {
  const parts = [cabbageHead(.35, .82).translate(0, .27, 0), cabbageHead(.26, .8).rotateY(.5).translate(.02, .52, -.01)];
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + .4, s = new THREE.IcosahedronGeometry(1, 0).scale(.08 + (i % 2) * .03, .05, .07).rotateY(a).translate(Math.cos(a) * .33, .02, Math.sin(a) * .33); parts.push(paint(s, STONE, .12)); }
  return mergeGeometries(parts)!;
}
/** filler along x from -.5 to .5 (scaled per instance to the post distance): a fat leaf roll + a thinner one on top + leaf flaps */
function linkGeo() {
  const roll = (rx: number, ry: number, rz: number, y: number, col: THREE.Color) => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), k = 1 + .08 * Math.sin(x * 11); p.setXYZ(i, x, p.getY(i) * k, p.getZ(i) * k); }
    return paint(g.scale(rx, ry, rz).translate(0, y, 0), col, .04, .1);
  };
  const parts = [roll(.55, .22, .2, .2, LEAF_DK), roll(.5, .14, .14, .37, LEAF)];
  for (const sd of [-1, 1]) for (const x of [-.22, .18]) {
    const f = new THREE.SphereGeometry(1, 5, 4, 0, Math.PI, .3, 1.6).scale(.14, .2, .08).rotateY(sd > 0 ? 0 : Math.PI).rotateX(sd * .35).translate(x, .22, sd * .17);
    parts.push(paint(f, LEAF, .04, .08));
  }
  return mergeGeometries(parts)!;
}
function bitGeo() { const g = new THREE.IcosahedronGeometry(1, 0).scale(.07, .015, .05); return paint(g, new THREE.Color(1, 1, 1), 0); }

// ---------------- pool ----------------
interface View { id: number; x: number; z: number; hp: number; max: number; born: number; wob: number; seen: number; dying: number; yaw: number; lean: number }
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const easeBack = (t: number) => { const c = 1.9; t = Math.min(1, Math.max(0, t)) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const POP = .32, DIE = .35;
const HURT = new THREE.Color(.42, .32, .2), WHITE = new THREE.Color(1, 1, 1);

export function createWallPool(scene: THREE.Object3D): WallPool {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .78, side: THREE.DoubleSide });
  const mk = (g: THREE.BufferGeometry, n: number, shadow: boolean) => {
    const m = new THREE.InstancedMesh(g, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, WHITE); m.instanceColor!.setUsage(THREE.DynamicDrawUsage); // colour buffer from the start: one shader variant
    m.count = 0; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; // stays in the scene (count 0 = nothing drawn)
  };
  const posts = mk(postGeo(), WALL_CAP + 32, true), links = mk(linkGeo(), LINK_CAP, true), bits = mk(bitGeo(), BIT_CAP, false);
  const views = new Map<number, View>(); let pairs: [number, number][] = []; let frame = 0, now = 0, warmN = 0;
  const B: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; life: number; c: THREE.Color }[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const spawnBits = (x: number, y: number, z: number, n: number, sp = 1) => {
    for (let i = 0; i < n; i++) {
      if (B.length >= BIT_CAP) B.shift();
      const a = Math.random() * Math.PI * 2, v = (.8 + Math.random() * 1.6) * sp;
      B.push({ p: new THREE.Vector3(x + Math.cos(a) * .2, y + Math.random() * .3, z + Math.sin(a) * .2), v: new THREE.Vector3(Math.cos(a) * v, 1.5 + Math.random() * 2.2 * sp, Math.sin(a) * v),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - .5) * 14, (Math.random() - .5) * 14, (Math.random() - .5) * 14),
        life: .7 + Math.random() * .6, c: (Math.random() < .3 ? INNER : Math.random() < .5 ? LEAF : LEAF_DK).clone() });
    }
  };
  /** damage share 0 (fresh) .. 1 (nearly broken) */
  const dmg = (v: View) => 1 - Math.max(0, Math.min(1, v.hp / Math.max(1, v.max)));
  return {
    posts, links, bits,
    sync(pieces, linkDist = 1, instant = false) {
      const id = ++frame;
      for (const pc of pieces) {
        let v = views.get(pc.id);
        if (!v || v.dying >= 0) {
          if (!v && views.size >= WALL_CAP + 32) continue;
          v = { id: pc.id, x: pc.x, z: pc.z, hp: pc.hp, max: pc.maxHp, born: instant ? -9 : now, wob: 0, seen: id, dying: -1, yaw: hash(pc.id) * Math.PI * 2, lean: hash(pc.id + 7) * Math.PI * 2 };
          views.set(pc.id, v);
        }
        if (pc.hp < v.hp - 1e-3) { v.wob = 1; spawnBits(v.x, .35, v.z, 2, .5); } // took a hit
        v.x = pc.x; v.z = pc.z; v.hp = pc.hp; v.max = pc.maxHp; v.seen = id;
      }
      for (const v of views.values()) if (v.seen !== id && v.dying < 0) { v.dying = now; spawnBits(v.x, .3, v.z, 12); } // broken / built over
      // links: each post to its (up to) two nearest neighbours within linkDist (a grid keeps it cheap, no criss-cross in clumps)
      const live = [...views.values()].filter(v => v.dying < 0), cell = Math.max(.2, linkDist), grid = new Map<string, View[]>();
      const key = (x: number, z: number) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
      for (const v of live) { const k = key(v.x, v.z); (grid.get(k) ?? grid.set(k, []).get(k)!).push(v); }
      const seenPair = new Set<string>(); pairs = [];
      for (const v of live) {
        const gx = Math.floor(v.x / cell), gz = Math.floor(v.z / cell), near: [number, View][] = [];
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const o of grid.get((gx + dx) + ',' + (gz + dz)) ?? []) {
          if (o === v) continue; const d = Math.hypot(o.x - v.x, o.z - v.z); if (d <= linkDist && d > .05) near.push([d, o]);
        }
        near.sort((a, b) => a[0] - b[0]);
        for (const [, o] of near.slice(0, 2)) {
          const pk = v.id < o.id ? v.id + ':' + o.id : o.id + ':' + v.id; if (seenPair.has(pk)) continue; seenPair.add(pk);
          if (pairs.length < LINK_CAP) pairs.push([v.id, o.id]);
        }
      }
    },
    update(dt) {
      now += dt;
      if (warmN > 0) { warmN--; return; }
      let n = 0;
      const scaleOf = (v: View) => v.dying >= 0 ? Math.max(0, 1 - (now - v.dying) / DIE) : easeBack((now - v.born) / POP);
      for (const v of [...views.values()]) {
        if (v.dying >= 0 && now - v.dying > DIE) { views.delete(v.id); continue; }
        v.wob = Math.max(0, v.wob - dt * 3);
        const d = dmg(v), sc = scaleOf(v), w = Math.sin(v.wob * 22) * v.wob * .08;
        const sink = v.dying >= 0 ? (now - v.dying) / DIE * .25 : 0;
        e.set(Math.cos(v.lean) * d * .14 + w, v.yaw, Math.sin(v.lean) * d * .14 + w * .6); q.setFromEuler(e);
        s.set(sc * (1 + v.wob * .06), sc * (1 - d * .12) * (1 - v.wob * .05), sc * (1 + v.wob * .06));
        posts.setMatrixAt(n, m4.compose(p.set(v.x, -sink, v.z), q, s));
        col.copy(WHITE).lerp(HURT, Math.pow(d, .7)); posts.setColorAt(n, col); n++;
      }
      posts.count = n;
      let l = 0;
      for (const [a, b] of pairs) {
        const A = views.get(a), Bv = views.get(b); if (!A || !Bv || A.dying >= 0 || Bv.dying >= 0) continue;
        const dx = Bv.x - A.x, dz = Bv.z - A.z, len = Math.hypot(dx, dz), sc = Math.min(scaleOf(A), scaleOf(Bv));
        e.set(0, -Math.atan2(dz, dx), 0); q.setFromEuler(e);
        links.setMatrixAt(l, m4.compose(p.set((A.x + Bv.x) / 2, 0, (A.z + Bv.z) / 2), q, s.set(len * Math.min(1, sc), sc * (1 - Math.max(dmg(A), dmg(Bv)) * .15), sc)));
        col.copy(WHITE).lerp(HURT, Math.pow(Math.max(dmg(A), dmg(Bv)), .7)); links.setColorAt(l, col); l++;
      }
      links.count = l;
      let k = 0;
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i]; b.life -= dt; if (b.life <= 0) { B.splice(i, 1); continue; }
        b.v.y -= 9 * dt; b.v.multiplyScalar(1 - dt * 1.5); b.p.addScaledVector(b.v, dt);
        if (b.p.y < .02) { b.p.y = .02; b.v.set(b.v.x * .4, Math.abs(b.v.y) * .2, b.v.z * .4); b.w.multiplyScalar(.5); }
        b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt; q.setFromEuler(b.r);
        bits.setMatrixAt(k, m4.compose(b.p, q, s.setScalar(Math.min(1, b.life * 3)))); bits.setColorAt(k, b.c); k++;
      }
      bits.count = k;
      for (const m of [posts, links, bits]) if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; }
    },
    warm() {
      for (const m of [posts, links, bits]) { m.setMatrixAt(0, m4.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -.5, 0)); m.setColorAt(0, WHITE); m.count = 1; m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; }
      warmN = 1;
    },
    clear() { views.clear(); pairs = []; B.length = 0; for (const m of [posts, links, bits]) m.count = 0; },
  };
}
