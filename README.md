# Zombie Horde Survivors

A browser-based 3D squad shooter: command a small squad of soldiers and a drone against waves of zombies, skeletons, aliens, hounds, brutes and giant worms. Play it **hands-on** (direct control of one soldier, in top-down, third-person or first-person view) or **from above** (RTS mode: select units and give orders).

Built with Three.js + Vite + TypeScript. No backend: it runs in the browser.

**Play online:** https://agustindiazcano.github.io/zombie-horde-survivors/ (desktop browser, keyboard and mouse).

## Run

```bash
npm install
npm run dev      # dev server (http://localhost:5173)
npm run build    # static files in dist/
npm test         # unit tests
npm run lint && npm run format:check && npm run typecheck
```

## How it plays

**Menus:** Start → **Single Player** (**Story**: no missions yet; **Waves**: pick a map from the list, Map 1 is the built-in arena), **Multiplayer** (coming soon, disabled) or **Editor** (desktop only: a paused map editor with a Play / Stop button and a right-hand panel; New / Open / Save / Export / Import work, its drawing tools are placeholders for now; saved maps appear in the Waves list). Esc steps back one menu.

You start in **direct control** of one soldier, with the rest of the squad following you and shooting on their own. Press **Y** to switch to **RTS mode**, select units, send them anywhere on the map, then press **Y** again to take direct control of one of them.

Survive wave after wave. Enemies drop gold, XP and sometimes weapon crates. The game ends when every soldier is dead (the drone doesn't count).

## Controls

Every key and mouse action (direct control, views, RTS mode, menus, the map editor and the mobile layout) is listed in [docs/CONTROLS.md](docs/CONTROLS.md). The basics: **W A S D** move, the mouse aims, left click fires (the pistol is semi-automatic: one shot per click), **R** reloads, **F** strikes in melee, hold the **right mouse button** in third / first person to aim, **Q** throws a grenade, **T** changes view, **Y** switches between direct control and RTS mode, **I** opens the squad screen, **B** the shop and **Esc** pauses.

## Radar

The round display in the bottom-right corner is a motion tracker, like the one from the film Aliens. A pulse ring spreads out from the middle of your squad and enemies only show up as bright blips when it crosses them, fading until the next ping. It is centred on your living units and only sees about 30 metres around them. The number at the bottom is the distance to the closest contact. Your units are hollow rings (filled for the one you control, a square for the drone). North is up.

## The squad

- **4 soldiers**, all using the Meshy marine model, starting with a **pistol**.
- **A drone** (unit 5): a small flying ship that starts **unarmed**. Give it a **Drone gun** (buy one in the shop, or find one in a crate, then drag it into the drone's equipped slot) and it fires slow, hard-hitting shots that ignore cover. Enemies can't touch it, and it doesn't count for game over. Select and command it like any soldier.
- Crouching, sprinting and jumping are set by the unit you control; crouch and sprint affect the whole squad. Sprinting drains each unit's stamina (the orange bar under its icon; the blue bar is its own XP; the grey bar is armor, empty until a unit gets some, and it soaks damage before health); a unit that runs dry walks until it recovers.

## Inventory and weapons

Every unit has two hands, a vest slot and a 10-slot backpack. Some enemies drop a **crate** with weapons: pistol, rifle, heavy machine gun or the drone gun. Press **E** next to it to take items or stash your own; to equip weapons and move items between units press **I** (see below). The game pauses while a menu is open. Weapon and item stats are in `data/items.json`; the drop chance and the loot table are in `data/game.json`.

## Downed soldiers

A soldier who reaches zero health does not die at once: it goes **down** (lies on the floor, "DOWN" in the health line, greyed icon) and bleeds out in **30 seconds**. From the floor it can crawl slowly and shoot a **one-handed** weapon (a pistol) with poor aim; a rifle or machine gun will not fire. Enemies prefer soldiers on their feet, but every hit on a downed one shortens its time.

An ally on their feet who carries a **medkit** and stays within reach for 3 seconds uses it automatically and stands the soldier back up with the kit's health (small 25, medium 50, large 100); soldiers on `follow` walk over to help. Without a medkit the soldier dies when the timer ends. A soldier who died less than 30 seconds ago can be brought back by an ally with a **defibrillator** (4 seconds next to the body, one use, half health). The game is over when nobody is left on their feet. Medkits and the defibrillator come from crates and the shop; a medkit can also be used from the squad screen to heal yourself.

## Loot, levels and gore

Enemies drop a gold coin and an XP orb. Any of your units (the drone too) collects them by walking over them; they vanish after 60 s. XP raises your level (shown at the top). Enemies show a health bar and light up when hit, and about half of them burst when killed, spraying blood and gibs.

## Pause screen and the squad

Pausing (Esc, P or **I**) shows your bonuses and stats on the left and the whole squad on the right: each unit's health, level, experience and kills. Click a unit to open its window with a 3D view of the model and its inventory (up to four windows at once). Drag weapons between slots to equip them, stash them or hand them to another unit, even across windows; dropping on a taken slot swaps the two. Drag a held weapon to an empty backpack slot to unequip it (an unarmed unit can't shoot). A one-handed weapon fits either hand, a two-handed one only the right hand with the left hand free; stackable items such as medkits share a slot.

There are two kinds of experience. The **global** XP comes from the blue orbs and levels the squad up (perks). Each unit also has **its own** XP, which grows when that unit kills an enemy, plus a kill counter.

## Settings

Press **O** (or use the Settings button on the title screen and the pause screen) for the settings window. Opened in the middle of a game it pauses, and gives the game back when you close it. Everything is saved in your browser.

| Section  | Options                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Graphics | Quality preset (Low / Medium / High), shadows on/off, shadow quality, resolution (50-100% of the screen's pixel density), blood and gibs |
| Lighting | Normal, or dark with a flashlight per soldier (also **L**)                                                                               |
| Other    | FPS counter (also **F3**), sound volume                                                                                                  |

If the game runs slowly, try the **Low** preset or lower the resolution. Changing any graphics option by hand switches the preset to Custom.

## Perks and the shop

Every level-up pauses the game and offers **3 random perks** for the whole squad: pick one with a click or the **1 / 2 / 3** keys. Perks stack up to a limit: damage, fire rate, movement speed, max health, health regeneration and a bigger loot pickup radius.

Between waves (the countdown at the top) press **B** to open the **shop** and spend gold: heal the squad, buy an armor vest (+25 armor for every soldier), bring back a fallen soldier, buy a pistol or heavy machine gun for the selected unit, or buy permanent upgrades. Prices grow with each purchase. The game is paused while a menu is open. Perks and shop items are in `data/game.json` (`perks`, `shop`).

Crates can also hold an **armor plate** (+20 armor): taking it wears it at once instead of using a backpack slot. Armor soaks damage before health and caps at 50.

## Enemies

Variants are multipliers on the base zombie in `data/game.json` (`enemies`); each has its own model in `data/characters.json`.

| Enemy             | From wave | Traits                       |
| ----------------- | --------- | ---------------------------- |
| Zombie            | 1         | Baseline                     |
| Skeleton          | 1         | Slow, fragile                |
| Alien             | 2         | Fast, fragile                |
| Hound (four legs) | 2         | Very fast, low health        |
| Brute (monster)   | 3         | Slow, huge health and damage |
| Giant worm        | 4         | Very slow, very tanky, wide  |

Zombie speed and health also grow with each wave.

**Mini boss:** every 3rd wave one enemy comes back as a mini boss: a darker copy of one of the models, with glowing red eyes and a slower walk. Each boss is tougher and bigger than the last: health x50, x70, x100, x200, x500 (then x1.6 more each time), damage x2 up to x8, and a size from 2x up to 5x that grows with its health. They pay much better gold and XP. The bosses cycle zombie, skeleton, alien, brute, hound (`boss` in `data/game.json`).

## Architecture

- `src/sim` — the pure simulation (squad, enemies, waves, loot). It imports no Three.js; ESLint and a test enforce that, so it can be unit-tested.
- `src/render` — Three.js rendering (arena, characters, effects, cameras).
- `src` — input, HUD, audio and the fixed-timestep game loop (the render interpolates between steps).
- `data/maps/*.json` — the built-in maps (Map 1); `data/catalog.json` — the editor's unit and asset lists.
- `data/game.json` — all gameplay numbers, validated with a strict schema. `data/characters.json` maps each unit to its model and animation clips.

## License

Copyright © 2026 Agustin Diaz Cano / Wylan Studios. All rights reserved. The game and the Wylan Engine are proprietary; see [LICENSE](LICENSE). Third-party assets keep their own licenses (see Assets and Credits).

## Assets

Every third-party asset is listed in `assets.toml` (name, author, source, license, path). Allowed licenses: CC0-1.0, CC-BY-3.0, CC-BY-4.0. `npm run check:assets` enforces this and CI runs it. Run `npm run credits` to regenerate the section below.

## Credits

<!-- credits:start -->

- **Soldier_Male (Ultimate Animated Character Pack)** by Quaternius — [CC0-1.0](https://quaternius.com/packs/ultimatedanimatedcharacter.html)
- **Soldier_Female (Ultimate Animated Character Pack)** by Quaternius — [CC0-1.0](https://quaternius.com/packs/ultimatedanimatedcharacter.html)
- **BlueSoldier_Male (Ultimate Animated Character Pack)** by Quaternius — [CC0-1.0](https://quaternius.com/packs/ultimatedanimatedcharacter.html)
- **Character_Soldier (Toon Shooter Game Kit)** by Quaternius — [CC0-1.0](https://quaternius.com/)
- **Zombie (enemy)** by Quaternius — [CC0-1.0](https://poly.pizza/m/VlXjG0N8Eg)
- **Skeleton Minion (KayKit Character Pack: Skeletons) (enemy)** by Kay Lousberg — [CC0-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)
- **Alien (enemy)** by Quaternius — [CC0-1.0](https://poly.pizza/m/HYUUkdugoP)
- **Wolf (hound enemy)** by Quaternius — [CC0-1.0](https://poly.pizza/m/P1gU3Qkr9r)
- **Orc (brute enemy)** by Quaternius — [CC0-1.0](https://poly.pizza/m/5vO2YJsPEf)
- **Worm (enemy)** by Quaternius — [CC0-1.0](https://poly.pizza/m/KiNAaBa4cK)
- **Spaceship (used as the drone)** by Quaternius — [CC0-1.0](https://poly.pizza/m/DbGajMHrvp)
- **Digital Camo Soldier (marine soldier and infected marine enemy)** by Meshy AI — [CC-BY-4.0](https://www.meshy.ai)
- **SUV (Car Kit)** by Kenney — [CC0-1.0](https://kenney.nl/assets/car-kit)
- **Dog (Animal Pack Vol.2)** by Quaternius — [CC0-1.0](https://opengameart.org/content/animated-animales-low-poly)
- **Cat (Animal Pack Vol.2)** by Quaternius — [CC0-1.0](https://opengameart.org/content/animated-animales-low-poly)

<!-- credits:end -->
