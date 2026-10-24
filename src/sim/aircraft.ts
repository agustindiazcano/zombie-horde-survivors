import { resolveFlying } from './collision';
import type { GameConfig } from './config';
import { localPlayer } from './players';
import type { AirState, GameState, Input, Soldier, Vehicle } from './types';
import { dirFromAngle, type Vec2, hypot } from './vec';

/** A pilot this close (metres) to its order point has arrived. */
const ARRIVE_DISTANCE = 3;
/** Braking is this many times stronger than accelerating. */
const BRAKE_FACTOR = 2;
/** An AI pilot plans to brake with this share of the braking power it has. */
const BRAKE_MARGIN = 0.6;
/** A crash into a tall obstacle keeps this share of the speed. */
const CRASH_KEEP = 0.4;
/** The rotor spins up and down at this speed (share of the gap per second). */
const ROTOR_FOLLOW = 1.5;
/** Without forward pressed, the engine spool falls this many times faster than it rises. */
const SPOOL_DECAY = 2;
/** Closer than this (metres) to the ground counts as landed. */
const LANDED = 0.01;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createAirState(): AirState {
  return { engine: false, spool: 0, rotor: 0, alt: 0, prevAlt: 0, wantAlt: 0, idle: 'hover' };
}

/** The height at which a ground unit can still climb in or out (the skids are on the ground). */
export const BOARD_ALT = 0.5;

/** The aircraft the soldier sits in, if it is one. */
export function aircraftOf(state: GameState, s: Soldier | undefined): Vehicle | undefined {
  if (!s || s.vehicleId === null) return undefined;
  const v = state.vehicles.find((u) => u.id === s.vehicleId);
  return v?.air ? v : undefined;
}

/**
 * Orders for the pilots of the selected soldiers' aircraft (RTS): Space takes off, C lands, H
 * switches the idle behaviour between hovering and circling. Returns a short message, if any.
 */
export function orderAircraft(
  state: GameState,
  config: GameConfig,
  ids: number[],
  action: 'takeoff' | 'land' | 'idle',
): string | null {
  const done = new Set<number>();
  let message: string | null = null;
  for (const id of ids) {
    const s = state.soldiers.find((u) => u.id === id);
    const v = aircraftOf(state, s);
    if (!s || !v || done.has(v.id)) continue;
    done.add(v.id);
    const air = v.air!;
    const def = config.vehicles[v.type]!.air!;
    const pilot = state.soldiers.find((u) => u.id === v.seats[0]);
    if (!pilot || pilot.dead || pilot.downed) {
      message = 'No pilot at the controls';
      continue;
    }
    if (action === 'takeoff') air.wantAlt = Math.max(air.wantAlt, def.cruiseAlt);
    else if (action === 'land') {
      air.wantAlt = 0;
      pilot.order = { type: 'hold' };
    } else {
      air.idle = air.idle === 'hover' ? 'orbit' : 'hover';
      message =
        air.idle === 'hover' ? 'Helicopter: hover when idle' : 'Helicopter: circle when idle';
    }
  }
  return message;
}

/**
 * One tick of an aircraft. A player starts the engine by holding forward on the ground for
 * `spoolTime`, then Space climbs, C descends and Shift flies faster. An AI pilot starts and takes
 * off by itself when it has a destination or when told to (RTS), flies to move orders, and with
 * none hovers or circles. It cannot fly sideways below `minFlyAlt`. Without a pilot it sinks.
 */
export function updateAircraft(
  state: GameState,
  config: GameConfig,
  v: Vehicle,
  driver: Soldier | undefined,
  input: Input,
  dt: number,
): void {
  const vdef = config.vehicles[v.type]!;
  const def = vdef.air!;
  const air = v.air!;
  air.prevAlt = air.alt;

  const piloted = !!driver && !driver.dead && !driver.downed;
  const controlled = piloted && driver.id === localPlayer(state).controlledId;
  let want: Vec2 | null = null;
  let boost = 1;
  let circle = false;

  if (!piloted) {
    // No hands on the controls: the engine dies and it sinks.
    air.engine = false;
    air.spool = 0;
    air.wantAlt = 0;
    air.alt = Math.max(0, air.alt - def.descendRate * dt);
  } else if (controlled) {
    const push = hypot(input.move.x, input.move.z) > 0.05;
    if (!air.engine) {
      air.spool = push ? air.spool + dt : Math.max(0, air.spool - dt * SPOOL_DECAY);
      if (air.spool >= def.spoolTime) {
        air.engine = true;
        air.spool = def.spoolTime;
      }
    } else {
      if (input.jump) air.alt += def.climbRate * dt;
      if (input.crouch) air.alt -= def.descendRate * dt;
      air.alt = Math.min(def.maxAlt, Math.max(0, air.alt));
      if (push) want = input.move;
      if (input.sprint) boost = def.boostScale;
    }
    air.wantAlt = air.alt;
  } else {
    const order = driver.order;
    if (order.type === 'move') air.wantAlt = Math.max(air.wantAlt, def.cruiseAlt);
    if (!air.engine) {
      air.spool = air.wantAlt > 0 ? air.spool + dt : Math.max(0, air.spool - dt * SPOOL_DECAY);
      if (air.spool >= def.aiSpoolTime) {
        air.engine = true;
        air.spool = def.aiSpoolTime;
      }
    } else {
      const gap = air.wantAlt - air.alt;
      const rate = (gap > 0 ? def.climbRate : def.descendRate) * dt;
      air.alt += Math.max(-rate, Math.min(rate, gap));
      if (air.alt <= LANDED && air.wantAlt === 0) {
        // Landed: shut the engine down.
        air.alt = 0;
        air.engine = false;
        air.spool = 0;
      } else if (air.alt >= def.minFlyAlt) {
        if (order.type === 'move') {
          const dx = order.x - v.pos.x;
          const dz = order.z - v.pos.z;
          const d = hypot(dx, dz);
          if (d < ARRIVE_DISTANCE) driver.order = { type: 'hold' };
          else {
            // Slow down so it stops on the spot instead of sliding past.
            const stopSpeed = Math.sqrt(2 * vdef.accel * BRAKE_FACTOR * BRAKE_MARGIN * d);
            const mag = Math.min(1, stopSpeed / vdef.maxSpeed);
            want = { x: (dx / d) * mag, z: (dz / d) * mag };
          }
        } else if (air.wantAlt > 0 && air.idle === 'orbit') {
          circle = true;
        }
      }
    }
  }

  // The rotor follows the engine: running at full speed, spooling in proportion to the wait.
  const need = controlled ? def.spoolTime : def.aiSpoolTime;
  const rotorTarget = air.engine ? 1 : Math.min(1, air.spool / need) * 0.9;
  air.rotor += (rotorTarget - air.rotor) * Math.min(1, dt * ROTOR_FOLLOW);

  v.prev.x = v.pos.x;
  v.prev.z = v.pos.z;
  v.prevFacing = v.facing;

  const flying = air.engine && air.alt >= def.minFlyAlt;
  let target = 0;
  if (flying && circle) {
    v.facing = wrap(v.facing + (def.orbitSpeed / def.orbitRadius) * dt);
    target = def.orbitSpeed;
  } else if (flying && want) {
    const mag = Math.min(1, hypot(want.x, want.z));
    const diff = wrap(Math.atan2(want.x, want.z) - v.facing);
    const turn = vdef.turnRate * dt;
    v.facing = wrap(v.facing + Math.max(-turn, Math.min(turn, diff)));
    target = vdef.maxSpeed * boost * mag * Math.max(0, Math.cos(diff));
  }
  const rate = (target < v.speed ? vdef.accel * BRAKE_FACTOR : vdef.accel) * dt;
  v.speed += Math.max(-rate, Math.min(rate, target - v.speed));

  const dir = dirFromAngle(v.facing);
  const wanted = { x: v.pos.x + dir.x * v.speed * dt, z: v.pos.z + dir.z * v.speed * dt };
  const moved = { ...wanted };
  // Props lower than the machine pass beneath it, and water and cliffs never stop it.
  resolveFlying(moved, vdef.radius, config.arena, air.alt);
  if (hypot(moved.x - wanted.x, moved.z - wanted.z) > 1e-3) v.speed *= CRASH_KEEP;
  v.pos.x = moved.x;
  v.pos.z = moved.z;

  for (const id of v.seats) {
    const s = id === null ? undefined : state.soldiers.find((u) => u.id === id);
    if (!s) continue;
    s.pos.x = v.pos.x;
    s.pos.z = v.pos.z;
  }
}
