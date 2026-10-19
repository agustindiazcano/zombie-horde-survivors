import type { GameConfig } from './config';
import type { WeaponState } from './types';

/** The summed effect of the accessories fitted to one weapon. */
export interface FittedMods {
  damage: number;
  range: number;
  spread: number;
  aimSpread: number;
  recoil: number;
  noise: number;
  reloadTime: number;
  magazine: number;
  zoom: number;
}

const NONE: FittedMods = {
  damage: 0,
  range: 0,
  spread: 0,
  aimSpread: 0,
  recoil: 0,
  noise: 0,
  reloadTime: 0,
  magazine: 0,
  zoom: 0,
};

/** Adds up what the accessories of a weapon state change (nothing if it has none). */
export function modsOf(config: GameConfig, state: WeaponState | undefined): FittedMods {
  if (!state) return NONE;
  const ids = Object.values(state.accessories);
  if (ids.length === 0) return NONE;
  const sum = { ...NONE };
  for (const id of ids) {
    const def = config.items[id];
    if (def?.type !== 'accessory') continue;
    for (const key of Object.keys(def.modifiers) as (keyof FittedMods)[]) {
      sum[key] += def.modifiers[key] ?? 0;
    }
  }
  return sum;
}

/** A multiplier from a summed fraction; never below 10% so stacked bonuses cannot erase a stat. */
export const factor = (fraction: number): number => Math.max(0.1, 1 + fraction);
