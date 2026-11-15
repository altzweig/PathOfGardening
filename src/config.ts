import YAML from 'yaml';

export type SkillId = 'asp' | 'cran' | 'cab';
export type Weapon = 'rake' | SkillId;
export type FruitType = 'blue' | 'asp' | 'cran' | 'cab';
export type EnemyType = 'raccoon' | 'panda' | 'toad' | 'sheep';
export const SKILLS: SkillId[] = ['asp', 'cran', 'cab'];
export const WEAPONS: Weapon[] = ['rake', 'asp', 'cran', 'cab'];
export const FRUITS: FruitType[] = ['blue', 'asp', 'cran', 'cab'];
export const ENEMIES: EnemyType[] = ['raccoon', 'panda', 'toad', 'sheep'];

interface Lim { step: number; max?: number; maxLevel?: number }
export interface EnemyCfg {
  hp: number; speed: number; radius: number;
  steals?: FruitType[]; carryMax?: number; fleeSpeed?: number;
  hopPeriod?: number; tongueCooldown?: number; tongueRange?: number; poisonTicks?: number; poisonInterval?: number; poisonDamage?: number;
  shield?: number; shieldRegen?: number; chargeRange?: number; windup?: number; chargeSpeed?: number; chargeTime?: number;
  ramDamage?: number; ramStun?: number; knockback?: number; rest?: number;
}
export interface Balancing {
  names: { skills: Record<Weapon, string>; plants: Record<FruitType, string>; fields: Record<FruitType, string>; tea: string };
  player: { hp: number; speed: number; respawnBase: number; respawnPerDeath: number; pickupRadius: number; pickupPerTier: number; magnetRadius: number; magnetSpeed: number };
  coop: { maxPlayers: number; xpNeedExponent: number; enemyCountExponent: number; enemyHpExponent: number; xpYieldExponent: number; xpValueExponent: number; enemyDamageExponent: number; snapshotRate: number };
  xp: { base: number; growth: number; linear: number };
  arena: { radius: number; fieldSize: number; fieldSlots: number; startFields: number };
  fields: { hp: number; healPerSecond: number; rarityNames: string[]; rarityCost: number[]; rarityProduction: number; neighborBonus: number };
  fruit: { tierScale: number[]; tierValue: number[]; mergeCount: number; mergeCheck: number; throwMin: number; throwMax: number };
  plants: Record<FruitType, { interval: number; unlockAt?: number }>;
  rake: { damage: number; range: number; arc: number; cooldown: number; swingTime: number };
  skills: {
    readySeconds: number;
    asp: { damage: number; range: number; cooldown: number; ammoPerShot: number; speed: number; pierce: number; pierceFactor: number };
    cran: { damage: number; range: number; cooldown: number; ammoPerShot: number; pellets: number; spread: number; bleedDuration: number; bleedDps: number; mineLifetime: number };
    cab: { damage: number; radius: number; cooldown: number; ammoPerShot: number; throwDistance: number; fuse: number; poolDuration: number; poolTicksPerSecond: number; poolTickDamage: number; poolSlow: number; miniRadiusFactor: number; miniDamageFactor: number };
  };
  upgrades: {
    offersPerLevel: number; damagePerLevel: number; rangePerLevel: number; cooldownPerLevel: number;
    aspPierce: Lim; aspPierceBonus: Lim; cranPellets: Lim; cranMine: Lim; cabMini: Lim; doubleHarvest: Lim;
    newFieldWeight: number; fieldCardPause: number; repeatWeight: number; herbalTea: { playerHeal: number; fieldHeal: number };
  };
  enemies: { aggroRadius: number; maxAlive: number; meleeDamage: number; meleeInterval: number } & Record<EnemyType, EnemyCfg>;
  waves: {
    firstWave: number; gapStart: number; gapEnd: number; gapJitter: number; rampTime: number;
    sizeStart: number; sizePerMinute: number; sizeMax: number;
    directionsStart: number; directionsMax: number; directionEvery: number; directionSpread: number;
    staggerMin: number; staggerMax: number; warnTime: number;
    types: Record<EnemyType, { from: number; weight: number; early?: number }>;
  };
}

export async function loadBalancing(): Promise<Balancing> {
  const res = await fetch('./design/balancing.yaml', { cache: 'no-store' });
  if (!res.ok) throw new Error('balancing.yaml: HTTP ' + res.status);
  return YAML.parse(await res.text()) as Balancing;
}

/** Koop-Faktor: Spielerzahl ^ Exponent */
export const coopF = (n: number, exp: number) => Math.pow(Math.max(1, n), exp);

/** sound mapping (Game Design & Balancing/sounds.yaml); missing file = game stays silent for samples */
export async function loadSounds(): Promise<any> {
  try { const res = await fetch('./design/sounds.yaml', { cache: 'no-store' }); return res.ok ? YAML.parse(await res.text()) : null; } catch { return null; }
}
