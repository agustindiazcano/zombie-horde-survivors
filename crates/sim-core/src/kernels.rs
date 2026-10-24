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

const FLOW_DX: [i32; 8] = [1, -1, 0, 0, 1, 1, -1, -1];
const FLOW_DZ: [i32; 8] = [0, 0, 1, -1, 1, -1, 1, -1];
const SQRT2: f64 = std::f64::consts::SQRT_2;
const FLOW_STEP: [f64; 8] = [1.0, 1.0, 1.0, 1.0, SQRT2, SQRT2, SQRT2, SQRT2];

/// The flow field search of `flowSearch` in `src/sim/kernels.ts`: Dijkstra over a grid with a binary
/// heap, identical tie-breaking. Fed through slices or through the buffers in the module's memory.
#[wasm_bindgen]
pub struct FlowSearch {
    heap_cost: Vec<f64>,
    heap_cell: Vec<i32>,
    cells: Vec<u8>,
    extra: Vec<f32>,
    dist: Vec<f64>,
    targets: Vec<i32>,
}

#[wasm_bindgen]
impl FlowSearch {
    #[wasm_bindgen(constructor)]
    pub fn new() -> FlowSearch {
        FlowSearch {
            heap_cost: Vec::new(),
            heap_cell: Vec::new(),
            cells: Vec::new(),
            extra: Vec::new(),
            dist: Vec::new(),
            targets: Vec::new(),
        }
    }

    /// Room for an `n` x `n` grid and `max_targets` targets in the module's own buffers.
    pub fn reserve(&mut self, n: usize, max_targets: usize) {
        self.cells.resize(n * n, 0);
        self.extra.resize(n * n, 0.0);
        self.dist.resize(n * n, 0.0);
        self.targets.resize(max_targets, 0);
    }

    pub fn cells_ptr(&mut self) -> *mut u8 {
        self.cells.as_mut_ptr()
    }
    pub fn extra_ptr(&mut self) -> *mut f32 {
        self.extra.as_mut_ptr()
    }
    pub fn dist_ptr(&mut self) -> *mut f64 {
        self.dist.as_mut_ptr()
    }
    pub fn targets_ptr(&mut self) -> *mut i32 {
        self.targets.as_mut_ptr()
    }

    /// Searches on the module's own buffers.
    pub fn run(&mut self, n: usize, target_count: usize) {
        let FlowSearch {
            heap_cost,
            heap_cell,
            cells,
            extra,
            dist,
            targets,
        } = self;
        flow_search(
            heap_cost,
            heap_cell,
            n,
            cells,
            extra,
            dist,
            targets,
            target_count,
        );
    }

    /// Searches on slices: the bindings copy them in and `dist` back out.
    pub fn run_slices(
        &mut self,
        n: usize,
        cells: &[u8],
        extra: &[f32],
        dist: &mut [f64],
        targets: &[i32],
        target_count: usize,
    ) {
        flow_search(
            &mut self.heap_cost,
            &mut self.heap_cell,
            n,
            cells,
            extra,
            dist,
            targets,
            target_count,
        );
    }
}

impl Default for FlowSearch {
    fn default() -> Self {
        FlowSearch::new()
    }
}

fn heap_push(cost_v: &mut Vec<f64>, cell_v: &mut Vec<i32>, cost: f64, cell: i32) {
    let mut i = cost_v.len();
    cost_v.push(cost);
    cell_v.push(cell);
    while i > 0 {
        let parent = (i - 1) >> 1;
        if cost_v[parent] <= cost {
            break;
        }
        cost_v[i] = cost_v[parent];
        cell_v[i] = cell_v[parent];
        i = parent;
    }
    cost_v[i] = cost;
    cell_v[i] = cell;
}

/// Removes the cheapest entry (the caller has read slot 0).
fn heap_pop(cost_v: &mut Vec<f64>, cell_v: &mut Vec<i32>) {
    let last_cost = cost_v.pop().unwrap();
    let last_cell = cell_v.pop().unwrap();
    let size = cost_v.len();
    if size == 0 {
        return;
    }
    let mut i = 0;
    loop {
        let mut child = 2 * i + 1;
        if child >= size {
            break;
        }
        if child + 1 < size && cost_v[child + 1] < cost_v[child] {
            child += 1;
        }
        if cost_v[child] >= last_cost {
            break;
        }
        cost_v[i] = cost_v[child];
        cell_v[i] = cell_v[child];
        i = child;
    }
    cost_v[i] = last_cost;
    cell_v[i] = last_cell;
}

#[allow(clippy::too_many_arguments)]
fn flow_search(
    heap_cost: &mut Vec<f64>,
    heap_cell: &mut Vec<i32>,
    n: usize,
    cells: &[u8],
    extra: &[f32],
    dist: &mut [f64],
    targets: &[i32],
    target_count: usize,
) {
    assert!(cells.len() >= n * n && extra.len() >= n * n && dist.len() >= n * n);
    assert!(targets.len() >= target_count);
    for d in dist[..n * n].iter_mut() {
        *d = f64::INFINITY;
    }
    heap_cost.clear();
    heap_cell.clear();
    for t in 0..target_count {
        let c = targets[t] as usize;
        if dist[c] == 0.0 {
            continue;
        }
        dist[c] = 0.0;
        heap_push(heap_cost, heap_cell, 0.0, c as i32);
    }
    let ni = n as i32;
    while !heap_cost.is_empty() {
        let cost = heap_cost[0];
        let cell = heap_cell[0] as usize;
        heap_pop(heap_cost, heap_cell);
        if cost > dist[cell] {
            continue;
        }
        let cx = (cell % n) as i32;
        let cz = ((cell - cell % n) / n) as i32;
        for k in 0..8 {
            let dx = FLOW_DX[k];
            let dz = FLOW_DZ[k];
            let nx = cx + dx;
            let nz = cz + dz;
            if nx < 0 || nz < 0 || nx >= ni || nz >= ni {
                continue;
            }
            let next = (nz * ni + nx) as usize;
            if cells[next] == 1 {
                continue;
            }
            if dx != 0
                && dz != 0
                && (cells[(cz * ni + nx) as usize] != 0 || cells[(nz * ni + cx) as usize] != 0)
            {
                continue;
            }
            let total = cost + FLOW_STEP[k] + extra[next] as f64;
            if total < dist[next] {
                dist[next] = total;
                heap_push(heap_cost, heap_cell, total, next as i32);
            }
        }
    }
}

/// `resolveWalls` of `src/sim/kernels.ts`: the obstacles as flat arrays and a CSR grid (uploaded once
/// per obstacle list with `set_obstacles`), then batches of circles pushed out of them in the same
/// order as the TypeScript. `Math.sign(v || 1)` of the TypeScript is `sign_or_one`.
#[wasm_bindgen]
pub struct Walls {
    n: usize,
    half: f64,
    count: usize,
    x: Vec<f64>,
    z: Vec<f64>,
    half_w: Vec<f64>,
    half_d: Vec<f64>,
    top: Vec<f64>,
    cell_start: Vec<i32>,
    cell_items: Vec<i32>,
    seen: Vec<u32>,
    stamp: u32,
    /// The id of the obstacle set held (the TypeScript `FlatObstacles.id`), so the caller uploads once.
    id: i64,
}

fn sign_or_one(v: f64) -> f64 {
    if v > 0.0 {
        1.0
    } else if v < 0.0 {
        -1.0
    } else {
        1.0
    }
}

#[wasm_bindgen]
impl Walls {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Walls {
        Walls {
            n: 0,
            half: 0.0,
            count: 0,
            x: Vec::new(),
            z: Vec::new(),
            half_w: Vec::new(),
            half_d: Vec::new(),
            top: Vec::new(),
            cell_start: Vec::new(),
            cell_items: Vec::new(),
            seen: Vec::new(),
            stamp: 0,
            id: -1,
        }
    }

    /// The id of the obstacle set held, or -1.
    pub fn id(&self) -> f64 {
        self.id as f64
    }

    /// Takes a copy of an obstacle set (the arrays of the TypeScript `FlatObstacles`).
    #[allow(clippy::too_many_arguments)]
    pub fn set_obstacles(
        &mut self,
        id: f64,
        n: usize,
        half: f64,
        count: usize,
        x: &[f64],
        z: &[f64],
        half_w: &[f64],
        half_d: &[f64],
        top: &[f64],
        cell_start: &[i32],
        cell_items: &[i32],
    ) {
        self.id = id as i64;
        self.n = n;
        self.half = half;
        self.count = count;
        self.x = x.to_vec();
        self.z = z.to_vec();
        self.half_w = half_w.to_vec();
        self.half_d = half_d.to_vec();
        self.top = top.to_vec();
        self.cell_start = cell_start.to_vec();
        self.cell_items = cell_items.to_vec();
        self.seen = vec![0; count];
        self.stamp = 0;
    }

    /// Pushes each living circle out of the obstacles and keeps it in the arena; `x` and `z` come back.
    #[allow(clippy::too_many_arguments)]
    pub fn run_slices(
        &mut self,
        x: &mut [f64],
        z: &mut [f64],
        radius: &[f64],
        feet: &[f64],
        alive: &[u8],
        count: usize,
        step_up: f64,
    ) {
        assert!(x.len() >= count && z.len() >= count);
        assert!(radius.len() >= count && feet.len() >= count && alive.len() >= count);
        let n = self.n;
        let half = self.half;
        for i in 0..count {
            if alive[i] == 0 {
                continue;
            }
            let mut px = x[i];
            let mut pz = z[i];
            let r = radius[i];
            let lift = feet[i] + step_up;
            if self.count > 0 {
                if self.stamp == u32::MAX {
                    for s in self.seen.iter_mut() {
                        *s = 0;
                    }
                    self.stamp = 0;
                }
                self.stamp += 1;
                let stamp = self.stamp;
                let x0 = cell_of(half, n, px - r);
                let x1 = cell_of(half, n, px + r);
                let z0 = cell_of(half, n, pz - r);
                let z1 = cell_of(half, n, pz + r);
                for cz in z0..=z1 {
                    for cx in x0..=x1 {
                        let c = cz * n + cx;
                        for k in self.cell_start[c]..self.cell_start[c + 1] {
                            let b = self.cell_items[k as usize] as usize;
                            if self.seen[b] == stamp {
                                continue;
                            }
                            self.seen[b] = stamp;
                            if self.top[b] <= lift {
                                continue;
                            }
                            let bx = self.x[b];
                            let bz = self.z[b];
                            let hw = self.half_w[b];
                            let hd = self.half_d[b];
                            let qx = (px.max(bx - hw)).min(bx + hw);
                            let qz = (pz.max(bz - hd)).min(bz + hd);
                            let dx = px - qx;
                            let dz = pz - qz;
                            let d2 = dx * dx + dz * dz;
                            if d2 >= r * r {
                                continue;
                            }
                            if d2 > 1e-12 {
                                let d = d2.sqrt();
                                let push = (r - d) / d;
                                px += dx * push;
                                pz += dz * push;
                                continue;
                            }
                            let ox = hw - (px - bx).abs();
                            let oz = hd - (pz - bz).abs();
                            if ox < oz {
                                px = bx + sign_or_one(px - bx) * (hw + r);
                            } else {
                                pz = bz + sign_or_one(pz - bz) * (hd + r);
                            }
                        }
                    }
                }
            }
            let lim = half - r;
            x[i] = px.max(-lim).min(lim);
            z[i] = pz.max(-lim).min(lim);
        }
    }
}

impl Default for Walls {
    fn default() -> Self {
        Walls::new()
    }
}

/// `hypot` of `src/sim/vec.ts`: scaled by the larger value, Kahan-summed squares, then `sqrt`. Only
/// `+ - * /` and `sqrt`, which are exactly rounded, so it gives the TypeScript's bits (and V8's `Math.hypot`).
pub fn hypot(a: f64, b: f64) -> f64 {
    let x = a.abs();
    let y = b.abs();
    let max = if x > y { x } else { y };
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if max == 0.0 {
        return 0.0;
    }
    if x.is_nan() || y.is_nan() {
        return f64::NAN;
    }
    let n = x / max;
    let sum = n * n;
    let n = y / max;
    let summand = n * n;
    (sum + summand).sqrt() * max
}

/// `hypot3` of `src/sim/vec.ts` (full Kahan summation).
pub fn hypot3(a: f64, b: f64, c: f64) -> f64 {
    let x = a.abs();
    let y = b.abs();
    let w = c.abs();
    let mut max = if x > y { x } else { y };
    if w > max {
        max = w;
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if max == 0.0 {
        return 0.0;
    }
    if x.is_nan() || y.is_nan() || w.is_nan() {
        return f64::NAN;
    }
    let mut sum = 0.0;
    let mut compensation = 0.0;
    for v in [x, y, w] {
        let n = v / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = preliminary - sum - summand;
        sum = preliminary;
    }
    f64::sqrt(sum) * max
}

#[wasm_bindgen]
pub fn sim_hypot(a: f64, b: f64) -> f64 {
    hypot(a, b)
}

#[wasm_bindgen]
pub fn sim_hypot3(a: f64, b: f64, c: f64) -> f64 {
    hypot3(a, b, c)
}

// The standard library maths as the WebAssembly build computes them (for `check:kernels`: do they match V8?).
#[wasm_bindgen]
pub fn sim_sin(a: f64) -> f64 {
    a.sin()
}
#[wasm_bindgen]
pub fn sim_cos(a: f64) -> f64 {
    a.cos()
}
#[wasm_bindgen]
pub fn sim_atan2(y: f64, x: f64) -> f64 {
    y.atan2(x)
}
#[wasm_bindgen]
pub fn sim_pow(a: f64, b: f64) -> f64 {
    a.powf(b)
}
#[wasm_bindgen]
pub fn sim_exp(a: f64) -> f64 {
    a.exp()
}
#[wasm_bindgen]
pub fn sim_ln(a: f64) -> f64 {
    a.ln()
}
