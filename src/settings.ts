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
  | 'gore'
  | 'parallax'
  | 'textures'
  | 'water'
  | 'rainFx'
  | 'clouds'
>;

export const PRESETS: Record<'toaster' | 'low' | 'medium' | 'high' | 'ultra', GraphicsFields> = {
  // For machines that struggle: a third of the pixels each way, drawn blocky, no shadows or depth.
  toaster: {
    shadows: false,
    shadowMapSize: 1024,
    resolutionScale: 0.35,
    gore: false,
    parallax: 0,
    textures: 0,
    water: 0,
    rainFx: false,
    clouds: 0,
  },
  low: {
    shadows: false,
    shadowMapSize: 1024,
    resolutionScale: 0.65,
    gore: true,
    parallax: 1,
    textures: 1,
    water: 1,
    rainFx: false,
    clouds: 0,
  },
  medium: {
    shadows: true,
    shadowMapSize: 1024,
    resolutionScale: 0.85,
    gore: true,
    parallax: 1,
    textures: 2,
    water: 2,
    rainFx: true,
    clouds: 1,
  },
  high: {
    shadows: true,
    shadowMapSize: 2048,
    resolutionScale: 1,
    gore: true,
    parallax: 2,
    textures: 2,
    water: 3,
    rainFx: true,
    clouds: 2,
  },
  // For a machine with a real GPU: 4K shadows, drawn at 1.5x and scaled down, the finest parallax and textures.
  ultra: {
    shadows: true,
    shadowMapSize: 4096,
    resolutionScale: 1.5,
    gore: true,
    parallax: 3,
    textures: 3,
    water: 3,
    rainFx: true,
    clouds: 3,
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
      p.gore === s.gore &&
      p.parallax === s.parallax &&
      p.textures === s.textures &&
      p.water === s.water &&
      p.rainFx === s.rainFx &&
      p.clouds === s.clouds
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
    gore: bool(raw.gore, d.gore),
    parallax: Math.round(clamp(raw.parallax, 0, 3, d.parallax)),
    textures: Math.round(clamp(raw.textures, 0, 3, d.textures)),
    water: Math.round(clamp(raw.water, 0, 3, d.water)),
    rainFx: bool(raw.rainFx, d.rainFx),
    clouds: Math.round(clamp(raw.clouds, 0, 3, d.clouds)),
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
