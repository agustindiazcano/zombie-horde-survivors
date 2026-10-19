# 2026-10-18 — Phase 3: editor skeleton

Same branch (`feat/menu-flow`). 48 tests and all checks pass; nothing seen in a browser.

- `src/editor.ts` / `editor.css`: top bar (**← Menu**, **▶ Play**, New / Open / Save / Export / Undo / Redo disabled with the tooltip "Not built yet") and a right panel with five tabs: **Units**, **Assets** (collapsible groups from `data/catalog.json`, zod-validated; Vehicles nest Military / Civil × Air / Sea / Land), **Terrain** (brush buttons and sliders), **Game logic** (mode, difficulty, empty collapsible sections) and **Players** (the two players of Map 1). Clicking an entry only highlights it.
- The editor opens **paused** on Map 1 in RTS mode (WASD pans, wheel / right-drag move the camera as in RTS). While editing the game is frozen (`modalOpen`), keyboard shortcuts are off, and the HUD, squad bar and radar are hidden (`body.editing`).
- **Play** starts a fresh run of the map and hides the panel, leaving only a **■ Stop** button; **Stop** resets the run and returns to the paused editor. `← Menu` goes back to the main menu.
- `main.ts`: new `resetGame()` (also used by restart) and `openEditor()`; the window `blur` no longer pauses while editing.
- Not built: anything inside the tabs, new / open / save (phase 4), placing units (phase 5).
