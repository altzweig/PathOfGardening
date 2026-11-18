// Network/render snapshot format. The host builds one every frame from the simulation;
// clients receive it at coop.snapshotRate. Arrays keep the JSON small.
import type { Weapon } from '../config';

export interface Intent {
  mx: number; mz: number;           // movement, length <= 1
  ax: number; az: number; aim: boolean; // aim direction (world xz), aim=false -> auto-aim
  fire: Weapon | 'active' | null;   // weapon held down ('active' = the player's selected weapon, PC)
  tapSeq: number; tapW: Weapon | null; // one-shot fire with auto-aim (quick tap on touch)
  cycle: number;                    // increments on every "switch skill" press
}
export const emptyIntent = (): Intent => ({ mx: 0, mz: 0, ax: 0, az: 1, aim: false, fire: null, tapSeq: 0, tapW: null, cycle: 0 });

export interface PSnap {
  id: number; c: number; x: number; z: number; f: number;
  hp: number; mhp: number; al: 0 | 1; st: 0 | 1;
  sw: number; sd: number; wk: number; rs: number; po: number; fl: number; ti: number; rr: number; ra: number;
  xb: 0 | 1; // crossbow (asparagus) in hand
  fo: 0 | 1; fa: number; fc: number; fw: number; fr: number; // flamethrower: burning, angle (rad), cone deg, sweep deg (360 = spinning), range m
  lw: 0 | 1; // lemon wand equipped
  aw?: number; // active weapon (WEAPONS index): held model for the shotgun / cabbage
  rh: 0 | 1; // rake in the hand (hidden while another weapon is held)
  cw: number; // combo weapon in the hand (COMBOS index), -1 none
  ch?: number; // charge of a held throw 0..1 (cabbage & thrown combos), -1 none
  wa?: number | null; // watering can: pour angle (rad) while watering, null otherwise
}
/** level-up card. hint: short explanation under upgrade values; wp: weapon unlock card (big, glowing), its lines are stat chips, fx: special effect */
export interface Offer { key: string; cat: 'skill' | 'field' | 'plant' | 'misc'; pic: string; title: string; lines: string[]; hint?: string; wp?: string; fx?: string; combo?: string }
export interface Priv {
  am: number[]; ln: number[]; nd: number[]; co: number[]; cd: number[]; cs: number[]; rg: number[]; ac: number; rk: number; rr: number;
  sl: number[]; // learned weapons in learn order (SKILLS index)
  of: Offer[] | null; pk: 0 | 1; pc: number; // pc: fruit type index the player is placing, -1 none
  nu: number; // collected nuts
  cb: number[]; // per weapon (SKILLS order): combo it became (COMBOS index), -1 none
}
// enemy: [id, type, x, z, face, hpFrac, shieldFrac, flags, carry, aux, aux2]
export type ESnap = [number, number, number, number, number, number, number, number, string, number, number];
// fruit: [id, type, tier, x, y, z]
export type FSnap = [number, number, number, number, number, number];
// projectile: [id, kind (PK index: asp, cran, combo kinds), x, y, z, angle, widthScale]
export type JSnap = [number, number, number, number, number, number, number];
// bomb: [id, x, y, z, mini, pulse, kind (BK index), fuse progress 0..1, split generation]
export type BSnap = [number, number, number, number, number, number, number, number, number];
// lying cranberry (missed pellet): [id, x, z, fuse progress 0..1, height while scattered, burning]
export type MSnap = [number, number, number, number, number, number];
// field: [slot, type, hpFrac, alive, shake, rarity, rarityProgress, edge, edgeProgress, tilled]
// pool: [id, x, z, radius, lifeFrac]
export type PuSnap = [number, number, number, number, number, number]; // + burning (Kimchi)
/** slot, type, hp, alive, shake, rarity, prog, edge, edge progress, tilled, fruit per second, wetness 0..100, plant look (-1 wilted, 0 seedlings .. 1 grown) */
export type FiSnap = [number, number, number, number, number, number, number, number, number, number, number, number, number];

export const EF = { stun: 1, bleed: 2, flash: 4, air: 8, windup: 16, charge: 32, tongue: 64, bar: 128, flee: 256, lunge: 512, elite: 1024, boss: 2048, burn: 4096, shock: 8192, leave: 16384, poison: 32768 } as const;

export type Ev = { k: string; [key: string]: any };

export interface Snap {
  t: number; ph: 'play' | 'lvl' | 'over'; ts: number; lr: number; wv: number; wn: number; dh: number; dc: number; // dh: hour of the day-night cycle (0..dc)
  wp: 0 | 1; won: 0 | 1; mo?: number; rn?: 0 | 1; lh?: number; lk?: number; // mo: month 1..12 (0 = no seasons), rn: raining, lh: shed HP share (-1 = no shed), lk: shed shake
  wt?: number; // wt: s left of the wave countdown (fight) or of the pause (wp)
  lv: number; xp: number; nx: number; ki: number; cx: number; n: number; // ts: slow-motion ramp into/out of a pause 0..1
  pl: PSnap[]; en: ESnap[]; fr: FSnap[]; pj: JSnap[]; bo: BSnap[]; mi: MSnap[]; fi: FiSnap[]; pu: PuSnap[];
  bb: number[][]; // boss berry bombs: [id, x, y, z, armed, frac, rain, radius]
  bs: number;     // boss HP fraction, -1 = no boss
  sn?: number[][]; // Shockgun berries on the ground: [id, x, z, ticks left 0..1]
  br?: number[];  // per fruit type: fruit per second of a common field without neighbours
  me: Record<number, Priv>;
  ev: Ev[];
}
