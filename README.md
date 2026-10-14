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

| Anywhere | Action              |
| -------- | ------------------- |
| R        | Restart (game over) |
| M        | Mute / unmute       |
| P / Esc  | Pause / resume      |

## Assets

Every third-party asset is listed in `assets.toml` (name, author, source, license, path).
Allowed licenses: CC0-1.0, CC-BY-3.0, CC-BY-4.0. `npm run check:assets` enforces this and CI runs it.
Run `npm run credits` to regenerate the section below.

## Credits

<!-- credits:start -->

- **Rogue (KayKit Character Pack: Adventurers) - used as the soldier** by Kay Lousberg — [CC0-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
- **Skeleton Minion (KayKit Character Pack: Skeletons) - used as the zombie** by Kay Lousberg — [CC0-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)

<!-- credits:end -->
