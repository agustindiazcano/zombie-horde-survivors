import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import type { GameState, Zombie } from './types';
import type { Vec2 } from './vec';

export function spawnZombie(state: GameState, config: GameConfig, pos: Vec2): Zombie {
  const zombie: Zombie = {
    id: state.nextZombieId++,
    pos: { ...pos },
    prev: { ...pos },
    facing: 0,
    health: config.zombie.health,
    state: 'walk',
    attackTimer: 0,
    deathTimer: 0,
  };
  state.zombies.push(zombie);
  return zombie;
}

export function damageZombie(
  state: GameState,
  config: GameConfig,
  zombie: Zombie,
  amount: number,
): void {
  if (zombie.state === 'death') return;
  zombie.health -= amount;
  if (zombie.health > 0) return;
  zombie.health = 0;
  zombie.state = 'death';
  zombie.deathTimer = config.zombie.deathDuration;
  state.kills++;
  state.events.push({ type: 'zombieKilled', id: zombie.id });
}

export function updateZombies(state: GameState, config: GameConfig, dt: number): void {
  const zc = config.zombie;
  const player = state.player;

  for (const z of state.zombies) {
    z.prev.x = z.pos.x;
    z.prev.z = z.pos.z;

    if (z.state === 'death') {
      z.deathTimer -= dt;
      continue;
    }

    const dx = player.pos.x - z.pos.x;
    const dz = player.pos.z - z.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-9) z.facing = Math.atan2(dx, dz);

    if (d > zc.attackRange) {
      z.state = 'walk';
      z.pos.x += (dx / d) * zc.speed * dt;
      z.pos.z += (dz / d) * zc.speed * dt;
      resolveStatic(z.pos, zc.radius, config.arena);
      continue;
    }

    // Entering melee range starts a full cooldown, so the first hit is not instant.
    if (z.state !== 'attack') {
      z.state = 'attack';
      z.attackTimer = zc.attackCooldown;
    }
    z.attackTimer -= dt;
    if (z.attackTimer <= 0) {
      z.attackTimer += zc.attackCooldown;
      player.health = Math.max(0, player.health - zc.damage);
      state.events.push({ type: 'playerHurt', damage: zc.damage, zombieId: z.id });
    }
  }

  // Drop zombies whose death animation has finished (in place, no allocation).
  let kept = 0;
  for (const z of state.zombies) {
    if (z.state === 'death' && z.deathTimer <= 0) continue;
    state.zombies[kept++] = z;
  }
  state.zombies.length = kept;
}
