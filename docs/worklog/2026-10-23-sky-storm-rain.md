# 2026-10-23: sky, night, storm and rain from the user's HTML demos

The user pointed at three demos in `game-engine/` (`ai_studio_code (2)`, `diaz_cano_engine_3d_vfx_toaster_optimization_sandbox (1)`, `motor_atmosferico_y_oceano_ligero_3d (1)`) as the reference for the sky, the dark and the weather.

- **Sky shader** (`src/render/environment.ts`): the dome is one shader with a steeper horizon, the sun disc and two halos, the moon with its own halo and twinkling stars. The old sun and moon discs and the star points are gone. New `environment` fields: `sunAzimuth`, `sunGlow`, `dayCycle` (auto clock, hours per real minute).
- **Darker nights:** `nightLight` (0 to 1, default 0.35) sets how much ambient and moon light is left at night. The dark mode (L) keeps the old moonlit look. The real lamps (street lights, sirens, orbs, flashlights) were always lights in the scene; the old night ambient (0.75) simply drowned them.
- **Volumetric clouds:** a noise layer in the sky shader (golden-angle octaves, phi scaling), lit from the sun or moon with a rim and a shadow side, grey in storms. Graphics option **Sky clouds**: simple puffs (the old ones) or 3 / 4 / 5 octaves. Map field `cloudDensity`.
- **Lightning** (`lightning`, 0 to 1): a jagged bolt with branches at a random spot 70 to 200 m away, a double flash that lifts the sky, the clouds, the ambient and the sun, then fades. No thunder sound yet.
- **Rain drops** (`src/render/rainFx.ts`, graphics option **Rain drops**): a streak cylinder around the camera, wet darkening and spreading rings on the ground (a patch on its material) and ring ripples in the ocean normal. It replaces the 2500 line drops when on.
- **Water quality** (graphics option **Water**): 0 flat (no ripples, caustics or orbs), 1 light (ripples), 2 normal (cheaper parallax, caustics, 3 orbs), 3 as the map says. Presets: Toaster 0, Low 1, Medium 2, High and Ultra 3.
- **Editor:** sun heading, halo, auto day, night light, cloud thickness, lightning and weather buttons.

Checked in headless Chrome (the sky, clouds, rain, ground patch and the ocean at the four water qualities compile and render, no shader errors; a screenshot of a rainy dusk looked right). Not seen in the game itself. Lint, format, typecheck, build and the 51 tests pass.
