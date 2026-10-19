# Plan: weapons and combat

Status: **plan only, nothing built.** Written 2026-10-19 from the user's request. Sizes are qualitative; nothing has been prototyped. Keys marked _proposed_ are not decided; once something is built, its keys go in [CONTROLS.md](CONTROLS.md) in the same commit.

## 1. Goal

Make shooting feel like a weapon system instead of "a spread number and a rate": semi-automatic pistols, magazines and reloads, accuracy that depends on skill and movement, aiming, recoil, headshots and critical hits, melee, and a workbench to customize each weapon with a scope, silencer and more.

## 2. What the user asked for

| Request                                                                                                                                                                                                               | Section |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Enter a weapon with a small button and customize it (scope, silencer, ...)                                                                                                                                            | 9       |
| An equipped accessory (a scope) takes a slot of the weapon                                                                                                                                                            | 9       |
| The pistol is semi-automatic (today it is automatic)                                                                                                                                                                  | 3       |
| Magazines, bullets and reload times                                                                                                                                                                                   | 4       |
| Melee: a button in direct control; the AI does it when an enemy is very close; hit with the weapon, cut with a knife, or punch; pushes enemies back a little; then back to shooting; repeats if they come close again | 8       |
| Recoil per weapon, some with more; set in the weapons JSON                                                                                                                                                            | 5       |
| Accuracy from the user's skill; weapons should be less precise than now; worse while moving; better crouching                                                                                                         | 6       |
| An aim mechanic in direct control: while aiming the player can only walk, and the weapon is at maximum precision                                                                                                      | 7       |
| More damage to the head                                                                                                                                                                                               | 10      |
| Critical hits                                                                                                                                                                                                         | 11      |

## 3. How it fits the code today

| Today                                                                                                                                                                                                        | Consequence for the plan                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Weapon sheet in `data/items.json`: `class`, `hands`, `damageType`, `fireRate`, `damage`, `range`, `spread`; the magazine, `reloadTime`, `noise` and `accessorySlots` are under `mocked` (no rule reads them) | Phase W1 promotes those fields to real ones                                                                                    |
| Holding the mouse fires on every cooldown; no fire mode                                                                                                                                                      | A `fireMode` per weapon (`auto`, `semi`, later `burst`)                                                                        |
| Spread is a random error within ±`spread`, scaled by crouch; downed adds some; skills (weapon-class XP) exist but change nothing                                                                             | The accuracy formula (section 6) uses skill level, stance, speed and recent shots                                              |
| Hands hold item ids (strings): `equipment.rightHand`, `leftHand`, `chest`                                                                                                                                    | A weapon with ammo and accessories needs its own state, i.e. an item **instance** (section 9). This is the biggest data change |
| The sim is 2D with circles; a unit has a height `y` only for jumps; a shot has a height but enemies are flat                                                                                                 | Headshots need a hit-height model (section 10)                                                                                 |
| Fists exist as an innate melee weapon (`class: 'melee'`, range 1.2, damage 6) but nothing uses it                                                                                                            | Melee builds on it (section 8)                                                                                                 |
| The marine model has clips `Attack`, `Triple_Combo_Attack`, `Boxing_Practice`, `BeHit_FlyUp`, `Arise`, `Skill_01`, `Skill_03`                                                                                | Melee animations exist for punches and combos; there is **no knife slash** for the marine (see section 8)                      |
| Grenades throw with Q, G drags in direct control, F is free in direct control, R is free in a run                                                                                                            | Proposed keys in section 12                                                                                                    |

## 4. Fire modes, magazines, ammo and reload

| Piece                     | Proposal                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fireMode`                | `semi`: one shot per click (the mouse-down edge), still limited by `fireRate`; `auto`: while held; `burst` (later). **The pistol becomes `semi`.** The AI fires `semi` weapons at the weapon's rate without clicking |
| Magazine                  | Real `magazine` size per weapon (pistol 12, rifle 30, heavy MG 100 are already in the sheet as mocked values)                                                                                                        |
| Ammo items                | New item type `ammo` per calibre (e.g. `ammo_9mm`, `ammo_556`, `ammo_belt`), stackable in the backpack; each weapon says which calibre it uses                                                                       |
| Loaded rounds             | Stored on the weapon instance (section 9), not on the unit                                                                                                                                                           |
| Reload                    | **R** in direct control (_proposed_); takes `reloadTime`; moves rounds from a backpack ammo stack into the magazine; interrupted by a swap or by going down; the AI reloads when empty or when no enemy is in sight  |
| Empty gun                 | The trigger clicks; the unit reloads by itself if it is the AI, and does a melee strike if an enemy is adjacent (section 8)                                                                                          |
| Where ammo comes from     | Crates and drops, the shop (bundles), and the starting loadout                                                                                                                                                       |
| Exceptions                | The drone gun does not use ammo; turrets of the build plan do ([PLAN-build-mode.md](PLAN-build-mode.md))                                                                                                             |
| Accessory `magazine` slot | An extended magazine adds `magazineBonus` rounds                                                                                                                                                                     |

Open: does the pistol have infinite spare ammo so the early game is not blocked (question 1)?

## 5. Recoil

| Piece                   | Proposal                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-weapon numbers      | A `recoil` block in the weapon sheet: `kick` (angle added per shot), `maxKick`, `recovery` (per second), `sideBias` (how much it drifts left or right), `cameraKick`                |
| What it does in the sim | An accumulated kick angle adds to the aim error of the next shots and decays with time; heavy weapons add more per shot; staying crouched or aiming reduces it                      |
| What the player sees    | Camera kick (the shake that exists is extended), a crosshair that widens, and in third / first person a small view climb; in top-down the facing drifts off the cursor and recovers |
| AI soldiers             | The same rule applies to them, so a long burst from a distance misses more                                                                                                          |
| Where it is tuned       | Only in the JSON of the weapons                                                                                                                                                     |

## 6. Accuracy

The weapons are too precise today (the rifle has `spread: 0`). New model, evaluated at the moment of each shot:

```
error = baseSpread
      * stanceFactor        crouch < stand < sprint (crouch exists: stance.crouchSpreadScale)
      * movementFactor      grows with the unit's current speed (still < walking < running)
      * skillFactor         falls as the weapon-class skill level rises (units.skills)
      * aimFactor           the minimum while aiming (section 7)
      + recoilKick          decays with time (section 5)
      + accessoryModifier   scope, grip, barrel ...
```

| Piece     | Proposal                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill     | Uses the existing weapon-class XP (`skillLevel`); level 1 is clearly inaccurate, high levels approach the weapon's best value                                          |
| Numbers   | `accuracy` section in `data/game.json`: movement scale, sprint penalty, skill curve, minimum error                                                                     |
| Rebalance | Raise every weapon's base spread (the rifle moves off 0) and lower the AI's perfect aim: the current balance comes from headless runs, so it needs retuning after play |
| Distance  | The error is an angle, so far shots miss more by themselves; no extra rule                                                                                             |
| Feedback  | The crosshair size shows the current error (a dynamic crosshair); the HUD has a spread cone for top-down                                                               |

## 7. Aiming (hold to aim)

| Item   | Proposal                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input  | Hold a key or button (_proposed_: the right mouse button in third / first person; open question 4 for top-down, where right-drag already rotates the camera)                                      |
| Effect | The unit can only **walk** (no sprint; slower than normal walking is an option); spread drops to the weapon's minimum; recoil is reduced; the camera zooms in a little, and a scope zooms further |
| Visual | The crosshair tightens; the rifle model lifts (when weapons are shown on models)                                                                                                                  |
| AI     | A shooter who stands still for a moment before firing counts as aiming (a small bonus), not a new action                                                                                          |

## 8. Melee

| Item           | Proposal                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct control | A key (_proposed_: **F**) strikes the nearest enemy in a short cone in front; a short cooldown; it interrupts a reload                                                                                                |
| Attack kinds   | **Weapon bash** (every gun has `bashDamage` and a small push), **knife** (a new melee item with more damage and a slash), **punch** (fists, already in the catalog; chained into a combo)                             |
| Push           | A knockback in metres, divided by the target's weight (the enemy `radiusScale` / health class); bosses resist; a short stagger so the enemy loses a beat                                                              |
| AI soldiers    | If an enemy is within `meleeRange` (about 1.5 m): strike, push it away, then go back to shooting; if it closes in again, strike again. Also used when the gun is empty or reloading                                   |
| Animations     | Marine clips available: `Attack`, `Triple_Combo_Attack`, `Boxing_Practice`. The knife has no slash clip for the marine; first version plays the punch / attack clip with a knife model, a real slash is a later asset |
| Unit stat      | A melee damage and skill (the `melee` class already exists in the skills)                                                                                                                                             |
| Interactions   | Cooldown shared with firing; cannot melee from a vehicle; a downed soldier cannot                                                                                                                                     |

## 9. Weapon instances, accessories and the workbench

### 9.1 Weapon instances (the data change)

Today a hand holds an item id. For ammo and accessories each weapon needs its own state:

```
WeaponInstance { item: 'rifle', loaded: 18, accessories: { optic: 'scope', barrel: 'suppressor' } }
```

| Piece          | Proposal                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Where it lives | Hands, vest and backpack stacks keep ids for plain items; weapons become instances (an item with extra state)                              |
| What changes   | `Equipment`, `Stack`, `moveItem`, `equipFromBackpack`, crates, the maps' loadouts (`loadout` in the editor), the squad screen and the shop |
| Migration      | The map format reads the old string form as "an instance with defaults" so existing maps and `map-1` keep working                          |
| Do it first    | Phase W1, because ammo and accessories both depend on it                                                                                   |

### 9.2 Accessories

| Slot (already named) | Examples                                      | Effects (keys of the existing `modifiers`)             |
| -------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `optic`              | Red dot, scope                                | Lower spread while aiming, zoom, range                 |
| `barrel`             | Suppressor, compensator                       | Less noise (see below), less recoil, a little range    |
| `magazine`           | Extended magazine, fast reload                | More rounds, shorter reload                            |
| `grip`               | Foregrip                                      | Less recoil, steadier on the move                      |
| `underbarrel`        | Laser, flashlight, (later) a grenade launcher | Spread bonus or light; the launcher is a later feature |

An accessory fitted to a weapon **occupies that slot of the weapon** (the user's rule): the slot shows the item, the item leaves the backpack, and it can be taken off again. The weapon's `accessorySlots` list says which slots exist.

Noise: `noise` is mocked today. Proposed rule: a shot makes noise within a radius, and enemies that are not yet chasing turn towards it; a suppressor shrinks the radius. Open question 6.

### 9.3 The workbench screen

| Item       | Proposal                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry      | A small ⚙ button on each weapon in the squad screen (the pause screen) opens the weapon's own window                                             |
| Contents   | The weapon and its slots; accessories from the backpack are dragged in; stats before and after (damage, spread, recoil, noise, magazine); remove |
| Rules      | Allowed only from the pause screen (not mid-fight, since the game pauses there); the unit must have the accessory in its backpack                |
| Where else | The editor's unit inventory window, so maps can start with fitted weapons                                                                        |

## 10. Headshots

The sim is 2D, so "where on the body" needs a rule.

| Source of the shot                             | How the hit height is decided                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Third / first person (the view pitch is known) | The shot travels at a real height; an enemy has a body height and a head band (the top fraction); a ray that passes through the band is a headshot |
| Top-down and the AI (no pitch)                 | A **headshot chance** from the error angle, the skill and aiming (a better shot hits the head more often); never the default                       |
| Damage                                         | `headshotMultiplier` per weapon (about x2, tunable); some enemies get a different value (helmets, bosses with weak spots) or none (worms)          |
| Feedback                                       | A distinct hit marker and sound, a different floating number; the `zombieKilled` event carries the zone                                            |

Open question 3: is the top-down head chance acceptable, or should headshots exist only with a real pitch?

## 11. Critical hits

| Item       | Proposal                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Chance     | `critChance` per weapon, plus a bonus from skill level and from perks                               |
| Multiplier | `critMultiplier` (about x1.5); stacks with the headshot multiplier or replaces it (open question 5) |
| Feedback   | A yellow number, a hit sound, a short screen kick                                                   |
| Melee      | Melee hits can crit too, and a crit can add more push                                               |

## 12. Proposed keys (direct control)

| Action         | Key                          | Notes                                                                           |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Reload         | **R**                        | R only restarts on the game over screen, so no clash in a run                   |
| Melee          | **F**                        | F is "follow" in RTS only                                                       |
| Aim (hold)     | Right mouse button           | In top-down the right button already rotates the camera on drag; see question 4 |
| Semi-auto shot | Left click (each click)      | The existing fire button                                                        |
| Workbench      | ⚙ button in the squad screen | No key                                                                          |

## 13. Phases

Each phase is a branch that ends green (lint, format, typecheck, the 48 tests, build, asset check). No new tests; visual checks are the user's.

| #   | Phase                             | What it delivers                                                                                                                           | Depends on | Size |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---- |
| W1  | Weapon instances and a real sheet | Weapon instances; `magazine`, `reloadTime`, `noise`, `accessorySlots` become real; `fireMode` with the semi-auto pistol; migration of maps | none       | L    |
| W2  | Magazines, ammo and reload        | Ammo items, loading, **R**, AI reload, empty click; shop and crate ammo                                                                    | W1         | M    |
| W3  | Accuracy, recoil and aim          | The accuracy formula, per-weapon recoil in the JSON, dynamic crosshair, hold to aim, rebalance of the base spreads                         | W1         | L    |
| W4  | Headshots and crits               | Hit-height model, multipliers, events, floating numbers and sounds                                                                         | W3         | M    |
| W5  | Melee                             | **F**, bash / knife / punch, push, AI close-range behaviour, marine clips, a knife item                                                    | W1         | M    |
| W6  | Accessories and the workbench     | Accessory items, slot occupancy, the weapon window, the noise rule if accepted                                                             | W1, W2, W3 | L    |
| W7  | Polish and balance                | Retune after play, sounds, camera kick, weapon models (a question to the user first)                                                       | all        | M    |

The turrets of [PLAN-build-mode.md](PLAN-build-mode.md) use W1 and W2; plan the weapon sheet so a turret weapon is just an item.

## 14. Open questions (the user decides)

| #   | Question                                                                              | Recommendation                                                                         |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Does the pistol have infinite spare ammo, or do all weapons need ammo from the start? | Infinite spare pistol magazines at first; everything else needs ammo                   |
| 2   | Do the AI soldiers manage ammo (and run dry), or is it only the player's unit?        | The AI too, otherwise the squad never needs resupply                                   |
| 3   | Headshots in top-down and for the AI: by chance, or only with a real view pitch?      | By chance, small, so the top-down and RTS play stay relevant                           |
| 4   | Which input is "aim" in top-down, where right-drag rotates the camera?                | Hold the right button without dragging (a drag still rotates), plus a key as an option |
| 5   | Do a crit and a headshot stack, or does the higher one win?                           | The higher wins, to avoid huge numbers                                                 |
| 6   | Does noise attract enemies (so a suppressor matters)?                                 | Yes, with a small radius; off by default until balanced                                |
| 7   | How do weapons look on the models (bones, where the meshes come from)?                | Ask before the visual part, as already agreed                                          |
| 8   | Is melee on the same cooldown as firing, or free?                                     | Shared, so it is a choice                                                              |
| 9   | Should the knife be a weapon item in a hand, or a permanent melee slot?               | A permanent melee slot (the user's soldiers always have fists)                         |

## 15. Risks

| Risk                                                               | Mitigation                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Weapon instances touch inventory, crates, maps, shop and the UI    | Do W1 alone, keep strings readable, and run the 48 tests and the map loads after it     |
| The game gets too hard when accuracy drops and ammo appears        | Every number is in the JSON; retune after the user plays; keep a start loadout generous |
| Melee without a slash animation looks wrong                        | Use the punch and attack clips first; ask the user before buying or converting a clip   |
| Aim input clashes with the camera rotation in top-down             | Open question 4                                                                         |
| Balance comes from headless runs of a passive squad, not from play | Expect to retune; log what the user reports                                             |
