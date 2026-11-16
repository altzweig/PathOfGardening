// Day-night cycle: one wave = one hour. Hours 0..16 are day (sun wanders east -> west), 16..24 night (moon).
// Drives the main light, sky/haze, fog, exposure, bloom, colour grade, garden lights, torches, bush eyes and ambience.
import * as THREE from 'three';
import { bloom, envU, gardenLight, hemi, lantern, moon, renderer, scene, torch } from './core';
import { setEyeNight, setFogLook, setTorchLevel } from './world';
import { setDayNight } from '../audio';

const C = (h: number) => new THREE.Color(h);
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// palette: night / warm sunrise-sunset / day
const P = {
  sky:    { n: C(0x060910), w: C(0x8a6a74), d: C(0xa9c6d8) },
  hemiS:  { n: C(0x7b95c8), w: C(0xffc3a0), d: C(0xc4dcff) },
  hemiG:  { n: C(0x140f08), w: C(0x3a2a1a), d: C(0x4d4028) },
  light:  { n: C(0x9db6ff), w: C(0xffa868), d: C(0xffeccb) },
  fog:    { n: C(0x8aa0c8), w: C(0xf0c8b8), d: C(0xeef3f6) },
};
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
  moon.intensity = (night * 1.45 + day * (2.2 + 1.8 * elev)) * (.3 + .7 * dip);
  envU.uSun.value.copy(sunPos).normalize();
  // ambient sky light
  hemi.color.copy(pick(P.hemiS, day, warm, cS)); hemi.groundColor.copy(pick(P.hemiG, day, warm, cG));
  hemi.intensity = .62 * night + 1.25 * day;
  // sky + haze
  const sky = pick(P.sky, day, warm, cSky);
  (scene.background as THREE.Color).copy(sky);
  const fog = scene.fog as THREE.FogExp2; fog.color.copy(sky); fog.density = .028 * night + .016 * day + warm * .006;
  envU.uFogCol.value.copy(sky); envU.uFogD.value = fog.density;
  envU.uDay.value = day;
  renderer.toneMappingExposure = 1.05 * night + 1.22 * day;
  // bloom: strong glow in the dark, gentle in daylight (otherwise sunlit surfaces would bloom)
  bloom.strength = 1.15 * night + .5 * day; bloom.threshold = .72 * night + .9 * day;
  // man-made lights only matter in the dark
  const dark = Math.max(night, warm * .4);
  lantern.intensity = 22 * dark; torch.intensity = 3.5 * dark; gardenLight.intensity = 80 * night;
  setTorchLevel(dark); setEyeNight(night);
  // drifting fog: thick and blue at night, morning mist at sunrise, thin haze by day
  const dawn = h > curLen - 2 || h < 1.5 ? warm : 0;
  setFogLook(pick(P.fog, day, warm, cF), night * 1 + day * .25 + dawn * .9);
  setDayNight(day);
}
/** current (smoothed) day state, e.g. fireflies at night, pollen by day */
export const dayNow = () => dayState(cur < 0 ? 0 : cur, curDayH, curLen);
