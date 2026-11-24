// Händler-Modell (24.11.2026, Basti): a broad merchant in a wide-brimmed witch hat pulls a medieval wooden cart.
// Low poly (< 10k triangles), every part merged per material (few draw calls). Local space: +z = the way he walks,
// origin = between his feet; the cart follows behind him (negative z). While travelling a canvas tarp hides the goods
// and all colours are paler; when he is ready to trade a golden sweep runs through him and the tarp dissolves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** seeded random: the model looks the same every time */
let seedR = 7; const rand = (a: number, b: number) => { seedR = (seedR * 16807) % 2147483647; return a + (seedR / 2147483647) * (b - a); };
function M(color: number, o: { r?: number; m?: number; e?: number; ei?: number } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? .85, metalness: o.m ?? 0, flatShading: true, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
}

// ---------------- materials ----------------
const MATS: THREE.MeshStandardMaterial[] = [];
const mm = (c: number, o: { r?: number; m?: number; e?: number; ei?: number } = {}) => { const m = M(c, o); MATS.push(m); return m; };
const C = {
  plank: mm(0x9c6b3e), plank2: mm(0x8a5c34), post: mm(0x5e3c22), dark: mm(0x3e2716), iron: mm(0x50545a, { m: .45, r: .5 }),
  barrel: mm(0xa8703f), barrelIn: mm(0x2a1a0e), hoop: mm(0x43474d, { m: .5, r: .45 }),
  pot: mm(0xc4673a), soil: mm(0x3b281a), leaf: mm(0x4f9a35), leaf2: mm(0x6cb84a), chili: mm(0xe0301a, { e: 0x801000, ei: .25 }), carrot: mm(0xf08020),
  garlic: mm(0xf1ebdd, { r: .6 }), stock: mm(0x6a4024), string: mm(0xeee4c8), asp: mm(0x7fbf45), aspTip: mm(0x8a5aa8), brass: mm(0xc0943a, { m: .5, r: .4 }),
  tube: mm(0x4c5a3e, { m: .3, r: .5 }), wand: mm(0x4a2e1a), lemon: mm(0xf2d230, { e: 0x806800, ei: .3 }), cab: mm(0x93d064), cab2: mm(0x6fae45),
  fuse: mm(0x2a2018), fuseTip: mm(0xd8c8a0), black: mm(0x2e1838, { r: .3 }), rasp: mm(0xd8305a, { r: .35 }), cran: mm(0xb0102a, { r: .25 }), mound: mm(0x3a1a22),
  parch: mm(0xeadbb0), ribbon: mm(0xa02a2a),
  trousers: mm(0x3d3a4a), boot: mm(0x3a2618), shirt: mm(0xd8c8a0), vest: mm(0x7a4a2a), pocket: mm(0x93623a), belt: mm(0x2e1e12),
  glove: mm(0x6a4a30), face: mm(0x16100c, { r: 1 }), hat: mm(0x3a2f4a), band: mm(0xb08a3a, { m: .3, r: .5 }), wrap: mm(0xc8b48a),
};
const TARP = mm(0x6f7f4e, { r: .95 }); TARP.side = THREE.DoubleSide;
const ROPE = mm(0xb89a64);

// shared uniforms: paleness while travelling, golden sweep through the whole merchant, tarp dissolve
export const U = { uSat: { value: .45 }, uSweepY: { value: -9 }, uSweepA: { value: 0 }, uDis: { value: 0 }, uTime: { value: 0 } };
const NOISE = `
  float mhash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float mnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(mhash(i),mhash(i+vec3(1,0,0)),f.x),mix(mhash(i+vec3(0,1,0)),mhash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(mhash(i+vec3(0,0,1)),mhash(i+vec3(1,0,1)),f.x),mix(mhash(i+vec3(0,1,1)),mhash(i+vec3(1,1,1)),f.x),f.y),f.z); }`;
function patch(m: THREE.MeshStandardMaterial, dissolve: boolean) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vMW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vMW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vMW; uniform float uSat, uSweepY, uSweepA, uDis, uTime;\n' + NOISE + '\n' + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${dissolve ? `float dn = mnoise(vMW * 5.3) * .62 + mnoise(vMW * 13.) * .23 + clamp((1.9 - vMW.y) * .12, 0., .15);
        if (dn < uDis * 1.02) discard;
        float dEdge = (1. - smoothstep(0., .07, dn - uDis)) * step(.002, uDis) * step(uDis, .995);` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${dissolve ? 'totalEmissiveRadiance += vec3(1., .72, .2) * dEdge * 4.;' : ''}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        float ml = dot(gl_FragColor.rgb, vec3(.299, .587, .114));
        gl_FragColor.rgb = mix(vec3(ml) * vec3(1.02, 1.0, .96) + .035, gl_FragColor.rgb, uSat);
        float band = exp(-pow((vMW.y - uSweepY) / .11, 2.)) * uSweepA;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(1.3, 1.05, .6) + vec3(.55, .36, .06), band);`);
  };
  m.customProgramCacheKey = () => dissolve ? 'merchD' : 'merch';
}
for (const m of MATS) patch(m, m === TARP || m === ROPE);

// ---------------- geometry kit: everything merged per material ----------------
const dummy = new THREE.Object3D();
class Kit {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1, order: THREE.EulerOrder = 'XYZ') {
    dummy.position.set(...p); dummy.rotation.set(r[0], r[1], r[2], order); if (typeof s === 'number') dummy.scale.setScalar(s); else dummy.scale.set(...s); dummy.updateMatrix();
    return this.addM(geo, mat, dummy.matrix);
  }
  addM(geo: THREE.BufferGeometry, mat: THREE.Material, mx: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.applyMatrix4(mx); g.computeVertexNormals();
    let a = this.m.get(mat); if (!a) this.m.set(mat, a = []); a.push(g); return g;
  }
  /** every material as one mesh in a group */
  build(shadow = true) {
    const out = new THREE.Group();
    for (const [mat, list] of this.m) { const g = mergeGeometries(list); const me = new THREE.Mesh(g, mat); me.castShadow = shadow; me.receiveShadow = true; out.add(me); }
    return out;
  }
}
const tris = (o: THREE.Object3D) => { let n = 0; o.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

/** wooden plank, length along x, thickness y, width z; a notch or two cut into the top edges, ends a bit uneven */
function plank(L: number, T: number, W: number, seed: number, notches = 2) {
  const seg = 7, g = new THREE.BoxGeometry(L, T, W, seg, 1, 1), p = g.attributes.position as THREE.BufferAttribute;
  const rr = (k: number) => { const x = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const cuts: { x: number; side: number; d: number }[] = [];
  for (let k = 0; k < notches; k++) cuts.push({ x: -L / 2 + L * (1 + Math.floor(rr(k) * (seg - 1))) / seg, side: rr(k + 7) < .5 ? -1 : 1, d: .015 + rr(k + 3) * .02 });
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    for (const c of cuts) if (Math.abs(x - c.x) < 1e-4 && y > 0 && z * c.side > 0) { y -= c.d; z -= c.side * c.d * .7; }
    if (Math.abs(x - L / 2) < 1e-4) { x += (rr(9 + Math.round(z * 99)) - .5) * .03; y += (rr(4) - .5) * .01; } // uneven end
    p.setXYZ(i, x, y, z);
  }
  return g;
}
/** barrel of n staves: bulging lathe + optional open top (dark inside), two iron hoops */
function barrel(k: Kit, x: number, y: number, z: number, r: number, h: number, n = 7, open = true) {
  const pts = [V(r * .86, 0), V(r * .98, h * .25), V(r * 1.04, h * .5), V(r * .98, h * .75), V(r * .88, h)].map(p => new THREE.Vector2(p.x, p.y));
  const rot = rand(0, 1);
  k.add(new THREE.LatheGeometry(pts, n), C.barrel, [x, y, z], [0, rot, 0]);
  if (open) k.add(new THREE.CircleGeometry(r * .86, n), C.barrelIn, [x, y + h * .9, z], [-Math.PI / 2, 0, rot]);
  for (const t of [.17, .83]) k.add(new THREE.CylinderGeometry(r * 1.025, r * 1.025, h * .07, n, 1, true), C.hoop, [x, y + h * t, z], [0, rot, 0], [1 + .02, 1, 1 + .02]);
}
/** tube along a curve (shafts, fuses, stems) */
function tube(k: Kit, mat: THREE.Material, pts: THREE.Vector3[], r: number, seg = 6, rad = 5) {
  k.addM(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false), mat, new THREE.Matrix4());
}
const LO = new THREE.IcosahedronGeometry(1, 0), ICO = new THREE.IcosahedronGeometry(1, 1);
const cyl = (rt: number, rb: number, h: number, n = 7, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);

// ---------------- dimensions (shared with the sim's MERCH_BODY) ----------------
export const BED_Y = .56, BED_Z = -2.35, BED_L = 1.72, BED_W = 1.3, WHEEL_R = .42, WHEEL_X = .76;

function buildCart(k: Kit) {
  // three broad planks, nailed, a little crooked, the rear ends of different length
  const lens = [1.7, 1.84, 1.76], zs = BED_Z + BED_L / 2;
  [-.43, 0, .43].forEach((x, i) => {
    const L = lens[i];
    k.add(plank(L, .06, .42, i + 1, 2), i === 1 ? C.plank2 : C.plank, [x + (i - 1) * .004, BED_Y - .03 + i * .004, zs - L / 2], [rand(-.012, .012), Math.PI / 2 + (i - 1) * .012, 0]);
    for (const nz of [zs - .1, zs - L + .14]) k.add(LO, C.iron, [x, BED_Y + .003, nz], [0, 0, 0], [.018, .01, .018]); // nail heads
  });
  for (const z of [BED_Z + .55, BED_Z - .55]) k.add(new THREE.BoxGeometry(BED_W + .02, .08, .1), C.post, [0, BED_Y - .1, z]); // cross beams
  k.add(cyl(.045, .045, WHEEL_X * 2 + .04, 6), C.dark, [0, WHEEL_R, BED_Z], [0, 0, Math.PI / 2]); // axle
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(.1, BED_Y - WHEEL_R - .02, .14), C.post, [s * (WHEEL_X - .14), (BED_Y + WHEEL_R) / 2 - .03, BED_Z]); // axle blocks
  // railing: a post (Bohle) in every corner, two planks per side with small gaps, notched as well
  const X = BED_W / 2 - .04, Zf = BED_Z + BED_L / 2 - .05, Zb = BED_Z - BED_L / 2 + .07, H = .52;
  for (const [x, z] of [[-X, Zf], [X, Zf], [-X, Zb], [X, Zb]]) k.add(plank(H + .04, .085, .085, x * 7 + z, 1), C.post, [x, BED_Y + H / 2, z], [0, rand(-.06, .06), Math.PI / 2 + rand(-.03, .03)]);
  let sd = 20;
  for (const y of [BED_Y + .14, BED_Y + .38]) {
    for (const s of [-1, 1]) k.add(plank(Zf - Zb + .02, .17, .035, sd++, 2), s > 0 ? C.plank : C.plank2, [s * (X + .055), y + rand(-.012, .012), (Zf + Zb) / 2], [0, Math.PI / 2, rand(-.025, .025)]);
    for (const z of [Zf + .055, Zb - .055]) k.add(plank(X * 2 + .02, .17, .035, sd++, 2), C.plank, [0, y + rand(-.012, .012), z], [rand(-.02, .02), 0, rand(-.02, .02)]);
  }
  // the pulling shafts: two poles with a swing up and down to the merchant's hands, wrapped handles
  for (const s of [-1, 1]) {
    tube(k, C.post, [V(s * .55, BED_Y - .05, Zf - .45), V(s * .55, BED_Y - .03, Zf + .02), V(s * .52, .6, -1.05), V(s * .47, .74, -.6), V(s * .43, .68, -.26)], .035, 10, 5);
    k.add(cyl(.041, .041, .2, 6), C.wrap, [s * .43, .66, -.18], [Math.PI / 2 - .12, 0, 0]);
    for (const t of [-.07, 0, .07]) k.add(new THREE.TorusGeometry(.043, .008, 3, 7), C.dark, [s * .43, .66 + t * .12, -.18 + t], [0, 0, 0], 1);
  }
  k.add(cyl(.03, .03, 1.0, 6), C.post, [0, BED_Y + .03, Zf + .08], [0, 0, Math.PI / 2]); // cross bar between the shafts
}
/** one plank wheel (group, spins around x); disc of boards, two seams, a brace and the hub */
function buildWheel(s: number) {
  const k = new Kit(), t = .07;
  k.add(cyl(WHEEL_R, WHEEL_R, t, 12), C.plank, [0, 0, 0], [0, 0, Math.PI / 2]);
  for (const z of [-.13, .13]) k.add(new THREE.BoxGeometry(.008, WHEEL_R * 1.86, .012), C.dark, [s * (t / 2 + .002), 0, z]);
  k.add(plank(WHEEL_R * 1.7, .1, .03, s * 3, 1), C.post, [s * (t / 2 + .015), 0, 0], [Math.PI / 2, 0, Math.PI / 2]);
  k.add(cyl(.085, .1, .12, 8), C.dark, [s * .05, 0, 0], [0, 0, s * Math.PI / 2]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; k.add(LO, C.iron, [s * (t / 2 + .03), Math.sin(a) * .25, Math.cos(a) * .25], [0, 0, 0], .016); }
  const g = k.build(); const w = new THREE.Group(); w.add(g); w.position.set(s * WHEEL_X, WHEEL_R, BED_Z); return w;
}
function buildGoods(k: Kit) {
  const cz = BED_Z, Y = BED_Y;
  // the trio in the middle (about half the floor): big barrel with weapons, cabbage bombs, berries
  const B1 = { x: -.18, z: cz + .2, r: .29, h: .56 }, B2 = { x: .3, z: cz + .27, r: .22, h: .45 }, B3 = { x: .06, z: cz - .27, r: .23, h: .48 };
  barrel(k, B1.x, Y, B1.z, B1.r, B1.h); barrel(k, B2.x, Y, B2.z, B2.r, B2.h); barrel(k, B3.x, Y, B3.z, B3.r, B3.h);
  // weapons standing in the big barrel, leaning against its rim
  const lean = (dx: number, dz: number, a = .2) => [dz * a, 0, -dx * a] as [number, number, number];
  { // crossbow with asparagus bolts
    const x = B1.x - .1, z = B1.z + .1, r = lean(-1, .4), base = Y + .2, g = new THREE.Group();
    const kk = new Kit();
    kk.add(new THREE.BoxGeometry(.06, .62, .05), C.stock, [0, .31, 0]);
    kk.add(new THREE.TorusGeometry(.2, .018, 4, 9, Math.PI * .85), C.stock, [0, .55, 0], [Math.PI / 2, 0, Math.PI * .075 + Math.PI], 1);
    kk.add(new THREE.BoxGeometry(.006, .006, .34), C.string, [0, .55 - .06, 0], [0, Math.PI / 2, 0]);
    kk.add(new THREE.BoxGeometry(.026, .3, .028), C.asp, [0, .55, .035]);
    kk.add(new THREE.ConeGeometry(.024, .07, 5), C.aspTip, [0, .74, .035]);
    void g; place(k, kk, [x, base, z], r);
    for (let i = 0; i < 3; i++) { // loose bolts beside it
      const bk = new Kit(); bk.add(cyl(.013, .013, .5, 5), C.asp, [0, .25, 0]); bk.add(new THREE.ConeGeometry(.022, .06, 5), C.aspTip, [0, .53, 0]);
      for (const t of [.12, .32]) bk.add(cyl(.016, .016, .015, 5), C.leaf, [0, t, 0]);
      place(k, bk, [B1.x - .17 + i * .05, base, B1.z - .05 - i * .04], lean(-.8, -.6 + i * .2, .22));
    }
  }
  { // chili grenade launcher: short tube, drum, wooden stock, a chili grenade in the muzzle
    const kk = new Kit();
    kk.add(new THREE.BoxGeometry(.06, .24, .09), C.stock, [0, .12, 0]);
    kk.add(cyl(.075, .075, .1, 8), C.brass, [0, .28, .0]);
    kk.add(cyl(.05, .055, .48, 8), C.tube, [0, .52, 0]);
    kk.add(cyl(.062, .062, .04, 8), C.brass, [0, .76, 0]);
    kk.add(new THREE.ConeGeometry(.045, .16, 6), C.chili, [0, .84, 0], [Math.PI, 0, 0]); // the chili grenade, tip down into the tube
    kk.add(new THREE.SphereGeometry(.046, 6, 4), C.chili, [0, .92, 0], [0, 0, 0], [1, .9, 1]);
    kk.add(cyl(.012, .016, .07, 5), C.leaf, [0, .97, 0], [.4, 0, 0]);
    place(k, kk, [B1.x + .12, Y + .2, B1.z + .06], lean(1, .5, .12));
  }
  { // long magic wand with a lemon on top
    const kk = new Kit();
    tube(kk, C.wand, [V(0, 0, 0), V(.01, .32, 0), V(-.012, .64, .01), V(0, .9, 0)], .018, 6, 5);
    kk.add(new THREE.TorusGeometry(.03, .01, 3, 6), C.brass, [0, .9, 0], [Math.PI / 2, 0, 0]);
    kk.add(ICO, C.lemon, [0, .99, 0], [0, 0, 0], [.068, .09, .068]);
    kk.add(new THREE.ConeGeometry(.022, .05, 5), C.lemon, [0, 1.09, 0]);
    kk.add(LO, C.leaf2, [.05, 1.05, 0], [0, 0, -.7], [.05, .012, .025]);
    place(k, kk, [B1.x - .02, Y + .18, B1.z - .14], lean(-.2, -1, .12));
  }
  // three cabbage heads bursting out of the second barrel, with (unlit) bomb fuses
  const cabs = [[-.07, -.05], [.09, -.06], [.01, .1]];
  cabs.forEach(([dx, dz], i) => {
    const x = B3.x + dx, z = B3.z + dz, y = Y + B3.h + .05 + (i === 2 ? .05 : 0);
    k.add(ICO, C.cab, [x, y, z], [rand(0, 3), rand(0, 3), 0], [.12, .105, .12]);
    for (let j = 0; j < 4; j++) { const a = j / 4 * Math.PI * 2 + i; k.add(LO, C.cab2, [x + Math.sin(a) * .09, y - .02, z + Math.cos(a) * .09], [0, a, .9], [.08, .02, .07], 'YXZ'); }
    tube(k, C.fuse, [V(x, y + .09, z), V(x + .02, y + .15, z), V(x + .07, y + .19, z + .02), V(x + .1, y + .17, z + .03)], .008, 5, 3);
    k.add(LO, C.fuseTip, [x + .1, y + .17, z + .03], [0, 0, 0], .014);
  });
  // berries heaped in the third barrel: blackberries, raspberries, cranberries mixed
  k.add(new THREE.SphereGeometry(B2.r * .86, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), C.mound, [B2.x, Y + B2.h - .03, B2.z], [0, 0, 0], [1, .45, 1]);
  const bm = [C.black, C.rasp, C.cran];
  for (let i = 0; i < 13; i++) {
    const ring = i < 7 ? 0 : i < 11 ? 1 : 2, n = [7, 4, 2][ring], a = (i - [0, 7, 11][ring]) / n * Math.PI * 2 + ring, rr = [.13, .07, .02][ring];
    const m = bm[(i * 2 + ring) % 3], s = m === C.cran ? .032 : .042;
    k.add(m === C.cran ? ICO : LO, m, [B2.x + Math.sin(a) * rr, Y + B2.h + .03 + ring * .045, B2.z + Math.cos(a) * rr], [rand(0, 3), rand(0, 3), 0], [s, s * (m === C.rasp ? 1.15 : 1), s]);
  }
  // small barrel with rolled-up parchment scrolls
  const sx = -.44, sz = cz - .5;
  barrel(k, sx, Y, sz, .13, .32, 7);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, tx = Math.sin(a) * .2, tz = Math.cos(a) * .2;
    k.add(cyl(.028, .028, .34, 6), C.parch, [sx + Math.sin(a) * .045, Y + .36, sz + Math.cos(a) * .045], [tz, 0, -tx]);
    k.add(cyl(.031, .031, .02, 6), C.ribbon, [sx + Math.sin(a) * .045, Y + .3, sz + Math.cos(a) * .045], [tz, 0, -tx]);
  }
  // flower pots around the barrels: chili, carrot, garlic
  const pots: [number, number, 'chili' | 'carrot' | 'garlic'][] = [[.47, cz - .3, 'chili'], [.44, cz - .66, 'carrot'], [-.08, cz - .68, 'garlic'], [-.5, cz + .62, 'carrot'], [.5, cz + .66, 'garlic'], [-.52, cz + .05, 'chili']];
  for (const [x, z, t] of pots) potPlant(k, x, Y, z, t);
}
function potPlant(k: Kit, x: number, y: number, z: number, t: 'chili' | 'carrot' | 'garlic') {
  k.add(cyl(.1, .075, .16, 7), C.pot, [x, y + .08, z]);
  k.add(cyl(.112, .112, .035, 7), C.pot, [x, y + .16, z]);
  k.add(new THREE.CircleGeometry(.095, 7), C.soil, [x, y + .175, z], [-Math.PI / 2, 0, 0]);
  const top = y + .18;
  if (t === 'chili') {
    tube(k, C.leaf, [V(x, top, z), V(x + .01, top + .12, z), V(x - .01, top + .24, z + .01)], .011, 3, 4);
    for (let i = 0; i < 6; i++) { const a = i * 2.1; k.add(LO, i % 2 ? C.leaf : C.leaf2, [x + Math.sin(a) * .06, top + .1 + i * .025, z + Math.cos(a) * .06], [0, a, .5], [.06, .012, .03], 'YXZ'); }
    for (let i = 0; i < 3; i++) { const a = i * 2.3 + .5; k.add(new THREE.ConeGeometry(.018, .085, 5), C.chili, [x + Math.sin(a) * .05, top + .1 + i * .04, z + Math.cos(a) * .05], [Math.PI + .3, a, 0], 1, 'YXZ'); }
  } else if (t === 'carrot') {
    k.add(new THREE.ConeGeometry(.035, .06, 6), C.carrot, [x, top + .01, z], [Math.PI, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(new THREE.ConeGeometry(.02, .22, 4), i % 2 ? C.leaf : C.leaf2, [x + Math.sin(a) * .035, top + .12, z + Math.cos(a) * .035], [0, a, .35], 1, 'YXZ'); }
  } else {
    k.add(LO, C.garlic, [x, top + .03, z], [0, .3, 0], [.055, .05, .055]);
    k.add(new THREE.ConeGeometry(.02, .04, 5), C.garlic, [x, top + .08, z]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; k.add(new THREE.BoxGeometry(.012, .24, .004), C.leaf, [x + Math.sin(a) * .025, top + .2, z + Math.cos(a) * .025], [0, a, .22], 1, 'YXZ'); }
  }
}
/** places a sub-kit (a weapon) with a lean into the main kit */
function place(k: Kit, sub: Kit, p: [number, number, number], r: [number, number, number]) {
  const g = sub.build(); dummy.position.set(...p); dummy.rotation.set(...r); dummy.scale.setScalar(1); dummy.updateMatrix();
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) k.addM(m.geometry, m.material as THREE.Material, dummy.matrix); });
}
/** the canvas tarp: a draped hump over the goods, hanging over the railing; tied down with two ropes */
const TARP_BUMPS = [[-.18, BED_Z + .16, 1.98, .5], [.16, BED_Z + .24, 1.86, .22], [.3, BED_Z + .27, 1.5, .32], [.06, BED_Z - .27, 1.66, .32], [-.44, BED_Z - .5, 1.46, .22], [0, BED_Z, 1.42, .7]];
/** tarp height over the cart floor at (x, z): smooth humps over the goods, hanging down over the railing */
function tarpH(x: number, z: number) {
  const top = BED_Y + .52; let h = top;
  for (const [bx, bz, bh, br] of TARP_BUMPS) { const d = Math.hypot(x - bx, z - bz), k = Math.max(0, 1 - d / (br + .3)); h = Math.max(h, top + (bh - top) * k * k * (3 - 2 * k)); }
  const edge = Math.max(Math.abs(x) - (BED_W / 2 + .02), z - (BED_Z + BED_L / 2 + .02), (BED_Z - BED_L / 2 - .02) - z);
  if (edge > 0) h = Math.min(h, top) - edge * 2.4; // hangs down over the railing
  return h + Math.sin(x * 23 + z * 7) * .012 + Math.sin(z * 17) * .01; // folds
}
/** the canvas tarp: a draped hump over the goods, hanging over the railing; tied down with two ropes */
function buildTarp() {
  const k = new Kit(), nx = 14, nz = 16, X0 = -.8, X1 = .8, Z0 = BED_Z - BED_L / 2 - .1, Z1 = BED_Z + BED_L / 2 + .1;
  const geo = new THREE.PlaneGeometry(1, 1, nx, nz), p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = X0 + (X1 - X0) * (p.getX(i) + .5), z = Z0 + (Z1 - Z0) * (p.getY(i) + .5); p.setXYZ(i, x, tarpH(x, z), z); }
  k.addM(geo, TARP, new THREE.Matrix4());
  for (const z of [BED_Z + .45, BED_Z - .5]) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) { const x = -.8 + i * .16; pts.push(V(x, tarpH(x, z) + .018, z)); } tube(k, ROPE, pts, .013, 20, 3); }
  return k.build(false);
}
/** the merchant: broad, vest with many stuffed pockets, wide-brimmed witch hat (face hidden in its shadow) */
function buildMan() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * .14, .56, 0); body.add(lg); legs.push(lg);
    const k = new Kit();
    k.add(cyl(.1, .085, .46, 7), C.trousers, [0, -.24, 0]);
    k.add(new THREE.BoxGeometry(.15, .12, .26), C.boot, [0, -.5, .04]);
    k.add(cyl(.095, .095, .05, 7), C.boot, [0, -.43, 0]);
    lg.add(k.build());
  }
  const k = new Kit();
  // torso: wide barrel chest; shirt underneath, open leather vest over it
  const prof = [[.22, .5], [.31, .58], [.36, .72], [.37, .88], [.33, 1.0], [.2, 1.08], [.07, 1.1]].map(([r, y]) => new THREE.Vector2(r, y));
  k.add(new THREE.LatheGeometry(prof, 9), C.shirt, [0, 0, 0], [0, 0, 0], [1, 1, .74]);
  const vprof = prof.slice(1, 6).map(v => new THREE.Vector2(v.x + .025, v.y));
  k.add(new THREE.LatheGeometry(vprof, 10, .42, Math.PI * 2 - .84), C.vest, [0, 0, 0], [0, 0, 0], [1, 1, .76]);
  k.add(cyl(.335, .335, .07, 10, true), C.belt, [0, .6, 0], [0, 0, 0], [1, 1, .76]);
  k.add(new THREE.BoxGeometry(.08, .06, .02), C.band, [0, .6, .262]);
  // stuffed pockets all over the vest
  const pk: [number, number, number][] = [[.55, .7, .1], [-.55, .7, .1], [.95, .72, .09], [-.95, .72, .09], [.5, .88, .08], [-.5, .9, .075], [1.35, .76, .08], [-1.35, .76, .08], [2.4, .74, .09], [-2.4, .74, .09]];
  for (const [a, y, s] of pk) {
    const r = .375 * Math.max(.96, 1 - (y - .8) ** 2 * 2), px = Math.sin(a) * r, pz = Math.cos(a) * r * .76;
    k.add(LO, C.pocket, [px, y, pz], [0, a, 0], [s, s * .9, s * .55]);
    k.add(new THREE.BoxGeometry(s * 1.7, .025, .03), C.vest, [px * 1.04, y + s * .75, pz * 1.04], [0, a, 0]);
  }
  // head in the shadow, wide brim, crooked witch-hat crown
  k.add(ICO, C.face, [0, 1.2, .02], [0, 0, 0], .15);
  const brim = new THREE.CylinderGeometry(.5, .52, .025, 16, 1); const bp = brim.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z); if (r > .3) bp.setY(i, bp.getY(i) - (r - .3) * .25 + Math.sin(Math.atan2(z, x) * 3) * .03); }
  k.add(brim, C.hat, [0, 1.3, 0]);
  let y = 1.31, x = 0, z = 0, r = .22, tilt = 0;
  for (let i = 0; i < 4; i++) { const h = [.2, .17, .14, .14][i], r2 = [.16, .11, .065, .01][i]; tilt += [0, -.12, -.3, -.5][i];
    k.add(cyl(r2, r, h, 9), C.hat, [x, y + h / 2 * Math.cos(tilt), z + Math.sin(-tilt) * h / 2], [tilt, 0, 0]);
    y += h * Math.cos(tilt); z += Math.sin(-tilt) * h; r = r2; }
  k.add(cyl(.225, .225, .05, 9, true), C.band, [0, 1.34, 0]);
  const torso = k.build(); body.add(torso);
  // arms reaching down and back to the shaft handles
  for (const s of [-1, 1]) {
    const ak = new Kit();
    tube(ak, C.shirt, [V(s * .34, .98, 0), V(s * .42, .8, -.06), V(s * .43, .7, -.16)], .065, 4, 6);
    ak.add(ICO, C.glove, [s * .43, .66, -.18], [0, 0, 0], .07);
    body.add(ak.build());
  }
  return { root, body, legs };
}

export interface MerchantView { g: THREE.Group; man: ReturnType<typeof buildMan>; cart: THREE.Group; wheels: THREE.Group[]; tarp: THREE.Group; ring: THREE.Mesh; tris: number }
export function buildMerchant(): MerchantView {
  seedR = 7;
  const g = new THREE.Group(), cart = new THREE.Group(); g.add(cart);
  const k = new Kit(); buildCart(k); buildGoods(k); cart.add(k.build());
  const wheels = [buildWheel(-1), buildWheel(1)]; for (const w of wheels) cart.add(w);
  const tarp = buildTarp(); cart.add(tarp);
  const man = buildMan(); man.root.scale.setScalar(.86); g.add(man.root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.955, 1, 72), new THREE.MeshBasicMaterial({ color: 0xf0a818, transparent: true, opacity: 0, depthWrite: false }));
  const glow = new THREE.Mesh(new THREE.RingGeometry(.78, .955, 72), new THREE.MeshBasicMaterial({ color: 0xffb830, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.add(glow); glow.renderOrder = 2;
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; ring.renderOrder = 2;
  return { g, man, cart, wheels, tarp, ring, tris: tris(g) };
}

/** for View.prewarm: one model with the tarp half dissolved (both shader variants) */
export function merchantWarm() { const v = buildMerchant(); U.uDis.value = .5; return v.g; }
export function merchantReset() { U.uDis.value = 0; U.uSat.value = .45; U.uSweepA.value = 0; }
