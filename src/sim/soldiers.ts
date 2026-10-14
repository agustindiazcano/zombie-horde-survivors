import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import type { GameState, Input, Soldier, Zombie } from './types';
import { isBlocked, fireWeapon } from './weapon';
import { dirFromAngle, type Vec2 } from './vec';

/** Angle between consecutive followers' formation slots (golden angle spreads them evenly). */
const SLOT_ANGLE = 2.399;
const ARRIVE_DISTANCE = 0.3;
const SLOT_TOLERANCE = 0.6;
const CATCH_UP_SPEED = 1.2;
const FORMATION_SPACING = 1.4;

export function createSquad(config: GameConfig): Soldier[] {
  const n = config.squad.count;
  return Array.from({ length: n }, (_, i) => {
    // The first soldier stands at the origin; the rest form a ring around it.
    const angle = ((i - 1) / Math.max(n - 1, 1)) * Math.PI * 2;
    const pos = i === 0 ? { x: 0, z: 0 } : { x: Math.sin(angle) * 1.5, z: Math.cos(angle) * 1.5 };
    return {
      id: i + 1,
      pos,
      prev: { ...pos },
      facing: 0,
      health: config.player.maxHealth,
      dead: false,
      fireCooldown: 0,
      order: { type: 'follow' },
    };
  });
}

export const getSoldier = (state: GameState, id: number | null): Soldier | undefined =>
  id === null ? undefined : state.soldiers.find((s) => s.id === id);

export function livingSoldiers(state: GameState): Soldier[] {
  return state.soldiers.filter((s) => !s.dead);
}

/** Takes direct control of a living soldier, or returns to RTS mode with `null`. */
export function controlSoldier(state: GameState, id: number | null): void {
  const s = getSoldier(state, id);
  state.controlledId = s && !s.dead ? s.id : null;
}

/** Sends soldiers to a point, spread in a small grid so they don't stack. */
export function orderMove(state: GameState, config: GameConfig, ids: number[], target: Vec2): void {
  const units = state.soldiers.filter((s) => !s.dead && ids.includes(s.id));
  const cols = Math.ceil(Math.sqrt(units.length));
  const rows = Math.ceil(units.length / cols);
  const lim = config.arena.halfSize - config.player.radius;
  units.forEach((s, k) => {
    const ox = ((k % cols) - (cols - 1) / 2) * FORMATION_SPACING;
    const oz = (Math.floor(k / cols) - (rows - 1) / 2) * FORMATION_SPACING;
    s.order = {
      type: 'move',
      x: Math.min(Math.max(target.x + ox, -lim), lim),
      z: Math.min(Math.max(target.z + oz, -lim), lim),
    };
  });
}

export function orderFollow(state: GameState, ids: number[]): void {
  for (const s of state.soldiers) if (!s.dead && ids.includes(s.id)) s.order = { type: 'follow' };
}

export function orderHold(state: GameState, ids: number[]): void {
  for (const s of state.soldiers) if (!s.dead && ids.includes(s.id)) s.order = { type: 'hold' };
}

/** Applies damage; a soldier at 0 health dies and, if controlled, drops back to RTS mode. */
export function hurtSoldier(
  state: GameState,
  soldier: Soldier,
  amount: number,
  zombieId: number,
): void {
  if (soldier.dead) return;
  soldier.health = Math.max(0, soldier.health - amount);
  state.events.push({ type: 'soldierHurt', soldierId: soldier.id, damage: amount, zombieId });
  if (soldier.health > 0) return;
  soldier.dead = true;
  state.events.push({ type: 'soldierDied', soldierId: soldier.id });
  if (state.controlledId === soldier.id) state.controlledId = null;
}

export function updateSoldiers(
  state: GameState,
  config: GameConfig,
  input: Input,
  dt: number,
): void {
  const leader = getSoldier(state, state.controlledId);
  for (const s of state.soldiers) {
    s.prev.x = s.pos.x;
    s.prev.z = s.pos.z;
    if (s.dead) continue;
    s.fireCooldown = Math.max(0, s.fireCooldown - dt);
    if (s.id === state.controlledId) updateControlled(state, config, s, input, dt);
    else updateAi(state, config, s, leader, dt);
  }
  separateSoldiers(state, config);
}

function updateControlled(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  input: Input,
  dt: number,
): void {
  const { move, aim } = input;
  // Normalize only above unit length so analog input keeps its magnitude.
  const l = Math.hypot(move.x, move.z);
  const k = l > 1 ? 1 / l : 1;
  s.pos.x += move.x * k * config.player.speed * dt;
  s.pos.z += move.z * k * config.player.speed * dt;
  resolveStatic(s.pos, config.player.radius, config.arena);

  const dx = aim.x - s.pos.x;
  const dz = aim.z - s.pos.z;
  if (dx * dx + dz * dz > 1e-9) s.facing = Math.atan2(dx, dz);

  if (input.firing && s.fireCooldown <= 0) fireWeapon(state, config, s);
}

function updateAi(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  leader: Soldier | undefined,
  dt: number,
): void {
  // Movement destination from the current order.
  let dest: Vec2 | null = null;
  let speed = config.player.speed;
  if (s.order.type === 'move') {
    dest = { x: s.order.x, z: s.order.z };
    if (Math.hypot(dest.x - s.pos.x, dest.z - s.pos.z) < ARRIVE_DISTANCE) {
      s.order = { type: 'hold' };
      dest = null;
    }
  } else if (s.order.type === 'follow' && leader) {
    const a = s.id * SLOT_ANGLE;
    const slot = {
      x: leader.pos.x + Math.sin(a) * config.squad.followDistance,
      z: leader.pos.z + Math.cos(a) * config.squad.followDistance,
    };
    const d = Math.hypot(slot.x - s.pos.x, slot.z - s.pos.z);
    if (d > SLOT_TOLERANCE) dest = slot;
    if (d > config.squad.followDistance * 2.5) speed *= CATCH_UP_SPEED;
  }

  let moveAngle: number | null = null;
  if (dest) {
    const dx = dest.x - s.pos.x;
    const dz = dest.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(speed * dt, d);
    s.pos.x += (dx / d) * step;
    s.pos.z += (dz / d) * step;
    resolveStatic(s.pos, config.player.radius, config.arena);
    moveAngle = Math.atan2(dx, dz);
  }

  const target = findTarget(state, config, s);
  if (target) {
    s.facing = Math.atan2(target.pos.x - s.pos.x, target.pos.z - s.pos.z);
    if (s.fireCooldown <= 0) fireWeapon(state, config, s, config.squad.aiFireRateScale);
  } else if (moveAngle !== null) {
    s.facing = moveAngle;
  }
}

/** Nearest living zombie within AI range and line of sight. */
function findTarget(state: GameState, config: GameConfig, s: Soldier): Zombie | null {
  let best: Zombie | null = null;
  let bestDist = config.squad.aiRange;
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const d = Math.hypot(z.pos.x - s.pos.x, z.pos.z - s.pos.z);
    if (d >= bestDist) continue;
    const dir = dirFromAngle(Math.atan2(z.pos.x - s.pos.x, z.pos.z - s.pos.z));
    if (isBlocked(s.pos, dir, d - config.zombie.radius, config)) continue;
    best = z;
    bestDist = d;
  }
  return best;
}

/** Keeps living soldiers from overlapping each other. */
function separateSoldiers(state: GameState, config: GameConfig): void {
  const minDist = config.player.radius * 2;
  const list = state.soldiers;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      if (b.dead) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= minDist) continue;
      const nx = d < 1e-6 ? 1 : dx / d;
      const nz = d < 1e-6 ? 0 : dz / d;
      const push = (minDist - d) / 2;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
    }
  }
  for (const s of list) if (!s.dead) resolveStatic(s.pos, config.player.radius, config.arena);
}
