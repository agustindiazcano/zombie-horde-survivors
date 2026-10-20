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
    panic: 0,
    fear: null,
    gathered: false,
    lift: 0,
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

    // Held in an abductor's beam: it does not move.
    if (a.lift > 0) continue;

    // Hunter spheres close by keep everyone running.
    if (def.fearRadius) {
      for (const orb of state.orbs) {
        const od = config.orbs[orb.type];
        if (od?.kind !== 'metal' || orb.phase === 'dormant') continue;
        if (Math.hypot(orb.pos.x - a.pos.x, orb.pos.z - a.pos.z) < def.fearRadius) {
          a.panic = Math.max(a.panic, 1);
          a.fear = { x: orb.pos.x, z: orb.pos.z };
        }
      }
    }

    // A panicking civilian runs straight away from what scared it and forgets the stroll.
    if (a.panic > 0 && a.fear) {
      a.panic -= dt;
      a.dest = null;
      const dx = a.pos.x - a.fear.x;
      const dz = a.pos.z - a.fear.z;
      const d = Math.hypot(dx, dz) || 1;
      a.facing = Math.atan2(dx, dz);
      const step = (def.panicSpeed ?? def.speed) * dt;
      a.pos.x += (dx / d) * step;
      a.pos.z += (dz / d) * step;
      resolveStatic(a.pos, def.radius, config.arena);
      continue;
    }

    // During the sky show the neighbours stand and watch until something scares them. Later they
    // walk over to the spot where the craft hang low, and stand there.
    if (config.skyShowOn) {
      const rules = config.skyShow;
      if (state.time >= rules.gatherAt && !a.gathered) {
        a.gathered = true;
        const angle = nextFloat(state.rng) * Math.PI * 2;
        const dist = Math.sqrt(nextFloat(state.rng)) * rules.gatherRadius;
        a.dest = {
          x: rules.gatherX + Math.sin(angle) * dist,
          z: rules.gatherZ + Math.cos(angle) * dist,
        };
      }
      if (!a.dest && state.time < rules.calmUntil) continue;
    }

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
