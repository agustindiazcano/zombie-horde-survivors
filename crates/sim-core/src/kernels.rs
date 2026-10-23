//! Rust copies of the flat kernels of `src/sim/kernels.ts`. Same order of iteration, same operations
//! (`+ - * /`, `sqrt`, `min`, `max`, `floor`, `ceil`), all in `f64`: the results match the TypeScript
//! bit for bit (`npm run check:kernels`). No fused multiply-add: LLVM does not contract float
//! operations unless asked to.

use wasm_bindgen::prelude::*;

const CELL: f64 = 4.0;

fn cell_of(half: f64, n: usize, v: f64) -> usize {
    let c = ((v + half) / CELL).floor().max(0.0).min((n - 1) as f64);
    c as usize
}

/// The pair-push kernel `separate`, with its grid buffers. Two ways to feed it: slices (the bindings
/// copy them in and out) or the buffers inside the module's memory (`reserve`, the `*_ptr` getters, `run`).
#[wasm_bindgen]
pub struct Separation {
    head: Vec<i32>,
    next: Vec<i32>,
    x: Vec<f64>,
    z: Vec<f64>,
    radius: Vec<f64>,
    alive: Vec<u8>,
}

#[wasm_bindgen]
impl Separation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Separation {
        Separation {
            head: Vec::new(),
            next: Vec::new(),
            x: Vec::new(),
            z: Vec::new(),
            radius: Vec::new(),
            alive: Vec::new(),
        }
    }

    /// Makes room for `capacity` bodies in the module's own buffers. Fetch the pointers again afterwards.
    pub fn reserve(&mut self, capacity: usize) {
        self.x.resize(capacity, 0.0);
        self.z.resize(capacity, 0.0);
        self.radius.resize(capacity, 0.0);
        self.alive.resize(capacity, 0);
    }

    pub fn x_ptr(&mut self) -> *mut f64 {
        self.x.as_mut_ptr()
    }
    pub fn z_ptr(&mut self) -> *mut f64 {
        self.z.as_mut_ptr()
    }
    pub fn radius_ptr(&mut self) -> *mut f64 {
        self.radius.as_mut_ptr()
    }
    pub fn alive_ptr(&mut self) -> *mut u8 {
        self.alive.as_mut_ptr()
    }

    /// Runs the kernel on the module's own buffers (filled by the caller through the pointers).
    pub fn run(&mut self, count: usize, half: f64, widest: f64) {
        let Separation {
            head,
            next,
            x,
            z,
            radius,
            alive,
        } = self;
        separate(head, next, x, z, radius, alive, count, half, widest);
    }

    /// Runs the kernel on slices: the bindings copy them in, and `x` and `z` back out.
    pub fn run_slices(
        &mut self,
        x: &mut [f64],
        z: &mut [f64],
        radius: &[f64],
        alive: &[u8],
        count: usize,
        half: f64,
        widest: f64,
    ) {
        separate(
            &mut self.head,
            &mut self.next,
            x,
            z,
            radius,
            alive,
            count,
            half,
            widest,
        );
    }
}

impl Default for Separation {
    fn default() -> Self {
        Separation::new()
    }
}

/// See `separate` in `src/sim/kernels.ts`.
#[allow(clippy::too_many_arguments)]
fn separate(
    head: &mut Vec<i32>,
    next: &mut Vec<i32>,
    x: &mut [f64],
    z: &mut [f64],
    radius: &[f64],
    alive: &[u8],
    count: usize,
    half: f64,
    widest: f64,
) {
    assert!(x.len() >= count && z.len() >= count && radius.len() >= count && alive.len() >= count);
    let n = ((half * 2.0) / CELL).ceil() as usize + 1;
    if head.len() < n * n {
        head.resize(n * n, -1);
    }
    if next.len() < count {
        next.resize(count, -1);
    }
    for h in head[..n * n].iter_mut() {
        *h = -1;
    }
    for i in (0..count).rev() {
        if alive[i] == 0 {
            continue;
        }
        let cell = cell_of(half, n, z[i]) * n + cell_of(half, n, x[i]);
        next[i] = head[cell];
        head[cell] = i as i32;
    }
    for i in 0..count {
        if alive[i] == 0 {
            continue;
        }
        let ri = radius[i];
        let range = ((ri + widest) / CELL).ceil() as i64;
        let cx = cell_of(half, n, x[i]) as i64;
        let cz = cell_of(half, n, z[i]) as i64;
        let last = n as i64 - 1;
        let z0 = (cz - range).max(0);
        let z1 = (cz + range).min(last);
        let x0 = (cx - range).max(0);
        let x1 = (cx + range).min(last);
        for gz in z0..=z1 {
            for gx in x0..=x1 {
                // SAFETY: cells are clamped to 0..n and every filed index is below `count`, which the
                // caller guarantees fits all four arrays.
                unsafe {
                    let mut j = *head.get_unchecked((gz as usize) * n + gx as usize);
                    while j != -1 {
                        let ju = j as usize;
                        if ju > i {
                            let min_dist = ri + *radius.get_unchecked(ju);
                            let mut dx = *x.get_unchecked(ju) - *x.get_unchecked(i);
                            let mut dz = *z.get_unchecked(ju) - *z.get_unchecked(i);
                            let d2 = dx * dx + dz * dz;
                            if d2 < min_dist * min_dist {
                                let mut d = d2.sqrt();
                                if d < 1e-6 {
                                    dx = 1.0;
                                    dz = 0.0;
                                    d = 1.0;
                                }
                                let push = (min_dist - d2.sqrt()) / 2.0;
                                let nx = dx / d;
                                let nz = dz / d;
                                *x.get_unchecked_mut(i) -= nx * push;
                                *z.get_unchecked_mut(i) -= nz * push;
                                *x.get_unchecked_mut(ju) += nx * push;
                                *z.get_unchecked_mut(ju) += nz * push;
                            }
                        }
                        j = *next.get_unchecked(ju);
                    }
                }
            }
        }
    }
}
