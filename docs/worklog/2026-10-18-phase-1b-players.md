# 2026-10-18 — Phase 1b: players and unit ownership

Same branch as phase 1 (`feat/map-format`). The game plays as before; the 48 tests and every static check pass.

- `Player` (id, name, kind `human` / `ai`, team, color, `controlledId`) in `src/sim/types.ts`. `GameState` has `players` and `localPlayerId`; the old global `controlledId` is now `localPlayer(state).controlledId`, so control state is per player (the AI's stays null).
- Every `Soldier` and `Zombie` has an `owner` (player id): the squad and drone belong to the first human player, enemies to the first AI player.
- `src/sim/players.ts`: `localPlayer`, `firstPlayerOf`, `isHostile` (different teams). `isHostile` is not used by the sim yet: shooting and chasing still assume humans versus the horde.
- Map 1 now declares two players: `p1` (human, team 0) and `horde` (AI, team 1). `GameConfig.players` comes from the map; a waves map must have at least one human and one AI player (schema check).
- Still global, to split when a second human or AI side really exists: `stance`, gold, XP, perks, the shop, game over (all soldiers dead), the RTS selection in `rts.ts` and the `units` section of the map (the squad is still built from `squad.count`).
