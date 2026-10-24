import { BOARD_ALT, createAirState, updateAircraft } from './aircraft';
import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import { landSpotNear, moveBoat } from './naval';
import { localPlayer } from './players';
import type { GameState, Input, Soldier, Vehicle } from './types';
import { dirFromAngle, type Vec2, hypot } from './vec';
import { damageZombie } from './zombies';
import { datan2, dcos, dsin } from './dmath';

/** A driver this close (metres) to its order point has arrived. */
const ARRIVE_DISTANCE = 2.5;
/** Followers this close (metres) to a leader that takes the wheel climb in after it. */
const BOARD_FOLLOWERS_RANGE = 12;
/** Gap (metres) between the hull and a soldier stepping out. */
const EXIT_GAP = 1.2;
/** A sunk boat's crew swims to dry ground at most this far (metres) away. */
const WRECK_LAND_REACH = 40;
/** Braking is this many times stronger than accelerating. */
const BRAKE_FACTOR = 2;
/** A crash into an obstacle keeps this share of the speed. */
const CRASH_KEEP = 0.4;

export function createVehicle(
  config: GameConfig,
  id: number,
  type: string,
  pos: Vec2,
  facing = 0,
): Vehicle {
  const def = config.vehicles[type]!;
  return {
    id,
    type,
    pos: { ...pos },
    prev: { ...pos },
    facing,
    prevFacing: facing,
    speed: 0,
    health: def.health,
    maxHealth: def.health,
    seats: Array.from({ length: def.seats }, () => null),
    ...(def.air ? { air: createAirState() } : {}),
  };
}

export const getVehicle = (state: GameState, id: number | null): Vehicle | undefined =>
  id === null ? undefined : state.vehicles.find((v) => v.id === id);

/** The soldier at the wheel (seat 0), if any. */
export function driverOf(state: GameState, v: Vehicle): Soldier | undefined {
  const id = v.seats[0];
  return id === null || id === undefined ? undefined : state.soldiers.find((s) => s.id === id);
}

export const isOccupied = (v: Vehicle): boolean => v.seats.some((id) => id !== null);

/** The closest vehicle a unit at `from` can climb into (a free seat and within reach). */
export function vehicleInReach(
  state: GameState,
  config: GameConfig,
  from: Vec2,
): Vehicle | undefined {
  let best: Vehicle | undefined;
  let bestDist = Infinity;
  for (const v of state.vehicles) {
    if (!v.seats.includes(null) || config.vehicles[v.type]!.fixed) continue;
    // Nobody climbs into a helicopter that has left the ground.
    if (v.air && v.air.alt > BOARD_ALT) continue;
    const def = config.vehicles[v.type]!;
    const d = hypot(v.pos.x - from.x, v.pos.z - from.z);
    if (d <= def.enterRange + def.radius && d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

function seat(v: Vehicle, s: Soldier, index: number): void {
  v.seats[index] = s.id;
  s.vehicleId = v.id;
  s.pos.x = v.pos.x;
  s.pos.z = v.pos.z;
  s.prev.x = v.pos.x;
  s.prev.z = v.pos.z;
  s.y = 0;
  s.vy = 0;
}

/** Puts a soldier on the ground next to the hull; `slot` spreads several of them around it. */
function dismount(
  config: GameConfig,
  v: Vehicle,
  s: Soldier,
  slot: number,
  spot?: Vec2 | null,
): void {
  const index = v.seats.indexOf(s.id);
  if (index >= 0) v.seats[index] = null;
  s.vehicleId = null;
  const def = config.vehicles[v.type]!;
  if (def.water) {
    // From a boat a soldier steps onto dry ground; far from any, it stays where the boat is.
    const land = spot ?? landSpotNear(config, v, slot, WRECK_LAND_REACH);
    s.pos.x = land?.x ?? v.pos.x;
    s.pos.z = land?.z ?? v.pos.z;
  } else {
    const angle = v.facing + Math.PI / 2 + slot * 0.9;
    const dir = dirFromAngle(angle);
    const r = def.radius + config.player.radius + EXIT_GAP;
    s.pos.x = v.pos.x + dir.x * r;
    s.pos.z = v.pos.z + dir.z * r;
    resolveStatic(s.pos, config.player.radius, config.arena);
  }
  s.prev.x = s.pos.x;
  s.prev.z = s.pos.z;
}

/**
 * Enter the closest vehicle with a free seat, or leave the one the soldier is in. The first
 * seat is the driver's; when the driver leaves, the whole crew gets out with it.
 */
export function toggleVehicle(state: GameState, config: GameConfig, soldierId: number): void {
  const s = state.soldiers.find((u) => u.id === soldierId);
  if (!s || s.dead || s.downed || s.kind !== 'soldier') return;
  const current = getVehicle(state, s.vehicleId);
  if (current) {
    // No jumping out of a helicopter in the air.
    if (current.air && current.air.alt > BOARD_ALT) return;
    const crew =
      current.seats[0] === s.id ? current.seats.filter((id): id is number => id !== null) : [s.id];
    // Out at sea nobody can step off a boat: it needs dry ground close by.
    const spots = config.vehicles[current.type]!.water
      ? crew.map((_, i) => landSpotNear(config, current, i))
      : null;
    if (spots?.some((spot) => spot === null)) return;
    crew.forEach((id, i) => {
      const member = state.soldiers.find((u) => u.id === id);
      if (member) dismount(config, current, member, i, spots?.[i]);
    });
    current.speed = 0;
    if (current.air && current.seats[0] === null) {
      current.air.engine = false;
      current.air.spool = 0;
      current.air.wantAlt = 0;
    }
    return;
  }
  const v = vehicleInReach(state, config, s.pos);
  if (!v) return;
  const free = v.seats.indexOf(null);
  seat(v, s, free);
  // A leader taking the wheel brings the followers that are close by.
  if (free === 0 && s.id === localPlayer(state).controlledId) {
    for (const f of state.soldiers) {
      const spot = v.seats.indexOf(null);
      if (spot < 0) break;
      const near = hypot(f.pos.x - v.pos.x, f.pos.z - v.pos.z) <= BOARD_FOLLOWERS_RANGE;
      if (f.kind === 'soldier' && !f.dead && !f.downed && f.vehicleId === null && near) {
        if (f.order.type === 'follow') seat(v, f, spot);
      }
    }
  }
}

/** Damage to a vehicle (only occupied ones are ever hit). At zero it is destroyed and the crew get out. */
export function hurtVehicle(
  state: GameState,
  config: GameConfig,
  v: Vehicle,
  amount: number,
): void {
  if (config.vehicles[v.type]!.fixed) return;
  v.health = Math.max(0, v.health - amount);
  if (v.health > 0) return;
  state.events.push({ type: 'vehicleDestroyed', vehicleId: v.id, pos: { ...v.pos } });
  const crew = v.seats.filter((id): id is number => id !== null);
  crew.forEach((id, i) => {
    const member = state.soldiers.find((u) => u.id === id);
    if (member) dismount(config, v, member, i);
  });
  state.vehicles.splice(state.vehicles.indexOf(v), 1);
}

/** Where the driver wants to go: the controlled player's keys, or an AI driver's move order. */
function driveVector(state: GameState, v: Vehicle, driver: Soldier, input: Input): Vec2 {
  if (driver.id === localPlayer(state).controlledId) return input.move;
  const o = driver.order;
  if (o.type !== 'move') return { x: 0, z: 0 };
  const dx = o.x - v.pos.x;
  const dz = o.z - v.pos.z;
  const d = hypot(dx, dz);
  if (d < ARRIVE_DISTANCE) {
    driver.order = { type: 'hold' };
    return { x: 0, z: 0 };
  }
  return { x: dx / d, z: dz / d };
}

const wrap = (a: number) => datan2(dsin(a), dcos(a));

/**
 * Arcade driving: the vehicle turns towards the direction asked and accelerates in proportion to
 * how well it faces it. Without a living driver at the wheel it just rolls to a stop. Moving
 * vehicles run over enemies in their path, and their crew rides along.
 */
export function updateVehicles(
  state: GameState,
  config: GameConfig,
  input: Input,
  dt: number,
): void {
  for (const v of state.vehicles) {
    const def = config.vehicles[v.type]!;
    v.prev.x = v.pos.x;
    v.prev.z = v.pos.z;
    v.prevFacing = v.facing;
    if (def.fixed) continue;

    const driver = driverOf(state, v);
    if (v.air) {
      updateAircraft(state, config, v, driver, input, dt);
      continue;
    }
    const want =
      driver && !driver.dead && !driver.downed ? driveVector(state, v, driver, input) : null;
    const mag = want ? Math.min(1, hypot(want.x, want.z)) : 0;
    let target = 0;
    if (want && mag > 0.05) {
      const diff = wrap(datan2(want.x, want.z) - v.facing);
      const turn = def.turnRate * dt;
      v.facing = wrap(v.facing + Math.max(-turn, Math.min(turn, diff)));
      target = def.maxSpeed * mag * Math.max(0, dcos(diff));
    }
    const rate = (target < v.speed ? def.accel * BRAKE_FACTOR : def.accel) * dt;
    v.speed += Math.max(-rate, Math.min(rate, target - v.speed));

    const dir = dirFromAngle(v.facing);
    const wanted = { x: v.pos.x + dir.x * v.speed * dt, z: v.pos.z + dir.z * v.speed * dt };
    let moved = { ...wanted };
    if (def.water) moved = moveBoat(state, config, def.radius, v.pos, wanted).pos;
    else resolveStatic(moved, def.radius, config.arena);
    if (hypot(moved.x - wanted.x, moved.z - wanted.z) > 1e-3) v.speed *= CRASH_KEEP;
    v.pos.x = moved.x;
    v.pos.z = moved.z;

    if (driver && v.speed >= def.ramSpeed) {
      for (const z of state.zombies) {
        if (z.state === 'death') continue;
        if (hypot(z.pos.x - v.pos.x, z.pos.z - v.pos.z) < def.radius + z.radius) {
          damageZombie(state, config, z, def.ramDps * dt, driver);
        }
      }
    }

    for (const id of v.seats) {
      const s = id === null ? undefined : state.soldiers.find((u) => u.id === id);
      if (!s) continue;
      s.pos.x = v.pos.x;
      s.pos.z = v.pos.z;
    }
  }
}
