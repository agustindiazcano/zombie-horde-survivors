import data from '../../data/game.json';
import {
  FIXED_DT,
  createGame,
  parseConfig,
  step,
  type GameConfig,
  type GameState,
  type Input,
  type SimEvent,
} from '../../src/sim';

type Patch = { [K in keyof GameConfig]?: Partial<GameConfig[K]> };

/** Real config with no obstacles and waves that never start, unless patched. */
export function testConfig(patch: Patch = {}): GameConfig {
  const base = data as unknown as GameConfig;
  const merged: Record<string, object> = {
    arena: { ...base.arena, obstacles: [] },
    squad: { ...base.squad, count: 1 },
    drone: { ...base.drone, count: 0 },
    inventory: { ...base.inventory },
    weapons: { ...base.weapons },
    drops: { ...base.drops, chance: 0, table: [...base.drops.table] },
    player: { ...base.player },
    weapon: { ...base.weapon },
    zombie: { ...base.zombie },
    waves: { ...base.waves, intermission: 1e9 },
  };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = { ...merged[key], ...value };
  }
  return parseConfig(merged);
}

export function makeGame(patch: Patch = {}, seed = 1): { state: GameState; config: GameConfig } {
  const config = testConfig(patch);
  return { state: createGame(config, seed), config };
}

export const idle: Input = { move: { x: 0, z: 0 }, aim: { x: 0, z: 10 }, firing: false };

/** Steps the simulation for `seconds` and returns every event produced. */
export function run(
  state: GameState,
  config: GameConfig,
  input: Input,
  seconds: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    step(state, config, input, FIXED_DT);
    events.push(...state.events);
  }
  return events;
}
