import { supportHeight, resolveStatic } from './collision';
import type { GameConfig } from './config';
import { itemDef } from './inventory';
import { hurtSoldier } from './soldiers';
import type { GameState, Grenade, Soldier, Stack } from './types';
import type { Vec2 } from './vec';
import { hurtVehicle } from './vehicles';
import { damageZombie } from './zombies';

/** A grenade is a small ball; this is how far it is pushed out of walls when it lands. */
const GRENADE_RADIUS = 0.15;
/** Shortest flight (seconds), so a throw at your own feet still has an arc. */
const MIN_FLIGHT = 0.25;

type GrenadeItem = Extract<ReturnType<typeof itemDef>, { type: 'grenade' }>;

const grenadeDef = (config: GameConfig, id: string): GrenadeItem =>
  itemDef(config, id) as GrenadeItem;

/** The first grenade stack in the backpack, if any. */
function grenadeStack(config: GameConfig, s: Soldier): Stack | undefined {
  return s.backpack.find((st) => itemDef(config, st.item).type === 'grenade');
}

/** How many grenades a unit carries in total. */
export const grenadeCount = (config: GameConfig, s: Soldier): number =>
  s.backpack.reduce((n, st) => (itemDef(config, st.item).type === 'grenade' ? n + st.count : n), 0);

const canThrow = (s: Soldier): boolean =>
  s.kind === 'soldier' && !s.dead && !s.downed && s.vehicleId === null;

/**
 * Where a throw towards `target` would land: the point is pulled in to the throw range of the
 * unit's grenade. Null when the unit has nothing to throw or cannot throw now.
 */
export function grenadeAim(
  config: GameConfig,
  soldier: Soldier,
  target: Vec2,
): { landing: Vec2; clamped: boolean; radius: number; item: string } | null {
  const stack = canThrow(soldier) ? grenadeStack(config, soldier) : undefined;
  if (!stack) return null;
  const def = grenadeDef(config, stack.item);
  const dx = target.x - soldier.pos.x;
  const dz = target.z - soldier.pos.z;
  const d = Math.hypot(dx, dz);
  const clamped = d > def.throwRange;
  const k = clamped ? def.throwRange / d : 1;
  return {
    landing: { x: soldier.pos.x + dx * k, z: soldier.pos.z + dz * k },
    clamped,
    radius: def.blastRadius,
    item: stack.item,
  };
}

/**
 * Lobs one of the unit's grenades towards `target` (clamped to the throw range). Returns false
 * when it has none, cannot throw, or is still recovering from its last throw or shot.
 */
export function throwGrenade(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  target: Vec2,
): boolean {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.fireCooldown > 0) return false;
  const aim = grenadeAim(config, me, target);
  if (!aim) return false;

  const stack = grenadeStack(config, me)!;
  if (--stack.count === 0) me.backpack.splice(me.backpack.indexOf(stack), 1);

  const g = config.grenades;
  const d = Math.hypot(aim.landing.x - me.pos.x, aim.landing.z - me.pos.z);
  const flight = Math.max(MIN_FLIGHT, d / g.throwSpeed);
  state.grenades.push({
    id: state.nextGrenadeId++,
    item: aim.item,
    throwerId: me.id,
    from: { x: me.pos.x, z: me.pos.z },
    to: aim.landing,
    pos: { x: me.pos.x, z: me.pos.z },
    y: me.y + g.releaseHeight,
    flight,
    flown: 0,
    fuse: Math.max(grenadeDef(config, aim.item).fuse, flight),
  });
  if (d > 0.01) me.facing = Math.atan2(aim.landing.x - me.pos.x, aim.landing.z - me.pos.z);
  me.fireCooldown = Math.max(me.fireCooldown, g.cooldown);
  state.events.push({ type: 'grenadeThrown', throwerId: me.id });
  return true;
}

/** Damage at distance `d` from the centre: full in the middle, less towards the edge. */
const blastAt = (def: GrenadeItem, d: number): number =>
  def.blastDamage * (1 - def.falloff * Math.min(d / def.blastRadius, 1));

function explode(state: GameState, config: GameConfig, grenade: Grenade): void {
  const def = grenadeDef(config, grenade.item);
  const at = grenade.pos;
  const thrower = state.soldiers.find((s) => s.id === grenade.throwerId);

  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const d = Math.hypot(z.pos.x - at.x, z.pos.z - at.z);
    if (d <= def.blastRadius + z.radius) damageZombie(state, config, z, blastAt(def, d), thrower);
  }
  for (const s of state.soldiers) {
    if (s.dead || s.kind === 'drone' || s.vehicleId !== null) continue;
    const d = Math.hypot(s.pos.x - at.x, s.pos.z - at.z);
    if (d <= def.blastRadius && config.grenades.friendlyFire > 0) {
      hurtSoldier(state, config, s, blastAt(def, d) * config.grenades.friendlyFire, -1);
    }
  }
  for (const v of [...state.vehicles]) {
    const d = Math.hypot(v.pos.x - at.x, v.pos.z - at.z);
    const reach = def.blastRadius + config.vehicles[v.type]!.radius;
    if (d <= reach && v.seats.some((id) => id !== null))
      hurtVehicle(state, config, v, blastAt(def, d));
  }
  state.events.push({ type: 'explosion', pos: { x: at.x, z: at.z }, radius: def.blastRadius });
}

/**
 * Flies each grenade along its arc (a parabola from the hand to the target), lets it rest where
 * it lands, and blows it up when the fuse runs out.
 */
export function updateGrenades(state: GameState, config: GameConfig, dt: number): void {
  if (state.grenades.length === 0) return;
  const g = config.grenades;
  const alive: Grenade[] = [];
  for (const gr of state.grenades) {
    gr.fuse -= dt;
    if (gr.flown < gr.flight) {
      gr.flown = Math.min(gr.flight, gr.flown + dt);
      const t = gr.flown / gr.flight;
      gr.pos.x = gr.from.x + (gr.to.x - gr.from.x) * t;
      gr.pos.z = gr.from.z + (gr.to.z - gr.from.z) * t;
      const thrower = state.soldiers.find((s) => s.id === gr.throwerId);
      const y0 = (thrower?.y ?? 0) + g.releaseHeight;
      const ground = supportHeight(config.arena, gr.to, 100);
      // Closed-form ballistic height: starts at the hand, ends on the ground at the target.
      const vy = (ground - y0 + 0.5 * g.gravity * gr.flight * gr.flight) / gr.flight;
      const s = gr.flown;
      gr.y = Math.max(ground, y0 + vy * s - 0.5 * g.gravity * s * s);
      // A landing inside a wall is pushed out to its edge.
      if (gr.flown >= gr.flight) resolveStatic(gr.pos, GRENADE_RADIUS, config.arena, gr.y);
    }
    if (gr.fuse <= 0) explode(state, config, gr);
    else alive.push(gr);
  }
  state.grenades = alive;
}
