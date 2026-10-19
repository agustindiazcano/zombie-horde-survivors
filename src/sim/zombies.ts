import { resolveStatic, supportHeight } from './collision';
import { STEP_UP } from './constants';
import type { GameConfig, Loadout } from './config';
import { ageFlow, steerTarget } from './flowfield';
import { CELL, PointGrid } from './grid';
import { maybeDropCrate } from './inventory';
import { dropLoot, rewardOf } from './loot';
import { woundLimb } from './dismember';
import { firstPlayerOf } from './players';
import { nextFloat } from './rng';
import { hurtSoldier } from './soldiers';
import { wanderStep } from './wander';
import { gunOf, weaponDef } from './stats';
import type { BodyZone, GameState, HitKind, Soldier, Vehicle, Zombie } from './types';
import { hurtVehicle, isOccupied } from './vehicles';
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
  /** What the map changed about this enemy (name, health, attributes, carried items). */
  loadout?: Loadout,
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
  const health =
    config.zombie.health *
    k.healthScale *
    (1 + wc.healthScalePerWave * wavesPlayed) *
    config.level.health;
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
    speed: config.zombie.speed * k.speedScale * speedScale * config.level.speed * b.speed,
    radius: config.zombie.radius * k.radiusScale * b.size,
    damage: config.zombie.damage * k.damageScale * b.damage,
    attackRange: config.zombie.attackRange * k.radiusScale * b.size,
    state: 'walk',
    attackTimer: 0,
    stagger: 0,
    deathTimer: 0,
    loot: [],
    y: 0,
    hopLeft: 0,
    hopSide: 0,
    hopTimer: variant?.acrobat ? variant.acrobat.interval * (0.5 + nextFloat(state.rng)) : 0,
    mode: variant?.wander && !boss ? 'wander' : 'chase',
    home: { ...pos },
    roam: null,
    roamTimer: variant?.wander ? variant.wander.pauseMax * nextFloat(state.rng) : 0,
    restless: 0,
    parts: { armL: true, armR: true, legs: true },
    wounds: { armL: 0, armR: 0, legs: 0 },
  };
  if (loadout) {
    if (loadout.name) zombie.name = loadout.name;
    if (loadout.attributes) zombie.attributes = { ...loadout.attributes };
    if (loadout.maxHealth) {
      zombie.health = loadout.maxHealth;
      zombie.maxHealth = loadout.maxHealth;
    }
    // Its carried stacks and equipped items all drop where it dies.
    zombie.loot = [
      ...(loadout.backpack ?? []).flatMap((st) => Array<string>(st.count).fill(st.item)),
      ...Object.values(loadout.equipment ?? {}).flatMap((id) => (id ? [id] : [])),
    ].filter((id) => id in config.items);
  }
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
  /** What kind of hit it was, reported with the kill. */
  hit: HitKind = 'body',
  /** Base damage of the weapon that struck: a strong one bursts a head, a weak one knocks it off. */
  force = 0,
  /** Where it landed: an arm or a leg adds up towards taking that limb off. */
  zone: BodyZone = 'torso',
  side: 0 | 1 = 0,
): void {
  if (zombie.state === 'death') return;
  zombie.health -= amount;
  woundLimb(state, config, zombie, zone, side, amount, zombie.health <= 0, killer);
  if (zombie.health > 0) return;
  zombie.health = 0;
  zombie.state = 'death';
  const exploded =
    config.gore.explodeChance > 0 && nextFloat(state.rng) < config.gore.explodeChance;
  zombie.exploded = exploded;
  // A burst enemy has no death animation to wait for.
  zombie.deathTimer = exploded ? EXPLODED_LINGER : config.zombie.deathDuration;
  state.kills++;
  if (zombie.boss) state.bossKills++;
  if (killer) {
    killer.kills++;
    const xp = rewardOf(config, zombie).xp;
    killer.xp += xp;
    const gun = gunOf(config, killer);
    if (gun !== null) killer.skills[weaponDef(config, gun).class] += xp;
  }
  state.events.push({
    type: 'zombieKilled',
    id: zombie.id,
    enemy: zombie.type,
    pos: { x: zombie.pos.x, z: zombie.pos.z },
    exploded,
    head:
      hit === 'head' && !exploded
        ? force >= config.dismember.headBurstDamage
          ? 'burst'
          : 'fly'
        : null,
    killerId: killer?.id ?? null,
    hit,
  });
  dropLoot(state, config, zombie);
  if (zombie.loot.length > 0) {
    const crate = { id: state.nextCrateId++, pos: { ...zombie.pos }, items: zombie.loot };
    state.crates.push(crate);
    state.events.push({ type: 'crateDropped', crateId: crate.id, pos: { ...crate.pos } });
  }
  maybeDropCrate(state, config, zombie.pos);
}

export function updateZombies(state: GameState, config: GameConfig, dt: number): void {
  const zc = config.zombie;
  ageFlow(state, dt);
  for (const z of state.zombies) {
    z.prev.x = z.pos.x;
    z.prev.z = z.pos.z;

    if (z.state === 'death') {
      z.deathTimer -= dt;
      continue;
    }

    if (state.sandbox) continue; // the editor's preview: enemies stand still
    if (z.stagger > 0) {
      z.stagger -= dt;
      continue;
    }

    const enemy = config.enemies[z.type];
    if (z.mode === 'wander' && enemy?.wander && wanderStep(state, config, z, enemy.wander, dt)) {
      continue;
    }

    const found = nearestTarget(state, config, z.pos);
    if (!found) continue; // everyone is dead; the game is about to end
    const { target, soldier, vehicle } = found;
    // Vehicles are big: the zombie stops (and bites) at the hull, not at the middle.
    const reach = z.attackRange + (vehicle ? config.vehicles[vehicle.type]!.radius : 0);
    const dx = target.x - z.pos.x;
    const dz = target.z - z.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-9) z.facing = Math.atan2(dx, dz);

    if (d > reach) {
      z.state = 'walk';
      // Without legs it can no longer climb.
      const climb = z.parts.legs ? (enemy?.climber?.maxHeight ?? 0) : 0;
      const waypoint = steerTarget(state, config, z.pos, target, climb);
      const tx = waypoint.x - z.pos.x;
      const tz = waypoint.z - z.pos.z;
      const td = Math.hypot(tx, tz) || 1;
      z.pos.x += (tx / td) * z.speed * dt;
      z.pos.z += (tz / td) * z.speed * dt;
      const acrobat = config.enemies[z.type]?.acrobat;
      if (acrobat) hop(state, z, acrobat, dx / d, dz / d, d, reach, dt);
      const feet = climbFeet(climb);
      resolveStatic(z.pos, z.radius, config.arena, feet);
      // A climber rises onto the box under it and drops off the far side.
      if (climb > 0) {
        const top = supportHeight(config.arena, z.pos, feet);
        z.y += (top - z.y) * Math.min(1, dt * CLIMB_EASE);
      }
      continue;
    }

    if (!enemy?.climber || !z.parts.legs) z.y = 0;
    z.hopLeft = 0;
    // Entering melee range starts a full cooldown, so the first hit is not instant.
    if (z.state !== 'attack') {
      z.state = 'attack';
      z.attackTimer = zc.attackCooldown;
    }
    z.attackTimer -= dt;
    if (z.attackTimer <= 0) {
      z.attackTimer += zc.attackCooldown;
      if (soldier) hurtSoldier(state, config, soldier, z.damage, z.id);
      else if (vehicle) hurtVehicle(state, config, vehicle, z.damage);
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
 * An acrobat's hops: every so often, while it runs at its target, it jumps up and either goes
 * sideways (left or right of the line to the target) or straight up. (`ux`, `uz`) is the unit
 * direction to the target; it never starts a hop right next to the target.
 */
function hop(
  state: GameState,
  z: Zombie,
  ac: NonNullable<GameConfig['enemies'][string]['acrobat']>,
  ux: number,
  uz: number,
  distance: number,
  reach: number,
  dt: number,
): void {
  if (z.hopLeft > 0) {
    z.hopLeft = Math.max(0, z.hopLeft - dt);
    const t = 1 - z.hopLeft / ac.duration;
    z.y = ac.height * 4 * t * (1 - t);
    // Perpendicular to the way to the target: +1 is to its right.
    z.pos.x += uz * z.hopSide * ac.sideSpeed * dt;
    z.pos.z -= ux * z.hopSide * ac.sideSpeed * dt;
    return;
  }
  z.y = 0;
  z.hopTimer -= dt;
  if (z.hopTimer > 0 || distance > ac.range || distance < reach + 2) return;
  z.hopLeft = ac.duration;
  const roll = nextFloat(state.rng);
  z.hopSide = roll < 1 / 3 ? -1 : roll < 2 / 3 ? 1 : 0;
  z.hopTimer = ac.interval * (0.7 + 0.6 * nextFloat(state.rng));
}

/**
 * Pushes overlapping living zombies apart so a horde doesn't collapse into one stack.
 * Plain O(n^2) pair check: cheap enough for the intended few-hundred zombie cap.
 */
function separateZombies(state: GameState, config: GameConfig): void {
  const zombies = state.zombies;
  const arena = config.arena;
  let widest = 0;
  for (const z of zombies) if (z.state !== 'death' && z.radius > widest) widest = z.radius;
  zombiePoints.rebuild(
    arena,
    zombies.length,
    (i) => zombies[i]!.pos.x,
    (i) => zombies[i]!.pos.z,
    (i) => zombies[i]!.state === 'death',
  );
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i]!;
    if (a.state === 'death') continue;
    // Only the zombies in the nearby cells can touch this one.
    const range = Math.ceil((a.radius + widest) / CELL);
    zombiePoints.forEachAfter(arena, a.pos.x, a.pos.z, range, i, (j) => {
      const b = zombies[j]!;
      const minDist = a.radius + b.radius;
      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist) return;
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
    });
  }
  for (const z of zombies) {
    if (z.state === 'death') continue;
    const climb = z.parts.legs ? (config.enemies[z.type]?.climber?.maxHeight ?? 0) : 0;
    resolveStatic(z.pos, z.radius, config.arena, climbFeet(climb));
  }
}

/** How fast (per second) a climber's height follows the surface under it. */
const CLIMB_EASE = 10;

/** The feet height at which a climber of this reach is no longer stopped by its obstacles. */
const climbFeet = (climbHeight: number): number => (climbHeight > 0 ? climbHeight - STEP_UP : 0);

const zombiePoints = new PointGrid();
/**
 * The closest thing a zombie goes for: a soldier on foot (a downed one counts as farther away, so
 * standing soldiers come first) or a vehicle with someone in it. Soldiers inside a vehicle
 * cannot be reached, only the hull can.
 */
function nearestTarget(
  state: GameState,
  config: GameConfig,
  from: Vec2,
): { target: Vec2; soldier?: Soldier; vehicle?: Vehicle } | null {
  let best: { target: Vec2; soldier?: Soldier; vehicle?: Vehicle } | null = null;
  let bestD = Infinity;
  for (const s of state.soldiers) {
    if (s.dead || s.kind === 'drone' || s.vehicleId !== null) continue; // flying units can't be reached
    const d = Math.hypot(s.pos.x - from.x, s.pos.z - from.z);
    const felt = s.downed ? d * config.downed.targetDistanceScale : d;
    if (felt < bestD) {
      bestD = felt;
      best = { target: s.pos, soldier: s };
    }
  }
  for (const v of state.vehicles) {
    if (!isOccupied(v)) continue;
    const d = Math.hypot(v.pos.x - from.x, v.pos.z - from.z) - config.vehicles[v.type]!.radius;
    if (d < bestD) {
      bestD = d;
      best = { target: v.pos, vehicle: v };
    }
  }
  return best;
}
