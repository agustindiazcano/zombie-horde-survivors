# 2026-10-20 — Objects block movement

Branch `feat/objects-block-movement` (from `main`). Objects lying on the ground (crates, barrels, boulders) used to be walked through; now they are solid.

- `syncStructures` (`src/sim/structures.ts`) adds a box for every resting object (not held, not in flight) to `arena.obstacles`: footprint `objects.types.*.radius`, height `height`, `passShots: true` (bullets still hit shootable barrels by the old code).
- `src/sim/objects.ts` calls it whenever an object is created, lifted, put down, thrown, lands or is destroyed. Soldiers, enemies, vehicles and the flow field all read the same obstacle list, so everyone walks round them; a unit standing where an object lands is pushed out.
- A low object (up to the step-up height) can be stepped over by climbers as before.

Checked with a throwaway sim (deleted): a soldier walking at a boulder stops against it (1.9 m from its centre for a boulder at 3 m). The 48 tests, lint, format, typecheck, build and the asset check pass. Not seen in a browser.

Limits: enemies treat objects as hard walls (they do not break them to get through); a ring of objects can shut a corridor; light objects are not pushed aside.
