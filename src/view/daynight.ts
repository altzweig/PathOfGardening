// Day-night cycle: one wave = one hour. Hours 0..16 are day (sun wanders east -> west), 16..24 night (moon).
// Drives the main light, sky/haze, fog, exposure, bloom, colour grade, garden lights, torches, bush eyes and ambience.
import * as THREE from 'three';
import { bloom, camera, envU, gardenLight, hemi, lantern, moon, renderer, scene, torch } from './core';
import { setEyeNight, setFogLook, setTorchLevel } from '../farm/view/hofWorld';
import { setDayNight } from '../audio';
/** the point the camera looks at (set by the view each frame); the fog is measured from the camera to it */
export const fogFocus = { x: 0, z: 0 };
const _fc = new THREE.Vector3();

const C = (h: number) => new THREE.Color(h);
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// palette: night / warm sunrise-sunset / day
const P = {
  sky:    { n: C(0x060910), w: C(0x8a6a74), d: C(0x9fc2c9) },
  hemiS:  { n: C(0x6f92e0), w: C(0xffc3a0), d: C(0xc4dcff) },
  hemiG:  { n: C(0x140f08), w: C(0x3a2a1a), d: C(0x4d4028) },
  light:  { n: C(0x8fb2ff), w: C(0xffa868), d: C(0xffe6c0) }, // 22.11.2026: warmer sun by day (was 0xffeccb)
  fog:    { n: C(0x8aa0c8), w: C(0xf0c8b8), d: C(0xdcefee) },
  zenith: { n: C(0x020409), w: C(0x6b6f9c), d: C(0x5c93c9) },
};
// sky with a gradient (look analysis 22.11.2026): a half dome around the camera, horizon = the sky/fog colour (scene.background),
// deeper blue overhead, a soft warm glow around the sun. Drawn first, behind everything (no depth test), no fog.
/** colour overhead (rain greys it in seasons.ts like the background) */
export const skyZenith = new THREE.Color();
const skyU = { uHor: { value: scene.background as THREE.Color }, uZen: { value: skyZenith }, uSun: envU.uSun, uGlow: { value: new THREE.Color() } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * .56), new THREE.ShaderMaterial({
  uniforms: skyU, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.); gl_Position=p.xyww; }`,
  fragmentShader: `uniform vec3 uHor; uniform vec3 uZen; uniform vec3 uSun; uniform vec3 uGlow; varying vec3 vDir;
    void main(){ vec3 d=normalize(vDir); float t=smoothstep(.0,.55,d.y);
      vec3 c=mix(uHor,uZen,t*t*(3.-2.*t));
      float s=max(dot(d,normalize(uSun)),0.); c+=uGlow*(pow(s,6.)*.6+pow(s,48.)*.8)*(1.-t*.6);
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.frustumCulled = false; sky.renderOrder = -1e9; sky.name = 'sky';
sky.onBeforeRender = () => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
scene.add(sky);
const tmp = new THREE.Color(), cL = new THREE.Color(), cS = new THREE.Color(), cG = new THREE.Color(), cSky = new THREE.Color(), cF = new THREE.Color();
function pick(o: { n: THREE.Color; w: THREE.Color; d: THREE.Color }, day: number, warm: number, out = tmp) {
  return out.copy(o.n).lerp(o.d, day).lerp(o.w, warm * (.45 + .3 * day));
}

export interface DayState { h: number; day: number; warm: number }
/** cycle hour h (0..len, len = day + night hours) -> day share, sunrise/sunset warmth */
export function dayState(h: number, dayH = 16, len = 24): DayState {
  const c = ((h % len) + len) % len, duskA = dayH - .4, duskB = dayH + .6, dawnA = len - .8;
  const day = c < duskA ? 1 : c < duskB ? 1 - sm(duskA, duskB, c) : c < dawnA ? 0 : sm(dawnA, len, c);
  const dist = Math.min(Math.abs(c - (dayH + .1)), Math.abs(c - (len - .3)), c + .3); // distance to sunset / sunrise
  return { h: c, day, warm: 1 - sm(0, 2.6, dist) };
}

let cur = -1, curLen = 24, curDayH = 16;
const forced = (() => { const v = new URLSearchParams(location.search).get('h'); return v === null ? null : +v; })(); // ?h=20 shows that hour (for screenshots)
const sunPos = new THREE.Vector3();
/** target: hour from the snapshot; smoothed here so wave ends never jump */
/** bloom at night + the real light of the house door lamp (balancing.yaml nachtlicht); the VFX lab keeps the old values */
export const NIGHT_BLOOM = { strength: 1.15, threshold: .72, houseLamp: 22 };
export function updateDayNight(dt: number, target: number, len = 24, dayH = 16) {
  if (forced !== null && !Number.isNaN(forced)) target = forced;
  curLen = len || 24; curDayH = len ? dayH : 16;
  if (cur < 0) cur = target;
  let d = target - cur; if (d < -curLen / 2) d += curLen; if (d > curLen / 2) d -= curLen;
  cur = (cur + d * (1 - Math.exp(-dt * 1.5)) + curLen) % curLen;
  apply(dayState(cur, curDayH, curLen));
}
export function resetDayNight() { cur = -1; }

function apply(S: DayState) {
  const { h, day, warm } = S, night = 1 - day;
  // main light: sun by day (low east -> high -> low west), moon by night on the same path; swap at the darkest moment
  const sunS = Math.min(1, Math.max(0, (((h + 1) % curLen) / (curDayH + 1.6)))), moonS = Math.min(1, Math.max(0, (h - curDayH) / (curLen - curDayH)));
  const useSun = day >= .5, s = useSun ? sunS : moonS, a = Math.PI * s;
  sunPos.set(Math.cos(a) * 15, useSun ? 3 + Math.sin(a) * 19 : 9 + Math.sin(a) * 10, 7);
  moon.position.copy(sunPos); moon.target.position.set(0, 0, 0);
  const elev = Math.sin(a), dip = Math.abs(day * 2 - 1); // dip: light fades out and in while the sun hands over to the moon
  moon.color.copy(pick(P.light, day, warm, cL));
  moon.intensity = (night * 2.1 + day * (2.2 + 1.8 * elev)) * (.3 + .7 * dip); // 21.11.2026: brighter, cool moonlight for the night attacks
  envU.uSun.value.copy(sunPos).normalize();
  // ambient sky light
  hemi.color.copy(pick(P.hemiS, day, warm, cS)); hemi.groundColor.copy(pick(P.hemiG, day, warm, cG));
  hemi.intensity = .78 * night + 1.25 * day;
  // sky + haze
  const sky = pick(P.sky, day, warm, cSky);
  (scene.background as THREE.Color).copy(sky);
  pick(P.zenith, day, warm, skyZenith);
  skyU.uGlow.value.copy(pick(P.light, day, warm, cG)).multiplyScalar(day * (.35 + warm * .9) * (useSun ? 1 : 0));
  // light distance fog only: starts behind the player (relative to the camera distance, so zooming out does not fog the view)
  // and only softens the far forest; never a uniform veil over the garden
  const fog = scene.fog as THREE.Fog, cd = camera.position.distanceTo(_fc.set(fogFocus.x, 0, fogFocus.z)); // distance camera <-> what it looks at (performance plan 1.5)
  fog.color.copy(sky); fog.near = cd + 2; fog.far = cd + (night * 26 + day * 48) * (1 - warm * .15);
  envU.uFogCol.value.copy(sky); envU.uFogNear.value = fog.near; envU.uFogFar.value = fog.far;
  // nothing beyond the fog is drawn: the far plane follows it (performance plan 1.5)
  const far = Math.max(40, fog.far + 4); if (Math.abs(camera.far - far) > 1) { camera.far = far; camera.updateProjectionMatrix(); }
  envU.uDay.value = day;
  renderer.toneMappingExposure = 1.05 * night + 1.22 * day;
  // bloom: gentle in daylight (otherwise sunlit surfaces would bloom); at night NIGHT_BLOOM (22.11.2026: much softer, the lanterns light the yard)
  bloom.strength = NIGHT_BLOOM.strength * night + .5 * day; bloom.threshold = NIGHT_BLOOM.threshold * night + .9 * day;
  // man-made lights only matter in the dark
  const dark = Math.max(night, warm * .4);
  lantern.intensity = NIGHT_BLOOM.houseLamp * dark; torch.intensity = 3.5 * dark; gardenLight.intensity = 80 * night;
  setTorchLevel(dark); setEyeNight(night);
  // drifting fog: thick and blue at night, morning mist at sunrise, thin haze by day
  const dawn = h > curLen - 2 || h < 1.5 ? warm : 0;
  setFogLook(pick(P.fog, day, warm, cF), night * 1.3 + day * .25 + dawn * .9, Math.max(night, warm * .5));
  setDayNight(day);
}
/** current (smoothed) day state, e.g. fireflies at night, pollen by day */
export const dayNow = () => dayState(cur < 0 ? 0 : cur, curDayH, curLen);
