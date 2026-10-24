import { useKernelBackend, type KernelBackend } from '../sim/kernels';
import { useOceanBackend, type OceanBackend } from '../sim/ocean';
import { packOceanParams } from './oceanWasm';
import { FlowSearch, Ocean, Separation, Walls, loadSimCore, loadSimCoreSync } from './simCore';

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

/** The ocean maths in Rust: the parameters go over only when a number changed (the editor can move them live). */
function makeOceanBackend(): OceanBackend {
  const ocean = new Ocean();
  const packed = new Float64Array(38);
  const sent = new Float64Array(38);
  let have = false;
  const sync = (o: Parameters<typeof packOceanParams>[0]): void => {
    packOceanParams(o, packed);
    let same = have;
    for (let i = 0; same && i < 38; i++) if (packed[i] !== sent[i]) same = false;
    if (same) return;
    ocean.set_params(packed);
    sent.set(packed);
    have = true;
  };
  return {
    height: (o, level, groundY, x, z, t) => {
      sync(o);
      return ocean.height(level, groundY, x, z, t);
    },
    flowAt: (o, x, z, out) => {
      sync(o);
      ocean.flow_at(x, z);
      out.x = ocean.flow_x();
      out.z = ocean.flow_z();
    },
  };
}

/** Loads the module in the browser and switches the kernels to Rust. Resolves false if it cannot. */
export async function installRustKernels(): Promise<boolean> {
  if (!(await loadSimCore())) return false;
  useKernelBackend(makeBackend());
  useOceanBackend(makeOceanBackend());
  return true;
}

/** The same from bytes in memory (Node scripts). */
export function installRustKernelsSync(bytes: BufferSource): void {
  loadSimCoreSync(bytes);
  useKernelBackend(makeBackend());
  useOceanBackend(makeOceanBackend());
}

/** Back to the TypeScript kernels. */
export const useTypeScriptKernels = (): void => {
  useKernelBackend(null);
  useOceanBackend(null);
};
