import { z } from 'zod';
import terrainJson from '../data/terrain.json';

const entry = z.object({ id: z.string(), name: z.string(), color: z.string() }).strict();

/** Ground textures, road strips and water look (`data/terrain.json`); read by the renderer and the editor. */
export const terrainData = z
  .object({
    defaultTexture: z.string(),
    textures: z.array(entry).min(1),
    roads: z.array(entry).min(1),
    water: z.object({ color: z.string(), opacity: z.number() }).strict(),
    minHeight: z.number(),
    maxHeight: z.number(),
  })
  .strict()
  .parse(terrainJson);

/** The colour of a texture or road id; unknown ids fall back to the default ground. */
export function textureColor(id: string): string {
  const all = [...terrainData.textures, ...terrainData.roads];
  const fallback = terrainData.textures.find((t) => t.id === terrainData.defaultTexture);
  return (all.find((t) => t.id === id) ?? fallback ?? all[0]!).color;
}
