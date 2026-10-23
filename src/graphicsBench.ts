import { OPTIONS, type GraphicsOption } from './graphicsOptions';
import { PRESETS, type Settings } from './settings';

/**
 * "Measure my machine" (stage 2 of docs/PLAN-graphics-settings.md): for every graphics option that
 * is active, draw the frame that is on screen with each of its values and time it. The cost of a
 * value is what it adds over the cheapest value of the same option. Times are split into
 * **CPU** (how long the call that submits the frame takes) and **GPU** (the rest, until the card
 * says it finished: `gl.finish`). This is an approximation: it does not use timer queries, and it
 * measures the scene shown at that moment, so an effect that is not visible (rain on a dry day, ice
 * on an unfrozen sea) measures as free. No Three.js or DOM here: the renderer is behind `Probe`.
 */
export interface Probe {
  /** Applies these settings to the renderer (for one measurement). */
  apply(settings: Settings): void;
  /** Draws one frame and returns the milliseconds of the submit call and of the whole frame. */
  time(): { cpu: number; total: number };
}

export interface Sample {
  /** The option's value, as text (booleans and numbers alike). */
  value: string;
  cpuMs: number;
  gpuMs: number;
}

export interface Measurement {
  /** When it was taken (ms since 1970). */
  at: number;
  /** The settings the machine was in while measuring: the base of every prediction. */
  base: Settings;
  baseCpuMs: number;
  baseGpuMs: number;
  /** Per option key: the samples of each value measured. */
  options: Record<string, Sample[]>;
}

const KEY = 'zombie-horde-survivors.graphics-measure';
const WARMUP = 4;
const FRAMES = 14;
/** One bar of a chip is this many milliseconds. */
export const MS_PER_BAR = 1.5;
/** The frame time of 60 frames per second. */
export const FRAME_60 = 1000 / 60;

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;

function sampleFrames(probe: Probe): { cpu: number; gpu: number } {
  for (let i = 0; i < WARMUP; i++) probe.time();
  const cpu: number[] = [];
  const gpu: number[] = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = probe.time();
    cpu.push(t.cpu);
    gpu.push(Math.max(0, t.total - t.cpu));
  }
  return { cpu: median(cpu), gpu: median(gpu) };
}

/** The values of an option worth measuring (a slider is sampled at a few points). */
function valuesOf(o: GraphicsOption): (number | boolean)[] {
  if (o.slider) return o.slider.samples ?? [o.slider.min, o.slider.max];
  return (o.choices ?? []).map((c) => c.value);
}

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Measures every active, measurable option with every value, then puts the renderer back as it was.
 * `progress` is called after each value with (done, total).
 */
export async function measureAll(
  settings: Settings,
  probe: Probe,
  progress: (done: number, total: number) => void,
): Promise<Measurement> {
  const todo = OPTIONS.filter((o) => o.measure !== false && (!o.active || o.active(settings)));
  const total = todo.reduce((n, o) => n + valuesOf(o).length, 0);
  probe.apply(settings);
  await yieldToUi();
  const base = sampleFrames(probe);
  const result: Measurement = {
    at: Date.now(),
    base: { ...settings },
    baseCpuMs: base.cpu,
    baseGpuMs: base.gpu,
    options: {},
  };
  let done = 0;
  try {
    for (const o of todo) {
      const samples: Sample[] = [];
      for (const v of valuesOf(o)) {
        probe.apply({ ...settings, [o.key]: v });
        await yieldToUi();
        const t = sampleFrames(probe);
        samples.push({ value: String(v), cpuMs: t.cpu, gpuMs: t.gpu });
        progress(++done, total);
      }
      result.options[o.key] = samples;
    }
  } finally {
    probe.apply(settings);
  }
  return result;
}

/** What `value` of `option` adds over its cheapest measured value (ms), or null if it was not measured. */
export function measuredMs(
  m: Measurement,
  option: GraphicsOption,
  value: number | boolean,
): { cpuMs: number; gpuMs: number } | null {
  const samples = m.options[option.key];
  if (!samples || samples.length === 0) return null;
  const at = samples.find((s) => s.value === String(value));
  if (!at) {
    // A slider between two samples: take the nearest one.
    if (typeof value !== 'number') return null;
    const near = samples.reduce((a, b) =>
      Math.abs(Number(b.value) - value) < Math.abs(Number(a.value) - value) ? b : a,
    );
    return measuredMsOf(samples, near);
  }
  return measuredMsOf(samples, at);
}

function measuredMsOf(samples: Sample[], at: Sample): { cpuMs: number; gpuMs: number } {
  const minCpu = Math.min(...samples.map((s) => s.cpuMs));
  const minGpu = Math.min(...samples.map((s) => s.gpuMs));
  return { cpuMs: Math.max(0, at.cpuMs - minCpu), gpuMs: Math.max(0, at.gpuMs - minGpu) };
}

/** The frame time (ms) predicted for `settings`: the measured base, moved by each option's change since. */
export function predictMs(m: Measurement, settings: Settings): { cpuMs: number; gpuMs: number } {
  let cpuMs = m.baseCpuMs;
  let gpuMs = m.baseGpuMs;
  for (const o of OPTIONS) {
    const now = measuredMs(m, o, settings[o.key] as number | boolean);
    const then = measuredMs(m, o, m.base[o.key] as number | boolean);
    if (!now || !then) continue;
    const live = !o.active || o.active(settings);
    const wasLive = !o.active || o.active(m.base);
    cpuMs += (live ? now.cpuMs : 0) - (wasLive ? then.cpuMs : 0);
    gpuMs += (live ? now.gpuMs : 0) - (wasLive ? then.gpuMs : 0);
  }
  return { cpuMs: Math.max(0.1, cpuMs), gpuMs: Math.max(0.1, gpuMs) };
}

/** The heaviest preset predicted to run at 60 frames per second (the Toaster when none does). */
export function recommend(
  m: Measurement,
  settings: Settings,
): Exclude<Settings['quality'], 'custom'> {
  for (const name of ['ultra', 'high', 'medium', 'low'] as const) {
    const p = predictMs(m, { ...settings, ...PRESETS[name] });
    // The CPU and the GPU work in parallel, so the slower of the two sets the frame.
    if (Math.max(p.cpuMs, p.gpuMs) <= FRAME_60 * 0.9) return name;
  }
  return 'toaster';
}

export function loadMeasurement(): Measurement | null {
  try {
    const text = localStorage.getItem(KEY);
    return text ? (JSON.parse(text) as Measurement) : null;
  } catch {
    return null;
  }
}

export function saveMeasurement(m: Measurement | null): void {
  try {
    if (m) localStorage.setItem(KEY, JSON.stringify(m));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable; the measurement then lasts until the page closes.
  }
}
