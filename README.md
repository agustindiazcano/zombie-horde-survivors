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

Controls and asset credits will be added as those features land.
