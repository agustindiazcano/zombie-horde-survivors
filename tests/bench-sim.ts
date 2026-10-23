/**
 * Stress benchmark of the simulation step with many enemies (not a test: run `npm run bench:sim`).
 * It spreads N zombies around the real Map 1 and steps the sim, printing the time per step.
 * At 60 Hz a step has 16.7 ms, and the renderer needs most of that.
 */
import map1 from '../data/maps/map-1.json';
import { FIXED_DT, arenaOf, maxHealthOf, parseMap, spawnZombie, step } from '../src/sim';
import { readFileSync } from 'node:fs';
import { installRustKernelsSync } from '../src/wasm/rustKernels';
import { idle, makeGame } from './sim/helpers';

// `KERNELS=rust npm run bench:sim` runs the step with the Rust kernels (the default is TypeScript).
if (process.env.KERNELS === 'rust')
  installRustKernelsSync(readFileSync('src/wasm/sim-core/sim_core_bg.wasm'));
console.log(`kernels: ${process.env.KERNELS === 'rust' ? 'rust' : 'typescript'}`);

const COUNTS = [100, 300, 600, 1000];
const STEPS = 300;

for (const count of COUNTS) {
  const { state, config } = makeGame({ squad: { count: 4 } });
  config.arena = arenaOf(parseMap(map1));
  const half = config.arena.halfSize - 2;
  for (let i = 0; i < count; i++) {
    // A deterministic ring-ish spread around the squad.
    const angle = i * 2.399963;
    const r = 8 + (i % 37);
    spawnZombie(
      state,
      config,
      {
        x: Math.max(-half, Math.min(half, Math.sin(angle) * r)),
        z: Math.max(-half, Math.min(half, Math.cos(angle) * r)),
      },
      'zombie',
      0,
    );
  }
  // The squad is invulnerable here so the run measures movement, not the game ending.
  for (let i = 0; i < 20; i++) step(state, config, idle, FIXED_DT);
  let total = 0;
  let worst = 0;
  for (let i = 0; i < STEPS; i++) {
    for (const s of state.soldiers) {
      s.health = maxHealthOf(state, config, s);
      s.downed = false;
      s.dead = false;
    }
    state.status = 'playing';
    const t0 = performance.now();
    step(state, config, idle, FIXED_DT);
    const dt = performance.now() - t0;
    total += dt;
    worst = Math.max(worst, dt);
  }
  console.log(
    `${String(count).padStart(5)} zombies: ${(total / STEPS).toFixed(2)} ms/step avg, ${worst.toFixed(2)} ms worst`,
  );
}
