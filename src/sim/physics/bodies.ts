/** What the lab and its renderer share with both engines, without importing Rapier (its WASM stays out of the main bundle). */
import type { Arena } from '../config';
import type { OceanParams } from '../ocean';
import type { Rng } from '../rng';

/** How many free bodies the world holds. */
export const BODY_CAPACITY = 8192;

export const KIND_BALL = 0;
export const KIND_BOX = 1;
export const KIND_LIMB = 2;
/** A joint sphere of a ragdoll in the author's solver (Rapier draws a capsule limb instead). */
export const KIND_NODE = 3;
/** One of the 8 corner spheres of a box in the author's solver, other than the first (which stands for the box). Not drawn, not grabbed. */
export const KIND_PART = 4;

/** Every number the lab panel can turn live. Metres, seconds, kilograms. */
export type RapierParams = {
  gravity: number;
  /** Bounce (0 = dead stop), on every collider. */
  restitution: number;
  /** Coulomb friction, on every collider. */
  friction: number;
  /** Linear damping of free bodies and limbs (1/s). */
  linearDamping: number;
  /** Angular damping of free bodies and limbs (1/s). */
  angularDamping: number;
  /** Solver iterations per step: more holds stacks and joints tighter. */
  solverIterations: number;
  /** Blast strength: speed change = blastPower * (1 - d/R) / (d + SATURATION) / BLAST_SCALE. */
  blastPower: number;
};

export const DEFAULT_RAPIER_PARAMS: RapierParams = {
  gravity: 20,
  restitution: 0.3,
  friction: 0.8,
  linearDamping: 0.05,
  angularDamping: 0.6,
  solverIterations: 16,
  blastPower: 380,
};

/** Guesses, like every number of the lab: a 1 m crate, a 1 m ball, a 1.7 m person (kg). */
export const BOX_MASS = 25;
export const BALL_MASS = 6;
export const PERSON_MASS = 80;
/** The default ball radius (m) and box half side (m) of the lab. */
export const BALL_RADIUS = 0.5;
export const BOX_HALF = 0.5;

/** A ragdoll: the ids of its bodies in the world (Rapier: ten capsules; the author's solver: eleven joint spheres in `NODE` order). */
export interface RapierRagdoll {
  /** Rapier: torso, head, upper arm L, forearm L, upper arm R, forearm R, thigh L, shin L, thigh R, shin R. */
  bodies: number[];
  scale: number;
}

/** Water the free bodies float in (the Map 13 ocean): the calm level, the ground under a point and the wave numbers. */
export interface RapierOcean {
  params: OceanParams;
  level: number;
  groundAt: (x: number, z: number) => number;
}

/** A body sinks this fraction of its radius before the water starts to lift it. */
export const FLOAT_OFFSET = 0.35;
/** Whirlpool geyser: sunk deeper than this under the calm level (m), inside this scaled radius of the core. */
export const GEYSER_DEPTH = 5;
export const GEYSER_CORE = 6;
/** Launch speed (m/s, plus 8 per unit of whirlpool strength) and sideways kick (m/s). */
export const GEYSER_SPEED = 14;
export const GEYSER_SIDE = 4;

export type PhysicsEngineName = 'classic' | 'diaz-cano';

/** One slider of the lab panel. `log` puts it on a log10 scale (stiffness spans decades). */
export interface LabSlider {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  log?: boolean;
}

export const RAPIER_SLIDERS: readonly LabSlider[] = [
  { key: 'gravity', label: 'Gravedad', min: 0, max: 40, step: 0.5, digits: 1 },
  { key: 'restitution', label: 'Rebote', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'friction', label: 'Fricción', min: 0, max: 1.5, step: 0.05, digits: 2 },
  { key: 'linearDamping', label: 'Amort. lineal', min: 0, max: 2, step: 0.05, digits: 2 },
  { key: 'angularDamping', label: 'Amort. angular', min: 0, max: 5, step: 0.1, digits: 1 },
  { key: 'solverIterations', label: 'Iter. solver', min: 1, max: 40, step: 1, digits: 0 },
  { key: 'blastPower', label: 'Fuerza explosión', min: 0, max: 800, step: 10, digits: 0 },
];

/**
 * What the lab, the hands and the lab view use of a physics world. Two engines implement it:
 * `RapierWorld` (classic) and `DiazCanoWorld` (the author's solver). Bodies live in flat arrays,
 * `count` of them; the lab never holds an engine type.
 */
export interface LabWorld {
  readonly engine: PhysicsEngineName;
  readonly capacity: number;
  /** Position of each body (x, y, z), refreshed by every `step`. */
  readonly pos: Float32Array;
  /** Rotation of each body (x, y, z, w). */
  readonly rot: Float32Array;
  /** Shape size: ball (radius), box (half x, y, z), limb (radius, half length). */
  readonly size: Float32Array;
  readonly kind: Uint8Array;
  /** The ragdoll a body belongs to, or -1. */
  readonly group: Int32Array;
  /** The axis of each limb in its own body (unit) and its half length (m). */
  readonly limbAxis: Float32Array;
  readonly count: number;
  /** Bodies that are asleep (a number to watch). */
  readonly sleeping: number;
  /** False while the engine cannot make boxes yet. */
  readonly supportsBoxes: boolean;
  /** The numbers the sliders turn; the keys are those of `sliders`. */
  params: Record<string, number>;
  readonly sliders: readonly LabSlider[];
  readonly defaults: Readonly<Record<string, number>>;
  ocean: RapierOcean | null;
  oceanTime: number;

  setArena(arena: Arena): void;
  clear(): void;
  step(): void;
  stateHash(): number;
  addBall(
    x: number,
    y: number,
    z: number,
    r?: number,
    mass?: number,
    velocity?: readonly [number, number, number],
  ): number;
  addBox(
    x: number,
    y: number,
    z: number,
    hx?: number,
    hy?: number,
    hz?: number,
    yaw?: number,
    mass?: number,
  ): number;
  addRagdoll(
    pose: ArrayLike<number>,
    scale?: number,
    options?: {
      torsoRadius?: number;
      yaw?: number;
      velocity?: readonly [number, number, number];
      jitter?: { rng: Rng; speed: number };
    },
  ): RapierRagdoll | null;
  ragdollNodes(doll: RapierRagdoll, out: Float32Array | number[]): void;
  explosion(x: number, y: number, z: number, radius: number, power?: number): void;
  massOf(id: number): number;
  velocityOf(id: number): { x: number; y: number; z: number };
  setVelocity(id: number, x: number, y: number, z: number, spin?: boolean): void;
  pushAt(id: number, ix: number, iy: number, iz: number, px: number, py: number, pz: number): void;
}
