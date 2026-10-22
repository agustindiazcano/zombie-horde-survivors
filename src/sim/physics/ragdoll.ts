import { nextFloat, type Rng } from '../rng';
import { KIND_RAGDOLL, type PhysicsWorld } from './world';

/** The eleven joints of a ragdoll, in the order the arrays use. */
export const NODE = {
  head: 0,
  chest: 1,
  pelvis: 2,
  elbowL: 3,
  handL: 4,
  elbowR: 5,
  handR: 6,
  kneeL: 7,
  footL: 8,
  kneeR: 9,
  footR: 10,
} as const;
export const NODE_COUNT = 11;

export interface NodeDef {
  /** Rest position in metres: feet on the floor, facing +Z, arms out to the sides. */
  rest: readonly [number, number, number];
  radius: number;
  mass: number;
}

/** A person 1.7 m tall at scale 1. Radii are chunky on purpose: thin spheres tunnel at blast speed. */
export const NODES: readonly NodeDef[] = [
  { rest: [0, 1.62, 0], radius: 0.2, mass: 0.9 },
  { rest: [0, 1.3, 0], radius: 0.24, mass: 2.2 },
  { rest: [0, 0.95, 0], radius: 0.22, mass: 1.8 },
  { rest: [-0.4, 1.28, 0], radius: 0.13, mass: 0.6 },
  { rest: [-0.75, 1.28, 0], radius: 0.12, mass: 0.4 },
  { rest: [0.4, 1.28, 0], radius: 0.13, mass: 0.6 },
  { rest: [0.75, 1.28, 0], radius: 0.12, mass: 0.4 },
  { rest: [-0.13, 0.5, 0], radius: 0.14, mass: 1.1 },
  { rest: [-0.13, 0.14, 0], radius: 0.13, mass: 0.8 },
  { rest: [0.13, 0.5, 0], radius: 0.14, mass: 1.1 },
  { rest: [0.13, 0.14, 0], radius: 0.13, mass: 0.8 },
];

/** Bones: the two joints and how stiff the bone is (the last three keep the body from folding up). */
const BONES: readonly (readonly [number, number, number])[] = [
  [NODE.head, NODE.chest, 0.9],
  [NODE.chest, NODE.pelvis, 0.9],
  [NODE.chest, NODE.elbowL, 0.8],
  [NODE.elbowL, NODE.handL, 0.8],
  [NODE.chest, NODE.elbowR, 0.8],
  [NODE.elbowR, NODE.handR, 0.8],
  [NODE.pelvis, NODE.kneeL, 0.85],
  [NODE.kneeL, NODE.footL, 0.85],
  [NODE.pelvis, NODE.kneeR, 0.85],
  [NODE.kneeR, NODE.footR, 0.85],
  [NODE.head, NODE.pelvis, 0.4],
  [NODE.kneeL, NODE.kneeR, 0.3],
  [NODE.elbowL, NODE.elbowR, 0.3],
];
export const BONE_COUNT = BONES.length;

export interface Ragdoll {
  /** The group id: the bodies of one ragdoll do not push each other. */
  group: number;
  /** Body ids in the `NODE` order. */
  bodies: number[];
  /** The scale it was made at (rest lengths and radii follow it). */
  scale: number;
}

export interface RagdollOptions {
  /** Where the joints start, `NODE_COUNT * 3` world coordinates (x, y, z each); default: the rest pose. */
  pose?: ArrayLike<number>;
  /** Radius (m) of the chest and pelvis spheres, for a model thicker than the generic person. */
  torsoRadius?: number;
  /** Takes the bone lengths from `pose` (a real model's proportions) instead of the generic rest pose. */
  restFromPose?: boolean;
  /** Starting velocity of every joint. */
  velocity?: readonly [number, number, number];
  /** Adds a small random speed to every joint, so a pile of them does not stack perfectly. */
  jitter?: { rng: Rng; speed: number };
}

/**
 * Builds a ragdoll standing at (x, z) with its feet at height `y`, turned `yaw` radians and
 * scaled by `scale`. Bone lengths come from the rest pose, never from `options.pose`, so a bent
 * starting pose settles toward the real proportions. Returns null if the pool is too full.
 */
export function spawnRagdoll(
  world: PhysicsWorld,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  scale = 1,
  options: RagdollOptions = {},
): Ragdoll | null {
  if (world.count + NODE_COUNT > world.capacity) return null;
  if (world.conCount + BONE_COUNT > world.conCapacity) return null;
  const group = world.nextGroup++;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const bodies: number[] = [];
  const rest: [number, number, number][] = [];
  for (let n = 0; n < NODE_COUNT; n++) {
    const def = NODES[n]!;
    const [rx, ry, rz] = def.rest;
    // Turning about the vertical axis; +Z is the facing at yaw 0.
    const wx = rx * cos + rz * sin;
    const wz = -rx * sin + rz * cos;
    rest.push([wx * scale, ry * scale, wz * scale]);
    const o = options.pose;
    const id = world.addBody(
      o ? o[n * 3]! : x + wx * scale,
      o ? o[n * 3 + 1]! : y + ry * scale,
      o ? o[n * 3 + 2]! : z + wz * scale,
      n === NODE.chest || n === NODE.pelvis
        ? Math.max(def.radius * scale, options.torsoRadius ?? 0)
        : def.radius * scale,
      def.mass * scale * scale * scale,
      KIND_RAGDOLL,
      group,
    );
    bodies.push(id);
    const v = options.velocity;
    const j = options.jitter;
    world.vx[id] = (v?.[0] ?? 0) + (j ? (nextFloat(j.rng) - 0.5) * 2 * j.speed : 0);
    world.vy[id] = (v?.[1] ?? 0) + (j ? (nextFloat(j.rng) - 0.5) * 2 * j.speed : 0);
    world.vz[id] = (v?.[2] ?? 0) + (j ? (nextFloat(j.rng) - 0.5) * 2 * j.speed : 0);
  }
  const pose = options.restFromPose ? options.pose : undefined;
  for (const [a, b, stiffness] of BONES) {
    const ra = rest[a]!;
    const rb = rest[b]!;
    const length = pose
      ? Math.hypot(
          pose[b * 3]! - pose[a * 3]!,
          pose[b * 3 + 1]! - pose[a * 3 + 1]!,
          pose[b * 3 + 2]! - pose[a * 3 + 2]!,
        )
      : Math.hypot(rb[0] - ra[0], rb[1] - ra[1], rb[2] - ra[2]);
    world.addConstraint(bodies[a]!, bodies[b]!, length, stiffness);
  }
  return { group, bodies, scale };
}

/** The bones as joint pairs, for drawing them. */
export const ragdollBones = (): readonly (readonly [number, number, number])[] => BONES;
