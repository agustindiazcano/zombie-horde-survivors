# 2026-10-20 — W0: soldiers walk round structures and through doors

Branch `feat/soldier-structure-pathing`. Soldiers on foot (not the drone, not the unit under direct control) used to walk in straight lines and slide along whatever they met, so they jammed on walls the player built.

## What changed

- `walkTarget` in `src/sim/flowfield.ts`: with a clear straight way the soldier heads straight; otherwise it follows the next cell of the shortest walk, from a field the soldier owns (searched again when its destination moves to another cell, at most every 0.3 s). Used by every AI order that walks: move, follow, board, interact, build and rescue.
- A separate **ally grid**: structures are walls (soldiers cannot break them) and closed doors are open ground. The grid is cached per obstacle list and dropped by `invalidateFlow`.
- Doors: `Arena.doors` (set by `syncStructures`) lists every built door, open or closed, and the ally grid clears the cells of each so a gap narrower than the neighbouring walls' clearance can be walked. `openDoorAhead` (in `structures.ts`) opens a closed door the soldier is about to enter (1 m ahead). Doors stay open afterwards (as when opened with E).
- Obstacle boxes of structures carry `structure.door`.

## Checked

A throwaway sim (deleted, no new tests): a soldier ordered across a wall 24 m long walks round it and arrives; across a wall of structures with a door it walks straight to the door, opens it and passes. The 48 tests, lint, format, typecheck, build and the asset check pass.

## Known limits

- Not seen in a browser. The unit under direct control still collides as before (the player steers it).
- Cell-centre steering gives slightly angular paths; the target must be reachable on the grid (a destination inside a wall falls back to the old straight walk).
- Doors are never closed again by the AI; enemies can follow through. Narrow zombie gaps at open doors are not changed.
