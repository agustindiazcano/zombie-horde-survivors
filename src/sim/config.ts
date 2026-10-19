import { z } from 'zod';

const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

/** Schema for data/maps/*.json: one map (a mission or a survival arena). Versioned for later migrations. */
const point = z.object({ x: z.number(), z: z.number() }).strict();

const mapProp = z
  .object({
    /** Catalog id of the model; `block` is the plain box used by the development arena. */
    asset: z.string().min(1),
    ...point.shape,
    rotation: z.number(),
    scale: positive,
    layer: z.enum(['outdoor', 'indoor', 'nature']),
    /** When present the prop blocks movement and shots (an axis-aligned box centred on the prop). */
    collider: z.object({ halfW: positive, halfD: positive }).strict().optional(),
  })
  .strict();

const mapPlayer = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(['human', 'ai']),
    team: z.number().int().nonnegative(),
    color: z.string().min(1),
  })
  .strict();

const mapUnit = z
  .object({
    /** Unit type id (character or vehicle catalog entry). */
    type: z.string().min(1),
    ...point.shape,
    /** Id of the owning player. */
    owner: z.string().min(1),
    hold: z.boolean().optional(),
  })
  .strict();

export const MapSchema = z
  .object({
    version: z.literal(1),
    meta: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        author: z.string(),
        created: z.string(),
        updated: z.string(),
        size: z.object({ width: positive, depth: positive }).strict(),
      })
      .strict(),
    /** Not read yet: height grid, water and paint arrive with the editor's terrain phase. */
    terrain: z
      .object({
        heights: z.array(z.array(z.number())).nullable(),
        water: z.number().nullable(),
        paint: z.array(z.array(z.string())).nullable(),
      })
      .strict(),
    props: z.array(mapProp),
    /** Floors and roads (not read yet). */
    surfaces: z.array(z.object({ asset: z.string().min(1), path: z.array(point).min(2) }).strict()),
    players: z.array(mapPlayer),
    units: z.array(mapUnit),
    logic: z.object({ mode: z.enum(['waves', 'story']) }).strict(),
  })
  .strict()
  .superRefine((map, ctx) => {
    if (map.meta.size.width !== map.meta.size.depth) {
      ctx.addIssue({ code: 'custom', message: 'meta.size must be square for now' });
    }
    if (map.logic.mode === 'waves') {
      for (const kind of ['human', 'ai'] as const) {
        if (!map.players.some((p) => p.kind === kind)) {
          ctx.addIssue({ code: 'custom', message: `a waves map needs a ${kind} player` });
        }
      }
    }
    const ids = new Set(map.players.map((p) => p.id));
    if (ids.size !== map.players.length) {
      ctx.addIssue({ code: 'custom', message: 'players ids must be unique' });
    }
    for (const u of map.units) {
      if (!ids.has(u.owner)) {
        ctx.addIssue({
          code: 'custom',
          message: `unit "${u.type}" has an unknown owner "${u.owner}"`,
        });
      }
    }
  });

export type MapData = z.infer<typeof MapSchema>;

export const parseMap = (raw: unknown): MapData => MapSchema.parse(raw);

/** The arena the sim needs: half the map size and the props that have a collider. */
export function arenaOf(map: MapData): Arena {
  return {
    halfSize: map.meta.size.width / 2,
    obstacles: map.props.flatMap((p) =>
      p.collider ? [{ x: p.x, z: p.z, halfW: p.collider.halfW, halfD: p.collider.halfD }] : [],
    ),
  };
}

/** Weapon classes: a unit earns weapon-skill XP in the class of the weapon it kills with. */
export const WEAPON_CLASSES = [
  'melee',
  'pistol',
  'shotgun',
  'rifle',
  'sniper',
  'machinegun',
  'launcher',
] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];
const weaponClass = z.enum(WEAPON_CLASSES);

/** Schema for data/units.json: one stat sheet per unit type. Attributes are mocked (nothing reads them yet). */
export const UNIT_FAMILIES = ['human', 'zombie', 'monster', 'machine', 'animal'] as const;

export const UnitsSchema = z
  .object({
    /** Attribute names every sheet must define, in display order. */
    attributes: z.array(z.string().min(1)).min(1),
    /** Weapon-skill levels: the first needs `xpPerLevel`, each next one `growth` times more. */
    skills: z.object({ xpPerLevel: positive, growth: z.number().min(1) }).strict(),
    units: z.record(
      z.string(),
      z
        .object({
          name: z.string().min(1),
          family: z.enum(UNIT_FAMILIES),
          attributes: z.record(z.string(), z.number().nonnegative()),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((u, ctx) => {
    for (const [id, unit] of Object.entries(u.units)) {
      const keys = Object.keys(unit.attributes);
      if (keys.length !== u.attributes.length || !u.attributes.every((a) => keys.includes(a))) {
        ctx.addIssue({
          code: 'custom',
          message: `unit "${id}" must define exactly the attributes`,
        });
      }
    }
    for (const id of ['soldier', 'drone']) {
      if (!u.units[id]) ctx.addIssue({ code: 'custom', message: `units.${id} is missing` });
    }
  });

export type UnitsData = z.infer<typeof UnitsSchema>;

/** Damage types of a weapon or explosive. Only `physical` has a rule today; the rest are mocked. */
export const DAMAGE_TYPES = [
  'physical',
  'explosive',
  'fire',
  'energy',
  'psychic',
  'magic',
  'scifi',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Places on a weapon where an accessory can be fitted (mocked: nothing fits them yet). */
export const ACCESSORY_SLOTS = [
  'optic',
  'barrel',
  'magazine',
  'grip',
  'stock',
  'underbarrel',
] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

const itemBase = {
  name: z.string().min(1),
  /** A short symbol (emoji) shown on the item's slot. */
  icon: z.string().min(1),
  /** How many fit in one backpack slot. */
  stack: z.number().int().positive(),
};

/**
 * Schema for data/items.json: the catalog of everything a unit can hold. Every field under
 * `mocked` is design data that no rule reads yet (the squad screen marks it "not active yet").
 */
const itemDef = z.discriminatedUnion('type', [
  z
    .object({
      ...itemBase,
      type: z.literal('weapon'),
      /** Never leaves the unit and never sits in a slot: what a unit fights with when empty-handed. */
      innate: z.boolean().optional(),
      /** Only a drone can equip it (and a drone can equip nothing else). */
      droneOnly: z.boolean().optional(),
      class: weaponClass,
      /** 1 takes a hand; 2 takes both (so no dual wielding it). */
      hands: z.union([z.literal(1), z.literal(2)]),
      damageType: z.enum(DAMAGE_TYPES),
      fireRate: positive,
      damage: positive,
      range: positive,
      /** Random aim error, in radians (each side). */
      spread: nonNegative,
      mocked: z
        .object({
          magazine: z.number().int().positive().optional(),
          reloadTime: nonNegative.optional(),
          noise: nonNegative,
          weight: nonNegative,
          accessorySlots: z.array(z.enum(ACCESSORY_SLOTS)),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...itemBase,
      type: z.literal('armor'),
      slot: z.literal('chest'),
      mocked: z.object({ armor: positive, weight: nonNegative }).strict(),
    })
    .strict(),
  /** Armor plate: worn at once from a crate (adds `player.armorPlate` to the armor bar). */
  z.object({ ...itemBase, type: z.literal('plate') }).strict(),
  z
    .object({
      ...itemBase,
      type: z.literal('medical'),
      /** Health restored when used from the backpack. */
      heal: positive,
      mocked: z.object({ useTime: nonNegative }).strict(),
    })
    .strict(),
  z
    .object({
      ...itemBase,
      type: z.literal('grenade'),
      damageType: z.enum(DAMAGE_TYPES),
      mocked: z
        .object({
          blastRadius: positive,
          blastDamage: positive,
          falloff: z.number().min(0).max(1),
          fuse: nonNegative,
          throwRange: positive,
          weight: nonNegative,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...itemBase,
      type: z.literal('defibrillator'),
      mocked: z
        .object({
          channelTime: nonNegative,
          reviveWindow: nonNegative,
          successChance: z.number().min(0).max(1),
          weight: nonNegative,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...itemBase,
      type: z.literal('accessory'),
      slot: z.enum(ACCESSORY_SLOTS),
      mocked: z
        .object({ modifiers: z.record(z.string(), z.number()), weight: nonNegative })
        .strict(),
    })
    .strict(),
]);

export type ItemDef = z.infer<typeof itemDef>;
export type WeaponItem = Extract<ItemDef, { type: 'weapon' }>;

export const ItemsSchema = z
  .object({ items: z.record(z.string(), itemDef) })
  .strict()
  .superRefine((data, ctx) => {
    const fists = data.items['fists'];
    if (fists?.type !== 'weapon' || !fists.innate) {
      ctx.addIssue({ code: 'custom', message: 'items.fists must be an innate weapon' });
    }
    if (data.items['rifle']?.type !== 'weapon') {
      ctx.addIssue({ code: 'custom', message: 'items.rifle must be a weapon' });
    }
    if (data.items['armor_plate']?.type !== 'plate') {
      ctx.addIssue({ code: 'custom', message: 'items.armor_plate must be a plate' });
    }
    for (const [id, item] of Object.entries(data.items)) {
      if (item.type === 'weapon' && item.stack !== 1) {
        ctx.addIssue({ code: 'custom', message: `weapon "${id}" cannot stack` });
      }
    }
  });

export type ItemsData = z.infer<typeof ItemsSchema>;

/** Schema for data/game.json. Strict so typos in data files fail loudly. */
/** What a perk improves for the whole squad. `amount` is a fraction per stack, except regen (HP/s). */
const perkStat = z.enum(['damage', 'fireRate', 'speed', 'maxHealth', 'regen', 'pickupRadius']);

const perk = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** A short symbol (emoji) shown on the perk's icon. */
    icon: z.string().min(1),
    description: z.string().min(1),
    stat: perkStat,
    amount: positive,
    maxStacks: z.number().int().positive(),
  })
  .strict();

const shopItem = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    kind: z.enum(['heal', 'revive', 'item', 'perk', 'armor']),
    /** Armor points given to every living soldier, for 'armor'. */
    amount: positive.optional(),
    /** Item id (data/items.json) for 'item', perk id for 'perk'. */
    target: z.string().optional(),
    cost: z.number().int().positive(),
    /** The price is multiplied by this after each purchase. */
    costGrowth: z.number().min(1).optional(),
  })
  .strict();

/** Enemy variants, as multipliers on the base `zombie` stats. */
const enemyType = z
  .object({
    name: z.string().min(1),
    speedScale: positive,
    healthScale: positive,
    damageScale: positive,
    /** Scales the collision radius and the melee reach. */
    radiusScale: positive,
    /** Relative spawn likelihood among unlocked types. */
    weight: positive,
    rewardScale: positive,
    /** First wave this type can appear in. */
    minWave: z.number().int().positive(),
  })
  .strict();

export const GameConfigSchema = z
  .object({
    /** Stats shared by every soldier. */
    player: z
      .object({
        speed: positive,
        maxHealth: positive,
        /** Capacity of the armor bar; units start with none and armor soaks damage before health. */
        maxArmor: positive,
        /** Armor gained by taking an "armor_plate" from a crate. */
        armorPlate: positive,
        radius: positive,
      })
      .strict(),
    squad: z
      .object({
        /** Soldiers at the start of a game. */
        count: z.number().int().positive(),
        /** Radius around the leader where followers hold position. */
        followDistance: positive,
        /** AI soldiers engage zombies within this distance (and line of sight). */
        aiRange: positive,
        /** Item id of the weapon every soldier starts with (a weapon in data/items.json). */
        startWeapon: z.string().min(1),
        /** AI fire rate as a fraction of the weapon fire rate. */
        aiFireRateScale: positive,
      })
      .strict(),
    /** A flying support unit that ignores cover; zombies can't hurt it. Its gun is `drone_cannon`. */
    drone: z
      .object({
        count: z.number().int().nonnegative(),
        speed: positive,
        height: positive,
      })
      .strict(),
    /** Variants besides the base zombie, by id (e.g. alien, hound). */
    enemies: z.record(z.string(), enemyType),
    /** Squad stances (set by the controlled player) and the controlled soldier's jump. */
    stance: z
      .object({
        /** Crouching: slower, tighter spread, harder-hitting shots. */
        crouchSpeedScale: positive,
        crouchSpreadScale: nonNegative,
        crouchDamageScale: positive,
        sprintSpeedScale: positive,
        /** Sprinting drains stamina per second; it refills when not sprinting. */
        staminaMax: positive,
        staminaDrain: positive,
        staminaRegen: positive,
        /** After running dry a unit cannot sprint again until it has recovered this much. */
        staminaResume: positive,
        /** Initial upward speed of a jump and the downward pull on it. */
        jumpSpeed: positive,
        gravity: positive,
      })
      .strict(),
    /** Gold coins and XP orbs dropped by dead enemies. */
    loot: z
      .object({
        /** A living unit within this distance collects a pickup. */
        collectRadius: positive,
        /** Seconds before an uncollected pickup disappears. */
        lifetime: positive,
        maxPickups: z.number().int().positive(),
      })
      .strict(),
    progress: z
      .object({
        xpPerLevel: positive,
        /** Each level needs this many times the XP of the previous one. */
        growth: z.number().min(1),
      })
      .strict(),
    /** Level-up perks: each level offers `choices` random perks to pick one from. */
    perks: z.object({ choices: z.number().int().positive(), list: z.array(perk).min(1) }).strict(),
    /** Between-wave shop, paid with gold. */
    shop: z.object({ items: z.array(shopItem) }).strict(),
    /** A mini boss every few waves: a stronger, slower copy of one of the enemy types. */
    boss: z
      .object({
        everyWaves: z.number().int().positive(),
        /** Enemy types the bosses cycle through, in order. */
        types: z.array(z.string()).min(1),
        /**
         * Health and damage multipliers (on that type's normal stats at the current wave) for the
         * 1st boss, the 2nd, and so on. Past the end of a list each further boss multiplies the
         * last entry by `growth` again.
         */
        health: z.array(positive).min(1),
        damage: z.array(positive).min(1),
        growth: z.number().min(1),
        speedScale: positive,
        /** Loot multiplier of the 1st boss; the nth boss pays n times as much. */
        rewardScale: positive,
        /**
         * Model and hitbox size: `sizeBase` for the 1st boss, growing with how much more health
         * a boss has than the 1st one (health ratio ^ `sizeExponent`), up to `maxSize`.
         */
        sizeBase: positive,
        sizeExponent: nonNegative,
        maxSize: positive,
      })
      .strict(),
    gore: z.object({ explodeChance: z.number().min(0).max(1) }).strict(),
    inventory: z.object({ backpackSlots: z.number().int().positive() }).strict(),
    drops: z
      .object({
        /** Chance (0..1) that a killed zombie drops a crate. */
        chance: z.number().min(0).max(1),
        minItems: z.number().int().positive(),
        maxItems: z.number().int().positive(),
        /** How close a unit must be to open or use a crate. */
        pickupRange: positive,
        maxCrates: z.number().int().positive(),
        /** Crate contents: an item id from data/items.json and its relative likelihood. */
        table: z.array(z.object({ item: z.string(), weight: positive }).strict()).min(1),
      })
      .strict(),
    zombie: z
      .object({
        speed: positive,
        health: positive,
        damage: positive,
        radius: positive,
        attackRange: positive,
        attackCooldown: positive,
        deathDuration: positive,
        /** Rewards for killing the base zombie; variants scale them with `rewardScale`. */
        gold: z.number().int().nonnegative(),
        xp: z.number().int().nonnegative(),
      })
      .strict(),
    waves: z
      .object({
        baseCount: z.number().int().positive(),
        countPerWave: z.number().int().nonnegative(),
        spawnInterval: nonNegative,
        intermission: nonNegative,
        maxAlive: z.number().int().positive(),
        /** Spawn weight of the plain zombie, against the `enemies` weights. */
        baseWeight: positive,
        /** Zombie speed/health grow by this fraction of the base value per wave after the first. */
        speedScalePerWave: nonNegative,
        healthScalePerWave: nonNegative,
        /** Upper bound for the speed multiplier so late waves stay dodgeable. */
        maxSpeedScale: z.number().min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.drops.maxItems < cfg.drops.minItems) {
      ctx.addIssue({ code: 'custom', message: 'drops.maxItems must be >= drops.minItems' });
    }
    for (const type of cfg.boss.types) {
      if (type !== 'zombie' && !(type in cfg.enemies)) {
        ctx.addIssue({ code: 'custom', message: `boss.types references unknown enemy "${type}"` });
      }
    }
    const perkIds = new Set(cfg.perks.list.map((p) => p.id));
    if (perkIds.size !== cfg.perks.list.length) {
      ctx.addIssue({ code: 'custom', message: 'perks.list ids must be unique' });
    }
    for (const item of cfg.shop.items) {
      if (item.kind === 'perk' && !(item.target && perkIds.has(item.target))) {
        ctx.addIssue({
          code: 'custom',
          message: `shop item "${item.id}" needs a valid perk target`,
        });
      }
    }
  });

/** An axis-aligned blocking box (a prop's collider placed on the map). */
export type Obstacle = { x: number; z: number; halfW: number; halfD: number };
/** The playfield the sim runs on, derived from the map (see `arenaOf`). */
export type Arena = { halfSize: number; obstacles: Obstacle[] };
/** The balance numbers of game.json plus the arena of the chosen map. */
export type GameConfig = z.infer<typeof GameConfigSchema> & {
  arena: Arena;
  /** The players of the map (who owns what, and the teams). */
  players: MapData['players'];
  /** Stat sheets by unit type (from data/units.json). */
  units: UnitsData;
  /** The item catalog (from data/items.json), by item id. */
  items: ItemsData['items'];
};

/** Checks that the ids game.json uses (start weapon, shop targets, crate table) are real items. */
function checkItemRefs(cfg: z.infer<typeof GameConfigSchema>, items: ItemsData['items']): void {
  const problems: string[] = [];
  const start = items[cfg.squad.startWeapon];
  if (start?.type !== 'weapon' || start.droneOnly || start.innate) {
    problems.push('squad.startWeapon is not a known soldier weapon');
  }
  for (const item of cfg.shop.items) {
    if (item.kind === 'item' && !(item.target && item.target in items)) {
      problems.push(`shop item "${item.id}" needs a valid item target`);
    }
  }
  for (const entry of cfg.drops.table) {
    if (!(entry.item in items))
      problems.push(`drops.table references unknown item "${entry.item}"`);
  }
  if (problems.length > 0) throw new Error(problems.join('; '));
}

export function parseConfig(
  raw: unknown,
  map: MapData,
  units: unknown,
  items: unknown,
): GameConfig {
  const game = GameConfigSchema.parse(raw);
  const catalog = ItemsSchema.parse(items).items;
  checkItemRefs(game, catalog);
  return {
    ...game,
    arena: arenaOf(map),
    players: map.players,
    units: UnitsSchema.parse(units),
    items: catalog,
  };
}
