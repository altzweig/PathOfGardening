// Dev page (pflanzen.html): every plant of the game with its fruit lying in front, studio light. Not linked from the game.
// ?only=straw,bean,...  &cols=6  &zoom=1
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CROP_VIS } from './crops';
import { FRUITS, isCrop, loadBalancing, type FruitType } from '../config';
import { buildPlant, fruitMesh } from './models';
import { M, renderer as r } from './core';

const Q = new URLSearchParams(location.search);
r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight); // the game's renderer (core.ts) on the page's canvas #c
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3124);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture; (scene as any).environmentIntensity = .35;
const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(3, 8, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(key);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1a, .6));
const ground = new THREE.Mesh(new THREE.CircleGeometry(20, 48), new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const leafOf = (t: FruitType) => isCrop(t) ? { leaf: M(CROP_VIS[t].leaf), head: M(CROP_VIS[t].head) }
  : { leaf: M(t === 'blue' ? 0x2f5a34 : t === 'asp' ? 0x6aa83c : t === 'cran' ? 0x335a2a : t === 'lemon' ? 0x3d6a2a : t === 'chili' ? 0x2c6328 : 0x4f8a35), head: M(t === 'lemon' ? 0x5a4026 : t === 'chili' ? 0x3f7a2a : 0x9ad870) };
const only = Q.get('only')?.split(','), list = FRUITS.filter(t => t !== 'nut' && (!only || only.includes(t)));
const cols = Math.min(list.length, +(Q.get('cols') || 7)), sp = 1.5, rows = Math.ceil(list.length / cols);
const labels: [THREE.Vector3, HTMLElement][] = [];
list.forEach((t, i) => {
  const x = (i % cols - (cols - 1) / 2) * sp, z = -Math.floor(i / cols) * sp * 1.15;
  const b = buildPlant(t, leafOf(t)); b.g.position.set(x, 0, z); b.g.rotation.y = .4;
  b.g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; }); scene.add(b.g);
  const f = fruitMesh(t, 1.4); f.position.set(x + .45, .1, z + .45); scene.add(f);
  const el = document.createElement('div'); el.className = 'lb'; el.textContent = t; loadBalancing().then(c => { el.textContent = c.names.plants[t] ?? t; }).catch(() => {}); document.body.appendChild(el); labels.push([new THREE.Vector3(x, 0, z + .78), el]);
});
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .05, 120);
const fit = () => { const wd = cols * sp + 1, d = Math.max(wd / 2 / (Math.tan(15 * Math.PI / 180) * cam.aspect), rows * 1.8 / 2 / Math.tan(15 * Math.PI / 180)) * (+(Q.get('zoom') || 1)); const cz = -(rows - 1) * sp * .58; cam.position.set(0, d * .8, cz + d * .6); cam.lookAt(0, .2, cz); };
fit(); addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); fit(); });
r.setAnimationLoop(() => {
  r.render(scene, cam);
  for (const [p, el] of labels) { const v = p.clone().project(cam); el.style.left = (v.x * .5 + .5) * innerWidth + 'px'; el.style.top = (-v.y * .5 + .5) * innerHeight + 'px'; }
});
