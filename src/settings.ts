/** Player-facing options, kept in the browser (localStorage). No Three.js or DOM here. */
export type Quality = 'toaster' | 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface Settings {
  /** Preset name, or 'custom' once any graphics option is changed by hand. */
  quality: Quality;
  shadows: boolean;
  /** Shadow map resolution in pixels (square). */
  shadowMapSize: number;
  /** Fraction of the screen's full pixel density the game renders at (0.25 to 1; the Toaster preset goes below the old 0.5 floor). */
  resolutionScale: number;
  /** Share of the game's resolution the enemies and the other characters are drawn at (0.25 to 1). */
  resolutionNpc: number;
  /** The same for the enemies alone; they take the lower of this and `resolutionNpc`. */
  resolutionEnemies: number;
  /** The same for the water. */
  resolutionWater: number;
  /** Blood and gibs when enemies burst. */
  gore: boolean;
  /** Depth of carved surfaces (parallax occlusion mapping): 0 off, 1 light, 2 full with sun shadows. */
  parallax: number;
  /** Detail of the surface textures: 0 melted, 1 low, 2 normal, 3 ultra (sharper, bigger files). */
  textures: number;
  /** How much of the wave ocean is drawn: 0 flat, 1 light, 2 normal, 3 full (every optic the map sets). */
  water: number;
  /** Rain streaks and rings where the drops land on the ground and the water. */
  rainFx: boolean;
  /** Volumetric sky clouds: 0 simple puffs, 1 to 3 the noise clouds with more detail at each step. */
  clouds: number;
  /** Filmic tone mapping: bright colours roll off instead of clipping to flat white. */
  filmic: boolean;
  /** Mirror of the world on the ocean (a second render of the scene): 0 off, 1 half size, 2 full size. */
  reflect: number;
  /** Rain on the camera lens: 0 off, 1 drops that swell and dry, 2 plus running drops (copies the frame once). */
  lens: number;
  /** Snow settling on every surface that faces the sky. */
  snow: boolean;
  /** Ground detail: 0 the plain painted ground, 1 colour noise and rock, 2 plus moving cloud shadows. */
  groundDetail: number;
  /** Height fog (weather and the horizon haze). */
  fog: boolean;
  /** Lightning: 0 none, 1 the flash only, 2 the flash and the bolt. */
  lightning: number;
  /** The most neon orbs of the sea that also cast real light: 0, 4 or 8. */
  lights: number;
  /** Detail of ice on a frozen sea: 0 flat colour to 3 cracks and deep bubbles. */
  ice: number;
  /** Anti-aliasing (smooth edges). Only read when the renderer is created, so a change needs a reload. */
  antialias: boolean;
  /** How far the camera sees: 0 near, 1 normal, 2 far. Matters on big maps. */
  drawDistance: number;
  /** Share of the weather particles (rain, snow, sand) drawn: 0.25, 0.5 or 1. */
  particles: number;
  /** Field of view as a multiple of each view's own (0.8 to 1.3). */
  fov: number;
  /** Frame-rate limit: 0 none, or 30, 60 or 120 frames per second. */
  fpsCap: number;
  /** Dim lighting with a flashlight per soldier. */
  darkMode: boolean;
  showFps: boolean;
  /** Aim with one right click on, another off (instead of holding the button). */
  aimToggle: boolean;
  /** Sound effects volume, 0 to 1. */
  volume: number;
}

type GraphicsFields = Pick<
  Settings,
  | 'shadows'
  | 'shadowMapSize'
  | 'resolutionScale'
  | 'resolutionNpc'
  | 'resolutionEnemies'
  | 'resolutionWater'
  | 'gore'
  | 'parallax'
  | 'textures'
  | 'water'
  | 'rainFx'
  | 'clouds'
  | 'filmic'
  | 'reflect'
  | 'lens'
  | 'snow'
  | 'groundDetail'
  | 'fog'
  | 'lightning'
  | 'lights'
  | 'ice'
  | 'antialias'
  | 'drawDistance'
  | 'particles'
  | 'fov'
  | 'fpsCap'
>;

export const PRESETS: Record<'toaster' | 'low' | 'medium' | 'high' | 'ultra', GraphicsFields> = {
  // For machines that struggle: a third of the pixels each way, drawn blocky, no shadows or depth.
  toaster: {
    shadows: false,
    shadowMapSize: 1024,
    resolutionScale: 0.35,
    resolutionNpc: 1,
    resolutionEnemies: 1,
    resolutionWater: 1,
    gore: false,
    parallax: 0,
    textures: 0,
    water: 0,
    rainFx: false,
    clouds: 0,
    filmic: true,
    reflect: 0,
    lens: 0,
    snow: false,
    groundDetail: 0,
    fog: false,
    lightning: 0,
    lights: 0,
    ice: 0,
    antialias: false,
    drawDistance: 0,
    particles: 0.25,
    fov: 1,
    fpsCap: 0,
  },
  low: {
    shadows: false,
    shadowMapSize: 1024,
    resolutionScale: 0.65,
    resolutionNpc: 1,
    resolutionEnemies: 1,
    resolutionWater: 1,
    gore: true,
    parallax: 1,
    textures: 1,
    water: 1,
    rainFx: false,
    clouds: 0,
    filmic: true,
    reflect: 0,
    lens: 0,
    snow: true,
    groundDetail: 1,
    fog: true,
    lightning: 1,
    lights: 0,
    ice: 1,
    antialias: false,
    drawDistance: 1,
    particles: 0.5,
    fov: 1,
    fpsCap: 60,
  },
  medium: {
    shadows: true,
    shadowMapSize: 1024,
    resolutionScale: 0.85,
    resolutionNpc: 1,
    resolutionEnemies: 1,
    resolutionWater: 1,
    gore: true,
    parallax: 1,
    textures: 2,
    water: 2,
    rainFx: true,
    clouds: 1,
    filmic: true,
    reflect: 0,
    lens: 0,
    snow: true,
    groundDetail: 2,
    fog: true,
    lightning: 2,
    lights: 4,
    ice: 2,
    antialias: true,
    drawDistance: 1,
    particles: 1,
    fov: 1,
    fpsCap: 0,
  },
  high: {
    shadows: true,
    shadowMapSize: 2048,
    resolutionScale: 1,
    resolutionNpc: 1,
    resolutionEnemies: 1,
    resolutionWater: 1,
    gore: true,
    parallax: 2,
    textures: 2,
    water: 3,
    rainFx: true,
    clouds: 2,
    filmic: true,
    reflect: 1,
    lens: 1,
    snow: true,
    groundDetail: 2,
    fog: true,
    lightning: 2,
    lights: 8,
    ice: 3,
    antialias: true,
    drawDistance: 1,
    particles: 1,
    fov: 1,
    fpsCap: 0,
  },
  // For a machine with a real GPU: 4K shadows, drawn at 1.5x and scaled down, the finest parallax and textures.
  ultra: {
    shadows: true,
    shadowMapSize: 4096,
    resolutionScale: 1.5,
    resolutionNpc: 1,
    resolutionEnemies: 1,
    resolutionWater: 1,
    gore: true,
    parallax: 3,
    textures: 3,
    water: 3,
    rainFx: true,
    clouds: 3,
    filmic: true,
    reflect: 2,
    lens: 2,
    snow: true,
    groundDetail: 2,
    fog: true,
    lightning: 2,
    lights: 8,
    ice: 3,
    antialias: true,
    drawDistance: 2,
    particles: 1,
    fov: 1,
    fpsCap: 0,
  },
};

export const SHADOW_SIZES = [1024, 2048, 4096] as const;

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  ...PRESETS.high,
  darkMode: false,
  showFps: false,
  aimToggle: false,
  volume: 0.7,
};

const KEY = 'zombie-horde-survivors.settings';

/** The preset whose graphics values match, or 'custom'. */
export function qualityOf(s: GraphicsFields): Quality {
  for (const name of ['toaster', 'low', 'medium', 'high', 'ultra'] as const) {
    const p = PRESETS[name];
    if (
      p.shadows === s.shadows &&
      p.shadowMapSize === s.shadowMapSize &&
      p.resolutionScale === s.resolutionScale &&
      p.resolutionNpc === s.resolutionNpc &&
      p.resolutionEnemies === s.resolutionEnemies &&
      p.resolutionWater === s.resolutionWater &&
      p.gore === s.gore &&
      p.parallax === s.parallax &&
      p.textures === s.textures &&
      p.water === s.water &&
      p.rainFx === s.rainFx &&
      p.clouds === s.clouds &&
      p.filmic === s.filmic &&
      p.reflect === s.reflect &&
      p.lens === s.lens &&
      p.snow === s.snow &&
      p.groundDetail === s.groundDetail &&
      p.fog === s.fog &&
      p.lightning === s.lightning &&
      p.lights === s.lights &&
      p.ice === s.ice &&
      p.antialias === s.antialias &&
      p.drawDistance === s.drawDistance &&
      p.particles === s.particles &&
      p.fov === s.fov &&
      p.fpsCap === s.fpsCap
    ) {
      return name;
    }
  }
  return 'custom';
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Reads saved settings, falling back to the defaults for anything missing or invalid. */
export function loadSettings(defaults: Settings = DEFAULT_SETTINGS): Settings {
  let raw: Record<string, unknown> = {};
  try {
    const text = localStorage.getItem(KEY);
    if (text) raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Unavailable or corrupt storage: just use the defaults.
  }
  const d = defaults;
  const size = SHADOW_SIZES.find((n) => n === raw.shadowMapSize) ?? d.shadowMapSize;
  const s: Settings = {
    quality: d.quality,
    shadows: bool(raw.shadows, d.shadows),
    shadowMapSize: size,
    resolutionScale: Math.round(clamp(raw.resolutionScale, 0.25, 2, d.resolutionScale) * 20) / 20,
    resolutionNpc: Math.round(clamp(raw.resolutionNpc, 0.25, 1, d.resolutionNpc) * 20) / 20,
    resolutionEnemies:
      Math.round(clamp(raw.resolutionEnemies, 0.25, 1, d.resolutionEnemies) * 20) / 20,
    resolutionWater: Math.round(clamp(raw.resolutionWater, 0.25, 1, d.resolutionWater) * 20) / 20,
    gore: bool(raw.gore, d.gore),
    parallax: Math.round(clamp(raw.parallax, 0, 3, d.parallax)),
    textures: Math.round(clamp(raw.textures, 0, 3, d.textures)),
    water: Math.round(clamp(raw.water, 0, 3, d.water)),
    rainFx: bool(raw.rainFx, d.rainFx),
    clouds: Math.round(clamp(raw.clouds, 0, 3, d.clouds)),
    filmic: bool(raw.filmic, d.filmic),
    reflect: Math.round(clamp(raw.reflect, 0, 3, d.reflect)),
    lens: Math.round(clamp(raw.lens, 0, 2, d.lens)),
    snow: bool(raw.snow, d.snow),
    groundDetail: Math.round(clamp(raw.groundDetail, 0, 2, d.groundDetail)),
    fog: bool(raw.fog, d.fog),
    lightning: Math.round(clamp(raw.lightning, 0, 2, d.lightning)),
    lights: [0, 4, 8].includes(raw.lights as number) ? (raw.lights as number) : d.lights,
    ice: Math.round(clamp(raw.ice, 0, 3, d.ice)),
    antialias: bool(raw.antialias, d.antialias),
    drawDistance: Math.round(clamp(raw.drawDistance, 0, 2, d.drawDistance)),
    particles: [0.25, 0.5, 1].includes(raw.particles as number)
      ? (raw.particles as number)
      : d.particles,
    fov: Math.round(clamp(raw.fov, 0.8, 1.3, d.fov) * 20) / 20,
    fpsCap: [0, 30, 60, 120].includes(raw.fpsCap as number) ? (raw.fpsCap as number) : d.fpsCap,
    darkMode: bool(raw.darkMode, d.darkMode),
    showFps: bool(raw.showFps, d.showFps),
    aimToggle: bool(raw.aimToggle, d.aimToggle),
    volume: clamp(raw.volume, 0, 1, d.volume),
  };
  s.quality = qualityOf(s);
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable (private mode); settings then last for this visit only.
  }
}
