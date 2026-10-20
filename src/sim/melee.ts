import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import { rollHit } from './hits';
import { gunOf, weaponDef } from './stats';
import { bonus } from './training';
import type { GameState, Soldier, Zombie } from './types';
import { damageZombie } from './zombies';

/** What a blow is made with: a knife in hand, else the butt of a gun, else bare fists. */
function blowOf(config: GameConfig, s: Soldier): { item: string; damage: number; range: number } {
  for (const id of [s.equipment.rightHand, s.equipment.leftHand]) {
    if (id === null) continue;
    const def = weaponDef(config, id);
    if (def.class === 'melee') return { item: id, damage: def.damage, range: def.range };
  }
  if (gunOf(config, s) !== null) {
    return { item: 'bash', damage: config.melee.bashDamage, range: config.melee.bashRange };
  }
  const fists = weaponDef(config, 'fists');
  return { item: 'fists', damage: fists.damage, range: fists.range };
}

/** The nearest living enemy whose edge is within `range` of the unit and inside the cone it faces. */
function strikeTarget(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  range: number,
): Zombie | null {
  let best: Zombie | null = null;
  let bestDist = Infinity;
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const dx = z.pos.x - s.pos.x;
    const dz = z.pos.z - s.pos.z;
    const d = Math.hypot(dx, dz) - z.radius;
    if (d > range || d >= bestDist) continue;
    // An enemy touching the unit is always in reach; otherwise it has to be inside the cone.
    const off = Math.atan2(
      Math.sin(Math.atan2(dx, dz) - s.facing),
      Math.cos(Math.atan2(dx, dz) - s.facing),
    );
    if (d > 0 && Math.abs(off) > config.melee.arc) continue;
    best = z;
    bestDist = d;
  }
  return best;
}

/** Whether an enemy stands within the reach of the unit's blow (used by the AI to decide to strike). */
export function enemyInMeleeReach(state: GameState, config: GameConfig, s: Soldier): Zombie | null {
  const reach = Math.min(config.melee.aiRange, blowOf(config, s).range);
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    if (Math.hypot(z.pos.x - s.pos.x, z.pos.z - s.pos.z) - z.radius <= reach) return z;
  }
  return null;
}

/**
 * Strikes the nearest enemy in front of the unit: damage, a shove away and a short stagger. It
 * shares the cooldown with shooting and interrupts a reload. Returns false if the unit cannot.
 */
export function meleeStrike(state: GameState, config: GameConfig, s: Soldier): boolean {
  if (s.dead || s.downed || s.vehicleId !== null || s.kind === 'drone' || s.fireCooldown > 0) {
    return false;
  }
  const blow = blowOf(config, s);
  const target = strikeTarget(state, config, s, blow.range);
  const m = config.melee;
  s.fireCooldown += m.cooldown;
  s.reload = null;
  // A blow lands on the body (no head hit); only a critical hit can add to it.
  const roll = target ? rollHit(state, config, s, null, target, 0, target.pos, false) : null;
  const damage = roll
    ? blow.damage * state.mods.damage * (1 + bonus(config, s, 'melee')) * roll.multiplier
    : 0;
  state.events.push({
    type: 'melee',
    attackerId: s.id,
    weapon: blow.item,
    hitZombieId: target?.id ?? null,
    hit: roll ? { kind: roll.kind, damage } : null,
  });
  if (!target || !roll) return true;

  // Heavier enemies (bigger, and bosses most of all) move less.
  const weight = (target.radius / config.zombie.radius) * (target.boss ? 1 / m.bossPushScale : 1);
  const dx = target.pos.x - s.pos.x;
  const dz = target.pos.z - s.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const shove = m.push / Math.max(weight, 1);
  target.pos.x += (dx / len) * shove;
  target.pos.z += (dz / len) * shove;
  resolveStatic(target.pos, target.radius, config.arena);
  target.stagger = target.boss ? m.stagger * 0.5 : m.stagger;
  target.state = 'walk';
  damageZombie(state, config, target, damage, s, roll.kind, 0, roll.zone, roll.side);
  return true;
}
