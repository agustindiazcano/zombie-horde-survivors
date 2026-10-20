import type { GameConfig, Obstacle } from './config';
import { isBlocked } from './weapon';
import type { GameState, Soldier, Structure } from './types';
import { localPlayer } from './players';
import { bonus, squadBonus } from './training';
import { damageZombie } from './zombies';
import type { Vec2 } from './vec';

/** Floor under the footprint test: boxes that only touch are not overlapping. */
const EPSILON = 0.001;
/** A door can be toggled by a soldier this close (metres, to the footprint). */
export const DOOR_REACH = 2.5;
/** Builders keep shooting if an enemy is this close (metres). */
const FIGHT_RANGE = 10;

type StructureDef = GameConfig['structures']['types'][string];

export const structureDef = (config: GameConfig, s: Structure): StructureDef =>
  config.structures.types[s.type]!;

/** Half sides of the footprint after the quarter turns. */
export function footprint(
  config: GameConfig,
  type: string,
  turns: number,
): { halfW: number; halfD: number } {
  const def = config.structures.types[type]!;
  return turns % 2 === 0
    ? { halfW: def.halfW, halfD: def.halfD }
    : { halfW: def.halfD, halfD: def.halfW };
}

/** Multipliers of a structure's level (level 1 is plain). */
export function levelScale(def: StructureDef, level: number) {
  const row = level > 1 ? def.levels[level - 2] : undefined;
  return {
    health: row?.healthScale ?? 1,
    damage: row?.damageScale ?? 1,
    range: row?.rangeScale ?? 1,
  };
}

export const getStructure = (state: GameState, id: number): Structure | undefined =>
  state.structures.find((s) => s.id === id);

/** Distance (metres) from a point to the footprint of a structure; 0 inside it. */
export function edgeDistance(config: GameConfig, s: Structure, p: Vec2): number {
  const { halfW, halfD } = footprint(config, s.type, s.turns);
  const dx = Math.max(Math.abs(p.x - s.x) - halfW, 0);
  const dz = Math.max(Math.abs(p.z - s.z) - halfD, 0);
  return Math.hypot(dx, dz);
}

/**
 * Rebuilds the arena's obstacle list: the map's own boxes plus every finished structure that
 * blocks (an open door does not). A new array each time, so the grid and flow-field caches that
 * are keyed by the array rebuild themselves.
 */
export function syncStructures(state: GameState, config: GameConfig): void {
  const arena = config.arena;
  arena.base ??= arena.obstacles;
  const boxes: Obstacle[] = [];
  for (const s of state.structures) {
    if (!s.built || s.open) continue;
    const def = structureDef(config, s);
    const { halfW, halfD } = footprint(config, s.type, s.turns);
    boxes.push({
      x: s.x,
      z: s.z,
      halfW,
      halfD,
      height: def.height,
      passShots: def.passShots,
      structure: { id: s.id, breakCost: def.breakCost * config.structures.pathCostScale },
    });
  }
  arena.obstacles = [...arena.base, ...boxes];
}

function makeStructure(
  state: GameState,
  config: GameConfig,
  type: string,
  x: number,
  z: number,
  turns: number,
  level: number,
  built: boolean,
): Structure {
  const def = config.structures.types[type]!;
  const maxHealth = def.health * levelScale(def, level).health;
  const s: Structure = {
    id: state.nextStructureId++,
    type,
    x,
    z,
    turns,
    level,
    health: built ? maxHealth : 0,
    maxHealth,
    built,
    progress: 0,
    open: false,
    cooldown: 0,
    facing: 0,
  };
  state.structures.push(s);
  return s;
}

/** Start of a run: forget the last run's structures and raise the ones the map starts with. */
export function resetStructures(state: GameState, config: GameConfig): void {
  const arena = config.arena;
  if (arena.base) arena.obstacles = arena.base;
  for (const p of config.startStructures) {
    if (!(p.type in config.structures.types)) continue;
    const level = Math.min(p.level, config.structures.types[p.type]!.levels.length + 1);
    makeStructure(state, config, p.type, p.x, p.z, p.turns, level, true);
  }
  if (state.structures.length > 0) syncStructures(state, config);
}

/** Why a structure cannot be placed there, or null when it can. */
export function placementError(
  state: GameState,
  config: GameConfig,
  type: string,
  x: number,
  z: number,
  turns: number,
): string | null {
  const def = config.structures.types[type];
  if (!def) return 'Unknown structure';
  if (!config.build) return 'Building is off on this map';
  if (state.gold < def.cost) return 'Not enough gold';
  const { halfW, halfD } = footprint(config, type, turns);
  const lim = config.arena.halfSize - 0.5;
  if (Math.abs(x) + halfW > lim || Math.abs(z) + halfD > lim) return 'Outside the map';
  const overlaps = (b: { x: number; z: number; halfW: number; halfD: number }) =>
    Math.abs(x - b.x) < halfW + b.halfW - EPSILON && Math.abs(z - b.z) < halfD + b.halfD - EPSILON;
  for (const o of config.arena.base ?? config.arena.obstacles) {
    if (overlaps(o)) return o.water ? 'Water or a cliff' : 'Something is in the way';
  }
  for (const s of state.structures) {
    if (overlaps({ x: s.x, z: s.z, ...footprint(config, s.type, s.turns) })) {
      return 'Another structure is there';
    }
  }
  const clear = config.structures.clearRadius;
  const near = (p: Vec2) =>
    Math.abs(p.x - x) < halfW + clear - EPSILON && Math.abs(p.z - z) < halfD + clear - EPSILON;
  for (const s of state.soldiers) {
    if (!s.dead && s.kind !== 'drone' && s.vehicleId === null && near(s.pos)) {
      return 'A soldier is standing there';
    }
  }
  for (const zb of state.zombies)
    if (zb.state !== 'death' && near(zb.pos)) return 'An enemy is there';
  return null;
}

/** Puts a blueprint down and spends its gold. Returns it, or null when `placementError` says no. */
export function placeStructure(
  state: GameState,
  config: GameConfig,
  type: string,
  x: number,
  z: number,
  turns: number,
): Structure | null {
  if (placementError(state, config, type, x, z, turns) !== null) return null;
  state.gold -= config.structures.types[type]!.cost;
  return makeStructure(state, config, type, x, z, turns, 1, false);
}

/** Removes a structure: a blueprint gives back part of the gold, a finished one nothing. */
export function removeStructure(state: GameState, config: GameConfig, id: number): void {
  const i = state.structures.findIndex((s) => s.id === id);
  if (i < 0) return;
  const s = state.structures[i]!;
  if (!s.built) state.gold += Math.floor(structureDef(config, s).cost * config.structures.refund);
  state.structures.splice(i, 1);
  syncStructures(state, config);
  releaseBuilders(state, id);
}

function releaseBuilders(state: GameState, id: number): void {
  for (const w of state.soldiers) {
    if (w.order.type === 'build' && w.order.structureId === id) w.order = { type: 'follow' };
  }
}

/** Gold needed to raise the structure one level, or null at the top level or while unfinished. */
export function upgradeCost(config: GameConfig, s: Structure): number | null {
  if (!s.built) return null;
  const row = structureDef(config, s).levels[s.level - 1];
  return row ? row.cost : null;
}

/** Raises the level (health, and a turret's damage and range) and pays for it. */
export function upgradeStructure(state: GameState, config: GameConfig, id: number): boolean {
  const s = getStructure(state, id);
  const cost = s ? upgradeCost(config, s) : null;
  if (!s || cost === null || state.gold < cost) return false;
  state.gold -= cost;
  const def = structureDef(config, s);
  const gained = levelScale(def, s.level + 1).health * def.health - s.maxHealth;
  s.level++;
  s.maxHealth += gained;
  s.health += gained;
  return true;
}

/** Gold to mend a damaged structure fully, or null when it needs none. */
export function repairCost(state: GameState, config: GameConfig, s: Structure): number | null {
  if (!s.built || s.health >= s.maxHealth) return null;
  const missing = 1 - s.health / s.maxHealth;
  const cheaper = 1 - Math.min(0.9, squadBonus(state, config, 'repair'));
  return Math.ceil(structureDef(config, s).cost * config.structures.repairCost * missing * cheaper);
}

export function repairStructure(state: GameState, config: GameConfig, id: number): boolean {
  const s = getStructure(state, id);
  const cost = s ? repairCost(state, config, s) : null;
  if (!s || cost === null || state.gold < cost) return false;
  state.gold -= cost;
  s.health = s.maxHealth;
  return true;
}

/** Opens or closes a door. */
export function toggleDoor(state: GameState, config: GameConfig, id: number): boolean {
  const s = getStructure(state, id);
  if (!s || !s.built || !structureDef(config, s).door) return false;
  s.open = !s.open;
  syncStructures(state, config);
  return true;
}

/** The closest door within reach of a point, open or closed. */
export function doorInReach(
  state: GameState,
  config: GameConfig,
  from: Vec2,
  reach = DOOR_REACH,
): Structure | undefined {
  let best: Structure | undefined;
  let bestD = reach;
  for (const s of state.structures) {
    if (!s.built || !structureDef(config, s).door) continue;
    const d = edgeDistance(config, s, from);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Damage from an enemy (or a blast). A structure at zero health falls and stops blocking. */
export function hurtStructure(
  state: GameState,
  config: GameConfig,
  s: Structure,
  amount: number,
): void {
  if (!s.built) return;
  s.health -= amount;
  if (s.health > 0) return;
  state.structures = state.structures.filter((o) => o !== s);
  state.events.push({ type: 'structureDestroyed', structureId: s.id, pos: { x: s.x, z: s.z } });
  syncStructures(state, config);
  releaseBuilders(state, s.id);
}

/** Sends soldiers to work on a blueprint. */
export function orderBuild(state: GameState, ids: number[], structureId: number): void {
  for (const s of state.soldiers) {
    if (s.dead || s.kind !== 'soldier' || !ids.includes(s.id)) continue;
    s.order = { type: 'build', structureId };
  }
}

/** True while a soldier is at the blueprint it was sent to (it works instead of shooting). */
export function isWorking(state: GameState, config: GameConfig, s: Soldier): boolean {
  if (s.order.type !== 'build') return false;
  const st = getStructure(state, s.order.structureId);
  return !!st && !st.built && edgeDistance(config, st, s.pos) <= config.structures.workRange;
}

/** A soldier that can lend a hand: on its feet, not driving, not a drone. */
const canWork = (s: Soldier): boolean =>
  !s.dead && !s.downed && s.kind === 'soldier' && s.vehicleId === null;

/** The enemy closest to a point, or Infinity when there is none. */
export function nearestEnemyDistance(state: GameState, from: Vec2): number {
  let best = Infinity;
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    best = Math.min(best, Math.hypot(z.pos.x - from.x, z.pos.z - from.z));
  }
  return best;
}

/** True if the soldier should keep shooting rather than build: an enemy is close. */
export const mustFight = (state: GameState, s: Soldier): boolean =>
  nearestEnemyDistance(state, s.pos) < FIGHT_RANGE;

function buildWork(state: GameState, config: GameConfig, dt: number): void {
  const sc = config.structures;
  const controlled = localPlayer(state).controlledId;
  for (const st of state.structures) {
    if (st.built) continue;
    let work = 0;
    for (const w of state.soldiers) {
      if (!canWork(w) || edgeDistance(config, st, w.pos) > sc.workRange) continue;
      const ordered = w.order.type === 'build' && w.order.structureId === st.id;
      // The player builds what they stand next to; idle allies nearby lend a hand.
      const helping = w.id === controlled || (w.order.type === 'follow' && !mustFight(state, w));
      // Intelligence and an engineer's builder perk make a worker count for more than one.
      if ((ordered && !mustFight(state, w)) || helping)
        work += 1 + Math.max(0, bonus(config, w, 'build'));
    }
    if (work === 0) continue;
    st.progress += Math.min(work, sc.maxBuilders * 2) * dt;
    const def = structureDef(config, st);
    if (st.progress < def.buildWork) continue;
    st.built = true;
    st.health = st.maxHealth;
    state.events.push({ type: 'structureBuilt', structureId: st.id });
    syncStructures(state, config);
    releaseBuilders(state, st.id);
  }
}

function fireTurrets(state: GameState, config: GameConfig, dt: number): void {
  for (const st of state.structures) {
    const def = structureDef(config, st);
    if (!st.built || !def.turret) continue;
    st.cooldown = Math.max(0, st.cooldown - dt);
    const scale = levelScale(def, st.level);
    const range = def.turret.range * scale.range;
    let best: { id: number; d: number; boss: boolean } | null = null;
    for (const z of state.zombies) {
      if (z.state === 'death') continue;
      const d = Math.hypot(z.pos.x - st.x, z.pos.z - st.z);
      if (d > range) continue;
      const boss = def.turret.bossFirst && z.boss;
      if (best && (best.boss && !boss ? true : boss === best.boss && d >= best.d)) continue;
      const dir = { x: (z.pos.x - st.x) / (d || 1), z: (z.pos.z - st.z) / (d || 1) };
      if (isBlocked({ x: st.x, z: st.z }, dir, d - z.radius, config)) continue;
      best = { id: z.id, d, boss };
    }
    const target = best ? state.zombies.find((z) => z.id === best!.id) : undefined;
    if (!target) continue;
    st.facing = Math.atan2(target.pos.x - st.x, target.pos.z - st.z);
    if (st.cooldown > 0) continue;
    st.cooldown += 1 / def.turret.fireRate;
    const damage = def.turret.damage * scale.damage;
    state.events.push({
      type: 'structureShot',
      structureId: st.id,
      from: { x: st.x, z: st.z },
      to: { x: target.pos.x, z: target.pos.z },
      hitZombieId: target.id,
    });
    damageZombie(state, config, target, damage, undefined, 'body', damage);
  }
}

/** One step of build mode: blueprints get worked on, turrets shoot. */
export function updateStructures(state: GameState, config: GameConfig, dt: number): void {
  if (state.structures.length === 0) return;
  buildWork(state, config, dt);
  fireTurrets(state, config, dt);
}

/** The structure whose footprint the enemy is pressing against on its way to `towards`, if any. */
export function blockingStructure(
  state: GameState,
  config: GameConfig,
  from: Vec2,
  radius: number,
  reach: number,
  towards: Vec2,
): Structure | undefined {
  let best: Structure | undefined;
  let bestD = Infinity;
  const dx = towards.x - from.x;
  const dz = towards.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  for (const s of state.structures) {
    if (!s.built || s.open) continue;
    const d = edgeDistance(config, s, from) - radius;
    if (d > reach || d >= bestD) continue;
    // Only if the way on leads into it: the waypoint lies on the structure's side of the zombie.
    const fp = footprint(config, s.type, s.turns);
    const cx = Math.min(Math.max(from.x, s.x - fp.halfW), s.x + fp.halfW);
    const cz = Math.min(Math.max(from.z, s.z - fp.halfD), s.z + fp.halfD);
    const ex = cx - from.x;
    const ez = cz - from.z;
    const el = Math.hypot(ex, ez);
    if (el > 1e-6 && (ex * dx + ez * dz) / (el * len) < 0.2) continue;
    best = s;
    bestD = d;
  }
  return best;
}
