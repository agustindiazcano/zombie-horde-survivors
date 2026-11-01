import type { Arena } from '../config';
import { oceanFlowAt, oceanHeight } from '../ocean';
import { hypot } from '../vec';
import {
  BALL_MASS,
  BALL_RADIUS,
  BODY_CAPACITY,
  FLOAT_OFFSET,
  GEYSER_CORE,
  GEYSER_DEPTH,
  GEYSER_SIDE,
  GEYSER_SPEED,
  KIND_BALL,
  KIND_NODE,
  type LabSlider,
  type LabWorld,
  type RapierOcean,
  type RapierRagdoll,
} from './bodies';
import { NODE_COUNT, spawnRagdoll } from './ragdoll';
import { DEFAULT_PARAMS, KIND_RAGDOLL, PhysicsWorld } from './world';
import type { Rng } from '../rng';

/** Fixed step of the lab (s): the game steps at 60 Hz. */
const DT = 1 / 60;

/** The sliders of the author's solver: his own numbers (Hooke stiffness, sub-steps, passes), not Rapier's. */
export const DIAZ_CANO_SLIDERS: readonly LabSlider[] = [
  { key: 'gravity', label: 'Gravedad', min: 0, max: 40, step: 0.5, digits: 1 },
  { key: 'restitution', label: 'Rebote', min: 0, max: 1, step: 0.01, digits: 2 },
  {
    key: 'kHooke',
    label: 'Rigidez k (Hooke)',
    min: 1000,
    max: 10000000,
    step: 0.05,
    digits: 0,
    log: true,
  },
  { key: 'friction', label: 'Fricción', min: 0, max: 1.5, step: 0.05, digits: 2 },
  { key: 'airDrag', label: 'Arrastre aire', min: 0, max: 2, step: 0.01, digits: 2 },
  { key: 'substeps', label: 'Sub-pasos', min: 1, max: 10, step: 1, digits: 0 },
  { key: 'iterations', label: 'Pasadas', min: 1, max: 10, step: 1, digits: 0 },
  { key: 'blastPower', label: 'Fuerza explosión', min: 0, max: 800, step: 10, digits: 0 },
];

/**
 * The author's solver (`world.ts`: Hooke contacts, saturation 0.25, techniques 7 and 8) behind the
 * same view the lab and the hands use for Rapier. Pure: no Three.js, no DOM, no clock.
 *
 * The solver has spheres only, so: balls are spheres, a ragdoll is eleven joint spheres joined by
 * bones (`KIND_NODE`, drawn as balls or replaced by the model), nothing turns (the rotations stay
 * the identity), and boxes are not there yet (`supportsBoxes` is false until the 8-sphere boxes of
 * option A are built). `params` is the solver's own `PhysicsParams`.
 */
export class DiazCanoWorld implements LabWorld {
  readonly engine = 'diaz-cano' as const;
  readonly supportsBoxes = false;
  readonly sliders = DIAZ_CANO_SLIDERS;
  readonly defaults = DEFAULT_PARAMS;
  readonly capacity = BODY_CAPACITY;
  readonly solver = new PhysicsWorld(BODY_CAPACITY, 4096);
  readonly pos = new Float32Array(BODY_CAPACITY * 3);
  readonly rot = new Float32Array(BODY_CAPACITY * 4);
  readonly size = new Float32Array(BODY_CAPACITY * 3);
  readonly kind = new Uint8Array(BODY_CAPACITY);
  readonly group = this.solver.group;
  readonly limbAxis = new Float32Array(BODY_CAPACITY * 4);
  ocean: RapierOcean | null = null;
  oceanTime = 0;
  sleeping = 0;

  private arena: Arena | null = null;

  get count(): number {
    return this.solver.count;
  }

  get params(): Record<string, number> {
    return this.solver.params;
  }

  set params(p: Record<string, number>) {
    Object.assign(this.solver.params, p);
  }

  setArena(arena: Arena): void {
    this.arena = arena;
  }

  clear(): void {
    this.solver.clear();
    this.sleeping = 0;
  }

  /** Fills the flat arrays for bodies `from` up to the count; `shape` too when they are new. */
  private refresh(from: number, fresh: boolean): void {
    const s = this.solver;
    for (let i = from; i < s.count; i++) {
      this.pos[i * 3] = s.px[i]!;
      this.pos[i * 3 + 1] = s.py[i]!;
      this.pos[i * 3 + 2] = s.pz[i]!;
      if (!fresh) continue;
      this.rot[i * 4] = 0;
      this.rot[i * 4 + 1] = 0;
      this.rot[i * 4 + 2] = 0;
      this.rot[i * 4 + 3] = 1;
      const r = s.radius[i]!;
      this.size[i * 3] = r;
      this.size[i * 3 + 1] = r;
      this.size[i * 3 + 2] = r;
      this.kind[i] = s.kind[i] === KIND_RAGDOLL ? KIND_NODE : KIND_BALL;
    }
  }

  addBall(
    x: number,
    y: number,
    z: number,
    r = BALL_RADIUS,
    mass = BALL_MASS,
    velocity?: readonly [number, number, number],
  ): number {
    const id = this.solver.addBody(x, y, z, r, mass, KIND_BALL);
    if (id < 0) return -1;
    if (velocity) {
      this.solver.vx[id] = velocity[0];
      this.solver.vy[id] = velocity[1];
      this.solver.vz[id] = velocity[2];
    }
    this.refresh(id, true);
    return id;
  }

  /** Not built yet: boxes of 8 spheres are option A of the plan. */
  addBox(): number {
    return -1;
  }

  addRagdoll(
    pose: ArrayLike<number>,
    scale = 1,
    options: {
      torsoRadius?: number;
      yaw?: number;
      velocity?: readonly [number, number, number];
      jitter?: { rng: Rng; speed: number };
    } = {},
  ): RapierRagdoll | null {
    const from = this.solver.count;
    const doll = spawnRagdoll(this.solver, 0, 0, 0, options.yaw ?? 0, scale, {
      pose,
      restFromPose: true,
      torsoRadius: options.torsoRadius,
      velocity: options.velocity,
      jitter: options.jitter,
    });
    if (!doll) return null;
    this.refresh(from, true);
    return { bodies: doll.bodies, scale };
  }

  /** The eleven joints are the eleven spheres, in `NODE` order. */
  ragdollNodes(doll: RapierRagdoll, out: Float32Array | number[]): void {
    for (let n = 0; n < NODE_COUNT; n++) {
      const id = doll.bodies[n]!;
      out[n * 3] = this.pos[id * 3]!;
      out[n * 3 + 1] = this.pos[id * 3 + 1]!;
      out[n * 3 + 2] = this.pos[id * 3 + 2]!;
    }
  }

  explosion(x: number, y: number, z: number, radius: number, power?: number): void {
    this.solver.explosion(x, y, z, radius, power);
  }

  massOf(id: number): number {
    return 1 / this.solver.invMass[id]!;
  }

  velocityOf(id: number): { x: number; y: number; z: number } {
    const s = this.solver;
    return { x: s.vx[id]!, y: s.vy[id]!, z: s.vz[id]! };
  }

  setVelocity(id: number, x: number, y: number, z: number): void {
    const s = this.solver;
    s.wake(id);
    s.vx[id] = x;
    s.vy[id] = y;
    s.vz[id] = z;
  }

  /** Spheres do not turn, so the point of the push does not matter. */
  pushAt(id: number, ix: number, iy: number, iz: number): void {
    this.solver.impulse(id, ix, iy, iz);
  }

  /**
   * The same float rule as the Rapier lab (`RapierWorld.floatBodies`): under the wave surface a
   * body gets an upward acceleration of `lift * gravity` times how deep it is, its vertical speed
   * is damped and its horizontal speed is pulled towards the current.
   */
  private float(): void {
    const o = this.ocean;
    if (!o) return;
    const s = this.solver;
    const g = s.params.gravity;
    const flow = { x: 0, z: 0 };
    const pull = Math.min(1, o.params.drag * DT);
    const damp = Math.max(0, 1 - o.params.damping * DT);
    for (let i = 0; i < s.count; i++) {
      const r = s.radius[i]!;
      const x = s.px[i]!;
      const y = s.py[i]!;
      const z = s.pz[i]!;
      if (o.params.geyser > 0 && y < o.level - GEYSER_DEPTH) {
        let shot = false;
        for (const w of o.params.vortices) {
          const dx = x - w.x;
          const dz = z - w.z;
          const d = hypot(dx, dz);
          if ((d * 14.5) / w.radius > GEYSER_CORE) continue;
          s.wake(i);
          s.vx[i] = s.vx[i]! + (dx / (d + 0.001)) * GEYSER_SIDE * o.params.geyser;
          s.vy[i] = (GEYSER_SPEED + 8 * w.strength) * o.params.geyser;
          s.vz[i] = s.vz[i]! + (dz / (d + 0.001)) * GEYSER_SIDE * o.params.geyser;
          shot = true;
          break;
        }
        if (shot) continue;
      }
      const surface = oceanHeight(o.params, o.level, o.groundAt(x, z), x, z, this.oceanTime);
      const sunk = surface + r * FLOAT_OFFSET - y;
      if (sunk <= 0) continue;
      oceanFlowAt(o.params, x, z, flow);
      s.wake(i);
      const ratio = Math.min(sunk / (r * 2), 1.6);
      s.vx[i] = s.vx[i]! + (flow.x - s.vx[i]!) * pull;
      s.vy[i] = (s.vy[i]! + g * o.params.lift * ratio * DT) * damp;
      s.vz[i] = s.vz[i]! + (flow.z - s.vz[i]!) * pull;
    }
  }

  step(): void {
    if (!this.arena) return;
    this.float();
    this.solver.step(DT, this.arena);
    this.refresh(0, false);
    let asleep = 0;
    for (let i = 0; i < this.solver.count; i++) asleep += this.solver.sleeping[i]!;
    this.sleeping = asleep;
  }

  stateHash(): number {
    return this.solver.stateHash();
  }
}
