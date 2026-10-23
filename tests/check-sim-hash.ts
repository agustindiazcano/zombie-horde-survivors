/**
 * A hash of the whole simulation after a fixed scenario (not a test: run `npm run check:sim-hash`).
 * The same scenario as `bench:sim` (zombies spread round the squad on the real Map 1, the squad
 * unkillable), stepped for a fixed number of steps; the hash covers the exact bits of every zombie's
 * and soldier's position, health and state. Anything that changes the simulation's numbers changes it:
 * a refactor of a hot loop, or its Rust copy, must keep it.
 */
import map1 from '../data/maps/map-1.json';
import { readFileSync } from 'node:fs';
import { FIXED_DT, arenaOf, maxHealthOf, parseMap, spawnZombie, step } from '../src/sim';
import { backendCalls, kernelBackendName } from '../src/sim/kernels';
import { installRustKernelsSync, useTypeScriptKernels } from '../src/wasm/rustKernels';
import { idle, makeGame } from './sim/helpers';

const COUNTS = [100, 300, 1000];
const STEPS = 240;

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** FNV-1a over the bits of numbers and the characters of strings. */
class Hasher {
  h = 0x811c9dc5;
  private mix(v: number): void {
    this.h = Math.imul(this.h ^ (v >>> 0), 0x01000193) >>> 0;
  }
  num(v: number): void {
    f64[0] = v;
    this.mix(u32[0]!);
    this.mix(u32[1]!);
  }
  str(s: string): void {
    for (let i = 0; i < s.length; i++) this.mix(s.charCodeAt(i));
  }
}

function runScenario(): string {
  const all = new Hasher();
  for (const count of COUNTS) {
    const { state, config } = makeGame({ squad: { count: 4 } });
    config.arena = arenaOf(parseMap(map1));
    const half = config.arena.halfSize - 2;
    for (let i = 0; i < count; i++) {
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
    for (let i = 0; i < STEPS; i++) {
      for (const s of state.soldiers) {
        s.health = maxHealthOf(state, config, s);
        s.downed = false;
        s.dead = false;
      }
      state.status = 'playing';
      step(state, config, idle, FIXED_DT);
    }
    const h = new Hasher();
    for (const z of state.zombies) {
      h.num(z.pos.x);
      h.num(z.pos.z);
      h.num(z.health);
      h.str(z.state);
    }
    for (const s of state.soldiers) {
      h.num(s.pos.x);
      h.num(s.pos.z);
      h.num(s.health);
    }
    const alive = state.zombies.filter((z) => z.state !== 'death').length;
    console.log(
      `${String(count).padStart(5)} zombies after ${STEPS} steps: ${alive} alive, hash ${h.h.toString(16).padStart(8, '0')}`,
    );
    all.num(h.h);
  }
  return all.h.toString(16).padStart(8, '0');
}

// The same scenario with the TypeScript kernels and with the Rust ones: the hash must be the same.
useTypeScriptKernels();
console.log(`-- kernels: ${kernelBackendName()}`);
const tsHash = runScenario();
installRustKernelsSync(readFileSync('src/wasm/sim-core/sim_core_bg.wasm'));
console.log(`-- kernels: ${kernelBackendName()}`);
const rustHash = runScenario();
console.log(
  `Rust kernels served ${backendCalls.separate} separations, ${backendCalls.flowSearch} flow field searches and ${backendCalls.resolveWalls} wall passes`,
);
console.log(`SIM HASH ${tsHash}`);
if (rustHash !== tsHash || backendCalls.separate === 0 || backendCalls.resolveWalls === 0) {
  console.log(`FAIL: with the Rust kernels the hash is ${rustHash}`);
  process.exitCode = 1;
} else {
  console.log('OK: the Rust kernels give the same hash');
}
