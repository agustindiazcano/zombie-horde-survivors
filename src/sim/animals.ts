import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { Animal, GameState } from './types';
import type { Vec2 } from './vec';

/** An animal this close (metres) to its walk target has arrived. */
const ARRIVE_DISTANCE = 0.3;

export function createAnimal(id: number, type: string, pos: Vec2, facing = 0): Animal {
  return {
    id,
    type,
    pos: { ...pos },
    prev: { ...pos },
    facing,
    home: { ...pos },
    dest: null,
    wait: 1,
  };
}

/**
 * Animals are harmless scenery that lives: they wait a few seconds, walk to a random spot near
 * where they were placed, and wait again. Nothing hurts them and they hurt nobody.
 */
export function updateAnimals(state: GameState, config: GameConfig, dt: number): void {
  for (const a of state.animals) {
    const def = config.animals[a.type];
    if (!def) continue;
    a.prev.x = a.pos.x;
    a.prev.z = a.pos.z;

    if (!a.dest) {
      a.wait -= dt;
      if (a.wait > 0) continue;
      const angle = nextFloat(state.rng) * Math.PI * 2;
      const dist = nextFloat(state.rng) * def.wanderRadius;
      a.dest = { x: a.home.x + Math.sin(angle) * dist, z: a.home.z + Math.cos(angle) * dist };
      continue;
    }
    const dx = a.dest.x - a.pos.x;
    const dz = a.dest.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE_DISTANCE) {
      a.dest = null;
      a.wait = def.pauseMin + nextFloat(state.rng) * (def.pauseMax - def.pauseMin);
      continue;
    }
    a.facing = Math.atan2(dx, dz);
    const step = Math.min(d, def.speed * dt);
    a.pos.x += (dx / d) * step;
    a.pos.z += (dz / d) * step;
    resolveStatic(a.pos, def.radius, config.arena);
  }
}
