/**
 * Benchmark and checks of the lab physics (not a test: run `npm run bench:physics`).
 * Prints the time per step with 100 to 1000 balls, whether two identical runs give the same
 * hash (determinism), how a ball pyramid holds, and how a ragdoll settles and stretches.
 */
import type { Arena } from '../src/sim';
import { FIXED_DT, createRng } from '../src/sim';
import {
  BALL_RADIUS,
  BONE_COUNT,
  NODE_COUNT,
  PhysicsWorld,
  pyramid,
  spawnRagdoll,
  vogelRain,
} from '../src/sim/physics';

/** A flat 120 m square with no props, like Map 12 before its ramp. */
const arena = (): Arena => ({
  halfSize: 60,
  obstacles: [],
  terrain: { heights: null, water: null, paint: null },
  surfaces: [],
});

const speedOf = (w: PhysicsWorld, i: number): number => Math.hypot(w.vx[i]!, w.vy[i]!, w.vz[i]!);

console.log('== Time per step (1/60 s, 3 sub-steps x 2 passes), balls falling as a Vogel spiral');
for (const count of [100, 300, 600, 1000]) {
  const w = new PhysicsWorld();
  const a = arena();
  vogelRain(w, count, 0, 0);
  for (let i = 0; i < 60; i++) w.step(FIXED_DT, a);
  let total = 0;
  let worst = 0;
  const STEPS = 300;
  for (let i = 0; i < STEPS; i++) {
    const t0 = performance.now();
    w.step(FIXED_DT, a);
    const ms = performance.now() - t0;
    total += ms;
    worst = Math.max(worst, ms);
  }
  let under = 0;
  for (let i = 0; i < w.count; i++) if (w.py[i]! < BALL_RADIUS - 0.2) under++;
  console.log(
    `${String(count).padStart(5)} balls: ${(total / STEPS).toFixed(2)} ms/step avg, ${worst.toFixed(2)} worst, ${w.contacts} contacts, ${under} under the floor`,
  );
}

console.log('\n== Determinism: the same run twice');
const hashOf = (): number => {
  const w = new PhysicsWorld();
  const a = arena();
  vogelRain(w, 400, 0, 0);
  const rng = createRng(7);
  for (let k = 0; k < 3; k++)
    spawnRagdoll(w, k * 3 - 3, 2 + k, 0, k, 1, { jitter: { rng, speed: 0.4 } });
  for (let i = 0; i < 600; i++) {
    if (i === 200) w.explosion(0, 0.5, 0, 12);
    w.step(FIXED_DT, a);
  }
  return w.stateHash();
};
const h1 = hashOf();
const h2 = hashOf();
console.log(`hash 1 ${h1}, hash 2 ${h2}: ${h1 === h2 ? 'IDENTICAL' : 'DIFFERENT'}`);

console.log('\n== Ball pyramid (base 6, 91 balls): does it hold for 10 s?');
{
  const w = new PhysicsWorld();
  const a = arena();
  const top = pyramid(w, 0, 0, 6);
  const y0 = w.py[top]!;
  const x0 = w.px[top]!;
  const z0 = w.pz[top]!;
  for (let i = 0; i < 600; i++) w.step(FIXED_DT, a);
  const drift = Math.hypot(w.px[top]! - x0, w.py[top]! - y0, w.pz[top]! - z0);
  let maxSpeed = 0;
  for (let i = 0; i < w.count; i++) maxSpeed = Math.max(maxSpeed, speedOf(w, i));
  console.log(
    `top ball moved ${drift.toFixed(3)} m in 10 s (${y0.toFixed(2)} m -> ${w.py[top]!.toFixed(2)} m), fastest ball ${maxSpeed.toFixed(3)} m/s`,
  );
}

console.log('\n== Ragdoll dropped from 3 m: when does it rest, and how far does a bone stretch?');
{
  const w = new PhysicsWorld();
  const a = arena();
  const rng = createRng(3);
  const doll = spawnRagdoll(w, 0, 3, 0, 0.5, 1, {
    jitter: { rng, speed: 1.5 },
    velocity: [0, 0, 4],
  })!;
  let rested = -1;
  let worstStretch = 0;
  for (let i = 0; i < 600; i++) {
    w.step(FIXED_DT, a);
    for (let c = 0; c < w.conCount; c++) {
      const p = w.conA[c]!;
      const q = w.conB[c]!;
      const len = Math.hypot(w.px[q]! - w.px[p]!, w.py[q]! - w.py[p]!, w.pz[q]! - w.pz[p]!);
      worstStretch = Math.max(worstStretch, Math.abs(len / w.conRest[c]! - 1));
    }
    if (rested < 0 && doll.bodies.every((b) => speedOf(w, b) < 0.1)) rested = i;
  }
  console.log(
    `${NODE_COUNT} joints, ${BONE_COUNT} bones: rested after ${rested < 0 ? 'more than 10 s' : (rested * FIXED_DT).toFixed(2) + ' s'}, worst bone length error ${(worstStretch * 100).toFixed(1)} %`,
  );
}

// ---------------------------------------------------------------------------------------------
// The same checks on Rapier (src/sim/physics/rapierWorld.ts), to compare with the solver above.
// ---------------------------------------------------------------------------------------------
const {
  RapierWorld,
  BALL_RADIUS: R_BALL,
  BOX_HALF,
} = await import('../src/sim/physics/rapierWorld');
const { heightAt } = await import('../src/sim');

type RW = Awaited<ReturnType<typeof RapierWorld.create>>;

/** The generic person at rest (feet on the floor), lifted by `lift` and moved by (dx, dz). */
const REST_POSE = [
  [0, 1.62, 0],
  [0, 1.3, 0],
  [0, 0.95, 0],
  [-0.4, 1.28, 0],
  [-0.75, 1.28, 0],
  [0.4, 1.28, 0],
  [0.75, 1.28, 0],
  [-0.13, 0.5, 0],
  [-0.13, 0.14, 0],
  [0.13, 0.5, 0],
  [0.13, 0.14, 0],
] as const;
const poseAt = (dx: number, lift: number, dz: number): Float32Array => {
  const pose = new Float32Array(NODE_COUNT * 3);
  REST_POSE.forEach((p, n) => {
    pose[n * 3] = p[0] + dx;
    pose[n * 3 + 1] = p[1] + lift;
    pose[n * 3 + 2] = p[2] + dz;
  });
  return pose;
};

const flat = async (): Promise<RW> => {
  const w = await RapierWorld.create();
  w.setArena(arena());
  return w;
};

/** Boxes stacked like the ball pyramid: `base` x `base` on the floor, one fewer per side above. */
const pyramidBoxes = (w: RW, base: number): number => {
  const d = BOX_HALF * 2;
  let top = -1;
  for (let layer = 0; layer < base; layer++) {
    const side = base - layer;
    const half = ((side - 1) * d) / 2;
    for (let i = 0; i < side; i++)
      for (let j = 0; j < side; j++)
        top = w.addBox(-half + i * d, BOX_HALF + 0.005 + layer * (d + 0.005), -half + j * d);
  }
  return top;
};

console.log('\n\n######## RAPIER (same checks, same machine) ########');

console.log('\n== Heightfield orientation: ray down onto a lopsided terrain vs heightAt');
{
  const half = 20;
  const heights: number[][] = [];
  for (let row = 0; row <= half * 2; row++) {
    const line: number[] = [];
    for (let col = 0; col <= half * 2; col++)
      line.push(col * 0.1 + row * 0.02 + Math.sin(col * 0.3) * 0.4);
    heights.push(line);
  }
  const terrain: Arena = {
    halfSize: half,
    obstacles: [],
    terrain: { heights, water: null, paint: null },
    surfaces: [],
  };
  const w = await RapierWorld.create();
  w.setArena(terrain);
  let worst = 0;
  for (const [x, z] of [
    [-10, -10],
    [10.3, -10.7],
    [-7.2, 12.1],
    [15.5, 15.5],
    [0.4, 3.9],
  ] as const) {
    const hit = w.raycast(x, 50, z, 0, -1, 0, 100);
    const got = hit ? 50 - hit.distance : NaN;
    worst = Math.max(worst, Math.abs(got - heightAt(heights, half, x, z)));
  }
  console.log(`worst difference between the ray hit and heightAt: ${worst.toFixed(4)} m`);
}

console.log('\n== Rapier time per step: balls and boxes falling as a Vogel spiral');
for (const kind of ['balls', 'boxes'] as const) {
  for (const count of [100, 300, 600, 1000]) {
    const w = await flat();
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(i) * 0.7;
      const a = i * 2.3999632297;
      const x = Math.cos(a) * r;
      const y = 14 + i * 0.03;
      const z = Math.sin(a) * r;
      if (kind === 'balls') w.addBall(x, y, z, R_BALL, undefined, [0, -6, 0]);
      else w.addBox(x, y, z);
    }
    for (let i = 0; i < 60; i++) w.step();
    let total = 0;
    let worst = 0;
    const STEPS = 300;
    for (let i = 0; i < STEPS; i++) {
      const t0 = performance.now();
      w.step();
      const ms = performance.now() - t0;
      total += ms;
      worst = Math.max(worst, ms);
    }
    let under = 0;
    for (let i = 0; i < w.count; i++) if (w.pos[i * 3 + 1]! < -0.2) under++;
    console.log(
      `${String(count).padStart(5)} ${kind}: ${(total / STEPS).toFixed(2)} ms/step avg, ${worst.toFixed(2)} worst, ${w.sleeping} asleep, ${under} under the floor`,
    );
  }
}

console.log('\n== Rapier determinism: balls, boxes, ragdolls and a blast, the same run twice');
{
  const hashOfRapier = async (): Promise<number> => {
    const w = await flat();
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const r = Math.sqrt(i) * 0.7;
      const a = i * 2.3999632297;
      w.addBall(Math.cos(a) * r, 8 + i * 0.03, Math.sin(a) * r);
    }
    pyramidBoxes(w, 5);
    for (let k = 0; k < 3; k++)
      w.addRagdoll(poseAt(k * 3 - 3, 2 + k, 6), 1, { jitter: { rng, speed: 0.4 } });
    for (let i = 0; i < 600; i++) {
      if (i === 200) w.explosion(0, 0.5, 0, 12);
      w.step();
    }
    return w.stateHash();
  };
  const a = await hashOfRapier();
  const b = await hashOfRapier();
  console.log(`hash 1 ${a}, hash 2 ${b}: ${a === b ? 'IDENTICAL' : 'DIFFERENT'}`);
}

console.log('\n== Rapier box pyramid (base 6, 91 boxes): does it hold for 10 s?');
{
  const w = await flat();
  const top = pyramidBoxes(w, 6);
  w.step();
  const y0 = w.pos[top * 3 + 1]!;
  const x0 = w.pos[top * 3]!;
  const z0 = w.pos[top * 3 + 2]!;
  for (let i = 0; i < 600; i++) w.step();
  const drift = Math.hypot(
    w.pos[top * 3]! - x0,
    w.pos[top * 3 + 1]! - y0,
    w.pos[top * 3 + 2]! - z0,
  );
  console.log(
    `top box moved ${drift.toFixed(3)} m in 10 s (${y0.toFixed(2)} m -> ${w.pos[top * 3 + 1]!.toFixed(2)} m), ${w.sleeping} of ${w.count} asleep`,
  );
}

console.log('\n== Rapier ball rolling and box on a ramp (slope 0.2, friction 0.8)');
{
  const half = 30;
  const heights: number[][] = [];
  for (let row = 0; row <= half * 2; row++)
    heights.push(Array.from({ length: half * 2 + 1 }, (_, col) => Math.max(0, (col - half) * 0.2)));
  const ramp: Arena = {
    halfSize: half,
    obstacles: [],
    terrain: { heights, water: null, paint: null },
    surfaces: [],
  };
  const w = await RapierWorld.create();
  w.setArena(ramp);
  const ball = w.addBall(10, heightAt(heights, half, 10, 0) + 1, 0);
  const box = w.addBox(14, heightAt(heights, half, 14, 0) + 1, 5);
  for (let i = 0; i < 300; i++) w.step();
  const spin = 2 * Math.acos(Math.min(Math.abs(w.rot[ball * 4 + 3]!), 1));
  console.log(
    `ball from x 10 to x ${w.pos[ball * 3]!.toFixed(2)} (turned ${spin.toFixed(2)} rad); box from x 14 to x ${w.pos[box * 3]!.toFixed(2)}`,
  );
}

console.log('\n== Rapier ragdoll dropped from 3 m: when does it sleep, are the knees sane?');
{
  const w = await flat();
  const rng = createRng(3);
  const doll = w.addRagdoll(poseAt(0, 3, 0), 1, {
    jitter: { rng, speed: 1.5 },
    velocity: [0, 0, 4],
  })!;
  const nodes = new Float32Array(NODE_COUNT * 3);
  const before = [0, 0, 0];
  let rested = -1;
  let worstKnee = 0;
  let lowest = Infinity;
  for (let i = 0; i < 900; i++) {
    w.step();
    w.ragdollNodes(doll, nodes);
    // Knee angle about the body's own right axis (knee R minus knee L): the foot going behind the
    // thigh is positive, the right way; negative would be a knee bent backwards.
    const rx = nodes[9 * 3]! - nodes[7 * 3]!;
    const ry = nodes[9 * 3 + 1]! - nodes[7 * 3 + 1]!;
    const rz = nodes[9 * 3 + 2]! - nodes[7 * 3 + 2]!;
    const rl = Math.hypot(rx, ry, rz) || 1;
    for (const [knee, foot] of [
      [7, 8],
      [9, 10],
    ] as const) {
      const t = [0, 1, 2].map((c) => nodes[knee * 3 + c]! - nodes[2 * 3 + c]!);
      const sv = [0, 1, 2].map((c) => nodes[foot * 3 + c]! - nodes[knee * 3 + c]!);
      const cross = [
        t[1]! * sv[2]! - t[2]! * sv[1]!,
        t[2]! * sv[0]! - t[0]! * sv[2]!,
        t[0]! * sv[1]! - t[1]! * sv[0]!,
      ];
      const dot = t[0]! * sv[0]! + t[1]! * sv[1]! + t[2]! * sv[2]!;
      const signed = (cross[0]! * rx + cross[1]! * ry + cross[2]! * rz) / rl;
      worstKnee = Math.min(worstKnee, Math.atan2(signed, dot));
    }
    if (rested < 0 && doll.bodies.every((b) => w.asleep[b] === 1)) rested = i;
    for (let n = 0; n < NODE_COUNT; n++) lowest = Math.min(lowest, nodes[n * 3 + 1]!);
    if (i === 780) for (let n = 0; n < 3; n++) before[n] = nodes[n]!;
  }
  w.ragdollNodes(doll, nodes);
  const moved = Math.hypot(nodes[0]! - before[0]!, nodes[1]! - before[1]!, nodes[2]! - before[2]!);
  console.log(
    `head moved ${moved.toFixed(3)} m in the last 2 s (${doll.bodies.filter((b) => w.asleep[b] === 1).length} of 10 bodies asleep)`,
  );
  console.log(
    `${doll.bodies.length} bodies asleep after ${rested < 0 ? 'more than 15 s' : (rested / 60).toFixed(2) + ' s'}, lowest joint ${lowest.toFixed(2)} m, most negative knee angle ${((worstKnee * 180) / Math.PI).toFixed(1)} deg`,
  );
}
