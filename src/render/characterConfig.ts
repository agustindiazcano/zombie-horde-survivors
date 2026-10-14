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
    /** States whose clip plays once and holds its last frame (e.g. death). */
    once: z.array(z.string()),
  })
  .strict();

/** Schema for data/characters.json: the single place states are mapped to clip names. */
export const CharactersConfigSchema = z
  .object({ player: characterSpec, zombie: characterSpec })
  .strict();

export type CharacterSpec = z.infer<typeof characterSpec>;
export type CharactersConfig = z.infer<typeof CharactersConfigSchema>;

export const parseCharactersConfig = (raw: unknown): CharactersConfig =>
  CharactersConfigSchema.parse(raw);
