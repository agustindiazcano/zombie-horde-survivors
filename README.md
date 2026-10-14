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

You start in **direct control** of one soldier, with the rest of the squad following you and shooting on their own. Press **Y** to switch to **RTS mode**, select units, send them anywhere on the map, then press **Y** again to take direct control of one of them.

Survive wave after wave. Enemies drop gold, XP and sometimes weapon crates. The game ends when every soldier is dead (the drone doesn't count).

## Controls

### Direct control

| Key / mouse       | Action                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| W / A / S / D     | Move (relative to where the camera looks)                                                            |
| Mouse             | Aim (see _Views_ below)                                                                              |
| Left click (hold) | Fire                                                                                                 |
| Ctrl (or **C**)   | The whole squad crouches: tighter spread, +10% damage, half speed                                    |
| Shift             | The whole squad sprints (1.6x speed) while it has stamina; each unit tires on its own, then recovers |
| Space             | Jump (only the soldier you control)                                                                  |
| T                 | Change view: normal → third person → first person → normal                                           |
| I                 | Squad screen: units, inventories and bonuses (pauses the game)                                       |
| B                 | Open / close the shop (only between waves)                                                           |
| E                 | Next to a crate (a yellow **E** floats above it): open it                                            |
| Y                 | Go back to RTS mode                                                                                  |
| Mouse wheel       | Zoom (normal and third-person views)                                                                 |
| Right-drag        | Rotate and tilt the camera (normal view only)                                                        |

Ctrl+W closes the browser tab and the browser won't let a page block it, so **C** is provided as an alternative way to crouch.

### Views (T)

| View                  | Camera                               | Aiming                                                                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Normal** (top-down) | Above and behind, follows the unit   | The soldier aims at the cursor on the ground. Wheel zooms, right-drag rotates / tilts.           |
| **Third person**      | Over the shoulder, a bit above       | The mouse turns the view 1:1 and instantly; the crosshair in the centre is the aim. Wheel zooms. |
| **First person**      | At the soldier's eyes (model hidden) | Same as third person; the camera lowers when crouching and rises when jumping.                   |

In third and first person the cursor is locked (so you can keep turning) and W / A / S / D move relative to where you look. **Esc** releases the cursor and goes back to the normal view. The view also returns to normal if you switch to RTS mode, the controlled soldier dies, or the game ends.

### RTS mode

| Key / mouse              | Action                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- |
| W / A / S / D            | Pan the camera                                                                    |
| Left click               | Select a soldier                                                                  |
| Left-drag                | Box select (hold **Shift** to add to the selection)                               |
| Right click              | Send the selected units to that point (a right _drag_ rotates the camera instead) |
| F                        | Selected units follow the controlled soldier again                                |
| E                        | Select all                                                                        |
| 1 – 9                    | Select a unit by number (Shift adds)                                              |
| Squad panel (bottom)     | Click a unit to select it; shows each unit's health                               |
| Y                        | Take direct control of the first selected unit                                    |
| Mouse wheel / right-drag | Zoom / rotate and tilt the camera                                                 |
| I                        | Squad screen (pauses the game)                                                    |
| B                        | Shop (only between waves)                                                         |

When you take control with **Y**, only the units that were selected follow you. The rest hold their position (or keep their move order). Every uncontrolled unit shoots the nearest enemy it can see.

### Anywhere

| Key     | Action                                                         |
| ------- | -------------------------------------------------------------- |
| P / Esc | Pause / resume (the pause screen lists your bonuses and stats) |
| M       | Mute / unmute                                                  |
| L       | Dark mode: dim lights and a flashlight per soldier             |
| O       | Settings (graphics, lighting, FPS counter, volume)             |
| F3      | Show / hide the FPS counter                                    |
| R       | Restart (on the game over screen)                              |

## Mobile (landscape)

On a phone or tablet the game switches to a touch layout (add `?mobile=1` to the URL to try it on a desktop). Hold the phone sideways.

| Control           | Action                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Joystick (left)   | Drag a thumb anywhere in the lower-left area to move the whole squad; the others follow           |
| Auto-fire         | The leader aims at the nearest enemy and fires on its own; so does the rest of the squad          |
| Soldier icons     | Top-left row with each unit's health                                                              |
| ⚙ / ☰ / 🛒 / 🎒  | Top-right: settings, main menu, shop (between waves), squad screen and inventories                |
| Inventory         | Tap a weapon, then tap the slot to move it to (drag and drop also works where the browser allows) |
| 📦 (bottom-right) | Appears when the leader stands next to a crate: tap to open it                                    |
| 🧎 / 💨 / ⤒       | Crouch and sprint (tap to toggle) and jump (hold)                                                 |
| Soldier icon      | Tap a soldier icon: direct control passes to it                                                   |
| Pinch / ⛶ / buzz  | Two-finger zoom; full screen button; the phone vibrates when a soldier is hurt                    |

## Radar

The round display in the bottom-right corner is a motion tracker, like the one from the film Aliens. A pulse ring spreads out from the middle of your squad and enemies only show up as bright blips when it crosses them, fading until the next ping. It is centred on your living units and only sees about 30 metres around them. The number at the bottom is the distance to the closest contact. Your units are hollow rings (filled for the one you control, a square for the drone). North is up.

## The squad

- **4 soldiers**, each with its own model, starting with a **pistol**.
- **A drone** (unit 5): a small flying ship that starts **unarmed**. Give it a **Drone gun** (buy one in the shop, or find one in a crate, then drag it into the drone's equipped slot) and it fires slow, hard-hitting shots that ignore cover. Enemies can't touch it, and it doesn't count for game over. Select and command it like any soldier.
- Crouching, sprinting and jumping are set by the unit you control; crouch and sprint affect the whole squad. Sprinting drains each unit's stamina (the orange bar under its icon; the blue bar is its own XP; the grey bar is armor, empty until a unit gets some, and it soaks damage before health); a unit that runs dry walks until it recovers.

## Inventory and weapons

Every unit carries one equipped weapon and a 6-slot backpack. Some enemies drop a **crate** with weapons: pistol, rifle, heavy machine gun or the drone gun. Press **E** next to it to take items or stash your own; to equip weapons and move items between units press **I** (see below). The game pauses while a menu is open. Weapon stats, the drop chance and the loot table are in `data/game.json`.

## Loot, levels and gore

Enemies drop a gold coin and an XP orb. Any of your units (the drone too) collects them by walking over them; they vanish after 60 s. XP raises your level (shown at the top). Enemies show a health bar and light up when hit, and about half of them burst when killed, spraying blood and gibs.

## Pause screen and the squad

Pausing (Esc, P or **I**) shows your bonuses and stats on the left and the whole squad on the right: each unit's health, level, experience and kills. Click a unit to open its window with a 3D view of the model and its inventory (up to four windows at once). Drag weapons between slots to equip them, stash them or hand them to another unit, even across windows; dropping on a taken slot swaps the two. Drag the equipped weapon to an empty backpack slot to unequip it (an unarmed unit can't shoot).

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
- `data/game.json` — all gameplay numbers, validated with a strict schema. `data/characters.json` maps each unit to its model and animation clips.

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

<!-- credits:end -->
