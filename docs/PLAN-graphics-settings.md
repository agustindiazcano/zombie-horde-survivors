# Plan: the graphics settings (every effect configurable, with its cost shown)

Status: **a plan, nothing is built** (written 2026-10-23, asked for by the user). Goal in the user's words: everything must be configurable so the game runs on a high-end PC and on a toaster, the **player** decides what looks good or bad, and the settings show **how heavy** each option is and **whether it loads the GPU or the CPU**. The graphics settings become a near-full-screen pop-up.

## 1. Where it stands today

`src/settings.ts` holds 11 graphics fields and five presets (Toaster, Low, Medium, High, Ultra); `src/settingsPanel.ts` is a narrow window with one column of selects and toggles and no cost information. Many new effects have no switch of their own (they hang from a map value or from another option), so the player cannot turn them off one by one.

| Option today        | Values       | Real cost it has (estimate, not measured)                                                   |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| Shadows             | on / off     | GPU: the scene is drawn once more from the sun                                              |
| Shadow size         | 1K / 2K / 4K | GPU fill and VRAM (16 MB at 1K, 64 MB at 2K, 256 MB at 4K for a 32-bit depth map)           |
| Resolution          | 25% to 200%  | GPU fill rate: the most direct lever, cost grows with the square                            |
| Surface depth       | 0 to 3       | GPU fragment: parallax steps per pixel on walls                                             |
| Textures            | 0 to 3       | VRAM and bandwidth (512 px, 1K sets); download only for ultra                               |
| Water               | 0 to 3       | GPU fragment (ripples, caustics, parallax, up to 8 neon lights); vertex waves at every step |
| Water reflection    | 0 to 2       | **GPU and CPU**: a second render of the whole scene (draw calls double: CPU submit too)     |
| Sky clouds          | 0 to 3       | GPU fragment: 3 to 5 noise octaves per sky pixel, twice                                     |
| Rain drops          | on / off     | GPU: streak cylinder and ring noise on the ground and water                                 |
| Rain on the lens    | 0 to 2       | GPU: one frame copy plus a full-screen noise pass                                           |
| Filmic tone mapping | on / off     | GPU: almost free                                                                            |
| Blood and gibs      | on / off     | CPU (particles, pooled meshes) and a little GPU                                             |

## 2. Options that exist in the code but cannot be switched yet

| Effect                                                   | Today                             | Proposed option                                                 | Cost    |
| -------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------- | ------- |
| Snow layer (`snowLayer.ts`, patched into every material) | On whenever snow cover > 0        | Snow on surfaces: off / patchy / full                           | GPU     |
| Ground detail noise, rock, cloud shadows (`groundLook`)  | Always on                         | Ground detail: off / colour only / colour and shadows           | GPU     |
| Height fog (`heightFog.ts`)                              | Always on                         | Fog: off / simple / height                                      | GPU     |
| Lightning and its flash                                  | Always on when the map has it     | Lightning: off / flash only / bolt and flash (epileptic option) | GPU     |
| Neon orbs as real point lights                           | 8 lights at the top water quality | Dynamic lights: 0 / 4 / 8 / 16 (also lamps, torches, sirens)    | GPU     |
| Ice (the frozen sea)                                     | Follows water quality             | Ice detail: flat / cracks / bubbles / deep bubbles              | GPU     |
| Antialiasing                                             | Fixed at start                    | Off / FXAA / MSAA 4x (needs a restart of the renderer)          | GPU     |
| Draw distance and fog far                                | Fixed                             | Draw distance: near / normal / far                              | GPU+CPU |
| Crowd detail (skinned views, bone animation rate)        | Same for every enemy              | Animation rate by distance; max visible enemies                 | CPU     |
| Particles (blood, sparks, rain streaks, sand, snow)      | Counts fixed in code              | Particles: 25% / 50% / 100%                                     | CPU+GPU |
| FOV, frame cap, vsync                                    | Not present                       | FOV slider; cap 30 / 60 / 120 / off                             | both    |
| Water mirror resolution                                  | Half or full                      | Keep, add a quarter size                                        | GPU     |

## 3. The cost indicator

Every option carries a cost record next to its definition, so the panel and the presets read from one table:

```text
cost: { gpu: 0..5, cpu: 0..5, vram: MB | 0, note: 'a second render of the scene' }
```

| Part                    | What it shows                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chip beside each option | `GPU ▮▮▮▯▯` and `CPU ▮▯▯▯▯` for the **selected value** (the chip changes when the value changes), and a tooltip with the note                             |
| Total bar at the top    | Sum of the chosen options as three bars (GPU, CPU, VRAM), with a word: Light, Medium, Heavy, Very heavy. The sum is relative to the Ultra preset (= 100%) |
| Colour                  | Green to red by weight, plus the word (never colour alone, so it reads for everyone)                                                                      |
| Honest label            | "Estimated" until measured. After the benchmark below it says "Measured on this machine"                                                                  |

**Stage 1 (static):** hand-written estimates from section 1, ordered by reasoning (draw calls, fragment passes, memory). Cheap, ships first.

**Stage 2 (measured):** a "Measure my machine" button runs a short fixed camera path three times per option (off, middle, max), reads `renderer.info` (draw calls, triangles, textures) and the frame time, and separates GPU from CPU with `EXT_disjoint_timer_query_webgl2` where the browser exposes it (Chrome does, Firefox and Safari usually not; fall back to "frame time" only). The result replaces the estimates in the chips, is saved in localStorage, and drives an optional "Recommend settings for 60 fps" button. Not built before stage 1 has been looked at.

## 4. The window

A modal over about 90% of the screen (centered, with the game still drawn dimmed behind it, so changes are visible live when the game is paused; a "Preview" strip shows the scene through a window when it is not).

| Area          | Content                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header        | Title, the three total bars, the preset row (Toaster, Low, Medium, High, Ultra, Custom), Reset, Close                                                     |
| Left column   | Categories: Quality, Shadows and light, Water, Sky and weather, Surfaces, Effects, Performance (resolution, antialiasing, caps), Gameplay graphics (gore) |
| Main area     | The options of the category: label, control, cost chip, one-line "what it does"; an "Advanced" fold for the numeric values                                |
| Footer        | The FPS counter toggle, "Measure my machine" (stage 2), the note "Changes apply right away and are saved in this browser"                                 |
| Keyboard      | Tab and arrows move, Esc closes; every control reachable without the mouse; the existing `O` key opens it                                                 |
| Small screens | Collapses to one column; the mobile build keeps its Low default                                                                                           |

## 5. How to build it (the code)

| Step | Work                                                                                                                                                                                      | Size |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1    | `src/graphicsOptions.ts`: a registry (id, label, group, values with labels, `cost` per value, a note) as data, and `Settings` / presets built from it instead of the hand-written lists   | 🟡 M |
| 2    | Move `settings.ts` load / save / `qualityOf` onto the registry (unknown or missing keys fall back to the default, as today)                                                               | 🟡 S |
| 3    | The new window `src/graphicsPanel.ts/.css` reading the registry; keep `SettingsPanel` for the non-graphics part (aim, volume, lighting) or fold it in as a second page                    | 🟡 L |
| 4    | The cost bars and chips (stage 1, static numbers)                                                                                                                                         | 🟡 S |
| 5    | Add the missing switches of section 2 one at a time, each with its GRAPHICS.md rule (snow, ground detail, fog, lightning, lights, antialiasing, draw distance, particles, FOV, frame cap) | 🟢 M |
| 6    | Stage 2: the benchmark path and timer queries, saved results, recommend button                                                                                                            | 🟢 L |

Rules that stay: options are player options (localStorage, never part of the sim or of a map file); a map's values stay the author's intent and the player's options only hold them back, as the water quality does today; docs/GRAPHICS.md lists every option and preset (update it in the same commit); no new tests (the user's decision), so each step is checked by lint, typecheck, build and a headless Chrome page where a shader changes.

## 6. Open questions for the user

| Question                                                                                    | Recommendation                                        |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Should the panel pause the game while open, or draw over the live game?                     | Pause (already how the settings work), with a preview |
| Start with the static cost numbers or wait for the measured ones?                           | Static first, measured later                          |
| Keep five presets or add a "Recommend for this machine" that picks one after the benchmark? | Both, the recommendation as a button                  |
| Antialiasing options need a renderer restart: restart on Apply, or only on the next launch? | Restart on Apply with a notice                        |
