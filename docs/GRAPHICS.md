# Graphics rules and formulas

The single place that explains how the sky, the light, the weather and the water are drawn. Physics is in [PHYSICS.md](PHYSICS.md); the author's own techniques and the paper plan are in [TECHNIQUES.md](TECHNIQUES.md). Change this file in the same commit whenever a rule or formula here changes.

Everything is Three.js with hand-written GLSL. Code: `src/render/environment.ts` (sky, light, weather, lightning), `src/render/oceanView.ts` (water), `src/render/rainFx.ts` (rain drops), `src/settings.ts` (graphics options and presets). The numbers of a map live in `environment` (see `EnvironmentSchema` in `src/sim/config.ts`); nothing there changes the rules of the game.

## 1. Graphics options and presets

| Option     | Values                                                      | What it changes                                                                                              |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Water      | 0 flat, 1 light, 2 normal, 3 full                           | How much of the map's water look is drawn (section 5). The look itself is the map's; this only holds it back |
| Sky clouds | 0 simple puffs, 1 / 2 / 3 volumetric with 3 / 4 / 5 octaves | Puff meshes or the cloud layer inside the sky shader (section 3)                                             |
| Rain drops | on / off                                                    | Streak cylinder, wet ground with rings and ring ripples in the sea, instead of 2500 line drops (section 4)   |

| Preset  | Water | Sky clouds | Rain drops |
| ------- | ----- | ---------- | ---------- |
| Toaster | 0     | 0          | off        |
| Low     | 1     | 0          | off        |
| Medium  | 2     | 1          | on         |
| High    | 3     | 2          | on         |
| Ultra   | 3     | 3          | on         |

## 2. Sky, sun, moon and night

| Rule         | Detail                                                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sun path     | `angle = (hour - 6) / 24 * 2 pi`, `elevation = sin(angle)`, horizontal heading `(cos angle, 0.25)` turned around Y by `sunAzimuth` degrees. The moon is exactly opposite. `dayCycle` adds `dayCycle` hours per real minute to `timeOfDay`                   |
| Day factors  | `day = smoothstep(-0.1, 0.35, elevation)`, `twilight = max(0, 1 - abs(elevation) / 0.3)`                                                                                                                                                                    |
| Dome         | One shader on a sphere that follows the camera: `col = mix(top, horizon, (1 - h)^2.5)`, where `top` and `horizon` come from the time of day, twilight, weather (grey) and sand (ochre)                                                                      |
| Sun          | `sunCos = dot(dir, sunDir)`; disc `smoothstep(0.9985, 0.9993, sunCos)`; halo `(sunCos^16 * 0.45 + sunCos^256 * 1.2) * sunGlow`; colour from pale yellow to orange with the twilight                                                                         |
| Moon         | Same shape opposite the sun: disc `smoothstep(0.9988, 0.9994, moonCos)`, halo `moonCos^24 * 0.35 * sunGlow`, only at night                                                                                                                                  |
| Stars        | A grid of 260 cells per unit direction; a cell holds a star when its hash exceeds 0.994; brightness `0.5 + 0.5 sin(3t + 100 s)`; only above the horizon and at night                                                                                        |
| Light levels | Sun light `= nightSun + (2.2 - nightSun) * day`, ambient `= nightAmbient + (1.2 - nightAmbient) * day`, both reduced by the weather. `nightSun = 0.08 + 1.02 * keep`, `nightAmbient = 0.1 + 0.65 * keep`, with `keep = nightLight` (the dark mode forces 1) |
| Weather dim  | `murk = max(clouds * 0.6, rain * 0.55, snow * 0.4, sand * 0.6, fog * 0.4)` greys the sky and dims sun and ambient                                                                                                                                           |
| Fog          | Exponential fog (`FogExp2`), density `max(fog * 0.045, sand * 0.04, rain * 0.012, snow * 0.01)`, coloured like the horizon                                                                                                                                  |

## 3. Volumetric clouds

Drawn in the sky shader when the Sky clouds option is not 0. The ray of each pixel is cut with a plane: `at = cameraPosition + dir * 180 / (h + 0.14)`, so the layer bends towards the horizon.

| Rule     | Detail                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Noise    | `cloudFbm`: value noise summed over `octaves`, amplitude halves each octave, and **each octave's point is turned by the golden angle (matrix `mGold`) and scaled by phi (1.618)**, so no grid direction repeats. Two samples are mixed `0.66 / 0.34` |
| Coverage | `thresh = 1 - cover`, `raw = smoothstep(thresh, thresh + 0.32, noise)`; `cover = min(clouds + rain * 0.3, 0.96)`; thickness `density = raw * cloudDensity`                                                                                           |
| Light    | One more noise sample shifted towards the light (sun, or moon when the sun is down) gives the thickness the light crosses: `beer = exp(-1.35 t)`, `powder = 1 - exp(-2.4 density)`, `lit = mix(beer, beer * (0.45 + 0.9 powder), 0.75)`              |
| Rim      | `rim = exp(-1.55 density) * hg(dot(dir, light), 0.68) * 1.85` with the Henyey-Greenstein phase `hg`: the bright edge of a cloud facing the light                                                                                                     |
| Colour   | Lit and shadow colours go from night blue through day white to a sunset orange, and to dark grey with the weather                                                                                                                                    |

## 4. Lightning and rain

| Rule          | Detail                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strikes       | Every `(4 + 11 u) / max(lightning, 0.05)` seconds (`u` random in [0, 1)). The render uses `Math.random`: lightning never touches the sim                                                                                        |
| Bolt          | A path from y = 110 down to y = -5, 6 to 12 m per segment, each joint pushed up to 5 m sideways; from the fourth joint on, 22% fork into a three-segment branch. 70 to 200 m from the camera, additive, visible 0.3 s           |
| Flash         | `flash(t) = max(exp(-9 t), 0.7 exp(-7 (t - 0.16)))` (the second term only after 0.16 s), over 1.4 s. It adds to the sky and the clouds (`uFlash`), to the ambient (`+1.8 * flash`) and to the sun (`+1.2 * flash`)              |
| Rain streaks  | A 14 m radius cylinder around the camera; `uv = (x * 160, y * 6 + 7.5 t)`; a cell draws a streak when `hash > 1 - 0.22 * rain`                                                                                                  |
| Ripples       | `rainRipples(p, t)`: a grid of 0.9 m cells, in each a ring centred on a hashed point spreads `0.45` per unit phase and fades: `sin((d - k * 0.45) * 45) * smoothstep(0.45, 0, d) * (1 - k)` with `k = fract(1.6 t + 6.28 hash)` |
| On the ground | The ground material gets a patch: colour `* (1 - 0.3 rain) + bluish * ring * 0.24 * rain`                                                                                                                                       |
| On the sea    | The ring height is sampled three times and bends the normal: `N += (r0 - rx, 0, r0 - rz) * 2.4 * rain` (not at Water 0)                                                                                                         |

## 5. Water look

Code: `src/render/oceanView.ts`. The waves themselves are in PHYSICS.md section 7 (the shader repeats `oceanHeight`). The look is `environment.water`; every field has a default.

| Rule          | Detail                                                                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depth colour  | `S = clamp(depth * 0.0085 * saturationBrake, 0.001, 0.2492)`, light left `v = 1 - (S / 0.25)^phi`; the colour is `shallow * v^absorb`, with `absorb = mix(1, (1, phi, phi^2), chromaticFriction * 0.55)`: red dies first, then green, then blue |
| Reflectivity  | `r0 = ((impedance - 0.082) / (impedance + 0.082))^2`; `fresnel = r0 + (1 - r0) * curve`. Curve `area`: `(1 - cos)^(phi^2)`. Curve `sapito`: `phi^(-(pi/2 / theta) * ((pi/2 - theta) / (pi/2)) * 2.2)`                                           |
| Ripples       | `micro`: four octaves of sharp ripples, each turned by the golden angle and scaled by phi; they bend the normal (`normalDistortion`) and drive the parallax (`pomSteps`, `pomDepth`) and the caustics                                           |
| Caustics      | `micro(floor * 1.35 + 0.38 t)^(phi^2) * 2.8`, bent by the normal, strongest in clear shallows by day                                                                                                                                            |
| Sun and moon  | Glints `pow(N . H, 220) * 4.2 + pow(N . H, 30) * 0.45` with `H` between the light and the eye; the moon the same at night in blue                                                                                                               |
| Foam          | On the sharpest crests and along the shore: `smoothstep(0.24, 0.76, crest * 0.9 + shore * 0.9 + (h0 - 0.5) * 0.24)`                                                                                                                             |
| Neon orbs     | Up to 8 coloured lights on a golden-angle spiral (`radius = 14 + 15 sqrt(i + 1)`, angle `(i + 1) * 2.3999632 + ...`) that light the water with a glint and a halo                                                                               |
| Water quality | 0: no ripple lookups, caustics or orbs (the big waves' normal only). 1: ripples. 2: parallax capped at 6 steps, caustics, up to 3 orbs. 3: as the map says                                                                                      |

## 6. Not done

Thunder sound; the demo's height fog and its stronger sand and snow storms; neon orbs lighting the clouds; snow piling up on the ground; the screen-space reflection (needs a clip plane); wind that drives waves, current and clouds. See PENDING.md.
