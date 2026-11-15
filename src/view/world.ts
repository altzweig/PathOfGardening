// Static garden + the dark rim: black bush/tree silhouettes with a faint cold edge,
// and blinking eye pairs behind them (more of them where the next wave comes from).
import * as THREE from 'three';
import { ENEMIES, EnemyType } from '../config';
import { GEO, LANT, M, V, part, rand, scene, windU } from './core';
import { EYE_COL } from './models';

const ARENA = 15;

function groundTexture() {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  g.fillStyle = '#18221a'; g.fillRect(0, 0, S, S);
  const W = 64; const toPx = (x: number) => (x / W + .5) * S;
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = rand(2, 14);
    const c = Math.random(); g.fillStyle = c < .5 ? `rgba(${36 + rand(0, 18)},${52 + rand(0, 22)},${28 + rand(0, 10)},.35)` : c < .8 ? 'rgba(16,24,15,.35)' : `rgba(${62 + rand(0, 18)},52,32,.25)`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(64,50,34,.32)'; g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + rand(-.2, .2); g.lineWidth = rand(18, 34); g.beginPath();
    g.moveTo(toPx(Math.cos(a) * 26), toPx(Math.sin(a) * 26));
    g.quadraticCurveTo(toPx(Math.cos(a + .3) * 12), toPx(Math.sin(a + .3) * 12), toPx(Math.cos(a) * 4.5), toPx(Math.sin(a) * 4.5)); g.stroke();
  }
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 9.8 / W);
  grd.addColorStop(0, 'rgba(58,42,28,.95)'); grd.addColorStop(.75, 'rgba(52,38,26,.85)'); grd.addColorStop(1, 'rgba(52,38,26,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S * 9.8 / W, 0, 7); g.fill();
  for (let i = 0; i < 1500; i++) { const a = rand(0, 7), r = Math.sqrt(Math.random()) * S * 9.2 / W; g.fillStyle = `rgba(${rand(20, 90)},${rand(18, 60)},${rand(10, 40)},.4)`; g.fillRect(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rand(1, 4), rand(1, 4)); }
  // the edge falls off into total darkness
  const dark = g.createRadialGradient(S / 2, S / 2, S * 13 / W, S / 2, S / 2, S * 17.5 / W);
  dark.addColorStop(0, 'rgba(0,0,0,0)'); dark.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = dark; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function windify(mat: THREE.Material, amp = .09) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
      float h = max(position.y,0.);
      transformed.x += sin(uTime*1.7 + ip.x*.55 + ip.z*.35) * ${amp} * h;
      transformed.z += cos(uTime*1.25 + ip.x*.3) * ${amp * .6} * h;`);
  };
  return mat;
}

/** pure black with a thin moonlit rim -> reads as a silhouette against the dark */
function silhouetteMat(rim = 0x26344a, pow = 2.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uRim: { value: new THREE.Color(rim) }, uPow: { value: pow } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 lp=vec4(position,1.); vec3 n=normal;
        #ifdef USE_INSTANCING
          lp=instanceMatrix*lp; n=mat3(instanceMatrix)*n;
        #endif
        vec4 wp=modelMatrix*lp; vN=normalize(mat3(modelMatrix)*n); vV=normalize(cameraPosition-wp.xyz);
        gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uRim; uniform float uPow; varying vec3 vN; varying vec3 vV;
      void main(){ float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),uPow); gl_FragColor=vec4(uRim*f,1.); }`,
  });
}

export function buildWorld() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  buildFog();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  { // grass inside the garden only
    const tuft = new THREE.BufferGeometry(); const pos: number[] = [];
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI, cc = Math.cos(a) * .09, s = Math.sin(a) * .09, lean = rand(-.05, .05); pos.push(-cc, 0, -s, cc, 0, s, lean, rand(.3, .45), lean * .5); }
    tuft.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tuft.computeVertexNormals();
    const gm = windify(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: .9 }));
    const N = 1300, im = new THREE.InstancedMesh(tuft, gm, N); let n = 0;
    while (n < N) {
      const a = rand(0, 7), r = Math.sqrt(Math.random()) * 16.5; if (r < 9.8) continue;
      const s = rand(.7, 1.6) * (r > 12 ? 1.25 : 1);
      m4.compose(V(Math.cos(a) * r, 0, Math.sin(a) * r), q.setFromAxisAngle(V(0, 1, 0), rand(0, 7)), V(s, s, s)); im.setMatrixAt(n, m4);
      im.setColorAt(n, c.setHSL(rand(.2, .3), rand(.35, .55), rand(.1, .18) * (r > 13 ? .4 : 1))); n++;
    }
    im.receiveShadow = true; scene.add(im);
  }
  { // silhouettes: bushes on the rim, trees behind
    const sil = silhouetteMat();
    const NT = 80, trunks = new THREE.InstancedMesh(GEO.cyl, sil, NT), crowns = new THREE.InstancedMesh(GEO.cone, sil, NT * 2);
    for (let i = 0; i < NT; i++) {
      const a = i / NT * Math.PI * 2 + rand(-.04, .04), r = rand(18.5, 25), x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(.8, 1.6);
      m4.compose(V(x, .6 * s, z), q.identity(), V(.18 * s, 1.2 * s, .18 * s)); trunks.setMatrixAt(i, m4);
      m4.compose(V(x, 2 * s, z), q.setFromAxisAngle(V(0, 1, 0), rand(0, 7)), V(1.3 * s, 2.4 * s, 1.3 * s)); crowns.setMatrixAt(i * 2, m4);
      m4.compose(V(x, 3.2 * s, z), q, V(.95 * s, 2 * s, .95 * s)); crowns.setMatrixAt(i * 2 + 1, m4);
    }
    scene.add(trunks, crowns);
    const NB = 150, bushes = new THREE.InstancedMesh(GEO.ico, sil, NB);
    for (let i = 0; i < NB; i++) {
      const a = rand(0, Math.PI * 2), r = rand(16.2, 18.8), s = rand(.5, 1.05);
      m4.compose(V(Math.cos(a) * r, s * .45, Math.sin(a) * r), q.setFromEuler(new THREE.Euler(rand(-.3, .3), rand(0, 7), rand(-.3, .3))), V(s * rand(.9, 1.4), s * rand(.6, .9), s * rand(.9, 1.4)));
      bushes.setMatrixAt(i, m4);
    }
    scene.add(bushes);
  }
  { // rocks along the garden border, glowing mushrooms inside
    const rocks = new THREE.InstancedMesh(GEO.lo, M(0x3c4046, { r: .95 }), 30);
    for (let i = 0; i < 30; i++) {
      const s = rand(.14, .25), ang = i / 30 * Math.PI * 2, r = rand(10, 10.4);
      m4.compose(V(Math.cos(ang) * r, s * .3, Math.sin(ang) * r), q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), 0)), V(s, s * .7, s)); rocks.setMatrixAt(i, m4);
    }
    rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
    const stems = new THREE.InstancedMesh(GEO.cyl, M(0x9a948a), 24), caps = new THREE.InstancedMesh(GEO.sph, new THREE.MeshStandardMaterial({ color: 0x1a3a40, emissive: 0x3fe0d0, emissiveIntensity: 1.6, roughness: .4 }), 24);
    for (let i = 0; i < 24; i++) {
      const a = rand(0, 7), r = rand(11, 14.5), x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(.6, 1.3);
      m4.compose(V(x, .07 * s, z), q.identity(), V(.025 * s, .14 * s, .025 * s)); stems.setMatrixAt(i, m4);
      m4.compose(V(x, .15 * s, z), q, V(.08 * s, .04 * s, .08 * s)); caps.setMatrixAt(i, m4);
    }
    scene.add(stems, caps);
    const post = new THREE.Group(); part(post, GEO.cyl, M(0x3a2a1c), .06, 2.2, .06, 0, 1.1, 0); part(post, GEO.box, M(0x2a2a2a, { m: .6, r: .4 }), .22, .3, .22, 0, 2.3, 0);
    part(post, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffc070 }), .09, .12, .09, 0, 2.3, 0, false);
    post.position.copy(LANT); scene.add(post);
  }
}

// ---------------- eyes in the bushes ----------------
// A steady population of eye pairs sits inside the bush ring (r 16.4-18.4). Pairs are always
// horizontal on screen, blink at random and drift a little. Before a wave more pairs gather
// in that direction, in the colours of the coming creatures.
interface Eye { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; t: number; blink: number; base: number; a: number; rad: number; y: number; da: number; ph: number; warn: boolean }
const eyes: Eye[] = [];
const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
const AMBIENT: EnemyType[] = ['raccoon', 'panda', 'toad'];
const BASE_PAIRS = 16;
function spawnEye(type: EnemyType, angle: number, life: number, warn = false) {
  if (eyes.length > 60) return;
  // drawn over the bush silhouettes so they peek out of the foliage
  const mat = new THREE.MeshBasicMaterial({ color: EYE_COL[type], transparent: true, opacity: 0, toneMapped: false, fog: false, depthWrite: false, depthTest: false });
  const g = new THREE.Group(), size = type === 'toad' ? .09 : .075, gap = type === 'toad' ? .24 : .17;
  const l = new THREE.Mesh(eyeGeo, mat), rr = new THREE.Mesh(eyeGeo, mat);
  l.scale.setScalar(size); rr.scale.setScalar(size); l.position.x = -gap / 2; rr.position.x = gap / 2; g.add(l, rr); // pair along world X = horizontal on screen
  const e: Eye = { g, l, r: rr, mat, life, t: 0, blink: rand(.3, 4), base: size, a: angle, rad: rand(16.4, 18.4), y: rand(.22, .62), da: rand(-.012, .012), ph: rand(0, 7), warn };
  g.position.set(Math.cos(angle) * e.rad, e.y, Math.sin(angle) * e.rad);
  l.renderOrder = rr.renderOrder = 20; scene.add(g); eyes.push(e);
}
export function warnEyes(dirs: number[], types: number[][], warnTime: number) {
  dirs.forEach((a, i) => {
    const grp = types[i] || [0], n = Math.min(6, 2 + grp.length);
    for (let k = 0; k < n; k++) {
      const t = ENEMIES[grp[k % grp.length]] || 'raccoon';
      spawnEye(t === 'sheep' ? AMBIENT[k % 3] : t, a + rand(-.25, .25), warnTime + rand(.6, 1.4), true);
    }
  });
}
export function updateEyes(dt: number) {
  // keep the bushes populated
  if (eyes.filter(e => !e.warn).length < BASE_PAIRS) spawnEye(AMBIENT[Math.floor(Math.random() * 3)], rand(0, Math.PI * 2), rand(6, 16));
  for (let i = eyes.length - 1; i >= 0; i--) {
    const e = eyes[i]; e.t += dt;
    if (e.t >= e.life) { scene.remove(e.g); e.mat.dispose(); eyes.splice(i, 1); continue; }
    e.mat.opacity = Math.min(1, e.t / .6, (e.life - e.t) / .6);
    // slight wandering inside the bushes
    e.a += e.da * dt; e.ph += dt;
    const rad = e.rad + Math.sin(e.ph * .7) * .25, y = e.y + Math.sin(e.ph * 1.3) * .04;
    e.g.position.set(Math.cos(e.a) * rad, y, Math.sin(e.a) * rad);
    // random blinks (sometimes double)
    e.blink -= dt; let sy = 1;
    if (e.blink < 0) { const b = -e.blink; sy = b < .06 ? 1 - b / .06 : b < .12 ? (b - .06) / .06 : 1; sy = Math.max(.06, sy); if (b > .12) e.blink = Math.random() < .2 ? .12 : rand(.8, 4.5); }
    e.l.scale.set(e.base, e.base * sy, e.base); e.r.scale.set(e.base, e.base * sy, e.base);
  }
}
export function clearEyes() { for (const e of eyes) scene.remove(e.g); eyes.length = 0; }

// ---------------- fog drifting through the bushes ----------------
const fogTex = (() => {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  for (let i = 0; i < 26; i++) { // soft lumpy blob
    const x = S / 2 + rand(-30, 30), y = S / 2 + rand(-16, 16), r = rand(16, 40);
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
interface Wisp { s: THREE.Sprite; a: number; r: number; y: number; da: number; ph: number; op: number }
const wisps: Wisp[] = [];
function buildFog() {
  for (let i = 0; i < 22; i++) {
    const mat = new THREE.SpriteMaterial({ map: fogTex, color: 0x8aa0c8, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); const sc = rand(5, 9); s.scale.set(sc, sc * .45, 1);
    const w: Wisp = { s, a: rand(0, Math.PI * 2), r: rand(15.5, 19.5), y: rand(.4, 1.4), da: rand(.008, .025) * (Math.random() < .5 ? -1 : 1), ph: rand(0, 7), op: rand(.3, .55) };
    scene.add(s); wisps.push(w);
  }
}
export function updateFog(dt: number) {
  for (const w of wisps) {
    w.a += w.da * dt; w.ph += dt * .25;
    const r = w.r + Math.sin(w.ph) * .8;
    w.s.position.set(Math.cos(w.a) * r, w.y + Math.sin(w.ph * 1.7) * .15, Math.sin(w.a) * r);
    (w.s.material as THREE.SpriteMaterial).opacity = w.op * (.55 + .45 * Math.sin(w.ph * 1.3));
  }
}

// ---------------- small torches at the field corners ----------------
const glowTex = (() => {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(255,190,110,1)'); grd.addColorStop(.35, 'rgba(255,140,60,.35)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(cv);
})();
interface Torch { g: THREE.Group; flame: THREE.Sprite; glow: THREE.Mesh; ph: number }
const torches: Torch[] = [];
const torchGroup = new THREE.Group();
const stickMat = M(0x3a2a1c), headMat = M(0x221a12);
/** one torch per unique corner of the existing fields (shared corners get one torch) */
export function syncTorches(fields: { x: number; z: number }[], H: number) {
  if (!torchGroup.parent) scene.add(torchGroup);
  for (const t of torches) torchGroup.remove(t.g); torches.length = 0;
  const seen = new Set<string>();
  for (const f of fields) for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + i * Math.PI / 3; // pointy-top: corners at ±z
    const x = f.x + Math.cos(a) * H, z = f.z + Math.sin(a) * H, key = Math.round(x * 4) + ',' + Math.round(z * 4);
    if (seen.has(key)) continue; seen.add(key);
    const g = new THREE.Group(); g.position.set(x, 0, z);
    part(g, GEO.cyl, stickMat, .025, .55, .025, 0, .275, 0, false);
    part(g, GEO.cyl, headMat, .045, .08, .045, 0, .58, 0, false);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    flame.position.y = .7; flame.scale.set(.32, .45, 1); g.add(flame);
    const glow = new THREE.Mesh(GEO.circle, new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa050, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = .03; glow.scale.setScalar(1.25); g.add(glow);
    torchGroup.add(g); torches.push({ g, flame, glow, ph: rand(0, 7) });
  }
}
export function updateTorches(dt: number) {
  for (const t of torches) {
    t.ph += dt * rand(6, 11);
    const f = .85 + Math.sin(t.ph) * .08 + Math.sin(t.ph * 2.3) * .06;
    t.flame.scale.set(.3 * f, .44 * (2 - f), 1);
    (t.glow.material as THREE.MeshBasicMaterial).opacity = .2 * f;
  }
}
export { ARENA };
