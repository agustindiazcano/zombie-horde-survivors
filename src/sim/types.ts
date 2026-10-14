import type { Rng } from './rng';
import type { Vec2 } from './vec';

/** Animation-relevant zombie states; the renderer maps these to clip names. */
export type ZombieState = 'walk' | 'attack' | 'death';

/** What an AI-driven soldier is doing. Only the controlled soldier ignores its order. */
export type SoldierOrder =
  { type: 'follow' } | { type: 'move'; x: number; z: number } | { type: 'hold' };

export type Stance = 'normal' | 'crouch' | 'sprint';

export type UnitKind = 'soldier' | 'drone';

export interface Soldier {
  id: number;
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
  /** Equipped weapon id ('rifle', 'pistol', 'heavy_mg', 'drone_cannon'). */
  weapon: string;
  /** Carried weapon ids, up to `inventory.backpackSlots`. */
  backpack: string[];
}

export interface Zombie {
  id: number;
  pos: Vec2;
  prev: Vec2;
  facing: number;
  /** Enemy variant id ('zombie', 'alien', ...). Picks the model and the stats below. */
  type: string;
  health: number;
  maxHealth: number;
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

/** A dropped container of weapons on the ground. */
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
  | { type: 'zombieKilled'; id: number; enemy: string; pos: Vec2; exploded: boolean }
  | { type: 'pickupCollected'; kind: 'gold' | 'xp'; amount: number; pos: Vec2 }
  | { type: 'levelUp'; level: number }
  | { type: 'crateDropped'; crateId: number; pos: Vec2 }
  | { type: 'soldierHurt'; soldierId: number; damage: number; zombieId: number }
  | { type: 'soldierDied'; soldierId: number }
  | { type: 'waveStarted'; wave: number }
  | { type: 'gameOver' };

export interface GameState {
  time: number;
  status: 'playing' | 'gameover';
  soldiers: Soldier[];
  /** The soldier under direct control, or null in RTS mode. */
  controlledId: number | null;
  nextSoldierId: number;
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
  wave: number;
  kills: number;
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
