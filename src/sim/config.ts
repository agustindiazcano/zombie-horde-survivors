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
    player: z.object({ speed: positive, maxHealth: positive, radius: positive }).strict(),
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
      })
      .strict(),
  })
  .strict();

export type GameConfig = z.infer<typeof GameConfigSchema>;
export type Obstacle = GameConfig['arena']['obstacles'][number];

export const parseConfig = (raw: unknown): GameConfig => GameConfigSchema.parse(raw);
