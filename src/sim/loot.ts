import type { GameConfig } from './config';
import type { GameState, Zombie } from './types';
import { grantLevels } from './upgrades';

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level, and the XP the level needs. */
  into: number;
  needed: number;
}

/** Level from total XP: each level needs `growth` times more XP than the one before. */
export function levelInfo(xp: number, config: GameConfig): LevelInfo {
  let level = 1;
  let needed = config.progress.xpPerLevel;
  let rest = xp;
  while (rest >= needed) {
    rest -= needed;
    level++;
    needed = Math.round(needed * config.progress.growth);
  }
  return { level, into: rest, needed };
}

/** Drops a gold coin and an XP orb beside a dead enemy, scaled by its type. */
export function dropLoot(state: GameState, config: GameConfig, zombie: Zombie): void {
  const scale = (config.enemies[zombie.type]?.rewardScale ?? 1) * zombie.reward;
  const gold = Math.max(1, Math.round(config.zombie.gold * scale));
  const xp = Math.max(1, Math.round(config.zombie.xp * scale));
  const angle = zombie.id * 2.4;
  const dx = Math.cos(angle) * 0.35;
  const dz = Math.sin(angle) * 0.35;

  state.pickups.push(
    {
      id: state.nextPickupId++,
      kind: 'gold',
      amount: gold,
      pos: { x: zombie.pos.x + dx, z: zombie.pos.z + dz },
      age: 0,
    },
    {
      id: state.nextPickupId++,
      kind: 'xp',
      amount: xp,
      pos: { x: zombie.pos.x - dx, z: zombie.pos.z - dz },
      age: 0,
    },
  );
  while (state.pickups.length > config.loot.maxPickups) state.pickups.shift();
}

/** Ages pickups and lets any living unit (soldier or drone) collect those it stands on. */
export function updatePickups(state: GameState, config: GameConfig, dt: number): void {
  const radius = config.loot.collectRadius * state.mods.pickupRadius;
  const kept = [];
  for (const p of state.pickups) {
    p.age += dt;
    if (p.age >= config.loot.lifetime) continue;

    const collector = state.soldiers.find(
      (s) => !s.dead && Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) <= radius,
    );
    if (!collector) {
      kept.push(p);
      continue;
    }

    state.events.push({
      type: 'pickupCollected',
      kind: p.kind,
      amount: p.amount,
      pos: { ...p.pos },
    });
    if (p.kind === 'gold') {
      state.gold += p.amount;
    } else {
      const before = levelInfo(state.xp, config).level;
      state.xp += p.amount;
      const after = levelInfo(state.xp, config).level;
      if (after > before) {
        state.events.push({ type: 'levelUp', level: after });
        grantLevels(state, config, after - before);
      }
    }
  }
  state.pickups = kept;
}
