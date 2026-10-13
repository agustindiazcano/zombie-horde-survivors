import type { Rng } from './rng';
import type { Vec2 } from './vec';

/** Animation-relevant zombie states; the renderer maps these to clip names. */
export type ZombieState = 'walk' | 'attack' | 'death';

export interface Player {
  pos: Vec2;
  /** Position at the start of the last step, for render interpolation. */
  prev: Vec2;
  /** Facing angle; direction is (sin, cos). */
  facing: number;
  health: number;
  fireCooldown: number;
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
  | { type: 'shot'; from: Vec2; to: Vec2; hitZombieId: number | null }
  | { type: 'zombieKilled'; id: number }
  | { type: 'playerHurt'; damage: number; zombieId: number }
  | { type: 'waveStarted'; wave: number }
  | { type: 'gameOver' };

export interface GameState {
  time: number;
  status: 'playing' | 'gameover';
  player: Player;
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
  /** Desired movement on the ground plane; magnitude above 1 is normalized. */
  move: Vec2;
  /** World-space point on the ground the player is aiming at. */
  aim: Vec2;
  firing: boolean;
}
