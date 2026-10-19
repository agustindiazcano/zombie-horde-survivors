import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import type { GameState, Soldier } from './types';

const isBody = (s: Soldier): boolean => s.kind === 'soldier' && (s.dead || s.downed);

/** Lets go of whatever the soldier is dragging. */
export const releaseDrag = (s: Soldier): void => {
  s.dragging = null;
};

/**
 * Grabs the closest downed or dead ally within reach by the shoulders, or lets go of the one being
 * dragged. A dragger is slow and can only shoot a one-handed gun (see `speedOf` and `weaponOf`).
 */
export function toggleDrag(state: GameState, config: GameConfig, soldierId: number): void {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.dead || me.downed || me.kind !== 'soldier' || me.vehicleId !== null) return;
  if (me.dragging !== null) {
    releaseDrag(me);
    return;
  }
  let best: Soldier | undefined;
  let bestDist = config.drag.range;
  for (const b of state.soldiers) {
    if (b === me || !isBody(b) || b.vehicleId !== null) continue;
    if (state.soldiers.some((s) => s.dragging === b.id)) continue;
    const d = Math.hypot(b.pos.x - me.pos.x, b.pos.z - me.pos.z);
    if (d <= bestDist) {
      best = b;
      bestDist = d;
    }
  }
  if (best) me.dragging = best.id;
}

/**
 * The dragged body trails behind its carrier on a short rope. The carrier lets go when it goes
 * down, dies or climbs into a vehicle, or when the body gets up (a revive).
 */
export function updateDrag(state: GameState, config: GameConfig): void {
  for (const me of state.soldiers) {
    if (me.dragging === null) continue;
    const body = state.soldiers.find((s) => s.id === me.dragging);
    if (!body || !isBody(body) || me.dead || me.downed || me.vehicleId !== null) {
      releaseDrag(me);
      continue;
    }
    const dx = body.pos.x - me.pos.x;
    const dz = body.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    const rope = config.drag.ropeLength;
    if (d > rope) {
      body.pos.x = me.pos.x + (dx / d) * rope;
      body.pos.z = me.pos.z + (dz / d) * rope;
      resolveStatic(body.pos, config.player.radius, config.arena);
    }
    body.facing = Math.atan2(me.pos.x - body.pos.x, me.pos.z - body.pos.z);
  }
}
