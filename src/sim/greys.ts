import { createAnimal } from './animals';
import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { Animal, GameState, GreyScene } from './types';
import type { Vec2 } from './vec';

/** A grey fires at someone when they are this close to its target stage position, in metres. */
const WALKER_STOP = 3.4;
/** Seconds the first person stays frozen before another runs to help, and the pause before the killing. */
const FROZEN_BEFORE_HELP = 3;
/** The helper starts at least this far (m) from the frozen person. */
const HELPER_MIN_RUN = 5;
const CRUEL_PAUSE = 2.2;
/** Height (m) of a grey's hand and of a person's chest, for the rays. */
const HAND_Z_OFFSET = 0.4;
/** The ring of people round the greys: its radius, the step between rings and the room (m) each person takes. */
const RING_RADIUS = 8;
const RING_STEP = 1.6;
const RING_SPACING = 0.9;

const isCivilian = (config: GameConfig, a: Animal): boolean => !!config.animals[a.type]?.fearRadius;
const isGrey = (config: GameConfig, a: Animal): boolean =>
  config.animals[a.type]?.scripted === true;

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Free civilians: not lifted, not already being burned. */
function freeCivilians(state: GameState, config: GameConfig): Animal[] {
  return state.animals.filter((a) => isCivilian(config, a) && a.lift <= 0 && a.burnSpeed <= 0);
}

function nearestTo(list: Animal[], to: Vec2, except: Animal | null = null): Animal | null {
  let best: Animal | null = null;
  let bestD = Infinity;
  for (const a of list) {
    if (a === except) continue;
    const d = dist(a.pos, to);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** The greys of the scene, in the order they were made. */
const greysOf = (state: GameState, config: GameConfig): Animal[] =>
  state.animals.filter((a) => isGrey(config, a));

/**
 * The grey aliens' scene. It starts when a carrier sphere (an abductor with no victims) has
 * arrived: three greys come down the white light, one person walks up and is frozen, another
 * runs to help and is vaporised, the rest panic, and the greys vaporise them all.
 */
export function updateGreys(state: GameState, config: GameConfig, dt: number): void {
  if (!state.greyScene) {
    const ship = state.orbs.find(
      (o) => config.orbs[o.type]?.victims === 0 && o.arrivedAt !== null && o.hover !== null,
    );
    if (ship?.hover) startScene(state, config, ship.hover);
    return;
  }
  const scene = state.greyScene;
  scene.time += dt;
  const greys = greysOf(state, config);
  const rules = config.greys;

  if (scene.stage === 'descend') {
    // Each grey starts down a little after the one before.
    let landed = 0;
    greys.forEach((g, i) => {
      if (scene.time < rules.descendDelay + i * 0.9) return;
      g.lift = Math.max(0, g.lift - rules.descendSpeed * dt);
      if (g.lift <= 0) landed++;
    });
    if (landed === greys.length && scene.time > rules.approachDelay - 4) {
      scene.stage = 'approach';
      scene.time = 0;
      const free = freeCivilians(state, config);
      const walker = nearestTo(free, scene.at);
      if (walker) {
        scene.walker = walker.id;
        // He walks, not runs, toward the greys.
        walker.dest = null;
        // He walks up to a few steps from the first grey.
        const g0 = greysOf(state, config)[0];
        const gx = g0 ? g0.pos.x : scene.at.x;
        const gz = g0 ? g0.pos.z : scene.at.z;
        const away = Math.hypot(walker.pos.x - gx, walker.pos.z - gz) || 1;
        walker.rush = {
          x: gx + ((walker.pos.x - gx) / away) * (WALKER_STOP - 0.6),
          z: gz + ((walker.pos.z - gz) / away) * (WALKER_STOP - 0.6),
        };
        walker.rushSpeed = 1.3;
      }
    }
    return;
  }

  const grey0 = greys[0];
  const grey1 = greys[1] ?? greys[0];
  const walker = state.animals.find((a) => a.id === scene.walker) ?? null;
  const helper = state.animals.find((a) => a.id === scene.helper) ?? null;

  if (scene.stage === 'approach') {
    if (!grey0 || !walker) {
      startPanic(state, config, scene);
      return;
    }
    // The grey turns to watch him come.
    grey0.facing = Math.atan2(walker.pos.x - grey0.pos.x, walker.pos.z - grey0.pos.z);
    if (dist(walker.pos, grey0.pos) < WALKER_STOP) {
      fire(state, scene, grey0, walker, 'paralyse');
      walker.dest = null;
      walker.rush = null;
      walker.burn = 0.3; // stands rigid and glows a little
      walker.burnSpeed = 0;
      scene.stage = 'paralysed';
      scene.time = 0;
    }
    return;
  }

  if (scene.stage === 'paralysed') {
    if (scene.time < FROZEN_BEFORE_HELP || !walker) return;
    // The one who runs to help comes from a few metres away, so there is a run to see.
    const far = freeCivilians(state, config).filter(
      (a) => dist(a.pos, walker.pos) >= HELPER_MIN_RUN,
    );
    const next = nearestTo(far, walker.pos, walker);
    if (next) {
      scene.helper = next.id;
      next.dest = null;
      next.rushSpeed = 3.6;
      // Runs to a spot beside the frozen person.
      const angle = nextFloat(state.rng) * Math.PI * 2;
      next.rush = {
        x: walker.pos.x + Math.cos(angle) * 1.6,
        z: walker.pos.z + Math.sin(angle) * 1.6,
      };
      scene.stage = 'rush';
      scene.time = 0;
    } else startPanic(state, config, scene);
    return;
  }

  if (scene.stage === 'rush') {
    if (!helper || !grey1) {
      startPanic(state, config, scene);
      return;
    }
    // The second grey raises its staff as the helper comes close.
    grey1.facing = Math.atan2(helper.pos.x - grey1.pos.x, helper.pos.z - grey1.pos.z);
    const near = walker ? dist(helper.pos, walker.pos) < 2.4 : true;
    if (near || scene.time > 5) {
      fire(state, scene, grey1, helper, 'vaporise');
      helper.rush = null;
      scene.stage = 'cruel';
      scene.time = 0;
    }
    return;
  }

  if (scene.stage === 'cruel') {
    if (scene.time < CRUEL_PAUSE) return;
    scene.stage = 'some';
    scene.time = 0;
    return;
  }

  if (scene.stage === 'some') {
    // The greys pick off a few more from the ring, one every `someGap` seconds; nobody runs yet.
    if (scene.kills < rules.someKills) {
      if (scene.time < (scene.kills + 1) * rules.someGap) return;
      const g = greys[scene.kills % greys.length];
      const target = g ? nearestTo(freeCivilians(state, config), g.pos) : null;
      if (g && target && dist(target.pos, g.pos) < rules.rayRange * 1.5) {
        fire(state, scene, g, target, 'vaporise');
      }
      scene.kills++;
      return;
    }
    if (scene.time > (rules.someKills + 1) * rules.someGap) startPanic(state, config, scene);
    return;
  }
  // 'hunt': the panic is on and the spheres do the killing; the greys stand and watch.
}

/** Everyone left breaks and runs, and the hunter spheres are called. */
function startPanic(state: GameState, config: GameConfig, scene: GreyScene): void {
  for (const a of freeCivilians(state, config)) {
    a.panic = 30;
    a.fear = { x: scene.at.x, z: scene.at.z };
    a.dest = null;
    a.rush = null;
    a.retreatLeft = 0;
  }
  scene.stage = 'hunt';
  scene.time = 0;
  scene.huntAt = state.time;
}

/** One grey fires a ray at one person: the ray is an event for the screen; the effect is set here. */
function fire(
  state: GameState,
  scene: GreyScene,
  grey: Animal,
  target: Animal,
  kind: 'paralyse' | 'vaporise',
): void {
  grey.facing = Math.atan2(target.pos.x - grey.pos.x, target.pos.z - grey.pos.z);
  state.events.push({
    type: 'greyRay',
    id: scene.rayId++,
    from: {
      x: grey.pos.x + Math.sin(grey.facing) * HAND_Z_OFFSET,
      z: grey.pos.z + Math.cos(grey.facing) * HAND_Z_OFFSET,
    },
    to: { x: target.pos.x, z: target.pos.z },
    kind,
  });
  if (kind === 'vaporise') {
    target.burn = Math.max(target.burn, 0.02);
    target.burnSpeed = 1 / 1.0;
    target.panic = 0;
    state.events.push({ type: 'vaporiseStart', pos: { x: target.pos.x, z: target.pos.z } });
  }
}

/** The ship is here: the greys appear high in its light, and the survivors nearby are drawn to it. */
function startScene(state: GameState, config: GameConfig, at: Vec2): void {
  const rules = config.greys;
  state.greyScene = {
    stage: 'descend',
    time: 0,
    at: { x: at.x, z: at.z },
    walker: null,
    helper: null,
    nextShot: Array.from({ length: rules.count }, () => 0),
    rayId: 1,
    kills: 0,
    huntAt: null,
  };
  const nextId = Math.max(0, ...state.animals.map((a) => a.id)) + 1;
  for (let i = 0; i < rules.count; i++) {
    const angle = (i / rules.count) * Math.PI * 2 + 0.5;
    const pos = {
      x: at.x + Math.sin(angle) * rules.landRadius,
      z: at.z + Math.cos(angle) * rules.landRadius,
    };
    const grey = createAnimal(nextId + i, 'grey_alien', pos, angle + Math.PI);
    grey.lift = rules.descendHeight;
    state.animals.push(grey);
  }
  // Whoever is still around and within reach walks into the light and stands in a ring round the
  // greys, facing them. Taken in order of the angle they come from, so paths do not cross.
  const near = freeCivilians(state, config)
    .filter((a) => dist(a.pos, at) <= rules.reach)
    .sort(
      (p, q) =>
        Math.atan2(p.pos.x - at.x, p.pos.z - at.z) - Math.atan2(q.pos.x - at.x, q.pos.z - at.z),
    );
  const slots: Vec2[] = [];
  for (let ring = 0; slots.length < near.length; ring++) {
    const r = RING_RADIUS + ring * RING_STEP;
    const count = Math.max(6, Math.floor((Math.PI * 2 * r) / RING_SPACING));
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + ring * 0.4;
      slots.push({ x: at.x + Math.sin(angle) * r, z: at.z + Math.cos(angle) * r });
    }
  }
  // Pair people and slots by angle, so each walks to the part of the ring on their side.
  const bySlotAngle = [...slots].sort(
    (p, q) => Math.atan2(p.x - at.x, p.z - at.z) - Math.atan2(q.x - at.x, q.z - at.z),
  );
  near.forEach((a, i) => {
    a.panic = 0;
    a.retreatLeft = 0;
    a.gathered = true;
    a.dest = bySlotAngle[Math.floor((i * bySlotAngle.length) / near.length)] ?? null;
  });
}
