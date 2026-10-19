# 2026-10-18 — Phase 2: menu flow

Branch `feat/menu-flow`, cut from `feat/downed-state` (`main` was still at `6c7429f`: the five stacked branches `feat/map-format`, `feat/unit-stats`, `feat/items-equipment`, `feat/downed-state` and this one must be merged **in order**). The 48 tests and every static check pass; no new tests.

- `MainMenu` is now a small screen machine: title → **mode** (Single Player / Multiplayer / Editor) → **single** (Story / Waves) → **story** (empty message) or **maps** (the map list). "← Back" and `Esc` step back; Enter / Space work through the focused native button.
- **Multiplayer** is a disabled button ("Coming soon").
- **Map list** (`src/maps.ts`, `listMaps()`): reads every `data/maps/*.json` through `parseMap`, Map 1 first, with name, size and a Built-in / Saved badge. Built-in maps have `deletable: false` and no delete button exists (saved maps arrive in phase 4).
- The picked map is passed to `onPlay` but ignored: the sim and renderer are built once from Map 1, the only map. Phase 4 must rebuild config and renderer from the chosen map.
- Best score per map (planned in the list) is not shown: the saved best is still one global number.
- On phones the Editor option is disabled ("Desktop only").
