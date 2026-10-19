import { parseMap } from './sim';

/** One row of the map list. `builtIn` maps ship with the game; saved ones (phase 4) live in localStorage. */
export interface MapEntry {
  id: string;
  name: string;
  author: string;
  width: number;
  depth: number;
  builtIn: boolean;
  /** Built-in maps can never be deleted; saved ones can. */
  deletable: boolean;
}

/** The id of the map every other one follows in the list; it is today's development arena. */
export const MAP_1_ID = 'map-1';

const builtInFiles = import.meta.glob('../data/maps/*.json', { eager: true, import: 'default' });

/** Every map the player can pick, Map 1 first. */
export function listMaps(): MapEntry[] {
  const entries = Object.values(builtInFiles).map((raw) => {
    const map = parseMap(raw);
    return {
      id: map.meta.id,
      name: map.meta.name,
      author: map.meta.author,
      width: map.meta.size.width,
      depth: map.meta.size.depth,
      builtIn: true,
      deletable: false,
    };
  });
  return entries.sort(
    (a, b) => Number(b.id === MAP_1_ID) - Number(a.id === MAP_1_ID) || a.name.localeCompare(b.name),
  );
}
