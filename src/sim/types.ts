import type { WeaponClass } from './config';
import type { Rng } from './rng';
import type { Vec2 } from './vec';

/** A side in the game: a human at this keyboard, or the AI. Teams decide who is hostile to whom. */
export interface Player {
  id: string;
  name: string;
  kind: 'human' | 'ai';
  team: number;
  color: string;
  /** The unit this player controls directly, or null in RTS mode (always null for the AI). */
  controlledId: number | null;
}

/** Animation-relevant zombie states; the renderer maps these to clip names. */
export type ZombieState = 'walk' | 'attack' | 'death';

/** What an AI-driven soldier is doing. Only the controlled soldier ignores its order. */
export type SoldierOrder =
  | { type: 'follow' }
  | { type: 'move'; x: number; z: number }
  | { type: 'board'; vehicleId: number }
  | { type: 'hold' };

export type Stance = 'normal' | 'crouch' | 'sprint';

export type UnitKind = 'soldier' | 'drone';

/** `count` of one item (an item id) sharing a backpack slot, up to the item's `stack`. */
export interface Stack {
  item: string;
  count: number;
}

/**
 * Hand and body slots; null is empty. A two-handed weapon sits in `rightHand` and leaves
 * `leftHand` empty. With both hands empty a unit has fists (not active yet: it does not fight).
 */
export interface Equipment {
  rightHand: string | null;
  leftHand: string | null;
  chest: string | null;
}

export interface Soldier {
  id: number;
  /** Id of the player that owns this unit. */
  owner: string;
  kind: UnitKind;
  pos: Vec2;
  /** Position at the start of the last step, for render interpolation. */
  prev: Vec2;
  /** Facing angle; direction is (sin, cos). */
  facing: number;
  health: number;
  dead: boolean;
  fireCooldown: number;
  /** Height above the ground (jumping) and vertical speed. */
  y: number;
  prevY: number;
  vy: number;
  order: SoldierOrder;
  /** What the unit holds and wears (item ids from data/items.json). */
  equipment: Equipment;
  /** Carried stacks, up to `inventory.backpackSlots` slots. */
  backpack: Stack[];
  /** This unit's own experience (grows when it kills) and enemies it has killed. */
  xp: number;
  kills: number;
  /** Sprint energy (0 to `stance.staminaMax`); `winded` blocks sprinting until it recovers. */
  stamina: number;
  winded: boolean;
  /** A name set by the map, shown instead of "Soldier 2". */
  name?: string;
  /** Health before perks; the type's default unless the map changes it. */
  baseHealth: number;
  /** Stat sheet entry this unit was built from ('soldier', 'drone') in data/units.json. */
  unitType: string;
  /** The sheet's attributes with this unit's current values (mocked: no rule reads them yet). */
  attributes: Record<string, number>;
  /** Weapon-skill XP by weapon class, earned by killing with a weapon of that class. */
  skills: Record<WeaponClass, number>;
  /** Absorbs damage before health does (0 to `player.maxArmor`); units start with none. */
  armor: number;
  /** On the floor at zero health: crawls, shoots a one-handed gun, bleeds out (soldiers only). */
  downed: boolean;
  /** Seconds left to live while downed. */
  bleedOut: number;
  /** Seconds since death (a defibrillator only works within its window). */
  deadTime: number;
  /** Seconds an ally has spent reviving this unit; resets when none is in reach. */
  reviveProgress: number;
  /** The vehicle this unit sits in (it rides along and cannot be hit), or null. */
  vehicleId: number | null;
}

/**
 * A drivable machine. It is neutral: it belongs to whoever sits in it. Seat 0 is the driver's
 * (no driver, no movement); the other seats hold passengers. Entries are soldier ids or null.
 */
export interface Vehicle {
  id: number;
  /** Key of `vehicles` in data/game.json. */
  type: string;
  pos: Vec2;
  prev: Vec2;
  /** Heading; direction is (sin, cos). */
  facing: number;
  prevFacing: number;
  /** Forward speed in m/s. */
  speed: number;
  health: number;
  maxHealth: number;
  seats: (number | null)[];
}

export interface Zombie {
  id: number;
  /** Id of the player (the AI) that owns this unit. */
  owner: string;
  pos: Vec2;
  prev: Vec2;
  facing: number;
  /** Enemy variant id ('zombie', 'alien', ...). Picks the model and the stats below. */
  type: string;
  /** A name set by the map. */
  name?: string;
  /** Attributes set by the map (mocked: no rule reads them). */
  attributes?: Record<string, number>;
  /** Items it carries; they drop in a crate when it dies. */
  loot: string[];
  health: number;
  maxHealth: number;
  /** A mini boss: darker, slower, much tougher and harder-hitting than its type. */
  boss: boolean;
  /** Model and hitbox scale: 1 for normal enemies, bigger for bosses. */
  size: number;
  /** Loot multiplier (1 for normal enemies). */
  reward: number;
  /** Killed by bursting: skipped death animation, the renderer shows gore instead. */
  exploded: boolean;
  /** Chase speed, fixed at spawn from the wave's difficulty scaling. */
  speed: number;
  radius: number;
  damage: number;
  attackRange: number;
  state: ZombieState;
  attackTimer: number;
  deathTimer: number;
}

/** A dropped container of items on the ground. */
export interface Crate {
  id: number;
  pos: Vec2;
  items: string[];
}

/** A gold coin or XP orb lying on the ground. */
export interface Pickup {
  id: number;
  kind: 'gold' | 'xp';
  amount: number;
  pos: Vec2;
  /** Seconds since it dropped. */
  age: number;
}

export type SpawnerPhase = 'intermission' | 'spawning' | 'clearing';

export interface Spawner {
  phase: SpawnerPhase;
  /** Intermission countdown, or time until the next spawn while spawning. */
  timer: number;
  toSpawn: number;
}

export type SimEvent =
  | {
      type: 'shot';
      shooterId: number;
      facing: number;
      weapon: string;
      /** Muzzle height above the ground. */
      height: number;
      from: Vec2;
      to: Vec2;
      hitZombieId: number | null;
    }
  | {
      type: 'zombieKilled';
      id: number;
      enemy: string;
      pos: Vec2;
      exploded: boolean;
      /** The soldier that landed the killing shot. */
      killerId: number | null;
    }
  | { type: 'pickupCollected'; kind: 'gold' | 'xp'; amount: number; pos: Vec2 }
  | { type: 'levelUp'; level: number }
  | { type: 'crateDropped'; crateId: number; pos: Vec2 }
  | { type: 'soldierHurt'; soldierId: number; damage: number; zombieId: number }
  | { type: 'soldierDowned'; soldierId: number }
  | { type: 'soldierRevived'; soldierId: number; byId: number }
  | { type: 'soldierDied'; soldierId: number }
  | { type: 'vehicleDestroyed'; vehicleId: number; pos: Vec2 }
  | { type: 'waveStarted'; wave: number }
  | { type: 'bossSpawned'; wave: number; enemy: string }
  | { type: 'objectiveDone'; index: number }
  | { type: 'victory' }
  | { type: 'gameOver' };

/** Squad-wide multipliers from perks (all 1 at the start; regen is HP/s). */
export interface Mods {
  damage: number;
  fireRate: number;
  speed: number;
  maxHealth: number;
  regen: number;
  pickupRadius: number;
}

/** A harmless wandering animal (a dog, a cat) placed in the editor. */
export interface Animal {
  id: number;
  /** Key of `animals` in game.json. */
  type: string;
  pos: Vec2;
  prev: Vec2;
  facing: number;
  /** Where it was placed; it wanders near here. */
  home: Vec2;
  dest: Vec2 | null;
  /** Seconds left to stand still before choosing a new spot. */
  wait: number;
}

export interface GameState {
  time: number;
  status: 'playing' | 'gameover' | 'victory';
  /** The map editor's live preview: units can be driven, but there are no waves and enemies stand still. */
  sandbox: boolean;
  soldiers: Soldier[];
  players: Player[];
  /** The player at this keyboard; its `controlledId` is the unit under direct control. */
  localPlayerId: string;
  nextSoldierId: number;
  vehicles: Vehicle[];
  nextVehicleId: number;
  animals: Animal[];
  /** How the whole squad is moving/shooting, set by the controlled player's keys. */
  stance: Stance;
  zombies: Zombie[];
  nextZombieId: number;
  crates: Crate[];
  nextCrateId: number;
  pickups: Pickup[];
  nextPickupId: number;
  gold: number;
  xp: number;
  /** Perk stacks taken so far, by perk id, and the multipliers they add up to. */
  upgrades: Record<string, number>;
  mods: Mods;
  /** Level-ups whose perk has not been picked yet; the current choices are in `perkOffer`. */
  pendingPerks: number;
  perkOffer: string[] | null;
  /** Times each shop item was bought (prices grow with it). */
  purchases: Record<string, number>;
  wave: number;
  kills: number;
  /** Mini bosses killed so far (story objectives). */
  bossKills: number;
  /** One flag per story objective of the map; a done one stays done. */
  objectivesDone: boolean[];
  spawner: Spawner;
  rng: Rng;
  /** Events produced by the last step; cleared at the start of each step. */
  events: SimEvent[];
}

export interface Input {
  /** For the controlled soldier. Desired movement on the ground plane; magnitude above 1 is normalized. */
  move: Vec2;
  /** World-space point on the ground the player is aiming at. */
  aim: Vec2;
  firing: boolean;
  /** Squad-wide stances: crouch takes priority over sprint. */
  crouch: boolean;
  sprint: boolean;
  /** Only the controlled soldier jumps. */
  jump: boolean;
}
