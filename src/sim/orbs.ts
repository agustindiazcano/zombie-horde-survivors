import type { GameConfig } from './config';
import type { Animal, GameState, Orb } from './types';
import type { Vec2 } from './vec';

/** A civilian is a wandering animal whose type can be afraid (`fearRadius` in game.json). */
const isCivilian = (config: GameConfig, a: Animal): boolean => !!config.animals[a.type]?.fearRadius;

export function createOrbs(state: GameState, config: GameConfig): void {
  for (const o of config.startOrbs) {
    if (!(o.type in config.orbs)) continue;
    state.orbs.push({
      id: state.nextOrbId++,
      type: o.type,
      pos: { x: o.x, z: o.z },
      prev: { x: o.x, z: o.z },
      wake: o.at,
      phase: 'dormant',
      timer: 0,
      targetId: null,
      aim: null,
    });
  }
}

/** The civilian closest to `from`, or null when none is left. */
function nearestCivilian(state: GameState, config: GameConfig, from: Vec2): Animal | null {
  let best: Animal | null = null;
  let bestD = Infinity;
  for (const a of state.animals) {
    if (!isCivilian(config, a)) continue;
    const d = Math.hypot(a.pos.x - from.x, a.pos.z - from.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Everyone near a kill takes fright and runs away from it. */
function scare(state: GameState, config: GameConfig, at: Vec2, radius: number): void {
  for (const a of state.animals) {
    const def = config.animals[a.type];
    if (!def?.fearRadius) continue;
    if (Math.hypot(a.pos.x - at.x, a.pos.z - at.z) > Math.max(radius, def.fearRadius)) continue;
    a.panic = 6;
    a.fear = { x: at.x, z: at.z };
  }
}

/**
 * Metal spheres. A dormant sphere wakes at its time, then repeats: wait, appear beside the head of
 * the nearest civilian (a jump, no sound), charge, vaporise it (no corpse), rest. A target that
 * runs is followed at `chaseSpeed`. Soldiers are not targets yet (the hide-and-seek step adds them).
 */
export function updateOrbs(state: GameState, config: GameConfig, dt: number): void {
  for (const orb of state.orbs) {
    const def = config.orbs[orb.type];
    if (!def) continue;
    orb.prev.x = orb.pos.x;
    orb.prev.z = orb.pos.z;

    if (orb.phase === 'dormant') {
      if (state.time < orb.wake) continue;
      startSeek(orb, def.appearDelay);
    }

    if (orb.phase === 'cool' || orb.phase === 'seek') {
      orb.timer -= dt;
      if (orb.timer > 0) continue;
      if (orb.phase === 'cool') {
        startSeek(orb, def.appearDelay);
        continue;
      }
      const target = nearestCivilian(state, config, orb.pos);
      if (!target) {
        orb.timer = 1;
        continue;
      }
      orb.targetId = target.id;
      jumpBeside(orb, target.pos, def.appearDistance);
      scare(state, config, target.pos, def.panicRadius);
      orb.phase = 'charge';
      orb.timer = def.chargeTime;
      orb.aim = { x: target.pos.x, z: target.pos.z };
      continue;
    }

    // Charging: keep up with the target, then fire.
    const target = state.animals.find((a) => a.id === orb.targetId);
    if (!target) {
      orb.phase = 'cool';
      orb.timer = def.cooldown;
      orb.targetId = null;
      orb.aim = null;
      continue;
    }
    follow(orb, target.pos, def.appearDistance, def.chaseSpeed * dt);
    orb.aim = { x: target.pos.x, z: target.pos.z };
    orb.timer -= dt;
    if (orb.timer > 0) continue;
    state.animals.splice(state.animals.indexOf(target), 1);
    state.casualties++;
    state.events.push({ type: 'vaporised', pos: { x: target.pos.x, z: target.pos.z } });
    scare(state, config, target.pos, def.panicRadius);
    orb.phase = 'cool';
    orb.timer = def.cooldown;
    orb.targetId = null;
    orb.aim = null;
  }
}

function startSeek(orb: Orb, delay: number): void {
  orb.phase = 'seek';
  orb.timer = delay;
}

/** Appears at `distance` from `to`, on the side it already was (a short jump, not a flight). */
function jumpBeside(orb: Orb, to: Vec2, distance: number): void {
  const dx = orb.pos.x - to.x;
  const dz = orb.pos.z - to.z;
  const d = Math.hypot(dx, dz) || 1;
  orb.pos.x = to.x + (dx / d) * distance;
  orb.pos.z = to.z + (dz / d) * distance;
  // No interpolation across the jump: it simply is there.
  orb.prev.x = orb.pos.x;
  orb.prev.z = orb.pos.z;
}

/** Moves toward the point that is `distance` from `to`, by at most `step` metres. */
function follow(orb: Orb, to: Vec2, distance: number, step: number): void {
  const dx = orb.pos.x - to.x;
  const dz = orb.pos.z - to.z;
  const d = Math.hypot(dx, dz) || 1;
  const wantX = to.x + (dx / d) * distance;
  const wantZ = to.z + (dz / d) * distance;
  const mx = wantX - orb.pos.x;
  const mz = wantZ - orb.pos.z;
  const m = Math.hypot(mx, mz);
  if (m < 1e-6) return;
  const k = Math.min(m, step) / m;
  orb.pos.x += mx * k;
  orb.pos.z += mz * k;
}
