/**
 * The public web build (GitHub Pages) only offers Single Player → Waves → Map 1. The heavy game
 * (every other map, Story, Development, Multiplayer, the editor) runs locally. The Pages workflow
 * sets `VITE_WEB_DEMO=true` at build time; `npm run dev` and a plain `npm run build` leave it off.
 * Adding `?dev=1` to the URL lifts the limit on the deployed build, to try the other maps on a
 * phone (Start → Development).
 */
const devOverride = (): boolean => {
  try {
    return new URLSearchParams(location.search).has('dev');
  } catch {
    return false;
  }
};

export const WEB_DEMO = import.meta.env.VITE_WEB_DEMO === 'true' && !devOverride();
