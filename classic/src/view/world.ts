// The garden ground, the fog all around it, blinking eye pairs in the fog (more of them where the next wave
// comes from), will-o'-wisps and the field torches.
import * as THREE from 'three';
import { GEO, M, lantern, part, rand, scene, windU } from './core';
import { GROUND_U, groundMaterial } from './textures';

const ARENA = 15;

// 23.11.2026: no forest, deco or lamp post any more (they cost ~80 % of the triangles, also in the shadow pass).
// Only the ground: meadow everywhere, wet earth around and between the fields, and fog all around.
const W = 64, CS = 256, toPx = (x: number) => (x / W + .5) * CS;
interface Spot { x: number; z: number; r: number; k: number; want: number }
const spots = new Map<string, Spot>();
let ctlCv: HTMLCanvasElement, ctlTex: THREE.CanvasTexture, ctlDirty = true;
/** control map for the ground shader: r = wet earth (around the fields, grows in for new ones), g = brightness */
function drawControl() {
  const g = ctlCv.getContext('2d')!;
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, CS, CS);
  g.globalCompositeOperation = 'lighter';
  for (const s of spots.values()) {
    if (s.k <= .001) continue;
    // a slightly larger hexagon (pointy-top like the slots): neighbours merge, the earth keeps the grid's outline
    const r = s.r * (.35 + .65 * s.k) * CS / W, x = toPx(s.x), y = toPx(s.z);
    g.fillStyle = `rgba(255,0,0,${Math.min(1, s.k * 1.6)})`; g.filter = 'blur(4px)'; g.beginPath();
    for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath(); g.fill(); g.filter = 'none';
  }
  // brightness (green): lit garden, dimmer towards the fog
  const b = g.createRadialGradient(CS / 2, CS / 2, CS * 9 / W, CS / 2, CS / 2, CS * 19 / W);
  b.addColorStop(0, 'rgba(0,255,0,1)'); b.addColorStop(.6, 'rgba(0,170,0,1)'); b.addColorStop(1, 'rgba(0,60,0,1)');
  g.fillStyle = b; g.fillRect(0, 0, CS, CS);
  ctlTex.needsUpdate = true; ctlDirty = false;
}
/** fields, buildings and the chest that get wet earth around them (radius in m); new ones grow in, removed ones fade */
export function setEarthSpots(list: { x: number; z: number; r: number }[]) {
  const seen = new Set<string>();
  for (const e of list) {
    const key = e.x.toFixed(2) + ',' + e.z.toFixed(2); seen.add(key);
    const s = spots.get(key);
    if (s) { s.want = 1; s.r = e.r; } else spots.set(key, { x: e.x, z: e.z, r: e.r, k: firstSpots ? 1 : 0, want: 1 });
  }
  for (const [key, s] of spots) if (!seen.has(key)) s.want = 0;
  firstSpots = false; ctlDirty = true;
}
let firstSpots = true;
/** earth grows in over ~1.5 s */
export function updateGround(dt: number) {
  for (const [key, s] of spots) {
    if (s.k === s.want) continue;
    s.k = s.want > s.k ? Math.min(1, s.k + dt / 1.5) : Math.max(0, s.k - dt / 1.5);
    if (!s.k && !s.want) spots.delete(key);
    ctlDirty = true;
  }
  if (ctlDirty && ctlTex && !bare) drawControl();
}

/** weapon test room: plain earth everywhere, bright inside the room, dark far outside */
function bareControl() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  g.fillStyle = 'rgb(255,0,0)'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const b = g.createRadialGradient(S / 2, S / 2, S * 15 / 64, S / 2, S / 2, S * 30 / 64);
  b.addColorStop(0, 'rgba(0,255,0,1)'); b.addColorStop(1, 'rgba(0,40,0,1)');
  g.fillStyle = b; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}
let ground: THREE.Mesh, gardenMat: THREE.MeshStandardMaterial, bareTex: THREE.Texture | null = null, bare = false;
/** weapon test room on/off: only earth, no fog banks or wisps */
export function setBareRoom(on: boolean) {
  bare = on;
  if (on && !bareTex) bareTex = bareControl();
  gardenMat.map = on ? bareTex! : ctlTex; GROUND_U.uFogR.value.set(on ? 22 : 12.5, on ? 30 : 19);
  for (const o of [mistMesh, ...spirits.map(w => w.s)]) if (o) o.visible = !on;
  if (on) clearEyes(); else ctlDirty = true;
}
export const isBareRoom = () => bare;

export function buildWorld() {
  ctlCv = document.createElement('canvas'); ctlCv.width = ctlCv.height = CS;
  ctlTex = new THREE.CanvasTexture(ctlCv); ctlTex.colorSpace = THREE.NoColorSpace; drawControl();
  gardenMat = groundMaterial(ctlTex);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), gardenMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  lantern.visible = false; // the lamp post is gone
  buildFog(); buildWisps();
  // eyes glow in the fog on a ring around the garden
  BUSHES.length = 0;
  for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2 + rand(-.05, .05), r = rand(12.6, 14.6), s = rand(.6, 1.05); BUSHES.push({ x: Math.cos(a) * r, y: s * .6, z: Math.sin(a) * r, r: s * .9, a }); }
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
let eyeCount = BASE_BUSHES;
/** night share 0..1: idle eyes in the bushes mostly at night */
export function setEyeNight(n: number) { eyeCount = Math.round(BASE_BUSHES * (.2 + .8 * n)); }
export function updateEyes(dt: number) {
  if (bare) return;
  if (BUSHES.length && eyeBushes.length < eyeCount) activateBush(Math.floor(Math.random() * BUSHES.length), rand(7, 16));
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

// ---------------- fog banks drifting in from all around ----------------
// Finely animated mist: flat, ground-hugging strips (one instanced draw call) that are born between the trees,
// creep slowly towards the garden while their noise texture churns, and dissolve before they reach the beds.
const MIST = 40;
const mistU = { uTime: windU, uCol: { value: new THREE.Color(0x8aa0c8) }, uOp: { value: 1 } };
interface Mist { a: number; r: number; v: number; turn: number; len: number; wid: number; t: number; life: number; y: number }
const mists: Mist[] = [];
let mistMesh: THREE.InstancedMesh | null = null, mistFade: THREE.InstancedBufferAttribute, mistSeed: THREE.InstancedBufferAttribute;
function newMist(m: Partial<Mist> = {}, age = 0): Mist {
  const life = rand(22, 38);
  return Object.assign(m, { a: rand(0, Math.PI * 2), r: rand(14.5, 20), v: rand(.2, .42), turn: rand(-.012, .012), len: rand(5, 9), wid: rand(2.2, 3.6), t: age * life, life, y: rand(.25, .7) }) as Mist;
}
function buildFog() {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aFade; attribute float aSeed; varying vec2 vUv; varying float vF; varying float vS; varying vec2 vW;
      void main(){ vUv=uv; vF=aFade; vS=aSeed; vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.); vW=wp.xz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uCol; uniform float uOp; varying vec2 vUv; varying float vF; varying float vS; varying vec2 vW;
      float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        // world-space noise (strips blend seamlessly where they overlap), two layers moving against each other = churning
        vec2 p=vW*.55+vS*17.;
        float a=n(p+vec2(uTime*.07,uTime*.03))*.55+n(p*2.1-vec2(uTime*.11,-uTime*.05))*.3+n(p*4.3+vec2(uTime*.17,0.))*.15;
        float b=n(p*.7-vec2(uTime*.04,uTime*.06));
        float m=smoothstep(.38,.8,a*.75+b*.4);
        vec2 e=abs(vUv-.5)*2.; float edge=(1.-smoothstep(.35,1.,e.x))*(1.-smoothstep(.15,1.,e.y)); // soft, elongated strip
        float al=m*edge*vF*uOp*.65; if(al<.003) discard;
        gl_FragColor=vec4(uCol,al); }`,
  });
  mistMesh = new THREE.InstancedMesh(geo, mat, MIST); mistMesh.frustumCulled = false; mistMesh.renderOrder = 5;
  mistFade = new THREE.InstancedBufferAttribute(new Float32Array(MIST), 1); mistSeed = new THREE.InstancedBufferAttribute(new Float32Array(MIST), 1);
  geo.setAttribute('aFade', mistFade); geo.setAttribute('aSeed', mistSeed);
  for (let i = 0; i < MIST; i++) { mists.push(newMist({}, Math.random())); mistSeed.setX(i, Math.random()); }
  scene.add(mistMesh);
}
const mistM4 = new THREE.Matrix4(), mistQ = new THREE.Quaternion(), mistUp = new THREE.Vector3(0, 1, 0), mistP = new THREE.Vector3(), mistS = new THREE.Vector3();
function updateMist(dt: number) {
  if (!mistMesh) return;
  for (let i = 0; i < MIST; i++) {
    const m = mists[i]; m.t += dt;
    if (m.t >= m.life || m.r < 9.5) { newMist(m); mistSeed.setX(i, Math.random()); }
    m.r -= m.v * dt; m.a += m.turn * dt; // creeps inwards, curving slightly
    const k = m.t / m.life, inner = Math.min(1, Math.max(0, (m.r - 10) / 3)); // dissolves before the garden
    mistFade.setX(i, Math.min(1, k / .25, (1 - k) / .25) * inner);
    const x = Math.cos(m.a) * m.r, z = Math.sin(m.a) * m.r;
    // long side along the drift direction (towards the garden), stretching a bit while it creeps in
    mistQ.setFromAxisAngle(mistUp, -m.a); mistP.set(x, m.y, z); mistS.set(m.len * (1 + k * .3), 1, m.wid);
    mistMesh.setMatrixAt(i, mistM4.compose(mistP, mistQ, mistS));
  }
  mistMesh.instanceMatrix.needsUpdate = true; mistFade.needsUpdate = true;
}
// will-o'-wisps: small cold lights wandering between the trees, mostly at night
const wispTex = (() => {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.18, 'rgba(255,255,255,.75)'); grd.addColorStop(.45, 'rgba(255,255,255,.14)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(cv);
})();
interface Spirit { s: THREE.Sprite; a: number; r: number; y: number; da: number; ph: number; sp: number }
const spirits: Spirit[] = [];
function buildWisps() {
  for (let i = 0; i < 16; i++) {
    const col = new THREE.Color().setHSL(Math.random() < .6 ? rand(.47, .53) : rand(.72, .8), .9, .62);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wispTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    s.scale.setScalar(rand(.35, .55)); scene.add(s);
    spirits.push({ s, a: rand(0, Math.PI * 2), r: rand(10.5, 18), y: rand(.5, 2.2), da: rand(.02, .06) * (Math.random() < .5 ? -1 : 1), ph: rand(0, 7), sp: rand(.6, 1.4) });
  }
}
function updateWisps(dt: number, night: number) {
  for (const w of spirits) {
    w.a += w.da * dt; w.ph += dt * w.sp;
    w.s.position.set(Math.cos(w.a) * (w.r + Math.sin(w.ph * .4) * 1.2), w.y + Math.sin(w.ph) * .35, Math.sin(w.a) * (w.r + Math.sin(w.ph * .4) * 1.2));
    const flick = .65 + .35 * Math.sin(w.ph * 3.1) * Math.sin(w.ph * 1.7);
    (w.s.material as THREE.SpriteMaterial).opacity = (.12 + .88 * night) * flick;
  }
}
const fogLook = { col: new THREE.Color(0x8aa0c8), mul: 1, night: 1 };
/** colour + strength of the drifting fog (day-night) */
export function setFogLook(col: THREE.Color, mul: number, night = 1) { fogLook.col.copy(col); fogLook.mul = mul; fogLook.night = night; }
export function updateFog(dt: number) {
  updateWisps(dt, fogLook.night);
  mistU.uCol.value.copy(fogLook.col); mistU.uOp.value = Math.min(1.4, Math.max(.6, fogLook.mul)); // the fog replaces the forest: never quite gone
  updateMist(dt);
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
let torchLevel = 1;
/** 1 = full night flame, lower by day (small flame, no ground glow) */
export function setTorchLevel(l: number) { torchLevel = l; }
export function updateTorches(dt: number) {
  for (const t of torches) {
    t.ph += dt * rand(6, 11);
    const f = .85 + Math.sin(t.ph) * .08 + Math.sin(t.ph * 2.3) * .06, k = .55 + .45 * torchLevel;
    t.flame.scale.set(.3 * f * k, .44 * (2 - f) * k, 1);
    (t.glow.material as THREE.MeshBasicMaterial).opacity = .2 * f * torchLevel;
  }
}
export { ARENA };
