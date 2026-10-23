/* @ts-self-types="./sim_core.d.ts" */

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
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
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

const OceanFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ocean_free(ptr, 1));

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
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

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
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
    cachedFloat64ArrayMemory0 = null;
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
