/**
 * Check of the lab's two engines behind one interface (not a test: run `npm run check:lab-engines`).
 * Drives `DiazCanoWorld` (the author's solver) and `RapierWorld` through `LabWorld` with the same
 * calls: balls, a ragdoll, a blast, a push. Prints, per engine, the body count, the state hash
 * twice (same calls must give the same hash) and how the floating of the Map 13 ocean behaves.
 */
import data from '../data/game.json';
import { createRng, type Arena } from '../src/sim';
import type { LabWorld } from '../src/sim/physics/bodies';
import { DiazCanoWorld } from '../src/sim/physics/diazCanoWorld';
import { NODES, NODE_COUNT } from '../src/sim/physics/ragdoll';
import { RapierWorld } from '../src/sim/physics/rapierWorld';

const arena = (): Arena => ({
  halfSize: 60,
  obstacles: [],
  terrain: { heights: null, water: null, paint: null },
  surfaces: [],
});

const standingPose = (): Float32Array => {
  const pose = new Float32Array(NODE_COUNT * 3);
  NODES.forEach((n, i) => {
    pose[i * 3] = n.rest[0];
    pose[i * 3 + 1] = n.rest[1] + 2;
    pose[i * 3 + 2] = n.rest[2];
  });
  return pose;
};

const scene = (w: LabWorld): { hash: number; ragdoll: number; highest: number } => {
  w.clear();
  w.setArena(arena());
  const rng = createRng(12);
  for (let i = 0; i < 200; i++) {
    const a = i * 2.4;
    const r = Math.sqrt(i) * 1.1;
    w.addBall(Math.cos(a) * r, 8 + i * 0.03, Math.sin(a) * r, 0.5, 6, [0, -6, 0]);
  }
  const doll = w.addRagdoll(standingPose(), 1, { jitter: { rng, speed: 0.8 } });
  if (!doll) throw new Error('no ragdoll');
  for (let s = 0; s < 240; s++) w.step();
  w.explosion(0, 0.5, 0, 12);
  for (let s = 0; s < 240; s++) w.step();
  const nodes = new Float32Array(NODE_COUNT * 3);
  w.ragdollNodes(doll, nodes);
  let highest = 0;
  for (let i = 0; i < w.count; i++) highest = Math.max(highest, w.pos[i * 3 + 1]!);
  return { hash: w.stateHash(), ragdoll: nodes[1 * 3 + 1]!, highest };
};

/** A seabed 10 m down, so a ball can float in the ocean above it. */
const seabed = (): Arena => ({
  ...arena(),
  terrain: {
    heights: Array.from({ length: 121 }, () => new Array<number>(121).fill(-10)),
    water: 0,
    paint: null,
  },
});

const floats = (w: LabWorld): number => {
  w.clear();
  w.setArena(seabed());
  w.ocean = {
    params: { ...data.ocean } as never,
    level: 0,
    groundAt: () => -10,
  };
  const id = w.addBall(0, -1.5, 0, 0.5, 6);
  for (let s = 0; s < 600; s++) {
    w.oceanTime = s / 60;
    w.step();
  }
  w.ocean = null;
  return w.pos[id * 3 + 1]!;
};

/** A fresh world per run: Rapier keeps internal state across `clear()`, so only new worlds give one hash. */
const makers: (() => Promise<LabWorld>)[] = [
  async () => new DiazCanoWorld(),
  async () => RapierWorld.create(),
];
for (const make of makers) {
  const w = await make();
  const t0 = performance.now();
  const a = scene(w);
  const ms = performance.now() - t0;
  const b = scene(await make());
  console.log(
    `${w.engine.padEnd(9)} bodies ${w.count}  hash ${a.hash.toString(16)} / ${b.hash.toString(16)} ` +
      `${a.hash === b.hash ? 'same' : 'DIFFERENT'}  chest y ${a.ragdoll.toFixed(2)}  ` +
      `highest ${a.highest.toFixed(1)}  ${ms.toFixed(0)} ms  ball in water y ${floats(w).toFixed(2)}  ` +
      `boxes ${w.supportsBoxes ? 'yes' : 'no'}`,
  );
}
