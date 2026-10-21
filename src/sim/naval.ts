import { resolveCircleAabb } from './collision';
import type { GameConfig } from './config';
import { obstaclesNear } from './grid';
import { heightAt } from './terrain';
import type { GameState, Vehicle } from './types';
import type { Vec2 } from './vec';

export type ShipShape = NonNullable<GameConfig['vehicles'][string]['ship']>;

/** A boat needs the sea floor this far below the surface at every point of its hull to float. */
const MIN_DEPTH = 0.3;
/** Share of the hull radius at which the extra depth samples are taken. */
const HULL_SAMPLE = 0.7;

/**
 * Half the width of a ship's hull at `z` metres from its middle: full width along the straight
 * part, then a parabola down to a point at the bow (+z). Zero outside the hull's length.
 */
export function shipHalfWidth(ship: ShipShape, z: number): number {
  const half = ship.length / 2;
  if (z < -half || z > half) return 0;
  const into = z - (half - ship.bow);
  if (into <= 0) return ship.width / 2;
  const t = into / ship.bow;
  return (ship.width / 2) * (1 - t * t);
}

/**
 * The hull outline as a closed polygon (x, z), starboard side from the stern to the bow and back
 * along the port side. `inset` shrinks it (metres) for the walkable deck.
 */
export function shipOutline(ship: ShipShape, inset = 0, step = 2): Vec2[] {
  const half = ship.length / 2 - inset;
  const zs: number[] = [];
  for (let z = -half; z < half; z += step) zs.push(z);
  zs.push(half);
  const width = (z: number) => Math.max(0, shipHalfWidth(ship, z) - inset);
  return [
    ...zs.map((z) => ({ x: width(z), z })),
    ...[...zs].reverse().map((z) => ({ x: -width(z), z })),
  ];
}

/** Is there open water under this point (ground below the water level by at least `margin`)? */
export function isWater(config: GameConfig, x: number, z: number, margin = 0): boolean {
  const { heights, water } = config.arena.terrain;
  if (water === null) return false;
  return heightAt(heights, config.arena.halfSize, x, z) < water - margin;
}

/** Pushes a circle out of the hulls of the fixed ships (the frigate, the carrier). */
function pushOutOfShips(state: GameState, config: GameConfig, pos: Vec2, radius: number): void {
  for (const ship of state.vehicles) {
    const def = config.vehicles[ship.type]!;
    if (!def.fixed || !def.ship) continue;
    const sin = Math.sin(ship.facing);
    const cos = Math.cos(ship.facing);
    const dx = pos.x - ship.pos.x;
    const dz = pos.z - ship.pos.z;
    // Into the ship's own frame: lz along the keel (towards the bow), lx across.
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const reach = shipHalfWidth(def.ship, lz) + radius;
    if (Math.abs(lz) > def.ship.length / 2 + radius || Math.abs(lx) >= reach) continue;
    const sideways = reach - Math.abs(lx);
    const endwise = def.ship.length / 2 + radius - Math.abs(lz);
    let nx = lx;
    let nz = lz;
    if (sideways <= endwise) nx = Math.sign(lx || 1) * reach;
    else nz = Math.sign(lz || 1) * (def.ship.length / 2 + radius);
    pos.x = ship.pos.x + nx * cos + nz * sin;
    pos.z = ship.pos.z - nx * sin + nz * cos;
  }
}

/** Does the hull at `pos` sit in water deep enough all round? */
function floats(config: GameConfig, pos: Vec2, radius: number): boolean {
  const r = radius * HULL_SAMPLE;
  return [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ].every(([dx, dz]) => isWater(config, pos.x + dx!, pos.z + dz!, MIN_DEPTH));
}

/**
 * Where a boat ends up when it tries to go from `from` to `wanted`: kept inside the map, out of
 * props and ships, and on water; a blocked move slides along the shore on one axis if it can.
 * `hit` says whether anything stopped it.
 */
export function moveBoat(
  state: GameState,
  config: GameConfig,
  radius: number,
  from: Vec2,
  wanted: Vec2,
): { pos: Vec2; hit: boolean } {
  const arena = config.arena;
  const settle = (p: Vec2): Vec2 => {
    const out = { ...p };
    for (let i = 0; i < 2; i++) {
      for (const box of obstaclesNear(
        arena,
        out.x - radius,
        out.z - radius,
        out.x + radius,
        out.z + radius,
      )) {
        if (!box.water) resolveCircleAabb(out, radius, box);
      }
      pushOutOfShips(state, config, out, radius);
    }
    const lim = arena.halfSize - radius;
    out.x = Math.min(Math.max(out.x, -lim), lim);
    out.z = Math.min(Math.max(out.z, -lim), lim);
    return out;
  };
  let pos = settle(wanted);
  if (!floats(config, pos, radius)) {
    const alongX = settle({ x: wanted.x, z: from.z });
    const alongZ = settle({ x: from.x, z: wanted.z });
    pos = floats(config, alongX, radius)
      ? alongX
      : floats(config, alongZ, radius)
        ? alongZ
        : { ...from };
  }
  return { pos, hit: Math.hypot(pos.x - wanted.x, pos.z - wanted.z) > 1e-3 };
}

/** Is a soldier of this radius free to stand at (x, z): dry ground clear of every obstacle? */
function standable(config: GameConfig, x: number, z: number, radius: number): boolean {
  const { heights, water } = config.arena.terrain;
  if (water !== null && heightAt(heights, config.arena.halfSize, x, z) < water + 0.05) return false;
  for (const box of obstaclesNear(config.arena, x - radius, z - radius, x + radius, z + radius)) {
    const probe = { x, z };
    resolveCircleAabb(probe, radius, box);
    if (Math.hypot(probe.x - x, probe.z - z) > 1e-6) return false;
  }
  return true;
}

/**
 * Dry ground within `maxReach` metres of a boat's hull where a soldier can step out, or null when
 * the boat is out at sea. `slot` turns the search so several soldiers land on different spots.
 */
export function landSpotNear(
  config: GameConfig,
  v: Vehicle,
  slot: number,
  maxReach = 8,
): Vec2 | null {
  const hull = config.vehicles[v.type]!.radius + config.player.radius;
  const start = v.facing + Math.PI / 2 + slot * 0.9;
  const ANGLES = 16;
  for (let reach = hull + 0.8; reach <= hull + maxReach; reach += 1.2) {
    for (let k = 0; k < ANGLES; k++) {
      // Alternate either side of the preferred angle.
      const angle = start + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * ((2 * Math.PI) / ANGLES);
      const x = v.pos.x + Math.sin(angle) * reach;
      const z = v.pos.z + Math.cos(angle) * reach;
      if (standable(config, x, z, config.player.radius)) return { x, z };
    }
  }
  return null;
}
