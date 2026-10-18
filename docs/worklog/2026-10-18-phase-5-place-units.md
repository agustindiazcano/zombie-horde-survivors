# 2026-10-18 — Phase 5: place units and assets

Branch `feat/place-units`, cut from `feat/save-maps` (seventh in the stack; PRs go in order). 48 tests and all checks pass; nothing seen in a browser.

- `data/catalog.json` items are now `{ id, name, mocked? }`. Placeable: Soldier, Drone, the six enemy types plus Zombie and Infected marine, and the Block asset. Civilian and Mini boss are listed but disabled (no sim rule).
- Editor (Units / Assets tabs): click an entry to arm it, click the map to place (right-click or Esc drops the tool). With no tool, click selects (units first, then props), drag moves (props snap to 0.5), `R` rotates (units 45°, props 90°), `Delete` / `Backspace` removes. A yellow ring (`GameRenderer.setEditMarker`) marks the selection; an info line at the panel bottom says what is selected.
- Undo / redo (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`, and the bar buttons): immutable maps, 100 steps, one drag is one step. New / Open / Import / Save start a fresh history.
- Every edit calls `onMapChange` → `loadMap`, so the real models are what you see while editing. `GameRenderer.resetUnits` drops unit views on each load because ids are reused with other types.
- Sim: `mapUnit.rotation` (optional), `config.placed` (the map's units). `createSquad` builds the squad from placed soldiers / drones owned by the human player (else the default ring); `createGame` spawns placed enemies owned by the AI player. `arenaOf` swaps a collider's sides on a quarter turn. `newUnit` in `soldiers.ts` replaced two copy-pasted unit literals.
- Play spawns the placed units; Stop returns to the editor.
- Not done: scale of props, other owners than the first human / AI player, hold flag, thumbnails.
