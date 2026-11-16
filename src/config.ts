import YAML from 'yaml';

export type SkillId = 'asp' | 'cran' | 'cab' | 'lemon';
export type Weapon = 'rake' | SkillId;
export type FruitType = 'blue' | 'asp' | 'cran' | 'cab' | 'lemon';
export type EnemyType = 'raccoon' | 'panda' | 'toad' | 'sheep';
export const SKILLS: SkillId[] = ['asp', 'cran', 'cab', 'lemon'];
export const WEAPONS: Weapon[] = ['rake', 'asp', 'cran', 'cab', 'lemon'];
export const FRUITS: FruitType[] = ['blue', 'asp', 'cran', 'cab', 'lemon'];
export const ENEMIES: EnemyType[] = ['raccoon', 'panda', 'toad', 'sheep'];

interface Lim { step: number; max?: number; maxLevel?: number }
export interface EnemyCfg {
  hp: number; speed: number; radius: number;
  steals?: FruitType[]; carryMax?: number; fleeSpeed?: number;
  hopPeriod?: number; tongueCooldown?: number; tongueRange?: number; poisonTicks?: number; poisonInterval?: number; poisonDamage?: number;
  shield?: number; shieldRegen?: number; chargeRange?: number; windup?: number; chargeSpeed?: number; chargeTime?: number;
  ramDamage?: number; ramStun?: number; knockback?: number; rest?: number; maxAlive?: number;
}
export interface Balancing {
  names: { skills: Record<Weapon, string>; plants: Record<FruitType, string>; fields: Record<FruitType, string>; tea: string; care: string };
  player: { hp: number; speed: number; respawnBase: number; respawnPerDeath: number; pickupRadius: number; pickupPerTier: number; magnetRadius: number; magnetSpeed: number };
  coop: { maxPlayers: number; xpNeedExponent: number; enemyCountExponent: number; enemyHpExponent: number; xpYieldExponent: number; xpValueExponent: number; enemyDamageExponent: number; snapshotRate: number };
  xp: { base: number; growth: number; linear: number };
  arena: { radius: number; fieldSize: number; fieldSlots: number; startFields: number };
  fields: { hp: number; rarityHp: number; healPerSecond: number; tillHealField: number; tillHealPlayer: number; tillReach: number; tillDuration: number; tillMultiplier: number; rarityNames: string[]; rarityCost: number[]; rarityProduction: number; neighborBonus: number };
  fruit: { tierScale: number[]; tierValue: number[]; mergeCount: number; mergeCheck: number; cornerScatter: number };
  plants: Record<FruitType, { interval: number; unlockAt?: number; amount?: number; minLevel?: number }>;
  rake: { damage: number; range: number; arc: number; cooldown: number; swingTime: number; knockback: number };
  skills: {
    readySeconds: number;
    asp: { damage: number; range: number; cooldown: number; ammoPerShot: number; speed: number; pierce: number; pierceFactor: number; width: number };
    cran: { damage: number; range: number; cooldown: number; ammoPerShot: number; pelletStep: number; spread: number; bleedDuration: number; bleedDps: number; mineLifetime: number };
    lemon: { damage: number; range: number; cooldown: number; ammoPerShot: number; chainRadius: number; transfer: number; branch: number[]; dropLoot: boolean };
    cab: { damage: number; radius: number; cooldown: number; ammoPerShot: number; throwDistance: number; fuse: number; poolDuration: number; poolTicksPerSecond: number; poolTickDamage: number; poolSlow: number; miniRadiusFactor: number; miniDamageFactor: number };
  };
  upgrades: {
    offersPerLevel: number; damagePerLevel: number; rangePerLevel: number; cooldownPerLevel: number;
    aspPierce: Lim; aspPierceBonus: Lim; aspSize: Lim; cranPellets: Lim; cranMine: Lim; cabMini: Lim; doubleHarvest: Lim;
    rakeArc: Lim; rakeRange: Lim; rakeDamage: Lim; rakeKnockback: Lim; tillHeal: Lim & { weight: number };
    lemonTargets: { maxLevel: number; order: number[] }; lemonTransfer: Lim;
    fieldCardsPerLevel: number; weaponCardsMax: number; newFieldTypeEvery: number; newFieldTypeChoices: number; firstUpgradeNewField?: boolean; secondUpgradeWeapon?: boolean; repeatWeight: number; herbalTea: { playerHeal: number; fieldHeal: number };
  };
  enemies: { aggroRadius: number; maxAlive: number; meleeDamage: number; meleeInterval: number; xpDrop: number;
    elite: { fromWave: number; chanceStart: number; chancePerWave: number; chanceMax: number; scale: number; hp: number; damage: number; xpMultiplier: number };
    boss: { every: number; scale: number; hpEnemies: number; hpGrowthPerWave: number; speed: number; meleeDamage: number; xpDrop: number; collectTime: number; chargeTime: number; berryBonus: number; bombDamage: number; bombRadius: number; bombFuse: number;
      trail: { count: number; interval: number; speedNear: number; speedFar: number; farDistance: number; turnRate: number };
      carousel: { duration: number; every: number; trails: number; count: number; spacing: number };
      rain: { count: number; interval: number; warn: number; radius: number } } } & Record<EnemyType, EnemyCfg>;
  hud: {
    hat: { colors: [number, string][]; crownShare: number; blinkBelow: number; pulseBelow: number; vignetteBelow: number; vignetteStrength: number };
    ammo: { showOnSwitch: number; lowSeconds: number; lowShow: number; fade: number };
  };
  waves: {
    total: number; firstWave: number; spawnRadius: number; firstWaveEnemies: number;
    durationStart: number; durationPerWave: number; pauseStart: number; pausePerWave: number; endKilled?: number;
    gapStart: number; gapPerWave: number; gapMin: number; gapJitter: number;
    sizeStart: number; sizePerWave: number; sizeMax: number; rampFrom: number; rampTo: number; finalMultiplier: number;
    directionsStart: number; directionsMax: number; directionEveryWaves: number; directionSpread: number;
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
