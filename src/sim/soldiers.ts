import { resolveStatic } from './collision';
import { localPlayer } from './players';
import { rescueTarget } from './revive';
import { isDrone, speedOf, weaponOf } from './stats';
import { WEAPON_CLASSES, type GameConfig, type WeaponClass } from './config';
import type { GameState, Input, Soldier, Stance, Zombie } from './types';
import { isBlocked, fireWeapon } from './weapon';
import { dirFromAngle, type Vec2 } from './vec';

/** Angle between consecutive followers' formation slots (golden angle spreads them evenly). */
const SLOT_ANGLE = 2.399;
const ARRIVE_DISTANCE = 0.3;
const SLOT_TOLERANCE = 0.6;
const CATCH_UP_SPEED = 1.2;
const FORMATION_SPACING = 1.4;

/** The sheet fields of a new unit: its type, a copy of the attributes and empty weapon skills. */
function sheetOf(config: GameConfig, unitType: string) {
  return {
    unitType,
    attributes: { ...config.units.units[unitType]!.attributes },
    skills: Object.fromEntries(WEAPON_CLASSES.map((c) => [c, 0])) as Record<WeaponClass, number>,
  };
}

/** A fresh soldier or drone at `pos`, ready to follow its leader. */
function newUnit(
  config: GameConfig,
  kind: 'soldier' | 'drone',
  id: number,
  owner: string,
  pos: Vec2,
  facing = 0,
): Soldier {
  return {
    id,
    owner,
    kind,
    pos: { ...pos },
    prev: { ...pos },
    facing,
    health: config.player.maxHealth,
    dead: false,
    fireCooldown: 0,
    y: 0,
    prevY: 0,
    vy: 0,
    order: { type: 'follow' },
    equipment: {
      rightHand: kind === 'soldier' ? config.squad.startWeapon : null,
      leftHand: null,
      chest: null,
    },
    backpack: [],
    xp: 0,
    kills: 0,
    stamina: config.stance.staminaMax,
    winded: false,
    armor: 0,
    downed: false,
    bleedOut: 0,
    deadTime: 0,
    reviveProgress: 0,
    vehicleId: null,
    ...sheetOf(config, kind),
  };
}

export function createSquad(config: GameConfig, owner: string): Soldier[] {
  const placed = config.placed.filter(
    (u) => u.owner === owner && (u.type === 'soldier' || u.type === 'drone'),
  );
  // A map that places the squad by hand replaces the default ring around the origin.
  if (placed.length > 0) {
    return placed.map((u, i) =>
      newUnit(config, u.type as 'soldier' | 'drone', i + 1, owner, u, u.rotation),
    );
  }
  const n = config.squad.count;
  const soldiers: Soldier[] = Array.from({ length: n }, (_, i) => {
    // The first soldier stands at the origin; the rest form a ring around it.
    const angle = ((i - 1) / Math.max(n - 1, 1)) * Math.PI * 2;
    const pos = i === 0 ? { x: 0, z: 0 } : { x: Math.sin(angle) * 1.5, z: Math.cos(angle) * 1.5 };
    return newUnit(config, 'soldier', i + 1, owner, pos);
  });
  for (let i = 0; i < config.drone.count; i++) {
    soldiers.push(newUnit(config, 'drone', n + i + 1, owner, { x: -1 - i, z: 1 }));
  }
  return soldiers;
}

/** Keeps a unit inside the arena; ground units are also pushed out of obstacles. */
function resolveUnit(s: Soldier, config: GameConfig): void {
  if (isDrone(s)) {
    const lim = config.arena.halfSize - config.player.radius;
    s.pos.x = Math.min(Math.max(s.pos.x, -lim), lim);
    s.pos.z = Math.min(Math.max(s.pos.z, -lim), lim);
  } else {
    resolveStatic(s.pos, config.player.radius, config.arena);
  }
}

export const getSoldier = (state: GameState, id: number | null): Soldier | undefined =>
  id === null ? undefined : state.soldiers.find((s) => s.id === id);

export function livingSoldiers(state: GameState): Soldier[] {
  return state.soldiers.filter((s) => !s.dead);
}

/** Takes direct control of a living soldier, or returns to RTS mode with `null`. */
export function controlSoldier(state: GameState, id: number | null): void {
  const s = getSoldier(state, id);
  localPlayer(state).controlledId = s && !s.dead ? s.id : null;
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

/** A unit dies for good and, if controlled, its player drops back to RTS mode. */
function killSoldier(state: GameState, soldier: Soldier): void {
  soldier.dead = true;
  soldier.downed = false;
  soldier.deadTime = 0;
  soldier.reviveProgress = 0;
  state.events.push({ type: 'soldierDied', soldierId: soldier.id });
  const owner = state.players.find((p) => p.id === soldier.owner);
  if (owner && owner.controlledId === soldier.id) owner.controlledId = null;
}

/**
 * Applies damage. A soldier at 0 health goes down (and bleeds out unless revived); hits on a
 * downed soldier shorten the bleed-out. A drone at 0 health simply dies.
 */
export function hurtSoldier(
  state: GameState,
  config: GameConfig,
  soldier: Soldier,
  amount: number,
  zombieId: number,
): void {
  if (soldier.dead) return;
  state.events.push({ type: 'soldierHurt', soldierId: soldier.id, damage: amount, zombieId });
  if (soldier.downed) {
    soldier.bleedOut -= amount * config.downed.damageBleed;
    if (soldier.bleedOut <= 0) killSoldier(state, soldier);
    return;
  }
  const soaked = Math.min(soldier.armor, amount);
  soldier.armor -= soaked;
  soldier.health = Math.max(0, soldier.health - (amount - soaked));
  if (soldier.health > 0) return;
  if (soldier.kind === 'drone') {
    killSoldier(state, soldier);
    return;
  }
  soldier.downed = true;
  soldier.bleedOut = config.downed.bleedOut;
  state.events.push({ type: 'soldierDowned', soldierId: soldier.id });
}

export function updateSoldiers(
  state: GameState,
  config: GameConfig,
  input: Input,
  dt: number,
): void {
  const controlledId = localPlayer(state).controlledId;
  const leader = getSoldier(state, controlledId);
  for (const s of state.soldiers) {
    s.prev.x = s.pos.x;
    s.prev.z = s.pos.z;
    s.prevY = s.y;
    if (s.dead) {
      s.deadTime += dt;
      continue;
    }
    if (s.downed) {
      s.bleedOut -= dt;
      if (s.bleedOut <= 0) {
        killSoldier(state, s);
        continue;
      }
    }
    // May dip up to one step below zero so the leftover time carries into the next shot.
    s.fireCooldown = Math.max(-dt, s.fireCooldown - dt);
    if (state.mods.regen > 0 && !isDrone(s) && !s.downed) {
      const max = config.player.maxHealth * state.mods.maxHealth;
      s.health = Math.min(max, s.health + state.mods.regen * dt);
    }
    // The squad's sprint order only works for a unit that still has breath.
    const stance =
      s.downed || (state.stance === 'sprint' && (s.winded || isDrone(s))) ? 'normal' : state.stance;
    if (s.vehicleId !== null) updateSeated(state, config, s, input, controlledId);
    else if (s.id === controlledId) updateControlled(state, config, s, input, stance, dt);
    else updateAi(state, config, s, leader, stance, dt);
    updateStamina(config, s, stance, dt);
    updateJump(config, s, dt);
  }
  separateSoldiers(state, config);
}

/** Sprinting while moving drains stamina; otherwise it refills. Running dry winds the unit. */
function updateStamina(config: GameConfig, s: Soldier, stance: Stance, dt: number): void {
  if (isDrone(s)) return;
  const { staminaMax, staminaDrain, staminaRegen, staminaResume } = config.stance;
  const moved = Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) > 1e-6;
  if (stance === 'sprint' && moved) {
    s.stamina = Math.max(0, s.stamina - staminaDrain * dt);
    if (s.stamina === 0) s.winded = true;
    return;
  }
  s.stamina = Math.min(staminaMax, s.stamina + staminaRegen * dt);
  if (s.winded && s.stamina >= staminaResume) s.winded = false;
}

/** Vertical motion of a jump; runs for every unit so a jump always finishes. */
function updateJump(config: GameConfig, s: Soldier, dt: number): void {
  if (s.y === 0 && s.vy === 0) return;
  s.vy -= config.stance.gravity * dt;
  s.y += s.vy * dt;
  if (s.y <= 0) {
    s.y = 0;
    s.vy = 0;
  }
}

/**
 * A soldier in a vehicle rides along (the vehicle moves it). The driver only drives; passengers
 * shoot from a vehicle with mounted weapons, aiming with the mouse or at the nearest enemy.
 */
function updateSeated(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  input: Input,
  controlledId: number | null,
): void {
  const v = state.vehicles.find((u) => u.id === s.vehicleId);
  if (!v) {
    s.vehicleId = null;
    return;
  }
  s.facing = v.facing;
  if (v.seats[0] === s.id || !config.vehicles[v.type]!.passengersShoot) return;
  if (s.id === controlledId) {
    const dx = input.aim.x - s.pos.x;
    const dz = input.aim.z - s.pos.z;
    if (dx * dx + dz * dz > 1e-9) s.facing = Math.atan2(dx, dz);
    if (input.firing && s.fireCooldown <= 0) fireWeapon(state, config, s);
    return;
  }
  const target = findTarget(state, config, s);
  if (!target) return;
  s.facing = Math.atan2(target.pos.x - s.pos.x, target.pos.z - s.pos.z);
  if (s.fireCooldown <= 0) fireWeapon(state, config, s, config.squad.aiFireRateScale);
}

function updateControlled(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  input: Input,
  stance: Stance,
  dt: number,
): void {
  const { move, aim } = input;
  // Normalize only above unit length so analog input keeps its magnitude.
  const l = Math.hypot(move.x, move.z);
  const k = l > 1 ? 1 / l : 1;
  const speed = speedOf(config, s, state.mods, stance);
  s.pos.x += move.x * k * speed * dt;
  s.pos.z += move.z * k * speed * dt;
  resolveUnit(s, config);

  const dx = aim.x - s.pos.x;
  const dz = aim.z - s.pos.z;
  if (dx * dx + dz * dz > 1e-9) s.facing = Math.atan2(dx, dz);

  if (input.jump && s.y === 0 && s.vy === 0 && !isDrone(s) && !s.downed) {
    s.vy = config.stance.jumpSpeed;
  }

  if (input.firing && s.fireCooldown <= 0) fireWeapon(state, config, s);
}

function updateAi(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  leader: Soldier | undefined,
  stance: Stance,
  dt: number,
): void {
  // Movement destination from the current order.
  let dest: Vec2 | null = null;
  let speed = speedOf(config, s, state.mods, stance);
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

  // Walk to a downed ally (with a medkit) or a fallen one (with a defibrillator) and stay there.
  const patient = s.order.type === 'follow' ? rescueTarget(state, config, s) : null;
  if (patient) {
    const near = Math.hypot(patient.pos.x - s.pos.x, patient.pos.z - s.pos.z);
    dest = near > config.downed.reviveRange * 0.7 ? { ...patient.pos } : null;
  }
  // A downed unit cannot walk on its own; it can still shoot.
  if (s.downed) dest = null;

  let moveAngle: number | null = null;
  if (dest) {
    const dx = dest.x - s.pos.x;
    const dz = dest.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(speed * dt, d);
    s.pos.x += (dx / d) * step;
    s.pos.z += (dz / d) * step;
    resolveUnit(s, config);
    moveAngle = Math.atan2(dx, dz);
  }

  const target = findTarget(state, config, s);
  if (target) {
    s.facing = Math.atan2(target.pos.x - s.pos.x, target.pos.z - s.pos.z);
    if (s.fireCooldown <= 0) {
      fireWeapon(state, config, s, isDrone(s) ? 1 : config.squad.aiFireRateScale);
    }
  } else if (moveAngle !== null) {
    s.facing = moveAngle;
  }
}

/** Nearest living zombie within AI range and line of sight. */
function findTarget(state: GameState, config: GameConfig, s: Soldier): Zombie | null {
  const weapon = weaponOf(config, s, state.mods);
  if (!weapon) return null;
  let best: Zombie | null = null;
  let bestDist = isDrone(s) ? weapon.range : Math.min(config.squad.aiRange, weapon.range);
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const d = Math.hypot(z.pos.x - s.pos.x, z.pos.z - s.pos.z);
    if (d >= bestDist) continue;
    const dir = dirFromAngle(Math.atan2(z.pos.x - s.pos.x, z.pos.z - s.pos.z));
    if (!weapon.ignoresCover && isBlocked(s.pos, dir, d - z.radius, config)) continue;
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
    if (a.dead || isDrone(a) || a.vehicleId !== null) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      if (b.dead || isDrone(b) || b.vehicleId !== null) continue;
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
  for (const s of list) if (!s.dead && !isDrone(s) && s.vehicleId === null) resolveUnit(s, config);
}
