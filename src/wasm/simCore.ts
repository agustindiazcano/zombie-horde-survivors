import init, { initSync, Ocean, Separation } from './sim-core/sim_core.js';

/**
 * Loads the Rust / WebAssembly module of `crates/sim-core` (rebuild it with `npm run build:wasm`).
 * The TypeScript simulation is the reference and the fallback: nothing in the game needs this to load.
 */

let ready = false;
let memory: WebAssembly.Memory | null = null;

/** Loads the module in the browser (fetches the `.wasm` next to the glue). Resolves false if it cannot. */
export async function loadSimCore(): Promise<boolean> {
  if (ready) return true;
  try {
    memory = (await init()).memory;
    ready = true;
  } catch {
    ready = false;
  }
  return ready;
}

/** Loads the module from bytes already in memory (Node scripts). */
export function loadSimCoreSync(bytes: BufferSource): void {
  memory = initSync({ module: bytes }).memory;
  ready = true;
}

/** The module's memory; its `buffer` changes when the memory grows, so build views right before use. */
export function simCoreMemory(): WebAssembly.Memory {
  if (!memory) throw new Error('sim-core is not loaded');
  return memory;
}

export { Ocean, Separation };
