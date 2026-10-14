import { z } from 'zod';

const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

const obstacle = z
  .object({ x: z.number(), z: z.number(), halfW: positive, halfD: positive })
  .strict();

/** Schema for data/game.json. Strict so typos in data files fail loudly. */
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
  .strict();

export type GameConfig = z.infer<typeof GameConfigSchema>;
export type Obstacle = GameConfig['arena']['obstacles'][number];

export const parseConfig = (raw: unknown): GameConfig => GameConfigSchema.parse(raw);
