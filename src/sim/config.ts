import { z } from 'zod';
import { steepObstacles, waterObstacles } from './terrain';
import type { Vec2 } from './vec';

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

const loadoutShape = {
  /** A name shown instead of the type's. */
  name: z.string().min(1).optional(),
  /** Health in place of the type's default (for a soldier, before perks). */
  maxHealth: positive.optional(),
  /** Attribute values by name (a missing one keeps the sheet's). */
  attributes: z.record(z.string(), z.number().nonnegative()).optional(),
  /** Hand and vest slots; null empties one, a missing one keeps the default. */
  equipment: z
    .object({
      rightHand: z.string().nullable().optional(),
      leftHand: z.string().nullable().optional(),
      chest: z.string().nullable().optional(),
    })
    .strict()
    .optional(),
  /** Carried stacks. An enemy drops these in a crate when it dies. */
  backpack: z
    .array(z.object({ item: z.string().min(1), count: z.number().int().positive() }).strict())
    .optional(),
};

const mapUnit = z
  .object({
    /** Unit type id (character or vehicle catalog entry). */
    type: z.string().min(1),
    ...point.shape,
    /** Id of the owning player. */
    owner: z.string().min(1),
    /** Heading in radians (0 faces +Z). */
    rotation: z.number().optional(),
    hold: z.boolean().optional(),
    ...loadoutShape,
  })
  .strict();

/** The changes a map can make to one placed unit; they apply to that unit of that map only. */
export type Loadout = {
  name?: string;
  maxHealth?: number;
  attributes?: Record<string, number>;
  equipment?: { rightHand?: string | null; leftHand?: string | null; chest?: string | null };
  backpack?: { item: string; count: number }[];
};

/** A spawn point: where enemies appear, and for a placed spawner which enemy and what it carries. */
export type SpawnPoint = Vec2 & { enemy?: string; loadout?: Loadout };

/** The id prefix of a placed spawner unit: `spawner:<enemy id>`. */
export const SPAWNER_PREFIX = 'spawner:';

/** The enemy type a placed unit spawns, or null when it is not a spawner. */
export const spawnerEnemy = (type: string): string | null =>
  type.startsWith(SPAWNER_PREFIX) ? type.slice(SPAWNER_PREFIX.length) : null;

const difficultyId = z.enum(['easy', 'normal', 'hard']);

/** A story goal. The mission is won when every objective is done; the squad dying still loses. */
const objective = z.discriminatedUnion('kind', [
  /** Walk any living soldier to a spot. */
  z
    .object({ kind: z.literal('reach'), x: z.number(), z: z.number(), radius: positive.default(3) })
    .strict(),
  /** Kill this many enemies. */
  z.object({ kind: z.literal('kills'), count: z.number().int().positive() }).strict(),
  /** Clear this wave. */
  z.object({ kind: z.literal('survive'), wave: z.number().int().positive() }).strict(),
  /** Kill this many mini bosses. */
  z.object({ kind: z.literal('boss'), count: z.number().int().positive().default(1) }).strict(),
]);

export type Objective = z.infer<typeof objective>;

/**
 * Per-map rules. Everything but `mode` is optional: a field that is present replaces the global
 * value of data/game.json for this map, a missing one keeps it.
 */
const mapLogic = z
  .object({
    mode: z.enum(['waves', 'story']),
    difficulty: difficultyId.optional(),
    waves: z
      .object({
        baseCount: z.number().int().positive(),
        countPerWave: z.number().int().nonnegative(),
        spawnInterval: nonNegative,
        intermission: nonNegative,
        maxAlive: z.number().int().positive(),
      })
      .partial()
      .strict()
      .optional(),
    /** When present only the listed enemy types spawn (besides the plain zombie), with these overrides. */
    enemies: z
      .record(
        z.string(),
        z
          .object({ weight: positive.optional(), minWave: z.number().int().positive().optional() })
          .strict(),
      )
      .optional(),
    /** Spawn weight of the plain zombie against the other types; 0 removes it from the mix. */
    zombieWeight: nonNegative.optional(),
    boss: z
      .object({
        enabled: z.boolean().optional(),
        everyWaves: z.number().int().positive().optional(),
        types: z.array(z.string()).min(1).optional(),
      })
      .strict()
      .optional(),
    /** Where enemies appear (picked at random); empty or missing = anywhere along the map edge. */
    spawnPoints: z.array(point).optional(),
    /** Story missions: the goals to win (a missing or empty list never ends the run). */
    objectives: z.array(objective).optional(),
    /** Fires burning from the start (see `hazards.fire` in game.json for their strength). */
    fires: z.array(point).optional(),
    /** Story missions: a text shown when the mission starts. */
    briefing: z.string().max(600).optional(),
  })
  .strict();

export type MapLogic = z.infer<typeof mapLogic>;

const unit01 = z.number().min(0).max(1);

/**
 * How the map looks: sky, time of day, light colour and weather. Every field has a default, and a
 * map without this section looks like noon with clear weather. Nothing here changes the rules.
 */
export const EnvironmentSchema = z
  .object({
    /** Draws the sky (gradient, sun, moon, clouds); off shows a plain dark background. */
    sky: z.boolean().default(true),
    /** Hours from 0 to 24: 0 midnight, 6 dawn, 12 noon, 18 dusk. Sets the sun angle and the light. */
    timeOfDay: z.number().min(0).max(24).default(12),
    /** A "#rrggbb" colour for the main light, or null for the colour the time of day gives. */
    lightColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .default(null),
    sun: z.boolean().default(true),
    moon: z.boolean().default(true),
    /** From 0 (none) to 1 (overcast). */
    clouds: unit01.default(0),
    /** Weather strengths from 0 (off) to 1 (heaviest). */
    rain: unit01.default(0),
    snow: unit01.default(0),
    sand: unit01.default(0),
    fog: unit01.default(0),
  })
  .strict();

export type Environment = z.infer<typeof EnvironmentSchema>;

export const defaultEnvironment = (): Environment => EnvironmentSchema.parse({});

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
    /**
     * `heights` is (size + 1)² vertices, one per metre; `water` a level below which ground is
     * wet; `paint` one texture id per 1 m cell (null = the default ground).
     */
    terrain: z
      .object({
        heights: z.array(z.array(z.number())).nullable(),
        water: z.number().nullable(),
        paint: z.array(z.array(z.string())).nullable(),
      })
      .strict(),
    props: z.array(mapProp),
    /** Floors and roads (not read yet). */
    surfaces: z.array(
      z
        .object({
          /** Terrain texture id (data/terrain.json) the strip is drawn with. */
          asset: z.string().min(1),
          path: z.array(point).min(2),
          /** Strip width in metres. */
          width: positive.default(3),
        })
        .strict(),
    ),
    players: z.array(mapPlayer),
    units: z.array(mapUnit),
    logic: mapLogic,
    /** Sky, time of day and weather (see EnvironmentSchema); missing = noon, clear. */
    environment: EnvironmentSchema.optional(),
  })
  .strict()
  .superRefine((map, ctx) => {
    if (map.meta.size.width !== map.meta.size.depth) {
      ctx.addIssue({ code: 'custom', message: 'meta.size must be square for now' });
    }
    const n = map.meta.size.width;
    const { heights, paint } = map.terrain;
    if (heights && (heights.length !== n + 1 || heights.some((r) => r.length !== n + 1))) {
      ctx.addIssue({ code: 'custom', message: 'terrain.heights must be (size + 1) x (size + 1)' });
    }
    if (paint && (paint.length !== n || paint.some((r) => r.length !== n))) {
      ctx.addIssue({ code: 'custom', message: 'terrain.paint must be size x size' });
    }
    if (map.logic.mode === 'waves' || map.logic.mode === 'story') {
      for (const kind of ['human', 'ai'] as const) {
        if (!map.players.some((p) => p.kind === kind)) {
          ctx.addIssue({
            code: 'custom',
            message: `a ${map.logic.mode} map needs a ${kind} player`,
          });
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
    terrain: map.terrain,
    surfaces: map.surfaces,
    obstacles: [
      ...waterObstacles(map.terrain.heights, map.terrain.water, map.meta.size.width / 2),
      ...steepObstacles(map.terrain.heights, map.meta.size.width / 2),
      ...propObstacles(map),
    ],
  };
}

function propObstacles(map: MapData): Obstacle[] {
  return map.props.flatMap((p) => {
    if (!p.collider) return [];
    // Colliders are axis-aligned: a quarter turn swaps the sides.
    const turned = Math.round(p.rotation / (Math.PI / 2)) % 2 !== 0;
    const { halfW, halfD } = p.collider;
    return [{ x: p.x, z: p.z, halfW: turned ? halfD : halfW, halfD: turned ? halfW : halfD }];
  });
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
          /** Which soldier model (slot of data/characters.json) draws this unit; unset = by id. */
          model: z.number().int().nonnegative().optional(),
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

/** Places on a weapon where an accessory can be fitted. */
export const ACCESSORY_SLOTS = [
  'optic',
  'barrel',
  'magazine',
  'grip',
  'stock',
  'underbarrel',
] as const;
export const FIRE_MODES = ['auto', 'semi'] as const;
export type FireMode = (typeof FIRE_MODES)[number];

export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

/** What a fitted accessory changes; the effects of all fitted ones add up. Left out means no change. */
const accessoryMods = z
  .object({
    damage: z.number().optional(),
    range: z.number().optional(),
    /** Random aim error. */
    spread: z.number().optional(),
    /** Extra change to the aim error while aiming down the sights. */
    aimSpread: z.number().optional(),
    /** Recoil kick per shot. */
    recoil: z.number().optional(),
    /** Radius a shot can be heard from. */
    noise: z.number().optional(),
    reloadTime: z.number().optional(),
    /** Extra rounds in the magazine. */
    magazine: z.number().int().optional(),
    /** Extra zoom while aiming (0.3 narrows the view by a further 30%). */
    zoom: z.number().optional(),
  })
  .strict();
export type AccessoryMods = z.infer<typeof accessoryMods>;

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
      /** `auto` fires while the button is held; `semi` once per click. */
      fireMode: z.enum(FIRE_MODES),
      /** Rounds in a full magazine (none for fists and the drone gun, which never run dry). */
      magazine: z.number().int().positive().optional(),
      /** How a shot kicks the aim; leave it out for a gun with no recoil. */
      recoil: z
        .object({
          /** Radians added to the aim error by each shot. */
          kick: nonNegative,
          /** Most the accumulated kick can reach (radians). */
          maxKick: positive,
          /** Radians per second the kick fades. */
          recovery: positive,
          /** 0 to 1: how much of the kick drifts to one side instead of spreading both ways. */
          sideBias: z.number().min(0).max(1),
          /** Camera shake added by each shot (world units, local player only). */
          cameraKick: nonNegative,
        })
        .strict()
        .optional(),
      /** Overrides of the `hits` defaults for this weapon. */
      headMultiplier: positive.optional(),
      critChance: z.number().min(0).max(1).optional(),
      critMultiplier: positive.optional(),
      /** Item id of the ammo it loads from the backpack (an `ammo` item). */
      ammo: z.string().optional(),
      /** Reloads from nothing: the spare magazines never run out (the pistol, at first). */
      infiniteSpare: z.boolean().optional(),
      /** Seconds a reload takes. */
      reloadTime: nonNegative.optional(),
      /** Radius in metres a shot can be heard from (no rule uses it yet). */
      noise: nonNegative,
      /** Which places an accessory can be fitted to. */
      accessorySlots: z.array(z.enum(ACCESSORY_SLOTS)),
      mocked: z.object({ weight: nonNegative }).strict(),
    })
    .strict(),
  /** Ammo: a stack counts rounds; one crate or shop unit gives `pack` rounds. */
  z.object({ ...itemBase, type: z.literal('ammo'), pack: z.number().int().positive() }).strict(),
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
      /** Metres from the blast centre inside which enemies, allies and vehicles are hurt. */
      blastRadius: positive,
      /** Damage at the centre; it drops linearly towards the edge by `falloff` (0 to 1). */
      blastDamage: positive,
      falloff: z.number().min(0).max(1),
      /** Seconds from the throw to the blast (never before it lands). */
      fuse: nonNegative,
      /** Furthest point (metres) a thrower can reach; farther targets are clamped to it. */
      throwRange: positive,
      mocked: z.object({ weight: nonNegative }).strict(),
    })
    .strict(),
  z
    .object({
      ...itemBase,
      type: z.literal('defibrillator'),
      /** Seconds a standing carrier must stay next to the body, and how long after death it works. */
      channelTime: positive,
      reviveWindow: positive,
      mocked: z.object({ weight: nonNegative }).strict(),
    })
    .strict(),
  z
    .object({
      ...itemBase,
      type: z.literal('accessory'),
      slot: z.enum(ACCESSORY_SLOTS),
      /** Each number is a fraction added to the weapon's own value (-0.1 = 10% less), except `magazine` (rounds). */
      modifiers: accessoryMods,
      mocked: z.object({ weight: nonNegative }).strict(),
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
      if (item.type === 'weapon' && item.ammo && data.items[item.ammo]?.type !== 'ammo') {
        ctx.addIssue({ code: 'custom', message: `weapon "${id}" needs "${item.ammo}" to be ammo` });
      }
      if (item.type === 'weapon' && item.magazine && !item.ammo && !item.infiniteSpare) {
        ctx.addIssue({ code: 'custom', message: `weapon "${id}" has a magazine but no ammo` });
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
    /** Standing height in metres at size 1 (default `hits.bodyHeight`); the head is its top. */
    height: positive.optional(),
    /** False for an enemy with no head to hit (a worm). */
    headshots: z.boolean().optional(),
    /** An acrobat: while it runs at the squad it hops up and sideways every so often. */
    acrobat: z
      .object({
        /** It only hops while its target is closer than this (metres). */
        range: positive,
        /** Seconds between hops (varied by up to 30% either way). */
        interval: positive,
        /** Seconds a hop lasts, and how fast it moves sideways and how high it jumps. */
        duration: positive,
        sideSpeed: nonNegative,
        height: nonNegative,
      })
      .strict()
      .optional(),
    /** A wanderer: roams near where it spawned until it notices the squad, then chases for good. */
    wander: z
      .object({
        /** How far from its home it roams (metres) and its walking speed as a fraction of `speedScale`. */
        roamRadius: positive,
        speedScale: positive,
        /** Seconds it stands between two roam walks. */
        pauseMin: nonNegative,
        pauseMax: nonNegative,
        /** A soldier this close wakes it, seen or not. */
        senseRadius: positive,
        /** A soldier this close, in front of it and with a clear line, wakes it. */
        sightRadius: positive,
        /** Half-angle (radians) of the cone it sees in. */
        sightArc: positive,
        /** The ones this close to an alerted wanderer wake with it. */
        shoutRadius: nonNegative,
      })
      .strict()
      .optional(),
    /** A climber walks over obstacles up to this high (water and cliffs still stop it). */
    climber: z.object({ maxHeight: positive }).strict().optional(),
  })
  .strict();

/** A drivable vehicle type (arcade handling). Seat 0 is the driver's. */
const vehicleType = z
  .object({
    name: z.string().min(1),
    health: positive,
    maxSpeed: positive,
    accel: positive,
    /** Radians per second the hull can turn. */
    turnRate: positive,
    /** Collision radius of the hull. */
    radius: positive,
    seats: z.number().int().positive(),
    /** Passengers shoot from a vehicle with mounted weapons (a Humvee), not from a plain car. */
    passengersShoot: z.boolean(),
    /** How close (beyond the hull) a soldier must be to climb in. */
    enterRange: positive,
    /** Damage per second to enemies under the hull, above `ramSpeed`. */
    ramDps: nonNegative,
    ramSpeed: nonNegative,
  })
  .strict();

const difficultyScale = z.object({ health: positive, speed: positive, count: positive }).strict();

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
    /** Hazards of the map. Fire hurts every soldier on foot and every enemy inside its radius. */
    hazards: z
      .object({
        fire: z
          .object({
            /** Damage per second to anything inside. */
            dps: positive,
            /** Radius of one fire (metres). */
            radius: positive,
          })
          .strict(),
      })
      .strict(),
    /** Thrown grenades (the blast numbers are on the item in data/items.json). */
    grenades: z
      .object({
        /** Horizontal speed of a throw (metres per second); sets the flight time. */
        throwSpeed: positive,
        /** Height of the hand at release (metres above the thrower's feet). */
        releaseHeight: positive,
        gravity: positive,
        /** Seconds before the thrower can fire or throw again. */
        cooldown: nonNegative,
        /** Share of the blast damage that hurts allies, including the thrower (0 = none). */
        friendlyFire: z.number().min(0).max(1),
      })
      .strict(),
    /** How well units hit: the weapon's `spread` is its worst case, these scale it down or up. */
    accuracy: z
      .object({
        /** Extra spread per unit of speed (1 = walking speed): spread x (1 + this x speed). */
        movementSpread: nonNegative,
        /** Weapon-class skill level at which the best accuracy is reached, and its spread scale. */
        skillMaxLevel: z.number().int().min(2),
        skillBestScale: positive,
        /** Standing still this many seconds earns the scale below (top-down and AI patience). */
        standStillTime: nonNegative,
        standStillScale: positive,
        /** While aiming down the sights: spread, recoil and walking speed scales, and the view zoom. */
        aimSpreadScale: positive,
        aimRecoilScale: positive,
        aimSpeedScale: positive,
        aimZoom: z.number().min(0.3).max(1),
        /** Crouching also tames recoil. */
        crouchRecoilScale: positive,
        /** Smallest random aim error (radians) of a gun that has any spread. */
        minError: nonNegative,
      })
      .strict(),
    /** Headshots and critical hits; the higher of the two multipliers applies, never both. */
    hits: z
      .object({
        /** Enemy height in metres at size 1, and the top fraction of it that counts as the head. */
        bodyHeight: positive,
        headFraction: z.number().min(0.05).max(0.5),
        headMultiplier: positive,
        /** Chance of a head hit when the view gives no hit height (top-down, the AI). */
        headChance: z.number().min(0).max(1),
        /** Scale while aiming, bonus per weapon-skill level above 1, and loss per radian of aim error. */
        headChanceAim: positive,
        headChanceSkill: nonNegative,
        headErrorPenalty: nonNegative,
        critChance: z.number().min(0).max(1),
        critMultiplier: positive,
        /** Extra crit chance per weapon-skill level above 1. */
        critSkillBonus: nonNegative,
      })
      .strict(),
    /** Ammo and reloading (the magazine, reload time and calibre are on each weapon). */
    ammo: z
      .object({
        /** Seconds before the next trigger pull after an empty click. */
        dryFireDelay: positive,
      })
      .strict(),
    /** Melee strikes (F): a short blow in front of the unit that shoves the enemy back. */
    melee: z
      .object({
        /** Seconds before the unit can strike or fire again; shared with shooting. */
        cooldown: positive,
        /** Half-angle (radians) of the cone in front of the unit that a blow reaches. */
        arc: z.number().min(0.1).max(Math.PI),
        /** Damage and reach (metres from the enemy's edge) of hitting with a gun in hand. */
        bashDamage: nonNegative,
        bashRange: positive,
        /** How far (metres) a blow shoves an ordinary enemy; heavier ones move less. */
        push: nonNegative,
        /** Seconds the enemy loses (no moving, no biting) after being hit. */
        stagger: nonNegative,
        /** Share of the push a mini boss still feels. */
        bossPushScale: z.number().min(0).max(1),
        /** An AI soldier strikes an enemy this close (metres from its edge) instead of shooting. */
        aiRange: positive,
      })
      .strict(),
    /** Dragging a downed or dead ally by the shoulders. */
    drag: z
      .object({
        /** How close (metres) a soldier must be to grab a body. */
        range: positive,
        /** Distance (metres) the body trails behind. */
        ropeLength: positive,
        /** Speed of the dragger against normal walking. */
        speedScale: positive,
      })
      .strict(),
    /** Harmless wandering animals by id (placed in the editor under Units > Animals). */
    animals: z.record(
      z.string(),
      z
        .object({
          name: z.string().min(1),
          speed: positive,
          radius: positive,
          /** How far from where it was placed it strolls (metres). */
          wanderRadius: positive,
          /** Seconds it stands still between walks, chosen between these two. */
          pauseMin: nonNegative,
          pauseMax: nonNegative,
        })
        .strict(),
    ),
    /** Drivable vehicle types by id (placed in the editor, entered with V). */
    vehicles: z.record(z.string(), vehicleType),
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
        /** The tallest box (metres) a unit can vault onto, and the stamina the vault costs. */
        climbMaxHeight: positive,
        climbStamina: nonNegative,
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
    /** A soldier at zero health goes down instead of dying (see sim/revive.ts). */
    downed: z
      .object({
        /** Seconds a downed soldier lives, unless revived. */
        bleedOut: positive,
        /** Seconds of bleed-out each point of damage to a downed soldier takes away. */
        damageBleed: nonNegative,
        /** Crawl speed, as a fraction of walking speed. */
        crawlSpeedScale: positive,
        /** Aim error added to a one-handed weapon fired from the floor (radians). */
        extraSpread: nonNegative,
        /** An ally this close with a medkit starts reviving; also how close a rescuer walks. */
        reviveRange: positive,
        /** Seconds an ally needs with a medkit. */
        reviveTime: positive,
        /** Health fraction of a soldier brought back by a defibrillator. */
        defibHealth: z.number().min(0).max(1),
        /** Enemies see a downed soldier this many times farther away than a standing one. */
        targetDistanceScale: z.number().min(1),
      })
      .strict(),
    gore: z.object({ explodeChance: z.number().min(0).max(1) }).strict(),
    wander: z
      .object({
        /** Shots wake wanderers within `noiseMetres` per point of the weapon's noise (off until balanced). */
        noiseAttracts: z.boolean(),
        noiseMetres: positive,
        /** Seconds after a wave has finished spawning before its sleeping wanderers wake up anyway. */
        wakeDelay: positive,
      })
      .strict(),
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
    /** Multipliers on enemy health, speed and wave size for the map's difficulty. */
    difficulty: z
      .object({ easy: difficultyScale, normal: difficultyScale, hard: difficultyScale })
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
export type Obstacle = {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  /** Open water or a cliff (ground too steep to walk): stops walkers but not bullets. */
  water?: boolean;
};
/** The playfield the sim runs on, derived from the map (see `arenaOf`). */
export type Arena = {
  halfSize: number;
  obstacles: Obstacle[];
  terrain: MapData['terrain'];
  surfaces: MapData['surfaces'];
};
/** The balance numbers of game.json plus the arena of the chosen map. */
export type GameConfig = z.infer<typeof GameConfigSchema> & {
  arena: Arena;
  /** The players of the map (who owns what, and the teams). */
  players: MapData['players'];
  /** Units placed on the map; the squad and the starting enemies come from here when present. */
  placed: MapData['units'];
  /** The map's difficulty: multipliers on enemy health, speed and wave size. */
  level: z.infer<typeof difficultyScale>;
  /** Where enemies appear; empty = along the map edge. */
  spawnPoints: SpawnPoint[];
  /** Story goals; empty in waves maps and in story maps that set none. */
  objectives: Objective[];
  /** Where the map's fires burn. */
  fires: Vec2[];
  /** Story missions: shown on a card when the mission starts. */
  briefing?: string | undefined;
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

type GlobalRules = Pick<
  z.infer<typeof GameConfigSchema>,
  'waves' | 'boss' | 'enemies' | 'difficulty'
>;
type MapRules = Pick<
  GameConfig,
  'waves' | 'boss' | 'enemies' | 'level' | 'spawnPoints' | 'objectives' | 'briefing' | 'fires'
>;

/**
 * The wave, enemy and boss rules of one map: the global ones of game.json with the map's overrides
 * on top. Returns new objects, so `global` can be reused for the next map. Unknown enemy ids in
 * the map are ignored.
 */
export function mapRules(
  global: GlobalRules,
  logic: MapLogic,
  units: MapData['units'] = [],
): MapRules {
  let enemies = global.enemies;
  if (logic.enemies) {
    enemies = {};
    for (const [id, over] of Object.entries(logic.enemies)) {
      const base = global.enemies[id];
      if (base) enemies[id] = { ...base, ...over };
    }
  }
  const boss = { ...global.boss, ...logic.boss };
  if (logic.boss?.enabled === false) boss.everyWaves = Number.POSITIVE_INFINITY;
  boss.types = boss.types.filter((t) => t === 'zombie' || t in enemies);
  if (boss.types.length === 0) boss.types = ['zombie'];
  return {
    waves: {
      ...global.waves,
      ...logic.waves,
      baseWeight: logic.zombieWeight ?? global.waves.baseWeight,
    },
    boss,
    enemies,
    level: global.difficulty[logic.difficulty ?? 'normal'],
    spawnPoints: [
      ...(logic.spawnPoints ?? []),
      // A placed spawner is a spawn point of its enemy type, carrying the unit's changes.
      ...units.flatMap((u) => {
        const enemy = spawnerEnemy(u.type);
        return enemy ? [{ x: u.x, z: u.z, enemy, loadout: u }] : [];
      }),
    ],
    objectives: logic.mode === 'story' ? (logic.objectives ?? []) : [],
    briefing: logic.mode === 'story' ? logic.briefing : undefined,
    fires: logic.fires ?? [],
  };
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
    ...mapRules(game, map.logic, map.units),
    arena: arenaOf(map),
    players: map.players,
    placed: map.units,
    units: UnitsSchema.parse(units),
    items: catalog,
  };
}
