import { rayAabb, resolveStatic } from './collision';
import type { GameConfig } from './config';
import type { GameState, Zombie } from './types';
import type { Vec2 } from './vec';

export function spawnZombie(state: GameState, config: GameConfig, pos: Vec2): Zombie {
  const wavesPlayed = Math.max(0, state.wave - 1);
  const wc = config.waves;
  const speedScale = Math.min(1 + wc.speedScalePerWave * wavesPlayed, wc.maxSpeedScale);
  const zombie: Zombie = {
    id: state.nextZombieId++,
    pos: { ...pos },
    prev: { ...pos },
    facing: 0,
    health: config.zombie.health * (1 + wc.healthScalePerWave * wavesPlayed),
    speed: config.zombie.speed * speedScale,
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
      const target = steerTarget(z.pos, player.pos, d, config);
      const tx = target.x - z.pos.x;
      const tz = target.z - z.pos.z;
      const td = Math.hypot(tx, tz) || 1;
      z.pos.x += (tx / td) * z.speed * dt;
      z.pos.z += (tz / td) * z.speed * dt;
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

  separateZombies(state, config);

  // Drop zombies whose death animation has finished (in place, no allocation).
  let kept = 0;
  for (const z of state.zombies) {
    if (z.state === 'death' && z.deathTimer <= 0) continue;
    state.zombies[kept++] = z;
  }
  state.zombies.length = kept;
}

/**
 * Pushes overlapping living zombies apart so a horde doesn't collapse into one stack.
 * Plain O(n^2) pair check: cheap enough for the intended few-hundred zombie cap.
 */
function separateZombies(state: GameState, config: GameConfig): void {
  const zombies = state.zombies;
  const minDist = config.zombie.radius * 2;
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i]!;
    if (a.state === 'death') continue;
    for (let j = i + 1; j < zombies.length; j++) {
      const b = zombies[j]!;
      if (b.state === 'death') continue;
      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        // Exactly stacked: separate along +x so the result stays deterministic.
        dx = 1;
        dz = 0;
        d = 1;
      }
      const push = (minDist - Math.sqrt(d2)) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
    }
  }
  for (const z of zombies) {
    if (z.state !== 'death') resolveStatic(z.pos, config.zombie.radius, config.arena);
  }
}

const LOOKAHEAD = 3;
const CORNER_MARGIN = 0.35;
const scratch: Vec2 = { x: 0, z: 0 };

/**
 * Where a chasing zombie should head. Normally the player; if an obstacle blocks the
 * straight path within LOOKAHEAD, the corner of that obstacle giving the shortest detour.
 */
function steerTarget(from: Vec2, to: Vec2, distance: number, config: GameConfig): Vec2 {
  const r = config.zombie.radius;
  const dir = { x: (to.x - from.x) / distance, z: (to.z - from.z) / distance };
  let blocker: (typeof config.arena.obstacles)[number] | null = null;
  let nearest = Math.min(distance, LOOKAHEAD);
  for (const box of config.arena.obstacles) {
    const t = rayAabb(from, dir, { ...box, halfW: box.halfW + r, halfD: box.halfD + r });
    if (t !== null && t < nearest) {
      nearest = t;
      blocker = box;
    }
  }
  if (!blocker) return to;

  const hw = blocker.halfW + r + CORNER_MARGIN;
  const hd = blocker.halfD + r + CORNER_MARGIN;
  let best = Infinity;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = blocker.x + sx * hw;
      const cz = blocker.z + sz * hd;
      const cost = Math.hypot(cx - from.x, cz - from.z) + Math.hypot(to.x - cx, to.z - cz);
      if (cost < best) {
        best = cost;
        scratch.x = cx;
        scratch.z = cz;
      }
    }
  }
  return scratch;
}
