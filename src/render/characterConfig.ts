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
    /** Height above the ground where the health bar floats (enemies). */
    barHeight: z.number().positive().optional(),
    /** Color multiplied over the model's textures (e.g. sickly green for an infected soldier). */
    tint: z.string().optional(),
    /** 0 to 1: how much blood is painted over the model's texture (stains, splatter, drips). */
    blood: z.number().min(0).max(1).optional(),
    /** The model's head can be shot off: its mesh is split by bone at load (marine models only). */
    dismember: z.boolean().optional(),
    /** Seconds between spurts of blood from the body of a living enemy (a bleeder). */
    spurts: z.number().positive().optional(),
    /** Playback speed of the walk and run clips (1 = as authored); a faster zombie steps quicker. */
    clipSpeed: z.number().positive().optional(),
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
    /** Animal variants by id (dog, cat); states are idle and walk. */
    animals: z.record(z.string(), characterSpec).default({}),
    drone: characterSpec,
  })
  .strict()
  .refine((c) => 'zombie' in c.enemies, { message: 'enemies must include "zombie"' });

export type CharacterSpec = z.infer<typeof characterSpec>;
export type CharactersConfig = z.infer<typeof CharactersConfigSchema>;

export const parseCharactersConfig = (raw: unknown): CharactersConfig =>
  CharactersConfigSchema.parse(raw);
