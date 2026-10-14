import type { Rng } from './rng';
import type { Vec2 } from './vec';

/** Animation-relevant zombie states; the renderer maps these to clip names. */
export type ZombieState = 'walk' | 'attack' | 'death';

/** What an AI-driven soldier is doing. Only the controlled soldier ignores its order. */
export type SoldierOrder =
  { type: 'follow' } | { type: 'move'; x: number; z: number } | { type: 'hold' };

export interface Soldier {
  id: number;
  pos: Vec2;
  /** Position at the start of the last step, for render interpolation. */
  prev: Vec2;
  /** Facing angle; direction is (sin, cos). */
  facing: number;
  health: number;
  dead: boolean;
  fireCooldown: number;
  order: SoldierOrder;
}

export interface Zombie {
  id: number;
  pos: Vec2;
  prev: Vec2;
  facing: number;
  health: number;
  /** Chase speed, fixed at spawn from the wave's difficulty scaling. */
  speed: number;
  state: ZombieState;
  attackTimer: number;
  deathTimer: number;
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
      from: Vec2;
      to: Vec2;
      hitZombieId: number | null;
    }
  | { type: 'zombieKilled'; id: number }
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
  zombies: Zombie[];
  nextZombieId: number;
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
}
