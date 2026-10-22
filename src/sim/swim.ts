import type { GameConfig } from './config';
import { heightAt } from './terrain';
import type { GameState, Soldier } from './types';
import { hurtSoldier } from './soldiers';
import { isDrone } from './stats';

/** How deep the water is at a point (m); 0 on dry land and on maps without the `swim` rule. */
export function waterDepthAt(config: GameConfig, x: number, z: number): number {
  const { heights, water } = config.arena.terrain;
  if (!config.swim || water === null) return 0;
  return Math.max(0, water - heightAt(heights, config.arena.halfSize, x, z));
}

/** Is the unit in water too deep to wade (it swims instead of walking)? */
export function isSwimming(config: GameConfig, s: Soldier): boolean {
  return (
    config.swim &&
    !isDrone(s) &&
    s.vehicleId === null &&
    waterDepthAt(config, s.pos.x, s.pos.z) > config.swimming.swimDepth
  );
}

/** The head is under water: no shooting, and the breath runs down. */
export const isSubmerged = (config: GameConfig, s: Soldier): boolean =>
  s.swimming && s.depth > config.swimming.headDepth;

/**
 * Per step: a swimmer's depth is kept above the sea floor, and the breath runs down while the
 * head is under water and comes back at the surface. With no breath left the unit takes
 * `drownDamage` once a second.
 */
export function updateBreath(state: GameState, config: GameConfig, s: Soldier, dt: number): void {
  const w = config.swimming;
  if (!s.swimming) {
    s.depth = 0;
    s.oxygen = Math.min(w.breath, s.oxygen + w.breathRegen * 4 * dt);
    return;
  }
  const floor = waterDepthAt(config, s.pos.x, s.pos.z) - 0.4;
  s.depth = Math.min(Math.max(s.depth, 0), Math.min(w.maxDepth, floor));
  if (s.downed) s.depth = 0;
  if (s.depth <= w.headDepth) {
    s.oxygen = Math.min(w.breath, s.oxygen + w.breathRegen * dt);
    return;
  }
  if (s.oxygen > 0) {
    s.oxygen = Math.max(0, s.oxygen - dt);
    if (s.oxygen > 0) return;
  }
  // Breath gone: `oxygen` counts down from 0 to -1 between two bouts of damage.
  s.oxygen -= dt;
  if (s.oxygen <= -1) {
    s.oxygen = 0;
    hurtSoldier(state, config, s, w.drownDamage, -1);
  }
}
