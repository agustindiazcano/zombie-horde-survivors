# 2026-10-18 — Phase 1e: downed state

Branch `feat/downed-state`, cut from `feat/items-equipment` (the four stacked branches `feat/map-format`, `feat/unit-stats`, `feat/items-equipment` and this one must be merged in order). The 48 tests and every static check pass; no new tests, by the user's decision.

The rules are the user's answers of 2026-10-18 (plan section 8):

| Rule          | Decision                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bleed-out     | 30 s (`downed.bleedOut`)                                                                                                                                           |
| Who revives   | Only a standing soldier carrying a **medkit**; without one the downed soldier dies when the timer ends                                                             |
| Enemies       | Prefer standing soldiers: a downed one counts as 3 times farther away (`targetDistanceScale`); each hit on it takes 0.3 s per HP off its bleed-out (`damageBleed`) |
| Game over     | When no soldier is left on their feet (all downed or dead; the drone does not count)                                                                               |
| Defibrillator | Revives a soldier who died less than 30 s ago, after a 4 s channel next to the body; always works, one use                                                         |

- Sim: `Soldier` has `downed`, `bleedOut`, `deadTime`, `reviveProgress`. At 0 health a soldier goes down (`soldierDowned` event) instead of dying; the drone still just dies. `hurtSoldier(state, config, ...)` and `killSoldier` in `soldiers.ts`.
- A downed soldier cannot stand: it crawls at 20% speed (only a controlled one), cannot jump, and shoots only a one-handed gun with `downed.extraSpread` added (a two-handed weapon will not fire from the floor, in `weaponOf`). AI soldiers stay put and shoot.
- `src/sim/revive.ts`: revives are automatic. A standing soldier with a medkit within `downed.reviveRange` of a downed ally for `downed.reviveTime` (3 s) spends the kit and stands the ally up with the kit's `heal` health; with a defibrillator it does the same for a recently dead ally (`soldierRevived` event). AI soldiers on `follow` walk to a patient they can help (`rescueTarget`).
- The shop "Field kit" and the regen perk skip downed soldiers; the shop "Reinforcement" still brings back a dead one.
- To make this reachable, medkits S / M (weights 2 and 1) and the defibrillator (0.6) joined the crate table, and the shop sells Medkit (S) 25 gold, Medkit (M) 45 gold and a Defibrillator 90 gold (x1.3 per purchase). This changes the crate odds a little; the numbers are in `data/game.json`.
- `data/items.json`: the defibrillator's `channelTime` and `reviveWindow` are active fields now (`successChance` is gone: it always works).
- UI: a downed soldier lies in the death pose, its chip is greyed, the HUD line says "DOWN", the squad screen shows "(down N s)". No crawl animation (the models only have idle / run / death).
- Not done: a manual revive key, reviving without a medkit, the downed soldier being carried or dragged (phase 8b), bleeding visuals.
