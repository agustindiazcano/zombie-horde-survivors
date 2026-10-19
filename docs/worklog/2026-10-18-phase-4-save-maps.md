# 2026-10-18 — Phase 4: save / load maps

Branch `feat/save-maps`, cut from `feat/menu-flow` (sixth in the stack; PRs go in order). 48 tests and all checks pass; nothing seen in a browser.

- `src/maps.ts` is the map store: built-in maps (`data/maps/*.json`) plus saved ones in localStorage (`zombie-horde-survivors.maps`, an array validated with `parseMap`; a corrupt entry is skipped). `listMaps()` returns Map 1 first, then built-in, then saved; each entry carries its `MapData`. `saveMap`, `deleteMap` (refuses built-in), `blankMap`, `exportMap` (`.json` download), `importMapFile` / `pickMapFile` (id clashes get a new id).
- Saving a built-in map (Map 1) stores a **copy** with a new id; shipped maps are never overwritten.
- Single Player > Waves list shows saved maps with a "Saved" badge and a 🗑 delete button (confirm); "Import a map file…" at the bottom. Picking a map now loads it: `main.ts` `loadMap` edits the shared `config.arena` / `config.players` in place, calls the new `GameRenderer.setArena` (swaps floor, walls, obstacles, shadow camera) and restarts the run.
- Editor bar: **New** (blank 80×80, same players as Map 1), **Open** (dialog with every map), **Save** (asks for a name), **Export**, **Import**; the editor opens on a blank map, and every map change is loaded into the 3D view. Undo / Redo stay disabled.
- Nothing in a map can be edited yet, so a saved map is its metadata (name) plus whatever it already held; props and units arrive in phase 5. To promote a map into the game: Export, then commit the file into `data/maps/`.
- Not done: best score per map (still one global number), map thumbnails.
