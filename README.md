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

| Direct control    | Action                        |
| ----------------- | ----------------------------- |
| W / A / S / D     | Move (relative to the screen) |
| Mouse             | Aim                           |
| Left click (hold) | Fire                          |
| Y                 | Back to RTS mode              |

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

## Assets

Every third-party asset is listed in `assets.toml` (name, author, source, license, path).
Allowed licenses: CC0-1.0, CC-BY-3.0, CC-BY-4.0. `npm run check:assets` enforces this and CI runs it.
Run `npm run credits` to regenerate the section below.

## Credits

<!-- credits:start -->

- **Soldier_Male (Quaternius Ultimate Animated Character Pack)** by Quaternius — [CC0-1.0](https://quaternius.com/packs/ultimatedanimatedcharacter.html)
- **Soldier_Female (Quaternius Ultimate Animated Character Pack)** by Quaternius — [CC0-1.0](https://quaternius.com/packs/ultimatedanimatedcharacter.html)
- **Character_Soldier (Quaternius Toon Shooter Game Kit)** by Quaternius — [CC0-1.0](https://quaternius.com/)
- **Character Soldier (Kenney Mini Arena)** by Kenney — [CC0-1.0](https://kenney.nl/assets/mini-arena)
- **Skeleton Minion (KayKit Character Pack: Skeletons) - used as the zombie** by Kay Lousberg — [CC0-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)

<!-- credits:end -->
