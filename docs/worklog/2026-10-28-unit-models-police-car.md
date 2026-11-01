# 2026-10-28 — The rest of the dropped models: nine units and a drivable police car (branch `feat/gear-models`)

The user asked for every model left in the repo root to be added as a unit (even the ones without animation) and for the police car to be a new vehicle.

**Where the files are:** `public/models/test/` (in `.gitignore`: heavy files and models whose license or origin is not settled). A unit whose file is missing is drawn as a placeholder capsule and the console warns; nothing else breaks. `assets.toml` lists them under `[[testing_asset]]`.

| Unit id (editor, Humans) | File                                 | Notes                                                                                                  |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `police`                 | `unit-police.glb` + `-walk` + `-run` | Meshy output with three files of one skeleton; idle is the T pose, walk and run come from `extraClips` |
| `esquiva`                | `unit-esquiva.glb`                   | one Mixamo clip (a dodge) used for every state                                                         |
| `breakdancer`            | `unit-breakdance.glb`                | one Mixamo clip (the dance) for every state                                                            |
| `facial_girl`            | `unit-facial-girl.glb` (101 MB)      | one 58 s clip for every state                                                                          |
| `nightgown`              | `unit-nightgown.glb`                 | CC-BY-SA, no animation: stands still                                                                   |
| `jessica`                | `unit-jessica.glb`                   | no animation: stands still                                                                             |
| `female_base`            | `unit-female-base.glb`               | grey base figure, no animation                                                                         |
| `flipaclip_guide`        | `unit-flipaclip-guide.glb`           | no skeleton, no animation                                                                              |

Not added: `charlotte_nude__-_fortnite_-_nsfw_-_unrigged.glb` (an explicit nude, unrigged, Sketchfab Standard license) and `gloria(1).glb` (also a nude figure; `gloria.glb` is an empty file and `gloria.*.part` an interrupted download). Both were left out on purpose.

What was built:

- **Character spec:** `height` fits a model to metres with its feet on the ground (so no hand-tuned scales), `lazy` loads the model when the first unit of it appears (the placeholder shows until then), `extraClips` takes clips from other files, and `procedural: "still"` is for models with no clips (hops while it moves, falls over when it dies). The hand and head finders also accept Character Creator bones and the number Sketchfab appends to bone names, so those units can hold the gun and wear a helmet.
- **Police car:** vehicle type `police_car` in `data/game.json` (4 seats, passengers do not shoot), in the editor under Civil > Land. `loadPoliceCar` / `createPoliceCar` in `src/render/vehicles.ts`: the open-interior model turned to face +Z and scaled 2.4x, glass panes, brake lights, a red and blue light bar that flashes in turn (glow sprites, no real lights, so no shader recompile), the four wheel pivots spin about z. The model loads the first time a map places one (`ensurePoliceCar`). The doors do not open yet (the file has a `Doors_Open_Close` clip).
- **Map 17 - Unit models** (`scripts/gen-map17.py`): the marine, the alien and the eight new units in a row on hold, and a police car in front.

Seen in a headless Chrome: every unit standing in a row (heights and facing right), the police car with its light bar. Not seen: driving the car, the units walking in the game, first person.
