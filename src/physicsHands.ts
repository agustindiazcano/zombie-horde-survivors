import {
  damageZombie,
  heightAt,
  setDynamicSolids,
  type Arena,
  type DynamicSolid,
  type GameConfig,
  type GameState,
  type Soldier,
  type Vec2,
} from './sim';
import { KIND_BALL, KIND_BOX, PERSON_MASS } from './sim/physics/bodies';
import type { RapierWorld } from './sim/physics/rapierWorld';

/**
 * The units and the free bodies of the physics lab (Map 12) touching each other. Rapier stays out
 * of the sim, so the bridge works through the sim's own collision (`DynamicSolid`):
 *  - every free box and ball is published as a solid each step: units are stopped by it, stand on
 *    a box that lies flat, and vault onto one like any prop;
 *  - what a unit presses into a solid in a tick is turned back into a shove on the body, so
 *    walkers push boxes and balls (heavy ones barely move);
 *  - E lifts a body over the head (and drops it), G drags one on a rope, the fire button throws
 *    what is held, and a thrown body hurts the enemies it hits.
 */

/** How far from the unit (m) a body can be grabbed. */
const REACH = 2.4;
/** Heaviest body a unit lifts over its head (kg). */
const LIFT_MAX = PERSON_MASS;
/** Heaviest body a unit drags (kg). */
const DRAG_MAX = 600;
/** Height of a held body's centre above the unit's feet (m). */
const HOLD_HEIGHT = 2.4;
/** How fast a held body homes on its spot (1/s) and the most it moves (m/s). */
const HOLD_GAIN = 14;
const HOLD_SPEED = 16;
/** A held body further than this from its holder is let go (m). */
const HOLD_BREAK = 6;
/** Pull speed of a drag (m/s, for a light body) and the slack of the rope past the unit and body radii (m). */
const DRAG_SPEED = 6;
const DRAG_SLACK = 0.5;
const DRAG_BREAK = 9;
/** A throw gives this much momentum (kg m/s) up to this speed (m/s), and flies a little upwards. */
const THROW_IMPULSE = 500;
const THROW_MAX = 24;
const THROW_LIFT = 0.2;
/** A thrown body hurts what it hits while it is faster than this (m/s), for this long (s). */
const HIT_SPEED = 4;
const HIT_TIME = 2.5;
/** Damage of a hit: mass x speed x this. */
const HIT_DAMAGE = 0.2;
/** A shove is capped by the pusher's own momentum: a person weighs this many kg. */
const PUSH_MASS = PERSON_MASS;
/** The fastest a walker pushes something (m/s). */
const PUSH_MAX = 6;
/** The step the lab runs at (s). */
const DT = 1 / 60;
/** A box counts as lying flat when one of its axes is this close to the vertical. */
const FLAT = 0.96;

interface Held {
  id: number;
  by: number;
  mode: 'hold' | 'drag';
}

interface Thrown {
  id: number;
  by: number;
  time: number;
  hit: Set<number>;
}

export class PhysicsHands {
  private held: Held | null = null;
  private readonly thrown: Thrown[] = [];
  private solids: DynamicSolid[] = [];
  /** The fire button has not been let go since a throw (or while holding). */
  private latch = false;
  private world: RapierWorld | null = null;

  get isHolding(): boolean {
    return this.held?.mode === 'hold';
  }

  get isDragging(): boolean {
    return this.held?.mode === 'drag';
  }

  /** Forgets every grip and solid (the map changed or the lab was reset). */
  clear(): void {
    this.held = null;
    this.thrown.length = 0;
    this.latch = false;
    this.solids = [];
    setDynamicSolids([]);
  }

  /** Lets go of a dragged body; false when none was dragged. */
  releaseDrag(): boolean {
    if (this.held?.mode !== 'drag') return false;
    this.held = null;
    return true;
  }

  /**
   * The E key: drops what is held, else lifts the closest body in reach. Returns whether it did
   * something (so the key does not also use whatever else is near) and a message to show.
   */
  grab(w: RapierWorld, state: GameState, unitId: number, arena: Arena) {
    if (this.held?.mode === 'hold') {
      this.held = null;
      return { handled: true, notice: null };
    }
    const found = this.closest(w, state, unitId, arena);
    if (found === null) return { handled: false, notice: null };
    if (w.massOf(found) > LIFT_MAX) {
      return {
        handled: true,
        notice: `Too heavy to lift (${Math.round(w.massOf(found))} kg): G drags it`,
      };
    }
    this.held = { id: found, by: unitId, mode: 'hold' };
    this.latch = true;
    return { handled: true, notice: null };
  }

  /** The G key: drags the closest body in reach on a rope (or lets go). Returns a message to show. */
  drag(w: RapierWorld, state: GameState, unitId: number, arena: Arena): string | null {
    if (this.held) {
      this.held = null;
      return null;
    }
    const found = this.closest(w, state, unitId, arena);
    if (found === null) return null;
    if (w.massOf(found) > DRAG_MAX) return `Too heavy to drag (${Math.round(w.massOf(found))} kg)`;
    this.held = { id: found, by: unitId, mode: 'drag' };
    return null;
  }

  /**
   * The fire button while something is held: a fresh press throws it towards `aim`. Returns true
   * when the press belongs to the hands, so the gun does not fire.
   */
  fire(pressed: boolean, aim: Vec2, state: GameState): boolean {
    if (!pressed) {
      this.latch = false;
      return false;
    }
    if (this.latch) return true;
    const held = this.held;
    const w = this.world;
    if (!held || held.mode !== 'hold' || !w) return false;
    const me = state.soldiers.find((s) => s.id === held.by);
    if (!me) return false;
    let dx = aim.x - me.pos.x;
    let dz = aim.z - me.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.1) {
      dx = Math.sin(me.facing);
      dz = Math.cos(me.facing);
      d = 1;
    }
    const speed = Math.min(THROW_MAX, THROW_IMPULSE / w.massOf(held.id));
    w.setVelocity(held.id, (dx / d) * speed, speed * THROW_LIFT + 1.5, (dz / d) * speed);
    me.facing = Math.atan2(dx, dz);
    this.thrown.push({ id: held.id, by: me.id, time: HIT_TIME, hit: new Set() });
    this.held = null;
    this.latch = true;
    return true;
  }

  /** Before the world steps: shoves from what the units pressed last tick, grips, thrown hits. */
  control(w: RapierWorld, state: GameState, config: GameConfig, arena: Arena): void {
    this.world = w;
    for (const s of this.solids) this.shove(w, s);
    this.grip(w, state, config, arena);
    this.hits(w, state, config, arena);
  }

  /** After the world stepped: the boxes and balls as the solids the sim collides with. */
  publish(w: RapierWorld, arena: Arena): void {
    const list: DynamicSolid[] = [];
    const heights = arena.terrain.heights;
    for (let i = 0; i < w.count; i++) {
      const kind = w.kind[i]!;
      if (kind !== KIND_BOX && kind !== KIND_BALL) continue;
      if (this.held?.mode === 'hold' && this.held.id === i) continue;
      const x = w.pos[i * 3]!;
      const y = w.pos[i * 3 + 1]!;
      const z = w.pos[i * 3 + 2]!;
      const g = heightAt(heights, arena.halfSize, x, z);
      const solid: DynamicSolid = {
        x,
        z,
        halfW: 0,
        halfD: 0,
        yaw: 0,
        bottom: 0,
        top: 0,
        round: kind === KIND_BALL,
        walkable: false,
        body: i,
        pushX: 0,
        pushZ: 0,
        mark: 0,
      };
      let up: number;
      if (kind === KIND_BALL) {
        solid.halfW = solid.halfD = up = w.size[i * 3]!;
      } else {
        up = this.boxFootprint(w, i, solid);
      }
      solid.bottom = y - up - g;
      solid.top = y + up - g;
      list.push(solid);
    }
    this.solids = list;
    setDynamicSolids(list);
  }

  /**
   * Fills `solid`'s footprint from box `i` and returns its half height. A box lying flat on one
   * of its faces is a turned rectangle; a tilted one is the box around it.
   */
  private boxFootprint(w: RapierWorld, i: number, solid: DynamicSolid): number {
    const qx = w.rot[i * 4]!;
    const qy = w.rot[i * 4 + 1]!;
    const qz = w.rot[i * 4 + 2]!;
    const qw = w.rot[i * 4 + 3]!;
    // The box's three axes in the world (columns of its rotation).
    const axes: [number, number, number][] = [
      [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw)],
      [2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)],
      [2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ];
    const half = [w.size[i * 3]!, w.size[i * 3 + 1]!, w.size[i * 3 + 2]!];
    let k = 0;
    for (let a = 1; a < 3; a++) if (Math.abs(axes[a]![1]) > Math.abs(axes[k]![1])) k = a;
    if (Math.abs(axes[k]![1]) >= FLAT) {
      const a = (k + 1) % 3;
      const b = (k + 2) % 3;
      solid.halfW = half[a]!;
      solid.halfD = half[b]!;
      solid.yaw = Math.atan2(-axes[a]![2], axes[a]![0]);
      solid.walkable = true;
      return half[k]!;
    }
    const extent = (c: 0 | 1 | 2): number =>
      Math.abs(axes[0]![c]) * half[0]! +
      Math.abs(axes[1]![c]) * half[1]! +
      Math.abs(axes[2]![c]) * half[2]!;
    solid.halfW = extent(0);
    solid.halfD = extent(2);
    return extent(1);
  }

  /** What a walker pressed into this solid last tick, as a push on its body. */
  private shove(w: RapierWorld, s: DynamicSolid): void {
    const press = Math.hypot(s.pushX, s.pushZ);
    if (press < 1e-4) return;
    const nx = s.pushX / press;
    const nz = s.pushZ / press;
    const speed = Math.min(press / DT, PUSH_MAX);
    const v = w.velocityOf(s.body);
    const have = v.x * nx + v.z * nz;
    if (have >= speed) return;
    const mass = w.massOf(s.body);
    const impulse = Math.min((speed - have) * mass, PUSH_MASS * speed);
    const reach = s.round ? s.halfW : Math.min(s.halfW, s.halfD);
    const y = w.pos[s.body * 3 + 1]!;
    w.pushAt(s.body, nx * impulse, 0, nz * impulse, s.x - nx * reach, y, s.z - nz * reach);
  }

  private unit(state: GameState, id: number): Soldier | null {
    const s = state.soldiers.find((u) => u.id === id);
    return s && !s.dead && !s.downed && s.vehicleId === null ? s : null;
  }

  /** The closest box or ball within reach of the unit, or null. */
  private closest(w: RapierWorld, state: GameState, unitId: number, arena: Arena): number | null {
    const me = this.unit(state, unitId);
    if (!me) return null;
    const feet = heightAt(arena.terrain.heights, arena.halfSize, me.pos.x, me.pos.z) + me.y;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < w.count; i++) {
      const kind = w.kind[i]!;
      if (kind !== KIND_BOX && kind !== KIND_BALL) continue;
      if (this.held?.id === i) continue;
      const y = w.pos[i * 3 + 1]!;
      if (y < feet - 0.5 || y > feet + 2.5) continue;
      const bound = Math.max(w.size[i * 3]!, w.size[i * 3 + 1]!, w.size[i * 3 + 2]!);
      const d = Math.hypot(w.pos[i * 3]! - me.pos.x, w.pos[i * 3 + 2]! - me.pos.z) - bound;
      if (d < REACH && d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return best;
  }

  /** Steers the held or dragged body; lets go when its holder cannot hold it any more. */
  private grip(w: RapierWorld, state: GameState, config: GameConfig, arena: Arena): void {
    const held = this.held;
    if (!held) return;
    const me = this.unit(state, held.by);
    if (!me) {
      this.held = null;
      return;
    }
    const heights = arena.terrain.heights;
    const px = w.pos[held.id * 3]!;
    const py = w.pos[held.id * 3 + 1]!;
    const pz = w.pos[held.id * 3 + 2]!;
    if (held.mode === 'hold') {
      const ground = heightAt(heights, arena.halfSize, me.pos.x, me.pos.z) + me.y;
      const tx = me.pos.x + Math.sin(me.facing) * 0.3;
      const ty = ground + HOLD_HEIGHT;
      const tz = me.pos.z + Math.cos(me.facing) * 0.3;
      const ex = tx - px;
      const ey = ty - py;
      const ez = tz - pz;
      const dist = Math.hypot(ex, ey, ez);
      if (dist > HOLD_BREAK) {
        this.held = null;
        return;
      }
      const k = Math.min(HOLD_GAIN, (HOLD_SPEED * 1) / Math.max(dist, 1e-6));
      w.setVelocity(held.id, ex * k, ey * k, ez * k, false);
      return;
    }
    const dx = me.pos.x - px;
    const dz = me.pos.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > DRAG_BREAK) {
      this.held = null;
      return;
    }
    const bound = Math.max(w.size[held.id * 3]!, w.size[held.id * 3 + 2]!);
    const rope = config.player.radius + bound + DRAG_SLACK;
    const v = w.velocityOf(held.id);
    if (d > rope) {
      const cap = DRAG_SPEED * Math.min(1, PERSON_MASS / w.massOf(held.id) + 0.25);
      const pull = Math.min(cap, (d - rope) * 8);
      w.setVelocity(held.id, (dx / d) * pull, v.y, (dz / d) * pull);
    } else {
      w.setVelocity(held.id, v.x * 0.8, v.y, v.z * 0.8);
    }
  }

  /** A thrown body hurts each enemy it strikes once, and loses speed doing it. */
  private hits(w: RapierWorld, state: GameState, config: GameConfig, arena: Arena): void {
    for (let t = this.thrown.length - 1; t >= 0; t--) {
      const th = this.thrown[t]!;
      th.time -= DT;
      const v = w.velocityOf(th.id);
      const speed = Math.hypot(v.x, v.y, v.z);
      if (th.time <= 0 || speed < HIT_SPEED) {
        this.thrown.splice(t, 1);
        continue;
      }
      const x = w.pos[th.id * 3]!;
      const y = w.pos[th.id * 3 + 1]!;
      const z = w.pos[th.id * 3 + 2]!;
      const bound = Math.max(w.size[th.id * 3]!, w.size[th.id * 3 + 1]!, w.size[th.id * 3 + 2]!);
      const g = heightAt(arena.terrain.heights, arena.halfSize, x, z);
      const killer = state.soldiers.find((s) => s.id === th.by);
      for (const zed of state.zombies) {
        if (zed.state === 'death' || th.hit.has(zed.id)) continue;
        if (Math.hypot(zed.pos.x - x, zed.pos.z - z) > bound + zed.radius) continue;
        if (y - g < -bound || y - g > 2.5 + bound) continue;
        th.hit.add(zed.id);
        damageZombie(state, config, zed, w.massOf(th.id) * speed * HIT_DAMAGE, killer);
        w.setVelocity(th.id, v.x * 0.5, v.y * 0.5, v.z * 0.5);
      }
    }
  }
}
