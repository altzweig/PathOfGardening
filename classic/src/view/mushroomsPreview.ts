// Dev page (pilze.html, 27.11.2026): the ten wild mushrooms side by side with name and rarity, by day and by night (the glowing ones),
// plus the Kompostierer. Not part of the game. Drag = turn, wheel = zoom.
// ?night=1  &only=<kind>  &yaw=<rad>  &zoom=<f>  &view=compost
import * as THREE from 'three';
import YAML from 'yaml';
import { MUSHROOMS, type Balancing } from '../config';
import { mushMesh } from './mushrooms';

const Q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(4, 8, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0006; key.shadow.normalBias = .02;
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 1.0); rim.position.set(-4, 3, -4); scene.add(rim);
const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1a, .7); scene.add(hemi);
const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ color: 0x4a5a32, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const only = Q.get('only'), kinds = MUSHROOMS.filter(k => !only || k === only), COLS = only ? 1 : 5, GAP = 1.5;
const items = kinds.map((k, i) => {
  const g = mushMesh(k), col = i % COLS, row = Math.floor(i / COLS);
  g.position.set((col - (COLS - 1) / 2) * GAP, 0, (row - (Math.ceil(kinds.length / COLS) - 1) / 2) * 2.1); scene.add(g);
  const el = document.createElement('div'); document.getElementById('labels')!.appendChild(el);
  return { k, g, el };
});
fetch('./design/balancing.yaml', { cache: 'no-store' }).then(x => x.text()).then(t => {
  const cfg = YAML.parse(t) as Balancing, N = cfg.names;
  for (const it of items) { const rar = cfg.mushrooms?.kinds[it.k]?.rarity ?? 'common'; it.el.className = 'r-' + rar; it.el.innerHTML = `${N.mushrooms?.[it.k] ?? it.k}<small>${N.rarities?.[rar] ?? rar}</small>`; }
}).catch(() => { for (const it of items) it.el.textContent = it.k; });

let night = Q.get('night') === '1';
const setNight = (n: boolean) => { night = n; scene.background = new THREE.Color(n ? 0x0b0f16 : 0x2a3124); key.intensity = n ? .25 : 2.4; key.color.set(n ? 0x8aa0ff : 0xfff0dc); rim.intensity = n ? .3 : 1; hemi.intensity = n ? .18 : .7; };
setNight(night);
const bar = document.getElementById('bar')!;
{ const b = document.createElement('button'); b.textContent = 'Tag / Nacht'; b.onclick = () => { setNight(!night); b.classList.toggle('on', night); }; b.classList.toggle('on', night); bar.appendChild(b); }

const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .1, 100);
let yaw = +(Q.get('yaw') ?? .0), pitch = +(Q.get('pitch') ?? .62), dist = (only ? 2.6 : 9.2) / +(Q.get('zoom') ?? 1), drag: { x: number; y: number } | null = null;
addEventListener('pointerdown', e => { if ((e.target as HTMLElement).tagName !== 'BUTTON') drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', e => { if (!drag) return; yaw -= (e.clientX - drag.x) * .008; pitch = Math.min(1.4, Math.max(.1, pitch + (e.clientY - drag.y) * .006)); drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => drag = null);
addEventListener('wheel', e => { dist = Math.min(20, Math.max(1.2, dist * (1 + Math.sign(e.deltaY) * .1))); });
addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
const v = new THREE.Vector3();
function frame() {
  if (innerWidth < innerHeight) cam.fov = 32 * Math.min(2.2, innerHeight / innerWidth) * .8; else cam.fov = 32; cam.updateProjectionMatrix();
  cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + .3, Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(0, .3, 0);
  for (const it of items) { v.copy(it.g.position); v.y = -.05; v.project(cam); it.el.style.left = (v.x * .5 + .5) * innerWidth + 'px'; it.el.style.top = (-v.y * .5 + .5) * innerHeight + 4 + 'px'; }
  r.render(scene, cam); requestAnimationFrame(frame);
}
frame();
(window as any).__ready = true;
