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

| Input             | Action                        |
| ----------------- | ----------------------------- |
| W / A / S / D     | Move (relative to the screen) |
| Mouse             | Aim                           |
| Left click (hold) | Fire                          |

## Assets

Every third-party asset is listed in `assets.toml` (name, author, source, license, path).
Allowed licenses: CC0-1.0, CC-BY-3.0, CC-BY-4.0. `npm run check:assets` enforces this and CI runs it.
Run `npm run credits` to regenerate the section below.

## Credits

<!-- credits:start -->

- **Rogue (KayKit Character Pack: Adventurers) - used as the soldier** by Kay Lousberg — [CC0-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
- **Skeleton Minion (KayKit Character Pack: Skeletons) - used as the zombie** by Kay Lousberg — [CC0-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)

<!-- credits:end -->
