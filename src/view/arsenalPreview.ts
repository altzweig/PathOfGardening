// Dev page (arsenal-preview.html): all weapon models in a studio light, for close-up review. Not part of the game build.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COMBOS } from '../config';
import { aspCrossbow, cabHeld, chiliThrower, comboModel, cranGun, hoeModel, lemonWand, setArsenalEnv, setArsenalLight } from './arsenal';

const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x24282c);
setArsenalEnv(new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture); setArsenalLight(1);
const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(3, 5, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 1.2); rim.position.set(-4, 3, -3); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1a, .6));
const items: { name: string; o: THREE.Object3D }[] = [];
const add = (name: string, o: THREE.Object3D) => items.push({ name, o });
{ const g = new THREE.Group(); g.add(hoeModel()); g.scale.setScalar(.6); g.position.z = -.1; add('rake', g); }
add('asp', aspCrossbow().g); add('cran', cranGun().g); add('cab', cabHeld());
{ const s = new THREE.Group(); s.position.z = -.2; lemonWand(s); const g = new THREE.Group(); g.add(s); add('lemon', g); }
add('chili', chiliThrower());
for (const c of COMBOS) { const a = new THREE.Group(); const m = comboModel(c, a); void m; const g = new THREE.Group(); g.add(a); if (c === 'lance') g.scale.setScalar(.6); if (c === 'rocket') g.scale.setScalar(.75); if (c === 'chilight') g.position.z = -.1; add(c, g); }
const cols = +(new URLSearchParams(location.search).get('cols') || 4);
const only = new URLSearchParams(location.search).get('only');
const list = only ? items.filter(i => only.split(',').includes(i.name)) : items;
const cw = only ? 1 : 1.0;
list.forEach((it, i) => { const x = (i % cols - (Math.min(cols, list.length) - 1) / 2) * cw, y = -Math.floor(i / cols) * .8; it.o.position.x += x; it.o.position.y += y; it.o.rotation.y = -1.05; it.o.rotation.x = .25; scene.add(it.o); });
const rows = Math.ceil(list.length / cols);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .05, 50);
const tn = Math.tan(15 * Math.PI / 180), d = Math.max(Math.min(cols, list.length) * cw / 2 / (tn * cam.aspect), rows * .8 / 2 / tn) * 1.05;
cam.position.set(0, -(rows - 1) * .4 + .15, d); cam.lookAt(0, -(rows - 1) * .4, 0);
const spin = new URLSearchParams(location.search).get('spin');
(window as any).__ready = true;
r.setAnimationLoop(t => { if (spin) list.forEach(it => { it.o.rotation.y = -1.05 + t / 1000 * +spin; }); r.render(scene, cam); });
