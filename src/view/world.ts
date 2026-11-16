// Static garden + the dark rim: black bush/tree silhouettes with a faint cold edge,
// and blinking eye pairs behind them (more of them where the next wave comes from).
import * as THREE from 'three';
import { GEO, LANT, M, V, part, rand, scene, windU } from './core';
import { groundMaterial, rockMaterial } from './textures';

const ARENA = 15;

/** control map for the ground shader: r = bare dirt (garden + trodden paths), g = worn patches, b = brightness (falls to black at the rim) */
function groundControl() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const W = 64; const toPx = (x: number) => (x / W + .5) * S;
  g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  // worn patches (green channel)
  for (let i = 0; i < 260; i++) { const x = Math.random() * S, y = Math.random() * S, r = rand(4, 16); const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(0,120,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  // trodden paths from the dark into the garden (red channel)
  g.strokeStyle = 'rgba(150,0,0,1)'; g.lineCap = 'round'; g.filter = 'blur(3px)';
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + rand(-.2, .2); g.lineWidth = rand(7, 12); g.beginPath();
    g.moveTo(toPx(Math.cos(a) * 26), toPx(Math.sin(a) * 26));
    g.quadraticCurveTo(toPx(Math.cos(a + .3) * 12), toPx(Math.sin(a + .3) * 12), toPx(Math.cos(a) * 4.5), toPx(Math.sin(a) * 4.5)); g.stroke();
  }
  g.filter = 'none';
  // the garden itself: bare earth (red channel)
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 10.2 / W);
  grd.addColorStop(0, 'rgba(255,0,0,1)'); grd.addColorStop(.85, 'rgba(255,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S * 10.2 / W, 0, 7); g.fill();
  // brightness (blue channel): lit garden, dimmer lawn, total darkness at the edge
  const b = g.createRadialGradient(S / 2, S / 2, S * 9 / W, S / 2, S / 2, S * 18.5 / W);
  b.addColorStop(0, 'rgba(0,0,255,1)'); b.addColorStop(.55, 'rgba(0,0,150,1)'); b.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = b; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), groundMaterial(groundControl()));
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
      const a = i / NT * Math.PI * 2 + rand(-.04, .04), r = rand(15.3, 21), x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(.8, 1.6);
      m4.compose(V(x, .6 * s, z), q.identity(), V(.18 * s, 1.2 * s, .18 * s)); trunks.setMatrixAt(i, m4);
      m4.compose(V(x, 2 * s, z), q.setFromAxisAngle(V(0, 1, 0), rand(0, 7)), V(1.3 * s, 2.4 * s, 1.3 * s)); crowns.setMatrixAt(i * 2, m4);
      m4.compose(V(x, 3.2 * s, z), q, V(.95 * s, 2 * s, .95 * s)); crowns.setMatrixAt(i * 2 + 1, m4);
    }
    scene.add(trunks, crowns);
    const NB = 150, bushes = new THREE.InstancedMesh(GEO.ico, sil, NB);
    for (let i = 0; i < NB; i++) {
      const a = rand(0, Math.PI * 2), r = rand(13, 15), s = rand(.5, 1.05); // close to the garden: enemies visibly come out of here
      m4.compose(V(Math.cos(a) * r, s * .45, Math.sin(a) * r), q.setFromEuler(new THREE.Euler(rand(-.3, .3), rand(0, 7), rand(-.3, .3))), V(s * rand(.9, 1.4), s * rand(.6, .9), s * rand(.9, 1.4)));
      bushes.setMatrixAt(i, m4); BUSHES.push({ x: Math.cos(a) * r, y: s * .45, z: Math.sin(a) * r, r: s * .85, a });
    }
    scene.add(bushes);
  }
  { // rocks along the garden border, glowing mushrooms inside
    const rocks = new THREE.InstancedMesh(GEO.lo, rockMaterial(0x8a8e96), 30);
    for (let i = 0; i < 30; i++) {
      const s = rand(.14, .25), ang = i / 30 * Math.PI * 2, r = rand(10, 10.4);
      m4.compose(V(Math.cos(ang) * r, s * .3, Math.sin(ang) * r), q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), 0)), V(s, s * .7, s)); rocks.setMatrixAt(i, m4);
    }
    rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
    const stems = new THREE.InstancedMesh(GEO.cyl, M(0x9a948a), 24), caps = new THREE.InstancedMesh(GEO.sph, new THREE.MeshStandardMaterial({ color: 0x1a3a40, emissive: 0x3fe0d0, emissiveIntensity: 1.6, roughness: .4 }), 24);
    for (let i = 0; i < 24; i++) {
      const a = rand(0, 7), r = rand(10.5, 12.5), x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(.6, 1.3);
      m4.compose(V(x, .07 * s, z), q.identity(), V(.025 * s, .14 * s, .025 * s)); stems.setMatrixAt(i, m4);
      m4.compose(V(x, .15 * s, z), q, V(.08 * s, .04 * s, .08 * s)); caps.setMatrixAt(i, m4);
    }
    scene.add(stems, caps);
    const post = new THREE.Group(); part(post, GEO.cyl, M(0x3a2a1c), .06, 2.2, .06, 0, 1.1, 0); part(post, GEO.box, M(0x2a2a2a, { m: .6, r: .4 }), .22, .3, .22, 0, 2.3, 0);
    part(post, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffc070 }), .09, .12, .09, 0, 2.3, 0, false);
    post.position.copy(LANT); scene.add(post);
  }
}

// ---------------- eyes on the bushes ----------------
// Small dark-blue to purple eye pairs sit on the bush silhouettes, 2-3 pairs per bush.
// They are self-lit (no light source, below the bloom threshold) and blink with quick lids.
// Before a wave, bushes in that direction fill up with eyes.
const BUSHES: { x: number; y: number; z: number; r: number; a: number }[] = [];
interface Pair { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; mat: THREE.MeshBasicMaterial; size: number; y0: number; blink: number; ph: number }
interface EyeBush { b: number; pairs: Pair[]; life: number; t: number }
const eyeBushes: EyeBush[] = [];
const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
const BASE_BUSHES = 14, EYE_SIZE = .032;
function eyeColor() { return new THREE.Color().setHSL(rand(.64, .78), rand(.6, .8), rand(.28, .36)); }
function activateBush(b: number, life: number) {
  if (b < 0 || eyeBushes.some(e => e.b === b) || eyeBushes.length > 40) return;
  const B = BUSHES[b], pairs: Pair[] = [], n = Math.random() < .5 ? 2 : 3;
  // face the garden: put the pairs on the inner side of the bush
  const ix = -Math.cos(B.a), iz = -Math.sin(B.a), tx = -iz, tz = ix;
  for (let k = 0; k < n; k++) {
    const size = EYE_SIZE * rand(.9, 1.1), gap = size * 2.7;
    const mat = new THREE.MeshBasicMaterial({ color: eyeColor(), transparent: true, opacity: 0, fog: false, depthWrite: false, depthTest: false });
    const g = new THREE.Group(), l = new THREE.Mesh(eyeGeo, mat), rr = new THREE.Mesh(eyeGeo, mat);
    l.scale.setScalar(size); rr.scale.setScalar(size); l.position.x = -gap / 2; rr.position.x = gap / 2; // always horizontal
    l.renderOrder = rr.renderOrder = 20; g.add(l, rr);
    const side = rand(-.6, .6) * B.r, up = rand(-.15, .45) * B.r;
    g.position.set(B.x + ix * B.r * .8 + tx * side, B.y + up, B.z + iz * B.r * .8 + tz * side);
    scene.add(g); pairs.push({ g, l, r: rr, mat, size, y0: 0, blink: rand(.3, 4), ph: rand(0, 7) });
  }
  eyeBushes.push({ b, pairs, life, t: 0 });
}
const nearestBushes = (angle: number, count: number) => BUSHES.map((B, i) => ({ i, d: Math.abs(Math.atan2(Math.sin(B.a - angle), Math.cos(B.a - angle))) })).sort((p, q) => p.d - q.d).slice(0, count).map(p => p.i);
export function warnEyes(dirs: number[], _types: number[][], warnTime: number) {
  for (const a of dirs) for (const b of nearestBushes(a + rand(-.1, .1), 3)) activateBush(b, warnTime + rand(1, 2));
}
export function updateEyes(dt: number) {
  if (BUSHES.length && eyeBushes.length < BASE_BUSHES) activateBush(Math.floor(Math.random() * BUSHES.length), rand(7, 16));
  for (let i = eyeBushes.length - 1; i >= 0; i--) {
    const E = eyeBushes[i]; E.t += dt;
    if (E.t >= E.life) { for (const p of E.pairs) { scene.remove(p.g); p.mat.dispose(); } eyeBushes.splice(i, 1); continue; }
    const fade = Math.min(1, E.t / .8, (E.life - E.t) / .8);
    for (const p of E.pairs) {
      p.mat.opacity = fade; p.ph += dt;
      // quick lid: closes from the top (bottom edge stays), opens again
      p.blink -= dt; let open = 1;
      if (p.blink < 0) { const b = -p.blink; open = b < .05 ? 1 - b / .05 : b < .12 ? (b - .05) / .07 : 1; if (b >= .12) p.blink = Math.random() < .18 ? .1 : rand(1.5, 6); }
      open = Math.max(.06, open);
      for (const m of [p.l, p.r]) { m.scale.set(p.size, p.size * open, p.size); m.position.y = -p.size * (1 - open); }
      p.g.position.y += Math.sin(p.ph * 1.1) * .0006; // barely moving
    }
  }
}
export function clearEyes() { for (const E of eyeBushes) for (const p of E.pairs) scene.remove(p.g); eyeBushes.length = 0; }

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
    const w: Wisp = { s, a: rand(0, Math.PI * 2), r: rand(12.5, 16.5), y: rand(.4, 1.4), da: rand(.008, .025) * (Math.random() < .5 ? -1 : 1), ph: rand(0, 7), op: rand(.3, .55) };
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
    glow.rotation.x = -Math.PI / 2; glow.position.y = .052; glow.scale.setScalar(1.25); g.add(glow);
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
