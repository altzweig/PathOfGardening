// Cutscene "Ohnmacht" (Basti 21.11.2026), shown every time the player faints: first-person view lying on the ground. The eyes
// open, everything is blurred, only the warm lights of the house shine through; the view becomes sharp, the head turns to a
// trampled field, then sinks sideways to the ground as if the farmer lies on the side, 1 s fade to black -> evening in the house.
import type { Cutscene, CutKey, Vec3 } from './cutscene';
import { sfx } from '../../audio';

export interface FaintAnchors {
  /** where the farmer lies (ground point) */
  at: { x: number; z: number };
  /** a lit window of the house (world point) */
  light: Vec3;
  /** the trampled field the head turns to (centre, ground) */
  field: { x: number; z: number };
}

/** the farmer lies a few metres from the field, the house in front of the eyes */
export function faintCutscene(A: FaintAnchors): Cutscene {
  const { at, light, field } = A;
  const eye = (y: number, dx = 0, dz = 0): Vec3 => ({ x: at.x + dx, y, z: at.z + dz });
  // little sideways offsets of the head, so the camera never sits exactly on the axis it looks along
  const tx = field.x - at.x, tz = field.z - at.z, l = Math.hypot(tx, tz) || 1, fx = tx / l, fz = tz / l;
  const side = { x: -fz, z: fx };
  // the house light, a bit above the window so it sits in the upper half of the picture while lying
  const lamp = { x: light.x, y: light.y + .6, z: light.z };
  const ground = (k: number, y = 0): Vec3 => ({ x: at.x + tx * k, y, z: at.z + tz * k });
  const keys: CutKey[] = [
    // eyes closed, lying on the side (head tilted), looking towards the house
    { t: 0, pos: eye(.2), look: lamp, roll: -.62, fov: 46, eye: 0, blur: 22, black: 1 },
    { t: .9, black: 0, ease: 'linear' },
    // the eyelids flutter: a first blurred glimpse of the lights, closed again, then open
    { t: 1.5, eye: .45, ease: 'out' },
    { t: 1.95, eye: .1 },
    { t: 2.7, eye: .55, blur: 17, ease: 'out' },
    { t: 3.05, eye: .4 },
    { t: 3.9, pos: eye(.22, side.x * .04, side.z * .04), look: { ...lamp, y: lamp.y - .15 }, roll: -.55, eye: 1, blur: 12 },
    // the picture becomes sharp, the head lifts a little
    { t: 5.4, pos: eye(.3, side.x * .06, side.z * .06), look: { ...lamp, y: lamp.y - .35 }, roll: -.24, blur: 0, ease: 'out' },
    { t: 6.0, look: { ...lamp, y: lamp.y - .4 }, roll: -.2 },
    // still first person: the head turns to the trampled field
    { t: 7.9, pos: eye(.42), look: ground(1, .05), roll: -.06, fov: 44 },
    { t: 9.0, pos: eye(.4, fx * .05, fz * .05), look: ground(.95, .02), roll: -.04 },
    // and sinks sideways to the ground: lying on the side, the field tilted in the picture
    { t: 10.0, pos: eye(.13, side.x * .12, side.z * .12), look: ground(.8, .25), roll: 1.32, eye: .85, blur: 2, ease: 'in' },
    { t: 10.4, eye: .6, blur: 4 },
    // 1 s fade to black
    { t: 10.45, black: 0 },
    { t: 11.45, black: 1, eye: .2, ease: 'linear' },
  ];
  return {
    name: 'ohnmacht',
    keys,
    cues: [
      { t: .2, run: () => sfx('cutscene.heartbeat') },
      { t: 1.4, run: () => sfx('cutscene.heartbeat') },
      { t: 2.6, run: () => sfx('cutscene.breath') },
      { t: 3.0, run: () => sfx('cutscene.heartbeat') },
      { t: 5.0, run: () => sfx('cutscene.heartbeat') },
      { t: 7.4, run: () => sfx('raccoon.laugh', field.x + 6, field.z + 6) },
      { t: 9.9, run: () => sfx('cutscene.fall') },
    ],
  };
}
