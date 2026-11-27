// Network/render snapshot format. The host builds one every frame from the simulation;
// clients receive it at coop.snapshotRate. Arrays keep the JSON small.
import type { Weapon } from '../config';

export interface Intent {
  mx: number; mz: number;           // movement, length <= 1
  ax: number; az: number; aim: boolean; // aim direction (world xz), aim=false -> where the player looks (27.11.2026: no auto-aim)
  fire: Weapon | 'active' | 'prim' | 'sec' | null; // weapon held down ('active' = selected weapon (touch); PC 24.11.2026: 'prim' = left click, 'sec' = right click)
  tapSeq: number; tapW: Weapon | null; // one shot where the player looks (quick tap on touch)
  cycle: number;                    // increments on every "switch skill" press
  berry?: number;                   // increments on every "switch berry" press (shotgun ammo, 23.11.2026)
  /** PC 10-slot bar (24.11.2026): pick = counter per slot key press, pickS = that slot 0..9; cycP / cycS = next primary / secondary (Q / E) */
  pick?: number; pickS?: number; cycP?: number; cycS?: number;
  sprint?: boolean;                 // Shift held (24.11.2026)
}
export const emptyIntent = (): Intent => ({ mx: 0, mz: 0, ax: 0, az: 1, aim: false, fire: null, tapSeq: 0, tapW: null, cycle: 0, berry: 0 });

export interface PSnap {
  id: number; c: number; x: number; z: number; f: number;
  /** shotgun berry (index in BERRIES, 23.11.2026) */ be?: number;
  hp: number; mhp: number; al: 0 | 1; st: 0 | 1;
  /** 24.11.2026: stamina 0..1, drained (locked), energy shield HP and its max */ sa?: number; sx?: 0 | 1; sh?: number; ms?: number;
  sw: number; sd: number; wk: number; rs: number; po: number; fl: number; ti: number; rr: number; ra: number;
  xb: 0 | 1; // crossbow (asparagus) in hand
  fo: 0 | 1; fa: number; fc: number; fw: number; fr: number; // flamethrower: burning, angle (rad), cone deg, sweep deg (360 = spinning), range m
  lw: 0 | 1; // lemon wand equipped
  aw?: number; // active weapon (WEAPONS index): held model for the shotgun / cabbage
  sp?: number; // Mehlsack / Bratpfanne spin progress 0..1 (0 = not spinning)
  sk?: number; // spin kind: 0 Mehlsack, 1 Spiegeleischleuder (fast turn, abrupt stop)
  dk?: number; // weapon 0 = on the back .. 1 = in the hand (24.11.2026), absent = 0
  rh: 0 | 1; // rake in the hand (hidden while another weapon is held)
  cw: number; // combo weapon in the hand (COMBOS index), -1 none
  ch?: number; // charge of a held throw 0..1 (cabbage & thrown combos), -1 none
  ht?: number; // Körner-MP heat 0..1 (+2 while overheated), absent when cold
  /** 25.11.2026 Werkbank: 1 = hammering at the bench right now (hammer animation + grey dust), 2 = working at the chest (26.11.2026), absent = no */
  bw?: 0 | 1 | 2;
}
/** level-up card. hint: short explanation under upgrade values; wp: weapon unlock card (big, glowing), its lines are stat chips, fx: special effect */
export interface Offer { key: string; cat: 'skill' | 'field' | 'plant' | 'misc'; pic: string; title: string; lines: string[]; hint?: string; wp?: string; fx?: string; combo?: string;
  /** Werkstatt (23.11.2026): heading (upgrade name), price in ideas, bought, golden idea, double upgrade */
  hd?: string; cost?: number; sold?: 0 | 1; gold?: 0 | 1; x2?: 0 | 1 }
export interface Priv {
  am: number[]; ln: number[]; nd: number[]; co: number[]; cd: number[]; cs: number[]; rg: number[]; ac: number; rk: number; rr: number;
  sl: number[]; // learned weapons in learn order (SKILLS index)
  /** 10-slot bar (24.11.2026): SKILLS index per slot (-1 empty), slots 0-4 primary, 5-9 secondary; pa / sa = selected primary / secondary (WEAPONS index) */
  gs?: number[]; pa?: number; sa?: number;
  of: Offer[] | null; pk: 0 | 1; pc: number; // pc: fruit type index the player is placing, -1 none
  pm: 0 | 1 | 2; // place mode: 0 new tile, 1 upgrade (+1 onto a tile of the same type), 2 hex field (either, 23.11.2026)
  iv: number[]; // bag per FRUITS index (wheat and products)
  nu: number; // collected nuts
  cb: number[]; // per weapon (SKILLS order): combo it became (COMBOS index), -1 none
  /** Werkstatt (23.11.2026): ideas (light bulbs), the bench of this pause, open; ps: slots the hex field being placed may go on */
  id?: number; sh?: Offer[] | null; so?: 0 | 1; ps?: number[];
  /** Händler reroll: price of the next one, rerolls so far this visit (24.11.2026) */ rc?: number; rn?: number;
  /** 25.11.2026 Werkbank UI of this player: 0 closed, 1 techtree panel (choose the next idea), 2 pickup popup of the finished idea (+ panel below) */
  ro?: 0 | 1 | 2;
  /** 26.11.2026 placing a Myzelle (top-down view, ps = crop fields with room) */
  my?: 0 | 1;
}
// enemy: [id, type, x, z, face, hpFrac, shieldFrac, flags, carry, aux, aux2]
export type ESnap = [number, number, number, number, number, number, number, number, string, number, number];
// fruit: [id, type, tier, x, y, z]
export type FSnap = [number, number, number, number, number, number] | [number, number, number, number, number, number, number] | [number, number, number, number, number, number, number, number]; // [7]: juice bottle of berry n // [6] = 1: egg in the pyramid at the hens
// projectile: [id, kind (PK index: asp, cran, combo kinds), x, y, z, angle, widthScale]
export type JSnap = [number, number, number, number, number, number, number];
// bomb: [id, x, y, z, mini, pulse, kind (BK index), fuse progress 0..1, split generation]
export type BSnap = [number, number, number, number, number, number, number, number, number, number?, number?]; // [9] 1 = cabbage contact mine, [10] its s left before it rots away
// lying cranberry (missed pellet): [id, x, z, fuse progress 0..1, height while scattered, burning]
export type MSnap = [number, number, number, number, number, number];
// field: [slot, type, hpFrac, alive, shake, rarity, rarityProgress, edge, edgeProgress, tilled]
// pool: [id, x, z, radius, lifeFrac]
export type PuSnap = [number, number, number, number, number, number]; // + burning (Kimchi)
/** slot, type, hp, alive, shake, rarity, prog, edge, edge progress, tilled, fruit per second */
/** + flags (1 broken, 2 working), input stock of a building "typeIndex:n,..." */
export type FiSnap = [number, number, number, number, number, number, number, number, number, number, number, number, string, number?, number?]; // [14] Myzellen (26.11.2026) // [13] crop cycle: 0..1 being harvested, 1..2 growing back

export const EF = { stun: 1, bleed: 2, flash: 4, air: 8, windup: 16, charge: 32, tongue: 64, bar: 128, flee: 256, lunge: 512, elite: 1024, boss: 2048, burn: 4096, shock: 8192, leave: 16384, poison: 32768, frozen: 65536, thorn: 131072, sulfur: 262144 } as const;

export type Ev = { k: string; [key: string]: any };

export interface Snap {
  t: number; ph: 'play' | 'lvl' | 'over'; ts: number; lr: number; wv: number; wn: number; dh: number; dc: number; // dh: hour of the day-night cycle (0..dc)
  /** Lager-Truhe: raccoons stealing right now (undefined = no chest) */ ch?: number;
  wp: 0 | 1; won: 0 | 1; wt?: number; // wt: s left of the wave countdown (fight) or of the pause (wp)
  lv: number; xp: number; nx: number; ki: number; cx: number; n: number; /** Brunnen: crop bonus now, unlocked */ wb?: number; wo?: 0 | 1; /** Saftpresse: per berry (BERRIES order) bar fill 0..1 and fills so far */ jc?: number[]; // ts: slow-motion ramp into/out of a pause 0..1
  pl: PSnap[]; en: ESnap[]; fr: FSnap[]; pj: JSnap[]; bo: BSnap[]; /** Spiegeleier: [id, x, y, z, landed, left 0..1, outward angle, lure radius, eaters] */ eg?: number[][]; /** flour clouds: [id, x, z, r, age, life, ignAge (-1 unlit), ix, iz] */ cl?: number[][]; mi: MSnap[]; fi: FiSnap[]; pu: PuSnap[];
  bb: number[][]; // boss berry bombs: [id, x, y, z, armed, frac, rain, radius]
  bs: number;     // boss HP fraction, -1 = no boss
  sn?: number[][]; // Shockgun berries on the ground: [id, x, z, ticks left 0..1]
  br?: number[];  // per fruit type: fruit per second of a common field without neighbours
  /** Händler (24.11.2026): [x, z, face, state 0 coming / 1 ready / 2 turning / 3 leaving, s in this state, s of ready time left] */
  mc?: number[];
  me: Record<number, Priv>;
  ev: Ev[];
  // ---- 25.11.2026 Werkbank-Techtree + Steinkohle (appended; node index = position in cfg.research.nodes) ----
  /** research: [cur node index (-1 none), ready 0/1, Forschungstempo level, researched ideas (cost exponent), cost s of the next idea now, player id with the pickup popup open (-1 none)] */
  rs?: number[];
  /** per node: 1 = researched (start nodes included; Forschungstempo stays 0, its level is rs[2]) */
  rd?: number[];
  /** per node: progress 0..1 towards the current cost (work kept per node when switching) */
  rp?: number[];
  /** hex slot index of the Werkbank (slotPositions order), -1 none */
  bn?: number;
  /** Steinkohle posts: [id, x, z, hp, maxHp], oldest first; posts closer than skills.wall.linkDist are connected (the view draws the links) */
  wl?: number[][];
  /** 26.11.2026 Mehlsäcke stacks: [id, midpoint x, z, angle of the edge line (atan2 dx, dz), hp, maxHp], oldest first; a stack is a field side long */
  sk?: number[][];
  /** 26.11.2026 trees found by the seed search (research.trees index); rs[6] = tree of the next search (-1 none left), rs[7] its progress 0..1 */
  rt?: number[];
  /** chest [hp, maxHp] (animals attack it, 0 = lost) */
  cv?: number[];
  /** Myzel-XP orbs: [id, x, y, z] */
  xo?: number[][];
  /** Feld-Upgrade level per FRUITS index; Myzellen still to be placed */
  fu?: number[]; mp?: number;
}
