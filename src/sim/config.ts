import { z } from 'zod';

const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

const obstacle = z
  .object({ x: z.number(), z: z.number(), halfW: positive, halfD: positive })
  .strict();

/** Schema for data/game.json. Strict so typos in data files fail loudly. */
const weaponDef = z
  .object({
    name: z.string().min(1),
    fireRate: positive,
    damage: positive,
    range: positive,
    /** Random aim error, in radians (each side). */
    spread: nonNegative,
  })
  .strict();

/** What a perk improves for the whole squad. `amount` is a fraction per stack, except regen (HP/s). */
const perkStat = z.enum(['damage', 'fireRate', 'speed', 'maxHealth', 'regen', 'pickupRadius']);

const perk = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
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
    kind: z.enum(['heal', 'revive', 'weapon', 'perk']),
    /** Weapon id for 'weapon', perk id for 'perk'. */
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
    arena: z.object({ halfSize: positive, obstacles: z.array(obstacle) }).strict(),
    /** Stats shared by every soldier. */
    player: z.object({ speed: positive, maxHealth: positive, radius: positive }).strict(),
    squad: z
      .object({
        /** Soldiers at the start of a game. */
        count: z.number().int().positive(),
        /** Radius around the leader where followers hold position. */
        followDistance: positive,
        /** AI soldiers engage zombies within this distance (and line of sight). */
        aiRange: positive,
        /** AI fire rate as a fraction of the weapon fire rate. */
        aiFireRateScale: positive,
      })
      .strict(),
    /** A flying support unit: slow, hard-hitting shots; ignores cover; zombies can't hurt it. */
    drone: z
      .object({
        count: z.number().int().nonnegative(),
        speed: positive,
        height: positive,
        fireRate: positive,
        damage: positive,
        range: positive,
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
    gore: z.object({ explodeChance: z.number().min(0).max(1) }).strict(),
    inventory: z.object({ backpackSlots: z.number().int().positive() }).strict(),
    /** Droppable weapons by id. 'rifle' (the `weapon` section) and the drone cannon are built in. */
    weapons: z.record(z.string(), weaponDef),
    drops: z
      .object({
        /** Chance (0..1) that a killed zombie drops a crate. */
        chance: z.number().min(0).max(1),
        minItems: z.number().int().positive(),
        maxItems: z.number().int().positive(),
        /** How close a unit must be to open or use a crate. */
        pickupRange: positive,
        maxCrates: z.number().int().positive(),
        table: z.array(z.object({ weapon: z.string(), weight: positive }).strict()).min(1),
      })
      .strict(),
    weapon: z.object({ fireRate: positive, damage: positive, range: positive }).strict(),
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
      if (item.kind === 'weapon' && !(item.target && item.target in cfg.weapons)) {
        ctx.addIssue({
          code: 'custom',
          message: `shop item "${item.id}" needs a valid weapon target`,
        });
      }
    }
    for (const entry of cfg.drops.table) {
      if (entry.weapon !== 'rifle' && !(entry.weapon in cfg.weapons)) {
        ctx.addIssue({
          code: 'custom',
          message: `drops.table references unknown weapon "${entry.weapon}"`,
        });
      }
    }
  });

export type GameConfig = z.infer<typeof GameConfigSchema>;
export type Obstacle = GameConfig['arena']['obstacles'][number];

export const parseConfig = (raw: unknown): GameConfig => GameConfigSchema.parse(raw);
