import type { Settings } from './settings';

/**
 * The registry of graphics options: what each one is called, which values it has and **what each
 * value costs** (see docs/PLAN-graphics-settings.md). The settings window and the cost bars read
 * this table; `settings.ts` keeps the saved values and the presets. No Three.js or DOM here.
 *
 * Costs are estimates by reasoning (draw calls, fragment work, memory), not measurements:
 * `gpu` and `cpu` go from 0 (free) to 5 (the heaviest thing in the game), `vram` is megabytes.
 * "Measure my machine" in the window replaces the estimates with this machine's own numbers.
 */
export interface Cost {
  gpu: number;
  cpu: number;
  vram: number;
}

export type GroupId = 'light' | 'water' | 'sky' | 'surfaces' | 'effects' | 'performance';

export const GROUPS: { id: GroupId; label: string; blurb: string }[] = [
  { id: 'performance', label: 'Performance', blurb: 'Resolution, anti-aliasing and limits' },
  { id: 'light', label: 'Light and shadows', blurb: 'Shadows, tone mapping, dynamic lights' },
  { id: 'water', label: 'Water', blurb: 'Waves, mirror, ice' },
  { id: 'sky', label: 'Sky and weather', blurb: 'Clouds, rain, snow, fog, lightning' },
  { id: 'surfaces', label: 'Surfaces', blurb: 'Textures, depth, ground detail' },
  { id: 'effects', label: 'Effects', blurb: 'Blood and gibs' },
];

/** The saved graphics values that have a registry entry. */
export type GraphicsKey = {
  [K in keyof Settings]: Settings[K] extends number | boolean ? K : never;
}[keyof Settings];

export interface Choice {
  value: number | boolean;
  label: string;
  cost: Cost;
}

export interface GraphicsOption {
  key: GraphicsKey;
  label: string;
  group: GroupId;
  /** One line: what it does. */
  help: string;
  /** What bears the cost, shown in the tooltip. */
  note: string;
  /** Pick from a list of values... */
  choices?: Choice[];
  /** ...or drag a slider (the cost is a function of the value). */
  slider?: {
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    cost: (v: number) => Cost;
  };
  /** False when the option does nothing in the current state (its cost then counts as zero). */
  active?: (s: Settings) => boolean;
  /** A change only shows after the page is reloaded. */
  restart?: boolean;
}

const cost = (gpu: number, cpu = 0, vram = 0): Cost => ({ gpu, cpu, vram });
const choice = (value: number | boolean, label: string, c: Cost): Choice => ({
  value,
  label,
  cost: c,
});
const OFF = cost(0);

export const OPTIONS: GraphicsOption[] = [
  {
    key: 'resolutionScale',
    label: 'Resolution',
    group: 'performance',
    help: 'How many pixels the game draws, as a share of the screen. Lower is blocky but much faster.',
    note: 'GPU fill rate: the cost grows with the square of the scale.',
    slider: {
      min: 0.25,
      max: 2,
      step: 0.05,
      format: (v) => `${Math.round(v * 100)}%`,
      cost: (v) => cost(Math.min(5, Math.round(v * v * 2.2)), 0, Math.round(v * v * 40)),
    },
  },
  {
    key: 'shadows',
    label: 'Shadows',
    group: 'light',
    help: 'Shadows from the sun and the moon.',
    note: 'GPU: the scene is drawn once more from the light.',
    choices: [choice(false, 'Off', OFF), choice(true, 'On', cost(2, 1))],
  },
  {
    key: 'shadowMapSize',
    label: 'Shadow sharpness',
    group: 'light',
    help: 'Resolution of the shadow map. Bigger is sharper and uses more video memory.',
    note: 'GPU fill and VRAM (a 32-bit depth map: 16, 64 or 256 MB).',
    active: (s) => s.shadows,
    choices: [
      choice(1024, 'Low (1K)', cost(1, 0, 16)),
      choice(2048, 'Medium (2K)', cost(2, 0, 64)),
      choice(4096, 'High (4K)', cost(3, 0, 256)),
    ],
  },
  {
    key: 'filmic',
    label: 'Filmic tone mapping',
    group: 'light',
    help: 'Bright colours roll off smoothly instead of clipping to flat white.',
    note: 'GPU: almost free.',
    choices: [choice(false, 'Off', OFF), choice(true, 'On', cost(0))],
  },
  {
    key: 'water',
    label: 'Water',
    group: 'water',
    help: 'How much of the map’s water look is drawn: ripples, caustics, parallax, neon glints.',
    note: 'GPU fragment work per pixel of water; the big waves always cost a little vertex work.',
    choices: [
      choice(0, 'Flat (big waves only)', cost(1)),
      choice(1, 'Light (ripples)', cost(2)),
      choice(2, 'Normal (caustics, few orbs)', cost(3)),
      choice(3, 'Full (every optic of the map)', cost(4)),
    ],
  },
  {
    key: 'reflect',
    label: 'Water reflection',
    group: 'water',
    help: 'A mirror of the whole world on the sea.',
    note: 'GPU and CPU: the scene is drawn a second time, so draw calls double.',
    active: (s) => s.water > 0,
    choices: [
      choice(0, 'Sky colour only', OFF),
      choice(1, 'Mirror, half size', cost(3, 3, 32)),
      choice(2, 'Mirror, full size', cost(4, 3, 128)),
    ],
  },
  {
    key: 'clouds',
    label: 'Sky clouds',
    group: 'sky',
    help: 'Flat puffs, or clouds drawn volumetrically in the sky (more octaves, more detail).',
    note: 'GPU fragment work on every sky pixel (3 to 5 noise octaves, two samples).',
    choices: [
      choice(0, 'Simple puffs', OFF),
      choice(1, 'Volumetric, light', cost(1)),
      choice(2, 'Volumetric, normal', cost(2)),
      choice(3, 'Volumetric, fine', cost(4)),
    ],
  },
  {
    key: 'rainFx',
    label: 'Rain detail',
    group: 'sky',
    help: 'Streaks round the camera, wet ground and rings where drops land on the ground and the sea.',
    note: 'GPU: ring noise on the ground and the water while it rains.',
    choices: [choice(false, 'Simple lines', OFF), choice(true, 'Streaks and rings', cost(1))],
  },
  {
    key: 'lens',
    label: 'Rain on the camera lens',
    group: 'sky',
    help: 'Drops of water on the lens that bend the picture.',
    note: 'GPU: one frame copy and a full-screen noise pass (only while it rains).',
    choices: [
      choice(0, 'Off', OFF),
      choice(1, 'Drops that swell and dry', cost(2, 0, 16)),
      choice(2, 'Plus running drops', cost(3, 0, 16)),
    ],
  },
  {
    key: 'parallax',
    label: 'Surface depth',
    group: 'surfaces',
    help: 'Carved walls and cobbles that look deep (parallax occlusion mapping).',
    note: 'GPU fragment: several texture lookups per pixel on those surfaces.',
    choices: [
      choice(0, 'Off', OFF),
      choice(1, 'Light', cost(1)),
      choice(2, 'Full, with shadows', cost(3)),
      choice(3, 'Ultra, finest', cost(4)),
    ],
  },
  {
    key: 'textures',
    label: 'Textures',
    group: 'surfaces',
    help: 'Detail of the surface pictures. Ultra needs a bigger download.',
    note: 'Video memory and bandwidth.',
    choices: [
      choice(0, 'Melted', cost(0, 0, 20)),
      choice(1, 'Low', cost(0, 0, 60)),
      choice(2, 'Normal', cost(1, 0, 140)),
      choice(3, 'Ultra', cost(1, 0, 560)),
    ],
  },
  {
    key: 'lights',
    label: 'Dynamic lights from the sea',
    group: 'light',
    help: 'How many of the sea’s neon orbs also light the ground, the trees and the units.',
    note: 'GPU: every dynamic light is paid for on every lit pixel.',
    active: (s) => s.water >= 3,
    choices: [
      choice(0, 'None (the orbs only glow)', OFF),
      choice(4, 'Up to 4', cost(2)),
      choice(8, 'Up to 8', cost(4)),
    ],
  },
  {
    key: 'ice',
    label: 'Ice detail',
    group: 'water',
    help: 'On a frozen sea: a flat colour, or cracks, milky patches and bubbles at depth.',
    note: 'GPU fragment: fractal noise, cracks and bubble layers on every ice pixel.',
    active: (s) => s.water > 0,
    choices: [
      choice(0, 'Flat colour', OFF),
      choice(1, 'Noisy surface and cracks', cost(1)),
      choice(2, 'Plus bubbles', cost(2)),
      choice(3, 'Plus deeper bubbles', cost(3)),
    ],
  },
  {
    key: 'snow',
    label: 'Snow on surfaces',
    group: 'sky',
    help: 'Snow settles on everything that faces the sky (a shader on every material, no particles).',
    note: 'GPU: a few noise lookups on every lit pixel while snow lies.',
    choices: [choice(false, 'Off', OFF), choice(true, 'On', cost(1))],
  },
  {
    key: 'fog',
    label: 'Fog',
    group: 'sky',
    help: 'Height fog: weather fog, sand and snow haze, and the soft horizon.',
    note: 'GPU: a little work on every pixel.',
    choices: [choice(false, 'Off (clear air)', OFF), choice(true, 'On', cost(1))],
  },
  {
    key: 'lightning',
    label: 'Lightning',
    group: 'sky',
    help: 'Storm flashes. The bolt itself can be hidden, or lightning left out altogether (also for light-sensitive players).',
    note: 'GPU: the flash lights the sky and the scene for a moment.',
    choices: [
      choice(0, 'Off', OFF),
      choice(1, 'Flash only', cost(1)),
      choice(2, 'Flash and bolt', cost(1)),
    ],
  },
  {
    key: 'groundDetail',
    label: 'Ground detail',
    group: 'surfaces',
    help: 'Colour noise and rock on the terrain, and the shadows of moving clouds.',
    note: 'GPU fragment: value noise at four sizes, and a cloud noise cast along the sun.',
    choices: [
      choice(0, 'Plain painted ground', OFF),
      choice(1, 'Colour noise and rock', cost(1)),
      choice(2, 'Plus cloud shadows', cost(2)),
    ],
  },
  {
    key: 'gore',
    label: 'Blood and gibs',
    group: 'effects',
    help: 'Enemies burst into blood and pieces when they die.',
    note: 'CPU for the particles and the pooled pieces, a little GPU.',
    choices: [choice(false, 'Off', OFF), choice(true, 'On', cost(1, 1))],
  },
];

/** The registry entry of a saved value, if it has one. */
export const optionOf = (key: GraphicsKey): GraphicsOption | undefined =>
  OPTIONS.find((o) => o.key === key);

/** What the current value of `option` costs (zero when the option is not active). */
export function costOfOption(option: GraphicsOption, s: Settings): Cost {
  if (option.active && !option.active(s)) return OFF;
  const value = s[option.key];
  if (option.slider) return option.slider.cost(value as number);
  return (option.choices?.find((c) => c.value === value) ?? option.choices?.[0])?.cost ?? OFF;
}

const worst = (option: GraphicsOption): Cost => {
  const all = option.slider
    ? [option.slider.cost(option.slider.max)]
    : (option.choices ?? []).map((c) => c.cost);
  return all.reduce(
    (a, b) => ({
      gpu: Math.max(a.gpu, b.gpu),
      cpu: Math.max(a.cpu, b.cpu),
      vram: Math.max(a.vram, b.vram),
    }),
    OFF,
  );
};

export interface Total {
  gpu: number;
  cpu: number;
  vram: number;
  /** Each as a share (0 to 1) of every option at its heaviest value. */
  gpuShare: number;
  cpuShare: number;
  vramShare: number;
  label: 'Light' | 'Medium' | 'Heavy' | 'Very heavy';
}

const wordOf = (share: number): Total['label'] =>
  share < 0.25 ? 'Light' : share < 0.5 ? 'Medium' : share < 0.75 ? 'Heavy' : 'Very heavy';

/** The sum of every option's cost for these settings, and as a share of the heaviest possible. */
export function totalCost(s: Settings): Total {
  let gpu = 0;
  let cpu = 0;
  let vram = 0;
  let gpuMax = 0;
  let cpuMax = 0;
  let vramMax = 0;
  for (const o of OPTIONS) {
    const c = costOfOption(o, s);
    const w = worst(o);
    gpu += c.gpu;
    cpu += c.cpu;
    vram += c.vram;
    gpuMax += w.gpu;
    cpuMax += w.cpu;
    vramMax += w.vram;
  }
  const gpuShare = gpuMax ? gpu / gpuMax : 0;
  const cpuShare = cpuMax ? cpu / cpuMax : 0;
  const vramShare = vramMax ? vram / vramMax : 0;
  return {
    gpu,
    cpu,
    vram,
    gpuShare,
    cpuShare,
    vramShare,
    label: wordOf(Math.max(gpuShare, cpuShare)),
  };
}
