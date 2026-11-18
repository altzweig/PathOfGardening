// Seasons (18.11.2026): only daytime, but the look follows the month of the wave.
// Drives the shared season uniforms (snow on the ground and on everything facing up, autumn leaves and straw lawn),
// a slight light tint per season and the weather: rain streaks + rain sound, snowflakes, falling leaves, spring petals.
import * as THREE from 'three';
import { PART, V, camera, envU, hemi, moon, rand, scene } from './core';
import { setRain } from '../audio';

/** look per month (index 0 = January): snow cover, autumn colour, spring blossom, summer warmth */
const LOOK: { snow: number; aut: number; spr: number; sum: number }[] = [
  { snow: 1, aut: 0, spr: 0, sum: 0 }, { snow: .85, aut: 0, spr: 0, sum: 0 }, { snow: .15, aut: 0, spr: .3, sum: 0 },
  { snow: 0, aut: 0, spr: 1, sum: 0 }, { snow: 0, aut: 0, spr: .8, sum: .2 }, { snow: 0, aut: 0, spr: .2, sum: .7 },
  { snow: 0, aut: 0, spr: 0, sum: 1 }, { snow: 0, aut: .05, spr: 0, sum: 1 }, { snow: 0, aut: .45, spr: 0, sum: .4 },
  { snow: 0, aut: 1, spr: 0, sum: 0 }, { snow: .1, aut: .8, spr: 0, sum: 0 }, { snow: .7, aut: .25, spr: 0, sum: 0 },
];
const cur = { snow: 0, aut: 0, spr: 0, sum: 0, rain: 0 };
let first = true;

// rain streaks: line segments in a box around the camera target, falling fast
const N = 900, AREA = 15, TOP = 9;
const rPos = new Float32Array(N * 6), rSeed = new Float32Array(N * 3);
const rGeo = new THREE.BufferGeometry(); rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
const rMat = new THREE.LineBasicMaterial({ color: 0xc8d8f0, transparent: true, opacity: 0, depthWrite: false });
const rain = new THREE.LineSegments(rGeo, rMat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
for (let i = 0; i < N; i++) { rSeed[i * 3] = rand(-AREA, AREA); rSeed[i * 3 + 1] = rand(0, TOP); rSeed[i * 3 + 2] = rand(-AREA, AREA); }
const target = new THREE.Vector3(), dir = new THREE.Vector3();
const tint = new THREE.Color(), cool = new THREE.Color(0xdde6ff), warm = new THREE.Color(0xfff0d8), grey = new THREE.Color(0x9aa4b0);

/** month 1..12 (0 = no seasons: summer look), raining 0/1; enabled = false in the weapon test room */
export function updateSeasons(dt: number, month: number, raining: boolean, enabled = true) {
  const L = month ? LOOK[(month - 1) % 12] : LOOK[6], k = first ? 1 : 1 - Math.exp(-Math.min(dt, .1) * 1.1); first = false;
  cur.snow += ((enabled ? L.snow : 0) - cur.snow) * k; cur.aut += ((enabled ? L.aut : 0) - cur.aut) * k;
  cur.spr += ((enabled ? L.spr : 0) - cur.spr) * k; cur.sum += ((enabled ? L.sum : 1) - cur.sum) * k;
  cur.rain += ((enabled && raining ? 1 : 0) - cur.rain) * (1 - Math.exp(-dt * 1.2));
  envU.uSnow.value = cur.snow; envU.uAutumn.value = cur.aut;
  // light: cool and pale in winter, warm in summer, grey and dimmer while it rains
  tint.setRGB(1, 1, 1).lerp(cool, cur.snow * .8).lerp(warm, cur.sum * .6).lerp(grey, cur.rain * .45);
  moon.color.multiply(tint); moon.intensity *= 1 - cur.rain * .35 - cur.snow * .1;
  hemi.intensity *= 1 + cur.snow * .25 - cur.rain * .1;
  (scene.background as THREE.Color).lerp(grey, cur.rain * .5);
  setRain(enabled && raining);
  // camera target on the ground: weather around what you see
  camera.getWorldDirection(dir); const t = dir.y < -.05 ? -camera.position.y / dir.y : 10;
  target.copy(camera.position).addScaledVector(dir, t);
  // rain
  rain.visible = cur.rain > .02; rMat.opacity = cur.rain * .42;
  if (rain.visible) {
    const fall = dt * 15;
    for (let i = 0; i < N; i++) {
      let y = rSeed[i * 3 + 1] - fall; if (y < 0) { y += TOP; rSeed[i * 3] = rand(-AREA, AREA); rSeed[i * 3 + 2] = rand(-AREA, AREA); }
      rSeed[i * 3 + 1] = y;
      const x = target.x + rSeed[i * 3], z = target.z + rSeed[i * 3 + 2];
      rPos.set([x, y, z, x - .03, y + .38, z - .02], i * 6);
    }
    rGeo.attributes.position.needsUpdate = true;
    if (Math.random() < dt * 40 * cur.rain) PART.spawn(V(target.x + rand(-AREA, AREA) * .8, .03, target.z + rand(-AREA, AREA) * .8), V(0, .6, 0), 0x9ab4d8, .07, .25, { g: 4, a: .5 }); // splashes
  }
  // snowflakes in winter
  if (enabled && cur.snow > .3 && Math.random() < dt * 40 * cur.snow)
    for (let i = 0; i < 2; i++) PART.spawn(V(target.x + rand(-AREA, AREA), rand(4, 8), target.z + rand(-AREA, AREA)), V(rand(-.3, .3), rand(-.9, -.6), rand(-.3, .3)), 0xd8e4f4, rand(.05, .09), rand(6, 9), { a: .55 });
  // falling leaves in autumn
  if (enabled && cur.aut > .3 && Math.random() < dt * 10 * cur.aut)
    PART.spawn(V(target.x + rand(-AREA, AREA), rand(3, 6), target.z + rand(-AREA, AREA)), V(rand(.3, .8), rand(-.7, -.4), rand(-.3, .3)), Math.random() < .5 ? 0xd06a18 : 0xb83a14, rand(.08, .12), rand(6, 9), { a: .5 });
  // blossom petals drifting in spring
  if (enabled && cur.spr > .3 && Math.random() < dt * 6 * cur.spr)
    PART.spawn(V(target.x + rand(-AREA, AREA), rand(2, 4), target.z + rand(-AREA, AREA)), V(rand(.3, .7), rand(-.3, -.15), rand(-.2, .2)), 0xffc8dc, rand(.05, .08), rand(6, 9), { a: .45 });
}
/** current smoothed look (e.g. snow on the shed roof) */
export const seasonNow = () => cur;
export function resetSeasons() { first = true; cur.rain = 0; setRain(false, true); }
