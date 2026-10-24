import type { GameConfig } from './config';
import { isCorpse, releaseDrag, toggleDrag, toggleDragCorpse } from './drag';
import { pickUpItem } from './inventory';
import { dropCarried, liftOrDrop, objectDef } from './objects';
import { enterPost, togglePost } from './posts';
import {
  DOOR_REACH,
  doorRulesOf,
  edgeDistance,
  resupply,
  structureDef,
  toggleDoor,
} from './structures';
import type { GameState, InteractKind, Soldier } from './types';
import { toggleVehicle } from './vehicles';
import { hypot } from './vec';
import type { Vec2 } from './vec';

/** A soldier walking to a thing stops and acts at this share of its reach. */
export const ARRIVE_SHARE = 0.8;
/** How far (metres) around an object, body or crate the cursor still picks it. */
const PICK_SLACK = 0.6;
const BODY_PICK = 1;
const CRATE_PICK = 1.2;
const ITEM_PICK = 0.7;
const DOOR_PICK = 0.6;
/** A corpse always loses to a nearby door, crate or ally: its distance counts this much more. */
const CORPSE_PENALTY = 0.8;
const VEHICLE_PICK = 1;

/** Something the action key can act on, with the text the RTS cursor shows over it. */
export interface Interactable {
  kind: InteractKind;
  id: number;
  label: string;
  pos: Vec2;
  /** Cursor picking radius around `from`. */
  pick: number;
  /** How close (metres) a soldier has to be to act on it. */
  reach: number;
  /** Distance from a point to the thing (to its edge for a door). */
  from: (p: Vec2) => number;
}

const isBody = (s: Soldier): boolean => s.kind === 'soldier' && (s.dead || s.downed);
const centre = (pos: Vec2) => (p: Vec2) => hypot(pos.x - p.x, pos.z - p.z);

/** Every thing in the world the action key can use right now. `skip` leaves some bodies out. */
export function listInteractables(
  state: GameState,
  config: GameConfig,
  skip?: ReadonlySet<number>,
): Interactable[] {
  const out: Interactable[] = [];
  for (const o of state.objects) {
    if (o.heldBy !== null || o.flight !== null) continue;
    out.push({
      kind: 'object',
      id: o.id,
      label: 'Pick',
      pos: o.pos,
      pick: objectDef(config, o).radius + PICK_SLACK,
      reach: config.objects.liftRange,
      from: centre(o.pos),
    });
  }
  for (const b of state.soldiers) {
    if (!isBody(b) || b.vehicleId !== null || b.carriedBy !== null || skip?.has(b.id)) continue;
    if (state.soldiers.some((s) => s.dragging === b.id)) continue;
    out.push({
      kind: 'body',
      id: b.id,
      label: 'Drag',
      pos: b.pos,
      pick: BODY_PICK,
      reach: config.drag.range,
      from: centre(b.pos),
    });
  }
  for (const z of state.zombies) {
    if (!isCorpse(z) || state.soldiers.some((s) => s.dragCorpse === z.id)) continue;
    out.push({
      kind: 'corpse',
      id: z.id,
      label: 'Drag',
      pos: z.pos,
      pick: BODY_PICK * z.size + CORPSE_PENALTY,
      reach: config.drag.range + CORPSE_PENALTY,
      from: (p) => hypot(z.pos.x - p.x, z.pos.z - p.z) + CORPSE_PENALTY,
    });
  }
  for (const c of state.crates) {
    out.push({
      kind: 'crate',
      id: c.id,
      label: 'Open',
      pos: c.pos,
      pick: CRATE_PICK,
      reach: config.drops.pickupRange,
      from: centre(c.pos),
    });
  }
  for (const g of state.groundItems) {
    out.push({
      kind: 'item',
      id: g.id,
      label: 'Take',
      pos: g.pos,
      pick: ITEM_PICK,
      reach: config.drops.pickupRange,
      from: centre(g.pos),
    });
  }
  for (const s of state.structures) {
    const def = structureDef(config, s);
    if (!s.built || !(def.door || def.switch)) continue;
    out.push({
      kind: 'door',
      id: s.id,
      label: def.switch
        ? s.open
          ? 'Switch off'
          : 'Switch on'
        : doorRulesOf(def).powered
          ? 'Powered'
          : s.lock !== null
            ? 'Locked'
            : s.open
              ? 'Close'
              : 'Open',
      pos: { x: s.x, z: s.z },
      pick: DOOR_PICK,
      reach: DOOR_REACH,
      from: (p) => edgeDistance(config, s, p),
    });
  }
  for (const s of state.structures) {
    const def = structureDef(config, s);
    if (!s.built) continue;
    if (def.post) {
      out.push({
        kind: 'post',
        id: s.id,
        label: s.crew === null ? 'Man' : 'Manned',
        pos: { x: s.x, z: s.z },
        pick: 0.6,
        reach: def.post.enterRange,
        from: (p) => edgeDistance(config, s, p),
      });
    }
    if (def.ammo && s.ammo < def.ammo.capacity) {
      out.push({
        kind: 'turret',
        id: s.id,
        label: 'Resupply',
        pos: { x: s.x, z: s.z },
        pick: 0.6,
        reach: DOOR_REACH,
        // A little behind a post's own label so the two can both be picked.
        from: (p) => edgeDistance(config, s, p) + (def.post ? 0.3 : 0),
      });
    }
  }
  for (const v of state.vehicles) {
    if (!v.seats.includes(null) || config.vehicles[v.type]!.fixed) continue;
    const def = config.vehicles[v.type]!;
    out.push({
      kind: 'vehicle',
      id: v.id,
      label: 'Enter',
      pos: v.pos,
      pick: def.radius + VEHICLE_PICK,
      reach: def.enterRange + def.radius,
      from: centre(v.pos),
    });
  }
  return out;
}

export function findInteractable(
  state: GameState,
  config: GameConfig,
  kind: InteractKind,
  id: number,
): Interactable | undefined {
  return listInteractables(state, config).find((i) => i.kind === kind && i.id === id);
}

/** The thing under a point on the ground (the RTS cursor), if any. */
export function interactableAt(
  state: GameState,
  config: GameConfig,
  ground: Vec2,
  skip?: ReadonlySet<number>,
): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const i of listInteractables(state, config, skip)) {
    const d = i.from(ground);
    if (d <= i.pick && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** The closest thing a soldier is near enough to use, for the action key. */
export function interactableFor(
  state: GameState,
  config: GameConfig,
  s: Soldier,
): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const i of listInteractables(state, config)) {
    const d = i.from(s.pos);
    if (d <= i.reach && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** Acts on a thing that is in reach. A crate only raises an event: the screen opens it. */
export function performInteract(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  it: Interactable,
): void {
  if (it.kind === 'object') liftOrDrop(state, config, s.id, { kind: 'object', id: it.id });
  else if (it.kind === 'body') toggleDrag(state, config, s.id, it.id);
  else if (it.kind === 'corpse') toggleDragCorpse(state, config, s.id, it.id);
  else if (it.kind === 'item') pickUpItem(state, config, s.id, it.id);
  else if (it.kind === 'post') enterPost(state, config, s.id, it.id);
  else if (it.kind === 'turret') resupply(state, config, it.id, s.id);
  else if (it.kind === 'door') toggleDoor(state, config, it.id, s.id);
  else if (it.kind === 'vehicle') toggleVehicle(state, config, s.id);
  else state.events.push({ type: 'crateReached', soldierId: s.id, crateId: it.id });
}

/**
 * The action key in direct control. Holding something (a lifted load or a dragged body) it lets go;
 * otherwise it uses the closest thing in reach: a door, a vehicle, an object or a body. Returns the
 * id of a crate to open when that is the closest (opening is the screen's job).
 */
export function useNearest(state: GameState, config: GameConfig, soldierId: number): number | null {
  const me = state.soldiers.find((s) => s.id === soldierId);
  if (!me || me.dead || me.downed || me.kind !== 'soldier') return null;
  if (me.vehicleId !== null) toggleVehicle(state, config, me.id);
  else if (me.post !== null) togglePost(state, config, me.id);
  else if (me.carrying) dropCarried(state, config, me);
  else if (me.dragging !== null || me.dragCorpse !== null) releaseDrag(me);
  else {
    const it = interactableFor(state, config, me);
    if (it?.kind === 'crate') return it.id;
    if (it) performInteract(state, config, me, it);
  }
  return null;
}

/**
 * Orders soldiers to use a thing. A vehicle takes every one of them; anything else the closest
 * one that is on its feet, which walks there and acts on arrival.
 */
export function orderInteract(
  state: GameState,
  ids: number[],
  it: Pick<Interactable, 'kind' | 'id' | 'pos'>,
): void {
  const crew = state.soldiers.filter(
    (s) => !s.dead && !s.downed && s.kind === 'soldier' && ids.includes(s.id),
  );
  if (it.kind === 'vehicle') {
    for (const s of crew) s.order = { type: 'board', vehicleId: it.id };
    return;
  }
  let actor: Soldier | undefined;
  let bestD = Infinity;
  for (const s of crew) {
    const d = hypot(s.pos.x - it.pos.x, s.pos.z - it.pos.z);
    if (d < bestD) {
      actor = s;
      bestD = d;
    }
  }
  if (actor) actor.order = { type: 'interact', kind: it.kind, id: it.id };
}
