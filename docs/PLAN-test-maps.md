# Plan: test maps (weapons, build, hide and seek, stealth, celestial event, human vs human)

Status: written 2026-10-19 from the user's requests. Maps 2 to 4 are built (first versions); the rest are plans. These maps are labs: each one isolates a mechanic so it can be tuned and extended without a full wave run. All the maps are built-in JSON in `data/maps/` and show in the Single Player list.

## 1. The maps

| Map                                                | Purpose                                                                                    | Status                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Map 2: Build mode test** (`map-2.json`)          | Build walls, doors, turrets and sandbags; survive slow waves                               | Built: 600 starting gold, a pre-built gate (two walls, a door), sandbags, turret                             |
| **Map 3: Weapons range** (`map-3.json`)            | Try every weapon, accessory and grenade                                                    | Built: no waves, 5,000 gold (shop with **B** any time), sleeping targets at 10, 20 and 35 m, a brute at 45 m |
| **Map 4: Hide and seek** (`map-4.json`)            | A giant hunter and an AI that looks for the squad; first stealth rules                     | Built: 34 blocks to hide behind and one Stalker (see section 2)                                              |
| **Map 5: Interaction lab** (`map-5.json`)          | Lift and throw objects, carry a body, fire spreading, explosive barrels                    | Built ([worklog](worklog/2026-10-19-interaction-and-training.md))                                            |
| **Map 6: Celestial Event 4**                       | An alien invasion seen from the ground: orbs from the sky vaporise civilians, hide or flee | Plan only (section 3)                                                                                        |
| **Map 7: Human vs human**                          | Soldiers against intelligent enemies that shoot, to build cover AI on both sides           | Plan only (section 4)                                                                                        |
| **Maps 8 and 9: Doors and interiors, Urban block** | Door types, rooms, streets with enterable buildings                                        | Plan only: [PLAN-world-and-engine.md](PLAN-world-and-engine.md)                                              |

Map rules that were added for these labs (all in the map's `logic`, so no code per map):

| Field        | Effect                                                                      |
| ------------ | --------------------------------------------------------------------------- |
| `noWaves`    | No wave ever spawns; only the units the map places exist                    |
| `build`      | The build menu (**N**) is on                                                |
| `startGold`  | Gold the run starts with                                                    |
| `structures` | Structures that stand from the start (type, position, quarter turns, level) |

## 2. Hide and seek and stealth (Map 4)

Built now:

| Piece                  | How it works                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stalker**            | `marine_stalker` in `data/game.json`: 2.2x the size, 30x health, 4x damage, fast, with a wander rule (roams, sees 26 m in a cone, senses 4 m)                                                  |
| **It looks for you**   | `wander.loseTrack` (seconds): the Stalker chases only what it sees or senses; out of sight it walks to the last place it saw the squad, stands and looks around, then gives up and roams again |
| **First stealth rule** | Crouching shrinks the sense and sight radii to `wander.crouchStealth` (0.5). Hiding behind a block breaks the line of sight                                                                    |
| **Noise**              | Off by default (`wander.noiseAttracts`); turn it on to make shots wake and attract enemies                                                                                                     |

Next steps, in order (none built):

| #   | Step                                                                                                     | Notes                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | A visible detection meter above the hunter (grey, yellow "suspicious", red "alert")                      | The sim already knows seen / unseen; add a `suspicion` value 0 to 1                          |
| 2   | Sound: a footstep radius by stance (sprint loud, walk quiet, crouch silent) and thrown objects as decoys | Replaces the global `noiseAttracts` flag                                                     |
| 3   | Light: in the dark mode a flashlight is seen from farther; shadows hide                                  | Needs the lighting level at a point in the sim (a per-map light grid or the sun / lamp list) |
| 4   | Hiding places: lockers, tall grass, vents (a unit inside is not seen unless the hunter is adjacent)      | Reuses the vehicle seat code                                                                 |
| 5   | Search behaviour: check doors, hiding places and last-known positions in a sweep, not just one point     | A small behaviour list per enemy in the JSON                                                 |
| 6   | Takedowns from behind with a silenced weapon or melee                                                    | Uses the melee rules                                                                         |

## 3. Celestial Event 4: alien invasion

> Superseded by [PLAN-celestial-event-3.md](PLAN-celestial-event-3.md) (story, three threats, cinematic intro and the step plan). The notes below are the first sketch.

The idea (the user's): metallic orbs and orbs of light come down from the sky and vaporise civilians; the squad has to flee and hide so they are not seen.

| Piece       | Proposal                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Civilians   | A new unit family with no weapon: they wander, panic and run from orbs, and can follow the squad or be left behind (the animals module already has wandering units; extend it)                                                                         |
| Orbs        | A sim module `orbs.ts`: an orb descends from a sky point to a ground point over a few seconds, hovers, then scans. Two kinds in `game.json`: **metal** (a slow drone with a sweeping cone) and **light** (a column that vaporises everything under it) |
| Vaporise    | Anything inside the beam is removed instantly (no corpse, a flash and ash); armour does not help. Squad soldiers are only vaporised when they are inside it                                                                                            |
| Being seen  | The metal orbs have a sight cone like the hunter's; a seen squad becomes the target of a light column. Hiding behind buildings or inside them (doors, interiors) breaks it                                                                             |
| The map     | A small town with streets and enterable buildings (needs the interiors plan), civilians spread around, orbs arriving in waves of 1 to 4                                                                                                                |
| Objective   | Story mode: reach an extraction point, optionally save N civilians                                                                                                                                                                                     |
| Rendering   | Orbs are emissive spheres with a light and a soft cone (no real volumetric light, see the engine note); the beam is a cylinder with an additive shader                                                                                                 |
| Build order | 1. civilians (extend animals), 2. one orb type that descends and kills what it touches, 3. the sight cone and hiding, 4. the town map, 5. the second orb type and the story objective                                                                  |

Open questions for the user: do civilians fight back, can the squad lose by civilian deaths, and is "Event 4" part of a series (names and numbering for the next maps)?

## 4. Human vs human and cover AI (Map 6)

The goal is to make soldiers take cover and shoot, and to make enemies that shoot back and think. Today every unit walks straight at a target and fires from where it stands; enemies are melee only.

| Piece         | Proposal                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Armed enemy   | A hostile soldier type (team 1) with the same weapon rules as a squad soldier: magazine, reload, spread, a shooting AI that uses `fireWeapon`. Teams already decide who is hostile (`isHostile`)  |
| Cover points  | From the obstacle boxes and built structures, generate cover points: spots next to a box edge, with a facing away from the threat. Low cover (sandbags) lets a unit shoot while crouched          |
| Cover scoring | Score = breaks the line of sight to the enemies it knows - distance to walk - exposure to flanks; choose again when the threat moves or the cover is destroyed                                    |
| Behaviour     | Peek-and-shoot cycles (stand, burst, duck), suppressing fire, flanking along the flow field, retreat on low health, throwing grenades at units behind cover                                       |
| Suppression   | Bullets passing near a unit make it duck and lose accuracy; this is what makes cover worth using                                                                                                  |
| Squad orders  | In RTS: a "take cover" order (the unit picks the best point near the click), a "hold fire / fire at will" toggle, and a "suppress this spot" order                                                |
| Map           | Two bases with sandbags, walls and a few buildings; each side a small squad with a leader; modes: skirmish, defend (waves of soldiers), 1 vs 1 duel for tuning                                    |
| Dependencies  | The grenade AI of the weapons plan, the ammo rules (done), build structures as cover (done), a line-of-sight query that ignores low cover for shooting but not for seeing                         |
| Build order   | 1. armed enemy using `fireWeapon`, 2. cover points and choosing one, 3. peek-and-shoot, 4. suppression, 5. flanking and retreat, 6. orders in RTS, 7. the map and a debug overlay of cover points |

A debug overlay (cover points, chosen cover, line-of-sight rays) is part of step 2: this kind of AI cannot be tuned blind.

## 5. What each lab proves

| Lab               | Proves                                                                         |
| ----------------- | ------------------------------------------------------------------------------ |
| Weapons range     | Damage, spread, recoil, ammo, accessories and grenades at three distances      |
| Build test        | Blueprints, builders, break cost in the flow field, doors, turrets, upgrades   |
| Hide and seek     | Sight cones, memory, searching, crouch stealth                                 |
| Celestial Event 4 | Environmental threats that are not enemies, civilians, hiding as the main verb |
| Human vs human    | Cover, suppression, armed AI on both sides                                     |
