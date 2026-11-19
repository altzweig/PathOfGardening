import YAML from 'yaml';

/** fruit weapons; id = its ammo fruit. 18.11.2026 (Waffentabelle): blue = Blaubeer-Schrotflinte, bean = Bohnen-Armbrust (new) */
export type SkillId = 'asp' | 'cran' | 'cab' | 'lemon' | 'chili' | 'blue' | 'bean';
/** tools every player has from the start (rake = the hoe "Hacke" since 18.11.2026, watering can) + fruit weapons */
export type Weapon = 'rake' | 'can' | SkillId;
export const isTool = (w: Weapon): w is 'rake' | 'can' => w === 'rake' || w === 'can';
/** 18.11.2026 (Bastis Erntekalender): Gemüse, Beeren und Kräuter ohne Waffe, ihre Früchte geben nur XP */
export type CropId = 'ramsons' | 'bean' | 'pea' | 'straw' | 'potato' | 'garlic' | 'lettuce' | 'pumpkin' | 'leek' | 'dandel' | 'corn' | 'carrot' | 'pepper' | 'radish' | 'rhubarb' | 'goose' | 'tomato' | 'onion';
export const CROPS: CropId[] = ['ramsons', 'bean', 'pea', 'straw', 'potato', 'garlic', 'lettuce', 'pumpkin', 'leek', 'dandel', 'corn', 'carrot', 'pepper', 'radish', 'rhubarb', 'goose', 'tomato', 'onion'];
export type FruitType = 'blue' | 'asp' | 'cran' | 'cab' | 'lemon' | 'chili' | 'nut' | CropId;
export const isCrop = (t: FruitType): t is CropId => (CROPS as string[]).includes(t);
export type EnemyType = 'raccoon' | 'panda' | 'toad' | 'sheep' | 'hedgehog' | 'squirrel' | 'hare';
// new weapons at the end: SKILLS indices are used in the snapshot
export const SKILLS: SkillId[] = ['asp', 'cran', 'cab', 'lemon', 'chili', 'blue', 'bean'];
/** weapon families sharing the code: crossbows (salvo, piercing bolts) and shotguns (pellet spread) */
export const isXbow = (id: string): id is 'asp' | 'bean' => id === 'asp' || id === 'bean';
export const isGun = (id: string): id is 'cran' | 'blue' => id === 'cran' || id === 'blue';
/** upgrade family of a weapon: bean uses the crossbow upgrades (asp), blue the shotgun upgrades (cran) */
export const famOf = (id: SkillId): SkillId => id === 'bean' ? 'asp' : id === 'blue' ? 'cran' : id;
export const WEAPONS: Weapon[] = ['rake', 'can', 'asp', 'bean', 'cran', 'blue', 'cab', 'lemon', 'chili'];
export const FRUITS: FruitType[] = ['blue', 'asp', 'cran', 'cab', 'lemon', 'chili', 'nut', ...CROPS];
/** fruit radius on the ground (m) */
export const fruitSize = (t: FruitType) => t === 'cab' || t === 'pumpkin' ? .14 : t === 'nut' ? .07 : t === 'lettuce' ? .12 : .08;
/** fruit that is ammo for a weapon (blueberry: Blaubeer-Schrotflinte, bean: Bohnen-Armbrust since 18.11.2026) */
export const isWeaponFruit = (t: FruitType): t is SkillId => (SKILLS as string[]).includes(t);
/** weapon a fruit is ammo for (since 18.11.2026 two shotguns: blueberries and cranberries are separate ammo again) */
export const ammoOf = (t: FruitType): SkillId | null => isWeaponFruit(t) ? t : null;
/** hoe action: chop (into the ground, farming) or slash (sword swing, fighting) */
export type HoeAct = 'chop' | 'slash';
/** combo weapons: two fruit weapons merged into one (main weapon keeps its slot, the sub weapon's slot gets free) */
export type ComboId = 'jam' | 'cole' | 'sour' | 'lance' | 'cabboom' | 'shock' | 'hot' | 'rocket' | 'kimchi' | 'chilight';
export const COMBOS: ComboId[] = ['jam', 'cole', 'sour', 'lance', 'cabboom', 'shock', 'hot', 'rocket', 'kimchi', 'chilight'];
/** one combo weapon: main/sub weapon, ammo (main fruit; sub fruit converts at subAmmo), keep = special upgrades that still apply
 *  (as "<skill>_<key>", all others turn into convertDamage), the rest are weapon-specific numbers */
export interface ComboCfg { main: SkillId; sub: SkillId; subAmmo: number; ammoPerShot: number; cooldown: number; damage: number; keep?: string[]; [k: string]: any }
/** seasons (18.11.2026): one wave = one month */
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: SeasonKey[] = ['spring', 'summer', 'autumn', 'winter'];
export interface SeasonCfg { months: number[]; wetLoss: number; rain: number }
export const ENEMIES: EnemyType[] = ['raccoon', 'panda', 'toad', 'sheep', 'hedgehog', 'squirrel'];

interface Lim { step: number; max?: number; maxLevel?: number }
/** shared by every fruit weapon: level from which its unlock card can come, rarity (index into weaponRarity) */
interface WeaponBase { damage: number; range: number; cooldown: number; ammoPerShot: number; level?: number; rarity?: number }
export interface XbowCfg extends WeaponBase { burstShots: number; burstGap: number; speed: number; pierce: number; pierceFactor: number; width: number }
export interface GunCfg extends WeaponBase { pellets: number; cone: number; spreadSigma: number; splashDelay: number; splashDamage: number; splashRadius: number }
export interface EnemyCfg {
  hp: number; speed: number; radius: number;
  steals?: FruitType[]; carryMax?: number; fleeSpeed?: number;
  hopPeriod?: number; tongueCooldown?: number; tongueRange?: number; poisonTicks?: number; poisonInterval?: number; poisonDamage?: number;
  shield?: number; shieldRegen?: number; chargeRange?: number; windup?: number; chargeSpeed?: number; chargeTime?: number;
  ramDamage?: number; ramStun?: number; knockback?: number; rest?: number; maxAlive?: number;
  /** steals: fruit it picks up (carries away); prefers: those first; eats: fruit it eats on the spot */
  prefers?: FruitType[]; eats?: FruitType[];
  /** never attacks players or fields, wanders around looking for fruit */
  peaceful?: boolean; wanderSpeed?: number;
  /** flees (with whatever it carries) once its HP drops below this share */
  fleeBelow?: number;
  /** fields it attacks first */
  prefersFields?: FruitType[];
  /** attacks the shed (Lager) in the middle instead of the fields */
  lager?: boolean;
  /** raccoon (18.11.2026): steals from the supplies in the shed instead of from the fields: stealRate fruit per s (+stealRatePerWave share per wave),
   *  runs off after stealTime s at the latest; hit, it drops dropShare of the loot and flees; killed, it drops everything */
  lagerSteal?: boolean; stealRate?: number; stealRatePerWave?: number; stealTime?: number; dropShare?: number;
  /** damage sources (weapon fruit) it takes enemies.resistance less damage from */
  resist?: FruitType[];
  /** hedgehog: puffs up every puffEvery s (puffUp s fast, then contracts for the rest), puffScale bigger, hurting everything within puffRadius */
  puffEvery?: number; puffUp?: number; puffScale?: number; puffDamage?: number; puffRadius?: number;
  /** squirrel: spawn arc opposite its tree (deg), s climbing into the crown, crown height (m), s it waits for nuts at the tree,
   *  own aggro radius, hop height (m), zigzag angle (deg) */
  spawnArc?: number; climbTime?: number; crownHeight?: number; patience?: number; aggroRadius?: number; hopHeight?: number; zigzag?: number;
}
export interface Balancing {
  names: { skills: Record<Weapon, string>; plants: Record<FruitType, string>; fields: Record<FruitType, string>; tea: string; hints?: Record<string, string>; effects?: Partial<Record<Weapon, string>>; combos?: Partial<Record<ComboId, string>>; comboFx?: Partial<Record<ComboId, string>> };
  player: { hp: number; speed: number; respawnBase: number; respawnPerDeath: number; pickupRadius: number; pickupPerTier: number; magnetRadius: number; magnetSpeed: number };
  coop: { maxPlayers: number; xpNeedExponent: number; enemyCountExponent: number; enemyHpExponent: number; xpYieldExponent: number; xpValueExponent: number; enemyDamageExponent: number; snapshotRate: number };
  xp: { base: number; growth: number; linear: number; gain?: number; fruit?: Partial<Record<FruitType, number>> };
  arena: { radius: number; fieldSize: number; fieldSlots: number; startFields: number; startSlots?: [number, number, FruitType][] };
  /** shed in the middle: HP (game lost at 0), collision radius in m */
  lager?: { hp: number; radius: number };
  /** clearing layout: angles (deg, 0 = right/+x, 90 = down/+z) of the gaps in the forest where enemies come in, gap width in m */
  layout?: { gaps: number[]; gapWidth: number };
  /** seasons: month of wave 1, fixed daytime hour for the light, month names, the 4 seasons, rain showers */
  seasons?: { startMonth: number; hour: number; monthNames: string[]; rain: { duration: [number, number]; wetPerSecond: number } } & Record<SeasonKey, SeasonCfg>;
  /** forest slots outside the garden (only nut trees grow there) */
  forest?: { slots: number; radius: number; angleOffset: number; types: FruitType[] };
  fields: { hp: number; rarityHp: number; seedlingHp: number; growTime: number; regrowAt: number; regrowGrownAt: number;
    /** wetness 0..100: start value, loss per s, threshold for growing/healing, drought threshold, heal HP/s when wet, HP/s lost in drought */
    wetStart: number; wetLoss: number; wetGrow: number; wetDrought: number; wetHeal: number; droughtDamage: number;
    tillDuration: number; tillStroke: number; rarityNames: string[]; rarityCost: number[]; rarityProduction: number; neighborBonus: number };
  fruit: { tierScale: number[]; tierValue: number[]; mergeCount: number; mergeCheck: number; cornerScatter: number };
  plants: Record<FruitType, { interval: number; unlockAt?: number; amount?: number; minLevel?: number; dropRadius?: [number, number]; magnet?: boolean; disabled?: boolean; months?: number[] }>;
  /** 18.11.2026: Startpool je Partie: so viele zufällige Pflanzen (ohne exclude), die zusammen mindestens minMonths Erntemonate abdecken. Nur diese (+ exclude) kommen als neue Felder. */
  startPool?: { count: number; exclude: FruitType[]; minMonths: number };
  /** hoe (Hacke, weapon id 'rake'): chop = hit the ground at the toe point (tills exactly one field, small hit circle),
   *  slash = sword-like swing (cone slashArc deg, slashRange m) for fighting */
  hoe: { chopTime: number; chopCooldown: number; toe: number; chopDamage: number; chopDiameter: number; chopStun: number;
    slashTime: number; slashCooldown: number; slashArc: number; slashRange: number; damage: number; stun: number; knockback: number };
  /** watering can: sweeps arc deg from left to right in sweepTime s, water lands reach m in front, circle of radius m, wetness per s */
  can: { arc: number; sweepTime: number; reach: number; radius: number; wetPerSecond: number };
  /** weapon rarities (Waffentabelle): names + card colour, skills.<id>.rarity is the index */
  weaponRarity?: { names: string[]; colors: string[] };
  skills: {
    readySeconds: number;
    asp: XbowCfg;
    /** Bohnen-Armbrust: like the crossbow, every bolt is `beans` beans side by side, `beanSpread` deg apart */
    bean: XbowCfg & { beans: number; beanSpread: number };
    /** Preiselbeer-Schrotflinte: bleeding (bleedDuration s, every bleedTick s bleedShare x pellet damage while the enemy moves) */
    cran: GunCfg & { bleedDuration: number; bleedTick: number; bleedShare: number };
    /** Blaubeer-Schrotflinte: frozen (freezeDuration s: the enemy does not move) */
    blue: GunCfg & { freezeDuration: number };
    lemon: { damage: number; range: number; cooldown: number; ammoPerShot: number; speed: number; ballRadius: number; tickInterval: number; tickRadius: number; tickDamage: number; chainRadius: number; chainDamage: number; dropLoot: boolean; level?: number; rarity?: number };
    /** flamethrower (18.11.2026): damage = weapon damage; every stackTime s in the flame 1 fire stack (max burnStacks);
     *  every burnTick s each stack deals burnShare x weapon damage; out burnDuration s after the last contact.
     *  hitDamage: instant damage per flame burst; spreadRadius 0 = no wildfire */
    chili: { range: number; cooldown: number; ammoPerShot: number; damage: number; hitDamage: number; stackTime: number; burnShare: number; burnStacks: number; burnDuration: number; burnTick: number; spreadRadius: number; spreadShare: number; cone: number; sweep: number; sweepPeriod: number; level?: number; rarity?: number };
    cab: { damage: number; radius: number; cooldown: number; ammoPerShot: number; chargeTime: number; throwMin: number; throwMax: number; poisonDuration: number; poisonTick: number; poisonTickDamage: number; poisonSlow: number; gasRadius?: number; miniRadiusFactor: number; miniDamageFactor: number; level?: number; rarity?: number };
  };
  upgrades: {
    offersPerLevel: number; damagePerLevel: number; rangePerLevel: number; cooldownPerLevel: number;
    aspPierce: Lim; aspPierceBonus: Lim; aspSize: Lim; aspSalvo: { shots: number[] }; cranPellets: Lim; cranPierce: Lim; cranSplash: Lim; cabMini: Lim; cabGas: Lim; cabPoison: Lim; doubleHarvest: Lim;
    rakeDiameter: Lim; rakeSpeed?: Lim; rakeRange: Lim; rakeDamage: Lim;
    lemonTargets: Lim; lemonTransfer: Lim; lemonEfficiency: Lim;
    chiliSweep: { sweepStep: number; coneStep: number; circleSpeedBonus: number; circleConeStep: number; circleSpeedStep: number; maxCone: number };
    chiliTick: { factor: number; min: number };
    fieldCardsPerLevel: number; weaponCardsMax: number; newFieldTypeEvery: number; newFieldTypeChoices: number; firstUpgradeNewField?: boolean; secondUpgradeWeapon?: boolean; repeatWeight: number; herbalTea: { playerHeal: number; fieldHeal: number };
  };
  enemies: { aggroRadius: number; maxAlive: number; meleeDamage: number; meleeInterval: number; xpDrop: number; resistance: number;
    /** per-wave growth of enemy HP / attack: growth^(w-1) + linear*(w-1) */
    scaling?: { hp: { growth: number; linear: number }; damage: { growth: number; linear: number } };
    elite: { fromWave: number; chanceStart: number; chancePerWave: number; chanceMax: number; scale: number; hp: number; damage: number; xpMultiplier: number };
    boss: { levels?: { first: number; every: number }; phases?: number; phaseSpeedup?: number; every: number; scale: number; hpEnemies: number; hpGrowthPerWave: number; speed: number; meleeDamage: number; xpDrop: number; collectTime: number; chargeTime: number; berryBonus: number; bombDamage: number; bombRadius: number; bombFuse: number;
      trail: { count: number; interval: number; speedNear: number; speedFar: number; farDistance: number; turnRate: number };
      carousel: { duration: number; every: number; trails: number; count: number; spacing: number };
      rain: { count: number; interval: number; warn: number; radius: number } } } & Record<EnemyType, EnemyCfg>;
  /** day-night cycle: dayWaves day waves, then nightWaves night waves (boss in the last one); night waves bigger/stronger */
  dayNight?: { dayWaves: number; nightWaves: number; night: { size: number; hp: number; damage: number } };
  weaponSlots?: { max: number };
  /** combo weapons: offered once both weapons have unlockUpgrades upgrades each */
  combos?: { unlockUpgrades: number; convertDamage: number; /** fire of combo weapons (old flamethrower numbers): damage per stack and tick, max stacks, s */ burn?: { damage: number; stacks: number; duration: number }; shock: { duration: number; tick: number; radius: number }; list: Record<ComboId, ComboCfg> };
  transitions?: { slow: number; uiFade: number };
  hud: {
    hat: { colors: [number, string][]; crownShare: number; blinkBelow: number; pulseBelow: number; vignetteBelow: number; vignetteStrength: number };
    ammo: { showOnSwitch: number; lowSeconds: number; lowShow: number; fade: number };
  };
  waves: {
    total: number; firstWave: number; spawnRadius: number; firstWaveEnemies: number;
    durationStart: number; durationPerWave: number; pauseStart: number; pausePerWave: number; countdownAfter?: number; leaveTime?: number; leaveSpeed?: number; announce?: number; tickFrom?: number; redFrom?: number;
    gapStart: number; gapPerWave: number; gapMin: number; gapJitter: number;
    sizeStart: number; sizePerWave: number; sizeMax: number; rampFrom: number; rampTo: number; finalMultiplier: number;
    directionsStart: number; directionsMax: number; directionEveryWaves: number; directionSpread: number;
    staggerMin: number; staggerMax: number; warnTime: number; countMultiplier?: number;
    types: Record<EnemyType, { from: number; weight: number; early?: number; group?: [number, number]; needs?: FruitType }>;
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
