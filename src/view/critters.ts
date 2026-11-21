// The five playable animals (21.11.2026): shape parameters of the shared biped cage + fur colours / markings.
// All coordinates in body space (y up, +z forward, feet at y 0, the figure is ~1.3 m with ears).
import * as THREE from 'three';

export type RGB = [number, number, number];
const C = (hex: number): RGB => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const sst = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function h3(x: number, y: number, z: number) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
/** value noise 0..1 */
export function vn(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
    L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v), w);
}

/** what a colour function gets for one vertex */
export interface FurIn {
  p: THREE.Vector3; n: THREE.Vector3; part: Part;
  /** tail 0 root .. 1 tip, ear 0 base .. 1 tip, earIn 0 back .. 1 front (inner side), limb 0 shoulder .. 1 finger tips */
  tail: number; ear: number; earIn: number; limb: number; snout: number;
  /** head-local: q = p - head centre; eye = distance to the nearest eye centre; side = +1 left / -1 right */
  q: THREE.Vector3; eye: number; side: number;
}
export type Part = 'body' | 'head' | 'snout' | 'ear' | 'arm' | 'hand' | 'leg' | 'foot' | 'tail';

export interface Variant { main: number; light: number; dark: number; accent: number; nose: number }
export interface Species {
  id: string;
  /** head: radii (x, y, z) of the skull, cheek width factor, cheek fluff, crown tuft */
  head: { rx: number; ry: number; rz: number; cheek: number; fluff: number; tuft: number };
  /** snout: length forward from the face, half width, half height, drop of the tip, tip roundness, nose size */
  snout: { len: number; w: number; h: number; drop: number; nose: number; noseFlat: number };
  /** ears: length, half width at the base, thickness, out tilt (rad), back tilt, droop (dog: 1 = hanging), roundness */
  ear: { len: number; w: number; th: number; out: number; back: number; flop: number; round: number; tip: number };
  /** tail: points (body space, root first), radii per point, fur fluff */
  tail: { pts: [number, number, number][]; r: number[]; fluff: number };
  /** eye radius, eye spread (azimuth), eye height (y), look outwards */
  eye: { r: number; az: number; y: number; out: number; slit?: boolean };
  /** chest fluff above the bib, belly roundness */
  body: { chest: number; belly: number };
  whiskers: boolean;
  variants: Variant[];
  colour(f: FurIn, v: Variant): RGB;
}

// ---------------- shared pattern helpers ----------------
const furNoise = (p: THREE.Vector3, amt: number) => 1 + (vn(p.x * 60, p.y * 18, p.z * 60) * .6 + vn(p.x * 14, p.y * 14, p.z * 14) * .4 - .5) * amt * 2;
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
/** typical counter-shading: lighter towards the belly / underside */
const counter = (f: FurIn, top: RGB, under: RGB) => mix(under, top, sst(f.n.y * .7 + (f.p.y > .6 ? .3 : 0), -.6, .5));

// ---------------- the animals ----------------
const RACCOON: Species = {
  id: 'raccoon',
  head: { rx: 1.04, ry: .98, rz: 1, cheek: 1.12, fluff: 1, tuft: .3 },
  snout: { len: .085, w: .052, h: .042, drop: .012, nose: .021, noseFlat: .7 },
  ear: { len: 0.098, w: 0.050, th: 0.021, out: .35, back: .1, flop: 0, round: .8, tip: .35 },
  tail: { pts: [[0, .55, -.1], [0, .47, -.22], [0, .43, -.34], [0, .47, -.46], [0, .56, -.55]], r: [.045, .068, .074, .066, .04], fluff: .14 },
  eye: { r: 0.038, az: 0.44, y: 1.165, out: .2 },
  body: { chest: .5, belly: 1.1 },
  whiskers: false,
  variants: [
    { main: 0x8c867c, light: 0xe9e4da, dark: 0x1e1b19, accent: 0x5f5850, nose: 0x161210 }, // classic grey
    { main: 0x8a7258, light: 0xeee0c8, dark: 0x241a14, accent: 0x5e4a38, nose: 0x161210 }, // brown
    { main: 0xbdb8b0, light: 0xfbf8f2, dark: 0x3a3632, accent: 0x8a857c, nose: 0x2a2420 }, // silver
    { main: 0x4a4542, light: 0xc8c2b8, dark: 0x0e0c0b, accent: 0x2c2826, nose: 0x0c0a09 }, // dark
    { main: 0xb08a5a, light: 0xf6ead0, dark: 0x5a3c22, accent: 0x8a6a44, nose: 0x3a261a }, // cinnamon
  ],
  colour(f, v) {
    const M = C(v.main), L = C(v.light), D = C(v.dark), A = C(v.accent);
    let c: RGB = counter(f, mix(M, A, .35), mix(M, L, .45));
    const q = f.q;
    if (f.part === 'head' || f.part === 'snout') {
      // bandit mask: dark patches around the eyes, swept back + down to the cheeks, joined over the bridge of the nose
      const er = RACCOON.eye.r, ax = Math.abs(q.x);
      const around = sst(f.eye, er * 2.5, er * 1.7);
      const sweep = sst(.035, Math.abs(q.y + (ax - .06) * .45 - .015), .018) * sst(ax, .05, .08) * sst(.16, ax, .12) * sst(q.z, -.03, .03);
      const band = Math.max(around, sweep);
      const bridge = Math.exp(-((q.x / .018) ** 2)) * sst(q.y, -.025, .0) * sst(.05, q.y, .03) * (f.part === 'snout' ? sst(f.snout, .75, .4) : sst(q.z, .07, .11));
      // white muzzle + white brows above the mask
      const muzzle = f.part === 'snout' ? sst(f.snout, .05, .35) * sst(.03, q.y + .0, -.01) + sst(f.snout, .3, .5) * .6 : sst(q.z, .07, .12) * sst(q.y, .0, -.03);
      const brow = sst(.02, Math.abs(f.eye - er * 2.2), .008) * sst(q.y, .02, .04) * sst(.085, q.y, .06) * sst(q.z, .04, .09);
      c = mix(c, L, Math.min(1, muzzle * .9 + brow));
      c = mix(c, D, Math.min(1, band * 1.2 + bridge * .9));
      if (f.part === 'snout') c = mix(c, D, sst(f.snout, .8, .97) * .7);
      c = mix(c, L, sst(-q.y, .03, .08) * .7); // light chin
    } else if (f.part === 'ear') c = mix(mix(A, M, .4), L, Math.max(sst(f.ear, .55, .9), f.earIn * .8));
    else if (f.part === 'tail') { const ring = Math.sin(f.tail * Math.PI * 9 + .6); c = mix(mix(M, L, .2), D, sst(ring, -.1, .3) * .95); if (f.tail > .9) c = D; }
    else if (f.part === 'hand' || f.part === 'foot') c = mix(D, A, .25);
    else if (f.part === 'arm') c = mix(c, mix(D, A, .3), sst(f.limb, .55, .85));
    return shade(c, furNoise(f.p, .12));
  },
};

const RED_PANDA: Species = {
  id: 'redpanda',
  head: { rx: 1.08, ry: .96, rz: .98, cheek: 1.18, fluff: 1.2, tuft: .2 },
  snout: { len: .06, w: .05, h: .04, drop: .008, nose: .018, noseFlat: .75 },
  ear: { len: 0.091, w: 0.055, th: 0.023, out: .55, back: .12, flop: 0, round: 1, tip: .2 },
  tail: { pts: [[0, .55, -.1], [0, .5, -.24], [0, .47, -.38], [0, .5, -.52], [0, .6, -.62]], r: [.042, .06, .064, .058, .036], fluff: .12 },
  eye: { r: 0.037, az: 0.42, y: 1.165, out: .15 },
  body: { chest: .3, belly: 1.05 },
  whiskers: false,
  variants: [
    { main: 0xc24f22, light: 0xf8f0e4, dark: 0x2a1610, accent: 0x8e3414, nose: 0x120c0a }, // classic rust
    { main: 0x9e3a1e, light: 0xf2e6d8, dark: 0x1e0f0a, accent: 0x6a2410, nose: 0x120c0a }, // mahogany
    { main: 0xd8743a, light: 0xfff6ea, dark: 0x40241a, accent: 0xb0562a, nose: 0x1a1210 }, // light ginger
    { main: 0xb8603c, light: 0xf4ece0, dark: 0x4a3a34, accent: 0x7c6a62, nose: 0x1a1412 }, // frosted (greyish legs)
    { main: 0xd89a4a, light: 0xfff8ee, dark: 0x5a3018, accent: 0xb8783a, nose: 0x2a1a12 }, // golden
  ],
  colour(f, v) {
    const M = C(v.main), L = C(v.light), D = C(v.dark), A = C(v.accent);
    let c: RGB = mix(M, A, sst(-f.n.y, .1, .8) * .5);
    const q = f.q;
    if (f.part === 'head' || f.part === 'snout') {
      const muzzle = f.part === 'snout' ? 1 : sst(q.z, .08, .13) * sst(q.y, .03, -.02);
      const cheek = Math.exp(-(((q.y + .005) / .04) ** 2)) * sst(Math.abs(q.x), .07, .12) * sst(q.z, -.02, .05);
      const brow = Math.exp(-(((q.y - .075) / .02) ** 2) - (((Math.abs(q.x) - .045) / .02) ** 2)) * sst(q.z, .06, .11);
      c = mix(c, L, Math.min(1, muzzle * .95 + cheek + brow));
      // tear marks: rust stripes from the eyes down to the mouth corners
      const tear = Math.exp(-(((Math.abs(q.x) - .045 + q.y * .25) / .012) ** 2)) * sst(q.y, .05, .02) * sst(q.y, -.05, -.01) * sst(q.z, .06, .1);
      c = mix(c, A, tear * .85);
      c = mix(c, mix(M, A, .5), sst(q.y, .1, .14) * .4); // darker crown
      if (f.part === 'snout') c = mix(c, D, sst(f.snout, .82, .97) * .6);
    } else if (f.part === 'ear') c = mix(M, L, Math.max(sst(f.ear, .6, .85) * .9, f.earIn * .9));
    else if (f.part === 'tail') { const ring = Math.sin(f.tail * Math.PI * 10); c = mix(M, A, sst(ring, 0, .5) * .85); c = mix(c, D, sst(f.tail, .85, 1) * .8); }
    else if (f.part === 'arm' || f.part === 'hand') c = mix(c, D, f.part === 'hand' ? 1 : sst(f.limb, .05, .3));
    else if (f.part === 'foot' || f.part === 'leg') c = D;
    else if (f.part === 'body') c = mix(c, D, sst(-f.n.y, .3, .9) * sst(.75, f.p.y, .6) * .9 + sst(f.n.z, .2, .7) * sst(.85, f.p.y, .7) * .7); // dark belly + chest
    return shade(c, furNoise(f.p, .11));
  },
};

const FOX: Species = {
  id: 'fox',
  head: { rx: .98, ry: .95, rz: 1, cheek: 1.16, fluff: 1.1, tuft: .15 },
  snout: { len: .12, w: .042, h: .036, drop: .02, nose: .017, noseFlat: .8 },
  ear: { len: 0.156, w: 0.060, th: 0.021, out: .22, back: .08, flop: 0, round: .1, tip: 1 },
  tail: { pts: [[0, .55, -.1], [0, .46, -.24], [0, .41, -.4], [0, .44, -.56], [0, .52, -.68]], r: [.04, .07, .082, .075, .045], fluff: .16 },
  eye: { r: 0.035, az: 0.44, y: 1.165, out: .22 },
  body: { chest: 1, belly: 1 },
  whiskers: false,
  variants: [
    { main: 0xd2641e, light: 0xfaf3ea, dark: 0x1c120e, accent: 0xa8461a, nose: 0x100a08 }, // red fox
    { main: 0xe6e2da, light: 0xffffff, dark: 0x8a8278, accent: 0xc8c2b8, nose: 0x2a2624 }, // arctic
    { main: 0x3c3a3c, light: 0xf4f2ee, dark: 0x121012, accent: 0x6a686c, nose: 0x0a0909 }, // silver
    { main: 0xd8a868, light: 0xfff8ea, dark: 0x6a4428, accent: 0xb8884a, nose: 0x2a1a12 }, // desert
    { main: 0x9a5a2e, light: 0xf2e8da, dark: 0x1a100c, accent: 0x4a2c1a, nose: 0x100a08 }, // cross fox
  ],
  colour(f, v) {
    const M = C(v.main), L = C(v.light), D = C(v.dark), A = C(v.accent);
    let c: RGB = mix(M, A, sst(f.n.y, .2, .9) * .35);
    const q = f.q;
    if (f.part === 'head' || f.part === 'snout') {
      // white lower face: cheeks + upper lip + chin, sharp edge from the mouth corner to the cheek
      const lowW = sst(-(q.y + .01 - Math.abs(q.x) * .25 - (f.part === 'snout' ? .0 : 0)), -.012, .012);
      c = mix(c, L, lowW * (f.part === 'snout' ? 1 : sst(q.z, -.04, .03)));
      if (f.part === 'snout') { c = mix(c, mix(M, A, .5), sst(q.y, .01, .03) * .6); c = mix(c, D, sst(f.snout, .85, .97) * .5); }
    } else if (f.part === 'ear') c = mix(mix(D, A, .2), L, f.earIn * sst(f.ear, .0, .25) * sst(.92, f.ear, .7) * .95);
    else if (f.part === 'tail') { c = mix(c, mix(M, A, .4), sst(f.tail, .5, .8) * .5); c = mix(c, L, sst(f.tail, .84, .9)); }
    else if (f.part === 'arm' || f.part === 'hand') c = mix(c, D, f.part === 'hand' ? .95 : sst(f.limb, .35, .6) * .95);
    else if (f.part === 'foot' || f.part === 'leg') c = mix(D, A, .15);
    else if (f.part === 'body') c = mix(c, L, sst(f.n.z, .35, .75) * sst(.84, f.p.y, .7) + sst(f.n.z, .2, .6) * sst(f.p.y, .8, .92)); // white bib of fur
    return shade(c, furNoise(f.p, .1));
  },
};

const DOG: Species = {
  id: 'dog',
  head: { rx: 1.02, ry: .97, rz: 1.02, cheek: 1.08, fluff: .35, tuft: .1 },
  snout: { len: .1, w: .056, h: .05, drop: .014, nose: .026, noseFlat: .65 },
  ear: { len: 0.169, w: 0.058, th: 0.018, out: 1.25, back: .2, flop: 1, round: 1, tip: .4 },
  tail: { pts: [[0, .56, -.1], [0, .6, -.2], [0, .7, -.27], [0, .8, -.29], [0, .88, -.26]], r: [.034, .03, .027, .022, .014], fluff: .05 },
  eye: { r: 0.040, az: 0.40, y: 1.165, out: .1 },
  body: { chest: .35, belly: 1.05 },
  whiskers: false,
  variants: [
    { main: 0xc08850, light: 0xfaf4ea, dark: 0x6a4424, accent: 0x9a6634, nose: 0x14100e }, // tan + white
    { main: 0x2a2626, light: 0xf8f6f2, dark: 0x141212, accent: 0x4a4444, nose: 0x0c0a0a }, // black + white
    { main: 0xe0b46e, light: 0xfaf0dc, dark: 0xb88444, accent: 0xc89650, nose: 0x241812 }, // golden
    { main: 0x6a4026, light: 0xe8d4bc, dark: 0x3a2214, accent: 0x52301c, nose: 0x1e1410 }, // chocolate
    { main: 0xd89a5a, light: 0xffffff, dark: 0x1a1614, accent: 0x9a6a3a, nose: 0x0e0c0b }, // tricolour (beagle)
  ],
  colour(f, v) {
    const M = C(v.main), L = C(v.light), D = C(v.dark), A = C(v.accent);
    let c: RGB = counter(f, M, mix(M, L, .3));
    const q = f.q;
    // tricolour: black saddle on the back
    const saddle = v === DOG.variants[4] ? sst(-f.n.z, .2, .6) * sst(f.p.y, .62, .7) * sst(1.0, f.p.y, .95) : 0;
    if (f.part === 'head' || f.part === 'snout') {
      const blaze = Math.exp(-((q.x / (.018 + Math.max(0, -q.y) * .25)) ** 2)) * sst(q.z, .05, .12) * sst(q.y, .12, .05);
      const muzzle = f.part === 'snout' ? sst(f.snout, .1, .5) : sst(q.z, .1, .14) * sst(q.y, .01, -.03);
      c = mix(c, L, Math.min(1, blaze + muzzle * .9));
      // a patch around the left eye for the black + white / tan variants
      if (v === DOG.variants[1] || v === DOG.variants[0]) c = mix(c, v === DOG.variants[1] ? D : A, Math.exp(-(((q.x - .055) / .035) ** 2) - (((q.y - .05) / .035) ** 2)) * sst(q.z, .02, .08) * .9);
      if (f.part === 'snout') c = mix(c, mix(L, A, .3), sst(f.snout, .8, .97) * .4);
    } else if (f.part === 'ear') c = mix(A, D, .35 + sst(f.ear, .3, 1) * .35);
    else if (f.part === 'tail') c = mix(saddle > 0 || v === DOG.variants[4] ? D : M, L, sst(f.tail, .75, .9));
    else if (f.part === 'hand' || f.part === 'foot') c = mix(c, L, .75);
    else if (f.part === 'body') c = mix(mix(c, D, saddle), L, sst(f.n.z, .3, .7) * sst(.86, f.p.y, .74) + sst(f.n.z, .1, .5) * sst(f.p.y, .85, .93));
    return shade(c, furNoise(f.p, .08));
  },
};

const CAT: Species = {
  id: 'cat',
  head: { rx: 1.02, ry: .96, rz: .96, cheek: 1.14, fluff: .6, tuft: .1 },
  snout: { len: .045, w: .05, h: .036, drop: .006, nose: .014, noseFlat: .85 },
  ear: { len: 0.117, w: 0.060, th: 0.018, out: .32, back: .05, flop: 0, round: .15, tip: .85 },
  tail: { pts: [[0, .55, -.1], [0, .46, -.22], [0, .46, -.36], [0, .58, -.44], [0, .74, -.43], [0, .84, -.36]], r: [.03, .028, .026, .024, .022, .018], fluff: .03 },
  eye: { r: 0.044, az: 0.40, y: 1.165, out: .1, slit: true },
  body: { chest: .4, belly: 1 },
  whiskers: true,
  variants: [
    { main: 0xd98a3c, light: 0xfbeedc, dark: 0xa85a1e, accent: 0xb86a28, nose: 0xd8848a }, // orange tabby
    { main: 0x8a8a8c, light: 0xeceae6, dark: 0x3a3a3e, accent: 0x5c5c60, nose: 0x7a5a5c }, // grey tabby
    { main: 0x242224, light: 0x3a3638, dark: 0x0e0d0e, accent: 0x1a181a, nose: 0x1a1414 }, // black
    { main: 0xf6f2ea, light: 0xffffff, dark: 0x2a2626, accent: 0xd88a3a, nose: 0xe89aa0 }, // calico
    { main: 0xefe2cc, light: 0xfbf4e8, dark: 0x4a3226, accent: 0x7a5a46, nose: 0x5a3a32 }, // siamese
  ],
  colour(f, v) {
    const M = C(v.main), L = C(v.light), D = C(v.dark), A = C(v.accent);
    let c: RGB = counter(f, M, mix(M, L, .4));
    const q = f.q, p = f.p, calico = v === CAT.variants[3], siam = v === CAT.variants[4], tabby = !calico && !siam && v !== CAT.variants[2];
    if (tabby) {
      // tabby stripes: rings around limbs + tail, vertical bands on the flanks, the "M" on the forehead
      let s = 0;
      if (f.part === 'body') s = sst(Math.sin(Math.atan2(p.x, -p.z) * 7 + p.y * 9), .3, .8) * sst(-f.n.z, -.3, .3);
      else if (f.part === 'arm' || f.part === 'leg') s = sst(Math.sin(f.limb * 18), .4, .85) * .8;
      else if (f.part === 'tail') s = sst(Math.sin(f.tail * Math.PI * 12), .2, .7);
      else if (f.part === 'head') {
        s = sst(Math.sin(q.x * 160), .5, .9) * sst(q.y, .06, .1) * sst(q.z, -.06, .04) * sst(.07, Math.abs(q.x), .02); // forehead lines
        s = Math.max(s, sst(Math.sin((q.y + Math.abs(q.x) * .3) * 120), .5, .9) * sst(Math.abs(q.x), .08, .12) * sst(q.y, .05, .0)); // cheek lines
      }
      c = mix(c, mix(A, D, .5), s * .75);
    }
    if (calico) {
      const n = vn(p.x * 9 + 3, p.y * 7, p.z * 9), n2 = vn(p.x * 8 - 5, p.y * 6 + 2, p.z * 8);
      c = mix(c, A, sst(n, .55, .6)); c = mix(c, D, sst(n2, .62, .67) * sst(.55, n, .5));
    }
    if (f.part === 'head' || f.part === 'snout') {
      const muzzle = f.part === 'snout' ? sst(f.snout, 0, .4) : sst(q.z, .1, .14) * sst(q.y, .02, -.02);
      c = mix(c, L, muzzle * (siam ? .2 : .85));
      if (siam) c = mix(c, D, sst(q.z, .04, .14) * sst(.06, q.y, -.02) * .85 + (f.part === 'snout' ? .6 : 0));
    } else if (f.part === 'ear') c = siam ? D : mix(c, mix(L, C(0xe8a8a0), .4), f.earIn * sst(f.ear, .05, .3) * sst(.95, f.ear, .75));
    else if (f.part === 'hand' || f.part === 'foot') c = siam ? D : mix(c, L, tabby ? .55 : .2);
    else if (f.part === 'tail' && siam) c = mix(c, D, sst(f.tail, .1, .5));
    else if (f.part === 'body') c = mix(c, L, sst(f.n.z, .4, .8) * sst(.84, p.y, .72) * (siam ? .3 : 1));
    return shade(c, furNoise(f.p, .07));
  },
};

export const SPECIES: Species[] = [RACCOON, RED_PANDA, FOX, DOG, CAT];

// ---------------- other option palettes ----------------
/** eye colours (iris): warm brown, amber, green, blue, near black */
export const EYE_COLS = [0x6a3a1a, 0xd8901e, 0x5a9a3a, 0x3a7ac8, 0x1c1612];
/** overalls: denim blue, moss green, rust red, mustard, charcoal, lilac */
export const OVERALLS = [0x3d5f98, 0x4c7432, 0xa43a2a, 0xc89a2c, 0x34363c, 0x8a6ab0];
export const HAT_COLS = [0xe2c27a, 0xc23a32, 0x2f6a9a, 0x3c8a4a, 0xf0e8d8, 0x2a2a2e];
export const GLASS_COLS = [0x1a1614, 0xc9a046, 0xa04a2a, 0x3a6ac0];
export const METALS = [0xe0b04a, 0xd8dade, 0xe0a090];
