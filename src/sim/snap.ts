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
  sw: number; sd: number; wk: number; rs: number; po: number; fl: number; ti: number; rr: number;
}
export interface Offer { key: string; cat: 'skill' | 'field' | 'plant' | 'misc'; pic: string; title: string; lines: string[] }
export interface Priv {
  am: number[]; ln: number[]; nd: number[]; co: number[]; cd: number[]; cs: number[]; rg: number[]; ac: number; rk: number; rr: number;
  of: Offer[] | null; pk: 0 | 1; pc: number; // pc: fruit type index the player is placing, -1 none
}
// enemy: [id, type, x, z, face, hpFrac, shieldFrac, flags, carry, aux, aux2]
export type ESnap = [number, number, number, number, number, number, number, number, string, number, number];
// fruit: [id, type, tier, x, y, z]
export type FSnap = [number, number, number, number, number, number];
// projectile: [id, kind(0 asp,1 cran), x, y, z, angle, widthScale]
export type JSnap = [number, number, number, number, number, number, number];
// bomb: [id, x, y, z, mini, pulse]
export type BSnap = [number, number, number, number, number, number];
// mine: [id, x, z]
export type MSnap = [number, number, number];
// field: [slot, type, hpFrac, alive, shake, rarity, rarityProgress, edge, edgeProgress, tilled]
// pool: [id, x, z, radius, lifeFrac]
export type PuSnap = [number, number, number, number, number];
export type FiSnap = [number, number, number, number, number, number, number, number, number, number];

export const EF = { stun: 1, bleed: 2, flash: 4, air: 8, windup: 16, charge: 32, tongue: 64, bar: 128, flee: 256, lunge: 512 } as const;

export type Ev = { k: string; [key: string]: any };

export interface Snap {
  t: number; ph: 'play' | 'lvl' | 'over'; lr: number; wv: number; wn: number; wp: 0 | 1; won: 0 | 1;
  lv: number; xp: number; nx: number; ki: number; cx: number; n: number;
  pl: PSnap[]; en: ESnap[]; fr: FSnap[]; pj: JSnap[]; bo: BSnap[]; mi: MSnap[]; fi: FiSnap[]; pu: PuSnap[];
  me: Record<number, Priv>;
  ev: Ev[];
}
