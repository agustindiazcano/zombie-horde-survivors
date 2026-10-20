import type { AccessorySlot, WeaponClass } from './config';
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
/** What the action key (E, or a click in RTS) can do to a thing in the world. */
export type InteractKind = 'object' | 'body' | 'crate' | 'door' | 'vehicle';

export type SoldierOrder =
  | { type: 'follow' }
  | { type: 'move'; x: number; z: number }
  | { type: 'board'; vehicleId: number }
  | { type: 'build'; structureId: number }
  | { type: 'interact'; kind: InteractKind; id: number }
  | { type: 'hold' };

export type Stance = 'normal' | 'walk' | 'crouch' | 'sprint';

export type UnitKind = 'soldier' | 'drone';

/** `count` of one item (an item id) sharing a backpack slot, up to the item's `stack`. */
export interface Reload {
  hand: Hand;
  /** The weapon being loaded; the reload is dropped if the hand holds anything else. */
  state: WeaponState;
  /** Seconds left. */
  left: number;
}

export interface Stack {
  item: string;
  count: number;
  /** Own state of a weapon in this slot (rounds loaded, fitted accessories); created when first needed. */
  state?: WeaponState;
}

/** What one weapon carries besides its item id: it travels with the weapon between slots and units. */
export interface WeaponState {
  /** Rounds in the magazine (no rule spends them yet). */
  loaded: number;
  /** Accessory item ids by weapon slot (none can be fitted yet). */
  accessories: Partial<Record<AccessorySlot, string>>;
}

/** The hands that can hold a weapon. */
export type Hand = 'rightHand' | 'leftHand';

/**
 * Hand and body slots; null is empty. A two-handed weapon sits in `rightHand` and leaves
 * `leftHand` empty. With both hands empty a unit has fists.
 */
export interface Equipment {
  rightHand: string | null;
  leftHand: string | null;
  chest: string | null;
}

/** Which multiplier a hit got: a head hit, a critical hit, or a plain body hit. */
export type HitKind = 'head' | 'crit' | 'body';

/**
 * The line of sight the player is aiming along in third and first person: where the camera is
 * (ground position and height) and the slope (rise per metre) of its view. A shot lands on this
 * line, so the height of the line at the target says whether it hit the head.
 */
export interface AimLine {
  x: number;
  z: number;
  height: number;
  slope: number;
}

/** Skill points spent so far, weapon expertise levels bought, the chosen class and its perk ranks. */
export interface Training {
  spent: number;
  expertise: Record<WeaponClass, number>;
  classId: string | null;
  ranks: Record<string, number>;
}

/** What a soldier is carrying: an object (to throw) or the body of a downed or dead ally. */
export interface Carry {
  kind: 'object' | 'body';
  id: number;
  /** Walking speed scale while it is held. */
  speed: number;
  weight: number;
}

/** A thing on the ground that can be lifted, thrown, shot and burnt (a barrel, a crate, a boulder). */
export interface GameObject {
  id: number;
  /** Key of `objects.types` in data/game.json. */
  type: string;
  pos: Vec2;
  /** Height of the object's base above the ground (flying or held). */
  y: number;
  health: number;
  /** The soldier holding it, or null. */
  heldBy: number | null;
  /** A throw in progress: where it started, where it lands, and seconds flown of the whole flight. */
  flight: { from: Vec2; to: Vec2; y0: number; time: number; flown: number; thrower: number } | null;
}

/** A fire. On bare ground it dies after `hazards.fire.duration`; on a host it burns until the host is gone. */
export interface Fire {
  id: number;
  x: number;
  z: number;
  /** Seconds burning; `life` is how long it may burn (Infinity for a map's own fires). */
  age: number;
  life: number;
  host: { kind: 'object' | 'structure'; id: number } | null;
  /** Seconds until it tries to spread. */
  spread: number;
}

export interface Soldier {
  id: number;
  /** What the skill points earned by levelling have bought. */
  training: Training;
  /** Id of the downed or dead ally this soldier drags by the shoulders, if any. */
  dragging: number | null;
  /** What it holds over its shoulders or head (an object to throw, or an ally's body), and the walking speed that costs. */
  carrying: Carry | null;
  /** The soldier that carries this body, or null. */
  carriedBy: number | null;
  /** The fire button was down last step (a throw needs a fresh press). */
  throwHeld: boolean;
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
  /** Whether the fire button was down last step, and a semi-automatic click waiting for the cooldown. */
  triggerHeld: boolean;
  triggerQueued: boolean;
  /** The reload in progress, if any (the gun cannot fire meanwhile). */
  reload: Reload | null;
  /** Aim error left over from recent shots (radians); it fades with time. */
  recoil: number;
  /** Holding aim down the sights; a hit breaks it until the aim button is released. */
  aiming: boolean;
  aimBroken: boolean;
  /** The line of sight of the controlled unit in a person view; null in top-down and for the AI. */
  aimLine: AimLine | null;
  /** Seconds without moving. */
  stillTime: number;
  /** Height above the ground (jumping) and vertical speed. */
  y: number;
  prevY: number;
  vy: number;
  order: SoldierOrder;
  /** What the unit holds and wears (item ids from data/items.json). */
  equipment: Equipment;
  /** State of the weapon in each hand; a missing entry means a fresh weapon (see `handState`). */
  weaponStates: Partial<Record<Hand, WeaponState>>;
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

/** A thrown grenade: it flies along an arc from `from` to `to`, then waits for its fuse. */
export interface Grenade {
  id: number;
  /** Item id in data/items.json (it holds the blast numbers). */
  item: string;
  throwerId: number;
  from: Vec2;
  to: Vec2;
  pos: Vec2;
  y: number;
  /** Seconds in the air in total, and seconds flown so far. */
  flight: number;
  flown: number;
  /** Seconds left until it goes off. */
  fuse: number;
}

/** A built (or being built) structure of build mode: a wall, a door, a turret... */
export interface Structure {
  id: number;
  /** Key of `structures.types` in data/game.json. */
  type: string;
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Quarter turns (0 to 3); odd ones swap the sides of the footprint. */
  turns: number;
  level: number;
  health: number;
  maxHealth: number;
  /** False while it is a blueprint: a ghost that does not block anyone. */
  built: boolean;
  /** Seconds of work done so far on a blueprint. */
  progress: number;
  /** A door that is open lets everyone through. */
  open: boolean;
  /** Turrets: seconds until the next shot and the direction they last aimed (radians, 0 = +z). */
  cooldown: number;
  facing: number;
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
  /** Seconds left stunned by a melee blow: it neither moves nor bites. */
  stagger: number;
  /** Acrobats: height above the ground, seconds left in the hop, side (-1, 0 up, 1) and the wait for the next. */
  y: number;
  hopLeft: number;
  hopSide: number;
  hopTimer: number;
  /** `wander`: roams near `home` until it notices the squad; `chase`: goes for the nearest target. */
  mode: 'wander' | 'chase';
  home: Vec2;
  /** A wanderer's roam point (null while it stands) and the seconds left walking to it or standing. */
  roam: Vec2 | null;
  roamTimer: number;
  /** Seconds a wanderer has waited after its wave finished spawning; it wakes up after a while. */
  restless: number;
  /** A hunter's memory: where it last saw the squad (null if never) and seconds since it last did. */
  lastSeen: Vec2 | null;
  unseen: number;
  deathTimer: number;
  /** Which limbs are still on, and the damage taken by each so far (it comes off past a threshold). */
  parts: Parts;
  wounds: { armL: number; armR: number; legs: number };
}

/** The limbs a marine can lose; `true` means it is still attached. */
export interface Parts {
  armL: boolean;
  armR: boolean;
  legs: boolean;
}
export type Limb = keyof Parts;
/** Where a hit landed. */
export type BodyZone = 'head' | 'torso' | 'arm' | 'leg';

/** A dropped container of items on the ground. */
export interface Crate {
  id: number;
  pos: Vec2;
  items: string[];
  /** State of a weapon in `items`, by the same index (a stashed weapon keeps its rounds). */
  states?: (WeaponState | undefined)[];
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
      /** Camera shake this shot adds for the shooter (from the weapon's recoil). */
      cameraKick: number;
      /** What the bullet did to the enemy it hit, or null on a miss. */
      hit: { kind: HitKind; damage: number } | null;
    }
  | {
      type: 'zombieKilled';
      id: number;
      enemy: string;
      pos: Vec2;
      exploded: boolean;
      /** What became of the head when a head hit killed: it burst or flew off; null if it stayed. */
      head: 'burst' | 'fly' | null;
      /** The soldier that landed the killing shot. */
      killerId: number | null;
      /** The kind of the killing hit. */
      hit: HitKind;
    }
  | {
      type: 'dismember';
      zombieId: number;
      enemy: string;
      /** The limb that came off. */
      part: Limb;
      pos: Vec2;
      /** Heading (radians, 0 = +z) the limb is thrown towards. */
      dir: number;
    }
  | { type: 'pickupCollected'; kind: 'gold' | 'xp'; amount: number; pos: Vec2 }
  | { type: 'levelUp'; level: number }
  | { type: 'crateDropped'; crateId: number; pos: Vec2 }
  | { type: 'soldierHurt'; soldierId: number; damage: number; zombieId: number }
  | { type: 'soldierDowned'; soldierId: number }
  | { type: 'soldierRevived'; soldierId: number; byId: number }
  | { type: 'soldierDied'; soldierId: number }
  | { type: 'vehicleDestroyed'; vehicleId: number; pos: Vec2 }
  | { type: 'dryFire'; shooterId: number }
  | {
      type: 'structureShot';
      structureId: number;
      from: Vec2;
      to: Vec2;
      hitZombieId: number | null;
    }
  | { type: 'structureBuilt'; structureId: number }
  | { type: 'objectThrown'; objectId: number; throwerId: number }
  | { type: 'objectLanded'; objectId: number; pos: Vec2 }
  | { type: 'objectDestroyed'; objectId: number; pos: Vec2; kind: string }
  | { type: 'fireStarted'; fireId: number; pos: Vec2 }
  | { type: 'tooHeavy'; soldierId: number; needed: number }
  | { type: 'crateReached'; soldierId: number; crateId: number }
  | { type: 'structureDestroyed'; structureId: number; pos: Vec2 }
  | {
      type: 'melee';
      attackerId: number;
      weapon: string;
      hitZombieId: number | null;
      hit: { kind: HitKind; damage: number } | null;
    }
  | { type: 'reloadStarted'; soldierId: number }
  | { type: 'grenadeThrown'; throwerId: number }
  | { type: 'explosion'; pos: Vec2; radius: number }
  | { type: 'waveStarted'; wave: number }
  | { type: 'bossSpawned'; wave: number; enemy: string }
  | { type: 'zombieAlerted'; id: number; pos: Vec2 }
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
  /** Build mode: structures and blueprints. */
  structures: Structure[];
  nextStructureId: number;
  /** Objects on the ground, in hands or in the air. */
  objects: GameObject[];
  nextObjectId: number;
  /** Fires burning now. */
  fires: Fire[];
  nextFireId: number;
  /** Grenades in the air or waiting for their fuse. */
  grenades: Grenade[];
  nextGrenadeId: number;
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
  /** Touch play: the trigger is held by the auto-aim, so semi-automatic guns keep firing. */
  autoTrigger?: boolean;
  /** The aim button is held (third and first person only). */
  aiming?: boolean;
  /** The camera's line of sight (third and first person only), for the height of a hit. */
  aimLine?: AimLine;
  /** Squad-wide stances: crouch takes priority over sprint. */
  crouch: boolean;
  sprint: boolean;
  /** Walk instead of run (the whole squad); crouch and sprint take priority. */
  walk?: boolean;
  /** Only the controlled soldier jumps. */
  jump: boolean;
}
