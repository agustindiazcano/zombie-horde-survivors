import { rayAabb, rayCircle } from './collision';
import type { GameConfig } from './config';
import type { GameState, Input, Zombie } from './types';
import { dirFromAngle } from './vec';
import { damageZombie } from './zombies';

/** Fires one hitscan bullet if the trigger is held and the weapon is ready. */
export function tryFire(state: GameState, config: GameConfig, input: Input): void {
  const player = state.player;
  if (!input.firing || player.fireCooldown > 0) return;
  player.fireCooldown = 1 / config.weapon.fireRate;

  const origin = player.pos;
  const dir = dirFromAngle(player.facing);
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
    from: { x: origin.x, z: origin.z },
    to: { x: origin.x + dir.x * nearest, z: origin.z + dir.z * nearest },
    hitZombieId: target?.id ?? null,
  });
  if (target) damageZombie(state, config, target, config.weapon.damage);
}
