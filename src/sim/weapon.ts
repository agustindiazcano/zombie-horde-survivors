import { insideBox, rayAabb, rayCircle } from './collision';
import type { GameConfig } from './config';
import type { GameState, Soldier, Zombie } from './types';
import { dirFromAngle, type Vec2 } from './vec';
import { nextFloat } from './rng';
import { weaponOf } from './stats';
import { damageZombie } from './zombies';
import { gunState } from './ammo';
import { kickRecoil, recoilOf, spreadNow } from './accuracy';
import { rollHit } from './hits';
import { hearShot } from './wander';

/** True if an obstacle sits between `origin` and a point `distance` away along `dir`. */
export function isBlocked(origin: Vec2, dir: Vec2, distance: number, config: GameConfig): boolean {
  for (const box of config.arena.obstacles) {
    if (box.water || box.passShots || insideBox(origin, box)) continue;
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
  const weapon = weaponOf(config, soldier, state.mods, state.stance);
  if (!weapon || soldier.reload) return;
  const rounds = gunState(config, soldier);
  if (rounds) {
    if (rounds.loaded <= 0) {
      // Empty: the trigger clicks and the next pull has to wait a moment.
      soldier.fireCooldown += config.ammo.dryFireDelay;
      state.events.push({ type: 'dryFire', shooterId: soldier.id });
      return;
    }
    rounds.loaded--;
  }
  soldier.fireCooldown += 1 / (weapon.fireRate * rateScale);

  const origin = soldier.pos;
  // Inaccurate weapons scatter their shots around the facing direction; recoil drifts to one side.
  const error = spreadNow(config, soldier, weapon);
  const side = recoilOf(config, soldier)?.sideBias ?? 0;
  const drift = soldier.id % 2 === 0 ? side * soldier.recoil : -side * soldier.recoil;
  const spread = error > 0 ? (nextFloat(state.rng) * 2 - 1) * error + drift : 0;
  const cameraKick = kickRecoil(state, config, soldier);
  const dir = dirFromAngle(soldier.facing + spread);
  let nearest = weapon.range;
  let target: Zombie | null = null;

  // Obstacles block bullets: any closer obstacle clears a farther zombie target.
  for (const box of weapon.ignoresCover ? [] : config.arena.obstacles) {
    // A shooter standing on a box fires over it.
    if (box.water || box.passShots || insideBox(origin, box)) continue;
    const t = rayAabb(origin, dir, box);
    if (t !== null && t < nearest) {
      nearest = t;
      target = null;
    }
  }
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const t = rayCircle(origin, dir, z.pos, z.radius);
    if (t !== null && t < nearest) {
      nearest = t;
      target = z;
    }
  }

  const to = { x: origin.x + dir.x * nearest, z: origin.z + dir.z * nearest };
  const roll = target
    ? rollHit(state, config, soldier, weapon.id, target, Math.abs(spread), to)
    : null;
  const damage = roll ? weapon.damage * roll.multiplier : 0;
  state.events.push({
    type: 'shot',
    shooterId: soldier.id,
    facing: soldier.facing,
    weapon: weapon.id,
    height: weapon.height,
    from: { x: origin.x, z: origin.z },
    to,
    hitZombieId: target?.id ?? null,
    cameraKick,
    hit: roll ? { kind: roll.kind, damage } : null,
  });
  hearShot(state, config, origin, weapon.noise);
  if (target && roll)
    damageZombie(
      state,
      config,
      target,
      damage,
      soldier,
      roll.kind,
      weapon.damage,
      roll.zone,
      roll.side,
    );
}
