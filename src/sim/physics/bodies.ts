/** What the lab and its renderer share with `rapierWorld.ts`, without importing Rapier (its WASM stays out of the main bundle). */

/** How many free bodies the world holds. */
export const BODY_CAPACITY = 8192;

export const KIND_BALL = 0;
export const KIND_BOX = 1;
export const KIND_LIMB = 2;

/** Every number the lab panel can turn live. Metres, seconds, kilograms. */
export interface RapierParams {
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
}

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

/** A ragdoll: the ids of its capsule bodies in the world. */
export interface RapierRagdoll {
  /** Ten bodies: torso, head, upper arm L, forearm L, upper arm R, forearm R, thigh L, shin L, thigh R, shin R. */
  bodies: number[];
  scale: number;
}
