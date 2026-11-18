// Dev page (tiere.html): all animals with their animations in a studio light. Not linked from the game.
// ?anim=idle|walk|run|attack|hit|stun|death  &only=raccoon,boss,...  &t=<seconds> (frozen time, for screenshots)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EnemyType } from '../config';
import { animate, animateDeath, DEATH_TIME, makeAnimal, type Animal } from './animals';

const Q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3124);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture; (scene as any).environmentIntensity = .35;
const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 1.1); rim.position.set(-4, 3, -4); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1a, .5));
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x4a5a32, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const ALL: [string, EnemyType, boolean][] = [['raccoon', 'raccoon', false], ['panda', 'panda', false], ['toad', 'toad', false], ['sheep', 'sheep', false], ['hedgehog', 'hedgehog', false], ['squirrel', 'squirrel', false], ['boss', 'raccoon', true]];
const only = Q.get('only')?.split(',');
const list = ALL.filter(x => !only || only.includes(x[0])).map(([n, t, boss]) => ({ n, a: makeAnimal(t, boss) }));
const cols = Math.min(list.length, +(Q.get('cols') || 4)), sp = 1.25;
list.forEach((it, i) => {
  const a = it.a; if (a.boss) a.g.scale.setScalar(1.6);
  a.g.position.set((i % cols - (cols - 1) / 2) * sp, 0, -Math.floor(i / cols) * sp * 1.1); a.g.rotation.y = +(Q.get('yaw') || .7);
  a.g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; }); scene.add(a.g);
});
const rows = Math.ceil(list.length / cols);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .05, 80);
const fit = () => { const wd = cols * sp + 1, d = Math.max(wd / 2 / (Math.tan(15 * Math.PI / 180) * cam.aspect), rows * 1.4 / 2 / Math.tan(15 * Math.PI / 180)) * (+(Q.get('zoom') || 1)); const cz = -(rows - 1) * sp * .55; cam.position.set(0, d * .55, cz + d * .85); cam.lookAt(0, .3, cz); };
fit(); addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); fit(); });

let anim = Q.get('anim') || 'walk', t0 = 0;
const ANIMS: [string, string][] = [['idle', 'Idle'], ['walk', 'Laufen'], ['run', 'Rennen'], ['attack', 'Angriff'], ['hit', 'Treffer'], ['stun', 'Betäubt'], ['death', 'Tod']];
const bar = document.getElementById('bar')!;
for (const [k, l] of ANIMS) { const bt = document.createElement('button'); bt.textContent = l; bt.onclick = () => { anim = k; t0 = clock; for (const x of bar.children) x.classList.toggle('on', x === bt); }; if (k === anim) bt.classList.add('on'); bar.appendChild(bt); }
if (Q.has('nobar')) bar.style.display = 'none';
let clock = 0; const frozen = Q.get('t');
// virtual positions: animals walk on a treadmill (position advances, model stays)
const pos = list.map(() => ({ x: 0, z: 0 }));
function step(dt: number) {
  clock += dt; const lt = clock - t0;
  list.forEach((it, i) => {
    const a = it.a, P = pos[i], speed = anim === 'walk' ? (a.type === 'sheep' ? 1.5 : a.type === 'hedgehog' ? 1.6 : 2) : anim === 'run' ? (a.type === 'sheep' ? 7 : 4.5) : 0;
    P.z += speed * dt;
    if (anim === 'death') { if (!animateDeath(a, lt % (DEATH_TIME + .6), clock)) a.g.position.y = 0; return; }
    a.g.position.y = 0;
    const cyc = lt % 1.2, toad = a.type === 'toad', sq = a.type === 'squirrel';
    animate(a, {
      x: P.x, z: P.z, yaw: 0, dt, now: clock,
      stun: anim === 'stun', flash: anim === 'hit' && cyc < .1, lunge: anim === 'attack' && cyc < .3 && !toad,
      flee: anim === 'run' && (a.type === 'raccoon' && !a.boss),
      air: toad && (anim === 'walk' || anim === 'run') ? (lt % 1 < .5 ? (lt % 1) / .5 : 0) : sq && speed > 0 ? Math.abs(Math.sin(lt * 7)) : 0,
      tongue: toad && anim === 'attack' ? Math.max(0, Math.sin(Math.min(1, cyc / .5) * Math.PI)) * 1.2 : 0,
      windup: a.type === 'sheep' && anim === 'attack' ? Math.min(1, cyc / .8) : 0,
      puff: a.type === 'hedgehog' && anim === 'attack' ? (cyc < .15 ? cyc / .15 : Math.max(0, 1 - (cyc - .15) / 1)) : undefined,
      rear: a.boss && anim === 'attack' ? 1 : 0,
    });
    if (a.type === 'hedgehog' && a.b.puff) { const k = anim === 'attack' ? (cyc < .15 ? cyc / .15 : Math.max(0, 1 - (cyc - .15))) : 0; a.b.puff.scale.setScalar(1 + .3 * k); }
    if (toad) { const air = anim === 'walk' || anim === 'run' ? (lt % 1 < .5 ? Math.sin((lt % 1) / .5 * Math.PI) * .55 : 0) : 0; a.body.position.y += air; }
    if (sq && speed > 0) a.g.position.y = Math.abs(Math.sin(lt * 7)) * .22;
  });
}
if (frozen) { const T = +frozen; for (let t = 0; t < T; t += 1 / 60) step(1 / 60); }
(window as any).__ready = true;
let last = performance.now();
r.setAnimationLoop(() => { const n = performance.now(), dt = Math.min(.05, (n - last) / 1000); last = n; if (!frozen) step(dt); r.render(scene, cam); });
