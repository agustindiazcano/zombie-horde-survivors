/** The prop assets of the texture lab (Map 11). Names only: the shapes and shaders are in src/render. */

/** Walls with a carved, parallax-mapped surface: the asset is `pom_<kind>`. */
export const POM_WALL_KINDS = [
  'brick',
  'stone',
  'plates',
  'concrete',
  'wood',
  'corrugated',
  'scifiwall',
  'alienwall',
] as const;

/** Floor slabs, low enough to step onto: the asset is `pom_<kind>`. */
export const POM_FLOOR_KINDS = [
  'cobble',
  'metal',
  'scififloor',
  'alienfloor',
  'dirt',
  'sand',
  'wet',
  'road',
] as const;

export type PomKind = (typeof POM_WALL_KINDS)[number] | (typeof POM_FLOOR_KINDS)[number];

/** Panes of glass in a frame: the asset is `glass_<kind>`. */
export const GLASS_KINDS = ['clear', 'blue', 'green', 'smoke', 'frosted', 'cracked'] as const;
export type GlassKind = (typeof GLASS_KINDS)[number];

/** Glass you can see through (sight crosses it; bodies and bullets do not). */
export const SEE_THROUGH_GLASS: readonly GlassKind[] = ['clear', 'blue', 'green', 'cracked'];

export const WALL_PROP_HEIGHT = 3.2;
export const FLOOR_PROP_HEIGHT = 0.2;
export const GLASS_PROP_HEIGHT = 2.6;

/** Height (m) of each lab asset, for the collider and the line of sight. */
export const LAB_PROP_HEIGHTS: Record<string, number> = {
  ...Object.fromEntries(POM_WALL_KINDS.map((k) => [`pom_${k}`, WALL_PROP_HEIGHT])),
  ...Object.fromEntries(POM_FLOOR_KINDS.map((k) => [`pom_${k}`, FLOOR_PROP_HEIGHT])),
  ...Object.fromEntries(GLASS_KINDS.map((k) => [`glass_${k}`, GLASS_PROP_HEIGHT])),
  siren: 2.6,
  police_car: 1.9,
};
