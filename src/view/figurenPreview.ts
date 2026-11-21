// Dev page (figuren.html): the five player animals with every player animation, for checks + screenshots. Not linked from the game.
// ?only=0,2  &pose=idle|walk|crouch|kneel|weed|water|refill|sow|sickle|pick|tree|gun|swing  &t=<s> (frozen)  &cam=front|side|back|face|top
// &look={"hat":2,...} overrides  &yaw=  &zoom=  &info (clipping report)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cleanLook, type Look } from '../look';
import { buildFarmer, animateArms, animateLegs, type Rig, SPECIES } from './farmer';
import { posePlayer, POSES, type PoseProps, makeProps } from './figurenPoses';

const Q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3124);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture; (scene as any).environmentIntensity = .35;
const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004;
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 1.2); rim.position.set(-4, 3, -4); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1a, .6));
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x4a5a32, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const poseList = Q.get('poses')?.split(',');
const only = poseList ? poseList.map(() => +(Q.get('a') ?? 0)) : (Q.get('only') ?? '0,1,2,3,4').split(',').map(Number);
const over = Q.get('look') ? JSON.parse(Q.get('look')!) : {};
const furs = (Q.get('fur') ?? '').split(',').filter(Boolean).map(Number);
const sp = +(Q.get('sp') || .9);
const items: { rig: Rig; g: THREE.Group; body: THREE.Group; props: PoseProps; st: any; pose?: string }[] = [];
let tris = 0;
only.forEach((a, i) => {
  const acc = Q.has('acc') ? { hat: 1 + (i + +(Q.get('hs') || 0)) % 5, hatCol: i, glasses: 1 + i % 3, glassCol: i % 4, earring: 1 + i % 3, pierce: 1 + i % 2, metal: i % 3 } : {};
  const look: Look = cleanLook({ name: 'x', animal: a, fur: furs[i] ?? 0, eyes: 0, outfit: i % 6, hat: 0, hatCol: 0, glasses: 0, glassCol: 0, earring: 0, pierce: 0, metal: 0, ...acc, ...over });
  const rig = buildFarmer(look), g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.add(rig.root);
  rig.root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; const g = (o as THREE.Mesh).geometry, n = (g.index?.count ?? g.getAttribute("position").count) / 3; tris += n; ((window as any).__brk ||= []).push([g.type, Math.round(n)]); } });
  g.position.x = (i - (only.length - 1) / 2) * sp; g.rotation.y = +(Q.get('yaw') || 0);
  scene.add(g);
  const props = makeProps(); body.add(props.root);
  items.push({ rig, g, body, props, st: {}, pose: poseList?.[i] });
});
const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, .05, 80);
const view = Q.get('cam') || 'front', zoom = +(Q.get('zoom') || 1), W = Math.max(1.2, only.length * sp);
const fit = () => {
  const d = (W * .75 / Math.tan(14 * Math.PI / 180) / Math.min(1.6, cam.aspect)) * zoom, cy = +(Q.get('cy') || .7);
  if (view === 'side') { cam.position.set(d, cy + .1, 0); cam.lookAt(0, cy, 0); }
  else if (view === 'back') { cam.position.set(0, cy + .3, -d); cam.lookAt(0, cy, 0); }
  else if (view === 'face') { cam.position.set(+(Q.get('fx') || 0), 1.15, .35 + .9 * zoom); cam.lookAt(0, 1.1, 0); }
  else if (view === 'q') { cam.position.set(d * .6, cy + d * .35, d * .8); cam.lookAt(0, cy - .05, 0); }
  else { cam.position.set(0, cy + d * .18, d); cam.lookAt(0, cy, 0); }
};
fit(); addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); fit(); });

let pose = Q.get('pose') || 'idle', clock = 0;
const bar = document.getElementById('bar')!;
for (const k of POSES) { const bt = document.createElement('button'); bt.textContent = k; bt.onclick = () => { pose = k; for (const x of bar.children) x.classList.toggle('on', x === bt); }; if (k === pose) bt.classList.add('on'); bar.appendChild(bt); }
if (Q.has('nobar')) bar.style.display = 'none';
function step(dt: number) {
  clock += dt;
  for (const it of items) { posePlayer(it.rig, it.g, it.body, it.props, it.pose ?? pose, clock, dt, it.st); }
}
const frozen = Q.get('t');
if (frozen) { const T = +frozen; for (let t = 0; t < T; t += 1 / 60) step(1 / 60); }
const info = document.getElementById('info')!;
info.textContent = Q.has('info') ? `${items.length} Figuren, ${Math.round(tris / items.length)} Dreiecke/Figur` : '';
(window as any).__ready = true; (window as any).__tris = tris / items.length; (window as any).__parts = items[0].rig.root.children.filter((o: any) => o.isMesh).map((o: any) => o.geometry.index.count / 3);
let last = performance.now();
// ?sheet: one row per animal (front, 3/4, side, back, face close-up), every figure rendered alone
const SHEET = Q.has('sheet');
const sheetCams: [number, number, number, number, number, number][] = Q.get('cams') ? Q.get('cams')!.split(';').map(c => c.split(',').map(Number) as any) : [[0, .75, 3.1, 0, .66, 0], [2.0, 1.0, 2.4, 0, .66, 0], [3.1, .75, 0, 0, .66, 0], [-.9, .95, -2.9, 0, .66, 0], [.3, 1.3, 1.0, 0, 1.22, .05]];
function renderSheet() {
  const w = innerWidth, h = innerHeight, cw = w / sheetCams.length, ch = h / items.length;
  r.setScissorTest(true); const c2 = new THREE.PerspectiveCamera(26, cw / ch, .05, 50);
  items.forEach((it, row) => {
    items.forEach(o => { o.g.visible = o === it; }); const x0 = it.g.position.x; it.g.position.x = 0;
    sheetCams.forEach((v, col) => {
      c2.fov = col === 4 ? 24 : 30; c2.updateProjectionMatrix(); c2.position.set(v[0], v[1], v[2]); c2.lookAt(v[3], v[4], v[5]);
      const y = h - (row + 1) * ch; r.setViewport(col * cw, y, cw, ch); r.setScissor(col * cw, y, cw, ch); r.render(scene, c2);
    });
    it.g.position.x = x0;
  });
  r.setScissorTest(false);
}
r.setAnimationLoop(() => { if (SHEET) { const n = performance.now(), dt = Math.min(.05, (n - last) / 1000); last = n; if (!frozen) step(dt); renderSheet(); return; } const n = performance.now(), dt = Math.min(.05, (n - last) / 1000); last = n; if (!frozen) step(dt); r.render(scene, cam); });
void SPECIES; void animateArms; void animateLegs;
