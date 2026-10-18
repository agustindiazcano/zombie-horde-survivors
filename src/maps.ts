import { parseMap, type MapData } from './sim';

/** One row of the map list. `builtIn` maps ship with the game; saved ones live in localStorage. */
export interface MapEntry {
  id: string;
  name: string;
  author: string;
  width: number;
  depth: number;
  builtIn: boolean;
  /** Story missions and survival maps are listed on different screens. */
  mode: MapData['logic']['mode'];
  /** Built-in maps can never be deleted; saved ones can. */
  deletable: boolean;
  map: MapData;
}

/** The id of the map every other one follows in the list; it is today's development arena. */
export const MAP_1_ID = 'map-1';

const SAVED_KEY = 'zombie-horde-survivors.maps';

const builtInFiles = import.meta.glob('../data/maps/*.json', { eager: true, import: 'default' });

const entryOf = (map: MapData, builtIn: boolean): MapEntry => ({
  id: map.meta.id,
  name: map.meta.name,
  author: map.meta.author,
  width: map.meta.size.width,
  depth: map.meta.size.depth,
  builtIn,
  mode: map.logic.mode,
  deletable: !builtIn,
  map,
});

const builtInMaps = (): MapData[] => Object.values(builtInFiles).map((raw) => parseMap(raw));

/** The maps saved from the editor. A corrupt entry is skipped; storage may be unavailable. */
function loadSaved(): MapData[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((m) => {
      const parsed = tryParseMap(m);
      return parsed ? [parsed] : [];
    });
  } catch {
    return [];
  }
}

function tryParseMap(raw: unknown): MapData | null {
  try {
    return parseMap(raw);
  } catch {
    return null;
  }
}

function writeSaved(maps: MapData[]): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(maps));
  } catch {
    // Storage can be full or blocked; the map just is not kept.
  }
}

/** Every map the player can pick: Map 1 first, then the other built-in ones, then the saved ones. */
export function listMaps(): MapEntry[] {
  const builtIn = builtInMaps()
    .map((m) => entryOf(m, true))
    .sort(
      (a, b) =>
        Number(b.id === MAP_1_ID) - Number(a.id === MAP_1_ID) || a.name.localeCompare(b.name),
    );
  const builtInIds = new Set(builtIn.map((m) => m.id));
  const saved = loadSaved()
    .filter((m) => !builtInIds.has(m.meta.id))
    .map((m) => entryOf(m, false))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...builtIn, ...saved];
}

export const isBuiltIn = (id: string): boolean => builtInMaps().some((m) => m.meta.id === id);

const today = () => new Date().toISOString().slice(0, 10);
const newId = () =>
  `map-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** An empty 80×80 waves map with the same players as Map 1. */
export function blankMap(): MapData {
  const map1 = builtInMaps().find((m) => m.meta.id === MAP_1_ID);
  return parseMap({
    version: 1,
    meta: {
      id: newId(),
      name: 'New map',
      author: '',
      created: today(),
      updated: today(),
      size: { width: 80, depth: 80 },
    },
    terrain: { heights: null, water: null, paint: null },
    props: [],
    surfaces: [],
    players: map1?.players ?? [],
    units: [],
    logic: { mode: 'waves' },
  });
}

/**
 * Saves a map in the browser. A built-in map (or a name clash with one) is kept as a copy with a
 * new id, so shipped maps are never overwritten. Returns the map as saved.
 */
export function saveMap(map: MapData, name: string): MapData {
  const copy = isBuiltIn(map.meta.id);
  const saved: MapData = {
    ...map,
    meta: {
      ...map.meta,
      id: copy ? newId() : map.meta.id,
      name: name.trim() || map.meta.name,
      updated: today(),
    },
  };
  const others = loadSaved().filter((m) => m.meta.id !== saved.meta.id);
  writeSaved([...others, saved]);
  return saved;
}

/** Deletes a saved map; built-in maps are refused. */
export function deleteMap(id: string): boolean {
  if (isBuiltIn(id)) return false;
  writeSaved(loadSaved().filter((m) => m.meta.id !== id));
  return true;
}

/** Offers the map as a `.json` download (to commit it into `data/maps/` or share it). */
export function exportMap(map: MapData): void {
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${map.meta.id}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Reads a map file the player picked and saves it; throws a readable error if it is not a map. */
export async function importMapFile(file: File): Promise<MapData> {
  let map: MapData;
  try {
    map = parseMap(JSON.parse(await file.text()));
  } catch (e) {
    throw new Error(
      `"${file.name}" is not a valid map file (${(e as Error).message.slice(0, 120)})`,
      { cause: e },
    );
  }
  const clash = isBuiltIn(map.meta.id) || loadSaved().some((m) => m.meta.id === map.meta.id);
  const imported = clash ? { ...map, meta: { ...map.meta, id: newId() } } : map;
  writeSaved([...loadSaved(), imported]);
  return imported;
}

/** Opens the system file picker for a `.json` map. */
export function pickMapFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
