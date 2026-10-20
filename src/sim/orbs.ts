import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { Animal, GameState, Orb } from './types';
import type { Vec2 } from './vec';

type OrbDef = GameConfig['orbs'][string];

/** A civilian is a wandering animal whose type can be afraid (`fearRadius` in game.json). */
const isCivilian = (config: GameConfig, a: Animal): boolean => !!config.animals[a.type]?.fearRadius;

const between = (state: GameState, lo: number, hi: number): number =>
  lo + nextFloat(state.rng) * (hi - lo);

export function createOrbs(state: GameState, config: GameConfig): void {
  for (const o of config.startOrbs) {
    const def = config.orbs[o.type];
    if (!def) continue;
    const y = o.y ?? def.height;
    state.orbs.push({
      id: state.nextOrbId++,
      type: o.type,
      pos: { x: o.x, z: o.z },
      prev: { x: o.x, z: o.z },
      y,
      prevY: y,
      wake: o.at,
      phase: 'dormant',
      timer: 0,
      targetId: null,
      aim: null,
      lowAt: o.lowAt ?? null,
      hover: o.hx !== undefined && o.hz !== undefined ? { x: o.hx, z: o.hz } : null,
      waypoint: null,
      arrivedAt: null,
      victims: 0,
      glow: 0,
    });
  }
}

/** The civilian closest to `from`, or null when none is left. */
function nearestCivilian(state: GameState, config: GameConfig, from: Vec2): Animal | null {
  let best: Animal | null = null;
  let bestD = Infinity;
  for (const a of state.animals) {
    if (!isCivilian(config, a) || a.lift > 0 || a.burn > 0) continue;
    const d = Math.hypot(a.pos.x - from.x, a.pos.z - from.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Everyone near a kill or a beam takes fright and runs away from it. */
function scare(state: GameState, config: GameConfig, at: Vec2, radius: number): void {
  for (const a of state.animals) {
    const def = config.animals[a.type];
    if (!def?.fearRadius || a.lift > 0 || a.burn > 0) continue;
    if (Math.hypot(a.pos.x - at.x, a.pos.z - at.z) > Math.max(radius, def.fearRadius)) continue;
    a.panic = 12;
    a.fear = { x: at.x, z: at.z };
  }
}

/**
 * Celestial spheres, by kind:
 * - `metal` hunters wake at their time, then repeat: wait, appear beside the head of the nearest
 *   civilian (a jump, no sound), charge, vaporise it (no corpse), rest.
 * - `scout`s dash about the sky in short bursts and sudden stops, and at `lowAt` come down to
 *   hang above the crowd, higher than a person.
 * - `abductor`s fly to the crowd, shine a beam on the nearest person and lift them slowly away,
 *   then leave the sky at speed.
 * Soldiers are not targets yet (the hide-and-seek step adds them).
 */
export function updateOrbs(state: GameState, config: GameConfig, dt: number): void {
  for (const orb of state.orbs) {
    const def = config.orbs[orb.type];
    if (!def) continue;
    orb.prev.x = orb.pos.x;
    orb.prev.z = orb.pos.z;
    orb.prevY = orb.y;
    if (orb.phase === 'gone') continue;
    if (orb.phase === 'dormant' && state.time >= orb.wake) {
      orb.phase = def.kind === 'scout' ? 'roam' : def.kind === 'abductor' ? 'arrive' : 'seek';
      orb.timer = def.kind === 'metal' ? def.appearDelay : 0;
    }
    if (orb.phase === 'dormant') continue;
    if (def.kind === 'scout') updateScout(state, config, orb, def, dt);
    else if (def.kind === 'abductor') updateAbductor(state, config, orb, def, dt);
    else updateHunter(state, config, orb, def, dt);
  }
}

function updateHunter(
  state: GameState,
  config: GameConfig,
  orb: Orb,
  def: OrbDef,
  dt: number,
): void {
  if (orb.phase === 'cool' || orb.phase === 'seek') {
    orb.timer -= dt;
    if (orb.timer > 0) return;
    if (orb.phase === 'cool') {
      orb.phase = 'seek';
      orb.timer = def.appearDelay;
      return;
    }
    const target = nearestCivilian(state, config, orb.pos);
    if (!target) {
      orb.timer = 1;
      return;
    }
    orb.targetId = target.id;
    jumpBeside(orb, target.pos, def.appearDistance);
    orb.y = def.height;
    orb.prevY = orb.y;
    scare(state, config, target.pos, def.panicRadius);
    orb.phase = 'charge';
    orb.timer = def.chargeTime;
    orb.aim = { x: target.pos.x, z: target.pos.z };
    return;
  }

  // Charging: keep up with the target, then the ray holds it while it burns, then it is ash.
  const target = state.animals.find((a) => a.id === orb.targetId);
  if (!target) {
    orb.phase = 'cool';
    orb.timer = def.cooldown;
    orb.targetId = null;
    orb.aim = null;
    return;
  }
  follow(orb, target.pos, def.appearDistance, def.chaseSpeed * dt);
  orb.aim = { x: target.pos.x, z: target.pos.z };
  orb.timer -= dt;
  if (orb.phase === 'charge') {
    if (orb.timer > 0) return;
    // The ray lands: the person stands rigid and glows for a few seconds.
    orb.phase = 'burn';
    orb.timer = def.vaporTime ?? 2.5;
    state.events.push({ type: 'vaporiseStart', pos: { x: target.pos.x, z: target.pos.z } });
    scare(state, config, target.pos, def.panicRadius);
    target.panic = 0;
    return;
  }
  target.burn = Math.min(1, 1 - orb.timer / (def.vaporTime ?? 2.5));
  if (orb.timer > 0) return;
  state.animals.splice(state.animals.indexOf(target), 1);
  state.casualties++;
  state.events.push({ type: 'vaporised', pos: { x: target.pos.x, z: target.pos.z } });
  orb.phase = 'cool';
  orb.timer = def.cooldown;
  orb.targetId = null;
  orb.aim = null;
}

/** Dashes to `to` at `speed` metres per second; true once it is there. */
function flyTo(
  orb: Orb,
  to: { x: number; y: number; z: number },
  speed: number,
  dt: number,
): boolean {
  const mx = to.x - orb.pos.x;
  const my = to.y - orb.y;
  const mz = to.z - orb.pos.z;
  const d = Math.hypot(mx, my, mz);
  const step = speed * dt;
  if (d <= step) {
    orb.pos.x = to.x;
    orb.y = to.y;
    orb.pos.z = to.z;
    return true;
  }
  orb.pos.x += (mx / d) * step;
  orb.y += (my / d) * step;
  orb.pos.z += (mz / d) * step;
  return false;
}

function updateScout(
  state: GameState,
  _config: GameConfig,
  orb: Orb,
  def: OrbDef,
  dt: number,
): void {
  const centre = orb.hover ?? { x: orb.pos.x, z: orb.pos.z };
  if (orb.phase === 'roam' && orb.lowAt !== null && state.time >= orb.lowAt) {
    orb.phase = 'low';
    orb.waypoint = null;
  }
  if (orb.phase === 'low') {
    // Hang low over the crowd: fly to a spot near the hover point, then drift slowly.
    if (!orb.waypoint) {
      const a = nextFloat(state.rng) * Math.PI * 2;
      const r = Math.sqrt(nextFloat(state.rng)) * 6;
      orb.waypoint = {
        x: centre.x + Math.cos(a) * r,
        y: def.lowHeight ?? 5.5,
        z: centre.z + Math.sin(a) * r,
      };
    }
    const reached = flyTo(orb, orb.waypoint, def.chaseSpeed * 0.5, dt);
    if (reached) {
      orb.y = (def.lowHeight ?? 5.5) + Math.sin(state.time * 1.3 + orb.id) * 0.25;
    }
    return;
  }
  // Roam: a burst to a random point in the area, a stop, again.
  if (!orb.waypoint) {
    orb.timer -= dt;
    if (orb.timer > 0) return;
    const a = nextFloat(state.rng) * Math.PI * 2;
    const r = Math.sqrt(nextFloat(state.rng)) * (def.roamRadius ?? 40);
    orb.waypoint = {
      x: centre.x + Math.cos(a) * r,
      y: between(state, 8, def.height + 10),
      z: centre.z + Math.sin(a) * r,
    };
  }
  if (flyTo(orb, orb.waypoint, def.chaseSpeed * between(state, 0.6, 1.3), dt)) {
    orb.waypoint = null;
    orb.timer = between(state, 0.2, 0.9);
  }
}

function updateAbductor(
  state: GameState,
  config: GameConfig,
  orb: Orb,
  def: OrbDef,
  dt: number,
): void {
  const work = orb.hover ?? { x: orb.pos.x, z: orb.pos.z };
  const glowStep = dt / 2;
  if (orb.phase === 'arrive') {
    if (!flyTo(orb, { x: work.x, y: def.height, z: work.z }, def.chaseSpeed, dt)) return;
    orb.arrivedAt = state.time;
    startNextVictim(state, config, orb, def, work);
    return;
  }
  if (orb.phase !== 'leave') {
    // The big sphere lights the whole spot while it is there.
    orb.glow = Math.min(1, orb.glow + glowStep);
    if (state.time >= (orb.arrivedAt ?? 0) + (def.stayTime ?? 60) && orb.phase === 'hold') {
      orb.phase = 'leave';
    }
  }
  if (orb.phase === 'gap' || orb.phase === 'hold') {
    orb.aim = null;
    if (orb.phase === 'gap') {
      orb.timer -= dt;
      if (orb.timer <= 0) startNextVictim(state, config, orb, def, work);
    }
    return;
  }
  const target = state.animals.find((a) => a.id === orb.targetId);
  if (orb.phase === 'beam' || orb.phase === 'lift') {
    if (!target) {
      orb.phase = 'gap';
      orb.timer = def.gap ?? 1.5;
      orb.aim = null;
      return;
    }
    // Hold above the person while the beam works.
    orb.pos.x += (target.pos.x - orb.pos.x) * Math.min(1, 3 * dt);
    orb.pos.z += (target.pos.z - orb.pos.z) * Math.min(1, 3 * dt);
    orb.aim = { x: target.pos.x, z: target.pos.z };
    if (orb.phase === 'beam') {
      orb.timer -= dt;
      if (orb.timer <= 0) orb.phase = 'lift';
      return;
    }
    target.lift += (def.liftSpeed ?? 1.1) * dt;
    target.panic = 0;
    if (target.lift >= (def.liftHeight ?? 7)) {
      state.animals.splice(state.animals.indexOf(target), 1);
      state.casualties++;
      orb.victims++;
      orb.targetId = null;
      orb.aim = null;
      orb.phase = orb.victims >= (def.victims ?? 1) ? 'hold' : 'gap';
      orb.timer = def.gap ?? 1.5;
    }
    return;
  }
  if (orb.phase === 'leave') {
    // The light fades and the sphere goes straight up and away, fast.
    orb.glow = Math.max(0, orb.glow - dt);
    orb.aim = null;
    orb.y += (def.leaveSpeed ?? 90) * dt;
    orb.pos.x += (def.leaveSpeed ?? 90) * 0.4 * dt;
    if (orb.y > 500) orb.phase = 'gone';
  }
}

/** Picks the person nearest the work point and starts the beam on them (the rest stand frozen). */
function startNextVictim(
  state: GameState,
  config: GameConfig,
  orb: Orb,
  def: OrbDef,
  work: Vec2,
): void {
  const target = nearestCivilian(state, config, work);
  if (!target) {
    orb.phase = 'hold';
    return;
  }
  orb.targetId = target.id;
  orb.aim = { x: target.pos.x, z: target.pos.z };
  orb.phase = 'beam';
  orb.timer = def.beamTime ?? 2;
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
