/* @ts-self-types="./sim_core.d.ts" */

/**
 * The flow field search of `flowSearch` in `src/sim/kernels.ts`: Dijkstra over a grid with a binary
 * heap, identical tie-breaking. Fed through slices or through the buffers in the module's memory.
 */
export class FlowSearch {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FlowSearchFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_flowsearch_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    cells_ptr() {
        const ret = wasm.flowsearch_cells_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    dist_ptr() {
        const ret = wasm.flowsearch_dist_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    extra_ptr() {
        const ret = wasm.flowsearch_extra_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.flowsearch_new();
        this.__wbg_ptr = ret;
        FlowSearchFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Room for an `n` x `n` grid and `max_targets` targets in the module's own buffers.
     * @param {number} n
     * @param {number} max_targets
     */
    reserve(n, max_targets) {
        wasm.flowsearch_reserve(this.__wbg_ptr, n, max_targets);
    }
    /**
     * Searches on the module's own buffers.
     * @param {number} n
     * @param {number} target_count
     */
    run(n, target_count) {
        wasm.flowsearch_run(this.__wbg_ptr, n, target_count);
    }
    /**
     * Searches on slices: the bindings copy them in and `dist` back out.
     * @param {number} n
     * @param {Uint8Array} cells
     * @param {Float32Array} extra
     * @param {Float64Array} dist
     * @param {Int32Array} targets
     * @param {number} target_count
     */
    run_slices(n, cells, extra, dist, targets, target_count) {
        const ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(extra, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = passArrayF64ToWasm0(dist, wasm.__wbindgen_malloc);
        var len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(targets, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        wasm.flowsearch_run_slices(this.__wbg_ptr, n, ptr0, len0, ptr1, len1, ptr2, len2, dist, ptr3, len3, target_count);
    }
    /**
     * @returns {number}
     */
    targets_ptr() {
        const ret = wasm.flowsearch_targets_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) FlowSearch.prototype[Symbol.dispose] = FlowSearch.prototype.free;

/**
 * One ocean: the parameters, its wave table and the last flow asked for.
 */
export class Ocean {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OceanFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ocean_free(ptr, 0);
    }
    /**
     * Makes room for `n` points and returns the address of the buffer in the module's memory. It holds
     * five rows of `n` numbers: ground height, x, z, time (written by the caller) and the result.
     * The address changes if the memory grows: ask again after any call that may allocate.
     * @param {number} n
     * @returns {number}
     */
    batch_reserve(n) {
        const ret = wasm.ocean_batch_reserve(this.__wbg_ptr, n);
        return ret >>> 0;
    }
    /**
     * Speed of the water (m/s) at (x, z); read it with `flow_x` and `flow_z`.
     * @param {number} x
     * @param {number} z
     */
    flow_at(x, z) {
        wasm.ocean_flow_at(this.__wbg_ptr, x, z);
    }
    /**
     * @returns {number}
     */
    flow_x() {
        const ret = wasm.ocean_flow_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    flow_z() {
        const ret = wasm.ocean_flow_z(this.__wbg_ptr);
        return ret;
    }
    /**
     * Height of the water surface (m) at (x, z) and time `t`.
     * @param {number} level
     * @param {number} ground_y
     * @param {number} x
     * @param {number} z
     * @param {number} t
     * @returns {number}
     */
    height(level, ground_y, x, z, t) {
        const ret = wasm.ocean_height(this.__wbg_ptr, level, ground_y, x, z, t);
        return ret;
    }
    /**
     * Fills the result row with `height` for each of the `n` points of the batch buffer.
     * @param {number} level
     */
    height_batch(level) {
        wasm.ocean_height_batch(this.__wbg_ptr, level);
    }
    constructor() {
        const ret = wasm.ocean_new();
        this.__wbg_ptr = ret;
        OceanFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * How many numbers `set_params` wants.
     * @returns {number}
     */
    static param_count() {
        const ret = wasm.ocean_param_count();
        return ret >>> 0;
    }
    /**
     * Loads the ocean numbers. The wave table is rebuilt only when a number that shapes it changed.
     * @param {Float64Array} params
     */
    set_params(params) {
        const ptr0 = passArrayF64ToWasm0(params, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.ocean_set_params(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * How much the whirlpools move the surface (m) at (x, z) and time `t`.
     * @param {number} x
     * @param {number} z
     * @param {number} t
     * @returns {number}
     */
    vortex_height(x, z, t) {
        const ret = wasm.ocean_vortex_height(this.__wbg_ptr, x, z, t);
        return ret;
    }
    /**
     * 0 where the ground is at the water level or above, 1 once the water is deep enough.
     * @param {number} level
     * @param {number} ground_y
     * @returns {number}
     */
    wave_fade(level, ground_y) {
        const ret = wasm.ocean_wave_fade(this.__wbg_ptr, level, ground_y);
        return ret;
    }
    /**
     * The wave table as 7 rows of 8 numbers (dx, dz, amp, freq, speed, pressure, phase), for checks.
     * @returns {Float64Array}
     */
    wave_table() {
        const ret = wasm.ocean_wave_table(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}
if (Symbol.dispose) Ocean.prototype[Symbol.dispose] = Ocean.prototype.free;

/**
 * The pair-push kernel `separate`, with its grid buffers. Two ways to feed it: slices (the bindings
 * copy them in and out) or the buffers inside the module's memory (`reserve`, the `*_ptr` getters, `run`).
 */
export class Separation {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SeparationFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_separation_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    alive_ptr() {
        const ret = wasm.separation_alive_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.separation_new();
        this.__wbg_ptr = ret;
        SeparationFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    radius_ptr() {
        const ret = wasm.separation_radius_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Makes room for `capacity` bodies in the module's own buffers. Fetch the pointers again afterwards.
     * @param {number} capacity
     */
    reserve(capacity) {
        wasm.separation_reserve(this.__wbg_ptr, capacity);
    }
    /**
     * Runs the kernel on the module's own buffers (filled by the caller through the pointers).
     * @param {number} count
     * @param {number} half
     * @param {number} widest
     */
    run(count, half, widest) {
        wasm.separation_run(this.__wbg_ptr, count, half, widest);
    }
    /**
     * Runs the kernel on slices: the bindings copy them in, and `x` and `z` back out.
     * @param {Float64Array} x
     * @param {Float64Array} z
     * @param {Float64Array} radius
     * @param {Uint8Array} alive
     * @param {number} count
     * @param {number} half
     * @param {number} widest
     */
    run_slices(x, z, radius, alive, count, half, widest) {
        var ptr0 = passArrayF64ToWasm0(x, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        var ptr1 = passArrayF64ToWasm0(z, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(radius, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(alive, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        wasm.separation_run_slices(this.__wbg_ptr, ptr0, len0, x, ptr1, len1, z, ptr2, len2, ptr3, len3, count, half, widest);
    }
    /**
     * @returns {number}
     */
    x_ptr() {
        const ret = wasm.separation_x_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    z_ptr() {
        const ret = wasm.separation_z_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) Separation.prototype[Symbol.dispose] = Separation.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_88899a52af046901: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./sim_core_bg.js": import0,
    };
}

const FlowSearchFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_flowsearch_free(ptr, 1));
const OceanFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ocean_free(ptr, 1));
const SeparationFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_separation_free(ptr, 1));

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('sim_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
