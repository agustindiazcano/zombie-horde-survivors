import { rayAabb, rayCircle } from './collision';
import type { GameConfig } from './config';
import type { GameState, Soldier, Zombie } from './types';
import { dirFromAngle, type Vec2 } from './vec';
import { damageZombie } from './zombies';

/** True if an obstacle sits between `origin` and a point `distance` away along `dir`. */
export function isBlocked(origin: Vec2, dir: Vec2, distance: number, config: GameConfig): boolean {
  for (const box of config.arena.obstacles) {
    const t = rayAabb(origin, dir, box);
    if (t !== null && t < distance) return true;
  }
  return false;
}

/**
 * Fires one hitscan bullet from `soldier` along its facing and starts its cooldown.
 * `rateScale` slows the fire rate (used for AI soldiers).
 */
export function fireWeapon(
  state: GameState,
  config: GameConfig,
  soldier: Soldier,
  rateScale = 1,
): void {
  soldier.fireCooldown = 1 / (config.weapon.fireRate * rateScale);

  const origin = soldier.pos;
  const dir = dirFromAngle(soldier.facing);
  let nearest = config.weapon.range;
  let target: Zombie | null = null;

  // Obstacles block bullets: any closer obstacle clears a farther zombie target.
  for (const box of config.arena.obstacles) {
    const t = rayAabb(origin, dir, box);
    if (t !== null && t < nearest) {
      nearest = t;
      target = null;
    }
  }
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const t = rayCircle(origin, dir, z.pos, config.zombie.radius);
    if (t !== null && t < nearest) {
      nearest = t;
      target = z;
    }
  }

  state.events.push({
    type: 'shot',
    shooterId: soldier.id,
    facing: soldier.facing,
    from: { x: origin.x, z: origin.z },
    to: { x: origin.x + dir.x * nearest, z: origin.z + dir.z * nearest },
    hitZombieId: target?.id ?? null,
  });
  if (target) damageZombie(state, config, target, config.weapon.damage);
}
