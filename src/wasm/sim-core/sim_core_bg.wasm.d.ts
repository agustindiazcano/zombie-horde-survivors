/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_ocean_free: (a: number, b: number) => void;
export const __wbg_separation_free: (a: number, b: number) => void;
export const ocean_batch_reserve: (a: number, b: number) => number;
export const ocean_flow_at: (a: number, b: number, c: number) => void;
export const ocean_flow_x: (a: number) => number;
export const ocean_flow_z: (a: number) => number;
export const ocean_height: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
export const ocean_height_batch: (a: number, b: number) => void;
export const ocean_new: () => number;
export const ocean_param_count: () => number;
export const ocean_set_params: (a: number, b: number, c: number) => void;
export const ocean_vortex_height: (a: number, b: number, c: number, d: number) => number;
export const ocean_wave_fade: (a: number, b: number, c: number) => number;
export const ocean_wave_table: (a: number) => [number, number];
export const separation_alive_ptr: (a: number) => number;
export const separation_new: () => number;
export const separation_radius_ptr: (a: number) => number;
export const separation_reserve: (a: number, b: number) => void;
export const separation_run: (a: number, b: number, c: number, d: number) => void;
export const separation_run_slices: (a: number, b: number, c: number, d: any, e: number, f: number, g: any, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => void;
export const separation_x_ptr: (a: number) => number;
export const separation_z_ptr: (a: number) => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
