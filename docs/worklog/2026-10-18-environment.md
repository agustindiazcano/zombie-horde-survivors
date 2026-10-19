# 2026-10-18 — Environment: sky, time of day, light colour and weather

On `feat/story-mode`. 48 tests and all checks pass; nothing seen in a browser (it is all visual: expect tuning).

**Plan that was followed**

1. Map format: an optional `environment` section (`EnvironmentSchema` in `src/sim/config.ts`, all fields defaulted, so old maps and Map 1 look as before: noon, clear).
2. Renderer: `src/render/environment.ts` (`EnvironmentView`) takes over the scene's sun and ambient light and adds a sky dome, sun and moon discs, clouds, rain, snow, sand and fog. `GameRenderer.setEnvironment` feeds it; the dark mode (L) still forces night lighting and flashlights.
3. Editor: a new **Environment** tab with live preview; `main.ts` skips the arena rebuild when only the environment changed.
4. Docs and checks.

**What it does**

- `sky` on/off (gradient dome; off = plain dark background), `sun`, `moon` on/off.
- `timeOfDay` 0–24 (slider with Dawn / Noon / Dusk / Night buttons): sun angle and position (shadows follow), light intensity and colour (white at noon, orange at dawn and dusk, blue moonlight at night), sky colours. Noon equals the old lighting. Flashlights switch on at night.
- `lightColor` (colour picker, "Auto" goes back to the time-of-day colour) replaces the main light's colour.
- `clouds` 0–1 (0 = none, more and greyer with strength); `rain`, `snow`, `sand` (sandstorm), `fog`, each 0 (off) to 1 (extreme), shown as Off / Light / Medium / Heavy / Extreme. Weather dims the light and greys the sky; sand tints the fog tan.
- Slider drags are one undo step (the first move); the preview updates as it moves.
- Not done: lightning and storms, wind on clouds from a setting, rain sounds, sand and snow on the ground, a separate fog colour, per-object fog tuning, a starfield, moon phases; particle counts (`RAIN_COUNT` etc. in `environment.ts`) and colours are guesses to tune after looking.
