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

// ---------------- eyes in the dark ----------------
interface Eye { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; t: number; blink: number; base: number }
const eyes: Eye[] = [];
const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
function spawnEye(type: EnemyType, angle: number, life: number, near = false) {
  if (eyes.length > 70) return;
  const r = near ? rand(18.2, 20) : rand(18.5, 23), y = rand(.25, 1.1);
  const mat = new THREE.MeshBasicMaterial({ color: EYE_COL[type], transparent: true, opacity: 0, toneMapped: false, fog: false, depthWrite: false });
  const g = new THREE.Group(), size = type === 'toad' ? .075 : .06, gap = type === 'toad' ? .2 : .14;
  const l = new THREE.Mesh(eyeGeo, mat), rr = new THREE.Mesh(eyeGeo, mat);
  l.scale.setScalar(size); rr.scale.setScalar(size); l.position.x = -gap / 2; rr.position.x = gap / 2; g.add(l, rr);
  g.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r); g.lookAt(0, y, 0);
  scene.add(g);
  eyes.push({ g, l, r: rr, mat, life, t: 0, blink: rand(.5, 3), base: size });
}
const AMBIENT: EnemyType[] = ['raccoon', 'panda', 'toad'];
let ambientT = 0;
export function warnEyes(dirs: number[], types: number[][], warnTime: number) {
  dirs.forEach((a, i) => {
    const grp = types[i] || [0];
    const n = Math.min(7, 2 + grp.length);
    for (let k = 0; k < n; k++) {
      const t = ENEMIES[grp[k % grp.length]] || 'raccoon';
      const tt = t === 'sheep' ? AMBIENT[k % 3] : t;
      setTimeout(() => spawnEye(tt, a + rand(-.28, .28), warnTime + rand(.4, 1.2), true), rand(0, 700));
    }
  });
}
export function updateEyes(dt: number) {
  ambientT -= dt;
  if (ambientT <= 0) { ambientT = rand(.6, 1.8); spawnEye(AMBIENT[Math.floor(Math.random() * 3)], rand(0, Math.PI * 2), rand(3, 7)); }
  for (let i = eyes.length - 1; i >= 0; i--) {
    const e = eyes[i]; e.t += dt;
    if (e.t >= e.life) { scene.remove(e.g); e.mat.dispose(); eyes.splice(i, 1); continue; }
    const fade = Math.min(1, e.t / .5, (e.life - e.t) / .5);
    e.mat.opacity = fade;
    e.blink -= dt; let sy = 1;
    if (e.blink < 0) { sy = Math.max(.08, Math.abs(e.blink / .07) - 1); if (e.blink < -.14) e.blink = rand(1.2, 4); }
    e.l.scale.set(e.base, e.base * sy, e.base); e.r.scale.set(e.base, e.base * sy, e.base);
  }
}
export function clearEyes() { for (const e of eyes) scene.remove(e.g); eyes.length = 0; }
export { ARENA };
