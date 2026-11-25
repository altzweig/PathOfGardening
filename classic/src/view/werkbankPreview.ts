// Dev page (werkbank.html, P2 Werkbank-Paket 25.11.2026): workbench on its hex tile with a hammering figure (reference for the
// hammer animation in view.ts), grey work dust, the pea pistol + pea projectiles, a cabbage wall (fresh, damaged, linked,
// building and breaking pieces). Not part of the game. Drag = turn, wheel = zoom. Buttons play the new sounds.
// ?view=bench|pistol|wall  &ready=1  &p=<progress 0..1>  &t=<s frozen time for screenshots>  &yaw=<rad> &zoom=<f>
import * as THREE from 'three';
import YAML from 'yaml';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BENCH_HIT_SPOT, BENCH_TOP, BENCH_WORK_SPOT, BENCH_WORK_YAW, XP_GOLD, createHammer, createWorkbench, hammerSwing } from './workbench';
import { peaPistol, peaProjectile } from './peapistol';
import { createDust } from './dustfx';
import { createWallPool, type WallPiece } from './wallpool';
import { setCraftEnv, setCraftLight } from './craftkit';
import { animateArms, animateLegs, buildFarmer } from './farmer';
import { randomLook } from '../look';
import { fieldArt } from '../ui/icons';
import { benchWork, initAudio, play, setListener, setSoundConfig, sfx } from '../audio';

const Q = new URLSearchParams(location.search), VIEW = Q.get('view') || 'bench', FROZEN = Q.get('t');
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3124);
setCraftEnv(new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture); setCraftLight(1);
const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(4, 8, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0006; key.shadow.normalBias = .03;
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 }); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 1.0); rim.position.set(-4, 3, -4); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1a, .6));
const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ color: 0x4a5a32, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
// earth hex of the tile (arena.fieldSize 2.8 m corner to corner -> circumradius 1.4)
{ const hx = new THREE.Mesh(new THREE.CircleGeometry(1.4, 6), new THREE.MeshStandardMaterial({ color: 0x5a4230, roughness: 1 })); hx.rotation.set(-Math.PI / 2, 0, Math.PI / 6); hx.position.y = .005; hx.receiveShadow = true; scene.add(hx); }

// ---- workbench with an idea ----
const wb = createWorkbench({ xpColor: XP_GOLD }); scene.add(wb.group);
wb.setIdea({ svg: fieldArt('wheat'), color: '#e8b830', label: 'Weizenfeld' });
const P0 = Q.get('p'); let prog = P0 ? +P0 : .2; const ready = Q.get('ready') === '1'; wb.setReady(ready); if (ready) prog = 1;

// ---- figure hammering at the bench (reference implementation for view.ts) ----
const player = new THREE.Group(); player.position.copy(BENCH_WORK_SPOT); player.rotation.y = BENCH_WORK_YAW; scene.add(player); // faces -x (the bench end)
const body = new THREE.Group(); player.add(body);
const rig = buildFarmer(randomLook()); body.add(rig.root);
const pivot = new THREE.Group(); pivot.position.set(.17, 1.0, .1); pivot.rotation.order = 'YXZ'; pivot.rotation.y = -.12; player.add(pivot);
const hammer = createHammer(); hammer.g.position.z = .06; pivot.add(hammer.g);
const dust = createDust(scene);
let ph = 0, lastPh = 0;

// ---- pea pistol + projectiles ----
const pistolStand = new THREE.Group(); scene.add(pistolStand);
const pistol = peaPistol(); pistol.g.rotation.set(0, -1.2, 0); pistol.g.position.set(0, .3, 0); pistolStand.add(pistol.g);
const projs: THREE.Object3D[] = [];
for (let i = 0; i < 3; i++) { const p = peaProjectile(); p.position.set(.45 + i * .45, .3, .15 - i * .25); pistolStand.add(p); projs.push(p); }
pistolStand.position.set(2.3, 0, 1.3);
{ const st = new THREE.Mesh(new THREE.CylinderGeometry(.3, .34, .08, 20), new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: .9 })); st.position.y = .04; st.receiveShadow = true; pistolStand.add(st); }
const hammer2 = createHammer(); hammer2.g.rotation.set(0, .5, Math.PI / 2); hammer2.g.position.set(-.5, .03, .55); pistolStand.add(hammer2.g);

// ---- cabbage wall: a curved line next to the bench, a few loose pieces, damage along the line ----
const wall = createWallPool(scene);
const pieces: WallPiece[] = [];
for (let i = 0; i < 12; i++) { const a = -1.9 + i * .16; pieces.push({ id: i + 1, x: -2.6 + Math.cos(a) * 3.4 + 3.1, z: Math.sin(a) * 3.4 + 1.1, hp: 30 - Math.max(0, i - 6) * 4.5, maxHp: 30 }); }
pieces.push({ id: 50, x: -3.2, z: 2.6, hp: 30, maxHp: 30 }, { id: 51, x: -3.2 + .62, z: 2.85, hp: 8, maxHp: 30 });
for (let i = 0; i < 4; i++) pieces.push({ id: 60 + i, x: -4.2 + i * .9, z: 4.1 + Math.sin(i) * .2, hp: 30 - i * 7, maxHp: 30 }); // spaced .9 m: fillers visible
wall.sync(pieces, 1, true);
let wallT = 0, nextId = 100;

// ---- camera ----
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .05, 80);
const VIEWS: Record<string, { tgt: THREE.Vector3; d: number; pitch: number; yaw: number }> = {
  bench: { tgt: new THREE.Vector3(.1, .9, .2), d: 4.6, pitch: .62, yaw: .45 },
  dust: { tgt: new THREE.Vector3(.6, 1.0, .06), d: 2.2, pitch: .55, yaw: .2 },
  game: { tgt: new THREE.Vector3(-.3, .5, .9), d: 11, pitch: .95, yaw: 0 },
  pistol: { tgt: new THREE.Vector3(2.45, .32, 1.25), d: 1.25, pitch: .35, yaw: -.25 },
  wall: { tgt: new THREE.Vector3(-3, .35, 3.4), d: 4, pitch: .6, yaw: .3 },
};
const V0 = VIEWS[VIEW] ?? VIEWS.bench;
let yaw = Q.get('yaw') ? +Q.get('yaw')! : V0.yaw, pitch = V0.pitch, dist = V0.d * (Q.get('zoom') ? 1 / +Q.get('zoom')! : 1);
const place = () => { cam.position.set(V0.tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, V0.tgt.y + Math.sin(pitch) * dist, V0.tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(V0.tgt); };
let drag: { x: number; y: number } | null = null;
r.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => { if (!drag) return; yaw -= (e.clientX - drag.x) * .006; pitch = Math.max(.05, Math.min(1.45, pitch + (e.clientY - drag.y) * .005)); drag = { x: e.clientX, y: e.clientY }; });
addEventListener('wheel', e => { dist = Math.max(.4, Math.min(30, dist * (1 + Math.sign(e.deltaY) * .1))); });
addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });

// ---- sound buttons ----
let working = !ready, soundsOn = false;
fetch('./design/sounds.yaml').then(x => x.text()).then(t => setSoundConfig(YAML.parse(t))).catch(() => { /* synth still works via play() */ });
const bar = document.getElementById('bar')!;
const btn = (label: string, f: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { initAudio(); soundsOn = true; f(); }; bar.appendChild(b); return b; };
btn('Schuss', () => { play('peaShot'); fire(); });
btn('Hammer', () => play('benchHit', 1)); btn('Säge', () => play('benchSaw', 1)); btn('Schrauben', () => play('benchScrew'));
const wbBtn = btn('Arbeiten an/aus', () => { working = !working; wbBtn.classList.toggle('on', working); }); wbBtn.classList.toggle('on', working);
btn('Idee fertig', () => { prog = 1; wb.setReady(true); working = false; play('ideaReady'); });
btn('Fertigstellen', () => { play('ideaClaim'); prog = 0; wb.setReady(false); wb.setIdea({ svg: fieldArt('cab'), color: '#8fd16a', label: 'Kohlfeld' }); });
btn('Mauer setzen', () => { const a = Math.random() * 6; pieces.push({ id: nextId++, x: -3.2 + Math.cos(a) * .9, z: 2.7 + Math.sin(a) * .9, hp: 30, maxHp: 30 }); wall.sync(pieces); play('wallPlace'); });
btn('Mauer kaputt', () => { const i = pieces.findIndex(p => p.id === 51 || p.hp < 20); if (i >= 0) { pieces.splice(i, 1); wall.sync(pieces); play('wallBreak'); } });
let recoil = 0; const fire = () => { recoil = 1; };

const clock = new THREE.Clock();
let T = FROZEN ? +FROZEN : 0;
function frame() {
  const dt = FROZEN ? 1 / 60 : Math.min(.05, clock.getDelta()); T += FROZEN ? 0 : dt;
  // research progress while working; the hammer cycle at ~2 blows per second
  if (working && !FROZEN) { prog = Math.min(1, prog + dt * .03); if (prog >= 1 && !wb.group.userData.r) { wb.setReady(true); working = false; wbBtn.classList.remove('on'); if (soundsOn) play('ideaReady'); } }
  wb.setProgress(prog); wb.group.userData.r = prog >= 1;
  const k = working || FROZEN ? 1 : 0;
  ph = FROZEN ? +FROZEN * 2 % 1 : ph + dt * 2 * k;
  const sw = hammerSwing(ph);
  if (k && sw.impact && !hammerSwing(lastPh).impact) {
    wb.hit(1); dust.pulse(0, 1); if (soundsOn) sfx('bench.hit', BENCH_HIT_SPOT.x, BENCH_HIT_SPOT.z, 1, 1);
  }
  lastPh = ph;
  if (soundsOn) benchWork('me', working, BENCH_HIT_SPOT.x, BENCH_HIT_SPOT.z, 1);
  setListener(BENCH_WORK_SPOT.x, BENCH_WORK_SPOT.z);
  pivot.rotation.x = k ? sw.pitch : .9; pivot.visible = true;
  // legs stand, torso leans over the bench; +x hand on the hammer grip, the other hand holds the board next to the hit spot
  animateLegs(rig, dt, 0, 0);
  rig.torso.rotation.x += k ? sw.lean : 0;
  player.updateMatrixWorld(true);
  const t0 = hammer.anim.localToWorld(hammer.grip.clone());
  const t1 = k ? new THREE.Vector3(BENCH_HIT_SPOT.x - .05, BENCH_TOP + .07, BENCH_HIT_SPOT.z - .2) : null; // other hand holds the board
  animateArms(rig, dt, 0, [t0, t1], T < .1);
  dust.set(0, BENCH_HIT_SPOT.x + .05, BENCH_TOP, BENCH_HIT_SPOT.z, !!k, .75);
  dust.update(dt);
  wb.update(dt, cam);
  // pistol: recoil (slide blows back, the pea in the muzzle is gone for a moment), projectiles spin slowly
  recoil = Math.max(0, recoil - dt * 4); pistol.slide.position.z = -Math.min(1, recoil * 2) * .035; pistol.anim.rotation.x = -recoil * .25; pistol.loaded.visible = recoil < .3;
  projs.forEach((p, i) => { p.rotation.y = T * (1 + i * .3); });
  // wall: every few seconds a piece takes a hit
  wallT += dt; if (wallT > 1.5 && !FROZEN) { wallT = 0; const p = pieces[Math.floor(Math.random() * pieces.length)]; if (p) { p.hp = Math.max(4, p.hp - 3); wall.sync(pieces); if (soundsOn) play('wallHit'); } }
  wall.update(dt);
  place(); r.render(scene, cam);
  requestAnimationFrame(frame);
}
if (FROZEN) { for (let i = 0; i < 40; i++) { wall.update(1 / 60); dust.update(1 / 60); wb.update(1 / 60, cam); } }
frame();
(window as any).__ready = true;
