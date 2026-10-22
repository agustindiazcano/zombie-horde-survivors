/**
 * The public web build (GitHub Pages) only offers Single Player → Waves → Map 1. The heavy game
 * (every other map, Story, Development, Multiplayer, the editor) runs locally. The Pages workflow
 * sets `VITE_WEB_DEMO=true` at build time; `npm run dev` and a plain `npm run build` leave it off.
 */
export const WEB_DEMO = import.meta.env.VITE_WEB_DEMO === 'true';
