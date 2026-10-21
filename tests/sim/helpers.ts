import data from '../../data/game.json';
import map1 from '../../data/maps/map-1.json';
import items from '../../data/items.json';
import units from '../../data/units.json';
import {
  FIXED_DT,
  arenaOf,
  createGame,
  parseConfig,
  parseMap,
  step,
  type GameConfig,
  type GameState,
  type Input,
  type SimEvent,
  type WeaponItem,
} from '../../src/sim';

/** Config sections to override; `weapon` overrides the rifle, the test squad's weapon. */
type Patch = {
  [
    K in Exclude<
      keyof GameConfig,
      | 'items'
      | 'briefing'
      | 'build'
      | 'noWaves'
      | 'startGold'
      | 'swim'
      | 'timeControl'
      | 'startOrbs'
      | 'skyShowOn'
      | 'startView'
      | 'startPitch'
      | 'subtitles'
      | 'startStructures'
      | 'startObjects'
      | 'startItems'
    >
  ]?: Partial<GameConfig[K]>;
} & {
  weapon?: Partial<WeaponItem>;
};

/** Real config with no obstacles and waves that never start, unless patched. */
export function testConfig(patch: Patch = {}): GameConfig {
  const base = { ...data, arena: arenaOf(parseMap(map1)) } as unknown as GameConfig;
  const merged: Record<string, object> = {
    arena: { ...base.arena, obstacles: [] },
    squad: { ...base.squad, count: 1, startWeapon: 'rifle' },
    drone: { ...base.drone, count: 0 },
    enemies: {},
    stance: { ...base.stance },
    swimming: { ...base.swimming },
    loot: { ...base.loot },
    progress: { ...base.progress },
    downed: { ...base.downed },
    gore: { ...base.gore, explodeChance: 0 },
    dismember: { ...base.dismember },
    wander: { ...base.wander },
    inventory: { ...base.inventory },
    boss: { ...base.boss, types: ['zombie'] },
    perks: { ...base.perks },
    shop: { ...base.shop },
    drops: { ...base.drops, chance: 0, table: [...base.drops.table] },
    player: { ...base.player },
    zombie: { ...base.zombie },
    vehicles: { ...base.vehicles },
    structures: { ...base.structures },
    training: { ...base.training },
    objects: { ...base.objects, types: { ...base.objects.types } },
    hazards: { ...base.hazards },
    animals: { ...base.animals },
    orbs: { ...base.orbs },
    skyShow: { ...base.skyShow },
    greys: { ...base.greys },
    drag: { ...base.drag },
    grenades: { ...base.grenades },
    ammo: { ...base.ammo },
    melee: { ...base.melee },
    accuracy: { ...base.accuracy },
    // No random head or critical hits: the tests expect exact damage.
    hits: { ...base.hits, headChance: 0, critChance: 0, critSkillBonus: 0 },
    difficulty: { ...base.difficulty },
    waves: { ...base.waves, intermission: 1e9 },
  };
  const { weapon, ...sections } = patch;
  for (const [key, value] of Object.entries(sections)) {
    merged[key] = { ...merged[key], ...value };
  }
  const catalog = structuredClone(items);
  // The tests aim by geometry: a rifle with no spread or recoil, unless a test patches it.
  Object.assign(catalog.items.rifle, { spread: 0, recoil: undefined }, weapon);
  const { arena, ...settings } = merged;
  return {
    ...parseConfig(settings, parseMap(map1), units, catalog),
    arena: arena as unknown as GameConfig['arena'],
  };
}

export function makeGame(patch: Patch = {}, seed = 1): { state: GameState; config: GameConfig } {
  const config = testConfig(patch);
  return { state: createGame(config, seed), config };
}

export const idle: Input = {
  move: { x: 0, z: 0 },
  aim: { x: 0, z: 10 },
  firing: false,
  crouch: false,
  sprint: false,
  jump: false,
};

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
