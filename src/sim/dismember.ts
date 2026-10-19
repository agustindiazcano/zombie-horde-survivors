import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { BodyZone, GameState, Limb, Soldier, Zombie } from './types';

/** Whether an enemy's arms and legs can come off. */
export const hasLimbs = (config: GameConfig, z: Zombie): boolean =>
  config.enemies[z.type]?.limbs === true;

/**
 * Takes a limb off an enemy: an arm weakens its bite, the legs leave it crawling (slow, low).
 * Reports it so the view can show the stump and throw the limb towards `dir` (radians, 0 = +z).
 */
export function severLimb(
  state: GameState,
  config: GameConfig,
  z: Zombie,
  limb: Limb,
  dir: number,
): void {
  if (!z.parts[limb]) return;
  const d = config.dismember;
  z.parts[limb] = false;
  if (limb === 'legs') {
    z.speed *= d.crawlSpeed;
    z.y = 0;
    z.hopLeft = 0;
  } else {
    // Each arm lost cuts the bite: first to `oneArmDamage`, then down to `noArmDamage` in all.
    const both = !z.parts.armL && !z.parts.armR;
    z.damage *= both ? d.noArmDamage / d.oneArmDamage : d.oneArmDamage;
  }
  state.events.push({
    type: 'dismember',
    zombieId: z.id,
    enemy: z.type,
    part: limb,
    pos: { x: z.pos.x, z: z.pos.z },
    dir,
  });
}

/**
 * Adds a hit on an arm or a leg to what that limb has taken; it comes off at a share of the
 * enemy's health (more for a mini boss). A hit that kills can take it off whatever the total.
 */
export function woundLimb(
  state: GameState,
  config: GameConfig,
  z: Zombie,
  zone: BodyZone,
  side: 0 | 1,
  amount: number,
  killed: boolean,
  killer: Soldier | undefined,
): void {
  if ((zone !== 'arm' && zone !== 'leg') || !hasLimbs(config, z)) return;
  const d = config.dismember;
  const limb: Limb = zone === 'leg' ? 'legs' : side === 0 ? 'armL' : 'armR';
  if (!z.parts[limb]) return;
  z.wounds[limb] += amount;
  const limit =
    (limb === 'legs' ? d.legFraction : d.armFraction) * z.maxHealth * (z.boss ? d.bossResist : 1);
  if (z.wounds[limb] >= limit || (killed && nextFloat(state.rng) < d.killSeverChance)) {
    const away = killer
      ? Math.atan2(z.pos.x - killer.pos.x, z.pos.z - killer.pos.z)
      : z.facing + Math.PI;
    severLimb(state, config, z, limb, away + (nextFloat(state.rng) - 0.5) * 0.8);
  }
}

/** A blast at `at` with `radius` tears limbs off the enemy at distance `d`, more near the centre. */
export function blastLimbs(
  state: GameState,
  config: GameConfig,
  z: Zombie,
  at: { x: number; z: number },
  d: number,
  radius: number,
): void {
  if (!hasLimbs(config, z) || z.exploded) return;
  const chance =
    (config.dismember.blastSeverChance * (1 - 0.5 * Math.min(d / radius, 1))) /
    (z.boss ? config.dismember.bossResist : 1);
  const away = Math.atan2(z.pos.x - at.x, z.pos.z - at.z);
  for (const limb of ['armL', 'armR', 'legs'] as const) {
    if (z.parts[limb] && nextFloat(state.rng) < chance) {
      severLimb(state, config, z, limb, away + (nextFloat(state.rng) - 0.5) * 1.2);
    }
  }
}
