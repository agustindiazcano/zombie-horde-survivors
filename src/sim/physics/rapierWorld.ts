import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { Arena } from '../config';
import { OBSTACLE_HEIGHT } from '../constants';
import { nextFloat, type Rng } from '../rng';
import { oceanFlowAt, oceanHeight, type OceanParams } from '../ocean';
import {
  BALL_MASS,
  BALL_RADIUS,
  BODY_CAPACITY,
  BOX_HALF,
  BOX_MASS,
  DEFAULT_RAPIER_PARAMS,
  KIND_BALL,
  KIND_BOX,
  KIND_LIMB,
  PERSON_MASS,
  type RapierParams,
  type RapierRagdoll,
} from './bodies';
import { NODE, NODES } from './ragdoll';
import { hypot, hypot3 } from '../vec';

export * from './bodies';

/**
 * Rapier (the deterministic build, `@dimforge/rapier3d-deterministic-compat`) behind the same
 * flat-array view the lab renders from. Pure: no Three.js, no DOM, no clock, no `Math.random`;
 * one `step()` is one fixed 1/60 s world step, bodies are created in call order, so the same
 * calls give the same state hash (`npm run check:rapier`, `npm run bench:physics`).
 *
 * Boxes and balls are free rigid bodies with rotation. A ragdoll is ten capsule bodies joined by
 * spherical and hinge joints (knees and elbows bend one way only); its eleven joint positions
 * (`NODE` order) are read back with `ragdollNodes` to pose a model's bones. Live units stay on
 * the sim's own 2D collision: nothing here moves them.
 */

/** The saturation that keeps the 1/d blast finite at the centre (PHYSICS.md section 5). */
const SATURATION = 0.25;
/** Divides the blast formula into a speed change in m/s. */
const BLAST_SCALE = 10;
const BLAST_LIFT = 18;
const BLAST_MAX_SPEED = 60;
/** The arena walls are this tall (m). */
const WALL_HEIGHT = 60;

/** The bones of a ragdoll as [from joint, to joint]: one capsule body each, in `RapierRagdoll.bodies` order. */
const LIMBS: readonly (readonly [number, number])[] = [
  [NODE.pelvis, NODE.chest],
  [NODE.chest, NODE.head],
  [NODE.chest, NODE.elbowL],
  [NODE.elbowL, NODE.handL],
  [NODE.chest, NODE.elbowR],
  [NODE.elbowR, NODE.handR],
  [NODE.pelvis, NODE.kneeL],
  [NODE.kneeL, NODE.footL],
  [NODE.pelvis, NODE.kneeR],
  [NODE.kneeR, NODE.footR],
];
/** Mass share of each limb (of `PERSON_MASS`): from the node masses of `ragdoll.ts`. */
const LIMB_MASS: readonly number[] = LIMBS.map(([, b], i) =>
  i === 0 ? NODES[NODE.pelvis]!.mass + NODES[NODE.chest]!.mass : NODES[b]!.mass,
);
const MASS_TOTAL = LIMB_MASS.reduce((s, m) => s + m, 0);

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** The turn that takes +Y onto the unit vector (dx, dy, dz). */
function turnYTo(dx: number, dy: number, dz: number): Quat {
  // cross((0,1,0), d) = (dz, 0, -dx), the angle gives w = 1 + dot.
  if (dy < -0.99999) return { x: 1, y: 0, z: 0, w: 0 };
  const w = 1 + dy;
  const n = hypot3(dz, dx, w);
  return { x: dz / n, y: 0, z: -dx / n, w: w / n };
}

/** `v` turned by the unit quaternion `q`. */
function rotate(q: Quat, vx: number, vy: number, vz: number): [number, number, number] {
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx),
  ];
}

/** Water the free bodies float in (the Map 13 ocean): the calm level, the ground under a point and the wave numbers. */
export interface RapierOcean {
  params: OceanParams;
  level: number;
  groundAt: (x: number, z: number) => number;
}

/** A body sinks this fraction of its radius before the water starts to lift it. */
const FLOAT_OFFSET = 0.35;

let ready: Promise<void> | null = null;

/** Whirlpool geyser: sunk deeper than this under the calm level (m), inside this scaled radius of the core. */
const GEYSER_DEPTH = 5;
const GEYSER_CORE = 6;
/** Launch speed (m/s, plus 8 per unit of whirlpool strength) and sideways kick (m/s). */
const GEYSER_SPEED = 14;
const GEYSER_SIDE = 4;

export class RapierWorld {
  static async create(): Promise<RapierWorld> {
    ready ??= RAPIER.init();
    await ready;
    return new RapierWorld();
  }

  params: RapierParams = { ...DEFAULT_RAPIER_PARAMS };
  readonly capacity = BODY_CAPACITY;
  /** Position of each body (x, y, z), refreshed by every `step`. */
  readonly pos = new Float32Array(BODY_CAPACITY * 3);
  /** Rotation of each body (x, y, z, w). */
  readonly rot = new Float32Array(BODY_CAPACITY * 4);
  /** Shape size: ball (radius), box (half x, y, z), limb (radius, half length). */
  readonly size = new Float32Array(BODY_CAPACITY * 3);
  readonly kind = new Uint8Array(BODY_CAPACITY);
  /** 1 while Rapier has the body asleep. */
  readonly asleep = new Uint8Array(BODY_CAPACITY);
  /** The ragdoll of a limb, or -1. */
  readonly group = new Int32Array(BODY_CAPACITY).fill(-1);
  count = 0;
  /** The water the bodies float in, or null for none; `oceanTime` (s) is the sim clock the waves run on. */
  ocean: RapierOcean | null = null;
  oceanTime = 0;
  /** The limb bodies per ragdoll: how many ragdolls were made. */
  nextGroup = 0;
  /** Bodies that are asleep (a number to watch). */
  sleeping = 0;

  private readonly world: RAPIER.World;
  private readonly bodies: RAPIER.RigidBody[] = [];
  /** The colliders of the free bodies (the sliders write friction and bounce into them). */
  private readonly colliders: RAPIER.Collider[] = [];
  /** The bodies and colliders of the fixed scenery. */
  private readonly statics: RAPIER.RigidBody[] = [];
  private readonly sceneColliders: RAPIER.Collider[] = [];
  /** The parameters last written into Rapier, so a step only touches what changed. */
  private applied: RapierParams | null = null;
  private readonly groupOfCollider = new Map<number, number>();
  /** The axis of each limb in its own body (unit) and its half length (m). */
  readonly limbAxis = new Float32Array(BODY_CAPACITY * 4);
  private readonly hooks: RAPIER.PhysicsHooks = {
    // Bones of one ragdoll never collide with each other; everything else does.
    filterContactPair: (c1, c2) => {
      const g1 = this.groupOfCollider.get(c1);
      return g1 !== undefined && g1 === this.groupOfCollider.get(c2)
        ? null
        : RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: () => true,
  };

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -DEFAULT_RAPIER_PARAMS.gravity, z: 0 });
    this.world.timestep = 1 / 60;
    this.world.integrationParameters.numSolverIterations = this.params.solverIterations;
  }

  /** Rebuilds the fixed scenery: the ground (height grid), every prop box and the four arena walls. */
  setArena(arena: Arena): void {
    for (const s of this.statics) this.world.removeRigidBody(s);
    this.statics.length = 0;
    this.sceneColliders.length = 0;
    const half = arena.halfSize;
    const fixed = (x: number, y: number, z: number): RAPIER.RigidBody => {
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
      this.statics.push(b);
      return b;
    };
    const add = (desc: RAPIER.ColliderDesc, body: RAPIER.RigidBody): void => {
      this.sceneColliders.push(this.world.createCollider(this.material(desc), body));
    };

    const heights = arena.terrain.heights;
    const last = (heights?.length ?? 0) - 1;
    const ground = fixed(0, 0, 0);
    if (heights && last >= 1) {
      // heights[row][col] is at z = row - half, x = col - half; Rapier wants column-major.
      const flat = new Float32Array((last + 1) * (last + 1));
      for (let row = 0; row <= last; row++)
        for (let col = 0; col <= last; col++) flat[row + col * (last + 1)] = heights[row]![col]!;
      add(RAPIER.ColliderDesc.heightfield(last, last, flat, { x: last, y: 1, z: last }), ground);
    } else {
      add(RAPIER.ColliderDesc.cuboid(half, 5, half).setTranslation(0, -5, 0), ground);
    }
    for (const o of arena.obstacles) {
      if (o.water || o.passShots) continue;
      const top = o.height ?? OBSTACLE_HEIGHT;
      // A prop stands from below the ground up to its top, whatever the slope under it.
      const bottom = -2;
      const body = fixed(o.x, (top + bottom) / 2, o.z);
      add(RAPIER.ColliderDesc.cuboid(o.halfW, (top - bottom) / 2, o.halfD), body);
    }
    const wall = (x: number, z: number, hx: number, hz: number): void =>
      add(RAPIER.ColliderDesc.cuboid(hx, WALL_HEIGHT / 2, hz), fixed(x, WALL_HEIGHT / 2, z));
    wall(-half - 1, 0, 1, half + 2);
    wall(half + 1, 0, 1, half + 2);
    wall(0, -half - 1, half + 2, 1);
    wall(0, half + 1, half + 2, 1);
    this.world.step();
  }

  /** Removes every free body and ragdoll (the scenery stays). */
  clear(): void {
    for (const b of this.bodies) this.world.removeRigidBody(b);
    this.bodies.length = 0;
    this.groupOfCollider.clear();
    this.colliders.length = 0;
    this.count = 0;
    this.nextGroup = 0;
    this.sleeping = 0;
    this.group.fill(-1);
  }

  /** Gravity and the sliders: call before `step` when a parameter may have changed. */
  applyParams(): void {
    const p = this.params;
    const a = this.applied;
    if (a && a.gravity === p.gravity) {
      if (
        a.friction === p.friction &&
        a.restitution === p.restitution &&
        a.linearDamping === p.linearDamping &&
        a.angularDamping === p.angularDamping &&
        a.solverIterations === p.solverIterations
      )
        return;
    }
    this.applied = { ...p };
    this.world.gravity = { x: 0, y: -p.gravity, z: 0 };
    this.world.integrationParameters.numSolverIterations = Math.max(
      1,
      Math.round(p.solverIterations),
    );
    for (const c of [...this.sceneColliders, ...this.colliders]) {
      c.setFriction(p.friction);
      c.setRestitution(p.restitution);
    }
    for (const b of this.bodies) {
      b.setLinearDamping(p.linearDamping);
      b.setAngularDamping(p.angularDamping);
    }
  }

  private material(desc: RAPIER.ColliderDesc): RAPIER.ColliderDesc {
    return desc.setFriction(this.params.friction).setRestitution(this.params.restitution);
  }

  private dynamic(
    x: number,
    y: number,
    z: number,
    kind: number,
    s0: number,
    s1: number,
    s2: number,
  ): { id: number; desc: RAPIER.RigidBodyDesc } | null {
    if (this.count >= BODY_CAPACITY) return null;
    const id = this.count++;
    this.kind[id] = kind;
    this.size[id * 3] = s0;
    this.size[id * 3 + 1] = s1;
    this.size[id * 3 + 2] = s2;
    this.group[id] = -1;
    return {
      id,
      desc: RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(this.params.linearDamping)
        .setAngularDamping(this.params.angularDamping)
        .setCcdEnabled(true),
    };
  }

  private register(
    id: number,
    desc: RAPIER.RigidBodyDesc,
    shape: RAPIER.ColliderDesc,
  ): RAPIER.RigidBody {
    const body = this.world.createRigidBody(desc);
    this.bodies[id] = body;
    this.colliders.push(this.world.createCollider(this.material(shape), body));
    const t = body.translation();
    const r = body.rotation();
    this.pos.set([t.x, t.y, t.z], id * 3);
    this.rot.set([r.x, r.y, r.z, r.w], id * 4);
    return body;
  }

  /** A ball of radius `r`; returns its id, or -1 when the pool is full. */
  addBall(
    x: number,
    y: number,
    z: number,
    r = BALL_RADIUS,
    mass = BALL_MASS,
    velocity?: readonly [number, number, number],
  ): number {
    const d = this.dynamic(x, y, z, KIND_BALL, r, r, r);
    if (!d) return -1;
    if (velocity) d.desc.setLinvel(velocity[0], velocity[1], velocity[2]);
    this.register(d.id, d.desc, RAPIER.ColliderDesc.ball(r).setMass(mass));
    return d.id;
  }

  /** A box with half sides (hx, hy, hz), turned `yaw` about the vertical; returns its id or -1. */
  addBox(
    x: number,
    y: number,
    z: number,
    hx = BOX_HALF,
    hy = BOX_HALF,
    hz = BOX_HALF,
    yaw = 0,
    mass = BOX_MASS,
  ): number {
    const d = this.dynamic(x, y, z, KIND_BOX, hx, hy, hz);
    if (!d) return -1;
    d.desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    this.register(d.id, d.desc, RAPIER.ColliderDesc.cuboid(hx, hy, hz).setMass(mass));
    return d.id;
  }

  /**
   * A ragdoll: `pose` is the eleven joints (x, y, z each, `NODE` order); `scale` sizes radii and
   * masses (1 is a 1.7 m, 80 kg person). Returns null when the pool is too full.
   */
  addRagdoll(
    pose: ArrayLike<number>,
    scale = 1,
    options: {
      torsoRadius?: number;
      /** The turn about the vertical the pose was made at (the knee hinges follow it). */
      yaw?: number;
      velocity?: readonly [number, number, number];
      jitter?: { rng: Rng; speed: number };
    } = {},
  ): RapierRagdoll | null {
    if (this.count + LIMBS.length > BODY_CAPACITY) return null;
    const group = this.nextGroup++;
    const ids: number[] = [];
    const joint = (n: number): [number, number, number] => [
      pose[n * 3]!,
      pose[n * 3 + 1]!,
      pose[n * 3 + 2]!,
    ];
    LIMBS.forEach(([a, b], i) => {
      const pa = joint(a);
      const pb = joint(b);
      const dx = pb[0] - pa[0];
      const dy = pb[1] - pa[1];
      const dz = pb[2] - pa[2];
      const len = Math.max(hypot3(dx, dy, dz), 0.05);
      const ux = dx / len;
      const uy = dy / len;
      const uz = dz / len;
      const torso = i === 0;
      const radius = Math.min(
        torso
          ? Math.max(NODES[NODE.chest]!.radius * scale, options.torsoRadius ?? 0)
          : i === 1
            ? NODES[NODE.head]!.radius * scale
            : NODES[b]!.radius * scale * 0.8,
        len * 0.45 + (torso ? 0.3 : 0),
      );
      const half = Math.max(len / 2 - radius, 0.01);
      const d = this.dynamic(
        (pa[0] + pb[0]) / 2,
        (pa[1] + pb[1]) / 2,
        (pa[2] + pb[2]) / 2,
        KIND_LIMB,
        radius,
        len / 2,
        0,
      )!;
      this.group[d.id] = group;
      this.limbAxis[d.id * 4] = ux;
      this.limbAxis[d.id * 4 + 1] = uy;
      this.limbAxis[d.id * 4 + 2] = uz;
      this.limbAxis[d.id * 4 + 3] = len / 2;
      const v = options.velocity;
      const j = options.jitter;
      d.desc.setLinvel(
        (v?.[0] ?? 0) + (j ? (nextFloat(j.rng) - 0.5) * 2 * j.speed : 0),
        (v?.[1] ?? 0) + (j ? (nextFloat(j.rng) - 0.5) * 2 * j.speed : 0),
        (v?.[2] ?? 0) + (j ? (nextFloat(j.rng) - 0.5) * 2 * j.speed : 0),
      );
      // The body stays unturned, so every joint frame is the world frame at creation; the
      // capsule is turned inside it to lie along the bone.
      const mass = (PERSON_MASS * scale * scale * scale * LIMB_MASS[i]!) / MASS_TOTAL;
      const shape = RAPIER.ColliderDesc.capsule(half, radius)
        .setRotation(turnYTo(ux, uy, uz))
        .setMass(mass)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
      this.register(d.id, d.desc, shape);
      this.groupOfCollider.set(this.colliders[this.colliders.length - 1]!.handle, group);
      ids.push(d.id);
    });

    // Joints, in the body-local frame (the bodies are unturned, so it is the world offset).
    const tie = (
      from: number,
      to: number,
      at: number,
      hinge?: { axis: [number, number, number]; min: number; max: number },
    ): void => {
      const ba = this.bodies[ids[from]!]!;
      const bb = this.bodies[ids[to]!]!;
      const p = joint(at);
      const ta = ba.translation();
      const tb = bb.translation();
      const anchorA = { x: p[0] - ta.x, y: p[1] - ta.y, z: p[2] - ta.z };
      const anchorB = { x: p[0] - tb.x, y: p[1] - tb.y, z: p[2] - tb.z };
      const data = hinge
        ? RAPIER.JointData.revolute(anchorA, anchorB, {
            x: hinge.axis[0],
            y: hinge.axis[1],
            z: hinge.axis[2],
          })
        : RAPIER.JointData.spherical(anchorA, anchorB);
      const made = this.world.createImpulseJoint(data, ba, bb, true);
      if (hinge) (made as RAPIER.RevoluteImpulseJoint).setLimits(hinge.min, hinge.max);
    };
    const yaw = options.yaw ?? 0;
    const FLEX = 2.5;
    tie(0, 1, NODE.chest);
    tie(0, 2, NODE.chest);
    tie(2, 3, NODE.elbowL, { axis: [0, 1, 0], min: 0, max: FLEX });
    tie(0, 4, NODE.chest);
    tie(4, 5, NODE.elbowR, { axis: [0, 1, 0], min: -FLEX, max: 0 });
    tie(0, 6, NODE.pelvis);
    tie(6, 7, NODE.kneeL, { axis: [Math.cos(yaw), 0, -Math.sin(yaw)], min: 0, max: FLEX });
    tie(0, 8, NODE.pelvis);
    tie(8, 9, NODE.kneeR, { axis: [Math.cos(yaw), 0, -Math.sin(yaw)], min: 0, max: FLEX });
    return { bodies: ids, scale };
  }

  /** The eleven joint positions of a ragdoll (x, y, z each, `NODE` order) into `out`. */
  ragdollNodes(doll: RapierRagdoll, out: Float32Array | number[]): void {
    const put = (node: number, limb: number, end: 1 | -1): void => {
      const id = doll.bodies[limb]!;
      const q = {
        x: this.rot[id * 4]!,
        y: this.rot[id * 4 + 1]!,
        z: this.rot[id * 4 + 2]!,
        w: this.rot[id * 4 + 3]!,
      };
      const h = this.limbAxis[id * 4 + 3]! * end;
      const [rx, ry, rz] = rotate(
        q,
        this.limbAxis[id * 4]! * h,
        this.limbAxis[id * 4 + 1]! * h,
        this.limbAxis[id * 4 + 2]! * h,
      );
      out[node * 3] = this.pos[id * 3]! + rx;
      out[node * 3 + 1] = this.pos[id * 3 + 1]! + ry;
      out[node * 3 + 2] = this.pos[id * 3 + 2]! + rz;
    };
    put(NODE.pelvis, 0, -1);
    put(NODE.chest, 0, 1);
    put(NODE.head, 1, 1);
    put(NODE.elbowL, 2, 1);
    put(NODE.handL, 3, 1);
    put(NODE.elbowR, 4, 1);
    put(NODE.handR, 5, 1);
    put(NODE.kneeL, 6, 1);
    put(NODE.footL, 7, 1);
    put(NODE.kneeR, 8, 1);
    put(NODE.footR, 9, 1);
  }

  /** A shove: the speed of every free body within `radius` of (x, y, z) changes away from it. */
  explosion(x: number, y: number, z: number, radius: number, power = this.params.blastPower): void {
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3]! - x;
      const dy = this.pos[i * 3 + 1]! - y;
      const dz = this.pos[i * 3 + 2]! - z;
      const d = hypot3(dx, dy, dz);
      if (d >= radius) continue;
      const fall = 1 - d / radius;
      const dv = Math.min((power * fall) / (d + SATURATION) / BLAST_SCALE, BLAST_MAX_SPEED);
      const k = d > 1e-6 ? dv / d : 0;
      const body = this.bodies[i]!;
      const m = body.mass();
      body.applyImpulse(
        { x: dx * k * m, y: (dy * k + BLAST_LIFT * fall) * m, z: dz * k * m },
        true,
      );
    }
  }

  /**
   * The first thing a ray from (ox, oy, oz) along the unit vector (dx, dy, dz) hits within `max`
   * metres: the distance and the id of the free body (-1 for the scenery), or null.
   */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    max: number,
  ): { distance: number; body: number } | null {
    const hit = this.world.castRay(
      new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }),
      max,
      true,
    );
    if (!hit) return null;
    const handle = hit.collider.parent()?.handle;
    const body = handle === undefined ? -1 : this.bodies.findIndex((b) => b.handle === handle);
    return { distance: hit.timeOfImpact, body };
  }

  /** Mass of a body (kg). */
  massOf(id: number): number {
    return this.bodies[id]!.mass();
  }

  /** Velocity of a body (m/s). */
  velocityOf(id: number): { x: number; y: number; z: number } {
    return this.bodies[id]!.linvel();
  }

  /** Sets a body's velocity, waking it; `spin` false also stops it turning. */
  setVelocity(id: number, x: number, y: number, z: number, spin = true): void {
    const b = this.bodies[id]!;
    b.setLinvel({ x, y, z }, true);
    if (!spin) b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** A shove at a point of the body (it turns if the point is off its centre). */
  pushAt(id: number, ix: number, iy: number, iz: number, px: number, py: number, pz: number): void {
    this.bodies[id]!.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, { x: px, y: py, z: pz }, true);
  }

  /**
   * Archimedes for the free bodies: under the wave surface a body gets an upward acceleration of
   * `lift * gravity` times how deep it is (in body diameters, at most 1.6), its vertical speed is
   * damped and its horizontal speed is pulled towards the current. Positions are those of the last step.
   */
  private floatBodies(): void {
    const o = this.ocean;
    if (!o) return;
    const dt = this.world.timestep;
    const g = this.params.gravity;
    const flow = { x: 0, z: 0 };
    const pull = Math.min(1, o.params.drag * dt);
    const damp = Math.max(0, 1 - o.params.damping * dt);
    for (let i = 0; i < this.count; i++) {
      const kind = this.kind[i]!;
      const s0 = this.size[i * 3]!;
      const r = kind === KIND_BOX ? (s0 + this.size[i * 3 + 1]! + this.size[i * 3 + 2]!) / 3 : s0;
      const x = this.pos[i * 3]!;
      const y = this.pos[i * 3 + 1]!;
      const z = this.pos[i * 3 + 2]!;
      // The whirlpool geyser: a body that sank too deep in the core (the funnel leaves the floor bare) is shot out of it.
      if (o.params.geyser > 0 && y < o.level - GEYSER_DEPTH) {
        let shot = false;
        for (const w of o.params.vortices) {
          const dx = x - w.x;
          const dz = z - w.z;
          const d = hypot(dx, dz);
          if ((d * 14.5) / w.radius > GEYSER_CORE) continue;
          const v = this.bodies[i]!.linvel();
          this.bodies[i]!.setLinvel(
            {
              x: v.x + (dx / (d + 0.001)) * GEYSER_SIDE * o.params.geyser,
              y: (GEYSER_SPEED + 8 * w.strength) * o.params.geyser,
              z: v.z + (dz / (d + 0.001)) * GEYSER_SIDE * o.params.geyser,
            },
            true,
          );
          shot = true;
          break;
        }
        if (shot) continue;
      }
      const surface = oceanHeight(o.params, o.level, o.groundAt(x, z), x, z, this.oceanTime);
      const sunk = surface + r * FLOAT_OFFSET - y;
      if (sunk <= 0) continue;
      oceanFlowAt(o.params, x, z, flow);
      const body = this.bodies[i]!;
      const v = body.linvel();
      const ratio = Math.min(sunk / (r * 2), 1.6);
      const next = {
        x: v.x + (flow.x - v.x) * pull,
        y: (v.y + g * o.params.lift * ratio * dt) * damp,
        z: v.z + (flow.z - v.z) * pull,
      };
      body.setLinvel(next, true);
    }
  }

  /** One fixed 1/60 s step, then the flat arrays are refreshed. */
  step(): void {
    this.applyParams();
    this.floatBodies();
    this.world.step(undefined, this.hooks);
    this.sleeping = 0;
    for (let i = 0; i < this.count; i++) {
      const b = this.bodies[i]!;
      const t = b.translation();
      const r = b.rotation();
      this.pos[i * 3] = t.x;
      this.pos[i * 3 + 1] = t.y;
      this.pos[i * 3 + 2] = t.z;
      this.rot[i * 4] = r.x;
      this.rot[i * 4 + 1] = r.y;
      this.rot[i * 4 + 2] = r.z;
      this.rot[i * 4 + 3] = r.w;
      const s = b.isSleeping() ? 1 : 0;
      this.asleep[i] = s;
      this.sleeping += s;
    }
  }

  /** FNV-1a over the bits of every position and rotation: the same run gives the same number. */
  stateHash(): number {
    let h = 0x811c9dc5 ^ this.count;
    const mix = (v: number): void => {
      f32[0] = v;
      h = Math.imul(h ^ u32[0]!, 0x01000193) >>> 0;
    };
    for (let i = 0; i < this.count * 3; i++) mix(this.pos[i]!);
    for (let i = 0; i < this.count * 4; i++) mix(this.rot[i]!);
    return h >>> 0;
  }
}
