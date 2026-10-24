import { inShelter } from './shelter';
import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import { canSee } from './flowfield';
import { nextFloat } from './rng';
import type { GameState, Soldier, Zombie } from './types';
import { hypot } from './vec';
import type { Vec2 } from './vec';
import { datan2, dcos, dsin } from './dmath';

type WanderRule = NonNullable<GameConfig['enemies'][string]['wander']>;

/** Seconds a roam walk may last before the wanderer picks another point (it may be stuck). */
const ROAM_MAX_SECONDS = 6;

/** Wakes `z` and, in a chain, every sleeping wanderer within the shout radius of one that woke. */
export function alertZombie(state: GameState, config: GameConfig, z: Zombie): void {
  const woken: Zombie[] = [z];
  z.mode = 'chase';
  state.events.push({ type: 'zombieAlerted', id: z.id, pos: { x: z.pos.x, z: z.pos.z } });
  while (woken.length > 0) {
    const from = woken.pop()!;
    const shout = config.enemies[from.type]?.wander?.shoutRadius ?? 0;
    if (shout <= 0) continue;
    for (const other of state.zombies) {
      if (other.mode !== 'wander' || other.state === 'death') continue;
      if (hypot(other.pos.x - from.pos.x, other.pos.z - from.pos.z) > shout) continue;
      other.mode = 'chase';
      state.events.push({
        type: 'zombieAlerted',
        id: other.id,
        pos: { x: other.pos.x, z: other.pos.z },
      });
      woken.push(other);
    }
  }
}

/** A shot makes noise: sleeping wanderers within reach of it wake up (only when the rule is on). */
export function hearShot(state: GameState, config: GameConfig, at: Vec2, noise: number): void {
  const rule = config.wander;
  if (!rule.noiseAttracts || noise <= 0) return;
  const reach = noise * rule.noiseMetres;
  for (const z of state.zombies) {
    if (z.mode !== 'wander' || z.state === 'death') continue;
    if (hypot(z.pos.x - at.x, z.pos.z - at.z) <= reach) alertZombie(state, config, z);
  }
}

export function noticed(
  state: GameState,
  config: GameConfig,
  z: Zombie,
  rule: WanderRule,
  s: Soldier,
): boolean {
  const d = hypot(s.pos.x - z.pos.x, s.pos.z - z.pos.z);
  // A crouching squad is harder to notice.
  const stealth = state.stance === 'crouch' ? config.wander.crouchStealth : 1;
  if (d <= rule.senseRadius * stealth) return true;
  if (d > rule.sightRadius * stealth) return false;
  // Inside the cone in front of it, with nothing in the way.
  const toward = datan2(s.pos.x - z.pos.x, s.pos.z - z.pos.z);
  let off = Math.abs(toward - z.facing) % (2 * Math.PI);
  if (off > Math.PI) off = 2 * Math.PI - off;
  return off <= rule.sightArc && canSee(config, z.pos, s.pos);
}

/**
 * One step of a sleeping wanderer: it notices the squad (and turns into a chaser, returning false),
 * or it roams: walks to a random point near its home, stands a while, and walks on.
 * Returns true while it is still wandering.
 */
export function wanderStep(
  state: GameState,
  config: GameConfig,
  z: Zombie,
  rule: WanderRule,
  dt: number,
): boolean {
  for (const s of state.soldiers) {
    if (s.dead || s.kind === 'drone' || inShelter(s)) continue;
    if (noticed(state, config, z, rule, s)) {
      alertZombie(state, config, z);
      return false;
    }
  }
  // A wave only ends when everything is dead, so sleepers wake once it has finished spawning.
  if (state.spawner.phase === 'clearing') {
    z.restless += dt;
    if (z.restless >= config.wander.wakeDelay) {
      alertZombie(state, config, z);
      return false;
    }
  }

  z.roamTimer -= dt;
  if (z.roam === null) {
    // Standing: the timer counts the pause down.
    z.state = 'walk';
    if (z.roamTimer > 0) return true;
    const angle = nextFloat(state.rng) * 2 * Math.PI;
    const dist = Math.sqrt(nextFloat(state.rng)) * rule.roamRadius;
    z.roam = { x: z.home.x + dsin(angle) * dist, z: z.home.z + dcos(angle) * dist };
    z.roamTimer = ROAM_MAX_SECONDS;
    return true;
  }
  const dx = z.roam.x - z.pos.x;
  const dz = z.roam.z - z.pos.z;
  const d = hypot(dx, dz);
  if (d < 0.4 || z.roamTimer <= 0) {
    z.roam = null;
    z.roamTimer = rule.pauseMin + nextFloat(state.rng) * (rule.pauseMax - rule.pauseMin);
    return true;
  }
  z.state = 'walk';
  z.facing = datan2(dx, dz);
  const step = Math.min(d, z.speed * rule.speedScale * dt);
  z.pos.x += (dx / d) * step;
  z.pos.z += (dz / d) * step;
  resolveStatic(z.pos, z.radius, config.arena);
  return true;
}

/**
 * A hunter's eyes: while it sees (or senses) a soldier it chases as usual (returns null). Out of
 * sight it returns the last place it saw the squad to walk to; after `loseTrack` seconds it gives
 * up, goes back to roaming from where it stands and returns 'lost'.
 */
export function huntTarget(
  state: GameState,
  config: GameConfig,
  z: Zombie,
  rule: WanderRule,
  dt: number,
): Vec2 | 'lost' | 'wait' | null {
  let seen: Soldier | null = null;
  let seenD = Infinity;
  for (const s of state.soldiers) {
    if (s.dead || s.kind === 'drone' || inShelter(s)) continue;
    const d = hypot(s.pos.x - z.pos.x, s.pos.z - z.pos.z);
    if (d < seenD && noticed(state, config, z, rule, s)) {
      seen = s;
      seenD = d;
    }
  }
  if (seen) {
    z.unseen = 0;
    z.lastSeen = { x: seen.pos.x, z: seen.pos.z };
    return null;
  }
  z.unseen += dt;
  const reached = z.lastSeen && hypot(z.lastSeen.x - z.pos.x, z.lastSeen.z - z.pos.z) < 1;
  if (z.unseen < (rule.loseTrack ?? 0)) {
    if (z.lastSeen && !reached) return z.lastSeen;
    // At the last place it saw them (or never saw anyone): it stands and looks around.
    z.state = 'walk';
    return 'wait';
  }
  // Gave up: roam again from here.
  z.mode = 'wander';
  z.home = { x: z.pos.x, z: z.pos.z };
  z.roam = null;
  z.roamTimer = rule.pauseMin;
  z.lastSeen = null;
  z.unseen = 0;
  return 'lost';
}
