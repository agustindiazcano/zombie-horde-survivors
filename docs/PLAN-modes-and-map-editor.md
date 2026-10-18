# Plan: game modes, map list and map editor

Status: **plan only, nothing built.** Written 2026-10-18 from the user's request. The editor is a skeleton first (panels and toggles that do nothing); each phase below makes one part real.

## 1. Goal

Today the game opens straight into one hard-coded arena (80×80 with obstacles from `data/game.json`). The user wants:

1. A main menu that asks for a **mode** after Start.
2. **Single Player**: a list of saved maps (missions). The current arena becomes the first one, **Map 1**.
3. **Editor**: a mode that starts **paused**, with a Play button, to build maps by hand with a right-hand panel.

## 2. Menu flow

```
Main menu
  └─ Start
       ├─ Single Player ─┬─ Story ──▶ mission list ──▶ game          (later)
       │                 └─ Waves ──▶ map list ──▶ pick a map ──▶ game
       ├─ Multiplayer ───▶ disabled button ("coming soon"), does nothing
       └─ Editor ────────▶ (new map | open a saved map) ──▶ editor (paused)
                                                             └─ Play ──▶ test the map ──▶ Stop ──▶ back to the editor
```

- Single Player has two sub-modes: **Story** (missions with objectives; empty list at first) and **Waves** (today's survival loop on any map).
- **Multiplayer** is only a visible, disabled button for now. The player model in section 3b is designed so that real network players can be added later without redoing the sim.
- Map list: name, thumbnail (later), size, best score per map (localStorage, keyed by map id).
- "Map 1" is exactly today's development arena converted to the new map format; it ships with the game and cannot be deleted. It stays the test bed for new features.
- Maps come from two places (user's decision): **built into the app** (`data/maps/*.json`, shipped with the game, read-only, like Map 1) and **saved in localStorage** (maps made in the editor, editable and deletable). Both appear together in the map list, with a badge to tell them apart. No backend.
- To promote an editor map into the app, the file is exported and committed to `data/maps/` by hand (export / import of `.json` is for that and for sharing).

## 3. Map format (the contract everything else depends on)

One JSON document, validated by a strict zod schema in `src/sim/config.ts` (same rule as `game.json`: a typo fails loudly). Versioned (`"version": 1`) so old saves can be migrated.

| Section    | Content                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`     | id, name, author, created / updated, size (width × depth)                                                                             |
| `terrain`  | height grid (elevation), water level or water mask, paint layer (texture id per cell or per splat channel)                            |
| `props`    | placed assets: asset id, position, rotation, scale, layer (outdoor / indoor / nature)                                                 |
| `surfaces` | floors and roads: asset or texture id, path / polygon                                                                                 |
| `players`  | the players of the map: id, name, kind (`human` / `ai`), team, color (see 3b)                                                         |
| `units`    | placed units: unit type id, position, **owner (player id)**, optional patrol / hold flag; a placed vehicle may name its starting crew |
| `logic`    | mode (`waves` / `story`), difficulty, wave list overrides, spawn points, objectives, win / lose rules                                 |

Rules:

- `src/sim` stays pure (no Three.js, no DOM). The sim receives a parsed map and only reads it. The editor UI and rendering are outside `src/sim`.
- The current `arena` section of `data/game.json` moves into `data/maps/map-1.json`. `game.json` keeps the global balance numbers.
- Collision (`collision.ts`) must read obstacles and, later, the height grid and water from the map, not from `game.json`.

## 3b. Players, ownership and vehicles (the core mechanic)

Inspired by Men of War and Call to Arms.

**Players.** The sim has a list of players. Every unit has an `owner`. A player is either a human (keyboard and mouse, or later a network client) or **the AI**, which is just another player. Today's game becomes: player 1 = the human, owns the four soldiers and the drone; the enemy side = an AI player that owns the zombies. Teams decide who is hostile to whom. The existing "controlled unit / RTS selection" state becomes **per player**, not global.

**Vehicles are a unit type that needs an operator.**

| Rule                     | Detail                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Crew                     | A vehicle has seats (driver, gunner, passengers; the count depends on the model). Only **human-type units** (soldiers, civilians) can occupy a seat. Zombies, monsters, animals and drones cannot                        |
| No operator, no movement | A vehicle with an empty driver seat does not move (it can still be a wreck, cover or a prop). An empty gunner seat means the turret does not fire                                                                        |
| Enter / exit             | A human unit walks to the vehicle and enters (a key for the controlled unit, an order in RTS). Exiting puts the unit next to the vehicle                                                                                 |
| Who drives               | The driver's **controller** decides: if that unit is the one a human player controls, the human drives; otherwise its AI drives it (follow, go to a point, attack)                                                       |
| Ownership                | Vehicles are **neutral** (Men of War style): a vehicle belongs to whoever is using it right now. Any human unit of any player can enter any vehicle with a free seat; when the last occupant leaves, it is neutral again |
| Passengers               | Passengers shoot only from **military vehicles with turrets or mounted weapons** (a Humvee style); in any other vehicle they just ride                                                                                   |
| Damage                   | Vehicles have health and armor; crew can be hurt or killed with it. A dead driver stops the vehicle; another seat can take over                                                                                          |
| Prop or asset            | The same model can be placed in the editor as a **prop** (decoration, no seats, not drivable) or as a **vehicle unit**. Two catalog entries, one model                                                                   |

**Vehicle damage (first version, user's decision):** only the vehicle takes damage, and only while it is occupied. Crew inside are not hurt (no crew injury yet). A vehicle with a crew has health; when it reaches zero it is destroyed and the crew exit. Empty vehicles are not targeted.

Open design points (to decide when phase 8 starts): how a vehicle is steered (arcade, recommended, vs. simple physics), tank vs. soldier damage rules, and whether air and sea vehicles are in the first version or only land (recommended: land only first).

## 3c. Unit stats (RPG-style, data-driven)

Today a soldier only has `xp`, `kills` and `stamina` in the sim (`types.ts`), global XP and level live on the game state, and speed, health and the like come from `game.json` plus squad-wide perks. The goal is one **stat sheet per unit**, defined in JSON, so units in the editor, the catalog and the sim all read the same fields. Many fields are **mocked**: they exist in the schema and the UI for design purposes but no rule reads them yet.

**Stat sheet (`data/units.json`, one entry per unit type; validated by zod like `game.json`):**

| Group               | Fields                                                                                                                                              | Used now?                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Identity            | `id`, `name`, `family` (human / zombie / monster / vehicle / animal), `model`                                                                       | yes                                                      |
| Progress            | `level`, `xp`, `xpToNext` (curve from `progress` in `game.json`)                                                                                    | partly (squad XP exists; per-unit level is display only) |
| Vitals              | `maxHealth`, `maxStamina`, `speed`, `sprintMultiplier`                                                                                              | yes (`speed`, health, stamina)                           |
| Attributes (mocked) | `strength`, `dexterity`, `constitution`, `perception`, `intelligence`, `charisma`                                                                   | no                                                       |
| Derived (planned)   | strength → melee damage and carry slots; dexterity → fire rate / reload / spread; constitution → health and stamina regen; perception → sight range | no, formulas decided later                               |
| Weapon skills       | one XP + level per weapon class (below)                                                                                                             | XP counter yes, effects no                               |

**Weapon classes** (every weapon in `game.json` gets a `class`): `melee`, `pistol`, `shotgun`, `rifle`, `sniper` (precision rifle), `machinegun`, `launcher` (rocket launcher). The unit gains skill XP in a class when it kills (later: when it hits) with a weapon of that class; the skill level would improve that class's damage, spread or reload. Today's weapons map to `pistol`, `rifle` and `machinegun`; the drone gun gets the class of its weapon type.

**Per-unit state in the sim:**

- `stats` (the sheet, with the unit's current values) and `skills: { [class]: { xp, level } }`, on each unit next to the existing `xp` and `kills`.
- Squad perks and shop upgrades keep working as multipliers on top of the sheet (`Mods` in `types.ts`).
- The map file (`units` section) can override a placed unit's name, level and attributes, so the editor can create a veteran or a weak recruit.

**Rules:**

- Enemies use the same schema (a zombie is a unit with low attributes), so the future Units tab and bosses share one format. Existing `enemies` multipliers in `game.json` migrate into it gradually.
- The pause / squad screen shows the sheet (identity, level, attributes, weapon skills), mocked values included, marked as "not active yet".
- The player's own progression stays "display only" until the user decides what a level does (open question in PENDING section 2).

## 3d. Weapons: stats, attachments, damage types

Today a weapon in `game.json` has a name, fire rate, damage and a few more numbers. The design extends it; all of it stays in JSON (`data/weapons.json` or the `weapons` section), and fields that nothing reads yet are **mocked**.

**Weapon stat sheet:**

| Group              | Fields                                                                           | Used now?                           |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------- |
| Identity           | `id`, `name`, `class` (3c), `hands` (1 or 2), `rarity`, `model`                  | partly                              |
| Damage             | `damage`, `damageType`, `fireRate`, `burst`, `pellets` (shotgun), `penetration`  | `damage`, `fireRate` yes            |
| Range and accuracy | `range`, `spread`, `crouchSpreadBonus`, `recoil`, `critChance`, `critMultiplier` | `range` and `spread` yes            |
| Ammo               | `magazine`, `reloadTime`, `ammoType`, `ammoReserve`                              | no (no ammo system today)           |
| Handling           | `weight`, `drawTime`, `noise` (attracts enemies, mocked)                         | no                                  |
| Explosive          | `blastRadius`, `blastDamage`, `falloff`, `fuse`                                  | planned with launchers and grenades |
| Attachments        | `slots` list (below)                                                             | no                                  |

**Damage types** (`damageType`): `physical` (default), `explosive`, `fire`, and mocked experimental types `energy`, `psychic`, `magic`, `scifi`. Each unit and armor can have resistances per type (mocked until a second type is used). **Explosive damage** is area damage: it hurts everything inside `blastRadius` with falloff, damages the shooter's own side (friendly fire on), and can destroy cover and vehicles.

**Attachments (Call of Duty style).** A weapon has attachment slots (`optic`, `barrel`, `magazine`, `grip`, `stock`, `underbarrel`). An attachment is an item with stat modifiers, e.g. _Scope_: +5% accuracy, +5% range; _Suppressor_: lower noise, −damage; _Extended mag_: +magazine, slower reload; _Foregrip_: −recoil. Modifiers are percentages applied on top of the weapon sheet, before squad perks. Attachments are items in the backpack and are fitted from the squad screen. Weapon **skill level** (3c) can unlock slots or small bonuses, like unlocking attachments by use.

**Experimental weapons (design only, mocked):** magic (staff, spell projectiles), psychic (no projectile, line-of-sight effect, drains stamina), sci-fi (energy rifle, plasma, rail gun). They get entries in the class list as `experimental` with their own `damageType`. No behavior until the user asks.

**Melee.** Class `melee`: `damage`, `reach`, `swingTime`, `staminaCost`, optional `knockback`. A knife is a 1-hand melee weapon. **Fists** are the default when no weapon is equipped: low damage, short reach, no stamina limit to hit (but slow). Today an unarmed unit does not shoot; with fists it would fight in melee.

**Shield (defensive).** A shield is an off-hand item: while raised it blocks a percentage of damage from the front (or a frontal arc), has its own durability, and slows the unit. 1 hand. It cannot be combined with a 2-hand weapon.

## 3e. Equipment, hands and inventory

Today each unit has one equipped weapon and a 6-slot backpack. The design:

| Part                 | Design                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backpack**         | **10 slots** per soldier (up from 6). Items stack when stackable (medkits, grenades, ammo)                                                                                                                                                                                                                              |
| **Hands**            | Two hand slots (`rightHand`, `leftHand`). A **1-hand** item takes one: a pistol, a knife, a shield, a grenade ready to throw. A **2-hand** item takes both: rifle, shotgun, machine gun, launcher. So two pistols are allowed (dual wield), or a pistol and a knife, or a pistol and a shield. Both hands empty = fists |
| **Body armor slots** | `head` (helmet), `chest` (vest). Later: `legs`, `back`. The vest already exists in the shop and in crates (armor plates); it moves into the `chest` slot instead of being a squad-wide stat                                                                                                                             |
| **Armor stats**      | `armor` (flat or % reduction), `weight`, resistances per damage type (mocked)                                                                                                                                                                                                                                           |
| **Medical items**    | Medkit small / medium / large (heal amounts and use time), and the **defibrillator**: revives a dead ally after a short channel, with a chance or a cost; works on a recently dead unit only (limit to decide)                                                                                                          |
| **Grenades**         | Throwable, 1 hand: frag (explosive), later smoke, flash, fire (mocked). Thrown to a point with a fuse, arc, blast radius                                                                                                                                                                                                |
| **Equipment screen** | The squad screen gets an equipment paper-doll (hands, head, chest) next to the 10-slot backpack; drag and drop as today. Weight and the strength attribute (3c) can limit what a unit carries (mocked)                                                                                                                  |

Sim consequences: `Soldier` gets `equipment` (hands and armor slots) instead of a single `weapon`; shooting and melee read the item in each hand; dual wield fires both (each with its own cooldown). `inventory.ts` (`moveItem`, crates) generalises to typed slots (an item says which slots accept it). The crate and shop data need an item catalog (`data/items.json`) with ids, types, stack size and stats.

## 3f. Environment hazards and physical interaction

**Environmental damage.** Things in the map that hurt units. First (and only) one for now: **fire**. Fire is a map entity (placed in the editor, or created by a fire grenade / explosive barrel later): it has a position and radius, deals `fire` damage over time to anything inside, and can spread or burn out. Later candidates (mocked list): acid, radiation, electricity, deep water (drowning), fall damage. Hazards are data (`data/hazards.json`) with `damageType`, damage per second, radius, lifetime.

**Pick up and carry objects (Skyrim / Half-Life style).** The controlled unit can grab a physical object from the floor **without putting it in the inventory** and hold it in front of itself: a rock, a soda can, a box. Then it can drop it or throw it (thrown objects deal blunt damage and make noise).

- Each carryable has `weight` and `size`. The unit's `strength` (3c) sets the maximum weight it can lift; heavier things cannot be picked up (or are dragged slowly).
- A held object uses the hands (both for large ones) so the unit cannot shoot while carrying.
- This is the first thing that needs real **physics-like behavior** (thrown objects, pushed boxes). Keep it simple: arcade throw, simple collision, no physics engine at first. Open decision for later: a small engine such as Rapier only for loose props.

**Climbing.** Units can climb up onto an obstacle (a box, a low wall, a ledge) up to a height limit, with a short vault animation and a stamina cost, so cover and props become usable terrain. The height limit comes from the height grid (phase 6) and obstacle data; the existing jump (procedural) stays for small hops. The AI uses climbing only on direct orders at first.

**Drag and carry a body.** A unit can take a dead (or downed) ally:

- **Drag:** holding the body by the shoulders, moving slowly backwards; the body trails behind and the unit cannot shoot with a rifle (a pistol in one hand is allowed).
- **Carry (fireman carry):** the unit puts the body over the shoulders and walks, slower (speed penalty from the body's weight versus `strength`); no shooting.
- Both are interactions started with a key / command near the body and can be left at any time. Needed so a wounded or dead ally can be taken to a defibrillator or a safe place. Animations: new clips or procedural poses; the models have only idle / run / death, so this will look rough at first.

## 3g. Downed state (before dying)

Today a soldier at zero health dies at once. New flow:

1. Health reaches zero → the soldier becomes **downed** (wounded on the ground), not dead.
2. A downed soldier can **keep shooting** from the floor (pistol or one-handed weapon, low accuracy, cannot move except to crawl slowly). It cannot use two-hand weapons.
3. A **bleed-out timer** runs. When it ends the soldier dies for good (the death clip and the existing death flow).
4. Allies can **revive** it (hold interaction near it, or a medkit, shorter) and stop the timer; the defibrillator revives a soldier who is already dead.
5. Enemies prefer standing targets (rule to decide). Damage to a downed unit may finish it faster.
6. If every soldier is downed or dead, the run ends (game over today means all dead; downed counts as out of the fight once nobody can act).

Sim changes: new `Soldier` state `downed` (with `bleedOut`), changes in `soldiers.ts` death handling, the HUD (icon shows downed), enemy targeting and the game-over check. Zombies and other non-human units keep dying immediately.

## 4. Editor layout

Starts **paused** with a top bar: `Play / Stop`, `Save`, `Open`, `New`, `Export`, undo / redo. Free fly camera (reuse the RTS pan / zoom). Right-hand panel with tabs:

| Tab            | Content                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Units**      | Collapsible groups, each listing unit names: **Humans**, **Zombies**, **Monsters**, **Vehicles** (Military: air / sea / land; Civil: air / sea / land), **Animals**. Click a name, then click the map to place; drag to move; Delete removes |
| **Assets**     | Collapsible groups: **Outdoors**, **Indoors**, **Nature**. Place, rotate, scale, delete                                                                                                                                                      |
| **Terrain**    | Brushes: raise, lower, flatten, smooth; **water** (level + paint); **paint** with a texture palette; **floors and roads** (asset or texture strip drawn as a path). Brush size and strength sliders                                          |
| **Game logic** | Mode (waves / story), difficulty, waves (count, mix of enemy types, boss waves), spawn points, objectives, win / lose conditions. Reuses the fields of `game.json` as per-map overrides                                                      |
| **Players**    | List of players (human / AI, team, color); the Units tab places units for the selected player; a vehicle can be given a starting crew                                                                                                        |

Panel items are **data-driven**: a catalog JSON (`data/catalog.json`) lists unit and asset groups, names, model paths and thumbnails, so adding an entry is editing JSON, not code (same rule as `characters.json`).

## 5. What already exists and what is new

| Piece     | Today                                            | Needed                                                                                                                        |
| --------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Menu      | Title screen with a 3D soldier (`mainMenu.ts`)   | Start → Single Player (Story / Waves), Multiplayer (disabled), Editor                                                         |
| Players   | One implicit human player; enemies have no owner | Player list, `owner` on every unit, teams, the AI as a player, control state per player                                       |
| Arena     | Flat 80×80 plane with obstacles (`arena.ts`)     | Heightmap mesh, water plane, painted texture, placed props                                                                    |
| Collision | 2D obstacle circles / boxes (`collision.ts`)     | Height-aware ground, water as blocking or slow, props as obstacles                                                            |
| Units     | 4 soldiers, drone, 6 enemy types                 | Catalog with human / zombie / monster / vehicle / animal entries; vehicles and animals are **new types** (behavior to design) |
| Pause     | Pause + squad screen                             | Editor "paused" state reuses the pause plumbing in `main.ts`                                                                  |
| Save      | Best score and settings in localStorage          | Map store (list, save, load, delete, export / import)                                                                         |

## 6. Phases (each one is a branch and a PR; the user merges)

| #   | Phase                             | Result                                                                                                                                                                                      | Depends on |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | 🟡 **Map format + Map 1**         | Schema, `map-1.json`, the sim and renderer read the arena from a map. The game plays exactly as today                                                                                       | none       |
| 1b  | 🟡 **Players and ownership**      | Player list, `owner` on units, the AI as a player owning the zombies, control state per player. The game plays exactly as today                                                             | 1          |
| 1c  | 🟡 **Unit stat sheets**           | `data/units.json` + zod schema, weapon `class` in `game.json`, per-unit `stats` and `skills` in the sim, sheet shown in the squad screen. Mocked fields do nothing; the game plays as today | 1b         |
| 1d  | 🟡 **Items and equipment**        | `data/items.json` catalog, weapon stat sheet and damage types, hand slots and armor slots, 10-slot backpack, fists, medkits, grenades (3d, 3e). Mocked fields do nothing                    | 1c         |
| 1e  | 🟢 **Downed state**               | Soldiers go down before dying, keep shooting one-handed, bleed out, can be revived (3g)                                                                                                     | 1d         |
| 2   | 🟡 **Menu flow**                  | Start → Single Player (Story empty / Waves with the map list), disabled Multiplayer button, Editor placeholder                                                                              | 1          |
| 3   | 🟡 **Editor skeleton**            | Paused editor, Play / Stop, right panel with the four tabs and collapsible groups, buttons that do nothing yet                                                                              | 2          |
| 4   | 🟡 **Save / load maps**           | New, Save, Open, Delete in localStorage; export / import `.json`; single-player list shows saved maps                                                                                       | 1, 3       |
| 5   | 🟢 **Place units and assets**     | Catalog JSON, click to place, move, rotate, delete, undo / redo; Play spawns the placed units                                                                                               | 3, 4       |
| 6   | 🟢 **Terrain**                    | Heightmap mesh and brushes, water, texture painting, floors and roads; collision follows the height                                                                                         | 4          |
| 7   | 🟢 **Game logic tab**             | Per-map difficulty, waves, spawn points and win / lose rules replace the global ones                                                                                                        | 4          |
| 8   | ⚪ **Vehicles**                   | Vehicle unit type with seats, enter / exit, driver needed to move, human or AI driver (section 3b); start with one land vehicle, then air and sea                                           | 1b, 5      |
| 8b  | ⚪ **Interaction mechanics**      | Pick up and throw objects by strength, climbing, drag / carry a body, fire hazards, explosives and melee / shield combat (3d, 3f)                                                           | 1d, 6      |
| 9   | ⚪ **Animals and other families** | Animal and extra monster behaviors                                                                                                                                                          | 5          |
| 10  | ⚪ **Story mode**                 | Mission list, objectives, win / lose rules per mission                                                                                                                                      | 7          |

## 7. Risks and open questions

- 🟡 **Assets:** the catalog needs many models (indoors, nature, vehicles, animals). Only CC0 / CC-BY, each in `assets.toml`. Quaternius and KayKit packs cover nature and props; vehicles and animals may need new packs. The ~16 MB first load will grow: load per-map assets lazily.
- 🟡 **Sim scope:** height, water and vehicles touch the pure sim (movement, collision, shooting line of sight). Keep the 48 existing tests green; per the user's decision, no new tests.
- 🟡 **Mobile:** the editor is desktop-only (mouse precision). Single Player stays playable on phones.
- 🟡 **Players touch the whole sim:** `soldiers.ts` assumes one human squad and one enemy side. Phase 1b is the riskiest refactor; do it before the editor places units, and keep the 48 tests green.
- 🟡 **Scope creep:** sections 3c to 3g are a large design. Only the data schemas are built early (1c, 1d, 1e); interaction mechanics (8b) wait. Everything unused stays mocked so the game keeps playing as today after each phase.
- 🟡 **Animations:** the models have only idle / run / death (soldiers). Melee swing, dual wield, climbing, carrying, crawling and downed poses need new clips or procedural poses; they will look rough until real animations are added (check CC0 animation packs; Meshy models may bring their own).
- 🟡 **Weapon models:** two-hand versus one-hand and attachments need weapon meshes on the hands. Today the weapon is not a separate model; decide how to show equipment on the character (attach to bones) before 1d.
- 🟢 **Mission goals:** Story mode objectives (reach a point, defend, kill the boss) belong to the Game logic tab; designed in phase 10.
- 🟢 **Multiplayer:** only a disabled button now. Real networking would need a backend or peer-to-peer and a deterministic sim; not planned, but per-player ownership keeps the door open.
- 🟢 **Sharing:** export / import by file first; shared links or a gallery would need a backend (not planned).
- 🟢 **Physics:** none needed for this plan. Ragdolls or vehicles with real physics would be a separate decision (a physics engine would live outside the 60 Hz sim or replace parts of it).

## 8. Decisions

Decided by the user (2026-10-18):

| Topic               | Decision                                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map 1               | Exactly today's development arena                                                                                                                                                                                                                                                                     |
| Single Player       | Two modes: **Story** and **Waves**                                                                                                                                                                                                                                                                    |
| Multiplayer         | A button that exists but does nothing yet                                                                                                                                                                                                                                                             |
| Vehicles            | Prop / asset, or a vehicle unit usable by the player **and** the AI                                                                                                                                                                                                                                   |
| Vehicle rule        | A vehicle needs an operator to move; only human units can operate vehicles (Men of War / Call to Arms style)                                                                                                                                                                                          |
| Players             | Several players each control some units; the AI is one of the players                                                                                                                                                                                                                                 |
| Map storage         | Built into the app (`data/maps/`) **and** in localStorage; no backend                                                                                                                                                                                                                                 |
| Phase order         | Confirmed: phases 1 → 4 first (format, players, menu, editor skeleton, saving), then content                                                                                                                                                                                                          |
| Vehicle ownership   | Any vehicle can be taken by any player; they are neutral and belong to whoever is using them                                                                                                                                                                                                          |
| Passengers shooting | Only in military vehicles with turrets / mounted weapons (Humvee style)                                                                                                                                                                                                                               |
| Vehicle damage      | Only the vehicle takes damage, and only while occupied; the crew is not hurt for now                                                                                                                                                                                                                  |
| Weapons and items   | Weapon stat sheet with damage types (physical, explosive, fire; experimental ones mocked), attachments with percentage modifiers, melee, fists, shield, grenades, medkits S/M/L, defibrillator, 10-slot backpack, two hand slots (1-hand or 2-hand items, dual wield), helmet and vest slots (3d, 3e) |
| World interaction   | Fire as the first environmental hazard; lift and throw objects by strength; climbing; drag or carry a body (3f)                                                                                                                                                                                       |
| Downed state        | A soldier at zero health goes down, keeps shooting, bleeds out, and can be revived (3g)                                                                                                                                                                                                               |
| Unit stats          | A JSON stat sheet per unit (identity, level, XP, speed, stamina, RPG attributes mocked), plus XP per weapon class: melee, pistol, shotgun, rifle, sniper, machinegun, launcher (section 3c)                                                                                                           |

Still open:

1. Steering model: arcade (recommended) or simple physics.
2. First vehicle: land only (recommended), or air and sea too.
3. Stats: which attribute names to keep (strength, dexterity, constitution, perception, intelligence, charisma is a proposal), and whether weapon-class XP comes from kills only or also from hits.
4. Vehicle damage beyond the first version (tank vs. soldier, crew injury).
5. Downed state: bleed-out length, who can revive, whether enemies ignore downed soldiers, and the game-over rule.
6. Defibrillator: time window after death, cost per use, success chance.
7. Does friendly fire apply to explosives and fire (recommended: yes)?
8. How equipment appears on the character models (bone attachment) and where the weapon meshes come from.
