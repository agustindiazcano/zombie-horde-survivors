import { z } from 'zod';

const characterSpec = z
  .object({
    /** Path under public/ (e.g. "models/soldier.glb"), or null to use the primitive placeholder. */
    model: z.string().nullable(),
    scale: z.number().positive(),
    /** Extra yaw (radians) so the model's forward axis matches +z. */
    yawOffset: z.number(),
    /** Simulation state name -> animation clip name inside the model. */
    clips: z.record(z.string(), z.string()),
    /** For models without animation clips: a code-driven motion. */
    procedural: z.enum(['wiggle', 'hover']).optional(),
    /** States whose clip plays once and holds its last frame (e.g. death). */
    once: z.array(z.string()),
  })
  .strict();

/** Schema for data/characters.json: the single place states are mapped to clip names. */
export const CharactersConfigSchema = z
  .object({
    /** One entry per soldier slot (soldier N uses entry N-1, wrapping around). */
    soldiers: z.array(characterSpec).min(1),
    /** Enemy variants by id; must include 'zombie' (the fallback for unknown ids). */
    enemies: z.record(z.string(), characterSpec),
    drone: characterSpec,
  })
  .strict()
  .refine((c) => 'zombie' in c.enemies, { message: 'enemies must include "zombie"' });

export type CharacterSpec = z.infer<typeof characterSpec>;
export type CharactersConfig = z.infer<typeof CharactersConfigSchema>;

export const parseCharactersConfig = (raw: unknown): CharactersConfig =>
  CharactersConfigSchema.parse(raw);
