import type { Arena } from '../config';
import { OBSTACLE_HEIGHT } from '../constants';
import { obstaclesNear } from '../grid';
import { heightAt } from '../terrain';

/** The saturation of the vacuum (rho_max): the epsilon that keeps every 1/d blast and pull finite. */
export const SATURATION = 0.25;
/** Silk viscosity: what a contact loses, so the bounce is `1 - SILK_VISCOSITY`. */
export const SILK_VISCOSITY = 0.273;

export const KIND_BALL = 0;
export const KIND_RAGDOLL = 1;

/** Every number the Map 12 panel can turn live. Metres, seconds, kilograms. */
export interface PhysicsParams {
  gravity: number;
  /** Share of the impact speed a body gives back (0 = dead stop). */
  restitution: number;
  /**
   * Contact stiffness (Hooke, F = kHooke * overlap). It is the compliance 1/k of the contact
   * constraint: a low value lets bodies sink into each other, a high one makes them rigid.
   */
  kHooke: number;
  /** Coulomb friction, ground and contacts. */
  friction: number;
  /** Air drag (1/s). */
  airDrag: number;
  /** Sub-steps per fixed step (the step is 1/60 s). */
  substeps: number;
  /** Constraint passes per sub-step (bones, contacts, ground). */
  iterations: number;
  /** Below this closing speed (m/s) a contact does not bounce, so piles settle. */
  restSpeed: number;
  /** A body that touched something and moves slower than this (m/s) is stopped dead. */
  sleepSpeed: number;
  /** Share of the relative speed along a bone that a bone removes per sub-step. */
  boneDamping: number;
  /** Blast strength: impulse = blastPower * (1 - d/R) / (d + SATURATION). */
  blastPower: number;
}

export const DEFAULT_PARAMS: PhysicsParams = {
  gravity: 24,
  restitution: 1 - SILK_VISCOSITY,
  kHooke: 100000,
  friction: 0.8,
  airDrag: 0.08,
  substeps: 3,
  iterations: 2,
  restSpeed: 1.5,
  sleepSpeed: 0.3,
  boneDamping: 0.3,
  blastPower: 380,
};

const HASH_SIZE = 16384;
/** The side of a hash cell. A body must be no wider than this, or its neighbours are missed. */
const CELL = 2.6;
/** A pair closer than the touching distance plus this is kept for the whole sub-step. */
const PAIR_MARGIN = 0.1;
/** At most this many contact pairs per body are kept (a sphere touches at most 12 others). */
const PAIRS_PER_BODY = 8;
/** Walls and boxes give back this share of the closing speed. */
const WALL_RESTITUTION = 0.4;
/** Lift added to every blast, scaled by the falloff (m/s per unit of 1/mass). */
const BLAST_LIFT = 18;

const hashCell = (cx: number, cy: number, cz: number): number =>
  (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) & (HASH_SIZE - 1);

/**
 * A pool of spheres (balls and the joints of ragdolls) with bone constraints, stored as flat
 * typed arrays (the layout a Rust/WASM port keeps byte for byte). Pure and deterministic: no
 * randomness and no clock, so the same calls give the same positions on every machine.
 *
 * Position-based, in small sub-steps (the "small steps" XPBD scheme): each sub-step predicts the
 * positions from gravity and speed, then a few passes push them out of the ground, boxes,
 * walls and each other and pull the bone constraints straight (contacts use the Hooke
 * compliance 1/k), with Coulomb friction on the displacement. The speed is then the displacement
 * over the sub-step, which is what lets a pile of balls rest without creeping. Bodies are found
 * through a spatial hash (cell 2.6 m, 27 neighbours: O(1) per body).
 */
export class PhysicsWorld {
  readonly capacity: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly radius: Float32Array;
  readonly invMass: Float32Array;
  readonly kind: Uint8Array;
  /** The ragdoll a body belongs to, or -1: bodies of one ragdoll never push each other. */
  readonly group: Int32Array;
  count = 0;

  readonly conCapacity: number;
  readonly conA: Int32Array;
  readonly conB: Int32Array;
  readonly conRest: Float32Array;
  readonly conStiff: Float32Array;
  conCount = 0;

  nextGroup = 0;
  params: PhysicsParams = { ...DEFAULT_PARAMS };
  /** Contacts found by the last step (a number to watch, not a rule). */
  contacts = 0;

  private readonly qx: Float32Array;
  private readonly qy: Float32Array;
  private readonly qz: Float32Array;
  /** 1 while a body touched the ground, a box, a wall or another body in this sub-step. */
  private readonly touched: Uint8Array;
  /** The bounce a body is owed from a static surface: speed along (bnx, bny, bnz). */
  private readonly bounce: Float32Array;
  private readonly bnx: Float32Array;
  private readonly bny: Float32Array;
  private readonly bnz: Float32Array;
  private readonly head = new Int32Array(HASH_SIZE);
  private readonly next: Int32Array;
  private readonly pairA: Int32Array;
  private readonly pairB: Int32Array;
  /** The bounce speed a pair is owed (0 = none), decided from the speeds before the sub-step. */
  private readonly pairE: Float32Array;
  private pairCount = 0;
  private readonly bitsX: Uint32Array;
  private readonly bitsY: Uint32Array;
  private readonly bitsZ: Uint32Array;

  constructor(capacity = 6000, conCapacity = 3000) {
    this.capacity = capacity;
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.qx = new Float32Array(capacity);
    this.qy = new Float32Array(capacity);
    this.qz = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.invMass = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.group = new Int32Array(capacity);
    this.touched = new Uint8Array(capacity);
    this.bounce = new Float32Array(capacity);
    this.bnx = new Float32Array(capacity);
    this.bny = new Float32Array(capacity);
    this.bnz = new Float32Array(capacity);
    this.next = new Int32Array(capacity);
    this.pairA = new Int32Array(capacity * PAIRS_PER_BODY);
    this.pairB = new Int32Array(capacity * PAIRS_PER_BODY);
    this.pairE = new Float32Array(capacity * PAIRS_PER_BODY);
    this.bitsX = new Uint32Array(this.px.buffer);
    this.bitsY = new Uint32Array(this.py.buffer);
    this.bitsZ = new Uint32Array(this.pz.buffer);
    this.conCapacity = conCapacity;
    this.conA = new Int32Array(conCapacity);
    this.conB = new Int32Array(conCapacity);
    this.conRest = new Float32Array(conCapacity);
    this.conStiff = new Float32Array(conCapacity);
  }

  clear(): void {
    this.count = 0;
    this.conCount = 0;
    this.nextGroup = 0;
    this.contacts = 0;
    this.pairCount = 0;
  }

  /** Adds a sphere; returns its id, or -1 when the pool is full or it is too wide for the hash. */
  addBody(
    x: number,
    y: number,
    z: number,
    radius: number,
    mass: number,
    kind = KIND_BALL,
    group = -1,
  ): number {
    if (this.count >= this.capacity || radius * 2 > CELL || mass <= 0) return -1;
    const i = this.count++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vz[i] = 0;
    this.radius[i] = radius;
    this.invMass[i] = 1 / mass;
    this.kind[i] = kind;
    this.group[i] = group;
    return i;
  }

  /** A bone: keeps bodies `a` and `b` `rest` metres apart. `stiffness` is the share fixed per pass. */
  addConstraint(a: number, b: number, rest: number, stiffness = 0.85): void {
    if (this.conCount >= this.conCapacity) return;
    const c = this.conCount++;
    this.conA[c] = a;
    this.conB[c] = b;
    this.conRest[c] = rest;
    this.conStiff[c] = stiffness;
  }

  /** Changes a body's speed by `impulse / mass` (a heavy body moves less). */
  impulse(i: number, ix: number, iy: number, iz: number): void {
    const w = this.invMass[i]!;
    this.vx[i] = this.vx[i]! + ix * w;
    this.vy[i] = this.vy[i]! + iy * w;
    this.vz[i] = this.vz[i]! + iz * w;
  }

  /**
   * A radial blast: impulse = power * (1 - d/R) / (d + SATURATION), pushed away from the centre
   * with a lift. The saturation keeps it finite at d = 0.
   */
  explosion(x: number, y: number, z: number, radius: number, power = this.params.blastPower): void {
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      const dx = this.px[i]! - x;
      const dy = this.py[i]! - y;
      const dz = this.pz[i]! - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      const fall = 1 - d / radius;
      const imp = (power * fall) / (d + SATURATION);
      const inv = 1 / (d + 0.01);
      this.impulse(i, dx * inv * imp, Math.abs(dy * inv) * imp + BLAST_LIFT * fall, dz * inv * imp);
    }
  }

  /** One fixed step: `params.substeps` sub-steps. */
  step(dt: number, arena: Arena): void {
    const n = Math.max(1, Math.round(this.params.substeps));
    this.contacts = 0;
    for (let s = 0; s < n; s++) this.substep(dt / n, arena);
  }

  /** A number that changes when any position does: the same run gives the same hash everywhere. */
  stateHash(): number {
    let h = 2166136261;
    for (let i = 0; i < this.count; i++) {
      h = Math.imul(h ^ this.bitsX[i]!, 16777619);
      h = Math.imul(h ^ this.bitsY[i]!, 16777619);
      h = Math.imul(h ^ this.bitsZ[i]!, 16777619);
    }
    return h >>> 0;
  }

  private substep(h: number, arena: Arena): void {
    const p = this.params;
    const drag = Math.max(0, 1 - p.airDrag * h);
    const { px, py, pz, vx, vy, vz, qx, qy, qz } = this;
    const n = this.count;

    // 1. Predict: remember where each body was, then move it by gravity and its speed.
    for (let i = 0; i < n; i++) {
      qx[i] = px[i]!;
      qy[i] = py[i]!;
      qz[i] = pz[i]!;
      vy[i] = vy[i]! - p.gravity * h;
      vx[i] = vx[i]! * drag;
      vy[i] = vy[i]! * drag;
      vz[i] = vz[i]! * drag;
      px[i] = px[i]! + vx[i]! * h;
      py[i] = py[i]! + vy[i]! * h;
      pz[i] = pz[i]! + vz[i]! * h;
      this.touched[i] = 0;
      this.bounce[i] = 0;
    }

    // 2. Find the pairs that may touch (spatial hash) and note which ones owe a bounce.
    this.findPairs();

    // 3. Pull everything out of everything else, a few passes.
    for (let it = 0; it < p.iterations; it++) {
      this.solveBones();
      this.solvePairs(h);
      for (let i = 0; i < n; i++) this.collideStatic(i, arena, it === 0, h);
    }

    // 4. The speed is the displacement over the sub-step.
    const inv = 1 / h;
    for (let i = 0; i < n; i++) {
      vx[i] = (px[i]! - qx[i]!) * inv;
      vy[i] = (py[i]! - qy[i]!) * inv;
      vz[i] = (pz[i]! - qz[i]!) * inv;
    }

    // 5. Bounces, bone damping, and stopping what has all but stopped.
    for (let i = 0; i < n; i++) {
      const b = this.bounce[i]!;
      if (b <= 0) continue;
      const nx = this.bnx[i]!;
      const ny = this.bny[i]!;
      const nz = this.bnz[i]!;
      const vn = vx[i]! * nx + vy[i]! * ny + vz[i]! * nz;
      if (vn < b) {
        vx[i] = vx[i]! + nx * (b - vn);
        vy[i] = vy[i]! + ny * (b - vn);
        vz[i] = vz[i]! + nz * (b - vn);
      }
    }
    for (let k = 0; k < this.pairCount; k++) {
      const e = this.pairE[k]!;
      if (e <= 0) continue;
      this.bouncePair(this.pairA[k]!, this.pairB[k]!, e);
    }
    this.dampBones();
    const sleep2 = p.sleepSpeed * p.sleepSpeed;
    for (let i = 0; i < n; i++) {
      if (this.touched[i] === 0) continue;
      if (vx[i]! * vx[i]! + vy[i]! * vy[i]! + vz[i]! * vz[i]! < sleep2) {
        vx[i] = 0;
        vy[i] = 0;
        vz[i] = 0;
      }
    }
  }

  /** Hashes the predicted positions and lists the pairs within touching range. */
  private findPairs(): void {
    const { px, py, pz, vx, vy, vz, radius } = this;
    const p = this.params;
    this.head.fill(-1);
    for (let i = 0; i < this.count; i++) {
      const slot = hashCell(
        Math.floor(px[i]! / CELL),
        Math.floor(py[i]! / CELL),
        Math.floor(pz[i]! / CELL),
      );
      this.next[i] = this.head[slot]!;
      this.head[slot] = i;
    }
    const max = this.pairA.length;
    this.pairCount = 0;
    for (let i = 0; i < this.count; i++) {
      const cx = Math.floor(px[i]! / CELL);
      const cy = Math.floor(py[i]! / CELL);
      const cz = Math.floor(pz[i]! / CELL);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++) {
            let j = this.head[hashCell(cx + ox, cy + oy, cz + oz)]!;
            while (j !== -1) {
              if (j > i && (this.group[i]! < 0 || this.group[i] !== this.group[j])) {
                const dx = px[i]! - px[j]!;
                const dy = py[i]! - py[j]!;
                const dz = pz[i]! - pz[j]!;
                const reach = radius[i]! + radius[j]! + PAIR_MARGIN;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < reach * reach && d2 > 1e-10 && this.pairCount < max) {
                  const k = this.pairCount++;
                  this.pairA[k] = i;
                  this.pairB[k] = j;
                  // Closing speed along the line between them, from the speeds before the solve.
                  const d = Math.sqrt(d2);
                  const vn =
                    ((vx[i]! - vx[j]!) * dx + (vy[i]! - vy[j]!) * dy + (vz[i]! - vz[j]!) * dz) / d;
                  this.pairE[k] = vn < -p.restSpeed ? -vn * p.restitution : 0;
                }
              }
              j = this.next[j]!;
            }
          }
    }
  }

  /** Gives a pair the speed it is owed back along their line, split by mass. */
  private bouncePair(i: number, j: number, speed: number): void {
    const { px, py, pz, vx, vy, vz, invMass } = this;
    const dx = px[i]! - px[j]!;
    const dy = py[i]! - py[j]!;
    const dz = pz[i]! - pz[j]!;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6) return;
    const nx = dx / d;
    const ny = dy / d;
    const nz = dz / d;
    const wa = invMass[i]!;
    const wb = invMass[j]!;
    const ws = wa + wb;
    const rel = (vx[i]! - vx[j]!) * nx + (vy[i]! - vy[j]!) * ny + (vz[i]! - vz[j]!) * nz;
    if (rel >= speed) return;
    const j2 = (speed - rel) / ws;
    vx[i] = vx[i]! + nx * j2 * wa;
    vy[i] = vy[i]! + ny * j2 * wa;
    vz[i] = vz[i]! + nz * j2 * wa;
    vx[j] = vx[j]! - nx * j2 * wb;
    vy[j] = vy[j]! - ny * j2 * wb;
    vz[j] = vz[j]! - nz * j2 * wb;
  }

  /** Sphere against sphere: push apart by mass with the contact compliance, then rub off sliding. */
  private solvePairs(h: number): void {
    const { px, py, pz, qx, qy, qz, radius, invMass } = this;
    const p = this.params;
    const alpha = 1 / (p.kHooke * h * h);
    for (let k = 0; k < this.pairCount; k++) {
      const i = this.pairA[k]!;
      const j = this.pairB[k]!;
      const dx = px[i]! - px[j]!;
      const dy = py[i]! - py[j]!;
      const dz = pz[i]! - pz[j]!;
      const d2 = dx * dx + dy * dy + dz * dz;
      const min = radius[i]! + radius[j]!;
      if (d2 >= min * min || d2 < 1e-10) continue;
      this.contacts++;
      this.touched[i] = 1;
      this.touched[j] = 1;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const nz = dz / d;
      const overlap = min - d;
      const wa = invMass[i]!;
      const wb = invMass[j]!;
      const ws = wa + wb;
      const s = overlap / (ws + alpha);
      px[i] = px[i]! + nx * s * wa;
      py[i] = py[i]! + ny * s * wa;
      pz[i] = pz[i]! + nz * s * wa;
      px[j] = px[j]! - nx * s * wb;
      py[j] = py[j]! - ny * s * wb;
      pz[j] = pz[j]! - nz * s * wb;

      // Coulomb friction on the displacement since the sub-step began: it can cancel at most
      // mu times the push that was just made.
      const rx = px[i]! - qx[i]! - (px[j]! - qx[j]!);
      const ry = py[i]! - qy[i]! - (py[j]! - qy[j]!);
      const rz = pz[i]! - qz[i]! - (pz[j]! - qz[j]!);
      const rn = rx * nx + ry * ny + rz * nz;
      const tx = rx - nx * rn;
      const ty = ry - ny * rn;
      const tz = rz - nz * rn;
      const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (ts > 1e-9) {
        const cut = Math.min(ts, p.friction * s * ws) / (ts * ws);
        px[i] = px[i]! - tx * cut * wa;
        py[i] = py[i]! - ty * cut * wa;
        pz[i] = pz[i]! - tz * cut * wa;
        px[j] = px[j]! + tx * cut * wb;
        py[j] = py[j]! + ty * cut * wb;
        pz[j] = pz[j]! + tz * cut * wb;
      }
    }
  }

  /** Ground (with its slope), boxes and the arena walls. */
  private collideStatic(i: number, arena: Arena, first: boolean, h: number): void {
    const { px, py, pz } = this;
    const r = this.radius[i]!;

    const heights = arena.terrain.heights;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    const ground = heightAt(heights, arena.halfSize, px[i]!, pz[i]!);
    if (heights) {
      const e = 0.5;
      const x = px[i]!;
      const z = pz[i]!;
      const gx =
        (heightAt(heights, arena.halfSize, x + e, z) -
          heightAt(heights, arena.halfSize, x - e, z)) /
        (2 * e);
      const gz =
        (heightAt(heights, arena.halfSize, x, z + e) -
          heightAt(heights, arena.halfSize, x, z - e)) /
        (2 * e);
      const len = Math.sqrt(gx * gx + 1 + gz * gz);
      nx = -gx / len;
      ny = 1 / len;
      nz = -gz / len;
    }
    const dist = (py[i]! - ground) * ny;
    if (dist < r) this.pushOut(i, nx, ny, nz, r - dist, this.params.restitution, first, h);

    for (const box of obstaclesNear(arena, px[i]! - r, pz[i]! - r, px[i]! + r, pz[i]! + r)) {
      if (box.water) continue;
      const top = box.height ?? OBSTACLE_HEIGHT;
      const cx = Math.min(Math.max(px[i]!, box.x - box.halfW), box.x + box.halfW);
      const cz = Math.min(Math.max(pz[i]!, box.z - box.halfD), box.z + box.halfD);
      const cy = Math.min(py[i]!, top);
      const dx = px[i]! - cx;
      const dy = py[i]! - cy;
      const dz = pz[i]! - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        this.pushOut(i, dx / d, dy / d, dz / d, r - d, WALL_RESTITUTION, first, h);
      } else {
        // The centre is inside the box: leave through the nearest face.
        const fx = box.halfW - Math.abs(px[i]! - box.x);
        const fz = box.halfD - Math.abs(pz[i]! - box.z);
        const up = top - py[i]!;
        if (up <= fx && up <= fz) this.pushOut(i, 0, 1, 0, up + r, WALL_RESTITUTION, first, h);
        else if (fx < fz)
          this.pushOut(i, Math.sign(px[i]! - box.x || 1), 0, 0, fx + r, WALL_RESTITUTION, first, h);
        else
          this.pushOut(i, 0, 0, Math.sign(pz[i]! - box.z || 1), fz + r, WALL_RESTITUTION, first, h);
      }
    }

    const lim = arena.halfSize - r;
    if (px[i]! < -lim) this.pushOut(i, 1, 0, 0, -lim - px[i]!, WALL_RESTITUTION, first, h);
    else if (px[i]! > lim) this.pushOut(i, -1, 0, 0, px[i]! - lim, WALL_RESTITUTION, first, h);
    if (pz[i]! < -lim) this.pushOut(i, 0, 0, 1, -lim - pz[i]!, WALL_RESTITUTION, first, h);
    else if (pz[i]! > lim) this.pushOut(i, 0, 0, -1, pz[i]! - lim, WALL_RESTITUTION, first, h);
  }

  /**
   * Pushes body `i` out of a fixed surface along the unit normal by `pen` (softened by the
   * contact compliance), rubs off the sliding, and, on the first pass, notes the bounce it owes.
   */
  private pushOut(
    i: number,
    nx: number,
    ny: number,
    nz: number,
    pen: number,
    bounce: number,
    first: boolean,
    h: number,
  ): void {
    const { px, py, pz, qx, qy, qz, vx, vy, vz } = this;
    const p = this.params;
    this.touched[i] = 1;
    const w = this.invMass[i]!;
    const alpha = 1 / (p.kHooke * h * h);
    const s = (pen * w) / (w + alpha) / w;
    if (first) {
      const vn = vx[i]! * nx + vy[i]! * ny + vz[i]! * nz;
      if (vn < -p.restSpeed && -vn * bounce > this.bounce[i]!) {
        this.bounce[i] = -vn * bounce;
        this.bnx[i] = nx;
        this.bny[i] = ny;
        this.bnz[i] = nz;
      }
    }
    px[i] = px[i]! + nx * s;
    py[i] = py[i]! + ny * s;
    pz[i] = pz[i]! + nz * s;
    // Friction: cancel the sliding since the sub-step began, up to mu times the push.
    const rx = px[i]! - qx[i]!;
    const ry = py[i]! - qy[i]!;
    const rz = pz[i]! - qz[i]!;
    const rn = rx * nx + ry * ny + rz * nz;
    const tx = rx - nx * rn;
    const ty = ry - ny * rn;
    const tz = rz - nz * rn;
    const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (ts > 1e-9) {
      const cut = Math.min(ts, p.friction * s) / ts;
      px[i] = px[i]! - tx * cut;
      py[i] = py[i]! - ty * cut;
      pz[i] = pz[i]! - tz * cut;
    }
  }

  /** Position-based bone constraints, mass weighted. */
  private solveBones(): void {
    const { px, py, pz, invMass } = this;
    for (let c = 0; c < this.conCount; c++) {
      const a = this.conA[c]!;
      const b = this.conB[c]!;
      const wa = invMass[a]!;
      const wb = invMass[b]!;
      const ws = wa + wb;
      if (ws === 0) continue;
      const dx = px[b]! - px[a]!;
      const dy = py[b]! - py[a]!;
      const dz = pz[b]! - pz[a]!;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const corr = (this.conStiff[c]! * (d - this.conRest[c]!)) / (d * ws);
      px[a] = px[a]! + dx * corr * wa;
      py[a] = py[a]! + dy * corr * wa;
      pz[a] = pz[a]! + dz * corr * wa;
      px[b] = px[b]! - dx * corr * wb;
      py[b] = py[b]! - dy * corr * wb;
      pz[b] = pz[b]! - dz * corr * wb;
    }
  }

  /** Removes part of the speed along each bone, so a ragdoll does not ring like a spring. */
  private dampBones(): void {
    const { px, py, pz, vx, vy, vz, invMass } = this;
    const damp = this.params.boneDamping;
    for (let c = 0; c < this.conCount; c++) {
      const a = this.conA[c]!;
      const b = this.conB[c]!;
      const wa = invMass[a]!;
      const wb = invMass[b]!;
      const ws = wa + wb;
      if (ws === 0) continue;
      const dx = px[b]! - px[a]!;
      const dy = py[b]! - py[a]!;
      const dz = pz[b]! - pz[a]!;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const nx = dx / d;
      const ny = dy / d;
      const nz = dz / d;
      const rv = (vx[b]! - vx[a]!) * nx + (vy[b]! - vy[a]!) * ny + (vz[b]! - vz[a]!) * nz;
      const j = (rv * damp) / ws;
      vx[a] = vx[a]! + nx * j * wa;
      vy[a] = vy[a]! + ny * j * wa;
      vz[a] = vz[a]! + nz * j * wa;
      vx[b] = vx[b]! - nx * j * wb;
      vy[b] = vy[b]! - ny * j * wb;
      vz[b] = vz[b]! - nz * j * wb;
    }
  }
}
