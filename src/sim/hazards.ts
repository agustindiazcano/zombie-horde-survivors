import { inShelter } from './shelter';
import type { GameConfig } from './config';
import { hurtObject, ignite, objectDef } from './objects';
import { hurtSoldier } from './soldiers';
import { edgeDistance, getStructure, hurtStructure, structureDef } from './structures';
import { nextFloat } from './rng';
import type { Fire, GameState } from './types';
import { damageZombie } from './zombies';

/** Burn damage lands in bursts this many seconds apart, so hurt effects do not fire every tick. */
const BURN_INTERVAL = 0.5;
/** A fire whose host is gone keeps burning this many seconds more. */
const AFTERGLOW = 2.5;

/** True if something already burns on this host. */
const hosted = (state: GameState, kind: 'object' | 'structure', id: number): boolean =>
  state.fires.some((f) => f.host?.kind === kind && f.host.id === id);

/** Whether the host of a fire still exists. */
function hostAlive(state: GameState, fire: Fire): boolean {
  if (!fire.host) return true;
  return fire.host.kind === 'object'
    ? state.objects.some((o) => o.id === fire.host!.id)
    : getStructure(state, fire.host.id)?.built === true;
}

/** Lights the flammable things within reach of a fire, each with a chance. */
function spreadFrom(state: GameState, config: GameConfig, fire: Fire): void {
  const f = config.hazards.fire;
  for (const o of state.objects) {
    if (!objectDef(config, o).flammable || o.heldBy !== null || o.flight !== null) continue;
    if (Math.hypot(o.pos.x - fire.x, o.pos.z - fire.z) > f.spreadRadius) continue;
    if (hosted(state, 'object', o.id) || nextFloat(state.rng) >= f.spreadChance) continue;
    ignite(state, config, o.pos.x, o.pos.z, { kind: 'object', id: o.id });
  }
  for (const s of state.structures) {
    if (!s.built || !structureDef(config, s).flammable) continue;
    if (edgeDistance(config, s, fire) > f.spreadRadius) continue;
    if (hosted(state, 'structure', s.id) || nextFloat(state.rng) >= f.spreadChance) continue;
    ignite(state, config, s.x, s.z, { kind: 'structure', id: s.id });
  }
}

/**
 * Fire. Every living soldier on foot (the drone is a machine and does not burn) and every enemy
 * inside the radius of a fire takes `dps` damage, in half-second bursts, and so do the flammable
 * objects and structures there. Fires spread to flammable things near them; a fire on bare ground
 * dies out, one on a thing burns until the thing is gone.
 */
export function updateHazards(state: GameState, config: GameConfig, dt: number): void {
  if (state.fires.length === 0) return;
  const f = config.hazards.fire;
  for (const fire of [...state.fires]) {
    fire.age += dt;
    fire.spread -= dt;
    if (!hostAlive(state, fire)) {
      fire.host = null;
      fire.life = Math.min(fire.life, fire.age + AFTERGLOW);
    }
    if (fire.spread <= 0) {
      fire.spread += f.spreadInterval;
      spreadFrom(state, config, fire);
    }
  }
  state.fires = state.fires.filter((fire) => fire.age < fire.life);

  const previous = Math.floor((state.time - dt) / BURN_INTERVAL);
  if (Math.floor(state.time / BURN_INTERVAL) === previous) return;
  const amount = f.dps * BURN_INTERVAL;
  const thing = f.thingDps * BURN_INTERVAL;

  for (const fire of [...state.fires]) {
    for (const s of state.soldiers) {
      if (s.dead || s.kind === 'drone' || inShelter(s) || s.carriedBy !== null) continue;
      if (Math.hypot(s.pos.x - fire.x, s.pos.z - fire.z) <= f.radius) {
        hurtSoldier(state, config, s, amount, -1);
      }
    }
    for (const z of state.zombies) {
      if (z.state === 'death') continue;
      if (Math.hypot(z.pos.x - fire.x, z.pos.z - fire.z) <= f.radius + z.radius) {
        damageZombie(state, config, z, amount);
      }
    }
    for (const o of [...state.objects]) {
      if (!objectDef(config, o).flammable || o.heldBy !== null) continue;
      if (Math.hypot(o.pos.x - fire.x, o.pos.z - fire.z) <= f.radius) {
        hurtObject(state, config, o, thing);
      }
    }
    for (const s of [...state.structures]) {
      if (
        s.built &&
        structureDef(config, s).flammable &&
        edgeDistance(config, s, fire) <= f.radius
      ) {
        hurtStructure(state, config, s, thing);
      }
    }
  }
}
