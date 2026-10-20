# 2026-10-19: build mode, test maps, hunter AI

Branch `feat/build-mode` (from `main` at `860abc5`). Nothing was seen in a browser by Claude.

## Built

| Piece                   | Where                                                   | Notes                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Structure types in JSON | `data/game.json` `structures`                           | sandbags, wooden barricade, solid wall, wire fence (thorns), door, turret, smart turret (boss first); levels 2 and 3 as upgrade rows; rules: `maxBuilders`, `workRange`, `helpRange`, `refund`, `repairCost`, `clearRadius`, `pathCostScale`, `quickBuildDistance` |
| Sim                     | `src/sim/structures.ts`                                 | blueprints (ghosts, do not block), builders (`build` order, the controlled soldier and idle followers help, up to 4), placement checks, upgrade, repair, remove with refund, doors, turrets that shoot (`structureShot` event), `hurtStructure`                    |
| Obstacles               | `syncStructures`                                        | `arena.obstacles` = `arena.base` + finished structures (a new array each change, so the grid and flow-field caches rebuild); boxes carry `height`, `passShots` and `structure`                                                                                     |
| Pathing                 | `src/sim/flowfield.ts`                                  | structure cells are passable for enemies at a break cost (`extra`), so a zombie picks the cheapest way; it bites the structure it presses against (`blockingStructure` in `zombies.ts`)                                                                            |
| Menu                    | `src/buildUi.ts`, `src/build.css`                       | **N** opens it (only if the map has `build`), click a structure to place a blueprint, **R** turns, **Esc** / right click puts away; select a structure for upgrade / repair / open / remove; **E** next to a door opens it                                         |
| Drawing                 | `src/render/structures.ts`                              | plain boxes by colour; blueprints rise with progress; a door sinks when open; turret barrel turns; yellow cubes show the level; bars while damaged or building                                                                                                     |
| Maps                    | `data/maps/map-2..4.json`                               | Build mode test, Weapons range, Hide and seek; made by a script, hand-editable                                                                                                                                                                                     |
| Map rules               | `mapLogic`                                              | `build`, `noWaves`, `startGold`, `structures`                                                                                                                                                                                                                      |
| Hunter AI               | `wander.loseTrack`, `huntTarget` in `src/sim/wander.ts` | the Stalker (`marine_stalker`, 2.2x size, 30x health) chases what it sees, goes to the last place it saw the squad, looks around, then roams again                                                                                                                 |
| Stealth                 | `wander.crouchStealth` (0.5)                            | crouching halves the sense and sight radii of wanderers and hunters                                                                                                                                                                                                |

## Checked

Lint, format, typecheck, build, the asset check and the 48 tests pass. A throwaway headless test (deleted, no new tests by decision) loaded maps 2 to 4 for 10 s each, placed and built a barricade, toggled the door and let a zombie attack the closed base.

## Not built (see the plans)

Manned machine-gun nest, watchtower seat and bonuses, structure placement in the editor, quick-build with a key in direct control as a wheel (the menu works in both modes), models and sounds, soldiers pathing around structures, ammo for turrets. Plans: [PLAN-build-mode.md](../PLAN-build-mode.md), [PLAN-test-maps.md](../PLAN-test-maps.md), [PLAN-world-and-engine.md](../PLAN-world-and-engine.md).
