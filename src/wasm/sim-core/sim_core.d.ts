/* tslint:disable */
/* eslint-disable */

/**
 * The flow field search of `flowSearch` in `src/sim/kernels.ts`: Dijkstra over a grid with a binary
 * heap, identical tie-breaking. Fed through slices or through the buffers in the module's memory.
 */
export class FlowSearch {
    free(): void;
    [Symbol.dispose](): void;
    cells_ptr(): number;
    dist_ptr(): number;
    extra_ptr(): number;
    constructor();
    /**
     * Room for an `n` x `n` grid and `max_targets` targets in the module's own buffers.
     */
    reserve(n: number, max_targets: number): void;
    /**
     * Searches on the module's own buffers.
     */
    run(n: number, target_count: number): void;
    /**
     * Searches on slices: the bindings copy them in and `dist` back out.
     */
    run_slices(n: number, cells: Uint8Array, extra: Float32Array, dist: Float64Array, targets: Int32Array, target_count: number): void;
    targets_ptr(): number;
}

/**
 * One ocean: the parameters, its wave table and the last flow asked for.
 */
export class Ocean {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Makes room for `n` points and returns the address of the buffer in the module's memory. It holds
     * five rows of `n` numbers: ground height, x, z, time (written by the caller) and the result.
     * The address changes if the memory grows: ask again after any call that may allocate.
     */
    batch_reserve(n: number): number;
    /**
     * Speed of the water (m/s) at (x, z); read it with `flow_x` and `flow_z`.
     */
    flow_at(x: number, z: number): void;
    flow_x(): number;
    flow_z(): number;
    /**
     * Height of the water surface (m) at (x, z) and time `t`.
     */
    height(level: number, ground_y: number, x: number, z: number, t: number): number;
    /**
     * Fills the result row with `height` for each of the `n` points of the batch buffer.
     */
    height_batch(level: number): void;
    constructor();
    /**
     * How many numbers `set_params` wants.
     */
    static param_count(): number;
    /**
     * Loads the ocean numbers. The wave table is rebuilt only when a number that shapes it changed.
     */
    set_params(params: Float64Array): void;
    /**
     * How much the whirlpools move the surface (m) at (x, z) and time `t`.
     */
    vortex_height(x: number, z: number, t: number): number;
    /**
     * 0 where the ground is at the water level or above, 1 once the water is deep enough.
     */
    wave_fade(level: number, ground_y: number): number;
    /**
     * The wave table as 7 rows of 8 numbers (dx, dz, amp, freq, speed, pressure, phase), for checks.
     */
    wave_table(): Float64Array;
}

/**
 * The pair-push kernel `separate`, with its grid buffers. Two ways to feed it: slices (the bindings
 * copy them in and out) or the buffers inside the module's memory (`reserve`, the `*_ptr` getters, `run`).
 */
export class Separation {
    free(): void;
    [Symbol.dispose](): void;
    alive_ptr(): number;
    constructor();
    radius_ptr(): number;
    /**
     * Makes room for `capacity` bodies in the module's own buffers. Fetch the pointers again afterwards.
     */
    reserve(capacity: number): void;
    /**
     * Runs the kernel on the module's own buffers (filled by the caller through the pointers).
     */
    run(count: number, half: number, widest: number): void;
    /**
     * Runs the kernel on slices: the bindings copy them in, and `x` and `z` back out.
     */
    run_slices(x: Float64Array, z: Float64Array, radius: Float64Array, alive: Uint8Array, count: number, half: number, widest: number): void;
    x_ptr(): number;
    z_ptr(): number;
}

/**
 * `resolveWalls` of `src/sim/kernels.ts`: the obstacles as flat arrays and a CSR grid (uploaded once
 * per obstacle list with `set_obstacles`), then batches of circles pushed out of them in the same
 * order as the TypeScript. `Math.sign(v || 1)` of the TypeScript is `sign_or_one`.
 */
export class Walls {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The id of the obstacle set held, or -1.
     */
    id(): number;
    constructor();
    /**
     * Pushes each living circle out of the obstacles and keeps it in the arena; `x` and `z` come back.
     */
    run_slices(x: Float64Array, z: Float64Array, radius: Float64Array, feet: Float64Array, alive: Uint8Array, count: number, step_up: number): void;
    /**
     * Takes a copy of an obstacle set (the arrays of the TypeScript `FlatObstacles`).
     */
    set_obstacles(id: number, n: number, half: number, count: number, x: Float64Array, z: Float64Array, half_w: Float64Array, half_d: Float64Array, top: Float64Array, cell_start: Int32Array, cell_items: Int32Array): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_flowsearch_free: (a: number, b: number) => void;
    readonly __wbg_ocean_free: (a: number, b: number) => void;
    readonly __wbg_separation_free: (a: number, b: number) => void;
    readonly __wbg_walls_free: (a: number, b: number) => void;
    readonly flowsearch_cells_ptr: (a: number) => number;
    readonly flowsearch_dist_ptr: (a: number) => number;
    readonly flowsearch_extra_ptr: (a: number) => number;
    readonly flowsearch_new: () => number;
    readonly flowsearch_reserve: (a: number, b: number, c: number) => void;
    readonly flowsearch_run: (a: number, b: number, c: number) => void;
    readonly flowsearch_run_slices: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: any, j: number, k: number, l: number) => void;
    readonly flowsearch_targets_ptr: (a: number) => number;
    readonly ocean_batch_reserve: (a: number, b: number) => number;
    readonly ocean_flow_at: (a: number, b: number, c: number) => void;
    readonly ocean_flow_x: (a: number) => number;
    readonly ocean_flow_z: (a: number) => number;
    readonly ocean_height: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly ocean_height_batch: (a: number, b: number) => void;
    readonly ocean_new: () => number;
    readonly ocean_param_count: () => number;
    readonly ocean_set_params: (a: number, b: number, c: number) => void;
    readonly ocean_vortex_height: (a: number, b: number, c: number, d: number) => number;
    readonly ocean_wave_fade: (a: number, b: number, c: number) => number;
    readonly ocean_wave_table: (a: number) => [number, number];
    readonly separation_alive_ptr: (a: number) => number;
    readonly separation_new: () => number;
    readonly separation_radius_ptr: (a: number) => number;
    readonly separation_reserve: (a: number, b: number) => void;
    readonly separation_run: (a: number, b: number, c: number, d: number) => void;
    readonly separation_run_slices: (a: number, b: number, c: number, d: any, e: number, f: number, g: any, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => void;
    readonly separation_x_ptr: (a: number) => number;
    readonly separation_z_ptr: (a: number) => number;
    readonly walls_id: (a: number) => number;
    readonly walls_new: () => number;
    readonly walls_run_slices: (a: number, b: number, c: number, d: any, e: number, f: number, g: any, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => void;
    readonly walls_set_obstacles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
