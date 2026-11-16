// Garden beds made of earth decals: several raked-earth patches in random directions, overlapping, roughly filling the
// hexagon but spilling over its edge organically, plus wet earth around every plant. Textures are painted once on
// canvases (atlas of variants), each bed is merged into one mesh per material (2 draw calls).
import * as THREE from 'three';

// ---- value noise ----
const P = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
const h2 = (x: number, y: number) => P[(P[x & 255] + y) & 511] / 255;
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi; xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x: number, y: number) => vnoise(x, y) * .55 + vnoise(x * 2.1 + 17, y * 2.1 + 9) * .3 + vnoise(x * 4.3 + 3, y * 4.3 + 31) * .15;
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const N = 2, TILE = 256; // 2x2 variants per atlas
/** raked earth patch: furrows in one direction (warped), crumbs, ragged non-round outline */
function paintEarth() {
  const cv = document.createElement('canvas'); cv.width = cv.height = TILE * N; const g = cv.getContext('2d')!;
  const img = g.createImageData(TILE * N, TILE * N), D = img.data;
  for (let v = 0; v < N * N; v++) {
    const ox = (v % N) * TILE, oy = Math.floor(v / N) * TILE, s = v * 37.7, freq = 2 * Math.PI / (9 + v * 1.5);
    // outline: a few random lobes instead of a circle
    const lobes = Array.from({ length: 4 }, () => ({ x: .5 + (Math.random() - .5) * .35, y: .5 + (Math.random() - .5) * .35, r: .2 + Math.random() * .14 }));
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const u = x / TILE, w = y / TILE, i = ((oy + y) * TILE * N + ox + x) * 4;
      let m = 0; for (const l of lobes) m = Math.max(m, 1 - Math.hypot(u - l.x, w - l.y) / l.r);
      const edge = m + (fbm(u * 6 + s, w * 6) - .5) * .7 + (vnoise(u * 22 + s, w * 22) - .5) * .25;
      const a = sm(.0, .35, edge);
      const warp = fbm(u * 3 + s, w * 3 + 5) * 14, fur = Math.sin((y + warp) * freq + vnoise(u * 9, w * 9 + s) * 2);
      const n = fbm(u * 8 + s, w * 8 + 3), crumb = vnoise(u * 60 + s, w * 60);
      let b = .78 + n * .35 + fur * .16 + (crumb > .82 ? .18 : crumb < .12 ? -.16 : 0);
      b *= .92 + (vnoise(u * 2 + s, w * 2) - .5) * .25;
      D[i] = 84 * b; D[i + 1] = 59 * b; D[i + 2] = 43 * b; D[i + 3] = 255 * a;
    }
  }
  g.putImageData(img, 0, 0); return cv;
}
/** wet earth blob: dark, irregular, restless edge (no hard border, no circle) */
function paintWet() {
  const cv = document.createElement('canvas'); cv.width = cv.height = TILE * N; const g = cv.getContext('2d')!;
  const img = g.createImageData(TILE * N, TILE * N), D = img.data;
  for (let v = 0; v < N * N; v++) {
    const ox = (v % N) * TILE, oy = Math.floor(v / N) * TILE, s = v * 51.3 + 7;
    const lobes = Array.from({ length: 3 }, () => ({ x: .5 + (Math.random() - .5) * .25, y: .5 + (Math.random() - .5) * .25, r: .22 + Math.random() * .12 }));
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const u = x / TILE, w = y / TILE, i = ((oy + y) * TILE * N + ox + x) * 4;
      let m = 0; for (const l of lobes) m = Math.max(m, 1 - Math.hypot(u - l.x, w - l.y) / l.r);
      // restless transition: coarse + fine noise, some dry speckles inside and wet spots outside
      const e = m + (fbm(u * 5 + s, w * 5) - .5) * .8 + (vnoise(u * 28 + s, w * 28) - .5) * .35;
      const a = sm(-.05, .45, e) * .9;
      const b = .8 + fbm(u * 10 + s, w * 10) * .4;
      D[i] = 26 * b; D[i + 1] = 18 * b; D[i + 2] = 14 * b; D[i + 3] = 255 * a;
    }
  }
  g.putImageData(img, 0, 0); return cv;
}

let mats: { earth: THREE.MeshStandardMaterial; wet: THREE.MeshStandardMaterial } | null = null;
function getMats() {
  if (mats) return mats;
  const t = (cv: HTMLCanvasElement) => { const x = new THREE.CanvasTexture(cv); x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 4; return x; };
  const base = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
  mats = {
    earth: new THREE.MeshStandardMaterial({ map: t(paintEarth()), roughness: 1, ...base }),
    wet: new THREE.MeshStandardMaterial({ map: t(paintWet()), roughness: .45, metalness: 0, ...base }),
  };
  return mats;
}

/** merged flat quads: centre, size, rotation, atlas variant */
function quads(list: { x: number; z: number; w: number; l: number; r: number; v: number; y: number }[]) {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  for (const q of list) {
    const c = Math.cos(q.r), s = Math.sin(q.r), u0 = (q.v % N) / N, v0 = Math.floor(q.v / N) / N, b = pos.length / 3;
    for (const [a, d] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = a * q.w / 2, lz = d * q.l / 2;
      pos.push(q.x + lx * c - lz * s, q.y, q.z + lx * s + lz * c); nor.push(0, 1, 0);
      uv.push(u0 + (a + 1) / 2 / N, 1 - (v0 + (d + 1) / 2 / N));
    }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}

/** a bed for a hex of radius H (local coords): raked earth patches + wet earth around the given plant spots */
export function buildBed(H: number, plants: [number, number][]) {
  const M = getMats(), g = new THREE.Group(), R = (a: number, b: number) => a + Math.random() * (b - a);
  // random point inside the hex (pointy-top), sometimes pushed beyond the edge
  const inHex = (k: number) => { for (;;) { const x = R(-1, 1) * H, z = R(-1, 1) * H; const ax = Math.abs(x), az = Math.abs(z); if (az <= H && ax <= H * .866 && az <= H - ax * .577) return [x * k, z * k]; } };
  const earth: Parameters<typeof quads>[0] = [];
  const n = 9 + Math.floor(R(0, 4));
  for (let i = 0; i < n; i++) {
    const [x, z] = inHex(i < 3 ? .5 : R(.75, 1.12)), sz = R(1.3, 2.1);
    earth.push({ x, z, w: sz * R(.85, 1.15), l: sz * R(.85, 1.15), r: R(0, Math.PI * 2), v: Math.floor(R(0, N * N)), y: .012 + i * .0005 });
  }
  const wet = plants.map(([x, z], i) => { const sz = R(1.25, 1.65); return { x: x + R(-.08, .08), z: z + R(-.08, .08), w: sz * R(.85, 1.15), l: sz * R(.85, 1.15), r: R(0, 7), v: Math.floor(R(0, N * N)), y: .02 + i * .0005 }; });
  const e = new THREE.Mesh(quads(earth), M.earth), w = new THREE.Mesh(quads(wet), M.wet);
  e.renderOrder = -2; w.renderOrder = -1; e.receiveShadow = w.receiveShadow = true;
  g.add(e, w); return g;
}
