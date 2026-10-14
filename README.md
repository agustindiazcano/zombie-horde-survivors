# Zombie Shooter

Browser-based 3D zombie shooter prototype (Three.js + Vite + TypeScript).

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # static files in dist/
npm test         # unit tests
npm run lint && npm run format:check && npm run typecheck
```

## Architecture

- `src/sim` — pure simulation (no Three.js imports; enforced by ESLint and a test).
- `src/render` — Three.js rendering.

## Controls

You command a squad of soldiers. The game starts in **direct control** of one soldier; press **Y** to switch to **RTS mode**.

| Direct control    | Action                                                        |
| ----------------- | ------------------------------------------------------------- |
| W / A / S / D     | Move (relative to the screen)                                 |
| Mouse             | Aim                                                           |
| Left click (hold) | Fire                                                          |
| Ctrl (or C)       | Whole squad crouches: tighter spread, +10% damage, half speed |
| Shift             | Whole squad sprints (1.6x speed)                              |
| Space             | Jump (only the soldier you control)                           |
| Y                 | Back to RTS mode                                              |

| RTS mode          | Action                                            |
| ----------------- | ------------------------------------------------- |
| W / A / S / D     | Pan the camera                                    |
| Left click / drag | Select soldier / box select (Shift adds)          |
| Right click       | Send selected soldiers to that point              |
| F                 | Selected soldiers follow the controlled one       |
| E                 | Select all                                        |
| 1-9               | Select soldier by number                          |
| Y                 | Take direct control of the first selected soldier |

The squad also has a **drone** (unit 5): a flying ball with slow, hard-hitting shots that ignore cover. Zombies can't touch it, and it doesn't count for game over. Select and command it like any soldier.

Uncontrolled soldiers shoot the nearest zombie in sight on their own. When you press Y, only the soldiers selected at that moment follow the controlled one; the others hold their position (or keep their move order).

## Inventory and weapons

Every unit carries one equipped weapon and a 6-slot backpack. Soldiers start with a **rifle**, the drone with a **drone cannon**. Some zombies drop a **crate** holding a **pistol** and/or a **heavy machine gun** (drop chance and loot table are in `data/game.json`).

| Key | Action                                                                                             |
| --- | -------------------------------------------------------------------------------------------------- |
| I   | Open / close the inventory (tabs for each unit; Equip swaps with the backpack)                     |
| E   | Next to a crate (the yellow **E** appears above it): open it. Take items, stash items, or Take all |

The game pauses while an inventory window is open.

| Anywhere    | Action                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| R           | Restart (game over)                                                                                     |
| M           | Mute / unmute                                                                                           |
| P / Esc     | Pause / resume                                                                                          |
| Mouse wheel | Zoom in / out (both modes)                                                                              |
| Right-drag  | Rotate and tilt the camera (both modes). In RTS mode a right _click_ without moving still orders a move |

## Loot, levels and gore

Enemies drop a gold coin and an XP orb; they're picked up by any of your units (the drone too) walking over them, and vanish after 60 s. XP raises your level (shown at the top). About half of the enemies burst when killed, spraying blood and gibs. Enemies show a health bar and light up when hit. Drop values, the explode chance and level curve are in `data/game.json` (`zombie.gold`/`xp`, `enemies.*.rewardScale`, `loot`, `progress`, `gore`).

## Enemies

Variants are defined in `data/game.json` (`enemies`) as multipliers on the base zombie, and each has its own model in `data/characters.json`.

| Enemy             | From wave | Traits                       |
| ----------------- | --------- | ---------------------------- |
| Zombie            | 1         | Baseline                     |
| Skeleton          | 1         | Slow, fragile                |
| Alien             | 2         | Fast, fragile                |
| Hound (four legs) | 2         | Very fast, low health        |
| Brute (monster)   | 3         | Slow, huge health and damage |
| Giant worm        | 4         | Very slow, very tanky, wide  |

## Assets

Every third-party asset is listed in `assets.toml` (name, author, source, license, path).
Allowed licenses: CC0-1.0, CC-BY-3.0, CC-BY-4.0. `npm run check:assets` enforces this and CI runs it.
Run `npm run credits` to regenerate the section below.

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
