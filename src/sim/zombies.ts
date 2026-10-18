import { rayAabb, resolveStatic } from './collision';
import type { GameConfig } from './config';
import { maybeDropCrate } from './inventory';
import { dropLoot, rewardOf } from './loot';
import { firstPlayerOf } from './players';
import { nextFloat } from './rng';
import { hurtSoldier } from './soldiers';
import { weaponDef } from './stats';
import type { GameState, Soldier, Zombie } from './types';
import type { Vec2 } from './vec';

/** A boss's multipliers: the nth boss (1-based) reads the nth list entry, then keeps growing. */
export function bossStats(config: GameConfig, nth: number) {
  const b = config.boss;
  const pick = (list: number[]) =>
    list[nth - 1] ?? list[list.length - 1]! * b.growth ** (nth - list.length);
  const health = pick(b.health);
  const size = Math.min(b.sizeBase * (health / b.health[0]!) ** b.sizeExponent, b.maxSize);
  return { health, damage: pick(b.damage), size, reward: b.rewardScale * nth };
}

export function spawnZombie(
  state: GameState,
  config: GameConfig,
  pos: Vec2,
  type = 'zombie',
  /** 0 for a normal enemy; otherwise which boss this is (1st, 2nd, ...). */
  bossNumber = 0,
): Zombie {
  const variant = config.enemies[type];
  const k = variant ?? {
    speedScale: 1,
    healthScale: 1,
    damageScale: 1,
    radiusScale: 1,
  };
  const wavesPlayed = Math.max(0, state.wave - 1);
  const wc = config.waves;
  const speedScale = Math.min(1 + wc.speedScalePerWave * wavesPlayed, wc.maxSpeedScale);
  const health = config.zombie.health * k.healthScale * (1 + wc.healthScalePerWave * wavesPlayed);
  const boss = bossNumber > 0;
  const b = boss
    ? { ...bossStats(config, bossNumber), speed: config.boss.speedScale }
    : { health: 1, damage: 1, size: 1, speed: 1, reward: 1 };
  const zombie: Zombie = {
    id: state.nextZombieId++,
    owner: firstPlayerOf(state.players, 'ai'),
    pos: { ...pos },
    prev: { ...pos },
    facing: 0,
    type: variant ? type : 'zombie',
    boss,
    size: b.size,
    reward: b.reward,
    health: health * b.health,
    maxHealth: health * b.health,
    exploded: false,
    speed: config.zombie.speed * k.speedScale * speedScale * b.speed,
    radius: config.zombie.radius * k.radiusScale * b.size,
    damage: config.zombie.damage * k.damageScale * b.damage,
    attackRange: config.zombie.attackRange * k.radiusScale * b.size,
    state: 'walk',
    attackTimer: 0,
    deathTimer: 0,
  };
  state.zombies.push(zombie);
  return zombie;
}

/** Seconds an exploded enemy stays in the list (long enough for one rendered frame). */
const EXPLODED_LINGER = 0.05;

export function damageZombie(
  state: GameState,
  config: GameConfig,
  zombie: Zombie,
  amount: number,
  /** The soldier that fired the shot; it gets the kill and the experience. */
  killer?: Soldier,
): void {
  if (zombie.state === 'death') return;
  zombie.health -= amount;
  if (zombie.health > 0) return;
  zombie.health = 0;
  zombie.state = 'death';
  const exploded =
    config.gore.explodeChance > 0 && nextFloat(state.rng) < config.gore.explodeChance;
  zombie.exploded = exploded;
  // A burst enemy has no death animation to wait for.
  zombie.deathTimer = exploded ? EXPLODED_LINGER : config.zombie.deathDuration;
  state.kills++;
  if (killer) {
    killer.kills++;
    const xp = rewardOf(config, zombie).xp;
    killer.xp += xp;
    if (killer.weapon !== null) killer.skills[weaponDef(config, killer.weapon).class] += xp;
  }
  state.events.push({
    type: 'zombieKilled',
    id: zombie.id,
    enemy: zombie.type,
    pos: { x: zombie.pos.x, z: zombie.pos.z },
    exploded,
    killerId: killer?.id ?? null,
  });
  dropLoot(state, config, zombie);
  maybeDropCrate(state, config, zombie.pos);
}

export function updateZombies(state: GameState, config: GameConfig, dt: number): void {
  const zc = config.zombie;
  for (const z of state.zombies) {
    z.prev.x = z.pos.x;
    z.prev.z = z.pos.z;

    if (z.state === 'death') {
      z.deathTimer -= dt;
      continue;
    }

    const target = nearestSoldier(state, z.pos);
    if (!target) continue; // everyone is dead; the game is about to end
    const dx = target.pos.x - z.pos.x;
    const dz = target.pos.z - z.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-9) z.facing = Math.atan2(dx, dz);

    if (d > z.attackRange) {
      z.state = 'walk';
      const waypoint = steerTarget(z.pos, target.pos, d, z.radius, config);
      const tx = waypoint.x - z.pos.x;
      const tz = waypoint.z - z.pos.z;
      const td = Math.hypot(tx, tz) || 1;
      z.pos.x += (tx / td) * z.speed * dt;
      z.pos.z += (tz / td) * z.speed * dt;
      resolveStatic(z.pos, z.radius, config.arena);
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
      hurtSoldier(state, target, z.damage, z.id);
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
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i]!;
    if (a.state === 'death') continue;
    for (let j = i + 1; j < zombies.length; j++) {
      const b = zombies[j]!;
      if (b.state === 'death') continue;
      const minDist = a.radius + b.radius;
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
    if (z.state !== 'death') resolveStatic(z.pos, z.radius, config.arena);
  }
}

const LOOKAHEAD = 3;
const CORNER_MARGIN = 0.35;
/** A zombie this close to a detour corner counts as having reached it. */
const CORNER_REACHED = 0.8;
const scratch: Vec2 = { x: 0, z: 0 };

/**
 * Where a chasing zombie should head. Normally the player; if an obstacle blocks the
 * straight path within LOOKAHEAD, the corner of that obstacle giving the shortest detour.
 */
function steerTarget(from: Vec2, to: Vec2, distance: number, r: number, config: GameConfig): Vec2 {
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
      // Already standing on this corner: aim for the next one along the wall instead of
      // picking the same corner again and never getting past it.
      if (Math.hypot(cx - from.x, cz - from.z) < CORNER_REACHED) continue;
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

function nearestSoldier(state: GameState, from: Vec2): Soldier | null {
  let best: Soldier | null = null;
  let bestD2 = Infinity;
  for (const s of state.soldiers) {
    if (s.dead || s.kind === 'drone') continue; // flying units can't be reached
    const d2 = (s.pos.x - from.x) ** 2 + (s.pos.z - from.z) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = s;
    }
  }
  return best;
}
