# 2026-10-18 — Phase 1: map format and Map 1

Branch `feat/map-format` (from `main` at `6c7429f`, after PRs #33 and #34).

- `MapSchema` (zod, strict, `version: 1`) in `src/sim/config.ts`: `meta` (id, name, author, dates, square size), `terrain` (heights / water / paint, all `null` for now), `props` (asset, position, rotation, scale, layer, optional box `collider`), `surfaces`, `players`, `units` (each with an `owner` that must be a known player), `logic` (`waves` / `story`). `parseMap` and `arenaOf(map)` (half size plus the props that have a collider) live next to it.
- `data/maps/map-1.json` is the old `arena` of `data/game.json` (80×80, 15 obstacles, now props with a `block` asset and a collider). `game.json` no longer has `arena`.
- `parseConfig(raw, map)` validates the balance numbers and attaches `arena: arenaOf(map)`, so `GameConfig.arena` keeps its shape and sim and renderer code did not change. `main.ts` loads Map 1; `tests/sim/helpers.ts` and `config.test.ts` pass the map in.
- The game plays exactly as before (same obstacles, same size). The 48 tests stay green; lint, format, typecheck, build and the asset check pass.
- Not read yet by anything: `terrain`, `surfaces`, `players`, `units`, `logic`, and the props' `rotation`, `scale`, `layer` (the renderer still draws every collider as a plain box).
