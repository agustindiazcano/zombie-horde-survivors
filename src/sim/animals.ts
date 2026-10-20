import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { Animal, GameState } from './types';
import type { Vec2 } from './vec';

/** An animal this close (metres) to its walk target has arrived. */
const ARRIVE_DISTANCE = 0.3;
/** How much faster a neighbour walks while going to the crowd of the sky show. */
const GATHER_HURRY = 2.5;
/** Speed (m/s) at which a crowd steps backwards from a beam. */
const RETREAT_SPEED = 0.9;

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
    burn: 0,
    burnSpeed: 0,
    retreat: null,
    retreatLeft: 0,
    rush: null,
    rushSpeed: 0,
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

    // A scripted actor (a grey alien) is moved by its own scene.
    if (def.scripted) continue;

    // Held in an abductor's beam: it does not move.
    if (a.lift > 0 || a.burn > 0) continue;

    // Stepping backwards away from a beam, still facing it.
    if (a.retreatLeft > 0 && a.retreat && a.panic <= 0) {
      const dx = a.pos.x - a.retreat.x;
      const dz = a.pos.z - a.retreat.z;
      const d = Math.hypot(dx, dz) || 1;
      const step = RETREAT_SPEED * dt;
      a.facing = Math.atan2(-dx, -dz);
      a.dest = null;
      a.pos.x += (dx / d) * step;
      a.pos.z += (dz / d) * step;
      a.retreatLeft -= step;
      resolveStatic(a.pos, def.radius, config.arena);
      continue;
    }

    // Running to someone's side.
    if (a.rush) {
      const dx = a.rush.x - a.pos.x;
      const dz = a.rush.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) a.rush = null;
      else {
        const step = Math.min(d, (a.rushSpeed || (def.panicSpeed ?? def.speed)) * dt);
        a.facing = Math.atan2(dx, dz);
        a.pos.x += (dx / d) * step;
        a.pos.z += (dz / d) * step;
        resolveStatic(a.pos, def.radius, config.arena);
      }
      continue;
    }

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
    // Walking over to the crowd, they hurry.
    const step = Math.min(d, def.speed * (a.gathered ? GATHER_HURRY : 1) * dt);
    a.pos.x += (dx / d) * step;
    a.pos.z += (dz / d) * step;
    resolveStatic(a.pos, def.radius, config.arena);
  }
  if (config.skyShowOn) separateCrowd(state, config);
}

/** Neighbours standing close push each other apart a little, so a crowd does not overlap itself. */
const PERSONAL_SPACE = 0.75;
export function separateCrowd(state: GameState, config: GameConfig): void {
  const crowd = state.animals.filter((a) => config.animals[a.type]?.fearRadius && a.lift <= 0);
  for (let i = 0; i < crowd.length; i++) {
    const a = crowd[i]!;
    for (let j = i + 1; j < crowd.length; j++) {
      const b = crowd[j]!;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= PERSONAL_SPACE) continue;
      const push = (PERSONAL_SPACE - d) * 0.25;
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
    }
  }
}
