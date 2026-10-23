/* tslint:disable */
/* eslint-disable */

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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_ocean_free: (a: number, b: number) => void;
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
