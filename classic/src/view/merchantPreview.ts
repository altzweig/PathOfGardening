// Dev page (haendler.html): the merchant with his cart in a studio light. Drag = turn, wheel / pinch = zoom.
// Buttons: travelling (tarp, pale colours) / ready (golden sweep, tarp dissolves) / walking on and off.
// ?state=ready|travel &walk=0|1 &yaw=<rad> &zoom=<f> &t=<s> (frozen time for screenshots)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { U, WHEEL_R, buildMerchant } from './merchantModel';

const Q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3124);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture; (scene as any).environmentIntensity = .35;
const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 1.1); rim.position.set(-4, 3, -4); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1a, .5));
const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: 0x4a5a32, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const v = buildMerchant(); v.g.position.z = 1.6; scene.add(v.g);
document.getElementById('tri')!.textContent = `${Math.round(v.tris).toLocaleString('de-DE')} Dreiecke`;
const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .05, 80);
let yaw = +(Q.get('yaw') ?? .8), pitch = .42, dist = 7 * +(Q.get('zoom') || 1);
const place = () => { cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + .6, Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(0, .7, 0); };
place(); addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
let drag: { x: number; y: number } | null = null; const pts = new Map<number, { x: number; y: number }>(); let pinch = 0;
r.domElement.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', e => { pts.delete(e.pointerId); drag = null; pinch = 0; });
addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) dist = Math.max(2.5, Math.min(16, dist * pinch / d)); pinch = d; place(); return; }
  if (!drag) return; yaw -= (e.clientX - drag.x) * .008; pitch = Math.max(.05, Math.min(1.3, pitch + (e.clientY - drag.y) * .006)); drag = { x: e.clientX, y: e.clientY }; place();
});
addEventListener('wheel', e => { dist = Math.max(2.5, Math.min(16, dist * (1 + Math.sign(e.deltaY) * .1))); place(); });

let ready = Q.get('state') === 'ready', walk = Q.get('walk') !== '0', sweep = -1, dis = ready ? 1 : 0, sat = ready ? 1 : .45, wA = 0, ph = 0;
const bar = document.getElementById('bar')!;
const btn = (label: string, on: () => boolean, f: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { f(); sync(); }; bar.appendChild(b); return () => b.classList.toggle('on', on()); };
const syncs = [
  btn('Unterwegs', () => !ready, () => { ready = false; }),
  btn('Handelsbereit', () => ready, () => { if (!ready) sweep = 0; ready = true; }),
  btn('Laufen', () => walk, () => { walk = !walk; }),
];
const sync = () => syncs.forEach(f => f()); sync();
function step(dt: number) {
  if (walk) { const d = 1.6 * dt; wA += d / WHEEL_R; ph += d * 4.2; }
  const sw = Math.sin(ph), go = walk ? 1 : 0;
  v.man.legs[0].rotation.x = sw * .55 * go; v.man.legs[1].rotation.x = -sw * .55 * go;
  v.man.body.position.y = Math.abs(Math.cos(ph)) * .045 * go; v.man.body.rotation.x = .1 * go + .02; v.man.body.rotation.z = Math.sin(ph) * .03 * go;
  for (const w of v.wheels) w.rotation.x = wA;
  if (sweep >= 0) { sweep += dt; const T = 1.2; U.uSweepY.value = -.3 + sweep / T * 2.8; U.uSweepA.value = sweep < T ? Math.sin(Math.PI * sweep / T) : 0; if (sweep > T) sweep = -1; } else U.uSweepA.value = 0;
  const dt2 = ready ? (sweep < 0 || sweep > .25 ? 1 : 0) : 0;
  dis = dt2 > dis ? Math.min(1, dis + dt / 1.3) : Math.max(0, dis - dt / .9);
  sat = ready ? Math.min(1, sat + dt / .8) : Math.max(.45, sat - dt / 1.2);
  U.uDis.value = dis; U.uSat.value = sat; v.tarp.visible = dis < .999; U.uTime.value += dt;
}
const frozen = Q.get('t');
if (frozen) { if (ready && Q.has('sweep')) { ready = true; sweep = 0; } for (let t = 0; t < +frozen; t += 1 / 60) step(1 / 60); }
(window as any).__ready = true;
let last = performance.now();
r.setAnimationLoop(() => { const n = performance.now(), dt = Math.min(.05, (n - last) / 1000); last = n; if (!frozen) step(dt); r.render(scene, cam); });
