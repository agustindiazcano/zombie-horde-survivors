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
      })
      .strict(),
    waves: z
      .object({
        baseCount: z.number().int().positive(),
        countPerWave: z.number().int().nonnegative(),
        spawnInterval: nonNegative,
        intermission: nonNegative,
        maxAlive: z.number().int().positive(),
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
