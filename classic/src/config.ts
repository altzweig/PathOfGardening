import YAML from 'yaml';

/** fruit weapons (id = ammo fruit); blue = Blaubeer-Schrotflinte (22.11.2026, start weapon) */
export type SkillId = 'asp' | 'cran' | 'cab' | 'lemon' | 'chili' | 'blue' | 'flour' | 'pan' | 'black' | 'wheat' | 'sling';
export type Weapon = 'rake' | SkillId;
/** crops (fields), buildings (processing tiles) and products: every tile type and every item that can lie on the ground */
export type CropType = 'blue' | 'black' | 'asp' | 'cran' | 'cab' | 'lemon' | 'chili' | 'nut' | 'wheat';
export type BuildingType = 'well' | 'mill' | 'press' | 'bakery' | 'hens' | 'kitchen'; // 23.11.2026 Kuh + Käserei vorerst ausgebaut (Basti)
export type ProductType = 'flour' | 'water' | 'egg' | 'juice' | 'bread' | 'fegg'; // Milch + Käse vorerst ausgebaut
export type FruitType = CropType | BuildingType | ProductType;
export type EnemyType = 'raccoon' | 'panda' | 'toad' | 'sheep' | 'hedgehog' | 'squirrel';
export const SKILLS: SkillId[] = ['asp', 'cran', 'cab', 'lemon', 'chili', 'blue', 'flour', 'pan', 'black', 'wheat', 'sling']; // 24.11.2026 sling = Eierschleuder (appended: snapshot indices)
/** 23.11.2026: one shotgun (skill 'blue', the start weapon) fires whichever berry is selected; the berries are only its ammo
 *  (cran and black are no weapons of their own any more): blue = freeze, black = thorn bind, cran = bleeding */
export type Berry = 'blue' | 'black' | 'cran';
export const BERRIES: Berry[] = ['blue', 'black', 'cran'];
export const isBerry = (t: string): t is Berry => t === 'blue' || t === 'black' || t === 'cran';
/** shotguns share the pellet code: cranberries bleed + pop when missed, blueberries freeze */
export const isGun = (id: string): id is 'cran' | 'blue' => id === 'cran' || id === 'blue';
export const WEAPONS: Weapon[] = ['rake', 'blue', 'asp', 'cran', 'cab', 'lemon', 'chili', 'flour', 'pan', 'wheat', 'sling'];
export const BUILDINGS: BuildingType[] = ['well', 'mill', 'press', 'bakery', 'hens', 'kitchen'];
export const PRODUCTS: ProductType[] = ['flour', 'water', 'egg', 'juice', 'bread', 'fegg'];
export const FRUITS: FruitType[] = ['blue', 'black', 'asp', 'cran', 'cab', 'lemon', 'chili', 'nut', 'wheat', ...BUILDINGS, ...PRODUCTS];
export const isBuilding = (t: FruitType | null | undefined): t is BuildingType => !!t && (BUILDINGS as string[]).includes(t);
/** one building: source (interval: makes one item every x s by itself) or processor (needs/needsAny -> makes, time s) */
export interface BuildingCfg { minLevel?: number; makes: ProductType; interval?: number; needs?: Partial<Record<FruitType, number>>; needsAny?: FruitType[]; count?: number; time?: number; /** items per finished batch (Spiegeleierei: 3) */ amount?: number; /** hens: eggs are stacked into a square pyramid of so many layers next to the coop (instead of lying scattered) */ stack?: number; buffer?: number; hp?: number; /** Brunnen (23.11.2026): production bonus of every crop field per well level 1/2/3 (best well counts) */ cropBonus?: number[] }
/** item on the ground: xp when picked up (x xp.gain), heal = player HP, ammo = goes into the player's bag (feed buildings) */
export interface ItemCfg { xp?: number; heal?: number }
/** fruit that is ammo for a weapon (nut and blueberry are not) */
export const isWeaponFruit = (t: FruitType): t is Exclude<SkillId, 'pan' | 'sling'> => t !== 'flour' && (SKILLS as string[]).includes(t);
/** Mehlsack (23.11.2026): flour from the mill is its ammo once the sack is learned */
export const FLOUR_SACK = 'flour' as const;
/** weapons whose ammo is a product (not a fruit of their own): Mehlsack = flour (mill), Spiegeleischleuder = fried eggs (Spiegeleierei) */
export const AMMO_OF: Partial<Record<SkillId, FruitType>> = { flour: 'flour', pan: 'fegg', sling: 'egg' };
export const SOURCE_OF: Partial<Record<SkillId, BuildingType>> = { flour: 'mill', pan: 'kitchen', sling: 'hens' };
/** combo weapons: two fruit weapons merged into one (main weapon keeps its slot, the sub weapon's slot gets free) */
export type ComboId = 'jam' | 'cole' | 'sour' | 'lance' | 'cabboom' | 'shock' | 'hot' | 'rocket' | 'kimchi' | 'chilight';
export const COMBOS: ComboId[] = ['jam', 'cole', 'sour', 'lance', 'cabboom', 'shock', 'hot', 'rocket', 'kimchi', 'chilight'];
/** one combo weapon: main/sub weapon, ammo (main fruit; sub fruit converts at subAmmo), keep = special upgrades that still apply
 *  (as "<skill>_<key>", all others turn into convertDamage), the rest are weapon-specific numbers */
export interface ComboCfg { main: SkillId; sub: SkillId; subAmmo: number; ammoPerShot: number; cooldown: number; damage: number; keep?: string[]; [k: string]: any }
export const ENEMIES: EnemyType[] = ['raccoon', 'panda', 'toad', 'sheep', 'hedgehog', 'squirrel'];

interface Lim { step: number; max?: number; maxLevel?: number }
export interface EnemyCfg {
  hp: number; speed: number; radius: number;
  steals?: FruitType[]; carryMax?: number; fleeSpeed?: number;
  hopPeriod?: number; airShare?: number; tongueCooldown?: number; tongueRange?: number; poisonTicks?: number; poisonInterval?: number; poisonDamage?: number;
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
  /** damage sources (weapon fruit) it takes enemies.resistance less damage from */
  resist?: FruitType[];
  /** hedgehog: puffs up every puffEvery s (puffUp s fast, then contracts for the rest), puffScale bigger, hurting everything within puffRadius */
  puffEvery?: number; puffUp?: number; puffScale?: number; puffDamage?: number; puffRadius?: number;
  /** squirrel: spawn arc opposite its tree (deg), s climbing into the crown, crown height (m), s it waits for nuts at the tree,
   *  own aggro radius, hop height (m), zigzag angle (deg) */
  spawnArc?: number; climbTime?: number; crownHeight?: number; patience?: number; aggroRadius?: number; hopHeight?: number; zigzag?: number;
}
export interface Balancing {
  /** Cheat-Optionen (24.11.2026): ammo a weapon unlocked by cheat starts with */
  cheats?: { ammo?: number };
  names: { /** notification when the merchant comes (24.11.2026) */ merchant?: string; skills: Record<Weapon, string>; plants: Partial<Record<FruitType, string>>; fields: Partial<Record<FruitType, string>>; items?: Partial<Record<FruitType, string>>; tea: string; care: string; hints?: Record<string, string>; effects?: Partial<Record<Weapon, string>>; combos?: Partial<Record<ComboId, string>>; comboFx?: Partial<Record<ComboId, string>> };
  player: { hp: number; speed: number; respawnBase: number; respawnPerDeath: number; pickupRadius: number; pickupPerTier: number; magnetRadius: number; magnetSpeed: number; /** s to draw the weapon from the back / put it back (24.11.2026) */ drawTime?: number;
    /** 24.11.2026 sprint (Shift) with stamina, energy shield before HP, enemy damage multiplier on players */
    sprint?: { speed: number; duration: number; regen: number; regenDelay: number; exhausted: number }; shield?: { hp: number; regen: number; regenDelay: number }; damageTaken?: number };
  coop: { maxPlayers: number; xpNeedExponent: number; enemyCountExponent: number; enemyHpExponent: number; xpYieldExponent: number; xpValueExponent: number; enemyDamageExponent: number; snapshotRate: number };
  xp: { base: number; growth: number; linear: number; gain?: number; fieldPerSecond?: number; /** XP per harvested plant and rake stroke (24.11.2026) */ perPlant?: number };
  arena: { radius: number; fieldSize: number; fieldSlots: number; startFields: number; /** 23.11.2026: choose one of these start fields (instead of startFields blueberry fields) */ startChoice?: Berry[] };
  /** Lager-Truhe in the centre (23.11.2026): holds all resources of the players; raccoons steal from it (max thieves on a circle around it) */
  chest?: { radius: number; maxThieves: number; stealInterval: number; carryStart: number; carryPerWave: number; fleeSpeed: number; /** s a raccoon chases a player for its one attack before it goes to the chest (24.11.2026) */ attackFirst?: number };
  /** forest slots outside the garden (only nut trees grow there) */
  forest?: { slots: number; radius: number; angleOffset: number; types: FruitType[] };
  fields: { hp: number; rarityHp: number; healPerSecond: number; tillHealField: number; tillHealPlayer: number; tillDuration: number; tillStroke: number; rarityNames: string[]; rarityCost: number[]; rarityProduction: number; neighborBonus: number; /** crop cycle s: grows grow s, then ripe; harvest s of active raking, then grows again */ cycle?: { harvest: number; grow: number; rakeGrow?: number; /** plants per field, one harvested per rake stroke (24.11.2026) */ plants?: number } };
  fruit: { tierScale: number[]; tierValue: number[]; mergeCount: number; mergeCheck: number; cornerScatter: number };
  plants: Partial<Record<FruitType, { interval: number; /** crop cycle s of this plant (else fields.cycle) */ grow?: number; harvest?: number; /** rake strokes per plant (24.11.2026, default 1) */ strokes?: number; unlockAt?: number; amount?: number; minLevel?: number; dropRadius?: [number, number]; magnet?: boolean; disabled?: boolean }>>;
  buildings: Record<BuildingType, BuildingCfg>;
  items: Partial<Record<FruitType, ItemCfg>>;
  /** tile levels: same-type neighbour bonus, upgrade cost/bonus, interaction (feeding/repair) */
  tiles: { bonusBase: number; upgradeFirst: number; upgradeStep: number; upgradeStepGrowth: number; costFirst: number; costGrowth: number; hpPerLevel: number; rings: number; /** 23.11.2026: highest tile level (start level 1) */ maxLevel?: number; feedPerStroke: number; workPerStroke: number; repairPerStroke: number; buildingHp: number };
  rake: { damage: number; range: number; diameter: number; cooldown: number; pullTime: number; pushTime: number; stun: number; knockback: number };
  skills: {
    readySeconds: number;
    asp: { damage: number; range: number; cooldown: number; ammoPerShot: number; burstShots: number; burstGap: number; speed: number; pierce: number; pierceFactor: number; width: number };
    cran: { damage: number; range: number; cooldown: number; ammoPerShot: number; pellets: number; cone: number; spreadSigma: number; bleedDuration: number; bleedDps: number; /** s per bleeding tick (only while moving) */ bleedTick?: number; splashDelay: number; splashDamage: number; splashRadius: number };
    lemon: { damage: number; range: number; cooldown: number; ammoPerShot: number; speed: number; ballRadius: number; tickInterval: number; tickRadius: number; tickDamage: number; chainRadius: number; chainDamage: number; dropLoot: boolean };
    chili: { range: number; cooldown: number; ammoPerShot: number; damage: number; burnDamage: number; burnStacks: number; burnDuration: number; burnTick: number; spreadRadius: number; spreadShare: number; cone: number; sweep: number; sweepPeriod: number };
    blue: { damage: number; range: number; cooldown: number; ammoPerShot: number; pellets: number; cone: number; spreadSigma: number; freeze: number; /** physical damage x this against frozen animals */ frozenBonus?: number };
    /** Brombeere (shotgun ammo): Dornenfessel - duration s, slow, physical damage per s (tick s), one neighbour within radius m gets it too */
    black: { duration: number; slow: number; dps: number; tick: number; radius: number };
    /** Mehlsack: spin throw -> flour cloud (life s, last fade s); fire ignites it -> burn front sweeps outwards at frontSpeed m/s */
    flour: { damage: number; range: number; cooldown: number; ammoPerShot: number; spin: number; life: number; fade: number; frontSpeed: number; burnTime: number; burnDps: number; maxClouds: number; minLevel?: number };
    /** Spiegeleischleuder (23.11.2026): spin, then eggs fly throw m and lure every animal within range m (lure radius); eat s of eating per egg (shared by all eaters) */
    pan: { damage: number; range: number; cooldown: number; ammoPerShot: number; eggs: number; throw: number; spin: number; flight: number; eat: number; cdStep: number; rangeStep: number; eatStep: number; spread: number; spreadJitter: number; ring: [number, number]; maxLife: number; boss?: boolean };
    /** Körner-MP (23.11.2026): wooden SMG firing wheat grains; heats up (full after heatTime s of firing, then locked until cooled,
     *  coolTime s from full), spread grows with heat from spreadMin to spreadMax deg */
    wheat: { damage: number; range: number; cooldown: number; ammoPerShot: number; speed: number; heatTime: number; coolTime: number; coolDelay: number; spreadMin: number; spreadMax: number; /** m grain hit width (24.11.2026) */ width?: number };
    /** Eierschleuder (24.11.2026): wooden slingshot, raw eggs (hens) as ammo; the egg bursts where it lands (radius m, +radiusStep per
     *  upgrade) and gives everything hit the cabbage poison debuff (cab.poison*), sulphur yellow; range = max throw distance m */
    sling: { damage: number; range: number; radius: number; radiusStep: number; cooldown: number; ammoPerShot: number; aimCone?: number };
    cab: { damage: number; radius: number; cooldown: number; ammoPerShot: number; chargeTime: number; throwMin: number; throwMax: number; mineSpacing: number; mineTrigger: number; maxMines: number; mineLife?: number; poisonDuration: number; poisonTick: number; poisonTickDamage: number; poisonSlow: number; gasRadius?: number; miniRadiusFactor: number; miniDamageFactor: number };
  };
  upgrades: {
    offersPerLevel: number; damagePerLevel: number; rangePerLevel: number; cooldownPerLevel: number;
    aspPierce: Lim; aspPierceBonus: Lim; aspSize: Lim; aspSalvo: { shots: number[] }; cranPellets: Lim; cranPierce: Lim; cranSplash: Lim; cabMini: Lim; cabGas: Lim; cabPoison: Lim; doubleHarvest: Lim; /** Körner-MP: +step x heatTime per level */ wheatDuration?: Lim;
    rakeDiameter: Lim; rakeSpeed?: Lim; rakeRange: Lim; rakeDamage: Lim; tillHeal: Lim & { weight: number };
    lemonTargets: Lim; lemonTransfer: Lim; lemonEfficiency: Lim;
    chiliSweep: { sweepStep: number; coneStep: number; circleSpeedBonus: number; circleConeStep: number; circleSpeedStep: number; maxCone: number };
    chiliTick: { factor: number; min: number };
    fieldCardsPerLevel: number; weaponCardsMax: number; newFieldTypeEvery: number; newFieldTypeChoices: number; firstUpgradeNewField?: boolean; secondUpgradeWeapon?: boolean; repeatWeight: number; learnWeight?: number; rakeWeight?: number; newOtherWeight?: number; herbalTea: { playerHeal: number; fieldHeal: number };
  };
  enemies: { aggroRadius: number; maxAlive: number; meleeDamage: number; meleeInterval: number; xpDrop: number; resistance: number;
    /** 23.11.2026: XP of dropped berries x (base * growth^(w-1) + linear*(w-1)) */ xpScale?: { base?: number; growth: number; linear: number };
    /** per-wave growth of enemy HP / attack: growth^(w-1) + linear*(w-1) */
    scaling?: { hp: { growth: number; linear: number }; damage: { growth: number; linear: number } };
    elite: { fromWave: number; chanceStart: number; chancePerWave: number; chanceMax: number; scale: number; hp: number; damage: number; xpMultiplier: number };
    boss: { levels?: { first: number; every: number }; phases?: number; phaseSpeedup?: number; every: number; scale: number; hpEnemies: number; hpGrowthPerWave: number; speed: number; meleeDamage: number; xpDrop: number; collectTime: number; chargeTime: number; berryBonus: number; bombDamage: number; bombRadius: number; bombFuse: number;
      trail: { count: number; interval: number; speedNear: number; speedFar: number; farDistance: number; turnRate: number };
      carousel: { duration: number; every: number; trails: number; count: number; spacing: number };
      rain: { count: number; interval: number; warn: number; radius: number } } } & Record<EnemyType, EnemyCfg>;
  /** day-night cycle: dayWaves day waves, then nightWaves night waves (boss in the last one); night waves bigger/stronger */
  dayNight?: { dayWaves: number; nightWaves: number; night: { size: number; hp: number; damage: number } };
  /** visual parameters (flour cloud / fire carpet shader), no gameplay effect */
  fx?: { flour?: Partial<Record<'layers' | 'height' | 'noiseScale' | 'swirl' | 'density' | 'speckle' | 'speckleSize' | 'color', number>>; fire?: Partial<Record<'edgeWidth' | 'flameHeight' | 'flameSpeed' | 'intensity' | 'burnOut' | 'sparks' | 'haze' | 'hazeHeight', number>> };
  /** step-by-step hints from the start of a game (24.11.2026), see balancing.yaml */
  tutorial?: { harvest: string; attack: string; switch: string; secondary: string; genus?: Record<string, 'm' | 'f' | 'n' | 'p'> };
  /** max weapons; primary / secondary: which group of the 10-slot bar a weapon goes to (24.11.2026) */
  weaponSlots?: { max: number; primary?: SkillId[]; secondary?: SkillId[] };
  /** 23.11.2026: tiles offered as hex fields on every level-up (besides the chosen start field); weights per type */
  fieldPool?: { types: FruitType[]; offers: number; weights?: Record<string, number> };
  /** 24.11.2026: field / building that must stand before a weapon is offered (Werkstatt) */
  weaponNeeds?: Partial<Record<SkillId, FruitType>>;
  /** processing chains: every level-3 tile of "from" unlocks one tile of this type; stage 2 also needs a "nextTo" neighbour */
  chains?: Partial<Record<FruitType, { from: FruitType | FruitType[]; stage: number; nextTo?: FruitType }>>;
  /** Saftpresse (23.11.2026): juice XP = xpFactor x a crop field's XP rate; fill = s of active pressing per bar, step = debuff duration per fill */
  juice?: { xpFactor: number; fill: number; step: number; names?: Partial<Record<Berry, string>> };
  /** Werkstatt at the chest between waves: ideas (1 per level-up) buy upgrades */
  werkstatt?: { slots: number; cost: number; goldenCost: number; golden: string[]; names?: Record<string, string>; maxBulbs?: number; /** weapons offered on the bench from the first Werkstatt on (first bench: as ideas of their own) */ firstLearn?: SkillId[] };
  /** 24.11.2026 Händler: comes every everyLevels levels (after the running wave) with his cart; reroll price rerollCost + rerollStep per reroll, ready for stay s, talk radius m */
  merchant?: { everyLevels: number; rerollCost?: number; rerollStep?: number; delay: number; stay: number; reveal: number; talkRadius: number; speed: number; leaveSpeed: number; spawnRadius: number; gap: number; turn: number; arc: number };
  /** combo weapons: offered once both weapons have unlockUpgrades upgrades each */
  combos?: { unlockUpgrades: number; convertDamage: number; shock: { duration: number; tick: number; radius: number }; list: Record<ComboId, ComboCfg> };
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
