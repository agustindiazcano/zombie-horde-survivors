import { useKernelBackend, type KernelBackend } from '../sim/kernels';
import { FlowSearch, Separation, Walls, loadSimCore, loadSimCoreSync } from './simCore';

/**
 * Puts the Rust copies of the flat kernels (crates/sim-core) in charge of the simulation. They are
 * bit-identical to the TypeScript ones and 1.2x to 2.4x faster on the GitHub runners
 * (docs/BENCHMARKS.md). The TypeScript sim stays as the fallback: if the module cannot load, nothing changes.
 */
function makeBackend(): KernelBackend {
  const sep = new Separation();
  const flow = new FlowSearch();
  const walls = new Walls();
  return {
    separate: (x, z, radius, alive, count, half, widest) =>
      sep.run_slices(x, z, radius, alive, count, half, widest),
    flowSearch: (n, cells, extra, dist, targets, targetCount) =>
      flow.run_slices(n, cells, extra, dist, targets, targetCount),
    resolveWalls: (o, x, z, radius, feet, alive, count, stepUp) => {
      // The obstacles go over once per obstacle list (the sim replaces the list when it changes).
      if (walls.id() !== o.id) {
        walls.set_obstacles(
          o.id,
          o.n,
          o.half,
          o.count,
          o.x,
          o.z,
          o.halfW,
          o.halfD,
          o.top,
          o.cellStart,
          o.cellItems,
        );
      }
      walls.run_slices(x, z, radius, feet, alive, count, stepUp);
    },
  };
}

/** Loads the module in the browser and switches the kernels to Rust. Resolves false if it cannot. */
export async function installRustKernels(): Promise<boolean> {
  if (!(await loadSimCore())) return false;
  useKernelBackend(makeBackend());
  return true;
}

/** The same from bytes in memory (Node scripts). */
export function installRustKernelsSync(bytes: BufferSource): void {
  loadSimCoreSync(bytes);
  useKernelBackend(makeBackend());
}

/** Back to the TypeScript kernels. */
export const useTypeScriptKernels = (): void => useKernelBackend(null);
