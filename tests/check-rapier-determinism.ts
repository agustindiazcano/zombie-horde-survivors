/**
 * Determinism check of Rapier (not a test: run `npm run check:rapier`).
 * Builds the same scene (a box pyramid, rolling balls, a blast) with a fixed 1/60 s step and
 * prints a hash of every body's position and rotation. Same variant twice in one process (fresh
 * WASM world each time) must match. Run the script twice and compare the printed hashes across
 * processes too. No Math.random: the only randomness is the seeded RNG of the sim.
 */
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { FIXED_DT, createRng, nextFloat } from '../src/sim';

await RAPIER.init();

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** FNV-1a over the bits of every number. */
const hashNumbers = (values: number[]): number => {
  let h = 0x811c9dc5;
  for (const v of values) {
    f32[0] = v;
    h = Math.imul(h ^ u32[0]!, 0x01000193) >>> 0;
  }
  return h;
};

const run = (): { hash: number; topDrift: number; asleep: number; bodies: number; ms: number } => {
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });
  world.timestep = FIXED_DT;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setFriction(0.8), ground);
  // A ramp, so the balls roll and the boxes can tip.
  const ramp = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(14, 1, 0)
      .setRotation({ x: 0, y: 0, z: Math.sin(-0.15), w: Math.cos(-0.15) }),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(8, 0.3, 6).setFriction(0.8), ramp);

  const bodies: InstanceType<typeof RAPIER.RigidBody>[] = [];
  const addBox = (x: number, y: number, z: number, half: number): (typeof bodies)[number] => {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, half, half).setFriction(0.8).setDensity(1),
      b,
    );
    bodies.push(b);
    return b;
  };
  const addBall = (x: number, y: number, z: number, r: number): void => {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
    world.createCollider(RAPIER.ColliderDesc.ball(r).setFriction(0.8).setRestitution(0.3), b);
    bodies.push(b);
  };

  // Pyramid of boxes, base 6 (21 boxes), 0.5 m cubes, with a small gap to start.
  const half = 0.25;
  let top: (typeof bodies)[number] | null = null;
  for (let row = 0; row < 6; row++) {
    const n = 6 - row;
    for (let i = 0; i < n; i++) {
      top = addBox((i - (n - 1) / 2) * (half * 2 + 0.01), half + row * (half * 2 + 0.005), 0, half);
    }
  }
  const topStart = top!.translation();
  const topY0 = topStart.y;
  const topX0 = topStart.x;

  // Seeded balls dropped on the ramp and the floor.
  const seeded = createRng(11);
  const rng = (): number => nextFloat(seeded);
  for (let i = 0; i < 120; i++) {
    addBall(8 + rng() * 10, 4 + rng() * 6, (rng() - 0.5) * 8, 0.2 + rng() * 0.15);
  }

  const t0 = performance.now();
  for (let i = 0; i < 600; i++) {
    if (i === 300) {
      // A blast at the pyramid: impulse away from the centre, the same formula for every body.
      for (const b of bodies) {
        const p = b.translation();
        const dx = p.x - 0;
        const dy = p.y - 0.2;
        const dz = p.z - 1;
        const d = Math.hypot(dx, dy, dz);
        if (d < 6) {
          const k = (6 * (1 - d / 6)) / (d + 0.25);
          b.applyImpulse({ x: (dx / (d + 0.01)) * k, y: 2 * k, z: (dz / (d + 0.01)) * k }, true);
        }
      }
    }
    world.step();
  }
  const ms = performance.now() - t0;

  const values: number[] = [];
  let asleep = 0;
  for (const b of bodies) {
    const p = b.translation();
    const q = b.rotation();
    values.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    if (b.isSleeping()) asleep++;
  }
  const hash = hashNumbers(values);
  const topEnd = top!.translation();
  world.free();
  return {
    hash,
    topDrift: Math.hypot(topEnd.x - topX0, topEnd.y - topY0),
    asleep,
    bodies: bodies.length,
    ms: ms / 600,
  };
};

// Calm pyramid alone first: does it stand without any blast?
const pyramidOnly = (): string => {
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });
  world.timestep = FIXED_DT;
  const g = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setFriction(0.8), g);
  const half = 0.25;
  let top: InstanceType<typeof RAPIER.RigidBody> | null = null;
  let count = 0;
  for (let row = 0; row < 6; row++) {
    const n = 6 - row;
    for (let i = 0; i < n; i++) {
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(
          (i - (n - 1) / 2) * (half * 2 + 0.01),
          half + row * (half * 2 + 0.005),
          0,
        ),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, half, half).setFriction(0.8).setDensity(1),
        b,
      );
      top = b;
      count++;
    }
  }
  const y0 = top!.translation().y;
  const x0 = top!.translation().x;
  for (let i = 0; i < 600; i++) world.step();
  const t = top!.translation();
  const drift = Math.hypot(t.x - x0, t.y - y0);
  world.free();
  return `${count} boxes, top box moved ${drift.toFixed(4)} m in 10 s`;
};

console.log(`variant: deterministic, Rapier ${RAPIER.version()}`);
console.log(`calm pyramid: ${pyramidOnly()}`);
const a = run();
const b = run();
const c = run();
console.log(
  `run 1 hash ${a.hash}, run 2 hash ${b.hash}, run 3 hash ${c.hash}: ${
    a.hash === b.hash && b.hash === c.hash ? 'IDENTICAL' : 'DIFFERENT'
  }`,
);
console.log(
  `${a.bodies} bodies, ${a.asleep} asleep after 10 s, pyramid top drift ${a.topDrift.toFixed(3)} m, ${a.ms.toFixed(3)} ms/step`,
);
console.log(`HASH ${a.hash}`);
