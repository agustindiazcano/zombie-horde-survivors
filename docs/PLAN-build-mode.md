# Plan: build mode (bases, defences, emplacements)

Status: **plan only, nothing built.** Written 2026-10-19 from the user's request. Sizes are qualitative; nothing has been prototyped. Keys marked _proposed_ are not decided; once something is built, its keys go in [CONTROLS.md](CONTROLS.md) in the same commit.

## 1. Goal

Let the squad build a small base: walls, doors, barricades, wire, sandbags, towers, turrets and machine-gun nests, so a "mini base" can be made and defended against the waves. It is tested first on a new built-in map, **Map 2 — Build mode test**.

## 2. What the user asked for

| Request                                                                            | Section |
| ---------------------------------------------------------------------------------- | ------- |
| Structures: watchtower, turret, wire fence, wooden barricade, solid wall, sandbags | 4       |
| Doors, so a mini base can be closed                                                | 4, 6    |
| Upgrades for those structures                                                      | 5       |
| Build from the RTS view; the soldiers do the building; more soldiers build faster  | 7       |
| Build from direct control too: place a turret or a sandbag                         | 8       |
| A standing machine gun operated by a soldier or by the player                      | 9       |
| A "smart turret" that works on its own                                             | 9       |
| Test map: Map 2, "build mode test"                                                 | 11      |

## 3. How it fits the code today

| Existing piece                                                                                                        | What it gives the plan                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Obstacles are boxes in `arena.obstacles` with a spatial grid that rebuilds when the array changes (`src/sim/grid.ts`) | A built wall can be a box pushed into the array. Rebuilding on each change is fine for a few dozen builds; measure with `npm run bench:sim` |
| Props are 2 m tall and can be climbed (`OBSTACLE_HEIGHT`, Space to vault)                                             | Sandbags and low walls can be lower than 2 m so soldiers shoot over them; towers use the same "stand on top" rule                           |
| Vehicles have seats, `V` boards, passengers shoot (`src/sim/vehicles.ts`)                                             | A manned machine gun is a vehicle that cannot move: reuse boarding, seats and the RTS `board` order                                         |
| Zombies hit soldiers and vehicles and steer around boxes with a corner heuristic                                      | They must also attack structures that block them, and path to doors. The corner heuristic got stuck before; see section 10                  |
| Editor places props and units, `map.logic` holds per-map rules, mode is `waves` or `story`                            | Map 2 needs a `build` flag in the map logic and pre-placed structures (section 11)                                                          |
| Gold exists and resets every run; multiplayer will make it per player                                                 | Building costs gold first (open question 1)                                                                                                 |

## 4. Structures

All numbers are placeholders to tune; they go in `data/game.json` under a new `structures` section (strict zod schema, like every other number).

| Structure        | Blocks movement        | Blocks bullets | Zombies                     | Notes                                                                         |
| ---------------- | ---------------------- | -------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Sandbags         | yes (low)              | cover          | attack it                   | Low (about 1 m): soldiers behind it shoot over it; cheap, quick to build      |
| Wooden barricade | yes                    | yes            | attack it                   | Cheap, weak, quick                                                            |
| Solid wall       | yes                    | yes            | attack it slowly            | Expensive, a lot of health, slow to build                                     |
| Wire fence       | yes (zombies)          | no             | slowed, hurt, then break it | Soldiers see and shoot through it; hurts what pushes on it                    |
| Door             | open: no / closed: yes | closed: yes    | attack it when closed       | Soldiers walk through; the owner can open and close it; see section 6         |
| Watchtower       | yes (the base)         | partly         | attack the base             | A soldier climbs up: longer sight and range, can shoot over walls (section 9) |
| Turret           | yes (small)            | no             | attack it                   | Fires on its own at what it sees; needs ammo (section 9)                      |
| Machine-gun nest | yes (small)            | cover          | attack it                   | A manned gun (section 9)                                                      |
| Smart turret     | yes (small)            | no             | attack it                   | Picks targets by priority; the top turret (section 9)                         |

Common fields per structure: `hp`, `cost`, `buildWork` (seconds of work for one builder), `height`, `size`, `owner` (the player who placed it). A structure in progress is a **blueprint**: it is shown as a ghost and does not block until it is finished (open question 5).

## 5. Upgrades

| Rule                                                                                       | Proposal                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Each structure has levels 1 to 3 with more health, and (for defences) more damage or range | A list of levels per structure in `game.json`, not a code change                                                                |
| An upgrade is paid in gold and built by soldiers like a new build                          | The structure keeps working at its old level until the upgrade finishes                                                         |
| Examples                                                                                   | Barricade: wood → reinforced → metal. Turret: faster fire → more damage → bigger magazine. Wall: more health. Tower: more range |
| Repair                                                                                     | Soldiers repair damaged structures for part of the cost (same worker rule as building)                                          |

## 6. Doors

| Question       | Proposal                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who passes     | Soldiers pass through an open door; zombies never use doors, they attack a closed one                                                                          |
| Open and close | A key near the door in direct control (`E` is for crates; _proposed_: the same prompt that shows `E` on crates, `E` on a door), and a right-click order in RTS |
| Locked / auto  | Later: doors that open by themselves for allies                                                                                                                |
| Pathing        | A door is an obstacle when closed and free when open; see section 10                                                                                           |

## 7. Building from the RTS view

| Step                                                                                                                                | Detail                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Open the build menu (_proposed_: key **N**, or a button on the HUD)                                                              | A list of structures with cost; picking one arms a ghost that follows the cursor                                                                        |
| 2. Place the ghost (click; **R** rotates; grid snap of 0.5 m; red when invalid)                                                     | Invalid: overlapping a unit or obstacle, on water or a cliff, out of the map, or not enough gold                                                        |
| 3. The blueprint is created; gold is spent (or reserved)                                                                            | A blueprint can be cancelled for a refund                                                                                                               |
| 4. Selected soldiers get a `build` order (like `move` and `board`); with none selected, nearby idle soldiers help (open question 3) | They walk next to it and work while within reach                                                                                                        |
| 5. Build speed scales with the number of workers                                                                                    | `work per second = sum over builders of rate`, so 2 soldiers take half the time. Diminishing returns past a few workers are an option (open question 4) |
| 6. Done: it becomes a real structure and blocks                                                                                     | The builders return to their previous order                                                                                                             |

A builder stops shooting while it works and is a target, so a base is built between waves or behind cover. Builders go back to fighting if an enemy gets within a short range (a rule to set in `game.json`).

## 8. Building from direct control

| Item                           | Proposal                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| What can be placed on the spot | Sandbags, a turret, and a barricade; the big builds (walls, towers) stay in RTS                                            |
| How                            | A quick-build key (_proposed_: **Z**) opens a small wheel or list; a ghost appears in front of the player; click places it |
| Speed                          | The player builds it themselves (faster than a blueprint for a small item); followers help if close                        |
| Cost                           | The same gold as in RTS                                                                                                    |

## 9. Defences that fight

### 9.1 Turret (automatic)

- Fixed weapon (an item from `data/items.json`, so it gets the same damage, range and ammo rules as soldier weapons; see [PLAN-weapons-and-combat.md](PLAN-weapons-and-combat.md)).
- Turns and fires at the nearest visible enemy; cannot be hurt by the squad's own grenades unless friendly fire says so.
- Ammo: a magazine and a reload, refilled by a soldier next to it (or by gold). A turret without ammo is a decoy (open question 6).

### 9.2 Machine-gun nest (manned)

- A structure with one seat. A soldier or the player boards it with **V**, exactly like a vehicle that does not move (reusing the vehicle seat code), and fires with the mouse; in direct control the camera behaves as when driving.
- An unmanned nest does nothing; in RTS, a `board` order sends a soldier in; the AI fires it at what it sees.
- Heavy gun: high damage and rate, slow turning, limited arc (an option), ammo belt.

### 9.3 Smart turret

- Works on its own like the turret but with rules: target priority (the closest to a wall, bosses first, or the one hurting a soldier), no wasting ammo on the last health point of a dying target, and it can be told to ignore some enemies.
- Needs more cost and an upgrade chain (range, sensors, ammo). Power or a repair cost is an option (open question 7).

### 9.4 Watchtower

- A soldier boards the tower (`V`, like a seat). On top: sight and range bonus, and shots are not blocked by walls of lower height (the sim already lets a shooter on a box fire over it).
- Enemies attack the base; a destroyed tower drops the soldier.

## 10. Zombies, structures and pathfinding

This is the riskiest part: today zombies attack soldiers and vehicles and steer around boxes with a corner heuristic that has trapped them before.

| Problem                                                 | Proposal                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zombies must attack what blocks the way                 | When a structure blocks the path to the target for a short time, they attack it; the weakest blocking structure on the shortest route is the target                                                                        |
| Closed bases leave no path                              | The route is computed ignoring structures but charging a cost to break each: zombies take the cheapest route, through a door or a barricade                                                                                |
| The corner heuristic is not enough                      | Replace it with a **flow field** (one search from the target over a grid, every zombie follows the lowest cost; see section 8 of [PLAN-multiplayer.md](PLAN-multiplayer.md)). Do it in plain TypeScript, before build mode |
| Rebuilding the field when a structure appears or breaks | The field is recomputed only on a structure change (not each frame); cell size 1 m is enough                                                                                                                               |
| Performance with hundreds of zombies                    | The flow field is O(cells), not O(zombies); the grid rebuild of `obstaclesNear` is the other cost to measure                                                                                                               |

## 11. Map 2: build mode test

| Item     | Proposal                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Where    | `data/maps/map-2.json`, listed in the Single Player menu next to Map 1                                                   |
| Mode     | A new `build` flag in the map logic (not a third mode of the enum): waves keep coming; the build menu is on              |
| Contents | A flat open area, a few pre-placed wall pieces and a gate, the standard squad, plenty of starting gold, slow early waves |
| Editor   | Structures can be placed in the editor (Assets tab), with their level, so a base can be pre-built for a mission          |
| Success  | A squad can build a closed base with a door, survive a boss wave inside it, and rebuild what was broken                  |

## 12. Phases

Each phase is a branch that ends green (lint, format, typecheck, the 48 tests, build, asset check). No new tests; visual checks are the user's.

| #   | Phase                       | What it delivers                                                                                                                            | Depends on                    | Size |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---- |
| 0   | Flow field pathfinding      | Zombies follow a flow field instead of the corner heuristic; goal for this phase: the old behaviour or better, measured with `bench:sim`    | none                          | M    |
| 1   | Structures in the sim       | `structures` section in `game.json`, `state.structures`, hp, destruction, blocking as dynamic obstacles, zombies attack blocking structures | 0                             | L    |
| 2   | Build orders and blueprints | `build` order, workers, speed by worker count, gold cost and refund                                                                         | 1                             | M    |
| 3   | RTS build menu and ghost    | Menu, ghost with validity colours, rotation, cancel                                                                                         | 2                             | M    |
| 4   | Doors                       | Open and close, soldiers pass, zombies attack                                                                                               | 1                             | S-M  |
| 5   | Turret and manned gun       | Auto turret with a weapon, the nest as a seat reusing vehicle code, ammo                                                                    | 1 and the weapons plan (ammo) | L    |
| 6   | Direct-control quick build  | Z (proposed) quick build of sandbags, a turret and a barricade                                                                              | 2                             | M    |
| 7   | Smart turret, watchtower    | Target priority, tower seat and bonuses                                                                                                     | 5                             | M    |
| 8   | Upgrades and repair         | Levels per structure, upgrade orders, repair                                                                                                | 2                             | M    |
| 9   | Map 2 and editor support    | `map-2.json`, the `build` flag, structures in the editor                                                                                    | 1 to 3                        | M    |
| 10  | Models and polish           | Structure models (CC0 or CC-BY, credited in `assets.toml`), construction animation, sounds                                                  | 1                             | M    |

First models are plain boxes, like the first jeep, so the rules can be judged before art.

## 13. Open questions (the user decides)

| #   | Question                                                                                                  | Recommendation                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | What does building cost: gold, or a new material (wood, metal) dropped by enemies?                        | Gold first; add materials only if gold feels wrong                   |
| 2   | Is there a limit on structures (count or total hp)?                                                       | A soft limit set per map                                             |
| 3   | In RTS, do idle nearby soldiers help build automatically, or only the ones selected?                      | Only selected, plus a "help" order for the rest                      |
| 4   | Do more soldiers always build proportionally faster, or with diminishing returns?                         | Proportional up to a cap per structure (e.g. 4 workers)              |
| 5   | Do blueprints block movement before they are finished?                                                    | No; they are ghosts until done                                       |
| 6   | Do turrets need ammo, or are they unlimited?                                                              | Ammo, so a base needs upkeep; unlimited for the first version        |
| 7   | Does the smart turret need power or a recurring cost?                                                     | No, only a high price and upgrades                                   |
| 8   | Do enemies attack structures only when blocked, or also by choice (they prefer soldiers first, as today)? | Only when blocked, plus bosses that smash anything                   |
| 9   | Is the base saved between runs?                                                                           | No; gold and builds reset every run, as today                        |
| 10  | In multiplayer, who owns a structure and who can upgrade or remove it?                                    | The builder owns it; the squad can use it; only the owner removes it |

## 14. Risks

| Risk                                                                    | Mitigation                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Zombies stuck or never reaching a closed base                           | Flow field with break-cost (phase 0 and 1) before any gameplay on top                    |
| Cheese: a sealed base with a turret makes the waves trivial             | Zombies attack walls; bosses smash; ammo upkeep; the wave size grows; balance after play |
| Grid rebuild on every structure change                                  | Measure with `bench:sim`; batch rebuilds per step if needed                              |
| AI soldiers building and fighting at once                               | Builders stop to fight within a set range                                                |
| Visual feedback I cannot check (ghosts, validity colours, construction) | Plain, large cues, constants named in the code; the user looks and tunes                 |
