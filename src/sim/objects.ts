import { inShelter } from './shelter';
import { resolveStatic, supportHeight } from './collision';
import type { GameConfig } from './config';
import { blastLimbs } from './dismember';
import { nextFloat } from './rng';
import { hurtSoldier } from './soldiers';
import { hurtStructure, syncStructures } from './structures';
import type { Carry, Fire, GameObject, GameState, Soldier } from './types';
import { hurtVehicle } from './vehicles';
import type { Vec2 } from './vec';
import { damageZombie } from './zombies';

/** Fires lit by one destroyed container are scattered within this share of its blast radius. */
const SCATTER = 0.7;
/** A putting-down lands this far (metres) in front of the carrier. */
const DROP_DISTANCE = 0.9;
/** The height (metres) a carried body is held at above the carrier's feet. */
const BODY_HEIGHT = 0.9;
/** Never more fires than this at once (each one is drawn and checked every half second). */
const MAX_FIRES = 80;
/** The farthest a throw can land, so even a feeble thrower can toss something a few metres. */
const MIN_THROW = 3;

type ObjectDef = GameConfig['objects']['types'][string];

export const objectDef = (config: GameConfig, o: GameObject): ObjectDef =>
  config.objects.types[o.type]!;

export const getObject = (state: GameState, id: number): GameObject | undefined =>
  state.objects.find((o) => o.id === id);

const isBody = (s: Soldier): boolean => s.kind === 'soldier' && (s.dead || s.downed);

/** The most (kilos) a soldier can lift: its strength attribute times `objects.liftPerStrength`. */
export const maxLift = (config: GameConfig, s: Soldier): number =>
  (s.attributes['strength'] ?? 10) * config.objects.liftPerStrength;

/** Walking speed scale for a load: full for nothing, `carrySpeedFloor` at the most the unit can lift. */
function loadSpeed(config: GameConfig, s: Soldier, weight: number): number {
  const floor = config.objects.carrySpeedFloor;
  return Math.max(floor, 1 - (1 - floor) * Math.min(weight / maxLift(config, s), 1));
}

export function createObject(
  state: GameState,
  config: GameConfig,
  type: string,
  at: Vec2,
): GameObject {
  const o: GameObject = {
    id: state.nextObjectId++,
    type,
    pos: { x: at.x, z: at.z },
    y: supportHeight(config.arena, at, 0),
    health: config.objects.types[type]!.health,
    heldBy: null,
    flight: null,
  };
  state.objects.push(o);
  syncStructures(state, config);
  return o;
}

/** Start of a run: the objects and the fires the map begins with. */
export function resetObjects(state: GameState, config: GameConfig): void {
  for (const p of config.startObjects) {
    if (p.type in config.objects.types) createObject(state, config, p.type, p);
  }
  for (const p of config.startItems) {
    state.groundItems.push({
      id: state.nextGroundItemId++,
      pos: { x: p.x, z: p.z },
      item: p.item,
      count: p.count,
    });
  }
  // A map's own fires burn for ever, but they still spread to what is flammable near them.
  for (const f of config.fires) {
    state.fires.push({
      id: state.nextFireId++,
      x: f.x,
      z: f.z,
      age: 0,
      life: Infinity,
      host: null,
      spread: config.hazards.fire.spreadInterval,
    });
  }
}

/** Lights a fire at a point, on a host (a thing that burns) or on bare ground. */
export function ignite(
  state: GameState,
  config: GameConfig,
  x: number,
  z: number,
  host: Fire['host'] = null,
): Fire | null {
  if (state.fires.length >= MAX_FIRES) return null;
  const f = config.hazards.fire;
  const fire: Fire = {
    id: state.nextFireId++,
    x,
    z,
    age: 0,
    life: host ? Infinity : f.duration,
    host,
    spread: f.spreadInterval,
  };
  state.fires.push(fire);
  state.events.push({ type: 'fireStarted', fireId: fire.id, pos: { x, z } });
  return fire;
}

/** Releases whatever the soldier holds: an object is set down in front of it, a body on the spot. */
export function dropCarried(state: GameState, config: GameConfig, me: Soldier): void {
  const c = me.carrying;
  if (!c) return;
  me.carrying = null;
  if (c.kind === 'object') {
    const o = getObject(state, c.id);
    if (!o) return;
    o.heldBy = null;
    o.pos.x = me.pos.x + Math.sin(me.facing) * DROP_DISTANCE;
    o.pos.z = me.pos.z + Math.cos(me.facing) * DROP_DISTANCE;
    resolveStatic(o.pos, objectDef(config, o).radius, config.arena);
    o.y = supportHeight(config.arena, o.pos, 0);
    syncStructures(state, config);
    return;
  }
  const body = state.soldiers.find((s) => s.id === c.id);
  if (!body) return;
  body.carriedBy = null;
  body.y = supportHeight(config.arena, body.pos, 0);
  body.prevY = body.y;
}

/**
 * Lifts the closest object or fallen ally within reach onto the shoulders, or puts down what the
 * soldier is already holding. Too heavy for the soldier's strength: nothing happens but a message.
 */
export function liftOrDrop(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  /** Lift exactly this thing (a click on it) instead of the closest one. */
  only?: { kind: Carry['kind']; id: number },
): void {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.dead || me.downed || me.kind !== 'soldier' || inShelter(me)) return;
  if (me.carrying) {
    dropCarried(state, config, me);
    return;
  }
  const oc = config.objects;
  let best: { carry: Omit<Carry, 'speed'>; d: number } | null = null;
  const consider = (kind: Carry['kind'], id: number, weight: number, x: number, z: number) => {
    const d = Math.hypot(x - me.pos.x, z - me.pos.z);
    if (d <= oc.liftRange && (!best || d < best.d)) best = { carry: { kind, id, weight }, d };
  };
  for (const o of state.objects) {
    if (only && (only.kind !== 'object' || only.id !== o.id)) continue;
    if (o.heldBy === null && o.flight === null) {
      consider('object', o.id, objectDef(config, o).weight, o.pos.x, o.pos.z);
    }
  }
  for (const b of state.soldiers) {
    if (b === me || !isBody(b) || b.vehicleId !== null || b.carriedBy !== null) continue;
    if (only && (only.kind !== 'body' || only.id !== b.id)) continue;
    consider('body', b.id, oc.bodyWeight, b.pos.x, b.pos.z);
  }
  const pick = best as { carry: Omit<Carry, 'speed'>; d: number } | null;
  if (!pick) return;
  if (pick.carry.weight > maxLift(config, me)) {
    state.events.push({
      type: 'tooHeavy',
      soldierId: me.id,
      needed: Math.ceil(pick.carry.weight / oc.liftPerStrength),
    });
    return;
  }
  // Nobody else may hold the same body, and it stops being dragged.
  for (const s of state.soldiers) if (s.dragging === pick.carry.id) s.dragging = null;
  me.dragging = null;
  me.dragCorpse = null;
  me.carrying = { ...pick.carry, speed: loadSpeed(config, me, pick.carry.weight) };
  if (pick.carry.kind === 'object') {
    getObject(state, pick.carry.id)!.heldBy = me.id;
    syncStructures(state, config);
  }
}

/** Throws the object in hand towards `aim`; heavier things fly shorter. Returns false if it holds none. */
export function throwCarried(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  aim: Vec2,
): boolean {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.carrying?.kind !== 'object' || me.fireCooldown > 0) return false;
  const o = getObject(state, me.carrying.id);
  if (!o) return false;
  const oc = config.objects;
  const share = Math.min(me.carrying.weight / maxLift(config, me), 1);
  const reach = Math.max(MIN_THROW, oc.throwRange * (1 - oc.throwLoadLoss * share));
  const dx = aim.x - me.pos.x;
  const dz = aim.z - me.pos.z;
  const d = Math.hypot(dx, dz);
  const k = d > reach ? reach / d : 1;
  const to = { x: me.pos.x + dx * k, z: me.pos.z + dz * k };
  const run = Math.hypot(to.x - me.pos.x, to.z - me.pos.z);
  o.heldBy = null;
  o.flight = {
    from: { x: me.pos.x, z: me.pos.z },
    to,
    y0: me.y + oc.holdHeight,
    time: Math.max(0.3, run / oc.throwSpeed),
    flown: 0,
    thrower: me.id,
  };
  if (run > 0.01) me.facing = Math.atan2(to.x - me.pos.x, to.z - me.pos.z);
  me.carrying = null;
  syncStructures(state, config);
  me.fireCooldown = Math.max(me.fireCooldown, 0.4);
  state.events.push({ type: 'objectThrown', objectId: o.id, throwerId: me.id });
  return true;
}

/** Damage at distance `d` from a blast: full in the middle, half at the edge. */
const blastAt = (damage: number, d: number, radius: number): number =>
  damage * (1 - 0.5 * Math.min(d / radius, 1));

function explodeAt(state: GameState, config: GameConfig, o: GameObject, def: ObjectDef): void {
  const blast = def.explosive!;
  const at = o.pos;
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    const d = Math.hypot(z.pos.x - at.x, z.pos.z - at.z);
    if (d <= blast.radius + z.radius) {
      damageZombie(state, config, z, blastAt(blast.damage, d, blast.radius));
      blastLimbs(state, config, z, at, d, blast.radius);
    }
  }
  for (const s of state.soldiers) {
    if (s.dead || s.kind === 'drone' || inShelter(s)) continue;
    const d = Math.hypot(s.pos.x - at.x, s.pos.z - at.z);
    if (d <= blast.radius && config.grenades.friendlyFire > 0) {
      hurtSoldier(
        state,
        config,
        s,
        blastAt(blast.damage, d, blast.radius) * config.grenades.friendlyFire,
        -1,
      );
    }
  }
  for (const v of [...state.vehicles]) {
    const d = Math.hypot(v.pos.x - at.x, v.pos.z - at.z);
    if (d <= blast.radius + config.vehicles[v.type]!.radius && v.seats.some((id) => id !== null)) {
      hurtVehicle(state, config, v, blastAt(blast.damage, d, blast.radius));
    }
  }
  for (const s of [...state.structures]) {
    const d = Math.hypot(s.x - at.x, s.z - at.z);
    if (d <= blast.radius) hurtStructure(state, config, s, blastAt(blast.damage, d, blast.radius));
  }
  // The blast sets off the objects near it (barrels chain).
  for (const other of [...state.objects]) {
    if (other === o) continue;
    const d = Math.hypot(other.pos.x - at.x, other.pos.z - at.z);
    if (d <= blast.radius) hurtObject(state, config, other, blastAt(blast.damage, d, blast.radius));
  }
  state.events.push({ type: 'explosion', pos: { x: at.x, z: at.z }, radius: blast.radius });
}

/** Damage to an object; at zero health it is destroyed (and explodes or bursts into flames). */
export function hurtObject(
  state: GameState,
  config: GameConfig,
  o: GameObject,
  amount: number,
): void {
  if (!state.objects.includes(o)) return;
  o.health -= amount;
  if (o.health > 0) return;
  const def = objectDef(config, o);
  state.objects = state.objects.filter((x) => x !== o);
  syncStructures(state, config);
  if (o.heldBy !== null) {
    const holder = state.soldiers.find((s) => s.id === o.heldBy);
    if (holder) holder.carrying = null;
  }
  // The fires it was feeding are left to die out on their own.
  state.events.push({ type: 'objectDestroyed', objectId: o.id, pos: { ...o.pos }, kind: o.type });
  const spread = def.explosive ? def.explosive.radius * SCATTER : 1.5;
  const fires = def.explosive?.fires ?? def.fuel?.fires ?? 0;
  if (def.explosive) explodeAt(state, config, o, def);
  for (let i = 0; i < fires; i++) {
    const angle = nextFloat(state.rng) * Math.PI * 2;
    const dist = Math.sqrt(nextFloat(state.rng)) * spread;
    ignite(state, config, o.pos.x + Math.sin(angle) * dist, o.pos.z + Math.cos(angle) * dist);
  }
}

function land(state: GameState, config: GameConfig, o: GameObject): void {
  const flight = o.flight!;
  const def = objectDef(config, o);
  o.flight = null;
  resolveStatic(o.pos, def.radius, config.arena);
  o.y = supportHeight(config.arena, o.pos, 0);
  syncStructures(state, config);
  const thrower = state.soldiers.find((s) => s.id === flight.thrower);
  const hit = def.radius + 0.8;
  for (const z of state.zombies) {
    if (z.state === 'death') continue;
    if (Math.hypot(z.pos.x - o.pos.x, z.pos.z - o.pos.z) > hit + z.radius) continue;
    damageZombie(state, config, z, def.weight * config.objects.damagePerKg, thrower);
    z.stagger = Math.max(z.stagger, config.objects.stagger);
  }
  state.events.push({ type: 'objectLanded', objectId: o.id, pos: { ...o.pos } });
  hurtObject(state, config, o, config.objects.impactDamage);
}

/** Held things follow their carrier; thrown ones fly along an arc and land. */
export function updateObjects(state: GameState, config: GameConfig, dt: number): void {
  const oc = config.objects;
  for (const me of state.soldiers) {
    const c = me.carrying;
    if (!c) continue;
    if (me.dead || me.downed || inShelter(me)) {
      dropCarried(state, config, me);
      continue;
    }
    if (c.kind === 'object') {
      const o = getObject(state, c.id);
      if (!o) {
        me.carrying = null;
        continue;
      }
      o.pos.x = me.pos.x;
      o.pos.z = me.pos.z;
      o.y = me.y + oc.holdHeight;
      continue;
    }
    const body = state.soldiers.find((s) => s.id === c.id);
    if (!body || !isBody(body)) {
      if (body) body.carriedBy = null;
      me.carrying = null;
      continue;
    }
    body.carriedBy = me.id;
    body.pos.x = body.prev.x = me.pos.x;
    body.pos.z = body.prev.z = me.pos.z;
    body.y = body.prevY = me.y + BODY_HEIGHT;
    body.facing = me.facing + Math.PI / 2;
  }
  for (const o of [...state.objects]) {
    const f = o.flight;
    if (!f) continue;
    f.flown = Math.min(f.time, f.flown + dt);
    const t = f.flown / f.time;
    o.pos.x = f.from.x + (f.to.x - f.from.x) * t;
    o.pos.z = f.from.z + (f.to.z - f.from.z) * t;
    const ground = supportHeight(config.arena, f.to, 100);
    // Starts at the hand, ends on the ground, with an arc on top.
    o.y = f.y0 + (ground - f.y0) * t + 4 * 1.4 * t * (1 - t);
    if (t >= 1) land(state, config, o);
  }
}
