import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import {
  edgeDistance,
  ejectCrew,
  fireStructure,
  getStructure,
  pickTarget,
  structureDef,
} from './structures';
import type { GameState, Input, Soldier, Structure } from './types';

/** A crew member aiming with the mouse shoots the enemy nearest the cursor within this distance. */
const AIM_ASSIST = 8;

/** A built post with a free seat. */
const isFree = (config: GameConfig, s: Structure): boolean =>
  s.built && s.crew === null && structureDef(config, s).post !== undefined;

/** The closest free post within reach of a point, or undefined. */
export function postInReach(
  state: GameState,
  config: GameConfig,
  from: { x: number; z: number },
): Structure | undefined {
  let best: Structure | undefined;
  let bestD = Infinity;
  for (const s of state.structures) {
    if (!isFree(config, s)) continue;
    const reach = structureDef(config, s).post!.enterRange;
    const d = edgeDistance(config, s, from);
    if (d <= reach && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** A soldier climbs into a post (it must be on its feet, near and the seat free). */
export function enterPost(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  structureId: number,
): boolean {
  const me = state.soldiers.find((s) => s.id === soldierId);
  const st = getStructure(state, structureId);
  if (!me || !st || me.dead || me.downed || me.kind !== 'soldier') return false;
  if (me.vehicleId !== null || me.post !== null || !isFree(config, st)) return false;
  if (edgeDistance(config, st, me.pos) > structureDef(config, st).post!.enterRange) return false;
  me.dragging = null;
  me.dragCorpse = null;
  me.post = { id: st.id, exit: { x: me.pos.x, z: me.pos.z } };
  st.crew = me.id;
  me.order = { type: 'hold' };
  me.pos.x = me.prev.x = st.x;
  me.pos.z = me.prev.z = st.z;
  me.vy = 0;
  return true;
}

export function leavePost(state: GameState, config: GameConfig, soldier: Soldier): void {
  const st = soldier.post ? getStructure(state, soldier.post.id) : undefined;
  if (st) {
    ejectCrew(state, config, st);
    return;
  }
  // The structure is gone: stand where it was.
  soldier.post = null;
  resolveStatic(soldier.pos, config.player.radius, config.arena);
}

/** Climbs into the closest free post in reach, or out of the one the soldier is in. */
export function togglePost(state: GameState, config: GameConfig, soldierId: number): boolean {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.dead) return false;
  if (me.post) {
    leavePost(state, config, me);
    return true;
  }
  const st = postInReach(state, config, me.pos);
  return st ? enterPost(state, config, soldierId, st.id) : false;
}

/**
 * A soldier at its post: it stays on the structure and fires the mounted gun. The soldier under
 * direct control aims with the mouse (the enemy nearest the cursor) and fires with the button; an
 * AI one shoots whatever it can see, and climbs out when it is given any order but to hold.
 */
export function updatePosted(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  input: Input,
  controlledId: number | null,
): void {
  const st = s.post ? getStructure(state, s.post.id) : undefined;
  const def = st ? structureDef(config, st) : undefined;
  if (!st || !def?.post || !st.built || st.crew !== s.id) {
    leavePost(state, config, s);
    return;
  }
  const post = def.post;
  s.pos.x = st.x;
  s.pos.z = st.z;
  s.y = def.height;
  s.vy = 0;
  s.aiming = false;
  s.aimLine = null;
  const controlled = s.id === controlledId;
  if (!controlled && s.order.type !== 'hold') {
    leavePost(state, config, s);
    return;
  }
  const range = post.range;
  const damage = post.damage * state.mods.damage;
  if (controlled) {
    const dx = input.aim.x - st.x;
    const dz = input.aim.z - st.z;
    if (dx * dx + dz * dz > 1e-9) s.facing = Math.atan2(dx, dz);
    st.facing = s.facing;
    if (!input.firing) return;
    // The enemy closest to where the cursor points, if one is near enough to it.
    let best: ReturnType<typeof pickTarget> = null;
    let bestD = AIM_ASSIST;
    for (const z of state.zombies) {
      if (z.state === 'death') continue;
      const d = Math.hypot(z.pos.x - input.aim.x, z.pos.z - input.aim.z);
      if (d < bestD && Math.hypot(z.pos.x - st.x, z.pos.z - st.z) <= range) {
        best = z;
        bestD = d;
      }
    }
    if (best) fireStructure(state, config, st, best, damage, post.fireRate, s);
    return;
  }
  const target = pickTarget(state, config, st, range, false, post.ignoresCover);
  if (target) {
    s.facing = Math.atan2(target.pos.x - st.x, target.pos.z - st.z);
    fireStructure(state, config, st, target, damage, post.fireRate, s);
  }
}
