import { inShelter } from './shelter';
import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import type { GameState, Soldier, Zombie } from './types';

const isBody = (s: Soldier): boolean => s.kind === 'soldier' && (s.dead || s.downed);

/** Lets go of whatever the soldier is dragging. */
export const releaseDrag = (s: Soldier): void => {
  s.dragging = null;
  s.dragCorpse = null;
};

/** A dead enemy that is still lying there (a burst one is gone). */
export const isCorpse = (z: Zombie): boolean => z.state === 'death' && !z.exploded;

/** Seconds a dragged corpse is kept fresh so it does not fade while it moves. */
const KEEP_FRESH = 0;

/**
 * Grabs the closest downed or dead ally within reach by the shoulders, or lets go of the one being
 * dragged. A dragger is slow and can only shoot a one-handed gun (see `speedOf` and `weaponOf`).
 */
export function toggleDrag(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  /** Grab exactly this body (a click on it) instead of the closest one. */
  bodyId?: number,
): void {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.dead || me.downed || me.kind !== 'soldier' || inShelter(me)) return;
  if (me.dragging !== null || me.dragCorpse !== null) {
    releaseDrag(me);
    return;
  }
  let best: Soldier | undefined;
  let bestDist = config.drag.range;
  for (const b of state.soldiers) {
    if (b === me || !isBody(b) || b.vehicleId !== null) continue;
    if (bodyId !== undefined && b.id !== bodyId) continue;
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
 * Grabs the closest dead enemy within reach by the legs, or lets go of the one being dragged. Same
 * rope and slowness as dragging an ally.
 */
export function toggleDragCorpse(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  /** Grab exactly this corpse (a click on it) instead of the closest one. */
  corpseId?: number,
): void {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.dead || me.downed || me.kind !== 'soldier' || inShelter(me)) return;
  if (me.dragging !== null || me.dragCorpse !== null) {
    releaseDrag(me);
    return;
  }
  let best: Zombie | undefined;
  let bestDist = config.drag.range;
  for (const z of state.zombies) {
    if (!isCorpse(z) || (corpseId !== undefined && z.id !== corpseId)) continue;
    if (state.soldiers.some((s) => s.dragCorpse === z.id)) continue;
    const d = Math.hypot(z.pos.x - me.pos.x, z.pos.z - me.pos.z);
    if (d <= bestDist) {
      best = z;
      bestDist = d;
    }
  }
  if (best) {
    me.dragCorpse = best.id;
    me.dragging = null;
  }
}

/**
 * The dragged body trails behind its carrier on a short rope. The carrier lets go when it goes
 * down, dies or climbs into a vehicle, or when the body gets up (a revive).
 */
export function updateDrag(state: GameState, config: GameConfig): void {
  for (const me of state.soldiers) {
    if (me.dragCorpse !== null) {
      dragCorpse(state, config, me);
      continue;
    }
    if (me.dragging === null) continue;
    const body = state.soldiers.find((s) => s.id === me.dragging);
    if (!body || !isBody(body) || me.dead || me.downed || inShelter(me)) {
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

/** The corpse trails behind its dragger like an ally's body does. */
function dragCorpse(state: GameState, config: GameConfig, me: Soldier): void {
  const corpse = state.zombies.find((z) => z.id === me.dragCorpse);
  if (!corpse || !isCorpse(corpse) || me.dead || me.downed || inShelter(me)) {
    releaseDrag(me);
    return;
  }
  corpse.deathTimer = KEEP_FRESH;
  const dx = corpse.pos.x - me.pos.x;
  const dz = corpse.pos.z - me.pos.z;
  const d = Math.hypot(dx, dz);
  const rope = config.drag.ropeLength;
  if (d > rope) {
    corpse.pos.x = me.pos.x + (dx / d) * rope;
    corpse.pos.z = me.pos.z + (dz / d) * rope;
    resolveStatic(corpse.pos, corpse.radius, config.arena);
  }
  corpse.facing = Math.atan2(me.pos.x - corpse.pos.x, me.pos.z - corpse.pos.z);
}
