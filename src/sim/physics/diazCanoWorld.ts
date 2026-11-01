import type { Arena } from '../config';
import { oceanFlowAt, oceanHeight } from '../ocean';
import { dcos, dsin } from '../dmath';
import { hypot, hypot3 } from '../vec';
import {
  BALL_MASS,
  BALL_RADIUS,
  BODY_CAPACITY,
  FLOAT_OFFSET,
  GEYSER_CORE,
  GEYSER_DEPTH,
  GEYSER_SIDE,
  GEYSER_SPEED,
  BOX_HALF,
  BOX_MASS,
  KIND_BALL,
  KIND_BOX,
  KIND_NODE,
  KIND_PART,
  type LabSlider,
  type LabWorld,
  type RapierOcean,
  type RapierRagdoll,
} from './bodies';
import { NODE_COUNT, spawnRagdoll } from './ragdoll';
import { DEFAULT_PARAMS, KIND_RAGDOLL, PhysicsWorld } from './world';
import type { Rng } from '../rng';

/** The corner spheres of a box have this share of its smallest half side as radius. */
const CORNER_SHARE = 0.5;
/** Stiffness of the box's rigid distances (share of the error fixed per pass). */
const BOX_STIFFNESS = 1;

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
  readonly supportsBoxes = true;
  readonly sliders = DIAZ_CANO_SLIDERS;
  readonly defaults = DEFAULT_PARAMS;
  readonly capacity = BODY_CAPACITY;
  readonly solver = new PhysicsWorld(BODY_CAPACITY, BODY_CAPACITY * 2);
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
  /** For every sphere of a box, the id of the box's first sphere (the box's id in the lab); -1 for the rest. */
  private readonly boxOf = new Int32Array(BODY_CAPACITY).fill(-1);

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
    this.boxOf.fill(-1);
    this.sleeping = 0;
  }

  /** Fills the flat arrays for bodies `from` up to the count; `shape` too when they are new. */
  private refresh(from: number, fresh: boolean): void {
    const s = this.solver;
    for (let i = from; i < s.count; i++) {
      if (this.boxOf[i]! >= 0) {
        if (this.boxOf[i] === i) this.refreshBox(i);
        else if (fresh) this.kind[i] = KIND_PART;
        continue;
      }
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

  /**
   * A box is 8 spheres at its corners (option A of the plan), joined by the 28 rigid distances
   * between them (12 edges, 12 face diagonals, 4 body diagonals) like the bones of a ragdoll, and
   * all in one group so they never push each other. The corner spheres have `CORNER_SHARE` of the
   * smallest half side as radius. The box's id is the id of its first sphere; its centre, rotation
   * and half sides are read back from the 8 spheres every step.
   */
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
    const s = this.solver;
    if (s.count + 8 > s.capacity || s.conCount + 28 > s.conCapacity) return -1;
    const rs = Math.min(hx, hy, hz) * CORNER_SHARE;
    const ax = hx - rs;
    const ay = hy - rs;
    const az = hz - rs;
    const cos = dcos(yaw);
    const sin = dsin(yaw);
    const group = s.nextGroup++;
    const first = s.count;
    const at: number[] = [];
    for (let c = 0; c < 8; c++) {
      const lx = c & 1 ? ax : -ax;
      const ly = c & 2 ? ay : -ay;
      const lz = c & 4 ? az : -az;
      at.push(lx * cos + lz * sin, ly, -lx * sin + lz * cos);
      const id = s.addBody(
        x + at[c * 3]!,
        y + at[c * 3 + 1]!,
        z + at[c * 3 + 2]!,
        rs,
        mass / 8,
        KIND_BALL,
        group,
      );
      if (id < 0) return -1;
      this.boxOf[id] = first;
    }
    for (let a = 0; a < 8; a++)
      for (let b = a + 1; b < 8; b++) {
        const d = hypot3(
          at[b * 3]! - at[a * 3]!,
          at[b * 3 + 1]! - at[a * 3 + 1]!,
          at[b * 3 + 2]! - at[a * 3 + 2]!,
        );
        s.addConstraint(first + a, first + b, d, BOX_STIFFNESS);
      }
    s.markBox(first);
    s.fitCell();
    this.refresh(first, true);
    this.size[first * 3] = hx;
    this.size[first * 3 + 1] = hy;
    this.size[first * 3 + 2] = hz;
    this.kind[first] = KIND_BOX;
    return first;
  }

  /** Centre and rotation of the box whose first sphere is `f`, from where its 8 spheres are now. */
  private refreshBox(f: number): void {
    const s = this.solver;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let ux = 0;
    let uy = 0;
    let uz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    for (let c = 0; c < 8; c++) {
      const px = s.px[f + c]!;
      const py = s.py[f + c]!;
      const pz = s.pz[f + c]!;
      cx += px;
      cy += py;
      cz += pz;
      const sx = c & 1 ? 1 : -1;
      const sy = c & 2 ? 1 : -1;
      ux += sx * px;
      uy += sx * py;
      uz += sx * pz;
      vx += sy * px;
      vy += sy * py;
      vz += sy * pz;
    }
    this.pos[f * 3] = cx / 8;
    this.pos[f * 3 + 1] = cy / 8;
    this.pos[f * 3 + 2] = cz / 8;
    // Gram-Schmidt on the x and y edges, z = x cross y: a proper rotation even while the bones flex.
    let l = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= l;
    uy /= l;
    uz /= l;
    const dot = vx * ux + vy * uy + vz * uz;
    vx -= dot * ux;
    vy -= dot * uy;
    vz -= dot * uz;
    l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    vx /= l;
    vy /= l;
    vz /= l;
    const wx = uy * vz - uz * vy;
    const wy = uz * vx - ux * vz;
    const wz = ux * vy - uy * vx;
    // The rotation matrix with columns u, v, w, as a quaternion.
    const tr = ux + vy + wz;
    let qx: number;
    let qy: number;
    let qz: number;
    let qw: number;
    if (tr > 0) {
      const k = Math.sqrt(tr + 1) * 2;
      qw = 0.25 * k;
      qx = (vz - wy) / k;
      qy = (wx - uz) / k;
      qz = (uy - vx) / k;
    } else if (ux > vy && ux > wz) {
      const k = Math.sqrt(1 + ux - vy - wz) * 2;
      qw = (vz - wy) / k;
      qx = 0.25 * k;
      qy = (vx + uy) / k;
      qz = (wx + uz) / k;
    } else if (vy > wz) {
      const k = Math.sqrt(1 + vy - ux - wz) * 2;
      qw = (wx - uz) / k;
      qx = (vx + uy) / k;
      qy = 0.25 * k;
      qz = (wy + vz) / k;
    } else {
      const k = Math.sqrt(1 + wz - ux - vy) * 2;
      qw = (uy - vx) / k;
      qx = (wx + uz) / k;
      qy = (wy + vz) / k;
      qz = 0.25 * k;
    }
    this.rot[f * 4] = qx;
    this.rot[f * 4 + 1] = qy;
    this.rot[f * 4 + 2] = qz;
    this.rot[f * 4 + 3] = qw;
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
    return (this.boxOf[id]! >= 0 ? 8 : 1) / this.solver.invMass[id]!;
  }

  velocityOf(id: number): { x: number; y: number; z: number } {
    const s = this.solver;
    if (this.boxOf[id]! < 0) return { x: s.vx[id]!, y: s.vy[id]!, z: s.vz[id]! };
    let x = 0;
    let y = 0;
    let z = 0;
    for (let c = 0; c < 8; c++) {
      x += s.vx[id + c]!;
      y += s.vy[id + c]!;
      z += s.vz[id + c]!;
    }
    return { x: x / 8, y: y / 8, z: z / 8 };
  }

  setVelocity(id: number, x: number, y: number, z: number): void {
    const s = this.solver;
    const n = this.boxOf[id]! >= 0 ? 8 : 1;
    for (let c = 0; c < n; c++) {
      s.wake(id + c);
      s.vx[id + c] = x;
      s.vy[id + c] = y;
      s.vz[id + c] = z;
    }
  }

  /**
   * A ball takes the impulse whole (it does not turn). A box shares it among its 8 spheres by how
   * near each is to the point, so the whole box gets `impulse / mass` and an off-centre push spins it.
   */
  pushAt(id: number, ix: number, iy: number, iz: number, px = 0, py = 0, pz = 0): void {
    const s = this.solver;
    if (this.boxOf[id]! < 0) {
      s.impulse(id, ix, iy, iz);
      return;
    }
    const w: number[] = [];
    let sum = 0;
    for (let c = 0; c < 8; c++) {
      const dx = s.px[id + c]! - px;
      const dy = s.py[id + c]! - py;
      const dz = s.pz[id + c]! - pz;
      const k = 1 / (dx * dx + dy * dy + dz * dz + 0.05);
      w.push(k);
      sum += k;
    }
    for (let c = 0; c < 8; c++) {
      const k = w[c]! / sum;
      s.impulse(id + c, ix * k, iy * k, iz * k);
    }
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
