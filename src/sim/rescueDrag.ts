import type { GameConfig } from './config';
import { releaseDrag, toggleDrag } from './drag';
import { itemDef } from './inventory';
import type { GameState, Soldier } from './types';
import type { Vec2 } from './vec';

const standing = (s: Soldier): boolean => !s.dead && !s.downed && s.kind === 'soldier';
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Can this soldier revive someone? It carries a medkit, so it will walk over and do that instead. */
const hasMedkit = (config: GameConfig, s: Soldier): boolean =>
  s.backpack.some((st) => itemDef(config, st.item).type === 'medical');

/** The nearest living enemy to a point and its distance, or null when none is within `within`. */
function nearestEnemy(state: GameState, at: Vec2, within: number): { pos: Vec2; d: number } | null {
  let best: { pos: Vec2; d: number } | null = null;
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const d = dist(z.pos, at);
    if (d <= within && (!best || d < best.d)) best = { pos: z.pos, d };
  }
  return best;
}

/** A downed ally that enemies are closing in on and nobody can heal: the one `s` should pull out. */
function woundedFor(state: GameState, config: GameConfig, s: Soldier): Soldier | null {
  const rules = config.drag;
  if (state.soldiers.some((t) => standing(t) && hasMedkit(config, t))) return null;
  let best: Soldier | null = null;
  let bestD = rules.aiSearch;
  for (const p of state.soldiers) {
    if (p === s || p.kind !== 'soldier' || !p.downed || p.vehicleId !== null) continue;
    if (p.carriedBy !== null || state.soldiers.some((t) => t.dragging === p.id)) continue;
    if (!nearestEnemy(state, p.pos, rules.dangerRadius)) continue;
    const d = dist(p.pos, s.pos);
    if (d >= bestD) continue;
    // Only the closest soldier on its feet goes, so they do not all crowd round one body.
    if (
      state.soldiers.some(
        (t) => t !== s && standing(t) && t.dragging === null && dist(t.pos, p.pos) < d,
      )
    ) {
      continue;
    }
    best = p;
    bestD = d;
  }
  return best;
}

/**
 * An AI soldier's rescue of a downed ally nobody can heal: walk to it, grab it by the shoulders,
 * and pull it away from the enemies until none is close, then let go. Returns where to walk
 * (null to stand still), or `undefined` when there is nothing to rescue and the order carries on.
 */
export function rescueDrag(
  state: GameState,
  config: GameConfig,
  s: Soldier,
): Vec2 | null | undefined {
  const rules = config.drag;
  if (s.dragging !== null) {
    const body = state.soldiers.find((p) => p.id === s.dragging);
    const threat = body?.downed ? nearestEnemy(state, body.pos, rules.dangerRadius * 1.5) : null;
    if (!body || !threat) {
      releaseDrag(s);
      return undefined;
    }
    // Back away from the closest enemy, a few metres at a time.
    const dx = s.pos.x - threat.pos.x;
    const dz = s.pos.z - threat.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: s.pos.x + (dx / d) * 4, z: s.pos.z + (dz / d) * 4 };
  }
  if (s.dragCorpse !== null || s.carrying) return undefined;
  const wounded = woundedFor(state, config, s);
  if (!wounded) return undefined;
  if (dist(wounded.pos, s.pos) <= rules.range * 0.8) {
    toggleDrag(state, config, s.id, wounded.id);
    return null;
  }
  return { ...wounded.pos };
}
