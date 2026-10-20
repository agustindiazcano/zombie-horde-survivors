/** Player-facing options, kept in the browser (localStorage). No Three.js or DOM here. */
export type Quality = 'low' | 'medium' | 'high' | 'custom';

export interface Settings {
  /** Preset name, or 'custom' once any graphics option is changed by hand. */
  quality: Quality;
  shadows: boolean;
  /** Shadow map resolution in pixels (square). */
  shadowMapSize: number;
  /** Fraction of the screen's full pixel density the game renders at (0.5 to 1). */
  resolutionScale: number;
  /** Blood and gibs when enemies burst. */
  gore: boolean;
  /** Dim lighting with a flashlight per soldier. */
  darkMode: boolean;
  showFps: boolean;
  /** Aim with one right click on, another off (instead of holding the button). */
  aimToggle: boolean;
  /** Sound effects volume, 0 to 1. */
  volume: number;
}

type GraphicsFields = Pick<Settings, 'shadows' | 'shadowMapSize' | 'resolutionScale' | 'gore'>;

export const PRESETS: Record<'low' | 'medium' | 'high', GraphicsFields> = {
  low: { shadows: false, shadowMapSize: 1024, resolutionScale: 0.65, gore: true },
  medium: { shadows: true, shadowMapSize: 1024, resolutionScale: 0.85, gore: true },
  high: { shadows: true, shadowMapSize: 2048, resolutionScale: 1, gore: true },
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
  for (const name of ['low', 'medium', 'high'] as const) {
    const p = PRESETS[name];
    if (
      p.shadows === s.shadows &&
      p.shadowMapSize === s.shadowMapSize &&
      p.resolutionScale === s.resolutionScale &&
      p.gore === s.gore
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
    resolutionScale: Math.round(clamp(raw.resolutionScale, 0.5, 1, d.resolutionScale) * 20) / 20,
    gore: bool(raw.gore, d.gore),
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
