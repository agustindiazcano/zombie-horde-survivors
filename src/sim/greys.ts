import { createAnimal } from './animals';
import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { Animal, GameState, GreyScene } from './types';
import type { Vec2 } from './vec';

/** A grey fires at someone when they are this close to its target stage position, in metres. */
const WALKER_STOP = 6.5;
/** Seconds the first person stays frozen before another runs to help, and the pause before the killing. */
const FROZEN_BEFORE_HELP = 1.8;
const CRUEL_PAUSE = 2.2;
/** Height (m) of a grey's hand and of a person's chest, for the rays. */
const HAND_Z_OFFSET = 0.4;

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
        walker.rush = { x: scene.at.x + 5, z: scene.at.z + 1 };
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
      scene.stage = 'hunt';
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
    const next = nearestTo(freeCivilians(state, config), walker.pos, walker);
    if (next) {
      scene.helper = next.id;
      next.dest = null;
      next.rushSpeed = 0;
      // Runs to a spot beside the frozen person.
      const angle = nextFloat(state.rng) * Math.PI * 2;
      next.rush = {
        x: walker.pos.x + Math.cos(angle) * 1.6,
        z: walker.pos.z + Math.sin(angle) * 1.6,
      };
      scene.stage = 'rush';
      scene.time = 0;
    } else scene.stage = 'hunt';
    return;
  }

  if (scene.stage === 'rush') {
    if (!helper || !grey1) {
      scene.stage = 'hunt';
      return;
    }
    // The second grey raises its staff as the helper comes close.
    grey1.facing = Math.atan2(helper.pos.x - grey1.pos.x, helper.pos.z - grey1.pos.z);
    const near = walker ? dist(helper.pos, walker.pos) < 3.2 : true;
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
    // Everyone left breaks and runs.
    for (const a of freeCivilians(state, config)) {
      a.panic = 30;
      a.fear = { x: scene.at.x, z: scene.at.z };
      a.dest = null;
      a.rush = null;
      a.retreatLeft = 0;
    }
    scene.stage = 'hunt';
    scene.time = 0;
    return;
  }

  // Hunt: each grey walks after the nearest person and vaporises them from a distance.
  greys.forEach((g, i) => {
    g.dest = null;
    const targets = state.animals.filter(
      (a) => isCivilian(config, a) && a.lift <= 0 && a.burnSpeed <= 0,
    );
    const target = nearestTo(targets, g.pos);
    if (!target) return;
    const d = dist(target.pos, g.pos);
    g.facing = Math.atan2(target.pos.x - g.pos.x, target.pos.z - g.pos.z);
    if (d > rules.rayRange * 0.8) {
      g.dest = { x: target.pos.x, z: target.pos.z };
      g.pos.x += Math.sin(g.facing) * rules.walkSpeed * dt;
      g.pos.z += Math.cos(g.facing) * rules.walkSpeed * dt;
      return;
    }
    if (scene.time >= (scene.nextShot[i] ?? 0)) {
      fire(state, scene, g, target, 'vaporise');
      scene.nextShot[i] = scene.time + rules.fireInterval * (0.8 + nextFloat(state.rng) * 0.5);
    }
  });
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
  // Whoever is still around and within reach is drawn into the white light.
  for (const a of freeCivilians(state, config)) {
    if (dist(a.pos, at) > rules.reach) continue;
    a.panic = 0;
    a.retreatLeft = 0;
    a.gathered = true;
    const r = 7 + Math.sqrt(nextFloat(state.rng)) * Math.max(rules.gatherRadius - 7, 1);
    const angle = nextFloat(state.rng) * Math.PI * 2;
    a.dest = { x: at.x + Math.sin(angle) * r, z: at.z + Math.cos(angle) * r };
  }
}
